import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const appSource = read("apps/desktop/src/App.tsx");
const inspectorSource = read("apps/desktop/src/components/Inspector.tsx");
const localStateSource = read("apps/desktop/src/localState.ts");
const draftWorkspaceSource = read("apps/desktop/electron/draft-workspaces.cjs");
const proposalWorkspaceSource = read("apps/desktop/electron/proposal-workspaces.cjs");

for (const removed of [
  "apps/desktop/src/components/CodeProposalPreview.tsx",
  "apps/desktop/src/components/CodeProposalOptionStrip.tsx",
]) {
  assert.equal(
    existsSync(path.join(repoRoot, removed)),
    false,
    `${removed} should stay removed in P34`,
  );
}

assert.doesNotMatch(inspectorSource, /CodeProposalPreview|onBuildCodeProposal/);
assert.doesNotMatch(appSource, /stageBuildCodeProposal|codeProposalReviewPrompt/);
assert.doesNotMatch(appSource, /proposal_workspace_prepare|proposal_workspace_apply/);
assert.doesNotMatch(appSource, /codeProposalActiveSetIdsByThreadId:\s*draft\./);
assert.match(
  localStateSource,
  /codeProposalSets: \{\}/,
  "legacy code proposal sets should be dropped during P34 local-state load",
);

assert.match(
  draftWorkspaceSource,
  /prepareProposalWorkspaces/,
  "Draft workspaces may still reuse the old copy/diff/apply primitive internally",
);
assert.match(
  proposalWorkspaceSource,
  /function prepareProposalWorkspaces/,
  "the backend primitive remains available until Draft internals are renamed",
);
assert.doesNotMatch(
  appSource,
  /Runnable proposal workspace rules/,
  "renderer prompt wrappers should no longer expose code-backed proposal instructions",
);

console.log("P25b compatibility guard passed under P34 draft-only Canvas.");

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}
