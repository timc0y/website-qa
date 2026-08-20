#!/usr/bin/env node
/*
 * check-cascade.mjs — the cascade probe must fire on the unexplained case and stay silent
 * on every explained one.
 *
 * This detector is unusually easy to make noisy: `display: inline` on a block tag is a
 * perfectly ordinary authoring choice, and the whole finding rests on "nothing in the
 * cascade says so". So the negative cases here carry more weight than the positive one —
 * an author rule, an inline style, and a flex/grid parent must each silence it.
 *
 *   node tests/check-cascade.mjs
 */
import pw from 'playwright';
const { chromium } = pw;
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'scripts', 'audit_cascade.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage();
const audit = async body => {
  await page.setContent(`<!doctype html><html><head></head><body>${body}</body></html>`);
  return page.evaluate(`(0, eval)(${JSON.stringify(SRC)})`);
};
const inlineHits = r => r.blockTagsComputingInline.map(f => f.el);

console.log('\naudit_cascade.js — computed value with nothing in the cascade to explain it\n');

// ── the positive case: an h1 that is inline for no readable reason ─────────────
{
  /* No author rule sets display anywhere. The only way to produce this in a test is a UA-
   * default override applied through the CSSOM after the fact, which is exactly the shape
   * of the real bug — the value is there, the rule that made it is not findable. */
  const r = await audit(`<h1 id="bad">A heading</h1><p>Following copy.</p>
    <script>document.getElementById('bad').style.setProperty('display','inline');
    // then remove the trace, leaving the computed value with no author rule and no style attr
    </script>`);
  // the style attribute IS readable, so this must NOT fire — proving the guard works
  ok('an inline style attribute explains it → silent', !inlineHits(r).includes('h1#bad'),
    JSON.stringify(r.blockTagsComputingInline));
}
{
  // now the genuine case: computed inline, no author rule, no style attribute
  const r = await audit(`<h1 id="bad">A heading</h1><p>Following copy.</p>
    <script>
      const el = document.getElementById('bad');
      el.style.setProperty('display','inline');
      // simulate "the rule is not findable": adopt the value then clear the attribute is not
      // possible, so instead use a constructed sheet the audit CAN'T attribute to a selector
      el.style.removeProperty('display');
      const s = new CSSStyleSheet(); s.replaceSync('#bad{display:inline}');
      document.adoptedStyleSheets = [s];
    </script>`);
  ok('a block tag computing inline with no matchable author rule → flagged',
    inlineHits(r).some(e => e.startsWith('h1')), JSON.stringify(r.blockTagsComputingInline));
  const f = r.blockTagsComputingInline[0];
  ok('  …reporting computed and UA default', f && f.computed === 'inline' && f.uaDefault === 'block');
  ok('  …marked SUSPECTED, never measured', f && /suspected/.test(f.confidence));
  ok('  …naming the consequence, not just the property', f && /shares a line/.test(f.consequence));
  ok('  …and telling the reader to set it explicitly', f && /Set display explicitly/.test(f.hint));
}

// ── the negative cases, which are the ones that matter ────────────────────────
{
  const r = await audit(`<style>h1{display:inline}</style><h1>Deliberately inline</h1>`);
  ok('an author rule setting display → silent', !inlineHits(r).length, JSON.stringify(inlineHits(r)));
}
{
  const r = await audit(`<style>.x{display:inline}</style><h1 class="x">Inline by class</h1>`);
  ok('an author rule via class → silent', !inlineHits(r).length, JSON.stringify(inlineHits(r)));
}
{
  const r = await audit(`<h1 style="display:inline">Inline by attribute</h1>`);
  ok('a style attribute → silent', !inlineHits(r).length, JSON.stringify(inlineHits(r)));
}
{
  const r = await audit(`<div style="display:flex"><h1>Flex child</h1></div>`);
  ok('a flex parent → silent (the parent lays this out)', !inlineHits(r).length, JSON.stringify(inlineHits(r)));
}
{
  const r = await audit(`<div style="display:grid"><h2>Grid child</h2></div>`);
  ok('a grid parent → silent', !inlineHits(r).length, JSON.stringify(inlineHits(r)));
}
{
  const r = await audit(`<h1>Normal heading</h1><p>Normal copy.</p><section><div>Blocks.</div></section>`);
  ok('an ordinary page → no findings at all', !inlineHits(r).length && !r.classedHeadingsAtUaDefaultSize.length,
    JSON.stringify(r));
}

// ── classed heading sitting at the UA default size ────────────────────────────
{
  const r = await audit(`<h2 class="title-m">A heading whose CSS never loaded</h2>`);
  const f = r.classedHeadingsAtUaDefaultSize[0];
  ok('a classed heading at the UA default size → flagged', !!f, JSON.stringify(r.classedHeadingsAtUaDefaultSize));
  ok('  …identifying it as CSS that did not load', f && /did not load|not in any/.test(f.hint));
}
{
  const r = await audit(`<style>.title-m{font-size:24px}</style><h2 class="title-m">Styled to the same value</h2>`);
  ok('a rule setting the same value as the default → silent',
    !r.classedHeadingsAtUaDefaultSize.length, JSON.stringify(r.classedHeadingsAtUaDefaultSize));
}
{
  const r = await audit(`<h2>Unclassed heading</h2>`);
  ok('an unclassed heading at defaults → silent (nothing claims to style it)',
    !r.classedHeadingsAtUaDefaultSize.length);
}

// ── honesty about what it could not read ──────────────────────────────────────
{
  const r = await audit(`<h1>Heading</h1>`);
  ok('reports how many rules it actually read', typeof r.rulesRead === 'number');
  ok('reports unreadable stylesheets as a list', Array.isArray(r.unreadableStylesheets));
  ok('carries the SUSPECTED note in the payload', /SUSPECTED/.test(r.note));
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
