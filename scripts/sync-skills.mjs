#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'skills.manifest.json'), 'utf8'));
const skills = new Map(manifest.skills.map((skill) => [skill.name, path.resolve(root, skill.path)]));
const harnessPaths = {
  codex: path.join(homedir(), '.codex', 'skills'),
  claude: path.join(homedir(), '.claude', 'skills'),
  opencode: path.join(homedir(), '.config', 'opencode', 'skills'),
  gemini: path.join(homedir(), '.gemini', 'config', 'skills'),
};
const destinations = [...manifest.requiredHarnesses, ...(manifest.optionalHarnesses || [])].map((name) => harnessPaths[name]);
const check = process.argv.includes('--check');
let drift = 0;

function linkTarget(file) {
  try { return lstatSync(file).isSymbolicLink() ? readlinkSync(file) : null; }
  catch { return null; }
}

for (const destination of destinations) {
  if (!existsSync(destination)) {
    drift += 1;
    console.log(`${check ? 'DRIFT' : 'FIX'} create ${destination}`);
    if (!check) mkdirSync(destination, { recursive: true });
    else continue;
  }
  for (const [name, target] of skills) {
    const link = path.join(destination, name);
    const current = linkTarget(link);
    if (current === target) continue;
    drift += 1;
    console.log(`${check ? 'DRIFT' : 'FIX'} ${link} -> ${target}`);
    if (!check) {
      if (current !== null || existsSync(link)) rmSync(link, { recursive: true, force: true });
      symlinkSync(target, link);
    }
  }
}

if (drift === 0) console.log('Website quality skills are linked to the standalone repository.');
else if (check) process.exitCode = 1;
else console.log(`Repointed ${drift} skill link(s).`);
