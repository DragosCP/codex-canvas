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
  if (await readyz(bridgePort)) {
    console.log(`Using existing Windows bridge at ${bridgeUrl}`);
    while (await readyz(bridgePort)) {
      await wait(1000);
    }
    console.log("Existing Windows bridge stopped; starting a managed bridge.");
  }

  const wslProcess = spawn(
    "wsl.exe",
    [
      "-d",
      "Ubuntu",
      "--",
      "bash",
      "-lc",
      `cd ${sh(wslRepo)} && node ${sh(wslScript)}`,
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        P03_REAL_BRIDGE_HOST: "0.0.0.0",
      },
    },
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      wslProcess.kill();
      process.exit(0);
    });
  }

  const wslBridgeHost = await waitForWslBridgeHost(bridgePort);
  const windowsBridgeServer = await startWebSocketBridge(
    bridgePort,
    bridgePort,
    wslBridgeHost,
    "127.0.0.1",
  );

  console.log(`P03 WSL bridge reachable at ws://${wslBridgeHost}:${bridgePort}`);
  console.log(`P03 Windows desktop bridge listening at ${bridgeUrl}`);
  console.log("Use Ctrl+C to stop.");

  wslProcess.on("exit", (code) => {
    console.log(`WSL app-server helper exited with code ${code}; keeping Windows bridge alive.`);
  });

  keepAlive();
  await waitForever();
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
let bridgeServer = null;
if (await readyz(bridgePort)) {
  console.log(`Using existing real WSL browser bridge at ${bridgeUrl}`);
} else {
  bridgeServer = await startWebSocketBridge(bridgePort, appServerPort);
}

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
      bridgeServer?.close();
      if (code === 0) resolvePromise();
      reject(new Error(`app-server exited with code ${code}`));
    });
  });
} else {
  keepAlive();
}

async function waitForReady(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await readyz(port)) return;
    await wait(250);
  }
  throw new Error(`app-server did not become ready on 127.0.0.1:${port}`);
}

function readyz(port, host = "127.0.0.1") {
  return new Promise((resolvePromise) => {
    const request = get(`http://${host}:${port}/readyz`, (response) => {
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

function startWebSocketBridge(
  port,
  targetPort,
  targetHost = "127.0.0.1",
  listenHost = bridgeHost,
) {
  const server = createServer(async (req, res) => {
    if (req.url === "/readyz") {
      res.statusCode = (await readyz(targetPort, targetHost)) ? 200 : 503;
      res.end(res.statusCode === 200 ? "ok" : "not ready");
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  server.on("upgrade", (req, socket, head) => {
    const upstream = connectTcp(Number(targetPort), targetHost);
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
    server.listen(Number(port), listenHost, () => resolvePromise(server));
  });
}

async function waitForWslBridgeHost(port) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const host = wslHost();
    if (host && (await readyz(port, host))) return host;
    await wait(250);
  }
  throw new Error(`WSL bridge did not become reachable from Windows on port ${port}`);
}

function wslHost() {
  const result = spawnSync("wsl.exe", ["-d", "Ubuntu", "--", "hostname", "-I"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return (
    result.stdout
      .trim()
      .split(/\s+/)
      .find((address) => /^\d+\.\d+\.\d+\.\d+$/.test(address)) ?? null
  );
}

function wait(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function keepAlive() {
  setInterval(() => {}, 2 ** 30);
}

function waitForever() {
  return new Promise(() => {});
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
