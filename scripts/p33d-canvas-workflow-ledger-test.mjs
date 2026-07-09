import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p33d-ledger-"));
const canvasOutfile = path.join(tempDir, "canvasActions.mjs");
const ledgerOutfile = path.join(tempDir, "canvasWorkflowLedger.mjs");
const appOutfile = path.join(tempDir, "App.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/canvasActions.ts")],
  outfile: canvasOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/canvasWorkflowLedger.ts")],
  outfile: ledgerOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/App.tsx")],
  outfile: appOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  define: {
    "import.meta.env": "{}",
  },
  logLevel: "silent",
});

try {
  const { resolveCanvasAction } = await import(pathToFileURL(canvasOutfile).href);
  const {
    canvasWorkflowLedgerSummary,
    deriveCanvasWorkflowLedger,
  } = await import(pathToFileURL(ledgerOutfile).href);
  const {
    isFeatureDraftContinueRequest,
    shouldRouteToFeatureDraftRecoveryPrompt,
  } = await import(pathToFileURL(appOutfile).href);

  const live = {
    exists: true,
    running: true,
    previewUrl: "http://127.0.0.1:5173",
  };

  const readyDraft = featureDraft();
  const readyDraftLedger = deriveCanvasWorkflowLedger({
    liveExists: true,
    selectedSurface: "Draft",
    selectedDraft: readyDraft,
  });
  assert.equal(readyDraftLedger.authoritativeSurface, "Draft");
  assert.equal(readyDraftLedger.activeWorkKind, "draft");
  assert.equal(readyDraftLedger.draftLifecycle, "ready");
  assert.equal(readyDraftLedger.draftBuildable, true);
  assert.ok(readyDraftLedger.recoveryActions.includes("build_draft"));
  assert.match(canvasWorkflowLedgerSummary(readyDraftLedger), /Draft buildable: yes/);

  const failedDraft = featureDraft({ status: "failed" });
  const failedDraftLedger = deriveCanvasWorkflowLedger({
    liveExists: true,
    selectedSurface: "Draft",
    selectedDraft: failedDraft,
  });
  assert.equal(failedDraftLedger.authoritativeSurface, "Live");
  assert.equal(failedDraftLedger.selectedSurface, "Draft");
  assert.equal(failedDraftLedger.draftNeedsAttention, true);
  assert.equal(failedDraftLedger.draftBuildable, false);
  assert.ok(failedDraftLedger.recoveryActions.includes("continue_draft"));
  assert.ok(failedDraftLedger.recoveryActions.includes("discard_draft"));
  assert.ok(failedDraftLedger.recoveryActions.includes("open_live"));

  assert.equal(isFeatureDraftContinueRequest("Continue Draft"), true);
  assert.equal(isFeatureDraftContinueRequest("try again"), true);
  assert.equal(
    shouldRouteToFeatureDraftRecoveryPrompt({
      inspectorIsDraft: true,
      inspectorDraftOwnsActiveThread: true,
      prompt: "try again and keep the same placement",
    }),
    true,
  );
  assert.equal(
    shouldRouteToFeatureDraftRecoveryPrompt({
      inspectorIsDraft: false,
      inspectorDraftOwnsActiveThread: true,
      prompt: "Build this",
    }),
    false,
  );

  const draftTarget = resolveCanvasAction({
    message:
      "I want to visualise in Draft how a settings button can act before implementation.",
    live,
    selectedSurface: "Live",
    activeProposalSet: null,
    workflowLedger: {
      authoritativeSurface: "Live",
      selectedSurface: "Live",
      activeWorkKind: "direct_live",
    },
  });
  assert.equal(draftTarget.action, "CREATE_DRAFT");
  assert.match(draftTarget.reason, /explicitly targeted Draft/);

  const liveTarget = resolveCanvasAction({
    message: "Use the design from Live actually, continue in the main files.",
    live,
    selectedSurface: "Live",
    activeProposalSet: null,
    workflowLedger: {
      authoritativeSurface: "Live",
      selectedSurface: "Live",
      activeWorkKind: "direct_live",
    },
  });
  assert.equal(liveTarget.action, "BUILD_LIVE_DIRECTLY");
  assert.match(liveTarget.reason, /does not need Canvas|explicitly targeted Live/);

  const conflictingTarget = resolveCanvasAction({
    message: "Show me a different direction, but also change Live now.",
    live,
    selectedSurface: "Live",
    activeProposalSet: null,
    workflowLedger: {
      authoritativeSurface: "Live",
      selectedSurface: "Live",
      activeWorkKind: "direct_live",
    },
  });
  assert.equal(conflictingTarget.action, "ASK_USER");
  assert.match(conflictingTarget.question.title, /How should I show this/);

  const verificationTarget = resolveCanvasAction({
    message: "Change Live now and add a task input.",
    live,
    selectedSurface: "Live",
    activeProposalSet: null,
    workflowLedger: {
      authoritativeSurface: "Live",
      selectedSurface: "Live",
      activeWorkKind: "direct_live",
    },
  });
  assert.equal(verificationTarget.action, "BUILD_LIVE_DIRECTLY");
  assert.match(verificationTarget.reason, /does not need Canvas|authoritative Live surface/);

  const featureDraftStripSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/FeatureDraftStrip.tsx"),
    "utf8",
  );
  const draftPreviewSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/DraftPreview.tsx"),
    "utf8",
  );
  const inspectorSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/Inspector.tsx"),
    "utf8",
  );
  const visualDecisionStripSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/VisualDecisionStrip.tsx"),
    "utf8",
  );
  const stylesSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/styles.css"),
    "utf8",
  );
  const appSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/App.tsx"),
    "utf8",
  );
  assert.match(featureDraftStripSource, /> Continue/);
  assert.match(featureDraftStripSource, /> Open Live/);
  assert.match(featureDraftStripSource, /> Refresh/);
  assert.doesNotMatch(
    featureDraftStripSource,
    /active && !needsAttention && \(/,
    "failed Drafts should still expose Park as a non-destructive escape hatch",
  );
  assert.match(featureDraftStripSource, /selected\.changedFiles\.length > 0/);
  assert.match(draftPreviewSource, /label: "Continue"/);
  assert.match(draftPreviewSource, /refreshLabel: "Refresh"/);
  assert.match(draftPreviewSource, /onRefresh: \(\) => props\.onRefresh\(draft\)/);
  assert.doesNotMatch(
    appSource,
    /FeatureDraftStrip/,
    "Draft controls should not render through a persistent above-composer strip",
  );
  assert.match(
    inspectorSource,
    /props\.selection\.type === "appPreview"[\s\S]*<DraftPreview/,
    "App Preview should recover active Drafts into the Canvas header",
  );
  assert.match(
    visualDecisionStripSource,
    /visual-decision-option-copy/,
    "Decision choices should render as stacked response rows",
  );
  assert.match(
    stylesSource,
    /\.visual-decision-options\s*\{[\s\S]*display: grid;/,
    "Decision choice layout should stay vertical",
  );
  assert.match(
    appSource,
    /function inFlightTurnIdForFeatureDraft\(draftId: string\)/,
  );
  assert.match(
    appSource,
    /desktop\.activeThreadId \?\? activeProject\.lastActiveThreadId/,
    "Draft send routing should reuse the last active thread after a restart before creating a new Draft",
  );
  assert.match(
    appSource,
    /turnHadDraftFileChanges/,
    "Interrupted Draft turns with observable file changes should not automatically become failed recovery loops",
  );
  assert.match(
    appSource,
    /allowIncompleteFinalResponse: true/,
    "Interrupted-but-changed Draft turns should preserve valid Draft source without requiring a completed final response",
  );
  assert.match(appSource, /setLivePreviewAutoStartNonces/);
  assert.match(appSource, /livePreviewAutoStartNonce=/);
  assert.match(appSource, /openPreviewInspector\(project\.id\)/);

  console.log("p33d canvas workflow ledger checks passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function featureDraft(overrides = {}) {
  return {
    draftId: "draft-1",
    registryId: "draft-registry-1",
    projectId: "project-1",
    threadId: "thread-1",
    turnId: "turn-1",
    name: "Settings draft",
    slug: "settings-draft",
    lifecycle: "active",
    status: "ready",
    rootPath: "C:/tmp/drafts/draft-1",
    workspacePath: "C:/tmp/drafts/draft-1/A",
    previewOwnerId: "feature-draft:project-1:draft-1",
    affectedRoutes: ["/"],
    mockAssumptions: ["fabricated settings data"],
    briefPath: ".codex/drafts/settings-draft/brief.md",
    originalPrompt: "Show settings",
    summary: "Draft ready.",
    changedFiles: [
      {
        kind: "updated",
        path: "src/App.tsx",
        hash: "draft-hash",
        size: 456,
      },
    ],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}
