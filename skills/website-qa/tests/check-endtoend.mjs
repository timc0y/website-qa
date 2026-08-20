#!/usr/bin/env node
/*
 * check-endtoend.mjs — run the whole runner against a page built to be broken, and assert
 * the defects reach the artefacts a reader actually opens.
 *
 * Every module in this skill is proven in isolation, and their COMPOSITION was proven only
 * by me running it against a live site and reading the output. That is the gap this closes,
 * and it is not theoretical: three of the four things asserted below have been broken by an
 * edit at some point — a detector whose findings never reached the summary because one of
 * five files was not updated, a measurement path that skipped the role pass, and a ranking
 * that read a different table from the report it led.
 *
 * A local fixture server, so the test is fast, offline and deterministic. The page contains
 * one of each defect class the box-model family exists for, plus a carousel that must NOT
 * be reported, because a run that finds everything is as useless as one that finds nothing.
 *
 *   node tests/check-endtoend.mjs
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, '..', 'runner', 'qa_runner.mjs');

/* One page, every defect deliberate:
 *   - a fixed-height card clipping its copy            → escapesParent
 *   - an absolutely placed chip over a stat number     → overlappingContent
 *   - an unbreakable word wider than its column        → textCannotFit
 *   - a sized media box holding nothing                → emptyMediaSlots
 *   - a carousel track whose slides leave their frame  → must stay silent
 * The carousel is named `strip`/`item` on purpose: nothing here matches a slider name
 * list, so only shape analysis can recognise it. */
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fixture page for end-to-end QA</title>
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #111; background: #fff }
  .card { width: 320px; height: 44px; overflow: hidden; margin: 24px }
  .stat { position: relative; width: 320px; margin: 24px }
  .stat_value { font-size: 44px; font-weight: 700 }
  .chip { position: absolute; left: 40px; top: 30px; width: 120px; height: 40px; background: #fff }
  .col { width: 150px; margin: 24px }
  .media { width: 400px; height: 240px; background: #eee; margin: 24px }
  .frame { width: 300px; overflow-x: clip; margin: 24px }
  .strip { display: flex; gap: 16px; width: 300px }
  .item { flex: 0 0 280px; background: #f3f3f3; padding: 12px }
</style></head><body>
<h1>Fixture page</h1>
<div class="card"><p>Key person cover pays out to the business if a named individual dies,
  so payroll and lending covenants can still be met while a replacement is recruited.</p></div>
<div class="stat"><div class="stat_value">1.2x</div><p>Average policy improvement</p>
  <div class="chip">covering</div></div>
<div class="col"><p>Ask about Unternehmensnachfolgeversicherung today</p></div>
<div class="media"></div>
<div class="frame"><div class="strip">
  <div class="item">Relevant life</div><div class="item">Key person</div>
  <div class="item">Shareholder</div></div></div>
</body></html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const out = mkdtempSync(join(tmpdir(), 'website-qa-e2e-'));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}`);
  if (!cond && detail) console.log(`    ${detail}`);
  cond ? pass++ : fail++;
};

try {
  /* Phases that need the network or minutes of wall clock are off: this test proves the
   * pipeline carries findings end to end, not that every phase works — those have their own
   * tests. `--no-baseline` because a first run has nothing to diff against. */
  /* `spawn`, not `spawnSync`. The fixture server lives in THIS process, and spawnSync
   * blocks the event loop — so the child's requests were never answered, every navigation
   * timed out, and the run produced nothing. The test's own first assertion passed anyway,
   * which is a tidy demonstration of why "the command exited" is not proof of anything. */
  const run = await new Promise(resolve => {
    const child = spawn(process.execPath, [RUNNER, `--url=${url}`, `--out=${out}`,
      '--breakpoints=1280,393', '--sweep=0', '--no-interact', '--no-vision', '--no-links',
      '--no-baseline'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
    child.on('close', status => { clearTimeout(timer); resolve({ status, stdout, stderr }); });
  });

  /* Exit 1 IS the correct outcome here — it is the CI signal for "high-signal defect
   * found", and this page is built to contain several. What must not happen is a crash. */
  ok('the runner completes on a broken page and signals findings',
    run.status === 1 && /Full data:/.test(run.stdout) && readdirSync(out).length > 0,
    `status ${run.status} · ${(run.stderr || run.stdout || '').slice(-400)}`);

  const stamp = readdirSync(out)[0];
  const dir = join(out, stamp);
  const read = f => JSON.parse(readFileSync(join(dir, f), 'utf8'));

  for (const f of ['summary.md', 'findings.json', 'finding-index.json', 'audit-manifest.json'])
    ok(`writes ${f}`, existsSync(join(dir, f)));

  const findings = read('findings.json');
  const summary = readFileSync(join(dir, 'summary.md'), 'utf8');
  const index = read('finding-index.json');
  const manifest = read('audit-manifest.json');
  const bp = findings.urls[0].byBreakpoint[1280];

  // 1) the defects are detected at all
  ok('detects the fixed-height card clipping its copy', (bp.escapesParent || []).length > 0,
    JSON.stringify(bp.escapesParent));
  ok('detects the chip covering the stat number', (bp.overlappingContent || []).length > 0,
    JSON.stringify(bp.overlappingContent));
  ok('detects the word wider than its column', (bp.textCannotFit || []).length > 0,
    JSON.stringify(bp.textCannotFit));
  ok('detects the empty media box', (bp.emptyMediaSlots || []).length > 0,
    JSON.stringify(bp.emptyMediaSlots));

  /* 2) …and the carousel is NOT reported, which only shape analysis can decide: no class
   * here matches any slider name list. This is the assertion that fails if the role pass
   * stops running or stops being consulted. */
  ok('stays silent about the carousel frame, recognised by shape and not by name',
    !(bp.clippedText || []).some(f => /frame|strip/.test(f.el || '')),
    JSON.stringify(bp.clippedText));
  ok('published roles, and a track among them',
    (bp.roles?.counts?.track || 0) >= 1, JSON.stringify(bp.roles?.counts));
  ok('measured slack, so the fit family ran', typeof bp.measured === 'number' && bp.measured > 0,
    JSON.stringify({ measured: bp.measured, slackError: bp.slackError }));

  /* 3) the pipeline: a detected defect has to survive into every artefact a reader opens.
   * This is the composition failure that individual module tests cannot see. */
  ok('the summary names a defect it found',
    /escaping their parent|covering content|wider than their box/.test(summary), summary.slice(0, 400));
  ok('ranks findings by content lost, worst first',
    /Worst first \(\d+ finding/.test(summary) && findings.urls[0].impact.findings > 0,
    JSON.stringify(findings.urls[0].impact?.top?.slice(0, 2)));
  ok('every finding got a stable id in the index', index.findings.length > 0 &&
    index.findings.every(f => /^wqa:[a-z-]+:[a-f0-9]{20}$/.test(f.findingId)),
    JSON.stringify(index.findings.slice(0, 2)));
  ok('the manifest states what ran and what it cost',
    manifest.provider === 'website-qa' && manifest.configuration.cost.pageLoads > 0 &&
    Array.isArray(manifest.limitations), JSON.stringify(manifest.configuration?.cost));
  ok('the manifest records a skipped phase as off, not as clean',
    manifest.configuration.phases.vision === false && manifest.configuration.phases.links === false,
    JSON.stringify(manifest.configuration.phases));
  ok('reports the cost of the run in the summary',
    /## What this run cost/.test(summary) && /page load\(s\)/.test(summary));
} finally {
  await new Promise(resolve => server.close(resolve));
  rmSync(out, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
