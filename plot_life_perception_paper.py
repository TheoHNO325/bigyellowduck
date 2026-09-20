# -*- coding: utf-8 -*-
"""
无文字 · 论文格式版本：比例感知模型（对数感知）可视化
- 无标题、无中文、无注释文字；仅保留英文轴标签与面板编号 (a)(b)
- Times New Roman 衬线字体，黑白灰配色，300 DPI
- 输出：source/images/life-perception-model-paper.png / .pdf
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ---------- 论文风格全局设置 ----------
plt.rcParams["font.family"] = "serif"
plt.rcParams["font.serif"] = ["Times New Roman", "DejaVu Serif"]
plt.rcParams["mathtext.fontset"] = "dejavuserif"
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 300

# ---------- 模型参数 ----------
T0 = 4.0          # 记忆起点（岁）
T1 = 80.0         # 寿命上限（岁）
A_MID = 4.0 * np.sqrt(T1 / 4.0)   # 主观中点 ≈ 17.8885 岁

# ---------- 配色（灰度友好） ----------
CURVE = "#111111"   # 曲线
FILL_A = "#c9c9c9"  # 前半段（4 ~ 17.9 岁）
FILL_B = "#7f7f7f"  # 后半段（17.9 ~ 80 岁）
LINE_DASH = "#444444"
LINE_DOT = "#999999"

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.0, 2.75))

# =========================================================
# (a) 一年在生命中的占比  1/x
# =========================================================
x = np.linspace(1, T1, 3000)
y = 1.0 / x

ax1.plot(x, y, color=CURVE, lw=1.2, zorder=5)
ax1.fill_between(x, 0, y,
                 where=(x >= T0) & (x <= A_MID),
                 color=FILL_A, lw=0, zorder=2)
ax1.fill_between(x, 0, y,
                 where=(x >= A_MID) & (x <= T1),
                 color=FILL_B, lw=0, zorder=2)
ax1.axvline(T0, color=LINE_DASH, ls=":", lw=0.8, zorder=4)
ax1.axvline(A_MID, color=LINE_DASH, ls="--", lw=0.9, zorder=4)

ax1.set_xlim(0, T1 + 5)
ax1.set_ylim(0, 1.05)
ax1.set_xlabel("Age (years)", fontsize=9)
ax1.set_ylabel("Fraction of life span per year", fontsize=9)
ax1.tick_params(labelsize=8, length=3, width=0.6)

# =========================================================
# (b) 累积主观时间  S(t) = ln(t/4) / ln(20)
# =========================================================
xt = np.linspace(T0, T1, 3000)
St = np.log(xt / T0) / np.log(T1 / T0)   # 归一化到 0~1

ax2.plot(xt, St, color=CURVE, lw=1.2, zorder=5)
ax2.fill_between(xt, 0, St,
                 where=xt <= A_MID,
                 color=FILL_A, lw=0, zorder=2)
ax2.fill_between(xt, 0, St,
                 where=xt >= A_MID,
                 color=FILL_B, lw=0, zorder=2)
ax2.axvline(A_MID, color=LINE_DASH, ls="--", lw=0.9, zorder=4)
ax2.axhline(0.5, color=LINE_DOT, ls=":", lw=0.8, zorder=4)

ax2.set_xlim(T0 - 2, T1 + 2)
ax2.set_ylim(0, 1.05)
ax2.set_xlabel("Age (years)", fontsize=9)
ax2.set_ylabel("Cumulative subjective time (normalized)", fontsize=9)
ax2.tick_params(labelsize=8, length=3, width=0.6)

# ---------- 统一风格：去掉上/右边框，面板编号 ----------
for ax, tag in ((ax1, "(a)"), (ax2, "(b)")):
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("bottom", "left"):
        ax.spines[s].set_linewidth(0.8)
    ax.text(0.02, 0.96, tag, transform=ax.transAxes,
            fontsize=11, fontweight="bold", va="top", ha="left")

fig.tight_layout(w_pad=2.5)

out_png = r"source\images\life-perception-model-paper.png"
out_pdf = r"source\images\life-perception-model-paper.pdf"
fig.savefig(out_png, dpi=300, bbox_inches="tight", facecolor="white")
fig.savefig(out_pdf, bbox_inches="tight", facecolor="white")
print("saved:", out_png)
print("saved:", out_pdf)
print(f"A_MID = {A_MID:.4f} 岁")
