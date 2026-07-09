import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const appSource = read("apps/desktop/src/App.tsx");
const inspectorSource = read("apps/desktop/src/components/Inspector.tsx");
const canvasActionsSource = read("apps/desktop/src/canvasActions.ts");
const visualDecisionSource = read("apps/desktop/src/visualDecision.ts");
const localStateSource = read("apps/desktop/src/localState.ts");

for (const removed of [
  "apps/desktop/src/components/CodeProposalPreview.tsx",
  "apps/desktop/src/components/CodeProposalOptionStrip.tsx",
  "apps/desktop/src/components/MockupOptionStrip.tsx",
]) {
  assert.equal(existsSync(path.join(repoRoot, removed)), false, `${removed} should be removed`);
}

assert.doesNotMatch(appSource, /CodeProposalOptionStrip|MockupOptionStrip|CodeProposalPreview/);
assert.doesNotMatch(inspectorSource, /CodeProposalPreview|codeProposalSet|onBuildCodeProposal/);
assert.doesNotMatch(appSource, /canvasResolution\?\.action === "CREATE_PROPOSAL"/);
assert.doesNotMatch(appSource, /canvasResolution\?\.action === "ADD_OPTION"/);
assert.doesNotMatch(appSource, /canvasResolution\?\.action === "BUILD_SELECTED"/);
assert.doesNotMatch(appSource, /canvasResolution\?\.action === "REVISE_PROPOSAL"/);
assert.doesNotMatch(appSource, /show_preview: create|show_options: create|add_option: add|replace_option: replace/);
assert.doesNotMatch(appSource, /canvasAction": "build_directly \| show_draft \| show_preview/);
assert.doesNotMatch(canvasActionsSource, /CREATE_PROPOSAL|ADD_OPTION|BUILD_SELECTED|REVISE_PROPOSAL/);
assert.doesNotMatch(canvasActionsSource, /Proposal Canvas|Use A\/B\/C only when/);
assert.match(canvasActionsSource, /Do not expose lettered proposal lanes/);
assert.doesNotMatch(visualDecisionSource, /show_preview|show_options|add_option|replace_option/);
assert.match(visualDecisionSource, /"show_draft"/);
assert.match(localStateSource, /codeProposalSets: \{\}/);
assert.match(localStateSource, /mockupActiveProposalSetIdsByThreadId: \{\}/);

console.log("p34 draft-only static guards passed");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}
