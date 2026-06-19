import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/App.tsx"),
  "utf8",
);
const codeProposalPreviewSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/components/CodeProposalPreview.tsx"),
  "utf8",
);
const inspectorSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/components/Inspector.tsx"),
  "utf8",
);
const localStateSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/localState.ts"),
  "utf8",
);
const liveAppPreviewSource = readFileSync(
  path.join(repoRoot, "apps/desktop/src/components/LiveAppPreview.tsx"),
  "utf8",
);

assert.match(
  appSource,
  /mockupHistoryOnComplete\?: boolean/,
  "submission drafts should track build-selected mockup history completion",
);
assert.match(
  appSource,
  /const commitsToLive = isSavedMockupImplementationCommitment\(\s*visiblePrompt,\s*\)/,
  "saved mockup sends should distinguish proposal revision from live implementation",
);
assert.match(
  appSource,
  /openMockupsOnComplete = !commitsToLive/,
  "live implementation commits should not reopen the saved mockup as active",
);
assert.match(
  appSource,
  /mockupHistoryOnComplete = commitsToLive/,
  "live implementation commits should mark the saved mockup set as history",
);
assert.match(
  appSource,
  /markMockupProposalSetAsHistory\(next, targetProposalSetId\)/,
  "send start should immediately remove built mockups from active proposal routing",
);
assert.match(
  appSource,
  /markMockupProposalSetAsHistory\(current, targetProposalSetId\)/,
  "successful completion should keep built mockups in history mode",
);
assert.match(
  appSource,
  /!completedMockupBuildTurn &&\s*\(activatesSavedMockupDecision/,
  "build-selected turns should not reactivate saved mockup decisions",
);
assert.match(
  appSource,
  /activeThreadProposalSetId &&\s*!\s*activeThreadProposalSetIsHistory/,
  "history proposal sets should not count as active saved mockup decisions",
);

const detectorStart = appSource.indexOf(
  "function isSavedMockupImplementationCommitment(",
);
const detectorEnd = appSource.indexOf(
  "function markMockupProposalSetAsHistory(",
  detectorStart,
);
assert.notEqual(detectorStart, -1, "implementation commitment detector should exist");
assert.notEqual(detectorEnd, -1, "history helper boundary should exist");
const detectorSource = appSource.slice(detectorStart, detectorEnd);

assert.match(
  detectorSource,
  /looking\|thinking\|considering\|planning/,
  "exploratory implementation wording should not be treated as acceptance",
);
assert.match(
  detectorSource,
  /implement\\s\+\(\?:now\|this\|that\|it\|option\\s\+\[abc\]/,
  "direct option implementation wording should be accepted",
);
assert.match(
  detectorSource,
  /i\\s\+like\\s\+\(\?:this\|that\|it\).*implement/,
  "I like it, please implement that should be accepted",
);

assert.match(
  codeProposalPreviewSource,
  /proposalControls=\{/,
  "code-backed proposal preview should use locked proposal toolbar controls",
);
assert.match(
  codeProposalPreviewSource,
  /\.\.\.\(canShowLive\s*\?/,
  "code-backed proposal preview should show the Live tab only when Live exists",
);
assert.match(
  codeProposalPreviewSource,
  /buildLabel:[\s\S]*"Build selected"/,
  "code-backed proposal accept action should keep the locked Build selected label",
);
assert.doesNotMatch(
  codeProposalPreviewSource,
  /onApply/,
  "code-backed proposal preview must not apply directly from the header",
);
assert.match(
  codeProposalPreviewSource,
  /onBuild:\s*\(previewSet:\s*CodeProposalSet,\s*option:\s*CodeProposalOption\)\s*=>\s*void/,
  "code-backed proposal Build selected should stage through the composer callback",
);
assert.match(
  codeProposalPreviewSource,
  /onMarkArea:\s*\(/,
  "code-backed proposal Mark area should attach composer mark context",
);
assert.match(
  appSource,
  /function stageBuildCodeProposal[\s\S]*setComposerText\(`Implement option \$\{option\.id\}`\)/,
  "code-backed proposal Build selected should stage editable composer text",
);
assert.doesNotMatch(
  appSource,
  /await applyCodeProposal\(selectedCodeProposalSet,\s*option\);/,
  "composer sends must not desktop-fast-apply code-backed proposals",
);
assert.match(
  appSource,
  /codeProposalReviewPrompt\(\s*visiblePrompt,\s*activeProject,[\s\S]*selectedCodeProposalSet,[\s\S]*requestedOptionId,\s*\)/,
  "code-backed proposal implementation requests should go through an agent review turn",
);
assert.doesNotMatch(
  appSource,
  /function isCleanCodeProposalApplyRequest/,
  "composer direct-apply gating helper should not exist; the composer always sends an agent turn",
);
assert.match(
  appSource,
  /function codeProposalReviewPrompt[\s\S]*sent to the agent instead of being desktop-fast-applied[\s\S]*If the user explicitly asks to build\/implement\/apply the selected option into Live/,
  "agent review prompt should explain that composer acceptance is an agent decision, not instant desktop promotion",
);
assert.match(
  appSource,
  /void desktopInvoke\("app_preview_stop"[\s\S]*await desktopInvoke<ProposalWorkspaceApplyResult>\(\s*"proposal_workspace_apply"[\s\S]*void desktopInvoke\("app_preview_start"/,
  "code-backed proposal apply should not block promotion on preview stop/start cleanup",
);
assert.match(
  localStateSource,
  /if \(value === "applying"\) \{[\s\S]*return "ready";[\s\S]*\}/,
  "persisted in-flight proposal apply state should recover as ready after reload",
);
assert.match(
  appSource,
  /current\.type === "mockupPreview"[\s\S]*current\.type === "codeProposalPreview"[\s\S]*preferredLivePreviewSelection/,
  "code-backed proposal previews should retarget with the same preview-preserving path as mockups",
);
assert.match(
  appSource,
  /current\.type === "appPreview"[\s\S]*current\.type === "mockupPreview"[\s\S]*current\.type === "codeProposalPreview"[\s\S]*current\.type === "planPreview"/,
  "code-backed proposal previews should not fall back to Activity during inspector retargeting",
);
assert.match(
  inspectorSource,
  /<CodeProposalPreview[\s\S]*onBuild=\{props\.onBuildCodeProposal\}/,
  "Inspector should pass code-backed proposal Build selected through the composer staging path",
);
assert.doesNotMatch(
  codeProposalPreviewSource,
  /code-proposal-preview-bar|code-proposal-preview-shell/,
  "code-backed proposal preview should not add a second header wrapper",
);
assert.doesNotMatch(
  codeProposalPreviewSource,
  /Apply \$\{activeOption\.id\}|Apply [ABC]/,
  "code-backed proposal preview should not show Apply A/B/C in the header",
);
assert.match(
  liveAppPreviewSource,
  /showDetectInline = stoppedPreview && !proposalToolbar/,
  "generated proposal tabs should not show Detect",
);
assert.match(
  liveAppPreviewSource,
  /showUseUrlInline = stoppedPreview && !proposalToolbar/,
  "generated proposal tabs should not show URL",
);
assert.match(
  liveAppPreviewSource,
  /runningPreview && !proposalToolbar && !overflowReloadAction/,
  "generated proposal tabs should not show Reload",
);

console.log("P25b saved mockup history guard check passed.");
