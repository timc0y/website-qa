# How the Figma file must be set up for reliable QA

The quality of a Figma↔live comparison is capped by how the Figma file is
prepared. Share this with designers; when a file follows it, the review is faster
and produces far fewer false findings. When it doesn't, note the gaps up front.

## Frames — one per breakpoint AND per state
The reviewer compares a live capture to a **specific Figma frame**, so every view
that needs QA must exist as its own top-level frame with a shareable node-id:
- **One full-page frame per breakpoint** you build for, at the exact CSS viewport
  widths used for implementation. If Figma is 1440 but capture is 1512, much of the
  page will read as "off". Pick the widths and keep them consistent.
- **One frame per interactive state**: each nav dropdown open, mobile menu open +
  every submenu, and key hover/active states (button hover, card hover, tab
  active). A prototype interaction can't be rendered to a comparison image — a
  static frame (or a component variant) can. Component **variants**
  (default/hover/active) are ideal: they're explicit and machine-readable.

## Auto Layout with real padding & gaps
Build sections and components with **Auto Layout** and real `padding`/`gap`, not
absolute positioning. The reviewer derives intended section padding from the
frame's auto-layout padding (or the y-offset of the first child). Absolute
(`mode: none`) layouts force it to *infer* spacing from child positions — it works
but is noisier and less certain. Auto Layout makes intent machine-readable
(`layout.padding`, `layout.gap`).

## Variables & Styles for tokens
Define and **apply** Variables/Styles for colour, type, and spacing. Then
`get_variable_defs` returns a token map and findings can be named by token ("should
be `orange/500 #E8622A`") instead of a raw hex, and "which token is this meant to
be" stops being a guess. Bound variables are the single biggest reducer of
false/ambiguous findings.

## Name things
Name section frames and components meaningfully ("Hero", "Services", "FAQ",
"Button/Primary"). The reviewer maps live sections to Figma by name and labels the
side-by-side crops with them. `Frame 1321318104` tells nobody anything;
`get_metadata` output becomes legible when layers are named.

## Keep scaffolding out of the export
Cursors, red-lines, spec annotations, "SEO"/dev notes, and browser-chrome mockups
clutter the rendered frame and get measured as if they were content (a real file
had an `Aeonik Pro TRIAL`/`SEO` text node and a `Browser Control Bar` frame inside
the page). Put that on a separate page or hide it so renders are clean.

## Content: real or clearly-placeholder
Use realistic content, or mark placeholder clearly. The reviewer treats
lorem/"Service Title Here" as **content TBD**, not a defect — but if Figma is lorem
and live is real copy, that mismatch is expected and shouldn't be reported as a
bug. Consistent content on both sides makes genuine differences pop.

## Annotate intentional deviations
If something intentionally differs from a naive reading (a section deliberately
reuses another component, a breakpoint intentionally drops an element), leave a
Figma comment. The reviewer can read comments (via the figma-context skill) and
won't raise it as a finding.

## Enable the right access
- A Figma API or connector that can return node data and render named nodes is the
  best fit for headless, repeatable runs.
- Desktop/Dev Mode integrations can provide richer per-node variables, metadata,
  screenshots and Code Connect mappings, but require the relevant file and service
  to be available. Record which connector produced each reference.

## Quick checklist to hand a designer
- [ ] A frame per breakpoint at the implementation's real CSS widths
- [ ] A frame/variant per interactive state (dropdowns, mobile menu + submenus, hovers)
- [ ] Auto Layout with real padding/gap on sections & components
- [ ] Colour/type/spacing Variables or Styles applied (not raw values)
- [ ] Layers & components named
- [ ] No cursors/redlines/notes/mockups in the exported frames
- [ ] Real or clearly-marked placeholder content
- [ ] Comments on any intentional deviation
