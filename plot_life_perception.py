# -*- coding: utf-8 -*-
"""
比例感知模型（对数感知）可视化
模型：某段时间的主观长度 ∝ 该段时间占当时生命总长的比例
    -> 主观时间增量 dS = (1/x) dx，即 S(t) = ∫ 1/x dx = ln(t)
    从 4 岁（记忆起点）到 80 岁，主观中点 a 满足：
        ∫₄ᵃ 1/x dx = ½ ∫₄⁸⁰ 1/x dx  =>  a = 4·√20 ≈ 17.89 岁
输出：source/images/life-perception-model.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

# ---------- 中文字体 ----------
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 150

# ---------- 模型参数 ----------
T0 = 4.0      # 记忆起点（岁）
T1 = 80.0     # 寿命上限（岁）
A_MID = 4.0 * np.sqrt(T1 / 4.0)   # 主观中点 ≈ 17.8885 岁
HALF = 0.5 * np.log(T1 / T0)      # 半段主观时间 = ln(20)/2

# ---------- 颜色 ----------
C_FIRST = "#e07a5f"   # 前半生（4~17.9 岁）
C_SECOND = "#3d5a80"  # 后半生（17.9~80 岁）
C_CURVE = "#293241"
C_ACCENT = "#ee6c4d"

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13.5, 6.2))

# =========================================================
# 左图：一年在生命中的占比  1/x
# =========================================================
x = np.linspace(1, T1, 2000)
y = 1.0 / x

ax1.plot(x, y, color=C_CURVE, lw=2.4, zorder=5)

# 4 岁之前：尚无记忆，淡化
x_pre = np.linspace(1, T0, 300)
ax1.plot(x_pre, 1.0 / x_pre, color=C_CURVE, lw=2.4, alpha=0.18, ls="--", zorder=4)

# 等主观时间的两段阴影（面积相等！）
ax1.fill_between(x, 0, 1.0 / x,
                 where=(x >= T0) & (x <= A_MID),
                 color=C_FIRST, alpha=0.28, zorder=2, label="4~17.9 岁（前半段）")
ax1.fill_between(x, 0, 1.0 / x,
                 where=(x >= A_MID) & (x <= T1),
                 color=C_SECOND, alpha=0.28, zorder=2, label="17.9~80 岁（后半段）")

# 关键年龄点（占比标注）
pts = [(1, "1岁\n100%"), (2, "2岁\n50%"), (5, "5岁\n20%"),
       (18, "18岁\n约5.5%"), (50, "50岁\n2%")]
for age, label in pts:
    ax1.scatter([age], [1.0 / age], s=46, color=C_ACCENT, zorder=6,
                edgecolor="white", linewidth=1.2)
    dy = 0.06 if age not in (18,) else 0.085
    ax1.annotate(label, xy=(age, 1.0 / age),
                 xytext=(age, 1.0 / age + dy),
                 ha="center", va="bottom", fontsize=9.5,
                 color="#3a3a3a",
                 arrowprops=dict(arrowstyle="-", color="#9aa0a6", lw=0.8))

# 4 岁与主观中点竖线
ax1.axvline(T0, color=C_FIRST, ls="--", lw=1.4, alpha=0.85)
ax1.axvline(A_MID, color=C_ACCENT, ls="--", lw=1.6, alpha=0.9)
ax1.text(T0 + 0.4, 0.95, "4岁\n记忆起点", color=C_FIRST, fontsize=9.5, va="top")
ax1.text(A_MID + 0.6, 0.88, f"≈{A_MID:.1f}岁\n主观中点", color=C_ACCENT,
         fontsize=9.5, va="top")

# 等面积说明（右下角）
ax1.text(0.98, 0.045,
         "两片阴影面积相等：\n"
         "∫(4→18) 1/x dx ＝ ∫(18→80) 1/x dx\n"
         "（4 岁到 18 岁 ≈ 18 岁到 80 岁）",
         transform=ax1.transAxes, fontsize=9.5, color="#444",
         ha="right", va="bottom",
         bbox=dict(boxstyle="round,pad=0.45", fc="#f6f4ef", ec="#d8d2c5", lw=1))

ax1.set_xlim(0.5, T1 + 6)
ax1.set_ylim(0, 1.02)
ax1.set_xlabel("年龄（岁）", fontsize=11)
ax1.set_ylabel("这一年占生命总长的比例", fontsize=11)
ax1.set_title("一年在生命中的「心理权重」越来越轻", fontsize=12.5, pad=10)
ax1.grid(alpha=0.25, ls=":", lw=0.7)
ax1.legend(loc="upper right", fontsize=9, framealpha=0.9)
for s in ("top", "right"):
    ax1.spines[s].set_visible(False)

# =========================================================
# 右图：累积主观时间  S(t) = ln(t/4) / ln(20)
# =========================================================
xt = np.linspace(T0, T1, 2000)
St = np.log(xt / T0) / np.log(T1 / T0)   # 归一化到 0~1

ax2.plot(xt, St, color=C_CURVE, lw=2.4, zorder=5)

# 两段等「高度」的阴影（主观时间各占一半）
ax2.fill_between(xt, 0, St,
                 where=xt <= A_MID, color=C_FIRST, alpha=0.30, zorder=2)
ax2.fill_between(xt, 0, St,
                 where=xt >= A_MID, color=C_SECOND, alpha=0.30, zorder=2)

# 中点参考线
ax2.axvline(A_MID, color=C_ACCENT, ls="--", lw=1.6, alpha=0.9)
ax2.axhline(0.5, color="#8a8f98", ls=":", lw=1.3)
ax2.scatter([A_MID], [0.5], s=60, color=C_ACCENT, zorder=6,
            edgecolor="white", linewidth=1.2)
ax2.annotate(f"主观中点 ≈ {A_MID:.1f} 岁\n到这里，主观人生已过半",
             xy=(A_MID, 0.5), xytext=(30, 0.68),
             fontsize=10, color="#c0392b",
             arrowprops=dict(arrowstyle="->", color=C_ACCENT, lw=1.4))

# 首尾标注
ax2.annotate("4岁：记忆起点", xy=(T0, 0), xytext=(6.5, -0.16),
             fontsize=9.5, color=C_FIRST,
             arrowprops=dict(arrowstyle="->", color=C_FIRST, lw=1.2))
ax2.annotate("80岁：终点", xy=(T1, 1.0), xytext=(62, 1.06),
             fontsize=9.5, color=C_SECOND,
             arrowprops=dict(arrowstyle="->", color=C_SECOND, lw=1.2))

ax2.text(0.03, 0.06,
         "橙红段与深蓝段上升的高度相同（各 50%）：\n"
         "4 岁到 17.9 岁 与 17.9 岁到 80 岁，主观时长相等。",
         transform=ax2.transAxes, fontsize=9.5, color="#444",
         bbox=dict(boxstyle="round,pad=0.45", fc="#f6f4ef", ec="#d8d2c5", lw=1))

ax2.set_xlim(T0 - 1, T1 + 2)
ax2.set_ylim(-0.25, 1.18)
ax2.set_xlabel("年龄（岁）", fontsize=11)
ax2.set_ylabel("累积主观时间（占一生的比例）", fontsize=11)
ax2.set_title("主观时间曲线：前半段陡峭，后半段平缓", fontsize=12.5, pad=10)
ax2.grid(alpha=0.25, ls=":", lw=0.7)
for s in ("top", "right"):
    ax2.spines[s].set_visible(False)

fig.suptitle("比例感知模型：为什么时间「越过越快」？　S(t) ＝ ∫(4→t) 1/x dx　主观中点 ≈ 18 岁",
             fontsize=14.5, y=0.99, fontweight="bold")
fig.tight_layout(rect=[0, 0, 1, 0.965])

out = r"source\images\life-perception-model.png"
fig.savefig(out, bbox_inches="tight", facecolor="white")
print("saved:", out)
print(f"A_MID = {A_MID:.4f} 岁,  half subjective time = {HALF:.4f}")
