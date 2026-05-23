# P03 - Desktop Codex UI

## Status

- State: WIP
- Location: `plans/wip/`
- Completed: No
- Current focus: project Canvas foundation is in; next canvas work should decide plan-to-canvas flow or backend mapping, not rework the shell.
- Related docs: `docs/Arch.md`, `docs/Prod.md`, `docs/UI-UX.md`
- Rule for this plan: keep execution state here; move durable backend/product/UI facts to the docs.

## Goal

Build a clean v1 desktop Codex app on top of the existing app-server: local projects, chats, permissions, model/speed controls, Plan Mode, attachments, command visibility, file review, settings, and a right-side inspector/document panel.

P03 started with the app shell and core loop before the visual planning canvas. The next adventure can start the canvas as a focused foundation slice, not the full planning system.

## Relevant Docs

- `docs/Arch.md`: app-server ownership, thread lifecycle, WSL path behavior, attachments, context usage, account usage, and Tauri bridge facts.
- `docs/UI-UX.md`: durable sidebar, composer, chat, inspector, responsive, context meter, and planned canvas interaction rules.
- `docs/Prod.md`: product direction for the project-level visual planning canvas and backend mapping.
- `AGENTS.md`: plan/document boundaries and memory rules.

## Current Implementation Snapshot

- React/TypeScript desktop shell lives in `apps/desktop/`.
- Tauri v2 shell lives in `apps/desktop/src-tauri/`; release exe builds and launches.
- Default launcher starts the built Tauri app against the current real WSL app-server helper.
- Browser/mock paths remain useful fallback scaffolding, but real WSL app-server is the primary P03 verification path.
- App-server proof gate, real command smoke, and repeated desktop build checks have passed.

## Completed Slices

- Backend proof gate: app-server start/connect, config/model/account reads, thread lifecycle, prompt streaming, command event, file-change event, cancellation, and transcript read passed against the proof script.
- Desktop shell foundation: project state, app-server client, automatic connection states, Tauri shell, launcher, and componentized React structure.
- Projects and chats: add/select project, runtime path normalization, grouped project chats, New Chat session-local drafts, thread read/resume/start, rename, archive, search/filter, restart recovery, and stale-thread cleanup.
- Sidebar product pass: slim project/chat rows, no top-level Plugins/Automations/global Chats, Show more/less for project chats, settings/account popover, usage remaining from real app-server rate limits.
- Composer product pass: textarea-first composer, plus menu, native file picker/drag-drop intake, quiet attachment cards with image thumbnails/lightbox preview, unsupported-file blocking, permissions/model/effort popovers, Shift+Tab Plan Mode, compact send behavior, retry/stop rules, context meter.
- Chat rendering pass: final-answer/commentary separation, compact thought-process reveal, slim command rows, edited-file summaries, Markdown-styled message text, Markdown document inspector opening, compaction divider, hidden internal evidence prose.
- Inspector/responsive pass: Activity default, active-chat document retargeting, wrapped/styled document preview, file-change detail without loading large diffs by default, responsive inspector collapse, phone-width sidebar drawer, and inspector-aware resizing that gives Canvas room while preserving a phone-width chat.
- Account/settings pass: compact bottom-left popover, account identity, logout, real rate-limit rows when available, no right-inspector settings surface.
- Canvas foundation: project-owned canvas state opens in Canvas Inspector from a project-level action, stays distinct from chats, persists current/proposed/deleted containers, and locks editing while a project thread is running.

## Open Risks And Deferred Work

- Live UI file-change/review cards remain only partly proven; the proof script saw a file-change event, but a simple live UI file-edit prompt did not reliably produce a file-change card.
- Native Windows runtime, command execution, shell, and sandbox behavior remain unproven; current real path is WSL-backed.
- Installer packaging remains disabled; `tauri:build` produces the release exe.
- Broad PDF/Office/binary document ingestion is out of scope; current attachments only represent what the app-server/runtime can honestly use.
- Full permission approval UX and denied-action states still need broader manual verification.
- Plan-to-canvas synchronization, backend Generate, richer layers/comments/grouping, and backend canvas mapping are not implemented yet.

## Phase Checklist

1. [x] Backend proof gate.
2. [x] Desktop shell foundation.
3. [x] Projects and chats.
4. [x] Composer and running turns.
5. [ ] Response and work review: normal chat rendering is polished; live file-change/review workflow still needs direct proof.
6. [ ] Inspector and command surfaces: Activity/document/detail surfaces are usable; diff/review detail remains limited.
7. [ ] Settings and polish: account/usage and responsive behavior are in; broader settings, plugins/apps, accessibility, and packaging remain.
8. [x] Canvas foundation: project-level action, persisted local canvas state, and basic Canvas Inspector are in; automation and backend mapping remain deferred.

## Verification Baseline

Use this baseline after P03 implementation slices:

- `corepack pnpm --filter @openai/codex-desktop build`
- `corepack pnpm --filter @openai/codex-desktop smoke:real-command`
- `corepack pnpm --filter @openai/codex-desktop tauri:build`
- `.\run-codex-desktop-ui.ps1`

Manual checks should match the slice touched. At minimum, keep proving: app launches, auto-connects, project/chat selection works, Send streams, restart/reopen reconciles sidebar and main chat, and the touched UI does not create overlap or dead-space regressions.

## Next Slice Plan - Canvas Foundation And Plan Mode Inspector

### Scope

- Add the first project-owned canvas foundation inside the desktop app.
- Keep Canvas visually separate from project chat rows, and open it as a project surface.
- Open or emphasize the same project canvas from Plan Mode as an expanded Inspector/Canvas Inspector surface.
- Keep it desktop-owned for this slice. Do not add backend Generate, plan-to-canvas automation, or app-server API changes.
- Keep the normal chat/composer loop intact.

### Target Behavior

- Plan Mode can reveal an expanded canvas workspace with real editing room.
- A project-level Canvas action opens that project's canvas without requiring a new chat or Plan Mode.
- Canvas remains project-scoped if the user switches chats; normal document/file inspector content remains chat-scoped.
- Canvas state is project-level, so it is shared across chats in the same project.
- The first canvas supports simple containers and text, with current/proposed/deleted visual states.
- The user can select, move, resize, edit, delete, and lock simple canvas items.
- Editing should be disabled while a thread in the project is running.
- Normal Inspector remains a detail surface; Canvas Inspector is the spatial planning surface.
- The first implementation should avoid heavy design-tool complexity and avoid boxes inside boxes unless the canvas item itself represents a UI container.

### Implementation Notes

- Prefer focused new canvas types/components instead of growing `App.tsx`.
- Store canvas state in desktop-owned local state/persistence alongside project metadata.
- Start with simple DOM/SVG/canvas primitives already available in the stack unless investigation proves a small library is clearly worth adding.
- Make room for later layers, comments, backend mapping, and plan submission, but do not build those in this slice.
- Update `docs/Prod.md` or `docs/UI-UX.md` only if the implemented behavior changes the durable canvas direction.

### Out Of Scope

- Backend Generate.
- Automatic codebase mapping.
- Automatic plan-to-canvas synchronization.
- Multi-user/cross-device sync.
- Full design-tool features, plugins, microphone/realtime, or broad app redesign.

### Verification

- Run the P03 verification baseline.
- Launch the built app and verify Canvas is not shown as a chat-like row in the sidebar.
- Verify the project-level Canvas action opens the project canvas, and Plan Mode opens or emphasizes the expanded Canvas Inspector.
- Verify switching chats while Canvas is open keeps Canvas available for that project.
- Verify canvas state persists after switching chats and restarting the app.
- Verify editing is disabled while a project thread is running.
- Verify normal inspector/chat/composer behavior still works when canvas is closed.
- Verify narrow widths do not overlap the canvas, chat, composer, or sidebar drawer.
