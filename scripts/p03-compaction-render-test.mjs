import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(repoRoot, "apps/desktop");
const appRequire = createRequire(path.join(appDir, "package.json"));
const { createServer } = await import("vite");
const React = await import(pathToFileURL(appRequire.resolve("react")).href);
const { renderToStaticMarkup } = await import(
  pathToFileURL(appRequire.resolve("react-dom/server")).href
);

const vite = await createServer({
  appType: "custom",
  root: appDir,
  logLevel: "error",
  server: { middlewareMode: true },
});

try {
  const { ChatThread } = await vite.ssrLoadModule(
    "/src/components/ChatThread.tsx",
  );
  const markup = renderToStaticMarkup(
    React.createElement(ChatThread, {
      activeProject: projectFixture(),
      activeThread: threadFixture(),
      onSelect: () => {},
    }),
  );

  assert.match(markup, /context-compaction-divider/);
  assert.match(markup, /Context automatically compacted/);
  assert.equal(
    [...markup.matchAll(/context-compaction-divider/g)].length,
    1,
    "duplicate compaction items should render as one notice",
  );
  assert.doesNotMatch(markup, /assistant-message/);
  assert.doesNotMatch(markup, /debug/i);
  const eventsSource = fs.readFileSync(
    path.join(appDir, "src/hooks/useAppServerEvents.ts"),
    "utf8",
  );
  assert.match(
    eventsSource,
    /thread\/compacted[\s\S]*insertOptimisticCompactionItem[\s\S]*syncThread/,
    "compaction notifications should insert an inline marker before syncing",
  );
  console.log("Compaction divider fixture render checks passed.");
} finally {
  await vite.close();
}

function projectFixture() {
  return {
    id: "project-fixture",
    path: "/tmp/project-fixture",
    name: "Fixture",
    pinned: false,
    hidden: false,
    archived: false,
    order: 0,
    lastActiveThreadId: "thread-fixture",
    settings: {
      sandbox: "danger-full-access",
      approvalPolicy: "never",
      model: null,
      effort: null,
      serviceTier: null,
      planMode: false,
    },
  };
}

function threadFixture() {
  return {
    id: "thread-fixture",
    name: "Fixture thread",
    cwd: "/tmp/project-fixture",
    status: { type: "idle" },
    updatedAt: 0,
    turns: [
      {
        id: "turn-fixture",
        status: "completed",
        startedAt: 0,
        completedAt: 0,
        durationMs: null,
        error: null,
        itemsView: "full",
        items: [
          { type: "contextCompaction", id: "compact-fixture-a" },
          { type: "contextCompaction", id: "compact-fixture-b" },
        ],
      },
    ],
  };
}
