#!/usr/bin/env node
/*
 * check-regress.mjs — prove the run-to-run diff fires, and prove it stays quiet.
 *
 * A regression diff has a uniquely bad failure mode: when it breaks, it reports nothing,
 * and "nothing" is indistinguishable from "no regressions". That reads as reassurance. So
 * every case here asserts both directions — the change IS caught, and an unchanged run is
 * NOT flagged — and the phase-gating cases exist because the first version of this module
 * would happily report every broken link as fixed when the second run was invoked with
 * --no-links.
 *
 * Needs no browser: it diffs synthetic findings.json shapes.
 *
 *   node tests/check-regress.mjs
 */
import { diffRuns, signature } from '../runner/lib/regress.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
};

/* A minimal but shape-accurate report. Every field the extractors read is present, so a
 * test failure means the diff logic is wrong rather than the fixture being thin. */
const mk = (over = {}) => {
  const bp = {
    headingSizes: [{ tag: 'h1', text: 'Tax efficient life insurance', size: '72px' },
                   { tag: 'h2', text: 'Who this is best for', size: '42px' }],
    horizontalOverflow: { pageScrollsSideways: false, offenders: [], docScrollWidth: 1512, clientWidth: 1512 },
    collapsedElements: [], unintendedWrapping: [], clippedText: [], imageIssues: [],
    emptyMediaSlots: [], lowContrast: [], invisibleText: [], tinyTapTargets: [],
    polish: { containerGutters: { outliers: [] }, svg: { oversized: [] }, falseAffordance: [],
      missingGaps: [], cmsEmptyStates: { emptyLists: [], emptyBindings: [] }, upscaledImages: [],
      duplicateIcons: [], wrappedGroups: [], hitTestBlocked: [], duplicateListItems: [],
      aspectRatioNotHonoured: [] }
  };
  const entry = {
    url: 'https://site.com/', dir: '/tmp/x',
    byBreakpoint: { 1512: structuredClone(bp) },
    once: {
      content: { placeholderText: [], defaultRichText: [], deadLinks: [], stagingLinks: [], emptyHeadings: [] },
      a11y_seo: {
        seo: { title: 'Relevant Life Insurance — Exec Life', metaDescription: 'A real description here.',
               canonical: 'https://site.com/', og: { image: 'present' }, favicon: true },
        accessibility: { imagesMissingAlt: [], duplicateIds: [], unlabeledFormFields: [], brokenAriaRefs: [] },
        rendering: { webFontsNotLoaded: [] }
      }
    },
    vision: { 1512: { docHeight: 8000 } },
    links: { broken: [] }, forms: { findings: [] },
    console: { errors: [], warnings: [], pageErrors: [] },
    network: { badResponses: [], failedRequests: [] },
    typeScale: { unscaled: [] }
  };
  const e = { ...entry, ...over };
  return { generatedAt: '2026-07-29-10-00-00', engines: ['chromium'], urls: [e] };
};

const base = dirLabel => ({ dir: dirLabel || './qa-run/prev', report: mk() });
const diff = curr => diffRuns(base(), curr);

console.log('\nregress.mjs — run-to-run diff\n');

// ── the quiet case: nothing changed ────────────────────────────────────────────
{
  const d = diff(mk());
  ok('identical runs → no regressions', d.totals.regressions === 0, JSON.stringify(d.urls[0]?.regressions));
  ok('identical runs → no fixes', d.totals.fixes === 0);
  ok('identical runs → no changes', d.totals.changes === 0, JSON.stringify(d.urls[0]?.changes));
  ok('identical runs → something WAS actually compared', d.urls[0].compared > 20,
    `compared=${d.urls[0].compared} (a diff comparing nothing would pass every other test here)`);
}

// ── the regression this module was written for ─────────────────────────────────
{
  const curr = mk();
  curr.urls[0].byBreakpoint[1512].emptyMediaSlots = [{ el: '.video-facade', reason: 'no poster' }];
  const d = diff(curr);
  const r = d.urls[0].regressions.find(x => x.key.startsWith('layout.emptyMediaSlots'));
  ok('a media slot losing its source → regression', !!r, JSON.stringify(d.urls[0].regressions));
  // reported by identity, which names the element — strictly better than a bare 0 → 1,
  // and the duplicate count line is suppressed so the defect appears exactly once
  ok('  …naming the element rather than only counting it',
    r && r.kind === 'appeared' && r.items[0].includes('.video-facade'), JSON.stringify(r));
  ok('  …and not also as a duplicate count line',
    d.urls[0].regressions.filter(x => x.key.startsWith('layout.emptyMediaSlots')).length === 1);
}

/* ── a defect changing KIND while the count stays put ──────────────────────────
 * Found by running the real runner against a page whose image lost its src: imageIssues
 * was length 1 before and after ("aspect distorted" → "broken, no intrinsic size"), so a
 * count-only diff reported nothing at all while an image silently stopped rendering. This
 * is the whole failure mode the module exists to prevent, reproduced inside it. */
{
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].byBreakpoint[1512].imageIssues = [{ el: 'img.hero', issue: 'aspect distorted' }];
  const curr = mk();
  curr.urls[0].byBreakpoint[1512].imageIssues = [{ el: 'img.hero', issue: 'broken — load finished with no intrinsic size' }];
  const d = diffRuns(prev, curr);
  const r = d.urls[0].regressions.find(x => x.kind === 'appeared' && x.key.startsWith('layout.imageIssues'));
  ok('an image issue changing KIND at a constant count → regression', !!r,
    JSON.stringify({ r: d.urls[0].regressions, f: d.urls[0].fixes }));
  ok('  …naming the new failure', r && /broken/.test(r.items[0]));
}
{
  // and the quiet direction: same issues, same count, nothing said
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].byBreakpoint[1512].imageIssues = [{ el: 'img.hero', issue: 'aspect distorted' }];
  const curr = mk();
  curr.urls[0].byBreakpoint[1512].imageIssues = [{ el: 'img.hero', issue: 'aspect distorted' }];
  const d = diffRuns(prev, curr);
  ok('an unchanged image issue → silent', d.totals.regressions === 0 && d.totals.fixes === 0,
    JSON.stringify({ r: d.urls[0].regressions, f: d.urls[0].fixes }));
}
{
  // a count change with identical identities must still be reported
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].byBreakpoint[1512].collapsedElements = [{ el: '.card' }];
  const curr = mk();
  curr.urls[0].byBreakpoint[1512].collapsedElements = [{ el: '.card' }, { el: '.card' }, { el: '.card' }];
  const d = diffRuns(prev, curr);
  ok('more of the same defect → still reported as a regression',
    d.urls[0].regressions.some(x => x.key.startsWith('layout.collapsed')),
    JSON.stringify(d.urls[0].regressions));
}

// ── heading type changes ───────────────────────────────────────────────────────
{
  const curr = mk();
  curr.urls[0].byBreakpoint[1512].headingSizes[1].size = '32px';
  const d = diff(curr);
  const c = d.urls[0].changes.find(x => x.key.includes('Who this is best for'));
  ok('a heading size change → reported as a change', !!c, JSON.stringify(d.urls[0].changes));
  ok('  …with both values', c && c.was === '42px' && c.now === '32px');
  ok('  …and NOT counted as a regression', d.totals.regressions === 0);
}
{
  const curr = mk();
  curr.urls[0].byBreakpoint[1512].headingSizes.splice(1, 1);   // the heading is gone
  const d = diff(curr);
  ok('a heading disappearing → regression', d.urls[0].regressions.some(x => x.kind === 'gone'),
    JSON.stringify(d.urls[0].regressions));
}

// ── identified items, by identity ──────────────────────────────────────────────
{
  const curr = mk();
  curr.urls[0].links.broken = [{ url: 'https://site.com/team/jane', status: 404 }];
  const d = diff(curr);
  const r = d.urls[0].regressions.find(x => x.kind === 'appeared' && x.key === 'links.broken');
  ok('a new broken link → regression naming the URL', !!r && r.items[0].includes('/team/jane'),
    JSON.stringify(d.urls[0].regressions));
}
{
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].links.broken = [{ url: 'https://site.com/gone', status: 404 }];
  const d = diffRuns(prev, mk());
  ok('a broken link that now resolves → fix, not regression',
    d.totals.regressions === 0 && d.urls[0].fixes.some(x => x.kind === 'resolved'),
    JSON.stringify({ r: d.urls[0].regressions, f: d.urls[0].fixes }));
}

// ── present → absent is always a regression ────────────────────────────────────
{
  const curr = mk();
  curr.urls[0].once.a11y_seo.seo.title = '(missing)';
  const d = diff(curr);
  ok('a title going missing → regression (not a neutral change)',
    d.urls[0].regressions.some(x => x.key === 'seo.title' && x.kind === 'lost'),
    JSON.stringify(d.urls[0].regressions));
}
{
  const curr = mk();
  curr.urls[0].once.a11y_seo.seo.title = 'A deliberately rewritten title';
  const d = diff(curr);
  ok('a title being rewritten → change, NOT a regression',
    d.totals.regressions === 0 && d.urls[0].changes.some(x => x.key === 'seo.title'));
}

// ── page shape, with a noise floor ─────────────────────────────────────────────
{
  const curr = mk(); curr.urls[0].vision[1512].docHeight = 5000;      // -37%
  ok('page getting materially shorter → regression',
    diff(curr).urls[0].regressions.some(x => x.kind === 'shape'));
}
{
  const curr = mk(); curr.urls[0].vision[1512].docHeight = 8080;      // +1%
  ok('page height moving 1% → ignored as noise', diff(curr).totals.regressions === 0 &&
    !diff(curr).urls[0].changes.some(x => x.kind === 'shape'));
}

// ── phase gating: a skipped phase is unknown, never clean ──────────────────────
{
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].links.broken = [{ url: 'https://site.com/gone', status: 404 }];
  const curr = mk();
  delete curr.urls[0].links;                    // this run ran with --no-links
  const d = diffRuns(prev, curr);
  ok('--no-links on the new run → broken links NOT reported as fixed',
    !d.urls[0].fixes.some(x => x.key === 'links.broken'), JSON.stringify(d.urls[0].fixes));
}
{
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].forms = { findings: [{ severity: 'high', issue: 'no name attr' }] };
  const curr = mk(); curr.urls[0].forms = { error: 'form audit failed' };
  const d = diffRuns(prev, curr);
  ok('a failed form audit → not reported as forms improving',
    !d.urls[0].fixes.some(x => x.key === 'forms.issues'), JSON.stringify(d.urls[0].fixes));
}

// ── config drift is stated, not silently absorbed ──────────────────────────────
{
  const prev = { dir: './qa-run/prev', report: mk() };
  prev.report.urls[0].byBreakpoint[393] = structuredClone(prev.report.urls[0].byBreakpoint[1512]);
  prev.report.urls[0].byBreakpoint[393].collapsedElements = [{ el: '.card' }];
  const d = diffRuns(prev, mk());
  ok('a breakpoint absent from this run → noted', d.notes.some(x => x.includes('393')), JSON.stringify(d.notes));
  ok('  …and its defects are NOT reported as fixed',
    !d.urls[0].fixes.some(x => x.key.includes('@393')), JSON.stringify(d.urls[0].fixes));
}
{
  const prev = { dir: './qa-run/prev', report: mk() };
  const curr = mk(); curr.urls[0].url = 'https://site.com/about';
  const d = diffRuns(prev, curr);
  ok('a URL new since the baseline → noted, not diffed', d.notes.some(x => x.includes('/about')));
  ok('a URL dropped since the baseline → noted', d.notes.some(x => x.includes('not swept')));
}

// ── first run ──────────────────────────────────────────────────────────────────
{
  ok('no baseline at all → null, so the summary stays quiet', diffRuns(null, mk()) === null);
  ok('unreadable baseline → null', diffRuns({ dir: 'x', error: 'ENOENT' }, mk()) === null);
}

// ── the signature itself is non-trivial ────────────────────────────────────────
{
  const s = signature(mk().urls[0]);
  ok('signature extracts per-breakpoint counts', Object.keys(s.counts).some(k => k.endsWith('@1512')));
  ok('signature extracts heading sizes by text', Object.keys(s.values).some(k => k.startsWith('type.h1|')));
  ok('signature extracts SEO values', s.values['seo.title'] !== undefined);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
