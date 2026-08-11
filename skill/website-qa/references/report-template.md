# QA report template

Use this shape for the human-facing report. Link to the run's `summary.md`,
`findings.json`, and relevant screenshots rather than copying raw detector output.

## Scope and evidence

- URLs and route/template families tested
- Breakpoints and browser engines tested; physical devices tested, or an explicit
  statement that none were used
- Interaction phases, forms, links, vision, and optional standards tools run
- Baseline used, or state that this was the first run
- Anything skipped, capped, blocked, or not observable

## Regressions

List NEW and CHANGED findings before absolute defects. Group repeated symptoms by
their likely root cause. For each item include severity, evidence class, URL,
breakpoint, engine, anchor or selector, observed behavior, expected behavior, and
the smallest useful reproduction.

## Findings

Order by severity, then by confidence:

1. defects
2. cross-browser differences and device hazards
3. accessibility and SEO
4. polish
5. content
6. environment noise

Label every item MEASURED, OBSERVED, or SUSPECTED. A missing-element claim must
link to a clean screenshot. A visual finding must include the breakpoint, scroll
offset, and nearest heading.

## Verified correct

Name high-risk surfaces that were exercised successfully. This is evidence, not
an “everything else passed” claim.

## Coverage gaps

State what the review could not prove: untested route families, unavailable
engines or devices, authenticated states, backend delivery, form submission,
unreadable stylesheets, unsettled screenshots, or capped link/state coverage.
