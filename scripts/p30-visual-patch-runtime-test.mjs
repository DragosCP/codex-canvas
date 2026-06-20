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

try {
  const runtime = await import(pathToFileURL(runtimeOutfile).href);

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

  writeFileSync(childScript, electronChildSource(), "utf8");
  mkdirSync(artifactDir, { recursive: true });
  const electronPath = require("electron");
  const child = spawn(electronPath, [childScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      P30_RUNTIME_MODULE: pathToFileURL(runtimeOutfile).href,
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
  assert.equal(result.afterRerenderStyle, "rgb(238, 188, 66)");
  assert.equal(result.clearedStyle, "rgb(20, 40, 60)");
  assert.equal(result.secondWindowActiveCount, 0);
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
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <h1>P30 Proof App</h1>",
    "    <button data-canvas-id=\"primary-action\" id=\"primary-action\" style=\"background-color: rgb(20, 40, 60); color: white;\">Save changes</button>",
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
    "      nextButton.setAttribute('style', 'background-color: rgb(20, 40, 60); color: white;');",
    "      nextButton.textContent = 'Save changes ' + window.__p30RenderCount;",
    "      oldButton.replaceWith(nextButton);",
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

  await capture("before");
  const beforeStyle = await styleOfTarget();
  assert.equal(beforeStyle, "rgb(20, 40, 60)");

  const patch = {
    op: "style",
    target: { canvasId: "primary-action" },
    css: {
      backgroundColor: "rgb(238, 188, 66)",
      color: "rgb(17, 24, 39)"
    }
  };
  const applyResult = await evalInPage(runtime.buildVisualPatchApplyScript(patch));
  assert.equal(applyResult.ok, true);
  assert.equal(applyResult.activeCount, 1);
  const patchedStyle = await styleOfTarget();
  assert.equal(patchedStyle, "rgb(238, 188, 66)");
  await capture("patched");

  await evalInPage("window.__p30Rerender()");
  await new Promise((resolve) => setTimeout(resolve, 120));
  const afterRerenderStyle = await styleOfTarget();
  assert.equal(afterRerenderStyle, "rgb(238, 188, 66)");
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

  const clearResult = await evalInPage(runtime.buildVisualPatchClearScript());
  assert.equal(clearResult.ok, true);
  assert.equal(clearResult.activeCount, 0);
  const clearedStyle = await styleOfTarget();
  assert.equal(clearedStyle, "rgb(20, 40, 60)");
  await capture("cleared");

  const sourceAfter = fs.readFileSync(appFile, "utf8");
  const filesAfter = fs.readdirSync(tempAppDir).sort();
  const result = {
    ok: true,
    beforeStyle,
    patchedStyle,
    afterRerenderStyle,
    clearedStyle,
    secondWindowActiveCount: secondState.activeCount,
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
