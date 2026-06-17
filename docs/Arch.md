# Backend Architecture Map

## Desktop Runtime Boundary

- The desktop app uses `codex-rs/app-server` as the Codex runtime boundary and must not create a parallel agent runtime.
- `codex-rs/app-server-protocol` defines the contract for threads, turns, streamed items, permissions, filesystem operations, config, models, account, review, plugins, apps, and MCP surfaces.
- Desktop-owned state should stay product-facing: project metadata, pinned folders, display names, ordering, hidden/archived projects, last active thread, inspector selection, panel layout, recent composer/settings choices, mockup history, and plan preview state.
- App-server-owned state remains runtime-facing: threads, turns, transcript persistence, tools, command execution, file changes, approvals, sandboxing, review events, and model/config/account reads.
- Old persisted coordinate-planning keys from pre-P20 local state are not loaded into current state. They may remain in a user's saved JSON blob, but the desktop normalizer drops them.
- Active-turn progress uses app-server streamed item events first. The desktop renderer normalizes command items, streamed file-change patches, and bounded workspace snapshots into one turn-scoped progress summary that feeds the transcript and the composer-adjacent progress/review pill. When file-change snapshots are not yet available, Electron exposes a turn-scoped `workspace_progress_snapshot` helper that reports bounded text-file path, line-count, and timestamp summaries only; it skips generated/heavy directories, binary files, large files, and lockfiles and does not persist transcript state.
- Progress summaries key files by project-relative path so relative streamed file-change paths and absolute workspace snapshot paths merge into one row. The composer-adjacent pill is visible for active turns even before file writes: it shows elapsed time, command activity, and honest "no file writes observed yet" states, then switches to changed-line totals when writes become observable. The transcript progress card uses the same summary and may render bounded 10-second observable checkpoints during long no-write spans.

## Live App Preview

- App Preview is the primary visual surface for existing runnable projects. It is available from normal chat and Plan Mode.
- A user can open the app preview, run/stop/reload the project preview, draw an area mark, and continue chatting without using a mention.
- The preview host is desktop-owned UI/runtime state. It must not create a parallel agent runtime or bypass `codex-rs/app-server` for Codex work.
- The Electron host uses a controlled `<webview>` guest for project app previews. Do not regress this to parent-page overlay rendering.
- Electron enables preview lifecycle through small desktop IPC commands: probe a user-provided local HTTP URL, discover likely local preview URLs on request, reject Codex runtime/bridge ports, and return an honest availability/title result.
- Electron also owns a managed project-preview lifecycle: start, stop, and status by project path. Managed preview start chooses an available local port, starts common `package.json` apps when a runnable script exists, or serves plain `index.html` projects through a local static server. If no runnable app exists, it returns an honest baseline-needed state instead of rendering a blank backend/debug page.
- Electron exposes small desktop-owned helpers for mockup-first flows: `project_empty_status` provides factual empty-project state for the prompt wrapper, and `mockups_list` reads saved `.codex/mockups` artifacts for first-party preview. These helpers are UI workflow state, not a parallel Codex runtime and not a desktop-owned questionnaire.
- Electron's native app-server bridge is session-token gated for the desktop renderer. Preview/webview content must not be able to connect to the Codex bridge by opening the loopback websocket directly.
- Preview URL probing should validate redirected final URLs, reject Codex runtime ports, and bound response reads so a broken or hostile local server cannot turn preview detection into a slow/debuggy backend surface.
- Remember preview URLs per project. If a project has no remembered URL, do not automatically show another project's last preview; show the unavailable/choose URL state instead.
- Managed preview processes are per project and opt-in. Do not auto-start every known project. Stopping a managed preview should stop only that project's process/server and clear the active webview.
- Preview state should include project ID, URL, route label, viewport, status, error, updated timestamp, and cleanup/reset status.

## Plan Mode

- Plan Mode is an implementation gate: no app implementation file changes until the user accepts.
- Plan proposals store project/thread/turn identity, the original prompt, attached App/Mockup mark contexts, optional live preview metadata, status, kind, and timestamps.
- Plan acceptance starts a normal implementation turn. It may include selected preview or mark context as guidance, but it does not save visual review artifacts as durable project memory.
- Plan revision sends typed feedback plus any selected preview or mark context. Revision stays in Plan Mode and should remain product-facing.
- Plan Mode may create review-only `.codex/mockups` artifacts when visual review is itself the plan, but implementation still waits for explicit acceptance.
- When a Plan Mode review artifact is accepted through `Build selected`, the desktop stages editable implementation text and clears Plan Mode for that project so the next send is an implementation turn with selected option, route, viewport, and mark context as hidden support.

## Prompt Wrappers

- Prompt wrappers must preserve the visible user request in chat/sidebar titles. Internal sentinels and control payloads should not appear as user text.
- Empty-project visual-option prompting is LLM-led: the desktop may attach compact project state and capability guidance, while the agent decides whether to save mockups first or implement directly.
- Empty-project visual-option prompting should be routed only for broad UI/app/product creation or explicit preview-option requests. Operational command/script/no-edit prompts use the normal turn path even when the folder is empty.
- Existing-app broad UX/UI prompts can use the same decision-strip protocol with current-app wording.
- Existing-app preview-first prompts route by specificity: an explicit single-preview request creates one review-only `.codex/mockups` artifact, an explicit multiple-directions request creates A/B/C artifacts, and ambiguous "show me first" or "wireframe first" follow-ups use the current-app decision strip before artifacts are generated.
- Decision-only prompt wrappers may mention `.codex/mockups` output rules, but completion handling must not treat them as artifact-creation turns. Only turns that actually request review artifacts should activate a current proposal set or auto-open Mockup Preview.
- App/Mockup mark contexts serialize only the relevant project, preview/mockup identity, viewport, marked rectangle, note, and timestamp. They are temporary communication context, not DOM selectors.
- Existing-app visual-decision sends preserve project-scoped App/Mockup mark contexts through the selected choice so a user's marked location still supports the eventual preview, revision, or implementation turn.

## Decision Strips

- Empty-project visual planning can start with a `codex-decision-strip` fenced JSON block in the assistant response. The desktop strips that block from chat text and renders its choices above the composer.
- Decision-strip/control JSON is never user-facing chat content. Strip complete and partially streamed decision payloads before rendering assistant text, while preserving normal progress/thinking UI.
- Visual-decision, mockup revise/add/build, and selected-option sends must continue the active thread when one exists. Draft project routing is only for a truly new chat, not for actions inside an existing thread.
- Thread refresh must preserve active local drafts and pending sends. If a project has no valid active or last-active thread, the desktop should leave `activeThreadId` empty instead of falling back to the newest server thread.

## Mockup Preview

- Saved mockups live under the project folder in `.codex/mockups/manifest.json` and up to three HTML files such as `mockup-a.html`, `mockup-b.html`, and `mockup-c.html`.
- Saved mockups are concept artifacts. They can be reopened, switched, revised, added to, marked, or built from, but they are not localhost apps or code branches.
- When saved `.codex/mockups` artifacts exist and the set is still an active decision, the desktop can render a compact A/B/C selector above the composer so users can open and switch the selected mockup without digging through Activity.
- The above-composer saved-mockup strip is only a selector. Heavier actions such as revise, add, and build belong to Mockup Preview and should stage the composer rather than send immediately.
- Build-selected sends must preserve two separate payloads: the visible user request for chat/title/display and hidden selected-mockup context for agent guidance. The visible request is authoritative and should override selected mockup context when they conflict.
- Build-selected staging stores visible prompt metadata on the submission draft. Chat, Activity, sidebar, and transcript display read that visible request or scrub the generic attached-context marker instead of rendering selected-option or mark payloads.
- Mockup Preview area marks are composer context (`@MockupMark`) with selected option, saved file, viewport size, named rectangle, and timestamp.
- Mockup mark rectangles are rendered from composer contexts. Removing the composer chip removes the matching rectangle, and saved rectangles are non-interactive so they do not block iframe clicks.
- Composer preview contexts are project-scoped. Project switches, new-folder selection, new chats, and prompt serialization must not show or send App/Mockup chips whose `projectId` differs from the active project.
- Saved mockup decisions are additionally thread-owned. The desktop may keep project-level `.codex/mockups` artifacts open in Inspector, but composer A/B/C selectors and hidden saved-mockup review context should serialize only when the owning thread is active.
- After a `Build selected mockup` turn starts, desktop records that project as mockup history mode. History mode hides the composer selector and commit actions while keeping saved mockups openable and markable as reference pages.
- Starting mockups that entered history mode must not be reused as active existing-app proposal tabs. New `Live | Preview` or `Live | A | B | C` comparisons require a fresh current-request review artifact set based on the live app.
- Saved mockup manifest entries may include proposal highlight rectangles with labels and notes. Electron normalizes bounds before exposing them; the renderer shows them as temporary proposal overlays, and adjusted highlights serialize as supporting composer context rather than accepted app chrome.
- Build-selected agent turns should create runnable files and clear start instructions, but should not launch preview/server processes. Electron's managed App Preview lifecycle owns project server start/stop after implementation.

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
- Electron exposes small native bridges for file/folder picking, image previews, auth URL opening, and preview/browser control; document ingestion remains an app-server/tool concern.
- App Preview URLs are project-scoped. Electron keys managed preview processes by normalized project path and rejects probe/open requests for URLs owned by another managed project. The renderer also treats duplicate remembered localhost URLs across projects as stale unless the active project currently owns that managed preview, so old `127.0.0.1:5173` memory cannot make every folder show the same app.
- Tauri is retired on the current branch. Electron must preserve the existing app-server boundary and local bridge semantics unless the app-server contract explicitly changes.
- Account/auth/model/usage visibility should come from app-server APIs. The desktop can start app-server `account/login/start` flows for ChatGPT browser auth, ChatGPT device-code auth, or API-key auth, then listen for `account/login/completed` and `account/updated`; it must not store or display tokens.

## Verification

- Parser/state logic should use unit-style checks where possible.
- React rendering behavior can use a browser/component harness.
- Repeated desktop flows should prefer DOM/state automation gates in the real desktop shell when available.
- Screenshots and manual pointer driving are useful for final visual sanity, but should not be the only repeated assertion layer.
- After user-visible App Preview, Mockup Preview, Plan Mode, composer, or project behavior changes, dogfood in two local projects when feasible and say exactly what could not be verified.
