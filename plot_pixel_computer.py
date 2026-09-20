# -*- coding: utf-8 -*-
"""
虚拟电脑屏幕 · 像素图（大屏版）
- 像素网格 240x160，放大 6 倍 -> 1440x960（最近邻，像素风保持）
- 大显示器（窄边框）：屏幕 196x96 网格像素（较上一版 +73%）
- 内容：显示器（边框/支架/底座）+ 键盘 + 鼠标 + 桌面
- 两个版本：
  1) pixel-computer-clean.png           —— 屏幕留空（渐变桌面+任务栏），供自行贴图
  2) pixel-computer-with-images.png     —— 把已生成的图片作为窗口摆进屏幕（示范）
"""
import numpy as np
from PIL import Image

GW, GH, SCALE = 240, 160, 6

# ---------- 调色板 ----------
DESK = (58, 62, 72)
DESK_EDGE = (78, 84, 96)
BEZEL = (34, 39, 48)
BEZEL_D = (25, 29, 37)
SCREEN_T = (13, 19, 32)
SCREEN_B = (27, 36, 56)
STAND = (44, 50, 62)
BASE = (30, 35, 44)
KB_BASE = (45, 52, 65)
KEY = (72, 82, 100)
KEY_D = (56, 64, 80)
KEY_ACC = (216, 162, 74)
MOUSE = (60, 68, 84)
MOUSE_L = (92, 102, 122)
SHADOW = (44, 47, 56)

grid = np.zeros((GH, GW, 3), dtype=np.uint8)


def rect(x0, y0, x1, y1, c):
    grid[max(0, y0):min(GH, y1), max(0, x0):min(GW, x1)] = c


# ================= 场景（大屏） =================
# 桌面
rect(0, 116, GW, GH, DESK)
rect(0, 116, GW, 118, DESK_EDGE)

# 显示器：外框 x12..228 y4..116，窄边框，屏幕 x22..218 y12..108
rect(12, 4, 228, 116, BEZEL)
rect(18, 10, 222, 110, BEZEL_D)
for y in range(12, 108):
    t = (y - 12) / 96.0
    c = tuple(int(SCREEN_T[i] + (SCREEN_B[i] - SCREEN_T[i]) * t) for i in range(3))
    rect(22, y, 218, y + 1, c)
# 支架与底座
rect(106, 116, 134, 128, STAND)
rect(84, 128, 156, 136, BASE)
rect(84, 134, 156, 136, SHADOW)

# 键盘（三行键 + 金色 ESC）
rect(20, 138, 220, 160, KB_BASE)
for r in range(3):
    for c in range(13):
        x0 = 26 + c * 14
        y0 = 140 + r * 7
        rect(x0, y0, x0 + 12, y0 + 6, KEY)
rect(26, 140, 38, 146, KEY_ACC)          # ESC 金色
rect(20, 158, 220, 160, SHADOW)          # 键盘投影

# 鼠标
rect(222, 148, 238, 160, MOUSE)
rect(228, 150, 232, 156, MOUSE_L)        # 滚轮

# 屏幕任务栏（像素）
rect(22, 98, 218, 108, (24, 30, 44))
rect(26, 100, 34, 106, (64, 150, 255))            # 开始
for i in range(3):
    rect(42 + i * 8, 100, 46 + i * 8, 106, (120, 132, 155))

# 屏幕桌面图标（留空版可见）
rect(30, 18, 38, 26, (52, 62, 84))
rect(32, 20, 36, 24, (140, 160, 200))
rect(46, 18, 54, 26, (52, 62, 84))
rect(48, 20, 52, 24, (140, 160, 200))

base_img = Image.fromarray(grid, "RGB").resize((GW * SCALE, GH * SCALE),
                                               Image.NEAREST)
base_img.save(r"source\images\pixel-computer-clean.png")
print("saved: pixel-computer-clean.png")

# ================= 示范版：把图片作为窗口摆进屏幕 =================
from PIL import ImageDraw

img = base_img.copy()
d = ImageDraw.Draw(img)


def gif_frame(path, fr):
    g = Image.open(path)
    g.seek(fr)
    return g.convert("RGB")


waves = gif_frame(r"source\images\adolescence-waves-contraction.gif", 120)
kill = gif_frame(r"source\images\kill-countdown.gif", 150)
loss = Image.open(r"source\images\loss-diverging.png").convert("RGB")
recipe = Image.open(r"source\images\sota-recipe-card.png").convert("RGB")

# 窗口布局（大屏：2 行 x 2 列，网格单位）
# 列 22..118 / 120..216；行 12..53 / 55..96
wins = [
    (22, 12, 118, 53, waves,  (214, 69, 61)),   # 波形 GIF
    (120, 12, 216, 53, loss,  (255, 77, 77)),   # 损失图
    (22, 55, 118, 96, recipe, (255, 210, 74)),  # 配方卡
    (120, 55, 216, 96, kill,  (255, 95, 86)),   # kill 倒计时
]
for (gx0, gy0, gx1, gy1, photo, accent) in wins:
    x0, y0 = gx0 * SCALE, gy0 * SCALE
    x1, y1 = gx1 * SCALE, gy1 * SCALE
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(25, 29, 37), outline=(70, 80, 100))
    tb = y0 + 18
    d.rectangle([x0 + 6, y0 + 6, x1 - 7, tb - 1], fill=(42, 50, 66))
    d.rectangle([x1 - 30, y0 + 9, x1 - 13, y0 + 20], fill=accent)
    d.rectangle([x1 - 42, y0 + 12, x1 - 36, y0 + 18], fill=(110, 122, 146))
    area_w, area_h = (x1 - x0 - 12), (y1 - tb - 6)
    ph = photo.copy()
    ph.thumbnail((area_w, area_h), Image.LANCZOS)
    img.paste(ph, (x0 + 6, tb + 3))

img.save(r"source\images\pixel-computer-with-images.png")
print("saved: pixel-computer-with-images.png")
