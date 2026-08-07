# Known blind spots — found by cross-checking against real client bug reports

Source: 30 open Marker.io tickets (via ClickUp) on the Executive Life site, filed by Helena
(the client-side reviewer) between 2026-08-06 and 2026-08-07, eyeballing the live staging
site. Cross-checked against every figma-parity finding produced for this same site over the
same period. **~25 of 30 tickets were never caught by the skill.** Two were caught but
demoted/lost during consolidation. One was caught and matched exactly. This file is a
prompt for whoever next iterates on this skill: five structural gaps, not one-off misses,
each with real ticket evidence and a proposed fix.

## Gap 1 — the skill only compares against a specific Figma node's specific property. It never looks at a page as a whole the way a human does.

Evidence:
- *"White background above, pale blue background below"* (`/relevant-life-insurance`) — we
  had confirmed each section's background colour in isolation (`.content-service`
  light-grey, `.about-service` white) but never checked the **seam** between two adjacent
  sections. Two individually-correct facts, an incorrect combination.
- *"70% text opacity here"* (`/relevant-life-insurance`) — `opacity` was never checked as a
  discrete property on body text anywhere in the audit; it only appeared in scrim/overlay
  checks.
- *"These icons use the brighter blue"* (`/single-director`) — per-icon colour tokens were
  never enumerated; colour checks focused on section backgrounds and text, not icon fills.

**Proposed fix:** add a "boundary and adjacency" pass to §5 (Compare in three passes) — for
every pair of vertically adjacent sections, diff their computed background against each
other, not just against their own Figma node. Add `opacity` and icon/SVG `fill` to the
mandatory property checklist in the workflow's step 5 ("Measured intent"), not just for
overlays.

## Gap 2 — interaction-testing was scoped to two controls (FAQ accordion, mobile nav), and everything outside that scope silently never got tested at all.

Evidence:
- *"Filters don't appear to be working?"* (`/knowledge-hub`) — filter markup was inspected,
  clicking was never tried.
- *"Add hover state to add button, lower opacity of other links"* (`/contact`) — no hover
  states outside FAQ/nav were exercised anywhere on the site.
- *"Nav stuck to the top edge of the screen"* (`/who-we-help`) — the nav's scroll-hide/show
  behaviour was confirmed to exist as a *mechanism*, never re-verified per page.

**Proposed fix:** §6 ("Inspect interactive and responsive states") currently reads as
optional/best-effort. Make it mandatory to run `discover_controls.mjs` and then click-test
*every* discovered non-link control across *every* page in the matrix, not just the ones
the brief happens to name. If time is short, say so explicitly in "Not checked" per control,
per page — not just once for the whole site.

## Gap 3 — findings surfaced in a deep research pass (e.g. mining Figma comments) get lost during consolidation into the final report if they aren't tagged as blocking.

Evidence:
- `SPEC-stagger` ("staggered load animation on hero/benefit cards") was found and logged as
  **UNVERIFIED** in `figma-map.json`'s `clientSpecFromComments` — then never appeared in the
  final consolidated report's open-items list. Ticket: *"Can these cards each have a
  staggered delay"* (`/relevant-life-insurance`).
- `SPEC-number-anim` was found and marked **"LIKELY MET — hero stat blocks carry
  `data-anim-on`/`data-anim`."** That check confirmed an animation *attribute exists*, not
  that it's the *right kind* of animation. Ticket: *"Some count-up or similar style
  animation on these numbers would be great to add"* — the client wants count-up, the build
  has a fade-in. We verified presence, not correctness, and then let the soft "likely met"
  verdict bury it.

**Proposed fix:** any finding sourced from Figma comments/client correspondence
(`clientSpecFromComments` or equivalent) must carry through to the final report's open-items
list unconditionally, tagged with its own confidence level, rather than being filtered out
during consolidation because it isn't a "hard" node-level mismatch. Separately: when a
finding claims something is "likely met" based on attribute/markup presence, the report
template should require stating *what specific behaviour* was or wasn't confirmed, not just
that instrumentation exists — "has a data-anim attribute" and "animates the way the client
asked for" are different claims and got conflated here.

## Gap 4 — the skill only ever compares against Figma. It has no way to catch "doesn't match a reference site the client mentioned."

Evidence:
- *"Not really following the animation reference —
  https://www.sparkadvisors.com/services"* (`/single-director`) — a real client reference
  point that exists nowhere in Figma and that this skill's design has no slot for.

**Proposed fix:** not a fix to the comparison engine — a fix to intake. Add a step to §1
("Scope a comparison matrix") that asks whether any external reference URLs exist in client
correspondence/comments, alongside the Figma file, and if so, records them in the project
map for a human/visual check even though they're out of the skill's core Figma-diff model.
Don't silently drop them for being off-model.

## Gap 5 — granularity: the skill checks classes and sections, not every inline span, and doesn't flag a page that's flagged for deletion but is still being actively reviewed.

Evidence:
- *"'Get in touch' to be italics and coral"* (`/contact`) — one italicized/coloured word
  inside a sentence, below the class-level granularity this skill checks.
- 8 separate tickets (EXE-60 through EXE-67) filed against `/team-members/qa-placeholder` —
  a page this same audit corpus had already flagged for deletion (a placeholder person
  showing beside real team members). Nobody told Helena it was scheduled for deletion, so
  she spent real review time finding layout bugs inside a page that's going away. This
  skill has no mechanism to say "this page is marked for deletion, don't spend more find
  time on it" back to whoever's coordinating the review.

**Proposed fix:** for gap 5a (inline spans), out of scope for a general fix — flag as a
known limitation in the report template rather than a silent gap. For gap 5b: when the
skill's own findings (or the project map's `knownAccepted`/defect list) mark a page or route
for deletion, the report should say so loudly in a way that's meant to reach a
non-technical reviewer, not just bury it in a "Not checked" line in a technical audit file.

## What matched cleanly (for calibration — this isn't all bad news)

- *"Populate with placeholder items"* / *"Let's populate with what we have in Figma please"*
  (`/single-director`, EXE-58/59) — this is exactly the already-known finding that the
  audience "who we help protect" benefits band renders 0 cards against a 5-card design. The
  skill found this correctly and specifically; an independent human reviewer found the same
  thing by eye. When the skill's target is a hard, specific node-vs-DOM mismatch, it works.

## Summary for whoever picks this up

Of 30 open tickets: 1 matched cleanly, 2 were found but lost/undersold in consolidation, and
~27 were never in the skill's model at all — not because the skill executed its existing
steps badly, but because five categories of question (adjacency, interaction, soft
findings, external references, sub-class granularity) sit outside what "compare this DOM
node against that Figma node" can ever catch by construction. Closing gaps 1–3 is tractable
inside the existing workflow. Gaps 4–5 need a scope decision from whoever owns this skill
about whether they're in scope at all, or whether they're explicitly handed off to a human
reviewer with a clear "we didn't check this" flag instead of a silent absence.
