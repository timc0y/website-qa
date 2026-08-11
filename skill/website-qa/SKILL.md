---
name: website-qa
description: >-
  Check a live, preview or local website for visual, responsive, interaction,
  link, form, accessibility, SEO, console, network and browser problems. Use
  when reviewing a build or looking for regressions without comparing it with
  Figma. Works with Webflow and other rendered websites.
---

# Website QA

Check the website that a visitor receives. Run the checks, inspect the saved
screenshots and verify each important finding before reporting it.

Use `figma-parity` as well when the site must match a Figma design.

## Read these when needed

- Before a first review, read [reviewer-mindset.md](references/reviewer-mindset.md).
- Before looking through screenshots, read [vision-qa.md](references/vision-qa.md).
- Before trusting an unusual automated finding, read
  [false-positives.md](references/false-positives.md).
- For authenticated browsers or optional remote captures, read
  [execution-modes.md](references/execution-modes.md).

## Rules

1. Read regressions first. Something that broke since the previous run is usually
   more useful than a problem that may have existed for months.
2. Mark findings as `MEASURED`, `OBSERVED` or `SUSPECTED`. Do not present a guess
   as a measurement.
3. Confirm a missing element with both a clean screenshot and a page-structure
   check. A selector miss alone is not proof.
4. Separate first-party errors from analytics, chat, bot protection and other
   third-party noise.
5. State what was not checked. A skipped width, route, browser or interaction is
   missing coverage, not a pass.
6. Keep QA read-only. Do not submit forms, change content or publish the site.

## Choose how to run it

Use the local runner when possible. It checks more states and gives repeatable
results. Use an already-open browser for a signed-in page. Optional Forge
captures can help when a remote screenshot is the only practical route, but list
everything the full runner did not check.

Install dependencies once from the `website-qa` repository root:

```bash
npm install
npx playwright install chromium webkit
```

Run the audit from the directory containing this file and `runner/`:

```bash
node runner/qa_runner.mjs --url=https://site.com --out=./qa-run
```

Keep dependencies in the Website QA repository. Put `--out` in the reviewed
project's approved private work folder. Reuse the same output folder on later
runs so the runner can compare them.

Useful options:

| Option | Use |
|---|---|
| `--url=…` | Add another page. Include two pages from each CMS or dynamic template family. |
| `--breakpoints=1920,1512,1280,991,767,479,430,393` | Choose the widths to check. |
| `--engines=chromium,webkit` | Compare Chromium with WebKit/Safari behaviour. |
| `--selectors=./vocab.json` | Add selectors for site-specific components. |
| `--spec=./site.spec.json` | Check against agreed design measurements. |
| `--baseline=./qa-run/<timestamp>` | Compare with a named earlier run. |
| `--no-baseline` | Skip comparison with an earlier run. |
| `--external-links` | Check links to other websites too. |
| `--channel=chrome` | Use installed Chrome instead of bundled Chromium. |

## Work in this order

1. **Choose the pages.** Read `sitemap.xml` and source routes when available.
   Include every different layout and important journey. Include at least two
   pages from each CMS or dynamic template family. For a large site, state the
   sampling rule and list any gaps.
2. **Use production output.** For a local project, build it and audit the
   production preview. This catches broken asset paths, generated routes and
   production-only settings.
3. **Run Chromium and WebKit.** Keep `--out` the same as the previous run.
4. **Read `summary.md` first.** Deal with the regression section before the
   general findings. Then read `findings.json` for detail.
5. **Verify the findings.** Inspect a sample from each kind of warning. Inspect
   every High finding and every claim that something is missing.
6. **Inspect the screenshots.** Follow the visual review guide. Check desktop,
   mobile, opened controls and browser-to-browser differences. Record the width,
   scroll position and nearest heading for each visual finding.
7. **Check shared components everywhere.** When a shared component changed, add
   every page that uses it. Checking only the page being edited can miss the most
   valuable regression.
8. **Group related problems.** Six headings with the same mobile issue are one
   missing type rule, not six unrelated findings.
9. **Write the report.** Use
   [report-template.md](references/report-template.md). Separate defects,
   polish, content, accessibility/SEO, browser differences and local-tool noise.

## What the runner checks

- Layout at every width: overflow, clipping, wrapping, images, type, tap targets
  and empty content.
- Content and page setup: placeholder copy, dead links, titles, descriptions,
  canonical URLs, social metadata and structured data.
- Accessibility: labels, alt text, headings, focus, keyboard use, ARIA and colour
  contrast.
- Interactions: menus, dropdowns, accordions, tabs, carousels, hover, scrolling
  and focus order.
- Forms without submitting them: field names, labels, validation, input types and
  success/error messages.
- Loading and browser health: failed first-party requests, console errors, font
  failures, image loading and layout movement.
- Visual review images: page tiles, section crops, repeated-component sets and
  matching Chromium/WebKit views.
- Changes between runs and differences between pages that share one template.

Read [platform-notes.md](references/platform-notes.md) when a result depends on a
browser or website platform. Read [css-quality.md](references/css-quality.md)
before reporting duplicate rules, hard-coded design values or unexplained CSS.
Keep CSS quality notes in their own Low-priority section.

When the user names WCAG, Lighthouse, performance, HTML validity, CI or a source
framework, read [standards-tooling.md](references/standards-tooling.md). Read
[tool-landscape.md](references/tool-landscape.md) before adding another QA tool
or planning security, privacy, field-performance or real-device testing.

## Design measurements

`--spec` checks the live page against measurements agreed during the build. Use
an existing spec instead of interpreting Figma again. The format is explained in
[design-spec.md](references/design-spec.md), with runner details in
[design-spec-format.md](references/design-spec-format.md).

## Saved files

Each run writes `summary.md`, `findings.json`, `regressions.json`, screenshots
and `audit-manifest.json`. The manifest is a short index of what ran, what was
saved and what could not be checked. Its format is
[audit-manifest.schema.json](references/audit-manifest.schema.json).

The command returns a non-zero exit code when it finds a strong, important
problem. That is a QA result, not necessarily a broken runner.

## Done means

- every agreed page, width, browser and important state was checked or listed as
  missing coverage;
- every important finding was verified and points to a page, width and saved
  image or measurement;
- the visual screenshots were inspected, not merely generated;
- the report separates confirmed problems from suspicions and local-tool noise;
  and
- the website was left unchanged.
