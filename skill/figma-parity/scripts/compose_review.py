#!/usr/bin/env python3
"""
Build timestamped side-by-side (Figma | Rendered) comparison images per section for a
breakpoint, plus an index.html contact sheet.

PAIRING. `--map figma-map.json` is required. Pairs resolve by section NAME, in
map order, against each section's declared Figma node.

Also writes `pairs.json` recording exactly what was paired with what, so the
manifest builder and any later audit can see the mapping rather than infer it.

Output: <out>/<YYYY-MM-DD_HHMMSS>_<breakpoint>/NN-<name>.png  +  index.html
The timestamped folder means repeated reviews accumulate as a visual history.

Usage:
  python3 compose_review.py --figma-dir ./figma --live-dir ./live \
    --map ./figma-map.json --label desktop \
    --breakpoint desktop-1512 --out ./review [--viewport 1512x982] \
    [--col-width 900] [--timestamp 2026-07-24_154210]
"""
import argparse, os, re, glob, html, json
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

GUT = 24          # gutter between the two columns
PAD = 16          # outer padding
BANNER = 44       # header banner height
BG = (17, 24, 39)
PANEL = (255, 255, 255)
FG = (236, 239, 244)
SUB = (150, 160, 175)


def label_of(path):
    b = os.path.splitext(os.path.basename(path))[0]
    b = re.sub(r'^(sec|live|figma)[-_]?', '', b)
    b = re.sub(r'^\d{2,3}[-_]?', '', b)
    return b.replace('-', ' ').replace('_', ' ').strip() or b


def font(sz, bold=False):
    for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else
              '/System/Library/Fonts/Supplemental/Arial.ttf',
              '/System/Library/Fonts/Helvetica.ttc',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def scaled(img, w):
    if img is None:
        return None
    r = w / img.width
    return img.resize((w, max(1, int(img.height * r))))


def compose(fig, live, col_w, title, meta):
    figs = scaled(fig, col_w)
    lives = scaled(live, col_w)
    body_h = max(figs.height if figs else 0, lives.height if lives else 0)
    two = fig is not None and live is not None
    total_w = PAD * 2 + (col_w * 2 + GUT if two else col_w)
    total_h = PAD * 2 + BANNER + body_h
    canvas = Image.new('RGB', (total_w, total_h), BG)
    d = ImageDraw.Draw(canvas)
    d.text((PAD, 10), title, font=font(20, True), fill=FG)
    d.text((PAD, 32), meta, font=font(12), fill=SUB)
    y = PAD + BANNER
    x = PAD
    if figs:
        d.text((x, y - 16), 'FIGMA', font=font(12, True), fill=SUB)
        canvas.paste(figs, (x, y))
    if two:
        x += col_w + GUT
    if lives:
        d.text((x, y - 16), 'RENDERED', font=font(12, True), fill=SUB)
        canvas.paste(lives, (x, y))
    return canvas


def resolve(dirpath, name, label):
    """Find an image for a named section, preferring the labelled variant."""
    for candidate in ([f'{name}-{label}.png'] if label else []) + [f'{name}.png']:
        p = os.path.join(dirpath, candidate)
        if os.path.exists(p):
            return p
    hits = sorted(glob.glob(os.path.join(dirpath, f'{name}*.png')))
    return hits[0] if hits else None


def resolve_route(data, wanted=None):
    """A map may be flat (one route) or carry routes[]. Merge so shared keys survive."""
    routes = data.get('routes')
    if not routes:
        return data
    hit = next((r for r in routes if r.get('route') == wanted), None) if wanted else routes[0]
    if hit is None:
        raise SystemExit(f'route not in map: {wanted}')
    return {**data, **hit}


def plan_from_map(map_path, figma_dir, live_dir, label, route=None):
    """Explicit pairing: section name + declared Figma node, in map order."""
    with open(map_path) as f:
        data = resolve_route(json.load(f), route)
    plan = []
    for i, s in enumerate(data.get('sections', []), start=1):
        name = s['name']
        plan.append({
            'key': f'{i:02d}',
            'name': name,
            'node': s.get('figmaNodeId'),
            'figma': s.get('figmaRender') and os.path.join(figma_dir, os.path.basename(s['figmaRender']))
                     or resolve(figma_dir, name, None),
            'live': resolve(live_dir, name, label),
        })
    return plan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--figma-dir', required=True)
    ap.add_argument('--live-dir', required=True)
    ap.add_argument('--breakpoint', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--map', required=True,
                    help='project figma-map.json; pairs by section name')
    ap.add_argument('--label', default=None,
                    help='live filename suffix, e.g. desktop for 01-hero-desktop.png')
    ap.add_argument('--route', default=None,
                    help='which route in a multi-route map; defaults to the first')
    ap.add_argument('--viewport', default='')
    ap.add_argument('--col-width', type=int, default=900)
    ap.add_argument('--timestamp', default=None)
    args = ap.parse_args()

    ts = args.timestamp or datetime.now().strftime('%Y-%m-%d_%H%M%S')
    run_dir = os.path.join(args.out, f'{ts}_{args.breakpoint}')
    os.makedirs(run_dir, exist_ok=True)

    plan = plan_from_map(args.map, args.figma_dir, args.live_dir, args.label, args.route)
    pairing = 'explicit (figma-map.json section names)'

    rows = []
    for item in plan:
        k, name, fp, lp = item['key'], item['name'], item['figma'], item['live']
        fig = Image.open(fp) if fp else None
        live = Image.open(lp) if lp else None
        meta = f'{args.breakpoint}   {args.viewport}   {ts.replace("_", " ")}'
        if item['node']:
            meta += f'   node {item["node"]}'
        if not fp:
            meta += '   [no Figma crop]'
        if not lp:
            meta += '   [no live shot]'
        out = compose(fig, live, args.col_width, f'{k}  {name}', meta)
        # Map section names often already carry their own index (01-hero); don't
        # emit 01-01-hero.png.
        slug = re.sub(r'^\d{2,3}[-_]?', '', name or 'section')
        fn = f'{k}-{re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-") or "section"}.png'
        out.save(os.path.join(run_dir, fn))
        rows.append((k, name, fn, bool(fp), bool(lp)))
        item['sideBySide'] = fn
        item['sizes'] = {'figma': list(fig.size) if fig else None, 'live': list(live.size) if live else None}

    with open(os.path.join(run_dir, 'pairs.json'), 'w') as f:
        json.dump({'pairing': pairing, 'breakpoint': args.breakpoint, 'timestamp': ts,
                   'label': args.label, 'pairs': plan}, f, indent=2)

    # contact sheet
    cards = '\n'.join(
        f'<figure><figcaption>{html.escape(k)} · {html.escape(n)}'
        f'{"" if f else " ⚠︎no-figma"}{"" if l else " ⚠︎no-live"}</figcaption>'
        f'<img src="{html.escape(fn)}" loading="lazy"></figure>'
        for k, n, fn, f, l in rows)
    doc = f'''<!doctype html><meta charset=utf-8>
<title>QA review — {html.escape(args.breakpoint)} — {ts}</title>
<style>body{{margin:0;background:#0f1522;color:#eceef4;font:14px/1.4 -apple-system,system-ui,sans-serif}}
header{{padding:16px 20px;border-bottom:1px solid #263143;position:sticky;top:0;background:#0f1522}}
h1{{font-size:16px;margin:0}}small{{color:#94a3b8}}
figure{{margin:0;padding:20px;border-bottom:1px solid #1b2534}}
figcaption{{color:#94a3b8;margin-bottom:8px;font-weight:600}}
img{{max-width:100%;display:block;border-radius:8px}}</style>
<header><h1>Figma parity — {html.escape(args.breakpoint)}</h1>
<small>{ts.replace("_"," ")} · {html.escape(args.viewport)} · {len(rows)} sections · Figma (left) vs rendered (right)
· pairing: {html.escape(pairing)}</small></header>
{cards}'''
    with open(os.path.join(run_dir, 'index.html'), 'w') as f:
        f.write(doc)

    print(f'{len(rows)} comparisons -> {run_dir}')
    for k, n, fn, f, l in rows:
        flag = '' if (f and l) else '  (partial)'
        print(f'  {fn}{flag}')
    print(f'contact sheet: {os.path.join(run_dir, "index.html")}')
    print(f'pairing record: {os.path.join(run_dir, "pairs.json")}  ({pairing})')


if __name__ == '__main__':
    main()
