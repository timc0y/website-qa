#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "figma-parity-test-"));

try {
  const expected = path.join(temp, "figma.png");
  const actual = path.join(temp, "live.png");
  const comparison = path.join(temp, "comparison.png");
  const diff = path.join(temp, "diff.png");
  const metrics = path.join(temp, "metrics.json");
  execFileSync("python3", ["-c", "from PIL import Image; import sys; Image.new('RGB',(2,1),(255,255,255)).save(sys.argv[1]); im=Image.new('RGB',(2,1),(255,255,255)); im.putpixel((1,0),(0,0,0)); im.save(sys.argv[2]); Image.new('RGB',(2,1),(20,20,20)).save(sys.argv[3])", expected, actual, comparison]);
  execFileSync("python3", [path.join(root, "scripts/compare_images.py"), "--expected", expected, "--actual", actual, "--out", diff, "--metrics", metrics], { stdio: "pipe" });
  const result = JSON.parse(fs.readFileSync(metrics, "utf8"));
  assert.equal(result.comparedPixels, 2);
  assert.equal(result.changedPixels, 1);
  assert.equal(result.changedRatio, 0.5);
  assert.deepEqual(result.changeBounds, { x: 1, y: 0, width: 1, height: 1 });

  const cell = { route: "/", breakpoint: 390, state: "entry", figmaNodeId: "1:2" };
  const packet = {
    schemaVersion: 1, provider: "figma-parity", generatedAt: "2026-08-03T12:00:00.000Z",
    targetUrl: "https://example.test/", source: { kind: "figma", fileKey: "abc" },
    execution: { mode: "local-parity", capabilities: { figmaRenders: true, liveScreenshots: true, visualComparison: true, pixelDiff: true } },
    coverage: { requested: [cell], compared: [cell], missing: [] },
    evidence: [{ id: "home-phone", route: "/", breakpoint: 390, state: "entry",
      figma: { nodeId: "1:2", path: "figma.png" },
      live: { captureProvider: "local", path: "live.png", viewport: { width: 390, height: 844 } },
      comparison: { sideBySidePath: "comparison.png", diffPath: "diff.png", metricsPath: "metrics.json" },
      inspected: true, confidence: "verified", limitations: [] }],
    limitations: []
  };
  const manifest = path.join(temp, "figma-parity-manifest.json");
  fs.writeFileSync(manifest, `${JSON.stringify(packet, null, 2)}\n`);
  const valid = execFileSync("node", [path.join(root, "scripts/validate_manifest.mjs"), "--allow-legacy", manifest], { encoding: "utf8" });
  assert.match(valid, /VALID/);

  packet.coverage.compared = [];
  fs.writeFileSync(manifest, `${JSON.stringify(packet, null, 2)}\n`);
  const invalid = spawnSync("node", [path.join(root, "scripts/validate_manifest.mjs"), manifest], { encoding: "utf8" });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /unaccounted/);

  const run = (mutate) => {
    const copy = structuredClone(packet);
    copy.coverage.compared = [cell];
    mutate(copy);
    fs.writeFileSync(manifest, `${JSON.stringify(copy, null, 2)}\n`);
    return spawnSync("node", [path.join(root, "scripts/validate_manifest.mjs"), "--allow-legacy", manifest], { encoding: "utf8" });
  };

  // schemaVersion 2 is accepted; a newer version warns rather than failing, so a
  // packet from a future run stays readable by an older consumer.
  assert.match(run((p) => { p.schemaVersion = 2; }).stdout, /VALID/);
  const future = run((p) => { p.schemaVersion = 99; });
  assert.equal(future.status, 0);
  assert.match(future.stderr, /newer than this validator/);

  // Unknown capture conditions must not be dressed up as verified.
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.evidence[0].live.observedContentWidth = null;
  }).stderr, /observedContentWidth is unknown/);
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.evidence[0].live.observedContentWidth = 375;
  }).stderr, /content width was 375px/);

  // A mid-run target change cannot be silently absorbed.
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.target = { stable: false };
  }).stderr, /no limitation discloses/);

  // Forge cannot have driven a control locally.
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.execution.mode = "forge-live-evidence";
    p.execution.capabilities.interactionTransitions = true;
  }).stderr, /cannot prove interactionTransitions/);

  // Findings need a severity and an owner; `both` is legal, nonsense is not.
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.findings = [{ summary: "x", severity: "high", owner: "both" }];
  }).stdout, /VALID/);
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.findings = [{ summary: "x", severity: "critical", owner: "nobody" }];
  }).stderr, /severity is invalid/);
  assert.match(run((p) => {
    p.schemaVersion = 2;
    p.findings = [{ summary: "x", severity: "low", owner: "build", evidenceIds: ["ghost"] }];
  }).stderr, /unknown evidence id: ghost/);

  // schemaVersion 3 adds coverage.coveredViaComponent, externalReferences and
  // scheduledForDeletion. A backed claim is a normal, valid coverage cell.
  const coveredCell = { route: "/", breakpoint: 393, state: "default", figmaNodeId: "1:9" };
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.coverage.requested = [...p.coverage.requested, coveredCell];
    p.coverage.coveredViaComponent = [{ ...coveredCell, coveredVia: "/other-route", componentId: "Hero/X" }];
  }).stdout, /VALID/);

  // A coveredViaComponent cell missing its provenance fields is rejected, not
  // silently accepted as a plain compared cell would be.
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.coverage.requested = [...p.coverage.requested, coveredCell];
    p.coverage.coveredViaComponent = [{ ...coveredCell }];
  }).stderr, /coveredVia/);

  // externalReferences must name a URL, a route and a reason it isn't in Figma.
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.externalReferences = [{ url: "https://example.test/services", route: "/service-a", note: "stakeholder-cited reference" }];
  }).stdout, /VALID/);
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.externalReferences = [{ route: "/service-a", note: "no url" }];
  }).stderr, /externalReferences\[0\]\.url is required/);
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.externalReferences = [{ url: "not-a-url", route: "/service-a", note: "bad url" }];
  }).stderr, /must be an absolute URL/);

  // scheduledForDeletion asserts a CONFIRMED decision; decidedBy/decidedOn are
  // required so a hopeful guess cannot pass as a fact.
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.scheduledForDeletion = [{ route: "/team/example", why: "placeholder person", decidedBy: "owner", decidedOn: "2026-08-05" }];
  }).stdout, /VALID/);
  assert.match(run((p) => {
    p.schemaVersion = 3;
    p.scheduledForDeletion = [{ route: "/team/example", why: "placeholder person" }];
  }).stderr, /scheduledForDeletion\[0\]\.decidedBy is required/);

  // compare_images.py refuses what would produce noise instead of evidence.
  const tall = path.join(temp, "tall.png");
  execFileSync("python3", ["-c", "from PIL import Image; import sys; Image.new('RGB',(2,3),(255,255,255)).save(sys.argv[1])", tall]);
  const crossProvider = spawnSync("python3", [path.join(root, "scripts/compare_images.py"),
    "--expected", expected, "--actual", actual, "--out", diff, "--metrics", metrics,
    "--expected-provider", "local", "--actual-provider", "forge"], { encoding: "utf8" });
  assert.equal(crossProvider.status, 1);
  assert.match(crossProvider.stderr, /refusing to diff across capture providers/);

  const mismatched = spawnSync("python3", [path.join(root, "scripts/compare_images.py"),
    "--expected", expected, "--actual", tall, "--out", diff, "--metrics", metrics], { encoding: "utf8" });
  assert.equal(mismatched.status, 1);
  assert.match(mismatched.stderr, /crop-to-common/);

  execFileSync("python3", [path.join(root, "scripts/compare_images.py"),
    "--expected", expected, "--actual", tall, "--out", diff, "--metrics", metrics,
    "--crop-to-common"], { stdio: "pipe" });
  const cropped = JSON.parse(fs.readFileSync(metrics, "utf8"));
  assert.equal(cropped.croppedToCommon.height, 1);
  assert.equal(cropped.croppedToCommon.actualHeight, 3);

  // compose_review pairs by name from the map, and warns when it cannot.
  const figmaDir = path.join(temp, "fig");
  const liveDir = path.join(temp, "live");
  fs.mkdirSync(figmaDir); fs.mkdirSync(liveDir);
  execFileSync("python3", ["-c",
    "from PIL import Image; import sys; [Image.new('RGB',(4,4),(200,200,200)).save(p) for p in sys.argv[1:]]",
    path.join(figmaDir, "01-hero.png"), path.join(figmaDir, "02-nav.png"),
    path.join(liveDir, "01-hero-desktop.png"), path.join(liveDir, "02-trust-bar-desktop.png")]);
  const mapFile = path.join(temp, "figma-map.json");
  fs.writeFileSync(mapFile, JSON.stringify({
    fileKey: "abc", route: "/",
    sections: [{ name: "01-hero", figmaNodeId: "550:6340", selector: "section.hero" }],
  }));
  const composed = spawnSync("python3", [path.join(root, "scripts/compose_review.py"),
    "--figma-dir", figmaDir, "--live-dir", liveDir, "--map", mapFile, "--label", "desktop",
    "--breakpoint", "desktop-1512", "--out", path.join(temp, "review"), "--timestamp", "t"], { encoding: "utf8" });
  assert.equal(composed.status, 0);
  const pairs = JSON.parse(fs.readFileSync(path.join(temp, "review", "t_desktop-1512", "pairs.json"), "utf8"));
  assert.match(pairs.pairing, /explicit/);
  assert.equal(pairs.pairs.length, 1);
  assert.equal(pairs.pairs[0].node, "550:6340");
  assert.match(pairs.pairs[0].live, /01-hero-desktop\.png$/);

  const inferred = spawnSync("python3", [path.join(root, "scripts/compose_review.py"),
    "--figma-dir", figmaDir, "--live-dir", liveDir,
    "--breakpoint", "desktop-1512", "--out", path.join(temp, "review2"), "--timestamp", "t"], { encoding: "utf8" });
  assert.match(inferred.stderr, /pairing by filename index/);
  assert.match(inferred.stderr, /names disagree/);

  // build_manifest.mjs: a coveredViaComponent claim backed by the map's own
  // component registry becomes a real coverage cell; an unbacked claim is
  // downgraded to missing rather than trusted, and externalReferences /
  // scheduledForDeletion pass through unchanged.
  const bmRun = path.join(temp, "bm");
  fs.mkdirSync(path.join(bmRun, "live"), { recursive: true });
  fs.mkdirSync(path.join(bmRun, "figma"), { recursive: true });
  fs.mkdirSync(path.join(bmRun, "review", "t_mobile-393"), { recursive: true });
  for (const p of [
    path.join(bmRun, "live", "01-hero.png"),
    path.join(bmRun, "live", "full-mobile.png"),
    path.join(bmRun, "figma", "01-hero.png"),
    path.join(bmRun, "review", "t_mobile-393", "01-hero.png"),
    path.join(bmRun, "review", "t_mobile-393", "index.html"),
  ]) fs.writeFileSync(p, "fixture");
  fs.writeFileSync(path.join(bmRun, "review", "t_mobile-393", "pairs.json"), JSON.stringify({
    pairing: "explicit (figma-map.json section names)", breakpoint: "mobile-393", timestamp: "t", label: "mobile",
    pairs: [{ key: "01", name: "01-hero", node: "550:6340",
      figma: path.join(bmRun, "figma", "01-hero.png"), live: path.join(bmRun, "live", "01-hero.png"),
      sideBySide: "01-hero.png", sizes: { figma: [4, 4], live: [4, 4] } }],
  }));
  fs.writeFileSync(path.join(bmRun, "live", "capture-mobile.json"), JSON.stringify({
    url: "https://example.test/service-b", requestedContentWidth: 393, windowWidth: 408,
    reservedGutter: 15, contentWidthMatches: true, target: { stable: true }, settle: { settled: true },
    masks: [], captureProvider: "local", fullPage: "live/full-mobile.png",
    sections: [{ name: "01-hero", figmaNodeId: "550:6340", path: "live/01-hero.png",
      observedContentWidth: 393, settleMethod: "settled", captureProvider: "local", limitations: [] }],
  }));
  const bmMap = path.join(temp, "bm-map.json");
  fs.writeFileSync(bmMap, JSON.stringify({
    fileKey: "abc", fileUrl: "https://figma.test/x", route: "/service-b",
    sections: [{ name: "01-hero", figmaNodeId: "550:6340", selector: "section.hero" }],
    reviewPlan: { cells: [
      { route: "/service-b", breakpoint: 393, state: "default", figmaNodeId: "550:6340", sectionName: "01-hero" },
      { route: "/service-b", breakpoint: 393, state: "menu open", figmaNodeId: "550:7000", sectionName: "02-nav" },
      { route: "/service-b", breakpoint: 393, state: "default", figmaNodeId: "100:201", sectionName: "01-hero-reuse" }
    ] },
    components: { registry: { "Hero/Service": [{ route: "/service-a", breakpoint: 393, figmaNodeId: "100:201" }] } },
    coverage: {
      missing: [],
      coveredViaComponent: [
        { state: "default", breakpoint: 393, coveredVia: "/service-a", componentId: "Hero/Service" },
        { state: "default", breakpoint: 393, coveredVia: "/nonexistent-route", componentId: "Hero/Audience" },
      ],
    },
    externalReferences: [{ url: "https://example.test/reference", route: "/service-a", note: "stakeholder reference" }],
    scheduledForDeletion: [{ route: "/team/example", why: "placeholder", decidedBy: "owner", decidedOn: "2026-08-05" }],
  }));
  const bmPlan = path.join(bmRun, "review-plan.json");
  const frozen = spawnSync("node", [path.join(root, "scripts/freeze_plan.mjs"),
    "--map", bmMap, "--route", "/service-b", "--breakpoint", "393", "--out", bmPlan], { encoding: "utf8" });
  assert.equal(frozen.status, 0, frozen.stderr);
  const planSha256 = crypto.createHash("sha256").update(fs.readFileSync(bmPlan)).digest("hex");
  const capturePacket = JSON.parse(fs.readFileSync(path.join(bmRun, "live", "capture-mobile.json"), "utf8"));
  capturePacket.plan = { path: "review-plan.json", sha256: planSha256 };
  fs.writeFileSync(path.join(bmRun, "live", "capture-mobile.json"), JSON.stringify(capturePacket));
  const bmOut = path.join(bmRun, "figma-parity-manifest.json");
  const bmResult = spawnSync("node", [path.join(root, "scripts/build_manifest.mjs"),
    "--run", bmRun, "--map", bmMap, "--plan", bmPlan, "--mode", "local-parity", "--label", "mobile", "--out", bmOut], { encoding: "utf8" });
  assert.equal(bmResult.status, 0, bmResult.stderr);
  assert.match(bmResult.stderr, /outside the frozen plan and was ignored.*nonexistent-route/);
  const bmManifest = JSON.parse(fs.readFileSync(bmOut, "utf8"));
  assert.equal(bmManifest.schemaVersion, 4);
  assert.equal(Object.hasOwn(bmManifest.evidence[0], "inspected"), false);
  assert.equal(Object.hasOwn(bmManifest.evidence[0], "confidence"), false);
  assert.equal(bmManifest.execution.capabilities.visualComparison, false);
  assert.equal(bmManifest.plan.sha256, planSha256);
  assert.equal(bmManifest.coverage.requested.length, 3);
  assert.ok(bmManifest.coverage.missing.some((cell) => cell.state === "menu open" && /no paired capture evidence/.test(cell.reason)));
  assert.equal(bmManifest.coverage.coveredViaComponent.length, 1);
  assert.equal(bmManifest.coverage.coveredViaComponent[0].componentId, "Hero/Service");
  assert.equal(bmManifest.coverage.coveredViaComponent[0].coveredVia, "/service-a");
  assert.equal(bmManifest.coverage.coveredViaComponent[0].figmaNodeId, "100:201");
  assert.ok(bmManifest.coverage.missing.some((cell) => cell.figmaNodeId === "100:201" && /does not satisfy coverage/.test(cell.reason)));
  assert.ok(!bmManifest.coverage.missing.some((m) => /nonexistent-route/.test(m.reason)));
  assert.equal(bmManifest.externalReferences.length, 1);
  assert.equal(bmManifest.scheduledForDeletion.length, 1);
  const bmValid = spawnSync("node", [path.join(root, "scripts/validate_manifest.mjs"), bmOut], { encoding: "utf8" });
  assert.equal(bmValid.status, 0, bmValid.stderr);
  assert.match(bmValid.stdout, /VALID/);
  assert.match(bmValid.stdout, /covered via a component/);
  const selfCertified = structuredClone(bmManifest);
  selfCertified.evidence[0].inspected = true;
  selfCertified.evidence[0].confidence = "verified";
  selfCertified.execution.capabilities.visualComparison = true;
  const selfCertifiedFile = path.join(bmRun, "self-certified-manifest.json");
  fs.writeFileSync(selfCertifiedFile, `${JSON.stringify(selfCertified, null, 2)}\n`);
  const rejectedSelfCertification = spawnSync("node", [path.join(root, "scripts/validate_manifest.mjs"), selfCertifiedFile], { encoding: "utf8" });
  assert.equal(rejectedSelfCertification.status, 1);
  assert.match(rejectedSelfCertification.stderr, /must not appear in an observation manifest/);
  assert.match(rejectedSelfCertification.stderr, /visualComparison cannot be true/);

  // Review verdicts live in a separate artifact-bound attestation. The actor is
  // explicit, and changing the observed manifest invalidates the attestation.
  const attestation = path.join(bmRun, "review-attestation.json");
  const attested = spawnSync("node", [path.join(root, "scripts/attest_review.mjs"),
    "--manifest", bmOut, "--actor-kind", "automated", "--actor-id", "codex-reviewer",
    "--criterion", "Hero matches the mapped Figma node at 393px", "--verdict", "match",
    "--evidence", "mobile-01-hero", "--out", attestation], { encoding: "utf8" });
  assert.equal(attested.status, 0, attested.stderr);
  const attestationPacket = JSON.parse(fs.readFileSync(attestation, "utf8"));
  assert.equal(attestationPacket.actor.kind, "automated");
  assert.equal(attestationPacket.attestations[0].evidenceIds[0], "mobile-01-hero");
  assert.deepEqual(attestationPacket.attestations[0].scope, {
    routes: ["/service-b"], breakpoints: [393], states: ["default"], nodeIds: ["550:6340"]
  });
  assert.ok(attestationPacket.artifacts.every((artifact) => /^[a-f0-9]{64}$/.test(artifact.sha256)));
  const attestationValid = spawnSync("node", [path.join(root, "scripts/validate_attestation.mjs"), attestation], { encoding: "utf8" });
  assert.equal(attestationValid.status, 0, attestationValid.stderr);
  assert.match(attestationValid.stdout, /VALID/);

  const forgedHuman = spawnSync("node", [path.join(root, "scripts/attest_review.mjs"),
    "--manifest", bmOut, "--actor-kind", "human", "--actor-id", "Someone",
    "--criterion", "Hero matches", "--verdict", "match", "--evidence", "mobile-01-hero",
    "--out", path.join(bmRun, "forged-human.json")], { encoding: "utf8" });
  assert.equal(forgedHuman.status, 1);
  assert.match(forgedHuman.stderr, /unsigned human identity is not trusted/);

  const unrelatedArtifacts = structuredClone(attestationPacket);
  unrelatedArtifacts.artifacts.pop();
  fs.writeFileSync(attestation, `${JSON.stringify(unrelatedArtifacts, null, 2)}\n`);
  const artifactMismatch = spawnSync("node", [path.join(root, "scripts/validate_attestation.mjs"), attestation], { encoding: "utf8" });
  assert.equal(artifactMismatch.status, 1);
  assert.match(artifactMismatch.stderr, /artifacts do not exactly match/);
  fs.writeFileSync(attestation, `${JSON.stringify(attestationPacket, null, 2)}\n`);

  fs.appendFileSync(bmOut, "\n");
  const staleAttestation = spawnSync("node", [path.join(root, "scripts/validate_attestation.mjs"), attestation], { encoding: "utf8" });
  assert.equal(staleAttestation.status, 1);
  assert.match(staleAttestation.stderr, /manifest hash does not match/);

  // Editing the map after the plan is frozen cannot silently change scope.
  const changedMap = JSON.parse(fs.readFileSync(bmMap, "utf8"));
  changedMap.reviewPlan.cells.pop();
  fs.writeFileSync(bmMap, JSON.stringify(changedMap));
  const changedScope = spawnSync("node", [path.join(root, "scripts/build_manifest.mjs"),
    "--run", bmRun, "--map", bmMap, "--plan", bmPlan, "--mode", "local-parity", "--label", "mobile", "--out", bmOut], { encoding: "utf8" });
  assert.equal(changedScope.status, 1);
  assert.match(changedScope.stderr, /map changed after the review plan was frozen/);

  // The harnesses must at least be syntactically loadable.
  for (const script of ["capture.mjs", "discover_controls.mjs", "freeze_plan.mjs", "build_manifest.mjs", "attest_review.mjs", "validate_attestation.mjs"]) {
    const check = spawnSync("node", ["--check", path.join(root, "scripts", script)], { encoding: "utf8" });
    assert.equal(check.status, 0, `${script} failed --check: ${check.stderr}`);
  }

  console.log("figma-parity scripts: attestation and capture-contract checks passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
