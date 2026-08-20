# Viewport and scrolling

9 entries. This file covers what a viewport unit resolves against, and what
breaks native scrolling. See `../SKILL.md` for how each entry is built, the
confidence labels (SPEC, KNOWN, FIELD), and the staleness convention.

Baseline engine versions at the last check: Safari 26.x, Chrome about 139,
Firefox about 142. Re-verify KNOWN and FIELD entries at each major Safari
release.

---

## VS-1 `100vh` does not match a mobile browser's real visible area

- **Pattern**: a hero section set to `height: 100vh` or `min-height: 100vh`,
  often with a call-to-action pinned near its bottom edge.
- **Mechanism**: the CSS Values specification defines `vh` against the
  large viewport. That is the screen size with the browser toolbar
  retracted, on any browser whose toolbar can hide. On iOS Safari, and on
  Chrome on Android, with the toolbar visible, `100vh` is taller than the
  visible area. It is taller by the height of that toolbar, about 60 to 110
  pixels.

  Three newer units exist for this: `svh` (small viewport), `lvh` (large
  viewport), and `dvh` (dynamic viewport). Support starts at Safari 15.4,
  Chrome 108, and Firefox 101. The `dvh` unit changes its resolved size
  live, as the toolbar animates. A height set in `dvh` causes a layout
  shift during a scroll for this reason.
- **Affected**: iOS Safari, and every iOS browser, since every iOS browser
  uses WebKit. Also Chrome and Firefox on Android. A desktop computer is
  not affected. An emulator can reproduce the size of the units, but not
  the timing of the toolbar showing and hiding.
- **Symptom**: a button under the hero section is cut off on an iPhone,
  until the user scrolls. Content jumps when the address bar collapses.
- **Detect**: as a static check, find every `100vh` or `100lvh` value on
  content that must be fully visible when the page loads. As a dynamic
  check, on a real device or an accurate emulation, compare the element's
  bounding box with `window.visualViewport.height` before any scroll. Any
  part of the element below the visual viewport is the fault.
- **Instead**: use `min-height: 100svh` for content that must be visible on
  load. Reserve `dvh` for an overlay that should track the toolbar. Never
  use `height: 100dvh` on content that flows in the normal page layout.
- **Confidence**: SPEC. See
  [CSS Values 4](https://www.w3.org/TR/css-values-4/#viewport-relative-units).
  KNOWN for the per-browser toolbar behaviour. Verified 2026-08.

## VS-2 `100vw` overflows by one scroll bar width on a classic scroll bar

- **Pattern**: a full-bleed section or a slider track set to `width: 100vw`,
  often used to escape a padded container.
- **Mechanism**: the `vw` unit resolves against the page's initial
  containing block. That block includes the space a classic (non-overlay)
  vertical scroll bar takes up. Windows versions of Chrome, Firefox, and
  Edge use a classic scroll bar by default, about 15 to 17 pixels wide.
  macOS, iOS, and Android use an overlay scroll bar, which takes up zero
  width. So `100vw` overflows the visible width by the scroll bar's own
  width, on Windows only. This creates a horizontal scroll bar and a small
  sideways shift.
- **Affected**: Windows, and any Mac set to show scroll bars at all times.
  You cannot reproduce this on a Mac-only check.
- **Symptom**: the page scrolls a few pixels sideways on a Windows laptop. A
  thin horizontal scroll bar stays visible.
- **Detect**: without Windows hardware, force classic scroll bar metrics
  with a rule such as `::-webkit-scrollbar { width: 17px }`, in a test
  pass. Or compute `document.documentElement.scrollWidth` minus `clientWidth`
  on a real Windows machine, or a virtual one. Any value above zero, with
  `100vw` present, is the fault. As a static check, search the stylesheet
  for `100vw`.
- **Instead**: use `width: 100%` on block-level elements, since it never
  includes the scroll bar. Use `scrollbar-gutter: stable` where you must
  reserve space for the scroll bar. Use a negative-margin full-bleed
  pattern instead of `100vw`.
- **Confidence**: SPEC for the `vw` definition (CSS Values 4). KNOWN for the
  per-platform scroll bar default. Verified 2026-08.

## VS-3 An elastic overscroll shows the root element's background colour

- **Pattern**: a dark-themed page whose dark colour is painted by an inner
  wrapper element, not by the `html` or `body` element. A fixed header that
  meets the top edge of the page exactly.
- **Mechanism**: iOS, and macOS with a trackpad, scroll past the top or
  bottom of the page with an elastic motion. The area this motion exposes
  is painted with the root element's background colour. WebKit keeps a
  fixed element attached to the browser window. So a white `html`
  background shows as a flash above the header, on every downward pull.
- **Affected**: iOS Safari and every iOS browser, and macOS with a
  trackpad. Android draws a glow or a stretch effect instead. It does not
  show the root background the same way. No emulator reproduces the
  elastic motion.
- **Symptom**: pulling down at the top of the page shows a white gap above
  the menu.
- **Detect**: this is a cheap static check. The computed background colour
  of `html` must match the design colour at the top of the page. The
  colour of `body` must match the design colour at the bottom. This
  predicts the fault with no device needed.
- **Instead**: set the background colour of `html` and `body` on purpose.
  Do not try to stop the elastic motion with script.
- **Confidence**: KNOWN. This is a long-standing, documented WebKit
  behaviour. Verified 2026-08.

## VS-4 A scroll inside a modal chains to the page behind it

- **Pattern**: a modal, drawer, or menu with an inner scrolling area
  (`overflow: auto`), while the page behind it can still scroll.
- **Mechanism**: when an inner scroll area reaches its end, the scroll
  gesture passes to the parent scroll area by default. The property
  `overscroll-behavior: contain` stops this chain. Support starts at
  Chrome 63 and Firefox 59, but only Safari 16.0 and later. WebKit's
  handling at the very top or bottom of the root scroll area, and during an
  elastic overscroll, has stayed inconsistent even so. Treat it as an
  enhancement, not a guarantee.
- **Affected**: Safari 15 and earlier ignore this property completely. iOS
  Safari stays inconsistent at the elastic edges, even on version 16 and
  later. Chrome and Firefox honour it.
- **Symptom**: scrolling a cookie panel also moves the whole page underneath
  it. The page loses its scroll position after a drawer closes.
- **Detect**: as a static check, any overlay with an inner scroll area, and
  no script-based scroll lock, is likely to leak on iOS. As a dynamic
  check, on a real device, scroll the inner list past its end, and watch
  `window.scrollY`. Any change is the fault.
- **Instead**: lock the page's scroll position with script while the
  overlay is open. Fix the position of the `body` element, or set
  `overflow: hidden` on `html`. Restore the scroll position after. Add
  `overscroll-behavior: contain` as a low-cost extra layer.
- **Confidence**: KNOWN. See
  [caniuse](https://caniuse.com/css-overscroll-behavior) for the Safari
  16.0 floor, and WebKit's Safari 16.0 release notes. FIELD for the
  remaining iOS edge cases. Verified 2026-08.

## VS-5 A scroll-driven CSS animation depends on the support floor and where it runs

- **Pattern**: a stylesheet uses `animation-timeline: scroll()` or
  `animation-timeline: view()`, with `animation-range`. Authors use this
  for a parallax effect, a progress bar, or a reveal-on-scroll effect.
  Articles increasingly copy this pattern and call it a script-free
  alternative to a scroll library.
- **Mechanism**: the engine reads the animation's progress from the scroll
  position. Chrome supports it from version 115. Safari shipped support in
  version 26.0, in September 2025. Safari only moved these animations off
  the main thread in version 26.4.

  So Safari 26.0 to 26.3 runs them on the main thread. There, they can lag
  on a page under load, the same way a script-based scroll handler can
  (see VS-6). Chrome runs the same animations on the compositor.

  Firefox has this feature behind a flag, or does not support it yet;
  check the current state at each audit. An engine without support shows
  no animation at all. The element stays in whatever state it has, with
  no keyframe applied.
- **Affected**: no effect at all in Safari 25 and earlier, and in stable
  Firefox (check the current state at each audit). Correct, but slower, in
  Safari 26.0 to 26.3. Smooth, on the compositor, in Chrome 115 and later,
  and Safari 26.4 and later.
- **Symptom**: a reveal effect never happens on an older Mac, that is, an
  older Safari. If the resting state is set to `opacity: 0`, the content
  then stays invisible, which is a serious fault on its own. A parallax
  effect stutters in Safari, but not in Chrome, on versions 26.0 to 26.3.
- **Detect**: run `CSS.supports('animation-timeline: scroll()')` in each
  engine in your support matrix. Then check that the content fails open.
  Remove the animation, or the feature query around it, and confirm that
  every element rests in its complete, visible state. Any scroll-driven
  animation whose starting frame hides content is a high-priority finding,
  independent of engine support.
- **Instead**: author the resting state as the finished, visible state.
  Animate away from it only inside a feature query for
  `animation-timeline: scroll()`. Or use a script-based scroll library that
  works everywhere, on the main thread, when your support matrix includes
  an older Safari.
- **Confidence**: KNOWN. See
  [WebKit's post on Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/),
  [Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/),
  and [Safari 26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/).
  Verified 2026-08. This area moves fast. Check it again at each audit.

## VS-6 A script that reads scroll position lags behind the real scroll during a fast fling

- **Pattern**: a script that sets `transform` on every `scroll` event, for
  a parallax effect, a progress indicator, or a header that shows and
  hides. The general shape is
  `addEventListener('scroll', () => el.style.transform = ...)`.
- **Mechanism**: scrolling itself runs on the compositor thread. A `scroll`
  event reaches the main thread lined up with the browser's frame timing.
  So a script that repositions an element in response is always at least
  one frame behind the real scroll position. This shows as a visible swim
  during a fast flick.

  Under iOS Low Power Mode, the frame rate for scripted animation halves
  to 30 frames per second (see MP-1 in `media-and-power.md`). That doubles
  the visible lag. Older WebKit throttled event delivery more strongly
  during a fast fling. Current WKWebView delivers events throughout the
  fling, but never in perfect step with the composited scroll.
- **Affected**: every engine has this one-frame gap. iOS shows it most,
  from fast flicks combined with Low Power Mode. Chrome's own
  compositor-driven scroll effects, such as a CSS scroll timeline or
  `position: sticky`, do not show this lag, which is the tell.
- **Symptom**: parallax layers wobble when the user flicks the page fast on
  a phone. A header that shows or hides on scroll fires late.
- **Detect**: on a real device, log the timestamps of `scroll` events
  against the browser's frame timestamps, during a hard fling. A gap of
  more than one frame confirms the fault. As a static check, find any
  per-event style write. Ask whether its effect could instead use
  `position: sticky`, a CSS scroll timeline, or a scroll library's own
  scrub feature. Any of these at least keeps the lag in one place.
- **Instead**: use `position: sticky` for pinning an element. Use a CSS
  scroll-driven animation where your support matrix allows it (see VS-5).
  Where a script-based effect must stay, smooth its motion with an eased
  follow, instead of a direct copy. Never change layout properties from a
  raw scroll event.
- **Confidence**: KNOWN for the threading model (compositor-driven
  scrolling, with frame-aligned event delivery, documented by engine
  teams). FIELD for the exact iOS fling behaviour. Verified 2026-08.

## VS-7 `overflow: hidden` on an ancestor silently turns off `position: sticky`

- **Pattern**: a sticky sidebar or heading inside a section given
  `overflow: hidden`. This is often added months earlier, to stop an
  animation or a `100vw` element from overflowing, for a reason unrelated
  to the sticky element.
- **Mechanism**: a sticky element constrains itself to its nearest ancestor
  that is a scroll container. Any `overflow` value other than `visible` or
  `clip` makes an ancestor a scroll container, even if it never shows a
  scroll bar. The sticky element then sticks inside a box that does not
  itself scroll, so it appears to do nothing. The value `overflow: clip`
  clips content without creating a scroll container, which is the reason it
  exists.
- **Affected**: every engine, in the same way, since this is a
  specification rule. This fault often ships unnoticed because the
  `overflow: hidden` guard is usually added to fix a problem on a mobile
  width. The sticky break can then go unseen on a wider, desktop view.
- **Symptom**: a sidebar just scrolls away. Sticky positioning appears to
  not work at all.
- **Detect**: this is a static, scriptable check. For each
  `position: sticky` element, walk its ancestors. Any computed `overflow`,
  `overflow-x`, or `overflow-y` value of `hidden`, `auto`, or `scroll`,
  placed between the sticky element and its intended scroll area, is the
  fault.
- **Instead**: use `overflow: clip` (supported everywhere since 2022) on a
  section added only to stop content from overflowing. Or move the guard to
  a wrapper that does not contain the sticky element.
- **Confidence**: SPEC. See CSS Position 3, and CSS Overflow 3 for `clip`.
  Verified 2026-08.

## VS-8 Scroll anchoring exists in Chrome and Firefox, but not yet in a shipped Safari

- **Pattern**: content above the reading position that changes height after
  the page loads. Examples: an image with no reserved size, a script that
  inserts elements, a font that swaps in, or a section that expands once
  its content loads.
- **Mechanism**: scroll anchoring adjusts the scroll position when content
  above the visible area grows, so the reader does not lose their place.
  Chrome has supported it from version 56, and Firefox from version 66.
  WebKit only added it in a Safari 27 beta, in 2026. Every shipping Safari
  version up to 26.x lacks it. So the same page, loading late content,
  reads fine in Chrome but jumps in Safari. Checking only in Chrome cannot
  find this class of fault for that reason.
- **Affected**: every current, shipped Safari version, on macOS and iOS.
  Chrome and Firefox hide the underlying layout shift from the reader, but
  it still counts against a layout-shift score.
- **Symptom**: an article keeps jumping while a reader reads it on an
  iPhone.
- **Detect**: do not test for the symptom. Test for the cause instead.
  Measure a layout-shift score on a cold, throttled page load. Any layout
  shift that comes from above the visible area is the fault, in every
  engine. As a static check, review every image and every embedded element
  for a set width and height, or an `aspect-ratio` value.
- **Instead**: reserve space for everything that loads later. Set a width
  and height on every image. Most page builders add this for an inline
  image, but not for a background image or some embedded content. Never
  insert content above the fold after the page has loaded.
- **Confidence**: KNOWN. See
  [WebKit's Safari 27 beta post](https://webkit.org/blog/17967/news-from-wwdc26-webkit-in-safari-27-beta/)
  and [bug 171099](https://bugs.webkit.org/show_bug.cgi?id=171099). Verified
  2026-08. This entry shrinks to a legacy-Safari note once version 27 ships
  and your support matrix moves past it.

## VS-9 A site-wide smooth-scroll library replaces the browser's own scroll behaviour

- **Pattern**: a site-wide smooth-scroll library, in the style of Lenis. It
  translates a full-page wrapper in response to wheel and touch input,
  instead of letting the browser scroll it.
- **Mechanism**: the content no longer scrolls inside a real scroll
  container. Script moves it with a `transform` instead. Every behaviour the
  engine ties to a real scroll position then loses accuracy. `position:
  sticky` and `position: fixed` elements, inside the wrapper, follow one
  frame late, or stop working. A CSS scroll timeline (see VS-5), and scroll
  anchoring, cannot see the simulated scroll.

  Browser search, and keyboard paging (Space, Page Down, Home), act on the
  real, unmoving scroll area. Assistive technology may scroll the wrong
  element. Touch input is often left native, so the library behaves
  differently on a phone than it does on a desktop computer, by design.
- **Affected**: every engine, for desktop input. iOS is often exempted from
  the effect, which is itself a source of inconsistency between devices.
- **Symptom**: a sticky element jitters. The Space bar does not scroll the
  page. A browser search jumps to the wrong place on the page. The page
  feels different on a phone than on a computer.
- **Detect**: check whether a persistent `transform` sits on a full-page
  wrapper. If so, check three more things. Does Page Down still scroll the
  page? Does a sticky element hold a stable pixel position across 10
  recorded frames of a wheel scroll? Does `prefers-reduced-motion` turn the
  smoothing off?
- **Instead**: native scrolling, combined with compositor-driven effects,
  covers most needs. If a smooth-scroll library is genuinely required, keep
  every fixed or sticky element outside the transformed wrapper. Wire up
  keyboard input by hand. Turn the effect off under
  `prefers-reduced-motion`.
- **Confidence**: KNOWN for the mechanism (a transform-based scroll cannot
  take part in the engine's own scroll machinery). FIELD for the specific
  side effects. Verified 2026-08.
