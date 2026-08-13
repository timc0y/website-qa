# The project Figma map

## In this file

- Why a project map matters
- How much of the component list to build
- The `figma-map.json` format
- Dates, pages marked for deletion and stale notes
- What should stay out of the map

Before listing comparisons, find the project's node/section, frame/breakpoint,
and accepted-difference map in `FIGMA.md`, `docs/figma.md`, `design/README.md`,
or `figma-map.json`. If absent, create one in an approved private location (or
run-local for public repositories). Never copy populated client maps here.

## Why it matters

The map supplies explicit node/selector pairing for `compose_review.py --map`,
Figma-frame/CSS-breakpoint ownership, accepted mismatches, absent designs,
external references, deletion decisions, and a scope-matched component registry.
These facts prevent filename guessing, invented intent, duplicate findings, and
wasted review.

## List only the components needed for the review

For site-wide/multi-route work, scan relevant Figma pages once and record each
named instance's route, section, breakpoint, and node ID. For targeted work,
register the requested component and known reuses; expand only to resolve a
missing state/breakpoint. Store registry and declared scope in `components`.

Reuse does not prove contextual equivalence. Annotate cross-route coverage, but
keep a route missing until its exact content, container, theme, and state have
evidence. Shared identity never removes a denominator cell.

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

Every run requires pre-capture `reviewPlan.cells`: route, numeric breakpoint,
state, exact node, and section. Freeze them with `scripts/freeze_plan.mjs`; capture
and manifest bind to plan/map hashes. Small projects may omit the registry, never
the review plan.

## Every claim carries a date

Date every claim. Anything older than the last deploy is a hypothesis. Open-item
lists decay fastest; stale items waste review and invite duplicate fixes.

## A page scheduled for deletion is a fact for this map, not only for the report

Record every deletion decision in `scheduledForDeletion`, even when also
`knownAccepted`. The report must surface it before review. See
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

Keep `docDrift` separate from parity; stale documentation is not a website defect.

## What does not belong in the map

Exclude session narrative (`git log` owns it), cross-project tool guidance (skill
docs own it), and code-derived facts. Keep non-derivable node/selector mappings.
Mixing durable facts with diary prose makes the map untrusted.
