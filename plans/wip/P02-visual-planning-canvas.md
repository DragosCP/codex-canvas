# P02 - Visual Planning Canvas

## Status

- State: WIP
- Location: `plans/wip/`
- Started: Yes
- Completed: No
- Related docs: `docs/Prod.md`, `docs/UI-UX.md`, `docs/Arch.md`

## Product Goal

Create a planning experience where a non-senior-engineer user can describe an idea, then review and adjust a visual plan before implementation. The plan should show current UI/backend structure and proposed UI/backend changes in a canvas-like view so the user and agent agree on workflow, placement, deletion, movement, and backend ownership before code is written.

## Core Problem

- [ ] Plans are often technically correct but not written as user workflows.
- [ ] Non-technical users cannot easily see where a button, modal, panel, route, or backend feature will land.
- [ ] Agents sometimes create too many steps, admin/debug surfaces, or complicated UI.
- [ ] Backend features can be duplicated in separate routes or services when the existing architecture is not visible enough.
- [ ] The user may change their mind visually, and the agent needs to understand whether that means move, delete, restore, or reuse existing logic.

## Product Principles

- [ ] Fewer clicks is better.
- [ ] The canvas should clarify implementation, not become a design suite.
- [ ] Containers and text are the primary primitives.
- [ ] Current state and proposed state must be visually distinct.
- [ ] Backend and UI plans must talk to each other.
- [ ] The system must make user intent readable to the LLM through more than coordinates: color, state, lock status, layer status, comments, and relationships matter.
- [ ] Avoid power-user debugging clutter unless it directly helps the end user prevent a bad implementation.

## Owner Decisions Captured

- [x] Canvas state should be project-level, not thread/chat-level, because it must be reused across all chats and threads within the project.
- [x] Canvas is a project surface first and a Plan Mode planning tool second.
- [x] Canvas should not be represented as another chat row; it should be reachable as a project-level Inspector/workspace action.
- [x] Backend Generate should be automatic when introduced, but it should come after the manual Canvas and Canvas-to-prompt loop feel useful.
- [x] Every plan should prepare UI and backend canvas changes from the existing project-level canvas during planning time, so the plan updates the shared canvas instead of creating a separate one.
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
- [x] Backend mapping should allow nested, overlapping, or connected containers so less-visible backend responsibilities can sit under larger features without hiding reuse opportunities.
- [x] V1 UI pages should default to simple labels such as Page 1, Page 2, Page 3, with user-editable names later.
- [x] V1 should prefer a compact side page menu for UI pages instead of adding more controls to the top header. The placement can change later if usage proves another layout clearer.
- [x] First Canvas surface should keep away visible Current/Proposed add toggles, Desktop/Mobile switching, page renaming, and duplicate project/canvas titles. Those can stay in the model or future workflow, but not as first-surface clutter.
- [x] Layer rows should carry the visual language with row color/treatment and a tiny info guide: blue solid for current, gold dashed for proposed, red for deleted.
- [x] UI/Backend mode lives in the Canvas header row so Layers can start at the top of the canvas body. State/color changes live in selected-item Details as compact swatches.
- [x] The key owner journey is local-project bootstrap: user opens a mostly clear Canvas, asks Codex to generate the existing low-fidelity UI mockup from the local repo, manually corrects it, then reuses the canvas as living project context for future plans and CRUD updates.
- [x] The desktop composer should bring in a real `@` project-context picker. `@canvas` should attach Canvas as a visible removable context chip and serialize the current canvas snapshot on send; do not treat Canvas as a fake app/plugin mention in v1.
- [x] Keep layer rows plain: reference code, name, visibility, neutral lock, delete where allowed. Remove extra tiny shape/type icons and separate state swatch shapes.
- [x] Do not show raw item IDs or database counters in the canvas UI. Use human reference codes such as `C1`, `B1`, `T1`, `M1`, and `D1`; keep stable IDs internal for persistence and LLM references.
- [x] Do not add a big Save button in the first surface. Prefer debounced autosave of the latest project canvas snapshot, with deliberate snapshots/checkpoints only later if users need alternatives.
- [x] Add a small Button primitive to represent UI buttons without forcing users to fake them as full containers.
- [x] Remove lock icons from inside canvas shapes. Color and border style carry state; lock controls can stay in Layers/Details.
- [x] Delete behavior should be state-aware: proposed gold items can be removed; current blue items should become deleted/red instead of disappearing.
- [x] Moved current items should show the original geometry as a grey ghost plus the new blue position so the user and agent can read movement explicitly without adding a fourth user-facing state.
- [x] Details should not duplicate layer/right-click actions: remove persistent lock/unlock and delete controls from Details, and show reset placement only for moved current items.
- [x] Layer rows should use neutral lock icons and carry state through the whole row color/treatment, with sorting by review priority: deleted, moved current, proposed, current.
- [x] Layer action tooltips should say what pressing the icon does, such as "Unlock position" or "Lock position", not only the current state.
- [x] Use undo/redo for accidental state/text/placement edits instead of exposing full provenance history in the first Layers UI.

## Phase 1 - Research And Product Validation

- [x] Review the current app-server/backend capabilities in this repo for threads, turns, plans, diffs, filesystem, shell commands, and stored state.
- [x] Review current examples from Figma/FigJam, Canva, and Adobe XD for canvas behavior, layers, grouping, locking, artboards/pages, right-click actions, and editable AI-generated layers.
- [x] Write a short gap analysis: what we can reuse, what we must build, what is risky, and what should stay out of v1.
- [x] Confirm whether the first version should be local-only, app-server-backed, or embedded into an existing Codex app/client surface.

Findings: `plans/wip/P02-phase1.md`. Recommendation: keep v1 local-only, desktop-owned, embedded in the existing Canvas Inspector, and manual-first before Backend Generate.

## Phase 2 - UI Canvas Model

- [x] Define a custom UI canvas model, not React Flow.
- [x] Support pages/routes as a compact side page menu for the UI canvas, defaulting to Page 1, Page 2, Page 3, etc.
- [ ] Let users rename default pages later without requiring full route/path names, but keep rename controls out of the first surface.
- [x] Keep desktop/mobile in the model for later, but do not expose a first-surface switch until the manual canvas loop needs it.
- [x] Keep UI/Backend as the top-level visible mode; page controls exist only under UI, while Backend remains a general project view.
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
- [x] Provide a "Generate current UI mockup" bootstrap path for a fresh canvas, separate from later Backend Generate.
- [ ] Treat generated current UI containers as reviewable/editable output; the user can correct placement, names, states, and page assignments before using them as trusted context.
- [x] Use small draggable palette icons for Container, Text, Modal, and Divider instead of text-heavy add buttons.
- [x] Add Button to the compact draggable palette.
- [ ] Store page/device, normalized coordinates, grid coordinates, dimensions, z-order, state/color, lock, visibility, and parent/group relationships for every item.

Status note: Phase 2 has a first implemented slice in `apps/desktop/src`: canvas state now migrates to a versioned UI/Backend model with simple side pages, hidden desktop/mobile metadata, richer item metadata, compact palette icons, layer rows with row-level state treatment, collapsible bounded Details, coordinates, comments, Button primitive support, stable human reference codes, hidden internal IDs, recent undo/redo, and a Plan Mode prompt bootstrap for "Generate current UI mockup". Remaining Phase 2 work is stricter text-child modeling, generated-result ingestion, normalized grid math, and parent/group relationships.

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
- [ ] Track canvas coordinates, normalized/grid coordinates, and panel-local coordinates in serialized snapshots.

## Phase 4 - Canvas Interaction Rules

- [ ] Click selects a container.
- [ ] Selected item styling should be obvious and premium, with handles/actions that make edit, move, resize, and delete feel direct.
- [ ] Escape deselects.
- [x] Delete removes only temporary/proposed containers. Delete on current/blue should mark the item deleted/red instead of dropping it.
- [x] Gold delete is permanent delete, blue delete is a red mark-as-deleted affordance, and red/deleted rows do not show a normal delete action.
- [x] Mouse wheel and trackpad pinch zoom the canvas without treating smooth two-finger scroll as mouse-wheel zoom.
- [x] Two-finger trackpad scroll, shift/horizontal wheel, middle-mouse drag, and Space+drag move the canvas.
- [x] Enable the desktop WebView pinch path while preventing whole-page zoom so pinch can be handled by Canvas.
- [x] Increase native pinch-gesture sensitivity to match the faster wheel zoom feel.
- [x] Add compact toolbar controls for zoom in, zoom out, fit/reset view, undo, and redo.
- [x] Delete/Backspace keyboard behavior follows the same state rules as layer delete.
- [x] Right-click on canvas/container opens contextual actions for bring to front, send to back, duplicate, lock/unlock, state changes, apply/reset position when available, and delete where allowed.
- [ ] Add copy, group, ungroup, and richer visibility actions to the context menu once the basic menu feels right.
- [x] Blank-canvas right-click can add simple items without opening the browser/WebView menu.
- [ ] Keep the tool palette minimal, likely near the right-side layer panel.
- [x] Use translucent planning fills, longer temporary/original dashes, and simple drag-to-front z-order behavior.
- [ ] Lock editing while any thread in the project is running, but keep view access available.
- [x] Do not render lock icons inside canvas shapes; keep lock/unlock affordances in Layers and right-click actions, not as duplicated Details buttons.
- [ ] If the canvas is the active workspace, prevent accidental chat submission from the same surface; chat and canvas should not compete for the same send action.
- [ ] Avoid nested panels in the UI unless there is a clear reason.

## Phase 5 - Backend Canvas Model

- [ ] Add a Backend tab next to the UI tab.
- [ ] Backend tab is a general project map, not split by UI page or Desktop/Mobile variant.
- [ ] Use React Flow or a similar graph model only for backend mapping if it remains the best fit.
- [ ] Add a Generate button that scans the existing project and creates a hidden backend plan/canvas.
- [ ] Represent routes, components, handlers, state stores, APIs, database tables, commands, and persisted files as backend containers or nodes.
- [ ] Map backend nodes to UI containers where possible.
- [ ] Support nested, overlapping, or connected backend containers for features that include less-visible responsibilities such as messages, state, error handling, persistence, and command execution.
- [ ] Reveal more backend detail when the user zooms in, so the overview stays readable while deeper relationships remain available.
- [ ] Let the user or LLM attach TypeScript methods, routes, or feature ownership notes to panels.
- [ ] Use backend mapping to prevent duplicate routes/services for the same feature.

## Phase 6 - Plan Integration

- [ ] Add a project-level Canvas action that opens the visual planning canvas before selecting a specific plan.
- [ ] Add an Expand action on plans to focus the visual planning canvas on that plan's proposed changes.
- [ ] Plan Expand should show the current low-fidelity UI and proposed plan changes together, using current/proposed/deleted visual states plus moved-current ghost metadata.
- [ ] Recommended v1: Plan Mode opens or emphasizes the Inspector in expanded Canvas Inspector mode where the plan/chat context stays visible and the canvas gets enough room for pan, zoom, move, and placement.
- [ ] Add one-click maximize for the canvas inside Plan Mode.
- [ ] Use Inspector-style details for layers/properties/comments, but distinguish normal Inspector from expanded Canvas Inspector.
- [ ] Generate plan canvas updates during planning time for every plan, based on the existing project-level canvas, even before the user clicks Expand.
- [ ] Render the current plan as proposed UI/backend changes.
- [ ] Make the canvas changes feed back into the written plan.
- [ ] Let user canvas edits feed back into a pending plan before final submission.
- [ ] Add an explicit "Use Canvas" or equivalent handoff so the user can say the next prompt/plan should include the current canvas snapshot.
- [ ] Add `@canvas` to the real composer picker as an equivalent low-click handoff, with Canvas shown as project context above files/folders.
- [ ] When Canvas is selected from the picker, show a removable composer chip and send a compact serialized snapshot rather than only the literal `@canvas` text.
- [ ] Do not silently attach the full project canvas to every prompt; summarize or snapshot canvas state only when the user or Plan Mode flow makes that relationship clear.
- [ ] Let future prompts and plans update the same project canvas over time, including CRUD operations on items when the user asks Codex to reflect accepted changes.
- [ ] Show changed, deleted, moved, and new elements in both the canvas and plan.
- [ ] Keep written plan language UX/workflow-first, with implementation detail only where needed.
- [ ] Keep the canvas readable by both the user and the agent.

## Phase 7 - Persistence And Agent Readability

- [ ] Store canvas state at project level so multiple chats/threads can reuse the same current and proposed layout knowledge.
- [ ] Treat the project-level canvas as shared project context that a plan or message can snapshot at the moment it is submitted.
- [x] Autosave the latest project-level canvas snapshot with debounce instead of storing every interaction event.
- [x] Keep stable internal item IDs, but avoid visible IDs/numbers in normal UI.
- [ ] Persist user-facing reference codes for current, proposed, deleted, moved, and grouped panels.
- [ ] Define persisted mockup state for current, proposed, deleted, movement metadata, and grouped panels.
- [ ] Persist comments, page/route, device mode, layer order, lock state, visibility, coordinates, dimensions, and backend mappings.
- [ ] Details for a selected canvas item should include name, state, created/updated time, plan reference, coordinates/dimensions, and an agent-readable comment without exposing noisy debugging internals.
- [ ] Keep a compact serialized format that can be read by an LLM without needing screenshots.
- [ ] Store enough state to resume planning after app reload/restart.
- [ ] Avoid storing noisy interaction history unless it changes final intent.

## Phase 8 - Verification Expectations

- [ ] Manually run the app locally after implementation.
- [ ] Verify creating, moving, resizing, editing, deleting, grouping, locking, layer toggling, and marking as current.
- [ ] Verify current panels cannot be accidentally deleted.
- [ ] Verify reset placement for moved current panels.
- [ ] Verify plan text updates from canvas changes.
- [ ] Verify backend Generate produces a useful starting map from an existing project.
- [ ] Verify mapped backend/UI nodes help avoid duplicate route/service creation.
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
- [ ] What is the exact v1 UI for "Use Canvas in the next prompt": composer chip, `@canvas`, Plan Mode banner, canvas toolbar action, or a combination?
- [ ] Should mobile and desktop start as definitely separate canvases in v1, or should research first prove whether one shared page with variants is enough?
- [ ] What exact backend visual language is clearest for reuse: nested containers, overlapping containers, arrows, grouped feature regions, zoom-revealed detail, or a small combination of these?
- [ ] What is the minimum automatic scan that can catch duplicate state/routes/services without overwhelming the user with backend noise?
