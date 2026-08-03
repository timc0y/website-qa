/*
 * audit_consistency.js — within-page design-system drift, no Figma needed.
 *
 * A page can match no design and still be "wrong" internally: the same component
 * rendered with different padding in two places, five slightly different greys, a
 * stray font, a broken heading outline. This finds that. Paste into a browser
 * javascript_exec call; returns a structured report.
 */
(() => {
  const cs = el => getComputedStyle(el);
  const primary = el => (el.className && el.className.toString ?
    el.className.toString().trim().split(/\s+/).find(c => !c.startsWith('w-') && !c.startsWith('is-')) : '') || el.tagName.toLowerCase();

  // 1) HEADING OUTLINE — multiple/zero h1, skipped levels
  const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
  const levels = heads.map(h => +h.tagName[1]);
  const h1s = levels.filter(l => l === 1).length;
  const skips = [];
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1)
    skips.push(`h${levels[i - 1]} → h${levels[i]} ("${heads[i].textContent.trim().slice(0, 30)}")`);
  const headingIssues = [];
  if (h1s === 0) headingIssues.push('no <h1> on the page');
  if (h1s > 1) headingIssues.push(h1s + ' <h1> elements (should be 1)');
  skips.forEach(s => headingIssues.push('skipped level: ' + s));

  // 2) TYPE / COLOUR / FONT SPRAWL — too many distinct values = inconsistent
  const textEls = Array.from(document.querySelectorAll('body *')).filter(el =>
    Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim()) &&
    cs(el).display !== 'none');
  const sizes = {}, colors = {}, fonts = {}, weights = {};
  textEls.forEach(el => { const c = cs(el);
    sizes[c.fontSize] = (sizes[c.fontSize] || 0) + 1;
    colors[c.color] = (colors[c.color] || 0) + 1;
    fonts[c.fontFamily.split(',')[0].replace(/"/g, '')] = (fonts[c.fontFamily.split(',')[0]] || 0) + 1;
    weights[c.fontWeight] = (weights[c.fontWeight] || 0) + 1; });
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} (${v})`);

  // 3) COMPONENT DRIFT — same primary class, divergent box metrics
  const groups = {};
  Array.from(document.querySelectorAll('[class]')).forEach(el => {
    const p = primary(el); if (!/card|btn|button|tab|item|tile|chip|pill/i.test(p)) return;
    (groups[p] = groups[p] || []).push(el);
  });
  const drift = [];
  Object.entries(groups).forEach(([name, els]) => {
    if (els.length < 2) return;
    const sig = el => { const c = cs(el); return [c.paddingTop, c.paddingLeft, c.borderRadius, c.fontSize].join('|'); };
    const variants = {};
    els.forEach(el => { const s = sig(el); (variants[s] = variants[s] || 0); variants[s]++; });
    const keys = Object.keys(variants);
    if (keys.length > 1) drift.push({ component: name, instances: els.length, distinctStyles: keys.length,
      styles: keys.slice(0, 4).map(k => { const [pt, pl, br, fs] = k.split('|'); return { pad: pt + '/' + pl, radius: br, fontSize: fs }; }) });
  });

  // 4) BUTTON CASE CONSISTENCY — "fix case on buttons": buttons should share a
  // text-transform. Mixed uppercase/none across the button set is usually a miss.
  const btns = Array.from(document.querySelectorAll('a,button,[class*="button"],[class*="btn"]'))
    .filter(el => { const t = el.textContent.trim(); const c = cs(el);
      return t && t.length < 30 && c.display !== 'none' && el.getBoundingClientRect().height > 0; });
  const caseCount = {};
  btns.forEach(el => { const tt = cs(el).textTransform;
    (caseCount[tt] = caseCount[tt] || []).push(el.textContent.trim().slice(0, 16)); });
  const buttonCase = Object.keys(caseCount).length > 1
    ? Object.entries(caseCount).map(([tt, ex]) => ({ textTransform: tt, count: ex.length, examples: ex.slice(0, 3) }))
    : null;

  return {
    headingIssues,
    buttonCaseMix: buttonCase,   // non-null = buttons disagree on text-transform
    headingOutline: heads.slice(0, 20).map(h => h.tagName.toLowerCase() + ': ' + h.textContent.trim().slice(0, 40)),
    sprawl: {
      fontFamilies: Object.keys(fonts).length, fonts: top(fonts, 5),
      fontSizes: Object.keys(sizes).length, sizes: top(sizes, 12),
      textColors: Object.keys(colors).length, colors: top(colors, 10),
      fontWeights: top(weights, 6)
    },
    componentDrift: drift,
    note: 'High fontSizes/textColors counts (say >12 / >8) suggest an inconsistent type scale or palette. componentDrift = same class rendered with different box metrics — reconcile or intentional (e.g. combo classes).'
  };
})();
