import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  diffDraftWorkspace,
  prepareDraftWorkspace,
  _test,
} = require(path.join(repoRoot, "apps/desktop/electron/draft-workspaces.cjs"));

const tempRoot = mkdtempSync(path.join(tmpdir(), "p33b-draft-registry-race-"));

try {
  const projectPath = path.join(tempRoot, "live");
  const cacheRoot = path.join(tempRoot, "cache");
  mkdirSync(path.join(projectPath, "src"), { recursive: true });
  writeFileSync(path.join(projectPath, "package.json"), "{\"name\":\"race\"}\n");
  writeFileSync(path.join(projectPath, "src", "App.tsx"), "export default null;\n");

  const draftIds = Array.from(
    { length: 8 },
    (_, index) => `draft-concurrent-${index + 1}`,
  );
  const prepared = await Promise.all(
    draftIds.map((draftId, index) =>
      prepareDraftWorkspace({
        cacheRoot,
        projectPath,
        draftId,
        name: `Concurrent draft ${index + 1}`,
        threadId: "thread-race",
        goal: "Show a temporary feature workflow before implementation.",
      }),
    ),
  );

  const registry = await _test.readDraftRegistry(cacheRoot);
  for (const draft of prepared) {
    assert.ok(
      registry.drafts[draft.draftId],
      `${draft.draftId} should remain registered after concurrent prepares`,
    );
    assert.ok(existsSync(draft.workspacePath), "draft workspace should exist");
    const diff = await diffDraftWorkspace({
      cacheRoot,
      projectPath,
      draftId: draft.draftId,
    });
    assert.equal(diff.draftId, draft.draftId);
  }

  assert.equal(
    Object.keys(registry.drafts).length,
    draftIds.length,
    "concurrent draft prepares should not clobber registry entries",
  );

  console.log("p33b draft registry race passed");
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}
