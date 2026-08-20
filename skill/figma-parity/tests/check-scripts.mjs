#!/usr/bin/env node
import assert from "node:assert/strict";
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
  const valid = execFileSync("node", [path.join(root, "scripts/validate_manifest.mjs"), manifest], { encoding: "utf8" });
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
    return spawnSync("node", [path.join(root, "scripts/validate_manifest.mjs"), manifest], { encoding: "utf8" });
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

  // The harnesses must at least be syntactically loadable.
  for (const script of ["capture.mjs", "discover_controls.mjs", "build_manifest.mjs"]) {
    const check = spawnSync("node", ["--check", path.join(root, "scripts", script)], { encoding: "utf8" });
    assert.equal(check.status, 0, `${script} failed --check: ${check.stderr}`);
  }

  console.log("figma-parity scripts: 26/26 checks passed");
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
