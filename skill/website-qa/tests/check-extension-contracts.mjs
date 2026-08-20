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

console.log('Website QA finding identities and attribution sidecars are stable and validated.');
console.log(`Registry: ${FINDING_ARRAY_NAMES.length} finding arrays, ${AUDIT_METRICS.length} metrics — all indexed, diffable and labelled.`);
