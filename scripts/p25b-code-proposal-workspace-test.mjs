import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  applyProposalWorkspace,
  diffProposalWorkspace,
  prepareProposalWorkspaces,
  _test,
} = require(path.join(
  repoRoot,
  "apps/desktop/electron/proposal-workspaces.cjs",
));

const tempRoot = mkdtempSync(path.join(tmpdir(), "p25b-code-proposal-"));

try {
  const projectPath = path.join(tempRoot, "live");
  const cacheRoot = path.join(tempRoot, "cache");
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(path.join(projectPath, "index.html"), "<h1>Live</h1>\n");
  writeFileSync(path.join(projectPath, "app.js"), "console.log('live');\n");

  const prepared = await prepareProposalWorkspaces({
    cacheRoot,
    projectPath,
    proposalSetId: "proposal-test",
    optionIds: ["A", "B"],
  });
  assert.ok(prepared.registryId);
  assert.equal(prepared.options.length, 2);
  const optionA = prepared.options.find((option) => option.id === "A");
  assert.ok(optionA);
  assert.match(optionA.previewOwnerId, /^code-proposal:/);
  const registry = await _test.readProposalRegistry(cacheRoot);
  assert.equal(registry.sets[prepared.registryId]?.rootPath, prepared.rootPath);
  assert.equal(
    registry.sets[prepared.registryId]?.options[0]?.previewOwnerId,
    optionA.previewOwnerId,
  );

  writeFileSync(path.join(optionA.workspacePath, "index.html"), "<h1>Option A</h1>\n");
  writeFileSync(path.join(optionA.workspacePath, "settings.js"), "export const enabled = true;\n");

  const diff = await diffProposalWorkspace(optionA.workspacePath);
  assert.equal(diff.registryId, prepared.registryId);
  assert.equal(diff.previewOwnerId, optionA.previewOwnerId);
  assert.deepEqual(
    diff.changedFiles.map((change) => `${change.kind}:${change.path}`).sort(),
    ["created:settings.js", "updated:index.html"],
  );

  const rogueWorkspace = path.join(tempRoot, "rogue");
  mkdirSync(path.join(rogueWorkspace, ".codex-proposal"), { recursive: true });
  writeFileSync(
    path.join(rogueWorkspace, ".codex-proposal", "baseline.json"),
    JSON.stringify({
      version: 1,
      projectPath,
      proposalSetId: prepared.proposalSetId,
      optionId: "A",
      createdAt: Date.now(),
      files: {},
    }),
  );
  await assert.rejects(
    () => diffProposalWorkspace(rogueWorkspace),
    /not registered|outside its registered bounds|option is not registered/,
  );

  const applied = await applyProposalWorkspace({
    projectPath,
    workspacePath: optionA.workspacePath,
  });
  assert.equal(applied.ok, true);
  assert.equal(readFileSync(path.join(projectPath, "index.html"), "utf8"), "<h1>Option A</h1>\n");
  assert.equal(
    readFileSync(path.join(projectPath, "settings.js"), "utf8"),
    "export const enabled = true;\n",
  );

  const conflictPrepared = await prepareProposalWorkspaces({
    cacheRoot,
    projectPath,
    proposalSetId: "proposal-conflict",
    optionIds: ["A"],
  });
  const conflictA = conflictPrepared.options[0];
  writeFileSync(path.join(conflictA.workspacePath, "app.js"), "console.log('proposal');\n");
  writeFileSync(path.join(projectPath, "app.js"), "console.log('live changed');\n");
  const conflict = await applyProposalWorkspace({
    projectPath,
    workspacePath: conflictA.workspacePath,
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.conflicts[0]?.path, "app.js");

  console.log("P25b code proposal workspace check passed.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
