# Execution modes

Choose one mode per run. The mode describes how you obtained the evidence.
Capabilities describe what you actually proved. Never infer capabilities from
the mode name alone.

## The capture contract

Something must produce the pixels: local Playwright, an already-open browser, or
Forge. Whichever it is, it must supply the same fields for each capture. This
requirement is what makes the modes interchangeable, without making their
evidence equivalent.

| Field | Meaning when absent (`null`) |
|---|---|
| `path` or `artifactId` + `sha256` | no evidence at all; the cell is `not-compared` |
| `captureProvider` | never absent; identity is preserved, never relabelled |
| `observedContentWidth` | horizontal findings cannot be `verified` |
| `settleMethod` | geometry findings drop to `visual-only` |
| `scriptsExecuted` | script-driven behavior findings drop to `suspected` |
| `viewport` | the run cannot claim `responsive` |

`null` means unknown. An unknown value degrades confidence. It never defaults to
"fine." `scripts/capture.mjs` fills every field for a local run, and it is the
reference implementation.

## `local-parity`

Use this mode when you can access the Figma nodes and a local, preview, or
public website from the current environment.

Expected capabilities: design node data and renders, live screenshots, numeric
measurements, visual comparison, and the requested breakpoint coverage.
Interactive states, pixel diffs, cross-browser comparison, and regression
history are optional. Declare each one separately.

This mode is complete when the requested matrix is accounted for and the
manifest validates.

## `interactive-parity`

Use this mode when the browser already carries authentication, local storage,
feature flags, or a state that needs trusted pointer or keyboard input. Save the
screenshots and the measurements outside the browser session, so the evidence
survives the run.

This mode does not imply cross-browser support or repeatability. Record the
browser, the profile-derived state, the manual actions, and any state you could
not reproduce.

This mode is complete when durable artifacts exist for every compared matrix
cell.

## `forge-live-evidence`

Use this mode when Forge captures the rendered website or preview. Figma access
and the parity judgment stay this skill's responsibility. Preserve:

- the Forge artifact IDs and the SHA-256 hashes;
- the source URL, and the requested and observed viewport;
- the workspace or commit provenance, when available;
- `captureProvider: "forge"` on the affected evidence.

A Forge URL review normally supplies screenshots and accessibility structure. It
does not by itself prove design node extraction, numeric CSS measurements,
interaction transitions, pixel diffs, cross-browser behavior, or full matrix
coverage.

**This mode cannot set two capabilities to true**, because nothing local drove
the page. `interactionTransitions` is always `false`. `numericMeasurements` is
`false`, unless some other capture supplied real computed styles. Do not
compensate by reasoning from the screenshot. With no DOM to fall back on, the
Figma node data is your only numeric source. This is why "read the node, not
the render" is load-bearing here, not merely advisable.

This mode is complete when you retrieved and inspected the Forge images, paired
them with specific Figma nodes, and made every missing capability explicit.

## Never diff across providers

Images from different providers come from different browsers, operating
systems, and font stacks. Glyph rasterization and antialiasing alone will light
up a diff mask, and that noise is indistinguishable from a real finding.
`scripts/compare_images.py` refuses a cross-provider diff, unless you override
it explicitly.

Pixel diffs earn their place on **same-provider, same-URL, across-run**
comparisons. That comparison is regression testing, not parity. For a
Figma-render-versus-live pair, expect the dimensions to differ, because a height
delta usually *is* the finding.

## Capability vocabulary

A manifest declares booleans for:

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

Set a capability to `true` only when the evidence packet contains the
corresponding evidence. `false` and omitted both mean the capability is
unavailable. Prefer `false` for clarity. `scripts/build_manifest.mjs` derives
these values from the artifacts that exist. This is the safer default; it does
not ask you to remember them.
