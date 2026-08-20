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
