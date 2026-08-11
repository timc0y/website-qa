# Ways to run a Figma comparison

## In this file

- Fields every capture records
- Local, interactive and Forge methods
- Rules for pixel comparisons
- Checks recorded in the summary file

Choose one method per run. Record how the images were made and what the run
actually checked. The method's name alone proves nothing.

Every method resolves a frozen review plan. Capture providers may differ, but
none may construct the requested denominator from the evidence they happened to
produce.

## What every capture must record

Something must produce the pixels: local Playwright, an already-open browser, or
Forge. Whichever it is, it must supply the same fields for each capture. These
common fields let the same report format describe every method without
pretending that every method checked the same things.

| Field | Meaning when absent (`null`) |
|---|---|
| `path` or `artifactId` + `sha256` | no saved image; the cell is `not-compared` |
| `captureProvider` | always name the tool that made the image |
| `observedContentWidth` | horizontal findings cannot be `verified` |
| `settleMethod` | geometry findings drop to `visual-only` |
| `scriptsExecuted` | script-driven behavior findings drop to `suspected` |
| `viewport` | the run cannot claim `responsive` |

`null` means unknown. It never defaults to "fine." Capture conditions constrain
what a later reviewer may conclude; they do not create a conclusion themselves.
`scripts/capture.mjs` fills every field for a local run.

## `local-parity`

Use this mode when you can access the Figma nodes and a local, preview, or
public website from the current environment.

Expected checks: design node data and renders, live screenshots, numeric
measurements, visual comparison, and the requested breakpoint coverage.
Interactive states, pixel diffs, cross-browser comparison, and regression
history are optional. Declare each one separately.

This method is done when every requested comparison is covered or named as
missing and the summary file passes validation.

## `interactive-parity`

Use this method when the browser already carries authentication, local storage,
feature flags, or a state that needs trusted pointer or keyboard input. Save the
screenshots and measurements outside the browser session, so the proof
survives the run.

This method does not imply cross-browser support or repeatability. Record the
browser, the profile-derived state, the manual actions, and any state you could
not reproduce.

This method is done when a saved image and result exist for every comparison.

## `forge-live-evidence`

Use this method when Forge captures the rendered website or preview. This skill
still reads Figma and judges the match. Keep:

- the Forge file IDs and SHA-256 hashes;
- the source URL, and the requested and observed viewport;
- the workspace or commit, when available;
- `captureProvider: "forge"` on the affected files.

A Forge URL review normally supplies screenshots and accessibility structure. It
does not by itself prove design node extraction, numeric CSS measurements,
interaction transitions, pixel diffs, cross-browser behavior, or full matrix
coverage.

**This method cannot claim two checks**, because nothing local drove
the page. `interactionTransitions` is always `false`. `numericMeasurements` is
`false`, unless some other capture supplied real computed styles. Do not
compensate by reasoning from the screenshot. With no DOM to fall back on, the
Figma node data is your only numeric source. Read the node rather than trying to
measure its screenshot.

This method is done when you inspected the Forge images, paired them with exact
Figma nodes and listed every missing check.

## Compare pixels only when the same tool made both images

Images from different providers come from different browsers, operating
systems, and font stacks. Glyph rasterization and antialiasing alone will light
up a diff mask, and that noise is indistinguishable from a real finding.
`scripts/compare_images.py` refuses a cross-provider diff, unless you override
it explicitly.

Pixel differences are useful on **same-tool, same-URL, across-run**
comparisons. That comparison is regression testing, not parity. For a
Figma-render-versus-live pair, expect the dimensions to differ, because a height
delta usually *is* the finding.

## Checks recorded in the summary file

The summary file records true/false values for:

- `figmaNodeData`
- `figmaRenders`
- `liveScreenshots`
- `responsive`
- `numericMeasurements`
- `visualComparison`
- `pixelDiff`
- `interactiveStates`
- `interactionTransitions`
- `designSourceDefects`
- `crossBrowser`
- `regression`

Set a value to `true` only when the saved files prove that operation ran. `false`
and an omitted value both mean it was unavailable; prefer `false` because it is
clearer. In an observation-only manifest, `visualComparison` remains `false`:
paired files prove preparation, not inspection. A valid review attestation is
the separate proof that a named actor judged exact evidence against a criterion.
