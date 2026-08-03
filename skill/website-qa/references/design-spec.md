# The design spec — one artefact, written once, used twice

A **design spec** is a small JSON file recording what a page's sections were *supposed*
to be, in numbers, extracted from the design source before anything is built.

It has exactly two jobs:

1. **Producer side** — force the intent to be read off the design source as values rather
   than absorbed from a picture of it. Extracting `32px` is a different act from looking at
   a heading and reaching for the nearest existing scale step.
2. **Consumer side** — turn verification from a fresh interpretation of the design into a
   **diff against the thing that was built to**. Without a spec, an audit can only ask "is
   this page self-consistent?"; with one it can say which value was intended.

The measured difference reads like this:

> **without** — "container gutters at 1512px: dominant 54px, also 47px, 102px, 133px"
> **with** — "every section is 16px too wide — content starts at 54px, the design says 70px"

The first is an observation. The second is a ticket.

## Why the file, and not a direct reference

Because both sides otherwise read the design source independently and disagree, and
because the two sides must remain usable alone. A file crossing between them means:

- neither side imports, invokes, or names the other;
- the numbers are reviewable in a diff, and a designer can correct them;
- it is a durable artefact — commit it next to the site and every later run compares
  against the same baseline;
- a team with no design file at all can still write one by hand from a written standard
  ("all sections use a 70px gutter, headings are DM Serif Text").

Nothing here is coupled to a particular design tool. `source` is provenance only.

## The one rule that makes it worth writing

**Every value comes from a specific node in the design source, never from a global token
and never from memory.** Design files reuse many near-identical type and colour tokens — a
62px *and* a 72px display serif; a 12px *and* a 14px uppercase eyebrow. A value copied
from the wrong token produces a spec that is confidently wrong, which is worse than no
spec, because the consumer will now report the correct build as broken.

Recalling that "the medium title is 54px" is a guess that silently forks the design system
when it is wrong.

## Schema

Only `text` (or a section's `anchorText`) is required. Everything else is optional, so a
spec can start as three lines and grow. Consumers ignore keys they don't understand.

```jsonc
{
  "name": "Marketing site — About",
  "source": {                      // provenance only; no consumer fetches this
    "kind": "figma",
    "fileKey": "…",
    "frames": { "desktop": "550:6890", "mobile": "550:11122" }
  },
  "frameWidth": 1512,              // the design frame's width; comparison runs here
  "tolerance": { "position": 4, "size": 2, "fontSize": 0.6, "lineHeight": 1.5 },

  // The intended content gutter — the highest-value single entry in the file.
  "container": { "left": 70, "note": "how you decided; future you will want this" },
  "containerSelector": "section,[class*=\"section\"]",   // optional override

  "sections": [
    { "name": "Best for",
      "anchorText": "Who this is best for",   // how it is found on the page: by words
      "contentLeft": 112,
      "height": 831, "paddingTop": 80, "paddingBottom": 80,
      "reuse": "new"                          // new | reused | adapted — see below
    }
  ],

  "text": [
    { "text": "Who this is best for",
      "fontSize": 32,          // px
      "lineHeight": 1,         // ≤4 = multiplier ("0.9em"); >4 = px
      "letterSpacing": -0.01,  // <1 = em ("-0.01em"); ≥1 = px
      "fontFamily": "DM Serif Display", "fontWeight": 400,
      "color": "#F2F5FA", "textCase": "UPPER",
      "left": 112,             // x within the frame
      "scope": "footer"        // optional: nav | header | footer — see matching, below
    }
  ],

  // ── the three sections that exist because of specific, expensive mistakes ──

  "groups": [
    // Two sets that LOOK alike and differ in the design. Naming both forces the
    // difference to exist; modelling them as one thing is how a variant gets missed.
    { "name": "pill.include", "fill": "#FFF",    "stroke": "#4A8F96",              "radius": 2 },
    { "name": "pill.exclude", "fill": "#4A8F96", "stroke": "rgba(255,255,255,.4)", "color": "#FFF" }
  ],

  "states": [
    // Every dynamically-bound field, and what the layout does at each extreme.
    { "field": "member.role", "cases": ["empty", "short", "long"],
      "empty": "row collapses — hide the wrapper when the field is empty",
      "long":  "wraps to 2 lines; siblings must top-align, not centre" }
  ],

  "decisions": [
    // Every place the design and the existing system disagree. One line each, resolved
    // by a human at scope time — not silently, mid-build.
    { "issue": "Title is 32px; the scale offers 34 and 24",
      "options": ["snap to 34", "scope a 32px override"],
      "chosen": "scope a 32px override", "by": "owner" }
  ],

  "sourceDefects": [
    // Contradictions in the DESIGN itself. These are not build defects and reporting
    // them as such wastes everyone's time — they belong to whoever owns the file.
    { "where": "mobile About frame", "issue": "carries the Home page's hero copy" },
    { "where": "Best-for title", "issue": "DM Serif Display; every other title in the file is DM Serif Text" }
  ],

  "handoffs": [
    // Steps the producer cannot perform and a human must. Listed ONCE, up front.
    { "what": "rich-text field content on a new component", "why": "not settable through the available API" }
  ]
}
```

### `reuse` on a section

`new` | `reused` | `adapted`. It exists because reuse fails differently from building:
dropping an existing component into a new context inherits geometry correctly and still
breaks, because the context differs — longer copy, a different background, a narrower
container. A section marked `reused` is a prompt to record **what is different here**, not
a promise that nothing needs checking.

### Matching: by text, never by selector

Class names churn between design and build and mean nothing across the boundary. The
**words on the page** are the one identifier both sides share, so a consumer matches on
normalised rendered text (lowercased, whitespace collapsed, punctuation stripped).

Two refinements that each took a real run to discover:

- **Page chrome is excluded by default.** A mega-menu repeats most of a site's copy as
  short link labels, and those labels are *shorter* than the real headings — so
  "smallest match wins" resolves a section heading to a 16px nav link and then reports the
  real heading as far too small. Nav, header, footer and dropdowns are skipped unless an
  entry sets `scope`.
- **Leaf elements win.** The element whose *own* text nodes carry the copy holds the type
  styles; a wrapper reports the inherited body font.

An entry that cannot be matched is reported as unmatched — meaning the copy changed or the
section is missing. That is information, not automatically a defect.

## Deriving the values

Whatever the design tool, pull the frame at the **section-frame level** — deep enough for
each section's position, size and internal padding, shallow enough to stay readable.

- **`container.left`** — the modal x of text content across section frames. Take the
  majority and record deliberate exceptions as that section's `contentLeft` rather than
  letting a deliberately-inset hero skew the container value.
- **`sections[]`** — each section's height, plus a distinctive line of copy from inside it
  as `anchorText`. Anchor on text, not order, so adding a section doesn't shift every
  later comparison.
- **`text[]`** — each text node's string plus its *resolved* type style. Tools commonly
  deduplicate styles into shared references; resolve the reference before writing the
  value down.

Units map directly: a line height of `"1.2em"` → `1.2`, `"16px"` → `16`; letter spacing
`"-0.02em"` → `-0.02`.

**Keep scaffolding out.** Real files contain cursor mockups, redline annotations, SEO
notes and browser-chrome frames. They have positions and text styles and will happily
become spec entries that can never match anything.

## Tolerances, and resisting the urge to tighten them

Defaults are 4px position, 2px size, 0.6px font-size, 1.5px line-height. They exist
because browsers round sub-pixels, fonts differ in metrics from a design tool's renderer,
and a 1px delta is not a defect anyone will ever fix. Tightening them produces a report
nobody reads, which costs more than the findings are worth. If a category is noisy, raise
its tolerance rather than deleting the check.

## What a spec is not

It is not a substitute for looking. It holds numbers, and the defects that hurt most are
not numeric: an image cropped through someone's chin, a heading colliding with the face
behind it, one card in a row visibly heavier than the others, a section that simply reads
as unfinished. A spec makes the measurable part cheap so attention is free for the rest.
