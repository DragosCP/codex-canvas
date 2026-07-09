import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/App.tsx"),
  "utf8",
);

const start = appSource.indexOf("function savedMockupReviewPrompt(");
const end = appSource.indexOf("function mockupVisibleOptionName", start);

assert.notEqual(start, -1, "savedMockupReviewPrompt should exist");
assert.notEqual(end, -1, "savedMockupReviewPrompt boundary should be found");

const promptSource = appSource.slice(start, end);

assert.match(
  promptSource,
  /looking to implement/,
  "exploratory implementation wording should be called out as review intent",
);
assert.match(
  promptSource,
  /somewhere/,
  "vague placement wording should stay proposal-first",
);
assert.match(
  promptSource,
  /highlights array/,
  "saved proposal revisions should request manifest highlights",
);
assert.match(
  promptSource,
  /Show changes/,
  "prompt should connect highlights to the preview Show changes overlay",
);
assert.match(
  promptSource,
  /implement option A/,
  "option-specific implementation should remain an explicit commitment",
);
assert.match(
  promptSource,
  /implement now/,
  "real implementation should require explicit commitment wording",
);
assert.match(
  promptSource,
  /build selected/,
  "Build selected should remain an explicit implementation commitment",
);
assert.doesNotMatch(
  promptSource,
  /If they explicitly ask to build or implement, implement the real app/,
  "generic build/implement wording should no longer be enough",
);

console.log("P24 saved proposal review prompt check passed.");
