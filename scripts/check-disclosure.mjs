import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'qa-output', 'test-results', 'playwright-report']);
const textExtensions = new Set([
  '.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.yaml', '.yml',
]);

const joined = (...parts) => parts.join('');
const forbiddenText = [
  joined('side', 'man'),
  joined('spur', 'wing'),
  joined('sutton', 's'),
  joined('ae', 'thos'),
  joined('get', 'real'),
  joined('get', ' real'),
  joined('greg', 'gs'),
  joined('exec', '-life'),
  joined('key', 'man'),
  joined('head', 'teacher'),
  joined('red', 'wood'),
  joined('oak', '-platform'),
  joined('site', 'check'),
  joined('wf-qa', '-figma'),
  joined('github.com/', 'timc0y', '/webflow'),
].map((value) => value.toLowerCase());

const absolutePathPatterns = [
  /\/Users\//i,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\/i,
];
const opaqueIdPattern = /\b[0-9a-f]{24}\b/i;
const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const relative = path.relative(root, file);
    const stat = await lstat(file);

    if (stat.isSymbolicLink()) {
      failures.push(`${relative}: symlinks are not allowed in the public package`);
      continue;
    }
    if (stat.isDirectory()) {
      await walk(file);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    const content = await readFile(file, 'utf8');
    const searchable = `${relative}\n${content}`.toLowerCase();
    for (const token of forbiddenText) {
      if (searchable.includes(token)) failures.push(`${relative}: contains a restricted project identifier`);
    }
    for (const pattern of absolutePathPatterns) {
      if (pattern.test(content)) failures.push(`${relative}: contains an absolute user path`);
    }
    if (opaqueIdPattern.test(content)) failures.push(`${relative}: contains a 24-character opaque identifier`);

    if (path.extname(entry.name).toLowerCase() === '.md') {
      for (const match of content.matchAll(markdownLinkPattern)) {
        const target = match[1].trim().split(/\s+/)[0].replace(/^<|>$/g, '');
        if (!target || target.startsWith('#') || /^[a-z]+:/i.test(target)) continue;
        const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
        if (!resolved.startsWith(`${root}${path.sep}`)) {
          failures.push(`${relative}: link escapes the public repository (${target})`);
          continue;
        }
        try {
          await lstat(resolved);
        } catch {
          failures.push(`${relative}: broken relative link (${target})`);
        }
      }
    }
  }
}

await walk(root);

if (failures.length) {
  console.error(`Disclosure check failed with ${failures.length} issue(s):`);
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Disclosure check passed: no restricted identifiers, local paths, opaque IDs, symlinks, or broken relative links.');
