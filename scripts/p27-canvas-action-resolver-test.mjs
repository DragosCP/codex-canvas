import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p34-canvas-test-"));
const canvasOutfile = path.join(tempDir, "canvasActions.mjs");
const visualDecisionOutfile = path.join(tempDir, "visualDecision.mjs");
const appOutfile = path.join(tempDir, "App.mjs");
const localStateOutfile = path.join(tempDir, "localState.mjs");

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
  entryPoints: [path.join(repoRoot, "apps/desktop/src/localState.ts")],
  outfile: localStateOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  define: {
    "import.meta.env": "{}",
  },
  logLevel: "silent",
});

try {
  const { CANVAS_OPERATING_PROMPT, resolveCanvasAction } = await import(
    pathToFileURL(canvasOutfile).href
  );
  const { parseVisualDecisionStrip } = await import(
    pathToFileURL(visualDecisionOutfile).href
  );
  const {
    visualDecisionOptionCreatesCodeProposal,
    visualDecisionOptionCreatesFeatureDraft,
    visualDecisionOptionCreatesLiveOverlay,
    visualDecisionOptionCreatesMockups,
  } = await import(pathToFileURL(appOutfile).href);

  assert.match(CANVAS_OPERATING_PROMPT, /Draft Canvas/);
  assert.match(CANVAS_OPERATING_PROMPT, /Do not expose lettered proposal lanes/);
  assert.doesNotMatch(CANVAS_OPERATING_PROMPT, /Use A\/B\/C only when/);
  assert.doesNotMatch(CANVAS_OPERATING_PROMPT, /Proposal Canvas/);
  assert.doesNotMatch(CANVAS_OPERATING_PROMPT, /Build selected/);

  const live = {
    exists: true,
    running: true,
    previewUrl: "http://127.0.0.1:5173",
  };
  const emptyLive = { exists: false, running: false };
  const legacyProposal = {
    id: "old-proposal",
    backing: "code_backed_workspace",
    buildStrategy: "promote_code_workspace",
    lifecycle: "active",
    proposalLifecycle: "shown",
    selectedOptionId: "A",
    options: [
      { id: "A", title: "Old option" },
      { id: "B", title: "Other old option" },
    ],
  };

  const fixtures = [
    {
      name: "existing app preview creates Draft natively",
      input: {
        message: "Show me how quick add could work before building it",
        live,
        selectedSurface: "Live",
      },
      expected: { action: "CREATE_DRAFT", wantsOptions: false },
    },
    {
      name: "explicit alternatives create Draft directions, not proposal lanes",
      input: {
        message: "Show me three directions for the settings workflow",
        live,
        selectedSurface: "Live",
      },
      expected: { action: "CREATE_DRAFT", wantsOptions: false },
    },
    {
      name: "legacy selected proposal follow-up routes into Draft",
      input: {
        message: "Make this denser",
        live,
        selectedSurface: "A",
        activeProposalSet: legacyProposal,
      },
      expected: { action: "CREATE_DRAFT", wantsOptions: false },
    },
    {
      name: "legacy build wording routes to direct Live",
      input: {
        message: "Build this old direction",
        live,
        selectedSurface: "A",
        activeProposalSet: legacyProposal,
      },
      expected: { action: "BUILD_LIVE_DIRECTLY", wantsOptions: false },
    },
    {
      name: "blank project still asks before preview work",
      input: {
        message: "Show me a few dashboard directions",
        live: emptyLive,
        selectedSurface: "Live",
      },
      expected: { action: "ASK_USER", wantsOptions: false },
    },
    {
      name: "nonvisual backend request bypasses Canvas",
      input: {
        message: "Add a SQLite migration for todos",
        live,
        selectedSurface: "Live",
      },
      expected: { action: "BUILD_LIVE_DIRECTLY", canvasRelevant: false },
    },
  ];

  for (const fixture of fixtures) {
    const result = resolveCanvasAction(fixture.input);
    assert.equal(result.action, fixture.expected.action, fixture.name);
    if ("wantsOptions" in fixture.expected) {
      assert.equal(result.wantsOptions, fixture.expected.wantsOptions, fixture.name);
    }
    if ("canvasRelevant" in fixture.expected) {
      assert.equal(
        result.canvasRelevant,
        fixture.expected.canvasRelevant,
        fixture.name,
      );
    }
  }

  const decision = parseVisualDecisionStrip(`Pick one.
\`\`\`codex-decision-strip
{
  "title": "How should I handle this change?",
  "summary": "I can update Live now or show a Draft first.",
  "options": [
    {
      "id": "show",
      "label": "Show Draft",
      "description": "Legacy wording from old state.",
      "prompt": "Show three alternatives.",
      "canvasAction": "show_draft"
    },
    {
      "id": "build",
      "label": "Build now",
      "description": "Change the live app directly.",
      "prompt": "Build it now.",
      "canvasAction": "build_directly"
    },
    {
      "id": "replace",
      "label": "Replace old direction",
      "description": "Legacy proposal action.",
      "prompt": "Replace the old direction.",
      "canvasAction": "legacy_unknown_action"
    }
  ]
}
\`\`\``);
  assert.equal(decision?.options[0].canvasAction, "show_draft");
  assert.equal(decision?.options[1].canvasAction, "build_directly");
  assert.equal(decision?.options[2].canvasAction, undefined);

  assert.equal(
    visualDecisionOptionCreatesFeatureDraft({
      id: "draft",
      label: "Show Draft",
      description: "Try it first.",
      prompt: "Create a Draft for this change.",
      canvasAction: "show_draft",
    }),
    true,
  );
  for (const option of [
    {
      id: "code",
      label: "Runnable proposal",
      description: "Old proposal wording.",
      prompt: "Create candidate apps.",
    },
    {
      id: "mockups",
      label: "Show mockups",
      description: "Old mockup wording.",
      prompt: "Show wireframes.",
    },
  ]) {
    assert.equal(visualDecisionOptionCreatesCodeProposal(option), false);
    assert.equal(visualDecisionOptionCreatesLiveOverlay(option), false);
    assert.equal(visualDecisionOptionCreatesMockups(option), false);
  }

  const stateJson = JSON.stringify({
    version: 1,
    projects: [
      {
        id: "project-1",
        path: "C:/tmp/app",
        name: "Todo",
        pinned: false,
        hidden: false,
        archived: false,
        order: 0,
        lastActiveThreadId: "thread-1",
        settings: {},
      },
    ],
    activeProjectId: "project-1",
    activeThreadId: "thread-1",
    featureDrafts: {
      draft_1: {
        draftId: "draft_1",
        projectId: "project-1",
        rootPath: "C:/draft-root",
        workspacePath: "C:/draft-root/workspace",
        name: "Quick add",
      },
    },
    codeProposalSets: {
      old: {
        projectId: "project-1",
        rootPath: "C:/old-proposal",
        options: [{ id: "A", workspacePath: "C:/old-proposal/A" }],
      },
    },
    codeProposalActiveSetIdsByThreadId: { "thread-1": "old" },
    codeProposalCompareSetIdsByThreadId: { "thread-1": "old" },
    mockupActiveProposalSetIdsByThreadId: { "thread-1": "mockup-old" },
    mockupHistoryProposalSetIds: { "mockup-old": true },
  });
  globalThis.localStorage = {
    getItem(key) {
      return key === "codex.desktop.v1" ? stateJson : null;
    },
    setItem() {},
    removeItem() {},
  };
  const { loadDesktopState } = await import(pathToFileURL(localStateOutfile).href);
  const state = loadDesktopState();
  assert.deepEqual(state.codeProposalSets, {});
  assert.deepEqual(state.codeProposalActiveSetIdsByThreadId, {});
  assert.deepEqual(state.codeProposalCompareSetIdsByThreadId, {});
  assert.deepEqual(state.mockupActiveProposalSetIdsByThreadId, {});
  assert.deepEqual(state.mockupHistoryProposalSetIds, {});
  assert.ok(state.featureDrafts.draft_1);

  console.log("p34 draft-only canvas resolver helpers passed");
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
