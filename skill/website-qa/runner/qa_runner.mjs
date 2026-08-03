#!/usr/bin/env node
/*
 * qa_runner.mjs — headless-Chromium QA sweep.
 *
 * One command drives a real browser through a site the way a reviewer would: it
 * loads every breakpoint, hovers things, clicks things open, scrolls to the bottom,
 * tabs through with the keyboard, and audits what it finds at each step.
 *
 * The reason it drives rather than just reads: a resting-state DOM dump can only
 * ever find resting-state bugs. Everything a person reports after the phrase "on
 * hover…", "when you click…", or "as you scroll…" is structurally invisible to it.
 * Playwright's input is trusted input, so framework, builder, and custom JS interaction
 * layer actually run — which is what makes those states auditable at all.
 *
 * Setup (one time):
 *   npm i playwright && npx playwright install chromium
 *   # or use the system Chrome: npm i playwright  (then pass --channel=chrome)
 *
 * Run:
 *   node qa_runner.mjs --url=https://site.com [--url=https://site.com/about] \
 *     [--breakpoints=1920,1512,1280,991,767,479,393] [--out=./qa-run] \
 *     [--channel=chrome] [--wait=800] [--selectors=./vocab.json] \
 *     [--baseline=./qa-run/<ts>] [--no-baseline] [--no-interact] [--no-scroll]
 *
 * Output: <out>/<timestamp>/<host><path>/ with fullpage-<w>.png per breakpoint,
 * state-*.png per opened panel, findings.json and summary.md. Exit code is non-zero
 * if any high-signal defect is found (CI-friendly).
 *
 * Runs are diffed against the previous run in the same --out directory automatically,
 * and the result leads summary.md plus its own regressions.json. That comparison is
 * the only finding class whose cause is known — whatever changed since — so it is
 * reported before anything absolute.
 */
import { chromium, webkit, firefox } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { hoverAudit, openStateAudit, dropdownExclusivity, carouselAudit, scrollAudit, keyboardAudit, ctaClickAudit } from './lib/interact.mjs';
import { linkCheck, loadShiftAudit, engineProbes } from './lib/health.mjs';
import { visionCapture, sectionShots, visionManifest, cropCoverage, visionChecklist, componentSets, NO_SCROLLBAR_CSS } from './lib/vision.mjs';
import { formAudit } from './lib/forms.mjs';
import { DEFAULT_VOCAB, loadVocab } from './lib/vocab.mjs';
import { findBaseline, loadBaseline, diffRuns, renderRegressionSection } from './lib/regress.mjs';
import { crossPageAudit, renderCrossPageSection } from './lib/crosspage.mjs';

const ENGINES = { chromium, webkit, firefox };

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', 'scripts');
const arg = (k, d) => { const hit = process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.slice(k.length + 3)); return hit.length ? hit : (d === undefined ? [] : [d]); };
const one = (k, d) => arg(k, d)[0];
const flag = k => process.argv.includes(`--${k}`);

const urls = arg('url');
if (!urls.length) { console.error('need --url=https://…'); process.exit(2); }
// Include real device widths as well as common CSS breakpoint boundaries. Testing only
// the boundary says nothing about how the page looks in the reviewer's hand.
const widths = one('breakpoints', '1920,1512,1280,991,767,479,430,393').split(',').map(Number);
const outRoot = one('out', './qa-run');
const channel = one('channel', '');
const waitMs = +one('wait', '800');
const doInteract = !flag('no-interact');
const doScroll = !flag('no-scroll');
const doLinks = !flag('no-links');
// Most client QA arrives from Safari on an iPhone, and a good share of it is Safari-
// only (flex/gap rounding, sticky, backdrop-filter, aspect-ratio). Auditing solely in
// Chromium structurally cannot see those. `--engines=chromium,webkit` runs the layout
// pass in both and reports what differs — the diff is the finding, not the raw counts.
const engines = one('engines', 'chromium').split(',').map(s => s.trim()).filter(s => ENGINES[s]);
if (!engines.length) engines.push('chromium');
const vocabFile = one('selectors', '');
// The vision pass exists because measurement is blind to composition: a heading
// colliding with the photo behind it, a row of cards where one is visually heavier,
// an icon that's the wrong metaphor. Those are judgements about an image, so the
// runner's job is to produce images that are actually reviewable — viewport-sized
// tiles at native scale, not a 20 000px fullpage strip nothing can read.
const doVision = !flag('no-vision');
const visionWidths = one('vision-breakpoints', '1512,393').split(',').map(Number).filter(Boolean);
const visionMaxTiles = +one('vision-max-tiles', '14');
// A design spec turns "the sections disagree with each other" into "every section is
// 16px too tight" — the one question self-consistency can never answer. Optional:
// without it the sweep still runs, it just can't name the intended value.
const specFile = one('spec', '');
const designSpec = specFile && existsSync(specFile) ? JSON.parse(readFileSync(specFile, 'utf8')) : null;
/* Compare this run to the last one before comparing it to anything else. A regression —
 * something that worked yesterday and doesn't today — outranks every absolute finding in
 * the report, because it has a known cause: whatever changed in between. Defaults to the
 * newest previous run under --out; --baseline= picks one explicitly. */
const baselineArg = one('baseline', '');
const doBaseline = !flag('no-baseline');
const vocab = loadVocab(vocabFile && existsSync(vocabFile) ? JSON.parse(readFileSync(vocabFile, 'utf8')) : null);
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const S = f => readFileSync(join(SCRIPTS, f), 'utf8');
const LAYOUT = S('audit_layout.js');
// Polish runs at EVERY breakpoint, not once. Half of what it looks for — gutters,
// near-miss wraps, widows — only exists at a particular width, and the notes people
// actually file about them ("can this fit on one line?") are overwhelmingly mobile.
// Running it once at desktop was why the first version of this runner found none.
const PER_BREAKPOINT = { layout: LAYOUT, polish: S('audit_polish.js') };
const ONCE = { content: S('audit_content.js'), a11y_seo: S('audit_a11y_seo.js'),
  consistency: S('audit_consistency.js'), transitions: S('audit_transitions.js'),
  // "computed value has no explanation in the cascade" — the class that costs a long
  // investigation and ends in setting the property explicitly anyway
  cascade: S('audit_cascade.js') };
const run = src => `(0, eval)(${JSON.stringify(src)})`;   // indirect eval → returns trailing IIFE value

/* Put the page in the state a reader is actually looking at before measuring it: webfonts
 * swapped in, lazy images requested, entrance animations run. Auditing a page 800ms after
 * `goto` measures a page mid-construction, and everything downstream inherits that —
 * images with no intrinsic size yet, elements still at height 0, text not yet reflowed for
 * its real typeface. It is also the only way an engine-to-engine diff means anything: the
 * two engines have different lazy-load thresholds, so an unscrolled comparison reports
 * their loading strategies rather than their rendering. Same routine, both engines. */
const settlePage = async (page, extraMs = 0) => {
  await page.evaluate(async () => {
    try { await document.fonts.ready; } catch (e) {}
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
    }
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 250));
  }).catch(() => {});
  if (extraMs) await page.waitForTimeout(extraMs);
};
const DESIGN_SPEC_SRC = S('audit_design_spec.js');

/* Keep a classic scrollbar out of the layout on EVERY page load, before any audit measures
 * anything. Where a browser draws one, `innerWidth` counts it but the body does not fill
 * it, so a genuinely full-bleed element measures ~15px narrow: that produced a phantom
 * right-edge gutter at 393px and mobile images reading ~4% under spec, and both were
 * reported as findings. Real phones and macOS use overlay scrollbars and lose no layout
 * width, and a Figma frame has no scrollbar at all, so a suppressed scrollbar is the state
 * the design was drawn for.
 *
 * Whether it happens at all is environment-dependent — on macOS with Playwright 1.62's
 * bundled Chromium and WebKit the gutter measures 0px in both headless modes, so this is a
 * guard rather than a live fix here. It is not idle: Linux CI, `--channel=chrome` on
 * Windows and older Chromium builds do take the 15px, and a measurement path that silently
 * changes answer depending on which machine ran it is the thing worth eliminating.
 * `viewportIntegrity` below reports the residual gutter per breakpoint so this is measured
 * on every run instead of assumed.
 *
 * As an init script it survives every goto in every phase, which is the point: suppression
 * used to hold for screenshots only, so the tile and the measurement disagreed about the
 * width of the viewport they were describing. */
const seedScrollbar = async page => {
  await page.addInitScript(css => {
    const add = () => {
      if (document.getElementById('__qa-no-scrollbar')) return;
      const s = document.createElement('style'); s.id = '__qa-no-scrollbar'; s.textContent = css;
      (document.head || document.documentElement).appendChild(s);
    };
    add();                     // documentElement already exists this early
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', add, { once: true });   // in case head was not ready
  }, NO_SCROLLBAR_CSS);
};
const seedVocab = async page => { await page.addInitScript(v => { window.__QA_VOCAB = v; }, vocab);
  if (designSpec) await page.addInitScript(s => { window.__QA_SPEC = s; }, designSpec);
  await seedScrollbar(page); };

const browser = await ENGINES[engines[0]].launch(channel ? { channel } : {});
const report = { generatedAt: ts, vocabFile: vocabFile || '(defaults)', engines, urls: [] };

for (const url of urls) {
  const u = new URL(url);
  const slug = (u.host + u.pathname).replace(/[^\w.-]+/g, '_').replace(/_+$/, '');
  const dir = join(outRoot, ts, slug); mkdirSync(dir, { recursive: true });
  const page = await browser.newPage();
  await seedVocab(page);
  const consoleMsgs = [], pageErrors = [], badResponses = [], failedReqs = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 200) }); });
  page.on('pageerror', e => pageErrors.push(String(e).slice(0, 200)));
  /* Attribute every 4xx to an ORIGIN, because an unattributed count is not a
   * finding. One real sweep reported 66 4xx and ~139 console errors that were
   * 100% bot-protection and feedback-widget noise and zero real defects — the
   * numbers were true and the conclusion was worthless. Bot-protection widgets
   * in particular poll continuously and 401 by design. First-party failures are
   * the audit; third-party ones are the environment, and they must be countable
   * separately rather than summed into one alarming total. */
  const pageOrigin = (() => { try { return new URL(url).origin; } catch { return null; } })();
  page.on('response', r => {
    if (r.status() < 400) return;
    const raw = r.url();
    let thirdParty = false;
    try { thirdParty = pageOrigin != null && new URL(raw).origin !== pageOrigin; } catch { thirdParty = false; }
    badResponses.push({ status: r.status(), url: raw.slice(0, 120), thirdParty });
  });
  page.on('requestfailed', r => failedReqs.push({ url: r.url().slice(0, 120), err: r.failure()?.errorText }));

  const entry = { url, dir, byBreakpoint: {}, once: {}, interactions: {} };

  // ── per-breakpoint static audit ────────────────────────────────────────────
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    /* networkidle NEVER ARRIVES on a site with continuous background polling —
     * bot protection, analytics heartbeats, chat widgets. Recording that timeout
     * as a page error made a perfectly healthy page read as "site is down", which
     * is how a sweep produced a false broken-carousel finding. Only report it when
     * the document genuinely failed to load. */
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async e => {
      const loaded = await page.evaluate(() => document.readyState === 'complete' || document.readyState === 'interactive').catch(() => false);
      if (!loaded) pageErrors.push('goto: ' + e.message);
      else entry.once.networkNeverIdle = true;
    });
    await page.waitForTimeout(waitMs);
    await settlePage(page, 400);
    const bp = entry.byBreakpoint[w] = {};
    /* Prove the viewport is the width we asked for before trusting anything measured
     * against it. A non-zero gutter means the scrollbar suppression did not take on this
     * platform, and every full-bleed width in this breakpoint's audit is short by exactly
     * that much — which reads as a right-edge gap that does not exist. Measured, not
     * assumed, because it is environment-dependent. */
    try {
      bp.viewportIntegrity = await page.evaluate(reqW => {
        const gutter = innerWidth - document.documentElement.clientWidth;
        return { requested: reqW, innerWidth, clientWidth: document.documentElement.clientWidth, scrollbarGutter: gutter,
          ok: gutter === 0 && innerWidth === reqW,
          note: gutter ? `scrollbar takes ${gutter}px of layout width — full-bleed elements measure ${gutter}px narrow at this breakpoint` : undefined };
      }, w);
    } catch (e) { /* non-fatal */ }
    try { Object.assign(bp, await page.evaluate(run(PER_BREAKPOINT.layout))); }
    catch (e) { bp.error = e.message; }
    try { bp.polish = await page.evaluate(run(PER_BREAKPOINT.polish)); }
    catch (e) { bp.polish = { error: e.message }; }
    // a carousel's controls are the thing most likely to vanish at a small width,
    // so this one interaction check is worth running at every breakpoint
    if (doInteract) {
      try { entry.byBreakpoint[w].carousels = await carouselAudit(page, { observeMs: 2500, vocab }); }
      catch (e) { /* non-fatal */ }
    }
    await page.screenshot({ path: join(dir, `fullpage-${w}.png`), fullPage: true }).catch(() => {});
  }

  // ── breakpoint-independent audits, once at a mid-desktop width ─────────────
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(waitMs);
  for (const [name, src] of Object.entries(ONCE)) {
    try { entry.once[name] = await page.evaluate(run(src)); }
    catch (e) { entry.once[name] = { error: e.message }; }
  }

  // ── interaction phase (desktop) ────────────────────────────────────────────
  if (doInteract) {
    const shots = join(dir, 'states'); mkdirSync(shots, { recursive: true });
    const step = async (name, fn) => { try { entry.interactions[name] = await fn(); }
      catch (e) { entry.interactions[name] = { error: String(e.message || e).slice(0, 120) }; } };
    await step('hover', () => hoverAudit(page, { vocab }));
    await step('openStates', () => openStateAudit(page, { layoutSrc: LAYOUT, shotDir: shots, vocab }));
    await step('navExclusivity', () => dropdownExclusivity(page, { vocab }));
    // reloads the page once per button, so it goes after the cheap passes
    if (!flag('no-cta-clicks')) await step('ctaClicks', () => ctaClickAudit(page, { url, vocab }));
    await step('keyboard', () => keyboardAudit(page));
    // reload so the scroll pass starts from a clean, un-poked page
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(waitMs);
    if (doScroll) await step('scroll', () => scrollAudit(page, { vocab }));
    await page.screenshot({ path: join(dir, 'after-scroll-1512.png'), fullPage: false }).catch(() => {});

    // ── interaction phase (mobile) — different code path, different bugs ─────
    await page.setViewportSize({ width: 393, height: 852 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(waitMs);
    entry.interactions.mobile = {};
    const mstep = async (name, fn) => { try { entry.interactions.mobile[name] = await fn(); }
      catch (e) { entry.interactions.mobile[name] = { error: String(e.message || e).slice(0, 120) }; } };
    const mshots = join(dir, 'states-mobile'); mkdirSync(mshots, { recursive: true });
    await mstep('openStates', () => openStateAudit(page, { layoutSrc: LAYOUT, shotDir: mshots, prefix: 'm-', vocab }));
    if (doScroll) await mstep('scroll', () => scrollAudit(page, { vocab }));
  }

  // ── design spec comparison, at the spec's own frame width ──────────────────
  if (designSpec) {
    const fw = designSpec.frameWidth || 1512;
    await page.setViewportSize({ width: fw, height: 982 });
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(waitMs);
    try { entry.design = await page.evaluate(run(DESIGN_SPEC_SRC)); }
    catch (e) { entry.design = { error: String(e.message || e).slice(0, 120) }; }
    await page.screenshot({ path: join(dir, `design-${fw}.png`), fullPage: true }).catch(() => {});
  }

  // ── vision pass: images built to be looked at ──────────────────────────────
  if (doVision) {
    entry.vision = {};
    for (const w of visionWidths) {
      const vdir = join(dir, 'vision', String(w));
      await page.setViewportSize({ width: w, height: w <= 480 ? 852 : 982 });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(waitMs);
      try {
        const v = await visionCapture(page, { dir: vdir, width: w, maxTiles: visionMaxTiles });
        v.sections = await sectionShots(page, { dir: join(vdir, 'sections') });
        // crops don't tile the page; say where the holes are so a gap is never read as an absence
        v.coverage = cropCoverage(v.sections, v.docHeight);
        // one crop per instance of every repeated component + the anomalies computable in the DOM
        v.sets = await componentSets(page, { dir: join(vdir, 'sets') });
        v.dir = join('vision', String(w));
        entry.vision[w] = v;
      } catch (e) { entry.vision[w] = { error: String(e.message || e).slice(0, 160) }; }
    }
  }

  // ── network + load-time health ─────────────────────────────────────────────
  await page.setViewportSize({ width: 1512, height: 982 });
  if (doLinks) {
    try { entry.links = await linkCheck(page, { includeExternal: flag('external-links') }); }
    catch (e) { entry.links = { error: String(e.message || e).slice(0, 120) }; }
  }
  /* Forms: structure and validation behaviour, never a submission. On a lead-generation site
   * this is the most expensive component on the page and was previously the only one entirely
   * unaudited, because "don't submit the client's form" had been read as "don't test it". */
  if (!flag('no-forms')) {
    try { entry.forms = await formAudit(page, { testBlurValidation: !flag('no-form-validation') }); }
    catch (e) { entry.forms = { error: String(e.message || e).slice(0, 120) }; }
  }
  try { entry.engineProbes = { [engines[0]]: await engineProbes(page) }; } catch (e) {}
  try { entry.loadShift = await loadShiftAudit(page, url); }
  catch (e) { entry.loadShift = { error: String(e.message || e).slice(0, 120) }; }

  // ── cross-breakpoint: does the type scale at all? ──────────────────────────
  // "Reduce the text size here" is almost always a mobile note, and almost always
  // the same root cause: a heading with a fixed px size that never scales down. One
  // comparison across the widths we already visited catches the whole class.
  entry.typeScale = crossBreakpointType(entry.byBreakpoint, widths);

  entry.console = { errors: consoleMsgs.filter(m => m.type === 'error'), warnings: consoleMsgs.filter(m => m.type === 'warning'), pageErrors };
  entry.network = { badResponses, failedRequests: failedReqs };
  report.urls.push(entry);
  await page.close();
}
await browser.close();

/* ── SECOND-ENGINE PASS ────────────────────────────────────────────────────────
 * A reduced sweep (layout + polish per breakpoint, no interactions) in each extra
 * engine, then a diff against the primary. Reporting WebKit's raw findings would
 * just double the noise; what's actionable is the delta — an element that overflows
 * in Safari and not in Chrome is a browser bug, and those are the ones that come
 * back from a client on an iPhone. */
for (const eng of engines.slice(1)) {
  const b2 = await ENGINES[eng].launch({});
  for (const entry of report.urls) {
    const p2 = await b2.newPage();
    await p2.addInitScript(v => { window.__QA_VOCAB = v; }, vocab);
    // same viewport treatment as the primary engine, or the engine diff reports the two
    // engines' scrollbar behaviour rather than their rendering
    await seedScrollbar(p2);
    const byBp = {};
    for (const w of widths) {
      await p2.setViewportSize({ width: w, height: 900 });
      await p2.goto(entry.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
      await p2.waitForTimeout(waitMs);
      /* Scroll the page before measuring the second engine. WebKit's lazy-load threshold is
       * one viewport (relative); Chromium's is a fixed ~1250px — so a plain load leaves more
       * images unresolved in WebKit, and their empty boxes register as "4 collapsed
       * elements". That diff was reported on every single run of this sweep and was never
       * real. Scrolling first puts both engines in the same state, which is the only state in
       * which a difference means anything. */
      await settlePage(p2, 400);
      const bp = byBp[w] = {};
      try { Object.assign(bp, await p2.evaluate(run(PER_BREAKPOINT.layout))); } catch (e) { bp.error = e.message; }
      try { bp.polish = await p2.evaluate(run(PER_BREAKPOINT.polish)); } catch (e) { bp.polish = { error: e.message }; }
    }
    // Same widths, same scroll offsets, other engine — so the two tile sets can be
    // read side by side. The numeric diff catches count changes; a lot of real Safari
    // bugs render "successfully" with identical counts and simply look wrong.
    const eVision = {};
    if (doVision) {
      for (const w of visionWidths) {
        await p2.setViewportSize({ width: w, height: w <= 480 ? 852 : 982 });
        await p2.goto(entry.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await p2.waitForTimeout(waitMs);
        try { eVision[w] = await visionCapture(p2, { dir: join(entry.dir, 'vision', `${w}-${eng}`), width: w, prefix: `${eng}-`, maxTiles: visionMaxTiles }); }
        catch (e) { eVision[w] = { error: String(e.message || e).slice(0, 160) }; }
        if (eVision[w]) eVision[w].dir = join('vision', `${w}-${eng}`);
      }
    }
    let probes = null; try { probes = await engineProbes(p2); } catch (e) {}
    if (probes) (entry.engineProbes = entry.engineProbes || {})[eng] = probes;
    entry.engines = entry.engines || {};
    entry.engines[eng] = { byBreakpoint: byBp, vision: eVision,
      diffVsPrimary: diffEngines(entry.byBreakpoint, byBp, widths, engines[0], eng) };
    await p2.close();
  }
  await b2.close();
}

/* Which defect counts differ between engines, per breakpoint. Counts, not contents:
   selectors and text are identical across engines, so a changed count is the signal
   and the detail lives in each engine's own findings block. */
function diffEngines(a, b, widths, nameA, nameB) {
  const metrics = {
    overflow: L => L.horizontalOverflow?.offenders?.length || 0,
    scrollsSideways: L => (L.horizontalOverflow?.pageScrollsSideways ? 1 : 0),
    collapsed: L => L.collapsedElements?.length || 0,
    wrapping: L => L.unintendedWrapping?.length || 0,
    clippedText: L => L.clippedText?.length || 0,
    gutterOutliers: L => L.polish?.containerGutters?.outliers?.length || 0,
    wrappedGroups: L => L.polish?.wrappedGroups?.length || 0,
    missingGaps: L => L.polish?.missingGaps?.length || 0,
    // the headline cross-browser check: an SVG that sizes correctly in one engine
    // and blows up in another is the single most common Safari-only layout bug
    oversizedSvgs: L => L.polish?.svg?.oversized?.length || 0,
    widestSvgPx: L => Math.round(Math.max(0, ...(L.polish?.svg?.oversized || []).map(s =>
      parseInt(String(s.rendered).split('x')[0], 10) || 0)))
  };
  const out = [];
  for (const w of widths) {
    const A = a[w], B = b[w]; if (!A || !B || A.error || B.error) continue;
    for (const [name, f] of Object.entries(metrics)) {
      const va = f(A), vb = f(B);
      if (va !== vb) out.push({ breakpoint: w, metric: name, [nameA]: va, [nameB]: vb,
        hint: `${name} differs between ${nameA} and ${nameB} at ${w}px — likely a browser-specific rendering bug` });
    }
  }
  return out;
}

/* Headings that render at the same size on the widest and narrowest viewport are
   almost certainly missing a responsive size — flag anything big enough to matter. */
function crossBreakpointType(byBp, widths) {
  const wide = Math.max(...widths), narrow = Math.min(...widths);
  const a = byBp[wide], b = byBp[narrow];
  if (!a || !b || a.error || b.error || !a.headingSizes || !b.headingSizes) return null;
  // match on rendered text, not selector — classes can differ between breakpoints
  const key = h => h.tag + '|' + h.text;
  const narrowBy = new Map(b.headingSizes.map(h => [key(h), h]));
  const unscaled = a.headingSizes.filter(h => {
    const m = narrowBy.get(key(h));
    return m && m.size === h.size && parseFloat(h.size) >= 28;
  }).map(h => ({ el: h.el, text: h.text, size: h.size,
    hint: `renders at ${h.size} on both ${wide}px and ${narrow}px — no responsive type scale` }));
  return { comparedAt: [wide, narrow], headingsCompared: a.headingSizes.length, unscaled };
}

const dir = join(outRoot, ts);
/* Defects that only exist between pages — a collection template's single shared <title>
 * or canonical across every item. Invisible to a per-URL sweep by construction, so it is
 * computed over the whole report. Says so explicitly when given only one URL. */
try { report.crossPage = crossPageAudit(report); } catch (e) { report.crossPage = { error: String(e.message || e) }; }
writeFileSync(join(dir, 'findings.json'), JSON.stringify(report, null, 2));
if (doVision) {
  const manifests = report.urls.map(e => ({ url: e.url, dir: e.dir, images: visionManifest(e) }));
  writeFileSync(join(dir, 'vision-manifest.json'), JSON.stringify(manifests, null, 2));
  /* The checklist is the vision pass made auditable: the same ordered questions against every
   * image, answered as data. Without it a review reports "what I noticed", which is neither
   * repeatable nor distinguishable from not having looked. */
  writeFileSync(join(dir, 'vision-checklist.json'), JSON.stringify(
    manifests.map(m => {
      const e = report.urls.find(x => x.url === m.url) || {};
      const widths = Object.keys(e.vision || {});
      const sets = widths.length ? (e.vision[widths[0]].sets || []) : [];
      return { url: m.url, ...visionChecklist(m.images, { sets }) };
    }), null, 2));
}

/* ── regression diff against the previous run ──────────────────────────────────
 * Computed after findings.json is written so the baseline search can exclude this
 * run by name, and so a crash in the diff can never cost the run its data. */
let regressionDiff = null;
if (doBaseline) {
  try {
    const base = loadBaseline(baselineArg || findBaseline(outRoot, ts));
    regressionDiff = diffRuns(base, report);
    if (regressionDiff) writeFileSync(join(dir, 'regressions.json'), JSON.stringify(regressionDiff, null, 2));
  } catch (e) { regressionDiff = null; console.error('baseline diff skipped: ' + (e.message || e)); }
}

// ── summary ──────────────────────────────────────────────────────────────────
let high = 0; const lines = [`# QA sweep — ${ts}`, ''];
/* The regression section goes FIRST, above the legend and every absolute finding. A
 * 4px padding delta has always been wrong and can wait; a thumbnail that rendered on
 * the last run and doesn't now just broke, and the cause is whatever changed since. */
if (regressionDiff) {
  lines.push(...renderRegressionSection(regressionDiff));
  if (regressionDiff.totals?.regressions) high++;
}
/* Everything in this report is one of three things, and conflating them is what makes a
 * reviewer stop trusting it:
 *   MEASURED  — a number read off the page (a ratio, a width, a 404 status). Trust it.
 *   OBSERVED  — a behaviour actually exercised (a click, a toggle, a scroll). Trust it.
 *   SUSPECTED — a heuristic that pattern-matches a defect but has not been confirmed.
 * A suspicion printed in the same voice as a measurement is how three fabricated findings
 * end up standing next to eleven real ones. The header says so, in the file, every run. */
lines.push('> **MEASURED** = read off the page · **OBSERVED** = exercised in a browser · ' +
  '**SUSPECTED** = heuristic, verify before reporting to anyone.', '',
  '> Anything marked SUSPECTED or "unverifiable" must be confirmed on a screenshot or by ' +
  'interaction before it goes in a client-facing list.', '');
const bullet = (label, n, isHigh) => { if (!n) return; if (isHigh) high++; lines.push(`- ${label}: ${n}`); };

/* Cross-page findings sit above the per-URL detail because they are properties of the SET,
 * and reading them under one arbitrary URL's heading would misattribute them. */
if (report.crossPage && !report.crossPage.error) {
  lines.push(...renderCrossPageSection(report.crossPage));
  if (report.crossPage.findings?.some(f => f.severity === 'high')) high++;
  lines.push('');
}

for (const e of report.urls) {
  lines.push(`## ${e.url}`, '', '### Layout by breakpoint');
  for (const w of widths) {
    const L = e.byBreakpoint[w]; if (!L || L.error) { lines.push(`- ${w}px: (audit error)`); continue; }
    const bits = [];
    /* Say so loudly when the viewport isn't the width that was asked for — every width
     * measured at this breakpoint is off by the gutter, so edge-gap and image-size
     * findings here are suspect rather than wrong. */
    if (L.viewportIntegrity && !L.viewportIntegrity.ok)
      bits.push(`⚠︎ viewport ${L.viewportIntegrity.innerWidth}px wide, body fills ` +
        `${L.viewportIntegrity.clientWidth}px — ${L.viewportIntegrity.note || 'scrollbar took layout width'}; ` +
        'treat right-edge and full-bleed measurements at this breakpoint as SUSPECTED');
    if (L.horizontalOverflow?.pageScrollsSideways) { bits.push('⚠︎ page scrolls sideways'); high++; }
    if (L.horizontalOverflow?.offenders?.length) bits.push(`${L.horizontalOverflow.offenders.length} overflow`);
    if (L.horizontalOverflow?.cutOffButContained?.length)
      bits.push(`${L.horizontalOverflow.cutOffButContained.length} cut off but contained (SUSPECTED — no sideways scroll)`);
    if (L.collapsedElements?.length) { bits.push(`${L.collapsedElements.length} collapsed`); high++; }
    if (L.unintendedWrapping?.length) bits.push(`${L.unintendedWrapping.length} wrapping`);
    if (L.lowContrast?.length) bits.push(`${L.lowContrast.length} low-contrast`);
    // not a defect count — a "CSS can't answer this, look at it" count
    if (L.contrastUnverifiable?.length) bits.push(`${L.contrastUnverifiable.length} text-on-imagery (contrast unverifiable)`);
    if (L.imageIssues?.length) bits.push(`${L.imageIssues.length} image`);
    // a sized media box holding nothing — the case every image check is blind to
    if (L.emptyMediaSlots?.length) { bits.push(`⚠︎ ${L.emptyMediaSlots.length} EMPTY media slot(s)`); high++; }
    if (L.carousels?.missingArrows?.length) { bits.push(`${L.carousels.missingArrows.length} carousel w/o arrows`); high++; }
    if (L.carousels?.collapsedArrows?.length) { bits.push(`${L.carousels.collapsedArrows.length} 0px arrows`); high++; }
    // informational, not a defect — controls switched off by a media query
    if (L.carousels?.controlsHiddenByDesign?.length) bits.push(`${L.carousels.controlsHiddenByDesign.length} swipe-only carousel`);
    const P = L.polish || {};
    if (P.containerGutters?.outliers?.length) bits.push(`${P.containerGutters.outliers.length} gutter outliers`);
    if (P.nearMissWraps?.length) bits.push(`${P.nearMissWraps.length} near-miss wraps`);
    if (P.orphanHeadings?.length) bits.push(`${P.orphanHeadings.length} widows`);
    if (P.wrappedGroups?.length) bits.push(`${P.wrappedGroups.length} wrapped button groups`);
    lines.push(`- ${w}px: ${bits.join(', ') || 'clean'}`);
  }

  // width-independent polish findings, reported once from the widest breakpoint
  const p = e.byBreakpoint[Math.max(...widths)]?.polish || {};
  lines.push('', '### Polish (what a reviewer notices first)');
  if (p.favicon && p.favicon.flag !== 'ok') { lines.push(`- favicon: ${p.favicon.flag}`); high++; }
  bullet('unlinked phone numbers', p.unlinkedPhones?.length, true);
  bullet('unlinked emails', p.unlinkedEmails?.length);
  // Clicking is ground truth. When the click phase ran, the DOM-level suspicion list is
  // strictly worse information about the same question — printing both invites a reviewer
  // to chase four suspects when three real answers are two lines below.
  if (e.interactions?.ctaClicks && !e.interactions.ctaClicks.error) {
    if (p.falseAffordance?.length) lines.push(
      `- (${p.falseAffordance.length} elements look clickable in the DOM — superseded by the click test below)`);
  } else bullet('looks clickable but is not (SUSPECTED — not click-tested)', p.falseAffordance?.length);
  bullet('clickable but no pointer cursor', p.missingAffordance?.length);
  bullet('text the user cannot select', p.unselectableText?.length);
  bullet('flex/grid groups with no gap', p.missingGaps?.length);
  bullet('CMS empty-state visible', p.cmsEmptyStates?.emptyLists?.length, true);
  bullet('CMS fields bound but empty', p.cmsEmptyStates?.emptyBindings?.length);
  bullet('upscaled/pixelated images (judged at 2x/3x, not the harness\'s 1x)', p.upscaledImages?.length);
  (p.upscaledImages || []).slice(0, 4).forEach(u =>
    lines.push(`  - ${u.img}: largest available ${u.largestAvailable}px (${u.source}) in a ${u.cssWidth}px slot, needs ${u.needsForTarget} — ${u.shortfall} short`));
  bullet('controls that cannot be clicked at all (fully covered)',
    p.hitTestBlocked?.filter(h => h.severity === 'unclickable').length, true);
  bullet('controls partially covered by another element',
    p.hitTestBlocked?.filter(h => h.severity !== 'unclickable').length);
  bullet('elements not honouring their declared aspect-ratio', p.aspectRatioNotHonoured?.length);
  bullet('inputs under 16px (iOS zooms the page on tap)', p.inputsCausingIosZoom?.length);
  bullet('media relying on a parent to clip its rounded corners', p.mediaClippedByParentRadius?.length);
  (p.viewport?.hazards || []).forEach(h => lines.push(`- mobile viewport hazard: ${h.hazard}`));
  const ch = p.viewport?.compositingHazards || {};
  bullet('-webkit-backdrop-filter without the unprefixed property (traps fixed children in Safari)', ch.prefixOnlyBackdrop?.length, true);
  bullet('mix-blend-mode inside a scroll/clip container (does not blend in Safari)', ch.blendInScroller?.length, true);
  bullet('large blur() on a fixed element (can stall iOS first paint ~20s)', ch.heavyFixedBlur?.length, true);
  bullet('SVGs rendering oversized', p.svg?.oversized?.length, true);
  bullet('SVGs with no intrinsic size (Safari blow-up risk)', p.svg?.noIntrinsicSize?.length);
  bullet('SVGs stretched vs their viewBox', p.svg?.aspectMismatch?.length);
  bullet('lists rendering duplicate items', p.duplicateListItems?.length, true);
  if (p.heroFill && p.heroFill.flag !== 'ok') lines.push(`- hero: ${p.heroFill.heightPct}% of viewport — ${p.heroFill.flag}`);
  bullet('groups sharing one icon (placeholder?)', p.duplicateIcons?.length, true);
  bullet('dev furniture visible', (p.devFurniture?.widgets?.length || 0) + (p.devFurniture?.devScripts?.length || 0), true);
  bullet('stray fixed boxes', p.devFurniture?.strayFixedBoxes?.length);
  bullet('nav/content parity gaps', p.navContentParity?.length, true);
  const cpi = p.currentPageIndication;
  if (cpi && cpi.hint) lines.push(`- current-page indication: ${cpi.hint} (${cpi.navLinksToThisPage} nav link(s) point here)`);
  bullet('sections with no motion', p.motion?.sectionsWithNoMotion?.length);
  // gutter drift is worth calling out with its numbers — it reads as vague otherwise
  const g = p.containerGutters;
  if (g?.distinctGutters?.length > 1) lines.push(
    `- container gutters at ${g.viewport}px: dominant ${g.dominantLeftGutter}px, ` +
    `also ${g.distinctGutters.filter(d => d.px !== g.dominantLeftGutter).map(d => d.px + 'px').join(', ')}`);

  const I = e.interactions || {};
  lines.push('', '### Interaction (hover / click / scroll / keyboard)');
  bullet('interactive elements with no hover feedback', I.hover?.noHoverFeedback?.length);
  bullet('hover changes that snap (no transition)', I.hover?.hoverSnaps?.length);
  // the loudest line in the report when it fires: a CTA that looks perfect and does nothing
  if (I.ctaClicks && !I.ctaClicks.error) {
    const C = I.ctaClicks;
    if (C.dead?.length) { high++;
      lines.push(`- **CTAs that do nothing when clicked: ${C.dead.length} of ${C.tested} tested**`);
      C.dead.forEach(d => lines.push(`  - "${d.text}" (${d.el})`));
      if (C.deadDespiteLookingWired?.length) lines.push(
        `  - ${C.deadDespiteLookingWired.length} of these look wired in the DOM — only the click reveals them`);
    } else if (C.tested) lines.push(`- all ${C.tested} CTAs tested respond to a click`);
    if (C.truncated) lines.push(`  (${C.truncated} — remaining CTAs were not clicked)`);
  }
  bullet('toggles that reveal nothing', I.openStates?.deadToggles?.length, true);
  bullet('open panels off-screen', I.openStates?.panelsOffScreen?.length, true);
  bullet('open panels painted behind other content', I.openStates?.panelsOccluded?.length, true);
  bullet('placeholder copy inside panels', I.openStates?.panelsWithPlaceholder?.length, true);
  bullet('layout defects inside open panels', I.openStates?.panelLayoutIssues?.length, true);
  bullet('dropdowns that stay open when you move away', I.navExclusivity?.staysOpen?.length, true);
  bullet('reveal animations stuck invisible', I.scroll?.revealsStuckInvisible?.length, true);
  if (I.scroll?.invisibleAfterScroll?.length) { high++;
    lines.push(`- **text that never becomes visible: ${I.scroll.invisibleAfterScroll.length}** (occupies space, opacity 0 after a full scroll)`);
    I.scroll.invisibleAfterScroll.slice(0, 6).forEach(x => lines.push(`  - "${x.text}" (${x.el}) at y=${x.top}`)); }
  bullet('lazy images never loaded', I.scroll?.lazyImagesBroken?.length, true);
  bullet('overflow only after scrolling', I.scroll?.overflowsOnlyAfterScroll ? 1 : 0, true);
  bullet('controls with no visible focus ring', I.keyboard?.noVisibleFocusRing?.length);
  bullet('tabbable but invisible controls', I.keyboard?.focusableButHidden?.length, true);
  if (I.mobile) {
    bullet('mobile: toggles that reveal nothing', I.mobile.openStates?.deadToggles?.length, true);
    bullet('mobile: open panels off-screen', I.mobile.openStates?.panelsOffScreen?.length, true);
    bullet('mobile: reveals stuck invisible', I.mobile.scroll?.revealsStuckInvisible?.length, true);
  }

  if (e.design && !e.design.error) {
    const D = e.design;
    lines.push('', `### Design vs spec — ${D.spec.name} @ ${D.spec.frameWidth}px`);
    lines.push(`- ${D.spec.comparison}`);
    if (D.container) { lines.push(`- container: ${D.container.verdict}`); if (!D.container.matches) high++; }
    if (D.sectionFindings?.length) { high++;
      D.sectionFindings.forEach(f => f.diffs.forEach(d =>
        lines.push(`- ${f.section}: ${d.prop} — design ${d.figma}, live ${d.live}` +
          (d.offBy != null ? ` (${d.offBy > 0 ? '+' : ''}${d.offBy})` : '')))); }
    if (D.typeFindings?.length) { high++;
      D.typeFindings.slice(0, 15).forEach(f => lines.push(
        `- "${f.text}": ` + f.diffs.map(d => `${d.prop} design ${d.figma} vs live ${d.live}`).join('; ') +
        (f.ambiguous ? `  ⚠︎ AMBIGUOUS — this copy appears in ${f.ambiguous} places; may be the wrong element` : ''))); }
    if (!D.totalDiffs) lines.push('- everything in the spec matches');
    lines.push(`- coverage: ${D.coverage.matched}/${D.coverage.specTextNodes} spec text nodes found on the page` +
      (D.coverage.unmatched.length ? ` (${D.coverage.unmatched.length} not found — copy changed or section missing)` : ''));
  }

  // The runner cannot review these; it can only make sure they exist and are legible.
  // Listing them in reading order is the point — a vision pass that skips around is
  // how you miss that section 4 repeats section 2's layout.
  if (e.vision) {
    lines.push('', '### Vision pass — open these images and review them');
    lines.push(`- protocol: references/vision-qa.md (do not skip it — an unstructured look finds ~half of what a pass-per-question look finds)`);
    for (const w of Object.keys(e.vision)) {
      const v = e.vision[w];
      if (!v || v.error) { lines.push(`- ${w}px: capture failed — ${v?.error}`); continue; }
      const secOk = (v.sections || []).filter(s => s.file).length, secBad = (v.sections || []).length - secOk;
      lines.push(`- ${w}px: ${v.tiles.length} tiles + ${secOk} section crops in \`${v.dir}/\` (page ${v.docHeight}px)` +
        (secBad ? ` — ⚠︎ ${secBad} section crop(s) FAILED, those sections have no image` : ''));
      if (v.truncatedAt) lines.push(`  - ⚠︎ capture stopped at ${v.truncatedAt} — the tail of the page was NOT reviewed`);
      if (v.overlaysHidden?.length) lines.push(`  - overlays hidden for the shots (environment, not defects): ${v.overlaysHidden.join(', ')}`);
      const unsettled = (v.tiles || []).filter(t => t.settled === false);
      if (unsettled.length) lines.push(`  - ⚠︎ ${unsettled.length} tile(s) captured MID-ANIMATION and are unreviewable: ` +
        `${unsettled.map(t => t.file).join(', ')} — do not conclude anything is missing or low-contrast from these`);
      /* The odd-one-out pass. Everything a reviewer finds by comparing a card to its siblings
       * lives here, and half of it is computable without eyes at all. */
      for (const s of (v.sets || [])) {
        if (!s.anomalies.length) continue;
        lines.push(`  - set \`.${s.name}\` × ${s.count} — crops in \`${v.dir}/sets/${s.dir}/\``);
        s.anomalies.forEach(a => {
          const det = Array.isArray(a.detail) ? a.detail.join('; ') : a.detail;
          lines.push(`    - ${a.confidence.toUpperCase()} · ${a.kind}: ${det}`);
          if (a.kind === 'duplicateImageAcrossInstances' || a.kind === 'instanceMissingImage') high++;
        });
      }
      const cov = v.coverage;
      if (cov) {
        lines.push(`  - crop coverage ${cov.coveragePct}% of the page`);
        cov.gaps.forEach(g => lines.push(`    - ⚠︎ NO crop covers y=${g.from}–${g.to} (${g.height}px, before \`${g.before}\`) — ` +
          'anything here is invisible to a crop review; check the tiles or the DOM before calling it missing'));
        cov.truncated.forEach(t => lines.push(`    - \`${t.section}\` captured ${t.captured} only`));
      }
    }
    lines.push('- **answer `vision-checklist.json`** — tiered questions per image, recorded as data. ' +
      'Work question-first across the whole set, not image-by-image. Every "finding" must carry an ' +
      '`assert` that measures the claim; run them through `runVisionProbes()` and report only what ' +
      'comes back CONFIRMED. An unanswered question is a coverage gap, and "nothing found" is only ' +
      'a claim once the sheet is full.');
    for (const [eng, data] of Object.entries(e.engines || {})) {
      for (const [w, v] of Object.entries(data.vision || {})) {
        if (v && !v.error) lines.push(`- ${w}px in ${eng}: ${v.tiles.length} tiles in \`${v.dir}/\` — compare tile-for-tile against ${engines[0]} at the same scroll offsets`);
      }
    }
  }

  lines.push('', '### Content, a11y, SEO, runtime');
  const c = e.once.content || {};
  bullet('placeholder text', c.placeholderText?.length, true);
  (c.defaultRichText || []).forEach(rt => {
    high++;
    lines.push(`- **⚠︎ WEBFLOW'S DEFAULT RICH-TEXT CONTENT IS PUBLISHED** in \`${rt.el}\` — ${rt.marks.join('; ')}`);
    if (rt.nestedHeadings?.allSameSizeAsBody)
      lines.push(`  - and its nested h1–h6 all compute to the body size (${rt.nestedHeadings.distinctSizes.join(', ')})` +
        `${rt.nestedHeadings.inlineDisplay ? `, ${rt.nestedHeadings.inlineDisplay} of them \`display:inline\`` : ''}` +
        ' — rich-text headings are unstyled, so this section has no hierarchy even after the copy is replaced');
  });
  bullet('dead links', c.deadLinks?.length, true);
  bullet('staging links', c.stagingLinks?.length, true);
  const widgets = e.once.a11y_seo?.accessibility?.customWidgetsWithoutSemantics || [];
  if (widgets.length) {
    lines.push(`- custom widgets with no semantics: ${widgets.length}`);
    widgets.slice(0, 4).forEach(w => lines.push(`  - \`${w.widget}\` (${w.items} items, ${w.confidence.toUpperCase()}): ${w.missing[0]}`));
  }
  if (e.once.a11y_seo?.structuredData?.flag === 'INVALID') { lines.push('- structured data INVALID'); high++; }
  /* Cascade disagreements. Printed with the consequence rather than the property name,
   * because "h1 computes display:inline" reads as pedantry and "headings share a line with
   * the text after them" reads as the bug it is. */
  const cas = e.once.cascade || {};
  (cas.blockTagsComputingInline || []).slice(0, 4).forEach(f => { high++;
    lines.push(`- ⚠︎ SUSPECTED · \`${f.el}\` (${f.tag}, "${f.text}") computes \`display: ${f.computed}\` ` +
      `where the browser default is \`${f.uaDefault}\` and no readable rule sets it — ${f.consequence}`);
    lines.push(`  - ${f.hint}`); });
  (cas.classedHeadingsAtUaDefaultSize || []).slice(0, 3).forEach(f =>
    lines.push(`- SUSPECTED · \`${f.el}\` ("${f.text}") carries a class but sits at the UA default ` +
      `${f.fontSize} with no rule setting font-size — its CSS did not load`));
  if (cas.unreadableWarning) lines.push(`  - ${cas.unreadableWarning}`);
  bullet('unscaled headings (no mobile type scale)', e.typeScale?.unscaled?.length);
  bullet('broken links (verified by request)', e.links?.broken?.length, true);
  // one root cause beats N tickets — the parent listing was fetched to tell them apart
  (e.links?.brokenClusters || []).forEach(cl => {
    lines.push(`  - **${cl.brokenCount} of them under \`${cl.pathPrefix}\` — ONE root cause, not ${cl.brokenCount} findings**`);
    lines.push(`    ${cl.rootCause || `parent listing ${cl.parentListing} → ${cl.parentStatus}`}`);
  });
  if (e.links?.truncated) lines.push(`  (link check capped — ${e.links.truncated} more links not requested)`);
  if (e.forms && !e.forms.error) {
    const f = e.forms;
    lines.push('', '### Forms (structure + validation — nothing was submitted)');
    lines.push(`- ${f.forms} form(s) found; ${f.findings.length} issue(s). ${f.note}`);
    const bySev = s => f.findings.filter(x => x.severity === s);
    if (bySev('high').length) high++;
    ['high', 'medium', 'low'].forEach(s => bySev(s).slice(0, 6).forEach(x =>
      lines.push(`- ${s.toUpperCase()} · ${x.confidence.toUpperCase()} · ${x.form}${x.field ? ` › ${x.field}` : ''}: ${x.issue}`)));
  } else if (e.forms?.error) lines.push(`- form audit failed: ${e.forms.error}`);
  if (e.loadShift?.supported) {
    lines.push(`- layout shift on load: CLS ${e.loadShift.cls} — ${e.loadShift.flag}`);
    if (e.loadShift.cls > 0.1) { high++;
      e.loadShift.shiftingElements.slice(0, 3).forEach(s =>
        lines.push(`  - ${s.el} moved up to ${s.maxMovedPx}px across ${s.shifts} shifts`)); }
  }
  bullet('console errors', e.console.errors.length + e.console.pageErrors.length, true);
  const firstPartyBad = e.network.badResponses.filter(b => !b.thirdParty);
  bullet('4xx/5xx responses (first-party)', firstPartyBad.length, true);
  bullet('4xx/5xx responses (third-party — environment, not a defect)', e.network.badResponses.length - firstPartyBad.length, false);

  for (const [eng, data] of Object.entries(e.engines || {})) {
    const d = data.diffVsPrimary || [];
    lines.push('', `### Cross-browser: ${engines[0]} vs ${eng}`);
    if (!d.length) lines.push('- no measured differences');
    else d.slice(0, 15).forEach(x => lines.push(
      `- ${x.breakpoint}px ${x.metric}: ${engines[0]}=${x[engines[0]]}, ${eng}=${x[eng]}`));
    if (d.length) high++;
    const pa = e.engineProbes?.[engines[0]], pb = e.engineProbes?.[eng];
    if (pa && pb) {
      if (pa.svg && pb.svg && (pa.svg.collapses !== pb.svg.collapses ||
          pa.svg.dataUriNatural?.w !== pb.svg.dataUriNatural?.w))
        lines.push(`- SVG intrinsic sizing: ${engines[0]} natural ${pa.svg.dataUriNatural?.w}x${pa.svg.dataUriNatural?.h}` +
          `/column-flex height ${pa.svg.columnFlexHeight}, ${eng} ${pb.svg.dataUriNatural?.w}x${pb.svg.dataUriNatural?.h}` +
          `/${pb.svg.columnFlexHeight} — a viewBox-only SVG sizes differently; give SVGs explicit width/height`);
      if (pa.scroll?.anchoring?.anchored !== pb.scroll?.anchoring?.anchored && (p.viewport?.usesFeatures?.lazyImages || 0) > 0)
        lines.push(`- scroll anchoring: ${engines[0]}=${pa.scroll.anchoring.anchored ? 'holds position' : 'JUMPS ' + pa.scroll.anchoring.shiftPx + 'px'}, ` +
          `${eng}=${pb.scroll.anchoring.anchored ? 'holds position' : 'JUMPS ' + pb.scroll.anchoring.shiftPx + 'px'} — ` +
          `content loading above the viewport shoves the reader down the page`);
      if (pa.scroll?.snapProgrammatic?.snapsOnProgrammaticScroll !== pb.scroll?.snapProgrammatic?.snapsOnProgrammaticScroll && (p.viewport?.usesFeatures?.scrollSnap || 0) > 0)
        lines.push(`- scroll-snap on JS scroll: ${engines[0]}=${pa.scroll.snapProgrammatic.snapsOnProgrammaticScroll ? 'snaps' : 'strands mid-item'}, ` +
          `${eng}=${pb.scroll.snapProgrammatic.snapsOnProgrammaticScroll ? 'snaps' : 'strands mid-item'} — affects slider next/prev buttons`);
      if (pa.scroll?.scrollendEvent !== pb.scroll?.scrollendEvent)
        lines.push(`- scrollend event: ${engines[0]}=${pa.scroll.scrollendEvent}, ${eng}=${pb.scroll.scrollendEvent}`);
      // only surface an engine divergence in a feature this page actually uses
      const uses = p.viewport?.usesFeatures || {};
      const relevant = { filter: uses.filterContainingBlock, backdropFilter: uses.backdropFilter,
        webkitBackdropFilter: uses.backdropFilter, plusDarker: uses.plusDarker,
        overflowAnchor: uses.lazyImages, aspectRatio: uses.aspectRatio };
      Object.keys(pa.containingBlock || {})
        .filter(k => pa.containingBlock[k] !== pb.containingBlock[k] && relevant[k])
        .forEach(k => lines.push(`- ${k} containing block: ${engines[0]}=${pa.containingBlock[k]}, ${eng}=${pb.containingBlock[k]}` +
          ` — ${relevant[k]} element(s) here use it, and position:fixed descendants are trapped in one engine and not the other`));
      if (pa.layout?.aspectRatioOk !== pb.layout?.aspectRatioOk)
        lines.push(`- aspect-ratio layout probe: ${engines[0]}=${pa.layout.aspectRatioOk ? 'ok' : 'BROKEN'}, ` +
          `${eng}=${pb.layout.aspectRatioOk ? 'ok' : 'BROKEN'} — flex children with aspect-ratio size differently`);
      Object.keys(pa.css || {}).filter(k => pa.css[k] !== pb.css[k] && relevant[k])
        .forEach(k => lines.push(`- CSS support differs — ${k}: ${engines[0]}=${pa.css[k]}, ${eng}=${pb.css[k]}` +
          ` (${relevant[k]} element(s) on this page rely on it)`));
    }
  }
  lines.push('');
}
writeFileSync(join(dir, 'summary.md'), lines.join('\n'));
console.log(lines.join('\n'));
console.log(`\nFull data: ${join(dir, 'findings.json')}\nScreenshots + summary in: ${dir}`);
process.exit(high > 0 ? 1 : 0);
