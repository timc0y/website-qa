/*
 * attribution.mjs — which declaration did this, and where does it live.
 *
 * Owner of one question: given an element a finding names, which CSS rule creates the
 * constraint behind it, and in which stylesheet at which line.
 *
 * The gap it closes is the difference between a finding and a fix. "`.hero-home_title` is
 * 544px wide and its heading needs 561" tells a reviewer something is wrong; "`.title-xl`
 * sets `line-height: 0.9` at shared.css:1204, and nothing overrides it" tells them what to
 * change. Every other check in this skill reads COMPUTED values, which by construction have
 * lost the authorship — computed style is the answer with the argument thrown away.
 *
 * Chromium only. `CSS.getMatchedStylesForNode` is a CDP API with no WebKit or Firefox
 * equivalent in Playwright, so this is declared as a capability and its absence is stated
 * as a limitation rather than silently degrading — a report that stops naming causes
 * halfway through, with no explanation, is worse than one that never started.
 *
 * Read-only: it inspects the CSSOM through the debugger protocol and changes nothing.
 */

/* Properties worth attributing. A finding about a box that will not grow is caused by a
 * size or overflow declaration, and attributing all forty properties that happen to match
 * an element buries the one that matters. Extended only when a detector starts producing a
 * finding whose cause is not in this list. */
const CAUSAL = new Set([
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'overflow', 'overflow-x', 'overflow-y', 'white-space', 'overflow-wrap', 'word-break',
  'position', 'top', 'right', 'bottom', 'left', 'inset', 'transform',
  'flex', 'flex-basis', 'flex-shrink', 'flex-grow', 'grid-template-columns',
  'grid-template-rows', 'line-height', 'font-size', 'aspect-ratio', 'z-index'
]);

/**
 * Attach `cause` to findings that name an element.
 *
 * Selectors come from the detectors as human descriptions ("div.hero-home_quote.w-richtext"),
 * which are exactly the CSS selector a person would type — so they are used as-is, and a
 * selector that matches nothing or several nodes is reported as such rather than guessed at.
 * A wrong attribution is worse than none: it sends someone to edit a rule that is not the
 * one doing this.
 */
export async function attributeFindings(page, findings, { limit = 40 } = {}) {
  let session;
  try { session = await page.context().newCDPSession(page); }
  catch (e) { return { available: false, why: 'CDP unavailable (Chromium only): ' + String(e.message || e).slice(0, 80), attributed: 0 }; }

  let attributed = 0, ambiguous = 0, unmatched = 0;
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: -1 });
    const sheets = new Map();

    for (const f of findings.slice(0, limit)) {
      const selector = f.el || f.covers || f.a;
      if (!selector || typeof selector !== 'string') continue;
      /* Detector descriptions carry prose for shadow-DOM cases ("… — text rendered inside a
       * web component"); the selector is the part before the em dash. */
      const clean = selector.split(' — ')[0].trim();
      let nodeIds = [];
      try {
        const res = await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: clean });
        nodeIds = res.nodeIds || [];
      } catch (e) { unmatched++; continue; }
      if (!nodeIds.length) { unmatched++; continue; }
      if (nodeIds.length > 1) ambiguous++;              // still attributed, but say which one

      let matched;
      try { matched = await session.send('CSS.getMatchedStylesForNode', { nodeId: nodeIds[0] }); }
      catch (e) { unmatched++; continue; }

      const declarations = [];
      /* Later rules win, so walk the cascade backwards and keep the first appearance of
         each property — that is the declaration actually in effect, which is the only one
         worth sending anybody to. */
      const seen = new Set();
      for (const entry of (matched.matchedCSSRules || []).slice().reverse()) {
        const rule = entry.rule; if (!rule) continue;
        const sheetId = rule.styleSheetId;
        if (sheetId && !sheets.has(sheetId)) {
          try { const h = await session.send('CSS.getStyleSheetText', { styleSheetId: sheetId });
            sheets.set(sheetId, h.text ? true : false); } catch (e) { sheets.set(sheetId, false); }
        }
        for (const p of rule.style?.cssProperties || []) {
          if (!p.name || !CAUSAL.has(p.name) || p.disabled) continue;
          if (seen.has(p.name)) continue;
          seen.add(p.name);
          declarations.push({ property: p.name, value: p.value,
            selector: rule.selectorList?.text || '(inline)',
            origin: rule.origin,
            important: /!\s*important/.test(p.text || '') || undefined,
            // 0-based in CDP; humans and editors count from 1
            at: p.range ? `line ${p.range.startLine + 1}, col ${p.range.startColumn + 1}` : undefined,
            stylesheet: rule.styleSheetId ? (matched.cssKeyframesRules ? undefined : rule.styleSheetId) : undefined });
        }
      }
      const inline = matched.inlineStyle?.cssProperties?.filter(p => CAUSAL.has(p.name) && !p.disabled) || [];
      for (const p of inline) declarations.unshift({ property: p.name, value: p.value, selector: 'inline style' });

      if (!declarations.length) continue;
      f.cause = { matchedNodes: nodeIds.length, declarations: declarations.slice(0, 8),
        note: nodeIds.length > 1
          ? `${nodeIds.length} elements match this selector; these are the first one's declarations`
          : undefined };
      attributed++;
    }
  } finally {
    try { await session.detach(); } catch (e) { /* the page may already be gone */ }
  }
  return { available: true, attributed, ambiguous, unmatched,
    note: 'Declarations are the ones in effect after the cascade, filtered to properties that ' +
      'can cause a box-model defect. Chromium only.' };
}
