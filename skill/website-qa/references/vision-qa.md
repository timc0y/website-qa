# Vision QA — reviewing with your eyes, not just the DOM

## In this file

- What scripts cannot see
- How tiles and repeated-component sets help
- Five visual passes
- Comparing with Figma
- Screenshot traps and false findings
- How to write a trustworthy visual finding

Every script in this skill measures. Measurement is precise and blind. It will tell
you a heading is 62px and never tell you the heading crashes into the face in the
photo behind it. The defects that arrive from clients are overwhelmingly *visual
judgements*: "this looks squashed", "the icon doesn't match the others", "that section
looks unfinished", "the image is cropping his head off". None of them are expressible
as a CSS assertion — and all of them are obvious in a screenshot.

You are a vision model. **Look at the images.** This document is how.

## What only vision can catch

The categories below are not edge cases; they're the bulk of a real QA list.

| Class | Example | Why no script finds it |
|---|---|---|
| **Collision & crowding** | Heading over the busy part of a photo; text 4px from a card edge while its siblings have 32px | Both elements are inside their boxes. No overflow, no clipping. |
| **Focal point / crop** | Portrait cropped through the chin; product centred in Figma, off-centre live | `object-fit` is set correctly. The *subject* is wrong. |
| **Visual weight & balance** | Row of four cards, one has three lines of copy and towers over the rest | Every card obeys its rules. The set looks broken. |
| **Wrong asset** | Placeholder stock photo, a logo at the wrong lockup, an arrow icon where a plus belongs | It's a valid image loading successfully. |
| **Unfinished feel** | Section with one card where the design has six; a gradient that renders as a flat band | Nothing is *absent* in a way the DOM can see. |
| **Contrast in practice** | White text passing a contrast check against a declared dark bg, sitting on the pale part of a photo | Contrast maths reads the background *colour*, not the pixels behind the glyphs. |
| **Rhythm** | Section paddings that measure 96/96/96 but *read* as uneven because content density differs | Self-consistency check passes. |
| **Rendering corruption** | An SVG smeared across the viewport, a font falling back to Times, a filter banding | Sometimes measurable, often only visible. |
| **Order & hierarchy** | The CTA is less prominent than a tertiary link; eyebrow reads louder than the heading | Requires knowing what should dominate. |

## The two ideas that make this more than "look at a screenshot"

**1. Compare a thing to its siblings, not to your memory of how it should look.**
Judging one card in isolation is hard and unreliable. Judging five cards laid side by side is
trivial — the broken one announces itself. Nearly every real defect found this way (recycled
photography, a duplicated logo, one card missing its CTA, an arrow in the wrong variant) was
found by accident before `componentSets` existed, because nothing laid a set out. Now the runner
detects every repeated component, writes one crop per instance to `vision/<w>/sets/<name>/`, and
**computes the half of the answer that needs no eyes** — duplicate image `src` across instances,
an instance with no image while its siblings have one, height and copy-length outliers. On a real
page that turned "I noticed two testimonial photos look the same" into
`duplicateImageAcrossInstances: svc-exec-income.png used by 2 of 5`, MEASURED, every run.

Look at the crops for what the numbers cannot see: whether the subject is the right subject, the
crop holds its focal point, one instance carries more visual weight, an icon is the wrong weight.

**2. A vision finding is a claim plus the code that settles it.**
The value of a strong vision model here is not nicer prose about a screenshot — it is that it can
look at a rendering, form a specific hypothesis about the DOM underneath, and *write the
assertion that tests it*. Prose findings must be re-verified by hand every time, which is exactly
the manual step that made this pass unauditable and occasionally wrong.

So every `"finding"` in the checklist carries an `assert`:

```json
{ "verdict": "finding",
  "note": "testimonial 3 reuses card 1's photograph",
  "selector": ".testi_slide",
  "scrollTo": 5300,
  "assert": "(() => { const s = [...document.querySelectorAll('.testi_slide img')].map(i => i.currentSrc); const uniq = new Set(s); return { expected: s.length + ' unique', actual: uniq.size + ' unique', pass: uniq.size < s.length }; })()" }
```

`pass: true` means **the defect is real**. `runVisionProbes()` executes each assert against the
live page and stamps every finding CONFIRMED / REFUTED / ERROR. Report only CONFIRMED. The
REFUTED ones are the more valuable output: each is a new entry for `false-positives.md`, written
by the check that caught it rather than by a person noticing later.

Anything genuinely inexpressible as an assert — "this section looks unfinished", "the crop cuts
the subject badly" — is still worth reporting, and stays labelled **SUSPECTED**. That is honest;
dressing it as a measurement is not.

## The protocol

Run the sweep first. The runner writes, per breakpoint in `--vision-breakpoints`:

```
<out>/<ts>/<slug>/vision/1512/tile-01-y0.png …        viewport tiles, in reading order
<out>/<ts>/<slug>/vision/1512/sections/sec-01-*.png    one tight crop per section
<out>/<ts>/<slug>/vision/1512/sets/testi_slide/01.png  one crop per instance of a repeated component
<out>/<ts>/<slug>/vision/393-webkit/…                  same offsets, other engine
<out>/<ts>/vision-manifest.json                        every image + its anchor
<out>/<ts>/vision-checklist.json                       tiered questions to answer, per image
```

**Questions are tiered by what the image can actually answer.** A section crop is the unit in
which "does this look finished?" makes sense, so it gets all seven. A viewport tile is an
arbitrary window that slices sections in half — right for reading order and flow, wrong for
composition, so it gets four. A second-engine tile exists only to be diffed, so it gets one.
Asking every question of every image is how a large sheet gets filled in carelessly.

**Unsettled tiles are pre-marked unreviewable.** Each tile is shot twice, 350ms apart; if the two
frames differ the region was still animating and the tile is flagged before you ever open it.
This is the single largest artefact class in this whole skill — a mid-fade capture reads as
missing content — and it used to depend on me noticing. On the page that produced the false
"who-we-help panel is empty" finding, the check now flags exactly that tile automatically.

**Use the tiles, not `fullpage-*.png`.** A 20 000px strip downscaled to fit an image
budget renders 16px body copy at two pixels tall — you will confidently review a blur.
Tiles are viewport-sized and legible at native scale. This is the single most important
line in this document.

### Pass 1 — reading order, one question at a time

Open the desktop tiles in order, `tile-01` → last. Do **not** freestyle; a single
unstructured look finds roughly half of what question-per-pass finds, because you
notice the first defect on a tile and stop seeing the rest of it. On each tile ask, in
this order:

1. **Does anything touch or overlap anything it shouldn't?** Text on text, text on a
   photo's subject, an icon into a label, a card into its neighbour.
2. **Is anything crowded or stranded?** One edge tight while the opposite edge is
   generous. Elements floating with no relationship to a grid.
3. **In every set, does one member break the pattern?** Cards, logos, icons, list
   rows, nav items. The odd one out is almost always the defect.
4. **Is every image the right image, cropped right?** Faces intact, subject centred,
   no obvious stock placeholder, no wrong-brand asset.
5. **Would I believe this section is finished?** If a designer showed you only this
   tile, would you sign it off?

Write findings as you go with the anchor from the manifest: breakpoint + scroll offset
+ nearest heading. `"1512px, y=3200, near 'Our approach': …"` is actionable;
`"a heading overlaps an image"` is not.

### Pass 2 — sections, for internal balance

The section crops frame one section each. Judge composition here: alignment against
the container, padding symmetry, whether the heading/body/CTA hierarchy reads in the
right order, whether the section's height feels earned by its content.

### Pass 3 — mobile, as a separate site

Open the 393px tiles cold, not as "desktop but narrower". Most mobile defects are
proportional: type that didn't scale so a heading eats the fold, gutters that survived
from desktop, buttons stretched full-width when they shouldn't be, images that keep a
16:9 crop and become letterbox slivers, stacked cards with desktop-sized gaps.

### Pass 4 — cross-engine, tile against tile

Same widths, same scroll offsets, both engines. Compare `vision/393/tile-04-y2400.png`
with `vision/393-webkit/webkit-tile-04-y2400.png`. The numeric diff already reports
count changes; this pass exists for the large class of Safari bugs that render
"successfully" with identical counts and simply look wrong — a stretched SVG, a
mis-clipped rounded image, a sticky element in the wrong place, a gradient banding.

### Pass 5 — states

`states/*.png` and `states-mobile/*.png` hold every panel the interaction phase opened:
nav dropdowns, mobile menu, accordions, tabs. Review them with pass 1's questions.
These get the least human attention and hold a disproportionate share of defects.

## Vision against Figma

This is the other half — see the **figma-parity** skill for the capture pipeline. It
composes `Figma (left) | Live (right)` images per section per breakpoint. Looking at
those pairs is a distinct skill from measuring them:

- **Run the numeric spec diff first** (`website-qa --spec=`). Numbers settle padding, type
  and colour before you look at anything. Then your eyes are free for what numbers
  can't express — and you won't misattribute a 4px difference you're seeing to a crop
  offset in the comparison image.
- **Compare structure before pixels.** Same number of items? Same order? Same
  arrangement (3-up vs 2-up)? Same elements present at all? A missing card matters more
  than 6px of padding, and it's the thing a pixel-hunting look walks straight past.
- **The comparison images are not pixel-aligned.** Live and Figma differ in total
  height, so crops drift. Never report a small offset from the composite alone —
  confirm it by measurement. Treat the images as evidence for *presence, arrangement,
  proportion, colour and asset* questions only.
- **Say when a finding is visual-only.** If you can see it but can't attach a number
  to it, report it as visual-only/unverified rather than inventing a value. Both are
  useful; conflating them is what destroys trust in the report.

## False positives: what screenshots lie about

Screenshot artefacts have produced more bad findings in this skill than any real
defect class. Before reporting anything you saw:

- **Mid-animation capture.** A reveal caught at opacity 0.4, or a carousel between
  slides, looks like a broken element. `visionCapture` pre-scrolls the whole page so
  IX2 has fired, but a long or looping animation can still be caught mid-flight. If
  one element looks faded or offset, check the neighbouring tile (they overlap) before
  calling it.
- **Sticky/fixed chrome repeating.** A sticky nav appears on every tile. That's the
  capture, not a duplicated header.
- **The overlap band.** Tiles overlap by 80px, so the last strip of one tile is the
  first strip of the next. Content in that band is not duplicated on the page.
- **Hidden overlays.** Cookie bars, Marker.io badges and dev chips are hidden for the
  shots and listed in `overlaysHidden`. Don't report their absence; and remember the
  live page *does* have them covering that corner.
- **Lazy images.** WebKit's lazy-load threshold is one viewport (relative), Chromium's
  is a fixed ~1250px. An image that is blank in one engine's tile and present in the
  other is usually this, not a bug. This exact difference was reported as a Safari
  defect here twice before being diagnosed. Confirm by scrolling to it directly.
- **Font swap.** A tile captured before a webfont settles shows fallback type. Cross-
  check against another tile with the same typeface.
- **Reverse-on-leave reveals: the artefact that fools *both* channels.** Many builds
  animate content in on enter and back *out* on leave (GSAP ScrollTrigger reverse, Webflow
  "while scrolling in view"). Two consequences, and both produced confident false findings
  on one run:
  1. A tile jumped-to and captured too soon shows a blank band where the eyebrow and H2
     belong — read as "the section heading is missing". `visionCapture` now settles 900ms;
     if a band still looks empty, scroll there and watch before believing it.
  2. Any opacity measured **from the bottom of the page** is 0 for everything above the
     viewport, *by design*. Sampling `.who-help_eyebrow` that way gave `opacity: 0` and I
     reported the reveal as broken; scrolling it into view showed 0.47 → 0.97 → 1.0. It
     was working perfectly. **Opacity is only meaningful while the element is on screen** —
     `scrollAudit` now re-tests every candidate in the middle of the viewport, and only the
     survivors are findings.
- **Section crops can drop scroll-revealed overlays.** A `fullPage` clip resizes the
  viewport, which can re-arm or strand IX2 entrance animations: on one run the hero's
  three floating stat cards ("100+", the quote card, "1.2x") were absent from
  `sections/sec-01-*.png` and plainly present in `tile-01-y0.png` of the same page. Had
  the section crop been the only evidence, that was three fabricated "missing element"
  findings. **Tiles are the authority for anything animated; section crops are for
  framing and composition.** Cross-check any absence against the tile that covers it.
- **The scrollbar gutter.** Headless Chromium draws a classic 15px scrollbar, so the body
  is 15px narrower than `innerWidth` and every tile shows a strip of html background down
  the right edge. At 393px that looks *exactly* like "the page doesn't reach the right
  edge on mobile" — and a real phone, with overlay scrollbars, has no such gap.
  `visionCapture` now suppresses the scrollbar, but if you review any other screenshot,
  check `document.body.getBoundingClientRect().width` against `innerWidth` before
  reporting an edge gap.
- **Reveal opacity reads as low contrast.** A scroll-reveal caught at opacity 0.4 makes
  body copy or a link list look dim and washed out — indistinguishable from a genuine
  contrast failure. On one run this produced "footer links are low-contrast, and one is
  inconsistently bright"; the computed colour of all 18 was `#FFFFFF` and the "bright"
  one was simply the only one that had finished animating. **Contrast is a computed-value
  question — always settle it with `getComputedStyle`, never from a tile.**

## When vision and automation disagree, vision usually wins on *behaviour presence*

The scripts and your eyes will contradict each other. Some patterns worth knowing:

- **"Dead toggle" that plainly opens.** `openStateAudit` reported the mobile hamburger as
  revealing nothing; the state screenshot shows a fully-rendered menu with five links and
  a CTA. Height-delta detection misses a panel that animates from a different property,
  or that was measured before it settled. Open `states*/` before you report a dead
  toggle — the screenshot is the ground truth for *did something appear*.
- **The opposite case: vision cannot see a dead button.** A CTA that renders perfectly and
  does nothing looks flawless in every screenshot. Only `ctaClickAudit` finds it. Neither
  channel is sufficient; the review is the intersection.
- **Rule of thumb.** Vision is authoritative on *appearance and presence*; measurement is
  authoritative on *values*; clicking is authoritative on *behaviour*. When a finding
  crosses categories, get it from the right channel rather than the convenient one.
- **Sampled capture.** `sampledAt` in the summary means the page needed more tiles than
  the configured cap. The runner spreads captures from the first through the final
  viewport, so the tail is visible, but gaps remain between samples. Name that partial
  coverage; do not let representative sampling imply a contiguous review.

## The discipline that makes vision findings credible

The same rule as the rest of the skill, applied to looking: **before reporting a
difference, ask what would have had to be true for it to be intentional — then test
for that.** A section with one card might be a CMS collection with one published item.
A hidden arrow might be a deliberate swipe-only carousel. An "off-centre" logo might be
optically centred on purpose. State the measurement or the observation, state what you
ruled out, and let the reviewer judge — that's what separates a report someone acts on
from a list someone stops reading.
