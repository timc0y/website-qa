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

console.log('Website QA finding identities and attribution sidecars are stable and validated.');
