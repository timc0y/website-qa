#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const cliArgs = process.argv.slice(2);
const file = path.resolve(cliArgs.find((value) => !value.startsWith("--")) || "figma-parity-manifest.json");
const root = path.dirname(file);
const errors = [];
const warnings = [];
let packet;
try { packet = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (error) { console.error(`INVALID\n- ${error.message}`); process.exit(1); }

const required = (value, label) => {
  if (typeof value !== "string" || !value.trim()) errors.push(`${label} is required`);
};
const cellKey = (cell) => `${cell?.route}\0${cell?.breakpoint}\0${cell?.state}\0${cell?.figmaNodeId}`;
const localFile = (candidate, label) => {
  if (!candidate) return;
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) errors.push(`${label} escapes the run directory`);
  else if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) errors.push(`${label} is missing: ${candidate}`);
};
const digest = (candidate) => crypto.createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");

if (packet.schemaVersion !== 4) errors.push("schemaVersion must be 4");
if (packet.provider !== "figma-parity") errors.push("provider must be figma-parity");
required(packet.generatedAt, "generatedAt");
if (Number.isNaN(new Date(packet.generatedAt).valueOf())) errors.push("generatedAt must be a timestamp");
try { new URL(packet.targetUrl); } catch { errors.push("targetUrl must be an absolute URL"); }
if (packet.source?.kind !== "figma") errors.push("source.kind must be figma");
required(packet.source?.fileKey, "source.fileKey");
if (!["local-parity", "interactive-parity", "forge-live-evidence"].includes(packet.execution?.mode)) errors.push("execution.mode is invalid");
if (!packet.execution?.capabilities || Array.isArray(packet.execution.capabilities)) errors.push("execution.capabilities must be an object");
else for (const [name, enabled] of Object.entries(packet.execution.capabilities)) if (typeof enabled !== "boolean") errors.push(`execution.capabilities.${name} must be boolean`);

const requested = packet.coverage?.requested;
const compared = packet.coverage?.compared;
const missing = packet.coverage?.missing;
const coveredViaComponent = packet.coverage?.coveredViaComponent || [];
if (![requested, compared, missing].every(Array.isArray)) errors.push("coverage requested, compared, and missing must be arrays");
else if (!Array.isArray(coveredViaComponent)) errors.push("coverage.coveredViaComponent must be an array when present");
else {
  const wanted = new Set(requested.map(cellKey));
  const accounted = [...compared, ...missing].map(cellKey);
  if (new Set(accounted).size !== accounted.length) errors.push("coverage cells must be accounted for exactly once");
  for (const key of wanted) if (!accounted.includes(key)) errors.push(`requested coverage cell is unaccounted: ${key.replaceAll("\0", " / ")}`);
  for (const key of accounted) if (!wanted.has(key)) errors.push(`accounted coverage cell was not requested: ${key.replaceAll("\0", " / ")}`);
  for (const cell of missing) required(cell.reason, `coverage.missing ${cellKey(cell)} reason`);
  for (const cell of coveredViaComponent) {
    required(cell.coveredVia, `coverage.coveredViaComponent ${cellKey(cell)} coveredVia`);
    required(cell.componentId, `coverage.coveredViaComponent ${cellKey(cell)} componentId`);
  }
  for (const cell of coveredViaComponent) {
    if (!missing.some((entry) => cellKey(entry) === cellKey(cell))) {
      errors.push(`coverage.coveredViaComponent is an annotation and cannot satisfy a cell: ${cellKey(cell).replaceAll("\0", " / ")}`);
    }
  }
}

if (packet.schemaVersion === 4) {
  required(packet.plan?.path, "plan.path");
  required(packet.plan?.sha256, "plan.sha256");
  required(packet.plan?.mapSha256, "plan.mapSha256");
  const planFile = packet.plan?.path ? path.resolve(root, packet.plan.path) : null;
  localFile(packet.plan?.path, "plan.path");
  if (planFile && fs.existsSync(planFile)) {
    if (digest(planFile) !== packet.plan.sha256) errors.push("plan hash does not match");
    try {
      const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
      if (plan.provider !== "figma-parity-plan" || plan.schemaVersion !== 1) errors.push("plan artifact is invalid");
      if (plan.source?.mapSha256 !== packet.plan.mapSha256) errors.push("plan map hash does not match the manifest");
      const planned = new Set((plan.cells || []).map(cellKey));
      const manifested = new Set((packet.coverage?.requested || []).map(cellKey));
      if (planned.size !== manifested.size || [...planned].some((key) => !manifested.has(key))) {
        errors.push("coverage.requested does not exactly match the frozen review plan");
      }
    } catch (error) {
      errors.push(`plan artifact is unreadable: ${error.message}`);
    }
  }
}

if (!Array.isArray(packet.evidence) || !packet.evidence.length) errors.push("evidence must not be empty");
else {
const evidenceIds = new Set();
for (const [index, item] of packet.evidence.entries()) {
  const label = `evidence[${index}]`;
  required(item.id, `${label}.id`);
  if (evidenceIds.has(item.id)) errors.push(`${label}.id is duplicated: ${item.id}`);
  evidenceIds.add(item.id);
  required(item.route, `${label}.route`);
  if (!Number.isInteger(item.breakpoint) || item.breakpoint < 1) errors.push(`${label}.breakpoint must be a positive integer`);
  required(item.state, `${label}.state`);
  required(item.figma?.nodeId, `${label}.figma.nodeId`);
  required(item.figma?.path, `${label}.figma.path`);
  localFile(item.figma?.path, `${label}.figma.path`);
  required(item.live?.captureProvider, `${label}.live.captureProvider`);
  if (!item.live?.path && !(item.live?.artifactId && /^[a-f0-9]{64}$/i.test(item.live?.sha256 || ""))) errors.push(`${label}.live needs a local path or artifactId plus sha256`);
  localFile(item.live?.path, `${label}.live.path`);
  required(item.comparison?.sideBySidePath, `${label}.comparison.sideBySidePath`);
  localFile(item.comparison?.sideBySidePath, `${label}.comparison.sideBySidePath`);
  localFile(item.comparison?.diffPath, `${label}.comparison.diffPath`);
  localFile(item.comparison?.metricsPath, `${label}.comparison.metricsPath`);
  if (Object.hasOwn(item, "inspected")) errors.push(`${label}.inspected is not part of the observation contract`);
  if (Object.hasOwn(item, "confidence")) errors.push(`${label}.confidence is not part of the observation contract`);
}
}
if (packet.execution?.capabilities?.visualComparison === true) {
  errors.push("execution.capabilities.visualComparison cannot be true in an observation manifest; cite a valid review attestation separately");
}

// Findings, when present, must carry an owner. `both` exists for the case where
// the Figma source is internally inconsistent -- see references/report-template.md.
for (const key of ["findings", "designSourceDefects"]) {
  if (packet[key] === undefined) continue;
  if (!Array.isArray(packet[key])) { errors.push(`${key} must be an array`); continue; }
  for (const [index, finding] of packet[key].entries()) {
    required(finding.summary, `${key}[${index}].summary`);
    if (!["high", "medium", "low", "motion"].includes(finding.severity)) errors.push(`${key}[${index}].severity is invalid`);
    if (!["build", "design", "both", "content"].includes(finding.owner)) errors.push(`${key}[${index}].owner is invalid`);
    if (Object.hasOwn(finding, "confidence")) {
      errors.push(`${key}[${index}].confidence is not part of the observation contract; record conclusions through a review attestation`);
    }
    for (const id of finding.evidenceIds || []) {
      if (!packet.evidence?.some((e) => e.id === id)) errors.push(`${key}[${index}] cites unknown evidence id: ${id}`);
    }
  }
}

// externalReferences names a check this skill's Figma-diff model cannot perform
// itself (see references/project-map.md); each entry must at least say where to
// look and why it isn't in Figma.
if (packet.externalReferences !== undefined) {
  if (!Array.isArray(packet.externalReferences)) errors.push("externalReferences must be an array");
  else for (const [index, ref] of packet.externalReferences.entries()) {
    required(ref.url, `externalReferences[${index}].url`);
    try { new URL(ref.url); } catch { errors.push(`externalReferences[${index}].url must be an absolute URL`); }
    required(ref.route, `externalReferences[${index}].route`);
    required(ref.note, `externalReferences[${index}].note`);
  }
}

// scheduledForDeletion asserts a CONFIRMED owner decision, not a suggestion --
// see references/project-map.md. A flagged-but-undecided page belongs in
// designSourceDefects instead, so require the fields that prove a decision
// exists rather than letting a hopeful guess pass as a fact.
if (packet.scheduledForDeletion !== undefined) {
  if (!Array.isArray(packet.scheduledForDeletion)) errors.push("scheduledForDeletion must be an array");
  else for (const [index, page] of packet.scheduledForDeletion.entries()) {
    required(page.route, `scheduledForDeletion[${index}].route`);
    required(page.why, `scheduledForDeletion[${index}].why`);
    required(page.decidedBy, `scheduledForDeletion[${index}].decidedBy`);
    required(page.decidedOn, `scheduledForDeletion[${index}].decidedOn`);
  }
}

// Cross-provider pixel diffs are noise, not evidence.
const providers = new Set((packet.evidence || []).map((e) => e.live?.captureProvider).filter(Boolean));
if (providers.size > 1 && packet.execution?.capabilities?.pixelDiff) {
  warnings.push(`evidence mixes capture providers (${[...providers].join(", ")}) while pixelDiff is true; confirm no diff crosses providers`);
}
if (packet.execution?.mode === "forge-live-evidence" && packet.execution?.capabilities?.interactionTransitions) {
  errors.push("forge-live-evidence cannot prove interactionTransitions: no control was driven locally");
}
if (packet.target?.stable === false && !(packet.limitations || []).some((l) => /chang(ed|ing)|republish|mutat/i.test(l))) {
  errors.push("target.stable is false but no limitation discloses that the target changed mid-run");
}
if (!Array.isArray(packet.limitations)) errors.push("limitations must be an array");
for (const [name, candidate] of Object.entries(packet.artifacts || {})) localFile(candidate, `artifacts.${name}`);

if (warnings.length) console.error(`WARNINGS (${warnings.length})\n${warnings.map((w) => `- ${w}`).join("\n")}`);
if (errors.length) {
  console.error(`INVALID (${errors.length})\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exit(1);
}
const counts = [`${packet.evidence.length} evidence item(s)`,
  `${packet.coverage.compared.length}/${packet.coverage.requested.length} coverage cells compared`];
if (coveredViaComponent.length) counts.push(`${coveredViaComponent.length} covered via a component`);
if (packet.findings?.length) counts.push(`${packet.findings.length} finding(s)`);
if (packet.docDrift?.length) counts.push(`${packet.docDrift.length} doc-drift note(s)`);
if (packet.externalReferences?.length) counts.push(`${packet.externalReferences.length} external reference(s)`);
if (packet.scheduledForDeletion?.length) counts.push(`${packet.scheduledForDeletion.length} page(s) scheduled for deletion`);
console.log(`VALID\n${counts.join("; ")}`);
