# Website quality architecture decision

Status: implemented architecture.

## Decision

`website-qa` and `figma-parity` are complete public capabilities. They must work
for an agency user who has a URL or Figma access and knows nothing about any
private tool. Public platform knowledge remains useful when it is observable
from served output; private tool knowledge and runtime discovery are forbidden.

The shared operating shape is:

```text
boundary → contract → selection → profile → execution → evidence → outcome → replay
```

## Extension contract

- Platform vocabulary is an optional, explicit input artifact. It may add
  selectors and public signatures, but cannot replace core checks or scan
  installed skills.
- Finding attribution is optional output enrichment. Core findings retain a
  stable public identity; an external consumer stores privileged cause and fix
  location in a separate sidecar keyed by that identity.
- Schema changes use an explicit version and one current contract. There are no
  compatibility aliases, implicit fallbacks, or dual-write fields.
- Coverage uses `ran`, `partial`, and `not-run`. Reports may call `not-run`
  “missing coverage,” but must not invent a fourth machine state.

## Ownership boundary

URL-visible symptoms remain owned by `website-qa`, even when privileged access
would explain the cause. `figma-parity` owns design comparison. A separate build
review may consume those artifacts and add private diagnosis, but neither public
skill names, discovers, imports, or requires that consumer.

## Implementation order

1. Define and validate stable finding IDs without changing current fields.
2. Add an explicit optional vocabulary input with no default behavior change.
3. Add attribution-sidecar validation as a separate artifact contract.
4. Migrate one finding family at a time with current-version fixtures.

Every step leaves the public repository independently installable and green.
