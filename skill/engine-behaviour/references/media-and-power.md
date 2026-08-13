# Media and power

8 entries. This file covers what a low-power or a reduced-data state
throttles, blocks, or hides. See `../SKILL.md` for how each entry is built,
for the confidence labels (SPEC, KNOWN, FIELD), and for the staleness
convention. `../SKILL.md` also gives the iOS Low Power Mode measurement
method. It notes that a script can switch on Android's battery saver, but
not iOS Low Power Mode.

Baseline engine versions at the last check: Safari 26.x, Chrome about 139,
Firefox about 142. Re-verify KNOWN and FIELD entries at each major Safari
release.

---

## MP-1 iOS Low Power Mode cuts scripted animation to 30 frames per second

- **Pattern**: any animation driven by script, such as an animation
  library, a smooth-scroll library, a loop that calls
  `requestAnimationFrame`, or a canvas or 3D effect. The same applies to a
  scroll-driven animation of the same kind.
- **Mechanism**: WebKit deliberately halves the rate of
  `requestAnimationFrame` calls, to 30 frames per second, while iOS Low
  Power Mode is on. This was implemented in 2017, and is still current, as
  a later bug report confirmed again. The same limit applies to
  `requestAnimationFrame` inside a cross-origin embedded frame the user has
  not interacted with. A CSS animation or transition, that the compositor
  runs on its own, keeps far more of its smoothness.

  This is the design choice at the heart of this entry. Motion the
  compositor owns stays mostly smooth. Motion a script owns visibly halves
  in rate. An iPhone or iPad with a 120-hertz screen also drops to 60
  hertz, for the whole system, while Low Power Mode is on.
- **Affected**: every browser on iOS, since every iOS browser uses WebKit.
  macOS Safari has an equivalent limit, under macOS's own Low Power Mode.
  Android's battery saver does not cut a foreground animation's frame rate
  the same way (see MP-8). No simulator or emulator reproduces this limit.
- **Symptom**: animation turns choppy when the battery is low. It looks
  smooth on a reviewer's charged phone, and janky at a client's evening
  demo.
- **Detect**: on a real iPhone, with Low Power Mode on, log the time
  between frames. A steady value near 33 milliseconds confirms the limit.
  Without a device, review every script-driven effect. Check that it still
  looks acceptable at 30 frames per second. Build a fallback too: if a
  rolling median of the time between frames goes above about 25
  milliseconds, reduce or stop any purely decorative motion. This same
  fallback also helps on a slow Android device.
- **Instead**: put any continuous, decorative motion into a CSS animation
  that the compositor runs. Drive a one-time motion with a CSS transition.
  Keep script-driven animation for a response to direct interaction, where
  30 frames per second is an acceptable result. Ship the fallback above.
- **Confidence**: KNOWN. See
  [WebKit bug 168837](https://bugs.webkit.org/show_bug.cgi?id=168837),
  and [WebKit bug 215745](https://bugs.webkit.org/show_bug.cgi?id=215745).
  Verified 2026-08.

## MP-2 iOS Low Power Mode blocks an autoplaying video and forces its own play control

- **Pattern**: a muted, inline, autoplaying video used as a hero
  background.
- **Mechanism**: while Low Power Mode is on, WebKit refuses to autoplay a
  video, even a muted, inline one. A call to play the video is rejected
  with an error. The system then shows its own large play control, drawn
  through a part of the page a script cannot restyle or remove. Apple has
  closed the report on this as intended behaviour, not a bug to fix. macOS
  Safari shows the same behaviour under macOS's own Low Power Mode, and
  under its own per-site autoplay setting.
- **Affected**: every iOS browser. macOS Safari, under Low Power Mode or
  its autoplay setting. Chrome on desktop and Android still autoplays a
  muted video, independent of a battery saver setting.
- **Symptom**: a homepage video shows only a grey triangle, on an iPhone.
- **Detect**: this is a fully static check, needing no device. Every
  autoplaying video must have `muted` and `playsinline` set. It also needs
  a real poster image (or a styled fallback) that still looks right with
  the system's own play control on top of it. It needs a script that
  catches the play call's rejection, and shows the fallback. Any
  background video with no poster image predicts this fault with no
  device needed.
- **Instead**: design the poster image first, and treat the video as an
  enhancement on top of it. If the play call is rejected, show the poster
  or a static image. Never start a retry loop.
- **Confidence**: KNOWN. See
  [WebKit bug 219889](https://bugs.webkit.org/show_bug.cgi?id=219889),
  closed as intended behaviour. Verified 2026-08.

## MP-3 A background tab slows or bundles its timers, which breaks any effect that counts ticks

- **Pattern**: a carousel, a countdown, or a ticker driven by
  `setInterval`, written on the assumption that the interval fires exactly
  on time.
- **Mechanism**: a hidden browser tab stops `requestAnimationFrame`
  entirely. A timer is slowed to no more than once per second once the tab
  is hidden. Chrome's own intensive throttling then bundles timers to once
  per minute, once the tab has been hidden for 5 minutes. iOS suspends a
  hidden page even more aggressively, and restores it from its
  back-forward cache without running the page's load logic again. Any
  state that a script advances by counting timer events then drifts from
  the real time. A burst of queued work can also fire all at once, when the
  tab becomes visible again.
- **Affected**: every engine, since this kind of throttling is common to
  all of them. iOS adds full suspension, and a restore from its
  back-forward cache with any running timer or scroll position resumed
  mid-way through.
- **Symptom**: the user returns to a tab and finds the slider has moved
  through five slides. A countdown shows the wrong time. An animation's
  state no longer matches its audio or video.
- **Detect**: as a static check, find any visual state that a script
  advances by counting timer events, rather than by computing it from the
  clock. As a dynamic check, hide the tab for 6 minutes, then return to it.
  Compare the shown state with the real, clock-based value. Also navigate
  away, and use the browser's back button on iOS, to exercise its
  back-forward cache.
- **Instead**: compute state from the system clock on each frame. Pause the
  effect when the page becomes hidden. Recompute it again when the page
  becomes visible, or is restored from a cache.
- **Confidence**: KNOWN. See Chrome's own documentation on its intensive
  timer throttling, and WebKit's documented back-forward cache behaviour.
  Verified 2026-08.

## MP-4 `prefers-reduced-motion` is a setting the operating system offers; a build must take it up itself

- **Pattern**: a build with heavy scroll or load animation. It is built
  with an animation library, or a page builder's own interaction system,
  with no branch for reduced motion. Many animation libraries and
  page-builder interaction systems do not honour this setting on their
  own. Where a tool offers a reduced-motion variant, an author must set it
  up on purpose.
- **Mechanism**: several settings surface to a webpage as one media query,
  `(prefers-reduced-motion: reduce)`. These are iOS's "Reduce Motion"
  setting, Android's "Remove animations" setting, and the equivalent
  settings on macOS and Windows. The engine itself changes nothing on its
  own. The media query is an offer that the build must accept.
- **Affected**: every current engine supports this query, from Safari
  10.1, Chrome 74, and Firefox 63. "Affected" here means every user who
  turned the setting on, and still receives full motion, because the build
  never checked for it.
- **Symptom**: a user sensitive to motion reports feeling unwell. An
  accessibility check fails. A stated accessibility commitment does not
  match what the build actually does.
- **Detect**: emulate `prefers-reduced-motion: reduce` in a browser's
  developer tools, and step through every page. Any parallax effect, any
  auto-playing marquee, or any large-travel scroll animation still running
  is the fault. As a static check, look for zero mentions of
  `prefers-reduced-motion` in an animation-heavy script or stylesheet, or
  of an equivalent guard built into an animation library. That absence is
  a high-priority finding, found with no page load needed.
- **Instead**: gate every non-essential motion effect behind
  `@media (prefers-reduced-motion: no-preference)`, or the equivalent
  guard your animation library provides. The resting state of the design
  must be the complete, correct, static design.
- **Confidence**: SPEC for the media query itself (Media Queries 5). KNOWN
  for the operating-system mapping; see
  [MDN's page on `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
  Verified 2026-08.

## MP-5 `prefers-reduced-transparency` and a frosted glass style with no solid fallback

- **Pattern**: a frosted-glass header or card, using `backdrop-filter` or a
  low-opacity background over an image, with no solid alternative.
- **Mechanism**: the macOS and iOS "Reduce Transparency" setting surfaces
  as `@media (prefers-reduced-transparency: reduce)`. Support started in
  Chrome 118. Safari added support later than its own operating-system
  setting; check the current support table at each audit. Firefox has this
  behind a flag. A user turns this setting on precisely because a
  low-contrast glass style is hard for them to read. As with MP-4, the
  engine changes nothing on its own.
- **Affected**: a user with the setting on, in an engine that supports the
  query. Where an engine does not support the query, the build has no way
  to know, which is a reason to choose a readable default regardless.
- **Symptom**: a user cannot read a menu placed over a photo. A contrast
  check misses the fault, because most contrast tools do not render the
  moving image behind the glass style first.
- **Detect**: emulate the query in a browser's rendering panel. Measure the
  worst-case contrast of text over the live, moving content behind it.
  Scroll to the busiest part of the image under the header, then sample
  the colours. A contrast ratio under 4.5 to 1, at any scroll position, is
  the fault, independent of the media query.
- **Instead**: add a solid, or at least 90% opaque, version of the style
  under the query. Add a darkening layer behind the text too, so the
  worst-case contrast still passes, regardless of the setting.
- **Confidence**: KNOWN. See MDN's page on this feature; the support floor
  moves, so check it again at each audit. Verified 2026-08, with the
  instruction to re-check Safari's support level specifically.

## MP-6 `Save-Data` is a readable signal; iOS Low Data Mode is not

- **Pattern**: a multi-megabyte hero video or a set of large images, sent
  to every visitor with no check on their connection.
- **Mechanism**: Chrome on Android exposes the user's Data Saver setting.
  It sends the `Save-Data: on` request header, and it sets
  `navigator.connection.saveData` in script; this is a Chromium-only
  feature. iOS Low Data Mode is enforced by the network layer instead.
  Safari gives no signal at all to script, or to the request headers; iOS
  itself reduces prefetching and background transfers on its own. So a
  build can read Android's signal. For iOS, the only way to serve a user
  well is to be light by default.
- **Affected**: a Chromium browser exposes the signal. WebKit and Firefox
  do not.
- **Symptom**: a user reports the site used a large amount of their mobile
  data. A first paint is slow on a capped connection.
- **Detect**: check whether a video's preload setting, or a marquee's
  assets, read the `saveData` signal where it is present. Weigh the page
  against the target size in the brief too. Flag any page that transfers
  more than about 2 megabytes above the fold, regardless of any signal. An
  iOS user has no way to tell the build about their own setting.
- **Instead**: set `preload="none"` with a poster image on a video. Use a
  responsive image set. Load anything below the fold only when needed.
  Treat a `saveData` value of true the same way as a request for less
  data: skip the video, and serve a smaller image.
- **Confidence**: KNOWN. See
  [MDN's page on the `Save-Data` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Save-Data),
  which lists Chromium-only support. Verified 2026-08.

## MP-7 On a low-end Android device, the graphics processor's fill rate and the renderer's memory are the limit

- **Pattern**: many layers composited at once, a full-screen blur (see LP-8
  in `layout-and-paint.md`), a high-resolution background video, or a
  large box shadow repainted during an animation. All of these run fine on
  a development computer.
- **Mechanism**: a budget graphics processor is limited by how many pixels
  it can draw per frame. Every composited layer draws again each frame, so
  stacked, full-screen layers multiply this cost. A blur also runs in
  several passes per frame. A device with 2 to 3 gigabytes of memory runs
  a browser's rendering process close to its limit. Go past that limit,
  and Android ends the process instead. A user sees this as the tab
  silently reloading, with any typed form content and scroll position
  lost.
- **Affected**: a low-end or mid-range Android device most. The same page
  can run fine on an iPhone from the same year, since Apple's own graphics
  processors are well ahead of a similarly priced Android device.
- **Symptom**: scrolling feels slow on a phone that a review never
  included. A tab reloads in the middle of filling in a form. The device
  feels warm.
- **Detect**: as an approximate, pre-launch check, use 4x to 6x CPU
  throttling in a browser's developer tools. Add a sum of the estimated
  layer memory too (see the thresholds in LP-7). A real confirmation needs
  a representative device (see "What a physical device alone can
  establish" in `../SKILL.md`). Keep the total composited area under
  about 4 times the viewport. Keep no more than 2 areas with
  `backdrop-filter` on screen at once.
- **Instead**: use the alternatives from LP-7 and LP-8. Limit a background
  video to 1080p. Test on the cheapest device your audience plausibly
  owns, not the newest one available.
- **Confidence**: FIELD. The exact thresholds come from repeated
  observation. The process-ending behaviour itself is KNOWN Chrome
  behaviour, though the exact memory limit is not published. Verified
  2026-08.

## MP-8 Android's battery saver is not the same as iOS Low Power Mode; do not assume the same fallback covers both

- **Pattern**: a fallback written for iOS Low Power Mode (see MP-1),
  assumed to also apply under Android's battery saver, or the other way
  around.
- **Mechanism**: Android's battery saver dims the screen. On some device
  makers' software, it also caps the screen's refresh rate, from 120 hertz
  to 60 hertz, and it delays background work. Chromium's own documentation
  states no foreground frame-rate limit equal to WebKit's 30-frame limit.
  What is mapped instead is this: Android's own "Remove animations"
  accessibility setting surfaces to Chrome as
  `prefers-reduced-motion: reduce` (see MP-4). So on Android, the setting a
  build can rely on is reduced motion, plus a measured frame time, not a
  battery-level check. A battery status feature exists in Chromium, but it
  reports the charge level, not the saver setting's effect on rendering.
- **Affected**: Android and other Chromium browsers. This entry exists to
  stop a false assumption that Android and iOS behave the same way.
- **Symptom**: none directly. The fault is a fallback path that never runs
  on one platform, or runs for the wrong reason.
- **Detect**: a fallback must switch on a measured time between frames,
  and on `prefers-reduced-motion`. It must never switch on which platform
  the browser reports, and never on the battery's charge level. Any script
  that reads `navigator.getBattery` to make a rendering decision is the
  fault.
- **Instead**: build one fallback path, based on capability and
  measurement. Use the rolling median from MP-1. Serve both platforms
  without checking which one the page is running on.
- **Confidence**: KNOWN for the reduced-motion mapping; see
  [MDN's page on `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  and Android's "Remove animations" setting from Android 9. FIELD for the
  screen-refresh capping on some device makers' software. The absence of a
  Chromium frame-rate limit under battery saver is stated from the absence
  of documentation for one. Treat it as FIELD, and check it again at each
  audit. Verified 2026-08.
