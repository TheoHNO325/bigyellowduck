# -*- coding: utf-8 -*-
"""kill [PID] 演示用「画图进程」：打印绘制进度，可被终止/崩溃"""
import sys
import time

NAME = "adolescence-waves-contraction.gif"


def draw_progress(total, step=0.18):
    for i in range(total):
        print("[drawing] 帧 %3d/%-3d  渲染中 ... loss=%.4f  lr=%.2e"
              % (i + 1, total, 0.5 + i * 0.013, 1e-4 / (1 + i * 0.05)),
              flush=True)
        time.sleep(step)
    print("[drawing] 全部帧渲染完毕，正在写入 GIF ...", flush=True)
    time.sleep(1.0)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "crash"

    if mode == "crash":
        # 画到一半被「终止」（未捕获 KeyboardInterrupt -> 真实 traceback）
        draw_progress(16)
        print("[drawing] 正在保存帧 17/342 ...", flush=True)
        time.sleep(0.5)
        raise KeyboardInterrupt

    if mode == "long":
        # 持续绘制，等待外部 kill
        i = 0
        while True:
            print("[drawing] 帧 %3d  保存中 ..." % (i + 1), flush=True)
            time.sleep(0.35)
            i += 1

    if mode == "native":
        # 原生崩溃：访问空地址 -> Windows「已停止工作」对话框
        import ctypes
        print("[drawing] 写入帧缓冲时发生访问冲突 ...", flush=True)
        time.sleep(1.5)
        ctypes.string_at(0, 16)

    if mode == "poll":
        # 被反复 kill 的画图进程（配合轮询窗口）
        try:
            i = 0
            while True:
                print("[drawing] 帧 %3d  保存中 ..." % (i + 1), flush=True)
                time.sleep(0.4)
                i += 1
        except KeyboardInterrupt:
            print("[drawing] 收到中断，进程退出", flush=True)


if __name__ == "__main__":
    main()
