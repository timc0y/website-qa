import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'qa-output', 'test-results', 'playwright-report']);
const textExtensions = new Set([
  '.css', '.html', '.js', '.json', '.md', '.mjs', '.txt', '.yaml', '.yml',
]);

const restrictedIdentifiers = [
  'c2lkZW1hbg==',
  'c3B1cndpbmc=',
  'c3V0dG9ucw==',
  'YWV0aG9z',
  'Z2V0cmVhbA==',
  'Z2V0IHJlYWw=',
  'Z2V0LXJlYWw=',
  'Z3JlZ2dz',
  'ZXhlYy1saWZl',
  'a2V5bWFu',
  'aGVhZHRlYWNoZXI=',
  'cmVkd29vZA==',
  'b2FrLXBsYXRmb3Jt',
  'c2l0ZWNoZWNr',
  'd2YtcWEtZmlnbWE=',
  'Z2l0aHViLmNvbS90aW1jMHkvd2ViZmxvdw==',
  'ZXhlY3V0aXZlIGxpZmU=',
  'ZXhlYyBsaWZl',
  'c3BhcmthZHZpc29ycw==',
  'c2luZ2xlLWRpcmVjdG9y',
  'bXVsdGlwbGUtZGlyZWN0b3Jz',
  'cmVsZXZhbnQtbGlmZS1pbnN1cmFuY2U=',
  'dGVhbS1tZW1iZXJzL3FhLXBsYWNlaG9sZGVy',
  'cmlXVlRKQWpRYU5FNXJPOEJvdzV4ZA==',
].map((value) => Buffer.from(value, 'base64').toString('utf8').toLowerCase());

const absolutePathPatterns = [
  /\/Users\//i,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\/i,
];
const opaqueIdPattern = /\b[0-9a-f]{24}\b/i;
const populatedFigmaUrlPattern = /https:\/\/(?:www\.)?figma\.com\/design\/(?![<:]|example(?:[-_]))[A-Za-z0-9_-]{8,}\//i;
const allowedExternalDomains = new Set([
  '127.0.0.1',
  'localhost',
  'cdn.example.test',
  'dev.w3.org',
  'developer.chrome.com',
  'developer.mozilla.org',
  'developers.google.com',
  'developers.webflow.com',
  'docs.astro.build',
  'example.com',
  'example.test',
  'figma.test',
  'github.com',
  'help.webflow.com',
  'json-schema.org',
  'playwright.dev',
  'raw.githubusercontent.com',
  'reference.example',
  'registry.npmjs.org',
  's.com',
  'site.com',
  'site.test',
  'skills.local',
  'stylelint.io',
  'tracker.test',
  'university.webflow.com',
  'www.browserstack.com',
  'www.edps.europa.eu',
  'www.figma.com',
  'www.rfc-editor.org',
  'www.s.com',
  'www.sitemaps.org',
  'www.w3.org',
  'www.zaproxy.org',
]);
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
    for (const token of restrictedIdentifiers) {
      if (searchable.includes(token)) failures.push(`${relative}: contains a restricted project identifier`);
    }
    for (const pattern of absolutePathPatterns) {
      if (pattern.test(content)) failures.push(`${relative}: contains an absolute user path`);
    }
    if (opaqueIdPattern.test(content)) failures.push(`${relative}: contains a 24-character opaque identifier`);
    if (populatedFigmaUrlPattern.test(content)) {
      failures.push(`${relative}: contains a populated Figma design URL; use a placeholder in the public package`);
    }
    for (const match of content.matchAll(/\bhttps?:\/\/([A-Za-z0-9.-]+)/gi)) {
      const domain = match[1].toLowerCase();
      if (!allowedExternalDomains.has(domain)) {
        failures.push(`${relative}: contains an unreviewed external domain (${domain})`);
      }
    }

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
