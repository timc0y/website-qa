# How to interpret a visual diff

Use three layers of evidence:

1. side-by-side images, for structure and for human judgment;
2. DOM and Figma measurements, for actionable numeric deltas;
3. pixel diff masks, for locating a changed region.

A pixel comparison is sensitive to the browser, the OS, the fonts, the device
scale, the antialiasing, and the image encoding. Run it only on
identically-sized images captured under recorded conditions. A changed-pixel
ratio is not a severity score, and it does not prove which side is correct.

`scripts/compare_images.py` writes a high-contrast diff mask and JSON metrics.
Its threshold ignores a small per-channel change. It does not perform a
semantic or a perceptual judgment. Inspect the mask, then verify each
consequential region against the exact Figma node.

The tool refuses two comparisons by default, because in both cases the output
would look like a real finding when it is not:

- **A cross-provider diff.** Different browser, OS, and font stacks differ in
  their rasterization alone.
- **A diff between mismatched dimensions.** The `--crop-to-common` flag diffs
  only the shared top region, at equal widths, and records the crop. You must
  then disclose this crop. Content below the crop line is not covered.

In practice, a Figma render and a live section rarely share dimensions,
because a height delta usually *is* the finding. A pixel diff pays off on a
same-provider, same-URL, across-run comparison.

## Read the node. Do not read the render.

A Figma export is a composited picture, and it will mislead you about exactly
the properties a reviewer most wants to report. Before you write a color,
gradient, or alignment row, read the node's own `fills`, `strokes`, and
coordinates:

- **Gradients.** Sampling a live section 13px lower than its Figma counterpart
  returns a different color from the *same* gradient. Compare the declared
  stops and angle, for example `linear-gradient(180deg, #E8622A 0%, #823718
  100%)`, against the computed `background-image`.
- **Centering and alignment.** An exported node's group may sit at an offset
  inside its own render, and look off-center when it is not. Compute the
  center directly. A group with `x=338` and `width=836.5` centers at 756,
  which is exactly half of a 1512 frame.
- **Text color.** `#F2F5FA` and `#FFFFFF` look the same side by side, and they
  are a real token difference. Only the node fill tells you which one is
  correct.

This discipline matters most in `forge-live-evidence` mode. In that mode,
there is no DOM to fall back on, and the Figma node data is the only numeric
source you have.

Useful reference patterns:

- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)
  retry a capture until consecutive images settle, and it warns that
  rendering differs by environment.
- [BackstopJS](https://github.com/garris/BackstopJS) distinguishes hiding
  volatile content from removing it, and it records the scenario state.
- [Pixelmatch](https://github.com/mapbox/pixelmatch) provides
  antialias-aware pixel evidence. A structural tool, such as
  [reg-suit](https://github.com/reg-viz/reg-suit), can identify a moved or an
  inserted region.
- [Lost Pixel](https://github.com/lost-pixel/lost-pixel) supports multiple
  browsers, responsive viewports, masking, and a custom screenshot input.

These tools are optional references. They are not runtime dependencies of
this skill.
