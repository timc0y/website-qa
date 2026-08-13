# The project Figma map

## In this file

- Why a project map matters
- How much of the component list to build
- The `figma-map.json` format
- Dates, pages marked for deletion and stale notes
- What should stay out of the map

A repository built from Figma often already records which Figma node became each
live section, which frame width matches each website width and which differences are
already-known decisions, not new defects.

**Look for that map before listing the comparisons.** Check typical locations:
`FIGMA.md`, `docs/figma.md`, `design/README.md`, or a `figma-map.json` beside
them. If one exists, start the comparison list from it. If none exists, write
one in an approved private project location, or keep it run-local when the
repository is public. Never copy a populated client map into this public skill
repository.

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
- **A component registry matched to review scope.** The same component often
  appears on several routes, and each route can carry a different subset of
  breakpoints. A site-wide review needs the relevant project registry; a
  one-component review begins with that component and expands only to resolve
  reused states or breakpoints.

## List only the components needed for the review

For a site-wide or multi-route review, scan the relevant Figma pages once and
record each named component instance's route, section, breakpoint, and node ID.
For a single route/component review, register the requested component and known
reuses first; expand the scan only when another instance may supply a missing
state or breakpoint. Store the result and its declared scope in `components`.

The registry explains reuse but does not prove contextual equivalence. If
`/service-a` has a mobile frame for `Hero/Service` and `/service-b` does not,
record that relationship as an annotation. Keep `/service-b` missing until its
exact route, content, container, theme and state have evidence. Shared component
identity must never remove a cell from the denominator.

## `figma-map.json`

Use JSON so both a person and the scripts read the same file. Section order
follows the page from top to bottom.

```json
{
  "fileKey": "example-file-key",
  "fileUrl": "https://www.figma.com/design/<key>/<name>",
  "authority": {
    "canonicalCanvas": {
      "nodeId": "0:1",
      "name": "Approved website",
      "versionId": "optional pinned Figma version id"
    },
    "verified": "YYYY-MM-DD",
    "alternates": [
      { "nodeId": "0:2", "name": "Exploration", "status": "non-authoritative" }
    ]
  },

  "components": {
    "$comment": "covers the declared review scope. breakpoint is the same numeric CSS/frame width used everywhere else in this map (see routes[].breakpoints), never a label like 'desktop' or 'mobile' — the manifest coverage cells key on that number.",
    "verified": "YYYY-MM-DD",
    "registry": {
      "Hero/Service": [
        { "route": "/service-a", "section": "01-hero", "breakpoint": 1512,
          "figmaNodeId": "100:200", "verified": "YYYY-MM-DD" },
        { "route": "/service-a", "section": "01-hero", "breakpoint": 393,
          "figmaNodeId": "100:201", "verified": "YYYY-MM-DD" },
        { "route": "/service-b", "section": "01-hero", "breakpoint": 1512,
          "figmaNodeId": "100:202", "verified": "YYYY-MM-DD" }
      ]
    }
  },

  "routes": [
    {
      "route": "/service-b",
      "frame": { "nodeId": "100:199", "name": "Service template", "width": 1512, "height": 8122 },
      "breakpoints": [
        { "css": 1512, "figmaFrameWidth": 1512, "webflow": "main", "note": "authored" },
        { "css": 991,  "figmaFrameWidth": null, "webflow": "medium", "note": "no frame, hand-authored" }
      ],
      "sections": [
        {
          "name": "01-hero",
          "figmaNodeId": "100:200",
          "selector": "section.service-hero",
          "componentId": "Hero/Service",
          "verified": "YYYY-MM-DD",
          "notes": "component variant=service"
        }
      ]
    }
  ],

  "coverage": {
    "missing": [
      { "figmaNodeId": "100:210", "state": "nav dropdown open", "reason": "no Figma frame for the open state" }
    ],
    "coveredViaComponent": [
      { "route": "/service-b", "state": "default", "breakpoint": 393,
        "coveredVia": "/service-a", "componentId": "Hero/Service" }
    ]
  },
  "reviewPlan": {
    "cells": [
      { "route": "/service-b", "breakpoint": 393, "state": "default",
        "figmaNodeId": "100:203", "sectionName": "01-hero" },
      { "route": "/service-b", "breakpoint": 393, "state": "nav open",
        "figmaNodeId": "100:204", "sectionName": "02-nav" }
    ]
  },
  "knownAccepted": [
    { "what": "service hero uses shared placeholder copy",
      "why": "content binding pending; owner decision", "reviewBy": "YYYY-MM-DD" }
  ],
  "externalReferences": [
    { "url": "https://reference.example/services",
      "route": "/service-a",
      "note": "stakeholder-cited animation reference, not in Figma",
      "source": "approved project correspondence",
      "checked": "human/visual only, outside this skill's Figma-diff model" }
  ],
  "scheduledForDeletion": [
    { "route": "/team/example",
      "why": "placeholder person shown beside real team members",
      "decidedBy": "owner", "decidedOn": "YYYY-MM-DD" }
  ]
}
```

Every parity run also needs explicit `reviewPlan.cells`. This is the denominator,
written before capture rather than reconstructed from successful evidence. Each
cell names a route, numeric breakpoint, state, exact Figma node and section name.
Freeze the relevant cells with `scripts/freeze_plan.mjs`; the capture and
manifest bind themselves to that plan and the map hash. A small project can skip
the component registry, but it cannot skip the review plan.

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

Keep the map useful over time. Move these items elsewhere:

- **Session narrative**, such as "build progress, 2026-07-23." Use `git log` for
  this.
- **Tool gotchas.** These form cross-project knowledge. Put them in the relevant
  skill or in memory, not in one site's design map.
- **Anything derivable from the code.** A selector that any grep would find does
  not need restating. The *Figma node it corresponds to* does need restating,
  because nothing else records it.

A map that mixes lasting facts with a diary gets skimmed rather than trusted.
Old lines then survive because nobody reads it closely.
