---
name: figma-parity
description: >-
  Compare an implemented website or web app with its Figma source at matching
  breakpoints and states. Use this skill for Figma parity checks, design QA, and
  pixel-level review. Use it for design-to-code verification. Use it to check
  whether a live, preview, local, Astro, React, Webflow, or other rendered
  interface matches its design. This skill produces measured design-vs-rendered
  findings, paired and diff images, design-source defects, explicit coverage, and
  a portable evidence manifest. It can supply specialist evidence to Parallax, or
  use Forge captures. It runs independently of both.
---

# Figma parity

Compare a rendered interface with its **specific Figma source**. Produce measured,
reviewable evidence. Do not reduce parity to a screenshot similarity score.

## Independence boundary

This skill owns Figma interpretation, rendered-state comparison, and parity findings.
It can run without `website-qa`, Parallax, Forge, or a repository.

- `website-qa` answers **is the website broken?** Run it separately when you need
  defect coverage. An import of its output is not parity evidence. Console errors,
  failed requests, and overflow sweeps are *capture conditions* here. Record them as
  capture conditions and hand defect-hunting to `website-qa`. Do not grow a second QA
  skill inside this one.
- Parallax may invoke this skill and import `figma-parity-manifest.json`. This skill
  does not need to know how Parallax prioritizes product findings. Because Parallax
  consumes the packet, keep manifest changes **additive** under a raised
  `schemaVersion`. The validator warns on an unknown field. It does not fail on one.
- Forge may supply rendered screenshots or preview provenance. Preserve provider
  identity. State the capabilities Forge did not execute. Forge cannot establish
  Figma parity alone. This skill must still obtain the Figma reference and perform
  the comparison. Capture is an adapter behind one contract. See
  [execution-modes.md](references/execution-modes.md).

## Non-negotiable evidence rules

1. **Compare a specific node in a specific state.** Compare each rendered element
   with the exact Figma node or variant. Never compare it with a nearby global
   token. If you cannot isolate the node, label the observation `visual-only` and
   `unverified`.
2. **Match the conditions.** Match frame width, viewport width, state, color
   scheme, locale, content, and relevant data before you compare. A mismatch in
   conditions is a coverage limitation. It is not a product defect. **The window
   width is not the content width.** A reserved scrollbar gutter biases every
   horizontal measurement, and it does this silently.
3. **Confirm an absence with two signals.** Confirm a missing element with a clean
   screenshot and with rendered-structure inspection. A selector miss alone is not
   enough.
4. **Treat a pixel diff as evidence, not as a verdict.** Font rasterization,
   antialiasing, image encoding, and dynamic content create pixel changes with no
   design defect behind them. Use a diff to locate the change. Then verify the
   structure and the measurements. Never diff a capture from one provider against
   a capture from a different provider.
5. **Read the node. Do not read the render.** Base every color, gradient, and
   alignment claim on the node's own `fills` and coordinates. A composited export
   can mislead you about exactly these properties, and a finding built on a
   misread export usually gets reported as High.
6. **Treat an unknown condition as unresolved, not as acceptable.** A capture can
   fail to establish the observed content width, whether the page's own scripts
   ran, or whether the target changed mid-run. Each such gap lowers confidence.
   It never defaults to acceptable.
7. **Discover a control before you drive it.** A guessed selector fails in a way
   you cannot tell apart from a broken control. A guess therefore manufactures a
   false High.
8. **Keep the owners separate.** File a Figma contradiction under
   `designSourceDefects`. File a build mismatch under `findings`. File a stale
   project doc under `docDrift`. The owner `both` is correct when the Figma source
   itself is inconsistent.

## Choose an execution mode

Read [execution-modes.md](references/execution-modes.md). Select the strongest
available mode. Record its exact capabilities in the manifest.

- **`local-parity`**: the preferred mode. Obtain the Figma data or renders,
  capture the site locally or by public URL, measure it, compare the images, and
  inspect the relevant states.
- **`interactive-parity`**: use an already-open browser for authentication or for
  a trusted pointer state. Capture durable artifacts before you end the session.
- **`forge-live-evidence`**: a reduced mode. Forge supplies the rendered live
  screenshots. This skill still obtains the Figma reference and performs the
  comparison. State any missing interaction, measurement, or breakpoint coverage
  explicitly.

A run is complete only when you have compared every requested route, breakpoint,
and state combination, or listed it in `coverage.missing` with a reason.

## Workflow

### 1. Scope a comparison matrix

**Look for a project Figma map first.** Check for `FIGMA.md`, `docs/figma.md`, or
a `figma-map.json` beside them. A repository built from Figma usually already
records the node-to-selector pairing, the breakpoint mapping, and the
known-accepted mismatches. Reading this map is how you inherit intent instead of
inventing it. Read [project-map.md](references/project-map.md). If no map exists,
write one as a by-product of this run, so the next review starts where this one
finished.

**Build or refresh the component registry once per project, not once per
route.** List every Figma page. Then list every named component and every
component instance on each page, and record which route and which breakpoint
each instance belongs to. Store this list in the map's `components` field. See
[project-map.md](references/project-map.md) for the exact shape. Do this scan
once, before you scope any single route. A component crawl repeated per route
wastes work and drifts as the file changes.

**Use the registry to resolve a missing breakpoint before you call it a gap.**
A route can lack a mobile frame while a sibling route carries the same
component with a verified mobile frame. Check the registry first. If another
route's instance of the same component has the breakpoint you need, mark the
cell "covered via `<other-route>`," not "missing." Report a real gap only when
no route anywhere carries the component at that breakpoint. This check belongs
in the matrix, so record it in `coverage`, not only in your own head.

Collect:

- the live, preview, or local URL;
- the Figma file key and the node ID for every reference frame or component;
- the routes or components, breakpoints, states, themes, locales, and data cases;
- the repository commit or the preview revision, when available.

Use the Figma frame widths as the default viewport widths. A framework breakpoint
is an adapter, not a universal default. Choose the interactive mode for an
authenticated state or for an already-open state.

Read [figma-setup.md](references/figma-setup.md). Record a missing frame, an
ambiguous variant, an unresolved variable, scaffolding, and placeholder content
before you review the build.

**Also ask whether an external reference exists.** A client sometimes points at a
live site that does not appear in Figma at all. One real example: "not really
following the animation reference at example.com/services." Check the client
correspondence and comments for a bare URL next to the Figma link. If one exists,
record it in the project map under `externalReferences`. See
[project-map.md](references/project-map.md). A comparison against this URL sits
outside this skill's Figma-diff model. Hand it to a human visual check instead of
dropping it. This skill has no comparison engine for an external reference. A
silently discarded reference is still worse than a named gap.

**Completion:** every requested cell has a Figma node and a capture plan, or it has
a named blocker. The component registry exists and is current for this run, and
every "missing breakpoint" cell was checked against it before you named it a gap.

### 2. Establish the design intent numerically

Use an existing design spec when one exists. Otherwise, derive one and save it with
[`references/design-spec.md`](references/design-spec.md). Pull the section geometry
at a shallow depth. Then fetch the exact descendant node for anything likely to
become a finding.

Record a Figma contradiction immediately in `sourceDefects`. Never choose whichever
frame makes the build look correct.

**Completion:** the intended geometry, typography, color, components, and states
are tied to specific nodes. Mark an unresolved value as unverified.

### 3. Render the Figma references

Use the available Figma connector to export each scoped node. Prefer a direct node
screenshot over a crop of a full-page frame. When only a full frame is available,
use `scripts/crop_figma_sections.py` and record the inferred alignment.

Keep the original render, the node ID, the exported dimensions, the scale, and the
timestamp together. Do not crop browser chrome, an annotation, a cursor, or a
redline into the reference.

**Completion:** every planned reference is a durable image with node provenance.

### 4. Capture matching rendered states

Read [capture-determinism.md](references/capture-determinism.md). Then run the
harness:

```bash
node scripts/capture.mjs --url <url> --width 1512 --label desktop \
  --map figma-map.json --out <run-dir>
```

The harness probes the reserved scrollbar gutter and compensates for it. It sweeps
scroll-linked reveals. It settles the fonts, the images, and the height. It
fingerprints the served document at the start and at the end. It records whether
the page's own scripts ran. It writes `live/capture-<label>.json`, the capture
contract every provider must satisfy. Run it twice. Two agreeing runs are your only
cheap evidence that the page is stable.

Check three fields before you compare anything. A `contentWidthMatches: false`
value invalidates every horizontal finding. A `target.stable: false` value means
the page was republished mid-run. An unexecuted primary bundle means you are
looking at an unfinished page.

At minimum, whatever the provider:

- set the exact CSS viewport width and a fixed height;
- wait for the fonts, the images, and the hydration to settle;
- disable the animations, or let them finish, consistently;
- use matching content, data, and state;
- record every intentionally masked volatile region;
- capture the full page, or the same component or section boundary Figma uses.

Use `scripts/live_probe.js` for section mapping and measurements. For
framework-specific behavior, read only the relevant adapter in
[platform-adapters.md](references/platform-adapters.md).

**Completion:** each rendered capture names its URL, viewport, state, settle
method, provenance, masks, and limitations.

### 5. Compare in four passes

1. **Structure:** presence, count, order, arrangement, responsive substitution, and
   correct asset and content role.
2. **Measured intent:** section padding, component geometry, type, color, gaps, and
   alignment. Compare top-to-top offsets around text, because a CSS line box and a
   Figma glyph bound differ. Two properties are easy to skip, because they rarely
   appear in a node's headline description. Check them explicitly on every
   section. Check **`opacity`** on body text and on every overlay, not only on a
   scrim. Check **icon or SVG `fill`** on each icon instance, not only on the
   section background. A brighter or a dimmer token on one icon in a row is
   invisible to a section-level color check. It is obvious to a person scanning
   the page.
3. **Visual character:** crop and focal point, hierarchy, density, shadow,
   gradient, texture, icon weight, and collision.
4. **Boundary and adjacency:** for every pair of vertically adjacent sections, diff
   the *computed* background of one against the computed background of the other.
   Do not diff each section only against its own Figma node. Two sections can each
   match their own node exactly, and still produce a visible seam. One real
   example: "white background above, pale blue background below." No single-node
   comparison can catch a seam like this. Run this pass on every page in the
   matrix. Do not run it on a sample only.

Build the side-by-side images with `scripts/compose_review.py`. **Always pass
`--map`**, so the tool matches pairs by section name against a declared node:

```bash
python3 scripts/compose_review.py --figma-dir figma --live-dir live \
  --map figma-map.json --label desktop --breakpoint desktop-1512 --out review
```

Without `--map`, the tool falls back to a match on the two-digit filename index.
This pairs `02-nav` with `02-trust-bar` and produces a nonsense sheet, and it does
this *without an error*. The tool warns and records the fallback mode in
`pairs.json`. Treat that warning as a defect in the run.

When two images have identical dimensions, run `scripts/compare_images.py` for an
objective diff mask and for metrics. The dimensions usually will not match. A
height delta is normally the finding itself, so expect the measurement, not the
diff, to carry the report. Read [visual-diff.md](references/visual-diff.md) before
you interpret a result.

**Completion:** you inspected every image pair. Every reported delta rests on a
specific node plus a measurement, or on clearly labeled visual evidence.

### 6. Inspect interactive and responsive states

**Discover the real control hooks first. This step is not optional.**

```bash
node scripts/discover_controls.mjs --url <url> --out controls.json
```

The tool lists the framework `data-*` hooks, the native and ARIA controls, and the
class-name candidates. It flags every control that is an `<a href>`, because a
synthetic click on this control will **navigate**, not toggle. Prefer a `data-*`
hook over a class name. A class gets restyled. A hook stays wired.

A skip of this step produces the most expensive failure mode in the whole
workflow. A guessed selector yields a click timeout and an unchanged transform.
These two symptoms read exactly like a dead control and a broken carousel, and a
report writer records them as High. Verify a state change numerically. Check an
attribute flip, a panel height, or a track transform. Do not rely on sight alone.

**Run `discover_controls.mjs`. Click-test every discovered non-link control, on
every route in the matrix. Do not limit this test to the controls a brief happens
to name.** A scope limited to a couple of named controls, such as an accordion and
a mobile nav, leaves everything else untested. It also leaves no record of the
skip. Real
examples: a filter, a hover state on an arbitrary link or button, and a nav's
scroll-hide and scroll-show behavior on a page where you did not re-verify it. If
time is short, say so explicitly. Log a "Not checked" line for each control on
each page. Do not write one blanket disclaimer for the whole site. A mechanism
confirmed on one page is not confirmed on the next page.

Then exercise the real controls: menus, dialogs, accordions, tabs, sliders, focus,
hover, validation, and result states. A forced visibility can verify the panel
layout. It cannot verify the interaction that opens the panel. Record these as
distinct capabilities.

Check the widths between the supplied Figma frames for overflow and for reflow.
Do not invent a design intent for an undocumented intermediate width. Report it as
a website defect, or as a missing design breakpoint, as appropriate.

**Completion:** the state evidence proves the state's appearance, and, where you
claim it, proves the transition into that state.

### 7. Run complementary website QA when requested

Invoke `website-qa` independently against the same URLs. Keep the accessibility,
dead-link, forms, console/network, SEO, and regression findings in their own
sections. A design parity result does not imply a website quality result. A
website quality result does not imply parity.

### 8. Write and validate the evidence packet

Follow [report-template.md](references/report-template.md). Produce:

1. timestamped paired images and, optionally, diff masks, for each breakpoint and
   state;
2. a `report.md` file with the design-source defects, the parity findings, the
   documentation drift, the verified matches, and the missing coverage;
3. a `figma-parity-manifest.json` file that conforms to
   [parity-manifest.schema.json](references/parity-manifest.schema.json).

Assemble the manifest from the artifacts. Do not assemble it by hand. The
capabilities derive from what exists, and the capture contract seeds the
limitations:

```bash
node scripts/build_manifest.mjs --run <run-dir> --map figma-map.json \
  --mode local-parity --label desktop [--findings findings.json]
node scripts/validate_manifest.mjs <run-dir>/figma-parity-manifest.json
```

The validator rejects a packet that claims `verified` on a capture whose
conditions were unknown. It rejects a packet that claims
`interactionTransitions` under `forge-live-evidence`. It rejects a packet that
hides a mid-run target change. Before you publish a finding, run the pre-publish
checklist at the end of [report-template.md](references/report-template.md).
Every item on that checklist has produced a false High in practice.

**Carry a finding sourced from a Figma comment or from client correspondence
through to the open-items list unconditionally.** Tag it with its own confidence
level. Do not filter it out during consolidation for lacking a hard node-level
mismatch. A team can log a soft finding mid-run, then drop it from the final report because
"it isn't a real defect." This is the single most expensive failure mode in
consolidation. The client already knows they asked for it. See "Soft findings
survive consolidation" in [report-template.md](references/report-template.md).

The packet provider is always `figma-parity`. A Forge artifact referenced by the
packet keeps `captureProvider: "forge"`. Do not relabel it as a local capture.

## Report confidence

- **verified**: an exact Figma node plus a rendered measurement, or an inspected
  matching capture;
- **visual-only**: a visible comparison with no reliable numeric or node
  isolation;
- **suspected**: evidence points to a mismatch, but the conditions or the state
  are incomplete;
- **not-compared**: the required matrix cell is missing.

Rank the severity by user impact and by design-system scope. Do not rank it by raw
pixel count. A missing control outranks widespread antialiasing noise.
