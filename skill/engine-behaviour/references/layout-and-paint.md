# Layout and paint

9 entries. This file covers what forces a layout, a paint, or a new graphics
layer, and what that costs. See `../SKILL.md` for how each entry is built,
the confidence labels (SPEC, KNOWN, FIELD), and the staleness convention.

Baseline engine versions at the last check: Safari 26.x, Chrome about 139,
Firefox about 142. Re-verify KNOWN and FIELD entries at each major Safari
release.

---

## LP-1 An animated height, width, or margin runs layout on every frame

- **Pattern**: a transition or a step-based animation that changes `height`,
  `max-height`, `width`, `top`, `margin`, or `padding` over time.
- **Mechanism**: these properties affect layout. The engine cannot hand them
  to the compositor thread. Each frame of the animation invalidates style,
  layout, and paint. It does this for the element, for its full subtree, and
  for everything below it that must move. `transform` and `opacity` animate
  on the compositor instead, and skip this cost.
- **Affected**: every engine. The cost is worst on a low-end Android device.
  It is also worst under iOS Low Power Mode, where a script-driven animation
  drops to 30 frames per second too (see MP-1 in `media-and-power.md`). A
  desktop computer often hides the cost.
- **Symptom**: an accordion that opens with a stutter. Content below it
  jumps while it opens. The page stutters while it scrolls during the
  animation.
- **Detect**: record a performance trace while you open and close the
  element. The fault is a layout event inside every animation frame. It is
  also a frame time above 16.7 milliseconds, with 4x CPU throttling on. As
  a static check, search all scripts and styles for a transition on
  `height`, `width`, `max-height`, `top`, `left`, `margin`, or `padding`.
- **Instead**: measure the content once. Set an explicit pixel height, and
  transition it. Set the height back to `auto` when the transition ends. Or
  reveal the content with `transform`, `clip-path`, or `opacity` instead.
- **Confidence**: KNOWN. The list of compositor-only properties is
  documented at
  [web.dev/animations-guide](https://web.dev/articles/animations-guide) and
  on MDN. Verified 2026-08, all current engines.

## LP-2 A large fixed `max-height` on an accordion breaks the timing

- **Pattern**: a closed state of `max-height: 0` and an open state of
  `max-height: 999px` (or `100vh`), with a transition between them. This is a
  common way to fake an animation to `auto`.
- **Mechanism**: the engine plays the transition across the full authored
  range, not the visible range. Say the real content is 180 pixels tall, and
  the target is 999 pixels. An opening motion then covers only the first
  18% of the duration. It runs at the wrong speed. A closing motion spends
  the first 82% of its duration shrinking from 999 to 180 pixels, with no
  visible change. It looks delayed, then it slams shut.
- **Affected**: every engine, in the same way. This comes from the
  transition math, not from an engine difference.
- **Symptom**: the accordion opens at the wrong speed. On close, it appears
  to hang, then it slams shut.
- **Detect**: compare the authored `max-height` value with the measured
  `scrollHeight` of the tallest real content. A ratio above about 1.5 means
  the timing error is large enough for a user to notice. The layout cost
  from LP-1 still applies.
- **Instead**: use a measured pixel height (see the LP-1 alternative). Or
  use LP-4 as an enhancement on top of it.
- **Confidence**: SPEC. The transition interpolation model comes from the
  CSS Transitions specification. Verified 2026-08.

## LP-3 A `grid-template-rows: 0fr` to `1fr` accordion re-runs layout and can shift text

- **Pattern**: a wrapper set to `display: grid; grid-template-rows: 0fr;`,
  with a transition on `grid-template-rows`, changed to `1fr` to open. The
  inner child needs `min-height: 0; overflow: hidden`. Authors choose this
  pattern because it animates to the content's real height, with no script
  needed to measure it.
- **Mechanism**: an engine can animate a grid track list by its computed
  value. This works when the number and type of tracks match on both ends.
  But animating an `fr` track re-runs grid layout on every frame, at the
  same cost as LP-1. Engines also round the fractional track size
  differently while the value is mid-animation. WebKit has shown visible
  text re-wrap, and a clipped line, while the track resolves.

  If you omit `min-height: 0` on the child, the track never reaches zero,
  in every engine. This floor comes from the CSS Box Sizing specification.
- **Affected**: every engine pays the layout cost. The mid-animation
  rounding fault, and the text re-wrap fault, are worst in Safari. Chrome
  and Firefox still run the animation on the main thread.
- **Symptom**: text inside the accordion appears to shiver, or to re-wrap,
  while it opens. The last line is clipped during the motion. A close
  action snaps shut.
- **Detect**: as a static check, find any transition on
  `grid-template-rows` or `grid-template-columns`. As a dynamic check,
  capture the element at 50% through the transition. Compare the text
  position with the settled state. Any re-wrap is the fault. Also check the
  child for `min-height: 0`.
- **Instead**: use a measured pixel height. Keep the closed state in the
  stylesheet. Measure the content before you open it, so a close action can
  animate too.
- **Confidence**: SPEC for the animation rule and the `min-height: 0` floor
  (CSS Grid 1, CSS Box Sizing). FIELD for the Safari mid-animation
  artefacts, seen in production audits. Verified 2026-08.

## LP-4 `interpolate-size` and `calc-size()` work in Chromium only

- **Pattern**: a stylesheet sets `interpolate-size: allow-keywords` (or uses
  `calc-size()`) and transitions `height: 0` to `height: auto`. The author
  expects an animated opening everywhere.
- **Mechanism**: `interpolate-size` is an opt-in feature. It lets an engine
  interpolate between a size keyword (like `auto`) and a length. It shipped
  in Chromium 129, in September 2024. As of Safari 26.x and Firefox 142,
  Safari and Firefox do not support it. An engine without support applies
  its default rule instead. The property flips at once, at 50% of the
  transition.
- **Affected**: works in Chrome, Edge, Samsung Internet, and Android WebView
  129 and later. Snaps open at once in every Safari, on macOS and on every
  iOS browser (every iOS browser uses WebKit). It also snaps open at once
  in Firefox.
- **Symptom**: a panel animates open on a Chrome computer. It snaps open at
  once on the client's iPhone or Mac.
- **Detect**: run `CSS.supports('interpolate-size', 'allow-keywords')` in
  each target engine. Treat any use of this feature as an enhancement.
  Confirm that the unsupported path is an accepted result in the brief: an
  instant open or close, with the correct end state.
- **Instead**: this feature is acceptable only as a progressive enhancement,
  when an instant toggle is an accepted fallback. Otherwise, use a measured
  pixel height (see LP-1 and LP-3). It behaves the same way everywhere.
- **Confidence**: KNOWN. See
  [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/interpolate-size),
  [Chrome Platform Status](https://chromestatus.com/feature/5196713071738880),
  and [caniuse](https://caniuse.com/mdn-css_properties_interpolate-size).
  Verified 2026-08. Check this entry again at each audit. It becomes wrong
  the day Safari or Firefox ships the feature.

## LP-5 `content-visibility: auto` and `contain` change what the engine lays out, per engine

- **Pattern**: a stylesheet adds `content-visibility: auto` to a section
  below the fold. Or it adds `contain: layout paint` (or `contain: strict`)
  to a component, often copied from an article about performance.
- **Mechanism**: the engine skips style, layout, and paint work for a
  subtree that is off screen. It shows a placeholder instead, sized by
  `contain-intrinsic-size`. Without that property, the placeholder has zero
  height. The document height then changes as each section enters the
  viewport. This moves the scroll bar, and it can send an anchor link to
  the wrong place.

  Support starts at Chrome 85, Firefox 125, and Safari 18. Safari also
  does not show skipped content to its find-on-page feature.

  `contain: paint` creates a containing block for any `position: fixed`
  descendant too (see LP-9), and it clips overflow content. Both are side
  effects that authors do not expect.
- **Affected**: Safari 17 and earlier ignore this property, with no benefit
  and no harm. Safari 18 and later miss skipped content in find-on-page.
  Any engine that supports the property can show the scroll bar fault, and
  the anchor fault, if `contain-intrinsic-size` is missing.
- **Symptom**: the scroll bar keeps changing length. A footer link lands in
  the middle of the page. Text that is on the page cannot be found with
  Command-F, in Safari.
- **Detect**: for each element with `content-visibility: auto`, check for a
  `contain-intrinsic-size` value too, within about 20% of its real rendered
  size. Measure `document.scrollHeight` before and after a full scroll. A
  gap larger than the noise from normal image loading is the fault. Test
  one deep anchor link from a cold page load.
- **Instead**: use this property only on long, uniform, below-fold lists
  with a measured intrinsic size. Never use it on a section that is an
  anchor target. Never rely on it for content a user may search for in
  Safari.
- **Confidence**: KNOWN. See
  [web.dev](https://web.dev/articles/content-visibility),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/content-visibility),
  and WebKit's own notes on the Safari find-on-page gap. Verified 2026-08.

## LP-6 Text on a compositor layer can look blurred while it moves

- **Pattern**: a scroll-triggered fade or scale animation applied to a
  heading or a paragraph. A `will-change: transform` value left on a text
  container. A modal that animates `transform: scale(0.95)` to `scale(1)`
  on content that includes text.
- **Mechanism**: promoting text onto a compositor layer draws the letters
  into a fixed texture, at a snapshot size. During a scale animation, the
  engine stretches that texture, instead of drawing the letters again at
  each size. It only draws the letters again, at the final sharpness, once
  the animation stops. WebKit shows this delay most clearly. A resting
  position that is not a whole number of pixels adds a further fault. It can
  leave letters on a half-pixel boundary, so the edges look different from
  neighbouring text that is not on a layer.
- **Affected**: every engine, while a scale animation runs. Safari shows it
  most clearly: a blur until the animation settles, then a visible jump to
  sharpness. A high-density screen does not hide this fault as much as you
  might expect, on a target larger than its resting size.
- **Symptom**: pop-up text looks blurred for a moment. One heading looks
  softer than another. Text visibly sharpens right after an animation
  stops.
- **Detect**: take a magnified image of the same letters mid-animation, and
  compare it with the settled state. As a static check, find every scale
  animation whose target contains text. Also find any text with a resting
  `transform` value that is not a whole number of pixels. Any resting
  `transform` left on text after its animation ends is a separate fault.
- **Instead**: animate `opacity` and a whole-pixel `translate` value on
  text. Keep `scale` for images and decorative blocks. Remove `transform`
  and `will-change` from an element once its animation ends.
- **Confidence**: FIELD. This is easy to reproduce, but WebKit has not
  published the timing of its redraw. Verified 2026-08 on Safari 26 and
  Chrome 139.

## LP-7 A layer held in memory can be dropped on a low-memory device

- **Pattern**: `will-change: transform` left permanently on many components.
  An animation library leaving a resting `transform: translate3d(0,0,0)`
  value on many elements after a one-time animation ends. A large
  full-bleed section promoted to its own layer for a single reveal.
- **Mechanism**: each layer that the compositor draws holds its own picture
  in graphics memory. This is sized at roughly width times height times 4
  bytes, times the square of the device pixel ratio. A full-screen layer on
  a phone with a 3x pixel ratio needs about 50 megabytes. Each engine has a
  budget for the total size of all layers.

  Past that budget, WebKit can drop layers. Or it can reload the whole
  page, and show the message "This webpage was reloaded because it was
  using significant memory." Chrome on an Android device with 2 to 3
  gigabytes of memory can end the page's process instead. The user sees
  this as a silent tab reload. MDN's own page on `will-change` calls it a
  last resort, because a layer is not free.
- **Affected**: an older iPhone, or a low-memory Android device, shows this
  fault most. A desktop computer rarely shows it. Every engine uses the
  memory. Only a limited device shows the drop.
- **Symptom**: a page goes blank and reloads on a phone. A section flickers
  or disappears while scrolling. The device gets warm.
- **Detect**: count the layers, and their estimated memory, in your
  browser's developer tools. Flag any `will-change` value that is not on an
  actively running animation. Flag any promoted area larger than about 4
  times the viewport. Flag any resting `translate3d(0,0,0)` value left
  after an animation ends.
- **Instead**: promote an element to its own layer just before you animate
  it. Remove the promotion once the animation ends. Keep each promoted area
  small. Never ship a resting `will-change` value.
- **Confidence**: KNOWN for the mechanism and the warning; see
  [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change).
  FIELD for the exact memory limit on iOS, since Apple does not publish it.
  Verified 2026-08.

## LP-8 `backdrop-filter` re-draws the area behind it on every scroll frame

- **Pattern**: a glass-effect navigation bar, such as a fixed or sticky
  header with `backdrop-filter: blur(20px)`. Or a frosted card placed over
  moving content.
- **Mechanism**: the engine must re-sample the pixels behind the element,
  and run the blur again, each time the content behind it changes. Under a
  sticky header, that happens on every scroll frame. The cost scales with
  the area, times the blur radius, on the graphics processor. This property
  also creates a new stacking context. In WebKit, it also creates a
  grouping that changes how a `position: fixed` descendant behaves.
- **Affected**: every engine, with visible frame drops on a mid-range or
  low-end graphics processor, and on older iPhones. The battery cost
  applies everywhere. Safari 17 and earlier needed the
  `-webkit-backdrop-filter` prefix. Keep it while any such Safari version is
  in your support matrix.
- **Symptom**: scrolling feels heavy under the header. Frame drops stop when
  the header is hidden. The phone feels warm.
- **Detect**: trace a scroll with the filter on, then with a solid
  background colour in its place. A frame-time increase above about 4
  milliseconds, with 4x CPU throttling on, is the fault. As a static check,
  flag any full-width bar with a blur radius above 20 pixels. Also flag
  more than 2 areas with `backdrop-filter` on screen at once.
- **Instead**: use a smaller blur radius. Add a solid, mostly-opaque
  fallback under `prefers-reduced-transparency` (see MP-5 in
  `media-and-power.md`). Or blur a pre-rendered image, instead of the live
  content behind it.
- **Confidence**: KNOWN for the mechanism (the Filter Effects 2
  specification states that the area behind the filter is re-sampled).
  FIELD for the exact device limits. Verified 2026-08.

## LP-9 A transformed ancestor traps a `position: fixed` descendant

- **Pattern**: a fixed navigation bar, cookie banner, or modal, placed
  inside a section that a scroll or reveal animation has touched. Many such
  animations leave a `transform` value on the section, even an identity
  value with no visible change. The same trap applies to any ancestor with
  `filter`, `perspective`, `will-change: transform`, `backdrop-filter`, or
  `contain: paint`.
- **Mechanism**: the CSS Transforms specification states that a transformed
  element becomes the containing block for all of its descendants. This
  includes any descendant with `position: fixed`. The fixed element then
  moves and scrolls relative to that ancestor, not relative to the browser
  window. An identity transform still counts. Every engine agrees, because
  the specification requires it. The trap is that `filter` and
  `will-change` also trigger this rule, which most authors do not expect.
- **Affected**: every engine, in the same way. This looks like a layout
  bug, but it appears in every engine, and only after an animation has run
  once.
- **Symptom**: a fixed menu scrolls away with the page. A modal appears in
  the wrong place, but only after an intro animation has played.
- **Detect**: for every `position: fixed` or `position: sticky` element,
  check every ancestor. Look for a computed `transform`, `translate`,
  `filter`, `backdrop-filter`, or `perspective`. Also look for a
  `will-change` value that names `transform` or `perspective`, and for
  `contain: paint` or `contain: layout`. This is a check you can run in
  script, against the built page.
- **Instead**: keep every fixed element as a direct child of the page's
  `body` element, outside any animated section. Make sure each animation
  removes its own `transform` value once it ends.
- **Confidence**: SPEC. See
  [CSS Transforms 1](https://www.w3.org/TR/css-transforms-1/#transform-rendering).
  Verified 2026-08.
