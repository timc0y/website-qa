/*
 * live_probe.js — reusable browser-side helpers for Figma↔live QA.
 *
 * These are meant to be pasted into a browser MCP javascript_exec call. Each is
 * an IIFE-friendly snippet; copy the body you need, or define them once on the
 * page (window.QA = ...) and call across turns. getComputedStyle-based reads work
 * even when screenshots fail, so measurement never depends on the compositor.
 */

// ---------------------------------------------------------------------------
// mapSections() — list top-level sections with geometry + a text snippet.
// Returns { docHeight, viewport, sections:[{s,top,h,txt,bg}] }. Save as sections.json.
// Tune the selector to the site; the default catches Webflow section patterns.
// ---------------------------------------------------------------------------
(() => {
  const out = [], seen = new Set();
  document.querySelectorAll('section, .section, [data-section], footer, nav').forEach(el => {
    const r = el.getBoundingClientRect();
    const top = Math.round(r.top + window.scrollY);
    const key = top + ':' + Math.round(r.height);
    if (seen.has(key) || r.height < 40) return;
    seen.add(key);
    const c = getComputedStyle(el);
    out.push({
      s: el.tagName.toLowerCase() + (el.className ? '.' + el.className.toString().trim().split(/\s+/)[0] : ''),
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
// showOnly(selector) — hide every other section so the target renders near the
// top of the document, where browser-pane screenshots are reliable. Deep-scroll
// captures frequently return blank white; this is the fix. Restore with showAll().
// ---------------------------------------------------------------------------
(() => {
  const ALL = ['.hero','.hero-home','.trust-bar','.about-intro','.services','.compare',
    '.who-help','.testi','.insights','.faq','.cta-start','.component_footer','footer'];
  window.__qaAll = window.__qaAll || ALL;                 // edit to the real section list
  window.showOnly = (sel) => { window.__qaAll.forEach(s => {
    const el = document.querySelector(s); if (el) el.style.display = (s === sel) ? '' : 'none'; });
    window.scrollTo(0, 0); return 'showing ' + sel; };
  window.showAll = () => { window.__qaAll.forEach(s => {
    const el = document.querySelector(s); if (el) el.style.display = ''; }); return 'restored'; };
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
// forcePanel(selector) — reveal a Webflow IX2 dropdown/mega-menu panel that is
// display:none and won't open on synthetic hover. Lets you QA its layout/content.
// NOTE: interaction-driven changes elsewhere (nav theme swap) will NOT fire —
// flag those as "needs manual hover".
// ---------------------------------------------------------------------------
((sel) => {
  const p = document.querySelector(sel);
  if (!p) return 'no panel: ' + sel;
  Object.assign(p.style, { display: 'block', opacity: '1', visibility: 'visible', pointerEvents: 'auto' });
  const r = p.getBoundingClientRect();
  return { shown: sel, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
})(/* '.nav_panel-who' */ '');

// ---------------------------------------------------------------------------
// hideOverlays() — hide dev/QA/chat widgets that obscure captures (dev-mode
// chips, Marker.io, Intercom, cookie bars). ALWAYS run before screenshotting a
// panel/section: an overlay sitting over content is the classic cause of a
// false "this element is missing" finding.
// ---------------------------------------------------------------------------
(() => {
  window.hideOverlays = () => {
    const sels = ['.marker-app','[class*="marker"]','[class*="intercom"]','[id*="hubspot"]',
      '[class*="cookie"]','[class*="devtool"]','[class*="dev-mode"]','[class*="localcan"]',
      '[data-dev]','[id*="staging-toolbar"]','[class*="debug"]'];
    let n = 0; document.querySelectorAll(sels.join(',')).forEach(e => { e.style.setProperty('display','none','important'); n++; });
    return 'hid ' + n + ' overlay(s)';
  };
  return 'ready: hideOverlays()';
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
