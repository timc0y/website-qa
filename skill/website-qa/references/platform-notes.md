# Website QA — platform notes, quirks, and reading the audits

## Two runtimes, same scripts
The audit files are IIFEs whose trailing value is their result. The headless runner
`eval`s them via `page.evaluate`; interactively you paste them into `javascript_exec`
and read the returned value. `audit_transitions.js` also attaches `qaSnap`/`qaDiff`
to `window` for interactive hover diffing.

## Browser-pane quirks (interactive mode only — the headless runner avoids these)
- **Deep-scroll screenshots go blank white.** GPU-composited layers aren't captured
  at large scroll offsets, and scroll-triggered animations may not fire on
  programmatic scroll. Fix: `showOnly(sel)` (from `live_probe.js`) hides other
  sections so the target renders near the top; `showAll()` restores. The headless
  runner uses `fullPage` screenshots and doesn't hit this.
- **Coordinates are viewport CSS pixels** (matching `getBoundingClientRect`), not the
  downscaled screenshot size. Read the element's rect and click its centre; don't
  eyeball off the screenshot.
- **A timed-out `computer` scroll can wedge the pane** (blank/stale). Recover by
  navigating to the URL again.
- **Multiple elements can share a class** (a nav toggle group = phone button + a
  hamburger). Disambiguate by SVG content / index.
- **JS reads are the source of truth**; a blank capture is an artifact, not proof.

## JavaScript interactions vs synthetic events
Dropdowns, mega-menus, hover swaps, and hydrated UI are often JS-driven and **do
not fire on synthetic hover / dispatched events**. This applies to framework
islands, animation libraries, site-builder interactions, and hand-written event
handlers. To inspect a panel's content, force it visible
(`el.style.display='block'; el.style.opacity='1'`) — but a state change that's part
of the interaction (nav theme swap on open) won't run, so mark it "needs manual
check". A real Playwright click is trusted input and exercises the actual handler;
use it for mobile navigation, accordions, tabs, and hydrated components.

## Reading each audit
- **audit_layout** (per breakpoint): `pageScrollsSideways` true = real overflow bug;
  `offenders` = elements past the right edge (even if an ancestor clips them —
  `.who-help_tab` overflowing 159px is still wrong). `collapsedElements` = 0×0 while
  rendered (absolute w/o size, empty flex, float collapse). `unintendedWrapping` =
  short labels/buttons on 2+ lines (a whole button component wrapping is one
  root-cause fix: `white-space: nowrap`). `lowContrast` skips gradient/image
  backgrounds (can't determine colour) to avoid false positives.
- **audit_content**: `placeholderText` reports hidden ones too (lorem in a
  display:none panel still ships) with `visibleNow`. `deadLinks` = `#`/empty href.
  `stagingLinks` = points at preview, builder, or localhost hosts. `extNewTab` = external link not
  opening in a new tab.
- **audit_a11y_seo**: `structuredData.flag: INVALID` = JSON-LD parse error / no
  @type. `emailFieldsNotTypeEmail` = weak validation. `oversizedImages.factor` =
  natural/displayed ratio (wasted bytes). `webFontsNotLoaded` = users see a fallback.
- **audit_transitions**: `designSnaps` count excludes `focusRing` (keyboard outline
  rings intentionally snap — low signal). A real snap = a hover/active property
  change with no covering transition.
- **audit_consistency**: `buttonCaseMix` non-null = buttons disagree on
  text-transform. High `fontSizes`/`textColors` counts = inconsistent scale/palette.
  `componentDrift` = same class, different box metrics (could be intentional combo
  classes — verify).

## "Missing element" claims need a higher bar (learned the hard way)
Never report "X is missing / has no icon / lost its thumbnail" from a selector
probe alone — confirm it on a **clean full screenshot** first. Resolving a card via
`closest()` from a text node grabs the wrong ancestor and falsely reports zero
icons/images on cards that clearly have them (this produced two false findings on a
real review). Before any capture, run `hideOverlays()` (from `live_probe.js`): a
dev-mode chip / Marker.io badge / cookie bar over the content is a classic cause of
a false "missing" call. To script presence use `presenceAudit(cardSelector)`
(counts rendered svg/img on the true card element) — then still look. Absence is
easier to get wrong than a measurement.

## The false-positive family: "different" is not "wrong"
Five of these turned up in a single real review, all the same shape — the check
measured a difference and assumed it was a defect. Each fix is now in the code; the
pattern is what to remember.

- **Derived values.** `border-color`'s initial value is `currentColor`, so animating
  `color` changes the computed border colour too. A computed-style hover diff logs
  that as an untransitioned "snap" — on a nav with `border: 0px none`, where nothing
  is painted at all. Now: skip `border-color` when border-width is 0 or style is
  `none`, and treat a derived property as covered when the property it resolves from
  is transitioned (`RESOLVES_FROM` in `interact.mjs`).
- **Switched off vs broken.** A control inside a `display:none` ancestor was turned
  off deliberately — touch carousels do exactly this below 768px. A control that is
  in the render tree and *still* measures 0x0 is the bug. Reported separately now,
  with the hidden case as information rather than a defect.
- **Platform leftovers.** Some builders emit native controls even when the build
  replaces them with custom controls. Webflow's `w-slider-arrow-left/right` is one
  example. They measure 0 and are not defects.
- **Nested matches.** `[class*="arrow"]` matches the icon wrapper *inside* a real
  arrow button. Always drop matches contained by another match.
- **Still open:** inherited `color` on `<svg>`/`<path>` whose paint comes from
  `fill: currentColor` with `transition: fill`. The visible result is transitioned;
  the computed `color` change is not. Same family, not yet handled.

The generalisable rule: before reporting absence or difference, ask what would have
had to be true for it to be *intentional* — then test for that.

## False-positive discipline
Verify a sample of each flagged class (screenshot / inspect) before reporting.
Known low-signal: focus-ring outline snaps; `componentDrift` on legit combo classes;
`cursor:pointer` on decorative wrappers. Separate **content** issues (lorem, wording,
placeholder) from **defects**, and note the breakpoint(s) each issue occurs at.

## Cross-browser: what `--engines=chromium,webkit` can and cannot tell you
Running the layout pass in both engines and diffing is genuinely high-yield — on a
real site it surfaced four elements that collapse to 0×0 in WebKit and not in
Chromium. But be precise about what a clean WebKit run proves, because it is less
than it looks:

- **Playwright's `webkit` is WebKit *trunk* on a non-Apple port, not Safari.** It is
  routinely *ahead* of shipping Safari. Measured here: the scroll-anchoring probe
  passes in Playwright WebKit, while Safari 18 and 26 have no scroll anchoring at
  all (it ships in 27). So the probe says "fine" about a bug your users have.
- **Codec and image-format answers are meaningless there** — different decoders, no
  Apple ImageIO, no HEVC-alpha. Never conclude anything about video or AVIF/JXL
  support from a headless run.
- **Nothing about an iPhone reproduces**: no retractable URL bar, no virtual
  keyboard, no safe-area insets, no touch momentum, no Low Power Mode. That rules
  out most `100vh`/`dvh` bugs, keyboard-vs-fixed-footer bugs, scroll-snap momentum,
  body-scroll-lock bugs and iOS video autoplay policy — roughly half of real iOS
  defects.

So the sweep reports two different things and labels them differently: measured
engine **differences** (trustworthy, act on them) and **hazards** found by
construction — `vh` sizing, `autoplay` without `playsinline`, `safe-area-inset`
without `viewport-fit=cover`, a form plus a bottom-fixed bar. Hazards are not
confirmed defects; they're the list to check on a real device, and they're the only
way this class shows up at all in automation.

## What is NOT reliably scriptable (from real QA lists — flag for human/interaction)
Cross-browser rendering (Safari/iOS specifics), z-index "dropdown behind footer"
overlaps, "banner not filling viewport" intent, backend/CRM failures, JS field
behaviour (comma-on-blur), and anything needing a design reference (exact spacing,
"match Figma") — that last one needs a separate design-reference comparison pass.

## Platform-specific detectors are additive

Generic semantic, ARIA, class-shape, and rendered-layout checks run for every
site. Platform signatures add checks when present; they do not define the skill's
scope. Examples include stock Webflow form copy and rich-text demo content,
builder badges, CMS empty bindings, AOS attributes, Swiper classes, and Tailwind
or Radix state attributes. On Astro and other static-first frameworks, the final
DOM is usually plain HTML; customize `--selectors` only for bespoke components
whose state cannot be inferred from semantics or conventional class names.
