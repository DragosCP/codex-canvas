# P02 Phase 1 - Canvas Product Validation

## Scope

This phase validates the desktop-owned Canvas foundation for local projects:

- Project-owned canvas state under `apps/desktop/src`.
- Local persistence and normalization for pages, sub-pages, devices, items, layers, groups, and interaction previews.
- Composer and Plan Mode paths that can attach Canvas as explicit project context.
- Manual editing expectations from established visual planning tools.

## Current Direction

Canvas is one project-level visual planning surface. It has no secondary graph surface, no mode switch, and no generated project map. The user should only see Canvas.

The intended loop is:

1. Open Canvas from a project-level action.
2. Start from a blank grid or generate an editable low-fidelity current interface mockup.
3. Use compact top page controls, state controls, layers, and direct manipulation to correct the plan.
4. Attach Canvas to a prompt or Plan Mode turn only by clear user intent.
5. Let the model reason from the serialized Canvas snapshot without silently treating it as global context.

## Product Findings

- Pages should be fast to reach and should not take width away from the drawing surface.
- The Canvas title should be the only surface-level name; there is no need to label the current canvas as a separate interface mode.
- Current items stay protected and blue, temporary planned items stay yellow, and removed existing items stay red.
- Generated current-interface mockups are useful only when they land as editable reviewable Canvas items.
- Plan Mode should reveal or emphasize the same project Canvas and show proposed draft changes before promotion.
- Canvas context should be explicit in the composer through `@canvas` or a visible context chip.

## Implementation Baseline

- `ProjectCanvas` stores pages, active page/sub-page, active device, items, groups, interaction previews, and timestamps.
- `CanvasInspector` supports page switching, item creation, selection, move/resize, grouping, layers, visibility, lock, delete, state changes, copy/cut/paste, zoom, and interaction preview frames.
- `App.tsx` keeps Canvas project-scoped, persists it locally, and can serialize attached Canvas context into prompts.
- `canvasProposal.ts` parses proposed Canvas edits back into the same project-owned canvas model.

## Keep Out

- A second graph/map surface.
- Automatic code ownership maps.
- Silent Canvas injection into every prompt.
- Multi-user sync.
- Full design-tool complexity such as assets, components, exports, collaboration cursors, or animation timelines.

## Verification Notes

- Build the desktop app after Canvas source changes.
- Verify the Canvas header shows only Canvas, with page controls in the top strip.
- Verify basic add, move, resize, delete, lock, visibility, state, grouping, and interaction frame editing.
- Verify `@canvas` attaches context intentionally and Plan Mode preserves the draft overlay behavior.
