---
name: website-qa
description: >-
  Check a live, preview or local website for visual, responsive, interaction,
  link, form, accessibility, SEO, AEO, semantic heading/title, console, network
  and browser problems. Use when reviewing a build or looking for regressions
  without comparing it with Figma. Works with Webflow and other rendered
  websites.
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

## Who a finding is for

A site serves three people, and a review is only useful when a finding names
which of them a fault reaches:

- **The visitor** never sees the build. Their failure is silent — content that
  needs JavaScript to appear, a control that cannot be reached by keyboard, a
  layout that breaks on a real phone. Nobody reports it; they leave.
- **The editor** maintains the site afterwards. Their failure is a field or
  control whose purpose cannot be guessed, so they stop changing things.
- **The developer** inherits it. Their failure is two sources that both look
  authoritative, or a name that turns out to be load-bearing.

**A measurement means nothing until a person is attached to it.** "41 images
without alt text" is a fact; "41 images without alt text on a page a screen-reader
user is expected to complete a form on" is a finding. Report the count and the
consequence together, and where a gap costs nobody, say so and move on rather
than padding the report.

The same applies in reverse: a build can be structurally clean and still unfit to
publish, or well-written and full of placeholder copy. State which you assessed
and which you did not.

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
| `--perturb[=longWord,…]` `--perturb-breakpoints=1512,393` | Vary the inputs a site actually varies and re-measure: a longer unbreakable word, copy 50% longer, the webfont unavailable, text zoom at 200%, images absent. Reports what each change CAUSES — findings absent from the page as served. Opt-in: one reload per perturbation per width. |
| `--why-css` | Name the declaration behind each finding (rule, property, value, line) through the debugger protocol. Chromium only; recorded as a capability and its absence as a limitation. |
| `--sweep=24` / `--no-sweep` | Width sweep, **on by default at 64px**: walks every step in the breakpoint range running the box-model checks, reports each defect as the width RANGE it exists in, and marks anything the breakpoint list would have stepped over. Lone stops are re-probed ±step/3, so a coarse step narrows a band rather than hiding it. Runs in every engine, so a range present in one engine only is reported as a browser difference. |

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
   defects, polish, content, accessibility/SEO/AEO, browser differences, and tool noise.

The runner covers layout, content/setup, accessibility, controls, non-submitting
form checks, requests/console/fonts/images/layout movement, visual evidence,
run-to-run regressions, and cross-page template differences.

### Who owns what

One file, one question. Adding a check is one file plus one row in
`runner/lib/registry.mjs`, which declares what each audit produces — the finding
arrays, their report labels, how they are counted between runs and how one is
identified across runs. The runner, the regression diff, the finding index and the
summary all read that declaration; before it existed, adding one detector meant
five edits and forgetting any one of them made the finding vanish silently.

| owner | question |
|---|---|
| `audit_roles.js` | what KIND of thing is this — track, slide, scrim, sticky, closed panel, hover-reveal, marquee, decoration — inferred from shape and behaviour, never class names. Runs first; everything else consults `window.__WQA_ROLES`. |
| `audit_layout.js` | does the geometry hold: viewport, parent, collision, collapse. |
| `audit_slack.js` | does it FIT, and by how much — the fragility map, plus its zero and negative cases. |
| `runner/lib/perturb.mjs` | what breaks when an input changes. |
| `runner/lib/attribution.mjs` | which declaration caused it. |
| `runner/lib/impact.mjs` | which findings matter most, measured in content a reader loses. |
| `runner/lib/regress.mjs` | what changed since the last run. |
| `runner/lib/vocab.mjs` | the only place selectors live, extended per run by `--vocabulary`. |

Roles are why this generalises. A carousel is a carousel because near-equal
children escape the box that clips them — true on Webflow, Framer, Shopify,
Tailwind or hand-rolled CSS. A hover-slide is one because it *transitions*. Platform
knowledge enters as a `--vocabulary` pack, which may only ADD candidates a shape
test missed, never veto one it found. Every audit still runs alone in a console; with
no role pass it falls back to class-name matching and says which it used.

### The box-model family, and why a breakpoint list is not enough

`audit_layout.js` asks four separate geometric questions, because a page that fits
the viewport can still be visibly broken:

- **viewport** — does anything cross the right edge (`horizontalOverflow`), and is
  that a sideways scroll or a slice cut off by a clipping ancestor.
- **parent** — does a child leave its own parent's box (`escapesParent`): either
  `clipped`, so part of it is not on screen, or `spills`, so it paints over its
  neighbours. A fixed-height card holding copy that grew lands here.
- **collision** — does an out-of-flow box land on top of rendered text
  (`overlappingContent`). Hand-placed absolute cards are tuned at one width and
  collide at another; nothing overflows anything, so every other check is silent.
- **fit** — can the text physically fit: one unbreakable token wider than its
  container (`textCannotFit`, measured on the word, not estimated), `nowrap` text
  that does not fit its box (`nowrapOverflow`), and boxes squashed under 4px while
  still holding content (`nearlyCollapsed`).
- **type on type** — two runs of text in the same pixels (`textCollisions`),
  whatever put them there: a box that stopped growing with its content, a grid whose
  rows collapsed, a caption placed at another width. Collisions are hit-tested by
  scrolling the point into view, so a stack with an opaque layer between the two is
  not reported as a collision; where the page cannot be window-scrolled (Lenis and
  friends translate a wrapper instead) the finding says so and stays SUSPECTED.

### Slack: the finding that has not happened yet

`audit_slack.js` measures the distance to the next defect, not just the defects
present. For every text box it compares the space available with the widest thing
that cannot be broken — one word, a URL, a reference number — measured on rendered
glyphs, and reports the headroom in **characters**, the unit of the person who will
break it. Zero-slack cases surface as `textCannotFit` and `nowrapOverflow`; two
characters of headroom on a nav label surfaces as `slackAtRisk`, which is not a
defect and is the reason for one next month. Boxes allowed to break mid-word are
excluded: their longest word cannot overflow.

`--perturb` turns that from a measurement into an experiment. Each perturbation
states its question ("what happens when an editor types a word longer than any
currently on the page?"), is applied to this render only, and is undone by reloading
— so every finding is a prediction with its cause attached, and the site is never
touched.

Two limits worth stating in the report rather than discovering later:

- **Placement defects live between breakpoints.** A collision that exists from 992
  to 1190px is invisible to `1920,1512,1280,991,…` — the default list steps over
  the entire window. The sweep answers "does it break at any point" instead, and
  runs by default. A finding that lands on a single stop is re-probed ±step/3
  before it is judged: reproduced means a band narrower than the step, not
  reproduced means the sweep's own scrolling caught a reveal mid-flight, and only
  the latter is labelled SUSPECTED and kept out of the regression baseline.
- **Closed shadow roots cannot be measured.** Text rendered inside a web component
  (animated counters, third-party widgets) is invisible to `innerText` and to every
  text check here. Open roots are traversed and reported against the light-DOM host;
  closed ones are a stated gap, not a clean result.

`audit_a11y_seo.js` also checks, per page: **heading hierarchy** (missing or
duplicate `<h1>`, skipped levels — what a screen reader's or crawler's outline
sees, not what looks right visually); **title-tag semantics** (a title can pass
the existing length check and still be a generic template default or share no
words with the page's own `<h1>` — heuristic, report as SUSPECTED, confirm by
eye); **heading/paragraph semantic mismatch** in both directions (large bold
text in a `<p>`/`<div>`/`<span>` that reads as a heading but isn't tagged as
one, and an `<h1>`-`<h6>` restyled down to body size with no visual hierarchy
left); and **AEO** — whether a question-phrased heading is followed by a short
direct answer rather than a long run-up, whether FAQ/HowTo/Article structured
data specifically is present (not just any JSON-LD block), and whether the site
has published an `llms.txt` (informational only; its absence is not a defect).
Fold these into the same accessibility/SEO section of the report, not a
separate pass — they run in every `audit_a11y_seo.js` invocation already.

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
