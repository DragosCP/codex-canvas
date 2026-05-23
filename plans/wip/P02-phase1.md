# P02 Phase 1 - Research And Product Validation

## Scope

This phase reviewed:

- Current desktop canvas foundation under `apps/desktop/src`.
- Current app-server/backend capabilities exposed through `codex-rs/app-server-protocol`.
- Official current references from Figma/FigJam, Adobe XD, Canva, and Miro/FigJam-style canvas navigation.
- The gap between the current P03 foundation and the P02 visual planning canvas direction.

## Executive Finding

The first serious P02 implementation should stay desktop-owned, manual-first, and local-project-first.

The intended user journey is: a non-developer downloads/runs this Codex desktop copy locally, adds whatever local project they are working on, opens a mostly clear Canvas, asks Codex to generate an existing low-fidelity UI mockup from that project, manually rearranges and corrects it, then uses Canvas as living project context in future planning and implementation prompts.

Do not add app-server canvas APIs or Backend Generate yet. The existing desktop app already has the right shell, local project ownership, Inspector resizing, Plan Mode entry point, and local persistence to support a useful v1. The immediate value is making the manual canvas understandable and agent-readable: pages, device variants, state colors, layers, right-click actions, coordinates, an explicit "Use Canvas" handoff into the next prompt or plan, and a safe current-UI bootstrap flow.

Current UI mockup generation is different from Backend Generate. A first UI bootstrap can create editable current-state containers from the local project. Backend Generate should come later, after the manual canvas surface is not confusing. Otherwise automation will create more objects before the user has a clear way to read or correct them.

## Local App Findings

### Existing canvas foundation

- `apps/desktop/src/types.ts` defines `ProjectCanvas` as project-owned state with `items` and `updatedAt`.
- `CanvasItem` is currently minimal: `kind`, `title`, `body`, `x`, `y`, `width`, `height`, `state`, and `locked`.
- Supported states are currently only `current`, `proposed`, and `deleted`.
- `apps/desktop/src/canvasState.ts` creates empty project canvases and normalizes persisted canvas maps from desktop local storage.
- `apps/desktop/src/components/CanvasInspector.tsx` already supports basic add, select, move, resize, edit title/body, lock/unlock, delete proposed items, and mark current items as deleted.
- `CanvasInspector` already locks editing when `readOnly` is true.
- `apps/desktop/src/App.tsx` opens Canvas as an Inspector selection scoped to the project, creates missing project canvas state on demand, and keeps Canvas open when switching chats inside the same project.
- Plan Mode currently opens/emphasizes Canvas, but the prompt sent to app-server only prepends a text instruction: "Plan Mode: investigate and propose the plan first...". Canvas state is not included in the model-visible prompt.

### Current limitations

- No page model.
- No UI/Backend mode.
- No Desktop/Mobile variants.
- No side page menu.
- No layer panel model.
- No visibility state.
- No moved-current state or original-position ghost.
- No modal/divider primitives.
- No grouped items.
- No right-click menu.
- No coordinate grid semantics beyond raw pixel `x`, `y`, `width`, and `height`.
- No created/updated timestamps or plan references per item.
- No explicit "Use Canvas" or composer context chip.
- No explicit "Generate current UI mockup" bootstrap action for a clear canvas.
- No backend map model.
- No app-server persistence for canvas state.

## App-Server And Backend Findings

The app-server is strong enough to support P02 around the edges, but not as a native canvas backend yet.

Available and useful:

- Thread lifecycle: `thread/start`, `thread/resume`, `thread/list`, `thread/read`, `thread/name/set`, `thread/archive`, `thread/rollback`.
- Turn lifecycle: `turn/start`, `turn/interrupt`.
- Plan signals: `turn/plan/updated` and persisted `ThreadItem` plan items.
- File-change signals: `turn/diff/updated`, `item/fileChange/patchUpdated`, and `ThreadItem` fileChange entries.
- Filesystem operations: `fs/readFile`, `fs/readDirectory`, `fs/watch`, `fs/changed`.
- Command surfaces: `command/exec` for standalone commands and `thread/shellCommand` for thread shell commands.
- Review: `review/start`.
- Runtime/config/account/model reads: `config/read`, `model/list`, `account/read`, `account/rateLimits/read`.
- User input types for `turn/start`: text, image, localImage, skill, and mention.
- App-server `mention` is useful for app/plugin/skill-style targets, but Canvas does not yet have a first-class protocol target. For v1, `@canvas` should be a desktop composer/project-context picker entry that attaches a removable chip and expands to compact canvas text on send.

Important constraints:

- There is no canvas API or project canvas persistence API.
- `turn/start` can receive a compact text summary of canvas state, but there is no first-class canvas input type.
- `thread/inject_items` appends raw Responses API items and is not the right v1 product surface for canvas context.
- Backend Generate could use app-server filesystem reads, fuzzy file search, command execution, or a normal agent turn later, but none of those solve the UX problem until the manual canvas model is clear.

Phase 1 recommendation: keep canvas state desktop-owned for now, and feed a compact serialized snapshot into the prompt only when the user explicitly chooses "Use Canvas" or when a Plan Mode flow clearly attaches it.

For the fresh-canvas bootstrap, use a normal Codex turn against the local project to produce a proposed structured canvas update, then render it as editable current-state containers. The user remains responsible for accepting/correcting the result before it becomes trusted project context.

## Design Tool Reference Findings

### Figma and FigJam

- Pages belong in a navigation area, not the main workspace header. Figma's navigation panel exposes layers and pages on the left, and FigJam describes pages as organization spaces within files.
- Layers use icons, nesting, order, rename, visibility, and lock affordances. This supports our compact layer rows with color dots and small icons.
- Locked layers prevent canvas editing but can still be selected from the layer panel or right-click selection flows. This matches our need for locked current UI that remains inspectable.
- Hidden layers become unselectable on the canvas but remain available in layer/outlines workflows. For us, hidden/deleted should remain readable to agents through state, not disappear from persisted canvas data.
- Sections are useful as top-level grouping areas and can be marked ready for development. For us, "mark as current" is the product equivalent, but we should avoid full Figma section complexity in v1.
- Zoom, zoom-to-fit, zoom-to-selection, trackpad pinch, and grid/snap concepts are useful, but should stay lightweight until core manual editing feels good.

### Adobe XD

- XD layers support search/filter, grouping, rename, duplicate, hide, lock, export, delete, and artboard management from the layers panel.
- XD also uses context menus for common object and layer actions. This reinforces right-click as the fast path for duplicate, copy, lock, state changes, mark as current, reset placement, and delete.
- Artboards/pages are navigable structures, but P02 should use simpler `Page 1`, `Page 2`, etc. defaults before route-aware naming.

### Canva

- Canva groups behave as a single movable/resizable unit, while unlocked groups can still allow finer control of children.
- Canva element/group APIs reinforce a simple box model: child elements carry position and size data such as top/left/width/height, and later children render in front of earlier ones.
- This validates storing coordinates, dimensions, and z-order as first-class P02 data, not only as screen pixels.

### Miro / whiteboard navigation pattern

- Whiteboard tools rely on clear pan/zoom modes and trackpad/mouse gestures, but they also expose navigation preferences because mouse and trackpad expectations differ.
- For P02 v1, add pan/zoom carefully. Comfortable placement, selection, and right-click actions are more important than complete whiteboard navigation.

## Gap Analysis

### Reuse

- Keep the project-owned desktop state and local persistence.
- Reuse the Inspector/Canvas Inspector surface and existing responsive right-panel resizing.
- Reuse Plan Mode as the entry point that opens or emphasizes Canvas.
- Reuse existing app-server thread/turn APIs for sending prompts and reading plan/diff/file-change events.
- Reuse lucide icons for the palette, layer rows, locks, visibility, state, and delete controls.

### Must build next

- Expanded canvas schema:
  - top-level mode: UI or Backend
  - UI pages with default names `Page 1`, `Page 2`, `Page 3`
  - Desktop/Mobile variants under UI only
  - item kinds: container, text, modal, divider
  - item states: current, proposed, moved, deleted
  - visibility, lock, z-order, timestamps, plan reference, comment
  - normalized grid coordinates and pixel bounds
  - parent/group relationships later
- Canvas UI:
  - top UI/Backend switch
  - side page menu for UI pages
  - compact Desktop/Mobile control under UI
  - icon-only draggable palette
  - compact layers/details panel
  - selected-item coordinate chip
  - right-click context menu
  - better empty state
- Prompt integration:
  - explicit "Use Canvas" handoff
  - real `@` project-context picker with Canvas as a first-class result
  - composer/context chip such as "Canvas attached to next plan"
  - compact serialized summary appended to the prompt only when attached
- Current UI bootstrap:
  - clear empty-state action to generate an existing low-fidelity UI mockup
  - generated containers land as editable/reviewable current-state candidates
  - user can correct pages, coordinates, states, names, and comments before reuse

### Risks

- Header clutter if UI/Backend, pages, devices, palette, and actions all live at the top.
- A too-wide details panel could become debugging UI instead of planning UI.
- Silent canvas prompt injection could surprise the user and bloat context.
- Backend Generate could create noisy diagrams before the user understands the manual canvas.
- Browser pointer events can make trackpad pan/zoom tricky; do not let gesture work delay basic editing.
- Current/deleted/moved states can become ambiguous unless color, state text, layer icon, and serialized state all agree.

### Keep out of v1

- App-server canvas API.
- Shared/cloud canvas persistence.
- Automatic Backend Generate.
- Automatic codebase map generation.
- React Flow for UI canvas.
- Full design-suite features such as style panels, assets, components, collaboration cursors, exports, prototypes, or animation.
- Route/page auto-discovery.
- Complex nested grouping before simple containers and layers feel solid.

## Product Recommendation

The first implementation should be local-only, desktop-owned, and embedded into the existing Codex desktop Canvas Inspector.

V1 should prove this loop:

1. User opens Canvas from a clear project-level control.
2. User can start from a clear canvas or ask Codex to generate the existing low-fidelity UI mockup from the local project.
3. User sees UI mode with `Page 1`, `Page 2`, etc. in a side page menu.
4. User selects Desktop or Mobile.
5. User drags a Container/Text/Modal/Divider icon onto the grid or edits generated current-state containers.
6. User moves/resizes/selects items and sees coordinates.
7. User uses layers or right-click to lock, hide, duplicate, change state, mark current, or delete.
8. User chooses "Use Canvas" for the next prompt or plan.
9. Composer shows a compact context chip.
10. Plan Mode sends a compact canvas snapshot with the prompt.
11. The plan can refer to current/proposed/moved/deleted items in user workflow language.
12. As work continues, the user can call out Canvas again and let Codex CRUD the same project canvas when changes are accepted.

Backend mode should exist as a simple placeholder or manual map surface only after the UI manual loop is improved. Generate should wait.

## Suggested Phase 2 Entry Slice

Start with the UI canvas model and manual surface:

- Migrate `ProjectCanvas` to include version, mode, UI pages, active page, active device, and item metadata.
- Add a safe normalizer for old P03 canvas state.
- Replace the Current/Proposed text buttons with small palette icons.
- Add the side page menu with default `Page 1`, `Page 2`, `Page 3` labels.
- Add UI/Backend and Desktop/Mobile controls, with page/device controls hidden in Backend.
- Add a fresh-canvas bootstrap affordance for "Generate current UI mockup", but keep the first result editable and user-reviewable.
- Add Layers/Details panel rows with colored state dots and visibility/lock/delete icons.
- Show selected coordinates and dimensions.
- Add right-click menu for common item actions.
- Add an explicit "Use Canvas" context chip/handoff, including `@canvas` through the real composer picker, but initially only serialize the current UI page/device and visible relevant items.

## Sources

- Figma/FigJam pages and sections: https://help.figma.com/hc/en-us/articles/1500004362321-Guide-to-FigJam
- Figma left sidebar pages/layers: https://help.figma.com/hc/en-us/articles/360039831974-View-layers-and-pages-in-the-left-sidebar
- Figma lock/unlock behavior: https://help.figma.com/hc/en-us/articles/360041596573-Lock-and-unlock-layers
- Figma visibility behavior: https://help.figma.com/hc/en-us/articles/360041112614-Toggle-visibility-to-hide-layers
- Figma sections: https://help.figma.com/hc/en-us/articles/9771500257687-Organize-your-canvas-with-sections
- Figma zoom/view options: https://help.figma.com/hc/en-us/articles/360041065034-Adjust-your-zoom-and-view-options
- FigJam pan/zoom: https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam
- Adobe XD layers: https://helpx.adobe.com/xd/help/layers.html
- Canva grouping elements: https://www.canva.dev/docs/apps/grouping-elements/
- Canva positioning elements: https://www.canva.dev/docs/apps/positioning-elements/
- Miro mouse/trackpad navigation: https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen
