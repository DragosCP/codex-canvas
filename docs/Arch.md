# Backend Architecture Map

## Desktop Runtime Boundary

- The desktop app should use `codex-rs/app-server` as the Codex runtime boundary and must not create a parallel agent runtime.
- `codex-rs/app-server-protocol` defines the contract for threads, turns, streamed items, permissions, filesystem operations, config, models, account, review, plugins, apps, and MCP surfaces.
- Desktop-owned state should stay product-facing: project metadata, pinned folders, display names, ordering, hidden/archived projects, last active thread, inspector selection, panel layout, recent composer/settings choices, and project Canvas snapshots.
- App-server-owned state remains runtime-facing: threads, turns, transcript persistence, tools, command execution, file changes, approvals, sandboxing, review events, and model/config/account reads.

## Project Canvas

- The existing coordinate-based Project Canvas is desktop-owned project planning state. It remains implemented infrastructure, but it is not the desired future UX for visual planning against a running app.
- Canvas state is desktop-owned local project state for now. It stores stable internal item IDs, user-facing reference codes, names, pages, sub-pages, coordinates, dimensions, z-order, state, lock/visibility, comments, groups, and interaction previews.
- Raw `xywh` canvas units remain the source of truth. Snapshots also serialize resolved `bounds`, visible-grid `grid` coordinates, and proportional `norm` coordinates.
- The proposal parser in `apps/desktop/src/canvasProposal.ts` accepts compact `canvas-proposal` lines with `xywh=...`, `grid=...`, or `norm=...` rectangles and resolves them back into canvas units.
- Interaction-frame lines such as `interaction trigger=T1 frame=2 target=C5 xywh=120,64,168,56 sticky=true` mutate draft `interactionPreviews`, not accepted Canvas memory unless the user later applies or updates Canvas.

## Legacy Canvas Drafts And Plan Mode

- Project Canvas is durable project memory for the existing coordinate-based Canvas implementation. Draft overlays are temporary plan/chat proposal data shown on top of Project Canvas.
- Plan proposals store a base Canvas snapshot, draft proposal snapshot, parse status, change count, summary/errors, user-edit timestamp, and optional `canvasUpdatedAt`.
- `Accept plan` is an implementation decision. It must not automatically save draft Canvas data into durable project memory.
- Normal Canvas-only `Apply` can commit a generated or explicit Canvas suggestion. Post-implementation `Update Canvas` may promote useful visual results into project memory.
- Historical proposal snapshots reopen read-only by default. `Edit draft` copies one into a new active draft overlay.
- Draft deltas should be summarized only when the user submits a decision or explicit handoff, not after every drag/resize.

## Live App Plan Preview

- Live App Plan Preview is the future visual planning direction: the running app is the review surface, and proposed UI is temporarily injected into that app.
- Do not model this as a separate global `UI mode`. Plan Mode remains the permission state; preview sessions are visual context attached to a plan/chat/project.
- Live app preview is available from normal chat as well as Plan Mode. A user can open the app preview, draw an area mark, and continue chatting without first typing `@Canvas`, `@Preview`, or enabling Plan Mode.
- The preview host is desktop-owned UI/runtime state. It must not create a parallel agent runtime or bypass `codex-rs/app-server` for Codex work.
- Preview state should include project ID, URL, route label, viewport, status, error, updated timestamp, and cleanup/reset status.
- Plan preview state should include one to three preview variants, active variant ID, current temporary interaction state, route, viewport, screenshot reference, and optional area mark.
- Preview variants are temporary specs, not branches, builds, or code implementations. The host should load one real app preview and swap the selected injected variant.
- Area marks are temporary context: screenshot bounds, route, viewport, user instruction, and timestamp. They are not durable Canvas geometry.
- When an area mark is created outside a pending plan, the desktop should attach a compact composer context chip automatically. The next user message should include the mark context; removing the chip drops that mark from the send context.
- Prefer semantic placement anchors over exact DOM selectors: visible text, accessibility role/name, route region, or user-marked area.
- Raw DOM selectors, component guesses, or source hints are implementation aids only. They should not become the primary product model or user-facing truth.
- If injection is unsafe or impossible for a project, fall back to screenshot marking plus plan text.

## Generated Interface Drafts

- The empty/fresh Canvas bootstrap uses normal `canvasSuggestions`, not Plan Mode.
- The generator asks Codex for current-interface `canvas-proposal` create lines and reviews the result as an editable draft.
- Generated drafts keep a generated base snapshot for Reset and a mutable review snapshot for user edits.
- During review, generated current-interface items render as draft/proposed. Final Apply promotes accepted items into current saved Canvas memory.
- Live App Plan Preview should become the preferred visual planning surface when a local preview is available. Model-estimated generated mockups remain fallback while the legacy Canvas implementation exists.

## Desktop Shell

- On Windows, the Electron desktop shell starts a native Codex app-server sidecar plus a Windows-local origin-stripping bridge. User-facing project paths may stay Windows-style, but app-server calls must receive runtime-normalized paths.
- The WSL/Node bridge remains a dev runtime option only. A shareable build should follow the packaged Codex shape: ship a native app-server sidecar and launch it hidden from Electron, without requiring WSL, Node, or repo-local scripts on the recipient machine.
- The desktop shell selects the backend runtime by `P03_DESKTOP_BACKEND`: `real-native`/`native`/`sidecar` use the native sidecar, and `real-wsl`/`wsl` use the dev WSL helper. Electron defaults to the native sidecar.
- The native sidecar lane launches packaged `codex.exe app-server --listen ws://127.0.0.1:48889` and exposes the UI-facing bridge on `ws://127.0.0.1:48890`.
- Browser/WebView clients must not connect directly to app-server websocket. Electron owns the local origin-stripping TCP bridge so app-server can keep rejecting browser `Origin` headers while the desktop UI can connect through loopback.
- Dev helper processes receive `P03_DESKTOP_PARENT_PID` or are owned by the Electron process so rebuilds or forced closes do not leave orphan app-server helpers.
- Release desktop builds should not open a console window. Electron starts helper processes with no-window flags and keeps app-server logs in files rather than foreground terminals.
- `scripts/stage-desktop-sidecar.mjs` builds and stages the Windows release sidecar in `apps/desktop/electron/resources/codex-sidecar`: `codex.exe`, `codex-resources/codex-command-runner.exe`, `codex-resources/codex-windows-sandbox-setup.exe`, and `codex-resources/rg.exe`.
- Thread list/read/resume behavior must reconcile sidebar state and hydrated turns without showing stale chats or raw thread IDs.
- Electron exposes small native bridges for file/folder picking, image previews, auth URL opening, and future preview/browser control; document ingestion remains an app-server/tool concern.
- Tauri is retired on the current branch. Electron must preserve the existing app-server boundary and local bridge semantics unless the app-server contract explicitly changes.
- Account/auth/model/usage visibility should come from app-server APIs. The desktop can start app-server `account/login/start` flows for ChatGPT browser auth, ChatGPT device-code auth, or API-key auth, then listen for `account/login/completed` and `account/updated`; it must not store or display tokens.
- Electron owns only native helpers such as opening auth URLs in the user's browser. App-server owns localhost callbacks, credential persistence, token refresh, and logout.

## Verification

- Parser/state logic should use unit-style checks where possible.
- React rendering behavior can use a browser/component harness.
- Repeated desktop flows should prefer DOM/state automation gates in the real desktop shell when available.
- Screenshots and manual pointer driving are still useful for final visual sanity, but should not be the only repeated assertion layer.
- After user-visible Canvas, Live App Plan Preview, Plan Mode, composer, or project behavior changes, dogfood in two local projects when feasible and say exactly what could not be verified.
