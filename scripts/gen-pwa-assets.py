#!/usr/bin/env python3
"""Regenerate all PWA assets from the brand mark.

Source of truth: public/images/logo.png (the monochrome heart mark used in the
header). Produces, all with a near-black #0a0a0a field + white mark to match the
app's dark chrome, manifest theme/background, and the apple status-bar style:

  - public/icons/icon-{48..512}.png        standard icons (mark ~62% height)
  - public/icons/maskable-{192,384,512}.png Android adaptive (mark ~50%, safe zone)
  - public/icons/splash/apple-splash-*.png  iOS launch screens, both orientations

iOS does not synthesize a launch screen for installed PWAs — without an explicit
apple-touch-startup-image the app cold-launches to a blank screen. The matching
<link> tags live in index.html.

Deps: Pillow (`pip install pillow`). Re-run after changing logo.png; the splash
<link> tags in index.html only need editing if the device list below changes.
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = (10, 10, 10)       # #0a0a0a
FG = (255, 255, 255)    # white mark

src = Image.open(os.path.join(ROOT, "public/images/logo.png")).convert("RGBA")
mark = src.crop(src.split()[3].getbbox())
mw, mh = mark.size
_white = Image.new("RGBA", mark.size, FG + (0,))
_white.putalpha(mark.split()[3])


def compose(canvas_w, canvas_h, scale_ref, scale, out):
    canvas = Image.new("RGBA", (canvas_w, canvas_h), BG + (255,))
    th = int(scale_ref * scale)
    tw = int(mw * th / mh)
    m = _white.resize((tw, th), Image.LANCZOS)
    canvas.alpha_composite(m, ((canvas_w - tw) // 2, (canvas_h - th) // 2))
    canvas.convert("RGB").save(os.path.join(ROOT, out))


def square(size, scale, out):
    compose(size, size, size, scale, out)


# Standard icons
for s in [48, 72, 96, 128, 144, 152, 180, 192, 384, 512]:
    square(s, 0.62, f"public/icons/icon-{s}.png")

# Maskable (mark inside the center safe zone)
for s in [192, 384, 512]:
    square(s, 0.50, f"public/icons/maskable-{s}.png")

# iOS splash — native portrait px per device; landscape is the swap.
SPLASH = [
    (750, 1334), (828, 1792), (1080, 2340), (1125, 2436), (1170, 2532),
    (1179, 2556), (1242, 2688), (1284, 2778), (1290, 2796), (1320, 2868),
    (1620, 2160), (1640, 2360), (1668, 2388), (2048, 2732),
]
os.makedirs(os.path.join(ROOT, "public/icons/splash"), exist_ok=True)
for w, h in SPLASH:
    for cw, ch in ((w, h), (h, w)):
        compose(cw, ch, min(cw, ch), 0.22,
                f"public/icons/splash/apple-splash-{cw}x{ch}.png")

print(f"Regenerated icons + maskable + {len(SPLASH) * 2} splash screens.")
