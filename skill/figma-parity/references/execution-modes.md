# Execution modes

Choose one mode per run. The mode describes how evidence was obtained; capabilities
describe what was actually proved. Never infer capabilities from the mode name alone.

## The capture contract

Whatever produces the pixels — local Playwright, an already-open browser, Forge — must
supply the same fields per capture. This is what makes the modes interchangeable without
making their evidence equivalent.

| Field | Meaning when absent (`null`) |
|---|---|
| `path` or `artifactId` + `sha256` | no evidence at all; the cell is `not-compared` |
| `captureProvider` | never absent; identity is preserved, never relabelled |
| `observedContentWidth` | horizontal findings cannot be `verified` |
| `settleMethod` | geometry findings drop to `visual-only` |
| `scriptsExecuted` | script-driven behaviour findings drop to `suspected` |
| `viewport` | the run cannot claim `responsive` |

`null` means unknown. Unknown degrades confidence; it never defaults to "fine".
`scripts/capture.mjs` fills every field for a local run and is the reference
implementation.

## `local-parity`

Use when Figma nodes and a local, preview, or public website can be accessed from the
current environment.

Expected capabilities: design node data and renders, live screenshots, numeric
measurements, visual comparison, and requested breakpoint coverage. Interactive states,
pixel diffs, cross-browser comparison, and regression history are optional and must be
declared separately.

Complete when the requested matrix is accounted for and the manifest validates.

## `interactive-parity`

Use when the browser already carries authentication, local storage, feature flags, or a
state that requires trusted pointer/keyboard input. Save screenshots and measurements
outside the browser session so evidence survives the run.

This mode does not imply cross-browser or repeatability. Record the browser,
profile-derived state, manual actions, and any state that could not be reproduced.

Complete when durable artifacts exist for every compared matrix cell.

## `forge-live-evidence`

Use when Forge captures the rendered website or preview. Figma access and parity
judgement remain this skill's responsibility. Preserve:

- Forge artifact IDs and SHA-256 hashes;
- source URL, requested and observed viewport;
- workspace/commit provenance when available;
- `captureProvider: "forge"` on affected evidence.

Forge URL review normally supplies screenshots and accessibility structure. It does not
by itself prove design node extraction, numeric CSS measurements, interaction
transitions, pixel diffs, cross-browser behaviour, or full matrix coverage.

**Capabilities this mode cannot set true**, because nothing local drove the page:
`interactionTransitions` is always `false`, and `numericMeasurements` is `false` unless
some other capture supplied real computed styles. Do not compensate by reasoning from
the screenshot — with no DOM to fall back on, Figma node data is your only numeric
source, which makes "read the node, not the render" load-bearing rather than merely
advisable.

Complete when the Forge images have been retrieved and inspected, paired with specific
Figma nodes, and every missing capability is explicit.

## Never diff across providers

Images from different providers come from different browsers, OSes and font stacks.
Glyph rasterisation and antialiasing alone will light up a diff mask, and that noise is
indistinguishable from a finding. `scripts/compare_images.py` refuses a cross-provider
diff unless explicitly overridden.

Pixel diffs earn their place on **same-provider, same-URL, across-run** comparisons —
that is regression, not parity. For a Figma-render-versus-live pair, expect the
dimensions to differ, because a height delta usually *is* the finding.

## Capability vocabulary

Manifests declare booleans for:

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

Set a capability to `true` only when the evidence packet contains corresponding
evidence. False and omitted both mean the capability is unavailable; false is preferred
for clarity. `scripts/build_manifest.mjs` derives these from the artifacts that exist
rather than asking you to remember, which is the safer default.
