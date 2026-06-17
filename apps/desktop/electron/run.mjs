#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronMain = join(appDir, "electron", "main.cjs");
const dev = process.argv.includes("--dev");
const rendererUrl = process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:4317";
const electronBin = await resolveElectronBinary();
const remoteDebuggingPort =
  process.env.CODEX_DESKTOP_REMOTE_DEBUGGING_PORT ??
  (await findAvailablePort(9230, 9250));

let viteProcess = null;
if (dev) {
  viteProcess = spawn(
    process.execPath,
    [
      resolveViteCli(),
      "--host",
      "127.0.0.1",
      "--port",
      "4317",
      "--strictPort",
    ],
    {
      cwd: appDir,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  await waitForUrl(rendererUrl);
}

const env = {
  ...process.env,
};
if (remoteDebuggingPort) {
  env.CODEX_DESKTOP_REMOTE_DEBUGGING_PORT = String(remoteDebuggingPort);
}
if (dev) {
  env.ELECTRON_RENDERER_URL = rendererUrl;
} else {
  delete env.ELECTRON_RENDERER_URL;
}

const electronProcess = spawn(electronBin, [electronMain], {
  cwd: appDir,
  env,
  stdio: "inherit",
  windowsHide: false,
});

electronProcess.on("exit", (code) => {
  viteProcess?.kill();
  process.exit(code ?? 0);
});

process.on("SIGINT", () => {
  electronProcess.kill();
  viteProcess?.kill();
});

async function waitForUrl(url) {
  for (let index = 0; index < 120; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep waiting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function resolveViteCli() {
  return join(dirname(require.resolve("vite/package.json")), "bin", "vite.js");
}

function resolveElectronBinary() {
  try {
    return require("electron");
  } catch (error) {
    console.warn("Electron binary is missing; running Electron installer once.");
    const installScript = require.resolve("electron/install.js");
    const installer = spawn(process.execPath, [installScript], {
      cwd: appDir,
      stdio: "inherit",
      windowsHide: true,
    });
    return new Promise((resolve, reject) => {
      installer.on("exit", (code) => {
        if (code === 0) {
          try {
            resolve(require("electron"));
          } catch (innerError) {
            reject(innerError);
          }
        } else {
          reject(new Error(`Electron installer exited with status ${code}`));
        }
      });
    });
  }
}

async function findAvailablePort(start, end) {
  for (let port = start; port <= end; port += 1) {
    if (await isPortAvailable(port)) return String(port);
  }
  return "";
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}
