# Known blind spots from a large multi-agent sweep

## In this file

- Dispatched checks skipped the real tooling
- Concurrent browser sessions interfered
- Frame-name assumptions hid real references
- Stale node IDs pointed at deprecated canvases
- Layout sampling hid content errors
- Topic-first consolidation hid page context

These rules come from ~20 concurrent checks on one project. Identifiers are
removed; failure shapes and corrections remain.

## 1. Ad-hoc checks replaced the review machinery

Agents ignored available `capture.mjs`, `compose_review.py`,
`compare_images.py`, and `vision-qa.md`, substituting interactive
`getBoundingClientRect`/`getComputedStyle` reads. Geometry was strong; visual
judgement of outlines, gradients, shadows, and unfinished content was weak.

**Rule:** dispatch the exact script/protocol, not only “compare with Figma.” Use
`capture.mjs` + `compose_review.py`, then `vision-qa.md`'s five-pass image review.
Under time pressure, agents choose the nearest tool unless instructed otherwise.

## 2. Concurrent checks hijacked a shared browser

Interactive agents shared a tab pool; another navigation silently changed the
page mid-check, so later measurements targeted the wrong URL.

**Rule:** concurrent checks use isolated local-parity via `capture.mjs`. If a
signed-in state requires interaction, each check owns a tab and verifies
`location.href` before every trusted measurement.

## 3. Expected frame names hid real specifications

Checks declared “no spec” after searching one expected frame name, although
matching 393px frames existed elsewhere under unrelated names.

**Rule:** search the canonical canvas by plausible size and matching component
content before declaring absence. Only then use a no-reference fresh-eyes review
from `vision-qa.md`.

## 4. Documented node IDs pointed to a non-canonical canvas

Near-identical canvas copies made stale IDs look valid until the canonical canvas
was read directly.

**Rule:** project-map IDs are hypotheses until fetched and confirmed under
`project-map.md#authority.canonicalCanvas` (or its pinned version). Missing
authority is ambiguity, not permission to choose by matching frame name.

## 5. Layout sampling concealed instance-specific data faults

One representative shared component correctly covers CSS/layout defects but
cannot prove every CMS item's content. A rating contradiction on one item was
invisible from another representative route.

**Rule:** instance sampling applies only to shared build behaviour. Check every
real instance for content/data, or state the sample explicitly.

## 6. Topic-first consolidation removed page context

Per-page findings became a 900-line topic-first status with repeated routes,
bare path names, and no live/node links. Readers had to reconstruct every target.

**Rule:** for two or more routes, follow `report-template.md`: page-first,
severity within page, exact live link per page, direct link per Figma node, and a
`Sitewide` section for shared faults. Choose this structure in the first draft.

## Calibration

The sweep was strongest on isolated numeric geometry and weakest where agents
skipped tooling, shared tabs, stopped at one frame name, trusted stale IDs,
applied layout sampling to content, or removed page context. The capability
existed; dispatch and consolidation failed to execute it.
