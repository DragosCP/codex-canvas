# P02 - Visual Planning Canvas

## Status

- State: Planned
- Location: `plans/`
- Started: No
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
- [x] Backend Generate should be fully automatic in v1.
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

## Phase 1 - Research And Product Validation

- [ ] Review the current app-server/backend capabilities in this repo for threads, turns, plans, diffs, filesystem, shell commands, and stored state.
- [ ] Review current examples from Figma/FigJam, Canva, and Adobe XD for canvas behavior, layers, grouping, locking, artboards/pages, right-click actions, and editable AI-generated layers.
- [ ] Write a short gap analysis: what we can reuse, what we must build, what is risky, and what should stay out of v1.
- [ ] Confirm whether the first version should be local-only, app-server-backed, or embedded into an existing Codex app/client surface.

## Phase 2 - UI Canvas Model

- [ ] Define a custom UI canvas model, not React Flow.
- [ ] Support pages/routes as separate page chips or a right-side page list.
- [ ] Support desktop/mobile view modes.
- [ ] Support container, text, modal, and divider primitives.
- [ ] Require each container to have at least one text item.
- [ ] Give every container a generated name that the user can edit.
- [ ] Support comments per container for the agent to read.
- [ ] Support layers with visibility, lock status, ordering, and names.
- [ ] Support numeric identifiers for containers to improve agent-readable precision.

## Phase 3 - Visual State Language

- [ ] Current UI is blue, full border, normally locked.
- [ ] Proposed UI is gold, dashed, editable, movable, and deletable.
- [ ] Deleted current UI is red or hidden with a clear deleted-state layer.
- [ ] Moved current UI has a distinct changed-position state.
- [ ] If a locked-off current panel is moved without confirmed state change, show its original position as a grey dashed outline.
- [ ] Offer reset placement to animate or return the moved panel to the saved coordinates.
- [ ] Allow "mark as current" so accepted future panels become current panels after implementation.
- [ ] Track canvas coordinates and panel-local coordinates.

## Phase 4 - Canvas Interaction Rules

- [ ] Click selects a container.
- [ ] Escape deselects.
- [ ] Delete removes only temporary/proposed containers.
- [ ] Mouse wheel and trackpad pinch zoom the canvas.
- [ ] Two-finger trackpad pan and middle-mouse drag move the canvas.
- [ ] Right-click on canvas/container opens contextual actions: bring to front, send to back, duplicate, lock/unlock, group, ungroup, mark as current, reset placement when available.
- [ ] Keep the tool palette minimal, likely near the right-side layer panel.
- [ ] Lock editing while any thread in the project is running, but keep view access available.
- [ ] If the canvas is the active workspace, prevent accidental chat submission from the same surface; chat and canvas should not compete for the same send action.
- [ ] Avoid nested panels in the UI unless there is a clear reason.

## Phase 5 - Backend Canvas Model

- [ ] Add a Backend tab next to the UI tab.
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
- [ ] Recommended v1: Plan Mode opens or emphasizes the Inspector in expanded Canvas Inspector mode where the plan/chat context stays visible and the canvas gets enough room for pan, zoom, move, and placement.
- [ ] Add one-click maximize for the canvas inside Plan Mode.
- [ ] Use Inspector-style details for layers/properties/comments, but distinguish normal Inspector from expanded Canvas Inspector.
- [ ] Generate plan canvas updates during planning time for every plan, based on the existing project-level canvas, even before the user clicks Expand.
- [ ] Render the current plan as proposed UI/backend changes.
- [ ] Make the canvas changes feed back into the written plan.
- [ ] Let user canvas edits feed back into a pending plan before final submission.
- [ ] Show changed, deleted, moved, and new elements in both the canvas and plan.
- [ ] Keep written plan language UX/workflow-first, with implementation detail only where needed.
- [ ] Keep the canvas readable by both the user and the agent.

## Phase 7 - Persistence And Agent Readability

- [ ] Store canvas state at project level so multiple chats/threads can reuse the same current and proposed layout knowledge.
- [ ] Treat the project-level canvas as shared project context that a plan or message can snapshot at the moment it is submitted.
- [ ] Define persisted mockup state for current, proposed, deleted, moved, and grouped panels.
- [ ] Persist comments, page/route, device mode, layer order, lock state, visibility, coordinates, dimensions, and backend mappings.
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
- [ ] Should mobile and desktop start as definitely separate canvases in v1, or should research first prove whether one shared page with variants is enough?
- [ ] What exact backend visual language is clearest for reuse: nested containers, overlapping containers, arrows, grouped feature regions, zoom-revealed detail, or a small combination of these?
- [ ] What is the minimum automatic scan that can catch duplicate state/routes/services without overwhelming the user with backend noise?
