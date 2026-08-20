# Visual diff interpretation

Use three layers of evidence:

1. side-by-side images for structure and human judgement;
2. DOM/Figma measurements for actionable numeric deltas;
3. pixel diff masks for locating changed regions.

Pixel comparison is sensitive to browser, OS, fonts, device scale, antialiasing and image encoding.
Run it only on identically sized images captured under recorded conditions. A changed-pixel ratio is
not a severity score and does not prove which side is correct.

`scripts/compare_images.py` writes a high-contrast diff mask and JSON metrics. Its threshold ignores
small per-channel changes; it does not perform semantic or perceptual judgement. Inspect the mask,
then verify consequential regions against the exact Figma node.

It refuses two things by default, both because the output would look like findings:

- **Cross-provider diffs.** Different browser/OS/font stacks differ in rasterisation alone.
- **Mismatched dimensions.** `--crop-to-common` (equal widths only) diffs the shared top region and
  records the crop, which must then be disclosed — content below the crop is not covered.

In practice, a Figma render and a live section rarely share dimensions, because the height delta
usually *is* the finding. Diffing pays off on same-provider, same-URL, across-run comparisons.

## Read the node, not the render

A Figma export is a composited picture and will mislead you about exactly the properties reviewers
most want to report. Before writing any colour, gradient, or alignment row, read the node's own
`fills`, `strokes` and coordinates:

- **Gradients.** Sampling a live section 13px lower than its Figma counterpart returns a different
  colour from the *same* gradient. Compare the declared stops and angle
  (`linear-gradient(180deg, #E8622A 0%, #823718 100%)`) against the computed `background-image`.
- **Centring and alignment.** An exported node's group may sit at an offset inside its own render and
  look off-centre when it is not. Compute it: group `x=338`, `width=836.5` centres at 756, which is
  exactly half of a 1512 frame.
- **Text colour.** `#F2F5FA` and `#FFFFFF` are indistinguishable side by side and a real token
  difference. Only the node fill tells you.

This discipline matters most in `forge-live-evidence` mode, where there is no DOM to fall back on and
Figma node data is the only numeric source you have.

Useful reference patterns:

- [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) retry capture until
  consecutive images settle and warn that rendering differs by environment.
- [BackstopJS](https://github.com/garris/BackstopJS) distinguishes hiding volatile content from
  removing it and records scenario state.
- [Pixelmatch](https://github.com/mapbox/pixelmatch) provides antialias-aware pixel evidence, while
  structural tools such as [reg-suit](https://github.com/reg-viz/reg-suit) can identify moved or
  inserted regions.
- [Lost Pixel](https://github.com/lost-pixel/lost-pixel) supports multiple browsers, responsive
  viewports, masking and custom screenshot inputs.

These tools are optional references, not runtime dependencies of the skill.
