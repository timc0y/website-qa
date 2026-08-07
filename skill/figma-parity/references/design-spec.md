# The design spec: one artifact, written once, used twice

A **design spec** is a small JSON file. It records what a page's sections were
*supposed* to be, in numbers, extracted from the design source before anything
is built.

It has exactly two jobs:

1. **Producer side**: force a person to read the intent off the design source
   as values, not to absorb it from a picture of the source. Extracting `32px`
   is a different act from looking at a heading and reaching for the nearest
   existing scale step.
2. **Consumer side**: turn verification from a fresh interpretation of the
   design into a **diff against the thing the team built to**. Without a spec,
   an audit can only ask "is this page self-consistent?" With a spec, it can
   say which value the team intended.

The measured difference reads like this:

> **Without a spec:** "container gutters at 1512px: dominant 54px, also 47px,
> 102px, 133px"
> **With a spec:** "every section is 16px too wide; content starts at 54px, and
> the design says 70px"

The first line is an observation. The second line is a ticket.

## Why use the file, and not a direct reference

Both sides can read the design source independently, and then disagree. A file
that crosses between them fixes this problem:

- neither side imports, invokes, or names the other;
- the numbers are reviewable in a diff, and a designer can correct them;
- the file is a durable artifact. Commit it next to the site, and every later
  run compares against the same baseline;
- a team with no design file at all can still write one by hand, from a
  written standard such as "all sections use a 70px gutter; headings use DM
  Serif Text."

Nothing here is coupled to a particular design tool. The `source` field is
provenance only.

## The one rule that makes this file worth writing

**Take every value from a specific node in the design source. Never take a
value from a global token, and never take one from memory.** A design file
reuses many near-identical type and color tokens: a 62px *and* a 72px display
serif; a 12px *and* a 14px uppercase eyebrow. A value copied from the wrong
token produces a spec that is confidently wrong. This is worse than no spec,
because the consumer will then report a correct build as broken.

Recalling that "the medium title is 54px" is a guess. A wrong guess silently
forks the design system.

## Schema

Only `text`, or a section's `anchorText`, is required. Every other field is
optional, so a spec can start as three lines and grow. A consumer ignores a key
it does not understand.

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

Use `new`, `reused`, or `adapted`. This field exists because reuse fails
differently from a fresh build. Dropping an existing component into a new
context inherits the geometry correctly, and still breaks, because the context
differs: the copy is longer, the background is different, or the container is
narrower. A section marked `reused` is a prompt to record **what is different
here**. It is not a promise that nothing needs a check.

### Matching: by text, never by selector

A class name churns between the design and the build, and it means nothing
across that boundary. The **words on the page** are the one identifier both
sides share, so a consumer matches on the normalized rendered text: lowercased,
with the whitespace collapsed and the punctuation stripped.

Two refinements, and each one cost a real run to discover:

- **Page chrome is excluded by default.** A mega-menu repeats most of a site's
  copy as short link labels, and those labels are *shorter* than the real
  headings. So a "smallest match wins" rule resolves a section heading to a
  16px nav link, and then reports the real heading as far too small. The
  matcher skips the nav, the header, the footer, and a dropdown, unless an
  entry sets `scope`.
- **A leaf element wins.** The element whose *own* text nodes carry the copy
  holds the type styles. A wrapper element reports the inherited body font
  instead.

The matcher reports an entry it cannot match as unmatched. This means the copy
changed, or the section is missing. This report is information. It is not
automatically a defect.

## Deriving the values

Whatever the design tool, pull the frame at the **section-frame level**: deep
enough to capture each section's position, size, and internal padding, and
shallow enough to stay readable.

- **`container.left`**: the modal x-position of the text content across the
  section frames. Take the majority value, and record a deliberate exception
  as that section's `contentLeft`. Do not let one deliberately-inset hero skew
  the container value.
- **`sections[]`**: each section's height, plus a distinctive line of copy
  from inside it, as `anchorText`. Anchor on the text, not on the order, so
  adding a section does not shift every later comparison.
- **`text[]`**: each text node's string, plus its *resolved* type style. A
  tool commonly deduplicates styles into shared references. Resolve the
  reference before you write down the value.

Units map directly: a line height of `"1.2em"` becomes `1.2`. A size of
`"16px"` becomes `16`. A letter spacing of `"-0.02em"` becomes `-0.02`.

**Keep the scaffolding out.** A real file contains a cursor mockup, a redline
annotation, an SEO note, and a browser-chrome frame. Each of these has a
position and a text style, and each will happily become a spec entry that can
never match anything.

## Tolerances, and why not to tighten them

The defaults are 4px for position, 2px for size, 0.6px for font size, and
1.5px for line height. These defaults exist because a browser rounds
sub-pixels, a font differs in its metrics from a design tool's renderer, and a
1px delta is not a defect anyone will ever fix. Tightening these values
produces a report nobody reads, which costs more than the findings are worth.
If one category is noisy, raise its tolerance. Do not delete the check.

## What a spec is not

A spec is not a substitute for looking at the page. It holds numbers, and the
defects that hurt the most are not numeric: an image cropped through someone's
chin, a heading colliding with the face behind it, one card in a row that
visibly outweighs the others, a section that simply reads as unfinished. A
spec makes the measurable part cheap, so you can spend your attention on the
rest.
