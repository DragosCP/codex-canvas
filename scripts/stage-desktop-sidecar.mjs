#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const codexRs = join(repoRoot, "codex-rs");
const targetRelease = join(codexRs, "target", "release");
const resourceSidecar = join(
  repoRoot,
  "apps",
  "desktop",
  "electron",
  "resources",
  "codex-sidecar",
);

if (process.platform !== "win32") {
  throw new Error(
    "The desktop sidecar staging script currently targets Windows packages only.",
  );
}

run("cargo", [
  "build",
  "--manifest-path",
  join(codexRs, "Cargo.toml"),
  "-p",
  "codex-cli",
  "--bin",
  "codex",
  "--release",
]);
run("cargo", [
  "build",
  "--manifest-path",
  join(codexRs, "Cargo.toml"),
  "-p",
  "codex-windows-sandbox",
  "--bin",
  "codex-command-runner",
  "--bin",
  "codex-windows-sandbox-setup",
  "--release",
]);

stageSidecar(resourceSidecar);

console.log(`Staged desktop sidecar at ${resourceSidecar}`);

function stageSidecar(destination) {
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(join(destination, "codex-resources"), { recursive: true });
  writeFileSync(join(destination, ".gitkeep"), "");

  copyRequired(
    join(targetRelease, "codex.exe"),
    join(destination, "codex.exe"),
  );
  copyRequired(
    join(targetRelease, "codex-command-runner.exe"),
    join(destination, "codex-resources", "codex-command-runner.exe"),
  );
  copyRequired(
    join(targetRelease, "codex-windows-sandbox-setup.exe"),
    join(destination, "codex-resources", "codex-windows-sandbox-setup.exe"),
  );
  copyRequired(
    findOnPath("rg.exe"),
    join(destination, "codex-resources", "rg.exe"),
  );
}

function copyRequired(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing required sidecar file: ${from}`);
  }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

function findOnPath(executable) {
  for (const entry of (process.env.PATH ?? "").split(";")) {
    const candidate = join(entry, executable);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find ${executable} on PATH.`);
}

function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}
