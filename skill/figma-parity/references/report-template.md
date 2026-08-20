# Figma parity report template

Rank by severity. For every finding give **Figma vs Live** concrete values — a dev
should be able to act without re-measuring. Mark confidence when relevant.

```markdown
# <Site> — Figma parity review (<live-url>)

Compared live against Figma at <breakpoints>. Method: rendered each Figma frame,
captured the live equivalent, measured live computed styles against the specific
Figma node (not a guessed token). Side-by-side images: <review folder path>.

## Coverage
| Route/component | Breakpoint | State | Result | Evidence |
|---|---:|---|---|---|
| / | 390 | mobile menu open | compared | 390/menu-open/01-nav.png |

Missing cells are listed explicitly; they are not silently omitted.

State up front anything that makes the whole packet conditional — the target republished
mid-run, a content width that never matched the frame, a primary bundle that did not
execute. A reader who discovers that down in the limitations section has already trusted
the tables.

## Defects in the Figma source
| Where | Contradiction | Evidence | Owner |
|---|---|---|---|

Owner may be **both**. When the source is internally inconsistent — one frame using four
different content insets because its sections are absolutely positioned, say — a finding
needs a design decision *and* a build change, and forcing it into one bucket
misrepresents it. Name the decision that is missing, and state what the build does today.

## Documentation drift
| Source | Claim | Measured | Action |
|---|---|---|---|
| FIGMA.md | "CTA link still resolves to `#`" | every button resolves to a real path | delete the open item |

Include only when a project Figma map or build doc exists. A stale doc is not a website
defect, so keep it out of the severity tables — but do report it, because it is usually a
one-line fix that saves the next reviewer an hour. See `references/project-map.md`.

## 🔴 High — clearly wrong / broken
| # | Component | Issue | Figma | Live |
|---|-----------|-------|-------|------|
| 1 | Trust bar | icons 3 & 4 duplicate the shield path | shield·people·star·handshake | shield·people·shield·shield |

## 🟡 Medium — noticeable, not breaking
| # | Component | Issue | Figma | Live |
|---|-----------|-------|-------|------|
| 8 | FAQ | section top/bottom padding | 92px (5.75rem) | 70px (4.375rem) |

## 🟢 Low — polish
| # | Component | Issue | Figma | Live |

## 🎞️ Motion — state changes with no / broken transition
| # | Element | Property that snaps | Note |
|---|---------|---------------------|------|
| n | .card:hover | transform, box-shadow | changes on hover but not in `transition-property`; snaps |

## ⚠️ Needs manual check (automation couldn't trigger)
- e.g. nav theme swap on dropdown open (IX2 didn't fire on synthetic hover).

## ✅ Verified matching (checked, no action)
- H1 72px ✓, accent teal #4A8F96 ✓, body 18px ✓, section X/Y/Z ✓ …

## Root-cause patterns
- Group related findings (e.g. "arrow-circle variants wrong in 3 places",
  "decorative icons dropping out") — one fix clears several rows.

## Content (not design defects — confirm separately)
- real copy vs lorem, CMS wording differences, etc.

## Capture limitations and masks
- Browser/OS/font environment, masked volatile regions, inferred crops and unmatched states.
```

## Severity guide
- **High**: wrong/duplicated/missing element, broken interaction, unreadable
  contrast, layout break, missing nav/slider controls.
- **Medium**: padding/spacing off by a step, wrong default variant, missing
  decorative icon, colour rotation off, a state that snaps where design implies motion.
- **Low**: a few px of type size, minor alignment, sub-pixel gaps.
- **Motion**: put transition/animation issues in their own table — they're easy to
  miss in static screenshots and easy to fix.

## Before you publish a finding

Findings that die under checking are cheap; findings that survive into a dev's sprint and
then die are expensive. Every one of these has produced a false High in practice:

- **A colour, gradient or alignment claim read off a render.** Composited PNGs mislead: a
  gradient sampled 13px lower reads as a different colour, and a node whose group is
  offset inside its own export reads as off-centre. Check the node's `fills` and
  coordinates before writing the row. See `references/visual-diff.md`.
- **A "missing element" from one signal.** Absence needs a clean screenshot *and*
  rendered-structure inspection. A selector miss, an unrevealed scroll animation, or a
  section captured before hydration all look identical to deletion.
- **A "broken control" from a selector you guessed.** A click that times out and a
  transform that never moves are what a wrong selector looks like. Discover the real hooks
  first (`scripts/discover_controls.mjs`); an `<a href>` used as a toggle will *navigate*
  under a synthetic click, which is not a defect.
- **A "missing overlay/scrim" when the element exists but is weak.** Check the computed
  style. "The gradient starts at 30% and this image is too light" is a different, smaller
  finding than "the gradient is missing" — and it is `visual-only`.
- **Anything horizontal, when the observed content width never matched the frame.** Fix
  the capture first; otherwise every inset in the report is wrong by the gutter.
