# Website Quality Skills

Independent, evidence-led skills for reviewing rendered websites:

- `website-qa` finds functional, responsive, accessibility, metadata, runtime and
  visual defects without needing a design reference.
- `figma-parity` compares a rendered interface with exact Figma nodes, breakpoints
  and states.

They run independently. Parallax can import their evidence manifests, and Forge can
supply remote captures, without either service becoming a runtime dependency.

## Independence and integration

Each skill is independently installable and answers one question on its own:

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
- **Schemas evolve additively.** New fields only, with `schemaVersion` bumped; the
  validator warns on an unknown newer version rather than rejecting it, so a consumer
  built against v1 keeps working against a v2 packet.
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

## Install

Link both canonical skills into Codex, Claude and OpenCode:

```sh
npm run sync:skills
```

Use `npm run check:skills` to report installation drift without changing anything.
To install only one skill elsewhere, copy its complete folder from `skill/`.

## Run Website QA directly

```sh
npm ci
npx playwright install chromium webkit
node skill/website-qa/runner/qa_runner.mjs --url=https://example.com --out=qa-output
```

## Verify the repository

```sh
npm test
```

This validates public disclosure, shared evidence contracts, both skill packages,
the website detector/regression suites, and the Figma parity utilities.

## License

MIT
