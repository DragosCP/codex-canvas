#!/usr/bin/env node
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");

if (process.platform === "win32") {
  const wslScript = wslpath(scriptPath);
  const wslRepo = wslpath(repoRoot);
  const result = spawnSync(
    "wsl.exe",
    [
      "-d",
      "Ubuntu",
      "--",
      "bash",
      "-lc",
      `cd ${sh(wslRepo)} && node ${sh(wslScript)}`,
    ],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

async function main() {
  const codexBin = join(repoRoot, "codex-rs", "target", "debug", "codex");
  if (!existsSync(codexBin)) {
    throw new Error(`Missing built Codex binary at ${codexBin}`);
  }

  const codexHome = mkdtempSync(join(tmpdir(), "p03-codex-home-"));
  const workspace = join(repoRoot, ".cache", `p03-backend-proof-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  prepareGitWorkspace(workspace);
  const mockServer = await startMockResponsesServer();
  const sandboxMode = process.env.P03_SANDBOX_MODE ?? "danger-full-access";
  writeMockConfig(codexHome, mockServer.url, sandboxMode);

  const appServer = spawn(codexBin, ["app-server"], {
    cwd: codexHome,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CODEX_APP_SERVER_MANAGED_CONFIG_PATH: join(
        codexHome,
        "managed_config.toml",
      ),
      RUST_LOG: "warn",
    },
  });

  appServer.stderr.setEncoding("utf8");
  appServer.stderr.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
      console.error(`[app-server] ${line}`);
    }
  });

  const client = new JsonlRpcClient(appServer);
  try {
    const observed = {
      assistant: false,
      command: false,
      fileChange: false,
      cancelled: false,
    };
    client.onMessage = (message) => {
      const encoded = JSON.stringify(message);
      if (encoded.includes("agentMessage")) observed.assistant = true;
      if (encoded.includes("commandExecution")) observed.command = true;
      if (
        encoded.includes("fileChange") ||
        message.method === "turn/diff/updated" ||
        message.method === "fs/changed"
      ) {
        observed.fileChange = true;
      }
      if (
        message.method === "p03/cancelled" ||
        (message.method === "turn/completed" &&
          message.params?.turn?.status === "interrupted")
      ) {
        observed.cancelled = true;
      }
    };

    const initialize = await client.request("initialize", {
      clientInfo: {
        name: "p03_desktop_proof_gate",
        title: "P03 Desktop Proof Gate",
        version: "0.1.0",
      },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    client.notify("initialized");

    await client.request("config/read", {
      includeLayers: false,
      cwd: workspace,
    });
    await client.request("model/list", { includeHidden: true });
    await client.request("account/read", { refreshToken: false });

    const started = await client.request("thread/start", {
      cwd: workspace,
      approvalPolicy: "never",
      sandbox: sandboxMode,
      threadSource: "user",
    });
    const threadId = started.thread.id;

    await client.request("thread/list", { limit: 20, cwd: workspace });
    await client.request("thread/read", { threadId, includeTurns: false });
    await client.request("fs/watch", {
      watchId: "p03-proof-workspace",
      path: workspace,
    });

    await runCommandTurn(client, threadId);
    await runFileChangeTurn(client, threadId);
    if (!observed.fileChange) {
      try {
        await client.waitFor(
          (message) =>
            message.method === "fs/changed" ||
            message.method === "turn/diff/updated" ||
            message.method === "item/fileChange/patchUpdated" ||
            (message.method === "item/completed" &&
              JSON.stringify(message).includes("fileChange")),
          5_000,
        );
      } catch (error) {
        throw new Error(
          [
            "file-change proof was not observed",
            `commandItemObserved=${observed.command}`,
            `commandFileExists=${existsSync(join(workspace, "p03-command.txt"))}`,
            `reviewFileExists=${existsSync(join(workspace, "p03-review.txt"))}`,
            `sandboxMode=${sandboxMode}`,
            "A raw command may edit files without producing Codex review events; the desktop gate needs item/fileChange, turn/diff, or fs/changed notifications.",
            `Original wait error: ${error.message}`,
          ].join("; "),
        );
      }
    }
    await client.request("thread/read", { threadId, includeTurns: true });
    await runCancellationTurn(client, threadId);

    assert(observed.assistant, "assistant stream event was not observed");
    assert(observed.command, "command execution item was not observed");
    assert(
      observed.fileChange,
      "file change or turn diff event was not observed",
    );
    assert(observed.cancelled, "cancelled turn completion was not observed");
    assert(
      existsSync(join(workspace, "p03-command.txt")),
      "proof file was not created by the agent command",
    );
    assert(
      existsSync(join(workspace, "p03-review.txt")),
      "review file was not created by apply_patch",
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          codexHome,
          workspace,
          sandboxMode,
          platform: initialize.platformOs ?? initialize.platformFamily,
          threadId,
          responsesRequests: mockServer.requestCount(),
          observed,
        },
        null,
        2,
      ),
    );
  } finally {
    client.close();
    mockServer.close();
  }
}

async function runCommandTurn(client, threadId) {
  const turn = await client.request("turn/start", {
    threadId,
    input: [
      {
        type: "text",
        text: "Create p03-command.txt with a shell command, then say done.",
        text_elements: [],
      },
    ],
  });
  await client.waitFor(
    (message) =>
      message.method === "turn/completed" &&
      message.params?.turn?.id === turn.turn.id,
    30_000,
  );
}

async function runFileChangeTurn(client, threadId) {
  const turn = await client.request("turn/start", {
    threadId,
    input: [
      {
        type: "text",
        text: "Create p03-review.txt with apply_patch, then say done.",
        text_elements: [],
      },
    ],
  });
  await client.waitFor(
    (message) =>
      message.method === "turn/completed" &&
      message.params?.turn?.id === turn.turn.id,
    30_000,
  );
}

async function runCancellationTurn(client, threadId) {
  const turn = await client.request("turn/start", {
    threadId,
    input: [
      {
        type: "text",
        text: "Start a long response so the client can cancel it.",
        text_elements: [],
      },
    ],
  });
  await client.waitFor(
    (message) =>
      message.method === "turn/started" &&
      message.params?.turn?.id === turn.turn.id,
    10_000,
  );
  await client.request("turn/interrupt", { threadId, turnId: turn.turn.id });
  await client.waitFor((message) => {
    const isTarget =
      message.method === "turn/completed" &&
      message.params?.turn?.id === turn.turn.id;
    if (isTarget && message.params?.turn?.status === "interrupted") {
      client.onMessage?.({ method: "p03/cancelled" });
      return true;
    }
    return false;
  }, 30_000);
}

function startMockResponsesServer() {
  let requestCount = 0;
  const server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.includes("/v1/responses")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    requestCount += 1;
    req.resume();
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    });

    if (requestCount === 1) {
      res.end(
        sse([
          evResponseCreated("resp-command"),
          evShellCommand(
            "call-command",
            "printf 'proof from P03 backend gate\\n' > p03-command.txt",
          ),
          evCompleted("resp-command"),
        ]),
      );
      return;
    }

    if (requestCount === 2) {
      res.end(
        sse([
          evResponseCreated("resp-command-final"),
          evAssistantMessage(
            "msg-command-final",
            "P03 command proof file created.",
          ),
          evCompleted("resp-command-final"),
        ]),
      );
      return;
    }

    if (requestCount === 3) {
      res.end(
        sse([
          evResponseCreated("resp-file-change"),
          evApplyPatchCustomToolCall(
            "call-file-change",
            "*** Begin Patch\n*** Add File: p03-review.txt\n+proof from P03 backend gate\n*** End Patch\n",
          ),
          evCompleted("resp-file-change"),
        ]),
      );
      return;
    }

    if (requestCount === 4) {
      res.end(
        sse([
          evResponseCreated("resp-file-change-final"),
          evAssistantMessage(
            "msg-file-change-final",
            "P03 review proof file created.",
          ),
          evCompleted("resp-file-change-final"),
        ]),
      );
      return;
    }

    res.write(sse([evResponseCreated("resp-cancellable")]));
    const keepAlive = setInterval(() => {
      res.write(": keep-alive\n\n");
    }, 250);
    req.on("close", () => {
      clearInterval(keepAlive);
      res.end();
    });
  });

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${address.port}`,
        requestCount: () => requestCount,
        close: () => server.close(),
      });
    });
  });
}

function writeMockConfig(home, serverUrl, sandboxMode) {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "config.toml"),
    `
model = "mock-model"
approval_policy = "never"
sandbox_mode = "${sandboxMode}"
model_provider = "mock_provider"

[model_providers.mock_provider]
name = "Mock provider for P03 proof gate"
base_url = "${serverUrl}/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
supports_websockets = false
`,
  );
}

function prepareGitWorkspace(workspace) {
  writeFileSync(join(workspace, "p03-proof.txt"), "before P03 backend gate\n");
  run("git", ["init"], workspace);
  run("git", ["config", "user.email", "p03-proof@example.invalid"], workspace);
  run("git", ["config", "user.name", "P03 Proof Gate"], workspace);
  run("git", ["add", "p03-proof.txt"], workspace);
  run("git", ["commit", "-m", "seed proof file"], workspace);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  }
}

class JsonlRpcClient {
  constructor(child) {
    this.child = child;
    this.nextId = 0;
    this.pending = new Map();
    this.waiters = [];
    this.onMessage = null;

    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!line.trim()) return;
      const message = JSON.parse(line);
      this.onMessage?.(message);
      if ("id" in message && this.pending.has(message.id)) {
        const { resolve: resolvePending, reject } = this.pending.get(
          message.id,
        );
        this.pending.delete(message.id);
        if (message.error) {
          reject(
            new Error(
              `${message.error.message}: ${JSON.stringify(message.error)}`,
            ),
          );
        } else {
          resolvePending(message.result);
        }
      }
      this.waiters = this.waiters.filter((waiter) => {
        if (!waiter.predicate(message)) return true;
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return false;
      });
    });

    child.on("exit", (code, signal) => {
      const err = new Error(
        `app-server exited with code ${code} signal ${signal}`,
      );
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
      for (const waiter of this.waiters) {
        clearTimeout(waiter.timer);
        waiter.reject(err);
      }
      this.waiters = [];
    });
  }

  request(method, params) {
    const id = this.nextId++;
    this.write({ id, method, params });
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
    });
  }

  notify(method, params) {
    this.write(params === undefined ? { method } : { method, params });
  }

  waitFor(predicate, timeoutMs) {
    return new Promise((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timer !== timer);
        reject(
          new Error(
            `timed out waiting for app-server message after ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      this.waiters.push({ predicate, resolve: resolvePromise, reject, timer });
    });
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }

  write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
}

function sse(events) {
  return events
    .map((event) => {
      const body = [`event: ${event.type}`];
      if (Object.keys(event).length > 1)
        body.push(`data: ${JSON.stringify(event)}`);
      return `${body.join("\n")}\n\n`;
    })
    .join("");
}

function evResponseCreated(id) {
  return { type: "response.created", response: { id } };
}

function evCompleted(id) {
  return {
    type: "response.completed",
    response: {
      id,
      usage: {
        input_tokens: 0,
        input_tokens_details: null,
        output_tokens: 0,
        output_tokens_details: null,
        total_tokens: 0,
      },
    },
  };
}

function evAssistantMessage(id, text) {
  return {
    type: "response.output_item.done",
    item: {
      type: "message",
      role: "assistant",
      id,
      content: [{ type: "output_text", text }],
    },
  };
}

function evShellCommand(callId, command) {
  return {
    type: "response.output_item.done",
    item: {
      type: "function_call",
      call_id: callId,
      name: "shell_command",
      arguments: JSON.stringify({ command }),
    },
  };
}

function evApplyPatchCustomToolCall(callId, patch) {
  return {
    type: "response.output_item.done",
    item: {
      type: "custom_tool_call",
      call_id: callId,
      name: "apply_patch",
      input: patch,
    },
  };
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

function wslpath(path) {
  const windowsPath = path.replaceAll("\\", "/");
  const result = spawnSync(
    "wsl.exe",
    ["-d", "Ubuntu", "--", "wslpath", "-a", windowsPath],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `wslpath failed for ${path}`);
  }
  return result.stdout.trim();
}

function sh(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

await main();
