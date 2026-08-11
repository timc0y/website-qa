# Known blind spots from an anonymised review cross-check

This note distils an internal comparison between a parity run and a human bug
list. Client, people, project, route, issue, Figma, and reference-site identifiers
have been removed. The durable value is the five failure shapes and the workflow
changes they caused.

## 1. Single-node checks miss page-level relationships

Examples from the anonymised review:

- two adjacent sections each matched its own source colour, but their seam was
  wrong as a pair;
- body-copy opacity was never checked as its own property; and
- one icon used a different fill token while the section-level colour checks
  passed.

Response: the comparison workflow now includes boundary/adjacency, text
`opacity`, and per-icon/SVG `fill`. A page is not merely a bag of individually
correct nodes.

## 2. Testing only the controls named in a brief hides untested interactions

The review found an untested filter, a missing hover treatment, and inconsistent
navigation scroll behaviour. The audit had exercised only two named controls.

Response: run `discover_controls.mjs`, exercise every discovered non-link control
on every route in scope, and record a route/control-specific “Not checked” line
when time or access prevents it. A mechanism working on one page is not evidence
for another page.

## 3. Soft requirements can disappear during consolidation

A staggered animation request was found in design comments but dropped from the
final open-items list. Another check proved only that an animation attribute
existed, then incorrectly implied the requested animation behaviour was met.

Response: every requirement sourced from comments or approved correspondence
survives into the final open-items list with its own confidence. State exactly
what was proved: “attribute exists” and “requested count-up behaviour works” are
different claims.

## 4. A Figma-only model cannot evaluate an external reference

The stakeholder had supplied a separate live animation reference that was not in
Figma. The comparison engine had no slot for it, so it vanished from the run.

Response: intake records approved external references in the private project map
and hands them to a human visual review. This remains outside the node-diff model;
the important behaviour is naming the gap rather than silently dropping it.

## 5. Inline details and doomed pages need explicit handling

The human review caught one styled phrase below the class-level comparison
granularity. It also spent time reviewing a placeholder page already scheduled
for deletion.

Response: list inline-span granularity as a known limitation when it matters. Put
scheduled-for-deletion routes at the top of the report in plain language so a
non-technical reviewer does not spend time filing findings nobody intends to fix.

## Calibration

The parity process was strongest on a hard, specific node-versus-DOM mismatch. It
was weakest where the question concerned relationships, unenumerated controls,
soft correspondence, an external reference, or sub-class detail. The workflow
now treats those as named coverage dimensions rather than assuming that a clean
node diff answered them.
