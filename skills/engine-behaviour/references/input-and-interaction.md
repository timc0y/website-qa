# Input and interaction

7 entries. This file covers how a touch, a pointer, and a mouse event differ,
and where a capability query is wrong. See `../SKILL.md` for how each entry
is built, the confidence labels (SPEC, KNOWN, FIELD), and the staleness
convention.

Baseline engine versions at the last check: Safari 26.x, Chrome about 139,
Firefox about 142. Re-verify KNOWN and FIELD entries at each major Safari
release.

---

## II-1 A hover-revealed action needs two taps, and it sticks on a touch screen

- **Pattern**: a dropdown menu, a card overlay, or a call to action revealed
  by a `:hover` rule. The trap applies whether the revealed content, or the
  element that triggers it, is a link.
- **Mechanism**: on a tap, a touch browser builds the same event sequence a
  mouse would send: `mouseover`, then `mousedown`, then `mouseup`, then
  `click`. It applies the `:hover` state to the target as part of this. If
  the first tap's `mouseover` reveals new content, iOS Safari holds back the
  `click` on purpose, so the user can see what appeared. The first tap
  reveals the content. The second tap acts on it. The `:hover` state then
  stays active until the user taps somewhere else, which leaves an open
  menu, or a highlight, stuck on screen.
- **Affected**: iOS Safari most strictly, because of this content-change
  rule. Chrome on Android builds a similar, sticky hover state. A desktop
  computer is not affected. A touch-screen laptop can show both behaviours,
  depending on the input used.
- **Symptom**: a menu needs two taps on a phone. A card stays highlighted
  after the user taps it. A hover overlay blocks the link underneath it.
- **Detect**: as a static check, list every `:hover` rule, or every
  hover-based reveal effect, that changes visibility or covers an
  actionable element. Check that each one sits inside a
  `@media (hover: hover)` rule. As a dynamic check, tap each one once on a
  touch device, and count the taps needed to move to the next page. More
  than one tap is the fault.
- **Instead**: place every hover-based reveal style inside
  `@media (hover: hover) and (pointer: fine)`. On a touch screen, make the
  first tap the action itself. Show any secondary content another way,
  either always visible, or behind a clear toggle.
- **Confidence**: KNOWN. This is a documented Safari behaviour; see also
  MDN's page on the `hover` media feature. Verified 2026-08.

## II-2 A capability query can misread a tablet, and a tablet can misread itself

- **Pattern**: behaviour switched by `@media (hover: hover)` or
  `(pointer: fine)`. Worse, the switch is sometimes made by reading the
  browser's user-agent string, to decide whether the device is a phone, a
  tablet, or a desktop computer.
- **Mechanism**: `hover` and `pointer` describe the primary input method.
  `any-hover` and `any-pointer` describe any input method that is attached.
  An iPad reports `hover: none` and `pointer: coarse`, since touch is its
  primary input. This stays true even with a trackpad attached, since the
  trackpad only appears through `any-pointer: fine`.

  Separately, an iPad's Safari browser asks for the desktop version of a
  site by default. It sends a macOS-style user-agent string. So a check
  that reads the
  user-agent string sends an iPad down a desktop code path, which then
  receives touch input. A touch-screen Windows laptop is the mirror case:
  `hover: hover` and `pointer: fine` as its primary input, plus
  `any-pointer: coarse` for its touch screen.
- **Affected**: an iPad, in both of the ways above. A touch-screen laptop.
  An Android device with a mouse attached.
- **Symptom**: a hover menu does not open at all on an iPad. An iPad
  receives a desktop navigation menu that needs a hover state. A drag
  control is missing on a touch-screen laptop.
- **Detect**: run the full interaction check on an iPad's own Safari
  browser, not on an iPhone simulation. Also run it on one touch-screen
  laptop. As a static check, any use of the user-agent string is a finding
  on sight. Any interaction reachable only through a hover state is a
  finding under II-1.
- **Instead**: decide behaviour for each interaction on its own, using a
  capability query. Always provide a path that does not need a hover
  state. Never branch behaviour on the user-agent string.
- **Confidence**: KNOWN. See MDN's pages on the `hover` and `any-pointer`
  media features. Apple has publicly documented an iPad's desktop-style
  browsing since it was introduced. Verified 2026-08.

## II-3 Pointer, touch, and mouse events fire in one sequence, so listening to two of them runs code twice

- **Pattern**: a script that binds both `touchstart` (or `pointerdown`) and
  `click` to the same control. A slider that listens for `mousedown` to
  start a drag, and `click` to move to the next item.
- **Mechanism**: one tap fires a full chain of events: `pointerdown`, then
  `pointerup`, then the compatibility events `mouseover`, `mousedown`,
  `mouseup`, and finally `click`. A script bound to two points in this
  chain runs twice. Calling `preventDefault()` inside a `touchstart` or
  `touchend` handler cancels the compatibility mouse events and the `click`
  event. Calling `preventDefault()` inside a pointer event handler does not
  cancel `click`. Pointer events are supported everywhere in current use,
  from Safari 13 onward. Binding to both the old touch events and the mouse
  events at once is no longer needed, and it only adds risk.
- **Affected**: every touch device. A desktop computer is not affected,
  since only one path in the chain fires there, which is why this fault
  often ships unnoticed.
- **Symptom**: one tap skips two slides. An accordion opens, then closes at
  once. A form submits twice from one tap.
- **Detect**: as a static check, search scripts for the same element bound
  to both a touch or pointer event, and a mouse or click event. As a
  dynamic check, add a counter inside each handler, tap once on a touch
  device, and check that the counter reads exactly one.
- **Instead**: pick one input model. Use pointer events only, and read
  `event.pointerType` where behaviour must differ by input. Let `click` be
  the only event that starts an action from a tap.
- **Confidence**: SPEC. See the Pointer Events specification's section on
  compatibility with older mouse events,
  [w3.org](https://www.w3.org/TR/pointerevents/). Verified 2026-08.

## II-4 A non-passive touch or wheel listener delays scrolling; `touch-action` sets the rule up front

- **Pattern**: a slider or drag control that adds a `touchmove` or `wheel`
  listener without `{ passive: true }`. Or one that calls
  `preventDefault()` to stop the page from scrolling during a drag, without
  also setting `touch-action` on the surface.
- **Mechanism**: the compositor can start a scroll at once, unless a
  non-passive listener might call `preventDefault()`. In that case, every
  scroll must wait for the main thread to run the listener's code first,
  which causes a delay on the first touch.

  Chrome changed its default years ago. A `touchstart` or `touchmove`
  listener, attached to the window, document, or body element, is passive
  by default there. Calling `preventDefault()` in that listener is
  silently ignored, apart from a message in the developer console. A drag
  handler that works when
  attached to one element can then stop working, when the same code is
  attached higher up the page. The property `touch-action: pan-y` (and
  similar values) tells the compositor in advance which gestures a script
  owns, so no such wait is needed at all.
- **Affected**: Chrome and other Chromium browsers most, since this
  default is Chrome's own change. Safari kept a non-passive default on
  individual elements, but pays a similar cost while it waits for the
  script to run. Every touch device pays some cost from this delay.
- **Symptom**: the page pauses briefly when a user starts to scroll over a
  slider. Dragging a slider also scrolls the page, or the opposite: the
  page will not scroll at all over the control.
- **Detect**: a browser's developer console shows a warning for a
  non-passive event listener, when it runs. As a static check, every
  gesture surface must declare a `touch-action` value. Any
  `preventDefault()` call, inside a listener that is not explicitly set to
  `{ passive: false }` on that one element, is a fault.
- **Instead**: state your intent in the stylesheet with `touch-action` (for
  example, `pan-y` on a horizontal slider), and keep listeners passive.
  Reserve a non-passive, element-level listener for the one surface that
  truly owns the gesture.
- **Confidence**: KNOWN. See Chrome's own documentation on its
  passive-by-default change, and
  [MDN's page on `touch-action`](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action).
  Verified 2026-08.

## II-5 The delay before a tap's `click` event returns if the viewport meta tag is missing or wrong

- **Pattern**: most page builders emit a safe viewport meta tag by default
  (`width=device-width, initial-scale=1`). The risk sits in a hand-built
  page, or in anyone editing that meta tag to try to fix pinch-to-zoom.
- **Mechanism**: engines used to wait about 300 to 350 milliseconds after a
  `touchend` event, to rule out a double-tap zoom, before firing `click`.
  Chrome (from version 32) and iOS Safari (from version 9.3) skip that
  delay when the viewport is set to `width=device-width`. The property
  `touch-action: manipulation` also removes the delay on one element,
  regardless of the meta tag. Remove or change that meta tag, and the delay
  comes back.
- **Affected**: any touch browser on a page without a device-width
  viewport. Every other page is unaffected.
- **Symptom**: buttons feel slow to respond on a phone. A tap registers
  noticeably late.
- **Detect**: confirm the viewport meta tag is present and correct on every
  page, including a standalone or a utility page. Measure the time between
  `touchend` and `click`. A gap above about 100 milliseconds is the fault.
- **Instead**: keep the default viewport meta tag. Add
  `touch-action: manipulation` to controls on any standalone page that
  cannot rely on the meta tag.
- **Confidence**: KNOWN. See Chrome's and WebKit's release notes from the
  time, and MDN's page on `touch-action: manipulation`. Verified 2026-08.

## II-6 Tab order differs by engine: Safari skips links by default, and an embedded frame varies

- **Pattern**: keyboard checks done only in Chrome. A navigation menu built
  from styled links. A third-party embedded frame, such as a bot check or a
  video player, placed inside a form or a page.
- **Mechanism**: macOS Safari, by default, puts only form controls in the
  Tab key's order, not links. Reaching a link needs the user to hold
  Option while pressing Tab. Or the user must turn on the system setting
  "Press Tab to highlight each item on a webpage." This follows the same
  convention as macOS's Full Keyboard Access setting. Firefox on macOS
  follows a similar system setting. So a keyboard check done only in
  Chrome proves nothing about the default experience in Safari.

  An embedded frame adds its own difference. Engines vary on whether the
  frame itself takes a tab stop, and on how focus enters and leaves the
  document inside it. A bot-check widget can trap keyboard focus in one
  engine, and stay invisible to the Tab key in another.
- **Affected**: macOS Safari, at its default settings, and macOS Firefox,
  in part. Every engine varies in how focus moves in and out of an
  embedded frame.
- **Symptom**: a menu cannot be reached with the keyboard in Safari.
  Keyboard focus disappears into an embedded widget, and never comes back.
- **Detect**: run the keyboard check twice in Safari: once at its default
  settings, and once with the Tab setting turned on. Explicitly tab into
  and out of every embedded frame. As a static check, any custom control
  built from a plain element with `tabindex` needs a check in Safari
  specifically. A pass in Chrome alone is not evidence.
- **Instead**: use a native link or button element, since each behaves
  correctly on its own platform. Use a visible focus style that works
  under both Safari settings. Keep a critical action outside a third-party
  embedded frame, where you can.
- **Confidence**: KNOWN. Documented in Apple's own Safari help pages, and
  widely reproduced. Verified 2026-08.

## II-7 A swipe distance or speed threshold drifts across screen refresh rates and power states

- **Pattern**: a slider or swipe script with a fixed pixel threshold, such
  as "move the slide if dragged 50 pixels." Or a speed estimate based on
  counting events, such as "look at the last two events and find the
  change between them." Either kind is often tuned on one desktop browser
  only.
- **Mechanism**: the rate at which input events arrive is not fixed. A
  120-hertz screen, used on many current iPhones and iPads, reports pointer
  movement at up to twice the rate of a 60-hertz screen. iOS Low Power Mode
  also halves the frame rate for scripted work (see MP-1 in
  `media-and-power.md`). So a "distance per event" or an "events per
  second" estimate of speed can change by 2 to 4 times across devices. This
  happens for the exact same physical gesture.

  Chrome groups pointer movement events to match its own frame timing. It
  exposes the full, ungrouped stream through `getCoalescedEvents()`.
  Reading only the grouped events under-measures a fast flick. A fixed
  pixel threshold also ignores the width of the screen. The same 50
  pixels is a third of a slide's width on a phone, and a twentieth of it
  on a desktop computer.
- **Affected**: every touch device, in a different way, which is the fault
  itself. A 120-hertz iPhone and a 60-hertz Android phone drift furthest
  apart. Low Power Mode changes a single device's own behaviour.
- **Symptom**: a light flick skips two slides on an iPhone, but barely
  moves the slider on another phone. A drag feels unresponsive in a
  low-power state.
- **Detect**: compute speed as the change in position divided by the change
  in time, over a short rolling window, never from a fixed number of
  events. Log the computed release speed for the same physical flick, on a
  60-hertz and a 120-hertz device. A difference above about 20% means the
  speed estimate depends on the screen's refresh rate, which is the fault.
  As a static check, any threshold written as a fixed number of pixels, or
  a fixed number of events, is the fault.
- **Instead**: write a threshold as a fraction of the container's width.
  Add a time-based speed value too, in pixels per millisecond, with a
  sensible limit on its top end.
- **Confidence**: SPEC for time-based speed being independent of the frame
  rate. KNOWN for Chrome's event grouping; see the Pointer Events
  specification and Chrome's own developer documentation. FIELD for the
  exact size of the drift across devices. Verified 2026-08.
