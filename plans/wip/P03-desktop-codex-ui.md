# P03 - Desktop Codex UI

## Status

- State: WIP
- Location: `plans/wip/`
- Completed: No
- Current focus: project Canvas foundation is in; P02 is now active for visual planning canvas implementation. Next canvas work should improve Canvas placement/manual editing, define the explicit Canvas-to-prompt handoff, and turn prompt-only Plan Mode into Proposal Review with clear Canvas status. Backend Generate should wait until the manual loop is useful.
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
- Current Plan Mode implementation is only a prompt prefix. The desired product flow is a real Proposal Review that tells Codex whether Canvas is not attached, sparse, or usable, and gates implementation/canvas promotion behind Accept/Modify/Decline.
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
- Plan-to-canvas synchronization, explicit Use Canvas prompt handoff, backend Generate, richer layers/comments/grouping, and backend canvas mapping are not implemented yet.

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

## Next Slice Plan - Canvas Placement, Manual Editing, And Prompt Handoff

### Scope

- Improve the existing project-owned canvas foundation inside the desktop app.
- Make the Canvas entry point clearer and more intentional, ideally near the project/chat workspace header with label/tooltip behavior when space allows.
- Tighten the manual editing basics: empty state, add/edit/delete, move/resize feel, selected styling, and read-only/locked state.
- Replace text-heavy add buttons with compact draggable palette icons for Container, Text, Modal, and Divider.
- Add the first UI canvas hierarchy: top-level UI/Backend mode, compact side page menu with default Page 1/Page 2 labels, and Desktop/Mobile variant control. Backend remains a general project map without pages or device variants.
- Add compact layer rows with state color dots and icons for visibility, lock, state/change, and delete where allowed.
- Expose coordinates/dimensions in the selected item details and persisted canvas state so future plans can reason about placement.
- Define and implement the first explicit "Use Canvas" prompt/plan handoff so canvas state becomes context by user intent, not silently.
- Make Plan Mode open or emphasize the same project canvas and show room for proposed changes for the current plan.
- Keep it desktop-owned for this slice. Do not add backend Generate, automatic codebase mapping, or app-server API changes.
- Keep the normal chat/composer loop intact.

### Target Behavior

- A project-level Canvas action opens that project's canvas without requiring a new chat or Plan Mode, and the control reads as deliberate product UI rather than an unexplained icon.
- The first canvas screen clearly explains the empty project state through action-oriented UI and lets the user add the first container quickly.
- Manual canvas edits feel direct enough to be useful before automation: select, move, resize, edit, delete proposed containers, and see selected/locked/read-only states clearly.
- Page switching is quick for UI work through a compact side page menu, while Backend stays a single project-level overview.
- Right-click provides the fast path for common object edits such as layer order, duplicate/copy, lock, state/color, mark as current, reset placement, and delete.
- The user has a clear way to say "use this canvas for the next message/plan," likely through a compact composer/context affordance or nearby canvas action.
- Plan Mode can reveal an expanded canvas workspace with real editing room and show proposed changes for the plan while preserving enough chat context to understand the request.
- Canvas remains project-scoped if the user switches chats; normal document/file inspector content remains chat-scoped.
- Canvas state is project-level, so it is shared across chats in the same project.
- Editing should be disabled while a thread in the project is running.
- Normal Inspector remains a detail surface; Canvas Inspector is the spatial planning surface.
- The first implementation should avoid heavy design-tool complexity and avoid boxes inside boxes unless the canvas item itself represents a UI container.

### Implementation Notes

- Prefer focused new canvas types/components instead of growing `App.tsx`.
- Store canvas state in desktop-owned local state/persistence alongside project metadata.
- Start with simple DOM/SVG/canvas primitives already available in the stack unless investigation proves a small library is clearly worth adding.
- Basic zoom/pan is allowed only if it stays light; comfortable add/edit/move/resize and the Canvas-to-prompt handoff are higher priority.
- Make room for later layers, comments, backend mapping, and plan submission, but do not build those in this slice.
- Update `docs/Prod.md` or `docs/UI-UX.md` only if the implemented behavior changes the durable canvas direction.

### Out Of Scope

- Backend Generate.
- Automatic codebase mapping.
- Automatic plan-to-canvas synchronization beyond the explicit first Use Canvas handoff.
- Multi-user/cross-device sync.
- Full design-tool features, plugins, microphone/realtime, or broad app redesign.

### Verification

- Run the P03 verification baseline.
- Launch the built app and verify Canvas is not shown as a chat-like row in the sidebar.
- Verify the project-level Canvas action opens the project canvas, and the entry point is understandable without guessing.
- Verify empty state and basic add/edit/delete/move/resize/select behavior.
- Verify the explicit Use Canvas prompt/plan handoff appears only when appropriate and does not silently attach the canvas to every prompt.
- Verify Plan Mode opens or emphasizes the expanded Canvas Inspector and leaves enough chat context visible.
- Verify switching chats while Canvas is open keeps Canvas available for that project.
- Verify canvas state persists after switching chats and restarting the app.
- Verify editing is disabled while a project thread is running.
- Verify normal inspector/chat/composer behavior still works when canvas is closed.
- Verify narrow widths do not overlap the canvas, chat, composer, or sidebar drawer.
