import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p33-draft-routing-"));
const appOutfile = path.join(tempDir, "App.mjs");

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

try {
  const {
    isFeatureDraftBuildRequest,
    isFeatureDraftDiscardRequest,
    isFeatureDraftParkRequest,
    isFeatureDraftResumeRequest,
    shouldCreateFeatureDraftFromCanvasPrompt,
    shouldRouteToFeatureDraftPrompt,
  } = await import(pathToFileURL(appOutfile).href);

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: false,
      hasSelectedPreview: false,
      isExistingProject: true,
      planMode: false,
      prompt: "Show me how quick add could work in this app",
      resolutionAction: "CREATE_PROPOSAL",
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
      resolutionAction: "CREATE_PROPOSAL",
      wantsOptions: true,
    }),
    false,
  );

  assert.equal(
    shouldCreateFeatureDraftFromCanvasPrompt({
      hasActiveProposal: false,
      hasSelectedPreview: false,
      isExistingProject: false,
      planMode: false,
      prompt: "Show me how quick add could work",
      resolutionAction: "CREATE_PROPOSAL",
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
      resolutionAction: "CREATE_PROPOSAL",
      wantsOptions: false,
    }),
    false,
  );

  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: true,
      prompt: "Make it denser",
    }),
    true,
  );
  assert.equal(
    shouldRouteToFeatureDraftPrompt({
      inspectorIsDraft: true,
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
      prompt: "Park this draft",
    }),
    false,
  );

  console.log("p33 draft routing helpers passed");
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}
