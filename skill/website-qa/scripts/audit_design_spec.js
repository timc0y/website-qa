/*
 * audit_design_spec.js — numeric Figma-vs-live comparison.
 *
 * This closes the one gap the rest of the sweep genuinely cannot: everything else
 * here asks "is the page self-consistent?", which finds drift but can never say
 * which value was *intended*. Told that eleven sections start at 54px and one at
 * 102px, self-consistency picks 54 as the intent. If the design says 70, all twelve
 * are wrong and the sweep confidently reported the opposite.
 *
 * So: give it the intended numbers and it stops guessing.
 *
 * INPUT — `window.__QA_SPEC`, injected by the runner via `--spec=file.json`, or set
 * by hand before pasting this into a console. The spec is deliberately NOT tied to
 * Figma: it's just intended values, so it can come from a Figma frame, a design-token
 * file, or a written standard ("all sections use a 70px gutter"). See
 * `references/design-spec-format.md` for the schema and how to build one.
 *
 * MATCHING — by rendered TEXT, not by selector or layer name. Class names churn
 * between Figma and build and mean nothing across the boundary; the words on the
 * page are the one identifier both sides share. Text matching is normalised
 * (lowercase, collapsed whitespace, punctuation stripped) and falls back to prefix
 * matching, so "Tax efficient life insurance for business owners" still matches when
 * the build splits it across a span with an italic run inside.
 */
(() => {
  const SPEC = window.__QA_SPEC;
  if (!SPEC) return { error: 'no spec — set window.__QA_SPEC or pass --spec=file.json' };

  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).slice(0, 2).join('.') : '');
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const norm = s => (s || '').toLowerCase().replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9]+/g, ' ').trim();
  /* Deliberately NOT opacity-aware. A heading waiting on a scroll reveal sits at opacity 0
   * while carrying entirely correct type, and rejecting it here does not skip the comparison —
   * it hands the match to the next candidate, which is usually a wrapper reporting the
   * inherited body font. That is how a 62px DM Serif heading got reported as "live 16px
   * DM Sans 300". Font metrics are valid at any opacity; a real box plus display/visibility
   * is what keeps hidden CMS templates and closed nav panels out. */
  const visible = el => { const c = getComputedStyle(el); const r = el.getBoundingClientRect();
    return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 && r.height > 0; };

  const vw = innerWidth;
  const frameWidth = SPEC.frameWidth || vw;
  // If the live viewport doesn't match the Figma frame width, positions can't be
  // compared raw. Scale them — and say so, because a scaled comparison is weaker
  // evidence than a like-for-like one and the reader should know which they got.
  const scale = vw / frameWidth;
  const scaled = v => v * scale;
  const tol = Object.assign({ position: 4, size: 2, fontSize: 0.6, lineHeight: 1.5 }, SPEC.tolerance || {});

  /* ── find the live element for a spec text entry ─────────────────────────── */
  // Navigation and footer are a trap for text matching: a mega-menu repeats most of
  // the site's copy as short link labels, and those labels are *shorter* than the
  // real headings, so a naive "smallest match wins" resolves "Relevant Life
  // Insurance" to a 16px nav link and then reports the section heading as being 26px
  // too small. Chrome the page off by default; a spec entry can opt back in with
  // `"scope": "nav"` when it genuinely means the nav.
  const CHROME = 'nav,header,footer,[role="navigation"],[class*="nav_"],[class*="navbar"],[class*="dropdown"],[class*="mega"]';
  const build = () => Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,span,a,button,div,td'))
    .filter(el => visible(el))
    .map(el => ({ el, t: txt(el), n: norm(txt(el)), chrome: !!el.closest(CHROME) }))
    .filter(c => c.n.length > 2);
  const candidates = build();

  const findByText = (wanted, scope) => {
    const w = norm(wanted);
    if (!w) return null;
    let pool = candidates;
    if (scope === 'nav' || scope === 'header') pool = candidates.filter(c => c.el.closest('nav,header,[role="navigation"]'));
    else if (scope === 'footer') pool = candidates.filter(c => c.el.closest('footer'));
    else pool = candidates.filter(c => !c.chrome);
    // if the copy genuinely only exists in chrome, fall back rather than report it missing
    if (!pool.length) pool = candidates;

    // How many *distinct* places carry this copy. It matters: "Single Director" was
    // both a tab label (24px, dark, on white) and the card title it opens (28px, white,
    // on teal). The matcher silently picked the tab and duly reported a font-size AND a
    // colour mismatch against a design node that described the card — two findings, both
    // fictional. When copy is ambiguous the honest output is "I cannot tell which one you
    // meant", not a confident diff.
    const ambiguityOf = list => {
      const boxes = list.map(c => { const r = c.el.getBoundingClientRect();
        return Math.round(r.top) + 'x' + Math.round(r.left); });
      return new Set(boxes).size;
    };
    const pick = list => {
      if (!list.length) return null;
      // Prefer a LEAF: the element whose own text nodes carry the copy is the one
      // holding the type styles. A wrapper div reports the inherited body font.
      const ownText = el => Array.from(el.childNodes)
        .filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
      const leaves = list.filter(c => norm(ownText(c.el)) === c.n);
      const from = leaves.length ? leaves : list;
      return from.sort((a, b) => a.t.length - b.t.length)[0].el;
    };
    const exact = pool.filter(c => c.n === w);
    const el = pick(exact)
      || pick(pool.filter(c => c.n.startsWith(w.slice(0, 40)) || w.startsWith(c.n.slice(0, 40))))
      || pick(pool.filter(c => c.n.includes(w.slice(0, 30))));
    if (el) el.__qaAmbiguity = exact.length > 1 ? ambiguityOf(exact) : 1;
    return el;
  };

  // Figma gives hex, the DOM gives rgb() — normalise both to hex. Note the guard:
  // running the rgb parser over "#1E3A60" pulls out "1", "3", "60" as if they were
  // channels and yields "#01033C", inventing a colour mismatch out of nothing.
  const hex = c => {
    if (!c) return c;
    const s = String(c).trim();
    if (s[0] === '#') return ('#' + s.slice(1).toUpperCase()).slice(0, 7);
    const m = s.match(/[\d.]+/g); if (!m || m.length < 3) return s;
    return '#' + m.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const near = (a, b, t) => Math.abs(a - b) <= t;

  /* ── 1) TYPE + POSITION per spec'd text node ─────────────────────────────── */
  const typeFindings = [], matched = [], unmatched = [];
  (SPEC.text || []).forEach(spec => {
    const el = findByText(spec.text, spec.scope);
    if (!el) { unmatched.push({ text: String(spec.text).slice(0, 50),
      note: 'no element on the page carries this copy — content changed, or the section is missing' }); return; }
    const c = getComputedStyle(el), r = el.getBoundingClientRect();
    const live = {
      fontSize: parseFloat(c.fontSize),
      lineHeight: c.lineHeight === 'normal' ? null : parseFloat(c.lineHeight),
      fontFamily: c.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      fontWeight: +c.fontWeight, letterSpacing: c.letterSpacing === 'normal' ? 0 : parseFloat(c.letterSpacing),
      color: hex(c.color), textTransform: c.textTransform, left: Math.round(r.left)
    };
    matched.push({ text: String(spec.text).slice(0, 40), el: desc(el) });
    const diffs = [];

    if (spec.fontSize != null && !near(live.fontSize, scaled(spec.fontSize), tol.fontSize))
      diffs.push({ prop: 'font-size', figma: spec.fontSize + 'px' + (scale !== 1 ? ` (→${scaled(spec.fontSize).toFixed(1)} scaled)` : ''),
        live: live.fontSize + 'px', offBy: +(live.fontSize - scaled(spec.fontSize)).toFixed(1) });

    // Figma stores line-height as a multiplier (1.2em) or px; normalise to px here
    if (spec.lineHeight != null && live.lineHeight != null) {
      const wantLh = spec.lineHeight <= 4 ? spec.lineHeight * scaled(spec.fontSize || live.fontSize) : scaled(spec.lineHeight);
      if (!near(live.lineHeight, wantLh, tol.lineHeight))
        diffs.push({ prop: 'line-height', figma: wantLh.toFixed(1) + 'px', live: live.lineHeight.toFixed(1) + 'px',
          offBy: +(live.lineHeight - wantLh).toFixed(1) });
    }
    if (spec.fontFamily && live.fontFamily.toLowerCase() !== String(spec.fontFamily).toLowerCase())
      diffs.push({ prop: 'font-family', figma: spec.fontFamily, live: live.fontFamily });
    if (spec.fontWeight != null && live.fontWeight !== spec.fontWeight)
      diffs.push({ prop: 'font-weight', figma: spec.fontWeight, live: live.fontWeight });
    if (spec.color && hex(spec.color) !== live.color)
      diffs.push({ prop: 'color', figma: hex(spec.color), live: live.color });
    if (spec.letterSpacing != null) {
      const wantLs = Math.abs(spec.letterSpacing) < 1 ? spec.letterSpacing * live.fontSize : scaled(spec.letterSpacing);
      if (!near(live.letterSpacing, wantLs, 0.4))
        diffs.push({ prop: 'letter-spacing', figma: wantLs.toFixed(2) + 'px', live: live.letterSpacing.toFixed(2) + 'px' });
    }
    if (spec.textCase === 'UPPER' && live.textTransform !== 'uppercase' && txt(el) === txt(el).toLowerCase())
      diffs.push({ prop: 'text-transform', figma: 'uppercase', live: live.textTransform });
    if (spec.left != null && !near(live.left, scaled(spec.left), tol.position))
      diffs.push({ prop: 'x-position', figma: Math.round(scaled(spec.left)) + 'px', live: live.left + 'px',
        offBy: Math.round(live.left - scaled(spec.left)) });

    if (diffs.length) typeFindings.push({ text: String(spec.text).slice(0, 50), el: desc(el), diffs,
      ...(el.__qaAmbiguity > 1 ? { ambiguous: el.__qaAmbiguity,
        warning: `this copy appears in ${el.__qaAmbiguity} places on the page (e.g. a tab label and the ` +
          `panel it opens); the diff below may be against the wrong one — confirm which element the ` +
          `Figma node describes before reporting it` } : {}) });
  });

  /* ── 2) CONTAINER GUTTER vs the intended one ─────────────────────────────── */
  // This is the check self-consistency cannot do. With an intended gutter we can say
  // "every section is 16px too tight" instead of "one section disagrees with the rest".
  let container = null;
  if (SPEC.container && SPEC.container.left != null) {
    const want = scaled(SPEC.container.left);
    const lefts = [];
    Array.from(document.querySelectorAll(SPEC.containerSelector || 'section,[class*="section"],main > div'))
      .forEach(sec => {
        if (!visible(sec)) return;
        const sr = sec.getBoundingClientRect();
        if (sr.width < vw * 0.8) return;
        let min = Infinity;
        sec.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li').forEach(t => {
          if (!visible(t) || !txt(t)) return;
          const cs = getComputedStyle(t); if (cs.textAlign === 'center' || cs.textAlign === 'right') return;
          const r = t.getBoundingClientRect();
          if (r.width < vw * 0.25 || r.width > vw) return;
          if (Math.abs((r.left - sr.left) - (sr.right - r.right)) < 8 && r.width < sr.width * 0.75) return;
          min = Math.min(min, r.left);
        });
        if (min !== Infinity) lefts.push({ el: desc(sec), left: Math.round(min) });
      });
    const counts = {}; lefts.forEach(l => counts[l.left] = (counts[l.left] || 0) + 1);
    const dominant = +(Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [0])[0];
    container = {
      intended: Math.round(want), intendedSource: SPEC.container.note || 'spec',
      dominantLive: dominant, offBy: Math.round(dominant - want),
      matches: near(dominant, want, tol.position),
      sectionsMeasured: lefts.length,
      offenders: lefts.filter(l => !near(l.left, want, tol.position))
        .map(l => ({ ...l, offBy: Math.round(l.left - want) })).slice(0, 12),
      verdict: near(dominant, want, tol.position)
        ? 'container matches the design'
        : `every section is ${Math.abs(Math.round(dominant - want))}px too ${dominant < want ? 'wide' : 'narrow'} — ` +
          `content starts at ${dominant}px, design says ${Math.round(want)}px`
    };
  }

  /* ── 3) SECTION HEIGHTS / PADDING ────────────────────────────────────────── */
  // Matched by a distinctive piece of copy inside the section rather than by order,
  // so an added or removed section doesn't shift every subsequent comparison.
  const sectionFindings = [];
  (SPEC.sections || []).forEach(s => {
    if (!s.anchorText) return;
    const anchor = findByText(s.anchorText, s.scope);
    if (!anchor) { unmatched.push({ text: String(s.anchorText).slice(0, 40), note: `section "${s.name}" not found` }); return; }
    const sec = anchor.closest(SPEC.containerSelector || 'section,[class*="section"]');
    if (!sec) return;
    const r = sec.getBoundingClientRect(), c = getComputedStyle(sec);
    const d = [];
    if (s.height != null && !near(r.height, scaled(s.height), Math.max(8, scaled(s.height) * 0.04)))
      d.push({ prop: 'section height', figma: Math.round(scaled(s.height)) + 'px', live: Math.round(r.height) + 'px',
        offBy: Math.round(r.height - scaled(s.height)) });
    if (s.paddingTop != null && !near(parseFloat(c.paddingTop), scaled(s.paddingTop), tol.size))
      d.push({ prop: 'padding-top', figma: Math.round(scaled(s.paddingTop)) + 'px', live: c.paddingTop,
        offBy: Math.round(parseFloat(c.paddingTop) - scaled(s.paddingTop)) });
    if (s.paddingBottom != null && !near(parseFloat(c.paddingBottom), scaled(s.paddingBottom), tol.size))
      d.push({ prop: 'padding-bottom', figma: Math.round(scaled(s.paddingBottom)) + 'px', live: c.paddingBottom,
        offBy: Math.round(parseFloat(c.paddingBottom) - scaled(s.paddingBottom)) });
    if (s.contentLeft != null) {
      let min = Infinity;
      sec.querySelectorAll('h1,h2,h3,h4,h5,h6,p').forEach(t => { if (!visible(t) || !txt(t)) return;
        const cs = getComputedStyle(t); if (cs.textAlign === 'center') return;
        min = Math.min(min, t.getBoundingClientRect().left); });
      if (min !== Infinity && !near(min, scaled(s.contentLeft), tol.position))
        d.push({ prop: 'content left edge', figma: Math.round(scaled(s.contentLeft)) + 'px', live: Math.round(min) + 'px',
          offBy: Math.round(min - scaled(s.contentLeft)) });
    }
    if (d.length) sectionFindings.push({ section: s.name, el: desc(sec), diffs: d });
  });

  const totalDiffs = typeFindings.reduce((a, f) => a + f.diffs.length, 0) +
    sectionFindings.reduce((a, f) => a + f.diffs.length, 0) + (container && !container.matches ? 1 : 0);

  return {
    spec: { name: SPEC.name || '(unnamed)', frameWidth, liveViewport: vw,
      scale: +scale.toFixed(3),
      comparison: scale === 1 ? 'like-for-like (viewport matches the Figma frame)'
        : `SCALED by ${scale.toFixed(3)} — viewport ${vw}px vs frame ${frameWidth}px. Weaker evidence; ` +
          'run at the frame width for exact numbers.',
      tolerance: tol },
    container,
    sectionFindings,
    typeFindings,
    coverage: { specTextNodes: (SPEC.text || []).length, matched: matched.length,
      unmatched, note: 'unmatched entries are copy changes or missing sections, not necessarily defects' },
    totalDiffs
  };
})();
