/*
 * vision.mjs — capture the page the way a person *sees* it, so a vision model can
 * review it directly.
 *
 * Every other file in this runner measures. Measurement is precise and blind: it can
 * tell you a heading is 62px, and it cannot tell you the heading crashes into the
 * photo behind it, that two cards in a row of four are visually heavier than the
 * others, that an icon is the wrong metaphor, or that the whole section simply looks
 * unfinished. Those are the notes clients actually send, and they are all judgements
 * about an *image*.
 *
 * So: produce images built for looking at, not for archiving.
 *
 *  - `fullpage-*.png` (already captured elsewhere) is 20 000px tall. Downscaled to fit
 *    an image budget, a 16px caption becomes two pixels high. It is nearly useless for
 *    review. Tiles at viewport size are legible at native resolution.
 *  - Each tile is anchored: scroll offset + the headings visible in it. A vision
 *    finding is worthless if you can't say *where* — the anchor is what turns "some
 *    heading overlaps an image" into a locatable defect.
 *  - Section crops give a tight frame per section, which is both what you compare
 *    against a Figma crop and what you need to judge internal balance.
 *  - Overlays (Marker.io badge, cookie bar, dev chips) are hidden by default and
 *    reported. They are environment, and left in place they read as defects — and
 *    worse, they cover the content you're trying to judge.
 *
 * Nothing here decides anything. It produces a manifest; the reviewing is done by the
 * model that looks at the files. See references/vision-qa.md for the protocol.
 */
import { mkdirSync } from 'fs';
import { join } from 'path';

/* Fixed/sticky junk that isn't part of the design. Hidden for the shot and named in
   the manifest, never silently dropped — "we hid a cookie bar" is itself a finding
   worth seeing once. */
const HIDE_SRC = `(() => {
  const sel = ${JSON.stringify([
    '[class*="marker"]', '#marker-widget', 'iframe[src*="marker.io"]',
    '[id*="cookie"]', '[class*="cookie"]', '[class*="consent"]', '[aria-label*="cookie" i]',
    '[class*="cookiebot"]', '#CybotCookiebotDialog',
    '[class*="w-editor"]', '.w-webflow-badge', '[class*="devchip"]', '[data-dev-overlay]'
  ])}.join(',');
  const hidden = [];
  document.querySelectorAll(sel).forEach(el => {
    const c = getComputedStyle(el), r = el.getBoundingClientRect();
    if (c.display === 'none' || c.visibility === 'hidden' || !r.width) return;
    // only hide chrome that floats over content; an inline .cookie-policy link stays
    if (!['fixed', 'sticky'].includes(c.position) && !el.matches('iframe,.w-webflow-badge')) return;
    hidden.push((el.tagName.toLowerCase()) + (el.id ? '#' + el.id : '') +
      (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : ''));
    el.setAttribute('data-qa-vision-hidden', '1');
    el.style.setProperty('display', 'none', 'important');
  });
  return hidden;
})()`;

const UNHIDE_SRC = `document.querySelectorAll('[data-qa-vision-hidden]').forEach(el => {
  el.style.removeProperty('display'); el.removeAttribute('data-qa-vision-hidden'); });
  const s = document.getElementById('__qa-vision-css'); if (s) s.remove();`;

/* Where headless Chromium draws a classic 15px scrollbar, `innerWidth` counts it but the
 * body doesn't fill it — every tile came back with a 15px strip of html background down
 * the right edge. At 393px that reads exactly like "the page doesn't reach the right
 * edge on mobile", which is a defect a phone (overlay scrollbars) does not have. It was
 * one measurement away from being reported. Take the scrollbar out of the picture so
 * the tile shows what a reader sees. (Whether it happens is platform- and version-
 * dependent — it measures 0px on macOS with Playwright 1.62's bundled browsers, and
 * ~15px on Linux CI and with `--channel=chrome` on Windows. The runner reports the
 * residual gutter per breakpoint as `viewportIntegrity` rather than assuming either way.)
 *
 * This CSS is exported because the same 15px reaches MEASUREMENTS, not just screenshots.
 * Every audit compares element widths against `innerWidth`, which includes the scrollbar
 * while the body does not fill it, so a genuinely full-bleed element measures 15px short
 * — a phantom right-edge gutter at 393px, and mobile images reading ~4% under spec. Both
 * were reported as findings and neither was real. The runner now installs this on every
 * page load (see NO_SCROLLBAR_CSS below), which has the additional benefit that the tile
 * you look at and the number you measure finally describe the same viewport.
 *
 * Also parks CSS animations at their end state: a tile captured mid-reveal shows body
 * copy at opacity 0.4, which reads as "dim / low-contrast text". Both of those were
 * live false findings on the run that prompted this. */
export const NO_SCROLLBAR_CSS = 'html{scrollbar-width:none!important}' +
  '::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}';

const CLEAN_SRC = `(() => {
  if (document.getElementById('__qa-vision-css')) return;
  const s = document.createElement('style'); s.id = '__qa-vision-css';
  s.textContent = ${JSON.stringify(NO_SCROLLBAR_CSS)};
  document.head.appendChild(s);
})()`;

/* What's on screen right now, in enough detail to name a tile. Headings and buttons
   only — a full text dump would drown the manifest and defeat the point. */
const LANDMARKS_SRC = `(() => {
  const vis = el => { const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < innerHeight && r.width > 0 && r.height > 0; };
  const t = el => (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  const heads = [...document.querySelectorAll('h1,h2,h3')].filter(vis)
    .map(el => el.tagName.toLowerCase() + ': ' + t(el)).filter(s => s.length > 4);
  const sect = [...document.querySelectorAll('section,[class*="section"]')].filter(vis)
    .map(el => (typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : '') || el.tagName.toLowerCase())
    .filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 3);
  return { headings: heads.slice(0, 4), sections: sect,
    scrollY: Math.round(scrollY), docHeight: Math.round(document.documentElement.scrollHeight) };
})()`;

/**
 * Tile the page into viewport-sized, natively-legible screenshots.
 * Scrolls the whole page once first so IX2 reveal animations have fired — otherwise
 * every tile below the fold shows content at opacity 0 and you "find" a bug per section.
 */
/* settleMs is 900, not the 350 it started at, and the difference is not cosmetic. Many
 * builds reverse their entrance animations on leave, so a tile jumped-to and captured
 * 350ms later catches the section heading mid-fade or not yet started — every such tile
 * came back with a blank band where the eyebrow and H2 belong, which reads as "the
 * heading is missing". 900ms clears a typical 600ms reveal. */
export async function visionCapture(page, { dir, width, prefix = '', overlap = 80, maxTiles = 14, hideOverlays = true, settleMs = 900 } = {}) {
  mkdirSync(dir, { recursive: true });
  const vh = page.viewportSize().height;

  // pre-scroll so entrance animations have run and lazy images have been requested
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
    }
    scrollTo(0, 0); await new Promise(r => setTimeout(r, 200));
  });
  await page.waitForTimeout(settleMs);

  await page.evaluate(CLEAN_SRC).catch(() => {});
  const hidden = hideOverlays ? await page.evaluate(HIDE_SRC).catch(() => []) : [];
  const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const stride = Math.max(200, vh - overlap);
  const total = Math.min(maxTiles, Math.max(1, Math.ceil(docHeight / stride)));

  const tiles = [];
  for (let i = 0; i < total; i++) {
    const y = Math.min(i * stride, Math.max(0, docHeight - vh));
    await page.evaluate(v => scrollTo(0, v), y);
    await page.waitForTimeout(settleMs);
    const lm = await page.evaluate(LANDMARKS_SRC).catch(() => ({}));
    const file = `${prefix}tile-${String(i + 1).padStart(2, '0')}-y${Math.round(y)}.png`;
    /* Shoot twice and compare. A settle timeout is a guess, and when it guesses short the tile
     * shows a blank band where a heading is mid-fade — which reads as missing content and has
     * produced confident false findings more than once. Two identical frames 350ms apart is
     * evidence the region has stopped moving; two different frames means this image is
     * *unreviewable*, which the checklist can then say out loud instead of me having to notice. */
    const a = await page.screenshot().catch(() => null);
    await page.waitForTimeout(350);
    const b2 = await page.screenshot({ path: join(dir, file) }).catch(() => null);
    const settled = !!(a && b2) && a.equals(b2);
    tiles.push({ file, scrollY: Math.round(y), viewport: `${width}x${vh}`,
      settled,
      reviewable: settled,
      unreviewableReason: settled ? undefined
        : 'still animating when captured (two frames 350ms apart differ) — do not conclude anything ' +
          'is missing or low-contrast from this tile; re-capture or check a neighbouring tile',
      headings: lm.headings || [], sections: lm.sections || [] });
    if (y >= docHeight - vh) break;
  }

  await page.evaluate(v => scrollTo(0, v), 0);
  if (hideOverlays) await page.evaluate(UNHIDE_SRC).catch(() => {});
  return { width, viewportHeight: vh, docHeight, tiles,
    truncatedAt: total >= maxTiles && docHeight > total * stride ? `${maxTiles} tiles (page is ${docHeight}px)` : null,
    overlaysHidden: hidden };
}

/**
 * One tight crop per section. This is the unit you compare against a Figma section
 * crop, and the unit in which "does this section look finished?" is answerable.
 * Tall sections are captured as their top window only — labelled, so a partial crop
 * is never mistaken for the whole thing.
 */
export async function sectionShots(page, { dir, prefix = '', maxSections = 12, maxHeight = 2200, settleMs = 250 } = {}) {
  mkdirSync(dir, { recursive: true });
  await page.evaluate(CLEAN_SRC).catch(() => {});
  const boxes = await page.evaluate(({ max }) => {
    const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
    const out = [];
    const cands = [...document.querySelectorAll('body > *, main > *, section, [class*="section"]')];
    for (const el of cands) {
      const r = el.getBoundingClientRect(), c = getComputedStyle(el);
      if (c.display === 'none' || r.height < 120 || r.width < 200) continue;
      const top = Math.round(r.top + scrollY);
      // sections nest; keep the outermost at each vertical position
      if (out.some(o => Math.abs(o.top - top) < 24)) continue;
      out.push({ top, height: Math.round(r.height), width: Math.round(r.width),
        name: (cls(el).trim().split(/\s+/)[0] || el.tagName.toLowerCase()).slice(0, 40),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) });
    }
    return out.sort((a, b) => a.top - b.top).slice(0, max);
  }, { max: maxSections });

  const shots = [];
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const h = Math.min(b.height, maxHeight);
    await page.evaluate(v => scrollTo(0, v), 0);
    await page.waitForTimeout(settleMs);
    const file = `${prefix}sec-${String(i + 1).padStart(2, '0')}-${b.name.replace(/[^\w-]+/g, '_')}.png`;
    // `clip` alone is clipped to the viewport, so every section below the fold silently
    // produced nothing — and the manifest still claimed it existed. fullPage makes the
    // clip page-relative; the failure is recorded rather than swallowed, because a
    // review that thinks it has images it doesn't is worse than one that knows it's short.
    let err = null;
    await page.screenshot({ path: join(dir, file), fullPage: true,
      clip: { x: 0, y: b.top, width: b.width, height: h } })
      .catch(e => { err = String(e.message || e).slice(0, 120); });
    shots.push({ file: err ? null : file, section: b.name, top: b.top, height: b.height,
      captured: h < b.height ? `top ${h}px of ${b.height}px` : 'full', text: b.text, error: err });
  }
  return shots;
}

/**
 * Do the section crops actually tile the page?
 *
 * They don't, and assuming they do produced a confident false finding: an insurer trust bar at
 * y=1703 sat between a crop ending at 1707 and the next starting at 1801, appeared in neither,
 * and the Figma-vs-live pair therefore showed "no live counterpart" for a section that was fully
 * built. Section detection keeps the outermost element at each vertical position, so anything
 * living in the seam between two siblings — or below the last one, or inside a crop truncated at
 * maxHeight — is simply never photographed.
 *
 * A gap is not itself a defect. It is a hole in the evidence, and it has to be visible in the
 * report so that "absent from the crops" is never read as "absent from the page".
 */
export function cropCoverage(shots, docHeight, { minGap = 24 } = {}) {
  const bands = shots.filter(s => s.file)
    .map(s => ({ name: s.section, top: s.top,
      // a truncated crop only covers what it actually captured
      bottom: s.top + (/^top (\d+)px/.test(s.captured || '') ? +RegExp.$1 : s.height) }))
    .sort((a, b) => a.top - b.top);

  const gaps = [];
  let cursor = 0;
  for (const b of bands) {
    if (b.top - cursor >= minGap)
      gaps.push({ from: cursor, to: b.top, height: b.top - cursor, before: b.name });
    cursor = Math.max(cursor, b.bottom);
  }
  if (docHeight - cursor >= minGap)
    gaps.push({ from: cursor, to: docHeight, height: docHeight - cursor, before: '(end of page)' });

  const covered = bands.reduce((n, b, i) => {
    const prev = i ? Math.max(...bands.slice(0, i).map(x => x.bottom)) : 0;
    return n + Math.max(0, b.bottom - Math.max(b.top, prev));
  }, 0);

  const truncated = shots.filter(s => s.file && /^top /.test(s.captured || ''))
    .map(s => ({ section: s.section, captured: s.captured }));

  return {
    docHeight, sectionsCaptured: bands.length,
    failed: shots.filter(s => !s.file).map(s => ({ section: s.section, error: s.error })),
    coveredPx: covered, coveragePct: docHeight ? Math.round((covered / docHeight) * 100) : 0,
    truncated,
    gaps,
    hint: gaps.length
      ? 'These vertical bands appear in NO section crop. Anything living here is invisible to a ' +
        'crop-based review — check the tiles (which overlap) or the DOM before concluding that ' +
        'something is missing from the page.'
      : undefined
  };
}

/* ── COMPONENT SETS: the odd-one-out engine ──────────────────────────────────────
 *
 * The most productive thing a reviewer does on a site with no design reference is compare a
 * thing to its own siblings. Five testimonial cards, three service cards, six insight cards, a
 * row of insurer logos — a defect almost always shows up as *the one that isn't like the
 * others*. Recycled photography, a duplicated logo, a card missing its CTA, one arrow in the
 * wrong variant: every one of those was found this way, and every one was found by accident,
 * because nothing in the pipeline laid a set out side by side.
 *
 * Two halves, deliberately:
 *   1. Numeric anomalies computed in the DOM — duplicate image sources across instances, an
 *      instance with no image or no link while its siblings have one, height and copy-length
 *      outliers. These need no eyes at all and are MEASURED. Duplicate `src` alone catches the
 *      recycled-photo defect outright.
 *   2. One crop per instance, in order, so the visual judgements that can't be computed
 *      (wrong crop, wrong subject, mismatched icon weight, one card that just looks heavier)
 *      are a single glance down a folder instead of a hunt across a full-page screenshot.
 */
export async function componentSets(page, { dir, minInstances = 3, maxSets = 8, maxInstances = 8 } = {}) {
  mkdirSync(dir, { recursive: true });

  const sets = await page.evaluate(({ minInstances, maxSets, maxInstances }) => {
    const cls = el => (typeof el.className === 'string' ? el.className : el.getAttribute('class') || '');
    const tok = el => (cls(el).trim().split(/\s+/)[0] || '');
    const vis = el => { const c = getComputedStyle(el), r = el.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && r.width > 8 && r.height > 8; };
    const out = [];
    const claimed = new Set();

    for (const parent of document.querySelectorAll('body *')) {
      if (out.length >= maxSets) break;
      const kids = Array.from(parent.children).filter(vis);
      if (kids.length < minInstances) continue;
      const t = tok(kids[0]);
      if (!t || !kids.every(k => tok(k) === t)) continue;
      if (claimed.has(t)) continue;
      const h = kids[0].getBoundingClientRect().height;
      if (h < 60) continue;                       // nav links, tag pills — not components
      claimed.add(t);

      const instances = kids.slice(0, maxInstances).map((k, i) => {
        const r = k.getBoundingClientRect();
        const imgs = Array.from(k.querySelectorAll('img')).map(im => ({
          src: (im.currentSrc || im.getAttribute('src') || '').split('/').pop().split('?')[0],
          w: Math.round(im.getBoundingClientRect().width), nw: im.naturalWidth }));
        const svgs = Array.from(k.querySelectorAll('svg,use,img[src$=".svg"]')).map(s =>
          (s.getAttribute('src') || s.getAttribute('href') || s.innerHTML || '').slice(0, 60));
        const heading = (k.querySelector('h1,h2,h3,h4,h5,h6,[class*="title"]') || {}).textContent;
        return {
          i, top: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height),
          heading: (heading || '').trim().slice(0, 60),
          text: (k.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
          textLength: (k.innerText || '').trim().length,
          images: imgs, iconCount: svgs.length, iconSigs: svgs.map(s => s.slice(0, 24)),
          links: Array.from(k.querySelectorAll('a[href]')).map(a => (a.textContent || '').trim().slice(0, 24)).filter(Boolean),
          bg: getComputedStyle(k).backgroundColor
        };
      });

      // ── anomalies, no eyes needed ──
      const anomalies = [];
      const srcCount = {};
      instances.forEach(inst => new Set(inst.images.map(im => im.src)).forEach(s => {
        if (s) srcCount[s] = (srcCount[s] || 0) + 1; }));
      const dupes = Object.entries(srcCount).filter(([, n]) => n > 1);
      if (dupes.length) anomalies.push({ kind: 'duplicateImageAcrossInstances', confidence: 'measured',
        detail: dupes.map(([s, n]) => `${s} used by ${n} of ${instances.length}`),
        hint: 'the same photograph is reused across instances of a set that should vary — check it is not a service/stock image standing in for real content' });

      const withImg = instances.filter(x => x.images.length), withoutImg = instances.filter(x => !x.images.length);
      if (withImg.length && withoutImg.length) anomalies.push({ kind: 'instanceMissingImage', confidence: 'measured',
        detail: `instance(s) ${withoutImg.map(x => x.i + 1).join(', ')} have no image; ${withImg.length} sibling(s) do`,
        hint: 'asymmetry within a set is usually an unset CMS field' });

      const withLink = instances.filter(x => x.links.length), withoutLink = instances.filter(x => !x.links.length);
      if (withLink.length && withoutLink.length) anomalies.push({ kind: 'instanceMissingLink', confidence: 'measured',
        detail: `instance(s) ${withoutLink.map(x => x.i + 1).join(', ')} contain no link; ${withLink.length} sibling(s) do`,
        hint: 'a card in a set with no CTA where its siblings have one' });

      const dupText = {};
      instances.forEach(x => { const k2 = x.heading || x.text.slice(0, 40); if (k2) dupText[k2] = (dupText[k2] || 0) + 1; });
      const repeated = Object.entries(dupText).filter(([, n]) => n > 1);
      if (repeated.length) anomalies.push({ kind: 'duplicateContent', confidence: 'measured',
        detail: repeated.map(([k2, n]) => `"${k2.slice(0, 40)}" appears ${n}×`),
        hint: 'a collection showing more items than exist, or copy-pasted static cards' });

      const iconSets = new Set(instances.map(x => x.iconSigs.join('|')));
      if (iconSets.size > 1 && instances.every(x => x.iconCount > 0) && instances.length > 2)
        anomalies.push({ kind: 'iconVariantMismatch', confidence: 'suspected',
          detail: `${iconSets.size} distinct icon signatures across ${instances.length} instances`,
          hint: 'one instance may carry a different icon/arrow variant — confirm on the crops' });

      const hs = instances.map(x => x.height), maxH = Math.max(...hs), minH = Math.min(...hs);
      if (maxH > minH * 1.35 && maxH - minH > 40) anomalies.push({ kind: 'heightOutlier', confidence: 'measured',
        detail: `heights ${hs.join(', ')}px`,
        hint: 'uneven card heights in a row — usually copy length, sometimes a missing element' });

      out.push({ name: t, count: kids.length, captured: instances.length,
        truncated: kids.length > instances.length ? kids.length - instances.length : 0,
        instances, anomalies });
    }
    return out;
  }, { minInstances, maxSets, maxInstances });

  // ── one crop per instance, so a set is reviewable at a glance ──
  for (const set of sets) {
    const sdir = join(dir, set.name.replace(/[^\w-]+/g, '_'));
    mkdirSync(sdir, { recursive: true });
    for (const inst of set.instances) {
      const file = `${String(inst.i + 1).padStart(2, '0')}.png`;
      try {
        // class tokens from Webflow are already selector-safe; escape only what could break one
        const loc = page.locator(`.${set.name.replace(/([^\w-])/g, '\\$1')}`).nth(inst.i);
        await loc.scrollIntoViewIfNeeded({ timeout: 3000 });
        await page.waitForTimeout(250);
        await loc.screenshot({ path: join(sdir, file), timeout: 5000 });
        inst.crop = join(set.name, file);
      } catch (e) { inst.cropError = String(e.message || e).slice(0, 70); }
    }
    set.dir = set.name;
  }
  await page.evaluate(() => scrollTo(0, 0));
  return sets;
}

/* ── VISION → CODE ───────────────────────────────────────────────────────────────
 *
 * The point of a strong vision model in a QA loop is not that it writes nicer prose about a
 * screenshot. It is that it can look at a rendering, form a specific hypothesis about the DOM
 * underneath, and express that hypothesis as something executable. Prose findings have to be
 * re-verified by hand every single time, which is exactly the manual step that made the vision
 * pass unauditable — and occasionally wrong in a way nothing caught.
 *
 * So a vision finding is not a sentence. It is a claim plus the code that settles it:
 *
 *   { file, question, claim, selector, assert: "<JS expression returning {expected, actual, pass}>" }
 *
 * `runVisionProbes` executes each assert against the live page and stamps every finding
 * CONFIRMED / REFUTED / ERROR. Refuted findings never reach the report, and — more useful — the
 * refutations are the training signal for the false-positive catalogue.
 *
 * Read-only by construction: asserts are expressions that measure, and the audit never mutates.
 */
export async function runVisionProbes(page, findings, { timeoutMs = 4000 } = {}) {
  const out = [];
  for (const f of findings) {
    if (!f.assert) { out.push({ ...f, verdict: 'UNVERIFIED', note: 'no assert supplied — a vision claim without executable evidence stays SUSPECTED' }); continue; }
    try {
      if (f.scrollTo != null) { await page.evaluate(y => scrollTo(0, y), f.scrollTo); await page.waitForTimeout(400); }
      const r = await Promise.race([
        page.evaluate(src => {
          try { const v = eval(src); return { ok: true, value: v }; }
          catch (e) { return { ok: false, error: String(e.message || e).slice(0, 120) }; }
        }, f.assert),
        new Promise(res => setTimeout(() => res({ ok: false, error: 'timeout' }), timeoutMs))
      ]);
      if (!r.ok) { out.push({ ...f, verdict: 'ERROR', error: r.error }); continue; }
      const v = r.value || {};
      out.push({ ...f, verdict: v.pass ? 'CONFIRMED' : 'REFUTED',
        expected: v.expected, actual: v.actual, confidence: 'measured' });
    } catch (e) { out.push({ ...f, verdict: 'ERROR', error: String(e.message || e).slice(0, 120) }); }
  }
  const confirmed = out.filter(x => x.verdict === 'CONFIRMED');
  const refuted = out.filter(x => x.verdict === 'REFUTED');
  return { total: out.length, confirmed: confirmed.length, refuted: refuted.length,
    unverified: out.filter(x => x.verdict === 'UNVERIFIED').length,
    errored: out.filter(x => x.verdict === 'ERROR').length,
    note: refuted.length
      ? `${refuted.length} vision claim(s) REFUTED by measurement — these must not be reported, and each is a candidate entry for references/false-positives.md`
      : undefined,
    findings: out };
}

/**
 * The fixed question set for the vision pass, emitted as an answerable checklist.
 *
 * Reviewing 25 images and reporting "what I noticed" is neither auditable nor repeatable — two
 * runs of the same page find different things, and "nothing found" is indistinguishable from
 * "didn't look". Reading the same ordered questions against every image turns the pass into
 * data: seven questions asked, seven answered, and the answers are reviewable next to the
 * measurements.
 *
 * The questions are ordered deliberately — structure before pixels. A missing card outranks
 * 6px of padding, and a pixel-hunting look walks straight past it.
 */
export const VISION_QUESTIONS = [
  { id: 'present', q: 'Is every element that should be here actually here? (heading, eyebrow, copy, image, CTA, badge)' },
  { id: 'count', q: 'Are the counts right — cards, logos, columns, list items, stars?' },
  { id: 'arrangement', q: 'Is the arrangement right — order, 3-up vs 2-up, alignment, which side the image sits on?' },
  { id: 'asset', q: 'Is this the right asset, and is it used only once? (recycled or wrong photography, duplicated logos, mismatched icon variants)' },
  { id: 'crop', q: 'Is the imagery cropped sensibly — faces intact, subject not cut through, focal point held?' },
  { id: 'collision', q: 'Is anything colliding, overlapping, crowded, or cut off at an edge?' },
  { id: 'finish', q: 'Does this look finished — consistent weight across a set, deliberate spacing rhythm, no placeholder feel?' }
];

/* Not every image deserves every question, and pretending otherwise is how a 175-cell sheet
 * gets filled in carelessly. A section crop is the unit in which "does this look finished?" is
 * answerable, so it gets the full set. A viewport tile is an arbitrary window that slices
 * sections in half — it is the right primitive for reading order and flow, and the wrong one for
 * composition. A second-engine tile exists only to be diffed against its twin. */
const TIER = {
  section: VISION_QUESTIONS.map(q => q.id),
  set: ['present', 'count', 'asset', 'crop', 'finish'],
  tile: ['present', 'arrangement', 'collision', 'finish'],
  engineTile: ['diff'],
  state: ['present', 'collision', 'arrangement', 'finish']
};
const EXTRA_QUESTIONS = {
  diff: 'Compared with the same scroll offset in the other engine: any difference in layout, wrapping, spacing, clipping or colour?'
};

export function visionChecklist(manifest, { sets = [] } = {}) {
  const q = id => VISION_QUESTIONS.find(x => x.id === id) || { id, q: EXTRA_QUESTIONS[id] || id };
  const images = manifest.map(m => {
    const kind = m.engine && m.engine !== 'chromium' ? 'engineTile' : m.kind;
    const ids = TIER[kind] || TIER.tile;
    const unreviewable = m.reviewable === false;
    return {
      file: m.file, kind, breakpoint: m.breakpoint, engine: m.engine || 'chromium',
      anchor: m.kind === 'tile' ? { scrollY: m.scrollY, headings: m.headings || [] }
                                : { section: m.section, top: m.top },
      ...(unreviewable ? { preAnswered: 'unreviewable', reason: m.unreviewableReason } : {}),
      questions: ids.map(id => q(id).q),
      answers: Object.fromEntries(ids.map(id => [id, unreviewable ? 'unreviewable' : null]))
    };
  });

  /* Questions derived from what this page actually contains. A generic sheet asks "are the counts
   * right?"; a page-aware one asks "the 5 testi_card instances reuse 2 images across 5 cards —
   * look at sets/testi_card/*.png and say which is wrong". The second gets answered properly. */
  const pageSpecific = sets.map(s => ({
    set: s.name, instances: s.count, crops: `sets/${s.dir}/`,
    computedAnomalies: s.anomalies.map(a => `${a.kind}: ${Array.isArray(a.detail) ? a.detail.join('; ') : a.detail}`),
    ask: `Open every crop in sets/${s.dir}/ back to back. Which instance is not like the others, and why? ` +
         (s.anomalies.length
           ? 'Numeric anomalies were already found (above) — confirm or refute each on the crops, and look for what the numbers cannot see (wrong subject, bad crop, mismatched visual weight).'
           : 'Nothing was detectable numerically, so anything here is vision-only.'),
    answers: { oddOneOut: null, why: null, confirmsComputed: null }
  }));

  return {
    instructions:
      'Work QUESTION-FIRST, not image-first: ask "are the counts right?" of every tile in a row ' +
      'before moving to the next question. Reading one image at a time through seven questions is ' +
      'what makes reviewers miss the odd one out — the comparison is the whole point.\n\n' +
      'Every answer is "ok" | "finding" | "unreviewable".\n\n' +
      '"unreviewable" is a first-class answer, not a cop-out — mid-animation capture, an overlay ' +
      'covering the area, a truncated crop. Images already known to be unsettled are pre-answered.\n\n' +
      'A "finding" MUST carry executable evidence, not a sentence:\n' +
      '  { "verdict": "finding", "note": "...", "selector": "...",\n' +
      '    "assert": "(() => { const e = document.querySelector(\'.x\');\n' +
      '                        const actual = getComputedStyle(e).gap;\n' +
      '                        return { expected: \'24px\', actual, pass: actual !== \'24px\' }; })()",\n' +
      '    "scrollTo": 4200 }\n' +
      'The assert returns {expected, actual, pass} where pass:true means THE DEFECT IS REAL. ' +
      'runVisionProbes executes it and stamps CONFIRMED / REFUTED. Anything you cannot express as ' +
      'an assert is still worth reporting, but it stays SUSPECTED and must say so.\n\n' +
      'Division of authority, which this structure exists to enforce: vision is authoritative on ' +
      'APPEARANCE and PRESENCE; computed styles on VALUES; clicking on BEHAVIOUR. Never report a ' +
      'value you only saw.',
    questionBank: [...VISION_QUESTIONS, { id: 'diff', q: EXTRA_QUESTIONS.diff }],
    tiers: TIER,
    componentSets: pageSpecific,
    images
  };
}

/** Summarise a filled-in checklist — and be explicit about what was never answered. */
export function visionChecklistSummary(filled) {
  let expected = 0, answered = 0, unreviewable = 0, withAssert = 0;
  const findings = [];
  for (const img of filled.images) {
    for (const [id, a] of Object.entries(img.answers || {})) {
      expected++;
      if (a === null || a === undefined) continue;
      answered++;
      const verdict = typeof a === 'string' ? a : a.verdict;
      if (verdict === 'unreviewable') unreviewable++;
      if (verdict === 'finding') {
        const f = typeof a === 'object' ? a : {};
        if (f.assert) withAssert++;
        findings.push({ file: img.file, breakpoint: img.breakpoint, question: id,
          note: f.note, selector: f.selector, assert: f.assert, scrollTo: f.scrollTo ?? img.anchor?.scrollY });
      }
    }
  }
  return { images: filled.images.length,
    answersExpected: expected, answersGiven: answered,
    coveragePct: expected ? Math.round((answered / expected) * 100) : 0,
    unanswered: expected - answered, unreviewable,
    findings, findingsWithExecutableEvidence: withAssert,
    findingsProseOnly: findings.length - withAssert,
    verdict: answered === expected
      ? `complete — every tiered question answered across all ${filled.images.length} images`
      : `INCOMPLETE — ${expected - answered} of ${expected} answers missing; "nothing found" is not yet a claim this pass can make`,
    next: withAssert
      ? `pass these ${withAssert} finding(s) to runVisionProbes() — a vision claim is not a finding until measurement confirms it`
      : undefined };
}

/**
 * Same viewport, two engines, one pair of images — the cross-engine *diff* made
 * visual. The numeric diff catches count changes; this catches "it renders, the
 * counts agree, and it looks wrong", which is most real Safari bugs.
 */
export function visionManifest(entry) {
  const items = [];
  for (const [w, v] of Object.entries(entry.vision || {})) {
    (v.tiles || []).forEach(t => items.push({ kind: 'tile', breakpoint: +w, ...t }));
    (v.sections || []).forEach(s => items.push({ kind: 'section', breakpoint: +w, ...s }));
  }
  for (const [eng, data] of Object.entries(entry.engines || {})) {
    for (const [w, v] of Object.entries(data.vision || {})) {
      (v.tiles || []).forEach(t => items.push({ kind: 'tile', engine: eng, breakpoint: +w, ...t }));
    }
  }
  return items;
}
