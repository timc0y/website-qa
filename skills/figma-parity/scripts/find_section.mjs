#!/usr/bin/env node
/*
 * find_section.mjs — before you report a designed section as "not built", find out whether it
 * lives somewhere else on the site.
 *
 * Why this exists: a Figma page frame is a mock, not a page manifest. The "Services Page" frame
 * in one real file embeds a complete Tax Saving Calculator — eyebrow, 54px heading, three-step
 * slider, results card. It is not on any service page. It is its own page at
 * /tax-saving-calculator, linked from the hero, the nav and the footer. Reported as a missing
 * section it would have been the headline finding of the review and completely wrong.
 *
 * That near-miss was caught by luck. This makes it mechanical: give it the distinctive copy from
 * the designed section and it tells you which URL on the site actually carries it.
 *
 * Read-only: GETs the sitemap and pages over plain HTTP. No Data API, no CMS, no auth.
 *
 * Usage:
 *   node find_section.mjs --site=https://example.com "Tax saving calculator" "Your Policy Details"
 *   node find_section.mjs --site=https://example.com --phrases=phrases.json [--max=60]
 */
import { readFileSync } from 'fs';

const args = process.argv.slice(2);
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const site = (opt('site') || '').replace(/\/+$/, '');
const max = +(opt('max') || 60);
let phrases = args.filter(a => !a.startsWith('--'));
if (opt('phrases')) phrases = JSON.parse(readFileSync(opt('phrases'), 'utf8'));

if (!site || !phrases.length) {
  console.error('usage: node find_section.mjs --site=https://example.com "distinctive phrase" ...');
  process.exit(2);
}

const norm = s => s.toLowerCase().replace(/[‘’“”]/g, "'").replace(/\s+/g, ' ').trim();
// strip tags/scripts so we match rendered copy, not markup or JSON blobs
const textOf = html => norm(html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'"));

async function get(url) {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'figma-parity/reconcile' } });
    return { status: r.status, body: r.ok ? await r.text() : '', finalUrl: r.url };
  } catch (e) { return { status: 0, body: '', error: String(e.message || e).slice(0, 60) }; }
}

/* Build the URL list: sitemap.xml first (it's the site's own declaration of what exists), then
 * fall back to the nav and footer links on the homepage — which is the same "the site states
 * what it contains" idea the website-qa parity check leans on. */
async function urlList() {
  const sm = await get(`${site}/sitemap.xml`);
  const fromSitemap = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]);
  if (fromSitemap.length) return { source: 'sitemap.xml', urls: [...new Set(fromSitemap)] };

  const home = await get(site + '/');
  const hrefs = [...home.body.matchAll(/href="([^"#?]+)"/gi)].map(m => m[1])
    .filter(h => h.startsWith('/') || h.startsWith(site))
    .map(h => (h.startsWith('/') ? site + h : h).replace(/\/+$/, '') || site)
    .filter(u => !/\.(png|jpe?g|svg|webp|avif|css|js|pdf|ico|woff2?)$/i.test(u));
  return { source: 'homepage nav/footer links (no sitemap.xml)', urls: [...new Set([site + '/', ...hrefs])] };
}

const { source, urls } = await urlList();
const scanned = urls.slice(0, max);
const wanted = phrases.map(p => ({ phrase: p, needle: norm(p), hits: [] }));

for (const u of scanned) {
  const r = await get(u);
  if (!r.body) continue;
  const t = textOf(r.body);
  for (const w of wanted) {
    if (t.includes(w.needle)) w.hits.push(u);
    else {
      // partial credit: most of the distinctive words present on one page is still a lead
      const words = w.needle.split(' ').filter(x => x.length > 4);
      if (words.length >= 3) {
        const found = words.filter(x => t.includes(x)).length;
        if (found / words.length >= 0.8) w.hits.push(u + `  (partial: ${found}/${words.length} key words)`);
      }
    }
  }
}

const out = {
  site, urlSource: source, urlsKnown: urls.length, urlsScanned: scanned.length,
  truncated: urls.length > scanned.length ? urls.length - scanned.length : 0,
  results: wanted.map(w => ({
    phrase: w.phrase,
    foundOn: w.hits,
    verdict: w.hits.length
      ? 'BUILT ELSEWHERE — do NOT report this as a missing section; it lives at the URL(s) above'
      : 'not found on any scanned page — a "not built" finding is now supported by evidence'
  }))
};
console.log(JSON.stringify(out, null, 1));
if (out.truncated) console.error(`\n⚠︎ ${out.truncated} URLs not scanned (--max=${max}) — a "not found" is only as good as the coverage.`);
