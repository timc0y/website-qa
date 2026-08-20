# Figma parity report template

## In this file

- Keep comments and soft concerns
- Handle pages marked for deletion
- Report structure and severity
- Checks before publishing a finding

Rank findings by severity. Give concrete **Figma** and **Live** values so no
remeasurement is needed; state confidence where relevant.

Generated manifests prove neither inspection nor verdict. Every match/mismatch
cites attestation actor, criterion, and evidence IDs. Without valid attestation,
report only observation. `human-unverified` records a claim but never gates
delivery; never rename it “human verified.”

## Soft findings survive consolidation

Keep every Figma-comment/client-correspondence concern (including
`clientSpecFromComments`) in open items with confidence, even without a hard
node/DOM mismatch. Consolidation must not erase client-raised concerns.

Instrumentation proves only instrumentation. “`data-anim` exists” does not prove
the requested count-up rather than fade-in. A `likely met` verdict names both
confirmed and unconfirmed behaviour.

## A page marked for deletion is not silently out of scope

Check current findings plus map `scheduledForDeletion` and `knownAccepted`.
Surface deletion decisions at report top in plain language, never inside a
technical “Not checked” row.

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

List every missing cell.

Use `covered via <route>` only when the map names the same component at that
breakpoint; include its component ID. If no route carries that breakpoint, mark
`missing`.

Put packet-wide conditions first: mid-run publish, width mismatch, or unexecuted
primary bundle. Do not bury trust constraints in limitations.

## Defects in the Figma source
| Where | Contradiction | Evidence | Owner |
|---|---|---|---|

Owner may be **both** when inconsistent design requires a decision and build
change. Name the missing decision and current build behaviour.

## Documentation drift
| Source | Claim | Measured | Action |
|---|---|---|---|
| FIGMA.md | "CTA link still resolves to `#`" | every button resolves to a real path | delete the open item |

Include only when map/build docs exist. Keep drift outside website severity but
report it. See `references/project-map.md`.

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

Single-route reports may be severity-first. For two or more routes, organize by
page then severity. Each heading links the exact live URL, including required
query parameters. Link every node directly as
`https://www.figma.com/design/<fileKey>/?node-id=<id-with-colon-replaced-by-hyphen>`.

Shared issues use a `Sitewide` heading with one representative link—never
duplicate per page or remove page context.

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

Verify these known false-High patterns before publishing:

- **Render-derived colour/gradient/alignment:** compositing and crop offsets
  mislead. Check node `fills` and coordinates; see `references/visual-diff.md`.
- **Single-signal absence:** require clean screenshot plus rendered structure;
  selector miss, unrevealed animation, and pre-hydration capture mimic deletion.
- **Guessed control selector:** discover hooks with
  `scripts/discover_controls.mjs`; synthetic clicks on `<a href>` may navigate.
- **Weak versus missing overlay:** inspect computed style; report the smaller
  visual difference as `visual-only`.
- **Wrong content width:** fix capture before horizontal measurements.
