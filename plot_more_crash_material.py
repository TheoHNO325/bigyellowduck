# -*- coding: utf-8 -*-
"""
《kill [PID]》素材图 · 第二辑：非终端风格的进程终止/崩溃提示
  1) crash-task-manager.png      —— Windows 任务管理器「结束任务」
  2) crash-jupyter-kernel.png    —— Jupyter 内核已死
  3) crash-exit-code-137.png     —— PyCharm: exit code 137 (SIGKILL)
  4) crash-bsod.png              —— Windows 蓝屏死机（诗意停止代码）
  5) crash-browser-aw-snap.png   —— Chrome「喔唷，崩溃啦！」
  6) crash-app-not-responding.png—— Win7 风格「python.exe 未响应」
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle, Polygon, FancyBboxPatch

plt.rcParams["font.family"] = ["Microsoft YaHei", "Segoe UI", "Consolas", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False


def new_fig(fname, figsize, face):
    fig = plt.figure(figsize=figsize, facecolor=face)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    return fig, ax


def chrome(ax, x, y, w, h, title=None, title_h=0.045, title_fc="#2b2b2b",
           body_fc="#f5f5f5"):
    """窗口外壳：阴影 + 标题栏 + 主体"""
    ax.add_patch(Rectangle((x + 0.004, y - 0.004), w, h, fc="#000000",
                           alpha=0.30, ec="none"))
    ax.add_patch(Rectangle((x, y), w, h, fc=body_fc, ec="#6e6e6e", lw=1.0))
    if title:
        ax.add_patch(Rectangle((x, y + h - title_h), w, title_h, fc=title_fc,
                               ec="none"))
        ax.text(x + 0.01, y + h - title_h / 2, title, fontsize=9.5,
                color="#e8e8e8", va="center", ha="left")
        ax.text(x + w - 0.012, y + h - title_h / 2, "—  □  ×", fontsize=9,
                color="#c8c8c8", va="center", ha="right")


# =====================================================================
# 1) 任务管理器「结束任务」
# =====================================================================
def task_manager(fname):
    fig, ax = new_fig(fname, (10.5, 6.6), "#4a4a4a")
    chrome(ax, 0.03, 0.03, 0.94, 0.94, title="任务管理器", title_h=0.045,
           title_fc="#252525", body_fc="#202020")

    # 标签页
    tabs = ["进程", "性能", "应用历史记录", "启动", "用户", "详细信息", "服务"]
    for i, t in enumerate(tabs):
        col = "#ffffff" if i == 0 else "#8f8f8f"
        ax.text(0.05 + i * 0.085, 0.945, t, fontsize=10, color=col,
                va="center", ha="left")
    ax.plot([0.05, 0.115], [0.928, 0.928], color="#0078d7", lw=2.5)

    # 工具栏：「结束任务」按钮（选中进程时）
    ax.add_patch(Rectangle((0.795, 0.898), 0.075, 0.026, fc="#404040",
                           ec="#5a5a5a", lw=0.8))
    ax.text(0.8325, 0.911, "结束任务", fontsize=9.5, color="#ff5f5f",
            va="center", ha="center")

    # 表格头
    cols = ["名称", "状态", "CPU", "内存", "磁盘", "网络"]
    xs = [0.05, 0.30, 0.52, 0.62, 0.80, 0.90]
    ax.add_patch(Rectangle((0.045, 0.885), 0.91, 0.015, fc="#2d2d2d",
                           ec="none"))
    for c, x0 in zip(cols, xs):
        ax.text(x0, 0.8925, c, fontsize=8.5, color="#9a9a9a",
                va="center", ha="left")

    rows = [
        ("微信 (32 位)", "正在运行", "0.1%", "412,3 MB", "0 MB/秒", "0 Mbps", False),
        ("Microsoft Edge", "正在运行", "2.4%", "1,268,9 MB", "0 MB/秒", "0 Mbps", False),
        ("python.exe", "正在运行", "12.5%", "86,424 K", "0 MB/秒", "0 Mbps", True),
        ("Code", "正在运行", "1.2%", "745,6 MB", "0 MB/秒", "0 Mbps", False),
        ("桌面窗口管理器", "正在运行", "0.4%", "121,8 MB", "0 MB/秒", "0 Mbps", False),
        ("Windows 资源管理器", "正在运行", "0.1%", "98,2 MB", "0 MB/秒", "0 Mbps", False),
        ("反恶意软件服务可执行文件", "正在运行", "1.8%", "231,5 MB", "0 MB/秒", "0 Mbps", False),
    ]
    rh = 0.030
    y = 0.862
    for r in rows:
        if r[6]:
            ax.add_patch(Rectangle((0.045, y), 0.91, rh, fc="#2b6cb0",
                                   ec="none"))
            ax.text(0.06, y + rh / 2, "×", fontsize=9, color="#1a1a1a",
                    va="center", ha="center")
        else:
            ax.text(0.06, y + rh / 2, "■", fontsize=8, color="#7a7a7a",
                    va="center", ha="center")
        ax.text(0.075, y + rh / 2, r[0], fontsize=9,
                color="#e0e0e0" if r[6] else "#c8c8c8", va="center", ha="left")
        for c, x0 in zip(r[1:], xs[1:]):
            ax.text(x0, y + rh / 2, c, fontsize=9, color="#c8c8c8",
                    va="center", ha="left")
        y -= rh + 0.002

    # 右键菜单（python.exe 上）
    mx, my, mw, mh = 0.30, 0.52, 0.16, 0.085
    ax.add_patch(Rectangle((mx, my), mw, mh, fc="#f2f2f2", ec="#8a8a8a",
                           lw=0.8))
    ax.add_patch(Rectangle((mx, my + mh - 0.042), mw, 0.042, fc="#e81123",
                           ec="none"))
    ax.text(mx + 0.012, my + mh - 0.021, "结束任务(E)", fontsize=9.5,
            color="white", va="center", ha="left")
    ax.text(mx + 0.012, my + 0.021, "展开(E)", fontsize=9.5, color="#333333",
            va="center", ha="left")
    ax.text(mx + 0.012, my + 0.002, "属性(R)", fontsize=9.5, color="#333333",
            va="center", ha="left")

    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


# =====================================================================
# 2) Jupyter 内核已死
# =====================================================================
def jupyter_kernel(fname):
    fig, ax = new_fig(fname, (10.5, 5.2), "#8a8a8a")
    chrome(ax, 0.02, 0.05, 0.96, 0.90, title="未命名1 - Jupyter Notebook",
           title_h=0.038, title_fc="#ffffff", body_fc="#ffffff")
    ax.text(0.985, 0.924, "—  □  ×", fontsize=9, color="#444444",
            va="center", ha="right")

    # 菜单栏
    for i, t in enumerate(["File", "Edit", "View", "Insert", "Cell",
                           "Kernel", "Widgets", "Help"]):
        ax.text(0.035 + i * 0.055, 0.878, t, fontsize=9.5, color="#333333",
                va="center", ha="left")
    # 工具图标行
    for i in range(14):
        ax.add_patch(Rectangle((0.035 + i * 0.028, 0.852), 0.018, 0.018,
                               fc="#e8e8e8", ec="#c0c0c0", lw=0.6))
    ax.plot([0.03, 0.40], [0.842, 0.842], color="#dddddd", lw=1.2)

    # 内核已死横幅
    ax.add_patch(Rectangle((0.03, 0.795), 0.94, 0.042, fc="#ffd5c7",
                           ec="#ff9d8f", lw=0.8))
    ax.add_patch(Polygon([(0.042, 0.822), (0.052, 0.806), (0.032, 0.806)],
                         fc="#b5472d", ec="none"))
    ax.text(0.042, 0.812, "!", fontsize=7.5, color="white", va="center",
            ha="center", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.062, 0.816, "内核已死，它可能已经崩溃。内核将自动重新启动。",
            fontsize=10, color="#b5472d", va="center", ha="left")

    # 单元格
    ax.add_patch(Rectangle((0.03, 0.68), 0.94, 0.10, fc="#f8f8f8",
                           ec="#dddddd", lw=0.8))
    ax.text(0.042, 0.748, "In [5]:", fontsize=9.5, color="#3333cc",
            va="center", ha="left", family=["Consolas", "Microsoft YaHei"])
    ax.text(0.11, 0.748, 'fig.savefig("adolescence-waves-contraction.gif")',
            fontsize=10, color="#222222", va="center", ha="left",
            family=["Consolas", "Microsoft YaHei"])
    ax.text(0.11, 0.712, 'plt.close(fig)', fontsize=10, color="#222222",
            va="center", ha="left", family=["Consolas", "Microsoft YaHei"])

    ax.add_patch(Rectangle((0.03, 0.55), 0.94, 0.11, fc="#f0f0f0",
                           ec="#dddddd", lw=0.8))
    ax.text(0.042, 0.618, "Out[5]:", fontsize=9.5, color="#cc0000",
            va="center", ha="left", family=["Consolas", "Microsoft YaHei"])
    ax.text(0.11, 0.618, "Kernel died while executing code in <ipython-input-5>",
            fontsize=10, color="#b5472d", va="center", ha="left",
            family=["Consolas", "Microsoft YaHei"])
    ax.text(0.11, 0.578, "The kernel for 未命名1.ipynb appears to have died.",
            fontsize=9.5, color="#666666", va="center", ha="left",
            family=["Consolas", "Microsoft YaHei"])

    # 底部内核状态
    ax.text(0.035, 0.075, "内核：", fontsize=9.5, color="#666666",
            va="center", ha="left")
    ax.text(0.075, 0.075, "Python 3 (ipykernel)", fontsize=9.5,
            color="#999999", va="center", ha="left",
            family=["Consolas", "Microsoft YaHei"])
    ax.text(0.175, 0.075, "（已停止）", fontsize=9.5, color="#b5472d",
            va="center", ha="left")

    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


# =====================================================================
# 3) PyCharm: exit code 137 (SIGKILL)
# =====================================================================
def pycharm_137(fname):
    fig, ax = new_fig(fname, (10.5, 4.6), "#4a4a4a")
    chrome(ax, 0.02, 0.04, 0.96, 0.92, title=None, body_fc="#2b2b2b")
    # 选项卡
    ax.add_patch(Rectangle((0.03, 0.925), 0.20, 0.035, fc="#3c3f41",
                           ec="none"))
    ax.add_patch(Polygon([(0.038, 0.950), (0.048, 0.940), (0.038, 0.930)],
                         fc="#8fe34b", ec="none"))
    ax.text(0.056, 0.9425, "Run  plot_adolescence_gif", fontsize=9.5,
            color="#8fe34b", va="center", ha="left",
            family=["Consolas", "Microsoft YaHei"])
    ax.text(0.24, 0.9425, "Python Console", fontsize=9, color="#999999",
            va="center", ha="left")

    lines = [
        (r'"F:\miniconda3\python.exe" F:\硝酸铜\novel\hexo-blog\plot_adolescence_gif.py', "#a9b7c6"),
        ("[drawing] 帧   1/342  渲染中 ... loss=0.5130  lr=9.52e-05", "#a9b7c6"),
        ("[drawing] 帧   8/342  渲染中 ... loss=0.6040  lr=6.41e-05", "#a9b7c6"),
        ("[drawing] 帧  16/342  渲染中 ... loss=0.7080  lr=4.17e-05", "#a9b7c6"),
        ("[drawing] 正在保存帧 17/342 ...", "#a9b7c6"),
        ("Traceback (most recent call last):", "#a9b7c6"),
        ('  File "F:\\硝酸铜\\novel\\hexo-blog\\plot_adolescence_gif.py", line 198, in update', "#a9b7c6"),
        ("    fig.savefig(......)", "#a9b7c6"),
        ("MemoryError: std::bad_alloc", "#e8bf6a"),
        ("", "#a9b7c6"),
        ("Process finished with exit code 137 (interrupted by signal 9: SIGKILL)", "#cc7832"),
    ]
    fs = 10
    lh = (fs * 1.45 / 72.0) / 4.6
    y = 0.90
    for txt, col in lines:
        ax.text(0.045, y, txt, fontsize=fs, color=col, va="top", ha="left",
                family=["Consolas", "Microsoft YaHei"])
        y -= lh

    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


# =====================================================================
# 4) 蓝屏死机 BSOD
# =====================================================================
def bsod(fname):
    fig, ax = new_fig(fname, (11.0, 6.2), "#106ebe")
    ax.text(0.06, 0.86, ":(", fontsize=58, color="white", va="center",
            ha="left", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.06, 0.66, "你的电脑遇到问题，需要重新启动。我们只收集某些错误信息，然后为你重新启动。",
            fontsize=15, color="white", va="center", ha="left",
            family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.06, 0.62, "（已完成 0%）", fontsize=13, color="white",
            va="center", ha="left", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.06, 0.40, "停止代码: LOSS_DIVERGENCE_FATAL_ERROR",
            fontsize=13, color="white", va="center", ha="left",
            family=["Consolas", "Segoe UI", "Microsoft YaHei"])
    ax.text(0.06, 0.36, "绘图进程已终止：loss 持续发散，无法收敛。",
            fontsize=12, color="#cfe3ff", va="center", ha="left",
            family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.06, 0.10, "如需了解详细信息，可以稍后在线搜索此错误: LOSS_DIVERGENCE_FATAL_ERROR",
            fontsize=11, color="#d8e6ff", va="center", ha="left",
            family=["Segoe UI", "Microsoft YaHei"])
    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


# =====================================================================
# 5) Chrome「喔唷，崩溃啦！」
# =====================================================================
def chrome_aw_snap(fname):
    fig, ax = new_fig(fname, (9.0, 5.6), "#e8eaed")
    # 浏览器边框
    ax.add_patch(Rectangle((0.01, 0.01), 0.98, 0.98, fc="#ffffff",
                           ec="#c9cdd3", lw=1.2))
    # 地址栏
    ax.add_patch(FancyBboxPatch((0.03, 0.925), 0.94, 0.045,
                                boxstyle="round,pad=0.004", fc="#f1f3f4",
                                ec="#d3d7db", lw=0.8))
    ax.text(0.05, 0.9475, "●", fontsize=7, color="#5f6368",
            va="center", ha="left")
    ax.text(0.065, 0.9475, "file:///plot/adolescence-waves-contraction.gif",
            fontsize=9, color="#5f6368", va="center", ha="left",
            family=["Consolas", "Microsoft YaHei"])

    # 崩溃幽灵
    gx, gy, gs = 0.5, 0.55, 0.10
    ax.add_patch(Circle((gx, gy + gs), gs * 0.75, fc="#dadce0", ec="none"))
    ax.add_patch(FancyBboxPatch((gx - gs * 0.75, gy - gs * 0.5),
                                gs * 1.5, gs * 0.95,
                                boxstyle="round,pad=0.01", fc="#dadce0",
                                ec="none"))
    ax.add_patch(Circle((gx - gs * 0.25, gy + gs * 0.75), gs * 0.09,
                        fc="#9aa0a6", ec="none"))
    ax.add_patch(Circle((gx + gs * 0.25, gy + gs * 0.75), gs * 0.09,
                        fc="#9aa0a6", ec="none"))
    # 裂痕
    ax.plot([gx - gs * 0.5, gx - gs * 0.2, gx - gs * 0.35, gx + gs * 0.1],
            [gy + gs * 0.35, gy + gs * 0.15, gy + gs * 0.5, gy + gs * 0.3],
            color="#bdc1c6", lw=1.5)

    ax.text(0.5, 0.30, "喔唷，崩溃啦！", fontsize=24, color="#3c4043",
            va="center", ha="center", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.5, 0.24, "此网页意外崩溃，请重新加载。", fontsize=11,
            color="#5f6368", va="center", ha="center",
            family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.5, 0.17, "重新加载", fontsize=11, color="#1a73e8",
            va="center", ha="center", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.5, 0.085, "扩展程序、应用或绘图进程可能导致了崩溃", fontsize=8.5,
            color="#80868b", va="center", ha="center",
            family=["Segoe UI", "Microsoft YaHei"])
    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


# =====================================================================
# 6) Win7 风格「python.exe 未响应」
# =====================================================================
def not_responding(fname):
    fig, ax = new_fig(fname, (9.6, 5.2), "#54708f")
    chrome(ax, 0.20, 0.30, 0.60, 0.40, title="python.exe 未响应",
           title_h=0.045, title_fc="#3c74d6", body_fc="#f0f0f0")
    # 窗口图标
    ax.add_patch(Rectangle((0.235, 0.595), 0.05, 0.05, fc="#e8e8e8",
                           ec="#7a7a7a", lw=0.8))
    ax.add_patch(Polygon([(0.250, 0.638), (0.270, 0.638), (0.260, 0.600)],
                         fc="#f0a000", ec="none"))
    ax.text(0.26, 0.614, "!", fontsize=7, color="white", va="center",
            ha="center", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.31, 0.625, "python.exe 未响应", fontsize=14, color="#1a1a1a",
            va="center", ha="left", family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.31, 0.585, "此程序未响应，可能正在等待输入或出现故障。",
            fontsize=10, color="#333333", va="center", ha="left",
            family=["Segoe UI", "Microsoft YaHei"])
    ax.text(0.31, 0.552, "您可以选择立即结束该程序，或者继续等待其响应。",
            fontsize=10, color="#333333", va="center", ha="left",
            family=["Segoe UI", "Microsoft YaHei"])
    for bx, label in ((0.60, "立即结束"), (0.70, "继续等待")):
        ax.add_patch(Rectangle((bx, 0.375), 0.075, 0.03, fc="#e8e8e8",
                               ec="#7a7a7a", lw=0.8))
        ax.text(bx + 0.0375, 0.39, label, fontsize=9.5, color="#111111",
                va="center", ha="center", family=["Segoe UI", "Microsoft YaHei"])
    fig.savefig(fname, dpi=150, facecolor=fig.get_facecolor())
    plt.close(fig)
    print("saved:", fname)


if __name__ == "__main__":
    task_manager(r"source\images\crash-task-manager.png")
    jupyter_kernel(r"source\images\crash-jupyter-kernel.png")
    pycharm_137(r"source\images\crash-exit-code-137.png")
    bsod(r"source\images\crash-bsod.png")
    chrome_aw_snap(r"source\images\crash-browser-aw-snap.png")
    not_responding(r"source\images\crash-app-not-responding.png")
