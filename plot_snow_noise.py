# -*- coding: utf-8 -*-
"""
雪花噪声动图：底色全黑 → 慢慢变成全屏雪花（电视雪花点）
- 白/灰噪点密度按缓动曲线从 0 爬到 50%，随后满屏闪烁
- 64 帧 @15fps ≈ 4.3s，循环
输出：source/images/snow-noise.gif
"""
import numpy as np
from PIL import Image

H, W = 270, 480
NF = 400
RAMP = 100             # 前 100 帧为渐变期（≈6.7s），之后满屏雪花 300 帧（= 20s）
FULL = 0.5             # 满屏时白噪点密度


def ramp_p(i):
    """0 -> FULL，平滑缓动；之后保持 FULL"""
    if i >= RAMP:
        return FULL
    t = i / RAMP
    t = t * t * (3 - 2 * t)          # smoothstep
    return FULL * t


rng = np.random.default_rng(7)
frames = []
for i in range(NF):
    p = ramp_p(i)
    r = rng.random((H, W))
    # 白噪点 p，灰噪点 p*1.7-p（质感），其余黑
    arr = np.where(r < p, 255, np.where(r < p * 1.7, 150, 0))
    frames.append(Image.fromarray(arr.astype(np.uint8), "L"))

out = r"source\images\snow-noise.gif"
frames[0].save(out, save_all=True, append_images=frames[1:],
               duration=1000 // 15, loop=0)
print("saved:", out)
print("frames:", NF, "| 渐变期 0-%d 帧，全雪花 %d-%d 帧" % (RAMP - 1, RAMP, NF - 1))
