# P03 - Desktop Codex App

## Status

- State: WIP
- Location: `plans/wip/`
- Completed: No
- Current focus: the desktop shell and project Canvas foundation are in. Next work should keep Canvas as a single project planning surface, improve manual editing, and preserve explicit Canvas-to-prompt handoff.
- Related docs: `docs/Arch.md`, `docs/Prod.md`, `docs/UI-UX.md`
- Rule for this plan: keep execution state here; move durable app/product/interface facts to the docs.

## Goal

Build a clean v1 desktop Codex app on top of the existing app-server: local projects, chats, permissions, model/speed controls, Plan Mode, attachments, command visibility, file review, settings, and a right-side inspector/document/Canvas panel.

## Current Implementation Snapshot

- React/TypeScript desktop shell lives in `apps/desktop/`.
- Electron shell lives in `apps/desktop/electron/`; renderer builds and launches in the desktop app.
- The app-server proof gate, real command smoke, and repeated desktop build checks have passed.
- Canvas is project-owned state opened from a project-level action, shared across chats in the same project, and persisted locally.
- Plan Mode can emphasize Canvas and attach serialized Canvas context when the user explicitly chooses it.

## Completed Slices

- App-server proof gate: start/connect, config/model/account reads, thread lifecycle, prompt streaming, command event, file-change event, cancellation, and transcript read passed against the proof script.
- Desktop shell foundation: project state, app-server client, automatic connection states, Electron shell, launcher, and componentized React structure.
- Projects and chats: add/select project, runtime path normalization, grouped project chats, New Chat drafts, thread read/resume/start, rename, archive, search/filter, restart recovery, and stale-thread cleanup.
- Sidebar product pass: slim project/chat rows, no top-level Plugins/Automations/global Chats, Show more/less for project chats, settings/account popover, usage remaining from real app-server rate limits.
- Composer product pass: textarea-first composer, plus menu, native file picker/drag-drop intake, quiet attachment cards, unsupported-file blocking, permissions/model/effort popovers, Shift+Tab Plan Mode, retry/stop rules, and context meter.
- Chat rendering pass: final-answer/commentary separation, compact thought-process reveal, slim command rows, edited-file summaries, Markdown-styled message text, document inspector opening, compaction divider, and hidden internal evidence prose.
- Inspector/responsive pass: Activity default, active-chat document retargeting, wrapped document preview, file-change detail without loading large diffs by default, responsive inspector collapse, phone-width sidebar drawer, and inspector-aware resizing.
- Canvas foundation: pages, sub-pages, current/temporary/removed states, layers, groups, direct manipulation, interaction frames, prompt attachment, and local persistence.

## Open Risks And Deferred Work

- Live file-change/review cards remain only partly proven in the visual app.
- Native Windows runtime, command execution, shell, and sandbox behavior need broader verification outside the WSL-backed path.
- Installer packaging remains pending; `electron:build` stages the native sidecar and builds the renderer.
- Broad PDF/Office/binary document ingestion is out of scope for this slice.
- Full permission approval UX and denied-action states still need broader manual verification.
- Plan-to-Canvas synchronization beyond explicit draft review remains deferred.

## Phase Checklist

1. [x] App-server proof gate.
2. [x] Desktop shell foundation.
3. [x] Projects and chats.
4. [x] Composer and running turns.
5. [ ] Response and work review: normal chat rendering is polished; live file-change/review workflow still needs direct proof.
6. [ ] Inspector and command surfaces: Activity/document/detail surfaces are usable; diff/review detail remains limited.
7. [ ] Settings and polish: account/usage and responsive behavior are in; broader settings, plugins/apps, accessibility, and packaging remain.
8. [x] Canvas foundation: project-level action, persisted local Canvas state, and basic Canvas Inspector are in.

## Verification Baseline

- `corepack pnpm --filter @openai/codex-desktop build`
- `corepack pnpm --filter @openai/codex-desktop smoke:real-command`
- `corepack pnpm --filter @openai/codex-desktop electron:build`
- `.\run-codex-desktop-ui.ps1`

Manual checks should match the slice touched. At minimum, keep proving: app launches, auto-connects, project/chat selection works, Send streams, restart/reopen reconciles sidebar and main chat, and the touched Canvas or inspector surface does not create overlap or dead-space regressions.

## Next Slice Plan - Canvas Placement, Manual Editing, And Prompt Handoff

### Scope

- Improve the existing project-owned Canvas foundation inside the desktop app.
- Keep the Canvas entry point clear and intentional near the project/chat workspace header.
- Tighten manual editing: empty state, add/edit/delete, move/resize feel, selected styling, read-only/locked state, page switching, and layers.
- Keep page controls compact and near the top of Canvas so the drawing surface keeps maximum width.
- Keep the prompt/plan handoff explicit through `@canvas` or visible context chips.
- Keep the normal chat/composer loop intact.

### Target Behavior

- A project-level Canvas action opens that project's Canvas without requiring a new chat or Plan Mode.
- The first Canvas screen lets the user add the first object quickly or generate an editable current-interface mockup.
- Page switching is quick through a compact top strip.
- Right-click provides common object edits such as layer order, duplicate/copy, lock, state/color, mark as current, reset placement, and delete.
- Plan Mode can reveal an expanded Canvas workspace and show draft changes while preserving enough chat context to understand the request.
- Canvas remains project-scoped if the user switches chats.
- Editing is disabled while a thread in the project is running.

### Out Of Scope

- Automatic codebase maps.
- Automatic plan-to-Canvas synchronization beyond explicit review.
- Multi-user/cross-device sync.
- Full design-tool features, plugins, microphone/realtime, or broad app redesign.

### Verification

- Run the P03 verification baseline for larger slices.
- Launch the built app and verify Canvas is not shown as a chat-like row in the sidebar.
- Verify the project-level Canvas action opens the project Canvas.
- Verify empty state and basic add/edit/delete/move/resize/select behavior.
- Verify `@canvas` appears intentionally and does not attach Canvas to every prompt.
- Verify Plan Mode opens or emphasizes Canvas and preserves enough chat context.
- Verify switching chats while Canvas is open keeps Canvas available for that project.
- Verify Canvas state persists after switching chats and restarting the app.
- Verify narrow widths do not overlap the Canvas, chat, composer, or sidebar drawer.
