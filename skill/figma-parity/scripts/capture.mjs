#!/usr/bin/env node
/*
 * capture.mjs — deterministic local capture for a figma-parity run.
 *
 * This is the reference implementation of the CAPTURE CONTRACT. Every capture,
 * whoever produced it, must supply the same fields; a local Playwright run can
 * fill all of them, Forge fills some and leaves the rest `null`. `null` means
 * unknown, and unknown must degrade a finding's confidence — never be assumed.
 *
 *   node capture.mjs --url <url> --width 1512 --label desktop \
 *     --map figma-map.json --out <run-dir> [--gutter auto|<px>] [--sections a,b]
 *
 * Writes into <run-dir>:
 *   live/full-<label>.png              full-page screenshot
 *   live/<section>-<label>.png         one per mapped section
 *   live/capture-<label>.json          the capture contract + measurements
 *
 * Requires `playwright` to be resolvable — run from a directory that has it.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// --- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const url = arg('url');
const width = Number(arg('width', 1512));
const label = arg('label', `w${width}`);
const out = path.resolve(arg('out', process.cwd()));
const mapPath = arg('map');
const gutterOpt = arg('gutter', 'auto');
const only = arg('sections');
if (!url) {
  console.error('usage: capture.mjs --url <url> --width <px> --label <name> --out <dir> [--map figma-map.json]');
  process.exit(2);
}
const LIVE = path.join(out, 'live');
fs.mkdirSync(LIVE, { recursive: true });
const log = (m) => process.stderr.write(`[${label}] ${m}\n`);

// Sections come from the project map so pairing is explicit, never inferred
// from a filename index. See references/project-map.md.
/** A map may be flat (one route) or carry `routes[]`. Merge so shared keys survive. */
export function resolveRoute(map, wanted) {
  if (!Array.isArray(map.routes)) return map;
  const hit = wanted ? map.routes.find((r) => r.route === wanted) : map.routes[0];
  if (!hit) throw new Error(`route not in map: ${wanted}`);
  return { ...map, ...hit };
}

let sections = [];
if (mapPath) {
  const map = resolveRoute(JSON.parse(fs.readFileSync(path.resolve(mapPath), 'utf8')), arg('route'));
  sections = (map.sections || []).filter((s) => s.selector && s.name);
  if (only) {
    const wanted = new Set(only.split(','));
    sections = sections.filter((s) => wanted.has(s.name));
  }
}

// Animations are zeroed only AFTER the reveal sweep, so entrance animations
// finish rather than being frozen half-played.
const CAPTURE_CSS = `
  *, *::before, *::after {
    animation-duration: 0s !important; animation-delay: 0s !important;
    transition-duration: 0s !important; transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** Fetch the raw document so target mutation mid-run is detectable. */
async function fingerprintTarget() {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const body = Buffer.from(await res.arrayBuffer());
    return { sha256: sha256(body), bytes: body.length, status: res.status,
             lastModified: res.headers.get('last-modified') || null,
             fetchedAt: new Date().toISOString() };
  } catch (error) {
    return { error: String(error).slice(0, 200), fetchedAt: new Date().toISOString() };
  }
}

/** Settle: reveal sweep, fonts, images, then two consecutive equal heights. */
async function settle(page) {
  // Bounded: lazy images grow scrollHeight, so an unbounded loop can spin.
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.6);
    for (let i = 0, y = 0; i < 80; i++, y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 100));
      if (y > document.documentElement.scrollHeight) break;
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 600));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 600));
  });
  // Await the promise INSIDE the page: returning document.fonts.ready hands
  // Playwright an unserialisable FontFaceSet.
  await page.evaluate(async () => { await document.fonts.ready; return true; });
  await page.evaluate(async () => {
    const pending = [...document.images].filter((i) => !i.complete);
    await Promise.all(pending.map((i) => new Promise((r) => {
      const t = setTimeout(r, 5000);
      i.addEventListener('load', () => { clearTimeout(t); r(); }, { once: true });
      i.addEventListener('error', () => { clearTimeout(t); r(); }, { once: true });
    })));
    return true;
  });
  await page.addStyleTag({ content: CAPTURE_CSS });
  let last = -1, settled = false;
  for (let i = 0; i < 12; i++) {
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h === last) { settled = true; break; }
    last = h;
    await page.waitForTimeout(400);
  }
  return { settled, method: 'reveal-sweep + fonts.ready + image completion + two equal heights',
           documentHeight: last };
}

const browser = await chromium.launch({ args: ['--hide-scrollbars'] });

// --- gutter probe -----------------------------------------------------------
// The window width is NOT the content width. A classic scrollbar or
// `scrollbar-gutter: stable` permanently reserves px, so a 1512 window can lay
// out at 1497 and bias every horizontal measurement.
//
// Do NOT measure this as innerWidth - documentElement.clientWidth: with
// scrollbars hidden that is 0, while `scrollbar-gutter: stable` still shrinks
// the laid-out content. Measure the content block itself, then converge — the
// loop is mechanism-agnostic, so it works whatever reserved the space.
const contentWidthOf = (page) => page.evaluate(() => {
  const blocks = [document.body, ...document.body.children,
    ...document.querySelectorAll('main, .main-wrap, .page-wrap')].filter(Boolean);
  return Math.max(0, ...blocks.map((e) => Math.round(e.getBoundingClientRect().width)));
});

let gutter = gutterOpt === 'auto' ? 0 : Number(gutterOpt);
if (gutterOpt === 'auto') {
  const probe = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  for (let attempt = 0; attempt < 3; attempt++) {
    await probe.setViewportSize({ width: width + gutter, height: 900 });
    if (attempt === 0) await probe.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await probe.waitForTimeout(900);
    const observed = await contentWidthOf(probe);
    if (observed === width) break;
    const delta = width - observed;
    if (!delta || gutter + delta < 0 || gutter + delta > 200) {
      log(`gutter probe: could not converge (content ${observed} vs wanted ${width}); pass --gutter <px>`);
      break;
    }
    gutter += delta;
    log(`gutter probe: content ${observed} at window ${width + gutter - delta} -> retry with ${gutter}px reserved`);
  }
  await probe.close();
  log(`gutter: ${gutter}px reserved -> window ${width + gutter} for ${width} of content`);
}

const startFingerprint = await fingerprintTarget();
const page = await browser.newPage({
  viewport: { width: width + gutter, height: 900 },
  deviceScaleFactor: 1,
  locale: arg('locale', 'en-GB'),
  colorScheme: arg('color-scheme', 'light'),
});
page.setDefaultTimeout(30000);

const consoleMsgs = [], failedRequests = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) });
});
page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), error: r.failure()?.errorText }));
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push({ url: r.url(), status: r.status() }); });

log('goto');
const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForLoadState('load', { timeout: 30000 }).catch(() => log('note: load event not reached in 30s'));
const settleInfo = await settle(page);
log(`settled=${settleInfo.settled} height=${settleInfo.documentHeight}`);

// --- did the page's own scripts actually run? -------------------------------
// A screenshot of a page whose JS never executed is not the finished page. If
// this cannot be established, findings about anything script-driven are unsafe.
const runtime = await page.evaluate(() => ({
  scripts: [...document.querySelectorAll('script[src]')].map((s) => s.src).slice(0, 40),
  documentElementAttributes: [...document.documentElement.attributes].map((a) => `${a.name}=${a.value}`.slice(0, 120)),
  bodyClasses: String(document.body.className || '').slice(0, 200),
}));

// --- measurements -----------------------------------------------------------
const measured = await page.evaluate(() => {
  const px = (v) => Math.round(parseFloat(v) || 0);
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left),
             width: Math.round(r.width), height: Math.round(r.height) };
  };
  // The widest content block: the real content width, which a reserved
  // scrollbar gutter shrinks below window width.
  const blocks = [document.body, ...document.body.children,
    ...document.querySelectorAll('main, .main-wrap, .page-wrap')].filter(Boolean);
  const contentWidth = Math.max(0, ...blocks.map((e) => Math.round(e.getBoundingClientRect().width)));
  return {
    innerWidth: window.innerWidth,
    clientWidth: document.documentElement.clientWidth,
    contentWidth,
    devicePixelRatio: window.devicePixelRatio,
    documentHeight: document.documentElement.scrollHeight,
    title: document.title,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
      ? { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth } : null,
    typography: [...document.querySelectorAll('h1,h2,h3,h4,[class*="eyebrow"]')]
      .filter((e) => e.innerText && e.innerText.trim()).slice(0, 60).map((e) => {
        const c = getComputedStyle(e);
        return { tag: e.tagName.toLowerCase(), cls: String(e.className || '').slice(0, 70),
                 text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 70),
                 fontFamily: c.fontFamily.split(',')[0].replace(/["']/g, ''), fontSize: c.fontSize,
                 fontWeight: c.fontWeight, lineHeight: c.lineHeight, letterSpacing: c.letterSpacing,
                 textTransform: c.textTransform, color: c.color, fontStyle: c.fontStyle, ...box(e) };
      }),
    links: [...document.querySelectorAll('a')].slice(0, 200).map((a) => ({
      text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      href: a.getAttribute('href'),
    })),
    _px: px,
  };
});
delete measured._px;

if (measured.contentWidth !== width) {
  log(`WARNING content width is ${measured.contentWidth}, expected ${width} — horizontal findings are unsafe until this matches`);
}

await page.screenshot({ path: path.join(LIVE, `full-${label}.png`), fullPage: true, timeout: 90000 });
log('full-page screenshot written');

// --- per-section captures ---------------------------------------------------
const captured = [];
for (const s of sections) {
  const file = path.join(LIVE, `${s.name}-${label}.png`);
  try {
    const el = page.locator(s.selector).first();
    const count = await page.locator(s.selector).count();
    await el.scrollIntoViewIfNeeded({ timeout: 10000 });
    await page.waitForTimeout(300);
    const geometry = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const c = getComputedStyle(node);
      return { top: Math.round(r.top + window.scrollY), left: Math.round(r.left),
               width: Math.round(r.width), height: Math.round(r.height),
               padding: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map((v) => Math.round(parseFloat(v) || 0)),
               backgroundColor: c.backgroundColor, backgroundImage: c.backgroundImage.slice(0, 200) };
    });
    await el.screenshot({ path: file, timeout: 30000 });
    captured.push({ name: s.name, figmaNodeId: s.figmaNodeId ?? null, selector: s.selector,
                    path: path.relative(out, file), matchCount: count, geometry,
                    captureProvider: 'local', observedContentWidth: measured.contentWidth,
                    settleMethod: settleInfo.method, masks: [], limitations: count > 1
                      ? [`selector matched ${count} elements; the first was captured`] : [] });
    log(`section ok: ${s.name}${count > 1 ? ` (${count} matches)` : ''}`);
  } catch (error) {
    captured.push({ name: s.name, figmaNodeId: s.figmaNodeId ?? null, selector: s.selector,
                    path: null, captureProvider: 'local', observedContentWidth: measured.contentWidth,
                    settleMethod: settleInfo.method, masks: [],
                    limitations: [`capture failed: ${error.message.split('\n')[0]}`] });
    log(`section FAIL ${s.name}: ${error.message.split('\n')[0]}`);
  }
}

const endFingerprint = await fingerprintTarget();
const targetStable = Boolean(startFingerprint.sha256 && startFingerprint.sha256 === endFingerprint.sha256);
if (!targetStable) log('WARNING the served document changed during this run — do not blend evidence across the change');

const packet = {
  captureContract: 1,
  captureProvider: 'local',
  url,
  label,
  status: response?.status() ?? null,
  requestedContentWidth: width,
  windowWidth: width + gutter,
  reservedGutter: gutter,
  observedContentWidth: measured.contentWidth,
  contentWidthMatches: measured.contentWidth === width,
  deviceScaleFactor: measured.devicePixelRatio,
  settle: settleInfo,
  target: { stable: targetStable, start: startFingerprint, end: endFingerprint },
  runtime,
  masks: [],
  console: consoleMsgs,
  failedRequests,
  measurements: measured,
  sections: captured,
  fullPage: path.relative(out, path.join(LIVE, `full-${label}.png`)),
  capturedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(LIVE, `capture-${label}.json`), `${JSON.stringify(packet, null, 2)}\n`);

await browser.close();
process.stdout.write(`${JSON.stringify({
  label, settled: settleInfo.settled, documentHeight: settleInfo.documentHeight,
  observedContentWidth: measured.contentWidth, contentWidthMatches: packet.contentWidthMatches,
  reservedGutter: gutter, targetStable, sectionsCaptured: captured.filter((s) => s.path).length,
  sectionsFailed: captured.filter((s) => !s.path).length,
  horizontalOverflow: measured.horizontalOverflow, consoleErrors: consoleMsgs.length,
  failedRequests: failedRequests.length,
})}\n`);
