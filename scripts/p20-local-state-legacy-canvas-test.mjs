import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p20-state-test-"));
const outfile = path.join(tempDir, "localState.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/localState.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  define: {
    "import.meta.env": "{}",
  },
  logLevel: "silent",
});

const oldState = {
  version: 1,
  appServerUrl: "ws://127.0.0.1:48888",
  projects: [
    {
      id: "project-1",
      name: "Legacy state project",
      path: "C:\\Users\\drago\\Desktop\\legacy",
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      lastActiveThreadId: null,
      hidden: false,
      archived: false,
      pinned: false,
      settings: {
        sandbox: "workspace-write",
        approvalPolicy: "on-request",
        model: null,
        effort: "medium",
        serviceTier: null,
        planMode: false,
      },
    },
  ],
  activeProjectId: "project-1",
  activeThreadId: null,
  pinnedThreadIds: [],
  expandedProjectIds: ["project-1"],
  sentComposerContextsByTurnId: {
    "turn-context-1": [
      {
        type: "appPreview",
        id: "app-preview:project-1:proposal-highlight:settings-action",
        projectId: "project-1",
        projectName: "Legacy state project",
        previewUrl: "http://127.0.0.1:5173",
        viewport: "desktop",
        markLabel: "Change 1",
        markNumber: 1,
        areaMark: {
          x: 10,
          y: 20,
          width: 100,
          height: 40,
          viewportWidth: 800,
          viewportHeight: 600,
          route: "http://127.0.0.1:5173/settings",
          note: "Adjusted change target.",
          createdAt: 2,
        },
        source: "proposalHighlight",
        highlightId: "visual-patch:A:settings-action",
        threadId: "thread-1",
        proposalTurnId: "turn-live-proposal",
        proposalOptionId: "A",
        canvasLane: "A",
        canvasId: "settings-action",
        sourceFile: "src/App.tsx",
        componentName: "ToolbarActions",
        screenshotRef: "app-preview:project-1:turn-live-proposal:A:targets",
        targetResolutionKind: "exact",
        targetResolutionConfidence: "high",
      },
    ],
  },
  planProposals: {
    "turn-live-proposal": {
      id: "live-proposal:turn-live-proposal",
      projectId: "project-1",
      threadId: "thread-1",
      turnId: "turn-live-proposal",
      prompt: "Show one visual proposal",
      contexts: [],
      previewSpec: {
        version: 1,
        summary: "One visual option.",
        variants: [
          {
            id: "A",
            title: "Settings action",
            tradeoff: "Fast to review.",
            placement: "topbar",
            summary: "Adds a settings action.",
            visualPatchBundle: {
              id: "proposal-A",
              patches: [
                {
                  op: "hide",
                  target: {
                    canvasId: "legacy-settings-action",
                    sourceFile: "src/App.tsx",
                    componentName: "ToolbarActions",
                  },
                },
              ],
            },
            components: [],
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
      proposalKind: "live_proposal",
      status: "pending",
      createdAt: 1,
      updatedAt: 1,
    },
  },
  codeProposalSets: {
    "code-set-1": {
      proposalSetId: "code-set-1",
      projectId: "project-1",
      threadId: "thread-1",
      turnId: "turn-code-proposal",
      rootPath: "C:\\Users\\drago\\AppData\\Roaming\\Codex Local\\proposal-workspaces\\legacy\\code-set-1",
      originalPrompt: "Show A and B",
      selectedOptionId: "A",
      options: [
        {
          id: "A",
          title: "Option A",
          summary: "Ready",
          workspacePath:
            "C:\\Users\\drago\\AppData\\Roaming\\Codex Local\\proposal-workspaces\\legacy\\code-set-1\\A",
          status: "ready",
          changedFiles: [],
        },
      ],
      status: "ready",
      createdAt: 1,
      updatedAt: 1,
    },
  },
  mockupHistoryProjectIds: {},
  layout: {
    inspectorWidth: 640,
    commandSurfaceHeight: 220,
    inspectorOpen: true,
    commandSurfaceOpen: true,
    canvasLayersOpenByProject: {
      "project-1": true,
    },
  },
  canvases: {
    "project-1": {
      id: "legacy-canvas",
      projectId: "project-1",
      items: [],
    },
  },
  canvasSuggestions: {
    "turn-1": {
      id: "legacy-suggestion",
    },
  },
};

globalThis.localStorage = {
  getItem(key) {
    return key === "codex.desktop.v1" ? JSON.stringify(oldState) : null;
  },
  setItem() {},
  removeItem() {},
  clear() {},
};

try {
  const { loadDesktopState } = await import(pathToFileURL(outfile).href);
  const state = loadDesktopState();

  assert.equal(state.activeProjectId, "project-1");
  assert.equal(state.projects.length, 1);
  assert.equal(state.layout.inspectorWidth, 640);
  assert.equal(Object.hasOwn(state, "canvases"), false);
  assert.equal(Object.hasOwn(state, "canvasSuggestions"), false);
  assert.equal(Object.hasOwn(state.layout, "canvasLayersOpenByProject"), false);
  assert.deepEqual(
    state.planProposals,
    {},
    "P35 drops legacy plan-preview proposals instead of reviving preview lanes",
  );
  assert.equal(state.sentComposerContextsByTurnId["turn-context-1"]?.length, 1);
  assert.equal(
    state.sentComposerContextsByTurnId["turn-context-1"]?.[0]?.markLabel,
    "Mark 1",
    "P35 normalizes legacy proposal-highlight contexts to Mark chips",
  );
  assert.equal(
    state.sentComposerContextsByTurnId["turn-context-1"]?.[0]?.surface,
    "live",
  );
  assert.equal(
    "source" in (state.sentComposerContextsByTurnId["turn-context-1"]?.[0] ?? {}),
    false,
    "P35 must not hydrate proposalHighlight as an active source",
  );
  assert.deepEqual(
    state.codeProposalSets,
    {},
    "P35 keeps legacy code proposal sets from hydrating active comparison state",
  );

  console.log("P20 legacy Canvas local-state load check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
