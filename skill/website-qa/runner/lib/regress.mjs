/*
 * regress.mjs — compare this run to the previous one.
 *
 * Why this exists, and why it runs before anything else in the summary:
 *
 * Every other check in this skill answers "is the page correct?" — against itself, or
 * against a spec. None of them answer "did this page get WORSE since the last time we
 * looked?", and that is a different and more urgent question. A 4px padding delta has
 * always been wrong and can wait; a thumbnail that rendered yesterday and doesn't today
 * is something that just broke, and it is almost always the fault of the change that was
 * made in between.
 *
 * That class of finding was, until this module, caught only by a human noticing. On the
 * run that prompted it, eight pages shipped with an empty poster and a dead video URL for
 * a day; the sweep passed both days because at no point was the page internally
 * inconsistent. The only signal was that a number had gone down. Nothing was comparing.
 *
 * The runner already writes one timestamped directory per run, so the history is sitting
 * there. All that was missing was the subtraction.
 *
 * Design notes:
 * - Counts, values and identified items are diffed separately, because they mean different
 *   things. A count going up is a regression; a VALUE changing is a change to look at (it
 *   may be an intended edit); an item appearing by identity is the most actionable of the
 *   three because it names the thing.
 * - Item identity is deliberately fuzzy (`idOf`). Keying on a hand-written field name per
 *   audit would mean that when an audit's shape changed, the diff silently reported nothing
 *   — which reads exactly like "no regressions" and would reintroduce the bug this module
 *   exists to catch. A wrong-but-present id produces noise; a missing one produces false
 *   silence, and false silence is worse.
 * - Run configuration is compared too. Diffing a 7-breakpoint run against a 2-breakpoint
 *   one would report every absent breakpoint as a fix. Where the configs disagree, the
 *   affected keys are skipped and the reason is stated.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

/* ── locating the baseline ──────────────────────────────────────────────────────
 * Runs live at <outRoot>/<timestamp>/findings.json. The current run has already
 * created its own directory by the time this is called, so it must be excluded by
 * name rather than by "latest". */
export function findBaseline(outRoot, currentTs) {
  if (!existsSync(outRoot)) return null;
  const candidates = readdirSync(outRoot)
    .filter(d => d !== currentTs)
    .filter(d => { try { return statSync(join(outRoot, d)).isDirectory(); } catch { return false; } })
    .filter(d => existsSync(join(outRoot, d, 'findings.json')))
    .sort();                                  // timestamps are ISO-ish, so lexical === chronological
  if (!candidates.length) return null;
  return join(outRoot, candidates[candidates.length - 1]);
}

export function loadBaseline(dirOrFile) {
  if (!dirOrFile) return null;
  const file = dirOrFile.endsWith('.json') ? dirOrFile : join(dirOrFile, 'findings.json');
  if (!existsSync(file)) return null;
  try { return { dir: dirOrFile, report: JSON.parse(readFileSync(file, 'utf8')) }; }
  catch (e) { return { dir: dirOrFile, error: String(e.message || e) }; }
}

/* ── signature extraction ───────────────────────────────────────────────────────
 * A flat, stable map of key → number (counts), key → string/number (values), and
 * key → array-of-ids (items). Keys must be identical between runs for the same page,
 * so nothing derived from array order or element index is allowed in a key. */

const n = v => (Array.isArray(v) ? v.length : (v == null ? null : v));
const len = v => (Array.isArray(v) ? v.length : 0);

/* Best-effort stable identity for a finding. Order matters: the most specific and
 * least churn-prone identifier wins. Text is preferred over selector because class
 * names change between builds while copy usually doesn't. */
function idOf(item) {
  if (item == null) return null;
  if (typeof item === 'string' || typeof item === 'number') return String(item).slice(0, 120);
  const pick = item.url || item.href || item.src || item.text || item.el || item.selector ||
    item.id || item.name || item.field || item.issue || item.claim;
  if (pick) return String(pick).replace(/\s+/g, ' ').trim().slice(0, 120);
  try { return JSON.stringify(item).slice(0, 120); } catch { return null; }
}
const idsOf = arr => (Array.isArray(arr) ? arr.map(idOf).filter(Boolean) : []);

/* Per-breakpoint counted metrics. Every one of these is "how many defects of this kind
 * at this width" — the shape where an increase is unambiguously a regression. */
const BP_COUNTS = {
  'layout.overflow':          bp => len(bp?.horizontalOverflow?.offenders),
  'layout.scrollsSideways':   bp => (bp?.horizontalOverflow?.pageScrollsSideways ? 1 : 0),
  'layout.collapsed':         bp => len(bp?.collapsedElements),
  'layout.wrapping':          bp => len(bp?.unintendedWrapping),
  'layout.clippedText':       bp => len(bp?.clippedText),
  'layout.imageIssues':       bp => len(bp?.imageIssues),
  // the exact shape of the regression this module was written for: a media slot that
  // has a container but no resolved source. An empty poster lands here.
  'layout.emptyMediaSlots':   bp => len(bp?.emptyMediaSlots),
  'layout.lowContrast':       bp => len(bp?.lowContrast),
  'layout.invisibleText':     bp => len(bp?.invisibleText),
  'layout.tinyTapTargets':    bp => len(bp?.tinyTapTargets),
  'polish.gutterOutliers':    bp => len(bp?.polish?.containerGutters?.outliers),
  'polish.oversizedSvgs':     bp => len(bp?.polish?.svg?.oversized),
  'polish.falseAffordance':   bp => len(bp?.polish?.falseAffordance),
  'polish.missingGaps':       bp => len(bp?.polish?.missingGaps),
  // CMS bindings that render to nothing — the other half of the empty-template class
  'polish.cmsEmptyLists':     bp => len(bp?.polish?.cmsEmptyStates?.emptyLists),
  'polish.cmsEmptyBindings':  bp => len(bp?.polish?.cmsEmptyStates?.emptyBindings),
  'polish.upscaledImages':    bp => len(bp?.polish?.upscaledImages),
  'polish.duplicateIcons':    bp => len(bp?.polish?.duplicateIcons),
  'polish.wrappedGroups':     bp => len(bp?.polish?.wrappedGroups),
  'polish.hitTestBlocked':    bp => len(bp?.polish?.hitTestBlocked),
  'polish.duplicateListItems':bp => len(bp?.polish?.duplicateListItems),
  'polish.aspectRatioBroken': bp => len(bp?.polish?.aspectRatioNotHonoured)
};

/* Per-breakpoint items with a meaningful identity, keyed by WHAT the defect is and not
 * just how many there are.
 *
 * This exists because a count alone missed the exact regression this module was built to
 * catch. A smoke page whose image lost its `src` reported `imageIssues: 1` before AND
 * after — "aspect distorted" became "broken, no intrinsic size" — so the count never moved
 * and the diff said nothing, while the incidental disappearance of the upscaled-image
 * warning got reported as an improvement. Keying on element + issue kind turns that into
 * what it is: one issue resolved, one much worse issue appeared.
 *
 * Identity is element + kind, deliberately not the src/url. A src that changes on every
 * deploy (hashed asset names, a CDN query string) would otherwise make every image look
 * newly broken on every run. */
const BP_ITEMS = {
  'layout.imageIssues':      bp => (bp.imageIssues || []).map(i => `${i.el || 'img'} — ${i.issue || 'issue'}`),
  'layout.emptyMediaSlots':  bp => idsOf(bp.emptyMediaSlots),
  'layout.collapsed':        bp => idsOf(bp.collapsedElements),
  'layout.clippedText':      bp => idsOf(bp.clippedText),
  'layout.invisibleText':    bp => idsOf(bp.invisibleText),
  'polish.cmsEmptyBindings': bp => idsOf(bp.polish?.cmsEmptyStates?.emptyBindings),
  'polish.cmsEmptyLists':    bp => idsOf(bp.polish?.cmsEmptyStates?.emptyLists)
};

/* Whole-page counted metrics, measured once. */
const ONCE_COUNTS = {
  'content.placeholderText':  e => len(e.once?.content?.placeholderText),
  'content.defaultRichText':  e => len(e.once?.content?.defaultRichText),
  'content.deadLinks':        e => len(e.once?.content?.deadLinks),
  'content.stagingLinks':     e => len(e.once?.content?.stagingLinks),
  'content.emptyHeadings':    e => len(e.once?.content?.emptyHeadings),
  'a11y.imagesMissingAlt':    e => len(e.once?.a11y_seo?.accessibility?.imagesMissingAlt),
  'a11y.duplicateIds':        e => len(e.once?.a11y_seo?.accessibility?.duplicateIds),
  'a11y.unlabeledFields':     e => len(e.once?.a11y_seo?.accessibility?.unlabeledFormFields),
  'a11y.brokenAriaRefs':      e => len(e.once?.a11y_seo?.accessibility?.brokenAriaRefs),
  'render.webFontsNotLoaded': e => len(e.once?.a11y_seo?.rendering?.webFontsNotLoaded),
  'console.errors':           e => e.console?.errorSummary
    ? e.console.errorSummary.firstPartyUnique + (e.console.pageErrorSummary?.firstPartyUnique ?? len(e.console?.pageErrors))
    : len(e.console?.errors) + len(e.console?.pageErrors),
  'network.badResponses':     e => (e.network?.badResponses || []).filter(item => !item.thirdParty).length,
  /* Phase-gated metrics return null — not 0 — when the phase did not run. `--no-links`
   * on one of the two runs would otherwise drop every broken link to zero and report
   * the lot as fixed, which is precisely the kind of confident-and-wrong output this
   * module exists to prevent. A skipped phase is unknown, not clean. */
  'links.broken':             e => (e.links && !e.links.error ? len(e.links.broken) : null),
  'forms.issues':             e => (e.forms && !e.forms.error ? len(e.forms.findings) : null),
  'typeScale.unscaled':       e => (e.typeScale ? len(e.typeScale.unscaled) : null),
  'design.typeFindings':      e => (e.design && !e.design.error ? len(e.design.typeFindings) : null),
  'design.sectionFindings':   e => (e.design && !e.design.error ? len(e.design.sectionFindings) : null)
};

/* Values, not counts. A change here is not automatically a defect — a title being
 * rewritten is normal — so these are reported as CHANGED and never as a regression,
 * with one exception: a value going from present to missing is a regression. */
const ONCE_VALUES = {
  'seo.title':        e => e.once?.a11y_seo?.seo?.title,
  'seo.description':  e => e.once?.a11y_seo?.seo?.metaDescription,
  'seo.canonical':    e => e.once?.a11y_seo?.seo?.canonical,
  'seo.ogImage':      e => e.once?.a11y_seo?.seo?.og?.image,
  'seo.favicon':      e => e.once?.a11y_seo?.seo?.favicon,
  'loadShift.cls':    e => e.loadShift?.cls
};

/* Identified items — the diff that can name what appeared or disappeared.
 * null means "this phase did not run", which is different from an empty array meaning
 * "it ran and found nothing"; only the latter may be diffed. */
const ONCE_ITEMS = {
  'links.broken':            e => (e.links && !e.links.error ? idsOf(e.links.broken) : null),
  'console.errors':          e => (e.console
    ? [...idsOf(e.console.errorSummary
        ? e.console.errorSummary.groups.filter(group => !group.thirdParty)
        : e.console.errors), ...idsOf(e.console.pageErrorSummary
          ? e.console.pageErrorSummary.groups.filter(group => !group.thirdParty)
          : e.console.pageErrors)]
    : null),
  'content.placeholderText': e => (e.once?.content && !e.once.content.error ? idsOf(e.once.content.placeholderText) : null),
  'content.deadLinks':       e => (e.once?.content && !e.once.content.error ? idsOf(e.once.content.deadLinks) : null),
  'network.badResponses':    e => (e.network ? idsOf(e.network.badResponses.filter(item => !item.thirdParty)) : null)
};

/* Per-heading rendered size, keyed by tag+text+breakpoint. This is what turns "the
 * type changed" into "this specific heading dropped from 42px to 32px", and it is the
 * cheapest available proxy for "someone edited a shared class and it landed here too". */
function typeSignature(entry) {
  const out = {};
  for (const [w, bp] of Object.entries(entry.byBreakpoint || {})) {
    for (const h of bp?.headingSizes || []) {
      const text = String(h.text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      if (!text) continue;
      out[`type.${h.tag || 'h'}|${text}@${w}`] = h.size;
    }
  }
  return out;
}

/* Page length per vision width. A page that got materially shorter lost content, and
 * that is worth a look even when every individual check still passes. */
function shapeSignature(entry) {
  const out = {};
  for (const [w, v] of Object.entries(entry.vision || {})) {
    if (v?.docHeight) out[`page.docHeight@${w}`] = v.docHeight;
  }
  for (const [w, bp] of Object.entries(entry.byBreakpoint || {})) {
    const c = bp?.horizontalOverflow?.docScrollWidth;
    if (c) out[`page.scrollWidth@${w}`] = c;
  }
  return out;
}

export function signature(entry) {
  const counts = {}, values = {}, items = {};
  for (const [w, bp] of Object.entries(entry.byBreakpoint || {})) {
    if (!bp || bp.error) continue;
    for (const [name, fn] of Object.entries(BP_COUNTS)) {
      const v = fn(bp);
      if (v != null) counts[`${name}@${w}`] = v;
    }
    // same key shape as the counts, so an identity diff suppresses its duplicate count line
    for (const [name, fn] of Object.entries(BP_ITEMS)) {
      const v = fn(bp);
      if (Array.isArray(v)) items[`${name}@${w}`] = v;
    }
  }
  for (const [name, fn] of Object.entries(ONCE_COUNTS)) {
    const v = fn(entry); if (v != null) counts[name] = v;
  }
  for (const [name, fn] of Object.entries(ONCE_VALUES)) {
    const v = fn(entry); if (v !== undefined && v !== null) values[name] = v;
  }
  // an empty array is a real answer ("ran, found nothing"); null is not, and is dropped
  for (const [name, fn] of Object.entries(ONCE_ITEMS)) {
    const v = fn(entry); if (Array.isArray(v)) items[name] = v;
  }
  Object.assign(values, typeSignature(entry), shapeSignature(entry));
  return { counts, values, items };
}

/* ── the diff ───────────────────────────────────────────────────────────────────*/

const MISSING = /^\(missing\)$/i;
const present = v => v !== undefined && v !== null && v !== false && !(typeof v === 'string' && MISSING.test(v));

/* A page-length or scroll-width change under this fraction is browser noise and font
 * rounding, not lost content. */
const SHAPE_TOLERANCE = 0.02;

function diffEntry(prev, curr, url) {
  const a = signature(prev), b = signature(curr);
  const regressions = [], fixes = [], changes = [];
  let compared = 0;

  /* Items first, so the counts pass can suppress any metric already reported by identity.
   * "broken links: 0 → 1" next to "broken links: 1 appeared — /team/jane" is the same
   * finding twice, and the named one is strictly more useful. Two lines for one defect is
   * how a report starts feeling padded. */
  const namedByIdentity = new Set();
  for (const key of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) {
    if (!Array.isArray(a.items[key]) || !Array.isArray(b.items[key])) continue;
    const was = new Set(a.items[key]), now = new Set(b.items[key]);
    const appeared = [...now].filter(x => !was.has(x));
    const resolved = [...was].filter(x => !now.has(x));
    compared++;
    if (appeared.length) { regressions.push({ key, kind: 'appeared', items: appeared.slice(0, 8), count: appeared.length }); namedByIdentity.add(key); }
    if (resolved.length) { fixes.push({ key, kind: 'resolved', items: resolved.slice(0, 8), count: resolved.length }); namedByIdentity.add(key); }
  }

  // counts: up is a regression, down is a fix
  for (const key of new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])) {
    const was = a.counts[key], now = b.counts[key];
    if (was == null || now == null) continue;          // not measured in both runs — say nothing
    compared++;
    if (now === was) continue;
    if (namedByIdentity.has(key)) continue;            // already reported, by name
    const rec = { key, kind: 'count', was, now, delta: now - was };
    (now > was ? regressions : fixes).push(rec);
  }

  // values: present→absent is a regression, otherwise a change worth reading
  for (const key of new Set([...Object.keys(a.values), ...Object.keys(b.values)])) {
    const was = a.values[key], now = b.values[key];
    if (was === undefined || now === undefined) {
      // a heading that existed and no longer does is content that disappeared
      if (key.startsWith('type.') && was !== undefined && now === undefined)
        regressions.push({ key, kind: 'gone', was, now: '(element not found)' });
      continue;
    }
    compared++;
    if (was === now) continue;
    // page shape: only report movement past the noise floor
    if (key.startsWith('page.')) {
      const wasN = Number(was), nowN = Number(now);
      if (Number.isFinite(wasN) && Number.isFinite(nowN) && wasN > 0) {
        if (Math.abs(nowN - wasN) / wasN < SHAPE_TOLERANCE) continue;
        const rec = { key, kind: 'shape', was: wasN, now: nowN, delta: nowN - wasN };
        (nowN < wasN ? regressions : changes).push(rec);
      }
      continue;
    }
    if (present(was) && !present(now)) regressions.push({ key, kind: 'lost', was, now });
    else changes.push({ key, kind: 'value', was, now });
  }

  const rank = r => (r.kind === 'appeared' ? 0 : r.kind === 'lost' || r.kind === 'gone' ? 1 : r.kind === 'shape' ? 2 : 3);
  regressions.sort((x, y) => rank(x) - rank(y) || Math.abs(y.delta || 0) - Math.abs(x.delta || 0));
  return { url, compared, regressions, fixes, changes };
}

/**
 * Diff a whole report against a baseline report.
 * Returns null when there is nothing usable to compare, so callers can stay quiet
 * rather than printing an empty section on a first run.
 */
export function diffRuns(baseline, report) {
  if (!baseline || baseline.error || !baseline.report?.urls?.length) return null;
  const prev = baseline.report;
  const notes = [];

  /* Config drift makes a naive diff lie. Breakpoints are the one that matters most:
   * comparing a 7-width run to a 2-width run would report five widths' worth of
   * defects as fixed. Keys are only diffed when present in both runs (see diffEntry),
   * so the correct behaviour falls out — but the reader still needs to be told. */
  const prevBps = new Set(prev.urls.flatMap(u => Object.keys(u.byBreakpoint || {})));
  const currBps = new Set(report.urls.flatMap(u => Object.keys(u.byBreakpoint || {})));
  const onlyPrev = [...prevBps].filter(w => !currBps.has(w));
  const onlyCurr = [...currBps].filter(w => !prevBps.has(w));
  if (onlyPrev.length) notes.push(`baseline covered ${onlyPrev.join(', ')}px and this run did not — those widths are not compared`);
  if (onlyCurr.length) notes.push(`this run adds ${onlyCurr.join(', ')}px, absent from the baseline — those widths are not compared`);
  if (String(prev.engines) !== String(report.engines))
    notes.push(`engines differ (baseline ${prev.engines}, now ${report.engines}) — cross-browser counts are not compared`);

  const byUrl = new Map(prev.urls.map(u => [u.url, u]));
  const urls = [];
  for (const curr of report.urls) {
    const p = byUrl.get(curr.url);
    if (!p) { notes.push(`${curr.url} is new since the baseline — nothing to compare`); continue; }
    urls.push(diffEntry(p, curr, curr.url));
  }
  for (const p of prev.urls) if (!report.urls.some(u => u.url === p.url))
    notes.push(`${p.url} was in the baseline but not swept this run`);

  if (!urls.length) return { baseline: baseline.dir, generatedAt: prev.generatedAt, notes, urls: [], comparable: false };
  return { baseline: baseline.dir, generatedAt: prev.generatedAt, notes, urls, comparable: true,
    totals: {
      regressions: urls.reduce((s, u) => s + u.regressions.length, 0),
      fixes: urls.reduce((s, u) => s + u.fixes.length, 0),
      changes: urls.reduce((s, u) => s + u.changes.length, 0)
    } };
}

/* ── rendering ──────────────────────────────────────────────────────────────────*/

const LABEL = {
  'layout.emptyMediaSlots': 'media slots with no resolved source',
  'layout.imageIssues': 'image problems',
  'layout.collapsed': 'elements collapsed to 0×0',
  'layout.clippedText': 'clipped text',
  'layout.invisibleText': 'invisible text',
  'layout.overflow': 'elements overflowing horizontally',
  'layout.scrollsSideways': 'page scrolls sideways',
  'layout.tinyTapTargets': 'tap targets under the minimum',
  'polish.cmsEmptyBindings': 'CMS bindings rendering empty',
  'polish.cmsEmptyLists': 'CMS lists rendering empty',
  'polish.upscaledImages': 'upscaled / pixelated images',
  'polish.gutterOutliers': 'container gutter outliers',
  'polish.oversizedSvgs': 'oversized SVGs',
  'content.placeholderText': 'placeholder / lorem text',
  'content.deadLinks': 'dead (#) links',
  'typeScale.unscaled': 'headings with no mobile type scale',
  'links.broken': 'broken links',
  'console.errors': 'console errors',
  'seo.title': 'page title',
  'seo.canonical': 'canonical URL',
  'seo.description': 'meta description',
  'loadShift.cls': 'cumulative layout shift'
};
const label = key => {
  const [base, bp] = key.split('@');
  const at = bp ? ` @${bp}px` : '';
  // type.h2|Who this is best for  →  h2 "Who this is best for"
  if (base.startsWith('type.')) {
    const [tag, ...rest] = base.slice(5).split('|');
    return `${tag} "${rest.join('|')}"${at}`;
  }
  if (base.startsWith('page.')) return `${base.slice(5)}${at}`;
  return (LABEL[base] || base) + at;
};

const fmt = r => {
  if (r.kind === 'appeared' || r.kind === 'resolved')
    return `${label(r.key)}: ${r.count} ${r.kind} — ${r.items.map(i => `\`${i}\``).join(', ')}${r.count > r.items.length ? ' …' : ''}`;
  if (r.kind === 'gone') return `${label(r.key)}: was \`${r.was}\`, element no longer on the page`;
  if (r.kind === 'lost') return `${label(r.key)}: was \`${r.was}\`, now \`${r.now}\``;
  if (r.kind === 'shape') return `${label(r.key)}: ${r.was} → ${r.now} (${r.delta > 0 ? '+' : ''}${Math.round(r.delta)})`;
  if (r.kind === 'value') return `${label(r.key)}: \`${r.was}\` → \`${r.now}\``;
  return `${label(r.key)}: ${r.was} → ${r.now} (${r.delta > 0 ? '+' : ''}${r.delta})`;
};

/**
 * Markdown lines for the top of summary.md. Regressions first and in full; fixes and
 * neutral changes summarised, because the reason this section is at the top is that a
 * regression is the most urgent thing in the report — burying it under a list of
 * everything that also moved would defeat the point.
 */
export function renderRegressionSection(diff, { maxPerUrl = 12 } = {}) {
  const lines = [];
  if (!diff) return lines;
  lines.push('## Since the previous run', '');
  lines.push(`Baseline: \`${diff.baseline}\` (${diff.generatedAt || 'unknown time'})`);
  diff.notes.forEach(n2 => lines.push(`- note: ${n2}`));
  if (!diff.comparable) { lines.push('', '- nothing comparable between the two runs.', ''); return lines; }
  const { regressions, fixes, changes } = diff.totals;
  lines.push('', `**${regressions} regression(s), ${fixes} fix(es), ${changes} other change(s).**`, '');
  if (!regressions) lines.push('No regressions — nothing that was working is now broken.', '');

  for (const u of diff.urls) {
    if (!u.regressions.length && !u.fixes.length && !u.changes.length) continue;
    lines.push(`### ${u.url}`);
    if (u.regressions.length) {
      lines.push('', '**REGRESSED — worked before, does not now:**');
      u.regressions.slice(0, maxPerUrl).forEach(r => lines.push(`- ⚠︎ ${fmt(r)}`));
      if (u.regressions.length > maxPerUrl) lines.push(`- …${u.regressions.length - maxPerUrl} more`);
    }
    if (u.changes.length) {
      lines.push('', '**Changed (not necessarily wrong — confirm it was intended):**');
      u.changes.slice(0, maxPerUrl).forEach(r => lines.push(`- ${fmt(r)}`));
      if (u.changes.length > maxPerUrl) lines.push(`- …${u.changes.length - maxPerUrl} more`);
    }
    if (u.fixes.length) {
      lines.push('', `**Improved: ${u.fixes.length}** — ` +
        u.fixes.slice(0, 6).map(r => label(r.key) + (r.delta ? ` (${r.delta})` : '')).join(', ') +
        (u.fixes.length > 6 ? ' …' : ''));
    }
    lines.push('');
  }
  return lines;
}
