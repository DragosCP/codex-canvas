#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, get } from "node:http";
import { connect as connectTcp } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const appServerPort = process.env.P03_REAL_APP_SERVER_PORT ?? "48889";
const bridgePort = process.env.P03_REAL_BRIDGE_PORT ?? "48890";
const bridgeHost = process.env.P03_REAL_BRIDGE_HOST ?? "0.0.0.0";
const appServerUrl = `ws://127.0.0.1:${appServerPort}`;
const bridgeUrl = `ws://127.0.0.1:${bridgePort}`;

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

let appServer = null;
if (await readyz(appServerPort)) {
  console.log(`Using existing real WSL app-server at ${appServerUrl}`);
} else {
  appServer = spawn(codexBin, ["app-server", "--listen", appServerUrl], {
    cwd: repoRoot,
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      RUST_LOG: process.env.RUST_LOG ?? "warn",
    },
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    appServer?.kill();
    process.exit(0);
  });
}

await waitForReady(appServerPort);
const bridgeServer = await startWebSocketBridge(bridgePort, appServerPort);

console.log(`P03 real WSL app-server listening at ${appServerUrl}`);
console.log(`P03 browser dev bridge listening at ${bridgeUrl}`);
console.log("Runtime: real WSL app-server using the WSL Codex home/config.");
console.log(
  "Project paths for this dev mode must be WSL paths such as /mnt/c/...",
);
console.log(
  "Bridge note: this dev-only bridge strips browser Origin headers; packaged desktop should use a native local bridge instead.",
);
console.log("Use Ctrl+C to stop.");

if (appServer) {
  await new Promise((resolvePromise, reject) => {
    appServer.on("exit", (code) => {
      bridgeServer.close();
      if (code === 0) resolvePromise();
      reject(new Error(`app-server exited with code ${code}`));
    });
  });
} else {
  await new Promise(() => {});
}

async function waitForReady(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await readyz(port)) return;
    await wait(250);
  }
  throw new Error(`app-server did not become ready on 127.0.0.1:${port}`);
}

function readyz(port) {
  return new Promise((resolvePromise) => {
    const request = get(`http://127.0.0.1:${port}/readyz`, (response) => {
      response.resume();
      resolvePromise(response.statusCode === 200);
    });
    request.on("error", () => resolvePromise(false));
    request.setTimeout(500, () => {
      request.destroy();
      resolvePromise(false);
    });
  });
}

function startWebSocketBridge(port, targetPort) {
  const server = createServer(async (req, res) => {
    if (req.url === "/readyz") {
      res.statusCode = (await readyz(targetPort)) ? 200 : 503;
      res.end(res.statusCode === 200 ? "ok" : "not ready");
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  server.on("upgrade", (req, socket, head) => {
    const upstream = connectTcp(Number(targetPort), "127.0.0.1");
    upstream.on("connect", () => {
      const lines = [`GET ${req.url} HTTP/${req.httpVersion}`];
      for (const [name, value] of Object.entries(req.headers)) {
        if (name.toLowerCase() === "origin") continue;
        if (Array.isArray(value)) {
          for (const item of value) lines.push(`${name}: ${item}`);
        } else if (value !== undefined) {
          lines.push(`${name}: ${value}`);
        }
      }
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  return new Promise((resolvePromise) => {
    server.listen(Number(port), bridgeHost, () => resolvePromise(server));
  });
}

function wait(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
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
