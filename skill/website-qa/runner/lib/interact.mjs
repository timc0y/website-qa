/*
 * interact.mjs — the part of QA a static DOM dump can never do.
 *
 * Playwright's hover/click/scroll are TRUSTED events, so Webflow IX2 actually fires:
 * dropdowns really open, hover animations really run, scroll-triggered reveals
 * really trigger. That closes the biggest gap in the old sweep, which could only
 * look at the page in its resting state and therefore missed every item on a real
 * client QA list that started with "on hover…", "when you click…", or "as you scroll…".
 *
 * Each export takes a Playwright `page` and returns a plain findings object.
 *
 * Nothing here knows about any particular site. Every selector comes from
 * `vocab.mjs` and can be extended per project with `--vocabulary=file.json`; the
 * checks themselves reason about shapes — a repeated group, a toggle, a panel that
 * appeared, something painting on top of it.
 */
import { DEFAULT_VOCAB } from './vocab.mjs';

const SETTLE = 450;   // long enough for a typical 200–350ms transition to finish

/* Injected once per page: helpers the Node side calls through page.evaluate. */
const HELPERS = `
window.__qa = window.__qa || {};
/* SVG elements expose className as an SVGAnimatedString, not a string — reading it
   naively labels every icon "svg.[object SVGAnimatedString]". getAttribute is right
   for both trees. */
window.__qa.cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
window.__qa.desc = el => el.tagName.toLowerCase() +
  (el.id ? '#' + el.id : '') +
  (window.__qa.cls(el) ? '.' + window.__qa.cls(el).trim().split(/\\s+/).slice(0,2).join('.') : '');
window.__qa.vis = el => { if (!el) return false; const c = getComputedStyle(el), r = el.getBoundingClientRect();
  return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.01 && r.width > 0 && r.height > 0; };
/* A compact visual signature of an element AND its first few descendants, so we can
   tell whether ANYTHING changed on hover — including a child arrow recolouring or an
   image scaling, which is where the interesting hover work usually lives. */
window.__qa.sig = sel => {
  const el = document.querySelector(sel); if (!el) return null;
  const pick = n => { const c = getComputedStyle(n); return {
    bg: c.backgroundColor, bgImage: c.backgroundImage.slice(0, 60), color: c.color,
    borderColor: c.borderColor, boxShadow: c.boxShadow.slice(0, 60), opacity: c.opacity,
    transform: c.transform, filter: c.filter, textDecoration: c.textDecorationLine,
    letterSpacing: c.letterSpacing, translate: c.translate, scale: c.scale,
    // Prefixed with _ so diffSig skips them as findings — they exist only so the
    // diff can judge whether a border-colour change is even visible.
    _borderWidth: c.borderWidth, _borderStyle: c.borderStyle,
    transition: c.transitionProperty + ' / ' + c.transitionDuration };
  };
  const nodes = [el, ...Array.from(el.querySelectorAll('*')).slice(0, 8)];
  return { self: pick(el), kids: nodes.slice(1).map(pick),
    rect: (r => ({ w: Math.round(r.width), h: Math.round(r.height) }))(el.getBoundingClientRect()) };
};
/* A snapshot of the whole page's visual state, cheap enough to take before and after
   every click. Visibility alone is not enough: a dropdown reveals NEW nodes, but an
   accordion animates a node that was already there from 0px to 300px, and a tab swap
   trades one panel's visibility for another's. Recording height alongside visibility
   catches all three, which is the difference between correctly reporting a dead
   toggle and libelling every accordion on the page. */
/* Keyed by element REFERENCE, not by index into querySelectorAll. Index identity breaks
   the moment a click inserts or removes a node — every later element shifts by one and is
   then compared against its neighbour's height. That is how a mobile menu that visibly
   opens (the audit's own screenshot shows five links and a CTA) was recorded as changing
   nothing: Webflow inserts overlay nodes on open, the indices slid, and the diff cancelled
   out. Holding the actual nodes costs one array and removes the whole failure mode. */
window.__qa.snapshot = () => {
  const nodes = Array.from(document.querySelectorAll('body *'));
  const h = nodes.map(el => window.__qa.vis(el) ? Math.round(el.getBoundingClientRect().height) * 4 + 1 : 0);
  window.__qa.__snapNodes = nodes; window.__qa.__snapH = h;
  return h.length;
};
window.__qa.byIndex = i => document.querySelectorAll('body *')[i];
`;

const inject = page => page.evaluate(HELPERS);

/* Does `prop` have transition coverage on this computed style string? */
const covered = (transitionProp, prop) => {
  const list = (transitionProp || '').split(',').map(s => s.trim());
  if (list.includes('all')) return true;
  if (list.includes(prop)) return true;
  // longhand/shorthand families — border-color covers border-top-color, etc.
  const fam = { backgroundColor: ['background', 'background-color'], color: ['color'],
    borderColor: ['border', 'border-color'], boxShadow: ['box-shadow'], opacity: ['opacity'],
    transform: ['transform'], filter: ['filter'], scale: ['scale', 'transform'],
    translate: ['translate', 'transform'], letterSpacing: ['letter-spacing'],
    textDecoration: ['text-decoration', 'text-decoration-color'], bgImage: ['background', 'background-image'] };
  return (fam[prop] || []).some(p => list.includes(p));
};

/* Properties whose computed value RESOLVES FROM another property rather than being
   set independently. `border-color`'s initial value is `currentColor`, so animating
   `color` changes the computed border colour too — one visual change, not two. A
   naive computed-style diff reports the derived one as an untransitioned "snap",
   which produced a confident false finding about a nav that had no border at all. */
const RESOLVES_FROM = { borderColor: 'color', textDecoration: 'color' };

/* Is a border actually painted? A colour change on a zero-width or `none` border is
   invisible, so it can never be a defect. */
const hasVisibleBorder = s => !!s && s._borderStyle !== 'none' && parseFloat(s._borderWidth) > 0;

const diffSig = (before, after) => {
  const changes = [];
  const cmp = (a, b, where) => { if (!a || !b) return;
    for (const k of Object.keys(a)) {
      if (k === 'transition' || k.startsWith('_')) continue;   // _-prefixed are context, not findings
      if (a[k] === b[k]) continue;

      // (1) invisible border — nothing is rendered, so nothing can snap
      if (k === 'borderColor' && !hasVisibleBorder(b) && !hasVisibleBorder(a)) continue;

      // (2) derived value — if it changed in lockstep with the property it resolves
      // from, and THAT property is transitioned, the change is already covered
      const src = RESOLVES_FROM[k];
      let transitioned = covered(b.transition.split(' / ')[0], k);
      let derivedFrom;
      if (!transitioned && src && a[src] !== b[src] && b[k] === b[src] && a[k] === a[src]) {
        transitioned = covered(b.transition.split(' / ')[0], src);
        if (transitioned) derivedFrom = src;
      }
      changes.push({ where, prop: k, from: String(a[k]).slice(0, 40), to: String(b[k]).slice(0, 40),
        transitioned, ...(derivedFrom ? { derivedFrom, note: `follows ${src}, which is transitioned` } : {}) }); } };
  cmp(before.self, after.self, 'self');
  (before.kids || []).forEach((k, i) => cmp(k, (after.kids || [])[i], 'child[' + i + ']'));
  if (before.rect.w !== after.rect.w || before.rect.h !== after.rect.h)
    changes.push({ where: 'self', prop: 'size', from: `${before.rect.w}x${before.rect.h}`,
      to: `${after.rect.w}x${after.rect.h}`, transitioned: true });
  return changes;
};

/* ── HOVER ───────────────────────────────────────────────────────────────────────
 * Real hover on a deduped set of interactive elements. Two findings come out:
 *   noHoverFeedback — an obviously-interactive element where literally nothing
 *     changes (the "can the arrow cycle through on hover here also please?" class
 *     of note, and plain missed-hover-state bugs);
 *   hoverSnaps — something DOES change but with no transition covering that
 *     property, so it jumps instead of easing.
 */
export async function hoverAudit(page, { max = 26, vocab = DEFAULT_VOCAB } = {}) {
  await inject(page);
  const targets = await page.evaluate(({ MAX, SEL, IGNORE }) => {
    const seen = new Map();
    Array.from(document.querySelectorAll(SEL)).forEach(el => {
      if (!window.__qa.vis(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 12 || r.height < 12 || r.width > innerWidth * 1.2) return;
      if (el.closest(IGNORE)) return;
      // dedupe by primary class — one representative per component variant
      const key = (window.__qa.cls(el).trim().split(/\s+/)[0]) || el.tagName;
      if (seen.has(key)) return;
      seen.set(key, el);
    });
    const list = [...seen.values()].slice(0, MAX);
    list.forEach((el, i) => el.setAttribute('data-qa-hover', String(i)));
    return list.map((el, i) => ({ i, el: window.__qa.desc(el),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      cursor: getComputedStyle(el).cursor }));
  }, { MAX: max, SEL: vocab.hoverable, IGNORE: vocab.ignore });

  const results = [];
  for (const t of targets) {
    const sel = `[data-qa-hover="${t.i}"]`;
    try {
      await page.mouse.move(2, 2);                       // park the pointer well away
      await page.waitForTimeout(120);
      const before = await page.evaluate(s => window.__qa.sig(s), sel);
      await page.hover(sel, { timeout: 3000 });
      await page.waitForTimeout(SETTLE);
      const after = await page.evaluate(s => window.__qa.sig(s), sel);
      if (!before || !after) continue;
      const changes = diffSig(before, after);
      results.push({ ...t, changes });
    } catch (e) { results.push({ ...t, error: String(e.message || e).slice(0, 60) }); }
  }
  await page.mouse.move(2, 2);
  await page.evaluate(() => document.querySelectorAll('[data-qa-hover]').forEach(e => e.removeAttribute('data-qa-hover')));

  const noHoverFeedback = results.filter(r => !r.error && r.changes && !r.changes.length &&
    /pointer/.test(r.cursor)).map(r => ({ el: r.el, text: r.text,
      hint: 'clickable but nothing changes on hover — no affordance' }));
  const hoverSnaps = results.filter(r => r.changes && r.changes.length)
    .map(r => ({ el: r.el, text: r.text, snapping: r.changes.filter(c => !c.transitioned && c.prop !== 'size') }))
    .filter(r => r.snapping.length)
    .map(r => ({ ...r, snapping: r.snapping.slice(0, 4),
      hint: 'these properties change on hover with no transition covering them — they jump' }));

  return { tested: results.length, noHoverFeedback, hoverSnaps,
    withFeedback: results.filter(r => r.changes && r.changes.length).length,
    errors: results.filter(r => r.error).map(r => ({ el: r.el, error: r.error })) };
}

/* ── OPENED STATES ───────────────────────────────────────────────────────────────
 * Click every toggle we can find (nav dropdowns, hamburger, accordions, tabs),
 * screenshot each opened state, and audit the DOM that appears. This is where the
 * bugs live that a resting-state sweep structurally cannot see: a panel that opens
 * off the right edge, a dropdown painted BEHIND the next section, a toggle that
 * does nothing at all, lorem inside a panel nobody opened during review.
 */
export async function openStateAudit(page, { layoutSrc, shotDir, prefix = '', max = 14, vocab = DEFAULT_VOCAB } = {}) {
  await inject(page);
  const toggles = await page.evaluate(({ MAX, SEL, IGNORE }) => {
    // A link that navigates is not a toggle. Class-substring matching happily picks
    // up a phone link called `nav_menu-toggle-call`; clicking it changes nothing on
    // the page, which then reads as a broken toggle. Require either an explicit
    // disclosure signal or a non-navigating element.
    const isToggle = el => {
      // an <svg> matched only because its class contains "toggle" is decoration
      // inside the real control, not the control — clicking it proves nothing
      if (!/^(a|button|div|li|summary|span|p|h[1-6])$/i.test(el.tagName)) return false;
      if (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup')) return true;
      if (el.matches('.w-nav-button,.w-dropdown-toggle,.w-tab-link,[role="tab"],summary')) return true;
      const href = el.getAttribute('href');
      if (href && !/^#?$/.test(href) && !/^javascript:/i.test(href)) return false;
      return true;
    };
    // Something already in its open/active state can't demonstrate that it opens —
    // report it separately rather than calling it dead.
    const isOpen = el => el.getAttribute('aria-expanded') === 'true' ||
      el.getAttribute('aria-selected') === 'true' ||
      /\b(is-)?(active|open|current)\b|w--current|w--tab-active/.test(window.__qa.cls(el)) ||
      (el.parentElement && /\b(is-)?(active|open)\b/.test(window.__qa.cls(el.parentElement)));

    const seen = new Map();
    Array.from(document.querySelectorAll(SEL)).forEach(el => {
      if (!window.__qa.vis(el) || el.closest(IGNORE) || !isToggle(el)) return;
      const key = (window.__qa.cls(el).trim().split(/\s+/)[0]) || el.tagName;
      // keep up to 2 per component class — enough to catch "the 2nd accordion is broken"
      const n = [...seen.keys()].filter(k => k.startsWith(key)).length;
      if (n >= 2) return;
      seen.set(key + '#' + n, el);
    });
    const list = [...seen.values()].slice(0, MAX);
    list.forEach((el, i) => el.setAttribute('data-qa-toggle', String(i)));
    return list.map((el, i) => ({ i, el: window.__qa.desc(el), startedOpen: isOpen(el),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) }));
  }, { MAX: max, SEL: vocab.toggles, IGNORE: vocab.ignore });

  const states = [];
  for (const t of toggles) {
    const sel = `[data-qa-toggle="${t.i}"]`;
    try {
      const before = await page.evaluate(() => window.__qa.snapshot());
      await page.click(sel, { timeout: 3000 });
      await page.waitForTimeout(SETTLE + 200);

      const revealed = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('body *'));
        const prevNodes = window.__qa.__snapNodes || [], prevH = window.__qa.__snapH || [];
        const was = new Map(); prevNodes.forEach((el, i) => was.set(el, prevH[i]));
        const appeared = [], grew = [], vanished = [], shrank = [];
        nodes.forEach((el, i) => {
          const before = was.has(el) ? was.get(el) : 0;
          const now = window.__qa.vis(el) ? Math.round(el.getBoundingClientRect().height) * 4 + 1 : 0;
          if (!before && now) appeared.push(i);                     // newly inserted OR newly shown
          else if (before && !now) vanished.push(i);
          else if (before && now && now - before > 40) grew.push(i);   // >10px taller = opened
          else if (before && now && before - now > 40) shrank.push(i); // closing counts too
        });
        // nodes removed from the DOM entirely also count as a state change
        prevNodes.forEach((el, i) => { if (prevH[i] && !el.isConnected) vanished.push(-1 - i); });
        // A toggle that CLOSES something is working perfectly. Only counting growth
        // made every accordion that ships open look broken — the check must measure
        // "did the page change state", not "did the page get bigger".
        const changed = appeared.length + grew.length + vanished.length + shrank.length;
        if (!changed) return { count: 0, appeared: 0, grew: 0 };
        if (!appeared.length && !grew.length)
          return { count: changed, appeared: 0, grew: 0, closed: vanished.length + shrank.length,
            panel: null, note: 'toggle closed/collapsed content (started open) — open state not captured' };

        // Pick the panel: prefer the outermost node that newly appeared; fall back to
        // the one that grew the most (the accordion body). Reject things that can't
        // BE a panel — an icon swapping state is a change, not a disclosure.
        const cand = (appeared.length ? appeared : grew).map(i => nodes[i])
          .filter(el => { const r = el.getBoundingClientRect();
            return r.width >= 60 && r.height >= 24 && !/^(svg|path|g|use|circle|rect|line|polygon|br|img)$/i.test(el.tagName); });
        if (!cand.length) return { count: changed, appeared: appeared.length, grew: grew.length,
          panel: null, note: 'state changed but nothing panel-shaped appeared (icon/label swap)' };
        const panel = cand.find(el => !cand.some(o => o !== el && o.contains(el))) || cand[0];
        const pr = panel.getBoundingClientRect();

        // (a) does it fit on screen?
        const offRight = Math.round(pr.right - innerWidth);
        const offLeft = Math.round(-pr.left);
        const belowFold = Math.round(pr.bottom - innerHeight);

        // (b) IS IT ACTUALLY ON TOP? Sample points across the panel and ask the
        // browser what paints there. Anything outside the panel = a z-index bug
        // ("dropdown appears behind the footer" — previously human-only to spot).
        const pts = [[0.5, 0.15], [0.5, 0.5], [0.2, 0.85], [0.8, 0.85]]
          .map(([fx, fy]) => [pr.left + pr.width * fx, pr.top + pr.height * fy])
          .filter(([x, y]) => x > 0 && y > 0 && x < innerWidth && y < innerHeight);
        const occluders = [];
        pts.forEach(([x, y]) => { const hit = document.elementFromPoint(x, y);
          if (!hit || hit === panel || panel.contains(hit)) return;
          // an ANCESTOR showing through just means the panel is transparent there —
          // only a sibling/unrelated element painting over it is a stacking bug
          if (hit.contains(panel)) return;
          occluders.push({ at: `${Math.round(x)},${Math.round(y)}`, paintedOnTop: window.__qa.desc(hit),
            z: getComputedStyle(hit).zIndex }); });

        // (c) leftover placeholder copy inside a panel that only opens on click
        const text = (panel.textContent || '').replace(/\s+/g, ' ').trim();
        const placeholder = /lorem ipsum|dolor sit amet|title here|placeholder|lipsum/i.test(text);

        return { count: changed, appeared: appeared.length, grew: grew.length,
          panel: window.__qa.desc(panel),
          box: `${Math.round(pr.width)}x${Math.round(pr.height)}`,
          offRight, offLeft, belowFold, occluders, placeholder,
          text: text.slice(0, 80),
          zIndex: getComputedStyle(panel).zIndex };
      }, before);

      const state = { toggle: t.el, label: t.text, startedOpen: t.startedOpen, ...revealed };

      if (revealed.count) {
        // audit the revealed DOM with the normal layout rules — overflow and 0×0
        // collapse inside a dropdown are just as real as on the page body
        if (layoutSrc) {
          try { const L = await page.evaluate(`(0, eval)(${JSON.stringify(layoutSrc)})`);
            state.layout = { overflow: L.horizontalOverflow?.offenders?.length || 0,
              collapsed: L.collapsedElements?.length || 0, wrapping: L.unintendedWrapping?.length || 0,
              scrollsSideways: !!L.horizontalOverflow?.pageScrollsSideways }; } catch (e) {}
        }
        if (shotDir) { const safe = (prefix + t.el).replace(/[^\w.-]+/g, '_').slice(0, 60);
          state.screenshot = `state-${safe}.png`;
          await page.screenshot({ path: `${shotDir}/${state.screenshot}` }).catch(() => {}); }
      }
      states.push(state);

      // close again so the next toggle starts from a clean slate
      await page.keyboard.press('Escape').catch(() => {});
      await page.click(sel, { timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
    } catch (e) { states.push({ toggle: t.el, label: t.text, error: String(e.message || e).slice(0, 70) }); }
  }
  await page.evaluate(() => document.querySelectorAll('[data-qa-toggle]').forEach(e => e.removeAttribute('data-qa-toggle')));

  return {
    tested: states.length,
    deadToggles: states.filter(s => !s.error && s.count === 0 && !s.startedOpen)
      .map(s => ({ el: s.toggle, text: s.label, hint: 'clicking this changes nothing on the page — broken toggle' })),
    // clicking an already-open accordion/active tab correctly does nothing; kept
    // visible so a genuinely broken one isn't quietly filtered away with them
    startedOpenNotTested: states.filter(s => !s.error && s.count === 0 && s.startedOpen)
      .map(s => ({ el: s.toggle, text: s.label, hint: 'was already open/active — closing behaviour not asserted' })),
    panelsOffScreen: states.filter(s => s.offRight > 2 || s.offLeft > 2)
      .map(s => ({ panel: s.panel, from: s.toggle, offRight: s.offRight, offLeft: s.offLeft,
        hint: 'opened panel extends past the viewport edge' })),
    panelsOccluded: states.filter(s => s.occluders && s.occluders.length)
      .map(s => ({ panel: s.panel, zIndex: s.zIndex, coveredBy: s.occluders,
        hint: 'something paints on top of this open panel — z-index/stacking-context bug' })),
    panelsWithPlaceholder: states.filter(s => s.placeholder).map(s => ({ panel: s.panel, text: s.text })),
    panelLayoutIssues: states.filter(s => s.layout && (s.layout.overflow || s.layout.collapsed || s.layout.scrollsSideways))
      .map(s => ({ panel: s.panel, ...s.layout })),
    states
  };
}

/* ── DROPDOWN EXCLUSIVITY ────────────────────────────────────────────────────────
 * Filed verbatim on the real QA list: "the Services dropdown stays open when you
 * move to other top-level nav items that don't have dropdowns." Open one, move to
 * the next, assert the first closed. Pure interaction — unreachable statically.
 */
export async function dropdownExclusivity(page, { vocab = DEFAULT_VOCAB } = {}) {
  await inject(page);
  await page.evaluate(p => { window.__qa.panelSel = p; }, vocab.panels);
  const items = await page.evaluate(({ ROOTS, LINKS }) => {
    const nav = document.querySelector(ROOTS); if (!nav) return [];
    const links = Array.from(nav.querySelectorAll(LINKS))
      .filter(el => window.__qa.vis(el) && el.getBoundingClientRect().top < 200);
    const seen = new Set(); const out = [];
    links.forEach(el => { const t = (el.textContent || '').trim().slice(0, 24);
      if (!t || seen.has(t)) return; seen.add(t); out.push(el); });
    out.slice(0, 8).forEach((el, i) => el.setAttribute('data-qa-nav', String(i)));
    return out.slice(0, 8).map((el, i) => ({ i, text: (el.textContent || '').trim().slice(0, 24),
      hasDropdown: !!el.closest('.w-dropdown') || el.hasAttribute('aria-haspopup') ||
        !!(el.parentElement && el.parentElement.querySelector(window.__qa.panelSel)) }));
  }, { ROOTS: vocab.navRoots, LINKS: vocab.navLinks });
  const withDd = items.filter(i => i.hasDropdown);
  const findings = [];
  for (const src of withDd.slice(0, 3)) {
    for (const dest of items.filter(i => i.i !== src.i).slice(0, 4)) {
      try {
        await page.mouse.move(2, 2); await page.waitForTimeout(200);
        await page.hover(`[data-qa-nav="${src.i}"]`, { timeout: 2500 });
        await page.waitForTimeout(SETTLE);
        const opened = await page.evaluate(i => {
          const el = document.querySelector(`[data-qa-nav="${i}"]`);
          const list = el && (el.closest('.w-dropdown') || el.parentElement)
            ?.querySelector(window.__qa.panelSel);
          return list ? window.__qa.vis(list) : false;
        }, src.i);
        if (!opened) continue;                     // this one doesn't open on hover; skip
        await page.hover(`[data-qa-nav="${dest.i}"]`, { timeout: 2500 });
        await page.waitForTimeout(SETTLE + 200);
        const stillOpen = await page.evaluate(i => {
          const el = document.querySelector(`[data-qa-nav="${i}"]`);
          const list = el && (el.closest('.w-dropdown') || el.parentElement)
            ?.querySelector(window.__qa.panelSel);
          return list ? window.__qa.vis(list) : false;
        }, src.i);
        if (stillOpen) findings.push({ dropdown: src.text, movedTo: dest.text,
          hint: `"${src.text}" dropdown stays open after moving to "${dest.text}"` });
      } catch (e) { /* nav shifted under us — not a finding */ }
    }
  }
  await page.mouse.move(2, 2);
  await page.evaluate(() => document.querySelectorAll('[data-qa-nav]').forEach(e => e.removeAttribute('data-qa-nav')));
  return { navItems: items.length, dropdowns: withDd.length, staysOpen: findings };
}

/* ── CAROUSELS / TABS ────────────────────────────────────────────────────────────
 * Real list: "tabs auto-rotate; clicking a tab overrides the rotation" and (from an
 * earlier review) "the slider is missing prev/next arrows on mobile". Both need time
 * and input to observe: watch for auto-advance, then interact and watch again.
 */
export async function carouselAudit(page, { observeMs = 3500, vocab = DEFAULT_VOCAB } = {}) {
  await inject(page);
  await page.evaluate(v => { window.__qa.activeSel = v; }, vocab.activeState);
  const found = await page.evaluate(({ SEL, SLIDES, CTRL }) => {
    const list = Array.from(document.querySelectorAll(SEL)).filter(el => window.__qa.vis(el))
      .filter((el, _, arr) => !arr.some(o => o !== el && o.contains(el)));   // outermost only
    list.slice(0, 6).forEach((el, i) => el.setAttribute('data-qa-slider', String(i)));
    return list.slice(0, 6).map((el, i) => {
      // drop nested matches — an icon inside a button is not a second button
      const arrows = Array.from(el.querySelectorAll(CTRL))
        .filter((a, _, all) => !all.some(o => o !== a && o.contains(a)));
      const arrowsVisible = arrows.filter(a => window.__qa.vis(a));
      // "Hidden by design" and "collapsed by accident" look identical in a rect
      // measurement and are completely different findings. A control inside a
      // display:none ancestor was switched off deliberately — touch carousels do
      // exactly this below 768px. A control that is IN the render tree and still
      // measures 0×0 is the actual bug. Only the latter is worth reporting.
      const hiddenByAncestor = a => { let n = a;
        while (n && n !== document.body) {
          const c = getComputedStyle(n);
          if (c.display === 'none' || c.visibility === 'hidden') return window.__qa.desc(n);
          n = n.parentElement; }
        return null; };
      const arrowsHiddenByDesign = arrows.map(hiddenByAncestor).filter(Boolean);
      const arrowsCollapsed = arrows.filter(a => {
        if (hiddenByAncestor(a)) return false;                 // switched off, not broken
        const r = a.getBoundingClientRect(); return r.width < 2 || r.height < 2; });
      const slides = el.querySelectorAll(SLIDES).length;
      const r = el.getBoundingClientRect();
      const firstSlide = el.querySelector(SLIDES);
      const slideR = firstSlide && firstSlide.getBoundingClientRect();
      return { i, el: window.__qa.desc(el), slides,
        arrows: arrows.length, arrowsVisible: arrowsVisible.length, arrowsCollapsed: arrowsCollapsed.length,
        arrowsHiddenByDesign: arrowsHiddenByDesign.length, hiddenBy: arrowsHiddenByDesign.slice(0, 2),
        widthPct: slideR ? Math.round((slideR.width / innerWidth) * 100) : null,
        box: `${Math.round(r.width)}x${Math.round(r.height)}` };
    });
  }, { SEL: vocab.carousels, SLIDES: vocab.slides, CTRL: vocab.carouselControls });

  const activeKey = i => page.evaluate(idx => {
    const el = document.querySelector(`[data-qa-slider="${idx}"]`); if (!el) return null;
    const act = el.querySelector(window.__qa.activeSel);
    return act ? window.__qa.desc(act) + '|' + (act.textContent || '').trim().slice(0, 20) +
      '|' + Array.from(act.parentElement?.children || []).indexOf(act) : null;
  }, i);

  const results = [];
  for (const s of found) {
    const rec = { ...s };
    try {
      const a = await activeKey(s.i);
      await page.waitForTimeout(observeMs);
      const b = await activeKey(s.i);
      rec.autoRotates = !!(a && b && a !== b);

      if (rec.autoRotates) {
        // interact, then watch again: a well-behaved carousel pauses (or at least
        // restarts) after the user takes control instead of yanking the slide away
        const ctrl = `[data-qa-slider="${s.i}"] .w-slider-dot, [data-qa-slider="${s.i}"] .w-tab-link, [data-qa-slider="${s.i}"] [class*="next"]`;
        const el = await page.$(ctrl);
        if (el) {
          await el.click({ timeout: 2500 }).catch(() => {});
          await page.waitForTimeout(300);
          const c = await activeKey(s.i);
          await page.waitForTimeout(observeMs);
          const d = await activeKey(s.i);
          rec.keepsRotatingAfterClick = !!(c && d && c !== d);
        }
      }
    } catch (e) { rec.error = String(e.message || e).slice(0, 60); }
    results.push(rec);
  }
  await page.evaluate(() => document.querySelectorAll('[data-qa-slider]').forEach(e => e.removeAttribute('data-qa-slider')));

  const vw = await page.evaluate(() => innerWidth);
  return {
    viewport: vw, carousels: results,
    // A carousel whose controls are switched off by a media query is a touch/swipe
    // carousel, not a broken one — report it separately and at low severity.
    missingArrows: results.filter(r => r.slides > 1 && r.arrowsVisible === 0 && !r.arrowsHiddenByDesign)
      .map(r => ({ el: r.el, slides: r.slides, hint: 'multi-slide carousel with no visible prev/next control at ' + vw + 'px' })),
    controlsHiddenByDesign: results.filter(r => r.arrowsVisible === 0 && r.arrowsHiddenByDesign)
      .map(r => ({ el: r.el, slides: r.slides, hiddenBy: r.hiddenBy,
        hint: 'controls deliberately hidden at ' + vw + 'px (display:none ancestor) — swipe-only by design. ' +
          'Confirm touch swipe works; not a defect in itself.' })),
    collapsedArrows: results.filter(r => r.arrowsCollapsed > 0)
      .map(r => ({ el: r.el, collapsed: r.arrowsCollapsed, hint: 'arrow control rendered at 0px — absolute with no size?' })),
    rotationOverridesUser: results.filter(r => r.keepsRotatingAfterClick)
      .map(r => ({ el: r.el, hint: 'auto-rotation keeps running after the user clicks a tab/dot — it should pause' })),
    fullBleedSlides: results.filter(r => r.widthPct !== null && r.widthPct >= 99 && r.slides > 1)
      .map(r => ({ el: r.el, widthPct: r.widthPct, hint: 'slide is 100% of the viewport — no peek of the next slide' }))
  };
}

/* ── SCROLL ──────────────────────────────────────────────────────────────────────
 * Scroll the page the way a person does and watch what happens. Catches: reveal
 * animations that never fire (content permanently invisible — the worst kind of
 * bug because the page looks "fine", just empty), lazy images that never load,
 * a sticky header that covers content or stops being sticky, and content that
 * only overflows once you're past the fold.
 */
export async function scrollAudit(page, { step = 600, maxSteps = 60, vocab = DEFAULT_VOCAB } = {}) {
  await inject(page);
  // Same-URL reloads can restore the previous scroll position. Starting at the
  // bottom makes the first scrollBy a no-op and turns the whole phase into a
  // zero-step audit, so establish the state this phase claims to test.
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(100);
  // candidates for a scroll reveal: currently invisible but wired to IX2 / an animation
  await page.evaluate(({ REVEAL, STICKY }) => {
    window.__qa.stickySel = STICKY;
    window.__qa.revealCandidates = Array.from(document.querySelectorAll(REVEAL))
      .filter(el => { const c = getComputedStyle(el);
        return +c.opacity < 0.05 || /matrix|translate/.test(c.transform) && c.transform !== 'none'; })
      .slice(0, 200);
    window.__qa.stickyBefore = Array.from(document.querySelectorAll(STICKY))
      .filter(el => window.__qa.vis(el))
      .map(el => ({ d: window.__qa.desc(el), pos: getComputedStyle(el).position,
        top: Math.round(el.getBoundingClientRect().top) }));
  }, { REVEAL: vocab.revealCandidates, STICKY: vocab.stickyCandidates });

  let steps = 0;
  const heights = [];
  for (; steps < maxSteps; steps++) {
    const before = await page.evaluate(() => scrollY);
    await page.evaluate(s => scrollBy({ top: s, behavior: 'instant' }), step);
    // Read after the browser has applied the scroll. Reading in the same evaluate
    // call returns the old position on pages with scroll-behavior:smooth and falsely
    // declares the very first step the end of the page.
    await page.waitForTimeout(160);
    const done = await page.evaluate(previous => ({ atEnd: scrollY === previous,
      y: scrollY, h: document.body.scrollHeight }), before);
    heights.push(done.h);
    if (done.atEnd) break;
  }
  await page.waitForTimeout(700);   // let the last reveals finish

  // A global naturalWidth snapshot is not evidence that a lazy image is broken:
  // the engine may not have considered it near enough to request. Put each unresolved
  // image in view, wait for decode/load, and only let completed failures survive.
  await page.evaluate(async () => {
    const unresolved = Array.from(document.images)
      .filter(i => i.getBoundingClientRect().width > 20 && i.naturalWidth === 0)
      .slice(0, 12);
    for (const image of unresolved) {
      image.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 350));
      if (!image.complete && image.decode) await image.decode().catch(() => {});
    }
  });
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => {
    // reveals that are ON SCREEN yet still invisible = the animation never fired
    const stuck = (window.__qa.revealCandidates || []).filter(el => {
      const r = el.getBoundingClientRect();
      const onScreen = r.top < innerHeight && r.bottom > 0 && r.width > 0;
      const c = getComputedStyle(el);
      return onScreen && (+c.opacity < 0.05);
    }).map(el => ({ el: window.__qa.desc(el), opacity: getComputedStyle(el).opacity,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) })).slice(0, 12);

    // reveals still invisible anywhere on the page after a full scroll-through
    const neverFired = (window.__qa.revealCandidates || []).filter(el => +getComputedStyle(el).opacity < 0.05).length;

    // images that never resolved even after being scrolled into view
    const lazyBroken = Array.from(document.images)
      .filter(i => i.getBoundingClientRect().width > 20 && i.complete && i.naturalWidth === 0)
      .map(i => ({ src: (i.currentSrc || i.src || i.dataset.src || '(no src)').slice(-60),
        loading: i.loading, hint: 'still unloaded after scrolling into view' })).slice(0, 10);

    // sticky header sanity at the bottom of the page
    const sticky = (window.__qa.stickyBefore || []).map(s => {
      const el = Array.from(document.querySelectorAll(window.__qa.stickySel))
        .find(e => window.__qa.desc(e) === s.d);
      if (!el) return { ...s, nowMissing: true };
      const r = el.getBoundingClientRect();
      return { ...s, nowTop: Math.round(r.top), nowPos: getComputedStyle(el).position,
        visibleAtBottom: window.__qa.vis(el) && r.bottom > 0 && r.top < innerHeight };
    });

    /* Both checks above only look at elements that *declare* themselves animated —
     * `[data-w-id]`, `.reveal`, `.fade`, `[data-aos]`. A heading animated by GSAP, or by
     * an ancestor's timeline, carries none of those markers, so a genuinely invisible
     * heading scored zero on both: `.who-help_eyebrow` sat at opacity 0 after a full
     * scroll-through and the audit reported the page clean. The eye caught it as "a 300px
     * void where the section title should be".
     *
     * So ask the question by shape instead: after scrolling the whole page, is there
     * anything that takes up layout space, carries its own text, and is invisible? That
     * needs no cooperation from the markup. The exclusions are the legitimate reasons to
     * be transparent — a closed panel, an inactive tab or slide, an aria-hidden subtree —
     * and are what keeps this from reporting every accordion on the page. */
    const LEGIT_HIDDEN = '[aria-hidden="true"],.w-dropdown-list,.w-tab-pane:not(.w--tab-active),' +
      '[class*="panel"],[class*="dropdown"],[class*="submenu"],[class*="modal"],[role="dialog"],' +
      '[class*="slide"]:not(.w--current),[hidden]';
    const ownText = el => Array.from(el.childNodes)
      .filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    const invisibleAfterScroll = Array.from(document.querySelectorAll('body *')).filter(el => {
      if (+getComputedStyle(el).opacity >= 0.05) return false;   // own opacity, not inherited
      if (el.closest(LEGIT_HIDDEN)) return false;
      const t = ownText(el); if (t.length < 3) return false;
      const r = el.getBoundingClientRect();
      return r.width > 20 && r.height > 6;                      // occupies real layout space
    }).map(el => ({ el: window.__qa.desc(el), text: ownText(el).slice(0, 45),
      opacity: getComputedStyle(el).opacity,
      top: Math.round(el.getBoundingClientRect().top + scrollY) })).slice(0, 20);

    return { stuck, neverFired, lazyBroken, sticky, invisibleAfterScroll,
      finalScrollHeight: document.body.scrollHeight,
      pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1 };
  });

  /* The measurement above is taken from the bottom of the page, where everything above
   * the viewport is off-screen — and a reveal built with GSAP ScrollTrigger's
   * reverse-on-leave (or Webflow's "while scrolling in view") is *supposed* to be back at
   * opacity 0 there. Reported raw, that produced twelve findings for headings a reader
   * plainly sees ("ABOUT US", "Our services", …), and it nearly convinced me a section
   * title was broken.
   *
   * The only honest question is: is it invisible *while it is on screen*? So bring each
   * candidate into the middle of the viewport, let its animation run, and look again.
   * What survives is genuinely never visible to a reader. */
  const confirmedInvisible = [];
  for (const cand of (after.invisibleAfterScroll || [])) {
    const still = await page.evaluate(async ({ top }) => {
      scrollTo(0, Math.max(0, top - innerHeight / 2));
      await new Promise(r => setTimeout(r, 900));
      const els = Array.from(document.querySelectorAll('body *')).filter(el => {
        const r = el.getBoundingClientRect();
        return Math.abs(r.top + scrollY - top) < 4 && r.width > 20;
      });
      if (!els.length) return null;
      const el = els[0];
      return { opacity: getComputedStyle(el).opacity, visibility: getComputedStyle(el).visibility,
        inView: el.getBoundingClientRect().top < innerHeight && el.getBoundingClientRect().bottom > 0 };
    }, cand).catch(() => null);
    if (still && still.inView && +still.opacity < 0.05)
      confirmedInvisible.push({ ...cand, opacityWhenInView: still.opacity,
        hint: 'invisible even with the element in the middle of the viewport — an entrance ' +
          'animation that never runs, not a reverse-on-leave' });
  }

  // body height growing on every step = infinite-scroll or a layout loop
  const grew = heights.length > 3 && heights[heights.length - 1] > heights[2] * 1.6;

  return {
    scrollSteps: steps,
    revealsStuckInvisible: after.stuck,
    revealCandidatesStillHidden: after.neverFired,
    // only the confirmed-in-view set is a finding; the raw list is kept for triage
    invisibleAfterScroll: confirmedInvisible,
    invisibleFromBottomOfPage: (after.invisibleAfterScroll || []).length,
    lazyImagesBroken: after.lazyBroken,
    stickyHeaders: after.sticky,
    overflowsOnlyAfterScroll: after.pageScrollsSideways,
    pageHeightGrewWhileScrolling: grew ? { from: heights[2], to: heights[heights.length - 1] } : null
  };
}

/* ── KEYBOARD ────────────────────────────────────────────────────────────────────
 * Tab through the page: a focus order that jumps around, or focusable controls with
 * no visible focus ring, fail real accessibility review and are trivially testable
 * once you can send real key events.
 */
export async function keyboardAudit(page, { maxTabs = 40 } = {}) {
  await inject(page);
  await page.evaluate(() => document.body.focus());
  const seq = [];
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect(); const c = getComputedStyle(el);
      return { el: window.__qa.desc(el), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        top: Math.round(r.top + scrollY), left: Math.round(r.left),
        w: Math.round(r.width), h: Math.round(r.height),
        offScreen: r.width === 0 || r.height === 0,
        hidden: !window.__qa.vis(el),
        ring: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 ? 'outline'
          : (/inset|0px 0px 0px/.test(c.boxShadow) ? 'box-shadow' : 'none') };
    });
    if (!info) break;
    seq.push(info);
  }
  const noRing = seq.filter(s => s.ring === 'none' && !s.hidden)
    .map(s => ({ el: s.el, text: s.text })).slice(0, 10);
  const focusableButHidden = seq.filter(s => s.hidden)
    .map(s => ({ el: s.el, text: s.text, hint: 'reachable by Tab but not visible — trapped/hidden control' })).slice(0, 10);
  // focus order that jumps backwards up the page is disorienting
  let jumps = 0; for (let i = 1; i < seq.length; i++) if (seq[i].top < seq[i - 1].top - 120) jumps++;
  return { tabbedThrough: seq.length, noVisibleFocusRing: noRing, focusableButHidden,
    backwardJumps: jumps, order: seq.slice(0, 25) };
}

/* ── DOES THE BUTTON ACTUALLY DO ANYTHING? ──────────────────────────────────────
 * The single highest-value check here, and the one a DOM audit can never settle.
 *
 * A `<div class="button">GET A QUOTE</div>` with no href, no handler and no role is
 * pixel-identical to a working CTA. The resting-state check for this ("cursor:pointer
 * but no anchor ancestor") is unreliable in both directions: it misses buttons wired by
 * a delegated document-level listener, and it flags working ones. On a real audit the
 * DOM check reported 4 suspicious buttons as low-severity polish; pressing all ten
 * showed **seven were dead**, including the hero's primary CTA — while one it flagged
 * worked fine. Only the click decides.
 *
 * Method: for each candidate, load the page fresh, click, then look for *any* evidence
 * of a response — navigation, a hash change, history growth, a new dialog, or a
 * meaningful DOM mutation (a modal). Fresh load per click is what makes the result
 * attributable; clicking them in sequence on one page conflates them.
 *
 * Deliberately excluded: forms, submits, slider arrows and close buttons. QA does not
 * submit a client's contact form, and arrows are covered by carouselAudit.
 */
export async function ctaClickAudit(page, { url, max = 18, settleMs = 1800, vocab = DEFAULT_VOCAB } = {}) {
  const target = url || page.url();
  const list = async () => page.evaluate(({ sel, ex }) => {
    const bad = el => el.closest(ex) || [...el.querySelectorAll(ex)].length;
    const out = [];
    // Record each candidate's index within the RAW selector match list. The filtered
    // list's own index does not address the same element after a reload — using it
    // clicked whatever happened to sit at that position and reported 2 dead buttons on a
    // page where pressing all ten found 7. Position in a filtered list is not an address.
    document.querySelectorAll(sel).forEach((el, rawIndex) => {
      if (bad(el)) return;
      const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      if (c.display === 'none' || c.visibility === 'hidden' || r.width < 24 || r.height < 12) return;
      // skip a candidate nested inside another candidate — the outer one is the control
      if (out.some(o => o.node !== el && o.node.contains(el))) return;
      const anchor = el.closest('a[href]') || el.querySelector('a[href]');
      out.push({ node: el, rawIndex, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28),
        el: window.__qa.desc(el),
        href: anchor?.href || null,
        target: anchor?.target || null,
        // recorded, but never trusted on its own — see the comment above
        looksWired: !!(el.closest('a[href]') || el.tagName === 'BUTTON' || el.onclick ||
          el.getAttribute('href') || el.hasAttribute('data-w-id')) });
    });
    return out.map(({ node, ...rest }) => rest);
  }, { sel: vocab.ctaLike, ex: vocab.ctaExclude });

  await inject(page);
  const candidates = (await list()).slice(0, max);
  const results = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    await page.goto(target, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(500);
    await inject(page);
    const loc = page.locator(vocab.ctaLike).nth(c.rawIndex);
    let visible = false; try { visible = await loc.isVisible({ timeout: 1500 }); } catch (e) {}
    if (!visible) { results.push({ ...c, verdict: 'not visible at this width' }); continue; }
    const before = await page.evaluate(() => ({ url: location.href, hash: location.hash,
      len: history.length, dom: document.body.innerHTML.length,
      dialogs: document.querySelectorAll('[role="dialog"],dialog[open],[class*="modal"]').length }));
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    let clickErr = null;
    // A target=_blank link responds in a new Page, leaving the current URL and DOM
    // unchanged. Watching only the current page labelled valid external login links
    // DEAD. Observe the browser context as well as this page, then close the probe page
    // so one CTA cannot contaminate the next fresh-load check.
    const popupPromise = page.context().waitForEvent('page', { timeout: c.target === '_blank' ? settleMs + 1000 : 450 }).catch(() => null);
    await loc.click({ timeout: 4000 }).catch(e => { clickErr = String(e.message || e).split('\n')[0].slice(0, 80); });
    const popup = clickErr ? null : await popupPromise;
    const popupUrl = popup ? await popup.url() : null;
    await page.waitForTimeout(settleMs);
    const after = await page.evaluate(() => ({ url: location.href, hash: location.hash,
      len: history.length, dom: document.body.innerHTML.length,
      dialogs: document.querySelectorAll('[role="dialog"],dialog[open],[class*="modal"]').length })).catch(() => null);
    if (!after) { results.push({ ...c, verdict: 'page went away (navigated)' }); continue; }
    const navigated = after.url !== before.url;
    const domDelta = Math.abs(after.dom - before.dom);
    const verdict = clickErr ? `could not be clicked — ${clickErr}`
      : popup ? `opens a new page at ${popupUrl || '(URL not yet available)'}`
      : navigated ? `navigates to ${after.url.replace(/^https?:\/\/[^/]+/, '') || '/'}`
      : after.dialogs > before.dialogs ? 'opens a dialog/modal'
      : after.hash !== before.hash ? `jumps to ${after.hash}`
      : domDelta > 200 ? 'no navigation, but the page responded (DOM changed)'
      : after.len > before.len ? 'history changed but the page did not'
      : 'DEAD — click does nothing';
    results.push({ ...c, verdict, domDelta, popupUrl });
    await popup?.close().catch(() => {});
  }
  const dead = results.filter(r => r.verdict.startsWith('DEAD'));
  return { tested: results.length, candidatesFound: candidates.length,
    truncated: candidatesFound(candidates, max), dead, results,
    // a dead button the resting-state heuristic thought was wired is the nastiest case:
    // nothing short of a click would have caught it
    deadDespiteLookingWired: dead.filter(d => d.looksWired).map(d => d.el) };
}
const candidatesFound = (c, max) => (c.length >= max ? `capped at ${max} candidates` : null);
