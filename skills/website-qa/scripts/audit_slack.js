/*
 * audit_slack.js — how much room is left, not just what has already broken.
 *
 * Every other check in this skill reports a defect that exists. This one reports the
 * distance to the next one. "This nav label fits with 3px to spare at 1280px" is not a
 * finding today and is the reason for a bug report next week, when an editor renames a
 * service or a translator lengthens a word by 12%.
 *
 * It owns the whole FIT family, because they are one measurement seen at different
 * distances from zero:
 *   - slack < 0        → `textCannotFit`: the content is already wider than its box
 *   - 0 ≤ slack < a few characters → `slackAtRisk`: the next edit breaks it
 *   - slack ≥ that     → recorded in `slack`, ranked, reported as headroom
 * Keeping them in one file is why there is one definition of "available width" rather
 * than three that drift.
 *
 * The measurement is the widest UNBREAKABLE run of the text — a word, a URL, a phone
 * number, a CMS value nobody previewed — measured with a Range around the run itself, so
 * it is glyph width and not an estimate from character counts and an average.
 *
 * Where a container is allowed to break mid-word (`overflow-wrap: break-word|anywhere`,
 * `word-break: break-all`, a soft hyphen) the longest word cannot overflow, so there is
 * nothing to report and the box is skipped.
 */
(() => {
  const vw = innerWidth;
  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');

  const ROLES = (typeof window !== 'undefined' && window.__WQA_ROLES) || null;
  /* Roles when the role pass has run, vocabulary names when this file was pasted into a
   * console on its own. The fallback is weaker on purpose and is not a second code path:
   * one predicate, two sources of evidence, better one preferred. */
  const VOCAB_INTENTIONAL = '[class*="slider"],[class*="swiper"],[class*="carousel"],' +
    '[class*="marquee"],[class*="slide"],.w-slider,[class*="ticker"]';
  const isMechanism = el => ROLES
    ? ROLES.withinRole(el, ['track', 'slide', 'marquee', 'marqueeItem', 'scroller', 'hoverReveal', 'hoverRevealFrame'])
    : !!el.closest(VOCAB_INTENTIONAL);
  const isHidden = el => { const c = getComputedStyle(el);
    return /inset\(50%|circle\(0/.test(c.clipPath) || (el.clientWidth <= 2 && el.scrollWidth > 8) ||
      parseFloat(c.textIndent) < -900 || /visually-hidden|sr-only|screen-reader/.test(cls(el)); };

  const rg = document.createRange();
  const rows = [];
  const els = Array.from(document.querySelectorAll('body *'));

  for (const el of els) {
    if (rows.length >= 400) break;
    if (/^(script|style|noscript|template|option|textarea|pre|code|svg)$/i.test(el.tagName)) continue;
    if (el.closest('pre,code,svg')) continue;
    const c = getComputedStyle(el);
    if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) continue;
    if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true })) continue;
    if (isHidden(el) || isMechanism(el)) continue;

    const tns = Array.from(el.childNodes).filter(n => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (!tns.length) continue;

    const box = el.getBoundingClientRect();
    const padL = parseFloat(c.paddingLeft) || 0, padR = parseFloat(c.paddingRight) || 0;
    const available = el.clientWidth - padL - padR;
    if (!(available > 8)) continue;

    /* A box that HUGS its text has no slack worth reporting: it is as wide as its content
     * because it was sized BY that content, so the next longer word simply makes it wider.
     * Reporting those gave twelve findings at every width — every nav label, every tag chip,
     * every rating pill, all at "0 characters of headroom" — true of each box and false
     * about the page.
     *
     * Two questions, and the first attempt asked only the second: is there space beside
     * this element, and CAN it take that space? A 162px-wide div in a 1512px body has 1350px
     * of space it cannot use, and skipping it lost the real finding. Only a shrink-to-fit
     * box grows into free space, and shrink-to-fit is a property of its formatting context —
     * inline-block, float, absolute, a fit-content width, or a flex item allowed to size
     * itself. Anything else is constrained by its parent, so the question passes upward. */
    const shrinkToFit = n => {
      const nc = getComputedStyle(n);
      if (/inline-block|inline-flex|inline-grid|table|inline-table/.test(nc.display)) return true;
      if (/absolute|fixed/.test(nc.position) || nc.float !== 'none') return true;
      if (/fit-content|max-content|min-content/.test(nc.width)) return true;
      const p2 = n.parentElement; if (!p2) return false;
      const pc2 = getComputedStyle(p2);
      if (/^inline$/.test(pc2.display)) return true;
      // a flex item with an automatic basis and no growth sizes to its own content
      if (/flex$/.test(pc2.display) && nc.flexBasis === 'auto' && parseFloat(nc.flexGrow) === 0) return true;
      return false;
    };
    const canGrow = el2 => {
      for (let n = el2, hops = 0; n && hops < 6; n = n.parentElement, hops++) {
        if (!shrinkToFit(n)) continue;              // constrained by its parent — ask the parent
        const p2 = n.parentElement; if (!p2) return true;
        const pc2 = getComputedStyle(p2);
        const avail = p2.clientWidth - (parseFloat(pc2.paddingLeft) || 0) - (parseFloat(pc2.paddingRight) || 0);
        if (avail > 0 && avail - n.getBoundingClientRect().width > 3) return true;
      }
      return false;
    };

    const nowrap = /nowrap|pre$/.test(c.whiteSpace);
    const breakable = /break-word|anywhere/.test(c.overflowWrap) || /break-all|break-word/.test(c.wordBreak);

    /* What has to fit on one line? With `nowrap`, the whole run of text. Otherwise the
     * widest single unbreakable token — the only thing the engine cannot move to the next
     * line. Both measured as rendered glyphs. */
    let need = 0, needLabel = '', line = 0, chars = 0;
    for (const n of tns) {
      const s = n.textContent;
      rg.selectNodeContents(n);
      for (const b of rg.getClientRects()) line = Math.max(line, b.height);
      if (nowrap) {
        const b = rg.getBoundingClientRect();
        if (b.width > need) { need = b.width; needLabel = s.replace(/\s+/g, ' ').trim().slice(0, 40); chars = s.trim().length; }
        continue;
      }
      if (breakable) continue;
      const re = /\S+/g; let m;
      while ((m = re.exec(s))) {
        if (m[0].length < 4) continue;                  // a short word cannot be the constraint
        rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const b = rg.getBoundingClientRect();
        if (b.width > need) { need = b.width; needLabel = m[0].slice(0, 40); chars = m[0].length; }
      }
    }
    if (!need) continue;

    const slack = available - need;
    // characters of headroom, using this element's own average glyph width — the unit an
    // editor actually thinks in ("can I add a word?"), not pixels
    const perChar = chars > 0 ? need / chars : parseFloat(c.fontSize) * 0.5;
    let clipped = false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement)
      if (/hidden|clip/.test(getComputedStyle(a).overflowX)) { clipped = true; break; }

    rows.push({ _el: el, el: desc(el), roomToWiden: canGrow(el),
      constraint: nowrap ? 'the whole line (white-space: nowrap)' : 'longest unbreakable word',
      text: needLabel, needPx: Math.round(need), availablePx: Math.round(available),
      slackPx: Math.round(slack), slackChars: perChar > 0 ? Math.round(slack / perChar) : null,
      lineHeightPx: Math.round(line), whiteSpace: c.whiteSpace, overflowWrap: c.overflowWrap,
      docY: Math.round(box.top + scrollY), clippedByAncestor: clipped });
  }

  rows.sort((a, b) => a.slackPx - b.slackPx);
  const strip = ({ _el, ...rest }) => rest;

  /* Already broken. Same shape the previous `textCannotFit` reported, so stored baselines
   * stay comparable — this file took the measurement over, not the finding's identity. */
  const textCannotFit = rows.filter(r => r.slackPx < -1 && !/nowrap|pre$/.test(r.whiteSpace)).slice(0, 10)
    .map(r => ({ el: r.el, word: r.text, wordWidth: r.needPx, availableWidth: r.availablePx,
      shortBy: -r.slackPx, overflowWrap: r.overflowWrap, wordBreak: r.whiteSpace, docY: r.docY,
      confidence: 'measured',
      outcome: r.clippedByAncestor ? 'the end of the word is cut off by a clipping ancestor'
                                   : 'the word pushes outside its box',
      hint: 'one unbreakable token is wider than its container. Either the container needs to ' +
            'flow to its content, or the text needs overflow-wrap. Editors will hit this again ' +
            'with the next long value, so fix the rule, not the word.' }));

  const nowrapOverflow = rows.filter(r => r.slackPx < -1 && /nowrap|pre$/.test(r.whiteSpace)).slice(0, 10)
    .map(r => ({ el: r.el, text: r.text, whiteSpace: r.whiteSpace, overflowsBy: -r.slackPx,
      box: r.availablePx + 'px', confidence: 'measured',
      hint: 'white-space:nowrap on text that does not fit; it will be cut or push out' }));

  /* The predictive half. A threshold in CHARACTERS rather than pixels, because that is the
   * unit of the thing that will break it: someone typing. Two characters of headroom on a
   * nav label is a defect waiting for a rename; two characters on a paragraph is nothing,
   * hence the floor on how small a box has to be to care. */
  const AT_RISK_CHARS = 2;
  const slackAtRisk = rows
    .filter(r => r.slackPx >= -1 && r.slackChars !== null && r.slackChars <= AT_RISK_CHARS)
    // a box with somewhere to expand into is not at risk, however tight it looks
    .filter(r => !r.roomToWiden)
    .slice(0, 12)
    .map(r => ({ el: r.el, text: r.text, slackPx: r.slackPx, slackChars: r.slackChars,
      needPx: r.needPx, availablePx: r.availablePx, constraint: r.constraint, docY: r.docY,
      confidence: 'measured',
      hint: `fits with ${r.slackChars} character(s) to spare at ${vw}px. Not broken now; ` +
            'the next longer word, translation or font swap breaks it.' }));

  return {
    viewport: vw,
    // the fragility map: tightest boxes first, so a reviewer reads the edge of the design
    slack: rows.slice(0, 25).map(strip),      // includes hugging boxes, flagged `roomToWiden`
    slackAtRisk,
    textCannotFit,
    nowrapOverflow,
    measured: rows.length,
    roleSource: ROLES ? 'inferred roles' : 'vocabulary selectors (role pass not run)',
    note: 'Slack is the distance to the next defect, measured on rendered glyphs. Boxes that ' +
      'may break mid-word are excluded: their longest word cannot overflow.'
  };
})();
