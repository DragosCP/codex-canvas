# P22b - View-State Preview Proposals

## Status

- Plan only. No implementation has started.
- Companion to `plans/wip/P22-route-aware-preview-proposals.md`.
- P22 was not implemented yet. P22b should be folded into the P22 implementation before code starts, not treated as a later patch.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/wip/P22-route-aware-preview-proposals.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`

## Goal

Extend P22 from route-aware previews to route-and-view-state-aware previews. Some user apps have one URL route but many meaningful screens behind buttons, tabs, filters, modals, drawers, selected records, or multi-step flows. Codex Local must be able to capture marks, proposal highlights, and agent intent on the correct view state without pretending every app has a real router.

## User Workflow Contract

### 1. One Route, Multi-Step App

- User opens an app at `/`.
- User clicks `Next` twice and reaches a meaningful sub-view such as `Step 2 - Ingredients`.
- User marks an area.
- Composer chip should read compactly, such as `Live mark 1 Step 2`, with `/` available in detail/tooltip.
- Prompt context includes route `/`, view state `Step 2 - Ingredients`, viewport, rectangle, timestamp, and a short interaction trace when known.

### 2. Proposal Targets A View State

- User asks for a change while on a stateful view.
- Codex should target the current route plus current view state by default.
- If the request is broad or asks to preview first, proposal tabs should open at the relevant view state.
- The user should not need to manually recreate the `Next -> Next` path if the desktop or agent already knows the proposed state.

### 3. Agent Creates A New State On The Same Route

- User asks for a new screen that could live behind the same route, such as `Review summary`, `Confirmation`, or `Advanced filters`.
- Proposal can declare `New state: Review summary` rather than `New route`.
- `Live` stays on the nearest implemented state.
- Proposed tab shows the new state as review material and does not imply the real app already has it.

### 4. Tabs, Filters, Selected Records, Modals, And Drawers

- A tab switch can define view state when it meaningfully changes the screen.
- Filters/search/sort become view state only when they materially change the UI being discussed.
- Selected record/detail states should be captured when the user marks or proposal highlights inside the selected detail.
- Open modals/drawers should be captured as view state when the requested change is inside or depends on them.
- Temporary hover/focus states should not become durable view states unless the user explicitly marks or asks about them.

### 5. User Switches State While Comparing

- Compare state keeps the selected proposal option and selected proposal view state stable.
- Live state changes from user clicks update only Live's observed view state.
- Proposal marks/highlights do not silently move to the new Live state.
- If Live and proposal diverge, the header can say `Live: Step 1` and `Proposal: Step 2`.

### 6. Marks Across States

- Users can keep multiple marks on the same route when their view states differ.
- Chips group by useful label, such as:
  - `Live mark 1 Step 1`
  - `Live mark 2 Step 2`
  - `Live mark 3 Recipe drawer`
- Removing a chip removes only that view-state mark.
- Same route and same view state can still replace the previous mark by default unless the user deliberately adds another mark before sending.

### 7. Adjusted Proposal Highlights

- Proposal highlights are scoped to option plus route plus view state.
- Moving/resizing a highlight creates context such as `Adjusted highlight: Timer badge / Step 2`.
- The adjustment applies only to that view state unless the user says `apply everywhere`.
- Accepted implementation must not keep highlight chrome.

### 8. Apply Everywhere

- If the user says `apply this everywhere`, the source route and source view state remain the example.
- Prompt scope becomes `global`.
- Codex should inspect equivalent UI patterns across relevant routes and stateful views instead of assuming identical coordinates everywhere.

## UI Behavior

- Primary compare control remains `Live | Preview` or `Live | A | B | C`.
- Add a route/view switcher only when the selected proposal spans 2+ route/view states.
- For single-state proposals, do not add a second row or chip clutter.
- View labels should be product-facing: `Step 2`, `Recipe drawer`, `Favorites tab`, `Review`, not raw DOM state names.
- Path can be secondary detail. For one-route apps, the useful label is usually the view state, not `/`.
- State chips must be compact enough for the preview header and composer.
- The user should be able to understand where the proposed change lives without reading technical metadata.

## State Model

Extend P22's `PreviewRouteContext` with a nested or adjacent `PreviewViewStateContext`:

- `id`: stable identity for route plus view state comparison.
- `displayName`: user-facing label, such as `Step 2` or `Recipe drawer`.
- `kind`: `root`, `step`, `tab`, `modal`, `drawer`, `selectedRecord`, `filterState`, `stateOnly`, or `unknown`.
- `stateKey`: compact machine key when useful, such as `step=2` or `tab=favorites`.
- `status`: `implemented`, `notImplemented`, `unavailable`, or `unknown`.
- `source`: `desktop`, `agent`, `manifest`, or `user`.
- `observedSignals`: optional compact facts such as heading text, active tab text, selected button text, dialog title, or document title.
- `interactionTrace`: optional capped sequence such as `clicked Next twice`; never large logs.

Route proposal identity becomes:

- `projectId + threadId + proposalTurnId + optionId + routeId + viewStateId`

Marks and highlights include both:

- `routeContext`
- `viewStateContext`

Legacy route-only marks migrate to:

- route context from the old route string;
- view state `root` unless there is saved interaction state metadata.

## Prompt And Context Model

- View state is supporting context. Visible user text still wins.
- Desktop may infer observable state, but it should not invent product intent.
- Agent-authored proposal metadata should name intentional states, especially for new steps, new modals, new drawers, or multi-step flows.
- Prompt wrappers should separate:
  - current live route;
  - current live view state;
  - source visual reference route/state;
  - target implementation route/state;
  - scope: `singleState`, `route`, `flow`, or `global`.
- For one-route apps, the prompt should explicitly say when the change targets a view state rather than a URL route.
- Avoid raw noisy state dumps. Summarize state in compact labels and only include useful observable signals.

## Detection Rules

- The desktop can infer view state from URL hash/query, document title, main heading, active tab/segmented button text, open dialog title, selected navigation item, and explicit preview interaction state.
- The desktop should not crawl or serialize the whole DOM as normal context.
- The agent should author view-state intent when creating proposals or route-aware mockups.
- Query/state sanitization from P22 applies here too: never serialize token/session/auth/secret-looking values.

## Lifecycle

1. User navigates or clicks inside Live Preview.
2. Desktop records route context plus best-effort view state.
3. User marks an area or adjusts a highlight.
4. Composer chip shows compact route/view hint.
5. Send prompt includes visible text plus route/view supporting context.
6. Decision strip, preview-first flow, Mockup Preview, or Plan Mode can create route/view-aware proposals.
7. Preview compare shows route/view switcher only when needed.
8. User revises, accepts, builds, marks, or moves highlights with route/view context.
9. Implementation writes real app files.
10. Live reload clears proposal/highlight chrome and route/view proposal state that is no longer active.

## Implementation Phases

### Phase 1 - Fold Into P22 Types

- Add `PreviewViewStateContext` beside P22 `PreviewRouteContext`.
- Update route identity and migration rules before implementing P22.
- Ensure route-only P22 cases still work with default `root` view state.

### Phase 2 - Live View State Capture

- Extend Live App Preview session state with normalized view state.
- Capture low-noise observable labels: title, heading, active tab, dialog title, selected record label, and interaction state when available.
- Keep sanitization strict.

### Phase 3 - Multi-State Marks

- Allow multiple Live marks on the same route when view states differ.
- Update composer chips, removal, serialization, and local state migration.
- Keep same-route same-state replacement as default.

### Phase 4 - Mockup And Highlight View State

- Extend mockup manifests with optional `viewStateTargets` or route target entries that include view state metadata.
- Scope proposal highlights to option, route, and view state.
- Keep old manifests working.

### Phase 5 - Compare Header View Switcher

- Show route/view switcher only for multi-route or multi-state proposal sets.
- Keep primary compare controls stable.
- Show `New state` for stateful proposal screens that do not exist in Live.

### Phase 6 - Prompt Wrappers And Plan Mode

- Update existing-app decision, preview-first, saved mockup review, build-selected, Plan Mode accept, and Plan Mode revise prompts to include route/view context.
- Extend `codex-plan-preview` JSON schema/parser for route/view states and flow steps.
- Preserve old preview specs.

### Phase 7 - Verification

- Add parser/state tests for:
  - route-only compatibility;
  - route plus root view state migration;
  - one-route multi-step view identity;
  - mark serialization with route/view context;
  - adjusted highlight serialization with route/view context;
  - query/state sanitization;
  - Plan Mode route/view preview summary.
- Dogfood in real Electron:
  - one-route app with `Next` flow;
  - tabbed single-route app;
  - modal/drawer state;
  - selected-record detail state;
  - multi-route app from P22.

## Main Risks

- Automatic view-state inference can become noisy or wrong if it overreads the DOM.
- Prompt context can bloat if interaction traces are not capped.
- Users may be confused if every filter/search becomes a separate state, so only meaningful UI states should get labels.
- Replaying one-route interactions may be unreliable; agent-authored proposal state is safer than pretending desktop can replay every click path.
- Multiple marks on the same route can clutter the composer unless labels stay compact.

## Next Slice

Before implementing P22, merge P22b's view-state model into the P22 implementation prompt. Start with shared route/view types, migration, Live view-state capture, multi-state mark chips, and prompt serialization. Keep mockup manifest and Plan Mode schema changes for the next slice if the first slice gets too large.
