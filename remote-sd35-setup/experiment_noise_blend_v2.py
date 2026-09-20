"""Noise-blend experiment on SD3.5-Large — FIXED version.

Key fix vs v1: SD3.5 uses rescaled sigmas (0..1), and `noise_scaling(sigma, noise, latent)
= sigma*noise + (1-sigma)*latent`, i.e. sigma IS the noise fraction. The user's blend
`w*img + (1-w)*noise` therefore corresponds to sigma = 1-w, so denoising must START from
sigma ~= 1-w (truncated sigma schedule), exactly like the official img2img (denoise) path.
Starting from sigma=1.0 (as v1 did) makes the model treat the input as pure noise and
obliterate everything -> mush.

Experiment 1: 5 groups of pure random-noise unconditional generation (empty prompt, cfg=1).
Experiment 2: image blended into init noise with weight w in [0.01..0.9], denoise from
              sigma = 1-w. Two images.
"""
import os
import sys
import numpy as np
import torch

sys.path.insert(0, "/root/autodl-tmp/sd3.5")
from sd3_infer import SD3Inferencer  # noqa: E402
import sd3_impls  # noqa: E402

W, H = 512, 512
STEPS = 28
BASE_SEED = 42
OUT = "outputs/exp_noise_blend_v2"

IMAGES = [
    ("div2k_0801", "datasets/images/div2k_valid/DIV2K_valid_HR/0801.png"),
    ("coco_139", "datasets/images/coco_val2017/val2017/000000000139.jpg"),
]
WEIGHTS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9]


def laplacian_var(img):
    a = np.asarray(img.convert("L"), dtype=np.float32)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(a, (3, 3))
    return float((win * k).sum(axis=(-2, -1)).var())


def main():
    os.makedirs(OUT, exist_ok=True)
    inf = SD3Inferencer()
    with torch.no_grad():
        inf.load(model="models/sd3.5_large.safetensors", verbose=False)
        cond = inf.get_cond("")  # unconditional (empty prompt)

        # ---------- Experiment 1: pure random noise, unconditional (official path) ----------
        for i in range(5):
            seed = BASE_SEED + i
            lat0 = inf.get_empty_latent(1, W, H, seed, "cpu")
            out = inf.do_sampling(lat0, seed, cond, cond, STEPS, 1.0, "dpmpp_2m")
            img = inf.vae_decode(out)
            img.save(f"{OUT}/exp1_uncond_seed{seed}.png")
            print(f"exp1 seed={seed} laplacian={laplacian_var(img):.1f}", flush=True)

        # ---------- Experiment 2: image blended into init noise, sigma = 1-w ----------
        report = open(f"{OUT}/report.csv", "w")
        report.write("img,w,sigma_start,steps_used,laplacian\n")
        for idx, (tag, img_path) in enumerate(IMAGES):
            img_lat = inf._image_to_latent(img_path, W, H).cpu().to(torch.float32)
            print(f"img_latent {tag}: {tuple(img_lat.shape)} mean={img_lat.mean():.3f}", flush=True)
            seed = BASE_SEED + 100 + idx * 100
            noise = inf.get_noise(seed, img_lat)
            for w in WEIGHTS:
                x = (w * img_lat + (1.0 - w) * noise).half().cuda()
                inf.sd3.model = inf.sd3.model.cuda()
                sigmas = inf.get_sigmas(inf.sd3.model.model_sampling, STEPS).cuda()
                target = 1.0 - w
                idxs = (sigmas <= target).nonzero()
                start = int(idxs[0].item()) if target < 1.0 and len(idxs) else 0
                sigmas_used = sigmas[start:]
                c = inf.fix_cond(cond)
                extra = {"cond": c, "uncond": c, "cond_scale": 1.0, "controlnet_cond": None}
                latent = sd3_impls.sample_dpmpp_2m(
                    sd3_impls.CFGDenoiser(inf.sd3.model, STEPS),
                    x, sigmas_used, extra_args=extra,
                )
                latent = sd3_impls.SD3LatentFormat().process_out(latent)
                inf.sd3.model = inf.sd3.model.cpu()
                img = inf.vae_decode(latent)
                img.save(f"{OUT}/exp2_{tag}_w{w}.png")
                lp = laplacian_var(img)
                print(f"exp2 {tag} w={w} sigma_start={sigmas_used[0].item():.3f} "
                      f"steps={len(sigmas_used)} laplacian={lp:.1f}", flush=True)
                report.write(f"{tag},{w},{sigmas_used[0].item():.4f},{len(sigmas_used)},{lp:.1f}\n")
                report.flush()
        report.close()

    print("ALL_DONE", flush=True)


if __name__ == "__main__":
    main()
