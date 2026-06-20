# P30 - Canvas VisualPatch Milestone 0

## Status

- Completed.
- Goal achieved: proved the smallest useful preview-only patch runtime on one real element in one Electron-rendered app.
- Implemented `VisualPatchV0` validation plus install/apply/clear webview scripts, with a small cleanup hook in Live Preview. No Canvas header, lane, proposal, registry, or source-conversion behavior was added.
- Verification passed: `test:p30`, `test:p25`, `test:p27`, and `npm --prefix apps/desktop run build`.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/wip/P30b-canvas-visualpatch-spine.md`
- `plans/P31-interactive-canvas-edit-mode.md`
- `plans/P29-canvas-browser-observer-and-actor.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`

## User Workflow First

P30 is intentionally not a full user-facing proposal feature.

The visible proof should be tiny:

1. Open a real app in Live Preview.
2. Target one known element with `data-canvas-id`, preferably a button.
3. Apply one preview-only test patch.
4. The element visibly changes in the preview.
5. Trigger a normal app re-render.
6. The patch remains applied or is safely reapplied.
7. Clear the patch.
8. The element returns to normal.
9. Project source files remain untouched.

This proves the foundation for future lightweight Live proposals. It does not add full proposal lanes, Edit Mode, source conversion, or A/B/C branching.

## Product Contract

- P30 is a proof gate, not the full Canvas proposal runtime.
- The user/app tester should see a temporary visual change in Live Preview only.
- No app source files should change.
- No files should be created in the tested project.
- No Codex proposal chrome should be injected inside the user app surface.
- The patch target should be stable and explicit through `data-canvas-id`.
- The patch should fail honestly if the target is missing.
- The patch must be project-scoped and preview-scoped.

## VisualPatch V0

P30 only needs the smallest patch shape:

```ts
type VisualPatchV0 =
  | {
      op: "style";
      target: { canvasId: string };
      css: Record<string, string>;
    }
  | {
      op: "text";
      target: { canvasId: string };
      value: string;
    };
```

`style` is required. `text` is optional if it is cheap and safe.

Unsupported in P30:

- move;
- insert;
- reparent;
- replace component;
- hide/show unless trivial;
- lifecycle;
- staleness;
- registry;
- proposal-to-code conversion;
- Edit Mode;
- multi-lane A/B/C integration.

## Browser Observer/Actor Scope

P29-style browser observation can help P30, but P30 must not depend on a full browser automation system.

Use only the smallest inspection needed to prove the patch:

- find the target element by `data-canvas-id`;
- read computed style/text before and after;
- trigger or observe one re-render;
- capture before/after screenshots where useful.

Browser observation is supporting evidence, not the owner of Canvas state.

## Milestone 0 Acceptance Criteria

P30 passes only when all of these are true on a real app:

- One real element has `data-canvas-id`.
- A preview-only runtime can be injected into the Live preview surface.
- A `style` patch applies to that element.
- The changed style is visible in the preview.
- The patch survives or is safely reapplied after at least one ordinary re-render.
- The patch can be cleared.
- Clearing restores the element to its original visual state.
- Missing target returns an honest failure.
- Before/after screenshots or DOM checks prove the patch applied and cleared.
- Project source files are unchanged before/after the patch cycle.
- Patch state does not leak to another project or preview.

If any of these fail, do not proceed to P30b. Record the failure and adjust the foundation.

## Implementation Phases

### Phase 1 - Test Fixture App Or Real App Target

- Done: `test:p30` creates a temporary HTML app with one `data-canvas-id` button and a re-render action, then snapshots the source file and file list.

### Phase 2 - Preview-Only Runtime Spike

- Done: `VisualPatchV0` scripts install into the preview page, find `data-canvas-id` targets, apply `style` and optional `text`, preserve original inline state, and return an honest missing-target result.

### Phase 3 - Reapply On Re-render

- Done: the runtime uses a narrow child-list `MutationObserver` to reapply active patches when a target element is replaced.

### Phase 4 - Clear Patch

- Done: clear restores the original visual state and leaves the temporary app source unchanged.

### Phase 5 - Verification Harness

- Done: `test:p30` launches Electron hidden, captures before/patched/after-rerender/cleared screenshots, checks missing-target behavior, and verifies state isolation across a second BrowserWindow.

## Testing

- Unit test `VisualPatchV0` validation:
  - accepts `style`;
  - optionally accepts `text`;
  - rejects unsupported `move`, `insert`, and `reparent`.
- Harness test:
  - load a small fixture with `data-canvas-id`;
  - inject runtime;
  - apply style patch;
  - assert computed style changed;
  - trigger re-render;
  - assert style remains changed;
  - clear patch;
  - assert style restored.
- Missing-target test:
  - apply patch to absent `canvasId`;
  - assert honest failure.
- Source untouched test:
  - snapshot files before patch;
  - apply/re-render/clear;
  - assert files unchanged.
- Project isolation test:
  - verify patch state is scoped to the active preview/project.
- Visual evidence:
  - `p30-before.png`;
  - `p30-patched.png`;
  - `p30-after-rerender.png`;
  - `p30-cleared.png`.
- Run focused desktop tests that should not regress:
  - `test:p25`;
  - `test:p27`.
- Run `npm --prefix apps/desktop run build`.
- Run `npm --prefix apps/desktop run electron:build` if Electron/runtime files change.

## Explicit Non-goals

- No full proposal registry.
- No A/B/C proposal runtime.
- No proposal lifecycle.
- No staleness UI.
- No source conversion.
- No `Build selected`.
- No Edit Mode.
- No semantic proxy dragging.
- No code-backed workspace changes.
- No Plan Mode write-enforcement changes.

## Exit Decision

P30 passed. P30b may start from this foundation.
