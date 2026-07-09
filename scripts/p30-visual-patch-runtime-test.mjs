import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(path.join(tmpdir(), "p30-visual-patch-test-"));
const runtimeOutfile = path.join(tempDir, "visualPatchRuntime.mjs");
const targetingOutfile = path.join(tempDir, "canvasTargeting.mjs");
const visualReferencesOutfile = path.join(tempDir, "canvasVisualReferences.mjs");
const stalenessOutfile = path.join(tempDir, "canvasProposalStaleness.mjs");
const childScript = path.join(tempDir, "electron-child.cjs");
const resultFile = path.join(tempDir, "result.json");
const artifactDir = path.join(repoRoot, "artifacts", "p30");

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/visualPatchRuntime.ts")],
  outfile: runtimeOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/canvasTargeting.ts")],
  outfile: targetingOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [path.join(repoRoot, "apps/desktop/src/canvasVisualReferences.ts")],
  outfile: visualReferencesOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

await build({
  entryPoints: [
    path.join(repoRoot, "apps/desktop/src/canvasProposalStaleness.ts"),
  ],
  outfile: stalenessOutfile,
  bundle: true,
  format: "esm",
  platform: "node",
  logLevel: "silent",
});

try {
  const runtime = await import(pathToFileURL(runtimeOutfile).href);
  const targeting = await import(pathToFileURL(targetingOutfile).href);
  const visualReferences = await import(pathToFileURL(visualReferencesOutfile).href);
  const staleness = await import(pathToFileURL(stalenessOutfile).href);

  assert.equal(
    runtime.validateVisualPatchV0({
      op: "style",
      target: { canvasId: "primary-action" },
      css: { backgroundColor: "rgb(238, 188, 66)" },
    }).ok,
    true,
  );
  assert.equal(
    runtime.validateVisualPatchV0({
      op: "text",
      target: { canvasId: "primary-action" },
      value: "Save now",
    }).ok,
    true,
  );
  assert.equal(
    runtime.validateVisualPatchV0({
      op: "move",
      target: { canvasId: "primary-action" },
      relation: "below",
    }).status,
    "unsupported-op",
  );
  assert.equal(
    runtime.validateVisualPatchV0({
      op: "insert",
      target: { canvasId: "primary-action" },
      value: "Nope",
    }).status,
    "unsupported-op",
  );
  assert.equal(
    runtime.validateVisualPatchV0({
      op: "reparent",
      target: { canvasId: "primary-action" },
      value: "Nope",
    }).status,
    "unsupported-op",
  );
  assert.equal(
    runtime.validateVisualPatch({
      op: "hide",
      target: { canvasId: "secondary-panel" },
    }).ok,
    true,
  );
  assert.deepEqual(
    runtime.validateVisualPatch({
      op: "show",
      target: {
        canvasId: "collapsed-panel",
        sourceFile: "src/App.tsx",
        componentName: "CollapsedPanel",
      },
    }).patch.target,
    {
      canvasId: "collapsed-panel",
      sourceFile: "src/App.tsx",
      componentName: "CollapsedPanel",
    },
  );
  assert.equal(
    runtime.validateVisualPatch({
      op: "move",
      target: { canvasId: "primary-action" },
      relation: "below",
    }).status,
    "unsupported-op",
  );
  const sampleBounds = {
    x: 12,
    y: 24,
    width: 120,
    height: 40,
    viewportWidth: 800,
    viewportHeight: 600,
  };
  const elementRef = {
    canvasId: "primary-action",
    sourceFile: "src/App.tsx",
    componentName: "PrimaryAction",
  };
  assert.deepEqual(
    targeting.exactTargetResolution(elementRef, sampleBounds, "snapshot-1"),
    {
      kind: "exact",
      confidence: "high",
      elementRef,
      bounds: sampleBounds,
      screenshotRef: "snapshot-1",
    },
  );
  assert.equal(
    targeting.inferredTargetResolution(sampleBounds, "snapshot-2", elementRef)
      .confidence,
    "medium",
  );
  assert.equal(
    targeting.inferredTargetResolution(sampleBounds, "snapshot-3").confidence,
    "low",
  );
  assert.deepEqual(targeting.visualOnlyTargetResolution(sampleBounds, "mark-1"), {
    kind: "visual_only",
    confidence: "low",
    bounds: sampleBounds,
    screenshotRef: "mark-1",
  });
  const patchTargetHighlights =
    visualReferences.proposalHighlightsForVisualPatchTargets({
      bundle: {
        id: "proposal-A",
        patches: [
          {
            op: "style",
            target: elementRef,
            css: { backgroundColor: "rgb(238, 188, 66)" },
          },
          {
            op: "text",
            target: { canvasId: "primary-action" },
            value: "Save final",
          },
        ],
      },
      targetMetadata: {
        ok: true,
        screenshotRef: "snapshot-1",
        route: "http://127.0.0.1:5173/",
        viewportWidth: 800,
        viewportHeight: 600,
        targets: [
          {
            elementRef,
            resolution: targeting.exactTargetResolution(
              elementRef,
              sampleBounds,
              "snapshot-1",
            ),
            tagName: "button",
            text: "Save changes",
          },
        ],
      },
      variantId: "A",
      route: "http://127.0.0.1:5173/",
      createdAt: 10,
      referenceMeta: {
        threadId: "thread-1",
        proposalTurnId: "turn-1",
      },
    });
  assert.equal(patchTargetHighlights.length, 1);
  assert.equal(patchTargetHighlights[0].label, "Change 1");
  assert.equal(patchTargetHighlights[0].canvasId, "primary-action");
  assert.equal(patchTargetHighlights[0].sourceFile, "src/App.tsx");
  assert.equal(patchTargetHighlights[0].componentName, "PrimaryAction");
  assert.equal(patchTargetHighlights[0].proposalOptionId, "A");
  assert.equal(patchTargetHighlights[0].canvasLane, "A");
  assert.equal(patchTargetHighlights[0].proposalTurnId, "turn-1");
  assert.equal(patchTargetHighlights[0].targetResolutionKind, "exact");
  assert.equal(patchTargetHighlights[0].targetResolutionConfidence, "high");
  assert.equal(patchTargetHighlights[0].areaMark.width, 120);
  const authoredHighlightWithMetadata =
    visualReferences.mergeProposalHighlightsWithVisualPatchTargets(
      [
        {
          id: "authored-change",
          label: "Settings action",
          note: "Existing authored highlight.",
          areaMark: {
            x: 1,
            y: 2,
            width: 3,
            height: 4,
            viewportWidth: 800,
            viewportHeight: 600,
            note: "Existing authored highlight.",
            createdAt: 20,
          },
        },
      ],
      patchTargetHighlights,
    );
  assert.equal(authoredHighlightWithMetadata[0].label, "Settings action");
  assert.equal(authoredHighlightWithMetadata[0].canvasId, "primary-action");
  assert.equal(authoredHighlightWithMetadata[0].areaMark.width, 3);
  const phaseSevenBundle = {
    id: "phase-7",
    patches: [
      {
        op: "style",
        target: elementRef,
        css: { color: "rgb(12, 12, 12)" },
      },
    ],
  };
  const phaseSevenMetadata = {
    ok: true,
    screenshotRef: "snapshot-1",
    route: "http://localhost:5173/settings",
    viewportWidth: 800,
    viewportHeight: 600,
    targets: [
      {
        elementRef,
        resolution: targeting.exactTargetResolution(
          elementRef,
          sampleBounds,
          "snapshot-1",
        ),
        tagName: "button",
        text: "Save changes",
      },
    ],
  };
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalProjectId: "project-1",
      currentProjectId: "project-1",
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      variant: { id: "A", route: "/settings" },
      bundle: phaseSevenBundle,
      baselineSession: {
        previewUrl: "http://127.0.0.1:5173",
        route: "http://127.0.0.1:5173/settings",
        viewport: "desktop",
        interactionState: "Proposal selected.",
        cleanupStatus: "selected",
        updatedAt: 1,
      },
      currentPreviewUrl: "http://localhost:5173",
      currentRoute: "http://localhost:5173/settings",
      currentViewport: "desktop",
      targetMetadata: phaseSevenMetadata,
    }).stale,
    false,
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: null,
    }).reason,
    "missing_backing_artifact",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalProjectId: "project-1",
      currentProjectId: "project-2",
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: phaseSevenBundle,
    }).reason,
    "project_changed",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: phaseSevenBundle,
      baselineSession: {
        previewUrl: "http://localhost:5173",
        route: "http://localhost:5173/settings",
        viewport: "desktop",
        interactionState: "",
        cleanupStatus: "selected",
        updatedAt: 1,
      },
      currentPreviewUrl: "http://localhost:3000",
    }).reason,
    "preview_url_changed",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: phaseSevenBundle,
      baselineSession: {
        previewUrl: "http://localhost:5173",
        route: "http://localhost:5173/settings",
        viewport: "desktop",
        interactionState: "",
        cleanupStatus: "selected",
        updatedAt: 1,
      },
      currentPreviewUrl: "http://localhost:5173",
      currentRoute: "http://localhost:5173/billing",
    }).reason,
    "route_changed",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: phaseSevenBundle,
      baselineSession: {
        previewUrl: "http://localhost:5173",
        route: "http://localhost:5173/settings",
        viewport: "desktop",
        interactionState: "",
        cleanupStatus: "selected",
        updatedAt: 1,
      },
      currentPreviewUrl: "http://localhost:5173",
      currentRoute: "http://localhost:5173/settings",
      currentViewport: "mobile",
    }).reason,
    "viewport_changed",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: phaseSevenBundle,
      targetMetadata: {
        ...phaseSevenMetadata,
        targets: [],
      },
    }).reason,
    "canvas_target_missing",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      proposalBacking: "live_dom_patch",
      buildStrategy: "convert_dom_patch_to_code",
      bundle: phaseSevenBundle,
      targetMetadata: {
        ...phaseSevenMetadata,
        targets: [
          {
            ...phaseSevenMetadata.targets[0],
            elementRef: {
              ...elementRef,
              sourceFile: "src/Other.tsx",
            },
          },
        ],
      },
    }).reason,
    "source_file_changed",
  );
  assert.equal(
    staleness.evaluateLiveDomPatchStaleness({
      bundle: null,
    }).stale,
    false,
    "missing backing type must not be conflated with live DOM patch backing",
  );
  assert.equal(
    staleness.evaluateCodeWorkspaceStaleness({
      proposalProjectId: "project-1",
      currentProjectId: "project-1",
      workspacePath: "",
    }).reason,
    "missing_backing_artifact",
  );
  assert.equal(
    staleness.evaluateCodeWorkspaceStaleness({
      proposalProjectId: "project-1",
      currentProjectId: "project-1",
      rootPath: "C:\\proposal\\set-1",
      workspacePath: "C:\\proposal\\other-set\\A",
    }).reason,
    "workspace_outside_registry",
  );
  assert.equal(
    staleness.evaluateCodeWorkspaceStaleness({
      proposalProjectId: "project-1",
      currentProjectId: "project-1",
      rootPath: "C:\\proposal\\set-1",
      workspacePath: "C:\\proposal\\set-1\\A",
      previewOwnerId: "code-proposal:set-1:A",
      currentPreviewOwnerId: "code-proposal:set-1:B",
    }).reason,
    "preview_owner_changed",
  );

  writeFileSync(childScript, electronChildSource(), "utf8");
  mkdirSync(artifactDir, { recursive: true });
  const electronPath = require("electron");
  const child = spawn(electronPath, [childScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      P30_RUNTIME_MODULE: pathToFileURL(runtimeOutfile).href,
      P30_TARGETING_MODULE: pathToFileURL(targetingOutfile).href,
      P30_ARTIFACT_DIR: artifactDir,
      P30_RESULT_FILE: resultFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await waitForChild(child, 45_000);
  if (exitCode !== 0) {
    throw new Error(
      [
        "P30 Electron proof failed.",
        stdout.trim(),
        stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (!existsSync(resultFile)) {
    throw new Error("P30 Electron proof did not write a result file.");
  }
  const result = JSON.parse(readFileSync(resultFile, "utf8"));
  assert.equal(result.ok, true);
  assert.equal(result.beforeStyle, "rgb(20, 40, 60)");
  assert.equal(result.patchedStyle, "rgb(238, 188, 66)");
  assert.equal(result.patchedText, "Save final");
  assert.equal(result.panelHiddenAfterPatch, true);
  assert.equal(result.afterRerenderStyle, "rgb(238, 188, 66)");
  assert.equal(result.afterRerenderText, "Save final");
  assert.equal(result.panelHiddenAfterRerender, true);
  assert.equal(result.clearedStyle, "rgb(20, 40, 60)");
  assert.equal(result.clearedText, "Save changes");
  assert.equal(result.panelHiddenAfterMainClear, false);
  assert.equal(result.mainClearActiveCount, 1);
  assert.equal(result.collapsedHiddenBeforeShow, true);
  assert.equal(result.collapsedHiddenAfterShow, false);
  assert.equal(result.collapsedHiddenAfterMainClear, false);
  assert.equal(result.collapsedHiddenAfterShowClear, true);
  assert.equal(result.hotSwapLaneAStyle, "rgb(10, 100, 200)");
  assert.equal(result.hotSwapLiveStyleAfterA, "rgb(20, 40, 60)");
  assert.equal(result.hotSwapLaneBStyle, "rgb(90, 20, 140)");
  assert.equal(result.hotSwapLiveStyleAfterB, "rgb(20, 40, 60)");
  assert.equal(result.hotSwapFormValue, "Typed while live");
  assert.equal(result.secondWindowActiveCount, 0);
  assert.equal(result.targetResolutionKind, "exact");
  assert.equal(result.targetResolutionConfidence, "high");
  assert.equal(result.targetSourceFile, "src/App.tsx");
  assert.equal(result.targetComponentName, "PrimaryAction");
  assert.equal(result.sourceUnchanged, true);
  assert.equal(result.projectFileListUnchanged, true);
  for (const screenshot of result.screenshots) {
    assert.equal(existsSync(screenshot), true, screenshot);
  }

  console.log("P30 VisualPatch runtime proof passed.");
  console.log("Screenshots:");
  for (const screenshot of result.screenshots) {
    console.log(`- ${screenshot}`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function waitForChild(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
}

function electronChildSource() {
  return String.raw`
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");

app.commandLine.appendSwitch("disable-gpu");

async function main() {
  const runtime = await import(process.env.P30_RUNTIME_MODULE);
  const targeting = await import(process.env.P30_TARGETING_MODULE);
  const artifactDir = process.env.P30_ARTIFACT_DIR;
  const resultFile = process.env.P30_RESULT_FILE;
  const tempAppDir = fs.mkdtempSync(path.join(os.tmpdir(), "p30-real-app-"));
  const appFile = path.join(tempAppDir, "index.html");
  const html = [
    "<!doctype html>",
    "<html>",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <title>P30 VisualPatch Proof</title>",
    "  <style>",
    "    body { font-family: system-ui, sans-serif; padding: 32px; }",
    "    button { border: 0; border-radius: 8px; padding: 12px 18px; }",
    "    .panel { margin-top: 16px; padding: 14px; background: rgb(244, 246, 248); }",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <h1>P30 Proof App</h1>",
    "    <button data-canvas-id=\"primary-action\" data-canvas-source-file=\"src/App.tsx\" data-canvas-component=\"PrimaryAction\" id=\"primary-action\" style=\"background-color: rgb(20, 40, 60); color: white;\">Save changes</button>",
    "    <section data-canvas-id=\"secondary-panel\" data-canvas-source-file=\"src/App.tsx\" data-canvas-component=\"SecondaryPanel\" id=\"secondary-panel\" class=\"panel\">Secondary panel</section>",
    "    <section data-canvas-id=\"collapsed-panel\" data-canvas-source-file=\"src/App.tsx\" data-canvas-component=\"CollapsedPanel\" id=\"collapsed-panel\" class=\"panel\" hidden>Collapsed panel</section>",
    "    <input data-canvas-id=\"title-input\" id=\"title-input\" value=\"Draft title\" />",
    "    <button id=\"rerender\" onclick=\"window.__p30Rerender()\">Re-render</button>",
    "  </main>",
    "  <script>",
    "    window.__p30RenderCount = 0;",
    "    window.__p30Rerender = function () {",
    "      window.__p30RenderCount += 1;",
    "      const oldButton = document.querySelector('[data-canvas-id=\\\"primary-action\\\"]');",
    "      const nextButton = document.createElement('button');",
    "      nextButton.id = 'primary-action';",
    "      nextButton.setAttribute('data-canvas-id', 'primary-action');",
    "      nextButton.setAttribute('data-canvas-source-file', 'src/App.tsx');",
    "      nextButton.setAttribute('data-canvas-component', 'PrimaryAction');",
    "      nextButton.setAttribute('style', 'background-color: rgb(20, 40, 60); color: white;');",
    "      nextButton.textContent = 'Save changes ' + window.__p30RenderCount;",
    "      oldButton.replaceWith(nextButton);",
    "      const oldPanel = document.querySelector('[data-canvas-id=\\\"secondary-panel\\\"]');",
    "      const nextPanel = document.createElement('section');",
    "      nextPanel.id = 'secondary-panel';",
    "      nextPanel.className = 'panel';",
    "      nextPanel.setAttribute('data-canvas-id', 'secondary-panel');",
    "      nextPanel.setAttribute('data-canvas-source-file', 'src/App.tsx');",
    "      nextPanel.setAttribute('data-canvas-component', 'SecondaryPanel');",
    "      nextPanel.textContent = 'Secondary panel ' + window.__p30RenderCount;",
    "      oldPanel.replaceWith(nextPanel);",
    "    };",
    "  </script>",
    "</body>",
    "</html>"
  ].join("\n");
  fs.writeFileSync(appFile, html, "utf8");
  const sourceBefore = fs.readFileSync(appFile, "utf8");
  const filesBefore = fs.readdirSync(tempAppDir).sort();

  await app.whenReady();
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await win.loadFile(appFile);

  const screenshots = [];
  async function capture(name) {
    const image = await win.webContents.capturePage();
    const file = path.join(artifactDir, "p30-" + name + ".png");
    fs.writeFileSync(file, image.toPNG());
    screenshots.push(file);
  }
  const evalInPage = (script) => win.webContents.executeJavaScript(script, true);
  const styleOfTarget = () =>
    evalInPage("getComputedStyle(document.querySelector('[data-canvas-id=\"primary-action\"]')).backgroundColor");
  const textOfTarget = (canvasId) =>
    evalInPage("document.querySelector('[data-canvas-id=\"" + canvasId + "\"]').textContent");
  const hiddenOfTarget = (canvasId) =>
    evalInPage("document.querySelector('[data-canvas-id=\"" + canvasId + "\"]').hidden");
  const displayOfTarget = (canvasId) =>
    evalInPage("getComputedStyle(document.querySelector('[data-canvas-id=\"" + canvasId + "\"]')).display");
  const ariaHiddenOfTarget = (canvasId) =>
    evalInPage("document.querySelector('[data-canvas-id=\"" + canvasId + "\"]').getAttribute('aria-hidden')");
  const titleInputValue = () =>
    evalInPage("document.querySelector('[data-canvas-id=\"title-input\"]').value");

  await capture("before");
  const beforeStyle = await styleOfTarget();
  assert.equal(beforeStyle, "rgb(20, 40, 60)");
  const targetMetadata = await evalInPage(targeting.buildCanvasTargetMetadataScript({
    screenshotRef: "p30-before-targets",
    maxTargets: 10
  }));
  assert.equal(targetMetadata.ok, true);
  const primaryTarget = targetMetadata.targets.find((target) => target.elementRef.canvasId === "primary-action");
  assert.ok(primaryTarget);
  assert.equal(primaryTarget.elementRef.sourceFile, "src/App.tsx");
  assert.equal(primaryTarget.elementRef.componentName, "PrimaryAction");
  assert.equal(primaryTarget.resolution.kind, "exact");
  assert.equal(primaryTarget.resolution.confidence, "high");
  assert.equal(primaryTarget.resolution.screenshotRef, "p30-before-targets");
  assert.equal(primaryTarget.resolution.elementRef.canvasId, "primary-action");
  assert.equal(
    primaryTarget.resolution.bounds.viewportWidth,
    targetMetadata.viewportWidth,
  );
  assert.equal(
    primaryTarget.resolution.bounds.viewportHeight,
    targetMetadata.viewportHeight,
  );
  assert.ok(targetMetadata.viewportWidth > 0);
  assert.ok(targetMetadata.viewportHeight > 0);
  assert.ok(primaryTarget.resolution.bounds.width > 0);
  assert.ok(primaryTarget.resolution.bounds.height > 0);

  const patchBundle = {
    id: "phase-3-main",
    patches: [
      {
        op: "style",
        target: {
          canvasId: "primary-action",
          sourceFile: "src/App.tsx",
          componentName: "PrimaryAction"
        },
        css: {
          backgroundColor: "rgb(238, 188, 66)",
          color: "rgb(17, 24, 39)"
        }
      },
      {
        op: "text",
        target: { canvasId: "primary-action" },
        value: "Save final"
      },
      {
        op: "hide",
        target: {
          canvasId: "secondary-panel",
          sourceFile: "src/App.tsx",
          componentName: "SecondaryPanel"
        }
      }
    ]
  };
  const applyResult = await evalInPage(runtime.buildVisualPatchApplyScript(patchBundle));
  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.activeCount, 3);
  assert.deepEqual(
    applyResult.results.map((result) => result.bundleId),
    ["phase-3-main", "phase-3-main", "phase-3-main"],
  );
  const patchedStyle = await styleOfTarget();
  const patchedText = await textOfTarget("primary-action");
  const panelHiddenAfterPatch = await hiddenOfTarget("secondary-panel");
  const panelDisplayAfterPatch = await displayOfTarget("secondary-panel");
  const panelAriaHiddenAfterPatch = await ariaHiddenOfTarget("secondary-panel");
  assert.equal(patchedStyle, "rgb(238, 188, 66)");
  assert.equal(patchedText, "Save final");
  assert.equal(panelHiddenAfterPatch, true);
  assert.equal(panelDisplayAfterPatch, "none");
  assert.equal(panelAriaHiddenAfterPatch, "true");
  await capture("patched");

  await evalInPage("window.__p30Rerender()");
  await new Promise((resolve) => setTimeout(resolve, 120));
  const afterRerenderStyle = await styleOfTarget();
  const afterRerenderText = await textOfTarget("primary-action");
  const panelHiddenAfterRerender = await hiddenOfTarget("secondary-panel");
  const panelDisplayAfterRerender = await displayOfTarget("secondary-panel");
  assert.equal(afterRerenderStyle, "rgb(238, 188, 66)");
  assert.equal(afterRerenderText, "Save final");
  assert.equal(panelHiddenAfterRerender, true);
  assert.equal(panelDisplayAfterRerender, "none");
  await capture("after-rerender");

  const missingResult = await evalInPage(runtime.buildVisualPatchApplyScript({
    op: "style",
    target: { canvasId: "missing-target" },
    css: { color: "red" }
  }));
  assert.equal(missingResult.ok, false);
  assert.equal(missingResult.results[0].status, "missing-target");

  const second = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  await second.loadFile(appFile);
  const secondState = await second.webContents.executeJavaScript(runtime.buildVisualPatchInstallScript(), true);
  assert.equal(secondState.activeCount, 0);
  const secondWindowStyle = await second.webContents.executeJavaScript(
    "getComputedStyle(document.querySelector('[data-canvas-id=\"primary-action\"]')).backgroundColor",
    true
  );
  assert.equal(secondWindowStyle, "rgb(20, 40, 60)");
  second.destroy();

  const collapsedHiddenBeforeShow = await hiddenOfTarget("collapsed-panel");
  assert.equal(collapsedHiddenBeforeShow, true);
  const showResult = await evalInPage(runtime.buildVisualPatchApplyScript({
    id: "phase-3-show",
    patches: [
      {
        op: "show",
        target: {
          canvasId: "collapsed-panel",
          sourceFile: "src/App.tsx",
          componentName: "CollapsedPanel"
        }
      }
    ]
  }));
  assert.equal(showResult.ok, true);
  assert.equal(showResult.activeCount, 4);
  const collapsedHiddenAfterShow = await hiddenOfTarget("collapsed-panel");
  const collapsedDisplayAfterShow = await displayOfTarget("collapsed-panel");
  assert.equal(collapsedHiddenAfterShow, false);
  assert.equal(collapsedDisplayAfterShow, "block");

  const clearResult = await evalInPage(runtime.buildVisualPatchClearScript("phase-3-main"));
  assert.equal(clearResult.ok, true);
  assert.equal(clearResult.activeCount, 1);
  const mainClearActiveCount = clearResult.activeCount;
  const clearedStyle = await styleOfTarget();
  const clearedText = await textOfTarget("primary-action");
  const panelHiddenAfterMainClear = await hiddenOfTarget("secondary-panel");
  const collapsedHiddenAfterMainClear = await hiddenOfTarget("collapsed-panel");
  assert.equal(clearedStyle, "rgb(20, 40, 60)");
  assert.equal(clearedText, "Save changes");
  assert.equal(panelHiddenAfterMainClear, false);
  assert.equal(collapsedHiddenAfterMainClear, false);

  const showClearResult = await evalInPage(runtime.buildVisualPatchClearScript("phase-3-show"));
  assert.equal(showClearResult.ok, true);
  assert.equal(showClearResult.activeCount, 0);
  const collapsedHiddenAfterShowClear = await hiddenOfTarget("collapsed-panel");
  assert.equal(collapsedHiddenAfterShowClear, true);

  await evalInPage("document.querySelector('[data-canvas-id=\"title-input\"]').value = 'Typed while live'");
  const laneAResult = await evalInPage(runtime.buildVisualPatchApplyScript({
    id: "lane-A",
    patches: [
      {
        op: "style",
        target: { canvasId: "primary-action" },
        css: { backgroundColor: "rgb(10, 100, 200)" }
      },
      {
        op: "text",
        target: { canvasId: "primary-action" },
        value: "Lane A"
      }
    ]
  }));
  assert.equal(laneAResult.ok, true);
  assert.equal(laneAResult.activeCount, 2);
  const hotSwapLaneAStyle = await styleOfTarget();
  const hotSwapLaneAText = await textOfTarget("primary-action");
  assert.equal(hotSwapLaneAStyle, "rgb(10, 100, 200)");
  assert.equal(hotSwapLaneAText, "Lane A");
  const clearLaneAResult = await evalInPage(runtime.buildVisualPatchClearScript("lane-A"));
  assert.equal(clearLaneAResult.ok, true);
  assert.equal(clearLaneAResult.activeCount, 0);
  const hotSwapLiveStyleAfterA = await styleOfTarget();
  const hotSwapLiveTextAfterA = await textOfTarget("primary-action");
  assert.equal(hotSwapLiveStyleAfterA, "rgb(20, 40, 60)");
  assert.equal(hotSwapLiveTextAfterA, "Save changes");
  const laneBResult = await evalInPage(runtime.buildVisualPatchApplyScript({
    id: "lane-B",
    patches: [
      {
        op: "style",
        target: { canvasId: "primary-action" },
        css: { backgroundColor: "rgb(90, 20, 140)" }
      },
      {
        op: "text",
        target: { canvasId: "primary-action" },
        value: "Lane B"
      }
    ]
  }));
  assert.equal(laneBResult.ok, true);
  assert.equal(laneBResult.activeCount, 2);
  const hotSwapLaneBStyle = await styleOfTarget();
  const hotSwapLaneBText = await textOfTarget("primary-action");
  assert.equal(hotSwapLaneBStyle, "rgb(90, 20, 140)");
  assert.equal(hotSwapLaneBText, "Lane B");
  const clearLaneBResult = await evalInPage(runtime.buildVisualPatchClearScript("lane-B"));
  assert.equal(clearLaneBResult.ok, true);
  assert.equal(clearLaneBResult.activeCount, 0);
  const hotSwapLiveStyleAfterB = await styleOfTarget();
  const hotSwapLiveTextAfterB = await textOfTarget("primary-action");
  const hotSwapFormValue = await titleInputValue();
  assert.equal(hotSwapLiveStyleAfterB, "rgb(20, 40, 60)");
  assert.equal(hotSwapLiveTextAfterB, "Save changes");
  assert.equal(hotSwapFormValue, "Typed while live");
  await capture("cleared");

  const sourceAfter = fs.readFileSync(appFile, "utf8");
  const filesAfter = fs.readdirSync(tempAppDir).sort();
  const result = {
    ok: true,
    beforeStyle,
    patchedStyle,
    patchedText,
    panelHiddenAfterPatch,
    afterRerenderStyle,
    afterRerenderText,
    panelHiddenAfterRerender,
    clearedStyle,
    clearedText,
    panelHiddenAfterMainClear,
    mainClearActiveCount,
    collapsedHiddenBeforeShow,
    collapsedHiddenAfterShow,
    collapsedHiddenAfterMainClear,
    collapsedHiddenAfterShowClear,
    hotSwapLaneAStyle,
    hotSwapLiveStyleAfterA,
    hotSwapLaneBStyle,
    hotSwapLiveStyleAfterB,
    hotSwapFormValue,
    secondWindowActiveCount: secondState.activeCount,
    targetResolutionKind: primaryTarget.resolution.kind,
    targetResolutionConfidence: primaryTarget.resolution.confidence,
    targetSourceFile: primaryTarget.elementRef.sourceFile,
    targetComponentName: primaryTarget.elementRef.componentName,
    sourceUnchanged: sourceBefore === sourceAfter,
    projectFileListUnchanged: JSON.stringify(filesBefore) === JSON.stringify(filesAfter),
    screenshots
  };
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2), "utf8");
  win.destroy();
  fs.rmSync(tempAppDir, { recursive: true, force: true });
  app.quit();
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  app.exit(1);
});
`;
}
