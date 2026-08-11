#!/usr/bin/env node
/*
 * build_manifest.mjs — assemble figma-parity-manifest.json from run artifacts.
 *
 * Reads what the run already produced rather than asking you to retype it:
 *   figma-map.json                    routes, section names, Figma node ids
 *   live/capture-<label>.json         the capture contract (per capture.mjs)
 *   review/<stamp>_<bp>/pairs.json    what was actually paired with what
 *   findings.json (optional)          your findings, incl. joint ownership
 *
 * Capture capabilities are derived from artifacts. Review conclusions are not:
 * this script never claims inspection or parity. A separate hash-bound
 * attestation records a named actor's verdict after review.
 *
 *   node build_manifest.mjs --run <run-dir> --map figma-map.json \
 *     --plan <run-dir>/review-plan.json --mode local-parity \
 *     [--label desktop] [--findings findings.json] \
 *     [--out figma-parity-manifest.json]
 *
 * Then always: node validate_manifest.mjs <out>
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const argv = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const run = path.resolve(arg('run', process.cwd()));
const mapPath = arg('map');
const planPath = arg('plan');
const mode = arg('mode', 'local-parity');
const label = arg('label', 'desktop');
const findingsPath = arg('findings');
const outPath = path.resolve(arg('out', path.join(run, 'figma-parity-manifest.json')));
if (!mapPath || !planPath) { console.error('usage: build_manifest.mjs --run <dir> --map figma-map.json --plan review-plan.json --mode <mode> [--label desktop]'); process.exit(2); }

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rel = (p) => path.relative(run, path.resolve(p));
const sha256 = (p) => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null);

const mapFile = path.resolve(mapPath);
const planFile = path.resolve(planPath);
const rawMap = readJson(mapFile);
const plan = readJson(planFile);
if (plan.provider !== 'figma-parity-plan' || plan.schemaVersion !== 1 || !Array.isArray(plan.cells) || !plan.cells.length) {
  console.error('invalid or empty frozen review plan'); process.exit(1);
}
if (plan.source?.mapSha256 !== sha256(mapFile)) {
  console.error('map changed after the review plan was frozen'); process.exit(1);
}
// A map may be flat (one route) or carry routes[]. Merge so shared keys survive.
const wantedRoute = arg('route');
const map = Array.isArray(rawMap.routes)
  ? { ...rawMap, ...(wantedRoute ? rawMap.routes.find((r) => r.route === wantedRoute) : rawMap.routes[0]) }
  : rawMap;
if (Array.isArray(rawMap.routes) && wantedRoute && !rawMap.routes.some((r) => r.route === wantedRoute)) {
  console.error(`route not in map: ${wantedRoute}`); process.exit(1);
}
const capturePath = path.join(run, 'live', `capture-${label}.json`);
if (!fs.existsSync(capturePath)) { console.error(`missing capture contract: ${capturePath}\nRun capture.mjs first.`); process.exit(1); }
const capture = readJson(capturePath);
const planSha256 = sha256(planFile);
if (capture.plan?.sha256 !== planSha256) {
  console.error('capture was not produced from this frozen review plan'); process.exit(1);
}

// Newest pairs.json under review/, so the manifest describes the sheet you looked at.
const reviewRoot = path.join(run, 'review');
const pairFiles = fs.existsSync(reviewRoot)
  ? fs.readdirSync(reviewRoot).map((d) => path.join(reviewRoot, d, 'pairs.json')).filter(fs.existsSync).sort()
  : [];
const pairs = pairFiles.length ? readJson(pairFiles.at(-1)) : { pairs: [], pairing: 'none' };
const sideBySideDir = pairFiles.length ? path.dirname(pairFiles.at(-1)) : null;

const route = map.route || new URL(capture.url).pathname;
const breakpoint = capture.requestedContentWidth;
if (plan.scope?.route !== route || plan.scope?.breakpoint !== breakpoint) {
  console.error(`review plan scope ${plan.scope?.route} / ${plan.scope?.breakpoint}px does not match capture ${route} / ${breakpoint}px`); process.exit(1);
}
const capturedPath = new URL(capture.url).pathname.replace(/\/$/, '') || '/';
const plannedPath = String(plan.scope.route).replace(/\/$/, '') || '/';
if (capturedPath !== plannedPath) {
  console.error(`capture URL path ${capturedPath} does not match frozen review-plan route ${plannedPath}`); process.exit(1);
}
const findings = findingsPath ? readJson(path.resolve(findingsPath)) : null;

// --- evidence ---------------------------------------------------------------
const byName = new Map(pairs.pairs.map((p) => [p.name, p]));
const evidence = [];
for (const section of capture.sections) {
  const pair = byName.get(section.name);
  const figmaImage = pair?.figma ? rel(pair.figma) : null;
  const liveImage = section.path ? rel(path.join(run, section.path)) : null;
  if (!figmaImage || !liveImage) continue; // unpaired cells belong in coverage.missing
  // This packet records observations only. Review conclusions belong in a
  // separate, hash-bound attestation produced after the artifacts are inspected.
  const limitations = [...(section.limitations || [])];
  if (section.observedContentWidth !== breakpoint) {
    limitations.push(`content width was ${section.observedContentWidth}px, not the ${breakpoint}px the Figma frame is drawn at; horizontal findings are unsafe`);
  }
  if (capture.target?.stable === false) limitations.push('the served document changed during the run');
  evidence.push({
    id: `${label}-${section.name}`,
    route, breakpoint, state: 'default',
    figma: { nodeId: section.figmaNodeId || pair?.node || 'unknown', path: figmaImage },
    live: {
      path: liveImage,
      captureProvider: section.captureProvider || capture.captureProvider || 'local',
      sha256: sha256(path.join(run, section.path)),
      viewport: { width: capture.windowWidth, height: 900 },
      observedContentWidth: section.observedContentWidth ?? null,
      settleMethod: section.settleMethod ?? null,
    },
    comparison: { sideBySidePath: sideBySideDir && pair?.sideBySide ? rel(path.join(sideBySideDir, pair.sideBySide)) : null },
    limitations,
  });
}

// --- coverage ---------------------------------------------------------------
const cell = (nodeId, state = 'default', bp = breakpoint) => ({ route, breakpoint: bp, state, figmaNodeId: nodeId });
const cellKey = (entry) => `${entry.route}\0${entry.breakpoint}\0${entry.state}\0${entry.figmaNodeId}`;
const requested = plan.cells.map(({ route: plannedRoute, breakpoint: plannedBreakpoint, state, figmaNodeId }) => ({
  route: plannedRoute, breakpoint: plannedBreakpoint, state, figmaNodeId
}));
const wanted = new Set(requested.map(cellKey));
const compared = evidence.map((e) => cell(e.figma.nodeId, e.state, e.breakpoint));
for (const observed of compared) {
  if (!wanted.has(cellKey(observed))) {
    console.error(`captured evidence is outside the frozen review plan: ${cellKey(observed).replaceAll('\0', ' / ')}`); process.exit(1);
  }
}
const declaredMissing = (map.coverage?.missing || [])
  .map((m) => ({ ...cell(m.figmaNodeId, m.state, m.breakpoint ?? breakpoint), reason: m.reason }))
  .filter((entry) => wanted.has(cellKey(entry)));

// A "covered via another route" claim is only as good as the registry entry
// backing it. Verify the componentId actually has an instance at the claimed
// route and breakpoint before trusting it; an unverifiable claim is exactly
// the false confidence the registry exists to prevent, so it gets downgraded
// to missing instead of silently accepted.
const registry = map.components?.registry || {};
const coveredViaComponent = [];
const downgradedToMissing = [];
for (const c of map.coverage?.coveredViaComponent || []) {
  const instances = registry[c.componentId] || [];
  const match = instances.find((i) => i.route === c.coveredVia && i.breakpoint === c.breakpoint);
  if (match) {
    const covered = { ...cell(c.figmaNodeId ?? match.figmaNodeId ?? null, c.state, c.breakpoint), coveredVia: c.coveredVia, componentId: c.componentId };
    if (wanted.has(cellKey(covered))) coveredViaComponent.push(covered);
    else console.error(`WARNING: coveredViaComponent claim is outside the frozen plan and was ignored: ${c.componentId} / ${c.coveredVia} / ${c.breakpoint}px`);
  } else {
    const downgraded = {
      ...cell(c.figmaNodeId ?? null, c.state, c.breakpoint),
      reason: `claimed "covered via ${c.coveredVia}" for component ${c.componentId}, but no registry entry backs a ${c.breakpoint}px instance on that route; downgraded to missing`,
    };
    if (wanted.has(cellKey(downgraded))) downgradedToMissing.push(downgraded);
    console.error(`WARNING: unverifiable coveredViaComponent claim ${wanted.has(cellKey(downgraded)) ? 'downgraded to missing' : 'is outside the frozen plan and was ignored'}: ${c.componentId} / ${c.coveredVia} / ${c.breakpoint}px`);
  }
}
declaredMissing.push(...downgradedToMissing);
// Component reuse is context, not proof. It remains an annotation and cannot
// satisfy a frozen coverage cell without evidence from this exact route/state.
const accounted = new Set([...compared, ...declaredMissing].map(cellKey));
for (const planned of requested) {
  if (!accounted.has(cellKey(planned))) {
    const reuse = coveredViaComponent.find((entry) => cellKey(entry) === cellKey(planned));
    declaredMissing.push({
      ...planned,
      reason: reuse
        ? `frozen review-plan cell has no route-specific evidence; component reuse is annotated via ${reuse.coveredVia} but does not satisfy coverage`
        : 'frozen review-plan cell has no paired capture evidence'
    });
  }
}

// --- capabilities, derived from what actually exists -------------------------
const hasDiff = evidence.some((e) => e.comparison.diffPath);
const capabilities = {
  figmaNodeData: Boolean(map.sections?.some((s) => s.figmaNodeId)),
  figmaRenders: evidence.some((e) => e.figma.path),
  liveScreenshots: evidence.some((e) => e.live.path || e.live.artifactId),
  responsive: new Set(requested.map((c) => c.breakpoint)).size > 1,
  numericMeasurements: Boolean(capture.measurements),
  visualComparison: false,
  pixelDiff: hasDiff,
  interactiveStates: requested.some((c) => c.state !== 'default'),
  interactionTransitions: fs.existsSync(path.join(run, 'live', 'verify-interactive.json')),
  designSourceDefects: Boolean(findings?.designSourceDefects?.length),
  crossBrowser: false,
  regression: false,
};
// forge-live-evidence cannot have driven a control or measured the DOM itself.
if (mode === 'forge-live-evidence') {
  capabilities.interactionTransitions = false;
  capabilities.numericMeasurements = capabilities.numericMeasurements && capture.captureProvider === 'local';
}

// --- limitations, seeded from the capture contract ---------------------------
const limitations = [];
if (capture.reservedGutter) limitations.push(`The document reserves ${capture.reservedGutter}px of scrollbar gutter, so captures used a ${capture.windowWidth}px window to obtain the ${breakpoint}px content width the Figma frame is drawn at.`);
if (!capture.contentWidthMatches) limitations.push(`Observed content width was ${capture.observedContentWidth}px against a requested ${breakpoint}px; horizontal measurements are not trustworthy.`);
if (capture.target?.stable === false) limitations.push(`The served document changed during the run (start sha256 ${String(capture.target.start?.sha256).slice(0, 12)}, end ${String(capture.target.end?.sha256).slice(0, 12)}). Evidence must not be blended across the change.`);
if (!capture.settle?.settled) limitations.push('The page never reached two consecutive equal document heights; geometry is approximate.');
if (!capabilities.pixelDiff) limitations.push('No pixel diffs: section pairs did not share dimensions, so a diff mask would locate layout offsets rather than defects.');
if (!capabilities.crossBrowser) limitations.push('Single browser and OS; no cross-browser evidence.');
if (!capture.masks?.length) limitations.push('No masks were applied; no volatile regions were hidden.');
limitations.push(...(findings?.limitations || []));

const manifest = {
  schemaVersion: 4,
  provider: 'figma-parity',
  generatedAt: new Date().toISOString(),
  targetUrl: capture.url,
  plan: { path: rel(planFile), sha256: planSha256, mapSha256: plan.source.mapSha256, frozenAt: plan.frozenAt },
  source: { kind: 'figma', fileKey: map.fileKey, fileUrl: map.fileUrl },
  execution: { mode, capabilities, captureProviders: [...new Set(evidence.map((e) => e.live.captureProvider))] },
  target: capture.target,
  coverage: { requested, compared, missing: declaredMissing, coveredViaComponent },
  evidence,
  findings: findings?.findings || [],
  designSourceDefects: findings?.designSourceDefects || [],
  docDrift: findings?.docDrift || [],
  externalReferences: rawMap.externalReferences || [],
  scheduledForDeletion: rawMap.scheduledForDeletion || [],
  artifacts: {
    report: fs.existsSync(path.join(run, 'report.md')) ? 'report.md' : undefined,
    captureContract: rel(capturePath),
    contactSheet: sideBySideDir ? rel(path.join(sideBySideDir, 'index.html')) : undefined,
    pairingRecord: pairFiles.length ? rel(pairFiles.at(-1)) : undefined,
    fullPage: capture.fullPage,
  },
  limitations,
};
for (const [k, v] of Object.entries(manifest.artifacts)) if (v === undefined) delete manifest.artifacts[k];
// Drop nulls the schema would reject rather than emitting an invalid packet.
for (const e of manifest.evidence) if (!e.comparison.sideBySidePath) delete e.comparison.sideBySidePath;

fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
const extra = [];
if (coveredViaComponent.length) extra.push(`${coveredViaComponent.length} covered via a component registry entry`);
if (downgradedToMissing.length) extra.push(`${downgradedToMissing.length} downgraded from an unverifiable coveredViaComponent claim`);
if (manifest.externalReferences.length) extra.push(`${manifest.externalReferences.length} external reference(s)`);
if (manifest.scheduledForDeletion.length) extra.push(`${manifest.scheduledForDeletion.length} page(s) scheduled for deletion`);
process.stdout.write(`${outPath}\n${evidence.length} evidence item(s), ${compared.length}/${requested.length} cells compared, ${limitations.length} limitation(s)${extra.length ? `\n${extra.join('; ')}` : ''}\nNow run: node validate_manifest.mjs ${path.relative(process.cwd(), outPath)}\n`);
