# UI / UX Direction

## Desktop App V1 Direction

- P03 focuses on the app itself before the visual planning canvas.
- V1 should prove the core loop: add a local project/folder, create or resume a chat, send a prompt, stream the assistant response, show agent commands, review file edits, handle permissions, and persist projects/chats/layout after restart.
- The attached desktop screenshots are workflow references, not a pixel-perfect spec. Reuse useful patterns such as the project sidebar, composer controls, permissions/model menus, file cards, inspector/document panel, and progress/status surfaces.
- Use a read-only or mostly read-only Command Output Surface for inspecting commands the agent ran through Codex; do not make V1 a general-purpose interactive terminal emulator.
- Keep advanced surfaces such as the full canvas, rich plugin management, automations, microphone/realtime, and polished account upsells deferred until the core loop works.
- The first shell in `apps/desktop/` uses a three-panel layout with sidebar, chat/composer, inspector, plus a bottom read-only Command Output Surface. Keep tightening density and workflow polish around the core loop before adding canvas, microphone, or advanced admin surfaces.
- Normal users should not need to click Connect. The desktop shell should start/connect automatically, show clear starting/connecting/connected/failed states, and preserve a retry action only for failures. Mock/demo backend modes must be labeled honestly.
- The composer primary Send action must stay visible at normal desktop window sizes. Retry should appear only after a real previous prompt and must read as secondary. Disabled sends need an inline reason, and send failures must surface in the composer instead of becoming silent no-ops.
- Retry belongs to the current recoverable prompt only. It should resend the same prompt with the same project/model/effort/permission/Plan Mode settings where possible, and should clear when the user changes project, selects another chat, starts a new chat, or archives the failed chat.
- New Chat opens a session-local draft for the selected project. It should not create a backend thread until the first Send/Enter. Draft text and attachments should survive switching chats during the app session, and empty inactive drafts should not appear as saved chats.
- Composer controls should behave like a compact chat product surface: textarea first, one simple plus menu for Add photos & files and Plan Mode, permissions/model controls as contained popovers, and no persistent instruction text under the control row.
- Attachments should stay quiet: filename first for non-images, with at most one small useful state such as Ready or Unsupported. Images attach directly as removable thumbnail cards, and clicking an image opens a large preview with keyboard left/right navigation. Text/code/Markdown files are ready for tool inspection, not automatically loaded into context; unsupported files should block Send with simple copy.
- Left navigation should feel like product navigation, not nested content cards. Projects and chats are slim rows by default; hover and selected states may use subtle row backgrounds, but nav should avoid boxed chat-list regions and cards inside cards.
- Project chats belong under their project in the sidebar for V1. Global Chats remains deferred until there is a clearer product reason and backend/search behavior to support it honestly.
- Settings/account belongs in a compact bottom-left sidebar popover, not the right inspector. Show usage only when real app-server rate-limit data is available; otherwise omit it. "Usage remaining" should show remaining quota, not backend consumed quota.
- Sidebar, chat history, inspector, and long command output should scroll independently. The composer should stay reachable, and long messages or diffs should never stretch the whole app shell.
- Hidden panels should not reserve dead space. If the inspector is closed, the chat workspace uses the available width; if it is open, it must show useful activity or detail content.
- Inspector detail is scoped to the active chat. When the user switches chats, retarget the inspector to that chat's first Markdown edit if one exists; otherwise return to Activity/empty rather than showing stale files from another chat.
- The inspector should be resizable by the user and document previews should wrap readable content rather than creating inner horizontal scrollers. Markdown-like text in chat and inspector should use product styling for headings, links, paths, and inline code instead of looking like a raw dump.
- The desktop shell must adapt before controls overlap: the chat column and composer footer should shrink/wrap first, and the inspector should stay open until the window reaches a truly tight breakpoint. When auto-collapsing at that breakpoint, update the inspector toggle state/icon so the UI says the panel is closed.
- When the Inspector/Canvas is open, resizing should prioritize real workspace room: the right panel may grow until chat is phone-like, the left navigation should collapse into the drawer before chat drops below phone width, and the Inspector/Canvas itself should keep a phone-like minimum width rather than becoming unusably narrow.
- At phone-like widths, the left navigation should move into a slide-in drawer with an obvious reopen control instead of forcing the chat/composer to overlap or reserve unusable width.
- Empty command output should stay out of the way. Show a compact read-only Commands dock only after commands exist.
- Agent commentary is progress/status activity, not final assistant prose. Render `final_answer` as the main response; render `commentary` as compact secondary progress that can collapse after completion.
- In the desktop chat, the default completed-turn view should show the final output only, with a compact "Worked for..." or "Thought process" reveal above it. Commands belong inside that reveal as slim text rows under "Ran x commands"; do not render command cards, command panels, or inspector command details by default.
- The "Worked for..." divider should span the same readable width as the assistant output, not stop at the timestamp. Expanded thought-process text should use normal readable foreground, while command rows stay secondary/muted with a command icon.
- Edited-file summaries should stay lightweight in the chat: show "Edited x files", list the first three files with `+/-` line counts, then "Show x more files" for the rest. Markdown file rows may open the document inspector; do not load large diffs into the inspector by default.
- Internal audit/proof prose such as "Evidence surfaces include..." should not appear in the normal assistant answer surface. Keep persisted transcript data intact, but hide scaffolding-style evidence paragraphs from the product chat display.
- Command and sandbox failures belong in command surfaces, not as normal assistant body text. A missing sandbox dependency such as `bubblewrap` should read as a failed command/sandbox issue, distinct from a failed assistant answer.
- Primary workflow headers should lead with project and chat names. Full filesystem paths, WSL/runtime labels, and backend details belong in hover text, settings, or error details.
- Model controls should not say ambiguous defaults when the backend state is known or still loading. Show the selected model, configured model, loading state, or error state.
- Context usage belongs in the composer footer as a compact meter. Show real percentages and token counts only from the latest active context-window usage, never from cumulative lifetime token spend; if usage is missing or internally inconsistent, show a quiet unavailable state. Compaction appears in chat as a slim timeline divider, not a normal assistant message.
- For WSL-backed projects, users should be allowed to paste or recognize normal Windows paths, while the app quietly uses WSL runtime paths behind the scenes. If path conversion fails, the app should explain the problem in user language.
- After restart or reconnect, the sidebar, main chat, and composer must reconcile to the same valid thread. If a saved thread is missing or not loadable, clear it or create a recoverable new chat state; never leave old messages visible while the sidebar says no chats, and never expose raw thread IDs as the user's problem.

## Planned Canvas Experience

- Canvas is project-owned visual working memory, not a Plan Mode-only object.
- Canvas should not appear as another chat row. It belongs to the project and can live as a project-level Inspector/workspace action.
- Plans should be reviewable visually before implementation, not only as technical text.
- Every plan should prepare UI/backend canvas updates from the existing project-level canvas during planning time, rather than creating a new canvas.
- Recommended v1: a project-level Canvas action opens the canvas surface, and the Plan Mode toggle in the chat composer footer opens or emphasizes the same canvas in expanded Canvas Inspector mode.
- Expanded Canvas Inspector should open at a useful default size, remember width, and offer one-click maximize for detailed spatial editing.
- Normal Inspector is for details. Expanded Plan Mode Canvas Inspector is for spatial editing.
- Inspector-style details can live inside the expanded Canvas Inspector for layers, properties, comments, and plan controls.
- The canvas can be viewed from the project at any time; Plan Mode is a focused planning/editing path, not the only way to reach it.
- Unlike Markdown/document inspector selections, Canvas is scoped to the active project rather than a single chat. If Canvas is open and the user switches chats in the project, the Canvas view should remain available instead of retargeting to a chat document.
- Broader canvas access from the chat/thread header or a main workspace tab can be deferred until a later interface plan.
- The user can view the canvas at any time, but editing should be locked while any thread in the project is running.
- A user should be able to feed canvas edits back into a pending plan before final submission.
- Current UI should appear as locked blue containers. Proposed UI should appear as editable gold dashed containers. Deleted current UI should be visibly red or hidden behind an explicit deleted layer.
- Mobile and desktop likely need separate canvases because the user experience can diverge substantially.

## Interaction Principles

- Fewer clicks is better.
- The user should work mostly with containers and text, plus minimal primitives such as modal and divider.
- The user should be able to select, move, resize, edit, delete proposed containers, group/ungroup, lock/unlock, comment, reset placement, and mark proposed work as current.
- Chat and canvas should not compete for the same active input surface; Canvas may be selected as a project row while Plan Mode gives it focused editing emphasis.
- The canvas should avoid heavy design-tool complexity, admin/debug clutter, and boxes inside boxes unless there is a clear workflow reason.
- Backend visuals should help the user notice reuse opportunities, such as an existing state or route that should receive a new feature instead of creating a duplicate path.
