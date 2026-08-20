/*
 * audit_roles.js — what KIND of thing is this, decided by shape and behaviour.
 *
 * Run this before any other audit. It publishes `window.__WQA_ROLES` and every other check
 * consults it instead of guessing from class names.
 *
 * It exists because name matching failed twice in one afternoon, in both directions. A
 * carousel track called `services_track` matched no entry in a list containing "slider",
 * "swiper", "carousel", "marquee" and "slide", so its clipped section was reported as
 * 1865px of missing copy at every mobile width. And the two-arrow hover-slide inside a
 * 20px clip box — eleven of them on one page — matched nothing either, and had to be
 * excluded by asking whether it TRANSITIONS, which is a question about behaviour. The
 * lesson generalises: a track is a track because of its shape, on Webflow, Framer,
 * Shopify, Tailwind or hand-rolled CSS alike. Names are the least durable signal available
 * and the only one that needs a per-platform list.
 *
 * Roles are additive and an element may hold several. Nothing here is a defect; this file
 * makes no judgements. It answers "what is this", so the detectors can stop pretending
 * they know.
 *
 * Platform names have exactly one route in: a `--vocabulary` pack, consulted through
 * `window.__QA_VOCAB` if the runner seeded one. That is the seam the skill already
 * declares, and it stays additive — a vocabulary can only ADD candidates, never veto what
 * shape analysis found.
 */
(() => {
  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
  const roles = new Map();
  const add = (el, role) => {
    if (!roles.has(el)) roles.set(el, new Set());
    roles.get(el).add(role);
  };
  const rect = el => el.getBoundingClientRect();
  const styles = new Map();
  const cs = el => { let v = styles.get(el); if (!v) { v = getComputedStyle(el); styles.set(el, v); } return v; };

  const all = Array.from(document.querySelectorAll('body *'));

  /* 1) The container roles. Cheap, exact, and the foundation for everything below: what
   * clips, what scrolls, and what is pinned. "Clips" is the reason a track can exist at
   * all, and "scrolls" is the reason an overflow is not a defect — the reader can reach it. */
  for (const el of all) {
    const c = cs(el);
    const ox = c.overflowX, oy = c.overflowY;
    if (/auto|scroll/.test(ox + oy)) {
      const r = rect(el);
      // a scroll container that cannot actually scroll is just a box
      if (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2) add(el, 'scroller');
      else if (r.width > 0) add(el, 'scrollerIdle');
    }
    if (/hidden|clip/.test(ox + oy)) add(el, 'clip');
    if (c.position === 'sticky') add(el, 'sticky');
    if (c.position === 'fixed') add(el, 'fixed');
  }

  /* 2) TRACK and SLIDE — the shape, not the word.
   *
   * A track is a row (or column) of near-equal children whose combined extent leaves the
   * box that clips it. That is the mechanism of every carousel ever built, and it is why
   * the overflow is intentional: the frame is meant to show one child at a time.
   *
   * Two thresholds, both deliberate. `>= 2` children, because a two-slide carousel is
   * common and a one-child "track" is just a box. And near-equal SIZE rather than equal
   * class, because a CMS list, a hand-written row and a JS-cloned marquee agree on
   * geometry and agree on nothing else. */
  const nearEqual = (ns, tol = 0.12) => {
    if (ns.length < 2) return false;
    const max = Math.max(...ns), min = Math.min(...ns);
    return max > 0 && (max - min) / max <= tol;
  };
  const clipperOf = el => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement)
      if (/hidden|clip|auto|scroll/.test(cs(a).overflowX + cs(a).overflowY)) return a;
    return null; };

  for (const el of all) {
    const kids = Array.from(el.children).filter(k => { const r = rect(k); return r.width > 0 && r.height > 0; });
    if (kids.length < 2) continue;
    const clipper = clipperOf(el);
    if (!clipper) continue;
    const cb = rect(clipper);
    const ws = kids.map(k => rect(k).width), hs = kids.map(k => rect(k).height);
    const escapesRight = kids.some(k => rect(k).right > cb.right + 4);
    const escapesBottom = kids.some(k => rect(k).bottom > cb.bottom + 4);
    const horizontal = nearEqual(ws) && escapesRight;
    const vertical = nearEqual(hs) && escapesBottom && !horizontal;
    if (!horizontal && !vertical) continue;
    add(el, 'track');
    add(el, horizontal ? 'trackHorizontal' : 'trackVertical');
    for (const k of kids) add(k, 'slide');
    add(clipper, 'trackFrame');
  }

  /* 3) HOVER-REVEAL — two of the same thing in a box the size of one, ready to slide.
   *
   * The arrow pattern: a 20px clip box holding two 20px arrows, one parked outside, with
   * `transition: transform`. The overflow IS the mechanism, so it must never be reported,
   * and it is not a track (nothing here is a slide a reader navigates).
   *
   * `transition-duration` is load-bearing. `transition-property` initialises to `all` on
   * every element in the document, so testing the property alone marks the whole page as
   * animated — which is exactly the bug that made the parent-overflow check return empty
   * on every site while looking perfectly healthy. */
  const animates = el => { const c = cs(el);
    const moves = /transform|all|left|top|translate/.test(c.transitionProperty) &&
      (c.transitionDuration || '').split(',').some(v => parseFloat(v) > 0);
    return moves || c.animationName !== 'none'; };

  for (const el of all) {
    if (!roles.get(el)?.has('clip')) continue;
    const kids = Array.from(el.children);
    if (kids.length < 2 || kids.length > 4) continue;
    const r = rect(el);
    if (r.width > 80 || r.height > 80) continue;                 // an icon-sized frame, not a section
    const ws = kids.map(k => rect(k).width);
    if (!nearEqual(ws, 0.2)) continue;
    if (!kids.some(k => animates(k)) && !animates(el)) continue;
    add(el, 'hoverRevealFrame');
    for (const k of kids) add(k, 'hoverReveal');
  }

  /* 4) MARQUEE — a continuously animated strip. Distinguished from a track by its
   * animation running forever: nobody navigates a marquee, so its overflow is permanent
   * and intentional, and its contents are duplicated by design. */
  for (const el of all) {
    const anims = el.getAnimations ? el.getAnimations() : [];
    const endless = anims.some(a => { const t = a.effect?.getTiming?.(); return t && t.iterations === Infinity; });
    if (!endless) continue;
    const r = rect(el);
    if (r.width < 40) continue;
    add(el, 'marquee');
    for (const k of el.children) add(k, 'marqueeItem');
  }

  /* 5) DISCLOSURE — a panel that is closed rather than broken.
   *
   * All three FAQ panels on one page were reported as "flex/grid container collapsed", in
   * WebKit only, which then surfaced as a phantom cross-browser defect on every run. A
   * closed panel is height 0 with its content inside it: that is what closed MEANS. The
   * durable signals are the relationship (something points at it with `aria-controls`) and
   * the structure (zero height, clipped), not the word "accordion". */
  for (const el of all) {
    const r = rect(el);
    const controlled = el.id && document.querySelector(`[aria-controls="${el.id}"]`);
    const hiddenAttr = el.getAttribute('aria-hidden') === 'true';
    const zeroAndClipped = r.height < 1 && roles.get(el)?.has('clip');
    if (controlled) add(el, 'disclosureTarget');
    if ((controlled || hiddenAttr) && (zeroAndClipped || r.height < 1)) add(el, 'disclosureClosed');
    else if (zeroAndClipped && el.textContent.trim()) add(el, 'collapsedClipped');
    if (el.matches('details:not([open]) *')) add(el, 'disclosureClosed');
  }
  for (const t of document.querySelectorAll('[aria-controls]')) {
    add(t, 'disclosureTrigger');
    const target = t.getAttribute('aria-controls') && document.getElementById(t.getAttribute('aria-controls'));
    if (target && t.getAttribute('aria-expanded') === 'false') add(target, 'disclosureClosed');
  }

  /* 6) SCRIM — an out-of-flow layer covering its parent with no content of its own.
   * Sitting on top of things is its entire purpose, so a collision check must never
   * report it. Shape: absolutely positioned, covering most of the parent, translucent or
   * gradient, holding no text. */
  for (const el of all) {
    const c = cs(el);
    if (!/absolute|fixed/.test(c.position)) continue;
    if ((el.innerText || '').trim()) continue;
    if (el.querySelector('img,video,svg,canvas,input,button,a')) continue;
    const p = el.parentElement; if (!p) continue;
    const r = rect(el), pr = rect(p);
    if (!(r.width > 0 && pr.width > 0)) continue;
    const covers = (r.width * r.height) / Math.max(1, pr.width * pr.height);
    if (covers < 0.6) continue;
    const bg = c.backgroundImage, bc = c.backgroundColor;
    const gradient = /gradient/.test(bg);
    const translucent = /rgba|\/\s*0?\.\d/.test(bc) || +c.opacity < 1;
    if (gradient || translucent || c.backdropFilter !== 'none') add(el, 'scrim');
  }

  /* 7) DECORATION — carries neither text nor media, so nothing a reader can lose. Used to
   * decide whether a clipped or escaping box costs anybody anything. */
  for (const el of all) {
    if ((el.innerText || '').trim().length > 1) continue;
    if (/^(img|svg|video|picture|canvas|iframe|input|button|a|select|textarea)$/i.test(el.tagName)) continue;
    if (el.querySelector('img,svg,video,picture,canvas,iframe,input,button,a')) continue;
    add(el, 'decoration');
  }

  /* A vocabulary may ADD candidates that shape analysis could not see — a slider whose
   * frame is sized by script after load, say. It may never remove one: a name is weaker
   * evidence than geometry, and letting it veto would reintroduce exactly the failure this
   * file replaces. */
  const vocab = (typeof window !== 'undefined' && window.__QA_VOCAB) || null;
  const vocabRoles = vocab && vocab.roles && typeof vocab.roles === 'object' ? vocab.roles : null;
  let fromVocabulary = 0;
  if (vocabRoles) for (const [role, selector] of Object.entries(vocabRoles)) {
    if (typeof selector !== 'string' || !selector.trim()) continue;
    let hits = []; try { hits = Array.from(document.querySelectorAll(selector)); } catch (e) { continue; }
    for (const el of hits) { if (!roles.get(el)?.has(role)) fromVocabulary++; add(el, role); }
  }

  const rolesFor = el => { const r = roles.get(el); return r ? Array.from(r) : []; };
  /* `withinRole` is what the detectors actually ask: is this element, or anything above it,
   * one of these kinds of thing? Crosses shadow boundaries by way of the host, because a
   * component's internals live inside a light-DOM role just as much as its wrapper does. */
  const withinRole = (el, wanted) => {
    const want = Array.isArray(wanted) ? wanted : [wanted];
    for (let n = el; n; n = n.parentElement || (n.parentNode && n.parentNode.host) || null) {
      const r = roles.get(n);
      if (r && want.some(w => r.has(w))) return true;
      if (n === document.documentElement) break;
    }
    return false;
  };

  window.__WQA_ROLES = { version: 1, roles, rolesFor, withinRole,
    has: (el, role) => !!roles.get(el)?.has(role) };

  const counts = {};
  for (const set of roles.values()) for (const r of set) counts[r] = (counts[r] || 0) + 1;
  return { version: 1, elementsWithRole: roles.size, counts, fromVocabulary,
    // a sample, so a reviewer can sanity-check the inference rather than trust it
    tracks: all.filter(el => roles.get(el)?.has('track')).slice(0, 6).map(el => ({
      el: desc(el), slides: Array.from(el.children).length })),
    note: 'Roles are inferred from shape and behaviour, never from class names. Detectors ' +
      'consult window.__WQA_ROLES; when it is absent (a single script pasted into a console) ' +
      'they fall back to the vocabulary selectors, which are weaker.' };
})();
