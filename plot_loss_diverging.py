# -*- coding: utf-8 -*-
"""
《现实训练的损失在持续发散》
模拟大模型训练失败的 loss 曲线格式：
  - x 轴 = 年龄（4~80 岁），y 轴 = 错误（对数刻度）
  - 高频噪声、梯度尖峰、先「看似收敛」后持续发散、最终 NaN 崩溃
  - 深夜示波器配色（与 GIF 系列一致），年龄 18 处有淡淡虚线（诗中人生中点）
输出：source/images/loss-diverging.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap

# ---------- 中文字体 ----------
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False

# ---------- 配色 ----------
BG = "#0a0e1a"
GRID = "#2b3650"
AXIS0 = "#1d2740"
TICK = "#9aa4b2"
C_EARLY = "#cfd6e0"      # 早期：灰白（看似收敛）
C_LATE = "#ff4d4d"       # 晚期：赤红（发散）
C_SPIKE = "#ffb454"      # 梯度尖峰：橙

rng = np.random.default_rng(42)

# ---------- 数据：loss(年龄) ----------
age = np.linspace(4.0, 80.0, 1400)

# 基础曲线：快速下降 -> 平台微升 -> 指数发散
base = np.where(age < 18.0, 8.0 * np.exp(-0.18 * (age - 4.0)),
        np.where(age < 32.0, 0.5 + 0.015 * (age - 18.0),
                 0.62 * np.exp(0.10 * (age - 32.0))))

# 乘性噪声：噪声幅度随年龄增大（不稳定加剧）
sigma = np.where(age < 18.0, 0.12, np.where(age < 32.0, 0.18, 0.35 + 0.02 * (age - 32.0)))
loss = base * np.exp(sigma * rng.standard_normal(age.size))

# 梯度尖峰（只出现在发散区）
spike_mask = (age > 34.0) & (rng.random(age.size) < 0.045)
loss[spike_mask] *= rng.uniform(3.0, 40.0, spike_mask.sum())

# NaN 崩溃：78.5 岁后训练中断
crash = 78.5
loss[age > crash] = np.nan

# ---------- 绘图 ----------
fig, ax = plt.subplots(figsize=(12.0, 5.6), facecolor=BG)
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

valid = ~np.isnan(loss)
ag, lg = age[valid], loss[valid]
sm = spike_mask[valid]

# 辉光 + 渐变主线的双层曲线（灰白 -> 橙 -> 赤红）
pts = np.column_stack([ag, lg]).reshape(-1, 1, 2)
segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
cmap = LinearSegmentedColormap.from_list("loss", [C_EARLY, "#ff8c66", C_LATE])
norm = (ag[:-1] - ag.min()) / (ag.max() - ag.min())

lc_glow = LineCollection(segs, cmap=cmap, lw=6.0, alpha=0.22, zorder=3)
lc_glow.set_array(norm)
lc_main = LineCollection(segs, cmap=cmap, lw=2.2, zorder=4)
lc_main.set_array(norm)
ax.add_collection(lc_glow)
ax.add_collection(lc_main)

# 梯度尖峰
ax.scatter(ag[sm], lg[sm], s=34, color=C_SPIKE, alpha=0.30, zorder=6)
ax.scatter(ag[sm], lg[sm], s=11, color=C_SPIKE, zorder=7)

# NaN 崩溃：曲线断开处 + 红色爆炸标记
last = valid.sum() - 1
xl, yl = ag[last], lg[last]
ax.scatter([xl], [yl], s=260, color=C_LATE, alpha=0.15, zorder=5)
ax.scatter([xl], [yl], s=90, marker="x", color=C_LATE, lw=2.4, zorder=6)

# 年龄 18（人生主观中点）淡淡虚线
ax.axvline(18.0, color="#4a5568", ls="--", lw=1.0, alpha=0.9, zorder=2)

# ---------- 坐标轴 ----------
ax.set_yscale("log")
ax.set_xlim(2.0, 82.0)
ymax = np.nanmax(loss) * 2.5
ax.set_ylim(0.05, ymax)
ax.set_xticks([4, 18, 32, 50, 65, 80])
ax.set_xlabel("年龄（岁）", fontsize=13, color=TICK)
ax.set_ylabel("错误", fontsize=13, color=TICK)
ax.tick_params(colors=TICK, labelsize=11, length=4, width=0.8)
for s in ax.spines.values():
    s.set_visible(False)
ax.grid(True, color=GRID, alpha=0.45, lw=0.6, ls="-")

fig.tight_layout()
out = r"source\images\loss-diverging.png"
fig.savefig(out, dpi=150, facecolor=BG, bbox_inches="tight")
print("saved:", out)
print("loss min=%.3f max=%.1f, spike pts=%d, NaN from age %.1f"
      % (np.nanmin(loss), np.nanmax(loss), spike_mask.sum(), crash))
