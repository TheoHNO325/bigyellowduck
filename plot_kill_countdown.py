# -*- coding: utf-8 -*-
"""
《kill @ 19 → 0》终端恐怖倒计时动图
- 从 kill @ 19 到 kill @ 0，每次终端都回「Unknown Kernel Error」
- 节奏随数字递减越来越快（急迫），红色晕影如心跳脉动（恐怖）
- 提示符随倒计时逐渐损坏，错误行周期性故障抖动
- 结尾：kill @ 0 之后 —— 静态噪点 → 红闪 → 错误洪流 → 黑屏（进程死了）
输出：source/images/kill-countdown.gif
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation, PillowWriter
from matplotlib.patches import Rectangle

plt.rcParams["font.family"] = ["Consolas", "Microsoft YaHei"]
plt.rcParams["axes.unicode_minus"] = False

BG = "#0a0a0a"
TITLE = "#20202a"
ERR0 = (255, 90, 77)
ERR1 = (255, 20, 20)
C_CMD = "#e6e6e6"
C_DIM = "#8a8a8a"

FS = 11.5
FIGW, FIGH = 9.6, 5.9

# ---------- 倒计时调度：打字 → 回应 → 间隔（间隔随 n 减小而缩短） ----------
starts, resps = {}, {}
f = 0
for n in range(19, -1, -1):
    starts[n] = f
    f += 5                       # 打字 5 帧（2 字符/帧，"kill @ NN" 9 字符）
    resps[n] = f
    f += max(2, 8 - (19 - n) // 2)   # 间隔：8 → 2，越来越急
END_CD = f + 4                   # kill @ 0 回应后再定格 4 帧
END_STATIC = 6
END_FLASH = 4
END_FLOOD = 10
END_BLACK = 8
NF = END_CD + END_STATIC + END_FLASH + END_FLOOD + END_BLACK

# 开场三行（设定情境：绘图进程无法终止）
INTRO = [
    ("[01:37:00] 帧 342/342 已保存", C_DIM),
    ("[01:37:01] loss = 3.52e+02（发散中）", C_DIM),
    ("[01:37:02] WARNING: 绘图进程无法终止", "#ffb454"),
]

# 历史行：intro + 每命令两行（命令、错误）
def build_hist():
    hist = []
    for k, (t, c) in enumerate(INTRO):
        hist.append(dict(text=t, color=c, at=0, err=False, n=None, k=k))
    for n in range(19, -1, -1):
        hist.append(dict(text="root@kernel:~# kill @ %d" % n,
                         color=C_CMD, at=starts[n], err=False, n=n, k=n * 2 + 3))
        hist.append(dict(text="Unknown Kernel Error", color=None,
                         at=resps[n], err=True, n=n, k=n * 2 + 4))
    return hist


HIST = build_hist()


def prompt_for(n_min):
    if n_min > 8:
        return "root@kernel:~#"
    if n_min > 4:
        return "r00t@kerne1:~#"
    if n_min > 1:
        return "r@@t@ke??el:~#"
    return "???@???????:~#"


def err_color(n_min):
    t = (19 - n_min) / 19.0
    r = int(ERR0[0] + (ERR1[0] - ERR0[0]) * t)
    g = int(ERR0[1] + (ERR1[1] - ERR0[1]) * t)
    b = int(ERR0[2] + (ERR1[2] - ERR0[2]) * t)
    return "#%02x%02x%02x" % (r, g, b)


# ---------- 渲染 ----------
fig = plt.figure(figsize=(FIGW, FIGH), facecolor="#5a5a5a")
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis("off")

line_h = (FS * 1.42 / 72.0) / FIGH
char_w = (FS * 0.56 / 72.0) / FIGW
Y0 = 0.865


def draw_window(i):
    ax.add_patch(Rectangle((0.008, 0.006), 0.984, 0.988, fc=BG,
                           ec="#3a3a3a", lw=1.2))
    ax.add_patch(Rectangle((0.008, 0.925), 0.984, 0.069, fc=TITLE, ec="none"))
    ax.text(0.022, 0.956, "adolescence-kernel — 终端", fontsize=9.5,
            color="#e8e8e8", va="center", ha="left")
    ax.text(0.985, 0.956, "—  □  ×", fontsize=9, color="#c8c8c8",
            va="center", ha="right")
    ax.text(0.022, 0.924, "文件(F)  编辑(E)  查看(V)  终端(T)  帮助(H)",
            fontsize=8.5, color="#b0b0b0", va="center", ha="left")


def glitch_draw(ax, txt, x, y, col, seed, on):
    """故障抖动：横向偏移 + 红/青残影"""
    if not on:
        ax.text(x, y, txt, fontsize=FS, color=col, va="top", ha="left")
        return
    off = (np.sin(seed * 3.7) * 0.004 + 0.002)
    ax.text(x - 0.006 + off, y, txt, fontsize=FS, color="#00ffff",
            alpha=0.35, va="top", ha="left")
    ax.text(x + 0.006 + off, y, txt, fontsize=FS, color="#ff0000",
            alpha=0.35, va="top", ha="left")
    ax.text(x + off, y, txt, fontsize=FS, color=col, va="top", ha="left")


def vignette(i, n_min):
    """心跳脉动的红色晕影"""
    t = (19 - n_min) / 19.0
    beat = max(0.0, np.sin(2 * np.pi * i / 11.0)) ** 4
    a = 0.06 + 0.34 * t + 0.22 * beat
    a = min(0.9, a)
    for edge in ((0, 0, 1, 0.012), (0, 0.988, 1, 0.012),
                 (0, 0, 0.012, 1), (0.988, 0, 0.012, 1)):
        ax.add_patch(Rectangle((edge[0], edge[1]), edge[2], edge[3],
                               fc="#ff2020", alpha=a, ec="none"))


def update(i):
    ax.clear()

    if i >= END_CD + END_STATIC + END_FLASH + END_FLOOD:
        # 终局：黑屏 + 闪烁光标
        draw_window(i)
        if (i // 3) % 2 == 0:
            ax.text(0.024, 0.865, "???@???????:~#", fontsize=FS,
                    color=C_CMD, va="top", ha="left")
            ax.add_patch(Rectangle((0.024 + 14 * char_w, 0.865 - line_h * 0.05),
                                   char_w * 1.05, line_h * 0.8, fc="#d8d8d8"))
        return []

    draw_window(i)
    n_min = min(n for n in range(0, 20) if starts[n] <= i) if i < END_CD else 0
    prompt = prompt_for(n_min)
    ecol = err_color(n_min)

    # 可见历史行（最近 9 行）
    vis = [h for h in HIST if h["at"] <= i][-9:]
    for k, h in enumerate(vis):
        y = Y0 - k * line_h
        if h["err"]:
            col = ecol
            glitch = (h["n"] % 4 == 0) or (h["n"] <= 6)
            glitch_draw(ax, h["text"], 0.024, y, col, h["n"], glitch)
        else:
            ax.text(0.024, y, h["text"], fontsize=FS, color=h["color"],
                    va="top", ha="left")

    # 当前正在输入的命令（提示符 + 部分字符 + 块光标）
    typing = [n for n in range(19, -1, -1) if starts[n] <= i < resps[n]]
    if typing:
        n = typing[0]
        prog = i - starts[n]
        cmd = "kill @ %d" % n
        shown = cmd[:min(len(cmd), prog * 2)]
        y = Y0 - len(vis) * line_h
        ax.text(0.024, y, prompt + " " + shown, fontsize=FS, color=C_CMD,
                va="top", ha="left")
        cx = 0.024 + (len(prompt) + 1 + len(shown)) * char_w
        ax.add_patch(Rectangle((cx, y - line_h * 0.05), char_w * 1.05,
                               line_h * 0.8, fc="#e6e6e6", ec="none"))
    else:
        y = Y0 - len(vis) * line_h
        ax.text(0.024, y, prompt, fontsize=FS, color=C_CMD, va="top",
                ha="left")
        if (i // 3) % 2 == 0:
            cx = 0.024 + len(prompt) * char_w
            ax.add_patch(Rectangle((cx, y - line_h * 0.05), char_w * 1.05,
                                   line_h * 0.8, fc="#e6e6e6", ec="none"))

    # 红色晕影（心跳）
    if i < END_CD:
        vignette(i, n_min)

    # 结尾阶段
    j = i - END_CD
    if j < END_STATIC:                       # 静态噪点
        rng = np.random.default_rng(i)
        for _ in range(140):
            x = rng.uniform(0.02, 0.98)
            y = rng.uniform(0.03, 0.90)
            s = rng.uniform(0.004, 0.012)
            col = "#ff2020" if rng.random() < 0.5 else "#cccccc"
            ax.add_patch(Rectangle((x, y), s, s * 0.6, fc=col, alpha=0.5,
                                   ec="none"))
    elif j < END_STATIC + END_FLASH:         # 全屏红闪（逐帧增强）
        al = [0.15, 0.35, 0.50, 0.25][j - END_STATIC]
        ax.add_patch(Rectangle((0, 0), 1, 1, fc="#ff0000", alpha=al,
                               ec="none"))
    elif j < END_STATIC + END_FLASH + END_FLOOD:   # 错误洪流（逐帧滚动）
        k = j - END_STATIC - END_FLASH
        for m in range(18):
            idx = m + k * 3
            yy = 0.86 - idx * line_h * 0.9
            if yy < 0.02:
                continue
            ax.text(0.024 + (idx % 5) * 0.004, yy, "Unknown Kernel Error",
                    fontsize=FS, color=ecol, alpha=0.9 - 0.35 * (m / 18.0),
                    va="top", ha="left")
    return []


anim = FuncAnimation(fig, update, frames=NF, interval=66, blit=False)
out = r"source\images\kill-countdown.gif"
anim.save(out, writer=PillowWriter(fps=15), dpi=110)
plt.close(fig)
print("saved:", out)
print("frames:", NF, "| 倒计时 19->0 至帧 %d，结尾 28 帧" % END_CD)
