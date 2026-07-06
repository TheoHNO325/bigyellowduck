---
title: 大黄鸭科研外传：DiT 与 Sparse Attention 入门路线
date: 2026-07-06
permalink: waizhuan/0x05-dit-sparse-attention-roadmap/
tags:
  - 小说
  - 外传
  - 科研笔记
waizhuan_section: 科研笔记
author_display: gpt5.5medium
excerpt: 从 DiT 为什么把 attention 变成瓶颈开始，整理一条给新手看的 sparse attention 阅读路线：先看 full attention 的代价，再看视频 DiT 的时空 token，最后进入 SVG、Radial、SVG2、SVOO、SLA 与 TurboDiffusion。
---

这是一篇给刚入门的自己的路线图。方向可以先粗略写成：

> DiT + sparse attention = 在不重新训练大模型的前提下，尽量少算视频扩散 Transformer 里的 full self-attention，同时让输出仍然接近 dense baseline。

这里的重点不是“attention 能不能稀疏”这么简单，而是三个问题同时成立：

1. 哪些 token 交互真的关键？
2. 哪些不关键的交互可以近似或丢弃？
3. 稀疏结构能不能映射成 GPU 上真实变快的 kernel？

如果只解决第一个问题，很容易得到漂亮的热力图，却没有延迟收益。如果只解决第三个问题，又容易得到很规则的 mask，但视频质量下降。这个方向最难的地方，正是在这三者之间找平衡。

<!-- more -->

## 1. 从 DiT 开始：为什么 attention 会成为主线

DiT 的基本转向是：扩散模型不一定非要用 U-Net，图像 latent 可以 patchify 成 token 序列，然后交给 Transformer 处理。这样做带来了更直接的 scaling law 直觉：模型越大、token 越多、计算越多，质量通常越好。

但 Transformer 的代价也很明确。设视频 latent 为

$$
X \in \mathbb{R}^{T \times H \times W \times d},
$$

展平后 token 数为

$$
N=THW.
$$

标准 self-attention 是

$$
O=\operatorname{softmax}\left(\frac{QK^\top}{\sqrt d}\right)V,
$$

其中 $Q,K,V\in\mathbb{R}^{N\times d}$。注意力矩阵是 $N\times N$，复杂度约为

$$
\mathcal{O}(N^2d).
$$

图像已经不便宜，视频更糟。帧数、空间分辨率、patch 数一起增长时，full attention 很快变成主要瓶颈。

因此 sparse attention 的核心问题不是“为了优雅而稀疏”，而是：如果不减少 attention 计算，长视频生成会被 $N^2$ 卡住。

## 2. 读论文时先分清两种目标

这一方向的论文容易混在一起看，但它们的目标并不完全相同。

第一类是 **training-free attention replacement**。它希望不训练或少训练，直接替换已有视频 DiT 的 self-attention。例如 SVG、Radial Attention、SVG2、SVOO。这类方法更像工程替换：原模型已经训练好，我们只在推理阶段改 attention。

第二类是 **system-level acceleration**。它不只改 attention，还会结合蒸馏、量化、fused kernels、step reduction 等完整系统手段。例如 TurboDiffusion。这类方法的速度更激进，但归因更困难，因为最终收益不只来自 sparse attention。

第三类是 **architecture/training-aware attention**。例如 SLA 把 blocks 分成 critical、marginal、negligible：关键块精确算，边缘块用 linear attention 近似，不重要块跳过。它不是简单二值删除，因此质量可能更稳，但通常需要微调和专用 kernel。

读文献时要先问：这篇论文是在做 training-free 替换、可训练模块，还是完整系统加速？否则很容易把不同约束下的结果放到同一个表里比较。

## 3. 一条建议阅读路线

### 第一站：DiT

先读 DiT 的动机和结构：latent diffusion、patchify、DiT block、adaLN-Zero、Gflops 与 FID 的关系。这里不用一开始就纠结所有公式，先抓住一个点：

> DiT 把扩散模型的 backbone 变成 Transformer，于是 attention 的计算结构变成后续优化的主战场。

### 第二站：SVG 与 Radial Attention

SVG 的直觉是视频 attention head 有时空偏好：一些 head 更偏空间，一些 head 更偏时间。它在推理时做少量 profiling，为每个 head 选择 spatial 或 temporal mask。优点是 training-free、思路直接；局限是二分假设比较粗。

Radial Attention 更像静态先验：近处保留密，远处保留疏。它依赖“attention 能量随时空距离衰减”的观察，结构简单，也更容易做长视频。但距离不是语义，远距离 token 也可能对物体身份和全局运动很关键。

这两篇适合建立 sparse attention 的第一层直觉：稀疏模式可以来自时空结构，也可以来自距离先验。

### 第三站：SVG2 与 SVOO

SVG2 开始引入语义聚类。它先把相似 token 排到连续区域，再做 block sparse attention。这样 critical token 更集中，GPU block 计算更少浪费。

SVOO 则把问题拆成 offline 和 online 两部分：

- offline：profile 每层/每头能忍受多少稀疏；
- online：对 Q/K 做 bidirectional co-clustering，再选择要保留的 cluster blocks。

这一步要重点理解：SVOO 不是只看 token 位置，也不是只看单边 Q 或 K。因为 $QK^\top$ 是耦合关系，key 怎么分组取决于 query，query 怎么分组也取决于 key。

### 第四站：SLA 与 TurboDiffusion

SLA 提醒我们：不是所有被丢掉的 attention 都真的可以忽略。很多 marginal attention 单个权重小，但累积贡献可能仍然重要。因此它把 marginal blocks 用 linear attention 近似，而不是直接删除。

TurboDiffusion 则说明，真实端到端加速往往不是一个模块完成的。attention、蒸馏、量化、kernel、服务端调度会一起影响最终 latency。

读到这里以后，再回头看 SVG/SVOO，会更清楚 training-free 方法的价值和边界。

## 4. 新手容易踩的坑

**不要只看 FLOPs。** sparse mask 降低理论 FLOPs，不代表 GPU 一定变快。不规则访存、额外排序、聚类、kernel launch 都可能吃掉收益。

**不要只看速度。** 视频生成很容易出现 subject consistency、motion consistency、aesthetic quality 的退化。PSNR/SSIM/LPIPS 只能衡量 sparse 输出与 dense 输出的接近程度，VBench、VisionReward 或人工观察仍然重要。

**不要把所有方法都叫 sparse attention。** 有些方法是 hard pruning，有些是 sparse + linear，有些是 distillation + quantization + kernel fusion。名字相近，约束完全不同。

**不要忽略 pipeline。** Wan 和 HunyuanVideo 的 token 数、帧数、attention 占比、条件模块都不一样。同一个 attention 替换，在不同 pipeline 上的端到端加速可能差很多。

## 5. 当前最值得继续追的问题

我现在认为，DiT + sparse attention 方向最有价值的问题不是再造一个静态 mask，而是：

1. 如何用很低开销判断真正关键的 Q-K block？
2. 如何保留 marginal attention 的累积贡献？
3. 如何让稀疏结构天然适配 block-wise kernel？
4. 如何把 attention 替换与 early dense steps、layer-wise schedule、cluster reuse 这些工程细节统一起来？

也就是说，真正的目标不是“让矩阵变稀疏”，而是让 dense attention 中最重要的行为被便宜地保留下来。

这条路从 DiT 开始，但不会停在 DiT 结构本身。它会一路走到视频 pipeline、GPU kernel、评测指标和生成质量之间的交界处。
