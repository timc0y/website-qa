# The false-positive catalogue

Every wrong finding this skill has produced, what caused it, and what fixed it. It exists
because the same *shapes* of mistake keep recurring in new checks, and because a reviewer
who is handed three fabricated findings stops believing the eleven real ones beside them.

**Read this before adding or trusting a check.** Then classify what you're about to report:

| | means | trust |
|---|---|---|
| **MEASURED** | a number read off the page — a ratio, a width, a 404 status | report it |
| **OBSERVED** | a behaviour exercised in a real browser — a click, a toggle, a scroll | report it |
| **SUSPECTED** | a heuristic that pattern-matches a defect | verify first, and say so |

The summary carries this legend on every run. A suspicion written in the voice of a
measurement is the failure mode, not the suspicion itself.

## The five shapes

Nearly everything below is one of these. When you write a check, ask which one it risks.

1. **Measured in the wrong state.** The page was mid-load, mid-animation, or scrolled
   somewhere else when the value was read.
2. **Measured in the wrong place.** The sample point, index, or ancestor wasn't the thing
   being reported on.
3. **Intentional read as broken.** Closed panels, swipe-only carousels, screen-reader
   labels, unselectable button text, carousel tracks wider than their frame.
4. **Not on the page at all.** Hidden CMS templates, `display:none` mobile nav, zero-box
   elements — all of which still answer `getComputedStyle` cheerfully.
5. **Absence inferred from a probe.** "No icon", "no arrows", "no motion" derived from a
   selector rather than from a picture.

## The catalogue

### Wrong state

- **`naturalWidth === 0` without `img.complete`** — three of four "broken images" on one run
  were SVG icons that hadn't decoded yet; they measured 17, 33 and 28px a second later.
  *Fixed:* require `complete`; a still-loading image is reported as info, never a defect.
- **Reverse-on-leave reveals, measured from the bottom of the page** — content that animates
  out on leave reads `opacity: 0` for everything above the viewport. `.who-help_eyebrow` was
  reported as a broken reveal; scrolled into view it goes 0.47 → 0.97 → 1.0. *Fixed:*
  `scrollAudit` re-tests every candidate in the middle of the viewport; only survivors count.
  A naive version of this check reported **12** perfectly visible headings.
- **Engine lazy-load thresholds** — WebKit's is one viewport (relative), Chromium's a fixed
  ~1250px, so an unscrolled comparison reports their *loading strategies* as rendering bugs.
  "collapsed: chromium=0, webkit=4" appeared on every run and was never real. *Fixed:*
  `settlePage()` runs identically in both engines before measuring.
- **Tiles captured mid-fade** — a blank band where the eyebrow and H2 belong reads as missing
  content. *Fixed:* 900ms settle; and cross-check any absence against a neighbouring tile.

### Wrong place

- **`color(srgb 1 1 1 / 0.8)`** — modern colour syntax puts components in 0–1. A naive
  number scrape turned an 80%-white chip into `rgb(1,1,1)`, near-black, and the contrast
  check reported `.testi_tag` at ratio 1.78 — precise, confident, impossible. *Fixed:*
  detect the 0–1 form (also how `color-mix`, `lab`, `oklch` serialise).
- **A hit-test point clamped into the viewport** — `elementsFromPoint` is viewport-relative
  and returns nothing below the fold, so clamping silently sampled a different section: a
  button at y=6136 measured against whatever sat at y=981, giving "white text on white".
  *Fixed:* never relocate the sample; hit-test only when on screen, and do the geometric
  test in document space.
- **Sampling the element's box instead of its glyphs** — `left + 40px` landed on a button's
  white circular icon, so one `.button_text` component read "white on white, 1.0" in the nav
  and "white on orange, 3.38" in the hero. *Fixed:* a `Range` over the first text node.
- **Ancestor-walking for a background** — a caption over a photo has no image in its ancestor
  chain; the photo is a *sibling* `<img>`. The walk sailed past it to a far ancestor.
  *Fixed:* geometric check against every pictorial box in document space → `unverifiable`.
- **Index identity across a mutation** — `querySelectorAll` indices shift the moment a click
  inserts a node, so before/after heights compare neighbours. A mobile menu that visibly
  opens (the audit's own screenshot proves it) was recorded as changing nothing. *Fixed:*
  snapshot holds element references.
- **A filtered list's index used as an address** — the CTA audit clicked `nth(i)` of the raw
  selector using the *filtered* candidate's index, and reported 2 dead buttons on a page
  where pressing all ten found 7. *Fixed:* record the raw `querySelectorAll` index.
- **Ambiguous text matching** — "Single Director" is both a tab label and the card it opens;
  the design-spec matcher silently picked the tab and reported a font-size *and* a colour
  mismatch against a node describing the card. *Fixed:* count distinct matches, warn.

### Intentional read as broken

- **Closed accordion panels** counted as collapsed flex/grid containers (and, in WebKit
  only, as a cross-browser defect). *Fixed:* a zero-height clipped disclosure target, or
  anything inside an accordion/dropdown, is closed — not collapsed.
- **`clippedText`, the noisiest check in the sweep — 6 findings, 0 real.** `<style>` embeds
  put CSS in `textContent`; `.u-visually-hidden` is a 1px box by design; carousel tracks are
  wider than their frame *as the mechanism*; and a heading wrapped in `overflow:hidden` for a
  slide-up reveal overflows by a few pixels of line-height, differently per engine — which
  is where "clippedText chromium=6 webkit=10" came from. *Fixed:* `innerText`, exclude those
  four structures, and require the hidden amount to be a meaningful share of the box.
- **Anything past the right edge called "overflow"** — an element only makes the page scroll
  sideways if *nothing above it clips*. A class-name allowlist can't know that: a track named
  `benefits_track` and an absolutely-positioned hero stat card both sit past the edge inside an
  `overflow-x` ancestor. 8 "overflow" findings at 393px on a page whose `docWidth` was 378 against
  a 393 viewport — it could not scroll sideways at all — plus a phantom "767px overflow:
  chromium=0, webkit=2". *Fixed:* walk ancestors for a clipping `overflow-x` and split the result
  — `offenders` (real, scrolls sideways) vs `cutOffButContained` (SUSPECTED, visually sliced,
  confirm on a screenshot). The split is what turned the noise into the one real finding: hero
  stat cards 93px past the viewport because their desktop absolute positioning was never undone.
- **`user-select: none` on controls** — correct and deliberate on a button label or a slider.
  11 findings, 0 real. *Fixed:* only prose (6+ words) outside any control.
- **Swipe-only carousels** — arrows switched off by a media query are a design decision, not
  0px arrows. *Fixed:* `controlsHiddenByDesign`, reported as information.
- **`border-color` with no border painted**, and derived properties (`border-color` and
  `textDecoration` follow `color`) reported as un-transitioned when their source is.

- **A design-spec matcher that rejects `opacity: 0`** — the worst version of the reveal problem,
  because it doesn't skip the comparison, it *misdirects* it. A 62px DM Serif heading waiting on a
  scroll reveal was rejected, the match fell through to a wrapper div carrying the inherited body
  font, and the report read "font-size design 62px vs live 16px; font-family DM Serif Text vs DM
  Sans; weight 400 vs 300" — four confident, wholly invented mismatches, twice over. *Fixed:*
  `visible()` in `audit_design_spec.js` tests display/visibility and a real box, never opacity.
  Font metrics are valid at any opacity. The same run then surfaced the real finding underneath:
  line-height 0.95 where the design says 0.9.

### Not on the page

- **Zero-box elements inside hidden CMS templates and the `display:none` mobile nav** — they
  report their own `display: block` and pass a visibility filter, then measure 0×0, so the
  text point falls back to (0,0), the page's top-left corner. Everything so measured came
  back "white on white, ratio 1.0". *Fixed:* require a real box plus `checkVisibility()`.

### Absence inferred from a probe

- **A gap between two section crops read as "this section isn't built."** Live section crops don't
  tile the page — the insurer trust bar sat at y=1703, between a crop ending at 1707 and the next
  starting at 1801, so it appeared in neither and the Figma-vs-live pair showed "no live
  counterpart". It was fully present, all five logos, opacity 0.3, exactly as designed. *Rule:*
  before reporting a designed section as absent, confirm against the **tiles** (which do overlap)
  or a DOM query — never against a gap in the crops.
- **A design frame containing another page's content.** The "Services Page" mock embeds a full Tax
  Saving Calculator section; it is a separate page at `/tax-saving-calculator`, linked from the
  hero, nav and footer. Reported as a missing section it would have been the headline finding and
  completely wrong. *Rule:* before calling a designed section unbuilt, search the site for its
  copy and check the nav/footer links — a template mock is not a page manifest.
- **`closest()` from a text node grabs the wrong ancestor** and reports zero icons on cards
  that plainly have both an icon and an image. Confirm absence on a clean screenshot.
- **`href="#"` resolves to the current path**, filtering out exactly the unfinished nav items
  the parity check exists to find.
- **A DOM audit cannot answer "does this do anything."** `cursor:pointer` with no anchor
  ancestor is wrong in both directions: it flagged a CTA wired by a delegated listener and
  missed three dead ones carrying `data-w-id`. Only `ctaClickAudit` settles it, and when it
  has run the runner suppresses the DOM suspicion entirely.

## The rule that generates all of the above

**Before reporting a difference or an absence, ask what would have had to be true for it to
be intentional — then test for that.** A section with one card might be a collection with one
published item. A hidden arrow might be a deliberate swipe-only carousel. An invisible
heading might be a reveal that hasn't fired yet, or one that has already fired and reversed.

And its corollary, learned by getting it wrong in both directions on the same page:

> **Vision** is authoritative on appearance and presence.
> **Computed styles** are authoritative on values.
> **Clicking** is authoritative on behaviour.
>
> Get each finding from the right channel, not the convenient one.

## Lazy-loaded carousel slides read as broken/missing images

**Symptom.** A component-set crop of the 5th carousel slide came back as a flat colour
block with no photograph, and a DOM probe reported `naturalWidth: 0` — so "slide 5's
image is broken" and, worse, an earlier probe reported *all five* slides imageless.

**Root cause, two of them.**
1. The probe measured at `scrollY 0` after having scrolled to the bottom and back. The
   slider's images resolve `src` lazily; at that moment `currentSrc` was `""` on every
   slide. The crops plainly showed four photographs — **the probe was wrong, not the
   site.** Any check that disagrees with a screenshot loses.
2. The genuinely-empty slide was `loading="lazy"` at `left: 1468px` — outside the
   viewport, because it is the off-screen 5th slide of a carousel. Unloaded is the
   *correct* behaviour there. A full slow scroll found no broken images and no 4xx.

**Fix.** Measure images only after `scrollIntoViewIfNeeded()` on the specific instance
plus a settle wait — never from a global pass at an arbitrary offset. Before reporting
any image as broken, check `loading` and whether the element is inside the viewport, and
confirm with a network-level 4xx check rather than `naturalWidth` alone. `naturalWidth: 0`
on an off-screen lazy image is a state, not a defect.

## `tel:` and `mailto:` CTAs read as "does nothing when clicked"

**Symptom.** The click test reported 3 dead CTAs; one was "CALL US".

**Root cause.** It resolves to `tel:02045406009`. Headless chromium does not navigate a
non-http scheme, so no navigation and no DOM change is recorded — identical to a dead
control.

**Fix.** Resolve the nearest ancestor/descendant `<a href>` before declaring a control
dead, and exempt non-http schemes (`tel:`, `mailto:`, `sms:`). Separately: a CTA with a
valid href pointing at a *blank* page is a real defect, but it is a **content/publish**
finding about the destination, not a dead-link finding about the button — reporting it as
the latter sends the developer to the wrong file.

## Review-tool iframes reported as controls with no focus ring

**Symptom.** "3 controls with no visible focus ring" — promoted as an accessibility defect.

**Root cause.** All three were Marker.io: `iframe#feedback-button`, `iframe#tooltip-container-wrapper`,
`iframe#notifications-root`. The keyboard audit tabs into them because they are focusable, and they
have no ring because they are third-party review furniture, not site markup.

**Fix.** The overlay list that `hideOverlays()` already knows about must also exclude elements from
the keyboard audit — hiding something for screenshots but still auditing it for focus rings is
inconsistent. Check `title`/`id` against the overlay vocabulary before reporting a focus finding, and
say "no focus-ring problem was found on any real control" rather than reporting zero, so the reader
can tell the check ran.

## Asymmetric container gutters inferred from text-block edges

**Symptom.** `section.compare` reported left 70px / right 1020px (diff −950px), and six other
sections similarly lopsided — read as a systemic layout failure.

**Root cause.** The right gutter was derived from where the widest **text block** ends. A section
with a deliberately narrow copy column (a 620px paragraph in a 1372px container) therefore reports a
huge right gutter. Nothing is off-centre.

**Fix.** Measure gutters from real box edges, not text extents. Probing actual boxes gave
`boxRight: 1265px` **identical across five sections** while `textLeft` was 70px everywhere except the
one genuinely-offset section. Report an asymmetry only when the container's own box edges disagree;
otherwise it is content width, which is a design decision. A single section whose *left* edge differs
from every other section's left edge is the trustworthy signal — that one survived and was real.

**Related shape, different cause.** A cross-page sweep reported "container gutters at 1920px:
dominant 266px, also 290px, 328px, 346px" on Home, Key-man and About — read as the shared
container primitive being inconsistent. Reading the actual computed styles in the Designer showed
every `.container` instance on the page carrying the exact same `padding: 0 64.47px` — one class,
one value, applied uniformly. The variance came from **inner content wrappers layered on top of
the container** (e.g. `.about-intro_head` adds its own `margin: 0 106px` to center a narrower text
column), which legitimately makes the *visual* gutter wider on that section than on a full-width
one like the hero. Before reporting a shared primitive as inconsistent, read the computed style of
the primitive itself across instances — if it's identical, the variance is downstream content
width, not the primitive.

## A 15px right-edge gap and images reading ~4% under spec — the harness's own scrollbar

**Symptom.** At 393px, a phantom ~15px strip of background down the right edge, reading as
"the page doesn't reach the right edge on mobile". Separately, full-bleed mobile images
measuring about 4.5% narrower than the design called for. Neither was real.

**Root cause.** Where the harness browser draws a **classic** scrollbar, `window.innerWidth`
counts its 15px but the body does not fill it. Every audit here compares element widths
against `innerWidth`, so a genuinely edge-to-edge element measures 15px short — 15/393 ≈
3.8%, which is the "4.5% under spec" almost exactly. A real phone uses overlay scrollbars
and loses no layout width, and a design frame has no scrollbar at all, so the harness was
measuring a viewport that exists nowhere the design was meant to be seen.

**Why it survived a fix.** Suppression was added to the screenshot path only, so the tiles
looked right while the numbers stayed wrong — the image you reviewed and the measurement you
quoted described **different viewports**, and nothing said so.

**Fix.** The scrollbar is now suppressed on every page load, before any audit runs, in every
engine — not just before screenshots. And because whether it happens at all is
environment-dependent, it is **measured rather than assumed**: every breakpoint records
`viewportIntegrity: { requested, innerWidth, clientWidth, scrollbarGutter, ok }`, and a
non-zero gutter prints a warning telling the reader to treat right-edge and full-bleed
measurements at that breakpoint as SUSPECTED.

**Worth knowing before you chase this again.** It does **not** reproduce everywhere. On
macOS with Playwright 1.62's bundled Chromium and WebKit the gutter measures **0px** in both
headless modes — so on a Mac this was already harmless, and the original false findings must
have come from a different platform or an older build (Linux CI and `--channel=chrome` on
Windows do take the 15px). Check `viewportIntegrity` in `findings.json` before assuming
either way; that field exists so this question is answered by the run rather than by
recollection.

## Hover-gated dropdown/mega-menu items clicked closed

**Symptom.** A nav mega-menu category link ("Who we help") reported as a dead CTA — click,
no navigation, no DOM change recorded.

**Root cause.** The element lives inside a hover-triggered dropdown. A click test that fires
on the element without first hovering (or otherwise opening) its trigger is clicking a
target that is either not in the interactable tree yet or still sits under a closed panel —
the same failure shape as a closed accordion counted as collapsed (see "Intentional read as
broken" above), but for click behaviour rather than layout. The link itself can be wired
correctly — verified directly in the Designer — and still read as dead through this path.

**Fix.** Before clicking any control found inside a dropdown/mega-menu/nav-flyout subtree,
open its trigger (hover, or whatever the real interaction is) and wait for the open state
first, exactly as `interact.mjs` already does for accordions and tabs. Until that's in
place, treat a dead-click finding inside nav dropdown content as SUSPECTED, not MEASURED —
confirm the element's own link/settings (e.g. via the Designer's component props) before
reporting it as broken.

## Vector SVG assets flagged as "pixelated" / "upscaled"

**Symptom.** Icons reported as "upscaled/pixelated (judged at 2x/3x)" — e.g. "25px source in
a 40px slot, needs 80px @2x — 69% short", repeated across several pages sharing the icon.

**Root cause.** The pixelation/upscale check is built for raster images (PNG/JPEG), where a
small source stretched into a larger slot genuinely blurs. The flagged assets were
`image/svg+xml` — vector graphics render crisp at any display size regardless of their
nominal "natural" dimensions, so the ratio that is a real defect on a JPEG is meaningless on
an SVG.

**Fix.** Check the asset's mime type/extension before applying the raster upscale-ratio
heuristic; skip it, or downgrade it to informational, for `image/svg+xml` sources. If an SVG
genuinely looks blurry, that's a rendering bug (e.g. non-integer viewBox scaling, or a
raster image embedded inside the SVG) worth a visual check — not a "needs a
higher-resolution export" finding, which doesn't apply to vectors.

## Differing per-item content length reported as a height/layout outlier

**Symptom.** "`.footer_col` heightOutlier: heights 259, 259, 137, 137px" — read as a layout
defect, repeated identically across every page sharing the footer.

**Root cause.** The four columns hold a different number of links each (7 / 4 / 3 / …) by
design — a footer nav with a "Pages" column and a "Connect" column will never be the same
height, and nothing requires them to be. A height-variance check flags the *symptom* of
different content amounts as if it were the *cause* of a broken layout.

**Fix.** Before reporting a heightOutlier among instances of a repeated component, check
whether the underlying content (child count, link count, text length) actually differs. A
height difference that's fully explained by a difference in content is not a finding — it's
the correct rendering of unequal content. Only report the outlier once content parity is
confirmed and the height still diverges.

## Deliberate photo-overlay cards and fixed headers read as z-index/stacking bugs

**Symptom.** "open panels painted behind other content" — a tab panel's photo
(`.who-help_panel-media`) reported as covered by a sibling card element and by the nav.

**Root cause, two of them.**
1. The "card" is a deliberate floating overlay — a small info card (icon/title/body/CTA)
   positioned over the bottom-left corner of the photo, the same pattern used for the site's
   hero stat cards. A screenshot shows a clean, fully legible composition; nothing is
   actually hidden or broken.
2. The fixed/sticky nav will always paint over whatever has scrolled beneath it at the top
   of the viewport — that is what `position: fixed` means, not a stacking-context bug.

**Fix.** An "occluded" finding is only real if the covered content was meant to be visible
*at that moment* and isn't legible/reachable. Confirm on a screenshot before reporting: a
fixed header over scrolled content, and a component's own designed overlay, both look
identical to a genuine z-index bug to a pure DOM occlusion check, and both need a picture to
rule out.
