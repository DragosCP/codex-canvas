import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDistIndex = path.join(repoRoot, "apps", "desktop", "dist", "index.html");
const artifactsDir = path.join(repoRoot, "artifacts", "p33d-ledger-recovery");
const userDataDir = path.join(artifactsDir, "electron-user-data");
const evidenceDir = path.join(artifactsDir, "evidence");
const projectPath = path.join(artifactsDir, "project");
const draftWorkspacePath = path.join(artifactsDir, "draft-workspace");
const remotePort = await findAvailablePort(9331, 9369);
const appServerPort = await findAvailablePort(49121, 49179);
const bridgePort = await findAvailablePort(appServerPort + 1, 49249);

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "CDP command failed"));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  async send(method, params = {}, sessionId = undefined) {
    await this.ready;
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async evaluate(expression, arg) {
    const result = await this.send("Runtime.evaluate", {
      expression:
        arg === undefined
          ? `(${expression})()`
          : `(${expression})(${JSON.stringify(arg)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(cdpExceptionMessage(result.exceptionDetails));
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

class CdpSession {
  constructor(parent, sessionId) {
    this.parent = parent;
    this.sessionId = sessionId;
  }

  send(method, params = {}) {
    return this.parent.send(method, params, this.sessionId);
  }

  evaluate(expression, arg) {
    return this.send("Runtime.evaluate", {
      expression:
        arg === undefined
          ? `(${expression})()`
          : `(${expression})(${JSON.stringify(arg)})`,
      awaitPromise: true,
      returnByValue: true,
    }).then((result) => {
      if (result.exceptionDetails) {
        throw new Error(cdpExceptionMessage(result.exceptionDetails));
      }
      return result.result?.value;
    });
  }

  close() {
    this.parent.close();
  }
}

class JsonRpcClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "JSON-RPC request failed"));
      } else {
        pending.resolve(message.result);
      }
    });
    this.socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error("JSON-RPC socket closed"));
      }
      this.pending.clear();
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener(
        "open",
        () => resolve(new JsonRpcClient(socket)),
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => reject(new Error(`Unable to connect to ${url}`)),
        { once: true },
      );
    });
  }

  request(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  notify(method, params = undefined) {
    this.socket.send(
      JSON.stringify(params === undefined ? { method } : { method, params }),
    );
  }

  close() {
    this.socket.close();
  }
}

if (!existsSync(appDistIndex)) {
  throw new Error("Desktop renderer is not built. Run `npm --prefix apps/desktop run build` first.");
}

mkdirSync(evidenceDir, { recursive: true });
rmSync(userDataDir, { recursive: true, force: true });
mkdirSync(userDataDir, { recursive: true });
resetStaticApp(projectPath, "P33D Recovery");
resetStaticApp(draftWorkspacePath, "P33D Recovery Draft");

const electron = spawn(
  process.execPath,
  [path.join(repoRoot, "apps", "desktop", "electron", "run.mjs")],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_DESKTOP_REMOTE_DEBUGGING_PORT: String(remotePort),
      CODEX_DESKTOP_APP_SERVER_PORT: String(appServerPort),
      CODEX_DESKTOP_BRIDGE_PORT: String(bridgePort),
      CODEX_DESKTOP_USER_DATA_DIR: userDataDir,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

const logs = [];
const connectTrace = [];
electron.stdout.on("data", (chunk) => logs.push(chunk.toString()));
electron.stderr.on("data", (chunk) => logs.push(chunk.toString()));

let cdp = null;
try {
  cdp = await connectToElectron(remotePort);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 960,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await waitFor(cdp, documentReadyExpression(), 120_000);
  const threadId = await createThreadForProject(cdp, projectPath);
  await seedDesktopState(cdp, threadId);
  await waitForText(cdp, "P33D Recovery", 60_000);
  await clickButton(cdp, { title: "Open live preview" });
  await waitFor(
    cdp,
    async () =>
      (await collectFacts(cdp)).buttons.some(
        (button) =>
          button.title === "Draft blocked before it produced buildable changes.",
      ),
    60_000,
  );

  const stripFacts = await collectFacts(cdp);
  assertButton(stripFacts, "Continue this draft");
  assertButton(stripFacts, "Discard this draft");
  assertNoButton(stripFacts, "Build this draft into Live");
  assertButton(stripFacts, "Current live app");
  await screenshot(cdp, "01-failed-draft-recovery-strip.png");
  await writeFacts(cdp, "01-failed-draft-recovery-strip", {
    projectPath,
    draftWorkspacePath,
  });

  await clickButton(cdp, { title: "Current live app" });
  await waitForText(cdp, "Preview", 60_000);
  await screenshot(cdp, "02-open-live-recovery-action.png");
  await writeFacts(cdp, "02-open-live-recovery-action", {});

  await clickButton(cdp, { title: "Draft blocked before it produced buildable changes." });
  await waitForText(cdp, "Live", 60_000);
  await waitForText(cdp, "Draft", 60_000);
  await screenshot(cdp, "03-failed-draft-inspector.png");
  await writeFacts(cdp, "03-failed-draft-inspector", {});

  await writeSummary({
    passed: true,
    screenshots: [
      "01-failed-draft-recovery-strip.png",
      "02-open-live-recovery-action.png",
      "03-failed-draft-inspector.png",
    ],
    ports: { remotePort, appServerPort, bridgePort },
  });
  console.log("P33d Electron ledger recovery test passed.");
} catch (error) {
  if (cdp) {
    await screenshot(cdp, "failure-state.png").catch(() => null);
    await writeFacts(cdp, "failure-state", {
      error: error?.stack || String(error),
    }).catch(() => null);
  }
  await writeSummary({
    passed: false,
    error: error?.stack || String(error),
    logs,
    connectTrace,
    ports: { remotePort, appServerPort, bridgePort },
  });
  throw error;
} finally {
  cdp?.close();
  await stopChildProcess(electron);
}

async function seedDesktopState(cdp, threadId) {
  const state = desktopState(threadId);
  const serialized = JSON.stringify(state);
  const preload = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { window.localStorage.setItem("codex.desktop.v1", ${JSON.stringify(
      serialized,
    )}); } catch (error) { console.error("P33d seed failed", error); }`,
  });
  try {
    await cdp.send("Page.reload", { ignoreCache: true });
    await waitFor(cdp, documentReadyExpression(), 60_000);
  } finally {
    if (preload.identifier) {
      await cdp
        .send("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: preload.identifier,
        })
        .catch(() => null);
    }
  }
}

function desktopState(threadId) {
  const now = Date.now();
  const projectId = "p33d-recovery-project";
  const draftId = "p33d-failed-draft";
  const draft = {
    draftId,
    registryId: `local-draft:${projectId}:${draftId}`,
    projectId,
    threadId,
    turnId: "p33d-failed-turn",
    name: "Recover checkout draft",
    slug: "recover-checkout-draft",
    lifecycle: "active",
    status: "failed",
    rootPath: projectPath,
    workspacePath: draftWorkspacePath,
    previewOwnerId: `feature-draft:${projectId}:${draftId}`,
    affectedRoutes: ["/"],
    mockAssumptions: ["Checkout status uses local fixture state."],
    briefPath: path.join(draftWorkspacePath, ".codex", "draft-brief.md"),
    originalPrompt: "Show a recovery checkout workflow as a Draft.",
    summary: "Draft blocked before it produced buildable changes.",
    changedFiles: [],
    error: "Draft placement preflight did not identify the existing checkout entry point.",
    createdAt: now - 60_000,
    updatedAt: now,
  };

  return {
    version: 1,
    appServerUrl: `http://127.0.0.1:${appServerPort}`,
    projects: [
      {
        id: projectId,
        path: projectPath,
        name: "P33D Recovery",
        pinned: false,
        hidden: false,
        archived: false,
        order: 0,
        lastActiveThreadId: threadId,
        settings: {
          sandbox: "danger-full-access",
          approvalPolicy: "never",
          model: null,
          effort: "medium",
          serviceTier: null,
          planMode: false,
        },
      },
    ],
    activeProjectId: projectId,
    activeThreadId: threadId,
    pinnedThreadIds: [],
    expandedProjectIds: [projectId],
    planProposals: {},
    sentComposerContextsByTurnId: {},
    featureDrafts: { [draftId]: draft },
    featureDraftActiveIdsByThreadId: { [threadId]: draftId },
    codeProposalSets: {},
    codeProposalActiveSetIdsByThreadId: {},
    codeProposalCompareSetIdsByThreadId: {},
    mockupActiveProposalSetIdsByThreadId: {},
    mockupHistoryProposalSetIds: {},
    layout: {
      inspectorWidth: 760,
      commandSurfaceHeight: 220,
      inspectorOpen: true,
      commandSurfaceOpen: false,
    },
  };
}

function resetStaticApp(rootPath, title) {
  rmSync(rootPath, { recursive: true, force: true });
  mkdirSync(rootPath, { recursive: true });
  writeFileSync(
    path.join(rootPath, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="shell">
    <aside>
      <strong>${title}</strong>
      <button>Orders</button>
      <button>Checkout</button>
      <button>Support</button>
    </aside>
    <section class="workspace">
      <header>
        <span>Live app</span>
        <h1>Checkout operations</h1>
        <button class="primary">New recovery</button>
      </header>
      <section class="cards">
        <article><span>Open carts</span><strong>18</strong></article>
        <article><span>Recovered</span><strong>7</strong></article>
        <article><span>Escalated</span><strong>3</strong></article>
      </section>
      <article class="panel">
        <h2>Queue</h2>
        <p>Review stalled checkout sessions before contacting support.</p>
      </article>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
    "utf8",
  );
  writeFileSync(
    path.join(rootPath, "styles.css"),
    `:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #121519; color: #f5f1ea; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #121519; }
button { font: inherit; }
.shell { display: grid; grid-template-columns: 216px 1fr; min-height: 100vh; }
aside { border-right: 1px solid #303944; padding: 26px; display: grid; gap: 12px; align-content: start; background: #191f27; }
aside strong { font-size: 21px; margin-bottom: 14px; }
aside button { border: 0; border-radius: 8px; background: #252d37; color: #e5edf5; padding: 11px 12px; text-align: left; }
.workspace { padding: 34px; display: grid; gap: 22px; align-content: start; }
header { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
header span { color: #8fc2bd; font-size: 12px; text-transform: uppercase; }
h1 { margin: 4px 0 0; font-size: 38px; }
.primary { border: 0; border-radius: 8px; background: #d5b46a; color: #151515; padding: 12px 16px; font-weight: 800; }
.cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.cards article, .panel { border: 1px solid #384451; border-radius: 8px; background: #1b222b; padding: 18px; }
.cards span, .panel p { color: #acb8c4; }
.cards strong { display: block; margin-top: 8px; font-size: 31px; }
`,
    "utf8",
  );
  writeFileSync(
    path.join(rootPath, "app.js"),
    `document.querySelector(".primary")?.addEventListener("click", () => {
  document.querySelector(".panel p").textContent = "Recovery workflow selected.";
});
`,
    "utf8",
  );
}

async function connectToElectron(port) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const loggedBrowserUrl = devtoolsUrlFromLogs();
    if (loggedBrowserUrl) {
      try {
        const attached = await attachToFirstPage(new CdpClient(loggedBrowserUrl));
        if (attached) return attached;
      } catch {
        // Keep waiting.
      }
    }
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
      connectTrace.push({ source: "json", count: Array.isArray(targets) ? targets.length : -1 });
      const target =
        targets.find(
          (candidate) =>
            (candidate.type === "page" || candidate.type === "webview") &&
            candidate.webSocketDebuggerUrl &&
            !String(candidate.url || "").startsWith("devtools://"),
        ) ?? null;
      if (target) return new CdpClient(target.webSocketDebuggerUrl);
    } catch (error) {
      connectTrace.push({ source: "json-error", message: errorMessageForTrace(error) });
    }
    try {
      const version = await fetchJson(`http://127.0.0.1:${port}/json/version`);
      connectTrace.push({ source: "version", hasUrl: Boolean(version.webSocketDebuggerUrl) });
      if (version.webSocketDebuggerUrl) {
        const attached = await attachToFirstPage(new CdpClient(version.webSocketDebuggerUrl));
        if (attached) return attached;
      }
    } catch (error) {
      connectTrace.push({ source: "version-error", message: errorMessageForTrace(error) });
    }
    await delay(500);
  }
  throw new Error("Timed out waiting for Electron CDP.");
}

async function attachToFirstPage(browser) {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    const { targetInfos } = await browser.send("Target.getTargets");
    const target =
      targetInfos.find(
        (candidate) =>
          (candidate.type === "page" || candidate.type === "webview") &&
          !String(candidate.url || "").startsWith("devtools://"),
      ) ?? null;
    connectTrace.push({
      source: "targets",
      urls: targetInfos
        .filter((candidate) => candidate.type === "page" || candidate.type === "webview")
        .map((candidate) => candidate.url || "(blank)")
        .slice(0, 5),
    });
    if (target?.targetId) {
      const attached = await browser.send("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      });
      return new CdpSession(browser, attached.sessionId);
    }
    await delay(500);
  }
  browser.close();
  return null;
}

function devtoolsUrlFromLogs() {
  const match = logs.join("").match(/DevTools listening on (ws:\/\/[^\s]+)/);
  return match?.[1] ?? "";
}

async function clickButton(cdp, { title, text }) {
  const clicked = await cdp.evaluate(
    `({ title, text }) => {
      const buttons = [...document.querySelectorAll("button")];
      const button = buttons.find((candidate) => {
        const titleMatch = title ? candidate.title === title : true;
        const textMatch = text ? candidate.textContent.trim() === text : true;
        return titleMatch && textMatch;
      });
      if (!button) return false;
      button.click();
      return true;
    }`,
    { title, text },
  );
  if (!clicked) {
    const facts = await collectFacts(cdp);
    throw new Error(`Could not click button ${title || text}. Buttons: ${JSON.stringify(facts.buttons)}`);
  }
}

async function screenshot(cdp, name) {
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  writeFileSync(path.join(evidenceDir, name), Buffer.from(result.data, "base64"));
}

async function writeFacts(cdp, name, extra = {}) {
  const facts = await collectFacts(cdp);
  writeFileSync(
    path.join(evidenceDir, `${name}.json`),
    `${JSON.stringify({ name, facts, extra, at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

async function collectFacts(cdp) {
  return cdp.evaluate(`() => ({
    text: document.body.innerText,
    buttons: [...document.querySelectorAll("button")].map((button) => ({
      text: button.textContent.trim(),
      title: button.title || null,
      aria: button.getAttribute("aria-label"),
      disabled: button.disabled,
    })),
    desktopState: JSON.parse(localStorage.getItem("codex.desktop.v1") || "{}"),
  })`);
}

function assertButton(facts, title) {
  assert.ok(
    facts.buttons.some((button) => button.title === title && !button.disabled),
    `Expected enabled button titled ${title}. Buttons: ${JSON.stringify(facts.buttons)}`,
  );
}

function assertNoButton(facts, title) {
  assert.ok(
    !facts.buttons.some((button) => button.title === title),
    `Expected no button titled ${title}. Buttons: ${JSON.stringify(facts.buttons)}`,
  );
}

async function waitForText(cdp, text, timeoutMs) {
  await waitFor(
    cdp,
    async () => {
      const bodyText = await cdp.evaluate("() => document.body.innerText");
      return bodyText.includes(text);
    },
    timeoutMs,
  );
}

async function waitFor(cdp, predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value =
      typeof predicate === "function"
        ? await predicate()
        : await cdp.evaluate(`() => Boolean(${predicate})`);
    if (value) return;
    await delay(500);
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

function documentReadyExpression() {
  return "document.readyState === 'complete' || document.readyState === 'interactive'";
}

async function createThreadForProject(cdp, cwd) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 90_000) {
    try {
      const runtime = await cdp.evaluate(
        "() => window.codexDesktop?.invoke?.('desktop_runtime_info')",
      );
      const appServerUrl = runtime?.appServerUrl;
      if (!appServerUrl || runtime?.startupError) {
        lastError = new Error(runtime?.startupError || "Desktop runtime is not ready.");
        await delay(750);
        continue;
      }
      const client = await JsonRpcClient.connect(appServerUrl);
      try {
        await client.request("initialize", {
          clientInfo: {
            name: "p33d_recovery_test",
            title: "P33D Recovery Test",
            version: "0.1.0",
          },
          capabilities: { experimentalApi: true, requestAttestation: false },
        });
        client.notify("initialized");
        const response = await client.request("thread/start", {
          cwd,
          approvalPolicy: "never",
          sandbox: "danger-full-access",
          sessionStartSource: "startup",
        });
        const threadId = response?.thread?.id;
        if (!threadId) throw new Error("thread/start did not return a thread id.");
        connectTrace.push({ source: "thread-started", threadId });
        return threadId;
      } finally {
        client.close();
      }
    } catch (error) {
      lastError = error;
      await delay(750);
    }
  }
  throw new Error(`Could not create recovery thread: ${errorMessageForTrace(lastError)}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return response.json();
}

async function writeSummary(summary) {
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    path.join(evidenceDir, "summary.json"),
    `${JSON.stringify({ ...summary, at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

function cdpExceptionMessage(exceptionDetails) {
  return (
    exceptionDetails.exception?.description ||
    exceptionDetails.exception?.value ||
    exceptionDetails.text ||
    "Runtime evaluation failed"
  );
}

function errorMessageForTrace(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChildProcess(child) {
  child.stdout?.destroy();
  child.stderr?.destroy();
  if (child.exitCode !== null || child.signalCode) return;
  child.kill();
  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
    await waitForChildExit(child, 5000);
    return;
  }
  await waitForChildExit(child, 5000);
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    function onExit() {
      clearTimeout(timer);
      resolve(true);
    }
    child.once("exit", onExit);
  });
}

function findAvailablePort(start, end) {
  return new Promise(async (resolve, reject) => {
    for (let port = start; port <= end; port += 1) {
      if (await isPortAvailable(port)) {
        resolve(port);
        return;
      }
    }
    reject(new Error(`No available port in ${start}-${end}`));
  });
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
