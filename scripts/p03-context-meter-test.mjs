import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const helperPath = path.join(repoRoot, "apps/desktop/src/contextMeter.ts");
const source = await readFile(helperPath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: helperPath,
});

const module = { exports: {} };
vm.runInNewContext(outputText, {
  exports: module.exports,
  module,
  require,
});

const { contextDetails } = module.exports;

function usage(totalTokens, lastTokens, modelContextWindow) {
  return {
    total: breakdown(totalTokens),
    last: breakdown(lastTokens),
    modelContextWindow,
  };
}

function breakdown(totalTokens) {
  return {
    totalTokens,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
  };
}

{
  const details = contextDetails(usage(851_000, 222_000, 258_000));
  assert.equal(details.available, true);
  assert.equal(details.percentLabel, "86% full");
  assert.equal(details.tokenLabel, "222k / 258k tokens used");
  assert.doesNotMatch(details.tokenLabel, /851k/);
}

{
  const details = contextDetails(usage(12_000, 129_000, 258_000));
  assert.equal(details.available, true);
  assert.equal(details.percentLabel, "50% full");
  assert.equal(details.tokenLabel, "129k / 258k tokens used");
}

{
  const details = contextDetails(usage(12_000, 129_000, null));
  assert.equal(details.available, false);
  assert.equal(details.percentLabel, "Usage unavailable");
  assert.equal(details.tokenLabel, "Token usage unknown");
}

{
  const details = contextDetails(usage(851_000, 300_000, 258_000));
  assert.equal(details.available, false);
  assert.equal(details.tokenLabel, "Token usage unknown");
}

console.log("Context meter helper checks passed.");
