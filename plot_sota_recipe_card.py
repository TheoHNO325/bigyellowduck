# -*- coding: utf-8 -*-
"""
《SOTA 训练配方卡》—— 由「开发者」签发的配方卡（方案二）
字段逐条对应诗句；底部内嵌「配方效果」小图：
  35 岁容器 / 25 岁容器 爬不到 SOTA，18 岁容器经 魔药+ablation 登顶；
  「虚假的大脑」永远悬在最上方。
输出：source/images/sota-recipe-card.png
"""
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle, Polygon, Circle

plt.rcParams["font.family"] = ["Microsoft YaHei", "Consolas", "SimSun"]
plt.rcParams["axes.unicode_minus"] = False

BG = "#0a0e1a"
CARD = "#0f1420"
BORDER = "#2b3650"
GOLD = "#ffd24a"
CYAN = "#8be0ff"
DIM = "#8a93a6"

fig = plt.figure(figsize=(10.5, 7.4), facecolor=BG)
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, 1)
ax.set_ylim(0, 1)
ax.axis("off")

# ---------- 卡片主体 ----------
ax.add_patch(FancyBboxPatch((0.05, 0.04), 0.90, 0.92,
                            boxstyle="round,pad=0.012,rounding_size=0.02",
                            fc=CARD, ec=BORDER, lw=1.6))

# 机密条
ax.text(0.085, 0.915, "绝密 · CONFIDENTIAL", fontsize=8, color="#5f6a80",
        va="center", ha="left")

# 标题与副标题
ax.text(0.085, 0.875, "SOTA 训练配方卡", fontsize=21, color=GOLD,
        va="center", ha="left", family=["Microsoft YaHei", "Consolas"])
ax.text(0.085, 0.845, "—— 由开发者签发 · 唯一有效版本", fontsize=10.5,
        color=DIM, va="center", ha="left")

# 印章（开发者印）
sx, sy, ss = 0.845, 0.845, 0.055
ax.add_patch(FancyBboxPatch((sx, sy), ss, ss, boxstyle="round,pad=0.004",
                            fc="#c0392b", ec="#e8a0a0", lw=1.0))
chars = ["开", "发", "者", "印"]
pos = [(sx + ss*0.27, sy + ss*0.72), (sx + ss*0.73, sy + ss*0.72),
       (sx + ss*0.27, sy + ss*0.28), (sx + ss*0.73, sy + ss*0.28)]
for (cx, cy), ch in zip(pos, chars):
    ax.text(cx, cy, ch, fontsize=9, color="white", va="center", ha="center")

# 问答引子
ax.text(0.085, 0.80, "我问开发者：如何才能爬上 SOTA 的成就？", fontsize=10.5,
        color="#b8c0cc", va="center", ha="left")
ax.text(0.085, 0.772, "它说：", fontsize=12, color=GOLD, va="center",
        ha="left", fontweight="bold")

# ---------- 配方字段 ----------
fields = [
    ("[目标]", "爬上 SOTA 的成就 —— 并超过「虚假的大脑」", "#e8e8e8"),
    ("[baseline]", "苦难 —— 首先，你需要很多苦难作为 baseline", "#ff8c66"),
    ("[魔药]", "千载难逢 ×1 —— 择机注入，一次就好", "#b57bff"),
    ("[必备组件]", "最不能省略：passion（热情）· obsession（执念）· ablation（消融实验）", CYAN),
    ("[容器]", "新鲜的容器 —— 得是 18 岁；不能是 35 岁，也不能是 25 岁", GOLD),
    ("[判定]", "18 岁 = 人生的中点 —— 此点未达山顶者，余生无法再看见天空和云", "#ff5f56"),
]
fy = 0.735
for label, value, col in fields:
    ax.text(0.09, fy, label, fontsize=10.5, color="#7fd1ff", va="center",
            ha="left", family=["Consolas", "Microsoft YaHei"])
    ax.text(0.225, fy, value, fontsize=10.5, color=col, va="center",
            ha="left")
    fy -= 0.062

# 有效期（红色副章感）
ax.text(0.09, fy - 0.006, "有效期：至 18 岁 · 逾期配方自动失效", fontsize=10,
        color="#c0392b", va="center", ha="left", fontweight="bold")

# ---------- 配方效果小图 ----------
px0, py0, pw, ph = 0.075, 0.055, 0.85, 0.30
ax.add_patch(FancyBboxPatch((px0, py0), pw, ph,
                            boxstyle="round,pad=0.008,rounding_size=0.015",
                            fc="#141a2c", ec=BORDER, lw=1.2))
ax.text(px0 + 0.02, py0 + ph - 0.035, "配方效果 —— 测试分数（越高越好）",
        fontsize=10, color="#c8d0dc", va="center", ha="left")

# 曲线坐标系（面板内：x 0-100 -> 0.085-0.915，y 0-100 -> 0.075-0.315）
def X(v): return 0.085 + (v / 100.0) * 0.83
def Y(v): return 0.075 + (v / 100.0) * 0.235

rng = np.random.default_rng(7)
xv = np.linspace(0, 100, 400)
fake = np.full_like(xv, 96.5)
sota = np.full_like(xv, 88.0)
c35 = np.clip(6 + 30 * (1 - np.exp(-xv / 28)) + 1.6 * np.sin(xv / 6), 0, 42)
c25 = np.clip(6 + 50 * (1 - np.exp(-xv / 22)) + 2.0 * np.sin(xv / 5), 0, 62)

c18 = np.empty_like(xv)
c18[xv < 30] = 6 + 20 * (xv[xv < 30] / 30) ** 1.3
c18[xv >= 30] = 45 + 30 * (1 - np.exp(-(xv[xv >= 30] - 30) / 35))
for st in (45, 60, 75):
    c18[xv >= st] += 5
c18 = np.clip(c18, 0, 88)

ax.plot(X(xv), Y(fake), color="#6b7686", ls=":", lw=1.4, alpha=0.9)
ax.plot(X(xv), Y(sota), color=GOLD, ls="--", lw=1.5, alpha=0.95)
ax.plot(X(xv), Y(c35), color="#7a7f8a", lw=2.0, alpha=0.9)
ax.plot(X(xv), Y(c25), color=CYAN, lw=2.0, alpha=0.9)
ax.plot(X(xv), Y(c18), color="#ff5f56", lw=2.4)

# 魔药注入点
ax.scatter([X(30)], [Y(45)], s=90, color=GOLD, alpha=0.30, zorder=5)
ax.scatter([X(30)], [Y(45)], s=34, marker="D", color=GOLD, zorder=6,
           edgecolor="white", linewidth=0.6)
ax.text(X(30), Y(45) + 0.016, "魔药", fontsize=8.5, color=GOLD,
        va="center", ha="center")
# ablation 阶梯刻度
for st in (45, 60, 75):
    idx = int(np.argmin(np.abs(xv - st)))
    ax.plot([X(st), X(st)], [Y(c18[idx] - 8), Y(c18[idx])],
            color="#ff8c66", lw=1.2, alpha=0.8)

# 曲线名（右端）
ax.text(X(100) + 0.004, Y(96.5), "虚假的大脑", fontsize=8, color="#6b7686",
        va="center", ha="left")
ax.text(X(100) + 0.004, Y(88), "SOTA", fontsize=8, color=GOLD, va="center",
        ha="left")
ax.text(X(100) + 0.004, Y(42), "35岁容器", fontsize=8, color="#9aa0a6",
        va="center", ha="left")
ax.text(X(100) + 0.004, Y(62), "25岁容器", fontsize=8, color=CYAN,
        va="center", ha="left")
ax.text(X(100) + 0.004, Y(88), "18岁容器", fontsize=8, color="#ff5f56",
        va="center", ha="left")
ax.text(X(100) - 0.05, Y(88) - 0.014, "18岁容器 → SOTA", fontsize=8,
        color="#ff5f56", va="center", ha="right")

fig.savefig(r"source\images\sota-recipe-card.png", dpi=150,
            facecolor=fig.get_facecolor(), bbox_inches="tight")
print("saved: source/images/sota-recipe-card.png")
