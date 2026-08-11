# Consuming a design spec

## In this file

- Fields read by Website QA
- Matching page elements by text
- Creating a spec when none exists
- Running the check
- Reading results and tolerances

Everything else in this skill asks **"is the page self-consistent?"**. That finds
drift without needing a design file, but it has a hard ceiling: it can never say
which value was *intended*. Shown eleven sections starting at 54px and one at 102px,
self-consistency elects 54 as the intent. If the design says 70, all twelve are
wrong and the sweep confidently reported the opposite.

A spec removes the guess. It's a small JSON file of intended values that
`audit_design_spec.js` diffs the live page against.

> **The format is defined at [`design-spec.md`](design-spec.md),
> not here.** That file is the single normative definition, because the artefact is written
> by whoever builds the page and read by this runner — two different jobs that must agree on
> one format without depending on each other. This document covers only what is specific to
> *consuming* one: how elements are matched, what the tolerances mean, and how to read the
> output.

**Look for an existing spec before writing one.** If the page was built against a spec, that
file already records the intent, including the judgement calls someone made where the design
and the system disagreed. Deriving a second one means this review is re-interpreting the
design rather than checking conformance, and two interpretations can differ — which turns a
verification pass into an argument about what the design meant.

Measured on a real site, the difference a spec makes reads like this:

> **without a spec** — "container gutters at 1512px: dominant 54px, also 47px, 102px, 133px"
> **with a spec** — "every section is 16px too wide — content starts at 54px, design says 70px"

The first is an observation. The second is a ticket.

## The fields this runner reads

The full schema, including the fields written at build time that this runner ignores
(`groups`, `states`, `decisions`, `sourceDefects`, `handoffs`), is in the shared format.
`audit_design_spec.js` reads exactly these:

`name` · `frameWidth` · `tolerance` · `container` · `containerSelector` ·
`sections[].{name, anchorText, contentLeft, height, paddingTop, paddingBottom}` ·
`text[].{text, fontSize, lineHeight, letterSpacing, fontFamily, fontWeight, color, textCase, left, scope}`

Unknown keys are ignored, so a spec carrying build-time fields is safe to pass straight in.

For reference, the shape:

```jsonc
{
  "name": "Example Co — Homepage",
  "figma": { "fileKey": "…", "nodeId": "238:112" },   // where the values came from
  "frameWidth": 1512,                                  // the Figma frame's width
  "tolerance": { "position": 4, "size": 2, "fontSize": 0.6, "lineHeight": 2 },

  // The intended content gutter. This is the highest-value single entry in the file.
  "container": { "left": 70, "note": "how you decided — future you will want this" },
  "containerSelector": "section,[class*=\"section\"]",  // optional override

  "sections": [
    { "name": "Hero",
      "anchorText": "Tax efficient life insurance for business owners", // how it's found
      "contentLeft": 112, "height": 831, "paddingTop": 80, "paddingBottom": 80 }
  ],

  "text": [
    { "text": "Tax efficient life insurance for business owners",
      "fontSize": 72,          // px
      "lineHeight": 0.9,       // ≤4 = multiplier (Figma "0.9em"); >4 = px
      "letterSpacing": -0.01,  // <1 = em (Figma "-0.01em"); ≥1 = px
      "fontFamily": "DM Serif Text", "fontWeight": 400,
      "color": "#F2F5FA", "textCase": "UPPER",
      "left": 112,             // x within the frame
      "scope": "footer"        // optional: "nav" | "header" | "footer"
    }
  ]
}
```

Every field is optional except `text` (or `anchorText`) — only what you supply is
compared, so a spec can start as three lines and grow.

## How elements are matched: by text, never by selector

Class names churn between design and build and mean nothing across the boundary.
The **words on the page** are the one identifier both sides share, so matching is on
normalised rendered text (lowercased, whitespace collapsed, punctuation stripped),
with prefix and substring fallbacks so a heading split across a span with an italic
run still matches.

Two refinements that took a real run to discover, and that you need to know about
when writing a spec:

- **Chrome is excluded by default.** A mega-menu repeats most of the site's copy as
  short link labels, and those labels are *shorter* than the real headings — so
  "smallest match wins" resolved "Relevant Life Insurance" to a 16px nav link and
  then reported the actual 28px section heading as 26px too small. Nav, header,
  footer and dropdowns are skipped unless an entry sets `"scope"`.
- **Leaf elements win.** The element whose *own* text nodes carry the copy is the
  one holding the type styles; a wrapper div reports the inherited body font.

If an entry can't be matched it's reported under `coverage.unmatched` — that means
the copy changed or the section is missing, which is information, not necessarily a
defect.

## Deriving one, if no spec exists yet

**Deriving is the fallback, not the first move** — see the note at the top. When there is
genuinely no spec, the extraction procedure (which values to read, how the modal gutter is
chosen, how design-tool units map onto the fields, and what scaffolding to keep out) lives
in the shared design-spec file's *Deriving the values* section. Follow it there rather than a
second copy here, so the two sides cannot drift.

One practical note for reading a Figma file specifically: pull the frame at `depth: 2`,
which lands on the section-frame level where the useful geometry is, and resolve style
references before writing values down — Figma deduplicates type styles into shared
variables (`style_a5b7966b`), so the node itself often carries only a pointer.

## Running it

```bash
node runner/qa_runner.mjs --url=https://site.com --spec=./site.spec.json
```

The design pass runs at the spec's own `frameWidth`, so the comparison is
like-for-like. At any other viewport, positions are scaled and the report says so
explicitly — a scaled comparison is weaker evidence and the reader should know which
one they're looking at.

## Reading the output

- **`container.verdict`** — the headline. A single sentence naming the intended
  value, the live value, and the delta.
- **`sectionFindings`** — height and padding deltas per named section.
- **`typeFindings`** — per text node, only the properties that differ, each with
  both values side by side.
- **`coverage`** — how many spec entries were found. Low coverage means the spec has
  drifted from the copy, not that the page is broken; fix the spec.

## Tolerances, and resisting the urge to tighten them

Defaults are 4px position, 2px size, 0.6px font-size, 1.5px line-height (the values in
`audit_design_spec.js`). They exist
because browsers round sub-pixels, fonts differ in metrics from Figma's renderer,
and a 1px delta is not a defect anyone will ever fix. Tightening them produces a
report nobody reads — which costs more than the findings are worth. If a category is
noisy, raise its tolerance rather than deleting the check.
