# The false-positive catalogue

## In this file

- The five common shapes of a false finding
- The full catalogue of known false findings
- Why each one happened
- The check that prevents it

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

### A second measurement path measures worse

- **Open states were audited by a different route from the resting page.** `openStateAudit`
  took the layout script as text and evaluated it itself, which looked like reuse and was
  not: it skipped the role pass, so every open-panel reading fell back to class-name
  matching — the exact path that reported a carousel section as 1865px of clipped copy — it
  skipped the fit measurements entirely, and it never measured twice, so nothing found
  inside a panel could be labelled timing-dependent. Open panels are where collisions live;
  they were getting the weakest evidence in the run. *Fixed:* the runner passes its
  measurement function in, so there is one definition of "take a measurement" and open
  states get roles, slack, collisions and stability like everything else.
- **Three modules shipped with no test while their commit claimed proof.** `perturb.mjs`,
  `impact.mjs` and `attribution.mjs` had none — the plan named the fixtures and the
  implementation skipped them, which is the failure mode this whole file exists to catch,
  applied to the tooling instead of a page. *Fixed:* each is now asserted on the property
  that makes it trustworthy — a perturbation reports the box that breaks and not the one
  with room, and never claims credit for damage that was already there; ranking ignores what
  a detector called `info` or `unstable`; attribution names the declaration that won the
  cascade and says when a selector matched several nodes.

### Ranking and explaining can invent findings of their own

- **A ranking must never overrule the measurement it ranks.** The first impact ranking put
  `img.insights-card_img` at the top of the report — "~10 words of content affected" — on a
  finding whose own text reads *"still loading when audited — NOT a defect"*. The detector
  had already been careful; the ranking threw that away by matching `/broken/` against the
  issue string. *Fixed:* `severity: 'info'` and `unstable` findings are never ranked.
- **A ranking that reads a different table from the report contradicts it.** Reading only
  `byBreakpoint` put the run's most serious finding — a collision existing from 992 to
  1120px, at no agreed breakpoint — nowhere in "worst first", three headings above the sweep
  section that reported it. *Fixed:* sweep findings rank too.
- **Attribution to a selector that matches many nodes is a guess.** `.u-cover` matches every
  cover image on the page; naming its declarations for a finding about one of them sends
  someone to the right rule for the wrong reason. *Fixed:* report `matchedNodes` and say
  which one the declarations belong to, rather than implying a single answer.

### Intentional read as broken

- **Layered is not colliding.** webflow.com prints a "machine mode" easter egg of JSON-LD
  text under its headings — fully visible by every CSS test, with an opaque panel painted in
  between. Geometrically three headings sit on top of other text; to a reader nothing is
  wrong. Two bugs came out of chasing it. The paragraphs' own `opacity` is 1, so the filter
  had to become `checkVisibility({ checkOpacity: true })`, which asks up the whole ancestor
  chain — and the occlusion test first looked for opaque paint *above both* runs
  (`slice(0, min(iA, iB))`), which is empty whenever the upper run is topmost, so the layered
  case sailed straight through. What matters is paint *between* them: `slice(lo + 1, hi)`.
  Two further things this taught, both now in the code: a hit test needs its point on screen,
  so it scrolls there and restores (`behavior: 'instant'` — a site with
  `scroll-behavior: smooth` animates a bare `scrollTo`, and the offset has not moved by the
  next line, so every finding came back unverified), and where window scrolling does nothing
  at all (Lenis, Locomotive: they translate a wrapper instead) the finding has to say so and
  stay SUSPECTED rather than pretend to be measured.
- **`checkVisibility()` calls `display:contents` invisible.** It generates no box, so it is
  not rendered, so the gate said no — and the gate sat in front of the shadow-root descent,
  which threw away the counter digits the whole path exists to reach, for the second time in
  one afternoon. Descend first, gate after, and treat `display:contents` as a passthrough.

- **Measuring a page mid-reveal invents width-dependent defects.** Scrolling is what starts
  scroll-triggered animations, and the sweep scrolls at every width — so a fixed settle delay
  measures whatever the animation was doing. That produced a clean-looking run of seven stops,
  "993–1137px: `.compare_savings-text` escapes its parent", for an element that sits happily
  inside its parent on a fresh load at every one of those widths. It also produced the
  opposite: a hero's stat pills photographed at 30% opacity, read as a contrast defect, and
  solid a second later. *Fixed:* `settlePage` drains `document.getAnimations()` (ignoring
  infinite ones) before anything is measured, and a sweep finding present at a single stop is
  re-probed either side rather than guessed at. The guess was wrong in both directions within
  one afternoon: at a 24px step it called a real artefact a defect, and at 96px it called both
  genuine defects "probably animation" because a 130px band lands on exactly one 96px stop.
  A measurement beats a heuristic — `transient` now means "re-probed ±step/3 and did not
  reproduce", and only that is excluded from the baseline.
- **A carousel's ancestor inherits the carousel's scroll width.** `section.services` has
  `overflow-x: clip` and a slide track inside it, so the SECTION reports `scrollWidth` 2243
  against `clientWidth` 378 — 1865px of "clipped copy", at every mobile width, on every run.
  Excluding the track was not enough: the track is not wide either, its SLIDES hang off it,
  and its class (`services_track`) matches no slider name anybody would think to list.
  *Fixed:* ask where the overflow comes from — a slide sitting past this element's own edge
  means the carousel is the mechanism.

- **A card over a photograph is composition, not a collision.** The first version of
  `overlappingContent` judged images as well as text and opened with three findings on one
  hero — two stat cards and a testimonial each "covering" 9–18% of the picture — while
  missing the one real defect underneath, a number half hidden by that same testimonial.
  *Fixed:* only rendered TEXT is a covered target. A buried image is a job for the eye on
  the screenshot, and gradients/scrims are excluded by name because sitting on top is their
  entire purpose.
- **`transition-property` initialises to `all` on every element.** The hover-slide exclusion
  (two arrows in a clip box the width of one) tested the property alone, which is true of
  the whole document — so `escapesParent` excused every element on the page and reported
  nothing, anywhere, while passing its own live run. A detector that returns empty because
  its *exclusion* matched everything looks exactly like a clean page. *Fixed:* require a
  non-zero `transition-duration` as well.
- **`scrollWidth` is not the content width.** An inline-block with `padding:0 10px` and
  `white-space:nowrap` reports `scrollWidth` 109 against `clientWidth` 99 on content that
  measures 89 and fits with room to spare — three confident "nowrap text does not fit"
  findings on a nav that is not broken. *Fixed:* measure where the content actually ends
  (union of child boxes and text rects) against the padding box.
- **Text inside a web component is not absent.** An animated counter renders its digits in a
  shadow root, one character per text node, inside an `overflow:hidden` column holding all
  ten digits — and the host is `display:contents`, so its own box measures 0×0. Three
  separate assumptions each silently deleted the content: a light-DOM-only walk, a
  `length > 1` filter on text nodes, and clipping rects to the host box. The number a person
  can plainly see was, to the sweep, not there. *Fixed:* traverse open shadow roots, accept
  single-character nodes inside them, clip to the nearest ancestor that really clips, and
  report against the nearest classed light-DOM ancestor.

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

## `target="_blank"` CTAs read as dead

**Symptom.** Two valid external “Member login” links were reported as DEAD even though
their `href` values were correct and clicking them opened the community site.

**Root cause.** The click audit watched only the current page's URL, history, dialogs and
DOM. A new browsing context leaves all four unchanged, which is observationally identical
to a dead click if the browser context itself is ignored.

**Fix.** Listen for a new Playwright `page` event around every CTA click, record its URL,
and close the probe page before testing the next candidate. Clicking remains the authority;
the observation boundary now includes every browsing context the click can create.

## Scroll audit checked before smooth scrolling moved

**Symptom.** The mobile scroll phase recorded zero steps and then reported ten lazy images
as never loaded on a page whose visual captures plainly contained the images.

**Root cause.** Two state leaks had the same symptom. Open-state probes can retain a menu's
`overflow:hidden` lock, and same-route navigation can restore a previous scroll position.
After those were reset, this site still returned zero because its CSS enables smooth
scrolling: the audit called `scrollBy()` and read `scrollY` in the same JavaScript frame,
before the animated movement began.

**Fix.** Reload between stateful phases, explicitly start at `scrollY=0`, request instant
scrolling, and read the position after the browser applies it. Then bring unresolved lazy
images into view individually and only report images that have completed with no natural
size. The live regression moved from 0 steps/10 false failures to 22 desktop and 39 mobile
steps with zero failed lazy images.

## Hidden cart form audited as a visible broken form

**Symptom.** A closed cart's discount form was reported as containing no visible fields and
having no success/error UI during a home-page review.

**Root cause.** The form existed in the DOM inside a hidden panel. Its visible-field filter
correctly returned zero, but the form itself had never passed a visibility gate—“not on the
page” masquerading as an empty component.

**Fix.** Audit visible forms in the current state and record hidden forms as deferred. Open
states may be audited separately. Absence of a static success/error node is SUSPECTED until
an authorised submission path is exercised; modern apps often render feedback only after a
response.

## A visual tile cap silently covered only the top of a long page

**Symptom.** Fourteen mobile tiles sounded substantial but covered only the first 10,808px
of a 23,874px page. The footer and most lower content had no viewport evidence.

**Root cause.** The cap retained the first N contiguous offsets. A resource budget was
implemented as top-of-page priority, and “tail not reviewed” was easy to overlook.

**Fix.** When contiguous coverage exceeds the cap, spread offsets evenly from the first to
the final viewport and label the result `sampledAt`. This proves representative coverage,
including the tail, while explicitly preserving the gaps as limitations.

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
container primitive being inconsistent. Reading the actual computed styles showed
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
correctly — verified directly in the source — and still read as dead through this path.

**Fix.** Before clicking any control found inside a dropdown/mega-menu/nav-flyout subtree,
open its trigger (hover, or whatever the real interaction is) and wait for the open state
first, exactly as `interact.mjs` already does for accordions and tabs. Until that's in
place, treat a dead-click finding inside nav dropdown content as SUSPECTED, not MEASURED —
confirm the element's own href or link settings at the source before reporting it as broken.

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

## `display: contents` parents make every child look like it overflows

**Symptom.** 314 of 428 text findings on one site were `overflows-parent`, on
`h3.blog-card_title` and `div.blog-card_date` across 23 pages, and on
`div.team-page_pill` at every breakpoint — each "overflowing its parent" by
373–830px. The mobile insights cards had already been reviewed by eye and looked
perfect.

**Root cause.** The parent was `div.u-display-contents` — `display: contents`.
Such an element generates no box, so `getBoundingClientRect()` returns
**0×0 at 0,0**, and *any* child therefore extends past its right edge by its full
width. Same trap for any zero-size wrapper.

**Fix.** Before comparing a child against a parent's box, walk up to the first
ancestor that actually **has** a box (`display !== 'contents'` and `width >= 1`).
Compare against that. A parent-overflow check that doesn't do this reports its
loudest findings on the healthiest markup, because `display: contents` is exactly
what a well-built CMS wrapper uses.

## Content inside a horizontal scroller is not overflowing

**Symptom.** `<td>`/`<th>` in rich-text articles reported as extending 22–334px
past the viewport at 393px; a tab label ("Multiple Directors") reported 171px past
the viewport on 8 pages.

**Root cause.** Both sat inside an ancestor with `overflow-x: auto` — a
deliberately scrollable table wrapper and a scrollable tab strip. That is the
*correct* responsive handling for a wide table, and `documentElement.scrollWidth`
confirmed **zero page-level overflow** in both cases.

**Fix.** For any "past the viewport" or "overflows parent" check, walk the
ancestors for `overflow-x: auto|scroll` first. If one is found, the content is
reachable by design — report it, if at all, as a separate and much softer class
("requires horizontal scroll; is there a scroll affordance?"), never as overflow.
Cross-check against document-level overflow: if the page itself doesn't scroll
sideways, nothing is escaping the layout.

## `line-height` smaller than `font-size` is usually deliberate display leading

**Symptom.** `lineheight-lt-fontsize` on every article `<h1>` and an About `<h2>`:
line-height 3.5–6.2px *less* than font-size.

**Root cause.** The design uses `line-height: 0.9` for large display headings —
a normal editorial choice, and the site's own token list contains `0.9`. Tight
leading only becomes a defect when ascenders and descenders actually collide on a
multi-line heading.

**Fix.** Keep the measurement, but do not report it as a defect without a
screenshot of a **multi-line** instance showing real collision. Otherwise it is at
most a Low note ("check descender clearance at ≥2 lines").

## A visually-hidden utility is *supposed* to be clipped

**Symptom.** 65 `text-clipped-x` plus 65 `text-clipped-y` findings on
`span.u-visually-hidden` inside every carousel.

**Root cause.** That is the accessible-name pattern: a 1px clipped box holding
text for screen readers. Clipping is the mechanism, not a bug.

**Fix.** Exclude `u-visually-hidden` / `sr-only` / `visually-hidden` class
conventions from all clipping and overflow checks.

## Off-screen carousel slides are not "past the viewport"

**Symptom.** 729 `past-viewport` findings, dominated by `testi_quote`,
`testi_tag`, `benefits_card-title`, `services_card-title` at every width.

**Root cause.** They are the not-yet-visible slides of a horizontal carousel.
Living beyond the right edge of the viewport is the entire point.

**Fix.** Exclude anything inside `[data-carousel-viewport]`, a `*_track`, or a
known slider container before running viewport-bounds checks. On the site that
produced this, excluding carousels, visually-hidden spans, nav panels and the logo
marquee took the raw count from 2,100 to 428 — and the survivors were the real
findings.

## `scrollWidth > clientWidth` is not overflow when nothing clips

**Symptom.** `h1.team-page_name` reported as overflowing by 18px ("Placeholder
Person") and 5px ("Alex Ogden").

**Root cause.** `overflow-x: visible`, `white-space: normal`, and zero
document-level horizontal overflow. The heading wraps normally; its widest word
simply extends a few px past the content box and paints fine, with hundreds of px
of clear space to its right.

**Fix.** An overflow metric is only a defect when something **clips** it
(`overflow: hidden|clip`, `text-overflow: ellipsis`) or the **page** gains a
horizontal scrollbar. With `overflow: visible` and no page overflow, report
nothing. Check the clipping context before believing the delta.

## Reveal animations make one-shot layout measurements lie

**Symptom.** `who-help_card-title/text/link` reported 96px past the viewport at
1512px on one page — a confident, specific number.

**Root cause.** The sweep measured immediately after a scroll pass, while an IX2
scroll-reveal still had the group translated. A targeted re-measure put every
title at x 166–389 inside a 1527px viewport, with zero page overflow.

**Fix.** On a site with scroll-triggered reveals, let transforms settle before
measuring geometry (or read `data-anim-ready`-style state), and treat any
single-page, single-width geometry finding as provisional until re-measured. This
is the same class as the mid-animation screenshot trap in `vision-qa.md`, but it
bites measurements too, not just pictures.

## Uncaught TypeErrors reported in the hundreds that no real interaction reproduces

**Symptom.** A sweep of 10 URLs reported **126–232× `TypeError: Cannot read
properties of null (reading 'appendChild')`** per page, filed as *first-party*
console errors and separated from the third-party bucket. Sitewide, first-party,
identical error, four-figure total. It reads as one of the most serious findings a
run can produce.

**Root cause.** The runner's own injected instrumentation. A clean load, 40
element hovers, a full scroll pass and 12 accordion clicks against the same URL
produced **zero** page errors. The tell is the shape of the data: a near-identical
count range on every page regardless of what each page contains, including pages
with almost no JavaScript of their own. Site code does not fail uniformly across
unrelated templates; harness code does.

**Fix.** Before reporting any console/page error class, reproduce it **outside the
runner** — plain `goto`, then interaction, listening to `pageerror` as well as
`console`. Report only what reproduces. A first-party/third-party split answers
*whose origin*, not *whose bug*, and instrumentation injected into the page counts
as first-party by origin while being neither the site's nor the user's problem.

**Also worth knowing:** `page.on('console')` does **not** receive uncaught
exceptions — those arrive on `page.on('pageerror')`. A probe that listens only to
`console` will report **0 errors** on a page that is genuinely throwing, which is
the same defect in the opposite direction. Listen to both, always.
