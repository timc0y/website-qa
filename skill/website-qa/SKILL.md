---
name: website-qa
description: >-
  Check a live, preview or local website for visual, responsive, interaction,
  link, form, accessibility, SEO, console, network and browser problems. Use
  when reviewing a build or looking for regressions without comparing it with
  Figma. Works with Webflow and other rendered websites.
---

# Website QA

Determine what visitors can receive from selected URLs/conditions, what ran,
what failed, and what remains unknown. Inspect saved screenshots and verify
important findings. Add `figma-parity` when matching Figma.

Use `boundary → contract → selection → profile → execution → evidence → outcome → replay`.

This standalone URL reviewer may use publicly visible platform signatures but
never claims source attribution requiring repository, CMS, account, or builder
access. Optional knowledge enters only through a schema-versioned
`--vocabulary=<file>` validated by
[platform-vocabulary.schema.json](references/platform-vocabulary.schema.json).
The runner never discovers installed skills/private tools. Stable `wqa:` finding
IDs may receive privileged attribution only through a separate sidecar validated
by `scripts/validate_attribution.mjs` and
[finding-attribution.schema.json](references/finding-attribution.schema.json).

## Contract and profile

Record exact URLs, environment/deployment, profile, engines, widths, emulation,
preferences, states, interactions, content/data, authentication, baseline, and
full denominator before sampling.

- `targeted`: one problem, route, component, form, state, or regression.
- `standard`: representative routes/template families with the runner.
- `deep`: expanded engines, widths, states, families, resilience, and specialist evidence.
- `launch`: all contract-required families, environments, and states with durable evidence/gaps.

Profiles do not configure the runner; translate them into explicit options and
coverage. See [review-profiles.md](references/review-profiles.md).

Before first review read [reviewer-mindset.md](references/reviewer-mindset.md);
before screenshots, [vision-qa.md](references/vision-qa.md); before unusual
automation, [false-positives.md](references/false-positives.md); for signed-in or
remote capture, [execution-modes.md](references/execution-modes.md).

## Rules

1. Read regressions first.
2. Label findings `MEASURED`, `OBSERVED`, or `SUSPECTED`.
3. Confirm absence with clean screenshot plus structure; selector misses do not prove it.
4. Separate first-party failures from third-party noise.
5. Skipped routes, widths, engines, states, or interactions are missing coverage.
6. Permit only ephemeral browser state: controls, viewport/preferences, isolated
   consent, and client validation. Never submit, log out, pay, download, delete,
   change content, publish, or follow unclear actions. Isolate storage and report
   analytics/network side effects.
7. Use `runner/qa_runner.mjs` for repeatable public pages. Interactive work needs
   a dedicated tab and `location.href` verification before every measurement.
   See [known-blind-spots-2026-08-12.md](../figma-parity/references/known-blind-spots-2026-08-12.md).

## Run

Prefer the isolated local runner; use an existing browser only for prepared or
signed-in states. Remote captures narrow coverage and must list omissions.

```bash
npm install
npx playwright install chromium webkit
node runner/qa_runner.mjs --url=https://site.com --out=./qa-run \
  --engines=chromium,webkit
```

Run beside `runner/`. Keep dependencies in this repository and output in the
reviewed project's approved private folder. Reuse output roots for comparison.

| Option | Use |
|---|---|
| `--url=…` | Add a page; include two per dynamic template family. |
| `--breakpoints=1920,1512,1280,991,767,479,430,393` | Widths. |
| `--engines=chromium,webkit` | Chromium versus Playwright WebKit—not physical Safari. |
| `--vocabulary=./vocabulary.json` | Explicit selector vocabulary. |
| `--spec=./site.spec.json` | Agreed measurements. |
| `--baseline=./qa-run/<timestamp>` / `--no-baseline` | Named comparison or none. |
| `--external-links` | Check external destinations. |
| `--channel=chrome` | Installed Chrome instead of bundled Chromium. |

## Execution

1. **Select:** read sitemap/source routes; cover every layout/journey and at
   least two pages per dynamic family. State large-site sampling and gaps.
2. **Build:** audit production output/preview, not a development server.
3. **Run:** use promised engines; default is Chromium. Preserve output root.
4. **Triage:** read `summary.md` regressions, then `findings.json`.
5. **Verify:** sample every warning kind; inspect every High and absence claim.
6. **Inspect images:** desktop/mobile, open controls, engine differences; record
   width, scroll position, and nearest heading.
7. **Expand shared changes:** include every route using a changed component.
8. **Group causes:** repeated symptoms from one rule are one problem.
9. **Report:** use [report-template.md](references/report-template.md); separate
   defects, polish, content, accessibility/SEO, browser differences, and tool noise.

The runner covers layout, content/setup, accessibility, controls, non-submitting
form checks, requests/console/fonts/images/layout movement, visual evidence,
run-to-run regressions, and cross-page template differences.

For browser/platform interpretation read
[platform-notes.md](references/platform-notes.md). Before CSS-quality findings,
read [css-quality.md](references/css-quality.md) and keep them Low priority. For
WCAG, Lighthouse, performance, validity, CI, or frameworks read
[standards-tooling.md](references/standards-tooling.md). Before adding tools or
planning security, privacy, field performance, or devices read
[tool-landscape.md](references/tool-landscape.md).

## Design, evidence, outcome, replay

`--spec` consumes agreed measurements; do not reinterpret Figma. See
[design-spec.md](references/design-spec.md) and
[design-spec-format.md](references/design-spec-format.md).

Runs save `summary.md`, `findings.json`, `regressions.json`, screenshots, and an
`audit-manifest.json` conforming to
[audit-manifest.schema.json](references/audit-manifest.schema.json). A non-zero
exit for an important finding is a QA result, not necessarily runner failure.

Done requires every agreed route, width, engine, and state checked or named as
missing; every important finding verified against page/width/evidence; images
inspected; confirmed issues separated from suspicion/noise; and no site change.

Return `passed`, `findings`, `partial`, `blocked`, or `failed`. `passed` requires
evidence for every required family, engine, width, state, and interaction;
otherwise return `partial`, even for a clean subset. Verify fixes by replaying
stored URL, environment, engine, width, state, content, interaction, and method.
