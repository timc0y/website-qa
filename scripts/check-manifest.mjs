#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'skills.manifest.json'), 'utf8'));
const failures = [];
const names = new Set();

for (const harness of ['codex', 'claude', 'opencode']) {
  if (!manifest.requiredHarnesses?.includes(harness)) failures.push(`missing required harness: ${harness}`);
}

for (const skill of manifest.skills || []) {
  if (names.has(skill.name)) failures.push(`duplicate skill name: ${skill.name}`);
  names.add(skill.name);
  const file = path.resolve(root, skill.path, 'SKILL.md');
  if (!existsSync(file)) {
    failures.push(`${skill.name}: missing ${file}`);
    continue;
  }
  const source = readFileSync(file, 'utf8');
  if (!new RegExp(`^name:\\s*${skill.name}\\s*$`, 'm').test(source)) failures.push(`${skill.name}: frontmatter name mismatch`);
  if (skill.visibility !== 'public') failures.push(`${skill.name}: this package ships only public skills`);
  if (!skill.question?.endsWith('?')) failures.push(`${skill.name}: governing question missing`);
}

if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}
console.log(`Public skill manifest owns ${names.size} standalone skills across Codex, Claude, and OpenCode.`);
