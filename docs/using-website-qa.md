# Using website-qa — operator's guide

For a person at a terminal. The review *method* is in
[`skill/website-qa/SKILL.md`](../skill/website-qa/SKILL.md) and the reasoning behind each
check is in its `references/`; this page is install, recipes, output, and what to do when
something looks wrong.

## Install

```sh
npm ci                                    # playwright 1.62.1, the only dependency
npx playwright install chromium webkit    # ~1 GB into the Playwright browser cache
```

Node 18 or newer. Chromium alone is enough to start; WebKit is needed for
`--engines=chromium,webkit`. `website-qa` needs nothing else — no API key, no account, no
design tool. (A Figma read path is a `figma-parity` requirement, not this one.)

No install is needed to use the audits interactively: every file in
`skill/website-qa/scripts/` is a self-contained IIFE that can be pasted into a browser
console and will return its findings. Paste `audit_roles.js` first — the others consult
what it publishes and otherwise fall back to weaker class-name matching, which they
report as `roleSource`.

## Recipes

**Look at one page.** Sensible defaults: eight breakpoints, the width sweep at 64px,
interactions, links, vision capture, and a diff against the previous run in the same
`--out` directory.

```sh
node skill/website-qa/runner/qa_runner.mjs --url=https://example.com --out=qa-output
```

**Check a template family properly.** Two URLs per dynamic family, or per-template
metadata duplication cannot be checked at all.

```sh
node skill/website-qa/runner/qa_runner.mjs \
  --url=https://example.com/team/ada --url=https://example.com/team/grace \
  --out=qa-output
```

**Hunt a placement bug.** Tighten the sweep. A collision can live in a 130px band that a
64px step lands in only once; a 24px step bounds it.

```sh
node skill/website-qa/runner/qa_runner.mjs --url=https://example.com --sweep=24 --out=qa-output
```

**Before a content handover or a translation.** Ask what the next edit breaks.

```sh
node skill/website-qa/runner/qa_runner.mjs --url=https://example.com \
  --perturb --perturb-breakpoints=1512,393 --out=qa-output
```

**Turn findings into fixes.** Name the declaration responsible (Chromium only).

```sh
node skill/website-qa/runner/qa_runner.mjs --url=https://example.com --why-css --out=qa-output
```

**Cross-engine.** The diff is the finding, not either engine's raw numbers.

```sh
node skill/website-qa/runner/qa_runner.mjs --url=https://example.com \
  --engines=chromium,webkit --out=qa-output
```

**Verify a fix.** Reuse the same `--out` root and the previous run becomes the baseline
automatically; `--baseline=` picks one explicitly. Replay the *same* URL, width, engine
and state — a fix confirmed under different conditions is not confirmed.

**Fast pass** while iterating on a build:

```sh
node skill/website-qa/runner/qa_runner.mjs --url=http://localhost:3000 \
  --no-interact --no-vision --no-links --no-baseline --out=qa-output
```

### Options

| Option | Effect |
|---|---|
| `--url=…` | Add a page. Repeatable. Two per dynamic template family. |
| `--out=./qa-run` | Output root. Reuse it so runs are comparable. |
| `--breakpoints=1920,1512,1280,991,767,479,430,393` | Widths for the full audit. |
| `--sweep=24` / `--no-sweep` | Width sweep, on by default at 64px. Reports each defect as the width range it exists in. |
| `--perturb[=longWord,longerText,fallbackFont,textZoom200,imagesAbsent]` | Vary inputs and report what each change causes. Opt-in: one reload per perturbation per width. |
| `--perturb-breakpoints=1512,393` | Where perturbation runs. |
| `--why-css` | Name the rule, property, value and line behind each finding. Chromium only. |
| `--engines=chromium,webkit` | Cross-engine pass. Playwright WebKit, which is not Safari. |
| `--vocabulary=./vocabulary.json` | Platform selectors and role candidates. Schema-versioned; may only add candidates. |
| `--spec=./site.spec.json` | Agreed measurements to compare against. |
| `--baseline=…` / `--no-baseline` | Choose or suppress the comparison run. |
| `--channel=chrome` | Installed Chrome instead of bundled Chromium. |
| `--external-links` | Also check external destinations. |
| `--no-interact` `--no-scroll` `--no-links` `--no-vision` | Skip phases. A skipped phase reads as **unknown** in the diff, never as clean. |

## What you get

`<out>/<timestamp>/` holds the run; `<host><path>/` holds each page's images.

| File | Read it for |
|---|---|
| `summary.md` | **Start here.** Regressions, then findings ordered by content lost, then per-breakpoint detail, the width sweep, perturbation predictions and the vision checklist. |
| `findings.json` | Everything, unabridged, including `cause` from `--why-css` and every `confidence` string. |
| `regressions.json` | What changed since the baseline: appeared, resolved, changed. |
| `finding-index.json` | Stable `wqa:` ids, for attaching privileged attribution through a validated sidecar. |
| `audit-manifest.json` | Provider-neutral evidence index: capabilities exercised and limitations stated. |
| `fullpage-<width>.png`, `states/`, `vision/` | The images. Findings that need an eye say so. |
| `vision-checklist.json` | Tiered questions per image. An unanswered question is a coverage gap, not a pass. |

### Reading a finding honestly

Every finding carries its own evidence class, and they are not interchangeable:

- `measured` / `measured (hit-tested)` — read off the page, or confirmed by a hit test.
- `SUSPECTED` — geometry or heuristic only. Confirm on a screenshot before it reaches
  anyone else.
- `unstable` — appeared in one of two readings 200ms apart. Usually an entrance animation
  caught mid-flight. Re-check on a fresh load.
- `transient` (sweep) — appeared at one width and did not reproduce ±step/3.
- **Absent is not clean.** `hitTesting`, `roleSource`, `limitations` and the "not checked"
  lines say what the run could not establish. Quote them in the report.

## Troubleshooting

**"Everything reads clean and I can see the bug."** Three usual causes, in order: the
defect lives between breakpoints (`--sweep=24`), it needs a state the run never entered
(open the panel yourself and paste the audits), or its text lives in a closed shadow
root, which nothing can measure.

**A carousel or marquee is reported as broken.** The role pass should have recognised it.
Check `roles.counts` in `findings.json`: if `track` is 0, the shape test missed it —
add a role candidate through `--vocabulary` and say so in the report.

**Findings appear and disappear between runs.** Look for `unstable` and `transient`. If
neither is set, the page is probably still animating at measurement time; the settle step
drains finite animations but an infinite one (a marquee) never quiets.

**`--why-css` reports `available: false`.** Not Chromium. The run is still valid; the
limitation is recorded in the manifest.

**`ambiguous` is high in `cssAttribution`.** The selectors match several nodes each. The
declarations shown belong to the first match — treat them as a lead, not an address.

**`networkNeverIdle`.** A chat widget or analytics heartbeat polls forever. Harmless: the
run continues once the document is loaded, and the flag is recorded.

## Keeping it trustworthy

```sh
npm test
```

Detector fixtures assert both directions — the defect is caught, and correct markup stays
clean. A detector that fires on everything is worse than no detector, and a detector whose
*exclusion* matches everything looks exactly like a clean page (that bug shipped once; the
fixture that catches it is in `check-fixtures.mjs`).

When you add a check: one file in `scripts/`, one row in `runner/lib/registry.mjs`, one
fixture pair. `check-extension-contracts.mjs` then proves the finding reaches the report,
the finding index and the baseline — and refuses to let a metric id be renamed, because
every stored run depends on it.
