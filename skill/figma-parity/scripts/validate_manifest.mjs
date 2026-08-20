#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] || "figma-parity-manifest.json");
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

// Additive versions must not break older consumers (Parallax imports this packet),
// so accept any known version and only warn about a newer one.
const KNOWN_VERSIONS = [1, 2];
if (!KNOWN_VERSIONS.includes(packet.schemaVersion)) {
  if (Number.isInteger(packet.schemaVersion) && packet.schemaVersion > Math.max(...KNOWN_VERSIONS)) {
    warnings.push(`schemaVersion ${packet.schemaVersion} is newer than this validator knows (${KNOWN_VERSIONS.join(", ")}); additive fields are ignored`);
  } else {
    errors.push(`schemaVersion must be one of ${KNOWN_VERSIONS.join(", ")}`);
  }
}
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
if (![requested, compared, missing].every(Array.isArray)) errors.push("coverage requested, compared, and missing must be arrays");
else {
  const wanted = new Set(requested.map(cellKey));
  const accounted = [...compared, ...missing].map(cellKey);
  if (new Set(accounted).size !== accounted.length) errors.push("coverage cells must be accounted for exactly once");
  for (const key of wanted) if (!accounted.includes(key)) errors.push(`requested coverage cell is unaccounted: ${key.replaceAll("\0", " / ")}`);
  for (const key of accounted) if (!wanted.has(key)) errors.push(`accounted coverage cell was not requested: ${key.replaceAll("\0", " / ")}`);
  for (const cell of missing) required(cell.reason, `coverage.missing ${cellKey(cell)} reason`);
}

if (!Array.isArray(packet.evidence) || !packet.evidence.length) errors.push("evidence must not be empty");
else for (const [index, item] of packet.evidence.entries()) {
  const label = `evidence[${index}]`;
  required(item.id, `${label}.id`);
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
  if (typeof item.inspected !== "boolean") errors.push(`${label}.inspected must be boolean`);
  if (!["verified", "visual-only", "suspected"].includes(item.confidence)) errors.push(`${label}.confidence is invalid`);

  // Unknown capture conditions must not be dressed up as verified evidence.
  if (item.confidence === "verified") {
    if (item.live?.observedContentWidth === null) errors.push(`${label} is verified but live.observedContentWidth is unknown; horizontal measurement cannot be verified`);
    else if (Number.isInteger(item.live?.observedContentWidth) && item.live.observedContentWidth !== item.breakpoint) {
      errors.push(`${label} is verified but content width was ${item.live.observedContentWidth}px against breakpoint ${item.breakpoint}px`);
    }
    if (!item.limitations?.length && packet.target?.stable === false) {
      errors.push(`${label} is verified while target.stable is false and it lists no limitation`);
    }
  }
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
    for (const id of finding.evidenceIds || []) {
      if (!packet.evidence?.some((e) => e.id === id)) errors.push(`${key}[${index}] cites unknown evidence id: ${id}`);
    }
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

if (warnings.length) console.error(`WARNINGS (${warnings.length})\n${warnings.map((w) => `- ${w}`).join("\n")}`);
if (errors.length) {
  console.error(`INVALID (${errors.length})\n${errors.map((error) => `- ${error}`).join("\n")}`);
  process.exit(1);
}
const counts = [`${packet.evidence.length} evidence item(s)`,
  `${packet.coverage.compared.length}/${packet.coverage.requested.length} coverage cells compared`];
if (packet.findings?.length) counts.push(`${packet.findings.length} finding(s)`);
if (packet.docDrift?.length) counts.push(`${packet.docDrift.length} doc-drift note(s)`);
console.log(`VALID\n${counts.join("; ")}`);
