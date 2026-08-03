/*
 * audit_transitions.js — find state changes that SNAP (no valid transition).
 *
 * The bug class: an element changes a property on :hover / :focus / an active
 * state (background, color, transform, opacity, box-shadow, …) but has no
 * `transition` covering that property (or duration 0), so it jumps instantly
 * instead of animating. Also catches asymmetric transitions (declared only on the
 * :hover rule → eases in, snaps out).
 *
 * The file's trailing value is the STATIC audit result (so a headless runner can
 * `eval` it), and it also attaches runtime helpers to window for interactive use:
 *   qaSnap(sel) → trigger a REAL hover/click via the tool → qaDiff()
 * which diffs computed styles for ANY state change (CSS or Webflow IX2) and flags
 * changed properties that lack a transition. If qaDiff() shows no change, the
 * state is IX2/JS-driven and didn't fire on the synthetic event — note for manual
 * review rather than reporting "no hover state".
 *
 * Static analysis sees only CSS-driven state rules; Webflow IX2 (JS) changes have
 * no CSS transition by design and are correctly NOT flagged here.
 */

// --- runtime helpers (side-effect: define window.qaSnap / window.qaDiff) ---
(() => {
  const WATCH = ['color', 'backgroundColor', 'backgroundImage', 'opacity', 'transform',
    'boxShadow', 'borderColor', 'borderWidth', 'filter', 'outlineColor',
    'width', 'height', 'letterSpacing', 'fontSize', 'fill', 'stroke', 'gap',
    'paddingLeft', 'marginLeft', 'top', 'left'];
  window.qaSnap = (sel) => {
    const el = document.querySelector(sel); if (!el) return 'not found: ' + sel;
    const c = getComputedStyle(el); const s = {}; WATCH.forEach(p => s[p] = c[p]);
    window.__qaSnap = { sel, style: s, transitionProperty: c.transitionProperty, transitionDuration: c.transitionDuration };
    return 'snapshot: ' + sel + ' (now trigger a REAL hover/click, then call qaDiff())';
  };
  window.qaDiff = () => {
    const snap = window.__qaSnap; if (!snap) return 'call qaSnap(sel) first';
    const el = document.querySelector(snap.sel); if (!el) return 'element gone';
    const c = getComputedStyle(el);
    const props = c.transitionProperty.split(',').map(s => s.trim());
    const durs = c.transitionDuration.split(',').map(s => parseFloat(s) || 0);
    const cssName = { backgroundColor: 'background-color', backgroundImage: 'background-image', boxShadow: 'box-shadow',
      borderColor: 'border-color', borderWidth: 'border-width', outlineColor: 'outline-color',
      letterSpacing: 'letter-spacing', fontSize: 'font-size', paddingLeft: 'padding-left', marginLeft: 'margin-left' };
    const covers = (jsProp) => { const p = cssName[jsProp] || jsProp;
      for (let i = 0; i < props.length; i++) { const tp = props[i], dur = durs[durs.length === 1 ? 0 : i] || 0;
        if (dur <= 0) continue; if (tp === 'all' || tp === p || p.startsWith(tp + '-')) return true;
        if (tp === 'transform' && jsProp === 'transform') return true; } return false; };
    const changed = []; WATCH.forEach(p => { if (snap.style[p] !== c[p]) changed.push({ prop: p, from: snap.style[p], to: c[p], hasTransition: covers(p) }); });
    return { sel: snap.sel, changed, snaps_noTransition: changed.filter(x => !x.hasTransition).map(x => x.prop),
      transitionProperty: c.transitionProperty, transitionDuration: c.transitionDuration,
      note: changed.length ? '' : 'no change detected — state may be IX2/JS-driven and not fire on synthetic events' };
  };
})();

// --- STATIC audit (trailing expression = the file's return value) ---
(() => {
  const STATE = /(:hover|:focus(-visible)?|:active|\.is-active|\.is-open|\.w--open|\.is-current|\.active\b|\.open\b)/g;
  const ANIMATABLE = /^(color|background|background-color|border|border-.*-color|box-shadow|opacity|transform|filter|backdrop-filter|outline|outline-color|fill|stroke|width|height|max-width|max-height|margin|margin-.*|padding|padding-.*|top|left|right|bottom|gap|scale|translate|rotate|letter-spacing|font-size)$/;
  const EXPAND = {
    'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    'border': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'inset': ['top', 'right', 'bottom', 'left'], 'transform': ['scale', 'translate', 'rotate']
  };
  const rules = [];
  for (const sheet of document.styleSheets) {
    let list; try { list = sheet.cssRules; } catch (e) { continue; }
    const walk = l => { for (const r of l) { if (r.style && r.selectorText) rules.push(r); else if (r.cssRules) walk(r.cssRules); } };
    walk(list);
  }
  const covers = (cs, prop) => {
    const props = cs.transitionProperty.split(',').map(s => s.trim());
    const durs = cs.transitionDuration.split(',').map(s => parseFloat(s) || 0);
    for (let i = 0; i < props.length; i++) { const tp = props[i], dur = durs[durs.length === 1 ? 0 : i] || 0;
      if (dur <= 0) continue; if (tp === 'all' || tp === prop) return true;
      if (prop.startsWith(tp + '-')) return true; if (EXPAND[tp] && EXPAND[tp].includes(prop)) return true; }
    return false;
  };
  const out = [], seen = new Set();
  for (const r of rules) {
    if (!STATE.test(r.selectorText)) { STATE.lastIndex = 0; continue; } STATE.lastIndex = 0;
    const setProps = []; for (let i = 0; i < r.style.length; i++) { const p = r.style[i]; if (ANIMATABLE.test(p)) setProps.push(p); }
    const declaresTransition = /transition/.test(r.style.cssText);
    if (!setProps.length) continue;
    const base = (r.selectorText.replace(STATE, '').trim() || '*').split(',').map(s => s.trim()).filter(Boolean)[0];
    let els; try { els = document.querySelectorAll(base); } catch (e) { continue; } if (!els.length) continue;
    const cs = getComputedStyle(els[0]); const missing = setProps.filter(p => !covers(cs, p));
    const focusRing = /:focus/.test(r.selectorText) && missing.length && missing.every(p => /^outline/.test(p));
    const key = r.selectorText + '|' + missing.join(',');
    if ((missing.length || declaresTransition) && !seen.has(key)) { seen.add(key);
      out.push({ selector: r.selectorText, base, matchCount: els.length, changed: setProps,
        snaps_noTransition: missing, focusRing, transitionOnStateRuleOnly: declaresTransition,
        baseTransitionProperty: cs.transitionProperty, baseTransitionDuration: cs.transitionDuration }); }
  }
  out.sort((a, b) => (a.focusRing - b.focusRing) || (b.snaps_noTransition.length - a.snaps_noTransition.length));
  return { checked: rules.length, flagged: out.length, designSnaps: out.filter(f => !f.focusRing).length, findings: out.slice(0, 60) };
})();
