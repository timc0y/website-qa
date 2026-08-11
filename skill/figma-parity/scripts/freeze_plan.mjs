#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const arg = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : null;
};
const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const key = (cell) => `${cell.route}\0${cell.breakpoint}\0${cell.state}\0${cell.figmaNodeId}`;

try {
  const mapFile = path.resolve(arg("map") || "");
  const outFile = path.resolve(arg("out") || "review-plan.json");
  const route = arg("route");
  const breakpoint = Number(arg("breakpoint"));
  if (!arg("map") || !route || !Number.isInteger(breakpoint) || breakpoint < 1) {
    throw new Error("Use --map <figma-map.json> --route <path> --breakpoint <px> [--out review-plan.json]");
  }
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  const cells = (map.reviewPlan?.cells || []).filter((cell) => cell.route === route && cell.breakpoint === breakpoint);
  if (!cells.length) throw new Error(`figma-map reviewPlan has no cells for ${route} at ${breakpoint}px`);
  const seen = new Set();
  for (const [index, cell] of cells.entries()) {
    for (const field of ["route", "state", "figmaNodeId", "sectionName"]) {
      if (typeof cell[field] !== "string" || !cell[field].trim()) throw new Error(`reviewPlan.cells[${index}].${field} is required`);
    }
    if (!Number.isInteger(cell.breakpoint) || cell.breakpoint < 1) throw new Error(`reviewPlan.cells[${index}].breakpoint must be a positive integer`);
    if (seen.has(key(cell))) throw new Error(`duplicate review-plan cell: ${key(cell).replaceAll("\0", " / ")}`);
    seen.add(key(cell));
  }
  const packet = {
    schemaVersion: 1,
    provider: "figma-parity-plan",
    frozenAt: new Date().toISOString(),
    source: { mapPath: path.relative(path.dirname(outFile), mapFile), mapSha256: digest(mapFile) },
    scope: { route, breakpoint },
    cells
  };
  fs.writeFileSync(outFile, `${JSON.stringify(packet, null, 2)}\n`);
  process.stdout.write(`${outFile}\n${cells.length} frozen coverage cell(s) for ${route} at ${breakpoint}px\n`);
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
