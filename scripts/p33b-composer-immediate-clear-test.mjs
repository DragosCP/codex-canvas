import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/App.tsx"),
  "utf8",
);

const sendDraftStart = appSource.indexOf("  async function sendDraft(");
const acceptPlanStart = appSource.indexOf("  async function acceptPlanProposal", sendDraftStart);
assert.ok(sendDraftStart >= 0, "sendDraft should exist");
assert.ok(acceptPlanStart > sendDraftStart, "sendDraft body should be locatable");

const sendDraftBody = appSource.slice(sendDraftStart, acceptPlanStart);
const clearCallIndex = sendDraftBody.indexOf("clearSentComposerPayload(draft.contexts)");
const prepareFeatureDraftIndex = sendDraftBody.indexOf("prepareFeatureDraft(");
const startTurnIndex = sendDraftBody.indexOf("startTurn(");
const visibleTurnIndex = sendDraftBody.indexOf("const visibleTurn =");

assert.match(
  appSource,
  /function clearSentComposerPayload\(sentContexts: ComposerContextReference\[\]\)/,
  "App should use a shared helper for clearing sent composer state",
);
assert.match(
  sendDraftBody,
  /const shouldClearComposer = options\.clearComposer \|\| sendingLocalDraft;/,
  "sendDraft should decide once whether this send owns the current composer payload",
);
assert.ok(
  clearCallIndex >= 0,
  "sendDraft should clear accepted composer payloads",
);
assert.ok(
  prepareFeatureDraftIndex > clearCallIndex,
  "Draft sends should clear the composer before slow feature-draft workspace preparation",
);
assert.ok(
  startTurnIndex > clearCallIndex,
  "Normal sends should clear the composer before slow turn start",
);
assert.ok(
  visibleTurnIndex > clearCallIndex,
  "Composer clear should not wait for the optimistic turn response",
);
assert.doesNotMatch(
  sendDraftBody.slice(visibleTurnIndex),
  /setComposerText\(""\)/,
  "sendDraft should not clear the composer again after async work completes",
);

console.log("p33b composer immediate clear passed");
