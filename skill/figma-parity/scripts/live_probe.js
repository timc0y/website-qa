/*
 * live_probe.js — framework-neutral browser helpers for Figma parity review.
 *
 * These are meant to be pasted into a browser MCP javascript_exec call. Each is
 * an IIFE-friendly snippet; copy the body you need, or define them once on the
 * page (window.QA = ...) and call across turns. getComputedStyle-based reads work
 * even when screenshots fail, so measurement never depends on the compositor.
 */

// ---------------------------------------------------------------------------
// mapSections() — list top-level sections with geometry + a text snippet.
// Returns { docHeight, viewport, sections:[{s,top,h,txt,bg}] }. Save as sections.json.
// Tune the selector when the app has no semantic section boundaries.
// ---------------------------------------------------------------------------
(() => {
  const out = [], seen = new Set();
  const selectorFor = el => {
    if (el.id) return `#${CSS.escape(el.id)}`;
    for (const attr of ['data-section', 'data-testid', 'aria-label']) {
      const value = el.getAttribute(attr);
      if (value) return `${el.tagName.toLowerCase()}[${attr}="${CSS.escape(value)}"]`;
    }
    const parent = el.parentElement;
    const siblings = parent ? Array.from(parent.children).filter(node => node.tagName === el.tagName) : [];
    const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(el) + 1})` : '';
    return `${el.tagName.toLowerCase()}${suffix}`;
  };
  document.querySelectorAll('section, .section, [data-section], footer, nav').forEach(el => {
    const r = el.getBoundingClientRect();
    const top = Math.round(r.top + window.scrollY);
    const key = top + ':' + Math.round(r.height);
    if (seen.has(key) || r.height < 40) return;
    seen.add(key);
    const c = getComputedStyle(el);
    out.push({
      s: selectorFor(el),
      top, h: Math.round(r.height),
      pt: c.paddingTop, pb: c.paddingBottom,
      bg: c.backgroundColor,
      txt: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50)
    });
  });
  out.sort((a, b) => a.top - b.top);
  return { docHeight: document.body.scrollHeight, viewport: innerWidth + 'x' + innerHeight, sections: out };
})();

// ---------------------------------------------------------------------------
// showOnly(selector) — temporarily hide sibling regions so a deep target renders
// near the page top. Restore exact inline display values with showAll().
// ---------------------------------------------------------------------------
(() => {
  window.showOnly = sel => {
    const target = document.querySelector(sel);
    if (!target) return 'not found: ' + sel;
    window.__parityHidden = [];
    document.querySelectorAll('body > *, main > section, main > [data-section]').forEach(el => {
      if (el === target || el.contains(target) || target.contains(el)) return;
      window.__parityHidden.push([el, el.style.display, el.style.getPropertyPriority('display')]);
      el.style.setProperty('display', 'none', 'important');
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    return { showing: sel, hidden: window.__parityHidden.length };
  };
  window.showAll = () => {
    const hidden = window.__parityHidden || [];
    hidden.forEach(([el, display, priority]) => { el.style.setProperty('display', display, priority); });
    window.__parityHidden = [];
    return { restored: hidden.length };
  };
  return 'helpers ready: showOnly(sel), showAll()';
})();

// ---------------------------------------------------------------------------
// measure(pairs) — read computed styles by matching element TEXT (robust to
// class churn). pairs = [["label","containerSelector","text to find"], ...].
// Returns {label:{ff,fs,fw,lh,ls,tt,color,bg,w,h}}.
// ---------------------------------------------------------------------------
((pairs) => {
  const info = el => { if (!el) return null; const c = getComputedStyle(el), r = el.getBoundingClientRect();
    return { ff: c.fontFamily.split(',')[0].replace(/"/g, ''), fs: c.fontSize, fw: c.fontWeight,
      lh: c.lineHeight, ls: c.letterSpacing, tt: c.textTransform, color: c.color,
      bg: c.backgroundColor, w: Math.round(r.width), h: Math.round(r.height) }; };
  const find = (scope, t) => Array.from(document.querySelectorAll(scope))
    .find(e => (e.textContent || '').trim().toLowerCase().includes(t.toLowerCase()));
  const res = {};
  (pairs || []).forEach(([label, scope, text]) => { res[label] = info(find(scope, text)); });
  return res;
})(/* [["h1",".hero h1","Tax efficient"], ...] */ []);

// ---------------------------------------------------------------------------
// inspectArrow(linkSelector) — for arrow/button hover-variant bugs. Reports the
// circle variant, its bg, and EVERY nested svg path stroke/fill so you can see
// whether the right arrow colour is on top and whether a hover state exists.
// ---------------------------------------------------------------------------
((sel) => {
  const el = document.querySelector(sel);
  if (!el) return 'not found: ' + sel;
  const circle = el.querySelector('[class*="arrow-circle"],[class*="circle"]');
  const svgs = Array.from(el.querySelectorAll('svg')).map(s => {
    const p = s.querySelector('path');
    return { opacity: getComputedStyle(s).opacity,
      stroke: p ? getComputedStyle(p).stroke : null, fill: p ? getComputedStyle(p).fill : null };
  });
  return { variant: circle && circle.getAttribute && (circle.getAttribute('data-wf--arrow-circle--variant')
      || circle.className.toString().match(/(white|orange|dark|light)-\w+/)?.[0]),
    circleBg: circle ? getComputedStyle(circle).backgroundColor : null, svgs };
})(/* '.services a' */ '');

// ---------------------------------------------------------------------------
// hideOverlays() — hide dev/QA/chat widgets that obscure captures (dev-mode
// chips, Marker.io, Intercom, cookie bars). Inspect and record what will be hidden
// before calling this; a consent dialog may be part of the requested state.
// ---------------------------------------------------------------------------
(() => {
  window.hideOverlays = () => {
    const sels = ['.marker-app','[class*="marker"]','[class*="intercom"]','[id*="hubspot"]',
      '[class*="cookie"]','[class*="devtool"]','[class*="dev-mode"]','[class*="localcan"]',
      '[data-dev]','[class*="debug"]'];
    let n = 0; document.querySelectorAll(sels.join(',')).forEach(e => { e.style.setProperty('display','none','important'); n++; });
    return 'hid ' + n + ' overlay(s)';
  };
  return 'ready: inspect candidate overlays, then call hideOverlays() and record the result';
})();

// ---------------------------------------------------------------------------
// presenceAudit(cardSelector) — reliable "does each repeated card have its
// icon/thumbnail?" check. DO NOT resolve cards via closest() from a text node —
// that grabbed the wrong ancestor and produced FALSE "missing" results (it
// reported 0 icons/images on cards that plainly had both). Pass the ACTUAL card
// selector; this counts RENDERED (size>2px) svg/img per card and flags CSS
// background-image icons. Even then: confirm any "missing" against a CLEAN
// screenshot (hideOverlays first) before reporting — presence scripts still miss
// pseudo-element, mask, and sprite icons.
// ---------------------------------------------------------------------------
((sel) => {
  if (!sel) return 'pass a card selector, e.g. presenceAudit(".nav_card")';
  const vis = el => el.getBoundingClientRect().width > 2 && el.getBoundingClientRect().height > 2;
  return Array.from(document.querySelectorAll(sel)).map((c, i) => ({
    i, text: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 24),
    svg: Array.from(c.querySelectorAll('svg')).filter(vis).length,
    img: Array.from(c.querySelectorAll('img')).filter(vis).length,
    cssBgIcon: Array.from(c.querySelectorAll('*')).some(e => getComputedStyle(e).backgroundImage !== 'none')
  }));
})(/* '.nav_card' */ '');
