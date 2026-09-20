# -*- coding: utf-8 -*-
"""
恒定 10s 满屏雪花闪烁（基于 snow-noise.gif 末尾满屏帧的参数）
- 白噪点密度 0.5、灰噪点 0.85 上限，与雪花动图全雪花阶段完全一致
- 150 帧 @15fps = 10s；每帧独立随机 -> 任意相邻帧（含末帧→首帧）
  差异统计相同，循环无缝、无跳变
输出：source/images/snow-flicker-10s.gif
"""
import numpy as np
from PIL import Image

H, W = 270, 480
NF = 150          # 10s @15fps
FULL = 0.5        # 与雪花动图全雪花阶段一致

rng = np.random.default_rng(11)
frames = []
for _ in range(NF):
    r = rng.random((H, W))
    arr = np.where(r < FULL, 255, np.where(r < FULL * 1.7, 150, 0))
    frames.append(Image.fromarray(arr.astype(np.uint8), "L"))

out = r"source\images\snow-flicker-10s.gif"
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=1000 // 15, loop=0)
print("saved:", out)
print("frames:", NF, "= %.1fs @15fps" % (NF / 15))
