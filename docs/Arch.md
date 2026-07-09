# Backend Architecture Map

## P35 Single-Mark Architecture Contract

This section is current. Older architecture notes that describe proposal highlights, active Mockup Preview, active visual Plan Preview, A/B/C lanes, or agent-created `Change N` chips are historical unless explicitly restated for Draft.

- Renderer routing resolves existing-app visual work to `Live`, `Draft`, or a short Draft/Live question only.
- `LiveAppPreview` and `DraftPreview` share one user-created mark flow. The visible label is always `Mark N`.
- Composer mark metadata carries hidden origin fields such as `surface: "live" | "draft"` and `draftId` when the mark was created from Draft.
- Local-state hydration ignores old mockup-preview contexts, proposal-highlight contexts, and plan-preview visual routes instead of reviving UI.
- Plan Mode remains an implementation gate, but it no longer creates an active `codex-plan-preview` visual comparison surface.
- Saved mockups and legacy proposal data can remain as inert compatibility records until a later cleanup deletes or migrates storage more broadly.
- Draft workspace copy/diff/apply machinery remains the supported source-safe preview/build path.

## P34 Draft-Only Architecture Contract

This section remains the Draft architecture contract and is now governed by the P35 single-Mark contract above.

- Renderer routing resolves visual existing-app work to Draft or direct Live only. `canvasActions.ts` no longer exposes proposal creation/revision/add/build actions.
- `App.tsx` no longer renders Code Proposal Preview, Code Proposal Option Strip, Mockup Option Strip, active proposal rows, or user-facing `Build selected` labels.
- `localState.ts` drops persisted code-proposal and mockup active-routing state during load so old records do not revive proposal UI after restart.
- `DraftPreview`, feature-draft registry state, and `draft_workspace_apply` remain the supported source-safe preview/build path.
- Some proposal-named primitives still exist as compatibility or shared copy/diff/apply infrastructure: `proposal-workspaces.cjs`, legacy `CodeProposalFileChange` type names, historical plan-preview/mockup parsers, and old persisted-state normalizers. They are not current product surfaces and should be renamed or deleted in a later low-risk cleanup after Draft dogfood is stable.
- Electron app-server boundaries remain unchanged: Codex work still flows through app-server turns; desktop-owned IPC may prepare/diff/apply Draft workspaces but must not become a parallel agent runtime.

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
- P33 architecture direction: existing-project feature preview should be a Live-first draft layer. Internally, a draft may reuse isolated code-backed workspace infrastructure, preview flags, and mock data/backend conventions, but it should be presented as `Live + Draft` rather than mandatory A/B/C. The user's main working tree should remain unchanged until `Build this`.
- P34 architecture direction: remove user-facing A/B/C proposal lanes entirely. Keep Draft as the single preview-before-build mode, and migrate reusable copy/diff/apply workspace primitives behind Draft-neutral names so proposal workspaces do not remain an active product architecture.
- P33b Draft prompt/runtime direction: if the user asks to see how a new feature works, the agent should build a temporary in-app workflow with fake local state, not a static explanation surface. Draft guidance should ask for entry point, menu/choice, selected state, approval/review state when relevant, and result state, while explicitly avoiding real backend/network/auth integration unless requested.
- P33c investigation direction: the P33b Phase 1 dogfood showed that a copied Draft can become a standalone demo page rather than a feature inserted into the current app. Next architecture work should compare dependency reuse, draft demo-state injection, Git worktree Drafts, and direct Live reversible patches. Copied Draft remains useful as fallback, but feature-in-place behavior should preserve the app shell/router/providers unless the user asks for a standalone prototype.
- Implemented P33d first slice: `apps/desktop/src/canvasWorkflowLedger.ts` derives a compact Canvas workflow ledger from existing Draft/proposal/preview state so routing can prefer Live after build, honor explicit Draft/Live wording, recover failed Drafts, and ask when surface intent conflicts.
- Implemented P33d manual-test fix: Draft validation now distinguishes hard source-safety failures from soft workflow warnings. Command-before-placement and missing-placement preflight warnings should not interrupt an active Draft turn; they are logged and allowed to continue, while router bypass, stale artifact, standalone demo, final contract failures, and Draft preview-server commands remain blocking. `Continue Draft` rejoins an existing in-flight Draft turn instead of starting a duplicate recovery turn.
- Draft repair/revision routing is thread-aware. Related visual follow-ups should revise the active/last-active thread Draft instead of creating a second Draft when the inspector is open or the app has only project-level Draft context. If a Draft turn is interrupted after validated Draft file changes, the desktop can finalize the Draft from changed-path validation rather than forcing `Continue`.
- Draft preview continuity is renderer-owned. Draft preview webviews are keyed by draft id plus an explicit refresh nonce instead of status/update timestamps, and Draft auto-start first tries the remembered Draft/project URL before allocating a new managed preview. The Draft operating prompt tells the agent that the desktop owns preview serving/reload and must not start fresh dev/preview/static servers just to prove readiness; command validation hard-blocks those preview-server commands when they slip through.
- Draft refresh is an explicit user action. The compact Draft strip and Draft preview row can bump the preview refresh nonce without sending a new agent turn, preserving the Draft lane as continuous WIP.
- A user can open the app preview, run/stop/reload the project preview, draw an area mark, and continue chatting without using a mention.
- The preview host is desktop-owned UI/runtime state. It must not create a parallel agent runtime or bypass `codex-rs/app-server` for Codex work.
- The Electron host uses a controlled `<webview>` guest for project app previews. Do not regress this to parent-page overlay rendering.
- Electron enables preview lifecycle through small desktop IPC commands: probe a user-provided local HTTP URL, discover likely local preview URLs on request, reject Codex runtime/bridge ports, and return an honest availability/title result.
- Electron also owns a managed project-preview lifecycle: start, stop, and status by project path. Managed preview start chooses an available local port, reserves ports while preview starts are in flight, starts common `package.json` apps when a runnable script exists, or serves plain `index.html` projects through a local static server. Simple `node <file>` package scripts are spawned directly instead of through the package manager wrapper so Electron can stop the actual preview server reliably. Stop requests can cancel in-flight starts for the same project path, which keeps Draft-to-Live build handoffs from racing on localhost ports. If no runnable app exists, it returns an honest baseline-needed state instead of rendering a blank backend/debug page.
- Electron exposes small desktop-owned helpers for mockup-first flows: `project_empty_status` provides factual empty-project state for the prompt wrapper, and `mockups_list` reads saved `.codex/mockups` artifacts for first-party preview. These helpers are UI workflow state, not a parallel Codex runtime and not a desktop-owned questionnaire.
- Electron's native app-server bridge is session-token gated for the desktop renderer. Preview/webview content must not be able to connect to the Codex bridge by opening the loopback websocket directly.
- Preview URL probing should validate redirected final URLs, reject Codex runtime ports, and bound response reads so a broken or hostile local server cannot turn preview detection into a slow/debuggy backend surface.
- Remember preview URLs per project. If a project has no remembered URL, do not automatically show another project's last preview; show the unavailable/choose URL state instead.
- Managed preview processes are per project and opt-in. Do not auto-start every known project. Stopping a managed preview should stop only that project's process/server and clear the active webview.
- Preview state should include project ID, URL, route label, viewport, status, error, updated timestamp, and cleanup/reset status.
- Current P35 existing-app visual work uses Live and Draft only. The model must not return hidden visual preview blocks for active routing.
- Draft marks carry route, viewport, bounds, screenshot/thumbnail, surface, and draft id metadata. They are supporting review metadata, not accepted app UI.
- Legacy Plan Preview, saved mockup, and code-backed proposal stores may remain on disk or in old state blobs, but renderer load normalizes them to inert compatibility state instead of reviving preview lanes.
- Implemented P33 Phase 1 foundation: `apps/desktop/electron/draft-workspaces.cjs` provides hidden draft workspace prepare/diff/lifecycle/brief helpers. It adapts the existing code-backed proposal workspace copy/diff/bounds machinery underneath a separate draft registry, so drafts are not represented as visible `A/B/C` proposal sets.
- A P33 draft registry tracks draft name, owning project/thread, lifecycle (`active`, `parked`, `built`, `discarded`), affected routes, hidden workspace/preview owner pointers, mock assumptions, and a draft brief path such as `.codex/drafts/<draft-slug>/brief.md`. The brief is durable product memory for the draft; the registry remains hidden implementation state.
- Implemented P33 renderer/build slice: desktop state now has `featureDrafts` plus active draft pointers by thread, `DraftPreview` reuses `LiveAppPreview` as `Live + Draft`, and `App.tsx` can route clear existing-project single-feature preview prompts into one hidden draft workspace. Draft revision stays in the workspace; explicit `Build this` uses `draft_workspace_apply`, which reuses the code-backed proposal workspace apply/conflict machinery and mutates Live only after approval. `Park`, `Resume`, and `Discard` update draft lifecycle without exposing draft workspace internals. Active or parked drafts hydrate from the registry and surface in the Canvas app-state header for the owning thread; Draft controls should not render as a persistent above-composer menu.
- P33/P35 prompt/routing cleanup: explicit existing-app feature/workflow requests such as "show me how this works before implementation" resolve to a first-class `CREATE_DRAFT` Canvas action and use a Draft-specific operating prompt. Draft prompts must not inherit Proposal Canvas, lettered lanes, or plan-preview JSON instructions.
- P33 decision strips support a structured `show_draft` action. For existing-app single-feature "show first" flows, the rendered decision choice can stage normal user text while hidden routing creates one Draft workspace. This keeps follow-up routing state/action based instead of hardcoding every possible confirmation phrase.
- Draft workspace file-change labels are sanitized through the shared proposal workspace display helper. Visible transcript, activity, inspector, and progress labels should show product-facing `Draft / ...` paths instead of hidden draft workspace roots.
- Planned P33b lifecycle hardening: a built Draft should be marked `built` and stop being the active revision target once Live has been updated. A parked Draft remains resumable, a discarded Draft remains closed, and unrelated new work should create a fresh Draft from current Live instead of silently reusing the occupied active Draft.
- Planned P33b staleness hardening: draft registries should keep enough baseline/source signature data to detect whether Live changed after draft creation or parking. Resume/build should allow non-overlapping changes, block or ask on overlapping changes, and avoid automatic merge/discard/recompose behavior.
- Planned P33b preview hardening: `Live + Draft` should keep Live and Draft preview guests warm where feasible. Switching lanes should prefer visibility swaps and route/scroll/viewport preservation over remounting/reloading, with Draft reloads only when the draft workspace content actually changes.
- Implemented P33b/P35 header architecture slice: preview chrome models app-state tabs as `Live | Draft`, with Draft lifecycle actions on the active Draft header state.
- Implemented P35 resolver shape: user marks and Draft state feed the derived Canvas action/state model before prompt routing. `apps/desktop/src/canvasActions.ts` owns the canonical actions (`ASK_USER`, `CREATE_DRAFT`, `BUILD_LIVE_DIRECTLY`) and the reviewable Canvas operating prompt; `App.tsx` adapts Live/Draft state into that model while preserving the app-server runtime boundary.
- P27b cleanup removed the old fixed empty-project/current-app questionnaire wrappers, completed-turn fallback synthesis, and the separate `[Codex Existing App Preview First Context]` saved-preview creation sentinel. Canvas questions now use one `[Codex Canvas Question Context]` wrapper and agent-authored `codex-decision-strip` choices; saved review artifact creation uses the saved-mockup review path. Do not reintroduce `Empty Project Visual Planning`, `Existing App Visual Decision`, or existing-app-preview-first sentinel families as separate routing systems.
- Code-backed proposal lifecycle is compatibility infrastructure after P35. It must not become active routing or visible comparison UI unless a future plan explicitly reintroduces it.
- Implemented P35 architecture: `LiveAppPreview` and `DraftPreview` render Live/Draft as the only active Canvas preview surfaces. Desktop/Mobile viewport switching renders once as floating Canvas chrome.
- Historical P30 proof: `apps/desktop/src/visualPatchRuntime.ts` owns a minimal preview-only `VisualPatchV0` runtime for `style` and optional `text` patches targeted by `data-canvas-id`. It remains hidden plumbing; it is not a current user-facing proposal lane.
- Historical P30b Phase 1: `apps/desktop/src/canvasProposalModel.ts` still defines old backing types for compatibility. Active P35 routing does not expose proposal display lanes.
- Implemented P30b Phase 2: `apps/desktop/src/canvasTargeting.ts` defines `ElementRef`, bounds, and `TargetResolution` confidence rules, plus a hidden preview metadata collection script for `data-canvas-id`, optional source file, and component metadata. This target metadata remains support data for future patches/conversion/Edit Mode and is not rendered in Canvas chrome.
- Implemented P30b Phase 3: `visualPatchRuntime.ts` now supports preview-only `VisualPatch` V1 bundles with `style`, `text`, `hide`, and `show` operations, named bundle apply/clear, idempotent reapply after DOM replacement, and source-safe restoration. This remains hidden preview runtime plumbing only; it does not add Canvas header UI, hot-swap lane switching, source conversion, or P31 Edit Mode.
- Historical P30b Phase 4-7: persisted live proposal variants, VisualPatch bundles, proposal highlights, and staleness checks may remain in old records, but active P35 UI does not render proposal highlights or build-selected proposal actions.
- Implemented P30b Phase 8: desktop Plan Mode sends `turn/start.planningOnly`, and Rust/app-server clamps the turn to approval `never` plus a managed permission profile that reads the project but writes only app-managed review artifacts under `.codex/mockups`. The turn also forces the managed sandbox level so patch/tool writes remain enforceable; legacy sandbox/profile overrides cannot widen a planning-only turn.
- Implemented P30b Phase 9: code-backed proposal workspaces now persist through the app-owned proposal registry in `apps/desktop/electron/proposal-workspaces.cjs`. The registry is stored under the Electron `proposal-workspaces/registry.json` cache, records project-hashed workspace roots, `registryId`, option `previewOwnerId`, and option workspace paths, and validates registry bounds before diff/apply. React local state remains the presentation cache for active/compare lanes, not the sole source of source-affecting proposal truth.
- Shelved P31/P32 architecture: Canvas direct-manipulation edit sessions and move-only generated-DOM addressability are not the current product path. Keep existing historical design notes only as fallback context; do not build new general DOM editor, proxy movement, or move-intent infrastructure ahead of P33.
- User-authored visual references remain useful evidence for Draft revision. Agent-authored change chips are not part of the active P35 workflow.
- Planned agent-aware architecture: derive a compact Canvas surface-awareness payload from the same resolver state used by Live/Draft preview surfaces. Prompt/routing context should tell the agent the selected surface, Live status, Draft lifecycle, viewport, marks, and build meaning without exposing internal paths.

## Plan Mode

- Plan Mode is an implementation gate: no app implementation file changes until the user accepts.
- Plan proposals store project/thread/turn identity, the original prompt, attached Live/Draft mark contexts, optional live preview metadata, status, kind, and timestamps.
- P28/P35 direction: visual plans should pin Visual References, not just current mark context. A Visual Reference should preserve the backing project/thread/surface/draft/route/viewport/screenshot/bounds/note/source metadata needed to implement the visual story later.
- Plan acceptance starts a normal implementation turn. It may include mark context as guidance, but it does not save visual review artifacts as durable project memory.
- Plan revision sends typed feedback plus any attached mark context. Revision stays in Plan Mode and should remain product-facing.

## Prompt Wrappers

- Prompt wrappers must preserve the visible user request in chat/sidebar titles. Internal sentinels and control payloads should not appear as user text.
- Empty-project visual-option prompting is LLM-led: the desktop may attach compact project state and capability guidance, while the agent decides whether to ask a Canvas question, save proposals first, or implement directly.
- Empty-project visual-option prompting should be routed only for broad UI/app/product creation or explicit preview-option requests. Operational command/script/no-edit prompts use the normal turn path even when the folder is empty.
- Existing-app broad UX/UI prompts use the same Canvas question wrapper and decision-strip protocol when clarification is needed; the agent authors the wording from the request.
- Existing-app preview-first prompts route to Draft unless the user explicitly asks for direct Live implementation. Ambiguous exploratory visual follow-ups use the current-app decision strip before a Draft is created; the agent authors the strip content while the desktop provides allowed `canvasAction` routing values and product constraints.
- Canvas-relevant prompt wrappers should include current surface awareness when available: selected Live/Draft surface, Draft lifecycle, route, viewport, and attached visual references. The wrapper should stay compact and factual; it must not leak workspace paths, hidden JSON payloads, or desktop-only IDs into visible chat.
- Decision-only prompt wrappers must not treat old saved artifacts as active preview turns. Only Draft creation/revision or direct Live implementation should become active routing state.
- Live/Draft mark contexts serialize only the relevant project, surface, Draft id when present, viewport, marked rectangle, note, timestamp, and optional renderer-owned thumbnail data URL for display. They are temporary communication context, not DOM selectors.
- Existing-app visual-decision sends preserve project-scoped Live/Draft mark contexts through the selected choice so a user's marked location still supports the eventual Draft, revision, or implementation turn.

## Decision Strips

- Empty-project visual planning can start with a `codex-decision-strip` fenced JSON block in the assistant response. The desktop strips that block from chat text and renders its choices above the composer.
- Existing-app single-feature visual decisions should prefer `show_draft` for one previewable change. The decision option prompt is the self-contained feature request used to prepare the Draft; the visible composer text remains product-facing.
- Decision-strip/control JSON is never user-facing chat content. Strip complete and partially streamed decision payloads before rendering assistant text, while preserving normal progress/thinking UI.
- P35 direction: decision strips are the single questionnaire surface for ambiguous Canvas choices. The renderer should support 2-3 stacked choices with short labels while preserving hidden routing metadata for direct build, current Draft revision, or a new Draft.
- Visual-decision and Draft sends must continue the active thread when one exists. Draft project routing is only for a truly new chat, not for actions inside an existing thread.
- Thread refresh must preserve active local drafts and pending sends. If a project has no valid active or last-active thread, the desktop should leave `activeThreadId` empty instead of falling back to the newest server thread.

## Historical Mockup And Proposal Compatibility

- Saved mockups may still exist under `.codex/mockups`, and code-backed proposal workspace helpers may still exist as compatibility infrastructure.
- P35 must not render these artifacts as active Inspector surfaces, comparison tabs, above-composer selectors, or build-selected actions.
- Old App/Mockup mark contexts are normalized away or treated as inert presentation history. Current mark contexts are Live/Draft `Mark N` references.
- Electron's managed App Preview lifecycle owns project server start/stop after implementation.

## Desktop Shell

- On Windows, the Electron desktop shell starts a native Codex app-server sidecar plus a Windows-local origin-stripping bridge. User-facing project paths may stay Windows-style, but app-server calls must receive runtime-normalized paths.
- The WSL/Node bridge remains a dev runtime option only. A shareable build should follow the packaged Codex shape: ship a native app-server sidecar and launch it hidden from Electron, without requiring WSL, Node, or repo-local scripts on the recipient machine.
- The desktop shell selects the backend runtime by `P03_DESKTOP_BACKEND`: `real-native`/`native`/`sidecar` use the native sidecar, and `real-wsl`/`wsl` use the dev WSL helper. Electron defaults to the native sidecar.
- The native sidecar lane launches packaged `codex.exe app-server --listen ws://127.0.0.1:48889` and exposes the UI-facing bridge on `ws://127.0.0.1:48890`. Desktop dogfood/tests may override these with `CODEX_DESKTOP_APP_SERVER_PORT` and `CODEX_DESKTOP_BRIDGE_PORT` so a test Electron app does not collide with the running Codex Local app.
- Browser/WebView clients must not connect directly to app-server websocket. Electron owns the local origin-stripping TCP bridge so app-server can keep rejecting browser `Origin` headers while the desktop UI can connect through loopback.
- Dev helper processes receive `P03_DESKTOP_PARENT_PID` or are owned by the Electron process so rebuilds or forced closes do not leave orphan app-server helpers.
- Release desktop builds should not open a console window. Electron starts helper processes with no-window flags and keeps app-server logs in files rather than foreground terminals.
- `scripts/stage-desktop-sidecar.mjs` builds and stages the Windows release sidecar in `apps/desktop/electron/resources/codex-sidecar`: `codex.exe`, `codex-resources/codex-command-runner.exe`, `codex-resources/codex-windows-sandbox-setup.exe`, and `codex-resources/rg.exe`.
- Thread list/read/resume behavior must reconcile sidebar state and hydrated turns without showing stale chats or raw thread IDs.
- Electron exposes small native bridges for file/folder picking, image previews, auth URL opening, and preview/browser control; document ingestion remains an app-server/tool concern.
- Composer image attachments use Electron's file-path bridge plus app-server `localImage` inputs. The desktop only renders chips/thumbnails and passes local paths; core owns converting those images for the model request. Preview mark thumbnails are display metadata on composer contexts and do not turn marks into model image attachments unless the user separately attaches an image.
- App Preview URLs are project-scoped. Electron keys managed preview processes by normalized project path and rejects probe/open requests for URLs owned by another managed project. The renderer also treats duplicate remembered localhost URLs across projects as stale unless the active project currently owns that managed preview, so old `127.0.0.1:5173` memory cannot make every folder show the same app.
- Electron must preserve the existing app-server boundary and local bridge semantics unless the app-server contract explicitly changes.
- Account/auth/model/usage visibility should come from app-server APIs. The desktop can start app-server `account/login/start` flows for ChatGPT browser auth, ChatGPT device-code auth, or API-key auth, then listen for `account/login/completed` and `account/updated`; it must not store or display tokens.

## Verification

- Parser/state logic should use unit-style checks where possible.
- React rendering behavior can use a browser/component harness.
- Repeated desktop flows should prefer DOM/state automation gates in the real desktop shell when available.
- Screenshots and manual pointer driving are useful for final visual sanity, but should not be the only repeated assertion layer.
- P33 manual gates should verify draft-workspace state through DOM/state checks, source hashes before/after `Build this`, draft brief creation/update, no hidden implementation leaks, and real Electron preview behavior across both interface-heavy and backend/workflow-heavy projects.
- After user-visible Live Preview, Draft Preview, Plan Mode, composer, or project behavior changes, dogfood in two local projects when feasible and say exactly what could not be verified.
