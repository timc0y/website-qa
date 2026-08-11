#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const values = (name) => argv.flatMap((value, index) => value === `--${name}` && argv[index + 1] ? [argv[index + 1]] : []);
const value = (name) => values(name).at(-1);
const required = (name) => {
  const result = value(name);
  if (!result) throw new Error(`--${name} is required`);
  return result;
};
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

try {
  const manifestFile = path.resolve(required("manifest"));
  const manifestRoot = path.dirname(manifestFile);
  const outputFile = path.resolve(value("out") || path.join(manifestRoot, "review-attestation.json"));
  const actorKind = required("actor-kind");
  const actorId = required("actor-id");
  const criterion = required("criterion");
  const verdict = required("verdict");
  const evidenceIds = values("evidence");
  if (actorKind === 'human') throw new Error("unsigned human identity is not trusted; use human-unverified for a non-gating record or automated for a named automated review");
  if (!['human-unverified', 'automated'].includes(actorKind)) throw new Error("--actor-kind must be human-unverified or automated");
  if (!['match', 'mismatch', 'inconclusive'].includes(verdict)) throw new Error("--verdict must be match, mismatch, or inconclusive");
  if (!evidenceIds.length) throw new Error("provide at least one --evidence <id>");

  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const selected = evidenceIds.map((id) => {
    const found = manifest.evidence?.find((entry) => entry.id === id);
    if (!found) throw new Error(`unknown evidence id: ${id}`);
    return found;
  });
  const scope = {
    routes: [...new Set(selected.map((entry) => entry.route))].sort(),
    breakpoints: [...new Set(selected.map((entry) => entry.breakpoint))].sort((a, b) => a - b),
    states: [...new Set(selected.map((entry) => entry.state))].sort(),
    nodeIds: [...new Set(selected.map((entry) => entry.figma?.nodeId).filter(Boolean))].sort()
  };
  const artifactPaths = new Set();
  for (const evidence of selected) {
    for (const candidate of [evidence.figma?.path, evidence.live?.path, evidence.comparison?.sideBySidePath, evidence.comparison?.diffPath, evidence.comparison?.metricsPath]) {
      if (candidate) artifactPaths.add(candidate);
    }
  }
  const artifacts = [...artifactPaths].map((relativePath) => {
    const resolved = path.resolve(manifestRoot, relativePath);
    if (resolved !== manifestRoot && !resolved.startsWith(`${manifestRoot}${path.sep}`)) throw new Error(`artifact escapes manifest directory: ${relativePath}`);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`artifact is missing: ${relativePath}`);
    return { path: path.relative(path.dirname(outputFile), resolved), sha256: digest(resolved) };
  });
  const packet = {
    schemaVersion: 1,
    provider: "figma-parity-attestation",
    generatedAt: new Date().toISOString(),
    subject: { manifestPath: path.relative(path.dirname(outputFile), manifestFile), manifestSha256: digest(manifestFile) },
    actor: { kind: actorKind, id: actorId },
    attestations: [{ criterion, scope, verdict, evidenceIds, ...(value("note") ? { note: value("note") } : {}) }],
    artifacts
  };
  fs.writeFileSync(outputFile, `${JSON.stringify(packet, null, 2)}\n`);
  process.stdout.write(`${outputFile}\n${actorKind}:${actorId} attested ${evidenceIds.length} evidence item(s) as ${verdict}\n`);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
