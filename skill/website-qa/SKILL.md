---
name: website-qa
description: >-
  Audit any live, preview, or locally served website without requiring a design
  reference. Use when the user wants to QA or audit a site, review a build, find
  visual or interaction bugs, check responsive behavior, links, forms,
  accessibility, SEO metadata, console/network errors, layout shift, or
  cross-browser differences. Works with framework and platform output including
  Astro, static HTML, React/Next, WordPress, Shopify, and Webflow. Drives a real
  browser through hover, click, scroll, keyboard, and responsive states, verifies
  automated findings visually, compares repeat runs for regressions, and produces
  a severity-ranked report. Use figma-parity as well when the site must be compared
  with a Figma design.
---

# Website QA

Sweep rendered website output for defects **without** a design reference. Treat
the generated HTML, CSS, JavaScript, network behavior, and browser states as the
test surface; the authoring framework is only relevant when interpreting a
platform-specific finding. Run the scripts, **verify** hits, triage by severity,
and write the report.

**Read `references/reviewer-mindset.md` before your first review.** It's the
reasoning behind every check — the five questions that generate findings, where
automated QA systematically fails, and the false-positive discipline. The scripts
tell you what is checked; that document tells you how to find what isn't, and it's
what makes a review good rather than merely complete.

**Then read `references/vision-qa.md`.** The scripts measure; measurement is blind to
composition. A heading colliding with the face in the photo behind it, a portrait
cropped through the chin, one card in a row of four that towers over the rest, a
section that simply looks unfinished — those are the notes clients actually send, and
none of them are expressible as a CSS assertion. You are a vision model: the runner
captures legible viewport tiles and section crops, and **looking at them is a required
phase of the review, not a nicety.**

**And read `references/false-positives.md`.** It is the catalogue of every wrong finding
this skill has produced, each with its root cause and fix — colour syntax it couldn't parse,
hit-test points clamped into the viewport, closed accordions read as collapsed layout,
hidden CMS templates measured as visible text. Nearly all of them reduce to five shapes
(wrong state, wrong place, intentional read as broken, not on the page at all, absence
inferred from a probe). **Consult it before adding a check or trusting one**, and classify
every finding as MEASURED / OBSERVED / SUSPECTED — the summary prints that legend on every
run, because a suspicion written in the voice of a measurement is what destroys a report.

## The three rules

1. **Compare to the previous run before comparing to anything else.** A regression —
   something that worked last time and doesn't now — outranks every absolute finding in
   the report, because its cause is known: whatever changed in between. A 4px padding
   delta has always been wrong and can wait. The runner does this automatically and it
   leads `summary.md`; read that section first. It is also the only finding class that is
   unambiguously the fault of the work just done.
2. **A noisy check is worse than no check.** Three fabricated findings and a
   reviewer stops trusting the eleven real ones next to them. Verify before you
   report, and prefer a measurement ("renders at 62px at both 1512px and 393px")
   over a judgement ("text too big").
3. **Never assert "missing" from a DOM probe alone.** Selector probes resolve to
   the wrong ancestor and report zero icons on cards that plainly have them — this
   has produced real false findings. Confirm absence on a clean screenshot with
   overlays hidden.

And the rule behind all three: **a check that reports "no problems" when it had no way to
look is worse than no check at all.** Every phase here states what it could not see —
unreadable stylesheets, skipped breakpoints, a single URL where two were needed — because
silence that reads as reassurance is how defects ship.

### Preflight: confirm what you are measuring, before you measure it

Two environment traps have each produced a false finding that nearly shipped. Both
are invisible in the output — the numbers look real, and they are, of the wrong
thing. Check both before trusting a single count.

**1. Are you measuring the DEPLOYED bundle?** Sites often ship a dev-override
loader that probes a local port and silently swaps in local JS when a dev server
happens to be running. An audit started in that state measures local code and
attributes every finding to production. Confirm the origin the JS actually came
from (the network log, not the page's own status panel), and force production mode
via whatever query flag the loader honours — a `?dev=0`-style override. Note that
clicking a "Live"/"Production" toggle in an on-page panel is **not** sufficient:
the DOM keeps whatever state the already-initialised local bundle built.

**2. Attribute 4xx and console errors to an ORIGIN before counting them.**
Bot-protection widgets, chat, analytics and feedback tools poll continuously and
many 401 or 404 *by design*. One real sweep reported 66 4xx and ~139 console errors
that were 100% third-party noise and zero real defects — every number true, the
conclusion worthless. The runner now splits first-party from third-party and only
escalates the first; when reading raw counts yourself, do the same split before
drawing any conclusion.

The same polling breaks readiness detection: **`networkidle` never arrives** on a
site with a continuous heartbeat, so a healthy page times out and reads as "site is
down". A goto timeout on a page whose document did load is reported as
`networkNeverIdle`, not as a page error — if you see that flag, the wait strategy
was wrong, not the site.

## Choose an execution mode

Prefer the local runner for a complete sweep. Use an interactive browser for authenticated
or already-open state. When Forge tools are installed, Forge may supply remote screenshot
and accessibility evidence, but that reduced mode does not execute the runner. Read
`references/execution-modes.md` before using either non-local branch; it defines the
capability and independence boundaries shared with external consumers such as Parallax.

**A) Headless runner (recommended).** `runner/qa_runner.mjs` drives a real browser
the way a reviewer would: loads every breakpoint, **hovers** interactive elements,
**clicks** dropdowns/menus/accordions/tabs open, **scrolls** to the bottom, **tabs**
through with the keyboard, checks every link over the network, measures layout shift
during load, and optionally repeats the whole layout pass in **WebKit** to catch
Safari-only bugs.

```bash
npm i playwright && npx playwright install chromium webkit   # one time
node runner/qa_runner.mjs --url=https://site.com --out=./qa-run
```

For a source repository such as Astro, build the production output and audit its
preview URL rather than relying only on the development server. The built preview
is where asset paths, route generation, hydration, and production-only
configuration failures appear. A deployed preview URL is equally suitable.

Useful flags:

| flag | effect |
|---|---|
| `--url=…` | repeatable — sweep several pages in one run. **Two URLs from each dynamic route/template family is not optional** — see below |
| `--breakpoints=1920,1512,1280,991,767,479,430,393` | default; includes real device widths and common CSS boundaries |
| `--engines=chromium,webkit` | second engine + a **diff**; the diff is the finding |
| `--selectors=./vocab.json` | override the generic selector vocabulary for bespoke components |
| `--spec=./site.spec.json` | diff the live page against **intended** design values |
| `--baseline=./qa-run/<ts>` | compare against a specific earlier run; defaults to the newest one under `--out` |
| `--no-baseline` | skip the run-to-run comparison |
| `--vision-breakpoints=1512,393` | default; widths to capture reviewable tiles at |
| `--vision-max-tiles=14` | cap per width; the summary says when capture was truncated |
| `--no-interact` / `--no-scroll` / `--no-links` / `--no-vision` | skip a phase when time-boxed |
| `--external-links` | also verify outbound links resolve |
| `--channel=chrome` | use installed Chrome instead of bundled Chromium |

Writes `<out>/<ts>/…/findings.json`, `summary.md`, `regressions.json`,
`fullpage-<width>.png` per breakpoint, and `states/*.png` for every panel it opened. It
also writes `audit-manifest.json`: a provider-neutral index of the run configuration,
artifacts, limitations, and reviewable viewport tiles for any external review system that
wants to ingest the evidence. The manifest does not promote heuristics into verified
findings; its contract is `references/audit-manifest.schema.json`. Exit code is non-zero
when a high-signal defect is found.

**Keep `--out` pointing at the same directory across runs.** That is what makes the
run-to-run diff possible: each run is a timestamped folder, and the newest previous one
becomes the baseline automatically. A fresh `--out` every time throws away the most
valuable comparison the tool can make.

**B) Interactive (browser MCP).** Paste each `scripts/*.js` into a `javascript_exec`
call. Use this for a page the runner can't reach (auth) or when you're already
driving the browser. Same scripts, same findings — but you lose the interaction,
link, load-shift and cross-browser phases, which are where a lot of the value is.

**C) Forge evidence (optional reduced mode).** Invoke Forge's `website-qa` prompt or
`forge_review` for representative routes and phone/desktop captures when remote evidence
is the useful path. Inspect every returned image. Preserve the Forge packet as provider
`forge`, label the review `forge-evidence`, and name every full-runner capability that did
not execute. Forge and Parallax are optional consumers/providers; this skill runs without
either one.

## What runs where

**Per breakpoint** (width changes the answer, so never run these once):
- `scripts/audit_layout.js` — horizontal overflow, collapsed 0×0 elements,
  unintended wrapping, clipped text, broken/distorted images, low-contrast and
  invisible text, tiny tap targets, heading sizes (feeds the type-scale check).
- `scripts/audit_polish.js` — **what a human notices first.** Favicon, container
  gutter consistency, unlinked phone/email, near-miss wraps and widow headings,
  button groups that wrap onto two rows, placeholder/duplicated icons, dev
  furniture still on the page, nav-vs-content parity, motion coverage, false
  affordance (`cursor:pointer` that does nothing, and links that don't get one),
  unselectable text, flex/grid groups with no gap, CMS empty states and empty
  bindings, upscaled/pixelated images, duplicate list items, nearly-full-height
  heroes, and **SVG sizing** (oversized, no intrinsic size, aspect mismatch).

**Once** (DOM/CSS-level, width-independent):
- `scripts/audit_content.js` — placeholder/lorem incl. hidden panels, dead/`#`
  links, staging links, mixed content, generic link text, empty headings and
  unnamed controls.
- `scripts/audit_a11y_seo.js` — alt text, duplicate IDs, broken ARIA refs,
  unlabeled fields, positive tabindex, title/description/canonical/OG/viewport,
  JSON-LD validity, fonts that failed to load, tiny text, CLS-risk images.
- `scripts/audit_consistency.js` — heading outline, type/colour sprawl, component
  drift.
- `scripts/audit_transitions.js` — `auditCssStates()` finds state changes with no
  transition covering them; `qaSnap`/`qaDiff` for manual hover diffing.
- `scripts/audit_css_quality.mjs` — **the rules, not the pixels.** Every other audit here
  reads computed values on elements, which cannot see that two rules should have been one.
  This one reads the CSSOM: byte-identical declaration blocks under different selectors,
  large shared subsets that point at a missing base class, literals that exactly equal an
  existing custom property, near-duplicate values (`#f2f5fa` vs `#f3f5fa`,
  `line-height: 1.14` vs `1.15` — this found a real design-token drift on a live site),
  value sprawl, `!important` hotspots, and unreferenced custom properties.
  **Everything it reports is advisory code quality, capped at Low severity, and belongs in
  its own clearly-labelled section** — a maintainer who finds "merge these classes" filed
  next to "the gradient is upside down" trusts neither. Read
  [`references/css-quality.md`](references/css-quality.md) first: CSSOM shorthand expansion,
  value-only token matching and pairwise reporting each produced badly wrong output while
  it was being built, and the doc names the fix for each.
- `scripts/audit_cascade.js` — **a computed value with nothing in the cascade to explain
  it.** The motivating case: an `<h1>` computing `display: inline`, no author rule setting
  `display` anywhere, UA default `block` — headings running into the text after them while
  every measurement agreed the heading was fine, because they were measuring the box the
  browser actually made. Cost about eight calls to not explain. Reports the fact
  ("computed X, UA default Y, no readable rule sets it") and the fix (set it explicitly),
  not a diagnosis. Silent when an author rule, a style attribute or a flex/grid parent
  accounts for the value. Every finding is SUSPECTED by construction, and unreadable
  cross-origin stylesheets are reported alongside so absence is never inferred from a
  blocked read.

**With a design spec** (`--spec=`, optional but high value):
- `scripts/audit_design_spec.js` — the only check here that knows what was
  *intended* rather than merely what is self-consistent. Diffs container gutter,
  section heights/padding, and per-heading font-size / line-height / family /
  weight / colour / letter-spacing / x-position against a spec file, matching
  elements by rendered text. Without it the sweep can say "these sections
  disagree"; with it, "every section is 16px too tight".
  The format is defined at
  [`references/design-spec.md`](references/design-spec.md) — a spec may already exist for the
  page, written when it was built, in which case **use that one rather than deriving your
  own**. Re-deriving it means this review is re-interpreting the design instead of checking
  conformance to it, and the two interpretations can disagree. `references/design-spec-format.md`
  covers how this runner consumes it: matching, tolerances, and reading the output.

**Across the whole run** (no flags needed — both run automatically):
- **Run-to-run diff** (`runner/lib/regress.mjs`) — this run against the previous one in the
  same `--out`, reported at the top of `summary.md` and in `regressions.json`. NEW /
  FIXED / CHANGED, split so a count going up is a regression, a value changing is a change
  to confirm, and a defect *changing kind* at a constant count is still caught — an image
  that went from "aspect distorted" to "broken, no intrinsic size" holds the count at 1 and
  is the exact shape a count-only diff misses. Phase-gated metrics report nothing rather
  than a false fix when a run skipped that phase, and config drift between runs is stated.
- **Cross-page** (`runner/lib/crosspage.mjs`) — defects that only exist BETWEEN pages, and
  are structurally invisible to a per-URL sweep. Chiefly: a dynamic route or CMS template writes
  its `<title>`, description and canonical once, so **every item published under it carries
  the same one**. Each item page is internally perfectly correct, so nothing else here
  reports it — which is how five collection templates shipped sharing a single title. A
  shared canonical is worse still: every item but one is telling search engines it is a
  duplicate. **This needs two URLs from the same template to see anything**, so given one
  it reports "not checked" and names the missing input rather than passing.

  ```bash
  node runner/qa_runner.mjs --url=https://site.com/team/person-a --url=https://site.com/team/person-b
  ```

  This matters equally for generated Astro routes, headless-CMS pages, WordPress
  templates, and hosted site builders. Include at least two representative URLs
  from every dynamic template family.

**Runner-only** (needs a driven browser — no script equivalent):
- `runner/lib/interact.mjs` — hover audit (no-feedback and snapping), opened-state
  audit (dead toggles, panels off-screen, panels painted *behind* other content,
  placeholder copy inside panels, layout defects in revealed DOM), nav dropdown
  exclusivity, carousel behaviour (missing/collapsed arrows, auto-rotation that
  overrides the user, full-bleed slides), scroll audit (reveals stuck invisible,
  lazy images that never load, sticky headers, overflow only after scrolling),
  keyboard audit (focus rings, focusable-but-hidden, backward focus jumps).
- `runner/lib/health.mjs` — link check by real request (404s a DOM audit can't
  see), and layout-shift measurement during load reported as *which elements moved*,
  not just a CLS number.
- `runner/lib/forms.mjs` — form structure and validation behaviour **without ever submitting**:
  success/error states missing or still carrying platform default text, fields with no `name` (they
  submit nowhere), email fields typed `text`, labels vs placeholders, starred-but-not-required,
  sub-16px inputs that zoom iOS, and blur validation exercised with deliberately invalid values
  that are then cleared. On a lead-gen site this is the most expensive component on the page and
  was previously the only one entirely unaudited, because "never submit the client's form" had
  been read as "forms can't be QA'd".
- `runner/lib/vision.mjs` — the images you review with your eyes: viewport-sized
  **tiles** in reading order (each anchored to a scroll offset and the headings visible
  in it), one tight **crop per section**, and the same tiles at the same offsets in the
  second engine for tile-against-tile comparison. Overlays (cookie bars, Marker.io,
  dev chips) are hidden for the shots and reported by name. Writes
  `vision-manifest.json`. **Never review from `fullpage-*.png`** — a 20 000px strip
  downscaled to an image budget renders body copy two pixels tall.
  Three things make this a pass rather than a glance:
  - **`componentSets()`** — the odd-one-out engine. One crop per instance of every repeated
    component (`vision/<w>/sets/<name>/01.png…`) plus the anomalies computable in the DOM:
    duplicate image `src` across instances, an instance missing an image or a link its siblings
    have, duplicate copy, icon-variant mismatch, height outliers. This is where most real
    findings come from, and half of them arrive MEASURED.
  - **settle detection** — every tile is shot twice 350ms apart and flagged `reviewable: false`
    if the frames differ, so a mid-animation capture can never be mistaken for missing content.
  - **`runVisionProbes()`** — vision findings arrive as `{claim, selector, assert}` and get
    executed, returning CONFIRMED / REFUTED. Report only CONFIRMED; every REFUTED claim is a new
    entry for `false-positives.md`. `cropCoverage()` reports the vertical bands no crop covers,
    because a gap between crops once read as an entire section not being built.
- `runner/lib/vocab.mjs` — every selector in one map. Nothing else hardcodes one.

## Workflow

0. **Inventory the site before choosing URLs.** Read `sitemap.xml` when available
   and inspect source routes when the repository is present. Group pages by
   layout/template, interaction pattern, and business importance. Include every
   unique static layout, critical journey, and at least two pages from each
   dynamic route family; for a very large site, state the sampling rule and cap.
   The URL set is complete when every materially different template and critical
   journey is represented or named as a coverage gap.
1. **Run the sweep.** Start with `--engines=chromium,webkit` on the key pages, and keep
   `--out` pointing where the last run went. Read `summary.md` first, then `findings.json`
   for detail.
1b. **Read the regression section before anything else.** It is the top of `summary.md`.
   Anything listed there broke since the last run, so its cause is whatever changed in
   between — that makes it both the most urgent class and the cheapest to fix. Everything
   below it has probably been wrong for a while. On a first run there is no baseline and the
   section is absent; that is not a pass, it just means no comparison was possible yet.
2. **Verify a sample of each flagged class.** Open the `states/*.png` and the vision
   tiles it captured. Anything reported as *missing* needs a clean screenshot before it
   goes in the report.
2a. **When a shared component changed, sweep every page that uses it.** A component edit
   lands everywhere the component is placed, and a review scoped to the page you were
   working on will not see the other seven. `componentSets()` finds repeated components
   *within* a page; finding them *across* pages is still a decision you make — list the
   pages using the component and pass them all as `--url`. A shared-component regression
   found on a page nobody was editing is the highest-value finding in this whole document,
   and it is currently only found by choosing to look.
2b. **Do the vision pass.** Follow `references/vision-qa.md`: desktop tiles in reading
   order asking one question at a time, then section crops, then mobile cold as its own
   site, then engine-vs-engine tiles, then the opened states. Skipping this leaves the
   entire collision / crop / balance / wrong-asset class unreviewed, and that class is
   most of what a human reviewer files. Anchor every finding (breakpoint + scroll
   offset + nearest heading) or it isn't actionable.
3. **Separate the categories.** Defects / polish / content / accessibility+SEO /
   cross-browser / environment noise. Marker.io badges, dev-mode chips and
   localhost script errors are environment, not defects — say so explicitly rather
   than dropping them silently.
4. **Find the root cause behind clusters.** Six headings that don't scale at mobile
   is one missing responsive type scale, not six findings. One fix beats six line
   items and is far more likely to get done.
5. **Report** with `references/report-template.md`, noting the breakpoint(s) and
   engine for each finding, and listing what was verified as correct.

## Notes
- `references/platform-notes.md` — browser-pane quirks, how to read each audit's
  output, false-positive guidance, and platform-specific detector notes.
- `references/standards-tooling.md` — when to supplement the runner with axe,
  Lighthouse, an HTML validator, or source-repository checks; read it when the
  request names WCAG, performance, markup validity, CI, or a framework build.
- `references/tool-landscape.md` — the researched adoption matrix for specialist
  QA tools, scripts, and services. Read it before adding a dependency, designing a
  new runner phase, or selecting whole-site crawl, visual-baseline, security,
  privacy, field-performance, real-device, or Astro-specific coverage.
- `references/css-quality.md` — how to read `audit_css_quality.mjs`, what to trust in it,
  and the six ways it produced wrong output before those were fixed. Also the framing that
  makes this class land: name the abstraction the codebase is missing, not the count.
- `references/false-positives.md` — every wrong finding, its cause, its fix, and the five
  shapes they all reduce to. The highest-value file here after the mindset doc.
- `references/vision-qa.md` — the vision protocol: what only eyes catch, the five
  passes, and what screenshots lie about (mid-animation captures, the tile overlap
  band, engine lazy-load thresholds).
- `references/reviewer-mindset.md` — the reasoning; read it first, and add to it
  whenever a real QA list catches something the scripts didn't.
- [`references/design-spec.md`](references/design-spec.md) — the self-contained spec format,
  written by whoever builds the page and read here.
  Prefer an existing spec over deriving a new one.
- `references/design-spec-format.md` — how *this runner* consumes a spec: text matching,
  tolerances, and reading the output.
- Sprawl thresholds are advisory: >~12 font sizes or >~8 text colours usually means
  an inconsistent scale, not necessarily a bug.
- QA is read-only. Never submit forms, mutate content, publish, or change the site.
- Design accuracy against a Figma source is **figma-parity**'s job — run both.
