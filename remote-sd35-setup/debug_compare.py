"""Debug comparison: official do_sampling vs custom path, unconditional quality.

A: official do_sampling, empty-prompt cond, cfg=1.0 (unconditional)
B: custom sample_from_init, empty-prompt cond, cfg=1.0 (should equal A)
C: official do_sampling, empty-prompt cond, cfg=4.5 (cond==uncond -> same as A)
D: official do_sampling, normal prompt "a photo of a cat", cfg=4.5 (sanity check)
E: fixed blend: w=0.5, denoise from sigma=0.5 (official gen_image style)
"""
import os
import sys
import numpy as np
import torch
from PIL import Image

sys.path.insert(0, "/root/autodl-tmp/sd3.5")
from sd3_infer import SD3Inferencer  # noqa: E402
import sd3_impls  # noqa: E402

W, H = 512, 512
STEPS = 28
OUT = "outputs/exp_debug"
os.makedirs(OUT, exist_ok=True)


def laplacian_var(img):
    """Sharpness metric: variance of Laplacian."""
    a = np.asarray(img.convert("L"), dtype=np.float32)
    k = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    from numpy.lib.stride_tricks import sliding_window_view
    win = sliding_window_view(a, (3, 3))
    lap = (win * k).sum(axis=(-2, -1))
    return float(lap.var())


def main():
    inf = SD3Inferencer()
    with torch.no_grad():
        inf.load(model="models/sd3.5_large.safetensors", verbose=False)
        seed = 42
        cond_empty = inf.get_cond("")
        cond_cat = inf.get_cond("a photo of a cat")
        lat = inf.get_empty_latent(1, W, H, seed, "cpu")

        # A: official do_sampling, empty cond, cfg=1.0
        outA = inf.do_sampling(lat, seed, cond_empty, cond_empty, STEPS, 1.0, "dpmpp_2m")
        imgA = inf.vae_decode(outA)
        imgA.save(f"{OUT}/A_official_empty_cfg1.png")
        print("A official empty cfg1    : laplacian=%.1f" % laplacian_var(imgA), flush=True)

        # B: custom path (x = get_empty_latent)
        x = lat.half().cuda()
        inf.sd3.model = inf.sd3.model.cuda()
        sigmas = inf.get_sigmas(inf.sd3.model.model_sampling, STEPS).cuda()
        c = inf.fix_cond(cond_empty)
        extra = {"cond": c, "uncond": c, "cond_scale": 1.0, "controlnet_cond": None}
        latentB = sd3_impls.sample_dpmpp_2m(
            sd3_impls.CFGDenoiser(inf.sd3.model, STEPS), x, sigmas, extra_args=extra
        )
        latentB = sd3_impls.SD3LatentFormat().process_out(latentB)
        imgB = inf.vae_decode(latentB)
        imgB.save(f"{OUT}/B_custom_empty_cfg1.png")
        print("B custom empty cfg1      : laplacian=%.1f" % laplacian_var(imgB), flush=True)

        # C: official do_sampling, empty cond, cfg=4.5
        outC = inf.do_sampling(lat, seed, cond_empty, cond_empty, STEPS, 4.5, "dpmpp_2m")
        imgC = inf.vae_decode(outC)
        imgC.save(f"{OUT}/C_official_empty_cfg45.png")
        print("C official empty cfg4.5  : laplacian=%.1f" % laplacian_var(imgC), flush=True)

        # D: official do_sampling, prompt cat, cfg=4.5 (sanity)
        outD = inf.do_sampling(lat, seed, cond_cat, cond_empty, STEPS, 4.5, "dpmpp_2m")
        imgD = inf.vae_decode(outD)
        imgD.save(f"{OUT}/D_official_cat_cfg45.png")
        print("D official cat cfg4.5    : laplacian=%.1f" % laplacian_var(imgD), flush=True)

        # E: fixed blend w=0.5 -> denoise from sigma=0.5 (official gen_image style)
        img_lat = inf._image_to_latent(
            "datasets/images/div2k_valid/DIV2K_valid_HR/0801.png", W, H
        ).cpu()
        w = 0.5
        noise = inf.get_noise(seed + 100, img_lat)
        x = (w * img_lat + (1.0 - w) * noise).half().cuda()
        inf.sd3.model = inf.sd3.model.cuda()
        sigmasE = inf.get_sigmas(inf.sd3.model.model_sampling, STEPS).cuda()
        target = 1.0 - w
        idx = int((sigmasE <= target).nonzero()[0].item())
        sigmasE = sigmasE[idx:]
        cE = inf.fix_cond(cond_empty)
        extraE = {"cond": cE, "uncond": cE, "cond_scale": 1.0, "controlnet_cond": None}
        latentE = sd3_impls.sample_dpmpp_2m(
            sd3_impls.CFGDenoiser(inf.sd3.model, STEPS), x, sigmasE, extra_args=extraE
        )
        latentE = sd3_impls.SD3LatentFormat().process_out(latentE)
        imgE = inf.vae_decode(latentE)
        imgE.save(f"{OUT}/E_blend_w05_sigma05.png")
        print("E blend w=0.5 sigma0.5   : laplacian=%.1f" % laplacian_var(imgE), flush=True)

        print("sigmas[:3]", sigmas[:3].tolist(), flush=True)
        print("idx for w=0.5:", idx, "sigma_start=", sigmasE[0].item(), flush=True)

    print("DONE", flush=True)


if __name__ == "__main__":
    main()
