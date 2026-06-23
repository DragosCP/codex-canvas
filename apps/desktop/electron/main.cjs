const { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } = require("electron");
const { spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const {
  addProposalWorkspaceOption,
  applyProposalWorkspace,
  cleanupProposalRegistry,
  diffProposalWorkspace,
  prepareProposalWorkspaces,
} = require("./proposal-workspaces.cjs");
const {
  diffDraftWorkspace,
  prepareDraftWorkspace,
  updateDraftBrief,
  updateDraftLifecycle,
} = require("./draft-workspaces.cjs");

const APP_SERVER_PORT = 48889;
const BRIDGE_PORT = 48890;
const BACKEND_ENV = "P03_DESKTOP_BACKEND";
const SIDECAR_DIR_ENV = "CODEX_DESKTOP_SIDECAR_DIR";
const PREVIEW_PROBE_MAX_BYTES = 64 * 1024;
const PREVIEW_START_PORTS = [
  5173, 3000, 4173, 8080, 5174, 3001, 4174, 8081, 4321, 5000,
];
const WORKSPACE_PROGRESS_MAX_FILE_BYTES = 1024 * 1024;
const WORKSPACE_PROGRESS_MAX_TRACKED_FILES = 2400;
const WORKSPACE_PROGRESS_MAX_RESULTS = 18;
const WORKSPACE_PROGRESS_SESSION_TTL_MS = 35 * 60 * 1000;
const WORKSPACE_PROGRESS_IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".nuxt",
  ".parcel-cache",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
  "vendor",
]);
const WORKSPACE_PROGRESS_IGNORED_FILES = new Set([
  "bun.lockb",
  "Cargo.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);
const WORKSPACE_PROGRESS_BINARY_EXTENSIONS = new Set([
  ".7z",
  ".avif",
  ".bmp",
  ".class",
  ".dll",
  ".dmg",
  ".doc",
  ".docx",
  ".exe",
  ".gif",
  ".ico",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".psd",
  ".pyc",
  ".rar",
  ".so",
  ".sqlite",
  ".ttf",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".zip",
]);

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const appDir = path.resolve(__dirname, "..");

let backendState = null;
let mainWindow = null;
const bridgeToken = crypto.randomBytes(32).toString("base64url");
const managedPreviewProcesses = new Map();
const workspaceProgressSessions = new Map();

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
    case "app_preview_probe_url":
      return probeAppPreviewUrl(String(args.url ?? ""), {
        projectPath: String(args.projectPath ?? ""),
        excludeUrls: Array.isArray(args.excludeUrls) ? args.excludeUrls.map(String) : [],
      });
    case "app_preview_discover":
      return discoverAppPreviewUrl(
        Array.isArray(args.urls) ? args.urls.map(String) : [],
        {
          projectPath: String(args.projectPath ?? ""),
          excludeUrls: Array.isArray(args.excludeUrls) ? args.excludeUrls.map(String) : [],
        },
      );
    case "app_preview_start":
      return startManagedAppPreview(String(args.projectPath ?? ""));
    case "app_preview_stop":
      return stopManagedAppPreview(String(args.projectPath ?? ""));
    case "app_preview_status":
      return managedAppPreviewStatus(String(args.projectPath ?? ""));
    case "project_empty_status":
      return projectEmptyStatus(String(args.projectPath ?? ""));
    case "mockups_list":
      return listProjectMockups(
        String(args.projectPath ?? ""),
        String(args.proposalSetId ?? ""),
      );
    case "proposal_workspaces_prepare":
      return prepareProposalWorkspaces({
        cacheRoot: proposalWorkspacesRoot(),
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        proposalSetId: String(args.proposalSetId ?? ""),
        optionIds: Array.isArray(args.optionIds)
          ? args.optionIds.map(String)
          : [],
      });
    case "proposal_workspace_add_option":
      return addProposalWorkspaceOption({
        cacheRoot: proposalWorkspacesRoot(),
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        proposalSetId: String(args.proposalSetId ?? ""),
        optionId: String(args.optionId ?? ""),
        sourceWorkspacePath: args.sourceWorkspacePath
          ? nativeFilePath(String(args.sourceWorkspacePath))
          : "",
      });
    case "proposal_workspace_diff":
      return diffProposalWorkspace(nativeFilePath(String(args.workspacePath ?? "")));
    case "proposal_workspace_apply":
      return applyProposalWorkspace({
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        workspacePath: nativeFilePath(String(args.workspacePath ?? "")),
      });
    case "proposal_workspace_cleanup":
      return cleanupProposalRegistry(proposalWorkspacesRoot(), {
        keepSetIds: Array.isArray(args.keepSetIds)
          ? args.keepSetIds.map(String)
          : [],
      });
    case "draft_workspace_prepare":
      return prepareDraftWorkspace({
        cacheRoot: draftWorkspacesRoot(),
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        draftId: String(args.draftId ?? ""),
        name: String(args.name ?? ""),
        slug: String(args.slug ?? ""),
        threadId: String(args.threadId ?? ""),
        goal: String(args.goal ?? ""),
        currentSummary: String(args.currentSummary ?? ""),
        affectedRoutes: Array.isArray(args.affectedRoutes)
          ? args.affectedRoutes.map(String)
          : [],
        mockAssumptions: Array.isArray(args.mockAssumptions)
          ? args.mockAssumptions.map(String)
          : [],
        approvedDecisions: Array.isArray(args.approvedDecisions)
          ? args.approvedDecisions.map(String)
          : [],
        rejectedIdeas: Array.isArray(args.rejectedIdeas)
          ? args.rejectedIdeas.map(String)
          : [],
        openQuestions: Array.isArray(args.openQuestions)
          ? args.openQuestions.map(String)
          : [],
        buildPlan: Array.isArray(args.buildPlan)
          ? args.buildPlan.map(String)
          : [],
        risks: Array.isArray(args.risks) ? args.risks.map(String) : [],
      });
    case "draft_workspace_diff":
      return diffDraftWorkspace({
        cacheRoot: draftWorkspacesRoot(),
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        draftId: String(args.draftId ?? ""),
      });
    case "draft_workspace_update_lifecycle":
      return updateDraftLifecycle({
        cacheRoot: draftWorkspacesRoot(),
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        draftId: String(args.draftId ?? ""),
        status: String(args.status ?? ""),
        goal: String(args.goal ?? ""),
        currentSummary: String(args.currentSummary ?? ""),
        affectedRoutes: Array.isArray(args.affectedRoutes)
          ? args.affectedRoutes.map(String)
          : undefined,
        mockAssumptions: Array.isArray(args.mockAssumptions)
          ? args.mockAssumptions.map(String)
          : undefined,
        approvedDecisions: Array.isArray(args.approvedDecisions)
          ? args.approvedDecisions.map(String)
          : [],
        rejectedIdeas: Array.isArray(args.rejectedIdeas)
          ? args.rejectedIdeas.map(String)
          : [],
        openQuestions: Array.isArray(args.openQuestions)
          ? args.openQuestions.map(String)
          : [],
        buildPlan: Array.isArray(args.buildPlan)
          ? args.buildPlan.map(String)
          : [],
        risks: Array.isArray(args.risks) ? args.risks.map(String) : [],
        updateBrief: args.updateBrief,
      });
    case "draft_workspace_update_brief":
      return updateDraftBrief({
        cacheRoot: draftWorkspacesRoot(),
        projectPath: nativeFilePath(String(args.projectPath ?? "")),
        draftId: String(args.draftId ?? ""),
        goal: String(args.goal ?? ""),
        currentSummary: String(args.currentSummary ?? ""),
        affectedRoutes: Array.isArray(args.affectedRoutes)
          ? args.affectedRoutes.map(String)
          : undefined,
        mockAssumptions: Array.isArray(args.mockAssumptions)
          ? args.mockAssumptions.map(String)
          : undefined,
        approvedDecisions: Array.isArray(args.approvedDecisions)
          ? args.approvedDecisions.map(String)
          : [],
        rejectedIdeas: Array.isArray(args.rejectedIdeas)
          ? args.rejectedIdeas.map(String)
          : [],
        openQuestions: Array.isArray(args.openQuestions)
          ? args.openQuestions.map(String)
          : [],
        buildPlan: Array.isArray(args.buildPlan)
          ? args.buildPlan.map(String)
          : [],
        risks: Array.isArray(args.risks) ? args.risks.map(String) : [],
      });
    case "workspace_progress_snapshot":
      return workspaceProgressSnapshot(args);
    case "workspace_progress_stop":
      return stopWorkspaceProgressSession(args);
    case "read_image_data_url":
      return readImageDataUrl(String(args.path ?? ""));
    default:
      throw new Error(`Unknown desktop command: ${command}`);
  }
});

app.whenReady().then(async () => {
  await session.defaultSession.clearCache().catch(() => {});
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
  stopAllManagedPreviews();
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
      webviewTag: true,
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

  try {
    bridgeServer = await startOriginBridge(BRIDGE_PORT, APP_SERVER_PORT);
  } catch (error) {
    startupError =
      error && error.code === "EADDRINUSE"
        ? `Codex bridge port 127.0.0.1:${BRIDGE_PORT} is already in use. Close the other Codex Local window or stale process before starting this one.`
        : errorMessage(error);
  }

  if (!startupError && (await readyz(APP_SERVER_PORT))) {
    startupError = `Codex app-server port 127.0.0.1:${APP_SERVER_PORT} is already in use by another process. Close the stale app-server before starting this desktop app.`;
  }

  if (!startupError) {
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
      appServerUrl: bridgeUrl(),
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

function bridgeUrl() {
  return `ws://127.0.0.1:${BRIDGE_PORT}/?desktop_token=${encodeURIComponent(
    bridgeToken,
  )}`;
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

    if (!requestHasValidBridgeToken(requestLine)) {
      respondForbidden(client);
      return;
    }

    const upstream = net.connect(targetPort, "127.0.0.1");
    upstream.once("connect", () => {
      upstream.write(sanitizeBridgeHeader(header), "latin1");
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

function respondForbidden(client) {
  const body = "forbidden";
  client.end(
    `HTTP/1.1 403 Forbidden\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
  );
}

function requestHasValidBridgeToken(requestLine) {
  const pathPart = requestLine.split(/\s+/)[1] ?? "/";
  let provided = "";
  try {
    const parsed = new URL(pathPart, `http://127.0.0.1:${BRIDGE_PORT}`);
    provided = parsed.searchParams.get("desktop_token") ?? "";
  } catch {
    return false;
  }
  const expected = Buffer.from(bridgeToken);
  const actual = Buffer.from(provided);
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

function sanitizeBridgeHeader(header) {
  const lines = header.split(/\r?\n/);
  const kept = lines.filter((line) => !/^origin:/i.test(line));
  const requestLine = kept[0] ?? "";
  const parts = requestLine.split(/\s+/);
  if (parts.length >= 3) {
    try {
      const parsed = new URL(parts[1], `http://127.0.0.1:${BRIDGE_PORT}`);
      parsed.searchParams.delete("desktop_token");
      parts[1] = `${parsed.pathname}${parsed.search}` || "/";
      kept[0] = parts.join(" ");
    } catch {
      // Leave malformed request lines untouched; app-server will reject them.
    }
  }
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

async function discoverAppPreviewUrl(urls, options = {}) {
  const candidates = urls.length > 0 ? urls : defaultPreviewUrls();
  const projectDir = nativeFilePath(options.projectPath ?? "");
  const excludedUrls = Array.isArray(options.excludeUrls)
    ? options.excludeUrls.map(normalizePreviewUrl).filter(Boolean)
    : [];
  const results = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      result: await probeAppPreviewUrl(candidate),
    })),
  );
  const attempted = results.map(({ candidate, result }) => ({
    url: candidate,
    status: result.status,
    reason: result.reason,
  }));
  const available = results
    .map(({ result }) => result)
    .filter((result) => result.status === "available");
  const filtered = [];
  const projectAvailable = available.filter((result) => {
    const owner = managedPreviewOwnerForUrl(result.finalUrl || result.url);
    if (
      owner &&
      projectDir &&
      previewProcessKey(owner.projectDir) !== previewProcessKey(projectDir)
    ) {
      filtered.push(result);
      return false;
    }
    if (excludedUrls.some((url) => previewResultMatchesUrl(result, url))) {
      filtered.push(result);
      return false;
    }
    return true;
  });
  if (projectAvailable.length > 1) {
    return {
      status: "multiple",
      url: "",
      finalUrl: "",
      title: "",
      reason: "",
      choices: projectAvailable,
      attempted,
    };
  }
  if (projectAvailable.length === 1) return { ...projectAvailable[0], attempted };
  return {
    status: "unavailable",
    url: "",
    finalUrl: "",
    title: "",
    reason:
      filtered.length > 0
        ? "Only previews from another project were found. Run this project or use URL."
        : "No running local web preview was detected.",
    attempted,
  };
}

async function startManagedAppPreview(projectPath) {
  const projectDir = nativeFilePath(projectPath);
  if (!projectDir || !fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return unavailableManagedPreview("Project folder was not found.");
  }

  const key = previewProcessKey(projectDir);
  const existing = managedPreviewProcesses.get(key);
  if (existing) {
    const status = await managedPreviewStatusForRecord(existing);
    if (status.status === "running") return status;
    await stopManagedPreviewRecord(existing);
  }

  const descriptor = previewStartDescriptor(projectDir);
  if (!descriptor) {
    return {
      ...unavailableManagedPreview("No runnable app was found. Build a baseline app first."),
      needsBaseline: true,
    };
  }

  const port = await findAvailablePreviewPort();
  if (!port) {
    return unavailableManagedPreview("No available local preview port was found.");
  }

  const url = `http://127.0.0.1:${port}/`;
  let record;
  if (descriptor.kind === "static") {
    const server = await startStaticPreviewServer(projectDir, port);
    record = {
      kind: "static",
      projectDir,
      url,
      title: path.basename(projectDir),
      commandLabel: "static file preview",
      server,
      exited: false,
      logs: "",
    };
    managedPreviewProcesses.set(key, record);
    const result = await probeAppPreviewUrl(url);
    return {
      status: result.status === "available" ? "running" : "unavailable",
      url,
      finalUrl: result.finalUrl || url,
      title: result.title || record.title,
      reason: result.reason,
      command: record.commandLabel,
      managed: true,
    };
  }

  const commandSpec = descriptor.commandForPort(port);
  record = {
    kind: "process",
    projectDir,
    url,
    title: path.basename(projectDir),
    commandLabel: commandSpec.label,
    child: spawn(commandSpec.command, commandSpec.args, {
      cwd: projectDir,
      detached: false,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        ...commandSpec.env,
        BROWSER: "none",
        NO_COLOR: "1",
      },
    }),
    exited: false,
    logs: "",
  };
  managedPreviewProcesses.set(key, record);
  attachPreviewProcessLogging(key, record);

  const result = await waitForManagedPreview(record, 18000);
  if (result.status === "running") return result;
  await stopManagedPreviewRecord(record);
  return result;
}

async function stopManagedAppPreview(projectPath) {
  const projectDir = nativeFilePath(projectPath);
  const key = previewProcessKey(projectDir);
  const record = managedPreviewProcesses.get(key);
  if (!record) {
    return {
      status: "stopped",
      url: "",
      finalUrl: "",
      title: "",
      reason: "No managed preview is running.",
      managed: false,
    };
  }
  await stopManagedPreviewRecord(record);
  return {
    status: "stopped",
    url: "",
    finalUrl: "",
    title: "",
    reason: "Preview stopped.",
    managed: true,
  };
}

async function managedAppPreviewStatus(projectPath) {
  const projectDir = nativeFilePath(projectPath);
  const record = managedPreviewProcesses.get(previewProcessKey(projectDir));
  if (!record) {
    return {
      status: "stopped",
      url: "",
      finalUrl: "",
      title: "",
      reason: "",
      managed: false,
    };
  }
  return managedPreviewStatusForRecord(record);
}

async function managedPreviewStatusForRecord(record) {
  if (record.exited) {
    return {
      status: "stopped",
      url: record.url,
      finalUrl: record.url,
      title: record.title,
      reason: previewFailureReason(record),
      command: record.commandLabel,
      managed: true,
    };
  }
  const result = await probeAppPreviewUrl(record.url);
  return {
    status: result.status === "available" ? "running" : "starting",
    url: record.url,
    finalUrl: result.finalUrl || record.url,
    title: result.title || record.title,
    reason: result.reason,
    command: record.commandLabel,
    managed: true,
  };
}

async function waitForManagedPreview(record, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (record.exited) {
      return unavailableManagedPreview(previewFailureReason(record), record);
    }
    const result = await probeAppPreviewUrl(record.url);
    if (result.status === "available") {
      return {
        status: "running",
        url: record.url,
        finalUrl: result.finalUrl || record.url,
        title: result.title || record.title,
        reason: "",
        command: record.commandLabel,
        managed: true,
      };
    }
    await sleep(500);
  }
  return unavailableManagedPreview(
    `Preview did not start quickly enough from ${record.commandLabel}.`,
    record,
  );
}

function unavailableManagedPreview(reason, record = null) {
  return {
    status: "unavailable",
    url: record?.url ?? "",
    finalUrl: record?.url ?? "",
    title: record?.title ?? "",
    reason,
    command: record?.commandLabel ?? "",
    managed: Boolean(record),
  };
}

function previewStartDescriptor(projectDir) {
  const packagePath = path.join(projectDir, "package.json");
  if (fs.existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      const scripts = pkg && typeof pkg.scripts === "object" ? pkg.scripts : {};
      const scriptName = ["dev", "start", "preview"].find(
        (name) => typeof scripts[name] === "string" && scripts[name].trim(),
      );
      if (scriptName) {
        const script = scripts[scriptName];
        return {
          kind: "process",
          commandForPort: (port) =>
            packagePreviewCommand(projectDir, scriptName, script, port),
        };
      }
    } catch {
      return null;
    }
  }
  if (fs.existsSync(path.join(projectDir, "index.html"))) {
    return { kind: "static" };
  }
  return null;
}

function packagePreviewCommand(projectDir, scriptName, script, port) {
  const runner = packageRunner(projectDir);
  const args = [...runner.args, "run", scriptName];
  const extraArgs = previewScriptArgs(script, scriptName, port);
  if (extraArgs.length > 0) args.push("--", ...extraArgs);
  return {
    command: runner.command,
    args,
    env: {
      HOST: "127.0.0.1",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
    },
    label: `${runner.label} run ${scriptName}`,
  };
}

function packageRunner(projectDir) {
  if (fs.existsSync(path.join(projectDir, "pnpm-lock.yaml"))) {
    return {
      command: commandName("corepack"),
      args: ["pnpm"],
      label: "pnpm",
    };
  }
  if (fs.existsSync(path.join(projectDir, "yarn.lock"))) {
    return {
      command: commandName("corepack"),
      args: ["yarn"],
      label: "yarn",
    };
  }
  return {
    command: commandName("npm"),
    args: [],
    label: "npm",
  };
}

function previewScriptArgs(script, scriptName, port) {
  const lower = `${scriptName} ${script}`.toLowerCase();
  if (/\b(next)\b/.test(lower)) {
    return ["--hostname", "127.0.0.1", "--port", String(port)];
  }
  if (/\b(vite|astro|svelte-kit|sveltekit|nuxt|parcel)\b/.test(lower)) {
    return ["--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  }
  return [];
}

function commandName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

async function findAvailablePreviewPort() {
  for (const port of PREVIEW_START_PORTS) {
    if (isCodexRuntimePort(String(port))) continue;
    if (await isPortAvailable(port)) return port;
  }
  for (let port = 4100; port < 4300; port += 1) {
    if (isCodexRuntimePort(String(port))) continue;
    if (await isPortAvailable(port)) return port;
  }
  return null;
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function startStaticPreviewServer(projectDir, port) {
  const server = http.createServer((request, response) => {
    serveStaticPreviewFile(projectDir, request, response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

function serveStaticPreviewFile(projectDir, request, response) {
  const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const requestedPath = path.normalize(path.join(projectDir, pathname));
  const relative = path.relative(projectDir, requestedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  const filePath = fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()
    ? requestedPath
    : path.join(projectDir, "index.html");
  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": staticMime(filePath) });
  fs.createReadStream(filePath).pipe(response);
}

function staticMime(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function attachPreviewProcessLogging(key, record) {
  const append = (chunk) => {
    record.logs = `${record.logs}${chunk.toString("utf8")}`.slice(-3000);
  };
  record.child.stdout?.on("data", append);
  record.child.stderr?.on("data", append);
  record.child.once("exit", (code, signal) => {
    record.exited = true;
    record.exitCode = code;
    record.exitSignal = signal;
    if (managedPreviewProcesses.get(key) === record) {
      managedPreviewProcesses.delete(key);
    }
  });
}

function previewFailureReason(record) {
  const exit = record.exitCode != null
    ? "Preview command exited before it became available."
    : record.exitSignal
      ? "Preview command stopped before it became available."
      : "Preview command stopped before it became available.";
  return exit;
}

async function stopManagedPreviewRecord(record) {
  managedPreviewProcesses.delete(previewProcessKey(record.projectDir));
  if (record.kind === "static") {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000);
      record.server.close(() => {
        clearTimeout(timer);
        resolve();
      });
      record.server.closeAllConnections?.();
    });
    record.exited = true;
    return;
  }
  if (!record.child || record.child.killed || record.exited) return;
  if (process.platform === "win32" && record.child.pid) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(record.child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    record.child.kill();
  }
  record.exited = true;
}

function stopAllManagedPreviews() {
  for (const record of managedPreviewProcesses.values()) {
    void stopManagedPreviewRecord(record);
  }
}

function previewProcessKey(projectDir) {
  return nativeFilePath(projectDir).replace(/[\\/]+$/, "").toLowerCase();
}

function managedPreviewOwnerForUrl(url) {
  for (const record of managedPreviewProcesses.values()) {
    if (samePreviewLocation(record.url, url)) return record;
  }
  return null;
}

function previewResultMatchesUrl(result, url) {
  return (
    samePreviewLocation(result.url, url) ||
    Boolean(result.finalUrl) && samePreviewLocation(result.finalUrl, url)
  );
}

function samePreviewLocation(left, right) {
  try {
    const leftUrl = new URL(normalizePreviewUrl(left));
    const rightUrl = new URL(normalizePreviewUrl(right));
    return (
      localPreviewHostKey(leftUrl.hostname) === localPreviewHostKey(rightUrl.hostname) &&
      previewPort(leftUrl) === previewPort(rightUrl) &&
      normalizePreviewPath(leftUrl.pathname) === normalizePreviewPath(rightUrl.pathname) &&
      leftUrl.search === rightUrl.search
    );
  } catch {
    return String(left).replace(/\/+$/, "") === String(right).replace(/\/+$/, "");
  }
}

function localPreviewHostKey(hostname) {
  const host = String(hostname).toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
    ? "localhost"
    : host;
}

function previewPort(url) {
  if (url.port) return url.port;
  if (url.protocol === "https:") return "443";
  return "80";
}

function normalizePreviewPath(pathname) {
  return String(pathname).replace(/\/+$/, "") || "/";
}

async function probeAppPreviewUrl(value, options = {}) {
  const normalized = normalizePreviewUrl(value);
  if (!normalized) {
    return unavailablePreview("", "Choose or enter a local preview URL.");
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return unavailablePreview(normalized, "That preview URL is not valid.");
  }

  if (!isAllowedPreviewUrl(parsed)) {
    return unavailablePreview(
      normalized,
      "App Preview only opens local http preview URLs.",
    );
  }

  if (isCodexRuntimePort(parsed.port)) {
    return unavailablePreview(
      normalized,
      "That port belongs to Codex itself, not the project app preview.",
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1600);
  try {
    const response = await fetch(normalized, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    const finalUrl = response.url || normalized;
    let finalParsed;
    try {
      finalParsed = new URL(finalUrl);
    } catch {
      return unavailablePreview(normalized, "Preview redirected to an invalid URL.", finalUrl);
    }
    if (!isAllowedPreviewUrl(finalParsed) || isCodexRuntimePort(finalParsed.port)) {
      return unavailablePreview(
        normalized,
        "Preview redirected away from the project app.",
        finalUrl,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    const text = await readPreviewSample(response, PREVIEW_PROBE_MAX_BYTES);
    if (!response.ok) {
      return unavailablePreview(
        normalized,
        `Preview returned HTTP ${response.status}.`,
        finalUrl,
      );
    }
    if (!looksLikeHtml(contentType, text)) {
      return unavailablePreview(
        normalized,
        "That URL did not return a web page.",
        finalUrl,
      );
    }
    const title = htmlTitle(text) || finalParsed.host;
    const projectDir = nativeFilePath(options.projectPath ?? "");
    const owner = managedPreviewOwnerForUrl(finalUrl || normalized);
    if (
      owner &&
      projectDir &&
      previewProcessKey(owner.projectDir) !== previewProcessKey(projectDir)
    ) {
      return unavailablePreview(
        normalized,
        "That preview is already running for another project.",
        finalUrl,
      );
    }
    const excludedUrls = Array.isArray(options.excludeUrls)
      ? options.excludeUrls.map(normalizePreviewUrl).filter(Boolean)
      : [];
    if (
      excludedUrls.some((url) =>
        previewResultMatchesUrl({ url: normalized, finalUrl }, url),
      )
    ) {
      return unavailablePreview(
        normalized,
        "That preview URL is already remembered for another project.",
        finalUrl,
      );
    }
    return {
      status: "available",
      url: normalized,
      finalUrl,
      title,
      reason: "",
    };
  } catch (error) {
    const reason =
      error && error.name === "AbortError"
        ? "Preview did not respond quickly enough."
        : `Could not reach preview: ${errorMessage(error)}`;
    return unavailablePreview(normalized, reason);
  } finally {
    clearTimeout(timeout);
  }
}

async function readPreviewSample(response, maxBytes) {
  if (!response.body || typeof response.body.getReader !== "function") {
    return (await response.text()).slice(0, maxBytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      chunks.push(Buffer.from(slice));
      total += slice.byteLength;
      if (value.byteLength > remaining) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total).toString("utf8");
}

function unavailablePreview(url, reason, finalUrl = "") {
  return {
    status: "unavailable",
    url,
    finalUrl,
    title: "",
    reason,
  };
}

function normalizePreviewUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function isAllowedPreviewUrl(url) {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function isCodexRuntimePort(port) {
  return port === String(APP_SERVER_PORT) || port === String(BRIDGE_PORT) || port === "4317";
}

function looksLikeHtml(contentType, text) {
  return (
    contentType.toLowerCase().includes("text/html") ||
    /^\s*<!doctype html/i.test(text) ||
    /^\s*<html[\s>]/i.test(text)
  );
}

function htmlTitle(text) {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(text);
  return match ? decodeHtmlText(match[1]).trim().slice(0, 80) : "";
}

function decodeHtmlText(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function defaultPreviewUrls() {
  return [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:8080",
    "http://localhost:8080",
  ];
}

function projectEmptyStatus(projectPath) {
  const projectDir = nativeFilePath(projectPath);
  if (!projectDir || !fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return {
      empty: false,
      reason: "Project folder was not found.",
      meaningfulEntries: [],
      ignoredEntries: [],
    };
  }
  const ignoredNames = new Set([
    ".codex",
    ".git",
    ".gitattributes",
    ".gitignore",
    ".DS_Store",
    "desktop.ini",
    "Thumbs.db",
    "README",
    "README.md",
    "readme.md",
    "LICENSE",
    "LICENSE.md",
  ]);
  const ignoredEntries = [];
  const meaningfulEntries = [];
  for (const entry of fs.readdirSync(projectDir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) {
      ignoredEntries.push(entry.name);
      continue;
    }
    meaningfulEntries.push(entry.name);
  }
  return {
    empty: meaningfulEntries.length === 0,
    reason:
      meaningfulEntries.length === 0
        ? "No app files were found."
        : "Project contains files.",
    meaningfulEntries,
    ignoredEntries,
  };
}

function workspaceProgressSnapshot(args = {}) {
  const projectDir = nativeFilePath(String(args.projectPath ?? ""));
  const turnId = String(args.turnId ?? "");
  if (!projectDir || !fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return unavailableWorkspaceProgress("Project folder was not found.");
  }
  if (!turnId) return unavailableWorkspaceProgress("No active turn is available.");

  cleanupWorkspaceProgressSessions();
  const startedAtMs = Number(args.startedAtMs);
  const safeStartedAtMs = Number.isFinite(startedAtMs) && startedAtMs > 0
    ? startedAtMs
    : Date.now();
  const key = workspaceProgressKey(projectDir, turnId);
  let session = workspaceProgressSessions.get(key);
  if (!session) {
    session = {
      projectDir,
      turnId,
      startedAtMs: safeStartedAtMs,
      baseline: collectWorkspaceProgressFiles(projectDir, 0),
      createdAtMs: Date.now(),
      lastSeenAtMs: Date.now(),
    };
    workspaceProgressSessions.set(key, session);
  }
  session.lastSeenAtMs = Date.now();

  const scanSinceMs = Math.max(0, session.startedAtMs - 1000);
  const current = collectWorkspaceProgressFiles(projectDir, scanSinceMs);
  const files = [];
  for (const [relativePath, currentFile] of current.files.entries()) {
    const baselineFile = session.baseline.files.get(relativePath);
    const createdDuringTurn =
      !baselineFile && currentFile.createdAtMs >= scanSinceMs;
    const changedDuringTurn =
      createdDuringTurn ||
      currentFile.modifiedAtMs >= scanSinceMs &&
        (!baselineFile ||
          currentFile.sizeBytes !== baselineFile.sizeBytes ||
          currentFile.lineCount !== baselineFile.lineCount);
    if (!changedDuringTurn) continue;

    const lineDelta = baselineFile
      ? currentFile.lineCount - baselineFile.lineCount
      : currentFile.lineCount;
    files.push({
      path: relativePath,
      status: createdDuringTurn ? "created" : "modified",
      lineCount: currentFile.lineCount,
      lineDelta,
      sizeBytes: currentFile.sizeBytes,
      updatedAtMs: currentFile.modifiedAtMs,
    });
  }
  files.sort(
    (left, right) =>
      right.updatedAtMs - left.updatedAtMs ||
      Math.abs(right.lineDelta) - Math.abs(left.lineDelta) ||
      left.path.localeCompare(right.path),
  );
  const visibleFiles = files.slice(0, WORKSPACE_PROGRESS_MAX_RESULTS);
  const additions = files.reduce(
    (total, file) => total + Math.max(0, file.lineDelta),
    0,
  );
  const deletions = files.reduce(
    (total, file) => total + Math.max(0, -file.lineDelta),
    0,
  );
  const now = Date.now();
  return {
    status: "available",
    projectPath: projectDir,
    turnId,
    startedAtMs: session.startedAtMs,
    scannedAtMs: now,
    elapsedMs: Math.max(0, now - session.startedAtMs),
    fileCount: files.length,
    additions,
    deletions,
    files: visibleFiles,
    limited:
      session.baseline.limited ||
      current.limited ||
      files.length > visibleFiles.length,
  };
}

function stopWorkspaceProgressSession(args = {}) {
  const projectDir = nativeFilePath(String(args.projectPath ?? ""));
  const turnId = String(args.turnId ?? "");
  if (projectDir && turnId) {
    workspaceProgressSessions.delete(workspaceProgressKey(projectDir, turnId));
  }
  return { ok: true };
}

function unavailableWorkspaceProgress(reason) {
  return {
    status: "unavailable",
    reason,
    projectPath: "",
    turnId: "",
    startedAtMs: 0,
    scannedAtMs: Date.now(),
    elapsedMs: 0,
    fileCount: 0,
    additions: 0,
    deletions: 0,
    files: [],
    limited: false,
  };
}

function collectWorkspaceProgressFiles(projectDir, sinceMs) {
  const files = new Map();
  let visitedFiles = 0;
  let limited = false;
  const root = path.resolve(projectDir);

  function walk(dir) {
    if (limited) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (limited) return;
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (shouldIgnoreWorkspaceProgressDir(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      visitedFiles += 1;
      if (visitedFiles > WORKSPACE_PROGRESS_MAX_TRACKED_FILES) {
        limited = true;
        return;
      }
      if (shouldIgnoreWorkspaceProgressFile(entry.name)) continue;
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size > WORKSPACE_PROGRESS_MAX_FILE_BYTES) continue;
      if (
        sinceMs > 0 &&
        stat.mtimeMs < sinceMs &&
        stat.birthtimeMs < sinceMs
      ) {
        continue;
      }
      const file = readWorkspaceProgressTextFile(fullPath, stat);
      if (!file) continue;
      const relativePath = path.relative(root, fullPath).replace(/\\/g, "/");
      if (!relativePath || relativePath.startsWith("..")) continue;
      files.set(relativePath, file);
    }
  }

  walk(root);
  return { files, limited };
}

function readWorkspaceProgressTextFile(filePath, stat) {
  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch {
    return null;
  }
  if (looksLikeBinaryBuffer(buffer)) return null;
  return {
    lineCount: countTextLines(buffer),
    sizeBytes: stat.size,
    createdAtMs: stat.birthtimeMs,
    modifiedAtMs: stat.mtimeMs,
  };
}

function shouldIgnoreWorkspaceProgressDir(name) {
  return WORKSPACE_PROGRESS_IGNORED_DIRS.has(name);
}

function shouldIgnoreWorkspaceProgressFile(name) {
  if (WORKSPACE_PROGRESS_IGNORED_FILES.has(name)) return true;
  const lower = name.toLowerCase();
  if (lower.endsWith(".lock") || lower.endsWith(".min.js") || lower.endsWith(".map")) {
    return true;
  }
  return WORKSPACE_PROGRESS_BINARY_EXTENSIONS.has(path.extname(lower));
}

function looksLikeBinaryBuffer(buffer) {
  if (buffer.length === 0) return false;
  const sampleLength = Math.min(buffer.length, 4096);
  let suspicious = 0;
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = buffer[index];
    if (byte === 0) return true;
    if (byte < 7 || byte > 14 && byte < 32) suspicious += 1;
  }
  return suspicious / sampleLength > 0.08;
}

function countTextLines(buffer) {
  if (buffer.length === 0) return 0;
  let lines = 1;
  for (const byte of buffer) {
    if (byte === 10) lines += 1;
  }
  if (buffer[buffer.length - 1] === 10) lines -= 1;
  return lines;
}

function workspaceProgressKey(projectDir, turnId) {
  return `${previewProcessKey(projectDir)}:${turnId}`;
}

function cleanupWorkspaceProgressSessions() {
  const now = Date.now();
  for (const [key, session] of workspaceProgressSessions.entries()) {
    if (now - session.lastSeenAtMs > WORKSPACE_PROGRESS_SESSION_TTL_MS) {
      workspaceProgressSessions.delete(key);
    }
  }
}

function listProjectMockups(projectPath, proposalSetId = "") {
  const projectDir = nativeFilePath(projectPath);
  if (!projectDir || !fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
    return emptyMockupResult(projectDir, proposalSetId);
  }
  const mockupsDir = path.join(projectDir, ".codex", "mockups");
  if (!fs.existsSync(mockupsDir) || !fs.statSync(mockupsDir).isDirectory()) {
    return emptyMockupResult(projectDir, proposalSetId);
  }

  const requestedSetId = proposalSetId.trim();
  if (requestedSetId) {
    const requestedDir = path.join(mockupsDir, requestedSetId);
    const requested = readMockupPreviewSet(
      projectDir,
      mockupsDir,
      requestedDir,
      requestedSetId,
    );
    if (requested.mockups.length > 0) return requested;
  }

  const legacyRoot = readMockupPreviewSet(
    projectDir,
    mockupsDir,
    mockupsDir,
    "legacy-root",
  );
  if (legacyRoot.mockups.length > 0) return legacyRoot;

  const latestSession = latestProposalSetDirectory(mockupsDir);
  if (latestSession) {
    const latestSetId = path.basename(latestSession);
    const latest = readMockupPreviewSet(
      projectDir,
      mockupsDir,
      latestSession,
      latestSetId,
    );
    if (latest.mockups.length > 0) return latest;
  }

  return emptyMockupResult(projectDir, requestedSetId);
}

function emptyMockupResult(projectDir, proposalSetId = "") {
  return {
    projectPath: projectDir,
    proposalSetId: proposalSetId || "",
    threadId: null,
    artifactKind: "mockup",
    baseDir: "",
    originalPrompt: "",
    depth: "full",
    selectedMockupId: null,
    mockups: [],
  };
}

function readMockupPreviewSet(projectDir, mockupsDir, setDir, fallbackProposalSetId) {
  if (!fs.existsSync(setDir) || !fs.statSync(setDir).isDirectory()) {
    return emptyMockupResult(projectDir, fallbackProposalSetId);
  }
  const manifestPath = path.join(setDir, "manifest.json");
  const manifest = readMockupManifest(manifestPath);
  const entries = Array.isArray(manifest?.mockups)
    ? manifest.mockups
    : discoverMockupFiles(setDir);
  const artifactKind = mockupArtifactKind(
    manifest,
    entries,
    fallbackProposalSetId,
    setDir,
  );
  const filePrefix = artifactKind === "wireframe" ? "wireframe" : "mockup";
  const mockups = [];
  for (let index = 0; index < entries.length && mockups.length < 3; index += 1) {
    const entry = entries[index] ?? {};
    const id = mockupId(entry.id, index);
    const label = mockupLabel(entry.label, index, entries.length);
    const fileName = String(
      entry.file ?? entry.filePath ?? `${filePrefix}-${fallbackFileLabel(label, index).toLowerCase()}.html`,
    );
    const filePath = resolveMockupFilePath(projectDir, mockupsDir, setDir, fileName);
    if (!filePath || !fs.existsSync(filePath)) continue;
    const html = readTextFileLimited(filePath, 768 * 1024);
    mockups.push({
      id,
      label,
      title: String(entry.title ?? defaultMockupTitle(label, artifactKind)).slice(0, 120),
      summary: String(entry.summary ?? "").slice(0, 300),
      filePath,
      html,
      highlights: mockupHighlights(entry.highlights, filePath),
    });
  }
  return {
    projectPath: projectDir,
    proposalSetId: String(manifest?.proposalSetId ?? fallbackProposalSetId).slice(0, 120),
    threadId: typeof manifest?.threadId === "string" ? manifest.threadId.slice(0, 120) : null,
    artifactKind,
    baseDir: setDir,
    originalPrompt: String(manifest?.originalPrompt ?? "").slice(0, 4000),
    depth: manifest?.depth === "quick" ? "quick" : "full",
    selectedMockupId: mockups[0]?.id ?? null,
    mockups,
  };
}

function latestProposalSetDirectory(mockupsDir) {
  try {
    return fs
      .readdirSync(mockupsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(mockupsDir, entry.name))
      .sort((left, right) => {
        const leftMtime = fs.statSync(left).mtimeMs;
        const rightMtime = fs.statSync(right).mtimeMs;
        return rightMtime - leftMtime;
      })[0] ?? null;
  } catch {
    return null;
  }
}

function readMockupManifest(manifestPath) {
  try {
    if (!fs.existsSync(manifestPath)) return null;
    return JSON.parse(readTextFileLimited(manifestPath, 128 * 1024));
  } catch {
    return null;
  }
}

function discoverMockupFiles(mockupsDir) {
  try {
    return fs
      .readdirSync(mockupsDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          /^(?:mockup|wireframe|preview)-(?:[a-c]|preview)\.html$/i.test(entry.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry, index) => ({
        id: mockupId(null, index),
        label: discoverMockupLabel(entry.name, index),
        file: entry.name,
        title: defaultMockupTitle(discoverMockupLabel(entry.name, index), mockupArtifactKind(null, [], entry.name, entry.name)),
      }));
  } catch {
    return [];
  }
}

function mockupId(value, index) {
  const safe = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || `option-${String.fromCharCode(97 + index)}`;
}

function mockupLabel(value, index, total = 3) {
  const text = String(value ?? "").trim();
  if (!text) {
    return total === 1 ? "Preview" : String.fromCharCode(65 + index);
  }
  if (/\bpreview\b/i.test(text)) return "Preview";
  const match = text.match(/\b([A-C])\b/i) ?? text.match(/option[-_\s]*([A-C])/i);
  return (match?.[1] ?? String.fromCharCode(65 + index)).toUpperCase();
}

function discoverMockupLabel(fileName, index) {
  if (/preview/i.test(fileName)) return "Preview";
  return String.fromCharCode(65 + index);
}

function fallbackFileLabel(label, index) {
  return label === "Preview" ? "preview" : label || String.fromCharCode(65 + index);
}

function defaultMockupTitle(label, artifactKind) {
  if (label === "Preview") {
    return artifactKind === "wireframe" ? "Wireframe preview" : "Preview";
  }
  return `Option ${label}`;
}

function mockupArtifactKind(manifest, entries, fallbackProposalSetId, setDir) {
  const rawKind = String(manifest?.artifactKind ?? manifest?.kind ?? "").trim().toLowerCase();
  if (rawKind === "wireframe" || rawKind === "preview" || rawKind === "mockup") {
    return rawKind;
  }
  const haystack = [
    manifest?.originalPrompt,
    fallbackProposalSetId,
    setDir,
    ...entries.flatMap((entry) => [
      entry?.file,
      entry?.filePath,
      entry?.label,
      entry?.title,
      entry?.summary,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\bwireframe\b|\bwireframes\b/.test(haystack)) return "wireframe";
  if (/\bpreview\b|\bpreviews\b/.test(haystack)) return "preview";
  return "mockup";
}

function mockupHighlights(value, filePath) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 8)
    .map((highlight, index) => {
      if (!highlight || typeof highlight !== "object") return null;
      const area = normalizeMockupHighlightArea(highlight, filePath);
      if (!area) return null;
      const note = String(highlight.note ?? highlight.summary ?? highlight.description ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 240);
      const label = mockupHighlightLabel(highlight, note, index);
      return {
        id: mockupId(highlight.id ?? `highlight-${index + 1}`, index),
        label,
        note,
        areaMark: area,
      };
    })
    .filter(Boolean);
}

function mockupHighlightLabel(highlight, note, index) {
  const explicit = String(highlight.label ?? highlight.title ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (explicit) return explicit;
  const inferred = inferHighlightLabelFromNote(note);
  return inferred || `Highlight ${index + 1}`;
}

function inferHighlightLabelFromNote(note) {
  const text = String(note ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  if (!text) return "";
  const phraseMatch = text.match(
    /^([A-Za-z][A-Za-z0-9/-]*(?:\s+[A-Za-z0-9/-]+){0,4})\s+(?:carries|supports|starts|helps|remains|sits|frames|keeps|anchors|switches|holds|stays|drives|shows|contains|centers|turns|orients)\b/i,
  );
  if (phraseMatch?.[1]) {
    return tidyHighlightLabel(phraseMatch[1]);
  }
  const lower = text.toLowerCase();
  const keywordPairs = [
    ["summary rail", "Summary rail"],
    ["comparison table", "Comparison table"],
    ["decision table", "Decision table"],
    ["decision callout", "Decision callout"],
    ["drawer", lower.includes("right") ? "Right drawer" : "Drawer"],
    ["side panel", "Side panel"],
    ["sidebar", "Sidebar"],
    ["filters", "Filters"],
    ["filter", "Filter"],
    ["toolbar", "Toolbar"],
    ["header", "Header"],
    ["hero", "Hero"],
    ["chart", "Chart"],
    ["cards", "Cards"],
    ["card", "Card"],
    ["grid", "Grid"],
    ["list", "List"],
    ["form", "Form"],
    ["modal", "Modal"],
    ["dialog", "Dialog"],
    ["table", "Table"],
  ];
  for (const [needle, label] of keywordPairs) {
    if (lower.includes(needle)) return label;
  }
  const words = text
    .replace(/[^A-Za-z0-9\s/-]+/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  return tidyHighlightLabel(words.join(" "));
}

function tidyHighlightLabel(value) {
  const cleaned = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:a|an|the)\s+/i, "")
    .slice(0, 80);
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((part) =>
      part
        .split("-")
        .map((piece) =>
          piece ? piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase() : piece,
        )
        .join("-"),
    )
    .join(" ");
}

function normalizeMockupHighlightArea(highlight, filePath) {
  const rawArea =
    highlight.area && typeof highlight.area === "object" ? highlight.area : highlight;
  const width = positiveFiniteNumber(rawArea.width);
  const height = positiveFiniteNumber(rawArea.height);
  const viewportWidth =
    positiveFiniteNumber(rawArea.viewportWidth) ||
    positiveFiniteNumber(rawArea.previewWidth) ||
    positiveFiniteNumber(rawArea.surfaceWidth) ||
    1200;
  const viewportHeight =
    positiveFiniteNumber(rawArea.viewportHeight) ||
    positiveFiniteNumber(rawArea.previewHeight) ||
    positiveFiniteNumber(rawArea.surfaceHeight) ||
    760;
  if (!width || !height || !viewportWidth || !viewportHeight) return null;
  const x = clampNumber(numberValueOrZero(rawArea.x), 0, viewportWidth - 4);
  const y = clampNumber(numberValueOrZero(rawArea.y), 0, viewportHeight - 4);
  return {
    x,
    y,
    width: clampNumber(width, 4, viewportWidth - x),
    height: clampNumber(height, 4, viewportHeight - y),
    viewportWidth,
    viewportHeight,
    route: String(rawArea.route ?? filePath),
    note: String(highlight.note ?? rawArea.note ?? ""),
    createdAt: positiveFiniteNumber(rawArea.createdAt) || Date.now(),
  };
}

function positiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function numberValueOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function resolveMockupFilePath(projectDir, mockupsDir, setDir, fileName) {
  const raw = nativeFilePath(fileName);
  const candidates = path.isAbsolute(raw)
    ? [path.resolve(raw)]
    : [
        path.resolve(setDir, raw),
        path.resolve(mockupsDir, raw),
        path.resolve(projectDir, raw),
      ];
  for (const candidate of candidates) {
    if (isPathInside(candidate, mockupsDir) && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function readTextFileLimited(filePath, maxBytes) {
  const handle = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(handle, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    fs.closeSync(handle);
  }
}

function isPathInside(candidate, parentDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(candidate));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function readImageDataUrl(filePath) {
  const nativePath = nativeFilePath(filePath);
  const mime = imageMime(nativePath);
  if (!mime) throw new Error("Unsupported image type.");
  const bytes = fs.readFileSync(nativePath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

function proposalWorkspacesRoot() {
  return path.join(app.getPath("userData"), "proposal-workspaces");
}

function draftWorkspacesRoot() {
  return path.join(app.getPath("userData"), "draft-workspaces");
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
    appServerUrl: bridgeUrl(),
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
