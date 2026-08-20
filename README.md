# Website Quality Skills

Three independent, evidence-led skills for reviewing rendered websites. Each answers
one question on its own and never claims evidence it did not inspect.

| Skill | Question it answers | Needs |
|---|---|---|
| [`website-qa`](skills/website-qa/SKILL.md) | Is this website broken? | a URL |
| [`figma-parity`](skills/figma-parity/SKILL.md) | Does it match these Figma nodes? | a URL, specific Figma nodes, and a Figma read path (Framelink) |
| [`engine-behaviour`](skills/engine-behaviour/SKILL.md) | Why does this engine, device or power state cause this symptom? | a symptom |

They work on any rendered site — Webflow, Framer, Shopify, Next, Astro, hand-written
HTML — because the checks look for **shapes and behaviour, never framework class
names**. Platform knowledge enters through an optional `--vocabulary` file and can only
add candidates, never override what shape analysis found.

- **Operator's guide:** [docs/using-website-qa.md](docs/using-website-qa.md) — install,
  recipes, what each output file is for, troubleshooting.
- **The review method** lives in each skill's `SKILL.md`, and the hard-won detail in its
  `references/`. Those are the source of truth; this file does not restate them.

## Requirements

| | |
|---|---|
| Node | 18 or newer (ESM, `structuredClone`). Developed and tested on Node 26. |
| Dependency | `playwright` 1.62.1 — the only npm dependency, pinned. |
| Browsers | Chromium required; WebKit for the cross-engine pass. `npx playwright install chromium webkit` downloads ~1 GB into the Playwright cache. |
| OS | macOS, Linux or Windows. Nothing platform-specific in the checks. |
| Network | Outbound access to the site under review. Nothing is uploaded anywhere. |
| Figma read path | `figma-parity` only. It needs a tool that can read a Figma file — Framelink's Figma MCP (`get_figma_data`, `download_figma_images`) is the one it is used with, and it needs a Figma access token of its own. Not an npm dependency of this repository: no code here imports it, and `website-qa` does not need it at all. |
| Chromium-only | `--why-css` (CSS attribution) uses the debugger protocol. Absent elsewhere, and stated as a limitation rather than skipped silently. |

Interactive use needs no install at all: every file in `skills/website-qa/scripts/` is a
self-contained IIFE you can paste into a browser console. It will tell you which
evidence it had (`roleSource`) so a weaker reading is never mistaken for a full one.

## Quick start

```sh
npm ci
npx playwright install chromium webkit
npm run qa -- --url=https://example.com --out=qa-output
```

`npm link` puts it on your PATH as `website-qa`. The runner is a plain Node CLI with one
pinned dependency; it is not published to npm, so install it from this repository.

Read `qa-output/<timestamp>/summary.md` top-down: regressions first, then findings
ordered by the content a reader loses. Full recipes are in the
[operator's guide](docs/using-website-qa.md).

Install the skills into Codex, Claude, OpenCode and Gemini:

```sh
npm run sync:skills
```

`npm run check:skills` reports installation drift without changing anything. To install
one skill elsewhere, copy its complete folder from `skills/`.

### As a plugin

The repository carries `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json` and a
`commands/` entry per skill, so a plugin install from this git URL picks up all three skills
plus `/website-qa`, `/figma-parity` and `/engine-behaviour`. Both manifests point at
`skills/<name>/`, the same folders `sync:skills` links — **one** copy of each skill, so the
plugin and the linked install cannot drift. No marketplace entry is published yet.

Installing the plugin *and* running `sync:skills` on the same machine would register each
skill twice. Pick one: `sync:skills` for your own machine, the plugin for distributing to
someone else's.

## How `website-qa` works

A run drives a real browser the way a reviewer would — every breakpoint, hovering,
clicking things open, tabbing through, scrolling to the bottom — and audits what it
finds at each step. A resting-state DOM dump can only find resting-state bugs; every
report that starts "on hover…" or "when you click…" is invisible to one.

Six phases, each owned by one module:

1. **Settle.** Fonts loaded, lazy images requested, entrance animations *finished* —
   `document.getAnimations()` is drained rather than a delay guessed at.
2. **Classify.** `audit_roles.js` infers what each element *is* — track, slide, scrim,
   sticky, closed panel, hover-reveal, marquee, decoration — from shape and behaviour.
   Every later check consults it, which is why a carousel is recognised on any stack.
3. **Measure**, per breakpoint: geometry (`audit_layout.js`), fit and headroom
   (`audit_slack.js`), polish, content, accessibility, SEO, AEO, CSS cascade. Each
   measurement is taken twice; anything appearing in only one reading is labelled
   timing-dependent instead of reported as fact.
4. **Sweep.** Every width in the range, not only the breakpoints — because hand-placed
   boxes fail *between* boundaries, where nobody looked. Defects are reported as the
   width **range** they exist in.
5. **Predict** (`--perturb`). Vary the inputs a site actually varies — a longer word,
   copy 50% longer, the webfont unavailable, text zoom at 200%, images absent — and
   report what each change *causes*. Applied to the render only; undone by reload.
6. **Explain and rank.** `--why-css` names the declaration behind a finding; findings
   are ordered by content a reader loses, and diffed against the previous run so a
   regression is reported before any absolute finding.

Adding a check is one file plus one row in `runner/lib/registry.mjs`, which declares
what each audit produces. The runner, the regression diff, the finding index and the
summary all read that declaration, and `npm test` asserts every declared finding
reaches all four.

## Costs and blast radius

Every run measures itself. `summary.md` ends with **What this run cost** — wall clock per
phase, and **page loads separately**, because loads are what the reviewed site pays for
being reviewed: its server, its analytics, its rate limits and its bot detection all see
them. `audit-manifest.json` carries the same figures for a consumer comparing two runs.

The blast radius is bounded by rule, not by luck. A run never submits a form, logs in or
out, pays, downloads, deletes, changes content, publishes, or follows an unclear action.
Only ephemeral browser state is permitted: controls, viewport, preferences, isolated
consent, client-side validation. Form fields *are* filled with deliberately invalid values
to test blur validation and then cleared — submit is never clicked and Enter is never
pressed. Perturbations mutate the current render and are undone by reloading rather than by
attempting to revert, so one missed revert cannot poison a later measurement.

Two phases reach further than the rest and are worth knowing about before pointing this at
production: **interaction** navigates when it clicks a CTA, and **links** requests every
destination it finds. Per-phase costs and radii are tabulated in the
[operator's guide](docs/using-website-qa.md#costs-and-blast-radius).

## Independence and integration

Each skill is independently installable and proves one thing alone:

| Skill | Proves alone | Never claims |
|---|---|---|
| `website-qa` | is this website broken? | that anything matches a design |
| `figma-parity` | does this match its specific Figma nodes? | that the website is otherwise sound |

**Integration is by artifact, never by import.** These skills interoperate with other
tools only by reading a declared output file when one happens to be present. There are
no cross-project package dependencies, submodules or shared runtime code, and none
will be added.

- **Consumers tolerate absence.** "No manifest found" is a normal state that narrows
  what can be concluded — not an error. Report what was lost instead of failing.
- **One current schema.** A format change bumps `schemaVersion`; validators reject
  every other version. Producers and consumers move together. Do not add aliases,
  dual-write fields, or implicit parsing fallbacks.
- **Provider identity survives.** A capture obtained elsewhere keeps its originating
  `captureProvider` and is never relabelled as a local capture. A remote screenshot
  service cannot establish Figma parity by itself — the Figma reference has to be
  obtained and compared independently.
- **Unknown conditions degrade confidence.** Where a capture cannot report a condition
  — observed content width, whether the page's own scripts ran, whether the target
  changed mid-run — the affected findings drop below `verified`. Unknown never defaults
  to acceptable.

**Shared contracts are duplicated, not extracted.** Where both skills need the same
file — `references/design-spec.md` and `references/design-spec.schema.json` — each
carries its own copy and `npm test` asserts they are byte-identical. Extracting them
into a shared package would create precisely the coupling this layout avoids; the
equality gate costs six lines and catches drift immediately.

## What these skills will not tell you

Stated here because a review that hides its limits is worse than a shorter one.

- **Nothing about Safari.** Playwright's WebKit is trunk on a non-Apple port. It cannot
  reproduce the URL bar, keyboard, safe areas, touch momentum, Low Power Mode or iOS
  autoplay policy. Cross-engine differences are leads; devices settle them.
- **Nothing inside a closed shadow root.** Open roots are traversed and reported against
  their light-DOM host. Closed ones are unmeasurable, and that is stated in the run.
- **Nothing about contrast over imagery.** CSS cannot give a ratio against a photograph;
  those cases are listed separately as "judge this on the screenshot".
- **Nothing a page never rendered.** Authenticated states, form submissions and backend
  delivery are out of scope unless explicitly prepared and declared.
- **No unverified claim of absence.** A missing element needs a clean screenshot as well
  as a selector miss; selectors alone do not prove absence.

## Verify the repository

```sh
npm test
```

Validates public disclosure, shared evidence contracts, both skill packages, the
detector fixtures (each asserting a defect is caught *and* correct markup stays clean),
the regression suite, the registry contract, and the Figma parity utilities.

## License

MIT
