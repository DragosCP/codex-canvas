import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  diffDraftWorkspace,
  prepareDraftWorkspace,
  updateDraftBrief,
  updateDraftLifecycle,
  _test,
} = require(path.join(repoRoot, "apps/desktop/electron/draft-workspaces.cjs"));

const tempRoot = mkdtempSync(path.join(tmpdir(), "p33-draft-workspace-"));

try {
  const projectPath = path.join(tempRoot, "live");
  const cacheRoot = path.join(tempRoot, "cache");
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(
    path.join(projectPath, "index.html"),
    "<main><h1>Tasks</h1><button>Add task</button></main>\n",
  );
  writeFileSync(path.join(projectPath, "app.js"), "console.log('live app');\n");
  writeFileSync(path.join(projectPath, "styles.css"), "body { font-family: system-ui; }\n");

  const sourceBefore = await sourceSnapshot(projectPath);
  const prepared = await prepareDraftWorkspace({
    cacheRoot,
    projectPath,
    draftId: "draft-quick-add-flow",
    name: "Quick add flow",
    threadId: "thread-1",
    goal:
      "Try quick add without touching C:\\Users\\example\\app\\src\\App.tsx or [data-canvas-id=quick-add] rect=1,2,3,4.",
    currentSummary: "Draft workspace prepared; Live source should remain unchanged.",
    affectedRoutes: ["/tasks"],
    mockAssumptions: ["Use in-memory task items for the draft."],
    approvedDecisions: ["Use a compact inline entry row."],
    rejectedIdeas: ["Do not add a full-screen modal."],
    openQuestions: ["Should save be instant or confirm first?"],
    buildPlan: ["Replace draft-only fake mutation with the real task API."],
    risks: ["Backend validation may require another pass."],
  });

  assert.equal(prepared.draftId, "draft-quick-add-flow");
  assert.equal(prepared.name, "Quick add flow");
  assert.equal(prepared.status, "active");
  assert.match(prepared.previewOwnerId, /^draft:/);
  assert.ok(existsSync(prepared.workspacePath), "draft workspace should exist");
  assert.notEqual(
    path.resolve(prepared.workspacePath).toLowerCase(),
    path.resolve(projectPath).toLowerCase(),
  );

  const briefPath = path.join(
    projectPath,
    ".codex",
    "drafts",
    "quick-add-flow",
    "brief.md",
  );
  assert.ok(existsSync(briefPath), "draft brief should be created");
  let brief = readFileSync(briefPath, "utf8");
  assert.match(brief, /# Draft: Quick add flow/);
  assert.match(brief, /Status: active/);
  assert.match(brief, /\/tasks/);
  assert.doesNotMatch(brief, /C:\\Users\\example/);
  assert.doesNotMatch(brief, /src\/App\.tsx|src\\App\.tsx/);
  assert.doesNotMatch(brief, /data-canvas-id/);
  assert.doesNotMatch(brief, /rect=1,2,3,4/);
  assert.doesNotMatch(brief, /registryId|previewOwnerId|workspacePath|rootPath/);

  writeFileSync(
    path.join(prepared.workspacePath, "index.html"),
    "<main><h1>Tasks</h1><form><input placeholder=\"Quick add\" /></form></main>\n",
  );
  writeFileSync(
    path.join(prepared.workspacePath, "draft-feature.js"),
    "export const draftOnly = true;\n",
  );

  assert.deepEqual(
    await sourceSnapshot(projectPath),
    sourceBefore,
    "Live implementation source should stay unchanged while the draft workspace changes",
  );

  const diff = await diffDraftWorkspace({
    cacheRoot,
    projectPath,
    draftId: prepared.draftId,
  });
  assert.equal(diff.draftId, prepared.draftId);
  assert.deepEqual(
    diff.changedFiles.map((change) => `${change.kind}:${change.path}`).sort(),
    ["created:draft-feature.js", "updated:index.html"],
  );

  const originalRegistry = await _test.readDraftRegistry(cacheRoot);
  const record = originalRegistry.drafts[prepared.draftId];
  assert.ok(record);
  assert.equal(record.status, "active");
  assert.equal(record.briefPath, briefPath);
  assert.ok(pathInside(record.workspacePath, record.rootPath));

  const corruptedRegistry = structuredClone(originalRegistry);
  corruptedRegistry.drafts[prepared.draftId] = {
    ...corruptedRegistry.drafts[prepared.draftId],
    workspacePath: path.join(tempRoot, "rogue-draft"),
  };
  mkdirSync(path.join(tempRoot, "rogue-draft"), { recursive: true });
  await _test.writeDraftRegistry(cacheRoot, corruptedRegistry);
  await assert.rejects(
    () =>
      diffDraftWorkspace({
        cacheRoot,
        projectPath,
        draftId: prepared.draftId,
      }),
    /outside its registered bounds|not registered/,
  );
  await _test.writeDraftRegistry(cacheRoot, originalRegistry);

  const parked = await updateDraftLifecycle({
    cacheRoot,
    projectPath,
    draftId: prepared.draftId,
    status: "parked",
    currentSummary:
      "Park after proving the Quick add flow. Hidden detail registryId=abc and workspacePath=C:\\tmp\\draft-workspaces\\x.",
    affectedRoutes: ["/tasks", "/analytics"],
    mockAssumptions: ["Fake save updates only local draft state."],
    approvedDecisions: ["Keep the entry row on the task list."],
  });
  assert.equal(parked.status, "parked");
  brief = readFileSync(briefPath, "utf8");
  assert.match(brief, /Status: parked/);
  assert.match(brief, /\/analytics/);
  assert.doesNotMatch(brief, /registryId=abc|workspacePath=C:\\tmp/);

  const built = await updateDraftLifecycle({
    cacheRoot,
    projectPath,
    draftId: prepared.draftId,
    status: "built",
    currentSummary: "Approved draft is ready to become source.",
    buildPlan: ["Implement with real task persistence."],
  });
  assert.equal(built.status, "built");

  const discarded = await updateDraftLifecycle({
    cacheRoot,
    projectPath,
    draftId: prepared.draftId,
    status: "discarded",
    currentSummary: "Discard the temporary draft record after proof.",
    risks: ["None for Live source because the workspace was isolated."],
  });
  assert.equal(discarded.status, "discarded");

  await updateDraftBrief({
    cacheRoot,
    projectPath,
    draftId: prepared.draftId,
    goal: "Final concise build note.",
    currentSummary: "Brief can be refreshed independently of lifecycle.",
    affectedRoutes: ["/tasks"],
    mockAssumptions: ["No production backend writes in draft mode."],
  });
  brief = readFileSync(briefPath, "utf8");
  assert.match(brief, /Final concise build note/);
  assert.match(brief, /No production backend writes/);
  assert.doesNotMatch(brief, new RegExp(escapeRegExp(prepared.workspacePath)));
  assert.doesNotMatch(brief, new RegExp(escapeRegExp(prepared.registryId)));
  assert.doesNotMatch(brief, new RegExp(escapeRegExp(prepared.previewOwnerId)));
  assert.deepEqual(
    await sourceSnapshot(projectPath),
    sourceBefore,
    "Brief and lifecycle updates should not alter Live implementation source",
  );

  console.log("P33 draft workspace proof passed.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

async function sourceSnapshot(rootPath) {
  const files = {};
  await walk(rootPath, async (filePath, relativePath) => {
    if (relativePath.split(/[\\/]/).includes(".codex")) return;
    const bytes = readFileSync(filePath);
    files[relativePath.replace(/\\/g, "/")] = crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex");
  });
  return files;
}

async function walk(rootPath, visit, dirPath = rootPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, entryPath);
    if (entry.isDirectory()) {
      await walk(rootPath, visit, entryPath);
    } else if (entry.isFile()) {
      await stat(entryPath);
      await visit(entryPath, relativePath);
    }
  }
}

function pathInside(candidate, parentDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(candidate));
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
