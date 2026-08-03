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
  const INTENTIONAL_OVERFLOW = '[class*="slider"],[class*="swiper"],[class*="carousel"],[class*="marquee"],[class*="slide"],.w-slider,.marker-app,[class*="intercom"],[id*="hubspot"]';
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
      && !el.closest(INTENTIONAL_OVERFLOW); })
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
    if (el.closest(INTENTIONAL_OVERFLOW) || el.closest(CLOSED_PANEL)) return false;
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
    if (OVERLAY_NAME.test(cls(el))) continue;
    const par = el.parentElement;
    const c = getComputedStyle(el);
    if (c.backgroundImage && c.backgroundImage !== 'none' && /url\(/.test(c.backgroundImage)) continue;
    if ((el.innerText || '').trim().length > 0) continue;      // it holds copy, not media
    const kids = Array.from(el.children);
    const namedMedia = MEDIA_NAME.test(cls(el));
    const onlyOverlay = kids.length > 0 && kids.every(k => OVERLAY_NAME.test(cls(k)));
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
    if (el.closest(CLOSED_PANEL) && /hidden|clip/.test(getComputedStyle(el).overflow + getComputedStyle(el).overflowY)) return false;
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

  return {
    viewport: vw + 'x' + vh, breakpoint: mobile ? 'mobile' : (vw <= 991 ? 'tablet' : 'desktop'),
    headingSizes,
    horizontalOverflow: { pageScrollsSideways: pageOverflow, docScrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw, offenders: stickOut, cutOffButContained: cutOff },
    collapsedElements: collapsed,
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
