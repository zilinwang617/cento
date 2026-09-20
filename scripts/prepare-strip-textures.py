#!/usr/bin/env python3
"""Prepare the two strip paper textures from their Figma sources.

Both are composited onto the strip with `multiply`, so each one is first
normalized to put its MEDIAN luminance at pure white. That is what keeps the
strip's own colour: multiply by 1.0 is a no-op, so a median-white texture
contributes only the shading below the median and leaves `--strip-color`
exactly where the palette put it. Without this, fibre's darker median would
drag every strip ~15% down and the two papers would not read as the same value.
Multiply cannot lighten anyway, so clamping the above-median half at 1.0 throws
away nothing it could have expressed.

Sources are Figma RNdrvPrcyNqPQ32ICmm4Pa, nodes 55:43 (creased) and 55:46
(fibre) — re-pull with download_assets and take the larger of the two returned
sizes. Fibre is a 3:4 portrait, cropped to a 16:9 band first: cover-fitting a
portrait onto a 9:1 strip would magnify a sliver of it.

The creased source carries a flat alpha of 77/255 — the author baked a 30%
layer opacity into the file, and Figma's own render honours it. So it is
composited over white at that alpha rather than discarded: kept at full
contrast it is four times too strong, and the broad soft folds Figma shows
turn into thin hard scratches. Flattening first is what makes the strengths
below reproduce the Figma render.

Measured gains: creased 1.071, fibre 1.175. The strengths those gains imply
(TEXTURES[].opacity in src/texture.js) were derived from the Figma render, so
re-measure them if these assets are ever replaced.
"""
import sys
from PIL import Image
import numpy as np

LUMA = np.array([0.299, 0.587, 0.114], dtype=np.float32)
WIDTH = 1600  # the widest strip is ~1421px in the 300dpi export; cover is width-driven

def prepare(src, out, band=None, boost=1.0):
    im = Image.open(src)
    if im.mode in ("RGBA", "LA"):
        flat = Image.new("RGB", im.size, (255, 255, 255))
        flat.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
        im = flat
    else:
        im = im.convert("RGB")
    if band:
        w, h = im.size
        top = (h - band) // 2
        im = im.crop((0, top, w, top + band))
    im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    gain = 255.0 / float(np.median(a @ LUMA))
    a = np.clip(a * gain, 0, 255)
    if boost != 1.0:
        a = np.clip(255 - (255 - a) * boost, 0, 255)
    Image.fromarray(a.astype(np.uint8)).save(out, quality=88, optimize=True)
    print(f"{out}  {im.size[0]}x{im.size[1]}  gain {gain:.3f}  boost {boost}")

SHEET_W, WIN_W, WIN_H = 560, 180, 43  # TEXTURE in src/texture.js, and a typical strip


def measure(src, opacity):
    """Print `lift` for TEXTURES[] in src/texture.js.

    A strip is a WIN_W x WIN_H hole onto a sheet laid at SHEET_W, and it reads
    the MEAN of what shows through — one flat colour to the eye, not the sheet's
    median pixel. That mean sits below the median the normalization put at white,
    so every strip lands under the palette colour by this much. `lift` is the
    reciprocal: the base to multiply this paper onto so the median strip comes
    back out on the palette colour exactly.

    One number, not three. The per-channel window is printed alongside because
    the papers are not neutral — fibre's is warm at 251.8/252.5/247.3 — but
    correcting that channel by channel re-saturates the ink into something
    harder than the swatch. The paper is allowed to tint what is under it; it is
    only not allowed to darken it. So `lift` is luminance-weighted.
    """
    im = Image.open(src).convert("RGB")
    im = im.resize((SHEET_W, round(im.height * SHEET_W / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    windows = np.array([a[y:y + WIN_H, x:x + WIN_W].mean(axis=(0, 1))
                        for y in range(0, a.shape[0] - WIN_H, 3)
                        for x in range(0, a.shape[1] - WIN_W, 5)])
    median = np.median(windows, axis=0)
    factor = 1 - opacity + opacity * float(median @ LUMA) / 255
    print(f"{src}  opacity {opacity}"
          f"  median window {np.round(median, 1)}"
          f"  lift {1 / factor:.3f}")


if __name__ == "__main__":
    if sys.argv[1] == "--measure":
        measure("public/assets/strip-creased.jpg", 0.95)
        measure("public/assets/strip-fibre.jpg", 1.0)
    else:
        scratch = sys.argv[1]
        prepare(f"{scratch}/noteA_1.png", "public/assets/strip-creased.jpg")
        prepare(f"{scratch}/noteB_1.jpg", "public/assets/strip-fibre.jpg", band=1722)
