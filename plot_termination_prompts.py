# -*- coding: utf-8 -*-
"""
《我只能轮询输入 kill [PID] 试图把画图的进程终止》素材图
渲染 4 张像素级真实的「进程终止提示」（Windows 控制台 / 对话框风格）：
  1) termination-drawing-crashed.png   —— 画图进程 KeyboardInterrupt 崩溃
  2) termination-kill-success.png      —— taskkill 终止成功
  3) termination-polling-kill.png      —— 轮询 taskkill（成功→找不到进程）
  4) termination-wer-dialog.png        —— Windows「python.exe 已停止工作」对话框
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch

# ---------- 字体：英文等宽 Consolas + 中文回退雅黑 ----------
plt.rcParams["font.family"] = ["Consolas", "Microsoft YaHei"]
plt.rcParams["axes.unicode_minus"] = False

C_DEF = "#cccccc"    # 普通文字
C_CMD = "#f2f2f2"    # 命令/提示符
C_ERR = "#ff5f56"    # 错误
C_OK = "#6bcf7f"     # 成功（素材中稍作高亮）

FS = 11.0


def render_console(fname, title, lines, figsize=(9.6, 5.9), cursor=True,
                   scrollbar=True):
    """渲染一个 cmd 控制台窗口"""
    figw, figh = figsize
    fig = plt.figure(figsize=figsize, facecolor="#5a5a5a")
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # 窗口主体（带边框与阴影）
    ax.add_patch(Rectangle((0.008, 0.006), 0.984, 0.988, fc="#1e1e1e",
                           ec="#3a3a3a", lw=1.2))
    # 标题栏
    ax.add_patch(Rectangle((0.008, 0.925), 0.984, 0.069, fc="#20202a",
                           ec="none"))
    ax.text(0.022, 0.956, title, fontsize=9.5, color="#e8e8e8",
            va="center", ha="left")
    ax.text(0.985, 0.956, "—  □  ×", fontsize=9, color="#c8c8c8",
            va="center", ha="right")
    # 菜单栏
    ax.text(0.022, 0.924, "文件(F)  编辑(E)  查看(V)  窗口(W)  帮助(H)",
            fontsize=8.5, color="#b0b0b0", va="center", ha="left")

    # 正文
    line_h = (FS * 1.42 / 72.0) / figh
    y0 = 0.898
    char_w = (FS * 0.56 / 72.0) / figw
    last_x = 0.024
    last_y = y0
    for k, (txt, col) in enumerate(lines):
        y = y0 - k * line_h
        ax.text(0.024, y, txt, fontsize=FS, color=col, va="top", ha="left")
        last_x = 0.024 + len(txt) * char_w
        last_y = y

    if cursor:
        ax.add_patch(Rectangle((last_x, last_y - line_h * 0.06),
                               char_w * 1.05, line_h * 0.82,
                               fc="#d8d8d8", ec="none"))
    if scrollbar:
        ax.add_patch(Rectangle((0.978, 0.086), 0.012, 0.833, fc="#2a2a2a",
                               ec="none"))
        ax.add_patch(Rectangle((0.978, 0.62), 0.012, 0.16, fc="#4a4a4a",
                               ec="none"))

    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


def render_wer_dialog(fname, figsize=(9.8, 6.4)):
    """渲染 Windows 7 风格「python.exe 已停止工作」对话框"""
    figw, figh = figsize
    fig = plt.figure(figsize=figsize, facecolor="#5c6a7a")   # 桌面灰蓝
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    # 对话框阴影 + 主体
    ax.add_patch(Rectangle((0.145, 0.05), 0.71, 0.86, fc="#000000",
                           alpha=0.35, ec="none"))
    ax.add_patch(Rectangle((0.135, 0.06), 0.71, 0.86, fc="#f0f0f0",
                           ec="#6e6e6e", lw=1.0))
    # 标题栏
    ax.add_patch(Rectangle((0.135, 0.885), 0.71, 0.035, fc="#0078d7",
                           ec="none"))
    ax.text(0.155, 0.9025, "python.exe 已停止工作", fontsize=10,
            color="white", va="center", ha="left")
    ax.text(0.828, 0.9025, "×", fontsize=9, color="white",
            va="center", ha="center")

    # 图标（红圈白叉）与标题
    ic = FancyBboxPatch((0.175, 0.755), 0.075, 0.075, boxstyle="circle",
                        fc="#e81123", ec="none", mutation_aspect=1)
    ax.add_patch(ic)
    ax.text(0.2125, 0.7925, "×", fontsize=15, color="white",
            va="center", ha="center")
    ax.text(0.29, 0.81, "python.exe 已停止工作", fontsize=15,
            color="#1a1a1a", va="center", ha="left", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.29, 0.768, "Windows 正在检查该问题的解决方案…", fontsize=10.5,
            color="#333333", va="center", ha="left", family=["Segoe UI", "Microsoft YaHei"])

    # 问题签名
    sig = [
        ("问题签名:", False),
        ("  问题事件名称:      APPCRASH", False),
        ("  应用程序名:        python.exe", False),
        ("  应用程序版本:      3.9.1", False),
        ("  应用程序时间戳:    5f70c19f", False),
        ("  故障模块名称:      ntdll.dll", False),
        ("  故障模块版本:      10.0.19041.3636", False),
        ("  故障模块时间戳:    62e6b8aa", False),
        ("  异常代码:          c0000005", False),
        ("  异常偏移:          000000000003a9c3", False),
        ("  OS 版本:           10.0.19045.2.0.0.768", False),
        ("  区域设置 ID:       2052", False),
        ("", False),
        ("阅读隐私声明:", False),
        ("  在 Internet 上阅读有关此问题的隐私声明:", False),
        ("  https://go.microsoft.com/fwlink/?linkid=50163&clcid=0x0804", True),
    ]
    fs = 9.5
    lh = (fs * 1.5 / 72.0) / figh
    y = 0.70
    for txt, link in sig:
        ax.text(0.175, y, txt, fontsize=fs,
                color=("#1a5fb4" if link else "#333333"),
                va="top", ha="left", family=["Segoe UI", "Microsoft YaHei"])
        y -= lh

    # 按钮
    for bx, label in ((0.585, "联机检查解决方案并关闭程序"),
                      (0.765, "关闭程序")):
        ax.add_patch(Rectangle((bx, 0.10), 0.068, 0.030, fc="#e8e8e8",
                               ec="#7a7a7a", lw=0.8))
        ax.text(bx + 0.034, 0.115, label, fontsize=9, color="#111111",
                va="center", ha="center", family=["Segoe UI", "Microsoft YaHei"])

    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


BANNER = [
    ("Microsoft Windows [版本 10.0.19045.4046]", C_DEF),
    ("(c) Microsoft Corporation。保留所有权利。", C_DEF),
    ("", C_DEF),
]

# 1) 画图进程 KeyboardInterrupt 崩溃
render_console(
    r"source\images\termination-drawing-crashed.png",
    "命令提示符",
    BANNER + [
        ("F:\\硝酸铜\\novel\\hexo-blog>python kill_demo_draw.py crash", C_CMD),
        ("[drawing] 帧   1/342  渲染中 ... loss=0.5130  lr=9.52e-05", C_DEF),
        ("[drawing] 帧   4/342  渲染中 ... loss=0.5520  lr=8.16e-05", C_DEF),
        ("[drawing] 帧   8/342  渲染中 ... loss=0.6040  lr=6.41e-05", C_DEF),
        ("[drawing] 帧  12/342  渲染中 ... loss=0.6560  lr=5.10e-05", C_DEF),
        ("[drawing] 帧  16/342  渲染中 ... loss=0.7080  lr=4.17e-05", C_DEF),
        ("[drawing] 正在保存帧 17/342 ...", C_DEF),
        ("Traceback (most recent call last):", C_DEF),
        ('  File "F:\\硝酸铜\\novel\\hexo-blog\\kill_demo_draw.py", line 53, in main', C_DEF),
        ("    raise KeyboardInterrupt", C_DEF),
        ("KeyboardInterrupt", C_ERR),
    ],
)

# 2) taskkill 终止成功
render_console(
    r"source\images\termination-kill-success.png",
    "命令提示符",
    BANNER + [
        ('F:\\硝酸铜\\novel\\hexo-blog>tasklist /fi "imagename eq python.exe"', C_CMD),
        ("", C_DEF),
        ("映像名称                       PID   会话名              会话#  内存使用", C_DEF),
        ("========================= ======== ================ ========= ============", C_DEF),
        ("python.exe                  12345 Console                   1   86,424 K", C_DEF),
        ("", C_DEF),
        ("F:\\硝酸铜\\novel\\hexo-blog>taskkill /PID 12345 /F", C_CMD),
        ("成功: 已终止 PID 12345 的进程 (PID: 12345)。", C_OK),
    ],
)

# 3) 轮询 kill（成功 → 找不到进程）—— 对应诗中的「轮询输入 kill [PID]」
render_console(
    r"source\images\termination-polling-kill.png",
    "命令提示符",
    [
        ("F:\\硝酸铜\\novel\\hexo-blog>taskkill /PID 12345 /F", C_CMD),
        ("成功: 已终止 PID 12345 的进程 (PID: 12345)。", C_OK),
        ("", C_DEF),
        ("F:\\硝酸铜\\novel\\hexo-blog>taskkill /PID 12345 /F", C_CMD),
        ('错误: 没有找到进程 "12345"。', C_ERR),
        ("", C_DEF),
        ("F:\\硝酸铜\\novel\\hexo-blog>taskkill /PID 12345 /F", C_CMD),
        ('错误: 没有找到进程 "12345"。', C_ERR),
        ("", C_DEF),
        ("F:\\硝酸铜\\novel\\hexo-blog>taskkill /PID 12345 /F", C_CMD),
        ('错误: 没有找到进程 "12345"。', C_ERR),
    ],
)

# 4) Windows「已停止工作」对话框
render_wer_dialog(r"source\images\termination-wer-dialog.png")
