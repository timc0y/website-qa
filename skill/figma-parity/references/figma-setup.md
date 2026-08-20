# How to set up the Figma file for reliable QA

The quality of a Figma-to-live comparison has a limit set by how the Figma file
was prepared. Share this file with your designers. When a file follows these
rules, the review runs faster and produces far fewer false findings. When a
file does not follow these rules, note the gaps up front.

## Frames: one per breakpoint and one per state

A reviewer compares a live capture to a **specific Figma frame**. Every view
that needs QA must exist as its own top-level frame with a shareable node ID:

- **One full-page frame for each breakpoint** you build for, at the exact CSS
  viewport widths used in the implementation. If Figma uses 1440 and the
  capture uses 1512, much of the page will read as "off." Pick fixed widths
  and keep them consistent.
- **One frame for each interactive state**: each open nav dropdown, an open
  mobile menu plus every submenu, and each key hover or active state, such as
  a button hover, a card hover, or an active tab. A prototype interaction
  cannot render to a comparison image. A static frame, or a component variant,
  can. Component **variants** (default, hover, active) work best. They are
  explicit and machine-readable.

## Auto Layout with real padding and gaps

Build sections and components with **Auto Layout**, using real `padding` and
`gap` values, not absolute positioning. A reviewer derives the intended section
padding from the frame's Auto Layout padding, or from the y-offset of the first
child. An absolute (`mode: none`) layout forces the reviewer to *infer* spacing
from the child positions. This inference works, but it is noisier and less
certain. Auto Layout makes intent machine-readable, through `layout.padding`
and `layout.gap`.

## Variables and styles for tokens

Define Variables and Styles for color, type, and spacing, and **apply** them.
Then `get_variable_defs` returns a token map, and a finding can name a token,
such as "should be `orange/500 #E8622A`," instead of a raw hex value. "Which
token is this meant to be" stops being a guess. Bound variables reduce false
and ambiguous findings more than any other single change.

## Name things

Name the section frames and the components meaningfully: "Hero," "Services,"
"FAQ," "Button/Primary." A reviewer maps a live section to Figma by name, and
labels the side-by-side crops with that name. "Frame 1321318104" tells nobody
anything. `get_metadata` output becomes readable once the layers are named.

## Keep scaffolding out of the export

A cursor mockup, a redline, a spec annotation, an "SEO" or dev note, and a
browser-chrome mockup clutter the rendered frame, and a reviewer will measure
them as if they were real content. One real file had an `Aeonik Pro TRIAL` and
`SEO` text node and a `Browser Control Bar` frame inside the page. Put this
material on a separate page, or hide it, so the renders stay clean.

## Content: real, or clearly marked as a placeholder

Use realistic content, or mark placeholder content clearly. A reviewer treats
lorem text or "Service Title Here" as **content to be determined**, not as a
defect. But if Figma uses lorem text and the live page uses real copy, that
mismatch is expected. Do not report it as a bug. Consistent content on both
sides makes a genuine difference easy to see.

## Annotate an intentional deviation

If something intentionally differs from a naive reading of the file, for
example a section that deliberately reuses another component, or a breakpoint
that intentionally drops an element, leave a Figma comment. A reviewer who can read
the file's comments will see it and not raise the deviation as a finding.

## Enable the right access

- A Figma API or connector that can return node data and render named nodes is
  the best fit for a headless, repeatable run.
- A Desktop or Dev Mode integration can provide richer per-node variables,
  metadata, screenshots, and Code Connect mappings, but it needs the relevant
  file and service to be available. Record which connector produced each
  reference.

## Quick checklist to hand a designer

- [ ] A frame for each breakpoint, at the implementation's real CSS widths
- [ ] A frame or a variant for each interactive state (dropdowns, mobile menu
      plus submenus, hovers)
- [ ] Auto Layout with real padding and gap on sections and components
- [ ] Color, type, and spacing Variables or Styles applied, not raw values
- [ ] Layers and components named
- [ ] No cursors, redlines, notes, or mockups in the exported frames
- [ ] Real content, or clearly marked placeholder content
- [ ] A comment on any intentional deviation
