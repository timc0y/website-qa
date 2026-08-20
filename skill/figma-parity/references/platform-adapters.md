# Platform adapters

The core parity method is framework-neutral. Apply only the adapter that matches the target.

## Astro and static/server-rendered sites

Confirm client islands have hydrated before capturing interactive state. A complete document
load does not prove `client:*` components are ready. Check the actual control or hydration marker,
then exercise it. Capture the server-rendered entry state and hydrated interactive state separately
when they differ.

## React, Next.js and similar hydrated applications

Wait beyond HTML availability for route data, suspense boundaries and fonts. Prefer stable test
data. Treat development overlays and hydration warnings as website QA evidence, not parity deltas.
For portals, capture the rendered dialog/menu boundary rather than assuming it lives under the
trigger's DOM subtree.

## Webflow

Use the published site and verify whether any development override loader replaced production JS.
Webflow IX2 may ignore synthetic hover. A real pointer action verifies behaviour; forcing a hidden
panel visible verifies only panel layout. `.w-nav-button` and custom nav toggle classes may match
more than one control, so identify the rendered hamburger rather than choosing the first match.

Default Webflow breakpoints can inform scoping, but the Figma frame widths remain authoritative.
Default paragraph margins, line boxes, and stretch alignment often create apparent spacing deltas;
measure the causal box before filing the visible symptom.

## Smooth-scroll and animation libraries

Scroll position and painted position may diverge. Prefer direct element screenshots or temporarily
isolate the section for capture. Use real interaction for motion claims and label force-shown states
as layout-only.
