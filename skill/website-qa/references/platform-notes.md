# Website QA platform notes

## In this file

- Local runner versus interactive browser
- Browser and JavaScript quirks
- Audit interpretation
- False-positive controls
- Cross-browser limits
- Human-only checks

## Runtime differences

Audit IIFEs return their result: the runner evaluates them with `page.evaluate`;
interactive use pastes them into `javascript_exec`. `audit_transitions.js` also
exposes `qaSnap`/`qaDiff` for interactive hover comparison.

Interactive-only quirks:

- Deep-scroll captures may turn white because composited layers/scroll animation
  do not render. Use `showOnly(sel)` then `showAll()`; the runner uses `fullPage`.
- Coordinates are viewport CSS pixels from `getBoundingClientRect`, not scaled
  screenshot pixels. Click the measured centre.
- A timed-out `computer` scroll can wedge the pane; reload the URL.
- Shared classes can match multiple controls; disambiguate by SVG/index.
- JavaScript readings outrank a blank capture, which may be a capture fault.

## JavaScript interactions

Synthetic hover/events often miss framework, animation-library, builder, and
custom handlers. Forced visibility proves panel content/layout but not open-state
side effects such as theme changes; label those manual. A real Playwright click
exercises mobile navigation, accordions, tabs, and hydrated controls.

## Audit interpretation

- `audit_layout`: `pageScrollsSideways` is real overflow; `offenders` cross the
  right edge even when clipped; `collapsedElements` are rendered 0×0;
  `unintendedWrapping` catches short labels/buttons on multiple lines;
  `lowContrast` excludes gradient/image backgrounds.
- `audit_content`: `placeholderText` includes hidden shipped text via
  `visibleNow`; `deadLinks` are empty/`#`; `stagingLinks` target preview/builder/
  localhost; `extNewTab` is an external link without new-tab behaviour.
- `audit_a11y_seo`: structured-data `INVALID` means JSON-LD parse/no `@type`;
  `emailFieldsNotTypeEmail` weakens validation; `oversizedImages.factor` is the
  natural/displayed ratio; `webFontsNotLoaded` means fallback fonts.
- `audit_transitions`: `designSnaps` excludes low-signal `focusRing`; a real snap
  is a changed hover/active property without a covering transition.
- `audit_consistency`: `buttonCaseMix` flags text-transform disagreement;
  excessive `fontSizes`/`textColors` suggests scale drift; `componentDrift` needs
  combo-class verification.

## Absence requires two signals

Never report missing icons/images/elements from selectors alone. Confirm on a
clean full screenshot. `closest()` can select the wrong card, while overlays,
dev chips, badges, consent bars, hydration, and unrevealed animations can obscure
real elements. Run `hideOverlays()`, use `presenceAudit(cardSelector)` on the true
card, then inspect visually.

## Different does not imply wrong

- **Derived values:** `border-color: currentColor` changes with `color`; ignore
  it where no border paints and treat source-property transitions through
  `RESOLVES_FROM` in `interact.mjs`.
- **Disabled versus broken:** `display:none` ancestors intentionally remove some
  responsive controls; rendered 0×0 controls are defects.
- **Platform remnants:** native builder controls can remain after custom
  replacement, for example Webflow slider arrows.
- **Nested matches:** drop selector matches contained by another match.
- **Open case:** inherited SVG/path `color` may change while visible paint uses
  transitioned `fill: currentColor`.

Before reporting a difference, test how it could be intentional. Verify a sample
of every flagged class. Low-signal examples: focus-ring snaps, legitimate combo
drift, decorative `cursor:pointer`. Separate content from defects and name widths.

## Chromium versus Playwright WebKit

Cross-engine layout differences are useful, but Playwright WebKit is trunk on a
non-Apple port—not Safari. It may lead shipping Safari; for example, scroll
anchoring can pass there while absent in deployed Safari. Its codec/image results
do not represent Apple decoders, ImageIO, or HEVC-alpha. It cannot reproduce URL
bar, keyboard, safe areas, touch momentum, Low Power Mode, iOS autoplay, or many
viewport/scroll-lock faults.

Report separately:

- measured engine differences: actionable automation evidence;
- construction hazards such as `vh`, autoplay without `playsinline`, safe-area
  use without `viewport-fit=cover`, or forms under fixed bottom bars: real-device
  test candidates, not confirmed defects.

Human/interaction checks remain necessary for Safari/iOS specifics, z-index
overlaps, viewport-filling intent, CRM/backend receipt, custom field behaviour,
and design-reference decisions. Figma matching belongs to `figma-parity`.

## Additive platform detection

Generic semantics, ARIA, class shape, and rendered layout run everywhere.
Visible signatures may add checks for stock form/rich-text copy, builder badges,
CMS empty bindings, AOS, Swiper, Tailwind, or Radix. Static-first output is often
plain HTML; use `--vocabulary` only for bespoke state that semantics and common
class conventions cannot reveal.
