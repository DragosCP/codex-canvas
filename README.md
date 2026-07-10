# Codex Canvas

Codex Canvas is an experimental desktop workbench for builders who use coding agents to make apps. It keeps the familiar Codex-style chat and local project workflow, then adds a visual app preview and "Draft" direction via "Canvas": preview the user experience of a new feature inside the real app before committing to backend, database, API, or infrastructure changes.

This project is not an official OpenAI product. It is a product fork/workspace built around the open-source Codex runtime and an Electron desktop shell.

## Download

Windows prerelease installer:

[Download Codex Local 0.1.0 for Windows](https://github.com/dragosCP/codex-canvas/releases/download/v0.1.0/Codex.Local-0.1.0-win-x64.exe)

Release page:

[Codex Local 0.1.0](https://github.com/dragosCP/codex-canvas/releases/tag/v0.1.0)

The current installer is unsigned, so Windows may show a SmartScreen warning. Until the repository is public, only GitHub users with access to this repository can download the release asset.

## Why This Exists

Agentic coding is powerful, but feature planning can become too abstract. A builder may spend a long conversation explaining product behavior, edge cases, screens, and workflow details, then accept a long plan that is hard to fully evaluate. If the agent builds the wrong UX first, fixing it later can create messy backend routes, temporary debug logic, duplicated flows, and hard-to-remove code.

Codex Local is exploring a different workflow: make the next feature visible before making it real.

The product direction is "Draft" mode:

- ask for a feature;
- let the agent create the UI and workflow first;
- preview it inside the real local app context;
- refine the user experience while it is still cheap to change;
- approve or discard the draft;
- only then convert it into real implementation work.

## What It Does Today

- Opens local project folders in a desktop app.
- Keeps chats scoped to projects and threads.
- Streams Codex progress, commands, approvals, and file changes.
- Shows changed-file summaries and review entry points.
- Starts or connects to a local app preview.
- Lets the user mark areas in Live/Draft previews as visual context.
- Creates Draft workspaces for reviewable UI/workflow changes before source changes are promoted.
- Packages as an unsigned Windows Electron installer.

## How It Is Different From Plain Codex

Plain Codex is centered on the agent conversation, terminal work, approvals, and source edits.

Codex Local keeps that foundation, but aims to add a builder-facing canvas around it:

- **Live preview**: see the running app while talking to the agent.
- **Draft preview**: explore the next feature as a temporary UI/workflow before real implementation.
- **Visual context**: mark parts of the app so the agent and builder refer to the same screen areas.
- **Draft-to-build path**: use the approved draft as a bridge into real source changes.
- **Future tagging direction**: create a shared project vocabulary for screens, panels, buttons, and flows so prompts and plans use the builder's language.

## Draft Mode

Draft mode is the main product idea.

In Draft mode, the agent should create the visible experience of a feature without immediately committing to production backend work. It can use fake data, local state, temporary UI, fixture objects, and structured draft notes. The goal is not to fake production. The goal is to let the builder feel the workflow before the app pays the cost of real implementation.

Draft mode should help avoid:

- long plans that are hard to read;
- UX mistakes discovered only after backend work is done;
- repeated back-and-forth implementation churn;
- temporary backend routes and debug panels that become permanent;
- hard-to-discard work when the first implementation direction is wrong.

## Status

This is an early prerelease. The desktop shell, local project workflow, Live preview, visual marking, Draft workspace path, and Windows packaging are in place. The broader Draft product direction is still being shaped and hardened.

Not done yet:

- signed installer;
- automatic updates;
- polished product icon;
- public release workflow;
- complete Draft contract for every app type;
- the future tagging/vocabulary system.

## Build From Source

Requirements:

- Windows for the current packaged desktop path;
- Node.js 22 or newer;
- pnpm 10.33 or newer;
- Rust/Cargo for building the native Codex sidecar;
- `rg.exe` on `PATH` when staging the Windows sidecar.

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

Create an unpacked desktop app using the already staged sidecar:

```powershell
npm --prefix apps/desktop run electron:pack
```

Create an unsigned Windows installer from already staged sidecar binaries:

```powershell
npm --prefix apps/desktop run electron:dist:staged
```

Run the full sidecar stage and installer build:

```powershell
npm --prefix apps/desktop run electron:dist
```

The full sidecar stage can be slow because it rebuilds Rust release binaries.

## License

This repository is licensed under the [Apache-2.0 License](LICENSE).
