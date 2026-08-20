/*
 * why.js — "which rule is doing this, and at which breakpoint?"
 *
 * Every finding in this skill answers *what* is wrong. This answers the question
 * that immediately follows, and the one you actually need before you can fix
 * anything in a visual builder: which class, which declaration, inside which media
 * query. Without it you're left hunting through a class list for whichever combo set a
 * 28px font size; with it the fix is mechanical.
 *
 * Walks the real CSSOM, so it sees Webflow's generated stylesheet, any embedded
 * custom code, and inline styles — in cascade order, with the winning declaration
 * marked. Cross-origin stylesheets can't be read and are reported as skipped rather
 * than silently ignored, because a missing rule looks identical to a rule that
 * doesn't exist.
 *
 * INPUT — `window.__QA_WHY = [{ name, sel, props: ['font-size', …] }, …]`
 *   `sel` may also be `{ text: 'Some copy' }` to find an element by its rendered
 *   text, which is how you locate something you only know from a screenshot.
 */
(() => {
  const targets = window.__QA_WHY;
  if (!Array.isArray(targets)) return { error: 'set window.__QA_WHY = [{name, sel, props}]' };

  const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') +
    (cls(el) ? '.' + cls(el).trim().split(/\s+/).join('.') : '');
  const txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Flatten the CSSOM into a list of (rule, media-condition) pairs, in source order.
  // Order matters: for equal specificity the last one wins, and that's usually the
  // breakpoint override we're looking for.
  const flat = [];
  const skipped = [];
  const walk = (rules, media, sheetHref) => {
    for (const r of Array.from(rules || [])) {
      if (r.type === CSSRule.STYLE_RULE) flat.push({ rule: r, media, sheetHref });
      else if (r.type === CSSRule.MEDIA_RULE) walk(r.cssRules, (media ? media + ' AND ' : '') + r.conditionText, sheetHref);
      else if (r.type === CSSRule.SUPPORTS_RULE) walk(r.cssRules, media, sheetHref);
    }
  };
  Array.from(document.styleSheets).forEach(sh => {
    let rules; try { rules = sh.cssRules; }
    catch (e) { skipped.push(sh.href || '(inline)'); return; }   // cross-origin — cannot read
    walk(rules, '', sh.href ? sh.href.split('/').pop() : '(inline <style>)');
  });

  // crude but adequate specificity: [ids, classes/attrs/pseudo-classes, elements]
  const specificity = sel => {
    const s = sel.replace(/::[\w-]+/g, '');
    return [(s.match(/#[\w-]+/g) || []).length,
      (s.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+(\([^)]*\))?/g) || []).length,
      (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length];
  };
  const cmpSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

  const findEl = sel => {
    if (sel && typeof sel === 'object' && sel.text) {
      const want = norm(sel.text);
      const all = Array.from(document.querySelectorAll('body *'))
        .map(el => ({ el, n: norm(txt(el)) }))
        .filter(c => c.n && (c.n === want || c.n.startsWith(want.slice(0, 40))));
      all.sort((a, b) => txt(a.el).length - txt(b.el).length);
      return all[0] ? all[0].el : null;
    }
    return document.querySelector(sel);
  };

  const out = targets.map(t => {
    const el = findEl(t.sel);
    if (!el) return { name: t.name, selector: String(t.sel && t.sel.text || t.sel), notFound: true };
    const comp = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const props = t.props && t.props.length ? t.props : ['font-size'];

    // every rule that matches this element, cheapest test first
    const matching = flat.filter(f => {
      // a rule can carry several selectors; test each, ignoring state pseudos we
      // can't evaluate but still want to SEE (that's how hover rules show up)
      return f.rule.selectorText.split(',').some(s => {
        const base = s.replace(/:(hover|focus|active|focus-visible|focus-within|visited)\b/g, '').trim();
        if (!base) return false;
        try { return el.matches(base); } catch (e) { return false; }
      });
    });

    const byProp = {};
    props.forEach(p => {
      const hits = matching
        .map(f => ({ f, value: f.rule.style.getPropertyValue(p) }))
        .filter(x => x.value)
        .map(x => ({
          selector: x.f.rule.selectorText,
          media: x.f.media || '(all widths)',
          value: x.value.trim(),
          important: !!x.f.rule.style.getPropertyPriority(p),
          stateRule: /:(hover|focus|active)/.test(x.f.rule.selectorText),
          sheet: x.f.sheetHref,
          spec: specificity(x.f.rule.selectorText)
        }));
      // cascade order: the last declaration of the highest specificity wins
      const applicable = hits.filter(h => !h.stateRule);
      let winner = null;
      applicable.forEach(h => { if (!winner || cmpSpec(h.spec, winner.spec) >= 0) winner = h; });
      const inline = el.style.getPropertyValue(p);
      byProp[p] = {
        computed: comp.getPropertyValue(p),
        inlineStyle: inline || undefined,
        setBy: hits.map(h => ({ ...h, spec: h.spec.join(','), winning: h === winner && !inline })),
        // the single most useful line: what to change, and where
        fixHere: inline ? 'inline style attribute'
          : winner ? `${winner.selector}  @ ${winner.media}` : '(not set by any readable rule — inherited or UA default)'
      };
    });

    return {
      name: t.name,
      el: desc(el),
      text: txt(el).slice(0, 50),
      box: `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.left)},${Math.round(r.top)}`,
      parent: el.parentElement ? desc(el.parentElement) : null,
      props: byProp
    };
  });

  return { viewport: innerWidth + 'x' + innerHeight, results: out,
    stylesheetsRead: flat.length + ' rules',
    stylesheetsSkipped: skipped.length ? skipped : undefined };
})();
