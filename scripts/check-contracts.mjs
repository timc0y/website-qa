import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'skill');
for (const file of ['design-spec.md', 'design-spec.schema.json']) {
  const websiteQa = readFileSync(path.join(root, 'website-qa', 'references', file), 'utf8');
  const figmaParity = readFileSync(path.join(root, 'figma-parity', 'references', file), 'utf8');
  assert.equal(figmaParity, websiteQa, `${file} drifted between independently installable skills`);
}
console.log('Shared design-spec contracts match exactly.');

const auditSchema = JSON.parse(readFileSync(path.join(root, 'website-qa', 'references', 'audit-manifest.schema.json'), 'utf8'));
assert.equal(auditSchema.properties.schemaVersion.const, 2, 'website-qa audit manifest schema version must match the runner');
const runner = readFileSync(path.resolve(import.meta.dirname, '..', 'skill', 'website-qa', 'runner', 'qa_runner.mjs'), 'utf8');
assert.match(runner, /schemaVersion:\s*2/);
assert.match(runner, /physicalDevice:\s*false/);
assert.match(runner, /devices:\s*\[\]/);
assert.match(runner, /No physical device was used/);
assert.doesNotMatch(runner, /filter\(image => image\.kind === 'tile' && image\.reviewable !== false\)/,
  'runner must retain unreviewable tiles in the evidence denominator');
console.log('Website QA manifest declares physical-device coverage honestly.');
