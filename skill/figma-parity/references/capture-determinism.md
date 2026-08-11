# Deterministic capture

## In this file

- Content width
- Detecting a changed target
- Confirming page scripts ran
- Waiting for a stable page
- Scroll reveals, matching conditions and changing content
- Capture boundaries

A visual comparison is trustworthy only when you control and record the
capture conditions.

`scripts/capture.mjs` implements everything below for a local run. Read this
file anyway. When Forge or an already-open browser supplies the pixels, these
are the facts the provider must report. Each fact the provider cannot report
costs you confidence.

## The three questions to answer before you compare anything

A screenshot that answers none of these questions is a picture, not evidence.

### 1. What was the content width? The content width is not the window width.

A classic scrollbar, or a `scrollbar-gutter: stable` rule, permanently
reserves horizontal space. A 1512px window can lay out at 1497px, and every
horizontal measurement then runs silently 15px out. Never assume the two
widths are equal.

Measure `window.innerWidth - document.documentElement.clientWidth`. Then widen
the window by that amount, so the *content* matches the Figma frame width.
Record `requestedContentWidth`, `windowWidth`, `reservedGutter`, and
`observedContentWidth`.

If the observed width does not equal the frame width, a horizontal finding
cannot be `verified`, no matter how clear the screenshot looks. If the
provider cannot report the observed width at all, record `null`. `null` means
unknown, and an unknown value degrades confidence. It never means "probably
fine."

### 2. Did the target change while you were looking at it?

A preview or a staging URL gets republished mid-review. Two captures taken
minutes apart can come from different builds. Blending them invents findings
that never coexisted.

Fingerprint the served document, using a SHA-256 hash, the byte length, and
`last-modified`, at the start of the run and again at the end. If the two
fingerprints differ, say so in `limitations`. Decide which state the report
describes, and re-capture the rest of the run to match it. Under Forge, use
file hashes plus timestamps as the substitute, ideally alongside your own
separate fetch.

Treat these symptoms as suspicion, not as a confirmed defect: a section height
that moves between runs, an element present in one capture and absent in the
next, and a selector that resolved an hour ago and no longer does.

### 3. Did the page's own scripts execute?

If the site's JavaScript never ran, you are comparing an unfinished page, and
the missing pieces will look like build defects. Record the script URLs that
loaded, any that failed, and whatever readiness signal the page exposes, such
as a `data-*-ready` attribute, a hydration class, or a global variable. A
failed request is not automatically a defect. A dev-host probe or an optional
third party can fail by design. An unexecuted primary bundle does invalidate
the run.

Where you cannot establish this fact, declare `scriptsExecuted: null`. Treat a
finding about anything script-driven, such as a carousel, an accordion, a
reveal, or a sticky behavior, as `suspected` at best.

## Settle the page

Wait for DOM readiness, framework hydration, `document.fonts.ready`, image
completion, and the absence of loading placeholders. Then wait until two
consecutive screenshots or geometry samples agree. A fixed delay alone is not
evidence that the page settled.

Two traps have cost real time:

- **Await font readiness inside the page**, with `await document.fonts.ready`,
  and return a plain value. Returning the promise itself hands the driver an
  unserializable `FontFaceSet`.
- **Bound every scroll sweep.** A lazy-loaded image grows `scrollHeight` as
  you scroll, so a loop whose exit test is "past the bottom" may never finish.
  Cap the number of iterations.

Freeze time only when time is not part of the design. Disable caret blinking
and deterministic animations with an injected capture stylesheet. Inject this
stylesheet *after* the reveal sweep, so an entrance animation finishes instead
of freezing half-played. Record the stylesheet or the masking rules you used.

## Trigger a scroll-linked reveal before you measure

A scroll-into-view animation, such as Webflow IX2, GSAP ScrollTrigger, or
`IntersectionObserver`, leaves content invisible or offset until the viewport
reaches it. Sweep the full page, then return to the top and let it settle.
Skipping this step produces a "missing section" finding for content that is
merely unrevealed. An absence still needs two signals.

## Match the conditions

Match the Figma frame's CSS width, color scheme, locale, content, state, and
data density. Record the device scale factor, because image pixels and CSS
pixels are different coordinate spaces. Use stable browser and font versions
for a repeat run. Browser rendering varies by OS, browser build, hardware, and
fonts.

## Volatile content

Prefer a stable fixture. When a stable fixture is not possible, mask only a
confirmed volatile region, such as a clock, a rotating advert, a video frame,
or a personalized avatar. Preserve the layout with visibility-style masking,
unless removing the element is itself the intended comparison. Record every
mask in the manifest. An undisclosed mask invalidates the relevant evidence.

## Capture boundaries

A direct component or section screenshot is more reliable than a proportional
crop from two pages with different heights. If you must crop a full-page
image, record the mapping method, and treat a small vertical offset as
`visual-only` until you measure it in the DOM.

An element screenshot captures whatever overlaps the element's box, so a fixed
header or a cookie banner can appear inside a section shot that Figma draws
without it. Record this as a condition difference, not as a finding.

When a selector matches more than one element, record the match count.
Capturing "the first one" silently is how the wrong element ends up in the
report.

A deep-scroll blank capture is a capture failure. Reposition the target near
the top of the viewport, or capture the element directly, then verify the
paint state. Never report blank evidence as missing UI.
