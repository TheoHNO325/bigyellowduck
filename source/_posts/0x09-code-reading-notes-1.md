---
title: 读代码笔记（1）
date: 2026-07-22
permalink: waizhuan/0x09-code-reading-notes-1/
tags:
  - 小说
  - 外传
  - 科研笔记
waizhuan_section: 科研笔记
author_display: gpt5.5medium
excerpt: 围绕 sparse attention 的 contribution 与代码路径，整理 SVOO、SAP、SVG、动态 mask、聚类与 kernel 执行逻辑的读代码笔记。
---
# Sparse Attention Contribution and Code Notes

如同 Veda 中所总结，现有 sparse mask 的中心任务在于找到合适的 tiling，并对 tiling 后的计算进行选择。`tiling + selection` 合在一起，就是构建 mask 的过程。整体上可以粗略分为两类：Dynamic 与 Static。

**Dynamic mask** 可能会规定固定的分块形状，但通常会根据 token 间的语义或联系进行更大范围的 tiling，随后动态决定 block 之间是否需要计算。

---

## 1. SVOO

### 1.1 推理入口

推理主函数是 `wan_t2v_inference.py`。主函数进入 `inference.py` 的 `replace_wan_attention`，这里有多种 mode 可选，例如 SAP 或后来更新的 EAR。

代码会定义 `WanAttn_SAPAttn_Processor` 实例，并设置上下文长度、frame 数量、SVOO 相关的质心数量、TopK、transformer strategy、`min_kc_ratio` 等参数。`min_kc_ratio` 先从 profiling 中得到稀疏度下界，再通过 `dynamic_min_kc_ratio_min` 和 `dynamic_min_kc_ratio_max` 把下界裁剪到一个范围里。

最终，pipeline 中的 transformer block 会被全部替换成 `AttnModule`。

### 1.2 SVG 路线中的 processor 逻辑

`WanAttn_SAPAttn_Processor` 继承自 `WanAttn_SVGAttn_Processor2_0`。经过一系列 `if/else` 判断后，会进入 `self.attention_core_logic`。

SVG 内部的大致分支：

- 如果不带 mask，或者处在 `first layer/step` 范围内，则强制 full attention，即直接走 `flash_attention`。
- 如果使用 `self.use_spargeattn`，则直接走 `flash_attention_spargeattn`。
- 其他情况进入 SVOO/SVG sparse 路径。

核心代码片段：

```python
sampled_mses = self.sample_mse(query, key, value)
best_mask_idx = torch.argmin(sampled_mses, dim=0)

output_hidden_states = torch.zeros_like(query)
query_out, key_out, value_out = torch.zeros_like(query), torch.zeros_like(key), torch.zeros_like(value)

query_out, key_out, value_out = self.fast_sparse_head_placement(
    query, key, value, query_out, key_out, value_out, best_mask_idx, context_length, num_frame, frame_size
)

hidden_states = self.sparse_flex_attention(query_out, key_out, value_out, block_mask=self.block_mask)

self.fast_hidden_states_placement(
    hidden_states, output_hidden_states, best_mask_idx, context_length, num_frame, frame_size
)

return output_hidden_states.reshape(cfg, num_heads, seq_len, dim)
```

### 1.3 SAP/SVOO 主流程

SAP 路线首先通过之前注册的函数得到当前 step。然后判断是否需要强制 full attention；如果是，则执行：

```python
output_hidden_states = self.flash_attention(query, key, value)
```

如果进入 SVOO，则关键入口是：

```python
perm_result = self.semantic_aware_permutation(query, key, value, timestep)
```

这个函数内部会对 `query` 和 `key` 做一次较长的 `kmeans_clustering`。

在 clustering 函数内部，`current_step` 用来判断是否可以直接 reuse cache 中的聚类结果。代码中存在固定的 `reuse_interval`，会在一定窗口内复用之前 step 的 cluster 结果。

此处涉及分桶聚类，但是似乎对理解主流程不是很重要，因此略过。

AI批注：这里可以暂时只记住“分桶聚类是为了降低全局聚类成本”。主线仍然是先给 token 分 cluster，再基于 cluster 构建 dynamic map。

### 1.4 Co-clustering

聚类中最关键的步骤是 `co_cluster_tokens`：head 维度会被并进 batch，每个 head 内都会被当作一个独立 batch 来聚类。

输入：

```text
q_flat: [B_heads, N, D]
k_flat: [B_heads, N, D]
```

即当前的 Q/K。

随机初始化中心点：

```python
q_indices = torch.randint(0, N, (B_heads, num_q_centroids), device=device)
qcentroids = torch.gather(q_flat, dim=1, index=q_indices[..., None].expand(-1, -1, D))
```

进入交替优化：

```python
for _ in range(max_iters):
    profile_centroids_k = torch.matmul(kcentroids, qcentroids.transpose(-2, -1))
    profile_centroids_k = triton_l2norm_forward(profile_centroids_k, eps=1e-8).contiguous()
```

这一步计算 q 中心对 k 中心的相似度，形状是：

```text
[B_heads, num_k_centroids, num_q_centroids]
```

随后对该相似度矩阵进行 L2 norm。

```python
k_norms = profile_norm_triton(k_flat, qcentroids)       # (B, N), no large tensor
klabels = fused_cocluster_assign_triton(k_flat, qcentroids, profile_centroids_k, k_norms)
kcentroids, k_cluster_sizes = triton_centroid_update_sorted_euclid(k_flat, klabels, kcentroids, BLOCK_N=128)
```

直观理解：

- 对所有 K token 与 `qcentroids` 做矩阵相乘，得到 `[B, N]` 相关统计。
- 在 profile 空间，也就是与 q centroid 的相似度空间里，把 K token 分配到最近的 K centroid。
- 随后更新 K centroid。

Triton 算子在此处的作用是降低内存开销。直接计算 token 与 centroid 的完整相似度矩阵会很大，但这里实际只需要归一化后的 L2 norm 来比较距离。

AI 解释 Triton 做法：

- 对一小块 token 和一小块 centroid 做矩阵乘。
- 累加平方和。
- 只输出 `k_norms: [B, N]`，也就是每个 token 的 profile norm。
- 不输出完整 `[B, N, Qc]`。

内存从：

```text
B * N * Qc
```

降低到：

```text
B * N
```

最终得到：

```text
qlabels:         [B_heads, N]
qcentroids:      [B_heads, num_q_centroids, D]
q_cluster_sizes: [B_heads, num_q_centroids]

klabels:         [B_heads, N]
kcentroids:      [B_heads, num_k_centroids, D]
k_cluster_sizes: [B_heads, num_k_centroids]
```

### 1.5 Dynamic map

KMeans 完成之后，从 profiling 中得到稀疏度下界：

```python
min_kc_ratio = self._get_min_kc_ratio_for_heads_from_step(self.current_inference_step, num_heads)
```

随后对该下界进行裁切：

```python
for csv_value in sparsity_values:
    value = csv_value
    if self.dynamic_min_kc_ratio_min is not None:
        value = max(value, self.dynamic_min_kc_ratio_min)
    if self.dynamic_min_kc_ratio_max is not None:
        value = min(value, self.dynamic_min_kc_ratio_max)
    final_values.append(value)
```

`identify_dynamic_map` 的目标是确认哪些 Q/K cluster 可以相互计算。核心打分为：

```python
attn_scores = torch.matmul(query_centroids, key_centroids.transpose(-2, -1)) / (D**0.5)
```

得到的 `dynamic_map` 是布尔矩阵。

随后：

```python
k_weights = k_cluster_sizes.unsqueeze(-2).float()

weighted_attn_probs = weighted_softmax(attn_scores, k_weights)
sorted_probs, sorted_indices = torch.sort(weighted_attn_probs, dim=-1, descending=True)
remove_indices = cumsum_probs > p
remove_indices[..., 1:] = remove_indices[..., :-1].clone()
remove_indices[..., 0] = False
```

这里先按照 top-p 选择 key cluster。`min/max_kc_ratio` 也会在此处发挥作用，用于约束每个 query cluster 最少/最多保留多少 key clusters，具体操作对象是 `remove_indices`。

`identify_dynamic_map_global` 用于 `self.use_global_constraints` 的情形，返回内容相同。它会通过一些额外手段保留能为全局提供帮助的 key cluster。目前 SVOO 原文中没有明确提到这一段，疑似为尚未完善的实现片段。

### 1.6 Q/K/V 重排与后端

推理后端选择：

```python
sparse_backend = os.environ.get("SVG_SPARSE_ATTN_BACKEND", "flashinfer").lower()
```

此时已经有：

```text
q_perm: [B, H, S, D]
k_perm: [B, H, S, D]
v_perm: [B, H, S, D]

dyn_map: [B, H, q_cluster_num, k_cluster_num]  # bool
qc_sz_s: [B, H, q_cluster_num]
kc_sz_s: [B, H, k_cluster_num]
```

并且 Q/K/V 已经按 cluster 排好。每个 query cluster/key cluster 是一个 variable-size block，`dyn_map` 决定哪些 block pair 要计算。

这里支持三条路径：

- EAR + FlashInfer
- 普通 SVOO + Triton
- 普通 SVOO + FlashInfer

根据 AI 解释，Triton 版本大概做：

- 对每个 query cluster/block 启动 kernel。
- 根据 `dyn_map` 找允许 attend 的 key clusters。
- 用 query/key cluster cumulative sizes 定位 Q/K/V block 的起止位置。
- 只对 `True` 的 block pair 计算 attention。

FlashInfer sparse backend 是默认路径，使用 FlashInfer 的 variable block sparse attention wrapper。它会根据：

```text
dyn_map
qc_sz_s
kc_sz_s
```

先 `plan(...)`，然后 `run(q, k, v)`。

优点：

- 通常速度更好。
- 专门为 attention/sparse attention 优化。
- 支持 variable block sparse planner。

最后执行：

```python
attn_output = apply_inverse_permutation_triton(output_permuted, q_sorted_indices, dim=2)
```

这一步把 sparse attention 的输出从 cluster 排序后的 token 顺序恢复回原始 token 顺序。`q_sorted_indices` 记录的是 permuted 位置上的 token 来自原始序列的哪个位置。

### 1.7 输出整理

在 `attention_core_logic` 得到 `hidden_states` 之后，`self.get_o` 负责整理形状格式：

```text
[B, H, S, D] -> [B, S, H * D]
```

随后加到主 attention 的输出上。在 I2V 中：

```python
hidden_states = text/video self-attn output + image-attn output
```

然后经过 attention 的输出线性层/dropout，返回给 transformer。

### 1.8 Profiling

Profiling 发生在 processor 的 `__call__` 最后：

```python
self.log_attention_sparsity(query, key, value, timestep, "self")
```

随后转到 `exact.py` 中的 `compute_exact_attention_sparsity`。

`attention mass`：在 self-attention 里，对于某一个 query token，会有一行 attention probability：

```python
attn = softmax(q_i @ K.T / sqrt(d))
```

形状为：

```text
[num_key_tokens]
```

其中所有 key token 元素的和为 1。随后对 attention probability 进行 sort，找到能覆盖 threshold 的前 k 个 token，除以总数即为当前的 sparsity。

---

## 2. Veda

非开源。

Veda 批判了以往静态与动态稀疏模式：

- 预定义稀疏模式的方法由于结构僵化，与特定注意力头（head-specific）的几何结构存在失配（structural mismatch）。
- 动态方法依赖隐式监督，且分块统计信息不足，因此会产生估计误差。
- 不同注意力头以及扩散模型不同时间步（diffusion timesteps）之间存在显著异质性（heterogeneity）。

Veda 建立 oracle mask：完全按照 top-k 筛选 token-wise attention，非常准确，但不适合实际运算。它将 oracle mask 作为 mask 的标准（ground truth）。`tile-wise structure` 指 oracle mask 呈现出的结构，tiling 的选择需要尽可能拟合该结构。

---

## 3. SVG2

SVG2 其实是 SVOO 的前身代码。

---

## 4. Static Mask 与 SVG

Static mask 会提前预定义一个或一些 mask，以匹配时空特征。对于每个 head，其注意力结构只随 step、layer 以及 head 本身决定，详见 offline profiling，与当前 input 无关。这让我怀疑 instance-specific 的合理性。

### 4.1 `replace_wan_attention`

预定义两种 mask：

```python
masks = ["spatial", "temporal"]
AttnModule.attention_masks = [
    get_attention_mask(
        mask_name, sample_mse_max_row, context_length, num_frame_patches, frame_patches_one_frame
    )
    for mask_name in masks
]
```

这个函数接口比较方便，可以扩展成更多 mask 类型。

下面这段用于把 sparsity 转换成 mask block 窗口宽度：

```python
multiplier = diag_width = sparsity_to_width(
    sparsity, context_length, num_frame_patches, frame_patches_one_frame
)
```

这里的计算比较神秘，但总之也是用于定义 mask 形状。

### 4.2 Attention 后端

`attention.py` 中有两种后端：

- FlexAttention，对应 `AttnModule.block_mask`
- FlashInfer，对应 `temporal_mask_metadata`

`prepare_flexattention()` 中：

- `mask_mod` 是“哪些 q-kv 位置允许 attention”的规则函数。
- `block_mask` 是 FlexAttention 根据这个规则生成的 block sparse 执行计划。
- `temporal_mask_mod` 保留第一帧 sink 和时间邻近窗口。
- 在 SVG1 中，它会配合 head placement 当成统一 sparse attention 后端模板使用。

感觉看不太懂，看看 `module.call` 里是怎么用的。

AI批注：这里的重点是先区分“mask 规则函数”和“后端执行计划”。`mask_mod` 描述逻辑规则，`block_mask` 是 FlexAttention 根据规则预编译出来的可执行稀疏计划。

### 4.3 `sample_mse`

`WanAttn_SVGAttn_Processor2_0.attention_core_logic` 中会先采样比较不同 mask。

```python
sampled_attn_weights = F.softmax(sampled_qk_scores, dim=-1)
sampled_golden_hidden_states = torch.matmul(sampled_attn_weights, value)  # (1, seq_len, dim)

sampled_mses = torch.zeros(len(self.attention_masks), cfg, num_heads, device=query.device, dtype=query.dtype)

# Only have Tri-diagonal and Striped
for mask_idx, attn_mask in enumerate(self.attention_masks):
    sampled_attention_mask = attn_mask[sampled_rows, :]
    sampled_attention_scores = sampled_qk_scores.masked_fill(sampled_attention_mask == 0, float("-inf"))
    sampled_attn_weights = F.softmax(sampled_attention_scores, dim=-1)
    sampled_hidden_states = torch.matmul(sampled_attn_weights, value)
    mse = torch.mean((sampled_hidden_states - sampled_golden_hidden_states) ** 2, dim=(2, 3))
    sampled_mses[mask_idx] = mse
```

`golden_hidden_state` 是采样出来的完整 dense hidden state，`sampled_hidden_states` 是各个 mask 下的 sparse 计算结果。每个 attention head 会比较 spatial/temporal 两种 mask 谁更接近 dense attention。

随后在 core logic 中：

```python
best_mask_idx = torch.argmin(sampled_mses, dim=0)
```

### 4.4 Head placement

核心调用：

```python
query_out, key_out, value_out = self.fast_sparse_head_placement(
    query, key, value, query_out, key_out, value_out, best_mask_idx, context_length, num_frame, frame_size
)
```

进入这个函数会来到 Triton kernel：

```python
@triton.jit
def wan_sparse_head_placement_kernel(
    query_ptr,
    key_ptr,
    value_ptr,      # [cfg, num_heads, seq_len, head_dim]
    query_out_ptr,
    key_out_ptr,
    value_out_ptr,  # [cfg, num_heads, seq_len, head_dim]
    best_mask_idx_ptr,  # [cfg, num_heads]
    query_stride_b,
    query_stride_h,
    query_stride_s,
    query_stride_d,
    mask_idx_stride_b,
    mask_idx_stride_h,
    seq_len: tl.constexpr,
    head_dim: tl.constexpr,
    context_length: tl.constexpr,
    num_frame: tl.constexpr,
    frame_size: tl.constexpr,
    BLOCK_SIZE: tl.constexpr,
):
    cfg = tl.program_id(0)
    head = tl.program_id(1)
    block_id = tl.program_id(2)

    start_id = block_id * BLOCK_SIZE
    end_id = start_id + BLOCK_SIZE
    end_id = tl.where(end_id > seq_len, seq_len, end_id)

    is_temporal = tl.load(best_mask_idx_ptr + cfg * mask_idx_stride_b + head * mask_idx_stride_h)

    offset_token = tl.arange(0, BLOCK_SIZE) + start_id
    offset_mask = offset_token < seq_len
    offset_d = tl.arange(0, head_dim)

    if is_temporal:
        frame_id = offset_token // frame_size
        patch_id = offset_token - frame_id * frame_size
        offset_store_token = tl.where(
            offset_token >= seq_len - context_length, offset_token, patch_id * num_frame + frame_id
        )
        # load original Q/K/V and store to temporal order
    else:
        # spatial head keeps original layout
        offset_store = offset_load
```

一个 Triton program 负责某个 `cfg`、某个 `head` 的一段 token block，`start_id/end_id` 决定当前处理哪些 token。

这个函数按照 `best_mask_idx` 判断每个 head 该用 spatial 还是 temporal pattern：

- Spatial head：Q/K/V 保持原顺序。
- Temporal head：Q/K/V 从 frame-major 重排成 token-major。
- 重排后所有 head 都可以喂给同一个 block sparse attention mask。

`token-major` 指同一个 spatial patch 在不同帧上的 token 被排到一起。代码：

```python
frame_id = offset_token // frame_size
patch_id = offset_token - frame_id * frame_size
offset_store_token = patch_id * num_frame + frame_id
```

然后把原来的 token 写到新的位置：

```python
tl.store(offset_query_out, query, ...)
tl.store(offset_key_out, key, ...)
tl.store(offset_value_out, value, ...)
```

如果是 spatial，则保持原始位置：

```python
offset_store = offset_load
```

Placement 结束后，进入 sparse attention：

```python
hidden_states = self.sparse_flex_attention(
    query_out, key_out, value_out,
    block_mask=self.block_mask
)
```

这里的 `block_mask` 本质是一个线性局部窗口：

```python
abs(q_idx - kv_idx) <= window
```

最后把 `hidden_states` 重新排回去。attention 是在 `query_out/key_out/value_out` 上算的，所以 temporal head 的输出也是 token-major 顺序。反向索引是：

```python
frame_id * frame_size + patch_id
```

Spatial head 则原样复制。

（真的很弯绕）

AI批注：这段可以理解成“把不同 head 的 preferred sparse pattern 统一映射到同一种局部窗口格式”。Temporal head 通过重排 token，使时间相邻关系在重排后变成序列上的局部邻近关系。

最后，`replace_wan_attention` 中还有一行 `replace_sparse_forward()`，用于替换 forward 函数，使接口通用。

Hunyuan 的 joint attention：同时处理 video hidden states 和 text/context hidden states，并返回两路。

（还没看）

AI批注：Hunyuan joint attention 的关键不同点是 video token 和 text/context token 会一起参与 attention，并且输出可能需要拆回两路。当前笔记可以先保留这个入口，等后续读代码时再展开。

---

## 5. Radial Attention

Radial 使用单一 mask pattern，不需要通过 `sample_mse` 提前选择。

### 5.1 Wan2.1 sparse route

在 `call` 中确认 sparse 路线后，会将 Q/K/V 从：

```text
[b, s, h, d]
```

转成：

```text
[b*s, h, d]
```

以适配 RadialAttention 后端，相当于 batch 被并入 sequence。

代码：

```python
else:  # case for sparse attention
    batch_size = query.shape[0]
    if self.use_sp:
        # Ugly but useful now. TODO: modify all_to_all fuc of xdit to handle different layouts
        query = rearrange(query, "b s h d -> b h s d").contiguous()
        key = rearrange(key, "b s h d -> b h s d").contiguous()
        value = rearrange(value, "b s h d -> b h s d").contiguous()

        # input all_to_all comm needs [b h s d] layout
        query = _ft_c_input_all_to_all(query)
        key = _ft_c_input_all_to_all(key)
        value = _ft_c_input_all_to_all(value)

        query = rearrange(query, "b h s d -> (b s) h d").contiguous()
        key = rearrange(key, "b h s d -> (b s) h d").contiguous()
        value = rearrange(value, "b h s d -> (b s) h d").contiguous()
    else:
        query = rearrange(query, "b s h d -> (b s) h d")
        key = rearrange(key, "b s h d -> (b s) h d")
        value = rearrange(value, "b s h d -> (b s) h d")
```

多卡中还会进行 all-to-all 通信。这里使用的是 Ulysses sequence parallel：

- 先按 sequence/token 维度切分 hidden states。
- attention 内再通过 all-to-all 改成按 head 维度切分 Q/K/V。

All-to-all 前：

```text
每张卡 = 一段 sequence + 全部 heads

GPU 0: [b, S/P, H, D]
GPU 1: [b, S/P, H, D]
```

All-to-all 后：

```text
每张卡 = 全部 sequence + 一部分 heads

GPU 0: [b, S, H/P, D]
GPU 1: [b, S, H/P, D]
```

### 5.2 MaskMap 与 block mask

来到 `RadialAttention` 后，关键一行是：

```python
video_mask = mask_map.queryLogMask(
    query, sparsity_type, block_size=block_size, decay_factor=decay_factor, model_type=model_type
) if mask_map else None
```

`mask_map` 来自 `attn_mask.py` 中的 `MaskMap` 类：

```python
class MaskMap:
    _log_mask = None

    def __init__(self, video_token_num=25440, num_frame=16):
        self.video_token_num = video_token_num
        self.num_frame = num_frame

    def queryLogMask(self, query, sparse_type, block_size=128, decay_factor=0.5, model_type=None):
        if MaskMap._log_mask is None:
            # query shape: [batch, seq, heads, dim]
            seq_len = query.shape[1]
            MaskMap._log_mask = torch.ones(
                (seq_len // block_size, seq_len // block_size),
                device=query.device,
                dtype=torch.bool,
            )
            MaskMap._log_mask = gen_log_mask_shrinked(
                query, seq_len, self.video_token_num, self.num_frame,
                sparse_type=sparse_type, decay_factor=decay_factor,
                model_type=model_type, block_size=block_size
            )
        return MaskMap._log_mask
```

`gen_log_mask_shrinked` 负责制造 block-wise mask。如果 `block_size = 128`，那么每个 `True/False` 控制的是一个 `128 x 128` 的 attention block 是否参与计算。

第一步：text 相关部分全部 dense。

```python
video_text_border = video_token_num // block_size

final_log_mask[video_text_border:] = True
final_log_mask[:, video_text_border:] = True
```

第二步：每一对视频帧生成 token-level local mask。

对于帧对 `(i, j)`，先定义帧距离：

```text
d = |i - j|
```

如果是 Wan，并且 `j == 0`：

```python
if j == 0 and model_type == "wan":
    local_mask = torch.ones(...)
```

这叫 attention sink。意思是所有 query 帧都可以 attend 到第 0 帧。公式为：

```text
M_ij(u, v) = 1, if j = 0 and model_type = "wan"
```

其中：

```text
u = query 帧内 token index
v = key 帧内 token index
u, v in [0, T)
```

如果不是 attention sink，就走 radial/log sparse 规则：

```python
window_width = get_window_width(...)
local_mask = torch.abs(col_indices - row_indices) <= window_width
split_mask = get_diagonal_split_mask(...)
local_mask = torch.logical_and(local_mask, split_mask)
```

对应公式：

```text
M_ij(u, v) = 1[|u - v| <= W_ij] * S_ij
```

其中：

- `W_ij` 是当前帧对的空间窗口宽度。
- `S_ij` 是当前帧对是否被 diagonal split 保留。

插入看 diagonal split：

（一些很烦人的逻辑，先跳过了）

AI批注：diagonal split 的核心作用是进一步下采样远距离帧对，不是改变局部窗口公式本身。它根据帧距离把某些 frame-pair 整体保留或整体丢弃，降低远距离帧间 attention 的计算量。

### 5.3 后端：FlashInfer

接下来来到后端。第一类是 FlashInfer：先把 mask 转成 BSR/CSR 风格的稀疏矩阵索引结构。

先裁剪掉必走 dense attention 的 text tokens：

```python
video_mask = video_mask[
    :mask_map.video_token_num // block_size,
    :mask_map.video_token_num // block_size
]
```

形状变成：

```text
[num_video_blocks, num_video_blocks]
```

准备 FlashInfer 临时工作区：

```python
workspace_buffer = torch.empty(128 * 1024 * 1024, ...)
bsr_wrapper = flashinfer.BlockSparseAttentionWrapper(
    workspace_buffer,
    backend="fa2",
)
```

可以理解为 FlashInfer kernel 运行时需要一块 scratch memory。

随后：

```python
indptr = get_indptr_from_mask(video_mask, query)
indices = get_indices_from_mask(video_mask, query)
```

它们把二维 bool mask 转成稀疏格式。

例如 block mask：

```text
row 0: [1, 0, 1, 0]
row 1: [0, 1, 1, 0]
row 2: [1, 0, 0, 1]
```

则：

```text
indices = [0, 2, 1, 2, 0, 3]
indptr  = [0, 2, 4, 6]
```

解释：

```text
row 0 -> indices[0:2] = [0, 2]
row 1 -> indices[2:4] = [1, 2]
row 2 -> indices[4:6] = [0, 3]
```

这里是 block sparse，所以每一个 `1` 不是一个元素，而是一个 `block_size x block_size` 的 attention 子矩阵。

### 5.4 后端：SpargeSageAttnBackend

`pre_defined_mask is None` 时，也就是 Wan case，全部是 video tokens，不需要额外 token 有效性裁剪。

`block_sparse_sage2_attn_cuda` 可以理解为把 SageAttention2 的低精度/量化 attention kernel 改造成 block-sparse 版本。

需要先转换 mask：

```python
converted_mask = repeat(
    sparge_mask_convert(mask=video_mask, block_size=block_size, arch=arch),
    "s t -> b h s t",
    b=batch_size,
    h=query.shape[2],
)
converted_mask = converted_mask.to(torch.int8)
```

`sparge_mask_convert`：

```python
def sparge_mask_convert(mask: torch.Tensor, block_size: int = 128, arch="sm") -> torch.Tensor:
    assert block_size in [128, 64], "Radial Attention only supports block size of 128 or 64"
    assert mask.shape[0] == mask.shape[1], "Input mask must be square."

    if block_size == 128:
        if arch == "sm90":
            new_mask = torch.repeat_interleave(mask, 2, dim=0)
        else:
            new_mask = torch.repeat_interleave(mask, 2, dim=1)

    elif block_size == 64:
        if arch == "sm90":
            num_row, num_col = mask.shape
            reshaped_mask = mask.view(num_row, num_col // 2, 2)
            new_mask = torch.max(reshaped_mask, dim=2).values
        else:
            num_row, num_col = mask.shape
            reshaped_mask = mask.view(num_row // 2, 2, num_col)
            new_mask = torch.max(reshaped_mask, dim=1).values

    return new_mask
```

同时 Q/K/V layout 会变成：

```text
[b, h, s, d]
```

并配合：

```python
tensor_layout="HND"
```

Seq length 需要能整除 block size。

Text 部分直接通过 FlashInfer：

```python
output_text = flashinfer.single_prefill_with_kv_cache(
    q=q_flashinfer,
    k=k_flashinfer,
    v=v_flashinfer,
    causal=False,
    return_lse=False,
)
output_text = rearrange(output_text, "(b s) h d -> b s (h d)", b=batch_size)

return torch.cat([output_video, output_text], dim=1)
```

以上就是 Sparge 后端的调用方式。

---

## 6. Sparse-vDiT

依旧还没有源码。

---

## 7. SageAttention

### 7.1 量化基础

常规动态量化：

```text
scale = max(abs(X)) / 127
X_int8 = round(X / scale)
X ≈ scale * X_int8
```

如上可见，scale 会被离群值支配，让普通小值失去分辨率。

量化粒度指多少个数共用一个 scale。例如 per-token 量化就是一个 token 的整行向量共用一个 scale。

### 7.2 SageAttention1

量化目标：将 `QK^T` 矩阵乘法量化成低精度，使用 GPU 的 INT8/INT4/FP8/FP4 Tensor Core 加速，同时保持模型输出不变。

难点在于 softmax 会放大量化误差，而且 Q/K 结果中的离群值容易把正常值压成 0。

量化基本形式：

```text
高精度 X -> 低精度 X_hat + scale
X ≈ scale * X_hat
```

SageAttention1 发现，直接把 `Q/K/P/V` 都 INT8 会失败。尤其在图像/视频生成模型里，K 有很强的 channel-wise outlier，也就是某些通道整体偏大。如果直接量化，scale 会被这些大值拉大，普通元素分辨率变差。

#### SmoothK

论文发现 K 的离群值很多是所有 token 共享的通道偏置，于是做：

```text
K' = K - mean(K, over tokens)
```

这不会改变 softmax 结果。因为对任意 query `q`：

```text
q(K - mean(K))^T = qK^T - 常数
softmax(x - 常数) = softmax(x)
```

#### Kernel 选择

SageAttention1 中 QK 用 INT8，但 PV 不强行 INT8，而是 FP16。这里的 accumulator 指矩阵乘累加时的累加精度。

它实现了几类 kernel：

- `SAGEAttn-T`：Q/K per-token INT8，P/V FP16。
- `SAGEAttn-B`：Q/K per-block INT8，P/V FP16。
- `SAGEAttn-vT/vB`：进一步把 P/V 也 INT8，但只在足够准确的层使用。

### 7.3 SageAttention2

SageAttention2 使用 INT4 QK + FP8 PV，在 SageAttention1 基础上进一步压低精度。

#### SmoothQ

```text
Qi' = Qi - mean(Qi)
QK^T = Qi'K^T + mean(Qi)K^T
```

Q 去均值后更适合 INT4 量化，但为了保持数学等价，需要额外用一个 GEMV 把均值项加回来。

如果直接用 `Qi'`，算到的是：

```text
S' = Q_i' K_j^T
   = (Q_i - q_mean) K_j^T
   = Q_i K_j^T - q_mean K_j^T
```

比原始分数少一项。此处 `q_mean K_j^T` 是 query block 对当前 key block 的补偿项，是一个矩阵-向量乘法。SmoothK 不用补项的原因是：

（这里原笔记未展开）

#### Per-thread quantization

GPU 做 INT4 Tensor Core 矩阵乘时，不是一个线程算一个完整 token。一个 warp 有 32 个 thread，它们共同执行一个小块 MMA。例如 `128 x 64` 的 Q block 会被切成 32 个量化组，每组对应某些 thread 实际会一起处理的 token 片段。

Per-thread quantization 的 scale 数量不会比 per-block 多太多，并且更贴合 thread 布局，因此额外开销接近 per-block。

#### P/V FP8 E4M3

FP8 E4M3：

```text
E = exponent，指数位
M = mantissa，尾数位

E4M3 = 1 位符号位 + 4 位指数 + 3 位尾数
总共 8 位
```

#### Two-level accumulation

为了解决 FP8 accumulator 实际只有 FP22 有效精度的问题，SageAttention2 使用 two-level accumulation。

原始 FlashAttention 的 block 累加大致是：

```text
O_ij = alpha * O_i,j-1 + P~_ij V_j
alpha = exp(m_i,j-1 - m_ij)
```

Two-level 做法是先在小 block 内用 FP8 MMA 得到：

```text
R_ij = P~_ij V_j
```

再把 `R_ij` 累加到 FP32 buffer `O_ij`。

### 7.4 SageAttention3

SageAttention3 面向 Blackwell，也就是有 FP4 Tensor Core 的 GPU。

- 推理：设计 FP4 attention，即 SageAttention3。
- 训练：设计 INT8 forward/backward attention，即 SageBwd。

采用 microscaling FP4：把矩阵按很小的组切分，每个 `1 x 16` 小组共享一个 FP8 scale。

```text
s_ij = max(abs(X_ij)) / 6
X_hat_ij = round_fp4(X_ij / s_ij)
X_ij ≈ s_ij * X_hat_ij
```

SageAttention3 想把两个核心矩阵乘都放到 FP4 Tensor Core 上：

```text
S = QK^T
O = PV
```

所以它做：

```text
Q -> FP4 + FP8 scale
K -> FP4 + FP8 scale
S = FP4MM(Q_hat, sQ, K_hat, sK)

P -> FP4 + FP8 scale
V -> FP4 + FP8 scale
O = FP4MM(P_hat, sP, V_hat, sV)
```

其中 `FP4MM` 是 Blackwell GPU 支持的 microscaling FP4 矩阵乘。它不是普通 matmul，而是硬件知道输入矩阵是 FP4，并且每小组有 FP8 scale，计算时会自动结合 scale。

直接这么做会有两个问题：

1. Q/K 有 outlier。解决方案是继承 SageAttention1/2 的 smoothing：

```text
K = K - mean(K)
Q = Q - mean(Q)，再用 GEMV 加回补偿项
```

2. P 很特殊。`P = softmax(S)`，很多值很小，范围在 `[0,1]`。如果直接 microscaling：

```text
sP = max(P_block) / 6
```

由于 `max(P_block)` 最多也就是 1，所以：

```text
sP <= 1/6 ≈ 0.167
```

这个 scale 要用 FP8 E4M3 表示。scale 太小、动态范围利用不好，精度会差。

所以 SageAttention3 对 P 用 two-level scaling：（有关于这一部分，我可能还需要再手推一遍）

第一层：

```text
sP1 = rowmax(P) / (448 * 6)
P2 = P / sP1
```

这一步把 P 放大。因为 E4M3 最大约 448，FP4 组内最大约 6，所以目标是把 `P2` 的范围放到：

```text
[0, 448 * 6]
```

第二层再做普通 microscaling：

```text
sP2, P_hat = microscale_fp4(P2)
P ≈ P_hat * sP2 * sP1
```

这样 `sP2` 能更充分利用 FP8 E4M3 的表示范围，误差更小。

代码有点难，导致阅读效率很低。接着来看 Sparge Attention。

---

## 8. Sparge Attention

入口文件：`core.py`

主函数：`spas_sage2_attn_meansim_topk_cuda`

### 8.1 函数 1：`get_block_map_meansim_fuse_quant`

这个函数把 Q/K 量化成 INT8，并构建 block sparse mask，也就是第一个 mask。

关键调用：

```python
pooled_qblocks, sim_qblocks, q_int8, q_scale = get_pool_sim_triton_simmean_fuse_quant(
    q, None, BLKQ, simthreshd1
)

pooled_kblocks, sim_kblocks, k_int8, k_scale = get_pool_sim_triton_simmean_fuse_quant(
    k, km, BLKK, simthreshd1
)
```

通常 `BLKQ=128, BLKK=64`，`km` 是 SmoothK 中要用到的 `k.mean`。

#### 8.1.1 均值池化、相似度判定、INT8 量化

```python
def get_pool_sim_triton_simmean_fuse_quant(x, x_mean, block_size, simthreshd1):
    x = x.contiguous()
    B, H, N, D = x.shape
    nblock = (N + block_size - 1) // block_size

    pool = torch.empty((B, H, nblock, D), device=x.device, dtype=x.dtype)
    sim_blocks = torch.empty((B, H, nblock), device=x.device, dtype=torch.bool)
    x_quant = torch.empty(x.shape, device=x.device, dtype=torch.int8)
    x_scale = torch.empty((B, H, nblock), device=x.device, dtype=torch.float32)

    grid = (B, H, nblock)
    triton_bmm_pool_sim_simmean_fuse_quant[grid](
        x, x_mean, pool, sim_blocks, x_quant, x_scale,
        simthreshd1, N=N, D=D, BS=block_size,
        fuse_mean=(True if x_mean is not None else False),
    )
    return pool, sim_blocks, x_quant, x_scale
```

这里预分配了四类输出：

- `pool`：每个块的均值池化结果，对 N 方向求平均，形状 `(B, H, nblock, D)`。
- `sim_blocks`：布尔张量，标记对应块内 token 的平均相似度是否超过阈值。
- `x_quant`：量化后的 `x`，INT8，形状与 `x` 相同。
- `x_scale`：每个块的量化缩放因子，float32，形状 `(B, H, nblock)`。

“每个块”是指将输入张量 `x` 在序列长度维度 N 上切分成固定大小为 `block_size` 的连续块。Triton program 会通过 `program_id` 算出自己应该处理哪个 batch、哪个 head、哪个序列块，然后加上偏移量找到对应数据。

Triton kernel：

```python
@triton.jit
def triton_bmm_pool_sim_simmean_fuse_quant(
    x_ptr,
    xm_ptr,
    pool_ptr,
    sim_ptr,
    x_quant_ptr,
    scale_ptr,
    simthreshd1,
    N: tl.constexpr,
    D: tl.constexpr,
    BS: tl.constexpr,
    fuse_mean: tl.constexpr,
):
    b, h, nb = tl.program_id(0), tl.program_id(1), tl.program_id(2)
    B, H, NB = tl.num_programs(0), tl.num_programs(1), tl.num_programs(2)

    block_offset = b * H * N * D + h * N * D + nb * BS * D
    xmask = (nb * BS + tl.arange(0, BS)[:, None]) < N
    x_ptrs = x_ptr + block_offset + tl.arange(0, BS)[:, None] * D + tl.arange(0, D)[None, :]
    x = tl.load(x_ptrs, mask=xmask)
    BS_ = BS if (N - nb * BS) >= BS else (N - nb * BS)
```

`b/h/nb` 分别表示当前 program 负责的 batch、head、序列块编号。要取的数据是：

```text
x[b, h, nb*BS : nb*BS + BS, :]
```

对应起始偏移：

```text
b * H * N * D + h * N * D + (nb * BS) * D
```

`xmask` 用于掩盖最后一个不满 block 的无效 token。`x_ptrs[i, j]` 指向：

```text
x[b, h, nb*BS + i, j]
```

以上都是从内存中 load 出当前 block 的操作。由于多维张量展平成线性内存，再加上 warp 组织方式，所以地址计算看起来比较复杂。

Smooth 部分：

```python
if fuse_mean:
    xm_ptrs = xm_ptr + b * H * D + h * D + tl.arange(0, D)
    x_mean = tl.load(xm_ptrs)
    x -= x_mean
    x = tl.where(xmask, x, 0)
```

阈值读取：

```python
cur_h1 = tl.load(simthreshd1 + h)
```

`simthreshd1` 是长度为 H 的数组，存储每个 head 的相似度阈值。

转为 float32：

```python
x_fp32 = x.to(tl.float32)
```

均值池化：

```python
pool = (tl.sum(x_fp32, axis=0) / BS_)
```

对 token 维度求和，得到形状 `(D,)` 的向量，再除以有效 token 数 `BS_`。这就是该 block 的均值表示。

L2 归一化：

```python
x_norm = tl.sqrt(tl.sum(x_fp32 * x_fp32, axis=1, keep_dims=True))
x = (x / x_norm).to(tl.float16)
```

`x_fp32 * x_fp32` 逐元素平方，然后沿 D 维求和，得到每个 token 的 L2 范数平方。开根号后得到 `x_norm`，再广播除法，把每个 token 变成单位向量。

块内平均相似度：

```python
grams = tl.dot(x, tl.trans(x))
sum_value = tl.sum(grams).to(tl.float32)
cur_sim = (sum_value / (BS_ * BS_)) > cur_h1
```

`grams` 是 `(BS, BS)` 的 cosine similarity 矩阵。`cur_sim=True` 表示这个 block 内部 token 彼此比较相似，可以用均值池化向量代表。

写回 pool 和 sim：

```python
pool_block_offset = b * H * NB * D + h * NB * D + nb * D
tl.store(pool_ptr + pool_block_offset + tl.arange(0, D), pool)

sim_offset = b * H * NB + h * NB + nb
tl.store(sim_ptr + sim_offset, cur_sim)
```

INT8 量化：

```python
scale = tl.max(tl.abs(x_fp32)) / 127.
scale += 0.0000001

x_int8 = x_fp32 / scale
x_int8 += 0.5 * tl.where(x_int8 >= 0, 1, -1)
x_int8 = x_int8.to(tl.int8)
```

含义：

```text
scale = max(abs(x_fp32)) / 127
x_int8 = round(x_fp32 / scale)
x_fp32 ≈ x_int8 * scale
```

最后写回：

```python
x_quant_ptrs = x_quant_ptr + block_offset + tl.arange(0, BS)[:, None] * D + tl.arange(0, D)[None, :]
scale_ptrs = scale_ptr + b * H * NB + h * NB + nb
tl.store(x_quant_ptrs, x_int8, mask=xmask)
tl.store(scale_ptrs, scale)
```

#### 8.1.2 Compressed attention map

```python
sim_kblocks = sim_kblocks.unsqueeze(-2).expand(-1, -1, nq, -1)
sim_qblocks = sim_qblocks.unsqueeze(-1).expand(-1, -1, -1, nk)
pooled_score = pooled_qblocks @ pooled_kblocks.transpose(-1, -2) * q.shape[-1] ** -0.5
pooled_score[~sim_kblocks] = -torch.inf
```

`sim_kblocks` 原始形状是 `[B, H, nk]`。`True` 表示对应 key block 内部 token 比较相似，可以用 mean pooled 向量代表。这里把它扩展到 `[B, H, nq, nk]`，方便和 `pooled_score` 对齐。

`pooled_score` 对应 compressed attention score：

```text
S_hat = pooled_Q @ pooled_K^T / sqrt(D)
```

不能可靠合并的 key block 会先被置为 `-inf`。

Causal 情况：

```python
if is_causal:
    nq = pooled_qblocks.shape[-2]
    nk = pooled_kblocks.shape[-2]
    empty_mask = torch.empty(nq, nk, device=q.device, dtype=torch.bool)
    causal_mask = fill_causal_mask_triton(empty_mask, BLKQ / BLKK)
    pooled_score = pooled_score.masked_fill(~causal_mask[None, None, ...], -torch.inf)
```

这是普通 causal 上三角约束，只是粒度变成了 block。

之后：

```python
pooled_score = pooled_score.softmax(-1)
sorted_score = torch.sort(pooled_score, dim=-1, descending=True)
cdf = torch.cumsum(sorted_score.values, dim=-1)
```

这一步在每个 query block 上，把 key block 按概率从大到小排序，再做累积和，对应论文中“保留累计概率达到阈值 p 的块”。

把阈值转成每个 query block 要保留多少个 key block：

```python
B, H, Q, K = cdf.shape
if cdfthreshd is not None:
    cdfthreshd_ts = cdfthreshd.view(1, H, 1, 1)
    cdfthreshd_ts = cdfthreshd_ts.expand(B, -1, Q, 1).contiguous()
    num_to_select = torch.searchsorted(cdf, cdfthreshd_ts, right=True).squeeze(-1)
else:
    num_to_select = (topk * K).to(torch.int64).view(1, H, 1).expand(B, -1, Q).contiguous()
```

#### 8.1.3 Fill functions

`fill_block_map_triton` 把每个 query block 选中的 top key blocks 写进 `final_map`。

```python
@triton.jit
def triton_fill_block_map_kernel(final_map, num_to_select, sorted_indices, NK: tl.constexpr):
    b, h, q = tl.program_id(0), tl.program_id(1), tl.program_id(2)
    B, H, Q = tl.num_programs(0), tl.num_programs(1), tl.num_programs(2)

    cur_num_to_select = tl.load(num_to_select + b * H * Q + h * Q + q)
    cur_sorted_idx_ptr = sorted_indices + b * H * Q * NK + h * Q * NK + q * NK
    cur_final_map_ptr = final_map + b * H * Q * NK + h * Q * NK + q * NK

    cur_num_to_select = (cur_num_to_select + 1) if cur_num_to_select == 0 else cur_num_to_select
    for i in range(cur_num_to_select):
        cur_idx = tl.load(cur_sorted_idx_ptr + i)
        tl.store(cur_final_map_ptr + cur_idx, 1)


def fill_block_map_triton(final_map, num_to_select, sorted_indices):
    final_map = final_map.contiguous()
    num_to_select = num_to_select.contiguous()
    sorted_indices = sorted_indices.contiguous()
    B, H, Q, K = final_map.shape
    grid = (B, H, Q)
    triton_fill_block_map_kernel[grid](final_map, num_to_select, sorted_indices, K)
    return final_map
```

`fill_causal_mask_triton` 生成 block 级 causal mask：

```python
@triton.jit
def triton_fill_causal_mask(mask, BqdivBk):
    q, k = tl.program_id(0), tl.program_id(1)
    Q, K = tl.num_programs(0), tl.num_programs(1)
    if k >= (q + 1) * BqdivBk:
        tl.store(mask + q * K + k, 0)
    else:
        tl.store(mask + q * K + k, 1)


def fill_causal_mask_triton(mask, BqdivBk: float):
    assert mask.dim() == 2
    triton_fill_causal_mask[mask.shape](mask, BqdivBk)
    return mask
```

#### 8.1.4 Final map 和 LUT

```python
final_map = torch.zeros_like(pooled_score, dtype=torch.bool)
final_map[~sim_kblocks] = 1
final_map[~sim_qblocks] = 1
final_map = fill_block_map_triton(final_map, num_to_select, sorted_score.indices)

if is_causal:
    final_map = final_map * causal_mask[None, None, ...]

if attention_sink:
    final_map[:, :, :, 0] = 1
```

如果 key/query block 不适合被压缩代表，那就不要根据 compressed attention 结果来删它，而是直接保留。

`fill_block_map_triton` 会根据 `sorted_score.indices` 把 compressed attention 选出的 top key blocks 写入 `final_map`。

Causal 情况会把未来上三角区域 mask 掉。

`attention_sink` 会让所有 query block 都 attend 第一个 key block。

如果调用方不需要 LUT：

```python
return final_map, q_int8, q_scale, k_int8, k_scale
```

如果要真正喂给 CUDA sparse attention kernel，则把 `final_map` 转成 LUT：

```python
lut, valid_block_num = block_map_lut_triton(final_map)
return lut, valid_block_num, q_int8, q_scale, k_int8, k_scale
```

示例：

```text
final_map[b, h, q, :] = [False, True, False, True, True, False]
```

转换成：

```text
valid_block_num[b, h, q] = 3
选中了 key block 1, 3, 4
lut[b, h, q, :] = [1, 2, 1, 0, 0, 0]
```

`lut` 在这里是一种增量编码。

#### 8.1.5 函数总结

调用：

```python
lut, valid_block_num, q_int8, q_scale, k_int8, k_scale = get_block_map_meansim_fuse_quant(
    q, k, km,
    is_causal=is_causal,
    simthreshd1=simthreshd1,
    cdfthreshd=cdfthreshd,
    topk=topk,
    return_lut=True,
    attention_sink=attention_sink,
    BLKQ=64,
    BLKK=128,
)
```

输入参数：

```text
q:  [B, H, S, D]
k:  [B, H, S, D]
km: [B, H, 1, D] 或 None
```

其他参数：

- `q`：原始 query。
- `k`：原始 key。
- `km`：key 的均值，用于 SmoothK，通常是 `km = k.mean(dim=-2, keepdim=True)`。
- `is_causal`：是否使用 causal attention。如果为 True，会加块级 causal mask。
- `simthreshd1`：块内 token 平均相似度阈值，用来判断一个 block 是否适合用 mean pooling 代表。
- `cdfthreshd`：top-p 阈值。例如 0.9 表示保留 compressed attention 累计概率达到 0.9 的 key blocks。
- `topk`：另一种选择方式，直接保留固定比例的 key blocks。
- `return_lut=True`：不直接返回 bool mask，而是返回 kernel 用的 LUT。
- `attention_sink`：是否强制所有 query block 都 attend 第 0 个 key block。
- `BLKQ`：query block 大小。
- `BLKK`：key block 大小。

注意：`cdfthreshd` 和 `topk` 只能二选一。

返回值：

```text
lut
valid_block_num
q_int8
q_scale
k_int8
k_scale
```

逐个解释：

```text
q_int8: [B, H, S, D]
```

量化后的 Q。每个 Q block 共享一个 scale。

```text
q_scale: [B, H, ceil(S / BLKQ)]
```

每个 Q block 的反量化 scale。

```text
k_int8: [B, H, S, D]
```

量化后的 K。如果 `km` 不为 None，量化前会融合 SmoothK，即量化的是 `k - km`。

```text
k_scale: [B, H, ceil(S / BLKK)]
```

每个 K block 的反量化 scale。

```text
lut: [B, H, num_q_blocks, num_k_blocks]
```

稀疏注意力 kernel 用的查找表。它不是 bool mask，而是 key block 的增量编码。

```text
valid_block_num: [B, H, num_q_blocks]
```

每个 query block 需要计算多少个 key blocks。

这个函数一次完成两件事。

第一，生成 block-sparse attention mask：

- 把 Q/K 按 block 切分。
- 每个 block 做 mean pooling。
- 判断 block 内 token 是否相似。
- 用 pooled Q/K 计算 compressed attention。
- 根据 top-p 或 top-k 选择重要 key blocks。
- 得到 `final_map: [B,H,Q,K]`。
- 如果 `return_lut=True`，把 `final_map` 转成 `lut + valid_block_num`。

第二，融合 Q/K INT8 量化：

- 在 pooling 的同时，把原始 Q/K 量化成 `q_int8/k_int8`。
- 这样后面的 CUDA attention kernel 可以直接使用 INT8 QK 计算。

### 8.2 函数 2：真正的 sparse attention kernel

在获得量化 INT8 的 Q/K 与 block mask 后，代码进入真正的 sparse attention 计算。

Ampere 路径：

```python
if arch in ("sm80", "sm86", "sm87"):
    qattn.qk_int8_sv_f16_accum_f16_block_sparse_attn_inst_buf_with_pv_threshold(
        q_int8, k_int8, v, o, lut, valid_block_num,
        pvthreshd, q_scale, k_scale, 1, False, 1, scale, 0
    )
```

Ampere 上 FP8 不够方便，因此走 V 为 FP16 的路线。kernel 内部大致计算：

```text
score ≈ (q_int8 @ k_int8.T) * q_scale * k_scale * scale
P = softmax(score)
O = P @ V_fp16
```

函数名拆解：

- `qk_int8`：QK 用 INT8。
- `sv_f16`：softmax probability 乘 V 时，V 是 FP16。
- `accum_f16`：部分累加用 FP16 路线。
- `block_sparse_attn`：块稀疏 attention。
- `inst_buf`：使用 instruction buffer 优化。
- `with_pv_threshold`：带 SpargeAttention 3.4 的 PV 跳过判断。

其他架构会先把 V 量化成 FP8：

```python
else:
    b, h_kv, kv_len, head_dim = v.shape
    padded_len = (kv_len + 127) // 128 * 128

    v_transposed_permutted = torch.empty(
        (b, h_kv, head_dim, padded_len),
        dtype=v.dtype,
        device=v.device,
    )
    fused.transpose_pad_permute_cuda(v, v_transposed_permutted, 1)

    v_fp8 = torch.empty(v_transposed_permutted.shape, dtype=torch.float8_e4m3fn, device=v.device)
    v_scale = torch.empty((b, h_kv, head_dim), dtype=torch.float32, device=v.device)

    # fused.scale_fuse_quant_cuda(v_transposed_permutted, v_fp8, v_scale, kv_len, 448.0, 1)
    fused.scale_fuse_quant_cuda(v_transposed_permutted, v_fp8, v_scale, kv_len, 2.25, 1)
```

这里先把 `kv_len` padding 到 128 的倍数。

`fused.transpose_pad_permute_cuda` 完成：

- transpose：`[S, D] -> [D, S]`
- pad：把 S 补到 128 倍数
- permute：调整内存布局，适配后面的 FP8 PV kernel

随后 `scale_fuse_quant_cuda` 把转置/padded 后的 V 量化成 FP8。大致逻辑是：

```text
v_fp8 ≈ v_transposed_permutted / v_scale
v_transposed_permutted ≈ v_fp8 * v_scale
```

其中 `2.25` 是量化相关的缩放常数。代码里原来有一行被注释掉：

```python
# fused.scale_fuse_quant_cuda(..., 448.0, 1)
```

`448.0` 和 FP8 E4M3 的最大有限值有关；这里改成 `2.25` 说明实现里可能用了更保守或经验调过的 scale 策略，以避免 V 量化误差过大或溢出。

然后根据 GPU 和编译条件选择 kernel：

```python
if arch == "sm90":
    qattn.qk_int8_sv_f8_accum_f32_block_sparse_attn_inst_buf_fuse_v_scale_with_pv_threshold_sm90(
        q_int8, k_int8, v_fp8, o, lut, valid_block_num,
        pvthreshd, q_scale, k_scale, v_scale, 1, False, 1, scale, 0
    )
elif SAGE2PP_ENABLED:
    qk_int8_sv_f8_accum_f16_block_sparse_attn_inst_buf_fuse_v_scale_with_pv_threshold(
        q_int8, k_int8, v_fp8, o, lut, valid_block_num,
        pvthreshd, q_scale, k_scale, v_scale, 1, False, 1, scale, 0
    )
else:
    qattn.qk_int8_sv_f8_accum_f32_block_sparse_attn_inst_buf_fuse_v_scale_with_pv_threshold(
        q_int8, k_int8, v_fp8, o, lut, valid_block_num,
        pvthreshd, q_scale, k_scale, v_scale, 1, False, 1, scale, 0
    )
```

三条路径：

- `arch == "sm90"`：Hopper 专用 FP8 路径，PV 累加为 FP32。
- `SAGE2PP_ENABLED`：Sage2++ 开启时走 FP16 accumulation 版本。
- `else`：普通 fallback，通常是 FP8 V + FP32 accumulation。

`pvthreshd` 是 SpargeAttention 3.4 的 sparse warp online softmax 阈值，用于判断某个 block 的 `P @ V` 是否可以跳过。

### 8.3 输出整理与 sparsity 统计

最后一段：

```python
if tensor_layout == 'NHD':
    o = rearrange(o, '... H L D -> ... L H D')

if return_sparsity:
    if is_causal is False:
        qk_sparsity = 1 - (valid_block_num.float().sum()) / (
            lut.size(3) * lut.size(2) * lut.size(0) * lut.size(1)
        )
    else:
        qk_sparsity = 1 - (valid_block_num.float().sum()) / (
            ((lut.size(3) + 2) // 2) * lut.size(2) * lut.size(0) * lut.size(1)
        )
    return o, qk_sparsity.item()
else:
    return o
```

如果输入 layout 是 `NHD`，kernel 内部会先转成 `HND` 计算，最后再通过：

```python
o = rearrange(o, '... H L D -> ... L H D')
```

把输出恢复成 `NHD`。

Sparsity 统计：

```text
稀疏率 = 1 - 实际计算的 block pair 数 / dense 情况下总 block pair 数
```

其中：

```python
valid_block_num.float().sum()
```

是真正实际计算的 block pair 数。

非 causal 情况下，总 block pair 数是：

```text
B * H * Q * K
```

对应代码：

```python
lut.size(3) * lut.size(2) * lut.size(0) * lut.size(1)
```

Causal 情况下，dense baseline 本来就不能看未来，因此分母换成了 causal 可见 block 数的估计。

### 8.4 Online softmax + PV 跳过

最重要的部分还没说：online softmax + PV 跳过。

首先来认识 online softmax。

（公式待补充）

（原本的等价性证明待补充）

（PV省略的关键公式/代码代补充）

对应到 `_qattn` 绑定：

太多 C++ 了，只想让 Codex 给我讲，不想记。

AI批注：这部分对应 SpargeAttention 论文 3.4。代码核心是：先用 LUT 决定哪些 K/V block 进入循环；对进入循环的 block 先计算 INT8 QK；再用 FlashAttention 风格的 online softmax 维护 `m/d/O`；最后用 `local_max_diff + pv_threshold > 0` 判断当前 block 的 `P_ij V_j` 是否足够大，若太小则跳过 PV。

---

## 9. SLA 系列

（待更新）

---

## 10. 后续想法与实验

Mask 在跨 layer/step 的复用问题，稳定性结构。

Prompt（instance）对于 tiling 的指导也许并非 input 无关。

但是 prompt 对稀疏程度（level）和 block 选择（attend which ones）的指导似乎并没有那么明显，而且直接使用当前 QK，直觉上效果会更好。

首先需要像 Veda 中那样，在构建 oracle mask 之前先 tiling。

接下来是跨 step 实验：想把同一 layer/head 在不同 step 的 oracle mask heatmap 存下来，以直观展示随着 step 变化，mask 以及 attention pattern 如何变化。

（实验结果）

那其实我们可以从一开始就决定好每个 `layer + head` 的 mask 结构，并且 offline profile 出每一个 step 需要的 sparsity，甚至不需要 prompt 与每一层之前的 QK 参与。

### 10.1 三种候选方案

A. Fully static:

```text
M_{l,h,s} only depends on layer/head/step.
```

B. Static structure + dynamic budget:

```text
pattern 固定，但 k 根据 step 或轻量统计变化。
```

C. Static candidate set + dynamic refinement:

```text
offline 给出候选 key tiles，再用当前 QK/token 特征在候选内选择。
```

A 可以验证核心假设是否成立。

C 更可能成为真正可用的方法，因为它保留了大部分省时收益，同时允许 instance-specific 修正。

### 10.2 方向判断

静态先验 + 动态修正？这是一个待扩展的不成熟想法，更适合用来讲故事。

Tile 的选择可能是个问题。无论是 static 还是 dynamic mask 都避免不了这个问题。tile 选大了粗粒度太高，选小了算得麻烦（也许？）。更何况不同位置可能会有不同形状的最优 tile，详见 Sparge Attention 的 Hilbert 映射与合并 block。

简单粗暴一点：有没有办法验证不同 prompt 的最优 tile 形状应该是不同的？以及这个最优 tile 除了用 output MSE 的方式来监督，还能不能用别的方法正向主动选择？

并不是一个被认可的方向……

读了一些代码，学习 Triton 算子的写法。
