#!/usr/bin/env node
/*
 * audit_css_quality.mjs — stylesheet-level design-system hygiene.
 *
 * The other audits here read COMPUTED values on elements, which is the right
 * lens for "does this page look wrong". It is the wrong lens for "is this CSS
 * any good": two rules can compute identically on every element you sampled and
 * still be two rules that should have been one. This script reads the RULES.
 *
 *   node audit_css_quality.mjs --url https://site.com [--out ./css-quality.json]
 *                              [--min-shared 4] [--tokens ./figma-vars.json]
 *
 * ─── EVERYTHING HERE IS ADVISORY ─────────────────────────────────────────────
 * A merge candidate is not a defect. Two selectors sharing six declarations may
 * be a missed abstraction, or may be two components that coincidentally agree
 * today and must diverge tomorrow. This script reports EVIDENCE ("these 7
 * selectors share these 6 declarations") and never a verdict. Report findings
 * from it as SUSPECTED, in a section clearly marked as code quality rather than
 * mixed in with rendering defects — a maintainer who finds "merge these classes"
 * filed next to "the CTA gradient is upside down" trusts neither.
 *
 * It also cannot see intent. Utility classes SHOULD share declarations; that is
 * what makes them utilities. Pass --ignore-selectors to mute a naming convention
 * (default mutes `u-`, `w-`, `is-`, `has-`, and `.w-…` Webflow internals).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const url = arg('url');
const out = arg('out');
const MIN_SHARED = Number(arg('min-shared', 4));
const IGNORE = (arg('ignore-selectors', 'u-,w-,is-,has-,w--,fs-') || '').split(',').filter(Boolean);
if (!url) { console.error('usage: audit_css_quality.mjs --url <url> [--out f.json]'); process.exit(2); }

// ── collect rules ───────────────────────────────────────────────────────────
// CSSOM is used rather than a text parse so that @media context, shorthand
// expansion and the browser's own normalisation are already applied — a text
// parser would report `#FFF` and `white` as different values.
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(1200);

const data = await page.evaluate(() => {
  const rules = [];
  const vars = {};        // --name -> value, as authored
  const varUses = {};     // --name -> use count
  let unreadable = 0;

  const walk = (list, media, href) => {
    for (const r of list) {
      if (r.type === CSSRule.MEDIA_RULE) { walk(r.cssRules, r.conditionText, href); continue; }
      if (r.type === CSSRule.SUPPORTS_RULE) { walk(r.cssRules, media, href); continue; }
      if (r.type !== CSSRule.STYLE_RULE) continue;
      const decl = {};
      const dupProps = [];
      for (let i = 0; i < r.style.length; i++) {
        const p = r.style[i];
        const v = r.style.getPropertyValue(p).trim();
        if (p in decl && decl[p] !== v) dupProps.push(p);
        decl[p] = v;
        if (p.startsWith('--')) { vars[p] = v; continue; }
        for (const m of v.matchAll(/var\(\s*(--[\w-]+)/g)) varUses[m[1]] = (varUses[m[1]] || 0) + 1;
      }
      rules.push({
        selector: r.selectorText, media: media || null, href: href || 'inline',
        decl, dupProps, important: (r.cssText.match(/!important/g) || []).length,
      });
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules, null, sheet.href); }
    catch { unreadable++; }
  }
  return { rules, vars, varUses, unreadable, sheetCount: document.styleSheets.length };
});
await browser.close();

const { rules, vars, varUses, unreadable, sheetCount } = data;

// ── declaration hygiene ─────────────────────────────────────────────────────
// CSSOM expands every shorthand, and resets like `border: 0` explode into eight
// border-image-* longhands. Left alone, those artefacts dominate every merge
// finding ("15 selectors share border-image-repeat!") and bury the real ones.
// So: drop pure reset artefacts, drop empty values, and collapse 4-side families
// back to one logical declaration when all sides agree.
const NOISE = /^(border-image-|-webkit-|-moz-|-ms-)/;
const SIDES = [
  ['padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']],
  ['margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']],
  ['border-radius', ['border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius']],
  ['border-color', ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']],
  ['border-style', ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']],
  ['border-width', ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']],
];
function tidy(decl) {
  const d = {};
  for (const [p, v] of Object.entries(decl)) {
    if (p.startsWith('--')) continue;
    if (NOISE.test(p)) continue;
    if (v === '' || v == null) continue;          // CSSOM placeholder, not a declaration
    d[p] = v;
  }
  for (const [short, longs] of SIDES) {
    const vals = longs.map((l) => d[l]);
    if (vals.every((v) => v != null) && new Set(vals).size === 1) {
      longs.forEach((l) => delete d[l]);
      d[short] = vals[0];
    }
  }
  return d;
}
for (const r of rules) r.decl = tidy(r.decl);
const muted = (sel) => IGNORE.some((p) => sel.includes('.' + p) || sel.startsWith('.' + p));
const findings = {};
const add = (k, v) => (findings[k] ||= []).push(v);

// ── 1. merge candidates ─────────────────────────────────────────────────────
// Group selectors by their exact set of declarations, and separately find large
// SHARED SUBSETS between distinct rules. The second is the interesting one: it
// is where a shared base class was never extracted.
const sig = (d) => Object.keys(d).sort()
  .map((p) => `${p}:${d[p]}`).join(';');

const byExact = new Map();
for (const r of rules) {
  if (muted(r.selector)) continue;
  const s = sig(r.decl);
  const n = Object.keys(r.decl).filter((p) => !p.startsWith('--')).length;
  if (n < MIN_SHARED) continue;
  const key = `${r.media || ''}|${s}`;
  (byExact.get(key) || byExact.set(key, []).get(key)).push(r);
}
for (const [key, group] of byExact) {
  const sels = [...new Set(group.map((g) => g.selector))];
  if (sels.length < 2) continue;
  add('identicalRuleBlocks', {
    selectors: sels, media: group[0].media,
    declarationCount: Object.keys(group[0].decl).filter((p) => !p.startsWith('--')).length,
    declarations: group[0].decl,
    suggestion: `${sels.length} selectors declare a byte-identical block. Comma-join them, or extract one class and compose.`,
  });
}

// Large shared subsets between non-identical rules.
//
// Reporting this pairwise is useless: N selectors sharing one block produce
// N*(N-1)/2 findings that are all the same fact, and 4000 rows of it drowns the
// report. So cluster by the SHARED BLOCK and emit each block once, with every
// selector carrying it, ranked by how much duplication merging would remove.
const cand = rules.filter((r) => !muted(r.selector)
  && Object.keys(r.decl).filter((p) => !p.startsWith('--')).length >= MIN_SHARED);
const blockGroups = new Map();
for (let i = 0; i < cand.length; i++) {
  for (let j = i + 1; j < cand.length; j++) {
    const A = cand[i], B = cand[j];
    if (A.media !== B.media || A.selector === B.selector) continue;
    const shared = Object.keys(A.decl).filter((p) => !p.startsWith('--') && B.decl[p] === A.decl[p]);
    if (shared.length < MIN_SHARED) continue;
    const nA = Object.keys(A.decl).filter((p) => !p.startsWith('--')).length;
    const nB = Object.keys(B.decl).filter((p) => !p.startsWith('--')).length;
    if (nA === shared.length && nB === shared.length) continue;   // identical → already reported
    const key = (A.media || '') + '|' + shared.sort().map((p) => `${p}:${A.decl[p]}`).join(';');
    if (!blockGroups.has(key)) blockGroups.set(key, {
      media: A.media, declarations: Object.fromEntries(shared.map((p) => [p, A.decl[p]])),
      declarationCount: shared.length, selectors: new Set(),
    });
    const g = blockGroups.get(key);
    g.selectors.add(A.selector); g.selectors.add(B.selector);
  }
}
// Keep only maximal blocks: drop a block whose declarations are a subset of a
// larger reported block covering the same selectors, or it reports the same
// missed abstraction three times at decreasing detail.
const groups = [...blockGroups.values()].map((g) => ({ ...g, selectors: [...g.selectors] }))
  .sort((a, b) => (b.declarationCount * b.selectors.length) - (a.declarationCount * a.selectors.length));
const kept = [];
for (const g of groups) {
  const props = Object.keys(g.declarations);
  const covered = kept.some((k) => k.selectors.length >= g.selectors.length
    && g.selectors.every((s) => k.selectors.includes(s))
    && props.every((p) => k.declarations[p] === g.declarations[p]));
  if (!covered) kept.push(g);
}
for (const g of kept.slice(0, 40)) add('sharedDeclarationBlock', {
  selectors: g.selectors, selectorCount: g.selectors.length, media: g.media,
  declarationCount: g.declarationCount, declarations: g.declarations,
  duplicatedDeclarations: g.declarationCount * (g.selectors.length - 1),
  suggestion: `${g.selectors.length} selectors repeat these ${g.declarationCount} declarations `
    + `(${g.declarationCount * (g.selectors.length - 1)} duplicated lines). Extract one base class and compose, `
    + `or comma-join if they are genuinely the same thing.`,
});
if (groups.length > kept.length) findings.__truncated = [
  `sharedDeclarationBlock: ${groups.length} clusters found, ${Math.min(kept.length, 40)} reported ` +
  `(subset-covered clusters dropped, then capped at 40). Not a clean bill of health for the rest.`,
];

// ── 2. token adherence ──────────────────────────────────────────────────────
// A literal that exactly equals a defined custom property is the cheapest,
// least arguable finding in this file: the token already exists.
const norm = (v) => v.toLowerCase().replace(/\s+/g, ' ').trim();
const varByValue = new Map();
for (const [n, v] of Object.entries(vars)) {
  const key = norm(v);
  (varByValue.get(key) || varByValue.set(key, []).get(key)).push(n);
}
const tokenMisses = {};
const TOKENISABLE = /^(color|background-color|border-color|fill|stroke|gap|row-gap|column-gap|padding|margin|border-radius|font-size|line-height|box-shadow|font-family)$/;

// Matching a literal to a token BY VALUE ALONE produces confident nonsense:
// `row-gap: 2rem` matches a font-size token that happens to be 2rem, and the
// suggestion "use var(--type--title--l) for your gap" is worse than silence.
// So a suggestion must also agree on CATEGORY, inferred from the token's name.
const catOfProp = (p) => {
  if (/^(color|background-color|border-color|fill|stroke)$/.test(p)) return 'colour';
  if (/^(gap|row-gap|column-gap|padding|margin|border-radius)$/.test(p)) return 'space';
  if (p === 'font-family') return 'family';
  if (p === 'font-size') return 'size';
  if (p === 'line-height') return 'lh';
  if (p === 'box-shadow') return 'shadow';
  return null;
};
const catOfToken = (n) => {
  if (/colou?r|white|black|orange|midnight|burgundy|teal|grey|gray|brand|surface|ink/i.test(n)) return 'colour';
  if (/shadow/i.test(n)) return 'shadow';
  if (/--ff|family|font-family/i.test(n)) return 'family';
  if (/(--|\b)lh|line-?height|leading/i.test(n)) return 'lh';
  if (/font-?size|--fs|title--|text--|type---/i.test(n)) return 'size';
  if (/space|spacing|gap|padding|margin|inset|size[sz]?---|radius|container/i.test(n)) return 'space';
  return null;
};
// Unitless or ultra-generic values collide with everything; require a category
// match AND a value that is not a bare small number unless the token is a
// line-height token.
const tooGeneric = (v) => /^-?\d+(\.\d+)?$/.test(v) && Math.abs(parseFloat(v)) <= 3;
for (const r of rules) {
  if (muted(r.selector)) continue;
  for (const [p, v] of Object.entries(r.decl)) {
    if (p.startsWith('--') || v.includes('var(')) continue;
    if (!TOKENISABLE.test(p)) continue;
    const hits = varByValue.get(norm(v));
    if (!hits) continue;
    const pc = catOfProp(p);
    const hit = hits.find((n) => catOfToken(n) === pc);
    if (!hit) continue;                                  // no same-category token → say nothing
    if (tooGeneric(v) && pc !== 'lh') continue;
    (tokenMisses[`${p}|${v}|${hit}`] ||= { property: p, value: v, token: hit, selectors: [] })
      .selectors.push(r.selector);
  }
}

// One row per (property, value, token) with every selector that hardcodes it —
// "40 rules hardcode #e8622a and var(--orange) already exists" is one decision;
// 40 separate rows is 40 arguments.
for (const m of Object.values(tokenMisses).sort((a, b) => b.selectors.length - a.selectors.length)) {
  add('literalWhereTokenExists', {
    property: m.property, value: m.value, token: m.token, occurrences: m.selectors.length,
    selectors: m.selectors.slice(0, 12),
    suggestion: `${m.selectors.length} rule(s) hardcode ${m.value} for ${m.property}; var(${m.token}) already holds it.`,
  });
}

// unused custom properties
// "Unused" here means: never referenced by var() in a READABLE stylesheet on
// THIS page. A property may still be read from an inline style, from JS, from a
// cross-origin sheet, or from another page's CSS. Treat as a lead, not a delete.
for (const n of Object.keys(vars)) if (!varUses[n]) add('unusedCustomProperty', {
  name: n, value: vars[n],
  caveat: 'unreferenced on this page in readable CSS only — check JS/inline/other pages before removing',
});

// ── 3. value sprawl and near-duplicate values ───────────────────────────────
const byProp = {};
for (const r of rules) {
  if (muted(r.selector)) continue;
  for (const [p, v] of Object.entries(r.decl)) {
    if (p.startsWith('--') || v.includes('var(')) continue;
    ((byProp[p] ||= {})[v] ||= []).push(r.selector);
  }
}
const SCALED = ['font-size', 'border-radius', 'gap', 'line-height', 'box-shadow', 'letter-spacing'];
for (const p of SCALED) {
  const vals = byProp[p]; if (!vals) continue;
  // `inherit`, `normal`, `80%`, `2em` are reset/UA values, not scale steps.
  const distinct = Object.keys(vals).filter((v) => !/^(inherit|initial|unset|normal|revert|auto)$/.test(v)
    && !/%$/.test(v) && !/em$/.test(v));
  if (distinct.length > 8) add('valueSprawl', {
    property: p, distinctValues: distinct.length, values: distinct.slice(0, 24),
    suggestion: `${distinct.length} distinct ${p} values suggests no shared scale. Define a token set and map onto it.`,
  });
  // Near-duplicates, per unit family. Comparing across units is meaningless
  // (1.2 and 1.2px are not neighbours), and unitless ratios need a far tighter
  // epsilon than pixels — `line-height: 1.14` next to `1.15` is the exact shape
  // of a scale that was hand-typed twice, and a px-only check never sees it.
  const FAMILIES = [
    { re: /^(-?[\d.]+)px$/, unit: 'px', eps: 1.5 },
    { re: /^(-?[\d.]+)rem$/, unit: 'rem', eps: 0.1 },
    { re: /^(-?[\d.]+)$/, unit: '', eps: 0.03 },
  ];
  for (const fam of FAMILIES) {
    const nums = distinct.map((v) => [v, fam.re.exec(v)?.[1]]).filter(([, n]) => n != null)
      .map(([v, n]) => [v, parseFloat(n)]).sort((a, b) => a[1] - b[1]);
    for (let i = 1; i < nums.length; i++) {
      const d = nums[i][1] - nums[i - 1][1];
      if (d > 0 && d <= fam.eps) add('nearDuplicateValue', {
        property: p, values: [nums[i - 1][0], nums[i][0]], delta: +d.toFixed(3), unit: fam.unit || 'unitless',
        usedBy: [vals[nums[i - 1][0]].length, vals[nums[i][0]].length],
        suggestion: `${nums[i - 1][0]} and ${nums[i][0]} differ by ${d.toFixed(3)} — almost certainly meant to be one value.`,
      });
    }
  }
}
// near-duplicate colours (sRGB distance)
const parse = (v) => {
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) { const n = m[1].split(/[,\s/]+/).map(Number); return n.length >= 3 ? n.slice(0, 3) : null; }
  return null;
};
const colourVals = new Map();
for (const p of ['color', 'background-color', 'border-color', 'fill']) {
  for (const [v, sels] of Object.entries(byProp[p] || {})) {
    const rgb = parse(v); if (!rgb) continue;
    const k = rgb.join(',');
    if (!colourVals.has(k)) colourVals.set(k, { rgb, values: new Set(), uses: 0 });
    const e = colourVals.get(k); e.values.add(v); e.uses += sels.length;
  }
}
const cols = [...colourVals.values()];
for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
  const d = Math.hypot(...cols[i].rgb.map((c, k) => c - cols[j].rgb[k]));
  if (d > 0 && d <= 8) add('nearDuplicateColour', {
    a: [...cols[i].values][0], b: [...cols[j].values][0], distance: +d.toFixed(1),
    uses: [cols[i].uses, cols[j].uses],
    suggestion: `Two near-identical colours (sRGB distance ${d.toFixed(1)}). Collapse to one token unless the difference is deliberate.`,
  });
}

// ── 4. rule-level smells ────────────────────────────────────────────────────
for (const r of rules) {
  if (r.dupProps.length) add('duplicatePropertyInBlock', { selector: r.selector, properties: r.dupProps });
  for (const part of r.selector.split(',').map((s) => s.trim())) {
    const depth = part.split(/\s+|>/).filter(Boolean).length;
    if (depth >= 5) add('deepDescendantSelector', { selector: part, depth,
      suggestion: 'Depth ≥5 couples CSS to DOM shape; a single class on the target is more durable.' });
    // `:has()` reasoning about a sibling or descendant's presence/position is doing structural
    // work in CSS that a reorder or a markup change breaks silently — no build error, just a
    // rule that stops matching. It is a legitimate tool, not a defect by itself; flag it as a
    // fragility lead so a reviewer checks whether an explicit modifier class would be sturdier.
    if (/:has\(/.test(part)) add('hasSelectorCoupling', { selector: part,
      suggestion: 'Depends on sibling/descendant DOM structure through :has(); a reorder or a markup edit can silently stop it matching. Consider an explicit modifier class or attribute if this styling is load-bearing.' });
  }
}
const impBySheet = {};
for (const r of rules) if (r.important) impBySheet[r.href] = (impBySheet[r.href] || 0) + r.important;
for (const [href, n] of Object.entries(impBySheet)) if (n >= 10)
  add('importantHotspot', { stylesheet: href, count: n,
    suggestion: '!important in bulk usually means a specificity fight; the losing selector is the real bug.' });

// ── report ──────────────────────────────────────────────────────────────────
const summary = {
  url, sheetCount, unreadableSheets: unreadable,
  ruleCount: rules.length, customProperties: Object.keys(vars).length,
  counts: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length])),
  advisory: 'Every finding here is code quality, not a rendering defect. Report as SUSPECTED and in its own section.',
  limitations: unreadable
    ? [`${unreadable} stylesheet(s) unreadable (cross-origin); rules in them were not analysed, so absence of a finding is not evidence.`]
    : [],
};
const payload = { summary, findings };
if (out) { fs.writeFileSync(out, JSON.stringify(payload, null, 1)); }
console.log(JSON.stringify(summary, null, 1));
if (!out) console.log(JSON.stringify(findings, null, 1).slice(0, 4000));
