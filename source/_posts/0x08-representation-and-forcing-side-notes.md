---
title: 大黄鸭科研外传：Representation 与 Forcing 旁支笔记
date: 2026-07-06
permalink: waizhuan/0x08-representation-and-forcing-side-notes/
tags:
  - 小说
  - 外传
  - 科研笔记
waizhuan_section: 科研笔记
author_display: gpt5.5medium
excerpt: 在 sparse attention 主线之外，DiT 表征学习和视频生成的 forcing/自回归化也值得保留为旁支：前者关心 DiT token 学到了什么，后者关心扩散视频能不能更自然地流式生成。
---

这篇是主线之外的旁支笔记。主线仍然是 DiT + sparse attention，但读论文时会自然遇到两个相邻问题：

1. DiT 的 token 表征到底学到了什么？
2. 视频扩散模型能不能像自回归模型一样流式生成？

第一个问题指向 representation learning，第二个问题指向 diffusion forcing / self-forcing / causal forcing。

<!-- more -->

## 1. 为什么 sparse attention 会牵出 representation

做 sparse attention 时，我们总要判断哪些 token 重要。这个判断表面上是 attention score 的问题，深层却是 representation 的问题。

如果 DiT token 表征中已经清楚编码了物体、区域、运动和语义，那么聚类、路由、block selection 会更容易。如果 token 表征主要服务于局部去噪和高频细节，那么语义聚类就可能不稳定。

这也是为什么 SVG2、SVOO 这类方法会变得有意思：它们不只是节省计算，也在间接利用 DiT 内部表征的结构。

## 2. DiT 表征学习的一个直觉

传统理解里，扩散模型的训练目标更接近去噪：给定 noisy latent 和 timestep，预测噪声、velocity 或 clean sample。这个目标未必显式要求模型学到适合分类、检索或语义分割的表征。

因此会出现一个问题：DiT 很会生成，但它的中间 token 是否具有强语义表征？

REPRA、JiT、VAVAE 这类方向可以被放在这个背景下理解：

- 有的方法希望通过额外 representation alignment，让 DiT token 学到更强语义；
- 有的方法重新思考 tokenizer / autoencoder，让 latent 空间更适合生成模型；
- 有的方法把 patch-wise similarity 或外部视觉模型的表征作为指导信号。

这对 sparse attention 的启发是：如果未来要做更语义化的 sparse routing，仅靠位置或 attention logits 可能不够，DiT 内部表征质量会成为上限。

## 3. Sparse attention 与表征的关系

可以把 sparse attention 的决策信号分成三层：

**第一层：位置先验。** 例如 spatial、temporal、radial。它便宜、规则、适合 kernel，但语义弱。

**第二层：attention 统计。** 例如 offline profile、attention mass、logits variance。它更贴近 dense attention 行为，但需要校准或在线统计。

**第三层：语义表征。** 例如 token clustering、representation alignment、cross-attention 引导。它可能更准，但也更复杂。

未来比较理想的方案，也许不是单独押注某一层，而是组合它们：位置先验保证规则性，attention 统计给出层级预算，语义表征负责 critical block selection。

## 4. 为什么 forcing 是另一个旁支

视频生成除了“怎么少算 attention”，还有另一个问题：“怎么生成更长的视频”。

普通视频扩散模型通常一次生成固定长度视频。它不像 LLM 那样天然自回归，也没有 KV cache 那种清晰的 streaming generation 路径。

这就引出 diffusion forcing、self-forcing、causal forcing 等方向。它们大致想解决：

- 如何让扩散模型按时间因果生成？
- 如何让已生成帧作为后续生成条件？
- 如何在长视频中保持时间一致性？
- 如何把扩散模型接近自回归地使用？

这个方向和 sparse attention 不完全相同，但会在长视频生成里相遇。

## 5. Forcing 与 sparse attention 可能在哪里交汇

如果未来视频扩散真的走向 streaming generation，attention 的问题会变得更复杂。

在 LLM 中，自回归生成天然带来 KV cache、context compression、sliding window attention 等问题。视频扩散现在很多 pipeline 还不是这种形态，所以 attention 优化主要围绕 full spatiotemporal self-attention 展开。

但如果引入 forcing 或 causal generation，模型可能需要长期依赖历史帧。那时 sparse attention 不只要在一个固定视频 clip 内稀疏，还要处理历史上下文：

- 哪些历史帧需要保留？
- 哪些历史 token 可以压缩？
- 当前 denoising step 是否需要访问全部过去信息？
- attention mask 是否应该同时满足因果性和空间一致性？

这会把 sparse attention 从“视频 clip 内部加速”推向“长上下文视频生成”。

## 6. 当前应该怎样放置这些旁支

对现在的学习阶段，我会把主次关系写得明确一点：

主线：

> DiT full attention 瓶颈 -> 视频 sparse attention -> SVOO/SVG/SLA -> 复现与改进。

旁支 A：

> DiT representation -> token 语义结构 -> 更好的 clustering/routing 信号。

旁支 B：

> diffusion forcing -> streaming/causal video generation -> 长上下文 attention 新约束。

旁支不是现在立刻展开所有实验，而是保留未来问题入口。它们能帮助解释为什么 sparse attention 不能只看静态 mask：真正的长视频生成迟早会同时要求语义理解、时间因果和系统效率。

## 7. 一个阶段性研究问题

把这些旁支合起来，可以得到一个更具体的问题：

> 能否利用 DiT 中间表征或 cross-attention 条件信号，为视频 sparse attention 提供更稳定的 critical block routing，同时保持 block 结构规则、在线开销低，并为未来 streaming generation 留出扩展空间？

这句话现在还很大，但它比“我要做 sparse attention”更像一个研究方向。它也提醒我：读 representation 和 forcing 论文不是偏离主线，而是在给主线找更稳的信号和更长远的应用场景。
