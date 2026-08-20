# The project Figma map

A repository that has been built from Figma usually already knows the answers this skill
spends its first phase rediscovering: which Figma node became which live section, what
the breakpoint mapping is, and which mismatches are already-known decisions rather than
new defects.

**Look for that map before scoping the matrix.** Typical locations: `FIGMA.md`,
`docs/figma.md`, `design/README.md`, or a `figma-map.json` beside them. If one exists,
seed the comparison matrix from it. If none exists, write one as a by-product of the run —
the next review then starts where this one finished.

## Why it matters

In a real run this file is worth more than any single reference here. It supplies:

- **Node ↔ selector pairing**, so `compose_review.py --map` can pair explicitly instead
  of guessing from filename order.
- **The breakpoint mapping** (which Figma frame width owns which CSS breakpoint), so you
  do not invent intent for a width the design never covered.
- **Known-and-accepted mismatches**, so a deliberate decision is not reported as a
  regression.
- **Absences stated as facts** — "no mobile frame exists for this template" is exactly
  the sentence that keeps a run honest at 393px.

## `figma-map.json`

Machine-readable, so both the human reader and the run consume one source of truth.
Section order is document order, top to bottom.

```json
{
  "fileKey": "riWVTJAjQaNE5rO8Bow5xd",
  "fileUrl": "https://www.figma.com/design/<key>/<name>?node-id=550-6339",
  "route": "/client-types/multiple-directors",
  "frame": { "nodeId": "550:6339", "name": "Audience Template", "width": 1512, "height": 8122 },
  "breakpoints": [
    { "css": 1512, "figmaFrameWidth": 1512, "webflow": "main", "note": "authored" },
    { "css": 991,  "figmaFrameWidth": null, "webflow": "medium", "note": "no frame — hand-authored" }
  ],
  "sections": [
    {
      "name": "01-hero",
      "figmaNodeId": "550:6340",
      "selector": "section.hero-about",
      "component": "Audience Hero",
      "verified": "2026-08-03",
      "notes": "component variant=audience"
    }
  ],
  "coverage": {
    "missing": [
      { "figmaNodeId": "550:6423", "state": "nav dropdown open", "reason": "no Figma frame for the open state" }
    ]
  },
  "knownAccepted": [
    { "what": "hero copy/imagery is single-director on every audience route",
      "why": "no CMS binding yet; owner decision 2026-08-03", "reviewBy": "2026-09-01" }
  ]
}
```

Only `sections[].name` and `sections[].selector` are needed to drive a capture;
everything else raises the quality of the report.

## Every claim carries a date

The most expensive line in a project map is a fact that was true once. Give each claim a
`verified` date, and treat anything older than the last deploy as a hypothesis. This
matters most for open-item lists, which decay fastest: a fixed bug that still reads as
open costs a reviewer real time, and may get "re-fixed".

## Report doc drift

When the map contradicts what you measured, that contradiction is a finding about the
documentation, and it belongs in the report and in `docDrift` in the manifest:

```json
{ "source": "FIGMA.md",
  "claim": "CTA button Link prop still resolves to '#'",
  "measured": "every button resolves to a real path (CTA -> /contact)",
  "action": "delete the open item; it was fixed before this run" }
```

Keep it separate from parity findings. A stale document is not a website defect, and
correcting it is usually a one-line edit that saves the next reviewer an hour.

## What does not belong in the map

Keep the map durable. Move these elsewhere:

- **Session narrative** ("build progress, 2026-07-23") — that is what git log is for.
- **Tool gotchas** — those are cross-project knowledge; put them in the relevant skill or
  memory, not in one site's design map.
- **Anything derivable from the code** — a selector that any grep would find does not need
  restating, but the *Figma node it corresponds to* does, because nothing else records it.

A map that mixes durable structure with transient narrative gets skimmed rather than
trusted, and then the stale lines survive because nobody is reading closely.
