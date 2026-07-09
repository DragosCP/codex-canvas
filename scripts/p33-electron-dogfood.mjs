import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { DatabaseSync } = require("node:sqlite");
const {
  prepareDraftWorkspace,
} = require(path.join(repoRoot, "apps/desktop/electron/draft-workspaces.cjs"));

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

const artifactsDir = path.join(repoRoot, "artifacts", "p33-dogfood");
const projectsDir = path.join(artifactsDir, "projects");
const userDataDir = path.join(artifactsDir, "electron-user-data");
const evidenceDir = path.join(artifactsDir, "evidence");
const interfaceProjectPath = path.join(projectsDir, "interface-heavy");
const workflowProjectPath = path.join(projectsDir, "workflow-heavy");
const remotePort = await findAvailablePort(9251, 9299);
const appServerPort = await findAvailablePort(48989, 49049);
const bridgePort = await findAvailablePort(appServerPort + 1, 49120);
const rendererUrl = "http://127.0.0.1:4317";

mkdirSync(evidenceDir, { recursive: true });
rmSync(path.join(evidenceDir, "failure-state.png"), { force: true });
rmSync(path.join(evidenceDir, "failure-state.json"), { force: true });
rmSync(userDataDir, { recursive: true, force: true });
mkdirSync(userDataDir, { recursive: true });
resetInterfaceProject();
resetWorkflowProject();

const sourceBefore = await sourceSnapshot(interfaceProjectPath);
const workflowSourceBefore = await sourceSnapshot(workflowProjectPath);
const electron = spawn(process.execPath, [path.join(repoRoot, "apps/desktop/electron/run.mjs"), "--dev"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    CODEX_DESKTOP_REMOTE_DEBUGGING_PORT: String(remotePort),
    CODEX_DESKTOP_APP_SERVER_PORT: String(appServerPort),
    CODEX_DESKTOP_BRIDGE_PORT: String(bridgePort),
    CODEX_DESKTOP_USER_DATA_DIR: userDataDir,
    ELECTRON_RENDERER_URL: rendererUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

const logs = [];
const connectTrace = [];
electron.stdout.on("data", (chunk) => logs.push(chunk.toString()));
electron.stderr.on("data", (chunk) => logs.push(chunk.toString()));

let cdp = null;
try {
  cdp = await connectToElectron(remotePort);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await waitFor(cdp, documentReadyExpression(), 120_000);
  connectTrace.push({ source: "attached-url", url: await cdp.evaluate("() => location.href") });
  const threadId = await createThreadForProject(cdp, interfaceProjectPath);

  await seedDesktopState(cdp, {
    projectPath: interfaceProjectPath,
    projectId: "p33-interface",
    projectName: "P33 Interface",
    threadId,
  });
  await waitForText(cdp, "P33 Interface", 60_000);
  await screenshot(cdp, "01-live-only-seeded.png");
  await writeFacts(cdp, "01-live-only-seeded", {
    sourceHash: sourceBefore,
  });

  const draftOne = await prepareReadyDraft({
    draftId: "draft-quick-add-flow",
    name: "Quick add flow",
    threadId,
    heading: "Quick add lead",
    description: "Capture a lead without leaving the dashboard.",
    saveLabel: "Save draft",
    cssAppend:
      ".quick-draft { border: 1px solid #44546a; border-radius: 8px; padding: 18px; background: rgba(216,177,95,.12); display: grid; gap: 10px; } .quick-draft form { display: flex; gap: 10px; } .quick-draft input { flex: 1; border: 1px solid #44546a; border-radius: 8px; background: #151a22; color: #f4f0e8; padding: 12px; } .quick-draft button { border: 0; border-radius: 8px; background: #d8b15f; color: #171717; padding: 12px 16px; font-weight: 700; }",
  });

  await seedDesktopState(cdp, {
    projectPath: interfaceProjectPath,
    projectId: "p33-interface",
    projectName: "P33 Interface",
    threadId,
    drafts: [draftState(draftOne, "Ready quick add draft.")],
    activeDraftId: draftOne.draftId,
  });
  await writeFacts(cdp, "02-after-draft-seed", {
    draftId: draftOne.draftId,
  });
  await ensureCanvasButton(cdp, { title: "Build this draft into Live" }, 60_000);
  await screenshot(cdp, "02-draft-open.png");
  await writeFacts(cdp, "02-draft-open", {
    sourceUnchanged: await sourceSnapshot(interfaceProjectPath),
  });
  assert.deepEqual(
    await sourceSnapshot(interfaceProjectPath),
    sourceBefore,
    "opening a draft should not change source",
  );

  await ensureCanvasButton(cdp, { title: "Park this draft" }, 60_000);
  await clickButton(cdp, { title: "Park this draft" });
  await waitForDraftLifecycle(cdp, draftOne.draftId, "parked", 60_000);
  await waitForText(cdp, "Ready in P33 Interface", 60_000);
  await screenshot(cdp, "03-draft-parked.png");
  assert.deepEqual(
    await sourceSnapshot(interfaceProjectPath),
    sourceBefore,
    "parking a draft should not change source",
  );

  const draftTwo = await prepareReadyDraft({
    draftId: "draft-build-proof",
    name: "Build proof",
    threadId,
    heading: "Built quick add",
    description: "This section should land in Live only after Build this.",
    saveLabel: "Save lead",
    cssAppend:
      ".quick-draft { border: 1px solid #44546a; border-radius: 8px; padding: 18px; background: rgba(143,180,216,.14); display: grid; gap: 10px; } .quick-draft form { display: flex; gap: 10px; } .quick-draft input { flex: 1; border: 1px solid #44546a; border-radius: 8px; background: #151a22; color: #f4f0e8; padding: 12px; } .quick-draft button { border: 0; border-radius: 8px; background: #8fb4d8; color: #111318; padding: 12px 16px; font-weight: 700; }",
  });
  const beforeBuild = await sourceSnapshot(interfaceProjectPath);
  await seedDesktopState(cdp, {
    projectPath: interfaceProjectPath,
    projectId: "p33-interface",
    projectName: "P33 Interface",
    threadId,
    drafts: [
      {
        ...draftState(draftTwo, "Ready build proof draft."),
        updatedAt: Date.now() + 100_000,
      },
    ],
    activeDraftId: draftTwo.draftId,
  });
  await ensureCanvasButton(cdp, { title: "Build this draft into Live" }, 60_000);
  await screenshot(cdp, "06-build-proof-draft.png");
  assert.deepEqual(
    await sourceSnapshot(interfaceProjectPath),
    beforeBuild,
    "source should remain unchanged immediately before Build this",
  );

  await ensureCanvasButton(cdp, { title: "Build this draft into Live" }, 60_000);
  await clickButton(cdp, { title: "Build this draft into Live" });
  await waitFor(
    cdp,
    async () => {
      const snapshot = await sourceSnapshot(interfaceProjectPath);
      return !sameSnapshot(snapshot, beforeBuild);
    },
    60_000,
  );
  await waitForPreviewRunning(cdp, 60_000);
  await screenshot(cdp, "07-built-live.png");
  const afterBuild = await sourceSnapshot(interfaceProjectPath);
  assert.notDeepEqual(afterBuild, beforeBuild, "Build this should change source");
  assert.ok(
    readFileSync(path.join(interfaceProjectPath, "index.html"), "utf8").includes("Built quick add"),
    "Live source should contain the built draft UI",
  );
  await writeFacts(cdp, "07-built-live", {
    beforeBuild,
    afterBuild,
    sourceChanged: !sameSnapshot(afterBuild, beforeBuild),
  });

  const workflowThreadId = await createThreadForProject(cdp, workflowProjectPath);
  await seedDesktopState(cdp, {
    projectPath: workflowProjectPath,
    projectId: "p33-workflow",
    projectName: "P33 Workflow",
    threadId: workflowThreadId,
  });
  await waitForText(cdp, "P33 Workflow", 60_000);
  await screenshot(cdp, "08-workflow-live-only-seeded.png");
  await writeFacts(cdp, "08-workflow-live-only-seeded", {
    sourceHash: workflowSourceBefore,
  });

  const workflowDraft = await prepareWorkflowDraft({
    draftId: "draft-approval-routing",
    name: "Approval routing",
    threadId: workflowThreadId,
  });
  await seedDesktopState(cdp, {
    projectPath: workflowProjectPath,
    projectId: "p33-workflow",
    projectName: "P33 Workflow",
    threadId: workflowThreadId,
    drafts: [
      draftStateForProject(
        workflowDraft,
        "Ready approval routing draft.",
        "p33-workflow",
      ),
    ],
    activeDraftId: workflowDraft.draftId,
  });
  await ensureCanvasButton(cdp, { title: "Build this draft into Live" }, 60_000);
  await screenshot(cdp, "09-workflow-draft-open.png");
  assert.deepEqual(
    await sourceSnapshot(workflowProjectPath),
    workflowSourceBefore,
    "opening a backend/workflow draft should not change source",
  );

  const workflowBeforeBuild = await sourceSnapshot(workflowProjectPath);
  await ensureCanvasButton(cdp, { title: "Build this draft into Live" }, 60_000);
  await clickButton(cdp, { title: "Build this draft into Live" });
  await waitFor(
    cdp,
    async () => {
      const snapshot = await sourceSnapshot(workflowProjectPath);
      return !sameSnapshot(snapshot, workflowBeforeBuild);
    },
    60_000,
  );
  await waitForPreviewRunning(cdp, 60_000);
  await screenshot(cdp, "10-workflow-built-live.png");
  const workflowAfterBuild = await sourceSnapshot(workflowProjectPath);
  assert.notDeepEqual(
    workflowAfterBuild,
    workflowBeforeBuild,
    "workflow Build this should change source",
  );
  assert.ok(
    readFileSync(path.join(workflowProjectPath, "public", "index.html"), "utf8").includes(
      "Approval routing",
    ),
    "Built workflow source should include approval routing UI",
  );
  assert.ok(
    readFileSync(path.join(workflowProjectPath, "server.js"), "utf8").includes(
      "/api/escalations",
    ),
    "Built workflow source should include backend escalation route",
  );
  const workflowDatabase = workflowDatabaseSnapshot();
  assert.equal(workflowDatabase.jobs.length, 3, "workflow database should seed jobs");
  await writeFacts(cdp, "10-workflow-built-live", {
    beforeBuild: workflowBeforeBuild,
    afterBuild: workflowAfterBuild,
    workflowDatabase,
    sourceChanged: !sameSnapshot(workflowAfterBuild, workflowBeforeBuild),
  });

  await writeSummary({
    passed: true,
    screenshots: [
      "01-live-only-seeded.png",
      "02-draft-open.png",
      "03-draft-parked.png",
      "06-build-proof-draft.png",
      "07-built-live.png",
      "08-workflow-live-only-seeded.png",
      "09-workflow-draft-open.png",
      "10-workflow-built-live.png",
    ],
  });
  console.log("P33 Electron dogfood passed.");
} catch (error) {
  if (cdp) {
    await screenshot(cdp, "failure-state.png").catch(() => null);
    await writeFacts(cdp, "failure-state", {
      error: error?.stack || String(error),
    }).catch(() => null);
  }
  await writeSummary({ passed: false, error: error?.stack || String(error), logs, connectTrace });
  throw error;
} finally {
  cdp?.close();
  await stopChildProcess(electron);
}

async function prepareReadyDraft({
  draftId,
  name,
  threadId,
  heading,
  description,
  saveLabel,
  cssAppend,
}) {
  const prepared = await prepareDraftWorkspace({
    cacheRoot: path.join(userDataDir, "draft-workspaces"),
    projectPath: interfaceProjectPath,
    draftId,
    name,
    threadId,
    goal: `Dogfood ${name}`,
    currentSummary: "Ready for Electron dogfood.",
    affectedRoutes: ["/"],
    mockAssumptions: ["Static fixture uses local interaction only."],
  });
  const htmlPath = path.join(prepared.workspacePath, "index.html");
  const html = readFileSync(htmlPath, "utf8");
  const quickDraft = `      <section class="quick-draft">
        <h2>${heading}</h2>
        <p>${description}</p>
        <form>
          <input placeholder="Company name" />
          <button type="button">${saveLabel}</button>
        </form>
      </section>
`;
  const nextHtml = html.replace(
    "      <section class=\"metrics\">",
    `${quickDraft}      <section class="metrics">`,
  );
  assert.notEqual(nextHtml, html, "Dogfood draft fixture should update index.html");
  writeFileSync(htmlPath, nextHtml, "utf8");
  writeFileSync(
    path.join(prepared.workspacePath, "styles.css"),
    `${readFileSync(path.join(prepared.workspacePath, "styles.css"), "utf8")}\n${cssAppend}\n`,
    "utf8",
  );
  return prepared;
}

function draftState(prepared, summary) {
  return draftStateForProject(prepared, summary, "p33-interface");
}

function draftStateForProject(prepared, summary, projectId) {
  return {
    draftId: prepared.draftId,
    registryId: prepared.registryId,
    projectId,
    threadId: prepared.threadId,
    turnId: "dogfood-turn",
    name: prepared.name,
    slug: prepared.slug,
    lifecycle: "active",
    status: "ready",
    rootPath: prepared.rootPath,
    workspacePath: prepared.workspacePath,
    previewOwnerId: prepared.previewOwnerId,
    affectedRoutes: prepared.affectedRoutes ?? ["/"],
    mockAssumptions: prepared.mockAssumptions ?? [],
    briefPath: prepared.briefPath,
    originalPrompt: `Dogfood ${prepared.name}`,
    summary,
    changedFiles: [
      { kind: "updated", path: "index.html", hash: "dogfood", size: 1 },
      { kind: "updated", path: "styles.css", hash: "dogfood", size: 1 },
    ],
    createdAt: prepared.createdAt,
    updatedAt: Date.now(),
  };
}

async function prepareWorkflowDraft({ draftId, name, threadId }) {
  const prepared = await prepareDraftWorkspace({
    cacheRoot: path.join(userDataDir, "draft-workspaces"),
    projectPath: workflowProjectPath,
    draftId,
    name,
    threadId,
    goal: `Dogfood ${name}`,
    currentSummary: "Ready for backend workflow Electron dogfood.",
    affectedRoutes: ["/", "/api/jobs", "/api/escalations"],
    mockAssumptions: ["Escalation queue uses the local Node fixture API."],
  });

  const publicDir = path.join(prepared.workspacePath, "public");
  const indexPath = path.join(publicDir, "index.html");
  const stylesPath = path.join(publicDir, "styles.css");
  const appPath = path.join(publicDir, "app.js");
  const serverPath = path.join(prepared.workspacePath, "server.js");

  const indexHtml = readFileSync(indexPath, "utf8");
  const approvalPanel = `      <section class="approval-panel">
        <div>
          <span class="eyebrow">Approval queue</span>
          <h2>Approval routing</h2>
          <p>Escalate blocked workflow jobs with an owner and next step.</p>
        </div>
        <form id="escalation-form">
          <select name="jobId" aria-label="Job to escalate"></select>
          <input name="owner" placeholder="Owner" />
          <button type="submit">Route approval</button>
        </form>
        <ul id="escalation-list"></ul>
      </section>
`;
  const nextIndex = indexHtml.replace(
    "      <section class=\"queue-panel\">",
    `${approvalPanel}      <section class="queue-panel">`,
  );
  assert.notEqual(nextIndex, indexHtml, "Workflow draft should update index.html");
  writeFileSync(indexPath, nextIndex, "utf8");

  writeFileSync(
    stylesPath,
    `${readFileSync(stylesPath, "utf8")}
.approval-panel { border: 1px solid #486071; border-radius: 8px; padding: 18px; background: rgba(71, 102, 119, 0.22); display: grid; gap: 14px; }
.approval-panel form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 10px; }
.approval-panel select, .approval-panel input { border: 1px solid #526171; border-radius: 8px; background: #111821; color: #f4f0e8; padding: 11px; }
.approval-panel button { border: 0; border-radius: 8px; background: #9fd3c7; color: #0f151b; padding: 11px 14px; font-weight: 700; }
#escalation-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
#escalation-list li { border-radius: 8px; background: #17222c; padding: 10px 12px; display: flex; justify-content: space-between; gap: 12px; }
`,
    "utf8",
  );

  const appJs = readFileSync(appPath, "utf8");
  const nextAppJs = appJs
    .replace(
      "const queueList = document.querySelector(\"#queue-list\");",
      `const queueList = document.querySelector("#queue-list");
const escalationForm = document.querySelector("#escalation-form");
const escalationJobSelect = escalationForm?.querySelector("select[name='jobId']");
const escalationOwnerInput = escalationForm?.querySelector("input[name='owner']");
const escalationList = document.querySelector("#escalation-list");`,
    )
    .replace(
      "renderJobs(data.jobs);",
      `renderJobs(data.jobs);
  renderEscalationOptions(data.jobs);
  await loadEscalations();`,
    )
    .replace(
      "function renderJobs(jobs) {",
      `async function loadEscalations() {
  const response = await fetch("/api/escalations");
  const data = await response.json();
  renderEscalations(data.escalations);
}

function renderEscalationOptions(jobs) {
  if (!escalationJobSelect) return;
  escalationJobSelect.innerHTML = jobs
    .filter((job) => job.status !== "done")
    .map((job) => \`<option value="\${job.id}">\${job.account}</option>\`)
    .join("");
}

function renderEscalations(escalations) {
  if (!escalationList) return;
  escalationList.innerHTML = escalations.length
    ? escalations
        .map((item) => \`<li><span>\${item.account}</span><strong>\${item.owner}</strong></li>\`)
        .join("")
    : "<li><span>No escalations yet</span><strong>Clear</strong></li>";
}

escalationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const jobId = escalationJobSelect?.value;
  const owner = escalationOwnerInput?.value.trim() || "Ops lead";
  if (!jobId) return;
  await fetch("/api/escalations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, owner }),
  });
  if (escalationOwnerInput) escalationOwnerInput.value = "";
  await loadEscalations();
});

function renderJobs(jobs) {`,
    );
  assert.notEqual(nextAppJs, appJs, "Workflow draft should update app.js");
  writeFileSync(appPath, nextAppJs, "utf8");

  const serverJs = readFileSync(serverPath, "utf8");
  const nextServerJs = serverJs.replace(
    "  if (request.method === \"POST\" && pathname.startsWith(\"/api/jobs/\") && pathname.endsWith(\"/complete\")) {",
    `  if (request.method === "GET" && pathname === "/api/escalations") {
    json(response, 200, { escalations: allEscalations() });
    return;
  }

  if (request.method === "POST" && pathname === "/api/escalations") {
    const body = await readJson(request);
    const escalation = createEscalation(body.jobId, String(body.owner || "Ops lead"));
    if (!escalation) {
      json(response, 404, { error: "Job not found" });
      return;
    }
    json(response, 201, { escalation });
    return;
  }

  if (request.method === "POST" && pathname.startsWith("/api/jobs/") && pathname.endsWith("/complete")) {`,
  );
  assert.notEqual(nextServerJs, serverJs, "Workflow draft should update server.js");
  writeFileSync(serverPath, nextServerJs, "utf8");

  return prepared;
}

async function seedDesktopState(cdp, args) {
  const state = desktopState(args);
  const serialized = JSON.stringify(state);
  const preload = await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { window.localStorage.setItem("codex.desktop.v1", ${JSON.stringify(
      serialized,
    )}); } catch (error) { console.error("P33 dogfood seed failed", error); }`,
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

function desktopState({
  projectPath,
  projectId,
  projectName,
  threadId,
  drafts = [],
  activeDraftId = null,
}) {
  return {
    version: 1,
    appServerUrl: "http://127.0.0.1:48889",
    projects: [
      {
        id: projectId,
        path: projectPath,
        name: projectName,
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
    featureDrafts: Object.fromEntries(drafts.map((draft) => [draft.draftId, draft])),
    featureDraftActiveIdsByThreadId: activeDraftId ? { [threadId]: activeDraftId } : {},
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

async function connectToElectron(port) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    const loggedBrowserUrl = devtoolsUrlFromLogs();
    if (loggedBrowserUrl) {
      try {
        const attached = await attachToFirstPage(new CdpClient(loggedBrowserUrl));
        if (attached) return attached;
      } catch {
        // keep waiting
      }
    }
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json`);
      connectTrace.push({ source: "json", count: Array.isArray(targets) ? targets.length : -1 });
      const target =
        targets.find(
          (candidate) =>
            (candidate.type === "page" || candidate.type === "webview") &&
            candidate.url?.startsWith(rendererUrl) &&
            candidate.webSocketDebuggerUrl,
        ) ?? null;
      if (target) {
        connectTrace.push({ source: "json-target", url: target.webSocketDebuggerUrl });
        return new CdpClient(target.webSocketDebuggerUrl);
      }
    } catch (error) {
      connectTrace.push({ source: "json-error", message: errorMessageForTrace(error) });
      // keep waiting
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
      // keep waiting
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
          candidate.url?.startsWith(rendererUrl),
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

function errorMessageForTrace(error) {
  return error instanceof Error ? error.message : String(error);
}

function cdpExceptionMessage(exceptionDetails) {
  return (
    exceptionDetails.exception?.description ||
    exceptionDetails.exception?.value ||
    exceptionDetails.text ||
    "Runtime evaluation failed"
  );
}

async function createThreadForProject(cdp, projectPath) {
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
            name: "p33_electron_dogfood",
            title: "P33 Electron Dogfood",
            version: "0.1.0",
          },
          capabilities: { experimentalApi: true, requestAttestation: false },
        });
        client.notify("initialized");
        const response = await client.request("thread/start", {
          cwd: projectPath,
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
  throw new Error(`Could not create dogfood thread: ${errorMessageForTrace(lastError)}`);
}

async function clickButton(cdp, { title, text }) {
  const started = Date.now();
  let target = null;
  while (Date.now() - started < 30_000) {
    target = await buttonTarget(cdp, { title, text });
    if (target) break;
    await delay(250);
  }
  if (!target) {
    const facts = await collectFacts(cdp);
    throw new Error(`Could not click button ${title || text}. Buttons: ${JSON.stringify(facts.buttons)}`);
  }
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: target.x,
    y: target.y,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: target.x,
    y: target.y,
    button: "left",
    clickCount: 1,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: target.x,
    y: target.y,
    button: "left",
    clickCount: 1,
  });
  await delay(150);
}

async function ensureCanvasButton(cdp, { title, text }, timeoutMs) {
  if (!(await hasButton(cdp, { title, text }))) {
    await clickButton(cdp, { title: "Open live preview" });
  }
  await waitForButton(cdp, { title, text }, timeoutMs);
}

async function hasButton(cdp, { title, text }) {
  const facts = await collectFacts(cdp);
  return facts.buttons.some((button) => {
    const titleMatch = title ? button.title === title : true;
    const textMatch = text ? button.text === text : true;
    return titleMatch && textMatch && !button.disabled;
  });
}

function buttonTarget(cdp, { title, text }) {
  return cdp.evaluate(
    `({ title, text }) => {
      const buttons = [...document.querySelectorAll("button")];
      const button = buttons.find((candidate) => {
        const titleMatch = title ? candidate.title === title : true;
        const textMatch = text ? candidate.textContent.trim() === text : true;
        const rect = candidate.getBoundingClientRect();
        const style = window.getComputedStyle(candidate);
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0";
        return titleMatch && textMatch && visible;
      });
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }`,
    { title, text },
  );
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

async function waitForButton(cdp, { title, text }, timeoutMs) {
  await waitFor(
    cdp,
    async () => {
      const facts = await collectFacts(cdp);
      return facts.buttons.some((button) => {
        const titleMatch = title ? button.title === title : true;
        const textMatch = text ? button.text === text : true;
        return titleMatch && textMatch && !button.disabled;
      });
    },
    timeoutMs,
  );
}

async function waitForDraftLifecycle(cdp, draftId, lifecycle, timeoutMs) {
  await waitFor(
    cdp,
    async () => {
      const state = await cdp.evaluate(
        "() => JSON.parse(localStorage.getItem('codex.desktop.v1') || '{}')",
      );
      return state.featureDrafts?.[draftId]?.lifecycle === lifecycle;
    },
    timeoutMs,
  );
}

async function waitForPreviewRunning(cdp, timeoutMs) {
  await waitFor(
    cdp,
    async () => {
      const facts = await collectFacts(cdp);
      return facts.buttons.some(
        (button) =>
          button.title === "Stop preview" ||
          button.title === "Open preview" ||
          button.text === "Stop" ||
          button.text === "Open",
      );
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

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return response.json();
}

async function sourceSnapshot(rootPath) {
  const files = {};
  await walk(rootPath, async (filePath, relativePath) => {
    if (relativePath.split(/[\\/]/).includes(".codex")) return;
    if (/\.sqlite(?:-(?:shm|wal))?$/i.test(relativePath)) return;
    const bytes = readFileSync(filePath);
    files[relativePath.replace(/\\/g, "/")] = crypto
      .createHash("sha256")
      .update(bytes)
      .digest("hex");
  });
  return files;
}

function workflowDatabaseSnapshot() {
  const dbPath = path.join(workflowProjectPath, "workflow.sqlite");
  assert.ok(existsSync(dbPath), "workflow preview should create workflow.sqlite");
  const db = new DatabaseSync(dbPath);
  try {
    const jobs = db
      .prepare("SELECT id, account, stage, status FROM jobs ORDER BY id")
      .all();
    const escalations = db
      .prepare(
        "SELECT e.id, e.job_id AS jobId, j.account, e.owner, e.status FROM escalations e JOIN jobs j ON j.id = e.job_id ORDER BY e.created_at DESC",
      )
      .all();
    return {
      path: dbPath,
      jobs,
      escalations,
    };
  } finally {
    db.close();
  }
}

async function walk(rootPath, visit, dirPath = rootPath) {
  if (!existsSync(dirPath)) return;
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, entryPath);
    if (entry.isDirectory()) {
      await walk(rootPath, visit, entryPath);
    } else if (entry.isFile()) {
      await visit(entryPath, relativePath);
    }
  }
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function writeSummary(value) {
  writeFileSync(
    path.join(evidenceDir, "summary.json"),
    `${JSON.stringify({ ...value, at: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
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

function resetInterfaceProject() {
  mkdirSync(interfaceProjectPath, { recursive: true });
  writeFileSync(
    path.join(interfaceProjectPath, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Northstar Desk</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="shell">
    <aside class="rail">
      <strong>Northstar</strong>
      <button>Dashboard</button>
      <button>Pipeline</button>
      <button>Reports</button>
    </aside>
    <section class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">Today</span>
          <h1>Sales workspace</h1>
        </div>
        <button class="primary">Add lead</button>
      </header>
      <section class="metrics">
        <article><span>Pipeline</span><strong>$428k</strong><em>+12%</em></article>
        <article><span>Qualified</span><strong>48</strong><em>+7</em></article>
        <article><span>At risk</span><strong>6</strong><em>review</em></article>
      </section>
      <section class="board">
        <article class="panel wide">
          <h2>Priority accounts</h2>
          <ul>
            <li><span>Acme Medical</span><b>Contract review</b></li>
            <li><span>Juniper Labs</span><b>Security call</b></li>
            <li><span>Canopy Foods</span><b>Renewal risk</b></li>
          </ul>
        </article>
        <article class="panel">
          <h2>Focus</h2>
          <p>Prep enterprise onboarding offer for Friday review.</p>
        </article>
      </section>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
    "utf8",
  );
  writeFileSync(
    path.join(interfaceProjectPath, "styles.css"),
    `:root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #111318; color: #f4f0e8; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top left, #263241, #111318 44%); }
button { font: inherit; }
.shell { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
.rail { padding: 28px; border-right: 1px solid #303743; display: flex; flex-direction: column; gap: 14px; background: rgba(17,19,24,.78); }
.rail strong { font-size: 22px; margin-bottom: 22px; }
.rail button { border: 0; border-radius: 8px; padding: 10px 12px; color: #d9e1ec; background: #202630; text-align: left; }
.workspace { padding: 34px; display: grid; gap: 24px; align-content: start; }
.topbar { display: flex; justify-content: space-between; align-items: center; }
.eyebrow { color: #8fb4d8; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 3px 0 0; font-size: 38px; }
.primary { border: 0; border-radius: 8px; background: #d8b15f; color: #171717; padding: 12px 18px; font-weight: 700; }
.metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.metrics article, .panel { border: 1px solid #343c49; border-radius: 8px; padding: 18px; background: rgba(25,29,37,.88); box-shadow: 0 22px 70px rgba(0,0,0,.22); }
.metrics span, .panel p { color: #aeb8c6; }
.metrics strong { display: block; margin-top: 8px; font-size: 30px; }
.metrics em { color: #a6d98b; font-style: normal; }
.board { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; }
.panel h2 { margin-top: 0; }
ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
li { display: flex; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 8px; background: #202630; }
`,
    "utf8",
  );
  writeFileSync(
    path.join(interfaceProjectPath, "app.js"),
    `document.querySelector(".primary")?.addEventListener("click", () => {
  document.querySelector(".panel p").textContent = "Lead capture opened.";
});
`,
    "utf8",
  );
}

function resetWorkflowProject() {
  const publicDir = path.join(workflowProjectPath, "public");
  mkdirSync(publicDir, { recursive: true });
  rmSync(path.join(workflowProjectPath, "workflow.sqlite"), { force: true });
  rmSync(path.join(workflowProjectPath, "workflow.sqlite-shm"), { force: true });
  rmSync(path.join(workflowProjectPath, "workflow.sqlite-wal"), { force: true });
  writeFileSync(
    path.join(workflowProjectPath, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        scripts: {
          start: "node server.js",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(workflowProjectPath, "server.js"),
    `const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const publicDir = path.join(__dirname, "public");
const db = new DatabaseSync(path.join(__dirname, "workflow.sqlite"));

db.exec(\`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    account TEXT NOT NULL,
    stage TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS escalations (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (job_id) REFERENCES jobs(id)
  );
\`);

if (db.prepare("SELECT COUNT(*) AS count FROM jobs").get().count === 0) {
  const insertJob = db.prepare(
    "INSERT INTO jobs (id, account, stage, status) VALUES (?, ?, ?, ?)",
  );
  insertJob.run("job-101", "Atlas Clinics", "Intake", "blocked");
  insertJob.run("job-102", "Boreal Bank", "Review", "ready");
  insertJob.run("job-103", "Cinder Labs", "Fulfillment", "ready");
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/api/jobs") {
    json(response, 200, { jobs: allJobs() });
    return;
  }

  if (request.method === "POST" && pathname.startsWith("/api/jobs/") && pathname.endsWith("/complete")) {
    const jobId = pathname.split("/")[3];
    const job = completeJob(jobId);
    if (!job) {
      json(response, 404, { error: "Job not found" });
      return;
    }
    json(response, 200, { job });
    return;
  }

  const filePath = safePublicPath(pathname === "/" ? "/index.html" : pathname);
  if (!filePath) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": mime(filePath) });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(Number(process.env.PORT || 4100), process.env.HOST || "127.0.0.1");

function allJobs() {
  return db
    .prepare("SELECT id, account, stage, status FROM jobs ORDER BY id")
    .all();
}

function findJob(jobId) {
  return db
    .prepare("SELECT id, account, stage, status FROM jobs WHERE id = ?")
    .get(jobId);
}

function completeJob(jobId) {
  if (!findJob(jobId)) return null;
  db.prepare("UPDATE jobs SET status = 'done' WHERE id = ?").run(jobId);
  return findJob(jobId);
}

function allEscalations() {
  return db
    .prepare(
      "SELECT e.id, e.job_id AS jobId, j.account, e.owner, e.status FROM escalations e JOIN jobs j ON j.id = e.job_id ORDER BY e.created_at DESC",
    )
    .all();
}

function createEscalation(jobId, owner) {
  const job = findJob(jobId);
  if (!job) return null;
  const id = \`esc-\${Date.now()}\`;
  db.prepare(
    "INSERT INTO escalations (id, job_id, owner, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
  ).run(id, job.id, owner, Date.now());
  return db
    .prepare(
      "SELECT e.id, e.job_id AS jobId, j.account, e.owner, e.status FROM escalations e JOIN jobs j ON j.id = e.job_id WHERE e.id = ?",
    )
    .get(id);
}

function safePublicPath(pathname) {
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) return null;
  return filePath;
}

function mime(filePath) {
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "text/html; charset=utf-8";
}

function json(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}
`,
    "utf8",
  );
  writeFileSync(
    path.join(publicDir, "index.html"),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Workflow Desk</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="workflow-shell">
    <header class="workflow-header">
      <div>
        <span class="eyebrow">Operations</span>
        <h1>Workflow desk</h1>
      </div>
      <strong id="queue-count">0 active</strong>
    </header>
    <section class="workflow-grid">
      <section class="queue-panel">
        <h2>Jobs</h2>
        <ul id="queue-list"></ul>
      </section>
      <aside class="activity-panel">
        <h2>Runbook</h2>
        <p>Review blocked jobs, complete ready jobs, and keep the queue moving.</p>
      </aside>
    </section>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
    "utf8",
  );
  writeFileSync(
    path.join(publicDir, "styles.css"),
    `:root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #101419; color: #f4f0e8; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #101419; }
.workflow-shell { min-height: 100vh; padding: 32px; display: grid; gap: 22px; align-content: start; }
.workflow-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #303b46; padding-bottom: 18px; }
.eyebrow { color: #9fd3c7; font-size: 12px; text-transform: uppercase; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 0; font-size: 36px; }
.workflow-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(280px, .8fr); gap: 18px; }
.queue-panel, .activity-panel { border: 1px solid #303b46; border-radius: 8px; padding: 18px; background: #151c24; }
#queue-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
#queue-list li { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px; border-radius: 8px; background: #1d2630; padding: 12px; }
#queue-list strong { display: block; }
#queue-list span { color: #aab6c3; }
#queue-list button { border: 0; border-radius: 8px; padding: 9px 11px; background: #d8b15f; color: #111318; font-weight: 700; }
.status { border-radius: 999px; padding: 5px 9px; background: #26313d; color: #d8e1ea; }
.status.blocked { background: #51313a; color: #ffd9df; }
.status.done { background: #254235; color: #bde7ca; }
`,
    "utf8",
  );
  writeFileSync(
    path.join(publicDir, "app.js"),
    `const queueList = document.querySelector("#queue-list");
const queueCount = document.querySelector("#queue-count");

async function loadJobs() {
  const response = await fetch("/api/jobs");
  const data = await response.json();
  renderJobs(data.jobs);
}

function renderJobs(jobs) {
  queueCount.textContent = \`\${jobs.filter((job) => job.status !== "done").length} active\`;
  queueList.innerHTML = jobs
    .map(
      (job) => \`<li>
        <div><strong>\${job.account}</strong><span>\${job.stage}</span></div>
        <em class="status \${job.status}">\${job.status}</em>
        <button data-complete="\${job.id}" \${job.status === "done" ? "disabled" : ""}>Complete</button>
      </li>\`,
    )
    .join("");
}

queueList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-complete]");
  if (!button) return;
  await fetch(\`/api/jobs/\${button.dataset.complete}/complete\`, { method: "POST" });
  await loadJobs();
});

loadJobs();
`,
    "utf8",
  );
}
