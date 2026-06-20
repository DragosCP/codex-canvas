import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p27-canvas-test-"));
const canvasOutfile = path.join(tempDir, "canvasActions.mjs");
const visualDecisionOutfile = path.join(tempDir, "visualDecision.mjs");
const chatThreadOutfile = path.join(tempDir, "ChatThread.mjs");
const codeProposalPreviewOutfile = path.join(tempDir, "CodeProposalPreview.mjs");
const appOutfile = path.join(tempDir, "App.mjs");
const proposalWorkspaceDisplayOutfile = path.join(
  tempDir,
  "proposalWorkspaceDisplay.mjs",
);

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/canvasActions.ts")],
  outfile: canvasOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/visualDecision.ts")],
  outfile: visualDecisionOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/components/ChatThread.tsx")],
  outfile: chatThreadOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/components/CodeProposalPreview.tsx")],
  outfile: codeProposalPreviewOutfile,
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

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/proposalWorkspaceDisplay.ts")],
  outfile: proposalWorkspaceDisplayOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const {
    CANVAS_OPERATING_PROMPT,
    resolveCanvasAction,
  } = await import(pathToFileURL(canvasOutfile).href);
  const { parseVisualDecisionStrip } = await import(
    pathToFileURL(visualDecisionOutfile).href
  );
  const { shouldShowPlanProposalReview } = await import(
    pathToFileURL(chatThreadOutfile).href
  );
  const {
    visualDecisionOptionCreatesCodeProposal,
    visualDecisionOptionCreatesLiveOverlay,
    visualDecisionOptionCreatesMockups,
  } = await import(pathToFileURL(appOutfile).href);
  const {
    codeProposalPreviewKey,
    codeProposalPreviewProposal,
    initialCodeProposalTab,
  } = await import(pathToFileURL(codeProposalPreviewOutfile).href);
  const { projectRelativeDisplayPath, proposalWorkspaceDisplayPath } = await import(
    pathToFileURL(proposalWorkspaceDisplayOutfile).href
  );

  assert.match(CANVAS_OPERATING_PROMPT, /If the user says Canvas, treat it as @Canvas/);
  assert.match(CANVAS_OPERATING_PROMPT, /Prefer one proposal for one visual change/);
  assert.match(CANVAS_OPERATING_PROMPT, /Use A\/B\/C only when/);
  assert.match(CANVAS_OPERATING_PROMPT, /Do not recreate the entire proposal/);
  assert.match(CANVAS_OPERATING_PROMPT, /do not silently apply/i);
  assert.match(CANVAS_OPERATING_PROMPT, /Live becomes the source of truth/);
  assert.match(CANVAS_OPERATING_PROMPT, /comparison history, not active proposal routing/);
  assert.match(CANVAS_OPERATING_PROMPT, /Never expose hidden Canvas payloads/);

  const live = { exists: true, running: true, previewUrl: "http://127.0.0.1:5173" };
  const emptyLive = { exists: false, running: false };
  const activeAB = {
    id: "proposal-1",
    lane: "code_workspace",
    lifecycle: "active",
    selectedOptionId: "A",
    options: [
      { id: "A", title: "Search-first" },
      { id: "B", title: "Category-first" },
    ],
  };
  const activeABC = {
    ...activeAB,
    selectedOptionId: "B",
    options: [
      { id: "A", title: "Header action" },
      { id: "B", title: "Menu action" },
      { id: "C", title: "Bottom action" },
    ],
  };

  const fixtures = [
    {
      name: "marked proposal tweak revises selected proposal",
      input: {
        message: "Show me the categories rather than search",
        live,
        selectedSurface: "A",
        activeProposalSet: activeAB,
        marks: [{ id: "mark-1", source: "user_mark", surface: "A" }],
      },
      expected: { action: "REVISE_PROPOSAL", targetOptionId: "A" },
    },
    {
      name: "post-build history does not block fresh Live proposal",
      input: {
        message: "Please propose me a Settings button",
        live,
        selectedSurface: "Live",
        historicalProposalSets: [{ ...activeABC, lifecycle: "accepted" }],
      },
      expected: {
        action: "CREATE_PROPOSAL",
        baseSurface: "Live",
        wantsOptions: false,
        lanePreference: "live_overlay",
      },
    },
    {
      name: "live placement guidance asks before creating a proposal",
      input: {
        message: "Show me roughly where I can put a Settings button for the user.",
        live,
        selectedSurface: "Live",
        historicalProposalSets: [{ ...activeABC, lifecycle: "accepted" }],
      },
      expected: {
        action: "ASK_USER",
        baseSurface: "Live",
        wantsOptions: false,
        lanePreference: "live_overlay",
      },
      assert(result) {
        assert.match(result.question.reason, /direct implementation|preview/i);
      },
    },
    {
      name: "explicit one-preview placement request creates proposal A",
      input: {
        message: "Show me one preview for a Settings button placement.",
        live,
        selectedSurface: "Live",
      },
      expected: {
        action: "CREATE_PROPOSAL",
        baseSurface: "Live",
        wantsOptions: false,
        lanePreference: "live_overlay",
      },
    },
    {
      name: "build option is an agent-owned build-selected action",
      input: {
        message: "Build on Option A",
        live,
        selectedSurface: "A",
        activeProposalSet: activeABC,
      },
      expected: { action: "BUILD_SELECTED", targetOptionId: "A" },
    },
    {
      name: "full A/B/C plus another preview asks instead of blocking",
      input: {
        message: "Add another preview for the settings button",
        live,
        selectedSurface: "B",
        activeProposalSet: activeABC,
      },
      expected: { action: "ASK_USER" },
      assert(result) {
        assert.match(result.question.title, /Which proposal slot/);
        assert.match(result.question.reason, /A, B, and C/);
      },
    },
    {
      name: "empty-project local A/B/C uses Canvas proposal workspaces",
      input: {
        message: "Create local A/B/C layouts for a launch tracker app",
        live: emptyLive,
        selectedSurface: "Live",
      },
      expected: {
        action: "CREATE_PROPOSAL",
        wantsOptions: true,
        lanePreference: "code_workspace",
      },
    },
    {
      name: "empty-project ambiguous UI asks a visible Canvas question",
      input: {
        message: "I need a simple dashboard for volunteer shifts",
        live: emptyLive,
        selectedSurface: "Live",
      },
      expected: { action: "ASK_USER" },
      assert(result) {
        assert.match(result.question.reason, /no Live app/i);
      },
    },
    {
      name: "@Canvas anywhere is Canvas intent",
      input: {
        message: "Could you use @Canvas and show one preview for this header?",
        live,
        selectedSurface: "Live",
      },
      expected: {
        action: "CREATE_PROPOSAL",
        wantsOptions: false,
        lanePreference: "live_overlay",
      },
    },
    {
      name: "put it in C adds or refreshes C beside A/B",
      input: {
        message: "Put it in C based on B",
        live,
        selectedSurface: "B",
        activeProposalSet: activeAB,
      },
      expected: {
        action: "ADD_OPTION",
        targetOptionId: "C",
        sourceOptionId: "B",
      },
    },
    {
      name: "backend-only prompt bypasses Canvas",
      input: {
        message: "Add a parser unit test for the API response",
        live,
        selectedSurface: "Live",
      },
      expected: { action: "BUILD_LIVE_DIRECTLY", canvasRelevant: false },
    },
  ];

  for (const fixture of fixtures) {
    const result = resolveCanvasAction(fixture.input);
    for (const [key, value] of Object.entries(fixture.expected)) {
      assert.equal(
        result[key],
        value,
        `${fixture.name}: expected ${key}=${value}, got ${result[key]}`,
      );
    }
    fixture.assert?.(result);
  }

  const noLiveQuestionResolution = resolveCanvasAction({
    message: "Build me a mobile-first glassmorphism to-do app",
    live: emptyLive,
    selectedSurface: "Live",
  });
  assert.equal(noLiveQuestionResolution.action, "ASK_USER");
  assert.equal(noLiveQuestionResolution.lanePreference, "code_workspace");
  assert.match(noLiveQuestionResolution.question.reason, /no Live app/i);

  const liveQuestionResolution = resolveCanvasAction({
    message: "Where should the settings button go?",
    live,
    selectedSurface: "Live",
  });
  assert.equal(liveQuestionResolution.action, "ASK_USER");
  assert.equal(liveQuestionResolution.lanePreference, "live_overlay");
  assert.match(liveQuestionResolution.question.reason, /current app visually/i);

  const pendingLiveProposal = {
    id: "live-proposal:turn-1",
    projectId: "project-1",
    threadId: "thread-1",
    turnId: "turn-1",
    prompt: "Create one temporary live proposal",
    contexts: [],
    previewSpec: {
      title: "Settings button proposal",
      summary: "Review the proposed settings placement.",
      variants: [{ id: "A", label: "A", summary: "Top bar" }],
    },
    previewSelectedVariantId: "A",
    previewAreaMark: null,
    previewSession: null,
    proposalKind: "live_proposal",
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  assert.equal(
    shouldShowPlanProposalReview(pendingLiveProposal, "inProgress"),
    false,
  );
  assert.equal(
    shouldShowPlanProposalReview(pendingLiveProposal, "completed"),
    false,
  );
  assert.equal(
    shouldShowPlanProposalReview(
      { ...pendingLiveProposal, previewSpec: null },
      "completed",
    ),
    false,
  );

  const agentAuthoredPreviewChoice = {
    id: "preview",
    label: "Preview",
    description:
      "Show one suggested Settings button location on the current app without editing files.",
    prompt:
      "Show one suggested Settings button location on the current app without editing files.",
    canvasAction: "show_preview",
  };
  assert.equal(
    visualDecisionOptionCreatesLiveOverlay(agentAuthoredPreviewChoice),
    true,
  );
  assert.equal(
    visualDecisionOptionCreatesMockups(agentAuthoredPreviewChoice),
    false,
  );
  assert.equal(
    visualDecisionOptionCreatesCodeProposal({
      ...agentAuthoredPreviewChoice,
      prompt:
        "Create one runnable proposal workspace before implementation for this settings page.",
    }),
    true,
  );
  assert.equal(
    visualDecisionOptionCreatesLiveOverlay({
      ...agentAuthoredPreviewChoice,
      prompt: "Create a quick wireframe preview for this settings placement.",
    }),
    false,
  );

  const codeProposalProject = {
    id: "project-1",
    path: "C:\\Users\\drago\\Desktop\\test26",
    name: "test26",
    pinned: false,
    hidden: false,
    archived: false,
    order: 0,
    lastActiveThreadId: "thread-1",
    settings: {
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      model: null,
      effort: "medium",
      serviceTier: null,
      planMode: false,
    },
  };
  const codeProposalSet = {
    proposalSetId: "proposal-1",
    projectId: "project-1",
    threadId: "thread-1",
    turnId: "turn-1",
    rootPath: "C:\\proposal",
    originalPrompt: "Show 2-3",
    selectedOptionId: "A",
    status: "ready",
    createdAt: 1000,
    updatedAt: 2000,
    options: [
      {
        id: "A",
        title: "Option A",
        summary: "3 updated",
        workspacePath: "C:\\proposal\\A",
        status: "ready",
        changedFiles: [
          {
            kind: "updated",
            path: "index.html",
            hash: "abc",
            size: 123,
          },
        ],
      },
    ],
  };
  const codeProposalOption = codeProposalSet.options[0];
  const codeProposalPreview = codeProposalPreviewProposal(
    codeProposalProject,
    codeProposalSet,
    codeProposalOption,
  );
  assert.equal(codeProposalPreview.previewSpec.variants[0].id, "A");
  assert.equal(
    codeProposalPreview.previewSpec.variants[0].highlights[0].label,
    "Proposed change",
  );
  assert.equal(
    codeProposalPreviewProposal(codeProposalProject, {
      ...codeProposalSet,
      originalPrompt: "Propose where user settings should live",
    }, codeProposalOption).previewSpec.variants[0].highlights[0].label,
    "Settings",
  );
  assert.match(codeProposalPreviewKey(codeProposalSet, codeProposalOption), /abc/);
  assert.equal(initialCodeProposalTab(codeProposalSet, true), "A");
  assert.equal(
    initialCodeProposalTab({ ...codeProposalSet, status: "applied" }, true),
    "live",
  );
  assert.equal(
    initialCodeProposalTab({ ...codeProposalSet, status: "applied" }, false),
    "A",
  );
  assert.equal(
    codeProposalPreviewProposal(codeProposalProject, codeProposalSet, {
      ...codeProposalOption,
      changedFiles: [],
    }),
    null,
  );
  assert.equal(
    proposalWorkspaceDisplayPath(
      "C:\\Users\\drago\\AppData\\Roaming\\Codex Local\\proposal-workspaces\\exampleX\\set-1\\A\\index.html",
    ),
    "Option A",
  );
  assert.equal(
    proposalWorkspaceDisplayPath(
      "C:\\Users\\drago\\AppData\\Roaming\\Codex Local\\proposal-workspaces\\exampleX\\set-1\\B\\styles.css",
    ),
    "Option B / styles.css",
  );
  assert.equal(
    proposalWorkspaceDisplayPath("C:\\Users\\drago\\Desktop\\exampleX\\index.html"),
    null,
  );
  assert.equal(
    projectRelativeDisplayPath(
      "C:\\Users\\drago\\Desktop\\exampleX\\index.html",
      "C:\\Users\\drago\\Desktop\\exampleX",
    ),
    "index.html",
  );
  assert.equal(
    projectRelativeDisplayPath(
      "C:\\Users\\drago\\Desktop\\elsewhere\\index.html",
      "C:\\Users\\drago\\Desktop\\exampleX",
    ),
    null,
  );

  const parsedDecision = parseVisualDecisionStrip(
    [
      "Choose.",
      "```codex-decision-strip",
      JSON.stringify({
        title: "Which proposal slot should change?",
        summary: "Canvas can compare A, B, and C.",
        options: [
          {
            id: "replace-a",
            label: "Replace A",
            description: "Use A for the new direction.",
            prompt: "Replace Option A in the current Canvas proposal set.",
            canvasAction: "replace_option",
          },
        ],
      }),
      "```",
    ].join("\n"),
  );
  assert.equal(parsedDecision?.options[0].canvasAction, "replace_option");

  const appSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/App.tsx"),
    "utf8",
  );
  assert.match(appSource, /resolveCanvasAction\(/);
  assert.match(appSource, /canvasResolution\?\.action === "CREATE_PROPOSAL"/);
  assert.match(appSource, /canvasQuestionPrompt\(/);
  assert.match(appSource, /CANVAS_OPERATING_PROMPT/);
  assert.match(appSource, /archiveCanvasProposalsForThread/);
  assert.match(appSource, /codeProposalHistoryOnComplete\?: boolean/);
  assert.match(appSource, /codeProposalHistoryOnComplete = true/);
  assert.match(appSource, /codeProposalCompareSetIdsByThreadId/);
  assert.match(appSource, /codeProposalSetIsActiveForRouting/);
  assert.match(appSource, /shouldRecoverAppliedCodeProposalFromThread/);
  assert.match(appSource, /markCodeProposalSetAsApplied/);
  assert.match(appSource, /latestActiveLiveProposalForThread\(desktop, threadId\)/);
  assert.match(appSource, /proposal\.status === "pending" &&\s*Boolean\(proposal\.previewSpec\)/s);
  assert.doesNotMatch(appSource, /fallbackVisualDecisionForTurn/);
  assert.doesNotMatch(appSource, /turnOriginalRequestForSentinel/);
  assert.doesNotMatch(appSource, /EMPTY_PROJECT_VISUAL_PLANNING_SENTINEL/);
  assert.doesNotMatch(appSource, /EXISTING_APP_VISUAL_DECISION_SENTINEL/);
  assert.doesNotMatch(appSource, /EXISTING_APP_PREVIEW_FIRST_SENTINEL/);
  assert.doesNotMatch(appSource, /\[Codex Existing App Preview First Context\]/);
  assert.doesNotMatch(appSource, /emptyProjectVisualPlanningPrompt/);
  assert.doesNotMatch(appSource, /existingAppVisualDecisionPrompt/);
  assert.doesNotMatch(appSource, /existingAppPreviewFirstPrompt/);
  assert.doesNotMatch(appSource, /shouldOfferEmptyProjectVisualPlanning/);
  assert.doesNotMatch(appSource, /shouldOfferCurrentAppVisualDecision/);
  assert.match(appSource, /author the questionnaire yourself/);
  assert.match(appSource, /Do not copy fixed default wording/);
  assert.match(appSource, /Allowed canvasAction values/);
  assert.match(appSource, /build\\s\+\(\?:selected\|this\|that\|it\|\[abc\]/);
  assert.match(appSource, /agentTextLooksLikeCodeProposalBuiltLive/);
  assert.match(appSource, /live project now contains/);
  assert.match(appSource, /candidateTurns/);
  assert.match(appSource, /visualDecisionLooksProposalReplacement/);
  assert.match(appSource, /hasActiveCanvasProposal/);
  assert.match(appSource, /proposal\?\.status === "pending" && proposal\.previewSpec/);
  assert.match(
    appSource,
    /preferredLivePreviewSelection\(\s*projectId,\s*proposal\?\.threadId/s,
  );

  const chatSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/ChatThread.tsx"),
    "utf8",
  );
  const itemUtilsSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/itemUtils.ts"),
    "utf8",
  );
  const projectSidebarSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/ProjectSidebar.tsx"),
    "utf8",
  );
  assert.match(chatSource, /\[Codex Canvas Question Context\]/);
  assert.match(chatSource, /sanitizeInternalCanvasText/);
  assert.match(chatSource, /prepared option folders/);
  assert.match(chatSource, /proposal\.proposalKind === "live_proposal"\) return false/);
  assert.doesNotMatch(chatSource, /Build selected proposal/);
  assert.doesNotMatch(chatSource, /Implement this \{proposalNoun\}/);
  assert.doesNotMatch(chatSource, /\[Codex Existing App Preview First Context\]/);
  assert.match(itemUtilsSource, /\[Codex Canvas Question Context\]/);
  assert.doesNotMatch(itemUtilsSource, /\[Codex Existing App Preview First Context\]/);
  assert.doesNotMatch(projectSidebarSource, /\[Codex Existing App Preview First Context\]/);

  const livePreviewSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/LiveAppPreview.tsx"),
    "utf8",
  );
  const mockupPreviewSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/components/MockupPreview.tsx"),
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
  const stylesSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/styles.css"),
    "utf8",
  );
  const mockupArtifactsSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/mockupArtifacts.ts"),
    "utf8",
  );
  const composerContextsSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/composerContexts.ts"),
    "utf8",
  );
  assert.match(livePreviewSource, /showDetectInline = stoppedPreview && liveLaneActive/);
  assert.match(livePreviewSource, /showUseUrlInline = stoppedPreview && liveLaneActive/);
  assert.match(livePreviewSource, /runningPreview && liveLaneActive && !overflowReloadAction/);
  assert.match(
    livePreviewSource,
    /const showChangesInline =\s*proposalLaneActive &&\s*runningPreview &&\s*selectedHighlights\.length > 0/s,
  );
  assert.match(
    livePreviewSource,
    /const showChangesInMenu =\s*proposalLaneActive &&\s*runningPreview &&\s*selectedHighlights\.length > 0/s,
  );
  assert.match(livePreviewSource, /Show changes/);
  assert.match(livePreviewSource, /canvas-lane-row live/);
  assert.match(livePreviewSource, /canvas-lane-row proposals/);
  assert.match(livePreviewSource, /const liveTitle = "Live"/);
  assert.match(livePreviewSource, /canvas-floating-viewport/);
  assert.match(livePreviewSource, /canvas-lane-transfer-popover/);
  assert.match(livePreviewSource, /laneTransferPrompt/);
  assert.match(livePreviewSource, /total === 1 \? "A" : id/);
  assert.doesNotMatch(livePreviewSource, /total === 1 \? "Preview"/);
  assert.doesNotMatch(
    livePreviewSource,
    /selectedVariant && proposalVisible\s*\?\s*"Proposal"/,
  );
  assert.match(livePreviewSource, /compareTabOptions\?: PreviewToolbarSelectOption\[\]/);
  assert.doesNotMatch(livePreviewSource, /compareTabs\?:/);
  assert.doesNotMatch(livePreviewSource, /titleLabel\?:/);
  assert.match(mockupPreviewSource, /canvas-lane-toolbar/);
  assert.match(mockupPreviewSource, /canvas-lane-row live/);
  assert.match(mockupPreviewSource, /canvas-lane-row proposals active/);
  assert.match(mockupPreviewSource, /MockupLaneTabs/);
  assert.doesNotMatch(mockupPreviewSource, /preview-compare-options/);
  assert.doesNotMatch(stylesSource, /preview-compare-options/);
  assert.match(appSource, /inspector\.type !== "mockupPreview"/);
  assert.match(
    appSource,
    /latestActiveLiveProposalForThread\(desktop, desktop\.activeThreadId\)/,
  );
  assert.match(
    appSource,
    /const selectedMockupCanShowLive = Boolean\(\s*selectedMockupPreviewSet &&\s*!selectedMockupHistoryMode,\s*\)/s,
  );
  assert.match(inspectorSource, /proposalControls=\{\{[\s\S]*autoStart: true/);
  assert.match(codeProposalPreviewSource, /buildLabel:[\s\S]*"Build selected"/);
  assert.match(codeProposalPreviewSource, /key=\{previewKey\}/);
  assert.match(codeProposalPreviewSource, /proposal=\{proposal\}/);
  assert.match(codeProposalPreviewSource, /initialCodeProposalTab/);
  assert.match(codeProposalPreviewSource, /const showLiveLane = Boolean\(project\)/);
  assert.match(codeProposalPreviewSource, /\.\.\.\(showLiveLane/);
  assert.match(codeProposalPreviewSource, /Build or run Live from a selected proposal/);
  assert.match(codeProposalPreviewSource, /label: highlightLabel/);
  assert.match(codeProposalPreviewSource, /onLaneTransfer/);
  assert.match(appSource, /transferCodeProposalLane/);
  assert.match(appSource, /onTransferCodeProposalLane/);
  assert.match(appSource, /nextAppPreviewChangeNumber/);
  assert.match(appSource, /`Change \$\{markNumber\}`/);
  assert.match(appSource, /Do not mention prepared folders/);
  assert.match(chatSource, /proposalWorkspaceDisplayPath/);
  assert.match(itemUtilsSource, /\[Codex Canvas Question Context\]/);
  assert.match(composerContextsSource, /nextAppPreviewChangeNumber/);
  assert.match(composerContextsSource, /mark\|change/i);
  assert.match(mockupArtifactsSource, /return fallbackLabel/);
  assert.match(livePreviewSource, /detectHighlightAreaInWebview/);
  assert.doesNotMatch(codeProposalPreviewSource, /onApply/);

  const localStateSource = readFileSync(
    path.join(repoRoot, "apps/desktop/src/localState.ts"),
    "utf8",
  );
  assert.match(localStateSource, /codeProposalCompareSetIdsByThreadId/);
  assert.match(localStateSource, /rawContext\.source === "proposalHighlight"/);
  assert.match(localStateSource, /normalizeVisualContextLabel/);
  assert.match(localStateSource, /`Change \$\{number\}`/);

  console.log("P27 Canvas action resolver check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
