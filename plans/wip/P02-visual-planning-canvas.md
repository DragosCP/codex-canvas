# P02 - Visual Planning Canvas

## Status

- State: WIP
- Location: `plans/wip/`
- Started: Yes
- Completed: No
- Related docs: `docs/Prod.md`, `docs/UI-UX.md`, `docs/Arch.md`

## Product Goal

Create a planning experience where a non-senior-engineer user can describe an idea, then review and adjust a visual plan before implementation. The plan should show current UI structure, code relationships, and proposed changes in a canvas-like view so the user and agent agree on workflow, placement, deletion, movement, reuse, and ownership before code is written.

## Core Problem

- [ ] Plans are often technically correct but not written as user workflows.
- [ ] Non-technical users cannot easily see where a button, modal, panel, route, or code feature will land.
- [ ] Agents sometimes create too many steps, admin/debug surfaces, or complicated UI.
- [ ] Feature logic can be duplicated in separate routes, services, stores, components, or methods when existing code relationships are not visible enough.
- [ ] The user may change their mind visually, and the agent needs to understand whether that means move, delete, restore, or reuse existing logic.

## Product Principles

- [ ] Fewer clicks is better.
- [ ] The canvas should clarify implementation, not become a design suite.
- [ ] Containers and text are the primary primitives.
- [ ] Current state and proposed state must be visually distinct.
- [ ] UI plans and code relationship plans must talk to each other.
- [ ] The system must make user intent readable to the LLM through more than coordinates: color, state, lock status, layer status, comments, and relationships matter.
- [ ] Avoid power-user debugging clutter unless it directly helps the end user prevent a bad implementation.

## Owner Decisions Captured

- [x] Canvas state should be project-level, not thread/chat-level, because it must be reused across all chats and threads within the project.
- [x] Normal Canvas Inspector must retarget to the active project when the user switches or adds projects, so drawing in one folder cannot persist into another folder's canvas.
- [x] Canvas is a project surface first and a Plan Mode planning tool second.
- [x] Canvas should not be represented as another chat row; it should be reachable as a project-level Inspector/workspace action.
- [x] Connections should be automatic when introduced, but it should come after the manual Canvas and Canvas-to-prompt loop feel useful.
- [x] Every plan should eventually read UI and Connections from the existing project-level canvas during planning time, while Connections is updated automatically after code changes rather than through user-approved graph proposals.
- [x] The user can view the canvas at any time, but can only edit it when no thread in that project is actively running.
- [x] If a thread is running, the canvas should be locked/read-only so the user can inspect the state without creating conflicting edits.
- [x] The user should be able to refer to the canvas from any plan or normal message, taking the canvas parameters as they exist at that moment.
- [x] Canvas edits made by the user before plan submission should be sendable back into the planning flow through a direct canvas action or an adjacent plan option.
- [x] V1 baseline entry point: a project-level Canvas action that opens the Canvas Inspector while chats remain chats. Later plans can still explore chat header or main workspace tab entry points.
- [x] Simpler v1 direction: selecting Canvas opens the project canvas, and Plan Mode opens or emphasizes the Inspector in expanded Canvas Inspector mode, large enough to behave as the primary canvas surface.
- [x] The user can reach the canvas outside Plan Mode; Plan Mode is the focused planning/editing path rather than the owner of the canvas.
- [x] Normal Inspector means details; expanded Plan Mode Canvas Inspector means spatial editing.
- [x] Inspector-style UI can still exist inside the expanded Canvas Inspector for layers, properties, comments, and plan details.
- [x] The expanded Canvas Inspector should open at a usable default width, remember width, and include one-click maximize so the user is not forced to resize before editing.
- [x] Mobile and desktop likely need separate canvases because the user experience may diverge between device classes.
- [x] Connections mapping should show feature/code clusters and high-signal relationships so less-visible implementation responsibilities can sit near larger UI/product features without hiding reuse opportunities.
- [x] Connections is living project truth for agents and humans: Codex should read it first before changing code and update it last after changing code.
- [x] V1 UI pages should default to simple labels such as Page 1, Page 2, Page 3, with user-editable names later.
- [x] V1 should prefer a compact side page menu for UI pages instead of adding more controls to the top header. The placement can change later if usage proves another layout clearer.
- [x] Add UI sub-pages for materially different states inside one page/route, such as empty chat, active chat, Inspector-open chat, settings tabs, auth OTP, onboarding steps, or repo chooser. Hide the sub-page concept when a page only has one state, except for one compact add-state icon.
- [x] Let users create a sub-page from the active page with one compact icon, switch to it immediately, and delete a non-last sub-page with confirmation when it contains items.
- [x] First Canvas surface should keep away visible Current/Proposed add toggles, Desktop/Mobile switching, page renaming, and duplicate project/canvas titles. Those can stay in the model or future workflow, but not as first-surface clutter.
- [x] Layer rows should carry the visual language with row color/treatment and a tiny info guide: blue solid for current, gold dashed for proposed, red for deleted.
- [x] Product-facing modes should be UI and Connections only. The current code may still use older internal UI/Backend names until the Connections rename is implemented.
- [x] UI/Connections mode belongs in the Canvas header row so Layers can start at the top of the canvas body. State/color changes live in selected-item Details as compact swatches.
- [x] The key owner journey is local-project bootstrap: user opens a mostly clear Canvas, asks Codex to generate the existing low-fidelity UI mockup from the local repo, manually corrects it, then reuses the canvas as living project context for future plans and CRUD updates.
- [x] The desktop composer should bring in a real `@` project-context picker. `@canvas` should attach Canvas as a visible removable context chip and serialize an explicit canvas snapshot on send; do not treat Canvas as a fake app/plugin mention in v1.
- [x] The `@canvas` picker can scope the handoff to Canvas All, UI-only, a UI page, a group, or a single item/reference, keeping Canvas references explicit instead of auto-linking every `C6`-style token in ordinary prose.
- [ ] Add explicit typed scopes: `@Canvas-UI` / `Canvas: UI` for UI canvas context, and later `@Canvas-Connections` / `Canvas: Connections` for current Connections graph context. Keep `@Canvas` as Canvas All or picker entry.
- [x] Canvas snapshots should include a stable coordinate contract: raw `xywh`, resolved bounds, visible-grid coordinates, and normalized coordinates. The parser should accept exact `xywh`, `grid`, or `norm` rectangles so generated mockups can use the cleaner language later.
- [x] Make item coordinates local to the active sub-page when sub-pages exist, so future references like `P1.2 C6` do not depend on global canvas placement or overview layout.
- [x] Keep layer rows plain: reference code, name, visibility, neutral lock, delete where allowed. Remove extra tiny shape/type icons and separate state swatch shapes.
- [x] Do not show raw item IDs or database counters in the canvas UI. Use human reference codes such as `C1`, `B1`, `T1`, `M1`, and `D1`; keep stable IDs internal for persistence and LLM references.
- [x] Do not add a big Save button in the first surface. Prefer debounced autosave of the latest project canvas snapshot, with deliberate snapshots/checkpoints only later if users need alternatives.
- [x] Add a small Button primitive to represent UI buttons without forcing users to fake them as full containers.
- [x] Remove lock icons from inside canvas shapes. Color and border style carry state; lock controls can stay in Layers/Details.
- [x] Delete behavior should be state-aware: proposed gold items can be removed; current blue items should become deleted/red instead of disappearing.
- [x] Moved existing items should show the accepted/original geometry as a grey ghost plus the latest moved position in the item's normal state color, so proposal review stays readable without showing intermediate move history.
- [x] In Plan Mode proposal review, moved items preserve their blue/gold/red state color unless the proposal explicitly changes state; Accept saves the moved coordinates as truth and removes proposal-only original-position ghosts from changed items.
- [x] Reserve grey original-position ghosts mainly for LLM proposed movement against accepted truth. Human edits inside an unapplied generated current-UI draft should be direct edits without a grey diff for every drag.
- [x] Details should not duplicate layer/right-click actions: remove persistent lock/unlock and delete controls from Details, and show reset placement only for moved current items.
- [x] Layer rows should use neutral lock icons and carry state through the whole row color/treatment, with sorting by review priority: deleted, moved current, proposed, current.
- [x] Layer action tooltips should say what pressing the icon does, such as "Unlock position" or "Lock position", not only the current state.
- [x] Use undo/redo for accidental state/text/placement edits instead of exposing full provenance history in the first Layers UI.

## Phase 1 - Research And Product Validation

- [x] Review the current app-server/backend capabilities in this repo for threads, turns, plans, diffs, filesystem, shell commands, and stored state.
- [x] Review current examples from Figma/FigJam, Canva, and Adobe XD for canvas behavior, layers, grouping, locking, artboards/pages, right-click actions, and editable AI-generated layers.
- [x] Write a short gap analysis: what we can reuse, what we must build, what is risky, and what should stay out of v1.
- [x] Confirm whether the first version should be local-only, app-server-backed, or embedded into an existing Codex app/client surface.

Findings: `plans/wip/P02-phase1.md`. Recommendation: keep v1 local-only, desktop-owned, embedded in the existing Canvas Inspector, and manual-first before Connections indexing/maintenance.

## Phase 2 - UI Canvas Model

- [x] Define a custom UI canvas model, not React Flow.
- [x] Support pages/routes as a compact side page menu for the UI canvas, defaulting to Page 1, Page 2, Page 3, etc.
- [ ] Let users rename default pages later without requiring full route/path names, but keep rename controls out of the first surface.
- [x] Keep desktop/mobile in the model for later, but do not expose a first-surface switch until the manual canvas loop needs it.
- [x] Keep UI/Connections as the top-level visible mode; page controls exist only under UI, while Connections remains a general project graph view.
- [x] Support container, text, modal, and divider primitives.
- [x] Add a small button primitive.
- [ ] Require each container to have at least one text item.
- [x] Give every container a generated name that the user can edit.
- [x] Support comments per container for the agent to read.
- [x] Support layers with visibility, lock status, ordering, and names.
- [x] Support internal stable identifiers for containers to improve agent-readable precision.
- [x] Hide raw identifiers and numeric counters from the user-facing canvas UI.
- [x] Add stable human reference codes for all item kinds, such as `C1`, `B1`, `T1`, `M1`, and `D1`, for user instructions and LLM serialization.
- [x] Provide a better empty state that makes it obvious what the canvas is for and how to add the first container without turning the surface into a tutorial page.
- [x] Provide a "Generate current UI mockup" bootstrap path for a fresh canvas, separate from later Connections indexing/maintenance.
- [x] Treat generated current UI containers as reviewable/editable output; the user can correct placement, names, states, and page assignments before using them as trusted context.
- [x] Use small draggable palette icons for Container, Text, Modal, and Divider instead of text-heavy add buttons.
- [x] Add Button to the compact draggable palette.
- [x] Store page/device, dimensions, z-order, state/color, lock, visibility, and parent/group relationships for every item, and derive normalized/grid coordinates for serialization.

Status note: Phase 2 has a first implemented slice in `apps/desktop/src`: canvas state now migrates to a versioned UI/Backend model in code, while product naming is shifting to UI/Connections. The UI canvas has simple side pages, sub-pages, hidden desktop/mobile metadata, richer item metadata, compact palette icons, layer rows with row-level state treatment, collapsible bounded Details, coordinates, comments, Button primitive support, stable human reference codes, hidden internal IDs, recent undo/redo, derived grid/normalized serialization, and reviewable generated current-UI mockup ingestion through the normal `@Canvas` suggestion flow. Remaining Phase 2 work is stricter text-child modeling and further verification of sub-page-local coordinates in generated mockups.

### Phase 2G - Generated Current UI Mockup Polish

Findings from the first `vision-weaver-main` run:
- The app captured a pending `CanvasSuggestion`; accepted canvas state still had only the two old items, so the generated 67-item result was safely separate from accepted truth.
- The visible chat exposed the long internal Generate prompt and the raw parseable `canvas-proposal` block, which is useful for the parser but too noisy for the end user.
- The Canvas suggestion review appears in the turn body, so it scrolls away instead of staying fixed above the composer while the user decides Apply/Dismiss.
- The generator correctly found broad surfaces: chat, settings/admin, auth, onboarding, and repo chooser. It also created very large page-sized blue shells (`2400x1599`) and many nested current items, which made the board hard to read and the Layers list heavy.
- Old sparse/proposed items from the accepted canvas leaked into the generated draft, so the review mixed "generated current UI" with unrelated previous experiments.

Plan:
- [x] Render generated-mockup prompts compactly in chat: show a simple "Generate current UI mockup" user bubble instead of the full parser instruction wall, while still sending the full prompt to Codex.
- [x] Hide or collapse parseable `canvas-proposal` blocks from normal assistant rendering once a `CanvasSuggestion` snapshot is captured; keep the stored raw text available for debugging/audit only.
- [x] Move the active generated Canvas suggestion review to a fixed top-of-composer strip until Apply/Dismiss, with compact copy such as "Generated current UI draft - 67 items, 4 pages".
- [x] Keep the accepted canvas and generated draft distinction explicit: blue/current items inside the draft mean "existing UI found by the generator", not accepted truth until Apply.
- [x] Let the user edit an unapplied generated draft directly. Do not create original-position grey ghosts for every manual correction; keep grey ghosts for LLM-proposed movement against accepted truth.
- [x] Add a generation base policy for empty/sparse canvases so a fresh generated current mockup can replace the generated draft/page without mixing unrelated old proposed items unless the user explicitly asks to preserve them.
- [x] Tighten the Generate prompt so it asks for readable pages and sub-pages: separate routes into pages, and split dialogs, auth/onboarding states, active/empty chat states, Inspector-open states, and materially different settings/admin tabs into sub-pages with local coordinates.
- [x] Render sub-pages one at a time by default. If a page has only one sub-page, hide the sub-page label; if it has multiple, expose compact labels such as `P1.1 Empty`, `P1.2 Active`, and `P1.3 Inspector`.
- [x] Persist sub-page identity in items/groups and serialized `@Canvas` context so references can use `P1.2 C6` without relying on global board placement.
- [x] Tune generated drafts toward compact per-screen sketches: prompt uses a `0..36 x 0..24` grid per sub-page, tells Codex not to output page/background shell containers, and the parser drops oversized generated shell/background items if they still come back.
- [x] Add visible Saving/Saved confidence for Canvas autosave, and flush the latest desktop snapshot on page unload so generated-draft Apply/Dismiss and destructive edits are less likely to reappear after restart.
- [x] Keep the normal Canvas Inspector project-scoped during project switches and folder adds; only proposal/suggestion canvases may stay attached to a specific review record.
- [x] Keep generated draft review controls below the summary text in the composer strip so Canvas/Apply/Dismiss do not compete with the message copy.
- [x] Add the first anti-flash guard: while a turn is running, refresh events keep the active thread and Inspector target stable instead of retargeting to stale activity/file views.
- [x] Keep the running-turn activity row stable while the model is thinking, even before activity items arrive, so the progress surface does not blink in and out.
- [x] Hide parseable Canvas proposal payloads from normal chat rendering even when Codex returns them in a generic code block or loose proposal lines instead of a fenced `canvas-proposal` block.
- [ ] Verify with `vision-weaver-main`: no visible raw proposal dump, no reasoning/loading flashes during a fresh generation run, fixed review strip remains visible while scrolling, generated pages/sub-pages are easier to inspect, and Apply promotes the draft cleanly.

Status note: The generated mockup polish slice now renders the Generate request as compact chat text, hides parser-heavy proposal blocks/lines after a suggestion snapshot exists, keeps the active suggestion review above the composer with controls at the bottom, uses a fresh generated-draft canvas base instead of mixing old experiments, tightens the prompt around pages/sub-pages and giant shells, post-cleans oversized generated shells, keeps active thread/Inspector targeting and the thinking row stable while a run is active, and shows a small Canvas Saving/Saved indicator.

## Phase 3 - Visual State Language

- [x] Current UI is blue, full border, normally locked.
- [x] Proposed UI is gold, dashed, editable, movable, and deletable.
- [x] Deleted current UI is red or hidden with a clear deleted-state layer.
- [x] Layers expose color and line style through row treatment plus a compact info guide instead of a prominent Current/Proposed add toggle.
- [x] Selected-item Details exposes only a compact blue/gold/red state picker for changing state/color.
- [x] Selected-item Details orders state buttons as proposed/gold, current/blue, deleted/red.
- [x] Move the state visual language into a compact config/constants object that both UI code and future LLM serialization can reference.
- [x] Remove moved-current from the user-facing state picker; movement should be an automatic condition/metadata, not a fourth state button.
- [x] Moved current UI has distinct changed-position metadata so the agent can read movement as deliberate, not only infer it from changed coordinates.
- [x] If a locked-off current panel is moved without confirmed state change, show its original position as a grey dashed outline.
- [x] Offer reset placement to animate or return the moved panel to the saved coordinates, and show that control only in the moved condition.
- [ ] Allow "mark as current" so accepted future panels become current panels after implementation.
- [x] Track raw canvas coordinates, visible-grid coordinates, normalized coordinates, and resolved rectangle bounds in serialized snapshots.
- [x] Store `left`, `top`, `right`, `bottom` for each item/group in canvas units, in addition to `x`, `y`, `w`, and `h`; rounded shapes still serialize their bounding rectangle.

## Phase 4 - Canvas Interaction Rules

- [x] Click selects a container.
- [x] Locked items still select from the canvas and highlight the matching Layers row; lock only blocks move/resize.
- [x] Selected item styling should be obvious and premium, with handles/actions that make edit, move, resize, and delete feel direct.
- [x] Selected canvas items/groups and Layers rows have stronger selected-state treatment.
- [x] Escape deselects.
- [x] Delete removes only temporary/proposed containers. Delete on current/blue should mark the item deleted/red instead of dropping it.
- [x] Gold delete is permanent delete, blue delete is a red mark-as-deleted affordance, and red/deleted rows do not show a normal delete action.
- [x] Mouse wheel and trackpad pinch zoom the canvas without treating smooth two-finger scroll as mouse-wheel zoom.
- [x] Two-finger trackpad scroll, shift/horizontal wheel, middle-mouse drag, and Space+drag move the canvas.
- [x] Enable the desktop WebView pinch path while preventing whole-page zoom so pinch can be handled by Canvas.
- [x] Increase native pinch-gesture sensitivity to match the faster wheel zoom feel.
- [x] Add compact toolbar controls for zoom in, zoom out, fit/reset view, undo, and redo.
- [x] Hold Shift while dragging an unlocked item/group to constrain movement to the strongest axis.
- [x] Delete/Backspace keyboard behavior follows the same state rules as layer delete.
- [x] Right-click on canvas/container opens contextual actions for bring to front, send to back, duplicate, lock/unlock, state changes, apply/reset position when available, and delete where allowed.
- [ ] Add copy and richer visibility actions to the context menu later if they earn their place.
- [x] Add multi-select: drag empty canvas to marquee-select items, Ctrl+click to toggle items/groups in or out, empty click to clear selection, and Escape to clear selection.
- [x] Add Group/Ungroup after multi-select; grouping is explicit from right-click, never automatic on marquee selection.
- [x] Group only same-state items; block mixed blue/gold/red group creation.
- [x] Represent groups as real entities with stable references such as `G1`, child references, shared state behavior, and grouped serialization for `@Canvas`.
- [x] Treat groups as relationships instead of extra shapes: group-level position lock plus ungroup, with no group delete control.
- [x] Clicking any grouped child selects the whole group; grouped children are not independently editable until ungrouped.
- [x] Dragging an unlocked group moves the whole group while preserving child spacing; locked groups do not move.
- [x] Moved current groups expose Apply group position and Reset group position; both act on moved children and lock the group afterward.
- [x] Ungrouping a moved current group preserves child movement metadata so child-level apply/reset still works.
- [x] Show groups in Layers with a group row, indented child rows, connector lines, and clear spacing before/after the group.
- [x] Use the largest/outer contained item as the group primary coordinates when grouping nested UI panels; children normally stay inside or touch the parent boundary.
- [x] Blank-canvas right-click can add simple items without opening the browser/WebView menu.
- [ ] Keep the tool palette minimal, likely near the right-side layer panel.
- [x] Use translucent planning fills, longer temporary/original dashes, and simple drag-to-front z-order behavior.
- [x] Keep Details compact: selected reference/kind in the Details header, one-line default note fields, inline X/Y/W/H fields, and a wider right panel.
- [ ] Lock editing while any thread in the project is running, but keep view access available.
- [x] Do not render lock icons inside canvas shapes; keep lock/unlock affordances in Layers and right-click actions, not as duplicated Details buttons.
- [ ] If the canvas is the active workspace, prevent accidental chat submission from the same surface; chat and canvas should not compete for the same send action.
- [ ] Avoid nested panels in the UI unless there is a clear reason.

## Phase 5 - Connections Code Relationship Model

- [ ] Add a Connections tab next to the UI tab.
- [ ] Connections is a project-level blank graph surface, not split by UI page, sub-page, Desktop/Mobile variant, or UI coordinate board.
- [ ] Treat graph nodes/edges/clusters as the source of truth. View coordinates may exist only as presentation or user-pinned layout.
- [ ] Connections is current truth, not a proposal surface. Do not use UI Canvas blue/gold/red states or Apply/Dismiss for ordinary graph maintenance.
- [ ] Run a one-time project mapping/indexing pass when needed, especially for mid/large projects. New or tiny projects may build Connections progressively as Codex works.
- [ ] Keep scan/index/update controls in the Canvas header/status area, not inside graph nodes.
- [ ] Represent Feature, UI item, File, Class, Function/Method, Store/State, API/Handler, Persistence, External, Job/Worker, and Tool nodes only when they help explain the current task.
- [ ] Support high-signal relationships such as contains, imports, calls, inherits, renders, reads/writes, persists, triggers, attaches-to, reuse-candidate, and possible-duplicate.
- [ ] Map code nodes to UI Canvas items or product feature clusters where possible, so a planned UI change can visibly attach to existing implementation ownership.
- [ ] Support zoom-driven detail: zoomed out shows product/feature areas, medium zoom shows ownership clusters, and close zoom shows files/classes/functions/methods/calls/data flow.
- [ ] Prefer task-focused neighborhoods over full-repo views. A deeper project graph/index may exist for agents, but the user-facing surface should show the relevant slice at the current zoom level.
- [ ] Update the graph progressively from explicit local index data and observable agent signals such as searches, file reads, edits, and tool calls. Do not rely on hidden model thinking as graph evidence.
- [ ] Use Connections mapping to prevent duplicate routes, services, stores, components, methods, tools, or persistence paths for the same feature.
- [ ] Present duplication as graph emphasis rather than state: strengthen or highlight the active/reuse/conflict path, and avoid making the user approve routine graph changes.
- [ ] Let users reference graph nodes/edges from right-click or the composer picker; right-click actions should be "Reference in composer", "Ask about this", and "Flag as wrong", not graph-editing buttons.

## Phase 6 - Plan Integration

- [ ] Add a project-level Canvas action that opens the visual planning canvas before selecting a specific plan.
- [ ] Add a unified Plan Proposal Review flow that treats written plan text and canvas proposal snapshot as one proposal.
- [x] Replace prompt-only Plan Mode with a first proposal shell: create plan proposal state, render a compact review strip, and gate implementation behind Accept/Modify/Decline.
- [x] Add a Canvas action on plans to focus the visual planning canvas on that plan's proposal snapshot.
- [x] Make Canvas references in the plan proposal strip clickable so `C5`, `B1`, `G2`, etc. open the proposal snapshot and focus the matching item/group.
- [x] Keep Accept/Modify/Decline owned by the chat-side plan card; the proposal Canvas view identifies the proposal but does not show a second approval system.
- [ ] Plan Expand should show the accepted current canvas and the proposed plan snapshot together, using current/proposed/deleted visual states plus moved-current ghost metadata.
- [ ] Recommended v1: Plan Mode opens or emphasizes the Inspector in expanded Canvas Inspector mode where the plan/chat context stays visible and the canvas gets enough room for pan, zoom, move, and placement.
- [ ] Add one-click maximize for the canvas inside Plan Mode.
- [ ] Use Inspector-style details for layers/properties/comments, but distinguish normal Inspector from expanded Canvas Inspector.
- [x] Plan Mode prompt construction should automatically include the active project Canvas when available and include Canvas status: empty, sparse, or usable.
- [x] Plan Mode brings Canvas forward as a reversible emphasis: turning Plan Mode off closes the active Canvas view so chat space returns.
- [x] If Canvas is empty, Plan Mode should explicitly tell Codex not to invent existing canvas references or precise current coordinates.
- [x] If Canvas is empty/sparse, Plan Mode should say the canvas is not reliable current-state truth and Codex may suggest a bootstrap canvas proposal or recommend generating a current UI mockup first.
- [x] If Canvas has usable data, Plan Mode should request plan text plus optional canvas proposal snapshot when the plan affects UI layout, workflow, deletion, movement, code ownership, or reuse.
- [x] Plan Mode should tell Codex not to mutate accepted files or the accepted project canvas before user approval; proposed canvas data belongs in proposal state only.
- [x] Generate plan canvas proposal snapshots during planning time from the existing project-level canvas, even before the user clicks Expand.
- [ ] Render the current plan as proposed UI changes while reading Connections as current code truth. After accepted implementation, update affected Connections neighborhoods automatically.
- [ ] Make the canvas changes feed back into the written plan.
- [x] Let user canvas edits update the pending proposal snapshot before final Accept/Decline.
- [x] Keep accepted project canvas untouched while a proposal is reviewed; parsed proposal edits happen on the snapshot copy.
- [x] Accept promotes the proposal snapshot to the project canvas, clears proposal-only original-position metadata from changed items, and continues implementation.
- [x] Accept exits any stale proposal Canvas view and returns the Inspector to the accepted project Canvas; Decline closes an open proposal Canvas and returns the Inspector to a neutral state.
- [x] Modify captures the latest proposal snapshot changes into a compact revision draft when pressed, instead of rewriting the prompt after every drag.
- [x] Modify/Re-analyse submits the latest proposal snapshot changes directly when there is a visual delta; if there is no visual delta, it falls back to a typed revision draft.
- [x] Decline discards the stored canvas proposal snapshot and marks the written plan proposal declined.
- [x] Sending a new prompt in the same chat marks older pending plan proposals as replaced, so stale Accept/Modify/Decline rows do not remain active.
- [ ] Do not add chat-level "Apply to Canvas" controls. Chat can show a compact Canvas summary with clickable references, while Canvas owns the visual review.
- [x] In Plan Mode, use the current project Canvas automatically so the user does not need a separate "Use Canvas" handoff.
- [x] Add `@canvas` to the real composer picker as an equivalent low-click handoff, with Canvas shown as project context above files/folders.
- [x] When Canvas is selected from the picker, show a removable composer chip and send a compact serialized snapshot rather than only the literal `@canvas` text.
- [x] Let `@canvas` narrow to pages, groups, and individual items such as `C6`, with the composer chip showing the selected Canvas scope and the prompt serialization including only that explicit scope.
- [ ] Add `@Canvas-UI` as an explicit UI-only handoff and chip label such as `Canvas: UI`; it should serialize only UI canvas state and request `canvas-proposal` when changes are relevant.
- [ ] Add `@Canvas-Connections` later as an explicit Connections-only handoff and chip label such as `Canvas: Connections`; it should serialize current graph state for agent/user queries, while routine graph updates happen automatically after scans and code changes.
- [x] Let normal `@Canvas` chat responses create lightweight Canvas suggestion snapshots when Codex returns parseable canvas-proposal lines; show a compact card with clickable references, open the suggestion in Canvas, and support Apply/Dismiss without using full Plan Mode controls.
- [x] Do not silently attach the full project canvas to every normal prompt; summarize or snapshot canvas state only when the user explicitly attaches Canvas or when Plan Mode makes that relationship clear.
- [x] Allow proposal lines to use `grid=...` or `norm=...` rectangles in addition to exact `xywh=...`, resolving all of them back into canvas units for review.
- [ ] Let future prompts and plans update the same project canvas over time, including CRUD operations on items when the user asks Codex to reflect accepted changes.
- [ ] Show changed, deleted, moved, and new elements in both the canvas and plan.
- [ ] Keep written plan language UX/workflow-first, with implementation detail only where needed.
- [ ] Keep the canvas readable by both the user and the agent.

Status note: Plan Mode now has a first desktop-owned proposal shell, automatically snapshots the active project Canvas, parses compact visual proposal text, shows clickable canvas references in the proposal strip, and opens the stored proposal snapshot in the Inspector for direct editing. The accepted project canvas remains untouched until Accept; Accept/Decline exit stale proposal views, Modify/Re-analyse sends the current proposal-snapshot delta back to Codex in one click when visual changes exist, new prompts replace older pending plan cards, and the Canvas view no longer duplicates the chat-side approval buttons.

## Phase 7 - Persistence And Agent Readability

- [ ] Store canvas state at project level so multiple chats/threads can reuse the same current and proposed layout knowledge.
- [x] Treat the project-level canvas as shared project context that a plan or message can snapshot at the moment it is submitted.
- [x] Autosave the latest project-level canvas snapshot with debounce instead of storing every interaction event.
- [x] Store plan proposal snapshots separately from the accepted project canvas until the user accepts or declines the proposal.
- [x] Keep stable internal item IDs, but avoid visible IDs/numbers in normal UI.
- [ ] Persist user-facing reference codes for current, proposed, deleted, moved, and grouped panels.
- [ ] Define persisted mockup state for current, proposed, deleted, movement metadata, and grouped panels.
- [ ] Persist comments, page/route, device mode, layer order, lock state, visibility, coordinates, dimensions, and later Connections mappings.
- [ ] Details for a selected canvas item should include name, state, created/updated time, plan reference, coordinates/dimensions, and an agent-readable comment without exposing noisy debugging internals.
- [x] Keep a compact serialized format that can be read by an LLM without needing screenshots.
- [ ] Store enough state to resume planning after app reload/restart.
- [ ] Avoid storing noisy interaction history unless it changes final intent.

## Phase 8 - Verification Expectations

- [ ] Manually run the app locally after implementation.
- [ ] Verify creating, moving, resizing, editing, deleting, grouping, locking, layer toggling, and marking as current.
- [ ] Verify current panels cannot be accidentally deleted.
- [ ] Verify reset placement for moved current panels.
- [ ] Verify plan text updates from canvas changes.
- [ ] Verify Connections indexing produces a useful task-focused graph from an existing project.
- [ ] Verify mapped Connections/UI nodes help avoid duplicate route/service/store/component creation.
- [ ] Verify persisted canvas state survives reload/restart.
- [ ] Verify console logs, persisted state, and automated tests for touched modules.

## Research Notes

- Figma/FigJam uses an open canvas with pages, sections, sticky notes, text, shapes, connectors, and diagramming; useful pattern: fast spatial thinking with lightweight objects. Source: https://help.figma.com/hc/en-us/articles/1500004362321-Guide-to-FigJam
- Figma treats canvas zoom/pan as object-level viewport behavior with zoom-to-fit and zoom-to-selection; useful pattern: canvas editing needs a real viewport, not only a side detail panel. Source: https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options
- Miro places board navigation controls, fit-to-screen, minimap, zoom, pan, select/hand mode, and full-screen behavior around the board; useful pattern: canvas tools need spatial room and clear navigation controls. Source: https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen
- Fluent drawer guidance treats drawers as supplemental surfaces for simple actions and suggests a more focused surface for longer or complex workflows; useful pattern: a narrow Inspector should hold details, not the primary canvas editor. Source: https://fluent2.microsoft.design/components/web/react/core/drawer/usage
- Figma sections are used to organize canvas areas, link groupings of designs, and mark content as ready for development; useful pattern: explicit current/proposed group regions. Source: https://help.figma.com/hc/en-us/articles/9771500257687-Organize-your-canvas-with-sections
- Adobe XD emphasizes artboards, layers, grouping, components, search, lock/hide, duplicate, delete, and jumping to artboards from layers; useful pattern: pages/routes as navigable artboards. Source: https://helpx.adobe.com/ca/xd/help/layers.html
- Canva grouping/locking emphasizes moving grouped elements as one unit while still allowing fine-grained editing when unlocked; useful pattern: grouped containers that can be protected or edited without exposing heavy tooling. Source: https://www.canva.dev/docs/apps/grouping-elements/
- For this product, avoid copying full design-tool complexity. The useful subset is containers, text, layers, lock/group/order, page/device modes, comments, and clear current-vs-proposed state.

## Open Questions

- [ ] Should v1 use expanded Canvas Inspector by default, with full workspace tabs deferred until the canvas proves useful?
- [ ] Should later versions add extra canvas entry points as a main workspace tab, near the chat/thread header, or inside more than one surface?
- [ ] Should the first product version make Chat and Canvas mutually exclusive workspace modes so the user cannot edit canvas and send chat from the same active surface?
- [x] What is the exact v1 UI for "Use Canvas in the next prompt": use the `@canvas` composer picker plus removable Canvas chip for normal prompts, and automatic Canvas context in Plan Mode when usable. Next refinement: make scope explicit with `Canvas: All`, `Canvas: UI`, and later `Canvas: Connections`.
- [ ] Should mobile and desktop start as definitely separate canvases in v1, or should research first prove whether one shared page with variants is enough?
- [ ] What exact Connections visual language is clearest for reuse: feature clusters, symbol neighborhoods, duplicate radar edges, zoom-revealed detail, or a small combination of these?
- [ ] What is the minimum automatic scan/index that can catch duplicate state/routes/services/components/methods without overwhelming the user with code noise?
