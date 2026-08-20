---
name: figma-parity
description: >-
  Compare any implemented website or web app with its Figma source at matching
  breakpoints and states. Use for Figma parity, design QA, pixel-level review,
  design-to-code verification, or checking whether a live, preview, local, Astro,
  React, Webflow, or other rendered interface matches its design. Produces measured
  design-vs-rendered findings, paired and diff images, design-source defects, explicit
  coverage, and a portable evidence manifest. Can provide specialist evidence to
  Parallax or use Forge captures, but runs independently of both.
---

# Figma parity

Compare a rendered interface with its **specific Figma source**. Produce measured,
reviewable evidence; do not reduce parity to a screenshot similarity score.

## Independence boundary

This skill owns Figma interpretation, rendered-state comparison, and parity findings.
It can run without `website-qa`, Parallax, Forge, or a repository.

- `website-qa` answers **is the website broken?** Run it separately when defect coverage
  is wanted. Importing its output does not make that output parity evidence. Console
  errors, failed requests and overflow sweeps are *capture conditions* here — record them
  as such and hand defect-hunting over, rather than growing a second QA skill.
- Parallax may invoke this skill and import `figma-parity-manifest.json`. The skill does
  not need to know how Parallax prioritises product findings. Because Parallax consumes
  the packet, manifest changes stay **additive** under a bumped `schemaVersion`; the
  validator warns on unknown fields instead of failing.
- Forge may supply rendered screenshots or preview provenance. Preserve provider
  identity and declare the capabilities it did not execute. Forge cannot establish
  Figma parity unless the Figma reference was independently obtained and compared.
  Capture is an adapter behind one contract — see [execution-modes.md](references/execution-modes.md).

## Non-negotiable evidence rules

1. **Specific node, specific state.** Compare each rendered element with the exact Figma
   node or variant, never a nearby global token. If the node cannot be isolated, label the
   observation `visual-only` and `unverified`.
2. **Same conditions.** Match frame width, viewport width, state, colour scheme, locale,
   content, and relevant data before comparing. A mismatch in conditions is a coverage
   limitation, not a product defect. **The window width is not the content width** — a
   reserved scrollbar gutter silently biases every horizontal measurement.
3. **Absence needs two signals.** Confirm a missing element with a clean screenshot and
   rendered-structure inspection. A selector miss alone is insufficient.
4. **Pixel diffs are evidence, not verdicts.** Font rasterisation, antialiasing, image
   encoding and dynamic content create pixel changes without a design defect. Use diffs
   to locate change, then verify structure and measurements. Never diff across capture
   providers.
5. **Read the node, not the render.** Colour, gradient and alignment claims must come from
   the node's own `fills` and coordinates. Composited exports mislead about exactly these
   properties, and such findings usually get reported as High.
6. **Unknown is not fine.** Any condition the capture could not establish — observed
   content width, whether the page's own scripts ran, whether the target changed mid-run —
   degrades confidence. It never defaults to acceptable.
7. **Discover controls before driving them.** A guessed selector fails in a way that is
   indistinguishable from a broken control, so guessing manufactures false Highs.
8. **Separate owners.** Figma contradictions belong under `designSourceDefects`; build
   mismatches under `findings`; a stale project doc under `docDrift`. Owner `both` is
   legitimate when the Figma source is internally inconsistent.

## Choose an execution mode

Read [execution-modes.md](references/execution-modes.md), select the strongest available
mode, and record its exact capabilities in the manifest.

- **`local-parity`** — preferred. Obtain Figma data/renders, capture the site locally or
  by public URL, measure it, compare images, and inspect relevant states.
- **`interactive-parity`** — use an already-open browser for authentication or trusted
  pointer state. Capture durable artifacts before ending.
- **`forge-live-evidence`** — reduced. Forge supplies rendered live screenshots; this
  skill still obtains the Figma reference and performs the comparison. Missing interaction,
  measurement, or breakpoint coverage stays explicit.

A run is complete only when every requested route × breakpoint × state is either compared
or listed in `coverage.missing` with a reason.

## Workflow

### 1. Scope a comparison matrix

**Look for a project Figma map first** — `FIGMA.md`, `docs/figma.md`, or a
`figma-map.json` beside them. A repo built from Figma usually already records the
node ↔ selector pairing, the breakpoint mapping and the known-accepted mismatches, which
is the difference between inventing intent and inheriting it. Read
[project-map.md](references/project-map.md); if no map exists, write one as a by-product
so the next review starts where this one finished.

Collect:

- live, preview, or local URL;
- Figma file key and node ID for every reference frame or component;
- routes/components, breakpoints, states, themes, locales, and data cases;
- repository commit or preview revision when available.

Use Figma frame widths as the default viewport widths. Framework breakpoints are adapters,
not universal defaults. For authenticated or already-open state, choose interactive mode.

Read [figma-setup.md](references/figma-setup.md). Record missing frames, ambiguous variants,
unresolved variables, scaffolding, and placeholder content before reviewing the build.

**Completion:** every requested cell has a Figma node and capture plan, or a named blocker.

### 2. Establish design intent numerically

Use an existing design spec when one exists. Otherwise derive and save one using
[`references/design-spec.md`](references/design-spec.md). Pull section geometry at a shallow
depth, then fetch the exact descendant node for anything likely to become a finding.

Record Figma contradictions immediately in `sourceDefects`; never quietly choose whichever
frame makes the build look correct.

**Completion:** intended geometry, typography, colour, components and states are tied to
specific nodes; unresolved values are marked unverified.

### 3. Render Figma references

Use the available Figma connector to export each scoped node. Prefer direct node screenshots
over cropping a full-page frame. When only a full frame is available, use
`scripts/crop_figma_sections.py` and record the inferred alignment.

Keep the original render, node ID, exported dimensions, scale, and timestamp together.
Do not crop browser chrome, annotations, cursors, or redlines into the reference.

**Completion:** every planned reference is a durable image with node provenance.

### 4. Capture matching rendered states

Read [capture-determinism.md](references/capture-determinism.md), then run the harness:

```bash
node scripts/capture.mjs --url <url> --width 1512 --label desktop \
  --map figma-map.json --out <run-dir>
```

It probes the reserved scrollbar gutter and compensates, sweeps scroll-linked reveals,
settles fonts/images/height, fingerprints the served document at start and end, records
whether the page's own scripts ran, and writes `live/capture-<label>.json` — the capture
contract every provider must satisfy. Run it twice: two agreeing runs are your only cheap
evidence that the page is stable.

Check three fields before comparing anything. `contentWidthMatches: false` invalidates
every horizontal finding; `target.stable: false` means the page was republished mid-run;
an unexecuted primary bundle means you are looking at an unfinished page.

At minimum, whatever the provider:

- set the exact CSS viewport width and a fixed height;
- wait for fonts, images and hydration to settle;
- disable or finish animations consistently;
- use matching content/data and state;
- record every intentionally masked volatile region;
- capture the full page or the same component/section boundary as Figma.

Use `scripts/live_probe.js` for section mapping and measurements. For framework-specific
behaviour, read only the relevant adapter in [platform-adapters.md](references/platform-adapters.md).

**Completion:** each rendered capture names its URL, viewport, state, settle method,
provenance, masks, and limitations.

### 5. Compare in three passes

1. **Structure:** presence, count, order, arrangement, responsive substitution, correct
   asset and content role.
2. **Measured intent:** section padding, component geometry, type, colour, gaps and
   alignment. Compare top-to-top offsets around text because CSS line boxes and Figma
   glyph bounds differ.
3. **Visual character:** crop/focal point, hierarchy, density, shadow, gradient, texture,
   icon weight and collision.

Build side-by-sides with `scripts/compose_review.py`, **always passing `--map`** so pairs
are matched by section name against a declared node:

```bash
python3 scripts/compose_review.py --figma-dir figma --live-dir live \
  --map figma-map.json --label desktop --breakpoint desktop-1512 --out review
```

Without `--map` it falls back to matching the two-digit filename index, which will pair
`02-nav` with `02-trust-bar` and produce a nonsense sheet *without erroring*. It warns and
records the mode in `pairs.json`; treat that warning as a defect in the run.

When images have identical dimensions, run `scripts/compare_images.py` for an objective
diff mask and metrics. They usually will not — a height delta is normally the finding
itself — so expect measurement, not diffing, to carry the report. Read
[visual-diff.md](references/visual-diff.md) before interpreting any result.

**Completion:** every image pair was actually inspected, and every reported delta is backed
by a specific node plus a measurement or clearly labelled visual evidence.

### 6. Inspect interactive and responsive states

**Discover the real control hooks first — this step is not optional:**

```bash
node scripts/discover_controls.mjs --url <url> --out controls.json
```

It lists the framework `data-*` hooks, native/ARIA controls and class-name candidates,
and flags every control that is an `<a href>` and will therefore **navigate** under a
synthetic click rather than toggle. Prefer a `data-*` hook to a class name: classes get
restyled, hooks are wired.

Skipping this produces the most expensive failure mode in the whole workflow. A guessed
selector yields a click timeout and an unchanged transform — which read exactly like a
dead control and a broken carousel, and get written up as High. Verify the state change
numerically (an attribute flip, a panel height, a track transform), not just visually.

Then exercise real controls: menus, dialogs, accordions, tabs, sliders, focus,
hover, validation and result states. Forced visibility can verify panel layout but does not
verify the interaction that opens it. Record those as distinct capabilities.

Check widths between supplied Figma frames for overflow and reflow, but do not invent design
intent for an undocumented intermediate width. Report it as a website defect or a missing
design breakpoint as appropriate.

**Completion:** state evidence proves both the state appearance and, where claimed, the
transition into it.

### 7. Run complementary website QA when requested

Invoke `website-qa` independently against the same URLs. Keep accessibility, dead links,
forms, console/network, SEO and regression findings in their own sections. Design parity
does not imply website quality, and website quality does not imply parity.

### 8. Write and validate the evidence packet

Follow [report-template.md](references/report-template.md). Produce:

1. timestamped paired images and optional diff masks per breakpoint/state;
2. `report.md` with design-source defects, parity findings, documentation drift, verified
   matches, and missing coverage;
3. `figma-parity-manifest.json` conforming to
   [parity-manifest.schema.json](references/parity-manifest.schema.json).

Assemble the manifest from the artifacts rather than by hand — capabilities are derived
from what exists, and the capture contract seeds the limitations:

```bash
node scripts/build_manifest.mjs --run <run-dir> --map figma-map.json \
  --mode local-parity --label desktop [--findings findings.json]
node scripts/validate_manifest.mjs <run-dir>/figma-parity-manifest.json
```

The validator rejects a packet that claims `verified` on a capture whose conditions were
unknown, that claims `interactionTransitions` under `forge-live-evidence`, or that hides a
mid-run target change. Before publishing any finding, run the pre-publish checklist at the
end of [report-template.md](references/report-template.md) — every item on it has produced
a false High in practice.

The packet provider is always `figma-parity`. Forge artifacts referenced by it retain
`captureProvider: "forge"`; they are not relabelled as local captures.

## Report confidence

- **verified** — exact Figma node plus rendered measurement or inspected matching capture;
- **visual-only** — visible comparison without reliable numeric/node isolation;
- **suspected** — evidence points to a mismatch but conditions or state are incomplete;
- **not-compared** — required matrix cell is missing.

Rank severity by user impact and design-system scope, not raw pixel count. A missing control
outranks widespread antialiasing noise.
