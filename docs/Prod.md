# Product Direction

## Current Focus

The product should help non-senior-engineer builders turn rough ideas into better implementation plans before code is written. The core gap is not only code generation; it is that plans often fail to describe the intended user workflow, UI placement, and backend ownership in a way the owner can quickly review.
The environment is a repository copy (untracked) of the CODEX CLI from OpenAI. The owner took the CLI's backend and now he wants to add a nice UI/UX to it, closer to what Official Codex Desktop is and also adding his bits (the Canvas).

## Problem To Solve

- Users often have an idea or rough visual direction, but not enough time or patience to specify every UX detail.
- Agent-written plans tend to become technical too quickly and can miss workflow details such as where a button lives, whether an action opens a pop-up or side panel, and how states change after interaction.
- Bad plans can create complicated UI, extra end-user steps, unnecessary admin/debug states, or duplicate backend implementations.
- The owner wants a planning layer that makes current state and proposed changes visible before implementation.

## Planned Direction

- Add a project-level visual planning canvas that helps a project evolve from rough idea to implementation plan, including projects that start from almost zero.
- Show Canvas as a project-level surface that is distinct from chats; it should not appear as another chat row in the project chat list.
- Make the Canvas entry point feel intentional, ideally as a clear project-level control near the project/chat workspace header with a label or tooltip when space allows, not as an unexplained mystery icon.
- Store canvas state at project level so it can be reused across all chats/threads inside that project.
- Primary user journey: a non-developer runs this Codex desktop copy locally, adds their local project folder, opens a mostly clear Canvas, asks Codex to generate an existing low-fidelity UI mockup from that project, then rearranges and corrects the canvas before using it as project context for future plans and implementation prompts.
- The generated current UI mockup is a bootstrap aid, not a source of truth. The user must be able to inspect, adjust, move, delete, lock, and correct the generated containers before trusting it.
- Generate UI/backend canvas updates during plan thinking time from the existing project-level canvas, so plans enrich the shared canvas instead of creating separate canvases.
- Recommended v1: a project-level Canvas action opens the canvas in the Inspector/workspace area, and Plan Mode opens or emphasizes the same canvas in an expanded Canvas Inspector mode with real editing room.
- Treat normal Inspector as a details surface and expanded Plan Mode Canvas Inspector as the spatial editing surface.
- Keep Inspector-style details for layers, properties, comments, and plan controls inside the expanded Canvas Inspector.
- A plan Expand/review flow should show the current low-fidelity UI layout and the proposed changes together, so the user can see placement, movement, deletion, and new UI before implementation.
- Show current UI in one visual language and proposed UI changes in another.
- Let the user move, edit, delete, group, lock, comment on, and mark plan containers as current.
- Add a Backend tab with automatic Generate that maps the current codebase and connects backend areas to UI containers. Sequence this after the manual Canvas and Canvas-to-prompt loop feel useful, because auto-generating more nodes into a confusing canvas would make planning worse faster.
- Use the canvas to help agents understand move/delete/new/reuse intent before writing code.
- Let any plan or normal message reference the current project canvas state at the moment it is submitted, but make that relationship explicit. Canvas is project context, not something that should silently dump every canvas detail into every prompt.
- Once attached, the canvas should be usable as living project context across the work: the user and Codex can CRUD canvas items as the product evolves, and future prompts can reference the latest accepted canvas snapshot.
- The composer should eventually include a real `@` project-context picker. `@canvas` should select Canvas as a first-class project context item, show a removable Canvas chip, and serialize a compact canvas snapshot on send. For v1, do not fake this as an app/plugin mention; keep it desktop-owned until a first-class canvas input/protocol exists.
- Explore extra canvas entry points near the project/chat header or as a main workspace tab later, while keeping Canvas visually separate from the chat list.
- Canvas hierarchy should stay clear: UI/Backend is the top-level visible mode; UI has simple P1/P2/P3 side pages; Backend is a general project view, not a separate backend canvas per page. Keep Desktop/Mobile switching, page renaming, and current/proposed add toggles out of the first surface until they earn their place.

## Product Principles

- Fewer clicks is better.
- Plans must be understandable as user workflows, not only technical tasks.
- The UI should avoid unnecessary debugging/admin surfaces.
- The canvas should stay simple: containers, text, modal/divider/button primitives, layers, comments, and three user-facing states: current, proposed, and deleted.
- The first manual Canvas must feel good before automation: clear empty state, obvious add/edit/delete, comfortable move/resize, strong selected-item styling, clear lock/read-only states, and basic pan/zoom only if it stays lightweight.
- Prefer icon-driven, draggable canvas tools over text-heavy toolbar buttons. Container, Text, Modal, Divider, and Button can live as small palette icons with tooltips.
- Canvas coordinates are product data, not just drawing pixels. Plans should be able to read page/device, x/y position, width/height, original geometry for moved current items, layer order, state/color, lock/visibility, and parent/group relationships from a compact serialized canvas snapshot.
- Canvas state should be user-readable without exposing machinery. Users see names, color/state, placement, and short reference codes such as `C1` or `B1`; stable database IDs stay internal for persistence and agent references.
- Canvas persistence should autosave the latest project snapshot instead of bloating storage with every tiny edit. Add deliberate snapshots/checkpoints later only if users need to preserve alternatives.
- Delete semantics should match the visual state: proposed gold items can be removed directly, while current blue items are marked deleted/red so the user and LLM can review the planned removal before code changes.
- A moved current item should be represented explicitly without becoming a fourth user-facing state: show the original item geometry as a grey ghost and the moved blue item at the new position, with reset placement available only for that moved condition.
- Keep broader history simple in v1: movement gets visible parent/child tracking, while accidental state or text changes are handled through recent undo/redo instead of showing a full provenance/history UI in Layers.
- The canvas can be viewed anytime, but should only be editable when no thread in the project is running.
- Backend work should reuse existing architecture and reduce duplicate feature paths.
- Backend mapping should make existing reusable state/routes/services visible before new backend paths are added.
- For WSL-backed local projects, the product should let users work with familiar Windows paths while reliably sending normalized WSL runtime paths to Codex. Path conversion is product behavior, not an incidental implementation detail.

## Implementation State

- Implemented: project operating docs and plan lifecycle.
- WIP: P03 desktop Codex UI, focused first on the core app loop before the planning canvas.
- P03 now has a React/TypeScript desktop shell under `apps/desktop/`, a passing backend proof gate, automatic app-server connection states, a real WSL app-server path, account/auth visibility from app-server, and a Tauri release exe. Live UI prompting is proven for streamed assistant responses, command cards, and cancellation; installer packaging, native Windows runtime behavior, and live file-change/review cards are still unproven.
- Implemented in P03 foundation: desktop-owned project canvas state and a basic Canvas Inspector with current/proposed/deleted containers, editing controls, and local persistence.
- Implemented in P02 Phase 2 start: the desktop canvas model now has UI/Backend mode, default UI pages, hidden Desktop/Mobile metadata, container/text/modal/divider/button item kinds, layer metadata, comments, coordinates/dimensions, internal stable IDs, and a compact icon/layers/details editing surface. The visible surface is intentionally trimmed: no duplicated project title, no page rename control, no Desktop/Mobile switch, no Current/Proposed add toggle, no per-layer type icon, and no visible internal IDs.
- Implemented owner review refinement: the first canvas surface now keeps only blue/gold/red as user-facing states, treats moved-current as a derived condition with a grey original-position ghost, uses human reference codes such as `C1/B1`, removes duplicated lock/delete controls from Details, makes layer rows carry state color, keeps lock icons neutral, and includes compact undo/redo for recent canvas edits.
- Planned next: stricter text-child modeling, generated current-UI mockup ingestion, normalized grid math, parent/group relationships, an explicit "use this canvas for the next prompt/plan" handoff through a Canvas action or `@canvas` composer chip, and Plan Mode emphasis for proposed changes.
- Planned later: automatic backend generation, prepared canvas updates for every plan, richer layers/comments/grouping, and backend canvas mapping.
- Not implemented: backend Generate action, automatic plan-to-canvas synchronization, backend canvas API, and full design-tool behavior.
