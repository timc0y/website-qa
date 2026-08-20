#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(process.argv[2] || "review-attestation.json");
const root = path.dirname(file);
const errors = [];
const digest = (candidate) => crypto.createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
const resolveLocal = (candidate, label) => {
  if (typeof candidate !== "string" || !candidate.trim()) { errors.push(`${label} is required`); return null; }
  const resolved = path.resolve(root, candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) { errors.push(`${label} escapes the attestation directory`); return null; }
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) { errors.push(`${label} is missing: ${candidate}`); return null; }
  return resolved;
};

let packet;
try { packet = JSON.parse(fs.readFileSync(file, "utf8")); }
catch (error) { console.error(`INVALID\n- ${error.message}`); process.exit(1); }

if (packet.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (packet.provider !== "figma-parity-attestation") errors.push("provider must be figma-parity-attestation");
if (Number.isNaN(new Date(packet.generatedAt).valueOf())) errors.push("generatedAt must be a timestamp");
if (!['human-unverified', 'automated'].includes(packet.actor?.kind)) errors.push("actor.kind must be human-unverified or automated");
if (typeof packet.actor?.id !== "string" || !packet.actor.id.trim()) errors.push("actor.id is required");

const manifestFile = resolveLocal(packet.subject?.manifestPath, "subject.manifestPath");
let manifest = null;
if (manifestFile) {
  if (digest(manifestFile) !== packet.subject?.manifestSha256) errors.push("subject manifest hash does not match");
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")); } catch { errors.push("subject manifest is not valid JSON"); }
}
if (!Array.isArray(packet.attestations) || !packet.attestations.length) errors.push("attestations must not be empty");
else for (const [index, attestation] of packet.attestations.entries()) {
  if (typeof attestation.criterion !== "string" || !attestation.criterion.trim()) errors.push(`attestations[${index}].criterion is required`);
  if (!['match', 'mismatch', 'inconclusive'].includes(attestation.verdict)) errors.push(`attestations[${index}].verdict is invalid`);
  if (!Array.isArray(attestation.evidenceIds) || !attestation.evidenceIds.length) errors.push(`attestations[${index}].evidenceIds must not be empty`);
  else {
    const selected = attestation.evidenceIds.map((id) => manifest?.evidence?.find((entry) => entry.id === id));
    for (const [idIndex, selectedEvidence] of selected.entries()) if (!selectedEvidence) errors.push(`attestations[${index}] cites unknown evidence id: ${attestation.evidenceIds[idIndex]}`);
    if (selected.every(Boolean)) {
      const expectedScope = {
        routes: [...new Set(selected.map((entry) => entry.route))].sort(),
        breakpoints: [...new Set(selected.map((entry) => entry.breakpoint))].sort((a, b) => a - b),
        states: [...new Set(selected.map((entry) => entry.state))].sort(),
        nodeIds: [...new Set(selected.map((entry) => entry.figma?.nodeId).filter(Boolean))].sort()
      };
      if (JSON.stringify(attestation.scope) !== JSON.stringify(expectedScope)) errors.push(`attestations[${index}].scope does not match its cited evidence`);
    }
  }
}
if (!Array.isArray(packet.artifacts) || !packet.artifacts.length) errors.push("artifacts must not be empty");
else for (const [index, artifact] of packet.artifacts.entries()) {
  const artifactFile = resolveLocal(artifact.path, `artifacts[${index}].path`);
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256 || "")) errors.push(`artifacts[${index}].sha256 is invalid`);
  else if (artifactFile && digest(artifactFile) !== artifact.sha256) errors.push(`artifacts[${index}] hash does not match: ${artifact.path}`);
}

if (manifest) {
  const cited = new Set(packet.attestations.flatMap((entry) => entry.evidenceIds || []));
  const expected = new Set();
  for (const evidence of manifest.evidence || []) {
    if (!cited.has(evidence.id)) continue;
    for (const candidate of [evidence.figma?.path, evidence.live?.path, evidence.comparison?.sideBySidePath, evidence.comparison?.diffPath, evidence.comparison?.metricsPath]) {
      if (candidate) expected.add(path.resolve(path.dirname(manifestFile), candidate));
    }
  }
  const declared = new Set((packet.artifacts || []).map((artifact) => path.resolve(root, artifact.path)));
  if (expected.size !== declared.size || [...expected].some((candidate) => !declared.has(candidate))) {
    errors.push("artifacts do not exactly match the files referenced by cited evidence IDs");
  }
}

if (errors.length) { console.error(`INVALID\n${errors.map((error) => `- ${error}`).join("\n")}`); process.exit(1); }
console.log(`VALID\n${packet.actor.kind}:${packet.actor.id}; ${packet.attestations.length} attestation(s); ${packet.artifacts.length} bound artifact(s)`);
