# Website QA tool landscape

## In this file

- The current recommendation
- Tools worth adopting, keeping optional or rejecting
- Coverage by QA concern
- Other agent skills reviewed
- Suggested order for future additions

Research date: 2026-08-03. This survey uses project documentation, source
repositories, and standards as sources. It is a selection guide for the
`website-qa` skill, not a recommendation to install every checker.

## Decision in one paragraph

Keep the existing Playwright runner as the orchestrator. It already has the hard
part that most checkers omit: real rendered states, responsive passes, hover/click/
scroll/keyboard interaction, console and failed-request capture, link requests for
visited pages, non-submitting form behaviour, multi-engine probes, reviewable image
tiles, and semantic run-to-run diffs. Add small standards engines and missing
evidence sources around it: axe-core, Nu HTML Checker, Lighthouse CI, a whole-site
link/crawl phase, trace-on-failure, deterministic sitemap/robots checks, and source
repository gates. Keep security, privacy, real-device, field-performance, and
pixel-baseline systems as explicit adapters because they are slower, credentialed,
environment-sensitive, or have a different risk boundary.

## Prioritised adoption matrix

| Priority | Candidate | Decision | What it adds beyond the runner | Cost, licence, and rationale |
|---|---|---|---|---|
| 1 | Playwright tracing/HAR | **Adopt now** | Retains the action timeline, DOM snapshots, screenshots, console and network evidence for a failure instead of only truncated event strings. | No new browser stack; use the existing Playwright dependency. Trace only failures or an explicit debug run because Playwright calls always-on tracing performance-heavy. [Trace guidance](https://playwright.dev/docs/best-practices) · [Playwright licence](https://github.com/microsoft/playwright/blob/main/LICENSE) |
| 1 | `@axe-core/playwright` | **Adopt now, opt-in standards phase** | Standards-backed WCAG/ARIA rules, including result metadata and `incomplete` cases, rather than only the runner's targeted accessibility heuristics. Run once at rest and again after the runner exposes inactive UI. | Small Node dependency; axe-core is MPL-2.0. Deque says automated axe finds about 57% of WCAG issues on average, so it must not replace keyboard, screen-reader, visual, or manual review. [axe-core](https://github.com/dequelabs/axe-core) · [Playwright integration](https://playwright.dev/docs/accessibility-testing) |
| 1 | Nu HTML Checker (`vnu`) | **Adopt now, opt-in standards phase** | Parser/content-model, ARIA-in-HTML, SVG and markup errors that computed-DOM heuristics cannot establish. | MIT. Available as self-contained binaries, Docker, Homebrew, npm/JAR; the JAR needs Java 17. Prefer local/bundled execution over sending private previews to a public service. [Repository and installation](https://github.com/validator/validator) |
| 1 | Lighthouse CI | **Adopt now when performance/SEO/budgets are in scope** | Repeat lab runs, assertions, resource budgets and stored comparisons for performance, accessibility, SEO and best-practice audits. The current runner only attributes layout shift; it does not measure LCP, INP proxies, TBT, Speed Index, bundle/resource budgets, or the loading waterfall. | Apache-2.0; Node CLI plus Chrome. Keep its score separate from functional QA and report failing audits/metrics, not “score low.” LHCI explicitly supports multiple runs to reduce variance. [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) |
| 2 | Unlighthouse | **Optional whole-site Lighthouse adapter** | Crawls and smart-samples an entire site, runs Lighthouse, and presents a cross-route UI—useful when a one-page LHCI selection would miss template families. | MIT, Node 22.18+ and Puppeteer/Chrome. It combines concerns already available through the proposed crawler plus LHCI, so do not make it a second default route inventory; use it for a broad performance/SEO engagement. [Unlighthouse](https://github.com/harlan-zw/unlighthouse) |
| 1 | `lychee` | **Adopt now for source and whole-site link coverage** | Checks links in built HTML/CSS/XML/Markdown as well as a website, so orphaned or unsampled output can fail without waiting for a browser route selection. JSON/JUnit output is CI-friendly. | Standalone Rust binary, Docker, Homebrew or Action; dual MIT/Apache-2.0. Configure cache, excludes, redirects, authentication and rate limits; do not treat bot-blocked external links as confirmed broken. [lychee](https://github.com/lycheeverse/lychee) |
| 2 | Linkinator | **Optional Node-native alternative to lychee** | Recursively crawls live sites or local files; checks CSS URLs and fragments, supports redirects/status policies, URL rewriting, headers and JSON/CSV. Its clean-URL mode is useful for Astro/static-host output. | MIT; npm, standalone binaries or Docker. Choose **one** of Linkinator or lychee. Prefer lychee for fast source/CI checking; prefer Linkinator when JavaScript API integration, fragment validation or static-host URL rewriting materially helps. [Linkinator](https://github.com/JustinBeckwith/linkinator) |
| 1 | Native sitemap/robots inventory phase | **Adopt now** | Fetches `/robots.txt`, sitemap declarations and sitemap indexes; validates XML/URL constraints; checks listed URLs, canonical host/protocol, accidental `noindex`, and gaps between source routes, sitemap routes, and crawled routes. | No dependency is necessary for the common checks. Base semantics on RFC 9309 and the Sitemap protocol. The Google C++ parser is Apache-2.0 and production-derived, but is too heavy as a default Node dependency; use it only for disputed matching edge cases. [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309) · [Sitemap protocol](https://www.sitemaps.org/protocol.html) · [Google parser](https://github.com/google/robotstxt) |
| 1 | Project-native build/check/test gates | **Adopt now when source is present** | Finds route generation, type, lint, content-schema, asset-path, hydration and production-build failures before browser QA. For Astro specifically, run the repository's install, `astro check`, `astro build`, then audit `astro preview`; do not infer success from `astro dev`. | Reuse the project's pinned package manager and scripts; add no global dependency. `astro check` exits 1 on diagnostics and Astro documents production build/preview as the deployable-output check. [Astro CLI](https://docs.astro.build/en/reference/cli-reference/) · [Astro build and preview](https://docs.astro.build/en/develop-and-build/) |
| 2 | Playwright screenshot expectations | **Optional adapter/reference** | True pixel baselines and diff artifacts for stable, intentionally versioned pages/components. The runner currently captures screenshots and semantic findings but does not pixel-diff images. | `@playwright/test` uses pixelmatch and requires baselines generated in a consistent OS/browser/font environment; dynamic content and animation make it noisy. Keep it a deliberate regression suite, not the generic QA default. [Visual comparisons](https://playwright.dev/docs/test-snapshots) |
| 3 | Lost Pixel | **Avoid for new adoption** | It offered Storybook/Ladle/page visual baselines, breakpoints, browser selection, masking and retries. | MIT, but the source repository was archived read-only on 2026-04-22 and the product was sunset. Do not start a new dependency on it; use Playwright screenshots. [Archived Lost Pixel repository](https://github.com/lost-pixel/lost-pixel) |
| 2 | SiteOne Crawler | **Optional adapter/reference** | Fast whole-site discovery plus status, redirects, headers, titles, SEO, security, accessibility and performance summaries in HTML/JSON, with a CI gate. Useful for large or unfamiliar public sites before choosing browser samples. | MIT, cross-platform single binary. It overlaps heavily with the runner, Lighthouse, axe and link checking, so use its crawl inventory/aggregate report rather than merging every duplicate finding. [SiteOne Crawler](https://github.com/janreges/siteone-crawler) |
| 2 | Chrome UX Report API / `web-vitals` | **Optional field/RUM adapter** | Real-user p75 LCP, INP and CLS at page/origin level (CrUX), or first-party RUM with attribution (`web-vitals`). This answers a different question from a lab browser run. | CrUX needs a Google Cloud API key, has coverage thresholds, and reports a rolling 28-day aggregate; `web-vitals` requires instrumentation and a reporting endpoint. Never compare either as if it were the runner's single synthetic session. [CrUX API](https://developer.chrome.com/docs/crux/api) · [`web-vitals`](https://github.com/GoogleChrome/web-vitals) |
| 2 | sitespeed.io | **Optional deep-performance adapter** | Repeated real-browser tests, HAR waterfall, video/filmstrip, visual metrics, long tasks, budgets, and monitoring output; can run Safari on a real iPhone over USB. | MIT, but materially heavier: Docker is easiest; Node mode may need browsers, FFmpeg and Python. Prefer it when performance is the task, not in every general QA run. [sitespeed.io](https://github.com/sitespeedio/sitespeed.io) |
| 2 | Browsertime | **Optional performance-engine reference** | The lower-level engine under sitespeed.io exposes load/resource/visual/LCP metrics and scripted interactions for teams building a custom measurement adapter. | Apache-2.0; Node/Docker plus browsers and optional video dependencies. Prefer sitespeed.io's reports and budgets for normal use; adopt Browsertime directly only if the skill needs a programmable performance engine. [Browsertime](https://github.com/sitespeedio/browsertime) |
| 2 | BrowserStack Automate | **Optional real-device/browser adapter** | Actual Safari/iOS and Android hardware plus browser/OS combinations, video, console and network logs. Playwright's bundled WebKit is derived from WebKit sources and is not branded Safari; viewport/device emulation is not physical-device testing. | Commercial account and credentials; Local tunnel required for private previews. Use only for target devices/bugs or a release matrix, not a combinatorial default. [Playwright browser limitations](https://playwright.dev/docs/browsers) · [BrowserStack Playwright](https://www.browserstack.com/docs/automate/playwright) |
| 2 | MDN HTTP Observatory | **Optional security-header adapter** | Independent checks for CSP, HSTS, framing, referrer/cross-origin policy, cookies and related preventive headers. | Public v2 API; a scan and its history are public, and the service explicitly says an A+ is not proof that the site is secure. Do not send private hosts or sensitive preview domains. [Observatory FAQ/API](https://developer.mozilla.org/en-US/observatory/docs/faq) |
| 2 | OWASP ZAP Baseline | **Optional authorised passive-security adapter** | Spidering plus passive alerts for cookie flags, mixed content, headers, CSRF indicators, information leakage and other web-security smells. | Apache-2.0; Docker/Java and more triage. Baseline is time-limited and performs no attacks, so it can be CI-safe; still require target authorisation and a separate security-labelled report. [Baseline scan](https://www.zaproxy.org/docs/docker/baseline-scan/) · [ZAP licence/source](https://github.com/zaproxy/zaproxy) |
| 2 | EDPS Website Evidence Collector | **Optional privacy/cookie adapter** | Reproducible evidence of cookies, browser storage, first/third-party requests, EasyPrivacy matches, HAR traffic and WebSockets—especially useful for pre-consent behaviour. | EUPL-1.2; Node/Chromium or container; only officially exercised by EDPS on Linux/macOS. It gathers evidence, not a legal conclusion. [EDPS inspection software](https://www.edps.europa.eu/edps-inspection-software_en) |
| 2 | Schema.org Validator + Google Rich Results Test | **Optional manual reference** | Vocabulary/shape validation and Google-specific rich-result eligibility beyond “JSON parses.” | Hosted interactive tools; no stable public automation contract should be assumed. Run representative templates manually and verify markup matches visible content. Google explicitly distinguishes generic Schema.org validation from Google rich-result checks. [Google structured-data testing guidance](https://developers.google.com/search/docs/appearance/structured-data) |
| 2 | W3C CSS Validator / Stylelint | **Optional source/standards reference** | Formal stylesheet checks (W3C service) or project-controlled invalid-syntax and policy linting (Stylelint). | Prefer an existing Stylelint configuration in source. The W3C CSS service exposes an API but asks automated clients to rate-limit or self-host; modern/draft syntax can produce low-value noise, so it should not gate generic rendered QA. [W3C CSS Validator API](https://dev.w3.org/2002/css-validator/api.html) · [Stylelint rules](https://stylelint.io/user-guide/rules/) |
| 2 | HTML Validate | **Optional source-template adapter** | Strict offline checking of full documents or incomplete framework component templates, with configurable project rules; useful before a component renders into a crawlable page. | MIT, Node CLI/library, all local. Nu remains the authority for final built HTML; use HTML Validate only when the repository owns fragment/template linting that Nu cannot consume directly. [HTML Validate](https://github.com/html-validate/html-validate) |
| 2 | Accessibility Insights for Web | **Optional manual assessment companion** | A Microsoft browser extension for guided assessment of websites/apps. It helps structure the manual WCAG work that axe cannot automate. | MIT browser extension; optional telemetry is disclosed. It is a human workflow, not a headless adapter, so reference it for dedicated accessibility reviews rather than runner output. [Accessibility Insights for Web](https://github.com/microsoft/accessibility-insights-web) |
| 3 | webhint | **Reference, do not add by default** | Customisable CLI/browser/VS Code hints across accessibility, speed, compatibility and common errors. | Apache-2.0 and Node, but most default concerns overlap axe, Lighthouse, Nu, source lint and the runner. Mine its hint catalogue when a specific compatibility gap appears; a second aggregate “best practices” score would add noise. [webhint](https://github.com/webhintio/hint) |
| 3 | Pa11y | **Reject as a default dependency** | Its CLI/reporting is useful in isolation, but it can run axe-core and brings another browser-driven accessibility wrapper over a Playwright runner that can invoke axe in the exact exposed states it already creates. | LGPL-3.0-only and Puppeteer-oriented; duplicate orchestration and state setup outweigh the extra wrapper here. Keep as inspiration for thresholds/report formats only. [Pa11y](https://github.com/pa11y/pa11y) |
| 3 | BackstopJS | **Reject as a default dependency** | Visual regression UI and scenarios, but duplicates browser capture, state scripts and pixel comparison available in the existing Playwright ecosystem. | MIT, additional configuration/browser surface. Prefer Playwright screenshot expectations beside the existing runner. [BackstopJS](https://github.com/garris/BackstopJS) |
| 3 | Cypress as a second E2E stack | **Reject unless the project already owns it** | Capable functional E2E testing, and Astro documents it as an option, but it does not fill a gap that justifies two browser automation stacks. | Reuse existing Cypress tests if a project has them; do not add it to `website-qa`. Astro also documents Playwright against the production preview directly. [Astro testing guide](https://docs.astro.build/en/guides/testing/) |
| 3 | OWASP ZAP Full/active scan on a live site | **Avoid by default** | Active vulnerability probing is a security engagement, not ordinary website QA. | Potentially state-changing and load-producing. Run only with explicit authorisation, exact scope and a non-production target where possible. ZAP distinguishes passive Baseline from Full Scan. [ZAP Docker scan types](https://www.zaproxy.org/docs/docker/) |
| 3 | WebPageTest self-hosted `master` | **Avoid as an embedded dependency** | Excellent external/service performance evidence, but the active `master` branch uses Polyform Shield while a separate `apache` branch is Apache-2.0. | Prefer the hosted/API service, its Action, sitespeed.io, or Lighthouse CI unless there is a deliberate self-hosting decision and licence review. [WebPageTest repository/licensing](https://github.com/catchpoint/WebPageTest) |

## Coverage map by QA concern

### Functional and browser testing

The runner should remain responsible for exploratory generic behaviour: open common
controls, hover, scroll, tab, observe carousels, and collect states. A source project
should additionally keep a small Playwright Test suite for named critical journeys
with product-specific assertions—navigation, authentication, search, bookings,
checkout, or another core flow. Generic exploration can say “the toggle opened”; only
a product test can say “the correct record was saved.” Playwright Test supplies browser
isolation, auto-waiting and web-first assertions while using the same Chromium, Firefox
and WebKit family already present in the runner. [Playwright project](https://github.com/microsoft/playwright)

Do not make the generic runner guess destructive or business-specific actions. A form
or transaction should be submitted only on an authorised staging/test system with
known fixtures and a verifiable downstream result. Reuse a project's existing E2E tests
instead of teaching the universal skill credentials and product semantics.

### Accessibility

The current scripts catch important high-signal basics: names, labels, alt text,
duplicate IDs, broken ARIA references, positive tabindex, contrast/tap targets and
keyboard focus behaviour. axe-core complements them with a maintained rules engine for
WCAG 2.0/2.1/2.2 A–AAA and best practices. axe checks rendered content and its own API
instructs callers to expose inactive content and rerun, which aligns unusually well with
the runner's open-state pass. [axe API notes](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)

Still retain human checks for reading order, useful alternative text, focus restoration,
screen-reader task completion, captions, cognitive clarity and zoom/reflow. Playwright's
own accessibility guide warns that many issues require manual and inclusive-user testing.
[Playwright accessibility disclaimer](https://playwright.dev/docs/accessibility-testing)

The local `fixing-accessibility` skill is a good remediation companion after findings are
confirmed; it is a source-code rule catalogue, not a rendered-site conformance engine.

### Visual regression and visual judgement

Three different outputs must stay separate:

1. The runner's semantic regression diff says which measured defect class changed.
2. Playwright screenshot expectations say which pixels changed against an approved
   baseline.
3. Vision review says whether the composition, crop, hierarchy or polish looks wrong.

Pixel diffs are strongest on stable components and critical pages with frozen fixtures.
They are weak on live editorial pages, dates, ads, fonts, animation and personalised
content. Playwright warns that screenshots vary with OS, browser version, settings and
hardware, so baseline and test environments must match. Use masks/style overrides only
for genuinely volatile regions and review every baseline update. [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)

### Performance and Web Vitals

Use a layered model:

- The current runner owns layout-shift element attribution during its QA session.
- Lighthouse CI owns repeatable lab audits and PR budgets.
- sitespeed.io or WebPageTest owns deeper waterfalls, video/filmstrip and controlled
  performance investigations.
- CrUX or first-party `web-vitals` owns real-user experience.

Lab and field numbers are not interchangeable. CrUX is an aggregated rolling 28-day
view and may have no page-level record; its API can query one URL or origin at a time.
[CrUX data model](https://developer.chrome.com/docs/crux/api) The `web-vitals`
attribution build can identify contributors, but INP is not emitted without an
interaction, so a passive page load is insufficient. [`web-vitals` usage](https://github.com/GoogleChrome/web-vitals)

### HTML/CSS validation

Nu should validate built HTML or responses for representative routes, with parser errors,
invalid content models, duplicate attributes and accessibility-tree-affecting errors
ranked above advisory messages. It can batch-check a file tree or URLs and expose JSON/
GNU-style output. [Nu HTML Checker](https://github.com/validator/validator)

Formal CSS validation is less suitable as a universal gate because production CSS often
uses newly shipped syntax before a validator profile recognises it. Prefer the repository's
Stylelint configuration for source correctness and use the W3C CSS service only when CSS
standards conformance is explicitly requested. This complements the runner's computed-style,
layout and cascade probes; it does not replace them.

### Crawling and links

The runner currently verifies links found on the URLs selected for browser review. It is
not a crawler and cannot prove whole-site coverage. Add a discovery stage before the
browser matrix:

1. Enumerate source routes and built files when available.
2. Fetch `robots.txt`, all declared sitemap indexes/sitemaps, and normalise their URLs.
3. Crawl same-origin HTML with a conservative concurrency/rate limit, respecting scope.
4. Diff source, sitemap and crawl sets; group routes by template and select browser samples.
5. Use lychee over the built output and/or URL set for statuses; verify suspicious external
   failures because HEAD blocking, rate limits and bot protection are common.

SiteOne can perform steps 2–4 for a large public site, but its broad analyzer should be an
inventory assistant rather than a second source of duplicate low-level findings.

### SEO, metadata and structured data

The existing runner already checks title, description, canonical, Open Graph, viewport,
JSON-LD parseability, robots metadata and cross-page duplication when supplied multiple
template siblings. Extend coverage through crawl-set comparisons:

- every indexable sitemap URL returns a successful canonical page;
- canonical, `og:url`, sitemap URL, redirects and trailing-slash policy agree;
- public production pages are not accidentally `noindex`, while previews are intentionally
  excluded;
- `hreflang` references are reciprocal and resolve when localisation exists;
- structured data parses, uses known Schema.org terms, satisfies any Google feature
  requirements, and describes visible page content.

Use the local `fixing-metadata` skill to remediate confirmed source issues. Use hosted
Schema.org/Google tools for representative structured-data templates, not as a silent
automated pass: the Rich Results Test covers Google-supported result types, whereas the
Schema Markup Validator is generic. [Google's distinction](https://developers.google.com/search/docs/appearance/structured-data)

### Security headers and transport

Add a cheap first-party response-header inventory to every run: HTTPS and redirect chain,
HSTS, CSP (including report-only), frame controls, content-type sniffing, referrer policy,
permissions policy, cross-origin policies, cookie `Secure`/`HttpOnly`/`SameSite`, mixed
content and certificate failures. Treat absence as context-sensitive, not automatically
critical; a static brochure and an authenticated application have different threat models.

MDN Observatory is a good independent second opinion for public production domains. ZAP
Baseline is broader and can spider passively. Neither is a penetration test or proof of
security: Observatory explicitly excludes issues such as SQL injection, outdated software
and vulnerable plugins. [Observatory limits](https://developer.mozilla.org/en-US/observatory/docs/faq)

### Privacy, cookies and consent

The useful automated assertion is evidence before and after a consent decision, not
“cookie banner exists.” Start a fresh context with no stored state, record cookies,
local/session storage and third-party requests before interaction, then repeat after
reject-all and accept-all when those controls exist. Compare the three evidence sets and
flag unexplained state or transmissions as **SUSPECTED**, not “illegal.” Jurisdiction,
purpose, necessity and consent law require policy/legal judgement.

The EDPS Website Evidence Collector is the strongest ready-made reference because it is
designed to collect cookies, third-party traffic, EasyPrivacy matches, HAR and WebSockets
locally and reproducibly. Its output can inform a future adapter or privacy-specific phase;
it should not be folded into the default install. [EDPS WEC capabilities](https://www.edps.europa.eu/edps-inspection-software_en)

### Forms

Keep the default runner non-submitting. It already covers labels/names/types, required
state, iOS zoom risk, blur validation and generic success/error state quality. Add actual
submission only when all of the following are known: authorised non-production target,
fixture data, expected request, expected response, downstream receipt/storage assertion,
and cleanup. Playwright network events distinguish transport failures from HTTP 4xx/5xx—
HTTP error responses do not emit `requestfailed`, so both response status and request
failure must be observed. [Playwright BrowserContext network events](https://playwright.dev/docs/api/class-browsercontext)

Test keyboard submission, double-submit prevention, pending state, server rejection,
offline/retry behaviour, autofill, file constraints and preservation of user input after
errors where relevant. These are product journey tests, not safe universal probes.

### Cross-browser and devices

Default local coverage should be Chromium plus WebKit for key pages, with Firefox added
when compatibility is in scope. Use Playwright device descriptors for fast viewport,
touch, user-agent and scale-factor emulation, but label the evidence **emulated**. Playwright
states that its WebKit build is not branded Safari and that platform features/codecs vary;
running WebKit on macOS is the closer Safari approximation. [Playwright browsers](https://playwright.dev/docs/browsers)

Escalate to real hardware for iOS Safari viewport chrome, touch/gesture, virtual keyboard,
autofill, media, camera, memory/thermal constraints or a customer-reported device bug.
BrowserStack can run the same Playwright family against real devices and private previews
through a Local tunnel, but is a paid adapter with credentials. [BrowserStack Local](https://www.browserstack.com/docs/automate/playwright/local-testing)

### Network and runtime errors

Preserve the current listeners for console warnings/errors, uncaught page errors, failed
requests and HTTP 4xx/5xx responses. Improve evidence rather than adding another tool:

- de-duplicate by message/source/status while retaining counts and first/last occurrence;
- retain request method, resource type, initiator/frame and redirect chain;
- capture trace/HAR only on failure or explicit debug mode;
- classify expected analytics/ad-block/CORS noise separately;
- repeat after interaction and scrolling because lazy/hydrated failures occur later;
- report coverage gaps when a service worker hides interception—Playwright recommends
  blocking service workers when routes/network events appear missing. [Playwright network guidance](https://playwright.dev/docs/network)

Trace Viewer can show the action timeline, DOM snapshots and network request context, which
is much more useful for a flaky interaction than another screenshot. Do not enable it on
every successful breadth sweep because of storage and runtime cost.

### Sitemap and robots

Validate `robots.txt` at the origin root and interpret it per RFC 9309. Confirm any declared
`Sitemap:` URLs resolve; rules apply to the host/protocol/port that serves the file. For
each sitemap or index validate UTF-8 XML, namespace, same-site constraints, absolute escaped
`loc` URLs, gzip handling, redirects/statuses, and the 50,000 URL / 50 MB uncompressed
limits. [Robots standard](https://www.rfc-editor.org/rfc/rfc9309) · [Sitemap requirements](https://www.sitemaps.org/protocol.html)

Then perform semantic checks the XML schema cannot: production base URL, canonical
agreement, accidental staging hosts, unexpected missing route families, URLs disallowed
by robots, and indexable URLs absent from navigation/crawl. A sitemap is a discovery hint,
not proof of indexing. [Sitemaps.org overview](https://www.sitemaps.org/)

### Framework and static-site checks, especially Astro

Framework detection should select repository gates, never change the rendered QA bar. For
Astro:

1. Use the pinned package manager and run existing lint/test scripts.
2. Run `astro check`; it performs diagnostics including type checking in `.astro` files and
   exits non-zero on errors. [Astro CLI](https://docs.astro.build/en/reference/cli-reference/)
3. Run `astro build`; static dynamic routes must be enumerated by `getStaticPaths()`, so build
   failures and output inventory are valuable route evidence. [Astro dynamic route requirement](https://docs.astro.build/en/reference/errors/get-static-paths-required/)
4. Start `astro preview` or the adapter-equivalent production preview and run browser QA
   against that output. Astro describes preview as a way to catch build-output errors before
   deploying. [Astro build/preview](https://docs.astro.build/en/develop-and-build/)
5. Diff `dist/` HTML routes, source page routes, sitemap URLs and crawl URLs. Sample at least
   two pages from each dynamic family so the runner's duplicate title/canonical checks work.
6. Exercise every client-hydrated island and client-side navigation path; watch for missing
   chunks, hydration/runtime errors, asset paths and state that only fail in production mode.

For Next, Remix, SvelteKit, Eleventy, Hugo or another stack, use the same shape: repository's
own type/lint/test/build gates, production-like preview, output/route inventory, then the
framework-neutral browser sweep.

## External agent skills surveyed

`npx skills find` was also searched across website QA, Playwright accessibility,
SEO, visual regression, performance, broken links, security and Astro testing.
Install counts below are discovery signals recorded on 2026-08-03, not quality
proof; the source instructions were inspected before making these decisions.

| Skill | Discovery signal | Decision |
|---|---:|---|
| `addyosmani/web-quality-skills@web-quality-audit` | ~19.3k installs | **Reference, do not install as a replacement.** Its Lighthouse-oriented checklist and current Lighthouse insight-audit vocabulary are useful; its bundled shell analyzer is intentionally shallow and overlaps this runner. |
| `cloudflare/skills@web-perf` | ~33.7k installs | **Use as an optional performance specialist.** Its trace-first workflow is strong on LCP breakdown, CLS culprits, render blocking, document latency, dependency graphs and quantified savings. It complements rather than replaces functional QA. |
| `coreyhaines31/marketingskills@seo-audit` | ~177.3k installs | **Reference for a deep SEO engagement.** It adds crawlability/indexation, internal-link depth/orphans, soft 404s, international SEO and rendered structured-data discipline. Keep marketing judgement outside the default defect sweep. |
| `firecrawl/firecrawl-workflows@firecrawl-seo-audit` | ~30.1k installs | **Optional only when Firecrawl is already available.** Do not add a network service dependency merely to duplicate the local crawler and browser evidence. |
| `community-access/accessibility-agents@playwright-testing` | ~232 installs | **Mine the test patterns, not the whole pack.** Valuable checks include axe after hidden states open, focus trapping/restoration, skip links, keyboard traversal and touch targets. Its cognitive/media companion skills cover accessible authentication, redundant entry, timeouts, captions and transcripts. |
| `withastro/astro@astro-developer` | ~203 installs | **Use Astro's official project guidance when framework questions arise.** It is not a QA system; pair it with the project-native build/preview/route checks below. |
| Low-install generic `qa`, `audit-website`, `website-operator-qa`, and visual-regression skills | mostly ~11–620 installs | **Do not install.** They added no verified capability beyond the existing runner, local scripts, or the maintained primary tools in this survey. |

The practical composition is therefore `website-qa` as orchestrator plus a named
specialist when its evidence type is requested—not a chain of overlapping generic
audit skills.

## Complementary remediation workflows

These capabilities complement the runner rather than replace it:

| Capability | Use after/in addition to `website-qa` |
|---|---|
| Accessibility remediation | Review and minimally fix confirmed source-level names, semantics, keyboard, focus, forms, announcements, contrast and motion issues. |
| Metadata remediation | Repair title, description, canonical, robots, Open Graph and JSON-LD patterns after route-level evidence exists. |
| Motion source audit | Classify CSS/JavaScript animation cost and anti-patterns; complement observed runner motion and jank evidence. |
| Performance optimisation | Apply targeted render-pipeline fixes after Lighthouse, field-data or profiler evidence exists. |
| Source code review | Review fixes against repository standards once QA findings have been resolved; it does not audit the rendered site. |

## Suggested integration order

1. Add trace-on-failure and richer network evidence inside the existing Playwright
   runner—maximum diagnostic value, no new browser stack.
2. Add opt-in `axe`, `vnu`, and Lighthouse phases with explicit phase availability in
   `summary.md`; a missing executable must read **NOT RUN**, never pass.
3. Add deterministic robots/sitemap/source/build inventory and lychee coverage, feeding
   discovered route families into URL selection.
4. Add a small adapter interface that stores external tool JSON as separate evidence and
   links it from the report. Start with SiteOne, Observatory and ZAP Baseline.
5. Add privacy (EDPS WEC), field performance (CrUX/RUM), real-device cloud and pixel
   baselines only for requests that name those concerns.

The core principle is restraint: one orchestrator, one owner per evidence type, explicit
coverage gaps, and no duplicated low-confidence finding merely because several tools can
emit it.
