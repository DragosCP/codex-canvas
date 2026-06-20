# P30b - Canvas VisualPatch Spine

## Status

- Active plan, Phase 0 complete.
- Goal: expand the proven P30 Milestone 0 patch runtime into the full VisualPatch spine with typed proposal backing, stable targets, lifecycle, staleness, registry, hot-swap, and build strategies.
- This plan follows P30 Milestone 0, P27, P27-cool, P27-agent-aware planning, P27b cleanup, and P29 planning. It should extend the current resolver/lane model, not revive removed fixed-question wrappers or old one-row preview chrome.
- P30b should prepare, but not implement, P31 Interactive Canvas Edit Mode. Its `ElementRef`, `TargetResolution`, screenshot, and proposal registry work should be reusable by semantic proxy editing later.
- P30 Milestone 0 is complete. Do not implement P31 semantic editing beyond the spike until P31 Milestone 0.5 passes on a real app.
- Phase 0 removed the legacy `[Codex Existing App Preview First Context]` saved-preview creation path. Saved preview artifact creation now uses the saved-mockup review sentinel/path, and `test:p27` guards against the old sentinel returning.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/P27-agent-aware-canvas-lane-state.md`
- `plans/P27b-canvas-legacy-cleanup.md`
- `plans/P28-canvas-mode-and-visual-plan-evidence.md`
- `plans/P29-canvas-browser-observer-and-actor.md`
- `plans/done/P30-canvas-proposal-runtime-and-visualpatch-spine.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`

## User Workflow First

The user is working in a real project with Live running in Canvas.

1. The user asks a small visual question, such as moving a Settings button, changing emphasis, hiding a control, or adjusting copy.
2. Codex can answer directly, ask an above-composer question, or create a visual proposal.
3. For a small existing-app visual proposal, Canvas creates proposal lane `A` backed by a preview-only patch bundle.
4. Live source files are not changed while the proposal is only being reviewed.
5. The user can switch between `Live` and `A`; Canvas uses one interactive preview surface by default and should hot-swap the proposal patch where possible instead of reloading the app.
6. The proposal row shows `Changes`, `Mark area`, and `Build selected` when relevant.
7. The user can show `Changes`, move a suggested change area, and get a compact composer chip such as `Change 1`.
8. If the user chooses `Build selected`, Codex converts the accepted proposal into real source edits using the project's existing component and styling conventions.
9. If the request is structural, such as a new page, new workflow, reparenting, component replacement, or layout reconstruction, Codex should use a code-backed proposal workspace instead of pretending a lightweight patch can do it.

The user should experience this as a fast visual collaboration loop: mark or ask, see one honest proposal, adjust if needed, then build.

## Product Contract

- Canvas has three collaboration channels: chat, above-composer choices, and Canvas lanes.
- P30b is not a Figma-style editor. It builds the typed proposal runtime that future interactive edit mode can safely stand on.
- `Live` is the current app/source of truth.
- `A`, `B`, and `C` are display lanes, not implementation types.
- A single proposal is lane `A`.
- Proposal backing type must be separate from proposal lane label.
- Canvas uses one interactive preview surface by default. `Live`, `A`, `B`, and `C` are lane states shown in Canvas chrome, not separate live webviews by default.
- Selecting a lane swaps the active backing view or overlay. Side-by-side comparison should use screenshots, thumbnails, or static summaries unless proposals are explicitly code-backed runnable candidates and the product intentionally opens separate previews.
- Proposal state belongs in Canvas chrome and `Changes` marks, not inside the user's app UI.
- User-facing UI must not expose hidden JSON, sentinels, temp paths, proposal workspace paths, routing metadata, or patch internals.
- Choice labels should be short, usually 2-4 words, and fit on one line.
- Default to one proposal for one visual change. Use A/B/C only for meaningfully different UX directions.
- Do not change the current P27-cool header contract in this plan except to wire the existing `Changes`, `Mark area`, and `Build selected` actions to the new proposal runtime.

## Proposal Backing Model

Add a first-class distinction between display lane and backing type:

```ts
type ProposalBacking =
  | "wireframe_artifact"
  | "mockup_artifact"
  | "live_dom_patch"
  | "code_backed_workspace";
```

Semantic edit intent is not a backing type. It is a refinement/intent layer that can sit on top of another backing:

```ts
type ProposalIntentLayer = {
  kind: "semantic_edit_intent";
  edits: CanvasUserEdit[];
};
```

Example: proposal `A` may be backed by `live_dom_patch`; `A-edited` may be backed by `live_dom_patch` plus a `semantic_edit_intent` layer.

Examples:

- Lane `A` can contain a quick wireframe.
- Lane `A` can contain a fuller mockup.
- Lane `A` can contain a preview-only Live DOM patch.
- Lane `A` can contain a runnable code-backed candidate.

Each backing type has different storage, rendering, stale checks, and build behavior.

## VisualPatch V1

For lightweight Live proposals, the default representation is a preview-only patch bundle rendered externally inside the Canvas preview surface.

P30b patches are preview proposals, not direct manipulation. Future P31 edit mode may record semantic move/group/prominence intent, but P30b must not implement live DOM dragging or absolute-position editing.

V1 supports only:

```ts
type VisualPatch =
  | { op: "style"; target: ElementRef; css: Record<string, string> }
  | { op: "text"; target: ElementRef; value: string }
  | { op: "hide"; target: ElementRef }
  | { op: "show"; target: ElementRef };

type ElementRef = {
  canvasId: string;
  sourceFile?: string;
  componentName?: string;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

type TargetResolution = {
  kind: "exact" | "inferred" | "visual_only";
  confidence: "high" | "medium" | "low";
  elementRef?: ElementRef;
  bounds: Rect;
  screenshotRef: string;
};
```

V1 must not assume it can safely move, insert, reparent, replace components, or reconstruct layouts. Those requests should route to a code-backed proposal workspace or an above-composer question.

For `live_dom_patch`:

- Do not mutate Live source files during proposal review.
- Do not create a Git branch, worktree, or copied project folder.
- Do not inject visible Codex UI into the app preview.
- Prefer stable `data-canvas-id` targets.
- Collect source metadata when possible, but keep it hidden from the user.
- High-confidence target resolutions can be used for patch proposals and later code conversion.
- Medium-confidence target resolutions can be used for visual proposals, but should be verified before conversion into source edits.
- Low-confidence or `visual_only` targets are screenshot/context guidance only and must not be treated as direct patch/code targets.
- Reapply patches after common React re-renders.
- Prefer hot-swapping patch bundles when switching Live/A/B/C.

## Persistence Ownership

Proposal metadata crosses the Electron/Rust boundary and should not live only in renderer state.

- Rust/app-server should own a shared proposal registry for artifacts that can later affect source files.
- Electron may cache Canvas display state, selected lanes, viewport, overlay visibility, and local interaction affordances.
- Any proposal artifact that can later become source edits must be persisted through app-server-owned state or an app-server-known project artifact.
- The app-server registry should know proposal identity, backing type, lifecycle, target project/thread, baseline/staleness metadata, and build strategy.
- Electron-only state must not be the only copy of source-affecting proposal data.

## Build Selected Strategies

`BUILD_SELECTED` is a user-facing action, not one implementation path.

`Build selected` means convert the selected proposal into an implementation candidate for review. It must not silently commit, merge, or permanently replace Live without the normal review/verification path.

Internally resolve it to:

```ts
type BuildSelectedStrategy =
  | "implement_from_wireframe"
  | "implement_from_mockup"
  | "convert_dom_patch_to_code"
  | "promote_code_workspace";
```

Rules:

- Wireframes and mockups become implementation guidance.
- Live DOM patches must be converted into real source edits after acceptance.
- Code-backed workspaces are promoted by applying the selected workspace diff.
- Proposal-to-code conversion runs as a normal app-server/agent implementation turn. Rust/app-server owns file writes, diffs, permissions, and auditability.
- Conversion must follow the project's existing component and styling system.
- Do not dump inline styles unless the project already uses inline styles for the same pattern.
- For source-affecting proposals, distinguish accepting a visual direction from building an implementation candidate, reviewing the result/diff, and promoting it into Live.

## Proposal Lifecycle

Track explicit lifecycle states instead of collapsing everything into active/history booleans:

```text
draft
shown
revised
selected
accepted_for_build
building
built
verified
promoted_to_live
rejected
archived
```

Visible, selected, accepted, building, built, verified, promoted, rejected, and archived are different states.

User decisions should map to lifecycle steps:

- Accept visual direction: the user likes the proposal direction.
- Build into code: Codex converts the proposal into an implementation candidate.
- Review result: the user and app verify the changed Live/diff/result.
- Promote/apply to Live: the implementation becomes the project source-of-truth state.

Do not make visual acceptance imply permanent source promotion.

## Staleness Model

A proposal can become stale if:

- the base commit or baseline snapshot changed;
- the target route changed;
- the viewport changed significantly;
- a targeted source file changed;
- a target `data-canvas-id` disappeared;
- the Live preview URL changed;
- the project switched;
- the proposal workspace or artifact was deleted.

When stale, show product-facing recovery actions such as `Refresh`, `Archive`, or `Rebase`. Do not silently apply stale proposals.

## Resolver Contract

Keep the current direction:

```text
user message + structured Canvas/project state
-> agent expresses intent or returns decision/proposal content
-> deterministic resolver validates action against state, permissions, lifecycle, and Plan Mode
-> app executes the allowed action
-> agent writes user-facing text inside that allowed action space
```

The resolver owns broad action validity.

The agent owns:

- product wording;
- proposal intent;
- option labels;
- tradeoffs;
- user flow;
- patch/proposal details inside allowed backing type.

Do not create a hidden second product brain with scattered keyword branches.

## Plan Mode

- Plan Mode uses normal Canvas proposals with planning-only permissions.
- Plan Mode may create visual artifacts, patch previews, marks, user flows, tradeoffs, and risk summaries.
- In Plan Mode, writes are allowed only to non-source proposal/artifact storage managed by Codex Local, such as screenshots, proposal JSON, patch previews, and mark metadata.
- Rust/app-server should enforce that implementation-file write tools are disabled until the user accepts.
- Do not rely only on prompt text to prevent implementation writes.

## Code-Backed Workspace Limits

Code-backed proposal workspaces are expensive and must be bounded:

- Limit active code-backed candidates per project.
- Clean up, archive, or expire proposal workspaces explicitly.
- Allocate separate preview ports per runnable workspace.
- Never share stale preview URLs between Live and proposal workspaces or across projects.
- Track which managed preview process belongs to which proposal workspace.
- Require explicit promotion before any code-backed workspace affects Live.
- Do not let old code-backed workspaces remain active routing targets after promotion.

## P30 Gate Dependency

Before broad integration, the separate P30 proof must validate the lightweight patch foundation:

Gate status: satisfied by completed P30.

P30 proves:

- one real local app can expose one stable `data-canvas-id`;
- one preview-only `style` patch can apply in the preview surface;
- the patch survives or is safely reapplied after one ordinary re-render;
- clearing the patch restores the unmodified preview;
- Live source files remain untouched.

P30b can start from this proof. If future changes break the patch foundation, fix it before adding backing models, registry behavior, staleness, or build conversion.

## Implementation Phases

### Phase 0 - Legacy Quarantine And Deletion Gate

- Search active desktop code for old Canvas behavior before adding new VisualPatch spine state.
- Delete or rewire branches that can still make independent Canvas decisions outside `resolveCanvasAction`, the lane adapters, or the current preview/mockup/workspace backing stores.
- Treat old one-row `Preview` proposal identity, fixed desktop-authored questionnaires, chat-side live proposal approval cards, option-limit send errors, and stale active-proposal routing as removal targets, not compatibility paths.
- Keep only adapters that feed the current lane/resolver model:
  - saved mockup artifacts;
  - live-overlay `codex-plan-preview` metadata;
  - code-backed workspace options;
  - Plan Mode review cards that are not live proposal approval cards;
  - visible comparison history after build.
- Do not change the P27-cool header contract while cleaning up.
- Add or tighten regression assertions for each removed path so future work cannot revive old Canvas chrome or routing.
- Update this plan with what was removed, what was rewired, and which old paths remain intentionally because P30b/P31 still need them.

Phase 0 execution note:

- Removed `EXISTING_APP_PREVIEW_FIRST_SENTINEL`, `existingAppPreviewFirstPrompt`, `isExistingAppPreviewFirstPrompt`, and matching chat/thread/sidebar scrubbers.
- Rewired saved preview artifact creation through `savedPreviewArtifactPrompt`, which uses `[Codex Saved Mockup Review Context]` and the existing saved mockup completion/loading path.
- Updated prompt-title and Canvas regression tests so the deleted sentinel family cannot return in active source.
- Kept current adapters for saved mockup artifacts, live-overlay `codex-plan-preview` metadata, code-backed proposal workspaces, Plan Mode review cards, and visible comparison history.
- Verified with `test:p20`, `test:p24`, `test:p25`, `test:p25b`, `test:p27`, `test:p30`, `npm --prefix apps/desktop run build`, and `git diff --check`.

### Phase 1 - Model Audit And Types

- Audit current `PlanProposal`, saved mockup, code-backed workspace, and Canvas resolver state.
- Add proposal backing type concepts without changing visible behavior.
- Add lifecycle and build strategy types where they can be stored safely.
- Update tests so lanes and backing types are not conflated.

### Phase 2 - Stable Target Identity

- Define `ElementRef` and the initial `data-canvas-id` targeting convention.
- Define `TargetResolution` and confidence rules for exact, inferred, and visual-only marks.
- Add a dev/runtime path for collecting target metadata from the preview surface.
- Capture source metadata when available.
- Keep all metadata hidden from user-facing UI.

### Phase 3 - Preview-Only Patch Runtime

- Inject a small Canvas patch runtime into the preview webview.
- Support `style`, `text`, `hide`, and `show`.
- Reapply patches after common DOM mutations or React re-renders.
- Add patch-bundle selection and clearing.
- Add screenshots or DOM assertions for before/after.

### Phase 4 - Live/A Hot Swap

- Store active patch bundles per proposal lane.
- Use one interactive preview surface by default.
- Switching from Live to A applies the selected patch bundle.
- Switching from A to Live clears the patch bundle.
- Switching A/B/C swaps patch bundles when possible.
- Preserve scroll, modal, and form state where possible.
- Fall back to reload only when the runtime cannot safely hot-swap.

### Phase 5 - Changes Marks And Composer Chips

- Bind `Changes` marks to VisualPatch targets.
- Let users adjust a change mark.
- Store adjusted bounds as a Visual Reference.
- Composer chip labels stay compact: `Change 1`, `Mark 1`.
- Hidden context includes project, thread, lane, proposal, option, route, viewport, screenshot, bounds, note, and source.

### Phase 6 - Accept And Convert

- Resolve `Build selected` to a concrete build strategy.
- Treat `Build selected` as building an implementation candidate, not as silent permanent promotion.
- Implement `convert_dom_patch_to_code` as an agent turn with hidden patch/source metadata.
- Require the agent to match existing styling/component conventions.
- Verify no inline-style sludge is introduced unless locally conventional.
- Keep the accepted proposal visible beside Live for the verification moment, then mark it as history/reference for routing.

### Phase 7 - Staleness And Recovery

- Add stale checks for route, viewport, source file, canvas target, preview URL, project switch, and missing backing artifact.
- Show recovery actions in product language.
- Prevent silent application of stale patch or workspace proposals.

### Phase 8 - Plan Mode Enforcement

- Identify write-capable tool paths that can touch implementation files.
- Enforce planning-only permissions through Rust/app-server for Plan Mode.
- Allow writes only to app-managed non-source proposal/artifact storage until acceptance.
- Allow visual proposal artifacts and patch previews while blocking implementation writes until acceptance.

### Phase 9 - Proposal Registry And Workspace Bounds

- Add or identify the app-server-owned proposal registry.
- Persist source-affecting proposal artifacts through that registry.
- Keep Electron display state as cache/presentation, not sole source of proposal truth.
- Add code-backed workspace limits, cleanup, preview-port ownership, and stale URL guards.

## Testing

- Unit tests for backing type, lifecycle, staleness, and build strategy resolution.
- Adapter-level tests for lane-to-backing behavior.
- Webview/browser tests for patch apply/clear/reapply.
- Treat P30 screenshot or DOM checks as prerequisite evidence before this plan starts.
- Test Live -> A hot swap without source edits.
- Test React re-render patch persistence.
- Test `Build selected` routes to `convert_dom_patch_to_code` for `live_dom_patch`.
- Test `Build selected` routes to `promote_code_workspace` for code-backed workspaces.
- Test stale proposal recovery actions.
- Test medium/low-confidence target resolutions do not convert directly into source edits.
- Test one interactive preview surface hot-swaps patches rather than launching separate webviews by default.
- Test `Build selected` does not silently promote source-affecting proposals without review/verification.
- Test project switching does not leak patches, marks, chips, or proposal state.
- Test code-backed workspace preview ports and URLs do not leak into Live or other proposal workspaces.
- Test Plan Mode blocks implementation writes at tool/server level.
- Test Plan Mode still allows app-managed non-source proposal/artifact writes.
- Run focused desktop tests:
  - `test:p24`
  - `test:p25`
  - `test:p25b`
  - `test:p27`
- Keep `test:p30` as the P30 proof gate; add or extend P30b tests for the full VisualPatch backing model.
- Run `npm --prefix apps/desktop run build`.
- Run `npm --prefix apps/desktop run electron:build` when desktop/Electron paths change.
- Dogfood in real Electron on at least:
  - one existing React-style app;
  - one empty/new app flow.

## Open Questions

- How much source metadata can be collected generically without framework-specific plugins?
- Should `data-canvas-id` be injected automatically for generated apps, suggested by Codex, or added only where needed?
- Where should patch bundles persist: desktop local state, project `.codex`, or thread-local app-server metadata?
- What exact storage boundary should the app-server proposal registry own versus Electron display cache?
- What is the smallest honest `convert_dom_patch_to_code` prompt shape that avoids inline-style patches?
- Should P29 browser Observer/Actor consume the same `ElementRef` and patch runtime, or stay separate until P30b is stable?
- Which P30b target metadata is sufficient for P31 proxy edit mode without adding a framework-specific element graph too early?
