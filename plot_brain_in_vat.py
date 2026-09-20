# -*- coding: utf-8 -*-
"""
《缸中之脑》——暗夜实验室场景渲染（延续深夜渲染风）
- 玻璃缸 + 发光液体 + 缸中机械感的脑（辉光 + 卷积纹）
- 供液管、数据线、漂浮小屏幕（金色 SOTA + 损失曲线）
- 气泡、底座、铭牌「缸中之脑 · BRAIN IN A VAT」
输出：source/images/brain-in-vat.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Ellipse, Polygon, Circle, FancyBboxPatch

plt.rcParams["font.family"] = ["Microsoft YaHei", "Consolas", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False

fig = plt.figure(figsize=(11.0, 8.5), facecolor="#05070d")
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis("off")

# ---------- 背景：夜空渐变 + 暗角 ----------
bg = np.zeros((64, 64, 4), dtype=float)
for i in range(64):
    t = i / 63.0
    c = (0.02 + 0.05 * t, 0.03 + 0.06 * t, 0.07 + 0.09 * t, 1.0)
    bg[i, :] = c
ax.imshow(bg, extent=[0, 1, 0, 1], origin="lower", aspect="auto", zorder=0)
for _ in range(70):                      # 虚空中的暗星
    ax.scatter(np.random.uniform(0, 1), np.random.uniform(0.78, 0.98),
               s=np.random.uniform(1, 4), color="#8fa6c8", alpha=0.35, zorder=0.5)

LIQ = "#39c488"       # 培养液：幽绿
BRAIN = "#cfe8ff"     # 脑：机械冷白
CABLE = "#5ad6d0"     # 数据线：青

# ---------- 底座 ----------
ax.add_patch(Polygon([(0.29, 0.115), (0.71, 0.115), (0.66, 0.155), (0.34, 0.155)],
                     fc="#232a38", ec="#3a4356", lw=1.2, zorder=3))
ax.add_patch(Polygon([(0.29, 0.115), (0.71, 0.115), (0.71, 0.125), (0.29, 0.125)],
                     fc="#3a4356", ec="none", zorder=3))

# ---------- 玻璃缸 ----------
ax.add_patch(FancyBboxPatch((0.30, 0.155), 0.40, 0.56,
                            boxstyle="round,pad=0.006,rounding_size=0.02",
                            fc=(1, 1, 1, 0.05), ec=(0.67, 0.82, 1.0, 0.45),
                            lw=1.6, zorder=4))
# 玻璃高光（斜向反光）
ax.add_patch(Polygon([(0.315, 0.17), (0.335, 0.17), (0.325, 0.70), (0.315, 0.70)],
                     fc=(1, 1, 1, 0.045), ec="none", zorder=6))

# ---------- 培养液 ----------
ax.add_patch(FancyBboxPatch((0.315, 0.19), 0.37, 0.505,
                            boxstyle="round,pad=0.004,rounding_size=0.012",
                            fc=(0.22, 0.77, 0.53, 0.20),
                            ec="none", zorder=5))
ax.plot([0.315, 0.685], [0.695, 0.695], color=LIQ, lw=1.2, alpha=0.75,
        zorder=6)                        # 液面
# 液底渐深
ax.add_patch(FancyBboxPatch((0.315, 0.19), 0.37, 0.12,
                            boxstyle="round,pad=0.004,rounding_size=0.012",
                            fc=(0.04, 0.24, 0.16, 0.25), ec="none", zorder=5))

# ---------- 供液管（从缸顶伸入液面到脑） ----------
for x0 in (0.355, 0.645):
    ax.plot([x0, x0], [0.71, 0.45], color="#4a6a8a", lw=2.2, alpha=0.85,
            zorder=6)
    ax.add_patch(Circle((x0, 0.71), 0.008, fc="#6a8aaa", ec="none", zorder=7))

# ---------- 缸中之脑 ----------
def draw_brain(cx, cy):
    col = BRAIN
    # 辉光
    for r, al in ((1.5, 0.05), (1.25, 0.09), (1.08, 0.13)):
        ax.add_patch(Circle((cx, cy), 0.10 * r, fc=col, alpha=al, zorder=6))
    # 两半球
    for s in (-1, 1):
        ax.add_patch(Ellipse((cx + s * 0.042, cy), 0.088, 0.115,
                             fc="#0e131f", ec=col, lw=1.7, zorder=7))
    # 胼胝体（连接）
    ax.add_patch(Ellipse((cx, cy), 0.045, 0.05, fc="#0e131f", ec=col, lw=1.0,
                         alpha=0.85, zorder=7))
    # 卷积纹
    for k in range(5):
        yy = cy + (k - 2) * 0.021
        for s in (-1, 1):
            xc = cx + s * 0.042
            half = 0.040 * np.sqrt(max(0.02, 1 - ((yy - cy) / 0.052) ** 2))
            xs = np.linspace(xc - half, xc + half, 30)
            ys = yy + 0.004 * np.sin(26 * xs + (s + 1) * 2)
            ax.plot(xs, ys, color=col, lw=0.9, alpha=0.75, zorder=8)
    # 脑干
    ax.add_patch(Polygon([(cx - 0.016, cy - 0.052), (cx + 0.016, cy - 0.052),
                          (cx + 0.007, cy - 0.095), (cx - 0.007, cy - 0.095)],
                         fc="#0e131f", ec=col, lw=1.2, zorder=7))


draw_brain(0.50, 0.46)

# ---------- 数据线（脑 → 漂浮屏幕） ----------
for x0, y0 in ((0.478, 0.42), (0.522, 0.42)):
    xs = [x0, x0 + 0.03, x0 + 0.09, x0 + 0.12]
    ys = [y0, y0 + 0.06, y0 + 0.24, y0 + 0.33]
    ax.plot(xs, ys, color=CABLE, lw=1.4, alpha=0.85, zorder=7)
    ax.scatter([xs[-1]], [ys[-1]], s=14, color=CABLE, zorder=8)

# ---------- 漂浮小屏幕（SOTA + 损失曲线） ----------
mx, my, mw, mh = 0.575, 0.755, 0.175, 0.105
ax.add_patch(FancyBboxPatch((mx, my), mw, mh,
                            boxstyle="round,pad=0.004,rounding_size=0.008",
                            fc="#0a0f18", ec="#3a4356", lw=1.2, zorder=7))
ax.add_patch(FancyBboxPatch((mx + 0.008, my + 0.018), mw - 0.016, mh - 0.030,
                            boxstyle="round,pad=0.002", fc="#06120e",
                            ec=(0.22, 0.77, 0.53, 0.5), lw=0.8, zorder=8))
sx = np.linspace(0, 1, 40)
sy = 0.72 * np.exp(-3 * sx) + 0.20 + 0.05 * np.sin(9 * sx)
ax.plot(mx + 0.02 + sx * (mw - 0.045), my + 0.03 + sy * (mh - 0.055),
        color="#ffd24a", lw=1.4, zorder=9)
ax.text(mx + mw / 2, my + mh - 0.012, "SOTA", fontsize=8.5, color="#ffd24a",
        ha="center", va="center", zorder=9)
ax.plot([mx + 0.06, mx + 0.06], [my + 0.03, my + mh - 0.035], color="#ffd24a",
        lw=0.6, alpha=0.6, zorder=9)

# ---------- 气泡 ----------
rng = np.random.default_rng(5)
for _ in range(16):
    bx = rng.uniform(0.33, 0.67)
    by = rng.uniform(0.21, 0.66)
    r = rng.uniform(0.004, 0.011)
    ax.add_patch(Circle((bx, by), r, fill=False, ec=LIQ, lw=0.8,
                        alpha=0.55, zorder=6))

# ---------- 铭牌 ----------
ax.text(0.5, 0.055, "缸中之脑 · BRAIN IN A VAT", fontsize=10,
        color="#8fa6c8", ha="center", va="center", alpha=0.9, zorder=9)

fig.savefig(r"source\images\brain-in-vat.png", dpi=150, facecolor="#05070d")
print("saved: source/images/brain-in-vat.png")
