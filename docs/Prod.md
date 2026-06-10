# Product Direction

## Current Focus

This repository is a local Codex desktop copy built on top of the upstream Codex runtime. The owner wants a clear local app where users can review interface/workflow plans against the real running app before implementation.

## Problem To Solve

- Users often have rough product ideas but not enough time to specify every workflow detail.
- Agent-written plans can become technical too quickly and miss visible placement, state changes, and user decision points.
- Bad plans can create extra end-user steps, confusing recovery paths, hidden state, duplicate surfaces, or brittle edge-case matrices.
- The live app should make current interface state, proposed changes, and small interaction consequences visible before implementation.
- Plan Mode should stay the implementation decision surface: it asks whether to implement, revise, or dismiss a plan. Canvas/live preview is supporting context and visual review, not a separate implementation approval.

## Mode Model

- Plan Mode is the permission mode: Codex thinks, previews, and asks before writing code.
- Canvas/live preview is the visual surface: the user looks at and interacts with the proposed change.
- Do not add a top-level `UI mode` or `Canvas mode` beside Plan Mode unless the owner explicitly changes this direction later.
- Normal chat can use visual context through explicit `@Canvas`/`@Preview` mentions, but it should not require them. If the user draws a marked area in the live app preview, the app automatically attaches that visual context to the composer as a removable chip.
- Plan Mode plus a UI-relevant request should automatically offer the live app visual surface; the user should not have to choose a separate mode first.

## Live App Plan Preview Direction

- Current product direction: the live running app becomes the visual planning surface.
- The project-level `Canvas` entry can remain the way users open visual planning, but the future experience should be a live app preview, not a separate grid of editable containers.
- In Plan Mode, visible proposals should be temporarily injected into the real app so the user can click through the proposed feature before approving implementation.
- When the user has not specified a precise design, Plan Mode should prefer offering up to three visual preview options before asking the user to manually mark a location.
- The app does not build three code implementations for those options. It loads one live app preview and swaps temporary preview variants.
- Proposed UI should look and behave like app UI, with a clear temporary/proposed treatment. It should not appear as DOM tags, CSS boxes, or coordinate overlays.
- Location feedback should be lightweight: the user can mark an area on a snapshot/live preview and describe what should happen there. The mark is temporary communication context, not durable Canvas geometry.
- Area marking must work outside Plan Mode. A normal chat user can draw a rectangle in the app preview; the composer immediately gains a compact chip such as `App mark`, and the next message sends that mark context without requiring `@Canvas`.
- Plan acceptance turns the approved preview and plan into real implementation work. It must not silently save visual planning artifacts.
- If injection into the live app is unavailable, Codex should fall back to a screenshot/marked-area plan or text plan instead of pretending it has precise UI control.
- The existing coordinate-based Project Canvas can remain as implemented legacy/project-memory infrastructure while existing flows depend on it, but it is not the desired future UX for visual planning.
- If no live preview is available, fresh projects may fall back to screenshot marking, a text plan, or the existing generated mockup flow.
- Existing generated mockups are reviewable drafts. They should not be expanded into the main future UX unless explicitly revived.
- Existing interaction preview frames remain part of the legacy coordinate Canvas implementation, not the target model for live app planning.

## Plan Mode Direction

- Plan Mode activation, including `Shift+Tab`, must not open Canvas by itself.
- A plan can expose visual review only through explicit actions such as `Show app preview`, `Compare options`, opening the project visual surface, or attaching marked-area context.
- `Yes, implement this plan` proceeds with the real project/code work. It may use the selected preview option or marked-area context as guidance, but it must not silently save visual planning artifacts.
- `No, and tell Codex what to do differently` sends typed feedback plus any active preview option/marked-area context.
- `Dismiss Esc` drops the current plan decision and removes temporary injected preview UI.
- After successful implementation, prefer reloading the live app preview and comparing it to the accepted plan preview. Show `View Canvas` or `Update Canvas` only when the legacy Canvas flow is explicitly involved.

## Legacy Canvas Review Rules

These rules describe the existing coordinate-based Project Canvas while it remains implemented. They are not the target UX for Live App Plan Preview.

- Project Canvas is durable project memory. Draft overlays are temporary proposal data.
- Normal Canvas-only `Apply` commits a draft into saved project Canvas memory.
- Plan acceptance does not commit Canvas. The explicit post-implementation `Update Canvas` action does.
- Visible item states stay simple: current/blue, proposed/gold, deleted/red.
- Moved current items show a grey original-position ghost with Apply position and Reset position.
- Groups behave as one selectable/movable unit until ungrouped. A locked group cannot move; an unlocked group moves children together.
- Deleting proposed items can remove them; deleting current items marks them deleted for review.

## Implementation State

- Implemented: project operating docs and plan lifecycle.
- Implemented: React/TypeScript desktop shell with sidebar, chat/composer, inspector, app-server connection states, Electron shell, native app-server sidecar bridge, optional WSL app-server bridge, account/model visibility, streamed assistant responses, command cards, and cancellation.
- Implemented: in-app Codex account recovery with ChatGPT browser login, device-code fallback, API-key fallback, login completion refresh, and signed-out send blocking for OpenAI-hosted models.
- Implemented: project Canvas state with pages, sub-pages, item/group references, current/proposed/deleted states, editing controls, local persistence, undo/redo, zoom/pan, grouping, context menu actions, moved-position ghosts, and generated current-interface draft ingestion.
- Implemented: explicit `@Canvas` handoff in the composer. It attaches compact project Canvas context and can produce normal Canvas suggestions with Apply/Dismiss.
- Implemented: Plan Mode proposal shell with pending plan review, Accept/Modify/Decline, editable Canvas draft overlays, historical read-only drafts, and post-implementation `Update Canvas`.
- Implemented: interaction preview frames for selected items/groups with frame 2/frame 3 playback and explicit frame edit mode.
- Implemented: Windows Electron run/build lane with a staged native Codex app-server sidecar and Electron-owned local bridge. Installer packaging is still pending for the Electron shell.
- Current direction: keep visual planning as one focused live-app surface and avoid rebuilding separate graph/proof/design-editor surfaces unless the owner explicitly asks later.
- Current direction: replace the old Live Canvas overlay idea with Live App Plan Preview. The live app is the planning surface; proposed UI is temporarily injected into it for review.
- Current direction: Electron is the desktop shell for this branch. The next preview work should use Electron's browser control surface rather than reviving Tauri.
- Current direction: a shareable demo package should use the native sidecar lane or a polished viewer/demo mode, not the WSL/Node dev bridge.

## Verification Direction

- User-visible work is not done until it is honestly verified.
- Prefer the real Electron desktop app for Canvas/live preview, Plan Mode, composer, and project workflow checks whenever feasible.
- Dogfood meaningful Canvas/Plan Mode changes in two local projects when possible: one interface-heavy project and one backend/workflow-heavy project.
- If a blocker prevents honest end-to-end testing, record the blocker, fix the product issue, and retest instead of bypassing the workflow.
