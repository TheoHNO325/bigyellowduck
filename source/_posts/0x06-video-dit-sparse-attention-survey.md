---
title: 大黄鸭科研外传：视频 DiT 稀疏 Attention 方法谱系
date: 2026-07-06
permalink: waizhuan/0x06-video-dit-sparse-attention-survey/
tags:
  - 小说
  - 外传
  - 科研笔记
waizhuan_section: 科研笔记
author_display: gpt5.5medium
excerpt: 把 SVG、Radial Attention、SVG2、SVOO、SLA 与 TurboDiffusion 放到同一张地图上看：它们分别相信什么先验，解决什么瓶颈，又引入什么代价。
---

如果把视频 DiT 的 sparse attention 方法排成一张地图，它们大致是在回答同一个问题：

> 给定 dense attention 矩阵，哪些连接值得精确计算，哪些连接可以近似，哪些连接可以跳过？

不同论文的差别，在于它们相信的“重要性来源”不同。有的相信时空结构，有的相信距离衰减，有的相信语义聚类，有的相信层级 profile，有的干脆把弱连接交给 linear attention 近似。

<!-- more -->

## 1. SVG：head 有空间/时间偏好

SVG 的观察是：视频 DiT 的不同 attention head 往往有不同功能。有些 head 主要看同一帧内的空间关系，有些 head 更关注跨帧的时间关系。

因此 SVG 做了一件很直接的事：在推理时采样少量 token，用候选 sparse attention 输出和 dense attention 输出对比，然后为每个 head 选择 spatial mask 或 temporal mask。

它的优点是：

- training-free；
- 可直接替换已有模型；
- spatial/temporal 二分结构清楚；
- 在 CogVideoX、HunyuanVideo 等视频模型上能带来实际加速。

它的局限也清楚：空间/时间二分是粗粒度假设。一个物体在不同帧中的同一身份、重复出现的背景元素、复杂运动轨迹，都不一定能被这种简单分类覆盖。

SVG 适合作为入门第一篇，因为它把视频 attention 的冗余说得很直观：不是每个 head 都需要看完整时空 token。

## 2. Radial Attention：距离越远，保留越少

Radial Attention 更像是把一个静态几何先验写进 mask：近帧、近邻区域保留更多 attention；远帧、远距离区域逐渐降低密度。

它背后的假设是：post-softmax attention 能量会随空间距离和时间距离增加而衰减。于是可以构造一种 radial pattern，让复杂度接近 $\mathcal{O}(N\log N)$。

它的优点是结构简单，适合长视频和长度外推，也比在线 profiling 更干净。

但问题在于：距离不是语义。远距离 token 可能保存同一主体的身份信息，也可能保存全局运动线索。静态 mask 越简单，越可能错过内容相关的长程依赖。

Radial Attention 的启发是：如果先验足够规则，kernel 会更好做；但如果先验太粗，质量风险也会上升。

## 3. SVG2：先把语义相近的 token 排到一起

SVG2 认为，空间位置不足以判断 attention 重要性。它引入 semantic-aware permutation：先对 $Q,K,V$ 特征聚类，把语义相近的 token 重排到连续内存区域，再做 block sparse attention。

聚类后，可以用 cluster-level score 近似 token-level attention：

$$
s_{cr}=\frac{\mu_c^Q(\mu_r^K)^\top}{\sqrt d}.
$$

这里 $\mu_c^Q$ 是 query cluster 的中心，$\mu_r^K$ 是 key cluster 的中心。这样做的好处是 critical token 不再零散分布，GPU block 计算浪费更少。

SVG2 相比 SVG 的进步在于：它不只问“这是空间 head 还是时间 head”，而是进一步问“哪些 token 在语义上应该被放到一起”。

代价是系统复杂度明显增加：聚类、重排、动态 cluster size、自定义 kernel 都进入推理路径。对于实际部署来说，这些额外开销必须被 attention 计算节省抵消。

## 4. SVOO：离线 profile 层级稀疏，在线做 Q-K 双向聚类

SVOO 的关键判断有两个。

第一，不同层、不同 head 的稀疏容忍度不同。有些层 attention 很尖锐，容易剪；有些层更平坦，不能激进剪。

第二，这种稀疏特性在不同输入上相对稳定。因此可以离线用 calibration prompts 估计每层/每头的稀疏度，再在推理时复用。

SVOO 的 offline profiling 会看 attention mass 覆盖。例如对每一行 attention，把 key 权重排序，取最短前缀覆盖阈值 $\tau$，论文中常见设定是 $\tau=0.95$。需要保留的比例越低，说明这一层/头越容易稀疏。

online 阶段则做 QK bidirectional co-clustering。原因是 key 的合理分组依赖 query，query 的合理分组也依赖 key。只独立聚类 Q 或 K，会忽略 $QK^\top$ 的耦合结构。

最后得到 block-level dynamic map：

$$
\text{dynamic\_map}\in\{0,1\}^{B\times H\times K_q\times K_k}.
$$

这个 map 决定哪些 query cluster 和 key cluster 之间要真实计算 attention。

SVOO 的优势是同时利用 layer-wise stability 和 Q-K coupling。它的代价是需要离线 profile，推理时还要做在线 co-clustering，代码理解门槛也更高。

## 5. SLA：不要把 marginal attention 直接扔掉

纯 sparse 方法通常是二元选择：一个 block 要么精确算，要么跳过。但 SLA 指出，很多 marginal blocks 单个权重不大，累积贡献却可能不可忽略。

因此 SLA 把 blocks 分成三类：

- critical：精确 sparse attention；
- marginal：linear attention 近似；
- negligible：跳过。

形式上可以写成：

$$
O = O_{\mathrm{critical}} + O_{\mathrm{marginal}}.
$$

marginal 部分用 feature map $\phi(\cdot)$ 做 linear attention 近似：

$$
O_{\mathrm{marginal}}
\approx
\frac{\phi(Q)\left(\phi(K_\mathcal{M})^\top V_\mathcal{M}\right)}
{\phi(Q)\left(\phi(K_\mathcal{M})^\top \mathbf{1}\right)}.
$$

这比 hard pruning 更细腻：弱连接不是全丢，而是用更便宜的方式保留整体贡献。

它的缺点是部署不如 training-free 方法直接，通常需要微调和专用 kernel。

## 6. TurboDiffusion：attention 只是系统加速的一部分

TurboDiffusion 把问题推到系统层面。它不只依赖 sparse/linear attention，还结合 step distillation、量化、fused kernels 等手段，目标是极高端到端加速。

这类工作很重要，因为它提醒我们：用户最终关心的是生成一个视频要多久，而不是单个 attention kernel 的理论复杂度。

但它也带来归因困难。质量和速度来自多个技术叠加，很难单独判断某个 attention 近似到底贡献了多少。

## 7. 横向比较

| 方法 | 主要先验 | 是否 training-free | 优势 | 风险 |
|---|---|---:|---|---|
| SVG | head 的空间/时间偏好 | 是 | 简单直接，替换方便 | 二分假设粗 |
| Radial | 时空距离衰减 | 可训练/可推理使用 | 结构规则，适合长视频 | 远距离语义可能被削弱 |
| SVG2 | 语义相近 token 应连续 | 是 | critical token 更集中 | 聚类与重排开销高 |
| SVOO | 层级稀疏稳定 + QK 耦合 | 是 | 稀疏预算更细，选择更自适应 | 需要 profile 和在线聚类 |
| SLA | marginal attention 有累积贡献 | 否 | 高稀疏率下更稳 | 需要微调和 kernel |
| TurboDiffusion | 系统联合优化 | 否 | 端到端速度极高 | 归因困难，工程重 |

## 8. 我的阶段性判断

这个方向最核心的矛盾是：越精确的 sparse decision，往往越动态、越复杂、越难跑快；越规则的 sparse pattern，往往越容易部署，但越可能漏掉内容相关依赖。

所以真正值得研究的不是“再提出一个 mask”，而是找到一个低开销、可执行、质量稳定的中间点。

我现在更倾向于把问题表述为：

> 如何用尽可能便宜的统计或聚类信号，构造出 GPU 友好的 block sparse pattern，并在 marginal 信息上避免过度删除？

这个表述把算法、kernel 和生成质量绑在了一起，也更接近视频 DiT 稀疏 attention 的真实难点。
