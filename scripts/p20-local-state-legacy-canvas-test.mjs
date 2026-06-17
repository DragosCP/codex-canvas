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
  planProposals: {},
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

  console.log("P20 legacy Canvas local-state load check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
