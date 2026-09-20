# -*- coding: utf-8 -*-
"""
为《青春期》一诗的三行配图（暗色示波器风格，无任何文字）：
  亢奋是正弦函数
  郁郁是余弦函数
  躁狂是某个极值点微小量的泰勒展开

三张 GIF：
  1) sine-wave-oscilloscope.gif    —— 不断波动向前的正弦（示波器扫描）
  2) cosine-wave-oscilloscope.gif  —— 不断波动向前的余弦（示波器扫描）
  3) waves-with-arrows.gif         —— 双波形 + 每个极值点及其小邻域的小箭头
                                      箭头方向 = 该点导数方向，随波形自由波动

意境配色：深夜底色；亢奋=赤红，郁郁=幽蓝；灰蓝示波器栅格。
x 轴窗口 = 19 个单位（呼应诗中「x 轴已经画了整整十九个单位」）。
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.collections import LineCollection
from matplotlib.patches import FancyArrowPatch

# ---------- 意境配色 ----------
BG = "#0a0e1a"        # 深夜底色
GRID = "#2b3650"      # 示波器栅格
AXIS0 = "#1d2740"     # 零轴
SIN_C = "#ff6b4d"     # 亢奋：赤红
SIN_GLOW = "#ff9e7a"
COS_C = "#4da6ff"     # 郁郁：幽蓝
COS_GLOW = "#9fd0ff"
HEAD = "#f7f9ff"      # 扫描头亮点

W = 19.0              # x 轴：整整十九个单位
NF = 46
x = np.linspace(0, W, 1600)
ph = np.linspace(0, 2 * np.pi, NF)       # 一个完整周期的相位推进（波动向前）
headx = np.linspace(0.5, W - 0.5, NF)    # 示波器扫描头


def base_rgb(hexc):
    h = hexc.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def segs(y):
    pts = np.column_stack([x, y])
    return np.stack([pts[:-1], pts[1:]], axis=1)


def trace_colors(y, hx, base, tau):
    """按与扫描头的（循环）距离做荧光余辉衰减"""
    mid = 0.5 * (x[:-1] + x[1:])
    d = (hx - mid) % W
    a = np.exp(-d / tau)
    a[a < 0.02] = 0.0
    rgb = np.array(base_rgb(base), dtype=float) / 255.0
    cols = np.zeros((len(mid), 4))
    cols[:, :3] = rgb
    cols[:, 3] = a
    return cols


def add_trace(ax, y, color, glow, hx, tau, head_h):
    """荧光迹线 + 扫描头（辉光下垫 + 亮芯 + 亮点）"""
    seg = segs(y)
    ax.add_collection(LineCollection(seg, colors=trace_colors(y, hx, glow, tau),
                                     lw=4.2, zorder=3))
    ax.add_collection(LineCollection(seg, colors=trace_colors(y, hx, color, tau),
                                     lw=1.7, zorder=4))
    ax.scatter([hx], [head_h], s=26, color=color, alpha=0.35, zorder=6)
    ax.scatter([hx], [head_h], s=9, color=HEAD, zorder=7)


def setup_ax(ax):
    ax.set_facecolor(BG)
    ax.set_xlim(0, W)
    ax.set_ylim(-1.65, 1.65)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(True, color=GRID, alpha=0.35, lw=0.6, ls="-")
    ax.axhline(0, color=AXIS0, lw=1.0, zorder=1)


def new_figure():
    fig = plt.figure(figsize=(11.0, 3.1), facecolor=BG)
    ax = fig.add_axes([0.02, 0.10, 0.96, 0.82])
    return fig, ax


def animate_single(kind):
    """GIF 1 / GIF 2：单波形示波器扫描"""
    fig, ax = new_figure()
    color = SIN_C if kind == "sin" else COS_C
    glow = SIN_GLOW if kind == "sin" else COS_GLOW
    func = np.sin if kind == "sin" else np.cos

    def update(i):
        ax.clear()
        setup_ax(ax)
        t, hx = ph[i], headx[i]
        y = func(x - t)
        add_trace(ax, y, color, glow, hx, 3.2, func(hx - t))
        return []

    anim = FuncAnimation(fig, update, frames=NF, interval=83, blit=False)
    anim.save(rf"source\images\{kind}-wave-oscilloscope.gif",
              writer=PillowWriter(fps=12), dpi=110)
    plt.close(fig)


def add_extremum_arrows(ax, t, is_sin, color):
    """在每个极值点及其小邻域（±2δ）加小箭头，方向 = 该点导数方向"""
    k = np.arange(-4, 8)
    ex = (t + np.pi / 2 + k * np.pi) if is_sin else (t + k * np.pi)
    ex = ex[(ex > 0.35) & (ex < W - 0.35)]
    if len(ex) == 0:
        return
    delta = 0.16
    offs = np.array([-2, -1, 0, 1, 2]) * delta
    xs = np.concatenate([ex + o for o in offs])
    if is_sin:
        ys = np.sin(xs - t)
        dv = np.cos(xs - t)                 # sin' = cos
    else:
        ys = np.cos(xs - t)
        dv = -np.sin(xs - t)                # cos' = -sin
    u = np.full_like(xs, 0.32)
    v = 0.32 * dv
    for xi, yi, ui, vi in zip(xs, ys, u, v):
        ax.add_patch(FancyArrowPatch((xi, yi), (xi + ui, yi + vi),
                                     arrowstyle="-|>", mutation_scale=8,
                                     lw=1.0, color=color, alpha=0.95,
                                     zorder=5, shrinkA=0, shrinkB=0))


def animate_both():
    """GIF 3：双波形 + 极值点邻域导数箭头"""
    fig, ax = new_figure()
    tau = 6.5   # 余辉更长，双波形与箭头更易读

    def update(i):
        ax.clear()
        setup_ax(ax)
        t, hx = ph[i], headx[i]
        ys = np.sin(x - t)
        yc = np.cos(x - t)
        # 暗影衬底：整条波形作弱参考
        ax.plot(x, ys, color=SIN_C, lw=0.8, alpha=0.13, zorder=2)
        ax.plot(x, yc, color=COS_C, lw=0.8, alpha=0.13, zorder=2)
        add_trace(ax, ys, SIN_C, SIN_GLOW, hx, tau, np.sin(hx - t))
        add_trace(ax, yc, COS_C, COS_GLOW, hx, tau, np.cos(hx - t))
        add_extremum_arrows(ax, t, is_sin=True, color=SIN_C)
        add_extremum_arrows(ax, t, is_sin=False, color=COS_C)
        return []

    anim = FuncAnimation(fig, update, frames=NF, interval=83, blit=False)
    anim.save(r"source\images\waves-with-arrows.gif",
              writer=PillowWriter(fps=12), dpi=110)
    plt.close(fig)


if __name__ == "__main__":
    animate_single("sin")
    print("saved: sine-wave-oscilloscope.gif")
    animate_single("cos")
    print("saved: cosine-wave-oscilloscope.gif")
    animate_both()
    print("saved: waves-with-arrows.gif")
