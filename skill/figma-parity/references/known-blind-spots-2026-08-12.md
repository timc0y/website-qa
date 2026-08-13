# Known blind spots from a large multi-agent sweep

## In this file

- Dispatched checks skipped the real tooling
- Concurrent browser sessions interfered
- Frame-name assumptions hid real references
- Stale node IDs pointed at deprecated canvases
- Layout sampling hid content errors
- Topic-first consolidation hid page context

This note distils failures from one real project's overnight sweep: ~20 dispatched
checks, most as separate background agents sharing one interactive browser. Unlike
the 2026-08-07 note (a single audit's blind spots), the failures here are mostly
about the checks not using this skill's own machinery, and about running many
checks at once. Client, route and Figma identifiers are removed; the failure
shapes and the fixes are not.

## 1. Dispatched checks reinvented an ad-hoc process instead of using this skill's

Every dispatched check had access to `capture.mjs`, `compose_review.py`,
`compare_images.py`, and `website-qa`'s `vision-qa.md` protocol (tiles, per-image
tiered questions, `assert`-backed findings). Almost none of them used any of it.
Each one freehanded a `getBoundingClientRect`/`getComputedStyle` read through an
interactive browser tool instead, because that was the fastest path to *an*
answer, not the best path to a *trustworthy* one. The result: strong numeric
findings ("this card is 88px too wide") and weak-to-absent visual judgement
("does this look designed and finished") on the exact items that most needed the
second kind — hover-outline requests, gradient/shadow taste calls, "does this
feel unfinished" content gaps.

Response: when dispatching a figma-parity or website-qa check, name the actual
script or protocol to follow (`capture.mjs` + `compose_review.py`, or the vision
tile pipeline in `vision-qa.md`), not just the goal. A prompt that says "compare
this page to Figma" gets a DOM read. A prompt that says "run capture.mjs, then
review the paired images against vision-qa.md's five passes" gets a real vision
check. Don't assume a capable agent will find and use the tooling on its own
under time pressure — it will reach for the nearest tool instead, every time.

## 2. Concurrent checks sharing one interactive browser hijack each other

`capture.mjs` launches its own Playwright browser per invocation and cannot be
hijacked. The interactive browser tool used by most dispatched checks tonight
shares one pool of tabs across every concurrent agent. Nearly every check that
used it reported the same symptom: mid-check, the tab silently navigated to a
different URL that another concurrent agent had requested, and measurements
after that point were of the wrong page until someone noticed and re-navigated.
One check burned most of its time recovering from this rather than checking
anything.

Response: **local-parity (`capture.mjs`) is not just preferred, it is the only
safe choice once more than one check may run at the same time.** If an
interactive browser must be used instead (state that needs a signed-in session,
for instance), each concurrent check must open its own tab before navigating
anywhere, and must re-verify `location.href` before trusting any measurement —
never assume the default/shared tab still shows the page you last put there.

## 3. A missing frame at the expected name was reported as "no spec exists"

Two real specs were missed this way. A tax calculator's mobile layout exists,
in full, on the project's own canonical canvas — filed under a frame named for
a *different* page ("Services [Unique Components]"), because the design file
groups mobile-only frames by some organizing principle that doesn't always match
the route being checked. A second check treated an entire template as having
"no Figma frame" after checking only the one frame name it expected.

Response: before concluding a route has no design reference, search the whole
canvas for a frame with a plausible size and any matching component content,
not only a frame whose name matches the route. A 393-wide frame with a "tax
saving calculator" heading inside it is the spec, whatever the frame itself is
called. Only after that broader search comes up empty should a check fall back
to a fresh-eyes judgement with no reference at all (see `vision-qa.md` — this
is exactly what "would I believe this section is finished" is for).

## 4. A node ID from project docs was from a duplicate, deprecated canvas

This project's Figma file holds up to 3 copies of most page frames, on
separate canvases. One project's
own map file cited a node ID for a component that turned out to live on the
deprecated "Scoping For Development" hand-off copy, not the canonical canvas
every real comment and decision is anchored to. The two canvases share frame
names and near-identical layouts, so nothing about the stale ID looked wrong
until a live `depth:1` read of the canonical canvas simply didn't contain it.

Response: a pre-recorded node ID in a project's own map is a hypothesis, not a
fact, until you've fetched that exact ID and confirmed which canvas it resolves
under. When a project has more than one canvas copy (check `project-map.md`'s
`authority.canonicalCanvas` field), treat any node ID as unverified until you've checked
it against the map's declared *canonical* canvas or version, not just against a frame name
that happens to match.

## 5. Sampling one instance per shared template hid a per-instance data error

Checking one representative page for a shared component (one service page,
one audience page) is the right call for CSS/build defects — the fix, once
found, applies to every instance identically. It is the wrong call for
*content*: a live rating mismatch on one specific instance (a CMS item showing
two different values for the same fact in two places on its own page) would
never have been found by sampling a different instance, because the error was
data, not layout.

Response: instance-sampling is a build-defect optimisation. Never apply it to
content or data correctness. If time allows only a sample, say so explicitly
rather than letting the CSS-sampling convention silently cover data checks it
was never meant to.

## 6. The consolidated status file organized by topic, not by page, and named
pages without a link

Every dispatched check above produced a good per-page finding. The file that
consolidated them organized its main body by topic (launch gates, coverage
gaps, ClickUp tickets) with the same page's findings scattered across 3-4
different sections, and named pages as bare text (`` `/insurers/aviva` ``)
with no link to the live URL and no link to the Figma node either. A reader
who wanted to look at what a finding described had to reconstruct the URL by
hand, every time, for over a dozen pages across hundreds of lines.

Response: see `report-template.md`'s new "Consolidating many pages into one
status file" section. Once a status file covers more than a handful of
routes, its main body must be organized by page, each with a live link at the
head of its section, and every Figma node cited must be a link too. Do this
from the first draft, not as a later pass. It took a direct complaint from the
project owner ("I can't see the page it was found, the link") to catch this,
after the file had already grown past 900 lines organized the wrong way. That
is a sign the wrong structure was never actually usable, just tolerated
because nobody had tried to click through it yet.

## Calibration

This sweep was strongest on exactly what `capture.mjs`-driven checks measure
well: numeric geometry against a known node. It was weakest everywhere a check
skipped that tooling for a faster ad-hoc read, ran into another agent's browser
tab, gave up at the first missing frame name, trusted an old node ID without
re-fetching it, applied a build-defect shortcut to a content question, or
consolidated many pages' findings into a file organized by topic instead of by
page. None of these are new capability gaps — the tooling and the vision-QA
protocol already existed, and the correct report structure was one section
away in this same reference file. The gap was between what the skill
documents and what a dispatched agent, or a consolidation pass, under time
pressure will actually go and do.
