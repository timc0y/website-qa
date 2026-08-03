# Website QA

An evidence-led website QA skill and Playwright runner for auditing rendered sites
across routes, breakpoints, browsers, and interaction states.

It combines deterministic browser checks with a required visual review pass. Findings
are verified, severity-ranked, and separated from hazards or unconfirmed signals so the
report stays useful rather than noisy.

## What it covers

- responsive layout and overflow
- keyboard, focus, menus, tabs, accordions, and forms
- links, console errors, failed requests, and page identity
- accessibility and metadata signals
- visual composition, crop quality, consistency, and polish
- Chromium/WebKit differences and repeat-run regressions
- optional design-spec conformance

The workflow is read-only: it does not submit forms, publish content, or mutate the
site under review.

## Install the skill

Copy `skill/website-qa` into your agent's skills directory, preserving its internal
folders. For Codex, for example:

```sh
cp -R skill/website-qa ~/.codex/skills/website-qa
```

Then ask the agent to use `$website-qa` with a live, preview, or locally served URL.

## Run the browser harness directly

```sh
npm ci
npx playwright install chromium webkit
node skill/website-qa/runner/qa_runner.mjs https://example.com --out=qa-output
```

See [`skill/website-qa/SKILL.md`](skill/website-qa/SKILL.md) for the complete protocol,
flags, evidence model, and report format.

## Verify the repository

```sh
npm test
```

This runs the detector fixtures, regression and cross-page checks, cascade checks, and
the public-disclosure gate. CI also verifies the skill package metadata and links.

## License

MIT
