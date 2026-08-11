#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const skills = ['website-qa', 'figma-parity'];
const failures = [];
const denseProsePhrases = [
  'outer loop',
  'delivery loop',
  'operational ownership',
  'source authority',
  'evidence packet',
  'independence boundary',
  'comparison matrix',
  'mutation workflow',
  'mutation loop',
  'typed mutation',
  'provider-neutral',
  'gate state',
  'delivery state',
];

for (const name of skills) {
  const directory = path.join(root, 'skill', name);
  const skillFile = path.join(directory, 'SKILL.md');
  const source = readFileSync(skillFile, 'utf8');
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) failures.push(`${skillFile}: missing frontmatter`);
  else {
    if (!new RegExp(`^name:\\s*${name}$`, 'm').test(frontmatter[1])) failures.push(`${skillFile}: name must be ${name}`);
    if (!/^description:/m.test(frontmatter[1])) failures.push(`${skillFile}: missing description`);
  }

  const lines = source.split(/\r?\n/).length;
  if (lines > 350) failures.push(`${skillFile}: ${lines} lines; move detail into references (project max 350)`);
  if (/\b(?:TODO|FIXME|TBD)\b/.test(source)) failures.push(`${skillFile}: unresolved TODO/FIXME/TBD marker`);
  for (const phrase of denseProsePhrases) {
    if (source.toLowerCase().includes(phrase)) failures.push(`${skillFile}: replace dense prose phrase ${JSON.stringify(phrase)}`);
  }

  const metadataFile = path.join(directory, 'agents', 'openai.yaml');
  if (!existsSync(metadataFile)) failures.push(`${directory}: missing agents/openai.yaml`);
  else {
    const metadata = readFileSync(metadataFile, 'utf8');
    for (const field of ['display_name:', 'short_description:', 'default_prompt:']) {
      if (!metadata.includes(field)) failures.push(`${metadataFile}: missing ${field}`);
    }
    if (!metadata.includes(`$${name}`)) failures.push(`${metadataFile}: default prompt must invoke $${name}`);
    for (const phrase of denseProsePhrases) {
      if (metadata.toLowerCase().includes(phrase)) failures.push(`${metadataFile}: replace dense prose phrase ${JSON.stringify(phrase)}`);
    }
  }

  const references = path.join(directory, 'references');
  for (const file of readdirSync(references).filter((entry) => entry.endsWith('.md'))) {
    if (!source.includes(`references/${file}`)) failures.push(`${skillFile}: reference is not routed from SKILL.md (${file})`);
    const reference = readFileSync(path.join(references, file), 'utf8');
    if (reference.split(/\r?\n/).length > 100 && !reference.includes('## In this file')) {
      failures.push(`${path.join(references, file)}: references over 100 lines need an 'In this file' index`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`ERROR: ${failure}`);
  process.exit(1);
}

console.log('Website QA skill entry docs, reference routing, and launcher metadata are valid.');
