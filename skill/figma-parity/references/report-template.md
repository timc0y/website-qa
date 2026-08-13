# Figma parity report template

## In this file

- Keep comments and soft concerns
- Handle pages marked for deletion
- Report structure and severity
- Checks before publishing a finding

Rank the findings by severity. For each finding, give the **Figma value and the
Live value** as concrete numbers. A developer must be able to act on the finding
without a re-measurement. Mark the confidence level when it is relevant.

Do not infer inspection or a verdict from the generated manifest. Cite the
attestation actor, criterion and evidence IDs for every claimed match or
mismatch. If no valid attestation exists, describe only the captured observation
and leave the conclusion unreviewed.

An unsigned `human-unverified` record documents a person's stated review but
does not satisfy a delivery gate. Do not shorten that label to “human verified.”

## Soft findings survive consolidation

Put every finding sourced from a Figma comment or from client correspondence in
the open-items list. This includes a `clientSpecFromComments` entry or an
equivalent. Do this every time. Tag the finding with its own confidence level. Do
this even when the finding never firms up into a hard node-vs-DOM mismatch. Do not
drop the finding during consolidation because it is "soft." The client raised the
finding. A report that quietly loses it costs the client a repeated ticket. It
also costs the team the appearance of having read its own notes.

A check can confirm only that instrumentation exists: an attribute is present, or
markup is wired. State exactly that. Do not state that the request was met. "The
`data-anim` attribute exists" and "the animation matches the client's request, a
count-up, not a fade-in" are different claims. A "likely met" verdict must name
the specific behavior it confirmed. It must also name the specific behavior it did
not confirm. A bare "likely met" verdict tends to bury the gap it should show.

## A page marked for deletion is not silently out of scope

Check this run's own findings, and check the project map's `scheduledForDeletion`
list and `knownAccepted` list. If either marks a page or a route for deletion,
state this fact at the top of the report. Write it in language a non-technical
reviewer will actually read. Do not bury the fact in a "Not checked" line inside
a technical coverage table. A reviewer of the live site has no way to know a page
is scheduled to disappear, unless the report states this plainly. Without that
statement, the reviewer will spend real time filing a bug against a page nobody
intends to fix.

```markdown
# <Site>: Figma parity review (<live-url>)

Compared live against Figma at <breakpoints>. Method: rendered each Figma frame,
captured the live equivalent, measured live computed styles against the specific
Figma node. Did not use a guessed token. Side-by-side images: <review folder path>.

## Coverage
| Route/component | Breakpoint | State | Result | Evidence |
|---|---:|---|---|---|
| / | 390 | mobile menu open | compared | 390/menu-open/01-nav.png |
| /service-b | 390 | default | covered via /service-a (Hero/Service) | figma-map.json#components |

List a missing cell explicitly. Do not omit it silently.

Use "covered via `<route>`" only when the project map's component registry
names another route that carries the same component at that breakpoint. Name
the component ID in the Result column, so a reader can check the claim against
`figma-map.json` directly. Do not use this result for a breakpoint no route
anywhere carries. That case is a real gap, so mark it "missing," not "covered."

State up front anything that makes the whole packet conditional. Examples: a
target that was republished mid-run, a content width that never matched the
frame, a primary bundle that did not execute. A reader who finds this fact down
in the limitations section has already trusted the tables above it.

## Defects in the Figma source
| Where | Contradiction | Evidence | Owner |
|---|---|---|---|

The owner may be **both**. The source can be internally inconsistent. One real
example: a frame uses four different content insets because its sections are
absolutely positioned. In that case, the finding needs a design decision *and* a
build change. Forcing it into one bucket misrepresents it. Name the decision that
is missing, and state what the build does today.

## Documentation drift
| Source | Claim | Measured | Action |
|---|---|---|---|
| FIGMA.md | "CTA link still resolves to `#`" | every button resolves to a real path | delete the open item |

Include this section only when a project Figma map or a build doc exists. A stale
doc is not a website defect, so keep it out of the severity tables. Report it
anyway. It is usually a one-line fix that saves the next reviewer an hour. See
`references/project-map.md`.

## 🔴 High: clearly wrong or broken
| # | Component | Issue | Figma | Live |
|---|-----------|-------|-------|------|
| 1 | Trust bar | icons 3 & 4 duplicate the shield path | shield·people·star·handshake | shield·people·shield·shield |

## 🟡 Medium: noticeable, not breaking
| # | Component | Issue | Figma | Live |
|---|-----------|-------|-------|------|
| 8 | FAQ | section top/bottom padding | 92px (5.75rem) | 70px (4.375rem) |

## 🟢 Low: polish
| # | Component | Issue | Figma | Live |

## 🎞️ Motion: a state change with no transition, or a broken one
| # | Element | Property that snaps | Note |
|---|---------|---------------------|------|
| n | .card:hover | transform, box-shadow | changes on hover but not in `transition-property`; snaps |

## ⚠️ Needs a manual check
Automation could not trigger the state. One real example: a nav theme swap on
dropdown open. IX2 did not fire on a synthetic hover.

## ✅ Verified matching
Checked, no action needed. Examples: H1 72px, accent teal #4A8F96, body 18px,
section X/Y/Z.

## Root-cause patterns
- Group the related findings. Real examples: "arrow-circle variants wrong in 3
  places," and "decorative icons dropping out." One fix clears several rows.

## Content
Not a design defect. Confirm separately. Examples: real copy vs. lorem, and a CMS
wording difference.

## Capture limitations and masks
- the browser, OS, and font environment; a masked volatile region; an inferred
  crop; an unmatched state.
```

## Consolidating many pages into one status file

A single-page report can organize by severity; a reader already knows what page
they are looking at. A status file that consolidates findings across two or more
routes cannot. Organize its
main body **by page**, then severity within the page, and give every page its
own heading with the live URL as a clickable link (include the query param a
reader needs to see the real build, e.g. `?dev=0` if the project uses a
dev/live JS toggle). Do the same for every Figma node cited: link straight to
`https://www.figma.com/design/<fileKey>/?node-id=<id-with-colon-replaced-by-hyphen>`,
not just the bare node ID in backticks. A reader who has to reconstruct a URL
by hand to see the page or the node a finding describes will not do it, and a
finding nobody looks at is a finding nobody fixes.

This applies even when a topic (nav, footer, a shared component) touches many
pages at once — give it a "Sitewide" heading with one representative link,
rather than repeating the same finding under every page it happens to reach,
or dropping it into a severity table with no page context at all.

## Severity guide
- **High:** a wrong, duplicated, or missing element; a broken interaction;
  unreadable contrast; a layout break; a missing nav or slider control.
- **Medium:** padding or spacing off by one step; a wrong default variant; a
  missing decorative icon; a color rotation off; a state that snaps where the
  design implies motion.
- **Low:** a few pixels of type size; a minor alignment issue; a sub-pixel gap.
- **Motion:** put a transition or animation issue in its own table. This issue is
  easy to miss in a static screenshot, and it is easy to fix.

## Before you publish a finding

A finding that dies under a check is cheap. A finding that survives into a
developer's sprint and dies there is expensive. Each item below has produced a
false High in practice:

- **A color, gradient, or alignment claim read off a render.** A composited PNG
  can mislead you: a gradient sampled 13px lower reads as a different color, and
  a node whose group is offset inside its own export reads as off-center. Check
  the node's `fills` and coordinates before you write the row. See
  `references/visual-diff.md`.
- **A "missing element" finding built on one signal.** An absence needs a clean
  screenshot *and* a rendered-structure inspection. A selector miss, an
  unrevealed scroll animation, and a section captured before hydration all look
  identical to a real deletion.
- **A "broken control" finding built on a guessed selector.** A click that times
  out and a transform that never moves are what a wrong selector looks like.
  Discover the real hooks first, with `scripts/discover_controls.mjs`. An
  `<a href>` used as a toggle will *navigate* under a synthetic click. This
  behavior is not a defect.
- **A "missing overlay or scrim" finding, when the element exists but reads as
  weak.** Check the computed style. "The gradient starts at 30% and this image
  is too light" is a different, smaller finding than "the gradient is missing."
  Tag it `visual-only`.
- **A horizontal finding, when the observed content width never matched the
  frame.** Fix the capture first. Otherwise every inset in the report is wrong
  by the gutter width.
