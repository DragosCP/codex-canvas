import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const maxAppLinesAfterPureHelperExtraction = 6100;
const maxNewHelperModuleLines = 800;

const appLines = lineCount("apps/desktop/src/App.tsx");
assert.ok(
  appLines <= maxAppLinesAfterPureHelperExtraction,
  `App.tsx should stay at or below ${maxAppLinesAfterPureHelperExtraction} lines after the P36 pure-helper extraction slice; found ${appLines}.`,
);

for (const relativePath of [
  "apps/desktop/src/appErrors.ts",
  "apps/desktop/src/appInspector.ts",
  "apps/desktop/src/appLayout.ts",
  "apps/desktop/src/appSendGuards.ts",
  "apps/desktop/src/composerMarkWorkflow.ts",
  "apps/desktop/src/featureDraftPrompts.ts",
  "apps/desktop/src/featureDraftWorkflow.ts",
  "apps/desktop/src/modelDisplay.ts",
  "apps/desktop/src/previewSelection.ts",
  "apps/desktop/src/visualDecisionWorkflow.ts",
]) {
  const lines = lineCount(relativePath);
  assert.ok(
    lines <= maxNewHelperModuleLines,
    `${relativePath} should stay below ${maxNewHelperModuleLines} lines; found ${lines}.`,
  );
}

console.log("p36 App.tsx decomposition guards passed");

function lineCount(relativePath) {
  const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
  return source.split(/\r?\n/).length;
}
