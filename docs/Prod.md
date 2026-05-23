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
- Store canvas state at project level so it can be reused across all chats/threads inside that project.
- Generate UI/backend canvas updates during plan thinking time from the existing project-level canvas, so plans enrich the shared canvas instead of creating separate canvases.
- Recommended v1: a project-level Canvas action opens the canvas in the Inspector/workspace area, and Plan Mode opens or emphasizes the same canvas in an expanded Canvas Inspector mode with real editing room.
- Treat normal Inspector as a details surface and expanded Plan Mode Canvas Inspector as the spatial editing surface.
- Keep Inspector-style details for layers, properties, comments, and plan controls inside the expanded Canvas Inspector.
- Show current UI in one visual language and proposed UI changes in another.
- Let the user move, edit, delete, group, lock, comment on, and mark plan containers as current.
- Add a Backend tab with fully automatic Generate that maps the current codebase and connects backend areas to UI containers.
- Use the canvas to help agents understand move/delete/new/reuse intent before writing code.
- Let any plan or normal message reference the current project canvas state at the moment it is submitted.
- Explore extra canvas entry points near the project/chat header or as a main workspace tab later, while keeping Canvas visually separate from the chat list.

## Product Principles

- Fewer clicks is better.
- Plans must be understandable as user workflows, not only technical tasks.
- The UI should avoid unnecessary debugging/admin surfaces.
- The canvas should stay simple: containers, text, modal/divider primitives, layers, comments, and current/proposed/deleted/moved states.
- The canvas can be viewed anytime, but should only be editable when no thread in the project is running.
- Backend work should reuse existing architecture and reduce duplicate feature paths.
- Backend mapping should make existing reusable state/routes/services visible before new backend paths are added.
- For WSL-backed local projects, the product should let users work with familiar Windows paths while reliably sending normalized WSL runtime paths to Codex. Path conversion is product behavior, not an incidental implementation detail.

## Implementation State

- Implemented: project operating docs and plan lifecycle.
- WIP: P03 desktop Codex UI, focused first on the core app loop before the planning canvas.
- P03 now has a React/TypeScript desktop shell under `apps/desktop/`, a passing backend proof gate, automatic app-server connection states, a real WSL app-server path, account/auth visibility from app-server, and a Tauri release exe. Live UI prompting is proven for streamed assistant responses, command cards, and cancellation; installer packaging, native Windows runtime behavior, and live file-change/review cards are still unproven.
- Implemented in P03 foundation: desktop-owned project canvas state and a basic Canvas Inspector with current/proposed/deleted containers, editing controls, and local persistence.
- Planned: automatic backend generation, prepared canvas updates for every plan, richer canvas interactions, and plan-to-canvas synchronization.
- Not implemented: backend Generate action, automatic plan-to-canvas synchronization, backend canvas API, and full design-tool behavior.
