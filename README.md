# Codex Local Desktop

Codex Local Desktop is a local Electron app built on top of the Codex runtime. It is a workbench for opening a local project, chatting with Codex, reviewing file changes, managing approvals, and using a Live/Draft preview loop before source changes are promoted.

This repository is a product fork/workspace around Codex. The upstream Codex CLI and Rust app-server remain the runtime foundation; the desktop app adds the local project shell, preview workflow, and Canvas-oriented product layer.

## Current Status

- Desktop shell: implemented for local development.
- Live App Preview: implemented for runnable local projects.
- Draft workflow: implemented as the current preview-before-build path.
- Canvas proposal lanes: removed from the active product model; current visual work uses `Live` and `Draft`.
- Windows sidecar staging: implemented for development/release preparation.
- Unsigned Windows installer packaging: implemented for local release artifacts.

## What The App Does

- Opens local project folders.
- Keeps chats scoped to projects and threads.
- Streams Codex progress, commands, approvals, and file changes.
- Shows changed-file summaries and review entry points.
- Starts or connects to a local app preview.
- Lets the user mark Live/Draft preview areas as visual context.
- Creates source-safe Draft workspaces for reviewable UI/workflow changes.
- Applies a Draft to the real project only after an explicit build action.

## Repository Layout

- `apps/desktop/` - React/Electron desktop app.
- `apps/desktop/electron/` - Electron host, preview helpers, sidecar launch, and desktop IPC.
- `codex-rs/` - upstream Rust Codex runtime and app-server.
- `docs/` - durable product, architecture, and UI/UX direction for this desktop product.
- `plans/` - active and completed implementation plans.
- `scripts/` - focused verification, dogfood, and sidecar staging scripts.

## Prerequisites

- Windows for the current desktop sidecar staging path.
- Node.js 22 or newer.
- pnpm 10.33 or newer.
- Rust/Cargo for building the Codex sidecar.
- `rg.exe` available on `PATH` when staging the Windows sidecar.

## Run From Source

Install dependencies:

```powershell
pnpm install
```

Run the desktop app in development mode:

```powershell
npm --prefix apps/desktop run electron:dev
```

Build the desktop renderer:

```powershell
npm --prefix apps/desktop run build
```

Stage the Windows native sidecar and build the desktop renderer:

```powershell
npm --prefix apps/desktop run electron:build
```

Create an unpacked desktop app for local smoke testing:

```powershell
npm --prefix apps/desktop run electron:pack
```

Create an unsigned Windows installer:

```powershell
npm --prefix apps/desktop run electron:dist
```

`electron:build` stages the native sidecar under `apps/desktop/electron/resources/codex-sidecar` and builds the renderer. `electron:dist` runs that full sidecar stage before creating the installer, so the first run can be slow while Rust release binaries are rebuilt.

`electron:pack` reuses the already staged sidecar and creates an unpacked app for faster local smoke tests. After a successful `electron:build`, `electron:dist:staged` can rebuild the unsigned installer without rerunning the Rust sidecar stage. Packaging artifacts are written under `apps/desktop/release/`.

## Focused Verification

Useful checks while working on the current Live/Draft desktop path:

```powershell
git diff --check
npm --prefix apps/desktop run test:p34
npm --prefix apps/desktop run test:p35
npm --prefix apps/desktop run test:p36
npm --prefix apps/desktop run build
```

Broader product-flow changes should also run the relevant P33/P33b/P33c/P33d checks and Electron dogfood scripts documented in the plans.

## Release Readiness

Before publishing a first downloadable desktop release:

- replace development-only metadata and screenshots with public-facing material;
- add a real product icon and signed release certificate;
- verify the app from a clean clone;
- confirm the native sidecar is included in the package;
- decide on update strategy;
- add a release workflow that builds reproducible artifacts.

## License

This repository is licensed under the [Apache-2.0 License](LICENSE).
