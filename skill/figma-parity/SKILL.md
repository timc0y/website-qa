---
name: figma-parity
description: >-
  Check whether a built website matches specific Figma nodes at the same widths
  and states. Use for design QA, pixel-level review and design-to-code checks on
  live, preview or local sites. Produces measurements, paired images, confirmed
  differences and a clear list of anything that could not be compared.
---

# Figma parity

Determine whether a rendered selection matches approved design under equivalent,
evidenced conditions. Use measurements and paired images; a similarity score is
insufficient. Use `website-qa` separately for general website defects.

Use `boundary → contract → selection → profile → execution → evidence → outcome → replay`.

## Contract and profile

Bind each comparison to exact live selection, Figma file/node, declared canonical
canvas/version, route, width, state, theme, locale, content/data case, capture
method, and deployment when known. Record the denominator before sampling.

- `targeted`: one selection/difference.
- `standard`: declared routes and components.
- `deep`: more states plus independent visual verification.
- `launch`: every required comparison with durable evidence.

Profiles never relax condition equivalence. See
[review-profiles.md](references/review-profiles.md).

## Rules

1. Compare one exact node with one exact element/state. If isolation fails, use
   `visual-only` or `unverified`.
2. Match width, content, state, scheme, locale, and data. Condition mismatch is
   missing coverage, not a build defect.
3. Measure content width; browser chrome/scrollbars can narrow the viewport.
4. Confirm absence with screenshot plus structure, never selector alone.
5. Pixels locate changes; inspection establishes meaning. Fonts, encoding, and
   motion can change pixels without changing design.
6. Pair captures from the same method.
7. Separate `designSourceDefects`, build `findings`, and `docDrift`.
8. Unknown conditions remain unresolved.
9. Use this skill's scripts/protocols, not ad-hoc reads.
10. Never share an interactive tab across concurrent checks. Prefer isolated
    `capture.mjs`; otherwise claim a tab and verify `location.href` before reads.
11. Before declaring a frame absent, search the canvas for matching content and size.
12. Re-fetch documented node IDs and confirm `authority.canonicalCanvas`; missing
    authority is a blocker/ambiguity.
13. Representative instances cover shared layout, not instance-specific content/data.

Read [known-blind-spots-2026-08-07.md](references/known-blind-spots-2026-08-07.md)
and [known-blind-spots-2026-08-12.md](references/known-blind-spots-2026-08-12.md)
for the evidence behind these rules.

## Mode

Read [execution-modes.md](references/execution-modes.md), then choose:

- `local-parity`: preferred local Figma read, isolated capture, measurement, comparison.
- `interactive-parity`: signed-in/prepared state; persist images before session ends.
- `forge-live-evidence`: supplied live images; list missing interaction/measurement/width evidence.

Run bundled scripts beside this file or by full path. Save artifacts in the
reviewed project's approved private folder.

## Execution

### 1. Freeze the comparison list

Read project `FIGMA.md`, `docs/figma.md`, or `figma-map.json`, then
[project-map.md](references/project-map.md). Map each route/component/width/state
to node and live selector. Record URLs, file/node IDs, route/component/state
matrix, themes/locales/data, and repository/deployment. Search other instances
before declaring a responsive design absent.

Read [figma-setup.md](references/figma-setup.md). Record missing frames,
ambiguous variants, variables, placeholders, and external animation/reference.
Every requested cell needs a node/capture plan or blocker. Put the denominator in
`reviewPlan.cells`, then freeze route/breakpoint:

```bash
node scripts/freeze_plan.mjs --map figma-map.json --route /service-b \
  --breakpoint 393 --out <run-dir>/review-plan.json
```

Use `references/review-plan.schema.json`. Scope changes require a new plan.

### 2. Record Figma intent

Reuse an existing design spec or create one via
[design-spec.md](references/design-spec.md). Record geometry, type, colour,
components, states, and node IDs; contradictions become `sourceDefects`. Load the
current Figma design-to-code prerequisite before `get_design_context`. Export exact
nodes; if full-page cropping is unavoidable, use
`scripts/crop_figma_sections.py` and record alignment. Keep image, ID, dimensions,
scale, and time together.

### 3. Capture equivalent live state

Read [capture-determinism.md](references/capture-determinism.md), then:

```bash
node scripts/capture.mjs --url <url> --width 1512 --label desktop \
  --map figma-map.json --plan <run-dir>/review-plan.json --out <run-dir>
```

Capture twice. Require `contentWidthMatches`, `target.stable`, and required main
JavaScript. Use `scripts/live_probe.js` for section measurements and only the
relevant [platform-adapters.md](references/platform-adapters.md) guidance.

### 4. Compare

Inspect structure; measurements; appearance; and every neighbouring section
join. Compare text top-to-top rather than copying Figma box gaps. Pair by map,
never filename order:

```bash
python3 scripts/compose_review.py --figma-dir figma --live-dir live \
  --map figma-map.json --label desktop --breakpoint desktop-1512 --out review
```

Filename pairing is a failed run. Read
[visual-diff.md](references/visual-diff.md) before interpreting pixel output.
Every inspected pair must resolve to node plus measurement or labelled visual proof.

### 5. Controls and responsive states

```bash
node scripts/discover_controls.mjs --url <url> --out controls.json
```

Test every discovered non-link control on every scoped page: menus, dialogs,
accordions, tabs, sliders, focus, hover, validation, and result states. Prove
state via attribute, panel size, or transform. Forced state proves layout, not
the trigger. Check between-frame widths for overflow/reflow; missing design
intent remains a design decision or website problem.

### 6. Report and validate

Follow [report-template.md](references/report-template.md). Save paired images/
masks, `report.md`, observation-only v4 `figma-parity-manifest.json`, and—only
after actual judgement—`review-attestation.json`.

```bash
node scripts/build_manifest.mjs --run <run-dir> --map figma-map.json \
  --plan <run-dir>/review-plan.json --mode local-parity --label desktop \
  [--findings findings.json]
node scripts/validate_manifest.mjs <run-dir>/figma-parity-manifest.json
node scripts/attest_review.mjs --manifest <run-dir>/figma-parity-manifest.json \
  --actor-kind automated --actor-id "codex-visual-review" \
  --criterion "Hero matches node 550:6340 at 393px in the default state" \
  --verdict match --evidence mobile-01-hero \
  --out <run-dir>/review-attestation.json
node scripts/validate_attestation.mjs <run-dir>/review-attestation.json
```

Regenerate non-v4 manifests; capture stability never implies inspection or match.
Use exact automated identity. `human-unverified` is non-gating; `human` remains
rejected until signing/key ownership exists. See
`references/review-attestation.schema.json`. Preserve comment/client concerns as
open items with confidence even without node-level measurement.

## Evidence, outcome, replay

Conclusion confidence:

- `verified`: valid attestation bound to exact evidence/criterion.
- `visual-only`: visible difference without reliable measurement/node.
- `suspected`: indicative but incomplete conditions.
- `not-compared`: missing required page, width, or state.

Rank user impact and reach, not changed-pixel count. Done requires frozen-plan
coverage, exact source or `visual-only` per finding, hash-bound attestation for
each claimed match/mismatch, discovered controls, separated source/build/doc
issues, and valid report/manifest.

Return `passed`, `findings`, `partial`, `blocked`, or `failed`. `passed` requires
equivalent conditions and inspected evidence for every required cell. Verify
fixes by replaying the frozen plan, never re-inferring nodes/states/content.
