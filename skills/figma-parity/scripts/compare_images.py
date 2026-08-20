#!/usr/bin/env python3
"""Create a deterministic locator diff for identically sized Figma and live images."""

import argparse
import json
import os
from PIL import Image


def rectangle(value):
    parts = [int(part) for part in value.split(",")]
    if len(parts) != 4 or min(parts[2:]) < 1:
        raise argparse.ArgumentTypeError("mask must be x,y,width,height")
    return parts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected", required=True, help="Figma/reference image")
    parser.add_argument("--actual", required=True, help="rendered/live image")
    parser.add_argument("--out", required=True, help="diff mask PNG")
    parser.add_argument("--metrics", required=True, help="JSON metrics output")
    parser.add_argument("--threshold", type=int, default=16, choices=range(0, 256))
    parser.add_argument("--mask", action="append", type=rectangle, default=[], help="ignored x,y,width,height; repeatable")
    parser.add_argument("--crop-to-common", action="store_true",
                        help="widths must still match; crop both to the shorter height and record it")
    parser.add_argument("--expected-provider", default=None, help="captureProvider of --expected")
    parser.add_argument("--actual-provider", default=None, help="captureProvider of --actual")
    parser.add_argument("--allow-cross-provider", action="store_true",
                        help="override the cross-provider refusal (you must justify this in the report)")
    args = parser.parse_args()

    # Images from different providers come from different browsers, OSes and font
    # stacks. Antialiasing and glyph rasterisation alone will light up the mask,
    # and that noise is indistinguishable from a finding. Refuse by default.
    if (args.expected_provider and args.actual_provider
            and args.expected_provider != args.actual_provider and not args.allow_cross_provider):
        raise SystemExit(
            f"refusing to diff across capture providers: {args.expected_provider} vs {args.actual_provider}.\n"
            "Different browser/OS/font stacks produce rasterisation noise that reads as findings.\n"
            "Diff same-provider pairs (e.g. one URL across two runs), or pass --allow-cross-provider "
            "and record the limitation in the report.")

    expected = Image.open(args.expected).convert("RGB")
    actual = Image.open(args.actual).convert("RGB")
    crop = None
    if expected.size != actual.size:
        if not (args.crop_to_common and expected.width == actual.width):
            raise SystemExit(
                f"images must have identical dimensions: expected={expected.size}, actual={actual.size}\n"
                "Section pairs rarely match, because a height delta IS the finding. Either compare a\n"
                "same-size pair, or pass --crop-to-common (equal widths only) to diff the shared top\n"
                "region; the crop is recorded in the metrics and must be disclosed in the report.")
        common = min(expected.height, actual.height)
        crop = {"height": common, "expectedHeight": expected.height, "actualHeight": actual.height,
                "alignment": "top-left", "note": "Only the shared top region was compared; "
                                                 "content below it is NOT covered by this diff."}
        expected = expected.crop((0, 0, expected.width, common))
        actual = actual.crop((0, 0, actual.width, common))

    width, height = expected.size
    ignored = bytearray(width * height)
    for x, y, w, h in args.mask:
        for py in range(max(0, y), min(height, y + h)):
            start = py * width + max(0, x)
            end = py * width + min(width, x + w)
            ignored[start:end] = b"\x01" * max(0, end - start)

    exp = list(expected.getdata())
    act = list(actual.getdata())
    rendered = []
    changed = 0
    compared = 0
    channel_delta = 0
    bounds = [width, height, -1, -1]

    for index, (left, right) in enumerate(zip(exp, act)):
        if ignored[index]:
            rendered.append((70, 75, 82))
            continue
        compared += 1
        delta = tuple(abs(a - b) for a, b in zip(left, right))
        channel_delta += sum(delta) / 3
        if max(delta) > args.threshold:
            changed += 1
            x, y = index % width, index // width
            bounds = [min(bounds[0], x), min(bounds[1], y), max(bounds[2], x), max(bounds[3], y)]
            rendered.append((255, 45, 85))
        else:
            grey = int(sum(right) / 3 * 0.24)
            rendered.append((grey, grey, grey))

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    diff = Image.new("RGB", expected.size)
    diff.putdata(rendered)
    diff.save(args.out)

    metrics = {
        "schemaVersion": 1,
        "expected": os.path.abspath(args.expected),
        "actual": os.path.abspath(args.actual),
        "width": width,
        "height": height,
        "threshold": args.threshold,
        "maskedRegions": args.mask,
        "expectedProvider": args.expected_provider,
        "actualProvider": args.actual_provider,
        "crossProvider": bool(args.expected_provider and args.actual_provider
                              and args.expected_provider != args.actual_provider),
        "croppedToCommon": crop,
        "comparedPixels": compared,
        "changedPixels": changed,
        "changedRatio": changed / compared if compared else 0,
        "meanAbsoluteChannelDelta": channel_delta / compared if compared else 0,
        "changeBounds": None if changed == 0 else {
            "x": bounds[0], "y": bounds[1],
            "width": bounds[2] - bounds[0] + 1,
            "height": bounds[3] - bounds[1] + 1
        },
        "interpretation": "Locator evidence only; changedRatio is not severity or proof of a design defect."
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.metrics)), exist_ok=True)
    with open(args.metrics, "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2)
        handle.write("\n")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
