#!/usr/bin/env node
/*
 * discover_controls.mjs — list the page's REAL interactive hooks before driving
 * anything. Run this first, always.
 *
 * Guessing selectors produces failures that read exactly like defects: a click
 * that times out looks like a dead control, a transform that never changes looks
 * like a broken carousel. Those are the most expensive false positives in a
 * parity report, because they are all High severity. Discover, then drive.
 *
 *   node discover_controls.mjs --url <url> [--width 1512] [--out controls.json]
 *
 * Reports, per candidate: tag, classes, the data-* attributes a framework would
 * hook (Webflow IX2, Embla, Finsweet, Alpine, Swiper...), href, aria state, and
 * whether the element is an anchor that would NAVIGATE rather than toggle.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const url = arg('url');
const width = Number(arg('width', 1512));
const outFile = arg('out');
if (!url) { console.error('usage: discover_controls.mjs --url <url> [--width 1512] [--out controls.json]'); process.exit(2); }

const browser = await chromium.launch({ args: ['--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForLoadState('load', { timeout: 30000 }).catch(() => {});
await page.evaluate(async () => {
  const step = Math.round(window.innerHeight * 0.6);
  for (let i = 0, y = 0; i < 80; i++, y += step) {
    window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90));
    if (y > document.documentElement.scrollHeight) break;
  }
  window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 800));
});

const found = await page.evaluate(() => {
  const seen = new Map();
  const describe = (el, why) => {
    const r = el.getBoundingClientRect();
    const data = [...el.attributes].filter((a) => a.name.startsWith('data-') || a.name.startsWith('aria-'))
      .map((a) => (a.value ? `${a.name}="${a.value}"` : a.name));
    const key = `${el.tagName}|${String(el.className)}|${data.join(',')}`;
    if (seen.has(key)) { seen.get(key).count += 1; return; }
    const section = el.closest('section, footer, header, nav, [class*="section"]');
    seen.set(key, {
      why, count: 1, tag: el.tagName.toLowerCase(),
      classes: String(el.className || '').slice(0, 90),
      data, href: el.getAttribute('href'),
      // An <a href> that is also a toggle will NAVIGATE on a synthetic click.
      navigatesOnClick: el.tagName === 'A' && !!el.getAttribute('href') &&
        !el.getAttribute('href').startsWith('#'),
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      visible: r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden',
      section: String(section?.className || '').split(' ')[0] || null,
      text: (el.innerText || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 34),
      suggestedSelector: null,
    });
  };

  // 1. Anything a framework has explicitly wired.
  document.querySelectorAll('*').forEach((el) => {
    const hooks = [...el.attributes].map((a) => a.name).filter((n) =>
      /^data-(.*-)?(toggle|open|accordion|faq|tab|carousel|slider|slide|arrow|prev|next|nav|trigger|menu|dropdown|modal|dialog|accordion-item|embla|swiper|w-|anim)/.test(n));
    if (hooks.length) describe(el, `data-hook: ${hooks.join(',')}`);
  });
  // 2. Native and ARIA controls.
  document.querySelectorAll('button, [role="button"], [role="tab"], summary, [aria-expanded], [aria-controls], [aria-selected], input, select, textarea')
    .forEach((el) => describe(el, `native/aria: ${el.tagName.toLowerCase()}`));
  // 3. Class-name conventions, last resort.
  document.querySelectorAll('[class*="toggle"], [class*="arrow"], [class*="prev"], [class*="next"], [class*="tab"], [class*="accordion"], [class*="dropdown"]')
    .forEach((el) => describe(el, 'class-name convention'));

  const rows = [...seen.values()];
  for (const row of rows) {
    const dataSel = row.data.filter((d) => d.startsWith('data-')).map((d) => `[${d.split('=')[0]}]`)[0];
    const clsSel = row.classes.split(' ').filter(Boolean)[0];
    row.suggestedSelector = dataSel || (clsSel ? `${row.tag}.${clsSel}` : row.tag);
  }
  return rows;
});

const groups = {
  frameworkHooks: found.filter((f) => f.why.startsWith('data-hook')),
  nativeAria: found.filter((f) => f.why.startsWith('native/aria')),
  classNameOnly: found.filter((f) => f.why === 'class-name convention'),
};
const warnings = found.filter((f) => f.navigatesOnClick && /toggle|trigger|dropdown|menu|tab/.test(`${f.classes} ${f.data.join(' ')}`))
  .map((f) => `${f.suggestedSelector} is an <a href="${f.href}"> — a synthetic click NAVIGATES; drive it by hover or verify manually.`);

const report = { url, width, discoveredAt: new Date().toISOString(), warnings, groups };
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

for (const [name, rows] of Object.entries(groups)) {
  process.stdout.write(`\n== ${name} (${rows.length})\n`);
  for (const f of rows.slice(0, 40)) {
    process.stdout.write(`   ${f.suggestedSelector.padEnd(34)} x${String(f.count).padEnd(3)} ${f.visible ? 'vis' : 'HID'} ${f.navigatesOnClick ? 'NAVIGATES' : '         '} ${f.section ?? '-'} | ${f.text}\n`);
  }
}
if (warnings.length) {
  process.stdout.write(`\n!! ${warnings.length} control(s) will navigate instead of toggling:\n`);
  warnings.forEach((w) => process.stdout.write(`   - ${w}\n`));
}
process.stdout.write(`\nPrefer a data-* hook over a class name: classes get restyled, hooks are wired.\n`);
await browser.close();
