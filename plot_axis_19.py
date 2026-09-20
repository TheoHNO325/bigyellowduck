# -*- coding: utf-8 -*-
"""
数轴图：x 延伸到 19，无文字，纯黑底
- 白色刻度梳 0..19；第 14 刻度起变红，19 处红色发光壁垒（到顶即止）
- 右端红色雾气弥漫 + 壁垒脉冲环 + 一处"断齿"刻度与壁垒裂缝（细微的崩坏感）
输出：source/images/axis-19.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

BG = "#000000"
WHITE = "#e8e8e8"
RED = "#ff2a2a"
RED_GLOW = "#ff4d3d"

fig = plt.figure(figsize=(12.5, 3.8), facecolor=BG)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis("off")

X0, X1 = 0.045, 0.885      # 数轴范围 0..19
Y_AXIS = 0.52
TICK_TOP = 0.82
RED_FROM = 14              # 第 14 个刻度起变红


def x_of(k):
    return X0 + (X1 - X0) * k / 19.0


# ---------- 刻度梳（白 -> 红） ----------
for k in range(20):
    x = x_of(k)
    col = RED if k >= RED_FROM else WHITE
    lw = 2.0 if k >= RED_FROM else 1.4
    y1 = TICK_TOP
    if k == 16:                      # 断齿：一截刻度缺失（细微崩坏）
        ax.plot([x, x], [Y_AXIS, Y_AXIS + 0.05], color=col, lw=lw)
        ax.plot([x, x], [Y_AXIS + 0.10, y1], color=col, lw=lw)
    else:
        ax.plot([x, x], [Y_AXIS, y1], color=col, lw=lw)

# ---------- 数轴主线（0..19，14 起变红） ----------
ax.plot([X0, x_of(14)], [Y_AXIS, Y_AXIS], color=WHITE, lw=2.2)
ax.plot([x_of(14), x_of(19)], [Y_AXIS, Y_AXIS], color=RED, lw=2.8)

# ---------- 19 处红色壁垒（多层辉光 + 裂缝） ----------
xb = x_of(19)
for w, al in ((6.0, 0.10), (3.5, 0.25), (1.8, 0.9)):
    ax.plot([xb, xb], [0.30, TICK_TOP + 0.02], color=RED, lw=w, alpha=al)
ax.plot([xb, xb], [0.30, 0.44], color="#000000", lw=2.2)   # 裂缝：中段断开
# 脉冲环
for r, al in ((0.05, 0.10), (0.09, 0.06), (0.13, 0.035)):
    ax.add_patch(Circle((xb, Y_AXIS), r, fill=False, ec=RED, lw=1.2, alpha=al))
# 画笔停驻点（画到 19 刚好停住）
ax.scatter([xb], [Y_AXIS], s=26, color=WHITE, zorder=6)
ax.scatter([xb], [Y_AXIS], s=52, color=RED, alpha=0.30, zorder=5)

# ---------- 右端红色雾气（线性渐变，向右渐浓） ----------
g = np.zeros((24, 96, 4), dtype=float)
for i in range(96):
    t = (i / 95.0) ** 1.6
    g[:, i] = (1.0, 0.22, 0.18, 0.30 * t)
ax.imshow(g, extent=[x_of(10), 1.0, 0.10, 0.95], origin="lower",
          aspect="auto", zorder=1, alpha=0.85)
# 雾气中的横向扫描线
for yy in (0.24, 0.40, 0.62, 0.80):
    ax.plot([x_of(13.2), 0.985], [yy, yy], color=RED, lw=0.7,
            alpha=0.22 + 0.10 * (yy % 0.3), zorder=2)

fig.savefig(r"source\images\axis-19.png", dpi=150, facecolor=BG)
print("saved: source/images/axis-19.png")
