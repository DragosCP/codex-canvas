import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p19-live-marks-test-"));
const outfile = path.join(tempDir, "composerContexts.mjs");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/composerContexts.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const { nextAppPreviewMarkNumber } = await import(pathToFileURL(outfile).href);

  const areaMark = {
    x: 10,
    y: 20,
    width: 120,
    height: 80,
    viewportWidth: 1000,
    viewportHeight: 700,
    route: "http://127.0.0.1:5173/",
    note: "",
    createdAt: 1,
  };
  const contexts = [
    {
      type: "appPreview",
      id: "app-preview:project-1:1",
      projectId: "project-1",
      projectName: "Demo",
      previewUrl: "http://127.0.0.1:5173/",
      viewport: "desktop",
      markLabel: "Live mark 1",
      markNumber: 1,
      areaMark,
    },
    {
      type: "appPreview",
      id: "app-preview:project-1:2",
      projectId: "project-1",
      projectName: "Demo",
      previewUrl: "http://127.0.0.1:5173/",
      viewport: "desktop",
      markLabel: "Live mark 2",
      areaMark: { ...areaMark, createdAt: 2 },
    },
    {
      type: "appPreview",
      id: "app-preview:project-2:9",
      projectId: "project-2",
      projectName: "Other",
      previewUrl: "http://127.0.0.1:3000/",
      viewport: "desktop",
      markLabel: "Live mark 9",
      markNumber: 9,
      areaMark: { ...areaMark, createdAt: 9 },
    },
  ];

  assert.equal(nextAppPreviewMarkNumber(contexts, "project-1"), 3);
  assert.equal(nextAppPreviewMarkNumber(contexts, "project-2"), 10);
  assert.equal(nextAppPreviewMarkNumber(contexts, "project-3"), 1);

  console.log("P19 Live Preview mark numbering check passed.");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
