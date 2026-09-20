# -*- coding: utf-8 -*-
"""
《现实训练的损失在持续发散》——动态版
一个发光点从轨迹起点（4 岁）出发，沿 loss 曲线移动并留下持久轨迹；
18 岁处短暂停顿后速度陡然变快（约 8 倍），最终抵达 NaN 崩溃点（78.5 岁）。
- 数据与静态图 plot_loss_diverging.py 完全一致（同一随机种子 42）
- 深夜示波器配色、对数 y 轴、年龄 18 处虚线
输出：source/images/loss-diverging.gif
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.collections import LineCollection
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.patches import Circle

# ---------- 中文字体 ----------
plt.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False

# ---------- 配色（与静态图一致） ----------
BG = "#0a0e1a"
GRID = "#2b3650"
TICK = "#9aa4b2"
C_EARLY = "#cfd6e0"
C_LATE = "#ff4d4d"
C_SPIKE = "#ffb454"
DOT = "#f7f9ff"

# ---------- 数据：与静态图同种子，曲线完全一致 ----------
rng = np.random.default_rng(42)
age = np.linspace(4.0, 80.0, 1400)
base = np.where(age < 18.0, 8.0 * np.exp(-0.18 * (age - 4.0)),
        np.where(age < 32.0, 0.5 + 0.015 * (age - 18.0),
                 0.62 * np.exp(0.10 * (age - 32.0))))
sigma = np.where(age < 18.0, 0.12, np.where(age < 32.0, 0.18,
                                            0.35 + 0.02 * (age - 32.0)))
loss = base * np.exp(sigma * rng.standard_normal(age.size))
spike_mask = (age > 34.0) & (rng.random(age.size) < 0.045)
loss[spike_mask] *= rng.uniform(3.0, 40.0, spike_mask.sum())
crash = 78.5
loss[age > crash] = np.nan

valid = ~np.isnan(loss)
ag, lg = age[valid], loss[valid]
sm = spike_mask[valid]
NORM0, NORM1 = 4.0, crash

cmap = LinearSegmentedColormap.from_list("loss", [C_EARLY, "#ff8c66", C_LATE])

# ---------- 帧规划：慢（4→18）→ 停顿 → 陡然变快（18→78.5） ----------
NF = 109
N1 = 60                 # 慢段 60 帧：4→18 岁（约 0.23 岁/帧，较之前快 1.5 倍）
PAUSE = 3               # 18 岁处停顿强调
TFAST = NF - 1 - N1 - PAUSE   # 快段 45 帧：18→78.5 岁（约 1.34 岁/帧，保持陡峭）


def age_at(i):
    if i < N1:
        return 4.0 + (18.0 - 4.0) * (i / N1)
    if i < N1 + PAUSE:
        return 18.0
    return 18.0 + (crash - 18.0) * ((i - N1 - PAUSE) / TFAST)


def setup_ax(ax):
    ax.set_facecolor(BG)
    ax.set_yscale("log")
    ax.set_xlim(2.0, 82.0)
    ax.set_ylim(0.05, np.nanmax(loss) * 2.5)
    ax.set_xticks([4, 18, 32, 50, 65, 80])
    ax.set_xlabel("年龄（岁）", fontsize=13, color=TICK)
    ax.set_ylabel("错误", fontsize=13, color=TICK)
    ax.tick_params(colors=TICK, labelsize=11, length=4, width=0.8)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(True, color=GRID, alpha=0.45, lw=0.6, ls="-")
    ax.axvline(18.0, color="#4a5568", ls="--", lw=1.0, alpha=0.9, zorder=2)


def add_trail(ax, a_now):
    """已走过的轨迹（持久保留），颜色随错误增大由灰白渐变赤红"""
    m = ag <= a_now
    if m.sum() < 2:
        return
    pts = np.column_stack([ag[m], lg[m]]).reshape(-1, 1, 2)
    segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
    norm = (ag[m][:-1] - NORM0) / (NORM1 - NORM0)
    g = LineCollection(segs, cmap=cmap, lw=6.0, alpha=0.22, zorder=3)
    g.set_array(norm)
    c = LineCollection(segs, cmap=cmap, lw=2.2, zorder=4)
    c.set_array(norm)
    ax.add_collection(g)
    ax.add_collection(c)
    # 已路过的尖峰
    if sm[m].sum():
        ax.scatter(ag[m][sm[m]], lg[m][sm[m]], s=30, color=C_SPIKE,
                   alpha=0.30, zorder=6)
        ax.scatter(ag[m][sm[m]], lg[m][sm[m]], s=10, color=C_SPIKE, zorder=7)


def add_dot(ax, a_now):
    """发光点：辉光颜色跟随所在曲线的颜色，白热芯"""
    y_now = float(np.interp(a_now, ag, lg))
    col = cmap((a_now - NORM0) / (NORM1 - NORM0))
    ax.scatter([a_now], [y_now], s=150, color=col, alpha=0.30, zorder=7)
    ax.scatter([a_now], [y_now], s=34, color=col, alpha=0.85, zorder=8)
    ax.scatter([a_now], [y_now], s=10, color=DOT, zorder=9)
    return y_now


def add_crash(ax, a_now):
    """抵达 NaN 崩溃点的红色爆炸标记"""
    if a_now >= crash - 0.02:
        xl, yl = ag[-1], lg[-1]
        ax.scatter([xl], [yl], s=260, color=C_LATE, alpha=0.15, zorder=5)
        ax.scatter([xl], [yl], s=90, marker="x", color=C_LATE, lw=2.4, zorder=6)


def add_accel_ring(ax, i, y18):
    """18 岁陡然加速的瞬间：扩散光圈"""
    t = i - N1
    if 0 <= t <= 8:
        f = t / 8.0
        r = 0.6 + 3.0 * f
        ax.add_patch(Circle((18.0, y18), r, fill=False, ec="#ffd24a", lw=2.0,
                            alpha=0.75 * (1 - f), zorder=6))
        ax.add_patch(Circle((18.0, y18), r, fill=True, fc="#ffd24a",
                            alpha=0.08 * (1 - f), zorder=5))


def update(i):
    ax.clear()
    setup_ax(ax)
    a_now = age_at(i)
    add_trail(ax, a_now)
    y18 = float(np.interp(18.0, ag, lg))
    add_accel_ring(ax, i, y18)
    add_dot(ax, a_now)
    add_crash(ax, a_now)
    return []


fig = plt.figure(figsize=(12.0, 5.6), facecolor=BG)
ax = fig.add_axes([0.06, 0.10, 0.90, 0.82])

anim = FuncAnimation(fig, update, frames=NF, interval=66, blit=False)
out = r"source\images\loss-diverging.gif"
anim.save(out, writer=PillowWriter(fps=15), dpi=110)
plt.close(fig)
print("saved:", out)
print("frames:", NF, "| slow 4->18 (%.2f岁/帧), fast 18->%.1f (%.2f岁/帧, x%.1f)"
      % (14.0 / N1, crash, (crash - 18.0) / TFAST, ((crash - 18.0) / TFAST) / (14.0 / N1)))
