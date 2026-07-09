import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const activeRoots = [
  "apps/desktop/src/App.tsx",
  "apps/desktop/src/components/ChatThread.tsx",
  "apps/desktop/src/components/Composer.tsx",
  "apps/desktop/src/components/DraftPreview.tsx",
  "apps/desktop/src/components/Inspector.tsx",
  "apps/desktop/src/components/LiveAppPreview.tsx",
];

const legacyCompatibilityFiles = new Set([
  "apps/desktop/src/canvasVisualReferences.ts",
  "apps/desktop/src/planPreview.ts",
]);

const forbidden = [
  [/proposalHighlight/, "proposalHighlight must not be an active composer source"],
  [/Show changes|Hide changes|No changes|Reset changes|Proposed changes/, "change overlay labels must not be active UI"],
  [/\bChange\s+\$\{|\bChange\s+\d+\b/, "visual chips must be Mark N, not Change N"],
  [/codex-plan-preview/, "codex-plan-preview blocks must not be parsed or emitted by active code"],
  [/\bmockupPreview\b/, "Mockup Preview must not be an active inspector/composer route"],
  [/\btype:\s*"planPreview"/, "Plan Preview must not be an active inspector route"],
  [/Compare options|Implement option [ABC]/, "Plan review must not expose preview option actions"],
  [/Build selected/, "active preview UI must not expose Build selected"],
  [/proposalControls/, "shared preview controls must use Draft-neutral naming"],
  [/CanvasSurface\s*=\s*"Live"\s*\|\s*"A"\s*\|\s*"B"\s*\|\s*"C"/, "Canvas surfaces must be Live/Draft only"],
  [/ARCHIVE_PROPOSALS/, "stale proposal cleanup must not be an active Canvas action"],
];

const activeFiles = discoverActiveRendererFiles(activeRoots).filter(
  (relativePath) => !legacyCompatibilityFiles.has(relativePath),
);

for (const relativePath of activeFiles) {
  const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
  for (const [pattern, message] of forbidden) {
    assert.doesNotMatch(source, pattern, `${relativePath}: ${message}`);
  }
}

const livePreview = read("apps/desktop/src/components/LiveAppPreview.tsx");
assert.match(livePreview, /Mark area/, "Live/Draft preview keeps the Mark area action");
assert.doesNotMatch(
  livePreview,
  /selectedHighlights|showProposalHighlights|visualPatchHighlights/,
  "Live Preview must not keep old proposal-highlight state",
);

const draftPreview = read("apps/desktop/src/components/DraftPreview.tsx");
assert.match(draftPreview, /Build this/, "Draft preview keeps Build this");
assert.match(
  draftPreview,
  /surface:\s*"draft"[\s\S]*draftId:\s*draft\.draftId/,
  "Draft marks must preserve Draft origin metadata",
);
assert.match(
  draftPreview,
  /surface:\s*"live"/,
  "Live marks from the Draft preview wrapper must preserve Live origin metadata",
);

const composerMarkWorkflow = read("apps/desktop/src/composerMarkWorkflow.ts");
assert.match(
  composerMarkWorkflow,
  /nextAppPreviewMarkNumber/,
  "App marks use the Mark counter",
);
assert.doesNotMatch(
  composerMarkWorkflow,
  /nextAppPreviewChangeNumber/,
  "App marks must not use a Change counter",
);
assert.match(
  composerMarkWorkflow,
  /surface:\s*args\.meta\.surface\s*\?\?\s*"live"/,
  "App mark attachment defaults to Live origin metadata",
);

const types = read("apps/desktop/src/types.ts");
assert.match(
  types,
  /surface:\s*"live"\s*\|\s*"draft"/,
  "Composer app preview contexts must preserve Live/Draft origin",
);
assert.match(
  types,
  /draftId\?:\s*string/,
  "Composer app preview contexts must preserve Draft identity when present",
);

console.log("p35 single-mark static guards passed");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function discoverActiveRendererFiles(roots) {
  const visited = new Set();
  for (const root of roots) {
    visit(root);
  }
  return [...visited].sort();

  function visit(relativePath) {
    const normalized = normalizeRelativePath(relativePath);
    if (visited.has(normalized)) return;
    const absolutePath = path.join(repoRoot, normalized);
    if (!existsSync(absolutePath)) return;
    visited.add(normalized);
    const source = readFileSync(absolutePath, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolveRelativeImport(absolutePath, specifier);
      if (resolved) visit(resolved);
    }
  }
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function resolveRelativeImport(fromAbsolutePath, specifier) {
  const basePath = path.resolve(path.dirname(fromAbsolutePath), specifier);
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const relativePath = normalizeRelativePath(path.relative(repoRoot, candidate));
    if (!relativePath.startsWith("apps/desktop/src/")) return null;
    return relativePath;
  }
  return null;
}

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/\\/g, "/");
}
