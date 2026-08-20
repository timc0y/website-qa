/*
 * audit_layout.js — overflow + common styling defects, runnable at any breakpoint.
 *
 * Catches the bugs that don't show in a single-fold screenshot and that Figma
 * comparison alone misses: horizontal overflow (the #1 mobile bug), clipped text,
 * broken/distorted images, low-contrast text, invisible text, and tiny tap
 * targets. Run at EACH breakpoint — overflow especially bites at 479/767/991.
 *
 * Paste into a browser javascript_exec call. Returns a structured findings object;
 * everything is capped so the payload stays readable.
 */
(() => {
  const vw = innerWidth, vh = innerHeight, mobile = vw <= 767;
  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
  /* Chrome now serialises colours declared in modern syntax as `color(srgb 1 1 1 / 0.8)`,
   * with components in 0–1 rather than 0–255. Scraping numbers blindly turned an 80%-white
   * chip into rgb(1,1,1) — near black — and the contrast check then reported `.testi_tag`
   * at ratio 1.78 with total confidence. One unhandled colour syntax, several impossible
   * findings. `color-mix()`, `lab()` and `oklch()` serialise the same way in modern engines,
   * so detect the 0–1 form rather than special-casing srgb. */
  const rgb = s => {
    const str = String(s || '');
    const n = (str.match(/-?[\d.]+%?/g) || []).map(v => v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
    if (!n.length) return [];
    if (/^color\(|^rgb\(\s*[\d.]+\s+[\d.]+/.test(str) && n.slice(0, 3).every(v => v <= 1)) {
      // 0–1 components (possibly with an alpha after the slash)
      const out = n.slice(0, 3).map(v => Math.round(v * 255));
      if (n.length > 3) out.push(n[3] <= 1 ? n[3] : n[3] / 100);
      return out;
    }
    return n;
  };
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
    return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const ratio = (a, b) => { const L1 = lum(a), L2 = lum(b); return (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); };
  // returns effective bg colour, or null if indeterminate (a gradient/image bg is in
  // the chain — we can't know the pixel colour, so contrast must be skipped, not guessed).
  /* Walking ancestors for the background is wrong in the case that matters most.
   * A caption laid over a photo has no image anywhere in its ancestor chain — the photo is
   * an `<img>` *sibling* painted underneath. The walk sails past it to some far ancestor
   * and returns that colour, so `.testi_tag` (a pale translucent chip on a dark photo) was
   * measured as #1E3A60 on rgb(1,1,1) and reported at ratio 1.82: a confident, precise,
   * entirely fictional finding.
   *
   * `elementsFromPoint` returns the real paint stack at a point, siblings included. If
   * anything pictorial sits under the text before an opaque colour is reached, the true
   * background is a photograph and CSS cannot tell you the ratio — the honest answer is
   * "unverifiable here", not a number. Those go in their own bucket. */
  const PICTORIAL = el => {
    if (/^(img|video|canvas|svg|picture)$/i.test(el.tagName)) return el.tagName.toLowerCase();
    const bi = getComputedStyle(el).backgroundImage;
    if (bi && bi !== 'none') return /gradient/.test(bi) ? 'gradient' : 'background-image';
    return null;
  };
  // composite a translucent colour over what is behind it
  const over = (fg, bg) => fg[3] === undefined || fg[3] >= 1 ? fg.slice(0, 3)
    : fg.slice(0, 3).map((v, i) => Math.round(v * fg[3] + bg[i] * (1 - fg[3])));

  /* Sample the point where the GLYPHS are, found with a Range over the first text node —
   * not an arbitrary offset into the element's box. A button's box also contains its icon,
   * and `left + 40px` landed on a white circular arrow, so the same `.button_text` resolved
   * to "white on white, ratio 1.0" in the nav and "white on orange, 3.38" in the hero. Two
   * readings of one component, one of them invented. Contrast is a property of the pixels
   * under the letters; sample there or not at all. */
  const textPoint = el => {
    const tn = Array.from(el.childNodes).find(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (tn) {
      try {
        const rg = document.createRange(); rg.selectNodeContents(tn);
        const rects = Array.from(rg.getClientRects()).filter(b => b.width > 1 && b.height > 1);
        if (rects.length) { const b = rects[0];
          return [b.left + Math.min(b.width / 2, 6), b.top + b.height / 2]; }
      } catch (e) { /* fall through */ }
    }
    const r = el.getBoundingClientRect();
    return [r.left + Math.min(r.width / 2, 6), r.top + Math.min(r.height / 2, 8)];
  };

  // every pictorial box on the page, measured once — the contrast check consults this per
  // text node, so it must not re-query the DOM thousands of times
  // Rects in DOCUMENT space, so a card photo 6000px down the page is still comparable.
  const MEDIA = Array.from(document.querySelectorAll('img,video,canvas,svg,picture,[style*="background-image"]'))
    .map(el => { const r = el.getBoundingClientRect();
      return { el, kind: el.tagName.toLowerCase(),
        rect: { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY,
          width: r.width, height: r.height } }; })
    .filter(m => m.rect.width > 40 && m.rect.height > 24);

  const effBg = el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { bg: [255, 255, 255] };
    /* `elementsFromPoint` is viewport-relative and returns nothing for a point below the
     * fold. The first version clamped the point into the viewport to keep it "valid", which
     * silently sampled a completely different part of the page: a button at y=6136 was
     * measured against whatever sat at y=981. That is where "white text on white" came from
     * — a real background, belonging to another section. Never relocate the sample. Use the
     * hit-test only when the point is genuinely on screen, and do the geometric test in
     * DOCUMENT space so it works for the whole page. */
    const [px, py] = textPoint(el);
    const x = px, y = py;
    const inViewport = x >= 0 && x < vw && y >= 0 && y < innerHeight;
    const docX = x + scrollX, docY = y + scrollY;
    /* Two questions, two different tools, and using one for both is what broke this.
     *
     * "Is there a picture under the text?" is a PAINT-ORDER question — the photo is usually
     * a sibling `<img>`, invisible to an ancestor walk. Ask elementsFromPoint.
     *
     * "What colour is behind the text?" is an ANCESTOR question. Asking the paint stack
     * gives the wrong answer whenever the point is covered by an overlay or the stack is
     * unavailable, and my first version then fell back to white — so white body copy on a
     * navy section came back as "white on white, ratio 1.0". Twice. Walk the ancestors for
     * the colour, and default to white only after reaching the root having found nothing. */
    /* A geometric check first, because it needs no cooperation from paint order or from the
     * ancestor chain: is there a real picture whose box covers this text, anywhere in the
     * document, that isn't one of the text's own ancestors? That is the `.testi_tag` and
     * `.blog-card_date` case — a chip and a date laid over a card photo that is neither
     * ancestor nor reachable from a covered hit-test point. Both were reported with precise,
     * invented ratios (1.78 and 1.95) against colours that are nowhere near the letters. */
    const covering = MEDIA.find(m => {
      if (m.el === el || m.el.contains(el) || el.contains(m.el)) return false;
      const b = m.rect;   // document-space
      return docX >= b.left && docX <= b.right && docY >= b.top && docY <= b.bottom;
    });
    if (covering) return { unverifiable: covering.kind, over: desc(covering.el) };

    let stack = [];
    if (inViewport) try { stack = document.elementsFromPoint(x, y); } catch (e) { stack = []; }
    const from = stack.indexOf(el);
    if (from >= 0) for (const n of stack.slice(from + 1)) {
      const pic = PICTORIAL(n);
      if (pic) return { unverifiable: pic, over: desc(n) };
      // An opaque layer painted UNDER the text is the background, even when it is a sibling
      // rather than an ancestor — Webflow variant buttons put their fill on an inner layer,
      // and skipping it walked past the orange to the white page and claimed ratio 1.0.
      const p = rgb(getComputedStyle(n).backgroundColor);
      if (p.length >= 3 && (p[3] === undefined || p[3] >= 0.99)) return { bg: p.slice(0, 3) };
    }
    let acc = null;                                   // accumulated translucent layers
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const pic = PICTORIAL(n);
      if (pic && n !== el && pic !== 'gradient') return { unverifiable: pic, over: desc(n) };
      if (pic === 'gradient' && n !== el) return { unverifiable: 'gradient', over: desc(n) };
      const p = rgb(cs.backgroundColor);
      if (p.length < 3) continue;
      const a = p[3] === undefined ? 1 : p[3];
      if (a <= 0.02) continue;                        // transparent — keep walking up
      if (a >= 0.99) return { bg: acc ? over(acc, p.slice(0, 3)) : p.slice(0, 3) };
      acc = acc || p;                                 // translucent: remember and keep walking
    }
    return { bg: acc ? over(acc, [255, 255, 255]) : [255, 255, 255] };
  };

  const all = Array.from(document.querySelectorAll('body *')).filter(el => {
    const c = getComputedStyle(el); return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity !== 0;
  });

  // 1) HORIZONTAL OVERFLOW — page scrolls sideways; list elements poking past the right edge.
  // pageScrollsSideways is the reliable signal; offenders exclude carousel/slider slides
  // (they extend past the viewport by design and are clipped) and third-party widgets.
  /* Names are the fallback, not the answer. `audit_roles.js` infers what a thing IS from
   * its shape and publishes `window.__WQA_ROLES`; this list only decides matters when a
   * person has pasted this one file into a console with no role pass, which the skill
   * documents as a supported way to work. Two failures in one afternoon are why: a track
   * called `services_track` matched nothing on this list, and eleven hover-slide arrows
   * matched nothing either. Third-party widget names stay by name — a chat bubble is
   * identified by whose it is, not by its shape. */
  const INTENTIONAL_OVERFLOW = '[class*="slider"],[class*="swiper"],[class*="carousel"],[class*="marquee"],[class*="slide"],.w-slider,.marker-app,[class*="intercom"],[id*="hubspot"]';
  const THIRD_PARTY = '.marker-app,[class*="intercom"],[id*="hubspot"],[class*="chat-widget"],[class*="cookieyes"]';
  const ROLES = (typeof window !== 'undefined' && window.__WQA_ROLES) || null;
  const MECHANISM_ROLES = ['track', 'slide', 'trackFrame', 'marquee', 'marqueeItem',
    'scroller', 'hoverReveal', 'hoverRevealFrame'];
  // "is this overflow the mechanism rather than a defect?"
  const isMechanism = el => (ROLES
    ? ROLES.withinRole(el, MECHANISM_ROLES)
    : !!el.closest(INTENTIONAL_OVERFLOW)) || !!el.closest(THIRD_PARTY);
  /* "Is this closed rather than broken?" A closed accordion is height 0 with its content
   * inside it — that is what closed MEANS. All three FAQ panels on one page were reported
   * as collapsed flex containers in WebKit and not Chromium, which then surfaced as a
   * phantom cross-browser defect on every single run. */
  const isClosedPanel = el => ROLES
    ? ROLES.withinRole(el, ['disclosureClosed', 'disclosureTarget'])
    : !!el.closest(CLOSED_PANEL);
  // "Is this a scrim?" — an out-of-flow layer over its parent, holding nothing of its own.
  const isScrim = el => ROLES ? ROLES.has(el, 'scrim') : OVERLAY_NAME.test(cls(el));
  const pageOverflow = document.documentElement.scrollWidth > vw + 1;
  /* An element past the right edge is only a *scrolling* defect if nothing above it clips.
   * Class-name allowlists miss most cases (a track called `benefits_track`, an absolutely
   * positioned stat card that was never repositioned for mobile), so ask the DOM instead:
   * walk the ancestors for an overflow-x that clips or scrolls. If one exists the page
   * cannot scroll sideways — but the element may still be visibly sliced in half, which is a
   * different, weaker finding that has to be confirmed on a screenshot. Reporting the two
   * together produced 8 "overflow" findings at 393px on a page with docWidth 378 < vw 393. */
  const clipsX = el => { let a = el.parentElement;
    while (a && a !== document.documentElement) {
      if (/hidden|clip|auto|scroll/.test(getComputedStyle(a).overflowX)) return true;
      a = a.parentElement; }
    return false; };
  const past = all.filter(el => { const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > vw + 2 && r.left < vw && r.left >= -0.5 && r.width <= vw + 200
      && !isMechanism(el); })
    .map(el => { const r = el.getBoundingClientRect();
      return { el: desc(el), right: Math.round(r.right), width: Math.round(r.width),
               overBy: Math.round(r.right - vw), containedByClippingAncestor: clipsX(el) }; })
    .sort((a, b) => b.overBy - a.overBy);
  const stickOut = past.filter(o => !o.containedByClippingAncestor).slice(0, 12);
  // visually sliced but contained — SUSPECTED, needs a screenshot
  const cutOff = past.filter(o => o.containedByClippingAncestor).slice(0, 12)
    .map(o => ({ ...o, note: 'clipped by an ancestor — does NOT cause sideways scroll, but is cut off on screen; confirm on a screenshot' }));

  /* 2) CLIPPED TEXT — content truncated by an overflow:hidden box.
   *
   * The naive version of this check (any scrollHeight > clientHeight + 4) was the single
   * noisiest thing in the whole sweep, and every one of its findings was a false one:
   *   - `<style>` embeds. A section containing a style block has CSS in its textContent, so
   *     it reported "/* Section ground. Conic gradi…" as clipped copy. innerText excludes it.
   *   - Screen-reader labels. `.u-visually-hidden` ("Slide 1 of 4") is a 1px box by design;
   *     of course its content overflows.
   *   - Carousel viewports. A track of slides is wider than its clipping frame — that IS
   *     the mechanism.
   *   - Closed accordions. A collapsed panel is height 0 with its content inside it.
   *   - Text-mask reveals, and this is the subtle one: a heading wrapped in overflow:hidden
   *     for a slide-up animation overflows vertically by a few pixels of line-height, and
   *     the amount differs per engine. That produced "clippedText chromium=6 webkit=10" on
   *     every run — a cross-browser bug report generated purely by font rounding.
   * Hence: real text, real amount (a truncation hides a meaningful fraction of the box),
   * and none of the five structures above. */
  const VISUALLY_HIDDEN = el => { const c = getComputedStyle(el);
    return /inset\(50%|circle\(0/.test(c.clipPath) || (el.clientWidth <= 2 && el.scrollWidth > 8) ||
      parseFloat(c.textIndent) < -900 || /visually-hidden|sr-only|screen-reader/.test(cls(el)); };
  const CLOSED_PANEL = '[aria-hidden="true"],[class*="accordion"],[class*="faq"],[class*="panel"],' +
    '[class*="dropdown"],[class*="submenu"],details:not([open])';
  const clipped = all.filter(el => { const c = getComputedStyle(el);
    if (!/hidden|clip/.test(c.overflowX + c.overflowY)) return false;
    const text = (el.innerText || '').trim();                            // excludes style/script/hidden
    if (text.length < 2) return false;
    if (VISUALLY_HIDDEN(el)) return false;
    if (isMechanism(el) || isClosedPanel(el)) return false;
    /* Ancestors of a carousel, not just its parts. `section.services` has `overflow-x:clip`
     * and a slide track inside it, so the SECTION reports scrollWidth 2243 against
     * clientWidth 378 and gets reported — at every mobile width, on every run — as 1865px of
     * clipped copy. Excluding the track itself was not enough: whatever contains it inherits
     * its scroll width, and the track's own class (`services_track`) matches no slider name
     * anybody would think to list — nor is the track itself wide: the SLIDES hang off it.
     * So ask where the overflow comes from: if a slide sits past this element's own edge,
     * the carousel is the mechanism and there is nothing here to fix. */
    const box = el.getBoundingClientRect();
    if (Array.from(el.querySelectorAll(INTENTIONAL_OVERFLOW)).some(t => {
      const r = t.getBoundingClientRect();
      return r.width > 0 && (r.right > box.right + 4 || r.left < box.left - 4); })) return false;
    const dx = el.scrollWidth - el.clientWidth, dy = el.scrollHeight - el.clientHeight;
    // a real truncation hides a meaningful share of the box, not 5px of line-height
    const bigX = dx > 4 && dx > el.clientWidth * 0.04;
    const bigY = dy > 8 && dy > el.clientHeight * 0.15;
    return bigX || bigY; })
    .filter(el => el.children.length <= 3)                              // leaf-ish, reduce noise
    .map(el => ({ el: desc(el), text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      axis: el.scrollWidth - el.clientWidth > 4 ? 'horizontal' : 'vertical',
      hidesPx: Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight),
      scrollW: el.scrollWidth, clientW: el.clientWidth })).slice(0, 10);

  // 3) IMAGES — broken (naturalWidth 0) or distorted (display aspect ≠ natural, no object-fit)
  const imgs = Array.from(document.images).map(img => { const r = img.getBoundingClientRect(); if (r.width < 4) return null;
    const of = getComputedStyle(img).objectFit;
    const dispAR = r.width / r.height, natAR = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : dispAR;
    const distorted = of === 'fill' || (of !== 'cover' && of !== 'contain' && Math.abs(dispAR - natAR) / natAR > 0.05);
    // `img.complete` matters: naturalWidth is 0 for an image that hasn't decoded yet, so
    // auditing mid-load reports perfectly good files as broken. Three of four "broken
    // images" on one run were exactly this — the SVG icons measured 17, 33 and 28px wide
    // a second later. Only a *finished* load with no intrinsic size is a real failure.
    if (img.naturalWidth === 0) return img.complete
      ? { el: desc(img), issue: 'broken — load finished with no intrinsic size (404 or undecodable file)',
          src: (img.currentSrc || img.src).slice(-40) }
      : { el: desc(img), issue: 'still loading when audited — NOT a defect, re-check before reporting',
          src: (img.currentSrc || img.src).slice(-40), severity: 'info' };
    if (distorted) return { el: desc(img), issue: 'aspect distorted', objectFit: of, dispAR: +dispAR.toFixed(2), natAR: +natAR.toFixed(2) };
    return null; }).filter(Boolean).slice(0, 10);

  /* 3b) EMPTY MEDIA SLOTS — the container was built and sized, and holds no media.
   *
   * The whole image-auditing family above can only inspect images that EXIST. It has nothing
   * to say about the opposite and more damaging case: a correctly sized, correctly positioned
   * media box with nothing in it. One page shipped three of them — a 1100×471 hero holding
   * only its gradient overlay, a 646×363 video slot, and a 510×604 portrait slot — and every
   * automated check passed the page while the design's photography was simply absent.
   *
   * Two signals, either sufficient, both needed to avoid noise:
   *   - the element's own naming says it is media (media/image/img/photo/thumb/video/poster), or
   *   - it is a large block whose only child is an overlay/gradient — the tell-tale of a
   *     figure whose <img> sibling was never placed, since nobody writes a gradient over nothing.
   * Then require: no img/video/picture/svg/iframe/canvas inside, no background-image, and a
   * real box. Layout placeholders (spacers, grid cells) are excluded by the size floor and by
   * requiring either the naming or the overlay child. */
  const MEDIA_NAME = /(^|[-_])(media|image|img|photo|picture|thumb(nail)?|video|poster|cover|banner|avatar|figure)([-_]|$)/i;
  const OVERLAY_NAME = /(overlay|grad(ient)?|scrim|tint|veil)/i;
  const emptyMediaSlots = [];
  for (const el of all) {
    if (emptyMediaSlots.length >= 10) break;
    if (/^(img|svg|video|picture|source|iframe|canvas|input|button|a)$/i.test(el.tagName)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 200 || r.height < 150) continue;
    if (el.querySelector('img,video,picture,svg,iframe,canvas,object')) continue;
    /* The overlay is not the slot. `hero-service_media-grad` and `who-help_panel-media-grad`
     * both satisfy the media naming rule and are *supposed* to be empty — they are the tint that
     * sits over the picture. Reporting them found the hero twice and invented a fourth finding
     * for a panel whose image is present and correct, one level up. Skip overlays themselves,
     * and skip any element whose parent already holds media (i.e. the overlay is doing its job). */
    if (isScrim(el)) continue;
    const par = el.parentElement;
    const c = getComputedStyle(el);
    if (c.backgroundImage && c.backgroundImage !== 'none' && /url\(/.test(c.backgroundImage)) continue;
    if ((el.innerText || '').trim().length > 0) continue;      // it holds copy, not media
    const kids = Array.from(el.children);
    const namedMedia = MEDIA_NAME.test(cls(el));
    const onlyOverlay = kids.length > 0 && kids.every(k => isScrim(k) || OVERLAY_NAME.test(cls(k)));
    if (!namedMedia && !onlyOverlay) continue;
    // don't report a slot and its ancestor as two findings
    if (emptyMediaSlots.some(s => s._el === par)) continue;
    if (kids.length > 2) continue;                             // a real layout container
    emptyMediaSlots.push({
      _el: el,
      el: desc(el), width: Math.round(r.width), height: Math.round(r.height),
      docY: Math.round(r.top + scrollY),
      holds: kids.length ? kids.map(k => desc(k)).join(' + ') : '(nothing)',
      background: c.backgroundColor,
      why: namedMedia ? 'element is named as media and contains none'
                      : 'large block whose only child is an overlay/gradient — the <img> it was meant to sit over is missing',
      confidence: 'measured',
      hint: 'sized media container with no image, video or background-image. Check whether a CMS ' +
            'image field is empty rather than the element never being placed.'
    });
  }

  // 4) CONTRAST — text vs effective background below WCAG AA
  const seenC = new Set(), lowContrast = [], contrastUnverifiable = [];
  for (const el of all) {
    if (!el.childNodes.length) continue;
    const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    /* Zero-box elements must never reach the sampler. A CMS list keeps hidden template
     * copies, and the mobile nav is `display:none` at desktop — their descendants report
     * `display:block` themselves, pass the visibility filter, and measure 0×0. The text
     * point then falls back to the element's origin, which for a 0×0 box is (0,0): the
     * top-left corner of the page. Every such element was measured against whatever sits in
     * that corner and reported as "white text on white, ratio 1.0". Nothing was wrong with
     * any of them; they are not on the page. */
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) continue;
    if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false })) continue;
    const c = getComputedStyle(el); const fg = rgb(c.color); if (fg.length < 3) continue;
    const B = effBg(el);
    if (B.unverifiable) {
      const k = 'u|' + c.color + '|' + B.unverifiable;
      if (!seenC.has(k)) { seenC.add(k);
        contrastUnverifiable.push({ el: desc(el), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30),
          color: c.color, sitsOn: B.unverifiable + ' (' + B.over + ')', fontSize: c.fontSize,
          hint: 'text sits on imagery — CSS cannot give a ratio. Judge it on the screenshot, ' +
            'and check the light AND dark parts of the picture' }); }
      continue;
    }
    const bg = B.bg;
    const cr = ratio(fg.slice(0, 3), bg);
    const fs = parseFloat(c.fontSize), bold = +c.fontWeight >= 700;
    const large = fs >= 24 || (fs >= 18.66 && bold); const min = large ? 3 : 4.5;
    if (cr < min) { const k = c.color + '|' + bg.join(',');
      if (!seenC.has(k)) { seenC.add(k);
        lowContrast.push({ el: desc(el), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30),
          ratio: +cr.toFixed(2), need: min, color: c.color, bg: 'rgb(' + bg.join(',') + ')', fontSize: c.fontSize }); } }
  }
  lowContrast.sort((a, b) => a.ratio - b.ratio);

  // 5) INVISIBLE TEXT — colour equals background
  const invisible = lowContrast.filter(x => x.ratio < 1.15).map(x => x.el);

  // 6) TINY TAP TARGETS (mobile only) — interactive elements under ~24px
  const tiny = mobile ? all.filter(el => /^(a|button)$/i.test(el.tagName) || el.getAttribute('role') === 'button')
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); })
    .map(el => { const r = el.getBoundingClientRect(); return { el: desc(el), w: Math.round(r.width), h: Math.round(r.height),
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 20) }; }).slice(0, 10) : [];

  // 7) UNINTENDED TEXT WRAPPING — short labels/buttons breaking to 2+ lines
  // (e.g. a nav button rendering "GET A / QUOTE"). Count rendered line-boxes by
  // clustering the y-tops of the element's text rects; flag short text on >1 line.
  const lineCount = el => {
    // measure only TEXT-node rects so an icon on a different baseline can't be
    // mistaken for a second line — count distinct y-tops clustered by line-height.
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange(); const ys = []; let n;
    while ((n = walker.nextNode())) { if (!n.textContent.trim()) continue; range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 3) ys.push(r.top); }
    ys.sort((a, b) => a - b);
    const tol = (parseFloat(getComputedStyle(el).fontSize) || 14) * 0.6;
    let lines = 0, last = -1e9; for (const y of ys) if (y - last > tol) { lines++; last = y; }
    return lines || 1;
  };
  const seenW = new Set(), wrapping = [];
  all.filter(el => {
    const t = (el.textContent || '').trim();
    if (!t || t.length > 42 || t.split(/\s+/).length > 6) return false;
    return /^(a|button)$/i.test(el.tagName) ||
      /\b(btn|button|tab|pill|chip|eyebrow|label|nav[_-]?link|badge)\b/i.test((el.className || '').toString());
  }).forEach(el => {
    const lines = lineCount(el); if (lines <= 1) return;
    const k = desc(el) + '|' + el.textContent.trim().slice(0, 24); if (seenW.has(k)) return; seenW.add(k);
    wrapping.push({ el: desc(el), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30),
      lines, words: el.textContent.trim().split(/\s+/).length, whiteSpace: getComputedStyle(el).whiteSpace });
  });

  // 8) COLLAPSED ELEMENTS — 0-width or 0-height while still rendered. Classic cause:
  // position:absolute (or a flex/grid/float container) with no intrinsic size, so it
  // and its contents collapse and silently disappear (e.g. slider arrows at 0px).
  // checkVisibility() distinguishes "collapsed but in the render tree" from
  // "hidden by a display:none ancestor" — we only want the former.
  const isRendered = el => el.checkVisibility
    ? el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: false })
    : (el.offsetParent !== null || getComputedStyle(el).position === 'fixed');
  const collapsed = all.filter(el => {
    if (/^(br|wbr|script|style|template|option|option|source|track)$/i.test(el.tagName)) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    /* A closed accordion panel is height 0 *on purpose* — that is what closed means. All
     * three FAQ panels reported as "flex/grid container collapsed" in WebKit and not in
     * Chromium, which then surfaced as a phantom cross-browser defect on every run. A panel
     * is identified structurally: zero height, clipped, and either a disclosure target
     * (`aria-controls` points at it) or inside an accordion/dropdown. */
    if (el.id && document.querySelector(`[aria-controls="${el.id}"]`)) return false;
    if (isClosedPanel(el) && /hidden|clip/.test(getComputedStyle(el).overflow + getComputedStyle(el).overflowY)) return false;
    if (el.closest('.marker-app,[class*="intercom"],[id*="hubspot"],[class*="chat-widget"]')) return false; // third-party widgets
    const r = el.getBoundingClientRect();
    const zero = r.width < 1 || r.height < 1;
    if (!zero) return false;
    // code embeds (only script/style/link children) legitimately have no size — skip
    const kids = Array.from(el.children);
    if (kids.length && kids.every(k => /^(script|style|link|template|noscript)$/i.test(k.tagName))) return false;
    if (/\bw-embed\b|\bw-code\b/.test((el.className || '').toString()) && !el.textContent.trim()) return false;
    // must have something that ought to occupy space
    const hasContent = el.childElementCount > 0 || el.textContent.trim() ||
      /^(img|svg|input|a|button)$/i.test(el.tagName);
    if (!hasContent) return false;
    // ignore the standard visually-hidden a11y pattern (1px clip, not 0)
    const c = getComputedStyle(el);
    if (c.position === 'absolute' && c.clip !== 'auto' && r.width <= 1 && r.height <= 1) return false;
    return isRendered(el);
  }).map(el => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    const hint = (c.position === 'absolute' || c.position === 'fixed')
      ? `${c.position} with no ${r.height < 1 ? 'height' : 'width'} — needs explicit size or inset`
      : (/flex|grid/.test(c.display) ? 'flex/grid container collapsed (children not sized?)'
        : 'collapsed container (float/empty/height:0?)');
    return { el: desc(el), w: Math.round(r.width), h: Math.round(r.height),
      position: c.position, display: c.display, children: el.childElementCount, hint };
  }).slice(0, 15);


  /* ── the box-model family ───────────────────────────────────────────────────────
   * Everything above answers "does anything stick out of the VIEWPORT". That is one
   * question out of four, and on a page that fits the viewport it returns nothing while
   * the layout is visibly broken. One home hero settled the argument:
   * docScrollWidth < clientWidth at all eight breakpoints, no clipped text, no collapsed
   * element — and between 992px and 1190px the absolutely positioned testimonial card sat
   * on top of the "1.2x" stat card and hid the number. Nothing in the sweep could see it.
   *
   * The three questions the viewport check cannot answer:
   *   - does a child leave its PARENT's box (clipped by it, or painted over its neighbours)
   *   - does one box COVER another's content (the out-of-flow collision)
   *   - can the text physically FIT the box it was given (the long-word case)
   * Each is measured geometrically below, and each carries its own exclusions, because the
   * naive form of all three fires on every carousel, hover-slide and marquee on the page. */

  const areaOf = r => Math.max(0, r.width) * Math.max(0, r.height);
  const inter = (a, b) => { const x = Math.min(a.right, b.right) - Math.max(a.left, b.left),
      y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 0 && y > 0 ? { x, y, area: x * y } : null; };
  const docRect = el => { const r = el.getBoundingClientRect();
    return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY,
      bottom: r.bottom + scrollY, width: r.width, height: r.height }; };
  const outOfFlow = c => /absolute|fixed|sticky/.test(c.position) || c.transform !== 'none' ||
    ['marginLeft', 'marginRight', 'marginTop', 'marginBottom'].some(m => parseFloat(c[m]) < 0);
  /* A clip box the size of one child holding two identical children, with `transition:
   * transform` on them, is the hover-slide arrow — every button on this site has one, and
   * the naive parent-overflow check reported 11 of them as defects. The mechanism IS the
   * overflow, so the tell is the transition, not the class name. */
  /* `transition-property` initialises to `all` on EVERY element, so testing the property
   * alone excused the entire page from this check and it reported nothing, anywhere. A
   * transition only exists if it has a duration. */
  const animatesPosition = el => { const c = getComputedStyle(el);
    const moves = /transform|all|left|top|translate/.test(c.transitionProperty) &&
      (c.transitionDuration || '').split(',').some(v => parseFloat(v) > 0);
    return moves || c.animationName !== 'none'; };
  const SCROLLS = el => /auto|scroll/.test(getComputedStyle(el).overflowX + getComputedStyle(el).overflowY);
  const REVEALABLE = '[class*="dropdown"],[class*="submenu"],[class*="tooltip"],[class*="popover"],' +
    '[class*="modal"],[class*="lightbox"],[role="dialog"],[role="menu"],[role="tooltip"],nav';

  /* 10) ESCAPES ITS PARENT — the child's border box lies outside the parent's padding box.
   *
   * Two outcomes, and they are different findings: if anything between the child and the
   * root clips, the part outside is simply GONE from the screen (`clipped`); if nothing
   * clips, it paints over whatever is next to it (`spills`) and may or may not also push
   * the document wider — check 1 owns that half.
   *
   * Excluded, in the order the noise appeared on real pages: slider/marquee tracks (a track
   * IS wider than its frame), anything inside a scrollable ancestor (the reader can reach
   * it), out-of-flow children (an absolutely positioned card is *placed*, not escaping —
   * check 11 judges those), SVG internals, hover-slide icons, and decorative boxes with no
   * text or media, since a clipped gradient costs nobody anything. */
  const escapesRaw = [];
  for (const el of all) {
    const p = el.parentElement;
    if (!p || p === document.documentElement) continue;
    if (isMechanism(el) || el.closest(REVEALABLE)) continue;
    if (el.closest('svg') || /^(svg|use|path|g|defs|circle|rect|line|polygon|tspan)$/i.test(el.tagName)) continue;
    const c = getComputedStyle(el), pc = getComputedStyle(p);
    if (outOfFlow(c)) continue;                       // placed on purpose — see check 11
    if (/inline/.test(c.display) && !/inline-block|inline-flex|inline-grid/.test(c.display)) continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (r.width < 1 || pr.width < 1 || pr.height < 1) continue;
    const pad = s => parseFloat(pc[s]) || 0;
    const over = {
      right: r.right - (pr.right - pad('paddingRight')), left: (pr.left + pad('paddingLeft')) - r.left,
      bottom: r.bottom - (pr.bottom - pad('paddingBottom')), top: (pr.top + pad('paddingTop')) - r.top };
    const h = Math.max(over.left, over.right), v = Math.max(over.top, over.bottom);
    // subpixel and rounding noise: require both an absolute and a proportional amount
    const realH = h > 2 && h > pr.width * 0.01, realV = v > 2 && v > pr.height * 0.02;
    if (!realH && !realV) continue;
    // find the nearest ancestor that decides what happens to the part outside
    let clipper = null, scroller = null;
    for (let a = p; a && a !== document.documentElement; a = a.parentElement) {
      const ac = getComputedStyle(a);
      const o = ac.overflowX + ' ' + ac.overflowY;
      if (/auto|scroll/.test(o)) { scroller = a; break; }
      if (/hidden|clip/.test(o)) { clipper = a; break; }
    }
    if (scroller) continue;                            // reachable by scrolling — not a defect
    /* Finding an `overflow:hidden` ancestor is not the same as being clipped by it. `body`
     * and most wrappers carry `overflow:hidden` to stop sideways scroll, and an element
     * overflowing its own parent halfway down the page sits well inside them — nothing is
     * cut. Reported as "clipped by body#home", which was wrong twice over: nothing is
     * missing from the screen, and the reader is sent to look at the wrong element. Ask
     * whether the escaping part actually falls outside the clipper's box. */
    if (clipper) { const cb = clipper.getBoundingClientRect();
      const outside = r.right > cb.right + 1 || r.left < cb.left - 1 ||
        r.bottom > cb.bottom + 1 || r.top < cb.top - 1;
      if (!outside) clipper = null;
    }
    // decoration leaving its box costs nobody anything; content leaving it does
    const text = (el.innerText || '').trim();
    const media = el.querySelector('img,video,picture,canvas') ||
      /^(img|video|picture|canvas)$/i.test(el.tagName);
    if (text.length < 2 && !media) continue;
    if (clipper && (animatesPosition(el) || animatesPosition(p))) continue;  // hover-slide / reveal
    const fs = parseFloat(c.fontSize) || 16, lh = parseFloat(c.lineHeight) || fs;
    escapesRaw.push({ _el: el,
      el: desc(el), parent: desc(p),
      axis: realH && realV ? 'both' : (realH ? 'horizontal' : 'vertical'),
      outsideBy: Math.round(Math.max(h, v)), side: h >= v
        ? (over.right >= over.left ? 'right' : 'left') : (over.bottom >= over.top ? 'bottom' : 'top'),
      box: Math.round(r.width) + '×' + Math.round(r.height),
      parentBox: Math.round(pr.width) + '×' + Math.round(pr.height),
      docY: Math.round(r.top + scrollY),
      outcome: clipper ? 'clipped' : 'spills',
      clippedBy: clipper ? desc(clipper) : undefined,
      text: text.replace(/\s+/g, ' ').slice(0, 30) || undefined,
      cause: realV && lh < fs * 0.95
        ? `line-height ${c.lineHeight} is shorter than font-size ${c.fontSize} — glyphs paint outside their line boxes`
        : (pc.display === 'grid' || pc.display === 'flex')
          ? `${pc.display} child larger than the track it was given`
          : 'child box wider/taller than the parent content box',
      confidence: 'measured',
      hint: clipper
        ? `part of this element is not on screen — cut off by ${desc(clipper)}. Confirm on the screenshot.`
        : 'paints outside its parent onto whatever is next to it; check the neighbour for a collision'
    });
  }
  // one row per (element, parent) shape — CMS lists repeat the same defect per item
  const escSeen = new Map();
  for (const e of escapesRaw) {
    const k = e.el + '>' + e.parent + '|' + e.axis + '|' + e.outcome;
    const prev = escSeen.get(k);
    if (!prev) escSeen.set(k, { ...e, occurrences: 1 });
    else { prev.occurrences++; if (e.outsideBy > prev.outsideBy) Object.assign(prev, e, { occurrences: prev.occurrences }); }
  }
  const escapesParent = Array.from(escSeen.values())
    .sort((a, b) => b.outsideBy - a.outsideBy).slice(0, 12)
    .map(({ _el, ...rest }) => rest);

  /* 11) ONE BOX COVERING ANOTHER'S CONTENT — the out-of-flow collision.
   *
   * This is the defect class that ends "…and the client says the hero is broken". An
   * absolutely positioned card is placed by hand at one width; at another width the
   * container is narrower, the card lands somewhere else, and it covers a number, a face,
   * or a line of copy. No element overflows anything, so every check above stays silent.
   *
   * Requirements, all of them, or this check reports every gradient overlay on the page:
   *   - the coverer is out of flow (absolute/fixed/negative margin/transform) and OPAQUE
   *     enough to hide what is underneath — a 15%-white scrim over a photo is a design
   *   - the covered thing is real content: rendered TEXT rects (measured with a Range, so
   *     the box's padding cannot make it look covered) or an image
   *   - the coverer paints ABOVE the covered element, decided by z-index then document
   *     order, and confirmed by a hit test whenever the point is on screen
   *   - neither contains the other, and the overlap is big enough to matter */
  /* Paint order at a point ANYWHERE in the document, not just the part on screen.
   *
   * Geometry says two boxes intersect. Only a hit test says the reader cannot see through to
   * what is underneath — and the audit runs at scroll 0, so every collision below the fold
   * was being reported unverified. webflow.com is the case that makes this necessary rather
   * than nice: it layers a "machine mode" easter egg of JSON text under its headings, fully
   * visible by every CSS test, with an opaque layer painted in between. Geometrically two
   * runs of text share pixels; to a reader nothing is wrong. The hit test knows the
   * difference. Scroll is restored before returning.
   *
   * Sticky and fixed boxes are excluded from the scrolling path: their document rect is a
   * function of the scroll position, so measuring them at one offset and hit-testing at
   * another compares two different layouts. */
  const savedScroll = { x: scrollX, y: scrollY };
  /* Whether window scrolling moves this page AT ALL. A smooth-scroll library (Lenis,
   * Locomotive) translates a wrapper instead, so `scrollY` never changes and every
   * off-screen hit test silently fails — which must be reported as a coverage limit, not
   * quietly turned into a page full of unverified findings. */
  let windowScrolls = null;
  const probeScroll = () => { if (windowScrolls !== null) return windowScrolls;
    if (document.documentElement.scrollHeight <= vh + 4) return (windowScrolls = false);
    const before = scrollY;
    scrollTo({ left: scrollX, top: before + 120, behavior: 'instant' });
    windowScrolls = scrollY !== before;
    scrollTo({ left: savedScroll.x, top: before, behavior: 'instant' });
    return windowScrolls; };
  const stackAtDoc = (docX, docY) => {
    let vx = docX - scrollX, vy = docY - scrollY;
    if (vx >= 0 && vx < vw && vy >= 0 && vy < vh) return document.elementsFromPoint(vx, vy);
    if (!probeScroll()) return null;
    /* `behavior:'instant'` is load-bearing: a site with `html{scroll-behavior:smooth}`
     * animates a bare scrollTo, so the offset has not changed by the time the next line
     * reads it, the point is still off screen, and every finding comes back unverified. */
    scrollTo({ left: Math.max(0, docX - vw / 2), top: Math.max(0, docY - vh / 2), behavior: 'instant' });
    vx = docX - scrollX; vy = docY - scrollY;
    if (vx < 0 || vx >= vw || vy < 0 || vy >= vh) return null;
    return document.elementsFromPoint(vx, vy);
  };
  const anchored = el => { for (let n = el; n && n !== document.documentElement; n = n.parentElement)
      if (/fixed|sticky/.test(getComputedStyle(n).position)) return true;
    return false; };
  const namedAncestor = el => { let n = el;
    while (n && n !== document.body && !cls(n)) n = n.parentElement;
    return n && n !== document.body ? n : el; };
  const zOf = el => { for (let n = el; n && n !== document.body; n = n.parentElement) {
      const c = getComputedStyle(n); if (c.position !== 'static' && c.zIndex !== 'auto') return parseFloat(c.zIndex) || 0; }
    return 0; };
  const paintsAbove = (a, b) => { const za = zOf(a), zb = zOf(b);
    if (za !== zb) return za > zb;
    return !!(b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING); };
  const opaqueEnough = el => { const c = getComputedStyle(el);
    if (c.backdropFilter && c.backdropFilter !== 'none') return true;
    if (/url\(/.test(c.backgroundImage)) return true;
    const p = rgb(c.backgroundColor);
    const a = p.length >= 3 ? (p[3] === undefined ? 1 : p[3]) : 0;
    return a >= 0.5 && +c.opacity >= 0.5;
  };
  /* Rendered text rects, in document space, measured once — INCLUDING open shadow roots.
   *
   * That last part is not a nicety. The two numbers this hero exists to show ("100+" and
   * "1.2x") are rendered by a `<code-island>` counter component: every glyph lives in a
   * shadow root, so `innerText` on the stat is the empty string and a light-DOM text walk
   * finds nothing at all. Every text-based check in this file is blind to text like that.
   * Descend into open shadow roots and report against the light-DOM host, which is the
   * element a person can actually find in their editor. Closed roots stay invisible —
   * nothing can be measured through them, and that is a stated limit, not a clean result. */
  /* The nearest box that actually clips this element, crossing shadow boundaries by way of
   * the host. Returns null when nothing clips it. */
  const clipBoxOf = start => {
    let box = null;
    let node = start;
    for (let hops = 0; node && hops < 60; hops++) {
      const parent = node.parentElement || (node.parentNode && node.parentNode.host) || null;
      if (!parent) break;
      const pc = getComputedStyle(parent);
      if (/hidden|clip/.test(pc.overflowX + pc.overflowY)) {
        const b = parent.getBoundingClientRect();
        if (b.width > 0 && b.height > 0) box = box ? { left: Math.max(box.left, b.left), right: Math.min(box.right, b.right),
          top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom) } : { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      }
      node = parent;
    }
    return box;
  };
  const textRects = [];
  const shadowEntries = new Map();
  const collectText = (root, owner, depth) => {
    for (const el of root.querySelectorAll('*')) {
      if (textRects.length >= 900) return;
      if (/^(script|style|noscript|template|option)$/i.test(el.tagName)) continue;
      const c = getComputedStyle(el);
      if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) continue;
      /* An element's own opacity is not the question — its ANCESTORS' is. webflow.com layers
       * a "machine mode" easter egg of JSON-LD text under its headings inside a wrapper at
       * opacity 0; every one of those paragraphs reports opacity 1 itself, so the collision
       * check reported three headings as sitting on top of invisible text. `checkOpacity`
       * asks the question properly, up the whole chain. */
      /* Descend BEFORE the visibility gate: `checkVisibility()` answers false for a
       * `display:contents` element — it generates no box — and the counter component whose
       * digits this whole path exists to reach is exactly that. Gating first threw the
       * numbers away again. */
      if (el.shadowRoot && depth < 4) collectText(el.shadowRoot, owner || el, depth + 1);
      if (c.display !== 'contents' && el.checkVisibility &&
        !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) continue;
      if (VISUALLY_HIDDEN(el)) continue;
      /* Single-character text nodes count inside a component and not outside it. An
       * odometer counter renders one digit per text node, so the ordinary `length > 1`
       * filter — which exists to skip stray punctuation — silently discarded every glyph
       * of "1.2x" and the check found nothing to protect. */
      const min = owner ? 1 : 2;
      const tns = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim().length >= min);
      if (!tns.length) continue;
      const rg = document.createRange(); const rects = [];
      /* Clip each rect by whatever actually clips it on screen. The odometer stacks all ten
       * digits in an overflow:hidden column, so the raw rects describe a strip ten times
       * taller than the number anybody sees, and unclipped they invent overlap where there
       * is none. The first attempt clipped to the shadow HOST instead, which measured 0×0 —
       * `code-island` is `display:contents` — and threw every glyph away. Ask the clipper. */
      const hostBox = clipBoxOf(el);
      for (const n of tns) { rg.selectNodeContents(n);
        for (const b of rg.getClientRects()) {
          let left = b.left, right = b.right, top = b.top, bottom = b.bottom;
          if (hostBox) { left = Math.max(left, hostBox.left); right = Math.min(right, hostBox.right);
            top = Math.max(top, hostBox.top); bottom = Math.min(bottom, hostBox.bottom); }
          if (right - left > 4 && bottom - top > 4)
            rects.push({ left: left + scrollX, right: right + scrollX, top: top + scrollY,
              bottom: bottom + scrollY, width: right - left, height: bottom - top }); }
      }
      if (!rects.length) continue;
      // `ref` is what the DOM comparisons use: a shadow node has no ancestry a light-DOM
      // `contains()` or document-order test can reason about, so relations go via the host.
      if (owner) {
        const prev = shadowEntries.get(owner);
        if (prev) { if (prev.rects.length < 60) prev.rects.push(...rects); }
        else { const entry = { el, ref: owner, inShadow: true, rects, kind: 'text' };
          shadowEntries.set(owner, entry); textRects.push(entry); }
      } else textRects.push({ el, ref: el, inShadow: false, rects, kind: 'text' });
    }
  };
  collectText(document.body, null, 0);
  /* Images are deliberately NOT covered targets. A card laid over the corner of a hero
   * photograph is the single most common composition on a marketing page, and the first
   * version of this check reported three of them on this hero — the two stat cards and the
   * testimonial, each "covering" 9–18% of the picture — while missing the one real defect
   * underneath. Overlapping a photograph is composition; covering TEXT is content loss.
   * Only text is judged here; a buried image has to be found by eye on the screenshot. */
  const coverers = all.filter(el => {
    if (isMechanism(el) || el.closest(REVEALABLE)) return false;
    if (isScrim(el)) return false;          // a scrim's purpose is to sit on top of things
    const c = getComputedStyle(el);
    if (!outOfFlow(c) || !opaqueEnough(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 24 && r.height > 24;
  });
  const overlaps = [];
  for (const cov of coverers) {
    const cr = docRect(cov);
    for (const t of textRects) {
      if (t.ref === cov || cov.contains(t.ref) || t.ref.contains(cov)) continue;
      if (!paintsAbove(cov, t.ref)) continue;
      let worst = null, totalCovered = 0, totalArea = 0;
      for (const r of t.rects) { totalArea += areaOf(r);
        const i = inter(cr, r); if (!i) continue; totalCovered += i.area;
        if (!worst || i.area > worst.area) worst = { ...i, r }; }
      if (!worst) continue;
      // a line of text is hidden when a real slice of a line box is under the other box
      /* Calibrated against the defect this check exists for. The testimonial card covered
       * the left 13px of a 62px-tall "1.2x", i.e. 30px of the line box and 6% of the text
       * area — and a 6px/50%/8% threshold rejected all three of those, reporting nothing on
       * a hero where a number was visibly half hidden. A slice of a line box a reader would
       * notice is smaller than instinct suggests; these are the numbers that catch it. */
      const line = worst.r.height;
      if (!(worst.x >= 5 && worst.y >= line * 0.3) && totalCovered < totalArea * 0.04) continue;
      /* Confirm with the paint stack when the point is on screen. Geometry says the boxes
       * intersect; only a hit test says the reader cannot see through to the content. */
      const cx = Math.max(cr.left, worst.r.left) + Math.min(worst.x, 20) / 2;
      const cy = Math.max(cr.top, worst.r.top) + worst.y / 2;
      let confirmed = null;
      const stack = anchored(cov) || anchored(t.ref) ? null : stackAtDoc(cx, cy);
      if (stack) {
        const iCov = stack.findIndex(n => n === cov || cov.contains(n));
        const iTgt = stack.findIndex(n => n === t.ref || t.ref.contains(n));
        if (iCov < 0) continue;                                    // not actually on top there
        confirmed = iTgt < 0 || iCov < iTgt;
        if (!confirmed) continue;
      }
      /* Name it the way the person fixing it will find it. A shadow host is often an
       * unnamed custom element (`code-island`) whose text is one digit per node, so the raw
       * answer reads `covers: code-island, text: "0"` — true and useless. Report the nearest
       * classed ancestor instead, and say where the text really comes from. */
      const label = t.inShadow ? namedAncestor(t.ref) : t.ref;
      const shownText = (t.inShadow ? (label.innerText || '') : (t.el.textContent || '')).replace(/\s+/g, ' ').trim();
      overlaps.push({
        covers: desc(label) + (t.inShadow ? ' — text rendered inside a web component (shadow DOM)' : ''),
        kind: t.kind,
        text: shownText.slice(0, 30) || (t.inShadow ? '(value rendered by the component, e.g. a counter)' : undefined),
        coveredBy: desc(cov), coveredByPosition: getComputedStyle(cov).position,
        overlap: Math.round(worst.x) + '×' + Math.round(worst.y) + 'px',
        shareOfContent: Math.round((totalCovered / Math.max(totalArea, 1)) * 100) + '%',
        docY: Math.round(worst.r.top),
        confidence: confirmed === null
          ? 'SUSPECTED — geometry only; the point could not be hit-tested (off screen and the page does not window-scroll)'
          : 'measured (hit-tested)',
        hint: 'an out-of-flow box lands on top of content at this width. Absolute placement that ' +
              'was tuned at one breakpoint usually collides at another — check the whole range, not just the boundary.'
      });
      if (overlaps.length >= 12) break;
    }
    if (overlaps.length >= 12) break;
  }

  /* 11b) TEXT ON TOP OF TEXT — whoever put it there.
   *
   * Check 11 needs an out-of-flow box with a background: the "hand-placed card lands on a
   * number" shape. It says nothing about the other half, which is two runs of TYPE sharing
   * the same pixels — a heading that spilled out of its fixed-height box onto the paragraph
   * below (check 10 reports the spill, not the landing), a caption absolutely positioned
   * over a label, a grid whose rows collapsed. There is no coverer to find and no background
   * to test: the defect is simply that two things are legible in the same place, which is to
   * say neither is.
   *
   * Bucketed by document band so this stays linear-ish rather than comparing every pair of
   * text runs on a long page. */
  const bandsOf = t => { const set = new Set();
    for (const r of t.rects) for (let y = Math.floor(r.top / 200); y <= Math.floor(r.bottom / 200); y++) set.add(y);
    return set; };
  const byBand = new Map();
  for (const t of textRects) {
    if (t.el.closest && (isMechanism(t.el) || t.el.closest(REVEALABLE))) continue;
    for (const band of bandsOf(t)) { if (!byBand.has(band)) byBand.set(band, []); byBand.get(band).push(t); }
  }
  const collisionSeen = new Set(), textCollisions = [];
  for (const group of byBand.values()) {
    for (let i = 0; i < group.length && textCollisions.length < 10; i++)
      for (let j = i + 1; j < group.length && textCollisions.length < 10; j++) {
        const A = group[i], B = group[j];
        if (A.ref === B.ref || A.ref.contains(B.ref) || B.ref.contains(A.ref)) continue;
        const key = [desc(A.ref), desc(B.ref)].sort().join(' × ');
        if (collisionSeen.has(key)) continue;
        let hit = null;
        for (const ra of A.rects) for (const rb of B.rects) {
          const i2 = inter(ra, rb); if (!i2) continue;
          /* A real collision covers a slice of a line box, not a rounding artefact between
           * two inline runs sharing a baseline. Calibrated on a heading overhanging its box
           * by 7px of an 18px paragraph line — 39% of that line, plainly visible, and
           * rejected by a 40% rule. The smaller line box is the one that matters. */
          if (i2.x < 5 || i2.y < Math.max(4, Math.min(ra.height, rb.height) * 0.3)) continue;
          if (!hit || i2.area > hit.area) hit = { ...i2, ra, rb };
        }
        if (!hit) continue;
        /* Both runs must be reachable at the point they share. If something else is painted
         * on top of both, they are layered rather than colliding, and the reader sees one
         * thing — which is webflow.com's machine-mode easter egg, not a defect. */
        let verified = null;
        if (!(anchored(A.ref) || anchored(B.ref))) {
          const px = Math.max(hit.ra.left, hit.rb.left) + Math.min(hit.x, 20) / 2;
          const py = Math.max(hit.ra.top, hit.rb.top) + hit.y / 2;
          const st = stackAtDoc(px, py);
          if (st) {
            const iA = st.findIndex(n => n === A.ref || A.ref.contains(n));
            const iB = st.findIndex(n => n === B.ref || B.ref.contains(n));
            if (iA < 0 || iB < 0) continue;                  // one of them is not there at all
            /* Opaque paint BETWEEN the two, not above both. The first version tested
             * `slice(0, min(iA,iB))` — the layers above the upper text — which is empty
             * whenever the upper text is topmost, so the layered case sailed through as a
             * collision. What matters is whether anything hides the lower run from the
             * upper one. */
            const lo = Math.min(iA, iB), hi2 = Math.max(iA, iB);
            if (st.slice(lo + 1, hi2).some(n => { const bg = rgb(getComputedStyle(n).backgroundColor);
              return bg.length >= 3 && (bg[3] === undefined || bg[3] >= 0.9); })) continue;
            verified = true;
          }
        }
        collisionSeen.add(key);
        const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
        textCollisions.push({ a: desc(A.ref), aText: txt(A.el), b: desc(B.ref), bText: txt(B.el),
          overlap: Math.round(hit.x) + '×' + Math.round(hit.y) + 'px',
          docY: Math.round(Math.min(hit.ra.top, hit.rb.top)),

          aPosition: getComputedStyle(A.ref).position, bPosition: getComputedStyle(B.ref).position,
          confidence: verified ? 'measured (hit-tested — nothing opaque between them)'
            : 'SUSPECTED — geometry only. The point could not be hit-tested, so an opaque ' +
              'layer painted between the two would make this a stack rather than a collision',
          hint: 'two runs of text occupy the same pixels. Deliberate overlapping type exists, so ' +
                'confirm on the screenshot — but this is usually one box that stopped growing ' +
                'with its content, or a placement tuned at a different width.' });
      }
  }

  /* Put the page back before anything else measures it. The hit tests above are the only
   * part of this file that moves the viewport, and everything after them reads geometry. */
  if (scrollX !== savedScroll.x || scrollY !== savedScroll.y)
    scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: 'instant' });

  /* The FIT family — "is the text wider than its box" and its `nowrap` twin — used to sit
   * here. It moved to `audit_slack.js`, which owns every question of the form "how much
   * room is left": one measurement answers "already broken", "breaks on the next edit" and
   * "has room", and three copies of "available width" would have drifted apart. Paste that
   * file too when asking a fit question in a console. */

  /* 13) SQUASHED, NOT QUITE GONE — one axis under 4px while the other is substantial.
   * Check 8 catches 0×0. A flex item squashed to 3px wide is just as absent to the reader
   * and just as invisible to a 0×0 test. A 2px divider is not: it holds nothing. */
  const nearlyCollapsed = all.filter(el => {
    if (isMechanism(el) || isClosedPanel(el)) return false;
    const r = el.getBoundingClientRect();
    const thin = (r.width > 0 && r.width < 4 && r.height > 24) || (r.height > 0 && r.height < 4 && r.width > 24);
    if (!thin) return false;
    const holds = (el.innerText || '').trim().length > 1 ||
      el.querySelector('img,video,svg,input,button') || el.childElementCount > 0;
    return !!holds && !VISUALLY_HIDDEN(el);
  }).map(el => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
    return { el: desc(el), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      needs: el.scrollWidth + '×' + el.scrollHeight, display: c.display, flexBasis: c.flexBasis,
      minWidth: c.minWidth, minHeight: c.minHeight, confidence: 'measured',
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 24) || undefined,
      hint: 'squashed to nearly nothing while still holding content — a flex/grid item with ' +
            'min-width:0 and nothing to size it, or a fixed size that lost its content.' }; })
    .slice(0, 10);

  // 9) HEADING SIZES — recorded, not judged. The runner compares this list across
  // breakpoints: a heading that renders at the same px on a 1920 desktop and a 393
  // phone has no responsive type scale, which is the single root cause behind most
  // "reduce the text size here" notes on mobile. One number per heading is enough.
  const headingSizes = Array.from(document.querySelectorAll('h1,h2,h3,h4'))
    .filter(h => h.textContent.trim() && getComputedStyle(h).display !== 'none')
    .map(h => { const c = getComputedStyle(h);
      return { el: desc(h), tag: h.tagName.toLowerCase(), size: c.fontSize, lineHeight: c.lineHeight,
        text: h.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) }; })
    .slice(0, 40);

  // belt and braces: nothing below should have moved the page, but never return with it moved
  if (scrollX !== savedScroll.x || scrollY !== savedScroll.y)
    scrollTo({ left: savedScroll.x, top: savedScroll.y, behavior: 'instant' });

  return {
    viewport: vw + 'x' + vh, breakpoint: mobile ? 'mobile' : (vw <= 991 ? 'tablet' : 'desktop'),
    headingSizes,
    horizontalOverflow: { pageScrollsSideways: pageOverflow, docScrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw, offenders: stickOut, cutOffButContained: cutOff },
    collapsedElements: collapsed,
    nearlyCollapsed,
    /* Stated, not implied: if the page does not window-scroll, every collision below the
     * fold is geometry only. A reader has to know which of the two runs they are reading. */
    hitTesting: windowScrolls === false
      ? 'window scrolling has no effect on this page (transformed or virtual scroller) — ' +
        'collisions below the fold are geometric, not hit-tested'
      : 'off-screen points were reached by scrolling and restored',
    escapesParent,
    overlappingContent: overlaps,
    textCollisions,
    unintendedWrapping: wrapping.slice(0, 12),
    clippedText: clipped,
    imageIssues: imgs,
    emptyMediaSlots: emptyMediaSlots.map(({ _el, ...rest }) => rest),
    lowContrast: lowContrast.slice(0, 12),
    contrastUnverifiable: contrastUnverifiable.slice(0, 10),
    invisibleText: invisible,
    tinyTapTargets: tiny
  };
})();
