# P20 - Delete Canvas And Clean Prompt Wrappers

## Status

- Done.
- Canvas UI/state/prompting/parser/docs were removed from active desktop code and current docs.
- Added P20 checks for active Canvas absence, prompt-wrapper visible text preservation, and old local-state Canvas-key loading.
- Electron verification covered legacy state load, App Preview marks, Mockup Preview marks, Plan Mode composer state, saved mockup review surface, and project switching without mark leakage.
- This plan is standalone. Do not read or rely on later visual-preview plans to decide the scope.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`

## Goal

Delete the old coordinate Project Canvas product and implementation from Codex Local. This is not a small prompt cleanup. It is a full removal of the Canvas feature, including its UI, state, types, prompts, parser, proposal cards, inspector surface, composer mentions, local persistence fields, tests, CSS, and docs.

After this plan, the normal product should have only:

- Chat and Plan Mode as conversation/permission surfaces.
- App Preview as the live running app surface.
- Mockup Preview as the saved wireframe/mockup/review surface.
- App and Mockup area marks as temporary composer context.

Canvas must not remain as an alternate visual planning system, a hidden project memory model, a fallback parser, a dev-only workflow, or a compatibility feature in the normal app.

## Deletion Principle

- Delete Canvas implementation rather than hiding it behind another flag.
- Delete Canvas prompt instructions rather than rewriting them into softer wording.
- Delete Canvas user-facing traces rather than relabeling them.
- Delete old `UI` / `Backend` builder-tab-era code and copy where it belongs to the old Canvas/builder product model.
- Do not delete legitimate user-app concepts. A user can still ask Codex to build an app with a UI, backend, admin panel, dashboard, debugger, CSS editor, or DOM inspector when those are part of the user's app.
- The app may ignore or drop old persisted Canvas data during migration. It should not keep Canvas functionality alive to preserve old data.

## User Workflow Contract

### 1. No Canvas Entry Point

- The user should not see a Canvas button, Canvas inspector, Canvas tab, Canvas draft card, Canvas page/layer panel, Canvas apply/update action, or `@Canvas` mention.
- Plan Mode must not open Canvas, reference Canvas, or serialize Canvas context.
- Normal chat must not produce Canvas suggestion cards.

### 2. No Canvas Prompting

- No prompt wrapper should ask the model for `canvas-proposal` blocks.
- No prompt wrapper should describe coordinate grids, `xywh`, `norm`, `grid`, Canvas item references, current/proposed/deleted Canvas states, Canvas pages, sub-pages, groups, layers, or interaction frames.
- No plan accept/revise prompt should mention `Project Canvas`, `UI draft edits`, `Update Canvas`, `View Canvas`, or saving draft Canvas memory.

### 3. No Canvas State

- Desktop local state should not persist `canvases`, `canvasSuggestions`, Canvas draft snapshots, Canvas user edit timestamps, Canvas parse statuses, Canvas proposal summaries, or Canvas active inspector selection.
- Old stored Canvas fields may be ignored or dropped during local-state normalization.
- Removing a project or switching projects should no longer need Canvas cleanup logic.

### 4. Keep Live And Mockup Context

- Keep `@AppMark` and `@MockupMark` context.
- These contexts should speak only in Live App Preview / Mockup Preview terms.
- They should say marks are visual intent and that Codex should inspect files when exact implementation details matter.
- They must stay project/thread scoped and must not leak across projects.

### 5. Preserve User Intent

- Hidden/custom prompt wrappers can expose Codex Local capabilities, but they must not change the user's requested app idea.
- Visible composer text is the primary instruction.
- Selected mockup/preview context is supporting context only.
- If selected context conflicts with visible user text, visible user text wins.

## Code Removal Scope

Delete Canvas-related implementation from active desktop code, including but not limited to:

- `apps/desktop/src/canvasState.ts`
- `apps/desktop/src/canvasProposal.ts`
- `apps/desktop/src/components/CanvasInspector.tsx`
- `ProjectCanvas`, `CanvasItem`, `CanvasGroup`, `CanvasPage`, `CanvasSuggestion`, `ComposerCanvasContext`, `PlanCanvasPromptContext`, and related type fields in `types.ts`.
- `canvases`, `canvasSuggestions`, Canvas snapshots, Canvas parse status, Canvas draft base/proposal snapshots, Canvas update timestamps, and Canvas user-edit state from local state.
- `@canvas` mention parsing, Canvas context chips, Canvas mention labels, Canvas shortcuts, and Canvas chip icons from Composer.
- Canvas prompt builders and serializers in `App.tsx`.
- `canvas-proposal` parsing, stripping, friendly rendering, suggestion cards, `View Canvas`, `Update Canvas`, `Canvas edits attached`, generated current-interface Canvas mockup actions, and Canvas review text from ChatThread/Inspector.
- Canvas CSS classes and layout rules from `styles.css`.
- Generic Plan Preview fallback templates that generate fake options such as `Inline action`, `Focused panel`, and `Guided dialog`.
- Any old `UI` / `Backend` tab-era builder code or copy tied to the removed Canvas/builder model.

The expected deletion may be large: more than 10,000 lines and possibly more than 20,000 lines. That is acceptable if the app builds and the remaining workflow is simpler.

## Prompt Wrapper Cleanup

After Canvas removal, audit every remaining custom prompt wrapper:

- Empty Project Visual Planning:
  - keep `Build directly`, `Show wireframes`, `Show mockups`;
  - keep the first empty-project decision turn planning-only;
  - do not mention Canvas;
  - do not create files before the user chooses.
- Existing App Visual Decision:
  - keep current-app wording;
  - do not mention Canvas;
  - the model may ask whether to build directly, show one preview, or show multiple directions.
- Existing App Preview First:
  - keep `.codex/mockups` review artifacts;
  - require inspecting enough project/app state to match current route, brand, layout, palette, density, and workflow;
  - do not mention Canvas.
- Visual Decision Selection:
  - selected option is context;
  - visible composer text is authoritative.
- Saved Mockup Review:
  - selected mockup is context;
  - user request decides revise/build/ask;
  - no Canvas wording.
- Build Selected Mockup:
  - include visible user text and marks;
  - selected mockup is the starting point;
  - accepted implementation becomes normal app code using the app's own style;
  - no Canvas wording.
- Plan Mode:
  - plan/review first, no implementation until accepted;
  - may create review-only mockups/previews;
  - no Canvas serialization, Canvas proposal format, or Canvas memory language.
- Baseline App:
  - block Codex/platform debug junk only;
  - do not block user-requested app features such as admin panels or dashboards.

## Implementation Phases

### Phase 1 - Canvas Inventory

- Search active desktop code, docs, tests, and CSS for:
  - `Canvas`, `canvas`, `ProjectCanvas`, `canvas-proposal`, `CanvasSuggestion`, `canvasSuggestions`, `canvases`, `@canvas`, `xywh`, `grid`, `norm`, `Update Canvas`, `View Canvas`.
- Create a deletion checklist from the actual references.
- Treat every active Canvas reference as removal work unless it is only historical text inside old completed plan files.

### Phase 2 - Delete Canvas Types And State

- Remove Canvas types from `types.ts`.
- Remove Canvas state normalization/persistence from `localState.ts`.
- Remove Canvas-related desktop state fields and default values.
- Remove Canvas inspector selection types.
- Ensure old persisted Canvas keys are dropped during load without crashing.

### Phase 3 - Delete Canvas UI

- Delete Canvas inspector/component files.
- Remove Canvas buttons, tabs, menu items, activity cards, suggestion cards, plan proposal Canvas buttons, Canvas chips, and Canvas mention UI.
- Remove Canvas CSS.
- Remove generated current-interface Canvas mockup action.
- Remove any old `UI` / `Backend` builder-tab UI connected to the old Canvas product.

### Phase 4 - Delete Canvas Prompting And Parsing

- Remove Canvas prompt wrappers, serializers, and mention parsing.
- Remove `canvas-proposal` parser and all parse/apply logic.
- Remove Plan Mode Canvas context injection.
- Remove Plan Mode accept/revise Canvas memory language.
- Remove ChatThread Canvas proposal stripping/rendering/suggestion logic.

### Phase 5 - Remove Generic Fake Preview Templates

- Remove or replace `planPreview.ts` generic local option generation.
- Do not generate `Inline action`, `Focused panel`, or `Guided dialog` as fake comparison options.
- If the app has no model-authored preview/mockup artifact, show no fake visual comparison.

### Phase 6 - Rewrite Remaining Prompt Wrappers

- Keep only Live App Preview, Mockup Preview, decision strip, and mark-context wrappers.
- Make every wrapper intent-preserving.
- Ensure hidden context never claims to be the source of truth.
- Ensure existing-app preview generation can inspect the project before producing concrete review artifacts.

### Phase 7 - Docs Cleanup

- Rewrite `docs/Arch.md`, `docs/Prod.md`, and `docs/UI-UX.md` so Canvas is removed from current architecture and product direction.
- Current docs should describe Live App Preview, Mockup Preview, Plan Mode, decision strips, and marks.
- Historical completed plans can remain historical. Current docs and active plans should not direct future agents to use Canvas.

### Phase 8 - Verification

- Automated:
  - TypeScript build;
  - prompt-wrapper tests for all remaining wrappers;
  - local-state load test with old Canvas keys present and ignored;
  - tests that active code has no Canvas imports/components/prompt paths.
- Manual Electron:
  - empty project first prompt shows clean decision strip with no Canvas wording;
  - choosing wireframes/mockups opens Mockup Preview;
  - marking App Preview and Mockup Preview creates only App/Mockup mark chips;
  - Plan Mode no longer mentions Canvas;
  - existing app preview-first prompt creates grounded mockup/review artifacts;
  - project switching does not leak marks/mockups;
  - old saved state with Canvas data does not crash and does not show Canvas UI.

## Acceptance Criteria

- No active Canvas product UI remains.
- No active Canvas prompt wrapper remains.
- No active `canvas-proposal` parser or renderer remains.
- No active Canvas project-memory state remains.
- No normal user path contains `Canvas`, `@Canvas`, `View Canvas`, `Update Canvas`, `Canvas edits attached`, coordinate Canvas items, layers, pages, sub-pages, groups, or interaction frames.
- Current docs no longer describe Canvas as implemented or future product direction.
- The app builds and runs in Electron.
- The remaining visual planning model is simpler: App Preview, Mockup Preview, Plan Mode, decision strips, and marks.
