#!/usr/bin/env node
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const appServerPort = process.env.P03_APP_SERVER_PORT ?? "48888";

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

const codexBin = join(repoRoot, "codex-rs", "target", "debug", "codex");
if (!existsSync(codexBin)) {
  throw new Error(`Missing built Codex binary at ${codexBin}`);
}

const codexHome = mkdtempSync(join(tmpdir(), "p03-desktop-codex-home-"));
const workspace = join(repoRoot, ".cache", "p03-desktop-demo-workspace");
mkdirSync(workspace, { recursive: true });
writeFileSync(join(workspace, "README.md"), "# P03 desktop demo\n");

const mockServer = await startMockResponsesServer();
writeMockConfig(codexHome, mockServer.url);

const appServer = spawn(
  codexBin,
  ["app-server", "--listen", `ws://127.0.0.1:${appServerPort}`],
  {
    cwd: codexHome,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      CODEX_HOME: codexHome,
      CODEX_APP_SERVER_MANAGED_CONFIG_PATH: join(
        codexHome,
        "managed_config.toml",
      ),
      RUST_LOG: "warn",
    },
  },
);

console.log(`P03 mock app-server listening at ws://127.0.0.1:${appServerPort}`);
console.log(`Demo project path: ${workspace}`);
console.log("Use Ctrl+C to stop.");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    appServer.kill();
    mockServer.close();
    process.exit(0);
  });
}

await new Promise((resolvePromise, reject) => {
  appServer.on("exit", (code) => {
    mockServer.close();
    if (code === 0) resolvePromise();
    reject(new Error(`app-server exited with code ${code}`));
  });
});

function startMockResponsesServer() {
  let requestCount = 0;
  let patchCount = 0;
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

    const phase = (requestCount - 1) % 4;
    if (phase === 0) {
      res.end(
        sse([
          evResponseCreated(`resp-command-${requestCount}`),
          evShellCommand(
            `call-command-${requestCount}`,
            "printf 'hello from the P03 desktop mock app-server\\n'",
          ),
          evCompleted(`resp-command-${requestCount}`),
        ]),
      );
      return;
    }

    if (phase === 1) {
      res.end(
        sse([
          evResponseCreated(`resp-command-final-${requestCount}`),
          evAssistantMessage(
            `msg-command-final-${requestCount}`,
            "I ran a demo command. Send another prompt to see a reviewable file edit.",
          ),
          evCompleted(`resp-command-final-${requestCount}`),
        ]),
      );
      return;
    }

    if (phase === 2) {
      patchCount += 1;
      res.end(
        sse([
          evResponseCreated(`resp-file-change-${requestCount}`),
          evApplyPatchCustomToolCall(
            `call-file-change-${requestCount}`,
            `*** Begin Patch\n*** Add File: p03-demo-${patchCount}.txt\n+Demo file change ${patchCount}\n*** End Patch\n`,
          ),
          evCompleted(`resp-file-change-${requestCount}`),
        ]),
      );
      return;
    }

    res.end(
      sse([
        evResponseCreated(`resp-file-change-final-${requestCount}`),
        evAssistantMessage(
          `msg-file-change-final-${requestCount}`,
          "I created a demo file change you can inspect in the file review surface.",
        ),
        evCompleted(`resp-file-change-final-${requestCount}`),
      ]),
    );
  });

  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolvePromise({
        url: `http://127.0.0.1:${address.port}`,
        close: () => server.close(),
      });
    });
  });
}

function writeMockConfig(home, serverUrl) {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "config.toml"),
    `
model = "mock-model"
approval_policy = "never"
sandbox_mode = "danger-full-access"
model_provider = "mock_provider"

[model_providers.mock_provider]
name = "Mock provider for P03 desktop"
base_url = "${serverUrl}/v1"
wire_api = "responses"
request_max_retries = 0
stream_max_retries = 0
supports_websockets = false
`,
  );
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
