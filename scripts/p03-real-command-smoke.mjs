#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const appServerPort = process.env.P03_REAL_APP_SERVER_PORT ?? "48889";
const appServerUrl = `ws://127.0.0.1:${appServerPort}`;

if (process.platform === "win32") {
  const wslRepo = wslpath(repoRoot);
  const result = spawnSync(
    "wsl.exe",
    [
      "-d",
      "Ubuntu",
      "--",
      "bash",
      "-lc",
      `cd ${sh(wslRepo)} && node ${sh(wslpath(scriptPath))}`,
    ],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

class JsonRpcWebSocketClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined && message.method) {
        this.answerServerRequest(message);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error(`Unable to connect to ${url}`)),
        { once: true },
      );
    });
    return new JsonRpcWebSocketClient(socket);
  }

  request(method, params) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
    });
  }

  notify(method, params) {
    this.socket.send(
      JSON.stringify(params === undefined ? { method } : { method, params }),
    );
  }

  close() {
    this.socket.close();
  }

  answerServerRequest(message) {
    if (message.method === "item/commandExecution/requestApproval") {
      this.socket.send(
        JSON.stringify({ id: message.id, result: { decision: "accept" } }),
      );
      return;
    }
    if (message.method === "item/permissions/requestApproval") {
      this.socket.send(
        JSON.stringify({
          id: message.id,
          result: {
            permissions: message.params?.permissions ?? {},
            scope: "turn",
          },
        }),
      );
      return;
    }
    this.socket.send(
      JSON.stringify({
        id: message.id,
        error: { code: -32000, message: "unsupported smoke request" },
      }),
    );
  }
}

const client = await JsonRpcWebSocketClient.connect(appServerUrl);
try {
  await client.request("initialize", {
    clientInfo: {
      name: "p03_real_command_smoke",
      title: "P03 Real Command Smoke",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: true, requestAttestation: false },
  });
  client.notify("initialized");
  const response = await client.request("command/exec", {
    command: ["bash", "-lc", "pwd && command -v rg && rg --version | head -1"],
    cwd: repoRoot,
    timeoutMs: 10000,
    sandboxPolicy: { type: "dangerFullAccess" },
  });
  console.log(JSON.stringify({ ok: true, appServerUrl, response }, null, 2));
} finally {
  client.close();
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
  if (result.status !== 0)
    throw new Error(result.stderr || `wslpath failed for ${path}`);
  return result.stdout.trim();
}

function sh(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
