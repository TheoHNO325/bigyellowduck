# -*- coding: utf-8 -*-
"""
ReLU / GLU / SwiGLU 激活函数对比图（单变量可视化）
- 单变量形式（恒等投影、零偏置、β=1 假设）：
    ReLU(x)  = max(0, x)
    GLU(x)   = x * σ(x)
    SwiGLU(x)= Swish(x) * x = x^2 * σ(x)
- 图例按用户要求标注：ReLU（普通）、GLU（中等）、SwiGLU（困难）
- 风格与博客其余图表一致（微软雅黑、哑光配色、坐标轴过原点）
输出：source/images/activation-comparison.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ---------- 中文字体 ----------
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 150

# ---------- 配色（与博客其余图表一致） ----------
C_RELU = "#e07a5f"    # 珊瑚红（同「前半生」）
C_GLU = "#3d5a80"     # 蓝（同「后半生」）
C_SWIGLU = "#293241"  # 深灰蓝（同曲线主色）

# ---------- 函数（x 轴中心平移到 x=12：u = x - 12） ----------
CENTER = 12.0
HALF = 8.0
x = np.linspace(CENTER - HALF, CENTER + HALF, 3000)
u = x - CENTER

def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))

relu = np.maximum(0.0, u)
glu = u * sigmoid(u)
swiglu = u * u * sigmoid(u)

fig, ax = plt.subplots(figsize=(8.0, 4.8))

ax.plot(x, relu, color=C_RELU, lw=2.2, ls="-",  label="普通", zorder=5)
ax.plot(x, glu, color=C_GLU, lw=2.2, ls="--", label="中等", zorder=5)
ax.plot(x, swiglu, color=C_SWIGLU, lw=2.2, ls="-.", label="困难", zorder=5)

# ---------- 坐标轴（纵轴过 x=12，即新中心） ----------
ax.axhline(0, color="#333333", lw=0.9, zorder=1)
ax.axvline(CENTER, color="#333333", lw=0.9, zorder=1)
for s in ("top", "right", "left", "bottom"):
    ax.spines[s].set_visible(False)

ax.set_xlim(CENTER - HALF, CENTER + HALF)
ax.set_ylim(-0.6, 8.0)
ax.set_xticks(np.arange(CENTER - HALF, CENTER + HALF + 1, 2))
ax.set_yticks(np.arange(0, 9, 2))
ax.tick_params(labelsize=10, length=4, width=0.8, colors="#333333")

ax.set_xlabel("x", fontsize=12, labelpad=6)
ax.set_ylabel("f(x)", fontsize=12, labelpad=6)

# ---------- 图例 ----------
ax.legend(loc="upper left", fontsize=11, frameon=True, framealpha=0.95,
          edgecolor="#cccccc", fancybox=False)

fig.tight_layout()

out = r"source\images\activation-comparison.png"
fig.savefig(out, bbox_inches="tight", facecolor="white")
print("saved:", out)
# 数值校验
print("GLU 最小值 ≈ %.3f（x ≈ %.2f）" % (glu.min(), x[np.argmin(glu)]))
print("SwiGLU(x=8) = %.2f（二次增长，超出图幅）" % swiglu[-1])
