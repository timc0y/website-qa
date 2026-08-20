# Forms and native controls

6 entries. This file covers what a native form control does on its own, per
platform. See `../SKILL.md` for how each entry is built, the confidence
labels (SPEC, KNOWN, FIELD), and the staleness convention.

Baseline engine versions at the last check: Safari 26.x, Chrome about 139,
Firefox about 142. Re-verify KNOWN and FIELD entries at each major Safari
release.

---

## FN-1 iOS zooms the page when a user focuses an input styled below 16 pixels

- **Pattern**: a form input styled below 16 CSS pixels. This is common on
  a site that scales its type from a root font size, when that root size
  shrinks at a mobile width. It is also common on a small-print field, such
  as a newsletter sign-up.
- **Mechanism**: iOS Safari zooms the whole page in when a user focuses an
  input, so the focused text renders at an effective 16 pixels. The zoom
  stays on after the input loses focus, until the user pinches back out,
  so the layout stays cropped. Apple has never documented the exact size
  threshold; this is one of the most widely reproduced, undocumented
  behaviours on the platform. Setting `maximum-scale=1` to suppress this
  also turns off pinch-to-zoom for accessibility. That fails a Web Content
  Accessibility Guidelines rule on its own, so the fix is itself a
  finding.
- **Affected**: iOS Safari, and every browser on iOS. Android does not
  zoom this way.
- **Symptom**: the page zooms in, and stays zoomed, when a user taps an
  email field.
- **Detect**: this is a fully static check. The computed font size of
  every `input`, `select`, and `textarea` element must be 16 pixels or
  larger, at every screen width. Compute this from the real root font size
  at each width, not from a default value of 16. Flag any `maximum-scale`
  value, or `user-scalable=no` setting, in the viewport meta tag as a
  separate accessibility fault.
- **Instead**: keep every input's text at 16 pixels or larger, everywhere.
  If a design calls for smaller text, keep the input itself at 16 pixels.
  Scale its label down instead.
- **Confidence**: FIELD. This is universally reproduced, but no primary
  source from Apple exists, so by definition this cannot become a KNOWN
  entry. Verified 2026-08, on iOS 26.

## FN-2 A date, select, range, or file input opens the platform's own control

- **Pattern**: a design shows a closed control styled to match the brand.
  A mock-up shows the open state too, such as an option list or a
  calendar, also styled to match. The build then assumes the open state
  will match too.
- **Mechanism**: the open state of these controls belongs to the platform,
  not to the page. iOS renders a `select` as a wheel or a sheet, and a
  date input with the system's own date picker. Android shows its own
  bottom-sheet controls. Each desktop browser, Chrome, Firefox, and
  Safari, draws its own calendar and its own dropdown list.

  A `range` input and a `file` input expose only their handle and button,
  through pseudo-elements that differ by engine
  (`::-webkit-slider-thumb` against `::-moz-range-thumb`;
  `::file-selector-button`). A newer, customisable `select` element exists
  in Chromium only, so far. The native picker is also usually the best
  experience on a phone. Replacing it is a trade, not a plain fix.
- **Affected**: every platform, in a different way, which is the mechanism
  itself. No amount of styling on the closed state changes the open
  state.
- **Symptom**: a dropdown looks right until a user taps it. A date picker
  looks "wrong" (that is, native) on a client's phone. A range slider's
  handle looks different in each browser.
- **Detect**: as a static check, list every native `date`, `select`,
  `range`, and `file` input on the built page. Compare each with the
  design's open state. Any design that shows a styled, open list forces a
  decision before you build it. Accept the native control, or budget a
  full custom list with keyboard and screen-reader support. Finding this
  decision undecided is itself the fault.
- **Instead**: accept a native control on a phone; this is the recommended
  path. Where the brand truly requires a custom look, build a custom
  control with complete keyboard and screen-reader support. Never ship a
  half-styled native control.
- **Confidence**: KNOWN. See MDN's guidance on styling form controls, and
  Chromium's own status page for the customisable `select` element.
  Verified 2026-08; check the support state of the customisable select
  again, since it is still moving.

## FN-3 A browser's autofill paints its own background colour, and resists an override

- **Pattern**: a dark or brand-coloured form field, on any form a user is
  likely to autofill. Examples: an email sign-up, or a checkout-style
  form.
- **Mechanism**: on autofill, a Chromium browser applies its own internal
  style to the field: a pale yellow or blue background, with its own text
  colour. It applies this at a strength an author's `background-color`
  value cannot win against. The standard workaround is a large inset box
  shadow that covers the whole field, or a very long delay before the
  background colour transition starts. Safari also draws its own
  strong-password and contact-autofill icons inside the field, which can
  collide with a custom icon placed there. Firefox highlights the field
  differently again.
- **Affected**: Chromium browsers most visibly. Safari's own icons can
  overlap a custom icon. Every engine differs, so a field styled down to
  the pixel will vary once it is filled in.
- **Symptom**: a field turns yellow once Chrome fills it in. Autofilled
  text is unreadable on a dark form. An eye icon overlaps a custom one.
- **Detect**: trigger a real autofill, from a saved profile, in Chrome and
  in Safari, on the built form. As a static check, confirm the stylesheet
  addresses the `:autofill` state (or the older `:-webkit-autofill`
  state) at all. Its absence on a dark form predicts this fault.
- **Instead**: design a field that still reads well with a light autofill
  tint. Apply the inset box-shadow pattern for a dark theme. Leave the
  right-hand 32 pixels of the field free of any custom icon.
- **Confidence**: KNOWN for the behaviour. FIELD for the workaround, since
  the browser's own precedence is observable, but the workaround itself is
  a widely used convention, not a documented contract. Verified 2026-08.

## FN-4 `type`, `inputmode`, and `autocomplete` choose which mobile keyboard appears

- **Pattern**: a form field left set to the plain "text" type for content
  such as an email address, a phone number, or a numeric code.
- **Mechanism**: the on-screen keyboard is chosen from the input's `type`
  value: `email`, `tel`, `url`, or `number`. It is refined further by
  `inputmode`: `numeric` for a plain numeric keypad, or `decimal` for one
  with a decimal point, without the up-and-down spinner that `type=number`
  adds. `enterkeyhint` labels the return key itself. The `autocomplete`
  attribute chooses what the platform offers to fill in.

  `type=number` brings an unwanted spinner control on a desktop computer.
  It also rejects text that looks numeric but is not a pure number, such
  as a value with a leading zero or an international bank number. Setting
  `inputmode=numeric` on a `type=text` field is usually the right choice
  for a postal code or a one-time code. Use `autocomplete=one-time-code`
  for an SMS code on iOS.
- **Affected**: every mobile platform. A desktop computer is affected only
  through the spinner control, and through the type-based validation.
- **Symptom**: typing an email address is awkward, with no "@" key on the
  keyboard. A phone number field shows a full keyboard. A one-time code
  field does not offer the code as a suggestion.
- **Detect**: this is a fully static check. For every field, write down the
  expected `type`, `inputmode`, and `autocomplete` combination for its
  content. Compare that against the built page. No device is needed to
  find the fault; one device check confirms the actual keyboards shown.
- **Instead**: use the correct combination of `type`, `inputmode`, and
  `autocomplete` for each field's content. Never use `type=number` for a
  value that looks like a number but is really an identifier.
- **Confidence**: SPEC. See the HTML specification's sections on input
  types, `inputmode`, and autofill detail tokens. Verified 2026-08.

## FN-5 Native form validation looks different in each engine, and in each browser's own language

- **Pattern**: a form that relies on native `required` and `type=email`
  validation, with no custom error message shown. This is a common default
  for a simple form builder.
- **Mechanism**: on an invalid form submission, an engine focuses the
  first invalid field and shows its own message. Chrome shows a tooltip
  that closes itself after a short time. Firefox shows a message that
  stays visible longer. Safari shows a small callout; an older Safari
  version showed no message at all, and silently blocked the form from
  submitting.

  Every one of these messages uses the browser's own language setting, not
  the site's language. None can be restyled. Each appears one field at a
  time, and in some engines disappears if the page scrolls. Adding
  `novalidate` turns all of this off silently.
- **Affected**: every engine, in a different way. An older browser in your
  support matrix shows the sparsest result. A non-English site shows the
  clearest mismatch, since the message language follows the browser, not
  the page.
- **Symptom**: a user presses submit, and nothing seems to happen, because
  the message was missed or never shown. A browser set to German shows a
  German error message on an English-language site. Only one error message
  shows at a time, on a form with five invalid fields.
- **Detect**: submit each form empty, and with each field made invalid in
  turn, in every engine in your support matrix. Check for a stray
  `novalidate` attribute. On a form that is critical to the brand, or to a
  legal requirement, the absence of custom, inline error messages is
  itself a finding. Such messages use `aria-invalid` and a linked
  description.
- **Instead**: keep native validation for a low-stakes form, since it is
  accessible, and free to build. Build custom validation for a critical
  form instead. Show every error at once, in the site's own language, with
  `aria-invalid` and visible text. Keep the native constraints as a
  backstop even so.
- **Confidence**: KNOWN. The HTML constraint validation specification
  defines the underlying hooks, but not the message's appearance. The
  difference in appearance across engines is the documented result of
  that gap. Verified 2026-08.

## FN-6 The iOS keyboard resizes the visible area of the page, not its layout size

- **Pattern**: a fixed-position call to action, a chat button, or a sticky
  "Send" bar on a form. A modal with a fixed footer that holds the submit
  button.
- **Mechanism**: when the iOS keyboard opens, Safari shrinks and shifts
  the visible area of the page. But the layout size stays the same: this
  is the size that `position: fixed` and `100vh` resolve against. A fixed
  element can then end up hidden under the keyboard, or floating in the
  middle of the screen once the page has scrolled. Chrome on Android has
  historically resized the layout size itself, so a fixed footer there
  stays above the keyboard. The viewport key
  `interactive-widget=resizes-content` makes this explicit, but works in
  Chromium only. The `visualViewport` interface is the one reliable,
  portable way to read the real, visible size in script.
- **Affected**: iOS, and every browser on iOS, for the
  fixed-under-keyboard fault. Android, for the opposite surprise, where
  the whole layout compresses once the keyboard opens.
- **Symptom**: a send button disappears once the keyboard opens, on iOS.
  The whole page squashes down once a field is tapped, on Android.
- **Detect**: on a real device, focus every field near a fixed element.
  Check that element's visibility and position. As a pre-launch check
  without a device, flag any fixed action element on a page that also has
  form inputs. Then check whether the build listens for the
  `visualViewport` interface's resize event, or keeps its action elements
  in the normal page flow instead.
- **Instead**: keep a form's action button in the normal page flow,
  directly after its fields. Reposition any element that must stay fixed
  by listening to the `visualViewport` interface. Do not rely on
  `interactive-widget` outside a Chromium browser.
- **Confidence**: KNOWN. See documentation for the `visualViewport`
  interface; the iOS layout-size behaviour has been documented WebKit
  behaviour for a long time. Verified 2026-08.
