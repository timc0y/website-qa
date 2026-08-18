# Simple profile

## Reality

- Users: agents and maintainers independently reviewing rendered websites or comparing them with exact Figma evidence.
- Operators: Tim maintains the `website-qa` and `figma-parity` skills and their detectors/contracts.
- External consumers: Codex/Claude skill installations, Parallax evidence imports and optional Forge captures.
- Public contracts: skill instructions, evidence manifests, detector output and disclosure-safe packaging.
- Persistent production data: none; captures and review evidence belong to the inspected project.
- Compatibility obligations: keep both skills independently usable and avoid leaking private tooling names into public artifacts.
- Current scale and failure consequences: public review skills; weak evidence or contract drift produces false QA confidence.

## Architecture boundary

`website-qa` proves defects from rendered reality; `figma-parity` proves mismatch against supplied Figma nodes. Parallax may organise their evidence but is not required for either skill.

## Deletion proof

- Dead code: trace detectors, extension points, manifests and both installed skill copies.
- Types or compiler: script parsing is covered by the test suite.
- Behaviour: `npm test` and the focused detector/parity test groups.
- Build: run contract, disclosure, manifest and skill-document checks.
- Public surface: install each skill independently and validate representative evidence output.
