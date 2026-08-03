/*
 * audit_polish.js — what a human reviewer notices in the first ten seconds.
 *
 * Machine audits and human audits fail differently. A machine looks for things that
 * are *wrong* — a crash, a contrast ratio under 4.5, a broken link. A person looks
 * for things that are *unfinished*: the tab has no favicon, the margins wander from
 * section to section, a phone number you can't tap, a heading that wraps by one
 * word, six cards wearing the same placeholder icon, a dev widget still pinned to
 * the corner. Nothing here is broken. All of it gets filed as a bug.
 *
 * That gap is the reason a page can pass an automated sweep and still come back
 * from review covered in comments. Each check below encodes one instinct from that
 * kind of review — see `references/reviewer-mindset.md` for the reasoning behind
 * each, and how to extend the set when you meet a new one.
 *
 * Selectors come from `runner/lib/vocab.mjs` (injected as `window.__QA_VOCAB`) and
 * fall back to sensible defaults, so this runs standalone in any browser console.
 *
 * Paste into a browser javascript_exec call, or let runner/qa_runner.mjs run it.
 */
(() => {
  const V = Object.assign({
    sections: 'section,[class*="section"],main > div,[data-section]',
    navRoots: 'nav,header,[role="navigation"],[class*="navbar"],[class*="nav_"]',
    devFurniture: '[class*="marker-app"],#marker-app,[id*="devtools"],[class*="dev-mode"],[class*="debug"],' +
      '[class*="grid-overlay"],.w-editor-bem-EditSiteButton,[data-wf-editor],[class*="staging-banner"]',
    devHosts: 'localhost|127\\.0\\.0\\.1|:5500|ngrok|\\.local/|file://'
  }, window.__QA_VOCAB || {});
  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() +
    (el.id ? '#' + el.id : '') +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const visible = el => { const c = getComputedStyle(el); const r = el.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity !== 0 && r.width > 0 && r.height > 0; };
  const vw = innerWidth;

  // Rendered line-boxes of an element's own text (text nodes only, so an inline icon
  // on a different baseline is never counted as an extra line).
  const lineRects = el => {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange(); const rects = []; let n;
    while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 0 && r.height > 3) rects.push(r); }
    rects.sort((a, b) => a.top - b.top);
    const tol = (parseFloat(getComputedStyle(el).fontSize) || 14) * 0.6;
    const lines = []; for (const r of rects) {
      const last = lines[lines.length - 1];
      if (last && r.top - last.top <= tol) { last.right = Math.max(last.right, r.right); last.left = Math.min(last.left, r.left); }
      else lines.push({ top: r.top, left: r.left, right: r.right });
    }
    return lines.map(l => ({ top: l.top, width: l.right - l.left }));
  };

  // ── 1) FAVICON ────────────────────────────────────────────────────────────────
  // The tab icon is outside the viewport, so no layout or a11y rule will ever look
  // at it — but it's the first thing a reviewer sees, and a default globe next to a
  // finished site reads as unfinished. Anything that lives in chrome rather than in
  // the page (tab title, icon, share preview) is a systematic automation blind spot.
  const iconLinks = Array.from(document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]'))
    .map(l => ({ rel: l.getAttribute('rel'), href: l.href }));
  const favicon = {
    links: iconLinks,
    hasIcon: iconLinks.some(l => /icon/.test(l.rel) && l.rel !== 'apple-touch-icon'),
    hasAppleTouch: iconLinks.some(l => l.rel === 'apple-touch-icon'),
    // a platform's stock asset — present, so a presence check passes, but not the brand
    looksDefault: iconLinks.some(l => /webflow.*favicon|favicon.*webflow|256x256_transparent|placeholder|default/i.test(l.href)),
    flag: !iconLinks.length ? 'MISSING — no favicon at all'
      : (!iconLinks.some(l => l.rel === 'apple-touch-icon') ? 'no apple-touch-icon (blurry on iOS home screen)' : 'ok')
  };

  // ── 2) CONTAINER GUTTERS ──────────────────────────────────────────────────────
  // A whole class of finding is invisible in any single screenshot and obvious while
  // scrolling: rhythm. If one section's content starts 8px further in than the rest,
  // no individual view looks wrong, but the page feels loose. The trick is to stop
  // asking "is this section correct?" (unanswerable without the design) and ask "do
  // the sections agree with each other?" — self-consistency needs no reference, and
  // the majority value is a good proxy for the intended one.
  const SECTION_SEL = V.sections;
  const gutterSamples = [];
  Array.from(document.querySelectorAll(SECTION_SEL)).forEach(sec => {
    if (!visible(sec)) return;
    const sr = sec.getBoundingClientRect();
    if (sr.width < vw * 0.8) return;                       // not a full-width section
    // Only WIDE, left-aligned text tells you where the container edge is. A centred
    // heading or a narrow caption sits wherever its own box puts it and says nothing
    // about the gutter — measuring those was the single biggest source of nonsense
    // in this check (a centred intro reported a "662px gutter").
    let minLeft = Infinity, maxRight = -Infinity, n = 0;
    sec.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,label').forEach(t => {
      if (!visible(t) || !txt(t)) return;
      if (t.closest(SECTION_SEL) !== sec) return;          // belongs to a nested section
      const c = getComputedStyle(t);
      if (c.textAlign === 'center' || c.textAlign === 'right') return;
      const r = t.getBoundingClientRect();
      if (r.width < vw * 0.25 || r.width > vw) return;     // too narrow to locate an edge
      // a block that is roughly centred within the section is centred by layout even
      // if text-align says left — its left edge is not the container's left edge
      if (Math.abs((r.left - sr.left) - (sr.right - r.right)) < 8 && r.width < sr.width * 0.75) return;
      // A block starting past the first 40% of the section is a right-hand column, not the
      // container edge. Without this, a two-column section's right column reported a
      // "1038px gutter" at 1920px — a number that describes nothing.
      if ((r.left - sr.left) > sr.width * 0.4) return;
      // Text inside a card is inset by the CARD's padding — that has nothing to do with the
      // page's container gutter. The CTA section is one dark rounded card, and measuring its
      // inner copy reported the section as 80px off the container. Detect the card by what
      // makes it one: its own background plus a real corner radius.
      for (let a = t.parentElement; a && a !== sec; a = a.parentElement) {
        const ac = getComputedStyle(a);
        if (parseFloat(ac.borderRadius) >= 8 &&
            ac.backgroundColor !== 'rgba(0, 0, 0, 0)' && ac.backgroundColor !== 'transparent') return;
        if (ac.backgroundImage && ac.backgroundImage !== 'none' && parseFloat(ac.borderRadius) >= 8) return;
      }
      minLeft = Math.min(minLeft, r.left); maxRight = Math.max(maxRight, r.right); n++;
    });
    if (!n || minLeft === Infinity) return;
    // Round to 2px: sub-pixel text metrics otherwise split one real gutter into three
    // "distinct" ones and make a consistent page look inconsistent.
    gutterSamples.push({ el: desc(sec), left: Math.round(minLeft / 2) * 2, right: Math.round((vw - maxRight) / 2) * 2,
      contentWidth: Math.round(maxRight - minLeft), samples: n });
  });
  // modal (most common) left gutter = the intended one; anything else is drift
  const leftCounts = {}; gutterSamples.forEach(s => leftCounts[s.left] = (leftCounts[s.left] || 0) + 1);
  const modalLeft = +(Object.entries(leftCounts).sort((a, b) => b[1] - a[1])[0] || [0])[0];
  const containerGutters = {
    viewport: vw, dominantLeftGutter: modalLeft,
    distinctGutters: Object.entries(leftCounts).map(([px, n]) => ({ px: +px, sections: n })).sort((a, b) => b.sections - a.sections),
    sectionsMeasured: gutterSamples.length,
    // One stray text block does not establish a section's container edge, so a
    // single-sample section is reported as low confidence rather than as drift.
    // 8px, not 4px: at 4px, sub-grid rounding and a single letter's side-bearing were enough
    // to promote an identical container to an "outlier".
    outliers: gutterSamples.filter(s => Math.abs(s.left - modalLeft) > 8 && s.samples >= 2)
      .map(s => ({ ...s, offBy: s.left - modalLeft })).slice(0, 12),
    lowConfidence: gutterSamples.filter(s => Math.abs(s.left - modalLeft) > 8 && s.samples < 2)
      .map(s => ({ ...s, offBy: s.left - modalLeft,
        hint: 'only one text block located this edge — verify on the screenshot before reporting' })).slice(0, 8),
    // asymmetric = left and right gutters differ → container isn't centred. Tolerance
    // scales with viewport: 4px of drift matters at 393px, not at 1920px.
    asymmetric: gutterSamples.filter(s => Math.abs(s.left - s.right) > Math.max(4, vw * 0.01))
      .map(s => ({ el: s.el, left: s.left, right: s.right, diff: s.left - s.right })).slice(0, 8)
  };

  // ── 3) UNLINKED PHONE NUMBERS & EMAILS ────────────────────────────────────────
  // Content that *looks* interactive but isn't. A printed phone number is a button
  // as far as a phone user is concerned; when it isn't wired up nothing appears
  // broken, the tap just does nothing. Generalise the instinct: wherever the page
  // shows something a user will inevitably try to act on, check it's actionable.
  const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,4}\d{3,4}/g;
  const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;
  const unlinkedPhones = [], unlinkedEmails = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let tn; const seenContact = new Set();
  while ((tn = tw.nextNode())) {
    const t = tn.textContent.trim(); if (t.length < 7) continue;
    const el = tn.parentElement; if (!el || /^(script|style|noscript)$/i.test(el.tagName)) continue;
    if (!visible(el)) continue;
    const em = t.match(EMAIL);
    if (em && !el.closest('a[href^="mailto:"]')) em.forEach(e => {
      if (seenContact.has(e)) return; seenContact.add(e);
      unlinkedEmails.push({ el: desc(el), email: e });
    });
    // strip emails before phone-matching so "…@x.com" digits don't false-positive
    const stripped = t.replace(EMAIL, ' ');
    const ph = stripped.match(PHONE);
    if (ph && !el.closest('a[href^="tel:"]')) ph.forEach(p => {
      const digits = p.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 15) return;         // not a phone number
      if (/^(19|20)\d\d/.test(digits) && digits.length <= 10) return; // a date/year run
      if (seenContact.has(digits)) return; seenContact.add(digits);
      unlinkedPhones.push({ el: desc(el), number: p.trim(), context: t.slice(0, 50) });
    });
  }

  // ── 4) "CAN THIS FIT ON ONE LINE?" ────────────────────────────────────────────
  // The single most common note in any real design review. A generic "does this
  // wrap?" check is useless — most text is meant to wrap. What a designer reacts to
  // is a wrap that looks like an accident, and there are exactly two tells:
  //   (a) a near-miss — the second line holds a word or two, so it was never meant
  //       to break; a few pixels of width or letter-spacing would fix it;
  //   (b) a widow — a heading's last line is one lonely word.
  // Both are measurable from line-box geometry, and neither needs the design file.
  // A wrapping button and the span inside it are one finding, not two — dedupe on
  // the rendered text and keep the tightest box, which is the element to actually fix.
  const nearMissWraps = [], orphanHeadings = [];
  const dedupeByText = list => { const best = new Map();
    list.forEach(x => { const prev = best.get(x.text);
      if (!prev || x.boxWidth < prev.boxWidth) best.set(x.text, x); });
    return [...best.values()]; };
  Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,a,button,p,[class*="btn"],[class*="button"],[class*="eyebrow"],[class*="label"],[class*="tag"]'))
    .forEach(el => {
      if (!visible(el)) return;
      const t = txt(el); if (!t || t.length > 90) return;
      const lines = lineRects(el); if (lines.length < 2) return;
      const widest = Math.max(...lines.map(l => l.width));
      const total = lines.reduce((a, l) => a + l.width, 0);
      const isHeading = /^h[1-6]$/i.test(el.tagName);
      const box = el.getBoundingClientRect();
      // (a) near-miss. The gate that matters is WHERE, not how close: a sentence
      // wrapping on a phone is correct typography, so flagging every two-line FAQ
      // question buries the one real finding. Only label-shaped things — buttons,
      // tags, stats, short headings — are expected to hold a single line.
      const words = t.split(/\s+/).length;
      const labelLike = /^(a|button)$/i.test(el.tagName) ||
        /\b(btn|button|tag|label|eyebrow|pill|chip|badge|nav[_-]?link|stat|number|counter)\b/i.test(cls(el)) ||
        (isHeading && words <= 6);
      const sentence = /[.?!]$/.test(t) && words > 5;
      if (labelLike && !sentence && lines.length === 2 && total <= widest * 1.18 && words <= 8) {
        nearMissWraps.push({ el: desc(el), text: t.slice(0, 44), lines: lines.length,
          neededExtraPx: Math.round(total - widest), boxWidth: Math.round(box.width),
          hint: 'wraps by a hair — nowrap, a tighter letter-spacing, or ~' + Math.round(total - widest) + 'px more width fixes it' });
      }
      // (b) orphan: last line is a single short word dangling under a heading
      if (isHeading) {
        const last = lines[lines.length - 1];
        const words = t.split(/\s+/);
        if (last.width < widest * 0.25 && words.length > 3 &&
            !orphanHeadings.some(o => o.text === t.slice(0, 60))) {
          orphanHeadings.push({ el: desc(el), text: t.slice(0, 60), lines: lines.length,
            danglingWord: words[words.length - 1],
            hint: 'widow — bind the last two words with &nbsp; or use text-wrap: balance' });
        }
      }
    });

  // ── 4b) GROUPS THAT WRAP ONTO A SECOND ROW ────────────────────────────────────
  // The sibling of the near-miss wrap, one level up: it isn't the text that breaks,
  // it's the row. Two buttons side by side become one above the other; a row of
  // three items drops the third onto its own line, where it sits left-aligned under
  // a centred pair and looks like a mistake — because it is one. Reviewers describe
  // this as "squeeze these onto one line" or "make the third one sit centrally",
  // and it only ever appears at the narrow breakpoints nobody screenshots.
  const wrappedGroups = [];
  Array.from(document.querySelectorAll('body *')).forEach(parent => {
    const kids = Array.from(parent.children).filter(visible);
    if (kids.length < 2 || kids.length > 8) return;
    // Only a group that was LAID OUT as a row can be said to have wrapped. A footer
    // link column is one item per line by design; reporting it drowns the one real
    // finding (two hero buttons stacking on a phone) in seven false ones.
    const cd = getComputedStyle(parent);
    const isRow = (/flex/.test(cd.display) && cd.flexDirection.startsWith('row')) ||
      (cd.display === 'grid' && (cd.gridTemplateColumns.split(' ').length > 1)) ||
      /inline/.test(cd.display);
    if (!isRow) return;
    // only groups of action-shaped things — a stack of paragraphs is not a "row"
    const actionish = kids.filter(k => /^(a|button)$/i.test(k.tagName) ||
      /\b(btn|button|tag|pill|chip|badge|label)\b/i.test(cls(k)));
    if (actionish.length !== kids.length) return;
    const rects = kids.map(k => k.getBoundingClientRect());
    const rows = []; rects.forEach(r => { const row = rows.find(x => Math.abs(x.top - r.top) < r.height * 0.5);
      if (row) { row.items.push(r); row.left = Math.min(row.left, r.left); row.right = Math.max(row.right, r.right); }
      else rows.push({ top: r.top, left: r.left, right: r.right, items: [r] }); });
    if (rows.length < 2) return;
    const pr = parent.getBoundingClientRect();
    const last = rows[rows.length - 1];
    const lastCentred = Math.abs((last.left - pr.left) - (pr.right - last.right)) < 6;
    const totalWidth = rects.reduce((a, r) => a + r.width, 0);
    wrappedGroups.push({ el: desc(parent), items: kids.length, rows: rows.length,
      labels: kids.map(k => txt(k).slice(0, 18)),
      lastRowItems: last.items.length, lastRowCentred: lastCentred,
      wouldFitOneRow: totalWidth <= pr.width,
      hint: last.items.length < rows[0].items.length && !lastCentred
        ? 'last row is short and left-aligned under a full row — centre it or fit them on one line'
        : 'this group wraps onto ' + rows.length + ' rows at ' + vw + 'px' });
  });

  // ── 5) PLACEHOLDER / DUPLICATED ICONS ─────────────────────────────────────────
  // A presence check asks "is there an icon?" and a build with placeholder icons
  // answers yes every time. The useful question is different: in a set of things
  // that should each be distinct, are they? Repetition where variety is expected is
  // the signature of content nobody finished — and it generalises well beyond icons
  // (identical alt text, identical thumbnails, identical card copy all smell alike).
  // The critical distinction: a chevron on every accordion row, or the same arrow on
  // every card's CTA, is CORRECT — controls are meant to be identical. Only content
  // icons carry per-item meaning. Skip anything inside a control before comparing;
  // without this filter every FAQ list on earth reports as a defect and the check
  // becomes noise, which is worse than not having it.
  const CONTROL = 'a,button,[role="button"],[class*="toggle"],[class*="arrow"],[class*="chevron"],' +
    '[class*="caret"],[class*="plus"],[class*="close"],[class*="control"],summary';
  // "Inside a control" needs care: a whole card is often wrapped in one big <a>, and
  // that link is the card, not a control. Only treat an ancestor as a control when
  // it's a small part of the card — a chevron button, a CTA arrow — rather than the
  // card's own wrapper. Getting this backwards silently disables the whole check.
  const contentIcon = card => {
    const cardArea = Math.max(1, (r => r.width * r.height)(card.getBoundingClientRect()));
    return Array.from(card.querySelectorAll('svg,img')).find(n => {
      const ctrl = n.closest(CONTROL);
      if (ctrl && card.contains(ctrl)) {
        const cr = ctrl.getBoundingClientRect();
        if ((cr.width * cr.height) / cardArea < 0.6) return false;   // a genuine sub-control
      }
      const r = n.getBoundingClientRect(); return r.width >= 16 && r.width <= 140;
    });
  };
  const iconKey = card => {
    const n = contentIcon(card);
    if (!n) { const bg = getComputedStyle(card).backgroundImage;
      return bg && bg !== 'none' && /url\(/.test(bg) ? 'bg:' + bg.slice(0, 120) : null; }
    if (n.tagName.toLowerCase() === 'svg') {
      const p = Array.from(n.querySelectorAll('path,circle,rect,polygon'))
        .map(x => (x.getAttribute('d') || x.outerHTML)).join('|');
      return 'svg:' + (p || n.outerHTML).slice(0, 200);
    }
    return 'img:' + (n.currentSrc || n.src);
  };
  const duplicateIcons = [];
  const groupSeen = new Set();
  Array.from(document.querySelectorAll('body *')).forEach(parent => {
    const kids = Array.from(parent.children).filter(visible);
    if (kids.length < 3) return;
    const c0 = cls(kids[0]).trim();
    if (!c0) return;
    if (!kids.every(k => cls(k).trim() === c0)) return;    // homogeneous repeated group
    const keys = kids.map(iconKey);
    if (keys.some(k => !k)) return;                        // not every item has an icon → different problem
    if (new Set(keys).size !== 1) return;
    const k = c0.split(/\s+/)[0]; if (groupSeen.has(k)) return; groupSeen.add(k);
    duplicateIcons.push({ group: desc(parent), item: '.' + k, count: kids.length,
      labels: kids.map(x => txt(x).slice(0, 22)).slice(0, 6),
      hint: 'all ' + kids.length + ' items share one content icon — placeholder icons not swapped for the real set?' });
  });

  // ── 6) DEV / STAGING FURNITURE VISIBLE TO THE REVIEWER ────────────────────────
  // Scaffolding you stop seeing because you put it there. Debug chips, grid
  // overlays, feedback badges, a script still loading off localhost: to the team
  // they're invisible, to anyone else they're part of the page. Doubly worth
  // catching because they also sit on top of content and cause false "this element
  // is missing" findings in your own screenshots.
  const DEV_SEL = V.devFurniture;
  const devWidgets = Array.from(document.querySelectorAll(DEV_SEL)).filter(visible)
    .map(el => { const r = el.getBoundingClientRect();
      return { el: desc(el), pos: getComputedStyle(el).position, box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        text: txt(el).slice(0, 40) }; }).slice(0, 8);
  const devHostRe = new RegExp(V.devHosts, 'i');
  const devScripts = Array.from(document.querySelectorAll('script[src]'))
    .filter(s => devHostRe.test(s.src)).map(s => s.src.slice(0, 80)).slice(0, 8);
  // a fixed/absolute element pinned to a corner with tiny content is the classic
  // "little box" — flag any we can't attribute to a known widget
  const strayFixedBoxes = Array.from(document.querySelectorAll('body > *,body > * > *')).filter(el => {
    if (!visible(el) || el.matches(DEV_SEL) || el.closest('nav,header,footer')) return false;
    const c = getComputedStyle(el); if (c.position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width < 260 && r.height < 120 && r.width > 8;
  }).map(el => { const r = el.getBoundingClientRect();
    return { el: desc(el), box: `${Math.round(r.width)}x${Math.round(r.height)}`,
      at: `${Math.round(r.left)},${Math.round(r.top)}`, text: txt(el).slice(0, 40) }; }).slice(0, 6);

  // ── 7) NAV ↔ CONTENT PARITY ───────────────────────────────────────────────────
  // Completeness is the hardest thing to review, because you have to know what
  // *should* be there. But a site usually states that itself: the navigation is a
  // declaration of what exists. When an on-page listing carries only some of what
  // the nav declares, the build is unfinished. The key is that PARTIAL coverage is
  // the signal — zero overlap just means this page isn't that listing, which is
  // fine. Same reasoning works for any two places that should mirror each other.
  // Match on BOTH path and visible text. Path alone is fragile in exactly the case
  // that matters: a half-built nav where the dropdown items are still `href="#"`
  // has no paths to compare, yet that is precisely the page most likely to have an
  // incomplete listing. Names are what a reviewer compares anyway.
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  // A mega-menu link is usually a whole card: a title AND a paragraph of supporting
  // copy. `textContent` glues them together, so the "name" becomes the title plus a
  // sentence and never matches anything on the page. Take the title only.
  const linkLabel = a => {
    const head = a.querySelector('h1,h2,h3,h4,h5,h6,strong,b,[class*="title"],[class*="heading"],[class*="label"]');
    if (head && txt(head)) return txt(head);
    const first = Array.from(a.childNodes).find(n => n.nodeType === 3 && n.textContent.trim());
    if (first) return first.textContent.trim();
    return txt(a).slice(0, 40);
  };
  const navRoots = Array.from(document.querySelectorAll(V.navRoots));
  const inNav = el => navRoots.some(n => n.contains(el));
  const bodyPaths = new Set(), bodyNames = new Set();
  Array.from(document.querySelectorAll('a[href]')).forEach(a => {
    if (inNav(a) || a.closest('footer')) return;
    try { bodyPaths.add(new URL(a.getAttribute('href'), location.href).pathname.replace(/\/$/, '')); } catch (e) {}
    if (txt(a)) bodyNames.add(norm(txt(a)));
  });
  // headings count as "the page lists this" even when the card isn't a link
  Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,[class*="title"],[class*="card"] p')).forEach(h => {
    if (inNav(h) || h.closest('footer') || !visible(h)) return;
    if (txt(h)) bodyNames.add(norm(txt(h)));
  });

  const navParity = [];
  navRoots.forEach(nav => {
    // a panel is a CONTAINER of several links — an <a> whose own class happens to
    // contain "panel" is a link, and treating it as a panel yields empty groups
    const panels = new Set(Array.from(nav.querySelectorAll(
      '[class*="dropdown"],[class*="mega"],[class*="submenu"],[class*="panel"],[role="menu"]'))
      .filter(el => !/^a$/i.test(el.tagName) && el.querySelectorAll('a[href]').length >= 3));
    panels.forEach(panel => {
      // if this panel contains another CONTAINER panel, it's an outer wrapper —
      // use the inner one. (Test for a nested container, not just a nested element
      // whose class happens to contain "panel": the child links usually do.)
      if ([...panels].some(o => o !== panel && panel.contains(o))) return;
      const items = Array.from(panel.querySelectorAll('a[href]')).map(a => {
        const raw = a.getAttribute('href') || '';
        // a bare "#" resolves to the CURRENT path — treat it as "no destination",
        // not as a self-link, or an unfinished nav filters itself out entirely
        let path = null;
        if (!/^#/.test(raw)) { try { path = new URL(raw, location.href).pathname.replace(/\/$/, ''); } catch (e) {} }
        const label = linkLabel(a);
        return { path, text: label.slice(0, 40), name: norm(label) };
      }).filter(i => i.name && i.name.length > 2 &&
        !(i.path !== null && i.path === location.pathname.replace(/\/$/, '')));
      if (items.length < 3) return;
      const has = i => (i.path && i.path !== '' && bodyPaths.has(i.path)) ||
        [...bodyNames].some(n => n === i.name || n.includes(i.name) || i.name.includes(n));
      const present = items.filter(has), missing = items.filter(i => !has(i));
      // desktop and mobile navs are separate copies of the same menu — one finding
      const sig = items.map(i => i.name).sort().join('|');
      if (navParity.some(x => x._sig === sig)) return;
      if (present.length && missing.length) navParity.push({ _sig: sig,
        panel: desc(panel), inNav: items.length, onPage: present.length,
        missingFromPage: missing.map(m => m.text).slice(0, 12),
        matchedBy: items.some(i => i.path && bodyPaths.has(i.path)) ? 'link path' : 'name only',
        hint: 'this page lists ' + present.length + '/' + items.length +
          ' of the items the nav declares — incomplete listing?' });
    });
  });

  /* ── 7b) "WHERE AM I?" — CURRENT-PAGE INDICATION ──────────────────────────────
   * Every design highlights the nav item for the page you're on, and it is almost never
   * built, because nothing looks broken when it's missing — you just quietly lose your
   * place. Webflow sets `w--current` on an <a> whose href matches the current path all by
   * itself, so the usual failure is that the *styling* for that state was never written, or
   * the nav item is a div wrapper that never receives the class.
   * Only meaningful when a nav link actually points at this page. */
  const here = location.pathname.replace(/\/+$/, '') || '/';
  const navAnchors = navRoots.length
    ? [...new Set(navRoots.flatMap(n => [...n.querySelectorAll('a[href]')]))] : [];
  const selfLinks = navAnchors.filter(a => {
    let p; try { p = new URL(a.href, location.origin).pathname.replace(/\/+$/, '') || '/'; }
    catch { return false; }
    return p === here;
  });
  const marksCurrent = el => {
    if (el.getAttribute('aria-current')) return 'aria-current';
    if (/w--current/.test(el.getAttribute('class') || '')) return 'w--current';
    let a = el; for (let i = 0; i < 3 && a; i++, a = a.parentElement) {
      if (/w--current|is-current|is-active/.test(a.getAttribute('class') || '')) return 'ancestor class';
    }
    return null;
  };
  // does the marked link actually LOOK different from its unmarked siblings?
  const visuallyDistinct = el => {
    const peer = navAnchors.find(o => o !== el && !marksCurrent(o) && visible(o));
    if (!peer) return null;
    const a = getComputedStyle(el), b = getComputedStyle(peer);
    return a.color !== b.color || a.fontWeight !== b.fontWeight ||
      a.borderBottomColor !== b.borderBottomColor || a.textDecorationLine !== b.textDecorationLine ||
      a.backgroundColor !== b.backgroundColor || a.opacity !== b.opacity;
  };
  const currentPageIndication = selfLinks.length ? (() => {
    const marked = selfLinks.map(a => ({ a, how: marksCurrent(a) })).filter(x => x.how);
    if (!marked.length) return { navLinksToThisPage: selfLinks.length, marked: 0,
      severity: 'polish', confidence: 'measured',
      hint: 'a nav item links to this page but nothing marks it as current — no aria-current, ' +
        'no w--current. The user has no indication of where they are' };
    const styled = marked.filter(m => visuallyDistinct(m.a) === true);
    if (styled.length) return { navLinksToThisPage: selfLinks.length, marked: marked.length,
      markedBy: marked[0].how, visuallyDistinct: true, ok: true };
    return { navLinksToThisPage: selfLinks.length, marked: marked.length, markedBy: marked[0].how,
      visuallyDistinct: false, severity: 'polish', confidence: 'measured',
      hint: 'the current nav item carries ' + marked[0].how + ' but computes identically to its ' +
        'siblings — the state exists in the DOM and was never styled' };
  })() : { navLinksToThisPage: 0, note: 'no nav link points at this page — nothing to mark' };

  // ── 8) MOTION COVERAGE (static half) ──────────────────────────────────────────
  // Reviewers ask for motion constantly, and never as a defect report — it arrives
  // as "this feels flat" or "that was too quick to notice". Taste isn't scriptable,
  // but two facts underneath it are: which sections have *no* motion wired up at
  // all, and which animations are so short they can't register. Report the facts
  // and let a person make the call; a map of where motion exists is what turns a
  // vague feeling into a specific request.
  const sections = Array.from(document.querySelectorAll(V.sections)).filter(visible);
  const motionBySection = sections.map(sec => {
    const nodes = Array.from(sec.querySelectorAll('*'));
    const ix2 = nodes.filter(n => n.hasAttribute('data-w-id')).length;
    const animated = nodes.filter(n => { const c = getComputedStyle(n);
      return (c.animationName && c.animationName !== 'none') || (c.transitionDuration && parseFloat(c.transitionDuration) > 0); }).length;
    const heading = sec.querySelector('h1,h2,h3');
    return { el: desc(sec), heading: heading ? txt(heading).slice(0, 34) : '(none)',
      ix2Bindings: ix2, animatedNodes: animated };
  });
  const sectionsWithNoMotion = motionBySection.filter(m => !m.ix2Bindings && !m.animatedNodes).slice(0, 12);
  // very short declared durations — "the animation is a tad quick and easily missed"
  const fastAnimations = [];
  const seenDur = new Set();
  Array.from(document.querySelectorAll('body *')).slice(0, 3000).forEach(el => {
    const c = getComputedStyle(el);
    if (!c.animationName || c.animationName === 'none') return;
    const d = parseFloat(c.animationDuration) || 0; if (!d || d >= 0.35) return;
    const k = c.animationName + d; if (seenDur.has(k)) return; seenDur.add(k);
    fastAnimations.push({ el: desc(el), animation: c.animationName, duration: c.animationDuration });
  });

  // ── 9) FALSE AFFORDANCE ───────────────────────────────────────────────────────
  // "These appear to be clickable but are not." "The cursor doesn't need to change
  // here, it's not a link." "Pointer hover not working." Three different notes, one
  // underlying rule: what the cursor promises and what the element does must agree.
  // Both directions are bugs — a pointer over dead content is a broken promise, and
  // a real link without one is an invisible feature.
  const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="tab"],[onclick],[tabindex]';
  const falseAffordance = [], missingAffordance = [];
  const seenAff = new Set();
  Array.from(document.querySelectorAll('body *')).forEach(el => {
    if (!visible(el)) return;
    const c = getComputedStyle(el);
    const isInteractive = el.matches(INTERACTIVE) || !!el.closest(INTERACTIVE);
    const r = el.getBoundingClientRect();
    if (c.cursor === 'pointer' && !isInteractive && txt(el) && r.width > 24) {
      // only report the outermost offender — the whole subtree inherits the cursor
      if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') return;
      const k = desc(el); if (seenAff.has(k)) return; seenAff.add(k);
      // Deliberately worded as a suspicion. This heuristic is wrong in BOTH directions and
      // was measured being wrong in both on the same page: it flagged a "Get a quote" that
      // navigates fine (wired by a delegated document-level listener, invisible to the DOM)
      // while missing three dead CTAs that carried a `data-w-id` and looked wired. A DOM
      // audit cannot answer "does this do anything" — only a click can, which is what
      // `ctaClickAudit` is for. When the runner has click results, it suppresses this list
      // entirely in favour of them.
      falseAffordance.push({ el: k, text: txt(el).slice(0, 34), confidence: 'suspected',
        hint: 'cursor:pointer with no interactive element in scope — SUSPECTED only; ' +
          'a delegated click handler is invisible here. Confirm by clicking before reporting' });
    }
    if (el.matches('a[href]:not([href="#"]),button,[role="button"]') && c.cursor !== 'pointer' &&
        c.pointerEvents !== 'none' && r.width > 24) {
      const k = desc(el); if (seenAff.has(k)) return; seenAff.add(k);
      missingAffordance.push({ el: k, text: txt(el).slice(0, 34), cursor: c.cursor,
        hint: 'genuinely clickable but the cursor never changes' });
    }
  });

  // ── 10) UNSELECTABLE TEXT ─────────────────────────────────────────────────────
  // `user-select: none` gets applied to a slider or a card to stop drag-highlighting
  // and then quietly swallows the copy inside it. Nobody notices until someone tries
  // to copy an address or a phone number and can't.
  const unselectable = [];
  Array.from(document.querySelectorAll('p,h1,h2,h3,h4,li,span,td')).forEach(el => {
    if (!visible(el) || unselectable.length > 12) return;
    const t = txt(el); if (t.length < 25) return;
    if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return;
    // `user-select: none` on a control is correct and deliberate — it stops a button label
    // highlighting when someone double-clicks it, and stops text selection fighting a
    // slider drag. Reporting those made this check 11 findings of which zero were real.
    // What actually matters is prose a reader might want to copy: an address, a phone
    // number, a policy detail. So require the text to be OUTSIDE any control or draggable
    // surface, and to look like prose rather than a label.
    if (el.closest('a,button,[role="button"],label,summary,[class*="button"],[class*="btn"],' +
      '[class*="slider"],[class*="swiper"],[class*="carousel"],[draggable="true"],[class*="tab"]')) return;
    const words = t.split(/\s+/).length;
    if (words < 6) return;                          // a label, not copy someone wants to keep
    const c = getComputedStyle(el);
    if (c.userSelect === 'none' || c.webkitUserSelect === 'none')
      unselectable.push({ el: desc(el), text: t.slice(0, 40), words,
        hint: 'prose outside any control that cannot be selected or copied' });
  });

  // ── 11) MISSING GAPS ──────────────────────────────────────────────────────────
  // "No gap has been set." "Add space between images." A row whose items are flush
  // against each other is almost never intentional, and it's invisible in a spec
  // review because each item looks right on its own.
  const missingGaps = [];
  Array.from(document.querySelectorAll('body *')).forEach(parent => {
    if (missingGaps.length > 10) return;
    const c = getComputedStyle(parent);
    if (!/flex|grid/.test(c.display)) return;
    if (parseFloat(c.gap) > 0 || parseFloat(c.columnGap) > 0 || parseFloat(c.rowGap) > 0) return;
    const kids = Array.from(parent.children).filter(visible);
    if (kids.length < 2 || kids.length > 12) return;
    const rects = kids.map(k => k.getBoundingClientRect());
    // touching = adjacent edges within 2px AND no margin doing the spacing job
    let touching = 0;
    for (let i = 1; i < rects.length; i++) {
      const g = Math.min(Math.abs(rects[i].left - rects[i - 1].right), Math.abs(rects[i].top - rects[i - 1].bottom));
      if (g < 2) touching++;
    }
    if (touching >= rects.length - 1 && rects.every(r => r.width > 24 && r.height > 24))
      missingGaps.push({ el: desc(parent), items: kids.length, display: c.display,
        hint: 'flex/grid children are flush against each other — no gap or margin set' });
  });

  // ── 12) CMS EMPTY STATES ──────────────────────────────────────────────────────
  // Two failure modes unique to CMS-driven pages, both of which look like a design
  // problem rather than a data one: the "no items found" state shipping live, and
  // fields that bound to nothing leaving a labelled, empty box on the page.
  const emptyLists = Array.from(document.querySelectorAll('.w-dyn-empty,[class*="empty-state"]'))
    .filter(visible).map(el => ({ el: desc(el), text: txt(el).slice(0, 50),
      hint: 'a collection list is rendering its empty state on the live page' }));
  const emptyBindings = Array.from(document.querySelectorAll('.w-dyn-bind-empty'))
    .filter(el => el.parentElement && visible(el.parentElement))
    .map(el => ({ el: desc(el), parent: desc(el.parentElement),
      hint: 'CMS field bound but empty — hide the wrapper when the field is blank' })).slice(0, 10);

  // ── 13) UPSCALED (PIXELATED) IMAGES ───────────────────────────────────────────
  // The mirror of the usual "image is too heavy" check, and the one people actually
  // complain about: an asset displayed larger than it exists, which reads as blur.
  /* Judge against the DPR of devices people actually hold, not the harness's. Headless runs at
   * devicePixelRatio 1, so an asset only just wide enough for its CSS box scores ~1.0 and passes
   * — then ships soft on every phone and every retina laptop. A 381px-wide chart in a 338px slot
   * scored 1.13 here and passed, while needing 676px at 2x and 1014px at 3x. */
  const dpr = window.devicePixelRatio || 1;
  const TARGET_DPR = (innerWidth <= 767) ? 3 : 2;   // phones are 3x, retina desktops 2x
  /* Judge the LARGEST candidate in the srcset, never `naturalWidth`.
   * naturalWidth is the variant this browser chose *at this DPR*, and the harness runs at 1x —
   * so on a responsive Webflow image it is the small variant by design. Measuring that against a
   * 3x requirement flagged all six images on a page at "62% short, needs 1014px" when the srcset
   * offered larger files the whole time and a real 3x phone would have fetched one. Only a
   * shortfall in the biggest file that exists is a real defect. */
  const srcsetMax = i => {
    const ss = i.getAttribute('srcset') || '';
    const ws = [...ss.matchAll(/(\d+)w/g)].map(m => +m[1]);
    if (ws.length) return { px: Math.max(...ws), from: 'srcset' };
    const xs = [...ss.matchAll(/([\d.]+)x/g)].map(m => +m[1]);
    if (xs.length && i.naturalWidth) return { px: Math.round(i.naturalWidth * Math.max(...xs)), from: 'srcset (x descriptors)' };
    return { px: i.naturalWidth, from: 'single source (no srcset)' };
  };
  const upscaled = Array.from(document.images).map(i => {
    const r = i.getBoundingClientRect();
    if (r.width < 40 || !i.naturalWidth) return null;
    const best = srcsetMax(i);
    if (!best.px) return null;
    const need = Math.round(r.width * TARGET_DPR);
    const factor = best.px / need;
    if (factor >= 0.8) return null;
    return { img: (i.currentSrc || i.src).split('/').pop().slice(0, 40),
      largestAvailable: best.px, source: best.from,
      servedAtThisDpr: i.naturalWidth, harnessDpr: dpr,
      cssWidth: Math.round(r.width),
      needsForTarget: need + 'px @' + TARGET_DPR + 'x',
      shortfall: Math.round((1 - factor) * 100) + '%',
      hint: 'the largest file that exists (' + best.px + 'px, ' + best.from + ') is still short of ' +
        need + 'px, so this cannot render sharply at ' + TARGET_DPR + 'x — upload a bigger source' };
  }).filter(Boolean).slice(0, 12);

  // ── 14) DUPLICATE ITEMS IN A LIST ─────────────────────────────────────────────
  // "Showing duplicate items when only 4 are available." A collection set to show
  // more items than exist, or a static list copy-pasted and never edited.
  const duplicateItems = [];
  Array.from(document.querySelectorAll('.w-dyn-items,[class*="_list"],[class*="grid"],[role="list"]')).forEach(list => {
    const kids = Array.from(list.children).filter(visible);
    if (kids.length < 3 || duplicateItems.length > 6) return;
    const texts = kids.map(k => txt(k).slice(0, 60)).filter(Boolean);
    if (texts.length !== kids.length) return;
    const counts = {}; texts.forEach(t => counts[t] = (counts[t] || 0) + 1);
    const dupes = Object.entries(counts).filter(([, n]) => n > 1);
    if (dupes.length) duplicateItems.push({ el: desc(list), items: kids.length,
      repeated: dupes.map(([t, n]) => ({ text: t.slice(0, 34), times: n })),
      hint: 'the same item renders more than once — list limit exceeds the number of records?' });
  });

  // ── 15) NEARLY-FULL-HEIGHT HERO ───────────────────────────────────────────────
  // "The banner doesn't fill the viewport." A hero at 100% or at 60% both look
  // deliberate; one at 88% looks like a mistake, because the next section peeks in
  // by an amount that changes with every screen size.
  const firstSection = Array.from(document.querySelectorAll(V.sections)).find(visible);
  const heroFill = firstSection ? (() => {
    const r = firstSection.getBoundingClientRect();
    const pct = Math.round((r.height / innerHeight) * 100);
    return { el: desc(firstSection), heightPct: pct, viewportHeight: innerHeight,
      flag: pct > 80 && pct < 97 ? 'nearly-but-not-quite full height — next section peeks in' : 'ok' };
  })() : null;

  // ── 16) SVG SIZING ────────────────────────────────────────────────────────────
  // The classic Safari blow-up. An inline <svg> is a replaced element, and browsers
  // disagree about what size it should be when you don't tell them: give Chromium an
  // svg with a viewBox and no width/height and it happily scales to the container,
  // while WebKit can resolve it to the full width of the viewport. A 16px chevron
  // becomes a 1500px chevron and the layout explodes — but only on the reviewer's
  // iPhone, which is why it survives to the QA list so reliably.
  //
  // Two findings, deliberately separate:
  //   oversized  — it IS blown up right now, in this engine (run with --engines to
  //                catch the ones that only misbehave in WebKit);
  //   noIntrinsicSize — it renders fine here but has nothing pinning its size, so
  //                it's one browser away from blowing up. This is the one worth
  //                fixing before anyone files it.
  const svgList = Array.from(document.querySelectorAll('svg')).filter(visible);
  const iconWidths = svgList.map(s => s.getBoundingClientRect().width).filter(w => w > 0).sort((a, b) => a - b);
  const medianSvg = iconWidths.length ? iconWidths[Math.floor(iconWidths.length / 2)] : 0;
  const oversizedSvgs = [], svgNoIntrinsic = [], svgAspectOff = [];
  svgList.forEach(s => {
    const r = s.getBoundingClientRect();
    const parent = s.parentElement;
    const pr = parent ? parent.getBoundingClientRect() : null;
    const wAttr = s.getAttribute('width'), hAttr = s.getAttribute('height');
    const vb = (s.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const cs = getComputedStyle(s);
    // "pinned" = something other than the intrinsic default decides the width
    const cssWidthSet = cs.width !== 'auto' && !/%$/.test(cs.width);
    const pinned = (wAttr && hAttr) || cssWidthSet || cs.maxWidth !== 'none' || cs.aspectRatio !== 'auto';

    if (r.width > vw * 0.9 && !s.closest('[class*="hero"],[class*="banner"],[class*="bg"],[class*="background"]'))
      oversizedSvgs.push({ el: desc(s), rendered: Math.round(r.width) + 'x' + Math.round(r.height),
        viewportPct: Math.round((r.width / vw) * 100), widthAttr: wAttr, heightAttr: hAttr,
        hint: 'SVG is filling the viewport — almost always a missing width/height with a viewBox' });
    else if (pr && pr.width > 0 && r.width > pr.width * 1.05)
      oversizedSvgs.push({ el: desc(s), rendered: Math.round(r.width) + 'x' + Math.round(r.height),
        parentWidth: Math.round(pr.width), widthAttr: wAttr, heightAttr: hAttr,
        hint: 'SVG is wider than its own container — it is not being constrained' });
    else if (medianSvg && r.width > medianSvg * 8 && r.width > 200 && s.closest('a,button,[class*="icon"],[class*="nav"]'))
      oversizedSvgs.push({ el: desc(s), rendered: Math.round(r.width) + 'x' + Math.round(r.height),
        medianSvgWidth: Math.round(medianSvg),
        hint: 'icon-context SVG rendering many times larger than every other icon on the page' });

    // latent risk: nothing pins the size, so another engine may resolve it differently
    if (!pinned && r.width > 0)
      svgNoIntrinsic.push({ el: desc(s), rendered: Math.round(r.width) + 'x' + Math.round(r.height),
        hasViewBox: vb.length === 4, cssWidth: cs.width,
        hint: 'no width/height attribute and no CSS size — engines are free to disagree (Safari often resolves this to the full container/viewport)' });

    // rendered aspect wildly different from the viewBox = squashed or stretched art
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && r.width > 8 && r.height > 8 &&
        cs.preserveAspectRatio !== 'none' && s.getAttribute('preserveAspectRatio') !== 'none') {
      const want = vb[2] / vb[3], got = r.width / r.height;
      if (Math.abs(got - want) / want > 0.15)
        svgAspectOff.push({ el: desc(s), viewBoxRatio: +want.toFixed(2), renderedRatio: +got.toFixed(2),
          rendered: Math.round(r.width) + 'x' + Math.round(r.height),
          hint: 'rendered aspect does not match the viewBox — artwork is stretched or squashed' });
    }
  });

  // ── 17) MOBILE VIEWPORT HAZARDS ───────────────────────────────────────────────
  // A deliberate exception to this skill's "measure, don't guess" rule, and worth
  // explaining. The iOS viewport bugs people actually file — a 100vh hero whose CTA
  // hides behind the URL bar, a sticky footer swallowed by the keyboard, a safe-area
  // inset that silently resolves to 0 — are NOT reproducible in headless WebKit.
  // Playwright's WebKit has no retractable URL bar, no virtual keyboard and no safe
  // areas, so a clean run there is not evidence of anything. What IS detectable, in
  // any engine, is the risky construction itself. So this reports patterns, clearly
  // labelled as hazards rather than confirmed defects, and says what to verify on a
  // real device.
  const viewportHazards = [];
  const vpMeta = (document.querySelector('meta[name="viewport"]') || {}).content || '';
  const probe = (h) => { const d = document.createElement('div');
    d.style.cssText = `position:absolute;left:-9999px;top:0;width:1px;height:${h};`;
    document.body.appendChild(d); const v = d.getBoundingClientRect().height; d.remove(); return v; };
  const unitSupport = { svh: CSS.supports('height', '100svh'), dvh: CSS.supports('height', '100dvh') };

  // count elements actually sized in vh — the construction, not the symptom
  let vhSized = 0, vhSample = [];
  Array.from(document.querySelectorAll('body *')).slice(0, 3000).forEach(el => {
    const inline = el.getAttribute('style') || '';
    if (/\d\s*vh\b/.test(inline)) { vhSized++; if (vhSample.length < 5) vhSample.push(desc(el)); }
  });
  // stylesheet scan catches the far more common case (vh set in a class, not inline)
  let vhRules = 0, fillAvailable = 0;
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }   // cross-origin
      for (const r of Array.from(rules || [])) {
        const t = r.cssText || '';
        if (/:\s*[\d.]+vh\b/.test(t)) vhRules++;
        if (/-webkit-fill-available/.test(t)) fillAvailable++;
      }
    }
  } catch (e) { /* best effort */ }

  if ((vhRules || vhSized) && unitSupport.svh) viewportHazards.push({
    hazard: 'vh used for sizing while svh/dvh are available',
    cssRules: vhRules, inlineElements: vhSized, sample: vhSample,
    hint: '100vh resolves to the LARGE viewport on both iOS Safari and Chrome Android, so a full-height ' +
      'hero overflows the visible screen by the height of the browser chrome. Use svh for anything that ' +
      'must not move. NOT reproducible headlessly — verify on a real phone.' });

  if (fillAvailable) viewportHazards.push({
    hazard: '-webkit-fill-available used as a 100vh workaround', cssRules: fillAvailable,
    hint: 'superseded by svh/dvh, and it is NOT WebKit-only — Chromium honours it too, so @supports gating ' +
      'on it does not work. Legacy tech debt rather than a live fix.' });

  if (/safe-area-inset/.test(document.documentElement.outerHTML.slice(0, 200000)) && !/viewport-fit\s*=\s*cover/.test(vpMeta))
    viewportHazards.push({ hazard: 'safe-area-inset used without viewport-fit=cover', viewportMeta: vpMeta || '(none)',
      hint: 'without viewport-fit=cover every safe-area inset resolves to 0px, so the padding silently does nothing on iPhone' });

  // ── COMPOSITING HAZARDS (Safari-only, verified against WPT + real WebKit) ─────
  // Three constructions that render correctly in Chromium and visibly break in
  // Safari. None of them can be caught by a headless WebKit run either, because the
  // failure is in *painting* — computed styles are identical in both engines. But
  // the constructions themselves are trivially detectable, which is the only way
  // this class shows up in automation at all.
  const all2 = Array.from(document.querySelectorAll('body *')).slice(0, 4000);

  // (a) `-webkit-backdrop-filter` without the unprefixed property. The prefixed
  // form is a live alias in WebKit and creates a containing block; Chromium doesn't
  // parse it at all. A frosted nav authored with only the prefix therefore traps
  // its own mega-menu/modal inside the bar in Safari and works fine in Chrome.
  const prefixOnlyBackdrop = all2.filter(el => {
    const c = getComputedStyle(el);
    const pre = c.webkitBackdropFilter, un = c.backdropFilter;
    if (!pre || pre === 'none') return false;
    return !un || un === 'none';
  }).map(el => ({ el: desc(el),
    fixedDescendants: Array.from(el.querySelectorAll('*'))
      .filter(d => getComputedStyle(d).position === 'fixed').length,
    hint: 'only -webkit-backdrop-filter is set. Add the unprefixed property; in WebKit the prefixed ' +
      'form still creates a containing block, so any position:fixed descendant is trapped inside this element' })).slice(0, 6);

  // (b) mix-blend-mode inside a scroll/clip container. WebKit's composited scroller
  // isolates the blend, so it silently renders as `normal`. Confirmed broken in
  // every Safari from 15.5 to 26.5 (WPT reftests fail throughout; WebKit 315063).
  const blendInScroller = all2.filter(el => {
    const c = getComputedStyle(el);
    if (!c.mixBlendMode || c.mixBlendMode === 'normal') return false;
    let n = el.parentElement;
    while (n && n !== document.body) { const pc = getComputedStyle(n);
      if (/scroll|auto|hidden/.test(pc.overflowX + pc.overflowY)) return true;
      n = n.parentElement; }
    return false;
  }).map(el => ({ el: desc(el), blendMode: getComputedStyle(el).mixBlendMode,
    hint: 'mix-blend-mode inside an overflow scroll/hidden ancestor does not blend in Safari (renders as ' +
      'normal) — still broken in Safari 26. Move the blended layer outside the clipping container.' })).slice(0, 8);

  // (c) large filter: blur() on a fixed element. On iOS this stalls first paint for
  // ~20s (WebKit 319187, open against iOS 26.4) — a blank white page, not a subtle
  // artefact. Desktop Safari and Chrome are unaffected, so nobody catches it.
  const heavyFixedBlur = all2.filter(el => {
    const c = getComputedStyle(el);
    if (c.position !== 'fixed' && c.position !== 'absolute') return false;
    const m = /blur\((\d+(?:\.\d+)?)px\)/.exec(c.filter || '');
    return m && parseFloat(m[1]) >= 40;
  }).map(el => ({ el: desc(el), filter: getComputedStyle(el).filter,
    hint: 'large blur() on a fixed/absolute element can stall first paint for ~20s on iOS (blank page). ' +
      'Pre-render the blur into an image, or reduce the radius.' })).slice(0, 6);

  // ── 19) HIT-TEST BLOCKING ─────────────────────────────────────────────────────
  // Ask the browser what actually receives a click at the centre of every visible
  // control. If it isn't the control, something invisible sits on top and the button
  // is dead — the user sees a perfectly normal CTA that does nothing. One generic
  // probe covers several distinct causes: a stuck sticky <thead> composited at full
  // table height (still broken in Safari 26), grid items whose hit-test order
  // doesn't match paint order (Safari ≤18), and any decorative overlay missing
  // `pointer-events: none`.
  const hitBlocked = [];
  Array.from(document.querySelectorAll('a[href],button,[role="button"],input,select,textarea,summary'))
    .forEach(el => {
      if (hitBlocked.length > 10 || !visible(el)) return;
      if (el.closest(V.devFurniture)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      // Sample several points, not just the centre. A control that merely *overlaps*
      // something at its midpoint is usually still clickable at its edges, and
      // reporting those buries the genuinely dead ones. Require a majority blocked.
      const pts = [[0.5, 0.5], [0.2, 0.3], [0.8, 0.3], [0.2, 0.7], [0.8, 0.7]]
        .map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy])
        .filter(([x, y]) => x > 0 && y > 0 && x < vw && y < innerHeight);
      if (pts.length < 3) return;                                // too close to an edge to judge
      const blockers = [];
      pts.forEach(([x, y]) => { const hit = document.elementFromPoint(x, y);
        if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return;
        blockers.push(hit); });
      if (blockers.length <= pts.length / 2) return;              // mostly reachable — not a defect
      const b = blockers[0], bs = getComputedStyle(b);
      // Fully blocked and partially blocked are different findings. Every point
      // blocked = the control cannot be clicked at all, which is a defect. Some
      // points blocked = it overlaps something and is still usable, which is worth
      // seeing but is not broken. Collapsing the two makes the real ones unbelievable.
      const full = blockers.length === pts.length;
      hitBlocked.push({ el: desc(el), text: txt(el).slice(0, 30), blockedBy: desc(b),
        blockedPoints: `${blockers.length}/${pts.length}`, severity: full ? 'unclickable' : 'partially covered',
        blockerZ: bs.zIndex, blockerPosition: bs.position,
        blockerTransparent: bs.backgroundColor === 'rgba(0, 0, 0, 0)' && bs.backgroundImage === 'none',
        hint: full
          ? 'every sampled point lands on something else — this control cannot be clicked. A transparent ' +
            'blocker needs pointer-events:none; a stale open panel needs display:none.'
          : 'overlaps another element over part of its area — still clickable, but check the stacking' });
    });

  // ── 20) ASPECT-RATIO DECLARED vs MEASURED ─────────────────────────────────────
  // `aspect-ratio` on a flex or grid item is among the least interoperable things in
  // CSS right now — WebKit is mid-rewrite and several cases are still wrong in
  // shipping Safari. Rather than encode which cases, compare what was asked for
  // against what was rendered: a box that doesn't honour its own ratio is a finding
  // in any engine, and this needs no knowledge of engine versions.
  const aspectBroken = [];
  all2.forEach(el => {
    if (aspectBroken.length > 10) return;
    const c = getComputedStyle(el);
    if (!c.aspectRatio || c.aspectRatio === 'auto') return;
    const m = /^([\d.]+)\s*\/\s*([\d.]+)$/.exec(c.aspectRatio.trim());
    const want = m ? +m[1] / +m[2] : parseFloat(c.aspectRatio);
    if (!want || !isFinite(want)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 8) return;
    const got = r.width / r.height;
    if (Math.abs(got - want) / want > 0.05)
      aspectBroken.push({ el: desc(el), declared: c.aspectRatio, rendered: got.toFixed(2),
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        hint: 'does not render at its declared aspect-ratio — common on flex/grid children in Safari' });
  });

  // ── 21) iOS INPUT AUTO-ZOOM ───────────────────────────────────────────────────
  // Any form control rendering below 16px makes iOS zoom the whole viewport on tap,
  // stranding the user scrolled sideways mid-form. Chromium never does this, so it
  // survives desktop review every time. Keyed on the absolute rendered size, so
  // rem/clamp() values that resolve under 16px still count.
  const zoomOnFocus = Array.from(document.querySelectorAll(
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea'))
    .filter(el => visible(el) && parseFloat(getComputedStyle(el).fontSize) < 16)
    .map(el => ({ el: desc(el), fontSize: getComputedStyle(el).fontSize,
      hint: 'under 16px — iOS zooms the viewport when this is tapped' })).slice(0, 8);

  // ── 22) ROUNDED CONTAINER AROUND MEDIA ────────────────────────────────────────
  // Video and iframes get their own system compositing layer, which can escape an
  // ancestor's border-radius clip in WebKit — a rounded hero video paints as a hard
  // rectangle. Cheap to make robust: put the radius on the media itself, or isolate
  // the parent.
  const radiusMedia = Array.from(document.querySelectorAll('video,iframe')).filter(m => {
    const par = m.parentElement; if (!par || !visible(m)) return false;
    const ps = getComputedStyle(par), ms = getComputedStyle(m);
    return parseFloat(ps.borderRadius) > 0 && ps.overflow !== 'visible' &&
      ps.isolation !== 'isolate' && parseFloat(ms.borderRadius) === 0;
  }).map(m => ({ el: desc(m), parent: desc(m.parentElement),
    hint: 'rounded corners rely on the parent clipping media — put the radius on the ' +
      'video/iframe itself, or add isolation:isolate to the parent' })).slice(0, 6);

  // Which of these engine-divergent features the page ACTUALLY uses. An engine diff
  // is only a finding if the page depends on the thing that differs — otherwise the
  // cross-browser section fills with the same three lines of engine trivia on every
  // site, and a section that always says the same thing stops being read.
  const usesFeatures = {
    backdropFilter: all2.filter(el => { const c = getComputedStyle(el);
      return (c.backdropFilter && c.backdropFilter !== 'none') ||
        (c.webkitBackdropFilter && c.webkitBackdropFilter !== 'none'); }).length,
    mixBlendMode: all2.filter(el => { const m = getComputedStyle(el).mixBlendMode; return m && m !== 'normal'; }).length,
    plusDarker: all2.filter(el => /plus-darker/.test(getComputedStyle(el).mixBlendMode || '')).length,
    filterContainingBlock: all2.filter(el => { const c = getComputedStyle(el);
      return c.filter && c.filter !== 'none'; }).length,
    aspectRatio: all2.filter(el => getComputedStyle(el).aspectRatio !== 'auto').length,
    scrollSnap: all2.filter(el => { const c = getComputedStyle(el);
      return c.scrollSnapType && c.scrollSnapType !== 'none'; }).length,
    sticky: all2.filter(el => getComputedStyle(el).position === 'sticky').length,
    lazyImages: document.querySelectorAll('img[loading="lazy"]').length,
    video: document.querySelectorAll('video').length
  };

  const hasForm = !!document.querySelector('input,textarea,select');
  const hasFixedBottom = Array.from(document.querySelectorAll('body *')).slice(0, 2000).some(el => {
    const c = getComputedStyle(el); if (c.position !== 'fixed' && c.position !== 'sticky') return false;
    const r = el.getBoundingClientRect(); return r.bottom > innerHeight - 8 && r.width > innerWidth * 0.5;
  });
  if (hasForm && hasFixedBottom && !/interactive-widget/.test(vpMeta))
    viewportHazards.push({ hazard: 'form + bottom-fixed bar, no interactive-widget declaration', viewportMeta: vpMeta || '(none)',
      hint: 'the on-screen keyboard does not resize the layout viewport, so the fixed bar hides behind it. ' +
        'interactive-widget=resizes-content fixes this in Chromium/Firefox; Safari does not implement it, so ' +
        'iOS needs a visualViewport-based fallback. Verify with a keyboard open on a device.' });

  // ── 18) VIDEO ─────────────────────────────────────────────────────────────────
  // Background video is the highest-risk element on a marketing page, and nearly
  // every way it fails is Safari-specific and invisible in a headless run: iOS
  // refuses to autoplay without BOTH `muted` and `playsinline` (and without the
  // latter a tap throws the video into native fullscreen), it ignores `preload` so
  // an unposted video is a black box until the user acts, and WebM-only sources
  // decode on some Apple hardware and not others. None of that reproduces in
  // Playwright — its bundled builds don't even carry the same codecs as real
  // Safari, so a passing headless run means nothing here. The markup, though, is
  // fully auditable, and the markup is where all of these are actually fixed.
  const videos = Array.from(document.querySelectorAll('video'));
  const srcTypes = v => Array.from(v.querySelectorAll('source'))
    .map(s => (s.type || s.getAttribute('src') || '').toLowerCase());
  const videoIssues = videos.map(v => {
    const problems = [];
    const types = srcTypes(v);
    const all = types.concat([(v.getAttribute('src') || '').toLowerCase()]).join(' ');
    if (v.hasAttribute('autoplay')) {
      if (!v.hasAttribute('playsinline'))
        problems.push('autoplay without playsinline — iOS will refuse to autoplay and a tap opens native fullscreen');
      if (!v.hasAttribute('muted') && !v.muted)
        problems.push('autoplay without muted — blocked by every engine');
    }
    if (!v.getAttribute('poster') && !/#t=/.test(v.currentSrc || v.getAttribute('src') || ''))
      problems.push('no poster and no #t= frame hint — renders as a black box on iOS, which does not preload');
    if (all.includes('webm') && !/mp4|quicktime|hvc1/.test(all))
      problems.push('WebM with no MP4/QuickTime fallback — decoding is hardware-gated on Apple devices');
    const cs = getComputedStyle(v);
    if (!(v.getAttribute('width') && v.getAttribute('height')) && cs.aspectRatio === 'auto' &&
        !/px|%/.test(cs.height))
      problems.push('no dimensions or aspect-ratio — defaults to 300x150 until metadata loads (layout shift)');
    const par = v.parentElement;
    if (par) { const ps = getComputedStyle(par);
      if (parseFloat(ps.borderRadius) > 0 && ps.overflow !== 'visible' && ps.isolation !== 'isolate' &&
          (cs.transform !== 'none' || /transform/.test(cs.transition) || cs.animationName !== 'none'))
        problems.push('transformed video in a rounded overflow:hidden parent — Safari may not clip the corners; add isolation:isolate'); }
    return problems.length ? { el: desc(v), src: (v.currentSrc || v.getAttribute('src') || '(source tags)').slice(-50),
      problems } : null;
  }).filter(Boolean);

  return {
    favicon,
    containerGutters,
    video: { total: videos.length, issues: videoIssues.slice(0, 8),
      note: videos.length ? 'Video failures are overwhelmingly Safari/iOS-specific and are NOT reproducible in ' +
        'headless WebKit (different bundled codecs, no iOS media policy). Fix the markup; verify on a device.' : undefined },
    viewport: { meta: vpMeta || '(none)', unitSupport,
      measured: { vh: probe('100vh'), svh: unitSupport.svh ? probe('100svh') : null,
        dvh: unitSupport.dvh ? probe('100dvh') : null, innerHeight,
        visualViewport: (window.visualViewport && Math.round(window.visualViewport.height)) || null },
      hazards: viewportHazards,
      compositingHazards: { prefixOnlyBackdrop, blendInScroller, heavyFixedBlur },
      usesFeatures,
      note: 'Headless engines have no retractable URL bar, keyboard or safe area — these are hazards found by ' +
        'construction, not reproduced defects. A clean result here is not evidence the page is fine on iOS.' },
    svg: { total: svgList.length, medianWidth: Math.round(medianSvg),
      oversized: oversizedSvgs.slice(0, 10),
      noIntrinsicSize: svgNoIntrinsic.slice(0, 12),
      aspectMismatch: svgAspectOff.slice(0, 10) },
    falseAffordance: falseAffordance.slice(0, 12),
    missingAffordance: missingAffordance.slice(0, 8),
    unselectableText: unselectable,
    missingGaps,
    cmsEmptyStates: { emptyLists, emptyBindings },
    upscaledImages: upscaled,
    hitTestBlocked: hitBlocked,
    aspectRatioNotHonoured: aspectBroken,
    inputsCausingIosZoom: zoomOnFocus,
    mediaClippedByParentRadius: radiusMedia,
    duplicateListItems: duplicateItems,
    heroFill,
    unlinkedPhones: unlinkedPhones.slice(0, 8),
    unlinkedEmails: unlinkedEmails.slice(0, 8),
    nearMissWraps: dedupeByText(nearMissWraps).slice(0, 12),
    orphanHeadings: orphanHeadings.slice(0, 10),
    wrappedGroups: wrappedGroups.slice(0, 10),
    duplicateIcons: duplicateIcons.slice(0, 8),
    devFurniture: { widgets: devWidgets, devScripts, strayFixedBoxes },
    navContentParity: navParity.slice(0, 6).map(({ _sig, ...rest }) => rest),
    currentPageIndication,
    motion: { sectionsWithNoMotion, fastAnimations: fastAnimations.slice(0, 8), bySection: motionBySection.slice(0, 20) }
  };
})();
