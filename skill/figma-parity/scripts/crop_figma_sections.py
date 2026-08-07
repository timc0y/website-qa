#!/usr/bin/env python3
"""
Crop a tall rendered Figma frame into per-section PNGs, aligned to the live
site's section map.

Why this exists: the Figma frame and the live page are almost never *exactly*
the same total height, so you can't just multiply live coordinates by the render
scale. This scales live section tops by (figmaHeight / liveHeight) first, then by
the render scale, so crops line up even with drift. It also crops from the TOP of
the requested band (macOS `sips -c` crops from the center — do not use that).

sections.json is the output of live_probe.js mapSections(): it must contain
{"docHeight": <int>, "sections": [{"s"|"name": ".selector", "top": int,
"h"|"height": int, "txt": "..."}]}.

Usage:
  python3 crop_figma_sections.py \
    --frame desktop-full.png --scale 1.5 \
    --sections sections.json --figma-height 8135 \
    --out-dir ./crops [--pad 20] [--prefix sec]
"""
import argparse, json, os, re
from PIL import Image


def slug(s):
    s = re.sub(r'[^a-z0-9]+', '-', (s or '').lower()).strip('-')
    return s[:24] or 'section'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frame', required=True, help='rendered Figma frame PNG')
    ap.add_argument('--scale', type=float, default=1.5, help='pngScale used to render')
    ap.add_argument('--sections', required=True, help='sections.json from live_probe mapSections()')
    ap.add_argument('--figma-height', type=float, default=None,
                    help='actual Figma frame height in px (renderedHeight/scale). '
                         'If omitted, assumed equal to live docHeight (no drift).')
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--pad', type=int, default=20, help='px of live padding above/below each band')
    ap.add_argument('--prefix', default='sec')
    args = ap.parse_args()

    with open(args.sections) as f:
        data = json.load(f)
    secs = data['sections'] if isinstance(data, dict) else data
    live_h = (data.get('docHeight') if isinstance(data, dict) else None) \
        or max((s.get('top', 0) + (s.get('h') or s.get('height', 0))) for s in secs)
    fig_h = args.figma_height or live_h
    factor = fig_h / live_h

    img = Image.open(args.frame)
    W, H = img.size
    os.makedirs(args.out_dir, exist_ok=True)

    made = []
    for i, s in enumerate(secs, 1):
        name = s.get('name') or s.get('s') or f'section-{i}'
        top = s.get('top', 0)
        h = s.get('h') or s.get('height') or 0
        y0 = max(0, int((top - args.pad) * factor * args.scale))
        y1 = min(H, int((top + h + args.pad) * factor * args.scale))
        if y1 <= y0:
            continue
        crop = img.crop((0, y0, W, y1))
        fn = f'{args.prefix}-{i:02d}-{slug(name)}.png'
        crop.save(os.path.join(args.out_dir, fn))
        made.append((fn, crop.size))

    print(f'frame {W}x{H}  live_h={live_h}  figma_h={fig_h}  factor={factor:.4f}')
    for fn, sz in made:
        print(f'  {fn}  {sz[0]}x{sz[1]}')
    print(f'{len(made)} section crops -> {args.out_dir}')


if __name__ == '__main__':
    main()
