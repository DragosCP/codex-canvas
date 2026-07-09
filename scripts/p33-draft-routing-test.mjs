import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p33-draft-routing-"));
const appOutfile = path.join(tempDir, "App.mjs");
const displayOutfile = path.join(tempDir, "proposalWorkspaceDisplay.mjs");

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

await build({
  entryPoints: [
    path.join(repoRoot, "apps/desktop/src/proposalWorkspaceDisplay.ts"),
  ],
  outfile: displayOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const {
    isFeatureDraftBuildRequest,
    isFeatureDraftDiscardRequest,
    isFeatureDraftParkRequest,
    isFeatureDraftResumeRequest,
    shouldCreateFeatureDraftFromCanvasPrompt,
    shouldRouteToFeatureDraftPrompt,
    visualDecisionOptionCreatesFeatureDraft,
    visualDecisionOptionCreatesLiveOverlay,
    visualDecisionOptionCreatesMockups,
  } = await import(pathToFileURL(appOutfile).href);
  const { proposalWorkspaceDisplayPath } = await import(
    pathToFileURL(displayOutfile).href
  );
  const featureDraftStripSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/FeatureDraftStrip.tsx"),
    "utf8",
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: false,
      hasSelectedPreview: false,
      isExistingProject: true,
      planMode: false,
      prompt: "Show me how quick add could work in this app",
      resolutionAction: "CREATE_DRAFT",
      wantsOptions: false,
    }),
    true,
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: false,
      hasSelectedPreview: false,
      isExistingProject: true,
      planMode: false,
      prompt:
        "Show the response cards expanded to the full length of each message",
      resolutionAction: "CREATE_DRAFT",
      wantsOptions: false,
    }),
    true,
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: false,
      hasSelectedPreview: false,
      isExistingProject: true,
      planMode: false,
      prompt: "Show me three options for quick add",
      resolutionAction: "CREATE_DRAFT",
      wantsOptions: true,
    }),
    true,
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: false,
      hasSelectedPreview: false,
      isExistingProject: false,
      planMode: false,
      prompt: "Show me how quick add could work",
      resolutionAction: "CREATE_DRAFT",
      wantsOptions: false,
    }),
    false,
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: true,
      hasSelectedPreview: false,
      isExistingProject: true,
      planMode: false,
      prompt: "Show me how quick add could work",
      resolutionAction: "CREATE_DRAFT",
      wantsOptions: false,
    }),
    true,
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: true,
      hasSelectedPreview: false,
      isExistingProject: true,
      planMode: false,
      prompt:
        "I want you to edit the Draft so the response containers expand full length",
      resolutionAction: "CREATE_DRAFT",
      wantsOptions: false,
    }),
    true,
  );

  const showDraftOption = {
    id: "show-draft",
    label: "Show Draft",
    description: "Try the marked stacked-view width change in a Draft first.",
    prompt:
      "Create one Draft for the current app that widens stacked-view agent response containers slightly to the right, without changing Live source.",
    canvasAction: "show_draft",
  };

  assert.equal(visualDecisionOptionCreatesFeatureDraft(showDraftOption), true);
  assert.equal(visualDecisionOptionCreatesLiveOverlay(showDraftOption), false);
  assert.equal(visualDecisionOptionCreatesMockups(showDraftOption), false);
  assert.equal(
    proposalWorkspaceDisplayPath(
      "C:\\Users\\drago\\AppData\\Roaming\\Codex Local\\draft-workspaces\\workspaces\\vision-weaver-main\\draft-1\\A\\src\\components\\chat\\MessageBranchGroup.tsx",
    ),
    "Draft / src/components/chat/MessageBranchGroup.tsx",
  );
  assert.match(featureDraftStripSource, /onBuild: \(draft: FeatureDraft\) => void/);
  assert.match(featureDraftStripSource, /> Build this/);

  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: true,
      inspectorDraftOwnsActiveThread: true,
      prompt: "Make it denser",
    }),
    true,
  );
  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: true,
      inspectorDraftOwnsActiveThread: false,
      prompt:
        "I want to see a Usage analytics workflow inside this app before implementation",
    }),
    false,
  );
  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: true,
      inspectorDraftOwnsActiveThread: true,
      prompt: "Build this",
    }),
    false,
  );
  assert.equal(isFeatureDraftBuildRequest("Build this"), true);
  assert.equal(isFeatureDraftDiscardRequest("Discard this draft"), true);
  assert.equal(isFeatureDraftParkRequest("Park this draft"), true);
  assert.equal(isFeatureDraftResumeRequest("Resume this draft"), true);
  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: true,
      inspectorDraftOwnsActiveThread: true,
      prompt: "Park this draft",
    }),
    false,
  );
  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: false,
      prompt:
        "Please remove from the white page canvas even the mobile/desktop transparent tab if it's not already removed, I don't want that",
    }),
    true,
    "single-change visual follow-ups should revise the active Draft even without literal Draft wording",
  );

  console.log("p33 draft routing helpers passed");
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
