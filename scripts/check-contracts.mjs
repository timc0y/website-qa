import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'skills');
for (const file of ['design-spec.md', 'design-spec.schema.json']) {
  const websiteQa = readFileSync(path.join(root, 'website-qa', 'references', file), 'utf8');
  const figmaParity = readFileSync(path.join(root, 'figma-parity', 'references', file), 'utf8');
  assert.equal(figmaParity, websiteQa, `${file} drifted between independently installable skills`);
}
console.log('Shared design-spec contracts match exactly.');

const auditSchema = JSON.parse(readFileSync(path.join(root, 'website-qa', 'references', 'audit-manifest.schema.json'), 'utf8'));
assert.equal(auditSchema.properties.schemaVersion.const, 2, 'website-qa audit manifest schema version must match the runner');
const runner = readFileSync(path.resolve(import.meta.dirname, '..', 'skills', 'website-qa', 'runner', 'qa_runner.mjs'), 'utf8');
assert.match(runner, /schemaVersion:\s*2/);
assert.match(runner, /physicalDevice:\s*false/);
assert.match(runner, /devices:\s*\[\]/);
assert.match(runner, /No physical device was used/);
assert.doesNotMatch(runner, /filter\(image => image\.kind === 'tile' && image\.reviewable !== false\)/,
  'runner must retain unreviewable tiles in the evidence denominator');
console.log('Website QA manifest declares physical-device coverage honestly.');

assert.match(runner, /annotateFindings\(report\)/);
assert.match(runner, /finding-index\.json/);
assert.match(runner, /one\('vocabulary', ''\)/);
assert.doesNotMatch(runner, /one\('selectors'/);
const attributionValidator = readFileSync(path.join(root, 'website-qa', 'scripts', 'validate_attribution.mjs'), 'utf8');
assert.match(attributionValidator, /findingId is not in the finding index/);
console.log('Website QA exposes explicit vocabulary input and stable, sidecar-safe finding identities.');

const spine = readFileSync(path.resolve(import.meta.dirname, '..', 'skill-spine.md'), 'utf8');
for (const name of ['website-qa', 'figma-parity']) {
  const source = readFileSync(path.join(root, name, 'SKILL.md'), 'utf8');
  assert.match(source, /boundary → contract → selection → profile → execution → evidence → outcome → replay/);
}
assert.match(spine, /Client:/);
assert.match(spine, /Visitor:/);
assert.match(spine, /Developer:/);
assert.match(spine, /Time:/);
console.log('Public skills share the complete spine and four-seat foundation.');
