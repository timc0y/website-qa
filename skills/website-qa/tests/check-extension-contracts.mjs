import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { annotateFindings } from '../runner/lib/finding-ids.mjs';

const first = { urls: [{ url: 'https://example.test/', byBreakpoint: { 393: { imageIssues: [{ el: 'img.hero', issue: 'missing source' }] } } }] };
const second = structuredClone(first);
const firstIndex = annotateFindings(first);
const secondIndex = annotateFindings(second);
assert.equal(firstIndex.length, 1);
assert.equal(firstIndex[0].findingId, secondIndex[0].findingId);
assert.match(firstIndex[0].findingId, /^wqa:image-issues:[a-f0-9]{20}$/);
assert.equal(first.urls[0].byBreakpoint[393].imageIssues[0].findingId, firstIndex[0].findingId);
const collision = { findings: [{ selector: '#x', summary: 'first' }, { selector: '#x', summary: 'second' }] };
const collisionIndex = annotateFindings(collision);
assert.equal(new Set(collisionIndex.map(item => item.findingId)).size, 2);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'website-qa-attribution-'));
try {
  fs.writeFileSync(path.join(temp, 'finding-index.json'), JSON.stringify({ schemaVersion: 1, provider: 'website-qa', findings: firstIndex }));
  const sidecar = { schemaVersion: 1, provider: 'website-qa-attribution', findingIndex: 'finding-index.json', attributions: [{ findingId: firstIndex[0].findingId, cause: 'empty source attribute', fixLocation: 'hero image data', evidence: ['inspection-1'] }] };
  const file = path.join(temp, 'attribution.json');
  fs.writeFileSync(file, JSON.stringify(sidecar));
  const validator = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/validate_attribution.mjs');
  const valid = spawnSync('node', [validator, file], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  sidecar.attributions[0].findingId = 'wqa:unknown:00000000000000000000';
  fs.writeFileSync(file, JSON.stringify(sidecar));
  const invalid = spawnSync('node', [validator, file], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /not in the finding index/);
  fs.writeFileSync(path.join(temp, 'finding-index.json'), JSON.stringify({ schemaVersion: 1, provider: 'website-qa', findings: [firstIndex[0], firstIndex[0]] }));
  const duplicate = spawnSync('node', [validator, file], { encoding: 'utf8' });
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /duplicate findingId/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

/* ── the registry is the single declaration, and every consumer must actually read it ──
 * The failure this catches is the one that motivated the registry: a detector is added, it
 * runs, it finds the defect — and because one of four other files was not edited, the
 * finding never reaches the report, the finding index or the baseline. Nothing errors. The
 * report just reads "clean". So: every declared finding array must be indexed, every metric
 * must be diffable and labelled, and the ids that stored baselines depend on must not move. */
const { AUDIT_METRICS, FINDING_ARRAY_NAMES, LAYOUT_FINDINGS, METRIC_LABELS, SUMMARY_BITS } =
  await import('../runner/lib/registry.mjs');
const { signature } = await import('../runner/lib/regress.mjs');

assert.ok(FINDING_ARRAY_NAMES.length >= 14, 'registry declares the layout finding arrays');

// every declared array is stamped with stable finding ids
{
  const bp = Object.fromEntries(FINDING_ARRAY_NAMES.map(name => [name, [{ el: 'div.x', issue: 'y' }]]));
  const index = annotateFindings({ urls: [{ url: 'https://example.test/', byBreakpoint: { 1512: bp } }] });
  const kinds = new Set(index.map(item => item.kind));
  for (const name of FINDING_ARRAY_NAMES) {
    const slug = name.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
    assert.ok(kinds.has(slug), `declared array ${name} reaches the finding index as ${slug}`);
  }
}

// every declared metric is diffable and named
{
  const bp = Object.fromEntries(FINDING_ARRAY_NAMES.map(name => [name, []]));
  bp.horizontalOverflow = { offenders: [], pageScrollsSideways: false };
  bp.polish = {};
  const sig = signature({ byBreakpoint: { 1512: bp }, once: {} });
  for (const m of AUDIT_METRICS) {
    assert.equal(typeof m.count, 'function', `${m.metric} declares how it is counted`);
    assert.ok(METRIC_LABELS[m.metric], `${m.metric} declares a human label`);
    assert.ok(`${m.metric}@1512` in sig.counts, `${m.metric} reaches the regression signature`);
  }
}

/* Metric ids are frozen by every baseline already on disk. Renaming one silently makes
 * stored runs incomparable, and the diff then reports a page of phantom new findings —
 * which reads exactly like a site that just broke. */
for (const frozen of ['layout.collapsed', 'layout.wrapping', 'layout.clippedText',
  'layout.overflow', 'layout.scrollsSideways', 'layout.imageIssues', 'layout.emptyMediaSlots']) {
  assert.ok(AUDIT_METRICS.some(m => m.metric === frozen), `frozen metric id ${frozen} still exists`);
}

// a high-severity finding must show up in the per-breakpoint summary line
for (const entry of LAYOUT_FINDINGS.filter(e => e.severity === 'high')) {
  assert.ok(SUMMARY_BITS.some(b => b.bit === entry.bit),
    `${entry.array} is high severity and must appear in the summary line`);
}

/* ── engine diffs and the non-Chromium path ─────────────────────────────────────
 * These were the least-tested judgements in the sweep: while `diffEngines`/`diffSweeps`
 * lived inside the runner the only way to exercise them was a full two-engine run against
 * a live site, and the Chromium-only capability was asserted by construction alone. Both
 * are pure once extracted, and the CDP failure path needs no browser at all. */
const { diffEngines, diffSweeps } = await import('../runner/lib/engines.mjs');
{
  const bpA = { 1512: { horizontalOverflow: { offenders: [1], pageScrollsSideways: false }, collapsedElements: [] } };
  const bpB = { 1512: { horizontalOverflow: { offenders: [1], pageScrollsSideways: true }, collapsedElements: [] } };
  const out = diffEngines(bpA, bpB, [1512], 'chromium', 'webkit');
  assert.equal(out.length, 1, 'one metric differs');
  assert.equal(out[0].metric, 'scrollsSideways');
  assert.equal(out[0].chromium, 0);
  assert.equal(out[0].webkit, 1);
  assert.equal(diffEngines(bpA, bpA, [1512], 'chromium', 'webkit').length, 0,
    'identical engines produce no difference');
  // a breakpoint one engine failed to audit must not read as a difference
  assert.equal(diffEngines(bpA, { 1512: { error: 'audit failed' } }, [1512], 'a', 'b').length, 0);
}
{
  const a = { findings: [{ kind: 'overlappingContent', what: 'div.stat', range: '992–1120px' },
                         { kind: 'escapesParent', what: 'div.card', range: '393px' }] };
  const b = { findings: [{ kind: 'overlappingContent', what: 'div.stat', range: '1000–1100px' },
                         { kind: 'clippedText', what: 'section.svc', range: '393–767px' }] };
  const out = diffSweeps(a, b, 'chromium', 'webkit');
  const only = out.filter(f => f.onlyIn);
  assert.equal(only.length, 2, 'one band per engine appears in only one of them');
  assert.ok(only.some(f => f.onlyIn === 'webkit' && f.kind === 'clippedText'),
    'a band present only in the second engine is the finding');
  /* A band that merely SHIFTED is the same defect. Reporting it as two would bury the real
   * engine difference under noise, which is the whole reason identity excludes the range. */
  const shifted = out.filter(f => !f.onlyIn);
  assert.equal(shifted.length, 1);
  assert.equal(shifted[0].kind, 'overlappingContent');
  assert.equal(shifted[0].chromium, '992–1120px');
  assert.equal(shifted[0].webkit, '1000–1100px');
}
{
  /* No CDP — a WebKit or Firefox run. It must say so and return, never throw and never
   * quietly report zero attributions as though it had looked. */
  const { attributeFindings } = await import('../runner/lib/attribution.mjs');
  const fakePage = { context: () => ({ newCDPSession: async () => { throw new Error('not supported'); } }) };
  const res = await attributeFindings(fakePage, [{ el: 'div.card' }]);
  assert.equal(res.available, false);
  assert.match(res.why, /Chromium only/);
  assert.equal(res.attributed, 0);
}

console.log('Website QA finding identities and attribution sidecars are stable and validated.');
console.log(`Registry: ${FINDING_ARRAY_NAMES.length} finding arrays, ${AUDIT_METRICS.length} metrics — all indexed, diffable and labelled.`);
