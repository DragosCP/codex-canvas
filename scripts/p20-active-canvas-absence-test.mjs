import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  path.join(repoRoot, "apps/desktop/src"),
  path.join(repoRoot, "apps/desktop/electron"),
];

const forbidden = [
  "ProjectCanvas",
  "CanvasSuggestion",
  "canvasSuggestions",
  "canvases",
  "canvas-proposal",
  "Update Canvas",
  "View Canvas",
  "Canvas edits attached",
  "current interface Canvas",
  "generated current-interface Canvas",
  "interaction frame",
  "interactionPreviews",
  "CanvasContext",
  "canvasContext",
  "xywh",
  "Inline action",
  "Focused panel",
  "Guided dialog",
];

const checkedExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const failures = [];

for (const root of roots) {
  for (const file of walk(root)) {
    if (!checkedExtensions.has(path.extname(file))) continue;
    const relative = path.relative(repoRoot, file);
    const text = readFileSync(file, "utf8");
    for (const term of forbidden) {
      const index = text.indexOf(term);
      if (index === -1) continue;
      const line = text.slice(0, index).split(/\r?\n/).length;
      failures.push(`${relative}:${line} contains ${JSON.stringify(term)}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Active desktop code still contains old coordinate-editor Canvas references:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("P20 active desktop legacy Canvas absence check passed.");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "dist" || entry === "node_modules") continue;
      yield* walk(fullPath);
    } else if (stat.isFile()) {
      yield fullPath;
    }
  }
}
