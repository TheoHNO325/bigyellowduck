---
title: 大黄鸭与SD3.5
date: 2026-04-09
permalink: waizhuan/0x02-dahuangya-difftion1/
tags:
  - 小说
  - 外传
waizhuan_section: 笔记
author_display: deepseek-专家模式
excerpt: 你拿出一个神奇的“去雾镜”，轻轻转动旋钮。第一次转动，雾气消散了一点点，那团黄色开始有了大致的椭圆形状。你继续转动，每转一次，雾气便退去一层：扁扁的嘴巴、圆圆的脑袋、黑色的眼睛……细节逐渐浮现。
---

# 序言：一只大黄鸭的诞生

想象你站在一片浓雾弥漫的湖边。起初，你只能看见一团模糊的黄色光晕，轮廓混沌，几乎与雾气融为一体——这便是扩散模型采样起点处的纯噪声。

你拿出一个神奇的“去雾镜”，轻轻转动旋钮。第一次转动，雾气消散了一点点，那团黄色开始有了大致的椭圆形状。你继续转动，每转一次，雾气便退去一层：扁扁的嘴巴、圆圆的脑袋、黑色的眼睛……细节逐渐浮现。

经过数十次耐心的“去雾”操作，一只憨态可掬的大黄鸭终于清晰地浮现在水面上。你手中这面镜子的旋钮，就是扩散模型中的采样器；每一次转动，便是一次迭代步进；而镜片上不断清晰的影像，正是模型从噪声中一步步还原出的潜变量图像。

本文将带你拆解这面“去雾镜”的内部构造——从 ODE 的数学原理，到 Euler 与 DPM++ 2M 采样器的代码实现，让你亲眼见证大黄鸭（或是任何你想要的图像）是如何从一团混沌中“显影”而出的。


# 从噪声到图像：扩散模型采样原理与代码精读

> 一份给扩散模型初学者的工程与理论结合笔记，基于 SD3.5 代码的深度拆解。

---

## 前言

刚开始接触扩散模型（Diffusion Models）时，很容易被满屏的数学公式、复杂的采样器名称（Euler、DPM++ 2M）以及代码中诡异的 `sigma`、`denoised`、`to_d` 搞得晕头转向。本文是我在阅读 Stable Diffusion 3.5 核心推理代码时整理的学习笔记，旨在从**工程实现**出发，回溯其背后的**数学直觉**，帮助和我一样的科研新手建立起从原理到代码的桥梁。

---

## 1. 扩散模型概览：从“加噪-去噪”到图像生成

扩散模型的基本思想非常朴素：通过对真实图像逐步添加噪声，将其破坏为纯噪声，再训练一个神经网络学习逆向过程——从噪声中逐步恢复出原始图像。这个“逆向去噪”的过程，就是生成新图像的关键。

### 1.1 前向扩散：给图像加噪声

假设有一张干净的潜变量图像 \(x_0\)。在 **Rectified Flow** 框架下（SD3.5 所采用），我们通过一个连续噪声水平参数 \(\sigma \in [0,1]\) 来控制加噪程度：

\[
x_\sigma = (1 - \sigma) \cdot x_0 + \sigma \cdot \epsilon
\]

其中 \(\epsilon \sim \mathcal{N}(0, I)\) 是标准高斯噪声。当 \(\sigma = 0\) 时，\(x_\sigma = x_0\)（完全干净）；当 \(\sigma = 1\) 时，\(x_\sigma = \epsilon\)（纯噪声）。

### 1.2 训练目标：预测速度场

神经网络 \(v_\theta\) 的任务是：给定任意噪声水平下的图像 \(x_\sigma\) 和对应的 \(\sigma\)，预测出从噪声指向干净图像的速度场（Velocity Field）\(v\)：

\[
v(x_\sigma, \sigma) \approx \epsilon - x_0
\]

损失函数采用均方误差（MSE）：

\[
\mathcal{L}(\theta) = \mathbb{E}_{x_0,\epsilon,\sigma} \left[ \| v_\theta(x_\sigma, \sigma) - (\epsilon - x_0) \|^2 \right]
\]

训练时，\(\sigma\) 从区间 \([0,1]\) 中**随机采样**，这使得模型能够学习处理任意噪声水平的图像，为后续灵活采样奠定基础。

### 1.3 逆向采样：从噪声中恢复图像

训练完成后，我们得到了一个能够预测速度场的模型。生成新图像时，我们从纯噪声 \(x_{\sigma=1}\) 出发，沿着一条特定的轨迹逐步降低 \(\sigma\)，最终抵达 \(x_{\sigma=0}\)。这条轨迹由**常微分方程（ODE）** 描述，而如何高效、准确地求解该 ODE，就是各种采样器的核心任务。

---

## 2. 从随机到确定：概率流 ODE 的推导

扩散模型的逆向过程本质上是一个**随机微分方程（SDE）**。2021 年，宋飏（Yang Song）等人在论文 *"Score-Based Generative Modeling through Stochastic Differential Equations"* 中证明：对于任意扩散 SDE，存在一个与之边缘概率分布演化完全相同的**确定性常微分方程（ODE）**，称为**概率流 ODE（Probability Flow ODE）**。

在 Rectified Flow 框架下，该 ODE 的形式非常简单：

\[
\frac{dx}{d\sigma} = \frac{x - \hat{x}_0(x, \sigma)}{\sigma}
\]

其中 \(\hat{x}_0(x, \sigma)\) 是模型对干净图像的预测，在代码中通常记为 `denoised`。

**直观理解**：想象山顶滚落的随机轨迹构成一朵“概率云”，虽然单次滚落路径随机，但云团中心的移动方向是确定的。PF-ODE 描述的就是这个中心沿时间演化的确定性规律。逆向采样就是沿着这条轨迹逆流而上，从噪声的“云团”中心回到清晰图像的“点”。

---

## 3. 从 ODE 到代码：两个核心采样器的推导与实现

有了 ODE 之后，问题转化为：**如何数值求解这个微分方程？** 不同的数值方法对应不同的采样器。以下我们推导并解读代码中的两种经典方法。

### 3.1 基础函数 `to_d`：ODE 右端项的计算

```python
def to_d(x, sigma, denoised):
    return (x - denoised) / append_dims(sigma, x.ndim)
```

它直接计算了 ODE 的右端项，即导数 \(\frac{dx}{d\sigma} = \frac{x - \hat{x}_0}{\sigma}\)。在代码中，`denoised` 正是模型输出的 \(\hat{x}_0\)。

---

### 3.2 Euler 采样器：一阶线性近似

Euler 法是最简单的 ODE 求解方法。其核心思想是：**将连续轨迹离散化为小步长，每一步内假设导数不变，用直线代替曲线**。

#### 数学推导

将 ODE \(\frac{dx}{d\sigma} = f(x, \sigma)\) 在 \(\sigma_i\) 处进行一阶泰勒展开：

\[
x(\sigma_{i+1}) \approx x(\sigma_i) + (\sigma_{i+1} - \sigma_i) \cdot \frac{dx}{d\sigma}\bigg|_{\sigma_i}
\]

代入 \(f(x, \sigma) = \frac{x - \hat{x}_0(x, \sigma)}{\sigma}\)，得到 Euler 更新公式：

\[
x_{i+1} = x_i + (\sigma_{i+1} - \sigma_i) \cdot \frac{x_i - \hat{x}_0(x_i, \sigma_i)}{\sigma_i}
\]

#### 代码实现

```python
@torch.no_grad()
def sample_euler(model, x, sigmas, extra_args=None):
    s_in = x.new_ones([x.shape[0]])
    for i in range(len(sigmas) - 1):
        sigma_hat = sigmas[i]
        denoised = model(x, sigma_hat * s_in, **extra_args)   # 预测 \hat{x}_0
        d = to_d(x, sigma_hat, denoised)                      # 计算导数
        dt = sigmas[i + 1] - sigma_hat                        # 步长（负值，因为 sigma 递减）
        x = x + d * dt                                        # Euler 更新
    return x
```

- **优点**：实现极其简单，数值行为稳定。
- **缺点**：一阶精度，在轨迹弯曲处误差较大，通常需要 50~100 步才能收敛。

---

### 3.3 DPM-Solver++(2M)：二阶指数积分 + 历史修正

Euler 法在步长较大时精度不足，而 DPM-Solver++ 是一类专为扩散模型设计的**高阶专用求解器**。其核心思想包含三步：变量替换化曲为直、精确指数积分、利用历史信息进行二阶修正。

#### 3.3.1 变量替换：将弯曲轨迹“拉直”

扩散模型的 ODE 在 \(\sigma\) 空间中高度弯曲，尤其在 \(\sigma \to 0\) 附近变化剧烈。DPM-Solver 引入变量替换：

\[
t = -\ln \sigma, \quad \sigma = e^{-t}
\]

此时 \(t \in [0, +\infty)\)。利用链式法则，原 ODE 转换为：

\[
\frac{dx}{dt} = \frac{dx}{d\sigma} \cdot \frac{d\sigma}{dt} = \frac{x - \hat{x}_0}{\sigma} \cdot (-\sigma) = \hat{x}_0 - x
\]

整理为标准线性形式：

\[
\frac{dx}{dt} + x = \hat{x}_0(x, \sigma(t))
\]

这个方程在 \(t\) 空间中轨迹近似直线，数值求解更稳定。

#### 3.3.2 精确指数积分

假设在小区间 \([t, t+h]\) 内，\(\hat{x}_0\) 近似为常数 \(D\)（即模型预测的 `denoised`），则上述一阶线性 ODE 存在**精确解析解**：

\[
x(t+h) = e^{-h} x(t) + (1 - e^{-h}) D
\]

这是一个**指数积分**公式，其精度远高于 Euler 法的线性外推。在代码中，用 `sigma_fn(t) = e^{-t}` 及 `expm1` 函数实现：

```python
(sigma_fn(t_next) / sigma_fn(t)) * x - (-h).expm1() * denoised
```

其中 `sigma_fn(t_next) / sigma_fn(t) = e^{-h}`，`-(-h).expm1() = 1 - e^{-h}`。

#### 3.3.3 二阶修正：利用历史信息提升精度

上述推导假设了 \(\hat{x}_0\) 在步长内恒定，这在大步长时仍会引入误差。DPM-Solver++(2M) 通过存储上一步的预测值 `old_denoised`，对当前步的 \(\hat{x}_0\) 进行**线性外推**，以获得更准确的二阶修正值 `denoised_d`。

假设在 \(t\) 空间中，\(\hat{x}_0(t)\) 是局部线性的，可利用前一步信息进行线性插值：

\[
\hat{x}_0^{\text{corr}} = \left(1 + \frac{1}{2r}\right) \hat{x}_0^{(i)} - \frac{1}{2r} \hat{x}_0^{(i-1)}
\]

其中 \(r = h_{\text{last}} / h\) 是前后步步长之比。该修正公式使算法整体达到二阶收敛。

#### 代码实现

```python
@torch.no_grad()
def sample_dpmpp_2m(model, x, sigmas, extra_args=None):
    sigma_fn = lambda t: t.neg().exp()       # σ = e^{-t}
    t_fn   = lambda sigma: sigma.log().neg() # t = -ln(σ)
    old_denoised = None
    for i in range(len(sigmas) - 1):
        denoised = model(x, sigmas[i], **extra_args)
        t, t_next = t_fn(sigmas[i]), t_fn(sigmas[i + 1])
        h = t_next - t
        if old_denoised is None or sigmas[i + 1] == 0:
            # 第一步或最后一步：使用一阶精确指数解
            x = (sigma_fn(t_next) / sigma_fn(t)) * x - (-h).expm1() * denoised
        else:
            # 常规步：利用历史信息进行二阶修正
            h_last = t - t_fn(sigmas[i - 1])
            r = h_last / h
            denoised_d = (1 + 1/(2*r)) * denoised - (1/(2*r)) * old_denoised
            x = (sigma_fn(t_next) / sigma_fn(t)) * x - (-h).expm1() * denoised_d
        old_denoised = denoised
    return x
```

- **优点**：二阶精度，只需 15~25 步即可生成高质量图像。
- **适用性**：目前最常用的高效采样器之一，被广泛应用于各类扩散模型推理中。

---

## 4. 训练与推理中的时间参数辨析

理解扩散模型必须明确“时间”参数在训练和推理阶段的不同含义。

| 阶段 | 参数 `sigma` 来源 | 迭代方式 | 目标 |
| :--- | :--- | :--- | :--- |
| **训练** | 从 \([0,1]\) 中**随机采样** | 单次前向计算损失 | 学习任意噪声水平下的去噪能力 |
| **推理** | **预定义的递减序列** `sigmas` | 循环调用模型 + 采样器更新 | 沿特定 ODE 轨迹逐步还原图像 |

训练时的“一步到位”加噪（不涉及多步迭代）确保了模型对连续噪声水平的泛化能力；推理时的固定步长序列则是为了高效、稳定地求解 ODE。

---

## 5. 总结

- **扩散模型推理 = 求解概率流 ODE**：采样器的本质是 ODE 数值求解器。
- **Euler 采样器**：一阶方法，简单稳定，但步数需求高。
- **DPM-Solver++(2M)**：通过变量替换、指数积分和历史信息二阶修正，实现大步长下的高精度采样。
- **`sigma` 的双重身份**：训练时为连续随机变量，推理时为固定离散序列。

掌握这些核心概念后，再去阅读完整的 SD3.5 代码（如 `BaseModel`、`MMDiTX`、VAE 编解码等），你将能迅速抓住主干逻辑，理解每一行代码背后的数学动机。

---

*本文基于 Stable Diffusion 3.5 公开代码及 Diffusers 库的通用设计撰写，适用于大多数基于 Rectified Flow 的扩散模型。*