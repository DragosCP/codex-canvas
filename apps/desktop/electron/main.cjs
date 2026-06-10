const { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const APP_SERVER_PORT = 48889;
const BRIDGE_PORT = 48890;
const BACKEND_ENV = "P03_DESKTOP_BACKEND";
const SIDECAR_DIR_ENV = "CODEX_DESKTOP_SIDECAR_DIR";

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const appDir = path.resolve(__dirname, "..");

let backendState = null;
let mainWindow = null;

const remoteDebuggingPort = process.env.CODEX_DESKTOP_REMOTE_DEBUGGING_PORT;
if (remoteDebuggingPort) {
  app.commandLine.appendSwitch("remote-debugging-port", remoteDebuggingPort);
}

app.setName("Codex Local");
nativeTheme.themeSource = "dark";

ipcMain.handle("desktop:invoke", async (_event, command, args = {}) => {
  switch (command) {
    case "desktop_runtime_info":
      return backendState?.runtime ?? fallbackRuntime("Electron desktop");
    case "pick_files":
      return pickFiles();
    case "pick_folder":
      return pickFolder();
    case "open_external_url":
      return openExternalUrl(String(args.url ?? ""));
    case "read_image_data_url":
      return readImageDataUrl(String(args.path ?? ""));
    default:
      throw new Error(`Unknown desktop command: ${command}`);
  }
});

app.whenReady().then(async () => {
  backendState = await startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopBackend();
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#111312",
    autoHideMenuBar: true,
    show: false,
    title: "Codex Local",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
  } else {
    void mainWindow.loadFile(path.join(appDir, "dist", "index.html"));
  }
}

async function startBackend() {
  const backendKind = selectedBackendKind();
  if (backendKind === "wsl") return startWslBackend();
  return startNativeBackend();
}

function selectedBackendKind() {
  const configured = String(process.env[BACKEND_ENV] ?? "").toLowerCase();
  if (["wsl", "real-wsl", "dev-wsl"].includes(configured)) return "wsl";
  return "native";
}

async function startNativeBackend() {
  let startupError = null;
  let child = null;
  let bridgeServer = null;

  if (!(await readyz(BRIDGE_PORT))) {
    try {
      bridgeServer = await startOriginBridge(BRIDGE_PORT, APP_SERVER_PORT);
    } catch (error) {
      startupError = errorMessage(error);
    }
  }

  if (!startupError && !(await readyz(APP_SERVER_PORT))) {
    try {
      child = spawnNativeSidecar();
    } catch (error) {
      startupError = errorMessage(error);
    }
  }

  if (!startupError && !(await waitForReady(APP_SERVER_PORT))) {
    startupError = `Timed out waiting for native app-server on 127.0.0.1:${APP_SERVER_PORT}`;
  }
  if (!startupError && !(await waitForReady(BRIDGE_PORT))) {
    startupError = `Timed out waiting for native browser bridge on 127.0.0.1:${BRIDGE_PORT}`;
  }

  return {
    child,
    bridgeServer,
    runtime: {
      appServerUrl: `ws://127.0.0.1:${BRIDGE_PORT}`,
      backendLabel: "Electron desktop + native Codex app-server",
      backendMode: "real-native",
      projectPathHint: repoRoot,
      startupError,
    },
  };
}

async function startWslBackend() {
  let startupError = null;
  let child = null;
  try {
    child = spawnWslBackend();
  } catch (error) {
    if (!(await readyz(BRIDGE_PORT))) startupError = errorMessage(error);
  }

  if (!startupError && !(await waitForReady(BRIDGE_PORT))) {
    startupError = `Timed out waiting for real WSL app-server bridge on 127.0.0.1:${BRIDGE_PORT}`;
  }

  return {
    child,
    bridgeServer: null,
    runtime: {
      appServerUrl: `ws://127.0.0.1:${BRIDGE_PORT}`,
      backendLabel: "Electron desktop + real WSL app-server",
      backendMode: "real-wsl",
      projectPathHint: wslProjectPathHint(),
      startupError,
    },
  };
}

function spawnNativeSidecar() {
  const sidecarDir = nativeSidecarDir();
  const codexBin = path.join(sidecarDir, process.platform === "win32" ? "codex.exe" : "codex");
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });
  const stdout = fs.openSync(path.join(logDir, "native-app-server.log"), "a");
  const stderr = fs.openSync(path.join(logDir, "native-app-server.log"), "a");
  const listenUrl = `ws://127.0.0.1:${APP_SERVER_PORT}`;
  return spawn(codexBin, ["app-server", "--listen", listenUrl], {
    cwd: sidecarDir,
    detached: false,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
    windowsVerbatimArguments: false,
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG ?? "warn",
    },
  });
}

function spawnWslBackend() {
  const script = path.join(repoRoot, "scripts", "p03-real-app-server.mjs");
  const cacheDir = path.join(repoRoot, ".cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const stdout = fs.openSync(path.join(cacheDir, "p03-electron-backend.log"), "a");
  const stderr = fs.openSync(path.join(cacheDir, "p03-electron-backend.log"), "a");
  return spawn(process.env.CODEX_DESKTOP_NODE ?? "node", [script], {
    cwd: repoRoot,
    detached: false,
    stdio: ["ignore", stdout, stderr],
    windowsHide: true,
    env: {
      ...process.env,
      P03_DESKTOP_PARENT_PID: String(process.pid),
    },
  });
}

function nativeSidecarDir() {
  const candidates = [
    process.env[SIDECAR_DIR_ENV],
    path.join(process.resourcesPath ?? "", "codex-sidecar"),
    path.join(__dirname, "resources", "codex-sidecar"),
    path.join(repoRoot, "codex-rs", "target", "release"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const codexBin = path.join(candidate, process.platform === "win32" ? "codex.exe" : "codex");
    if (fs.existsSync(codexBin)) return candidate;
  }

  throw new Error(
    "No native Codex sidecar was found. Run `pnpm sidecar:stage` from apps/desktop first.",
  );
}

function startOriginBridge(listenPort, targetPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((client) => {
      handleBridgeConnection(client, targetPort);
    });
    server.once("error", reject);
    server.listen(listenPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

function handleBridgeConnection(client, targetPort) {
  const chunks = [];
  let totalSize = 0;

  function onData(chunk) {
    chunks.push(chunk);
    totalSize += chunk.length;
    if (totalSize > 64 * 1024) {
      client.destroy();
      return;
    }

    const request = Buffer.concat(chunks, totalSize);
    const separatorIndex = request.indexOf("\r\n\r\n");
    if (separatorIndex === -1) return;

    client.off("data", onData);
    const headerEnd = separatorIndex + 4;
    const header = request.subarray(0, headerEnd).toString("latin1");
    const rest = request.subarray(headerEnd);
    const requestLine = header.split(/\r?\n/, 1)[0] ?? "";

    if (requestLine.startsWith("GET /readyz ")) {
      void respondReadyz(client, targetPort);
      return;
    }

    const upstream = net.connect(targetPort, "127.0.0.1");
    upstream.once("connect", () => {
      upstream.write(stripOriginHeader(header), "latin1");
      if (rest.length > 0) upstream.write(rest);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.once("error", () => client.destroy());
    client.once("error", () => upstream.destroy());
  }

  client.on("data", onData);
  client.once("error", () => {});
}

async function respondReadyz(client, targetPort) {
  const targetReady = await readyz(targetPort);
  const status = targetReady ? "200 OK" : "503 Service Unavailable";
  const body = targetReady ? "ok" : "not ready";
  client.end(
    `HTTP/1.1 ${status}\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

function stripOriginHeader(header) {
  const lines = header.split(/\r?\n/);
  const kept = lines.filter((line) => !/^origin:/i.test(line));
  return `${kept.filter(Boolean).join("\r\n")}\r\n\r\n`;
}

async function readyz(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/readyz`, {
      signal: controller.signal,
    });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReady(port) {
  for (let index = 0; index < 80; index += 1) {
    if (await readyz(port)) return true;
    await sleep(250);
  }
  return false;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function pickFiles() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
  });
  return result.canceled ? [] : result.filePaths;
}

async function pickFolder() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function openExternalUrl(url) {
  if (!isAllowedExternalUrl(url)) {
    throw new Error("Only http or https URLs can be opened from Codex.");
  }
  await shell.openExternal(url);
}

function readImageDataUrl(filePath) {
  const nativePath = nativeFilePath(filePath);
  const mime = imageMime(nativePath);
  if (!mime) throw new Error("Unsupported image type.");
  const bytes = fs.readFileSync(nativePath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function nativeFilePath(filePath) {
  const match = String(filePath).replace(/\\/g, "/").match(/^\/mnt\/([A-Za-z])\/(.+)$/);
  if (match) {
    return `${match[1].toUpperCase()}:\\${match[2].replace(/\//g, "\\")}`;
  }
  return String(filePath);
}

function imageMime(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

function isAllowedExternalUrl(url) {
  const lower = String(url).toLowerCase();
  return (
    lower.startsWith("https://") ||
    lower.startsWith("http://localhost:") ||
    lower.startsWith("http://127.0.0.1:")
  );
}

function wslProjectPathHint() {
  const normalized = repoRoot.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) {
    const drive = normalized[0].toLowerCase();
    return `/mnt/${drive}/${normalized.slice(3)}`;
  }
  return normalized;
}

function fallbackRuntime(label) {
  return {
    appServerUrl: `ws://127.0.0.1:${BRIDGE_PORT}`,
    backendLabel: label,
    backendMode: "real-native",
    projectPathHint: repoRoot,
    startupError: "Electron backend has not finished starting.",
  };
}

function stopBackend() {
  if (!backendState) return;
  backendState.bridgeServer?.close();
  if (backendState.child && !backendState.child.killed) {
    backendState.child.kill();
  }
  backendState = null;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
