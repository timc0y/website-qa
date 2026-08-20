# Platform adapters

The core parity method stays framework-neutral. Apply only the adapter that
matches your target.

## Astro and static or server-rendered sites

Confirm that the client islands hydrated before you capture an interactive
state. A complete document load does not prove a `client:*` component is
ready. Check the actual control or the hydration marker, then exercise it.
Capture the server-rendered entry state and the hydrated interactive state
separately, when the two differ.

## React, Next.js, and similar hydrated applications

Wait beyond HTML availability for the route data, the suspense boundaries, and
the fonts. Prefer stable test data. Treat a development overlay and a
hydration warning as website QA evidence, not as a parity delta. For a portal,
capture the rendered dialog or menu boundary directly. Do not assume the
portal lives under the trigger's DOM subtree.

## Webflow

Use the published site. Verify whether a development override loader replaced
the production JS. Webflow IX2 may ignore a synthetic hover. A real pointer
action verifies the behavior. Forcing a hidden panel visible verifies only the
panel layout. `.w-nav-button` and a custom nav toggle class may match more
than one control, so identify the rendered hamburger. Do not choose the first
match.

The default Webflow breakpoints can inform your scoping, but the Figma frame
widths stay authoritative. A default paragraph margin, a line box, and a
stretch alignment often create an apparent spacing delta. Measure the causal
box before you file the visible symptom.

## Smooth-scroll and animation libraries

The scroll position and the painted position may diverge. Prefer a direct
element screenshot, or temporarily isolate the section for the capture. Use a
real interaction for a motion claim. Label a force-shown state as layout-only.
