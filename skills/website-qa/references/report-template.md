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

For a single route, order by severity, then confidence. For a consolidated
multi-route report, organize by page first and use severity then confidence
inside each page:

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

## Consolidating many pages into one status file

The "URL" field above is not optional decoration in a multi-route report or
status file. Make it a real clickable link
(including the query param a reader needs to see the real build, e.g. `?dev=0`
on a project with a dev/live JS toggle), and when consolidating findings from
two or more routes into one file, organize the file's main body **by page**,
each with its own heading and that link at the top, not by severity or topic
alone. A reader who wants to see what a finding describes will not
reconstruct the URL by hand across dozens of findings. A finding nobody looks
at is a finding nobody fixes. Sitewide items (nav, footer, a shared component
touching many routes) get their own heading with one representative link,
not a copy of the same line repeated under every page it reaches.
