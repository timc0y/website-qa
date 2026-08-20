#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skills = new Map([
  ['website-qa', path.join(root, 'skill', 'website-qa')],
  ['figma-parity', path.join(root, 'skill', 'figma-parity')],
]);
const destinations = [
  path.join(homedir(), '.codex', 'skills'),
  path.join(homedir(), '.claude', 'skills'),
  path.join(homedir(), '.config', 'opencode', 'skills'),
];
const check = process.argv.includes('--check');
let drift = 0;

function linkTarget(file) {
  try { return lstatSync(file).isSymbolicLink() ? readlinkSync(file) : null; }
  catch { return null; }
}

for (const destination of destinations) {
  mkdirSync(destination, { recursive: true });
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
