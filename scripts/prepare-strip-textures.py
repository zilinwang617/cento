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

if __name__ == "__main__":
    scratch = sys.argv[1]
    prepare(f"{scratch}/noteA_1.png", "public/assets/strip-creased.jpg")
    prepare(f"{scratch}/noteB_1.jpg", "public/assets/strip-fibre.jpg", band=1722)
