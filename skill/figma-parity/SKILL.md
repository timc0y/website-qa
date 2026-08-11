---
name: figma-parity
description: >-
  Check whether a built website matches specific Figma nodes at the same widths
  and states. Use for design QA, pixel-level review and design-to-code checks on
  live, preview or local sites. Produces measurements, paired images, confirmed
  differences and a clear list of anything that could not be compared.
---

# Figma parity

Compare a built page with its exact Figma source. Use measurements and paired
images, then explain the differences in plain English. A similarity score alone
is not enough.

Use `website-qa` separately when the user also wants broken links, forms,
accessibility, SEO, console errors or general website defects.

## Rules

1. Compare a specific Figma node with a specific page element and state. If the
   node cannot be isolated, mark the result `visual-only` or `unverified`.
2. Match width, content, state, colour scheme, locale and data. A different test
   condition is missing coverage, not a build defect.
3. Measure the page's content width. Browser chrome and scrollbar space can make
   the viewport narrower than the requested window.
4. Confirm a missing element with both a clean screenshot and a page-structure
   check. A selector miss is not proof.
5. Use pixel differences to locate a change, then inspect it. Fonts, image
   encoding and moving content can change pixels without changing the design.
6. Compare images made by the same capture method. Different methods can render
   fonts and colours differently.
7. Keep Figma mistakes separate from build mistakes. Use `designSourceDefects`
   for Figma, `findings` for the build and `docDrift` for stale project notes.
8. Treat an unknown condition as unresolved. Do not turn it into a pass.

## Choose how to run it

Read [execution-modes.md](references/execution-modes.md), then use the strongest
available method:

- **`local-parity`** — preferred. Read Figma, capture the site, take
  measurements and compare the images locally.
- **`interactive-parity`** — use an already-open browser for signed-in or
  carefully prepared states. Save the images before the session ends.
- **`forge-live-evidence`** — Forge supplies the live screenshots. This skill
  still reads Figma and performs the comparison. List any missing interaction,
  measurement or width checks.

Run the bundled commands from the directory containing this file and `scripts/`,
or use their full paths. Save maps, captures and reports in the reviewed
project's approved private work folder.

## Work in this order

### 1. List every comparison

Look for `FIGMA.md`, `docs/figma.md` or `figma-map.json` in the project first.
Read [project-map.md](references/project-map.md). The map should link each route,
component, width and state to its Figma node and live selector.

For a single page or component, keep the list narrow. For a site-wide review,
include every relevant route and reused component. Before marking a mobile or
desktop design as missing, check whether another instance of the same component
contains that state.

Record:

- the live, preview or local URL;
- each Figma file key and node ID;
- routes, components, widths, states, themes, locales and data cases; and
- the repository commit or preview version when available.

Read [figma-setup.md](references/figma-setup.md). Record missing frames,
ambiguous variants, unresolved variables and placeholder content before the
review. Also record any live animation or website reference supplied outside
Figma. It needs a separate human comparison rather than being silently dropped.

This step is done when every requested comparison has a Figma node and capture
plan, or a named blocker. Put the complete denominator in
`figma-map.json.reviewPlan.cells`, then freeze the route and breakpoint before
capturing:

```bash
node scripts/freeze_plan.mjs --map figma-map.json --route /service-b \
  --breakpoint 393 --out <run-dir>/review-plan.json
```

Read `references/review-plan.schema.json` when producing or consuming the plan.
Do not edit the map after freezing it; create a new plan when scope changes.

### 2. Record what Figma intends

Use an existing design spec when one exists. Otherwise create one using
[design-spec.md](references/design-spec.md). Record exact geometry, type, colour,
components and states against their node IDs. Record contradictions in Figma as
`sourceDefects` instead of choosing whichever value makes the build look right.

Load the current Figma design-to-code prerequisite before calling
`get_design_context`. Export each exact node. Prefer a node screenshot over a
crop from a full page. If cropping is unavoidable, use
`scripts/crop_figma_sections.py` and record how the crop was aligned.

Keep the image, node ID, dimensions, scale and time together.

### 3. Capture the matching page

Read [capture-determinism.md](references/capture-determinism.md), then run:

```bash
node scripts/capture.mjs --url <url> --width 1512 --label desktop \
  --map figma-map.json --plan <run-dir>/review-plan.json --out <run-dir>
```

Run each capture twice. Two matching runs show that fonts, images, animation and
page height have settled.

Before comparing, check:

- `contentWidthMatches` is true;
- `target.stable` is true; and
- the page's main JavaScript ran when the page needs it.

Use `scripts/live_probe.js` for section measurements. Read only the relevant
part of [platform-adapters.md](references/platform-adapters.md) when a framework
needs special handling.

### 4. Compare the result

Check four things:

1. **Structure** — presence, count, order, layout, responsive replacement,
   assets and content.
2. **Measurements** — padding, size, type, colour, opacity, SVG fills, gaps and
   alignment. Compare top-to-top text positions rather than copying Figma's box
   gaps directly.
3. **Appearance** — crop, focal point, hierarchy, density, shadows, gradients,
   texture, icon weight and collisions.
4. **Section joins** — compare the backgrounds of every neighbouring pair of
   sections. Two sections can each match Figma while still forming a wrong seam.

Create paired images with a map so names, rather than filename numbers, decide
which images belong together:

```bash
python3 scripts/compose_review.py --figma-dir figma --live-dir live \
  --map figma-map.json --label desktop --breakpoint desktop-1512 --out review
```

Treat a fallback to filename-number matching as a failed run. Read
[visual-diff.md](references/visual-diff.md) before interpreting
`scripts/compare_images.py` output.

This step is done when every image pair has been inspected and each reported
difference points to a node plus a measurement, or clearly labelled visual proof.

### 5. Check controls and responsive states

Discover the real controls before trying to click them:

```bash
node scripts/discover_controls.mjs --url <url> --out controls.json
```

Test every discovered non-link control on every page in scope. Check menus,
dialogs, accordions, tabs, sliders, focus, hover, validation and result states.
Prove that the state changed by checking an attribute, panel size or transform.
A forced-open panel proves its layout, not the control that opens it.

Check widths between the supplied Figma frames for overflow and reflow. Do not
invent design intent for a width Figma does not cover; report it as a website
problem or a missing design decision.

### 6. Write and check the report

Follow [report-template.md](references/report-template.md). Save:

1. paired images and optional difference masks for each width and state;
2. `report.md`, including Figma problems, build differences, verified matches
   and missing coverage; and
3. `figma-parity-manifest.json`, a short index of the run.
4. `review-attestation.json`, when a human or named automated reviewer has
   actually judged the saved evidence against an explicit criterion.

Build and validate the index from the saved files:

```bash
node scripts/build_manifest.mjs --run <run-dir> --map figma-map.json \
  --plan <run-dir>/review-plan.json --mode local-parity --label desktop \
  [--findings findings.json]
node scripts/validate_manifest.mjs <run-dir>/figma-parity-manifest.json
```

The validator rejects legacy v1–v3 self-certifying manifests by default. Use
`--allow-legacy` only to inspect or migrate an old packet; it cannot satisfy a
delivery QA gate.

The generated manifest contains observations only. It must never claim that an
image was inspected or that it matches. After inspection, create and validate a
separate artifact-bound attestation:

```bash
node scripts/attest_review.mjs --manifest <run-dir>/figma-parity-manifest.json \
  --actor-kind automated --actor-id "codex-visual-review" \
  --criterion "Hero matches node 550:6340 at 393px in the default state" \
  --verdict match --evidence mobile-01-hero \
  --out <run-dir>/review-attestation.json
node scripts/validate_attestation.mjs <run-dir>/review-attestation.json
```

Use the exact probe or agent identity for AI or scripted review. Unsigned human
identity is not trusted: `human-unverified` may preserve a non-gating review
record, while `human` is rejected until trusted signing and key ownership are
configured. Never present automated review as human inspection. Read
`references/review-attestation.schema.json` when producing or consuming this
file.

Keep any concern taken from a Figma comment or client message in the open-items
list, even when it has no exact node-level measurement. Label its confidence
instead of deleting it.

## Conclusion confidence

- **verified** — a conclusion backed by a valid attestation for exact evidence
  and an explicit criterion; never a property generated from capture stability;
- **visual-only** — visible difference without a reliable measurement or exact
  node;
- **suspected** — the evidence points to a difference but the conditions are
  incomplete; and
- **not-compared** — the required page, width or state is missing.

Rank importance by user impact and how widely the problem appears, not by the
raw number of changed pixels.

## Done means

- every requested route, width and state was compared or named as missing;
- `coverage.requested` exactly matches the frozen pre-capture plan;
- every finding has an exact Figma source or is clearly marked visual-only;
- every claimed match or mismatch has a valid human or named automated
  attestation bound to the manifest and reviewed artifact hashes;
- controls were discovered before being tested;
- Figma problems, build problems and stale notes are kept separate; and
- the report and manifest pass their checks.

Read [known-blind-spots-2026-08-07.md](references/known-blind-spots-2026-08-07.md)
when changing this skill. It records the failures that led to the checks for
section joins, complete control testing, comments, outside references and
deleted requirements.
