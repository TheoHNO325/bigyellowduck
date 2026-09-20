# -*- coding: utf-8 -*-
"""
《青春期》四段式 GIF（强度增强版 v3，无文字，轨迹持久保留）：
  段1：亢奋＝正弦 —— 赤红扫描头画出轨迹并保留
  段2：郁郁＝余弦 —— 在其上画出轨迹并保留
  段3：躁狂 —— 金色大箭头（白热芯）在极值点依次点亮：
        点亮瞬间爆闪光环 + 全屏金闪；点亮后呼吸与震颤
  段4：宫缩 —— 四重高频振荡叠加：渐渐同时出现于整个画面（非传播），
        幅度更大，按宫缩节律周期性涌起（升-持-降），波形颤抖+白热芯，
        整屏随涌起泛紫光，整条波形快速右移

v5 新增：
  - 延长轨迹出现后的展示时间：段3/段4 加长，两条轨迹完成后 ≥10s
输出：source/images/adolescence-waves-contraction.gif
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.patches import FancyArrowPatch, Circle, Rectangle

# ---------- 意境配色（暗调：余烬 / 暮灰蓝 / 病态暗金 / 干涸的血）----------
BG = "#000000"        # 纯黑背景
GRID = "#12161d"      # 栅格：几乎隐没的暗灰蓝（底噪感）
AXIS0 = "#0e1219"     # 零轴：近乎不可见
SIN_C = "#c24a3a"     # 亢奋：余烬赤（旧、暗）
SIN_GLOW = "#d96a52"
COS_C = "#47667f"     # 郁郁：暮灰蓝（暗、冷）
COS_GLOW = "#6488a3"
GOLD = "#b8902e"      # 躁狂：病态暗金（黄铜）
GOLD_HOT = "#e8cf8a"
CONT_C = "#4e1010"    # 宫缩：干涸的血（最暗）
CONT_GLOW = "#7a2020"
CONT_HOT = "#5e1515"
HEAD = "#d4d4d4"      # 柔和的白

W = 25.0
x = np.linspace(0, W, 1800)

# ---------- 四段式帧规划 ----------
S1, H1 = 40, 6
S2, H2 = 40, 6
S3 = 60            # 段3：金色箭头点亮（节奏放缓）
S4 = 330           # 段4：宫缩——全部轨迹同时出现并波动，≥20s
P1 = S1 + H1                       # 46
P2 = P1 + S2 + H2                  # 92
P3 = P2 + S3                       # 152
NF = P3 + S4                       # 482（≈32.1s @15fps）
# 两条轨迹完成（帧 92）后展示 390 帧 ≈ 26s；宫缩开始（帧 152）后 330 帧 = 22s；
# 全部元素出现（帧 174）后仍有 308 帧 ≈ 20.5s ≥ 20s

# ---------- 波形「生成后」的运动与振幅伸缩 ----------
WAVE_SPEED = 0.05                  # 每帧右移单位数
WAVE_M = 0.35                      # 上下振幅伸缩 ±35%
WAVE_TB = 30.0                     # 振幅呼吸周期（帧）

# ---------- 宫缩：四重高频振荡的叠加 ----------
CONT_K = (13.0, 21.0, 29.0, 37.0)
CONT_W = (0.55, 0.35, 0.28, 0.22)
CONT_PH = (0.0, 1.3, 2.7, 0.8)
CONT_SPEED = 0.10
CONT_FADE = 22
CONT_CYCLE = 26
CONT_AMP = 3.0                    # 最大振幅填满整屏（ylim ±3.0）
CONT_BREATH = 0.10                 # 周期伸缩幅度
CONT_TB = 24.0                     # 呼吸周期（帧）


def wave_state(i, done_at, phi=0.0):
    """振幅伸缩自绘制期即生效；右移在生成完成帧 done_at 之后生效"""
    A = 1.0 + WAVE_M * np.sin(2 * np.pi * i / WAVE_TB + phi)
    s = WAVE_SPEED * max(0, i - done_at)
    return A, s


def contraction(i):
    """返回 (振幅包络 amp, 波形 y, 涌起强度 surge, 淡入度 fade)"""
    j = i - P3
    if j < 0:
        return None
    fade = min(1.0, j / CONT_FADE)
    tc = j % CONT_CYCLE
    if tc < 10:
        surge = tc / 10.0
    elif tc < 18:
        surge = 1.0
    else:
        surge = max(0.0, 1.0 - (tc - 18) / 8.0)
    amp = CONT_AMP * fade * (0.45 + 0.55 * surge)
    sh = CONT_SPEED * j + 0.05 * np.sin(2.3 * j) * surge   # 阵痛颤抖
    y = np.zeros_like(x)
    for idx, (K, w, ph) in enumerate(zip(CONT_K, CONT_W, CONT_PH)):
        kb = K * (1 + CONT_BREATH * np.sin(2 * np.pi * j / CONT_TB + 0.7 * idx))
        y += w * np.sin(kb * (x - sh) + ph)
    y /= 1.4
    return amp, y, surge, fade


def prog(i, start, length):
    j = i - start
    return 0.0 if j <= 0 else (1.0 if j >= length else j / length)


def setup_ax(ax):
    ax.set_facecolor(BG)
    ax.set_xlim(0, W)
    ax.set_ylim(-3.0, 3.0)
    ax.set_aspect("equal")
    ax.set_xticks([])
    ax.set_yticks([])
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(True, color=GRID, alpha=0.35, lw=0.6, ls="-")
    ax.axhline(0, color=AXIS0, lw=1.0, zorder=1)


def draw_wave_partial(ax, yy, color, glow, dx):
    mask = x <= dx
    if mask.sum() < 2:
        return
    ax.plot(x[mask], yy[mask], color=glow, lw=4.5, alpha=0.45, zorder=3)
    ax.plot(x[mask], yy[mask], color=color, lw=1.8, zorder=4)


def draw_wave_full(ax, yy, color, glow):
    ax.plot(x, yy, color=glow, lw=4.5, alpha=0.45, zorder=3)
    ax.plot(x, yy, color=color, lw=1.8, zorder=4)


def head_dot(ax, dx, yy, color, radius=(26, 9)):
    if dx >= W:
        return
    idx = int(np.searchsorted(x, dx))
    ax.scatter([dx], [yy[idx]], s=radius[0], color=color, alpha=0.35, zorder=6)
    ax.scatter([dx], [yy[idx]], s=radius[1], color=HEAD, zorder=7)


def arrow_sets(is_sin, A, s):
    """当前帧的动态极值点、邻域箭头起点与导数方向（振幅 A 伸缩）"""
    m = np.arange(-14, 15)
    ex0 = (np.pi / 2 + m * np.pi) if is_sin else (m * np.pi)
    ex_dyn = s + ex0
    mask = (ex_dyn > 0.45) & (ex_dyn < W - 0.45)
    ex0, ex_dyn = ex0[mask], ex_dyn[mask]
    offs = np.array([-2, -1, 0, 1, 2]) * 0.16
    xs = np.concatenate([ex_dyn + o for o in offs])
    if is_sin:
        ys = A * np.sin(xs - s)
        dv = A * np.cos(xs - s)
        ye = A * np.sin(ex_dyn - s)
    else:
        ys = A * np.cos(xs - s)
        dv = -A * np.sin(xs - s)
        ye = A * np.cos(ex_dyn - s)
    return xs, ys, dv, ex0, ex_dyn, ye


def add_gold_arrows(ax, xs, ys, dv, front, i):
    """双层金色大箭头：辉光 + 金芯；点亮后呼吸与震颤"""
    u = np.full_like(xs, 0.75)
    v = 0.75 * dv
    for idx, (xi, yi, ui, vi) in enumerate(zip(xs, ys, u, v)):
        al = float(np.clip((front - xi + 1.2) / 1.2, 0.0, 1.0))
        if al <= 0.02:
            continue
        if al >= 1.0:
            breath = 0.86 + 0.14 * np.sin(2 * np.pi * i / 26 + xi * 1.7)
            vi = vi + 0.05 * np.sin(2.3 * i + 5.0 * idx)
            al = breath
        kw = dict(arrowstyle="-|>", mutation_scale=20, shrinkA=0, shrinkB=0)
        ax.add_patch(FancyArrowPatch((xi, yi), (xi + ui, yi + vi),
                                     lw=7.0, color=GOLD, alpha=al * 0.30,
                                     zorder=5, **kw))
        ax.add_patch(FancyArrowPatch((xi, yi), (xi + ui, yi + vi),
                                     lw=2.6, color=GOLD, alpha=al,
                                     zorder=6, **kw))


def add_flash_rings(ax, ex0, exd, ye, j3):
    """极值点点亮瞬间：爆闪光环扩散（按初始位置定点火帧，环心跟随动态极值）"""
    for x0, xd, y in zip(ex0, exd, ye):
        ign = int(np.ceil(x0 / W * S3))
        t = j3 - ign
        if 0 <= t <= 10:
            f = t / 10.0
            r = 0.3 + 0.8 * f
            ax.add_patch(Circle((xd, y), r, fill=False, ec=GOLD, lw=2.5,
                                alpha=0.8 * (1 - f), zorder=5))
            ax.add_patch(Circle((xd, y), r, fill=True, fc=GOLD,
                                alpha=0.10 * (1 - f), zorder=4))


def update(i):
    ax.clear()
    setup_ax(ax)

    p1 = prog(i, 0, S1)
    p2 = prog(i, P1, S2)
    p3 = prog(i, P2, S3)

    # ---- 正弦：轨迹绘制期即上下振幅伸缩；生成后右移 ----
    A_s, s_s = wave_state(i, P1)
    ys_s = A_s * np.sin(x - s_s)
    if i < S1:
        draw_wave_partial(ax, ys_s, SIN_C, SIN_GLOW, p1 * W)
        head_dot(ax, p1 * W, ys_s, SIN_C)
    else:
        draw_wave_full(ax, ys_s, SIN_C, SIN_GLOW)

    # ---- 余弦：同上（振幅反相呼吸）----
    A_c, s_c = wave_state(i, P2, phi=np.pi)
    yc_c = A_c * np.cos(x - s_c)
    if i < P1 + S2:
        draw_wave_partial(ax, yc_c, COS_C, COS_GLOW, p2 * W)
        head_dot(ax, p2 * W, yc_c, COS_C)
    else:
        draw_wave_full(ax, yc_c, COS_C, COS_GLOW)

    # ---- 躁狂：极值点金箭（跟随动态波形）----
    if p3 > 0:
        j3 = i - P2
        front = p3 * W
        A_s, s_s = wave_state(i, P1)
        A_c, s_c = wave_state(i, P2, phi=np.pi)
        xs_s, ys_s, dv_s, ex0_s, exd_s, ye_s = arrow_sets(True, A_s, s_s)
        xs_c, ys_c, dv_c, ex0_c, exd_c, ye_c = arrow_sets(False, A_c, s_c)
        add_gold_arrows(ax, xs_s, ys_s, dv_s, front, i)
        add_gold_arrows(ax, xs_c, ys_c, dv_c, front, i)
        add_flash_rings(ax, ex0_s, exd_s, ye_s, j3)
        add_flash_rings(ax, ex0_c, exd_c, ye_c, j3)
        ys_dyn = A_s * np.sin(x - s_s)
        head_dot(ax, front, ys_dyn, GOLD, radius=(40, 14))
        if 0 <= j3 < 6:
            al = 0.16 * (1 - j3 / 6.0)
            ax.add_patch(Rectangle((0, -3.0), W, 6.0, fc=GOLD, alpha=al,
                                   zorder=8))

    # ---- 宫缩：高频振荡叠加，幅度加大 + 周期伸缩 ----
    c = contraction(i)
    if c is not None:
        amp, y, surge, fade = c
        yy = y * amp                  # 幅度真正放大（峰值 ±3.0 填满整屏）
        ax.plot(x, yy, color=CONT_GLOW, lw=4.5, alpha=0.35, zorder=5)
        ax.plot(x, yy, color=CONT_C, lw=1.5, alpha=0.95, zorder=6)
        if surge > 0.01:
            ax.add_patch(Rectangle((0, -3.0), W, 6.0, fc=CONT_C,
                                   alpha=0.09 * surge * fade, zorder=8))
    return []


if __name__ == "__main__":
    fig = plt.figure(figsize=(14.5, 4.4), facecolor=BG)
    ax = fig.add_axes([0.02, 0.10, 0.96, 0.80])

    anim = FuncAnimation(fig, update, frames=NF, interval=66, blit=False)
    out = r"source\images\adolescence-waves-contraction.gif"
    anim.save(out, writer=PillowWriter(fps=15), dpi=110)
    plt.close(fig)
    print("saved:", out)
    print("frames:", NF, "| sin[0:%d] cos[%d:%d] arrows[%d:%d] contraction[%d:%d]"
          % (P1, P1, P2, P2, P3, P3, NF))
