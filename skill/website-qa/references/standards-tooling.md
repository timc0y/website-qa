# Complementary standards tooling

Use the browser runner as the primary sweep. Add the tools below when the request
names their concern; none replaces interaction and visual verification. Prefer an
existing project-native script over adding a new dependency: it already knows the
site's route model, content contracts, authenticated states, and deployment rules.

For the longer survey, trade-offs, and adoption order, read
`tool-landscape.md`.

## Choose the smallest useful addition

| Need | First choice | Use it for | Do not infer |
|---|---|---|---|
| One representative browser sweep | this skill's runner | layout, interaction, links, forms, screenshots, cross-engine differences | complete site coverage from one URL |
| Whole-site discovery | project sitemap/route scripts; otherwise Unlighthouse or a crawler | robots, sitemap, internal-link discovery, route sampling | that every discovered URL is indexable or intentional |
| WCAG automation | axe through Playwright; Accesslint when source mapping is useful | deterministic rendered-DOM violations, including opened states | WCAG conformance or usable task flow |
| Guided accessibility review | Accessibility Insights | tab order, keyboard traps, manual WCAG assessment | that its automated pass replaces the guided checks |
| Performance diagnosis | Lighthouse first; sitespeed.io/Browsertime or a DevTools trace for journeys | LCP/CLS/INP causes, waterfalls, budgets, repeat samples | production field performance from one lab run |
| Visual regression in CI | Playwright snapshots | stable reference-vs-current image diffs | design correctness from pixel similarity alone |
| Dedicated link CI | Lychee by default; Linkinator when Node integration or URL rewriting matters | broken URLs, fragments, redirects, HTTP policy | that a 200 response is the correct destination |
| Markup/source validity | Nu HTML Checker for rendered documents; html-validate for repository templates | parsing, content-model, reference and form-association errors | correct rendered behavior from valid markup |
| Technical SEO | rendered browser checks plus sitemap/indexability scripts | canonicals, robots, sitemap membership, duplicates, page identity, rendered schema | ranking or content quality from a checklist score |
| Structured data | Schema.org validator and Google Rich Results Test | syntax and eligibility for supported rich-result types | that valid markup will receive a rich result |
| Passive security posture | MDN HTTP Observatory or ZAP Baseline with authorization | headers, cookies, mixed content, passive response findings | a penetration test or absence of vulnerabilities |
| Privacy/tracker investigation | EDPS Website Evidence Collector; Blacklight as a public spot-check | cookies, storage, third-party traffic, and selected tracking behaviours | legal compliance from tracker detection |

## Accessibility: axe-core

Use `@axe-core/playwright` for a standards-based WCAG pass when the user asks for
accessibility or WCAG coverage. Run axe after opening menus, dialogs, accordions,
and other hidden states as well as on the resting page: axe tests rendered content,
so inactive regions need to be exposed deliberately.

Treat violations as MEASURED. Treat `incomplete` results as SUSPECTED and verify
them manually. Keep keyboard order, focus behavior, motion, copy quality, and
screen-reader task flow in the manual pass; automated accessibility checks cover
only the subset that can be determined mechanically.

## Performance: Lighthouse

Use Lighthouse or Lighthouse CI when the user asks for performance, Core Web
Vitals, budgets, or a CI gate. Audit a production build or deployed preview, run
several samples, and report the median plus the environment. Lab metrics fluctuate
and do not replace real-user monitoring.

Keep performance separate from functional QA. A score regression is a signal to
investigate; name the underlying audit or metric rather than filing “score is low.”

Use **Unlighthouse** when the missing capability is site-wide route discovery and
parallel Lighthouse coverage. Use **sitespeed.io/Browsertime** when a repeatable
user journey, waterfall, video, or deeper trace is the evidence needed. These are
heavier specialist passes, not default dependencies of the runner.

## Visual baselines

The runner's regression report compares structured findings. When the project also
needs pixel baselines in CI, prefer Playwright's native screenshot assertions if it
already uses Playwright. Stabilize fonts, data, clocks, animations, consent overlays,
and rendering environment before accepting a baseline.

Lost Pixel is archived and sunset, so do not adopt it for new work. BackstopJS is
still available, but normally duplicates the Playwright stack already in use. A diff
means “pixels changed,” not “the design regressed”; review every material diff and
keep the visual environment reproducible.

## Links and crawl coverage

The runner verifies links present on supplied pages. It does not yet prove complete
site coverage. Use the repository's route manifest and sitemap tests first. Add:

- **Lychee** for fast CI checks across built HTML/CSS/XML, Markdown, text, and
  explicit URLs. This is the default dedicated link checker.
- **Linkinator** when recursive live-site crawling, fragment checks, JavaScript API
  integration, redirect/HTTPS policy, or static-host URL rewriting is the useful gap.
- **Unlighthouse** when link discovery is already part of a site-wide Lighthouse pass.

Rate-limit politely, retry transient failures, identify bot/WAF responses, and split
first-party failures from third-party blocking. Do not report a rate limit as a broken
link.

## Markup: HTML validator

Use the Nu HTML Checker when the request names HTML validity, parsing, or standards
compliance. Prioritize errors that change the DOM, accessibility tree, form
association, or browser behavior. Do not pad the report with harmless advisory
messages.

For repositories, html-validate can catch strict parsing, content-model, missing
references, duplicate IDs, and form-association problems before deployment. Keep its
source findings separate from the Nu check of the browser-facing document: frameworks
can transform valid source into invalid output and vice versa.

## Technical SEO and structured data

Check the rendered DOM, not only fetched HTML: client code can inject or alter titles,
canonicals, headings, links, and JSON-LD. On multi-page sites combine browser evidence
with robots/sitemap/indexability checks, internal-link depth, duplicate metadata,
soft-404 detection, and two pages from each dynamic route family.

Use Google's Rich Results Test for Google-supported result eligibility and the
Schema.org validator for general vocabulary validation. Confirm that structured data
describes visible page content; syntactic validity alone is not enough.

## Passive security and privacy

Security scanning expands the audit's meaning and must be explicit. For a safe,
non-invasive baseline, MDN HTTP Observatory checks HTTP security controls and ZAP
Baseline spiders briefly then performs passive scanning. Use only against an authorized
target, preserve the tool's WARN/FAIL/IGNORE configuration, and describe the result as
a passive posture check—not a security clearance.

When privacy or tracking is in scope, the EDPS Website Evidence Collector is the
stronger reproducible evidence tool for cookies, storage, requests, HAR and WebSockets.
Blacklight is a useful public spot-check for known ad trackers, session recording, key
logging, and browser-fingerprinting behaviours. Tracker observations need contextual
and legal review; this skill does not determine consent-law compliance.

## Framework/source repository

When source is available, run its existing build, typecheck, lint, and test gates
before browser QA. For static-first frameworks such as Astro:

1. Build the production output.
2. Start the framework's preview server or use a deployed preview.
3. Sweep representative static pages and at least two routes from each dynamic
   template family.
4. Check hydration and client-side navigation states on interactive islands.
5. Confirm asset, canonical, sitemap, robots, and trailing-slash behavior against
   the production base URL.

Repository checks prove source integrity; browser checks prove rendered behavior.
Report them as separate evidence classes.

For Astro specifically, look for existing route/source analysis and launch-contract
scripts before introducing another crawler. Repository-native checks can map routes to
components, validate real image dimensions, correlate source reuse with rendered
similarity, run an exact 320px smoke pass, detect soft 404/page-identity failures, and
verify deployed URL/canonical/robots/sitemap contracts. Those checks are project-aware
evidence that a generic live-site scanner cannot infer.
