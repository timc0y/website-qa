---
name: engine-behaviour
description: >-
  Explains how a rendering engine, a device, or a power state changes what a
  website's own code does. It names what the engine recomputes, throttles, or
  refuses to run. Use it for a symptom on one engine, device, or power state.
  Examples: a stutter, a snap, a stuck hover, a zoomed page, or a missing
  autoplay video. You need the cause, plus a safer way to build the same
  result. It is a reference library, not a procedure. It carries no platform
  prefix, because its mechanisms are true of any website, on any stack.
---

# Engine behaviour

## Purpose

You have a symptom on one engine, one device, or one power state. You need
the cause, and you need a safer way to build the same result. This skill is a
reference library of 39 such causes. It answers a lookup, not a script that
runs from step one to the last step.

Use it in two directions:

- **Forward.** You see an authoring pattern, such as a script that
  transitions `height`, or a `100vh` hero section. Find its entry, and predict
  the fault before any device shows it to you.
- **Backward.** A test, or a real visitor, shows you a symptom, such as a
  choppy animation, or a stuck hover state. Search the symptom text in each
  reference file, and find the mechanism that causes it.

Read one entry, or read one reference file. Do not read this whole skill in
order before every task.

## Boundary

`website-qa` observes a symptom on a live website. This skill explains why an
engine produces that symptom, and predicts it from the code before a website
even exists. It runs no check of its own, and it owns no tool. Every
detection method inside it uses a browser's own developer tools, a script run
in the browser, or a text search of the source code.

This skill never names, requires, or assumes access to a private tool of any
kind. Everything in it works for a person who has only a URL, or only a
source file, and no other access.

## How each entry is built

Every entry carries eight parts:

- **Pattern.** The exact authoring choice that starts the fault.
- **Mechanism.** What the engine recomputes, throttles, or refuses to run,
  in its own terms.
- **Affected.** Which engines and which devices show the fault.
- **Symptom.** The fault in the words a visitor or a reviewer would use.
- **Detect.** A specific measurement, plus the value that confirms the
  fault, checked before you ship.
- **Instead.** A safer way to build the same result.
- **Confidence.** One of the three labels below.
- **Verified.** A date, and the engine versions checked at that date.

Confidence labels:

- **SPEC**: a specification guarantees this behaviour. It cannot change
  without the specification changing.
- **KNOWN**: documented engine behaviour, or a tracked bug, with a citation.
- **FIELD**: reliably observed, including in real audits, but not formally
  documented anywhere. Check a FIELD entry again on a real device at each
  use.

## Staleness

Every entry carries a `Verified: YYYY-MM` date, and the engine versions
checked at that date. Re-check a KNOWN or a FIELD entry at each major Safari
release. Safari ships a yearly release, plus an update roughly every 6 to 8
weeks, and this area moves faster than any other. A SPEC entry needs a
re-check only when the specification itself changes.

An entry with a `Verified` date older than 12 months may still be used. State
it as a historic fact, such as "as of Safari 26", rather than as a current
one. Treat an entry older than 24 months as retired, and leave it out of a
report.

## The one-hour check: highest-yield checks, in order

Run these seven checks in about an hour, at roughly 8 minutes each, before
you reach for a device at all. Every check but the last needs only a browser
and its developer tools, or a text search of the source code.

1. **Fixed and sticky ancestor walk** (LP-9, VS-7 in `layout-and-paint.md`
   and `viewport-and-scrolling.md`). For every `position: fixed` or
   `position: sticky` element, check every ancestor for a `transform`,
   `filter`, `will-change`, `perspective`, or `contain` value, and for an
   `overflow` value of `hidden`, `auto`, or `scroll`. Both faults come
   straight from a specification, so a match here is a real fault, not a
   guess.
2. **Viewport-unit search** (VS-1, VS-2). Search the source for every
   `100vh` on content that must be fully visible when the page loads, and
   for every `100vw`, anywhere. Two searches, and you cover the iOS toolbar
   fault and the Windows scroll bar fault in one pass.
3. **Layout-animation search** (LP-1, LP-2, LP-3, LP-4). Search scripts and
   stylesheets for a transition on `height`, `width`, `max-height`, or a
   grid track. Anything found needs a written reason, and a measurement
   against the real content size.
4. **Script off, then reduced motion on** (MP-4, VS-5). Load each key page
   with all script turned off. Any content that becomes invisible is a
   high-priority finding. Then turn on `prefers-reduced-motion: reduce` in
   your browser's developer tools, and check that no decorative motion
   still runs.
5. **Autoplaying-video check** (MP-2, MP-6). For every autoplaying video,
   check for `muted` and `playsinline`, a real poster image, a caught
   rejection on the play call, and a sensible `preload` setting. This
   predicts the iOS Low Power Mode fault with no device needed.
6. **Form field check** (FN-1, FN-4, FN-5). Check that every input's
   computed font size is 16 pixels or larger, at the real root font size, at
   every screen width. Check the `type`, `inputmode`, and `autocomplete`
   value for each field's content. Check for a stray `maximum-scale` value,
   or a stray `novalidate` attribute.
7. **Hover-gating check** (II-1, II-2). Find every hover-revealed,
   actionable element, and confirm it sits behind
   `@media (hover: hover)`.

## What a physical device alone can establish

State each of the items below as untested in any report built without the
matching hardware. A simulator or an emulator is not evidence for these,
because none of them run on real battery, real silicon, or a real touch
screen:

- **iOS Low Power Mode**, in full (MP-1, MP-2 in `media-and-power.md`): the
  30-frame limit on scripted animation, and the block on autoplaying video.
  The iOS Simulator has no Low Power Mode switch. macOS's own Low Power Mode
  is a different setting, on different hardware.
- **Elastic overscroll, and the speed of a fast flick** (VS-3, VS-6 in
  `viewport-and-scrolling.md`): a browser's developer tools can simulate a
  scroll, but not its momentum. The elastic motion at the top and bottom of
  the page, and the lag during a fast flick, exist only on real hardware.
- **A 120-hertz screen against a 60-hertz screen** (II-7 in
  `input-and-interaction.md`, and MP-1): the higher event rate of a
  120-hertz screen, and its drop to 60 hertz under Low Power Mode, change
  the maths behind a swipe. No emulator varies its own refresh rate.
- **Real keyboard occlusion** (FN-6 in `forms-and-native-controls.md`): a
  simulator approximates the keyboard's size, but not how the page scrolls
  and settles around it.
- **Graphics memory pressure, and a process ending under real memory
  pressure** (LP-7 in `layout-and-paint.md`, MP-7 in `media-and-power.md`):
  a dropped layer, a white flash, and a silent tab reload need a real,
  low-memory device under real memory pressure.
- **Thermal throttling**: a phone running warm after several minutes of
  scrolling has no equivalent in an emulator.
- **Autofill** (FN-3 in `forms-and-native-controls.md`): needs a browser
  profile with a real saved credential or address. A clean test profile
  never triggers it.
- **A classic Windows scroll bar** (VS-2): needs a real Windows computer, or
  a virtual one, since this is a fact about the operating system, not about
  the processor underneath it.

### Measuring iOS Low Power Mode

Low Power Mode has no supported script-based switch. No tool, public or
private, can turn it on for a test. A person must turn it on by hand, in
Settings, or from Control Center, every time. It is also undetectable from a
page's own script. No media query and no interface reports it. A page can
degrade gracefully under it, but it cannot detect the state and adapt on its
own.

To measure its effect, load this probe on a real iPhone with the setting on,
and read the numbers it prints. Do not judge the effect by eye alone:

```html
<!-- rAF frame-rate probe: prints frames per second, over rolling
     1-second windows -->
<pre id="out"></pre>
<script>
let frames = 0, last = performance.now(), log = [];
function tick(t) {
  frames++;
  if (t - last >= 1000) {
    log.push(Math.round(frames * 1000 / (t - last)));
    frames = 0;
    last = t;
    out.textContent = log.join(' ');
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
</script>
```

Expect close to 58 to 60 frames per second with the setting off. Expect
close to 28 to 30 frames per second with the setting on. A steady value at
or below 35 frames per second, on an otherwise idle page, confirms the
throttle (see MP-1).

Once you confirm the throttle, check these on the same page:

- Does a scripted animation still look acceptable at 30 frames per second?
- Does a scroll-linked effect avoid a visible step?
- Does an autoplaying video fall back to its poster image?
- Does a timer-driven carousel avoid a drift from the real time?

### One of these two states can be scripted; the other cannot

Android's battery saver can be switched on and off from a script, with a
documented, public command. iOS Low Power Mode cannot be switched on by any
script, public or private; a person must do it by hand, every time. Treat
any claim of an automated iOS Low Power Mode test as false. Build your one
fallback path (see MP-1 and MP-8 in `media-and-power.md`) so it works under
both states without needing to know which platform it is running on.

## Reference files

Each file below covers one cause group. Load only the file you need.

| File | Cause group | Entries |
|---|---|---|
| [references/layout-and-paint.md](references/layout-and-paint.md) | What forces a layout, a paint, or a new graphics layer, and what that costs | 9 |
| [references/viewport-and-scrolling.md](references/viewport-and-scrolling.md) | What a viewport unit resolves against, and what breaks native scrolling | 9 |
| [references/input-and-interaction.md](references/input-and-interaction.md) | How a touch, a pointer, and a mouse event differ, and where a capability query is wrong | 7 |
| [references/media-and-power.md](references/media-and-power.md) | What a low-power or a reduced-data state throttles, blocks, or hides | 8 |
| [references/forms-and-native-controls.md](references/forms-and-native-controls.md) | What a native form control does on its own, per platform | 6 |

39 entries in total.

## What this skill leaves out on purpose

Six mechanisms from the same source catalogue are left out of this skill.
Each one needs a specific page-building platform to reproduce. Each one
belongs with a platform-specific audit skill instead:

- Repeated-item stamping, and its per-item attribute limits.
- A platform's own step-based interactions, fighting with custom script.
- A platform's script execution order, inside an embedded block.
- A platform's own image delivery, and its format choice.
- A platform's own touch-capability class.
- A platform's own generated attribute names, used as hidden selector
  contracts.

Every mechanism that remains here is true of a website built by hand, in any
framework, on any host.
