# Simple

## Reality

- Users and external installs: Unknown.
- External surface: Disclosure-controlled repository containing independently installable `website-qa`, `figma-parity`, and `engine-behaviour` skills with Playwright utilities, a `website-qa` bin, and a `.claude-plugin/plugin.json` making the repository installable as a plugin. Public-facing intent is proven; npm publication is not, and no marketplace entry exists yet.
- Persistent data: None; captures and evidence belong to the inspected project.
- Compatibility: Preserve independent installation, manifests, provider provenance, current-schema validation, disclosure safety, and the frozen regression metric ids that stored runs depend on.

## Preserve

- Artifact-only interoperability and the rule that neither QA skill claims evidence it did not inspect.

## Current boundary

- `website-qa` evaluates rendered-site defects; `figma-parity` compares supplied Figma evidence. Neither requires or proves Parallax/Forge use.

## Ordinary paths

- Run either skill directly; use `npm run sync:skills` for local harness links and keep each skill's tests/contracts with its owner.

## Proof

- `npm test`, including disclosure, manifest, detector, regression, end-to-end, registry-contract, and parity suites.

## Reconsider when

- Both skills need the same evidence contract and can share it without coupling their independent installation.
