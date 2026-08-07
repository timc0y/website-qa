# The project Figma map

A repository built from Figma usually already knows the answers this skill spends
its first phase rediscovering. It knows which Figma node became which live
section. It knows the breakpoint mapping. It knows which mismatches are
already-known decisions, not new defects.

**Look for that map before you scope the matrix.** Check typical locations:
`FIGMA.md`, `docs/figma.md`, `design/README.md`, or a `figma-map.json` beside
them. If one exists, seed the comparison matrix from it. If none exists, write
one as a by-product of the run. The next review then starts where this one
finished.

## Why it matters

In a real run, this file is worth more than any single reference here. It
supplies:

- **Node-to-selector pairing**, so `compose_review.py --map` can pair explicitly
  instead of guessing from filename order.
- **The breakpoint mapping**: which Figma frame width owns which CSS breakpoint.
  This stops you from inventing intent for a width the design never covered.
- **Known-and-accepted mismatches**, so a deliberate decision is not reported as
  a regression.
- **Absences stated as facts.** "No mobile frame exists for this template" is
  exactly the sentence that keeps a run honest at 393px.
- **External references outside Figma.** A client sometimes points at a live
  reference site in correspondence or in a comment, not in Figma. Record the URL
  here so the next run does not lose it.
- **Pages scheduled for deletion.** State this fact here, so a review does not
  spend time on a page nobody intends to fix.
- **A component registry across every route.** The same component often appears
  on several routes, and each route can carry a different subset of
  breakpoints. Build this registry once per project, and use it to answer "does
  a mobile design exist for this component anywhere," not only "does a mobile
  design exist for this route."

## Build the component registry once per project

Scan every Figma page in the file, not only the frame for the route in front of
you. List every named component and every component instance on each page. For
each instance, record its route, its section name, its breakpoint, and its
node ID. Store the result in the map's `components` field. Do this scan once
per project, before you scope any single route. A component crawl repeated per
route wastes work and drifts as the file changes.

The registry pays for itself at the exact moment a route is missing a
breakpoint. If `/single-director` has a mobile frame for `Hero/Audience` and
`/multiple-directors` does not, the registry lets you report
"`Hero/Audience` has a verified mobile design, carried on `/single-director`,"
instead of a flat "no mobile frame for this route." Only report a real gap when
no route anywhere carries the component at the breakpoint you need.

## `figma-map.json`

Make the map machine-readable, so both the human reader and the run consume one
source of truth. Section order follows document order, top to bottom.

```json
{
  "fileKey": "riWVTJAjQaNE5rO8Bow5xd",
  "fileUrl": "https://www.figma.com/design/<key>/<name>",

  "components": {
    "$comment": "built once per project by a full page scan, not once per route. breakpoint is the same numeric CSS/frame width used everywhere else in this map (see routes[].breakpoints), never a label like 'desktop' or 'mobile' — the manifest's coverage cells key on that number.",
    "verified": "2026-08-07",
    "registry": {
      "Hero/Audience": [
        { "route": "/single-director", "section": "01-hero", "breakpoint": 1512,
          "figmaNodeId": "550:6340", "verified": "2026-08-03" },
        { "route": "/single-director", "section": "01-hero", "breakpoint": 393,
          "figmaNodeId": "550:10472", "verified": "2026-08-04" },
        { "route": "/multiple-directors", "section": "01-hero", "breakpoint": 1512,
          "figmaNodeId": "550:6890", "verified": "2026-08-04" }
      ]
    }
  },

  "routes": [
    {
      "route": "/multiple-directors",
      "frame": { "nodeId": "550:6339", "name": "Audience Template", "width": 1512, "height": 8122 },
      "breakpoints": [
        { "css": 1512, "figmaFrameWidth": 1512, "webflow": "main", "note": "authored" },
        { "css": 991,  "figmaFrameWidth": null, "webflow": "medium", "note": "no frame, hand-authored" }
      ],
      "sections": [
        {
          "name": "01-hero",
          "figmaNodeId": "550:6340",
          "selector": "section.hero-about",
          "componentId": "Hero/Audience",
          "verified": "2026-08-03",
          "notes": "component variant=audience"
        }
      ]
    }
  ],

  "coverage": {
    "missing": [
      { "figmaNodeId": "550:6423", "state": "nav dropdown open", "reason": "no Figma frame for the open state" }
    ],
    "coveredViaComponent": [
      { "route": "/multiple-directors", "state": "default", "breakpoint": 393,
        "coveredVia": "/single-director", "componentId": "Hero/Audience" }
    ]
  },
  "knownAccepted": [
    { "what": "hero copy/imagery is single-director on every audience route",
      "why": "no CMS binding yet; owner decision 2026-08-03", "reviewBy": "2026-09-01" }
  ],
  "externalReferences": [
    { "url": "https://www.sparkadvisors.com/services",
      "route": "/single-director",
      "note": "client-cited animation reference, not in Figma",
      "source": "client correspondence, 2026-08-06",
      "checked": "human/visual only, outside this skill's Figma-diff model" }
  ],
  "scheduledForDeletion": [
    { "route": "/team-members/qa-placeholder",
      "why": "placeholder person shown beside real team members",
      "decidedBy": "owner", "decidedOn": "2026-08-05" }
  ]
}
```

Only `routes[].sections[].name` and `routes[].sections[].selector` are needed to
drive a capture. Every other field raises the quality of the report. A small
project with one route and no shared components can skip `components` and
`coverage.coveredViaComponent` entirely and keep the flatter single-route shape
this map used before; add the registry once a second route shares a component.

## Every claim carries a date

The most expensive line in a project map is a fact that was once true. Give each
claim a `verified` date. Treat anything older than the last deploy as a
hypothesis, not a fact. This matters most for an open-item list, because that
list decays fastest. A fixed bug that still reads as open costs a reviewer real
time, and the team may "re-fix" it.

## A page scheduled for deletion is a fact for this map, not only for the report

When this run, or an earlier one, marks a page or a route for deletion, record it
in `scheduledForDeletion` here. Do this even when the map already has a
`knownAccepted` entry for the same page. The report template pulls this fact
forward and states it loudly, so a non-technical reviewer sees it before they
file a new bug against a page nobody intends to fix. See
`references/report-template.md`.

## Report doc drift

When the map contradicts what you measured, that contradiction is a finding about
the documentation. It belongs in the report and in `docDrift` in the manifest:

```json
{ "source": "FIGMA.md",
  "claim": "CTA button Link prop still resolves to '#'",
  "measured": "every button resolves to a real path (CTA -> /contact)",
  "action": "delete the open item; it was fixed before this run" }
```

Keep this separate from the parity findings. A stale document is not a website
defect. Correcting it is usually a one-line edit that saves the next reviewer an
hour.

## What does not belong in the map

Keep the map durable. Move these items elsewhere:

- **Session narrative**, such as "build progress, 2026-07-23." Use `git log` for
  this.
- **Tool gotchas.** These form cross-project knowledge. Put them in the relevant
  skill or in memory, not in one site's design map.
- **Anything derivable from the code.** A selector that any grep would find does
  not need restating. The *Figma node it corresponds to* does need restating,
  because nothing else records it.

A map that mixes durable structure with transient narrative gets skimmed, not
trusted. Stale lines then survive, because nobody reads the map closely.
