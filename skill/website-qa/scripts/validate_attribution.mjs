#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.argv[2] || 'finding-attribution.json');
const errors = [];
let packet;
try { packet = JSON.parse(fs.readFileSync(file, 'utf8')); }
catch (error) { console.error(`INVALID\n- ${error.message}`); process.exit(1); }
if (packet.schemaVersion !== 1) errors.push('schemaVersion must be 1');
if (packet.provider !== 'website-qa-attribution') errors.push('provider must be website-qa-attribution');
if (typeof packet.findingIndex !== 'string' || !packet.findingIndex) errors.push('findingIndex is required');
const indexFile = packet.findingIndex ? path.resolve(path.dirname(file), packet.findingIndex) : null;
let known = new Set();
try {
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  if (index.schemaVersion !== 1 || index.provider !== 'website-qa' || !Array.isArray(index.findings)) throw new Error('invalid finding index contract');
  const findingIds = index.findings.map(item => item.findingId);
  known = new Set(findingIds);
  if (known.size !== findingIds.length) throw new Error('finding index contains duplicate findingId values');
} catch (error) { errors.push(`findingIndex cannot be used: ${error.message}`); }
if (!Array.isArray(packet.attributions)) errors.push('attributions must be an array');
else {
  const seen = new Set();
  for (const [index, item] of packet.attributions.entries()) {
    const label = `attributions[${index}]`;
    if (!known.has(item?.findingId)) errors.push(`${label}.findingId is not in the finding index: ${item?.findingId}`);
    if (seen.has(item?.findingId)) errors.push(`${label}.findingId is duplicated`);
    seen.add(item?.findingId);
    for (const field of ['cause', 'fixLocation']) if (typeof item?.[field] !== 'string' || !item[field].trim()) errors.push(`${label}.${field} is required`);
    if (!Array.isArray(item?.evidence) || !item.evidence.length || item.evidence.some(value => typeof value !== 'string' || !value.trim())) errors.push(`${label}.evidence must contain references`);
  }
}
if (errors.length) { console.error(`INVALID\n${errors.map(error => `- ${error}`).join('\n')}`); process.exit(1); }
console.log(`VALID\n${packet.attributions.length} attribution(s) reference ${known.size} indexed finding(s)`);
