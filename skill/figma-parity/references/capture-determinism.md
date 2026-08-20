# Deterministic capture

Visual comparison is trustworthy only when capture conditions are controlled and recorded.

`scripts/capture.mjs` implements everything below for a local run. Read this anyway —
when Forge or an already-open browser supplies the pixels, these are the facts the
provider must report, and each one it cannot report costs you confidence.

## The three questions to answer before comparing anything

A screenshot that answers none of these is a picture, not evidence.

### 1. What was the content width? (It is not the window width.)

A classic scrollbar or `scrollbar-gutter: stable` permanently reserves horizontal
space, so a 1512px window can lay out at 1497px and every horizontal measurement is
silently 15px out. Never assume the two are equal.

Measure `window.innerWidth - document.documentElement.clientWidth`, then widen the
window by that amount so the *content* matches the Figma frame width. Record
`requestedContentWidth`, `windowWidth`, `reservedGutter` and `observedContentWidth`.

If the observed width does not equal the frame width, horizontal findings cannot be
`verified` — no matter how clear the screenshot looks. If the provider cannot report
observed width at all, record `null`; `null` means unknown and unknown degrades
confidence. It never means "probably fine".

### 2. Did the target change while you were looking at it?

Preview and staging URLs get republished mid-review. Two captures taken minutes apart
can come from different builds, and blending them invents findings that never
coexisted.

Fingerprint the served document (SHA-256, byte length, `last-modified`) at run start
and again at run end. If they differ, say so in `limitations`, decide which state the
report describes, and re-capture the rest to match it. Under Forge, artifact hashes
plus timestamps are the substitute, ideally alongside your own separate fetch.

Symptoms worth treating as suspicion rather than a defect: section heights that move
between runs, an element present in one capture and absent in the next, a selector
that resolved an hour ago and no longer does.

### 3. Did the page's own scripts execute?

If the site's JS never ran, you are comparing an unfinished page and the missing
pieces will look like build defects. Record the script URLs that loaded, any that
failed, and whatever readiness signal the page exposes (a `data-*-ready` attribute, a
hydration class, a global). Note that a failed request is not automatically a defect —
dev-host probes and optional third parties fail by design — but an unexecuted primary
bundle invalidates the run.

Where this cannot be established, declare `scriptsExecuted: null` and treat findings
about anything script-driven (carousels, accordions, reveals, sticky behaviour) as
`suspected` at best.

## Settle the page

Wait for DOM readiness, framework hydration, `document.fonts.ready`, image completion
and the absence of loading placeholders. Then wait until two consecutive screenshots or
geometry samples agree. A fixed delay alone is not evidence that the page settled.

Two traps that cost real time:

- **Await font readiness inside the page** (`await document.fonts.ready`), and return a
  plain value. Returning the promise hands the driver an unserialisable `FontFaceSet`.
- **Bound every scroll sweep.** Lazy images grow `scrollHeight` as you scroll, so a loop
  whose exit test is "past the bottom" may never finish. Cap the iterations.

Freeze time only when time is not part of the design. Disable caret blinking and
deterministic animations with an injected capture stylesheet — but inject it *after* the
reveal sweep, so entrance animations finish rather than freezing half-played. Record the
stylesheet or masking rules used.

## Trigger scroll-linked reveals before measuring

Scroll-into-view animations (Webflow IX2, GSAP ScrollTrigger, `IntersectionObserver`)
leave content invisible or offset until the viewport reaches it. Sweep the full page,
then return to the top and let it settle. Skipping this produces "missing section"
findings for content that is merely unrevealed — and absence still needs two signals.

## Match conditions

Match the Figma frame's CSS width, colour scheme, locale, content, state and data
density. Record device scale factor because image pixels and CSS pixels are different
coordinate spaces. Use stable browser/font versions for repeat runs; browser rendering
varies by OS, browser build, hardware and fonts.

## Volatile content

Prefer stable fixtures. When that is impossible, mask only confirmed volatile regions
such as a clock, rotating advert, video frame or personalised avatar. Preserve layout
with visibility-style masking unless removing the element is itself the intended
comparison. Every mask belongs in the manifest; an undisclosed mask invalidates the
relevant evidence.

## Capture boundaries

Direct component/section screenshots are more reliable than proportional crops from two
pages with different heights. If full-page images must be cropped, record the mapping
method and treat small vertical offsets as visual-only until measured in the DOM.

Element screenshots capture whatever overlaps the element's box, so a fixed header or
cookie banner can appear inside a section shot that Figma draws without it. That is a
condition difference to record, not a finding.

When a selector matches more than one element, record the match count — capturing "the
first one" silently is how the wrong element ends up in the report.

Deep-scroll blank captures are capture failures. Reposition the target near the viewport
top or capture the element directly, then verify paint state. Never report blank evidence
as missing UI.
