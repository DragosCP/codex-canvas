# P17 - Existing App Visual Decision Lifecycle

## Status

- In progress.
- Implementation completed in desktop code.
- Real Electron verification passed for existing-app decision strips, saved mockup compare tabs, stale empty-project strip invalidation, and unavailable Live state.
- Remaining gap before moving to `plans/done/`: a full model-run Plan Mode visual preview dogfood.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`

## Goal

Make visual decisions state-aware across empty projects and existing apps. A stale empty-project strip must disappear once the project has a real app, and existing-app UX/UI prompts should get current-app preview choices when helpful.

Plan Mode should become the cleanest version of this workflow: no implementation files change until the user approves, but review-only preview artifacts may be created when they are the thing the user needs to inspect before deciding.

## User Workflow Contract

1. Empty project, first broad app/UI prompt:

   - The app sends compact empty-project state and visual-planning capabilities.
   - The model may show a decision strip above the composer.
   - Copy may say the project is empty.
   - Choices can be `Build directly`, `Show wireframes`, and `Show mockups`.
   - No files are created until the user chooses and sends the selected path.

2. Existing app, broad UX/UI prompt:

   - The app sends current-app state: app exists, preview availability, current route, selected mockup if any, and app marks if any.
   - The model may show a current-app decision strip.
   - Copy must not say the project is empty.
   - Choices should be current-app language such as `Build directly`, `Show quick preview`, and `Show 2-3 directions`.

3. Existing app, user explicitly asks to view first:

   - Skip the choice strip.
   - Create one preview/mockup/live variant directly without changing the real app.
   - Open it automatically in Mockup Preview or Live App Preview.
   - Show a preview-header compare switch such as `Live | Preview` when the real app exists.
   - Let the user revise, mark an area, add another option, or build from it.

4. Existing app, user explicitly asks for options:

   - Create multiple preview directions, usually A/B/C.
   - Open the first option automatically.
   - Show `Live | A | B | C` when a real app exists, so the user can compare the current implementation with each proposal.
   - Keep A/B/C only for multi-option sets.

5. Single revised preview:

   - Do not invent option D.
   - Show one selected preview artifact.
   - Keep it selectable/reopenable like other saved mockups, but avoid pretending it is part of the original A/B/C set unless the manifest says so.

6. No live app yet:

   - Do not show a blank `Live` tab.
   - If no app structure exists, show only the proposed mockup/wireframe tabs.
   - If app structure exists but the preview is stopped, show `Live` with the normal start/detect/use-URL state.

7. Plan Mode, UI/UX or product workflow request:

   - Plan Mode remains the implementation gate.
   - The agent must not modify app implementation files until the user approves.
   - The agent may create review-only visual artifacts under `.codex/mockups` or use temporary live preview injection when visual review is needed.
   - The plan decision card stays the official decision surface: implement selected preview, revise with feedback, or dismiss.
   - The preview header is the visual workspace: `Live | Preview` or `Live | A | B | C`.

8. Plan Mode, backend/direct/non-visual request:
   - Keep the normal plan card.
   - Do not create visual tabs or mockup artifacts unless the model explains why visual review helps.
   - Do not use `.codex/mockups` as a generic scratchpad.

## Visible UI Rules

- Empty-project decision strips expire automatically when project state changes enough to invalidate them: meaningful app files exist, saved mockups exist, or a live preview is running.
- Dismissal should not be the only way stale decisions disappear.
- The strip summary must match project state. Existing apps use current-app wording.
- New saved mockup/review artifacts open in the preview surface automatically after the turn completes.
- Activity/Inspector should expose saved mockup pages as previewable artifacts so the user never has to browse `.codex/mockups` manually.
- Composer strips stay lightweight selectors. Commitment actions such as `Build selected` belong inside Mockup Preview after the user is looking at the artifact.
- The right preview surface owns comparison. When both current app and proposed artifacts exist, show `Live` plus proposed tabs in the preview header. Do not duplicate this as a large second composer surface.
- `Live` is shown only when a real app structure exists. If the app is not running, `Live` shows start/detect/use-URL controls. If there is no app structure, hide `Live` entirely.
- In Plan Mode, visual marks attach to the revise path. Drawing a mark should select `Tell Codex what to do differently`, focus the feedback box, and add a removable chip such as `Area B mark 1`.
- The primary plan action should name the selected visual target when one exists, such as `Implement option B` or `Implement selected preview`.
- Review-only files should be grouped and labeled as preview artifacts, not normal app edits, so the user understands Plan Mode has not implemented the app change yet.

## Implementation Phases

### Phase 1 - Decision Validity

- Complete. Empty-project-only decision strips are derived from their copy/prompt and hidden once the active project has meaningful files or saved mockups. Dismissals persist locally, but project state is the primary stale-strip guard.

### Phase 2 - Existing-App Visual Decisions

- Complete. Broad current-app UI prompts get compact read-only decision context with `Build directly`, `Show quick preview`, and `Show 2-3 directions`; backend/direct/explicit build/view-first prompts skip the strip.

### Phase 3 - Explicit Preview-First Flow

- Complete for saved preview artifacts. Explicit view-first/options prompts on existing apps are routed to review-only `.codex/mockups` artifacts and auto-open after the turn. Live injection remains the Plan Mode preview path.

### Phase 4 - Mockup Artifact Surfacing

- Complete. Any turn that changes `.codex/mockups` reloads and opens Mockup Preview, manifest selection wins after generation, stale missing mockups clear from state, and existing Activity/Inspector records remain clickable.

### Phase 5 - Live Vs Proposed Compare Tabs

- Complete. Mockup Preview now shows `Live` plus `Preview`/A/B/C only when app structure exists; proposed tabs own revise/add/build, Live owns App Preview controls, and live chips are labeled `Live mark 1`.

### Phase 6 - Plan Mode Integration

- Complete. Plan Mode prompt context allows review-only `.codex/mockups`, keeps implementation gated, names selected preview options in the accept action, and moves marked preview feedback into the revise path.

### Phase 7 - Verification

- Partially complete.
- `npm run build` passes in `apps/desktop`; Vite still reports the existing large-chunk warning.
- Real Electron verified in `agent1`:
  - stale empty-project decision strips no longer render as active UI once the project has a real app and saved mockups;
  - an existing-app broad UX prompt produces current-app wording: `Build directly`, `Show quick preview`, `Show 2-3 directions`;
  - internal visual-decision wrapper prompts are hidden from the visible chat message and thread title;
  - Activity mockup artifacts open Mockup Preview directly;
  - Mockup Preview history shows `Live | C | B` with only `Mark area`, not `Revise`, `Add`, or `Build selected`;
  - `Live` shows start/detect/use-URL controls and an honest unavailable state when the app preview server is stopped.
- Visual proof captured under `.codex-screenshots/`:
  - `p17-current-app-decision-strip.png`
  - `p17-mockup-preview-compare-tabs.png`
  - `p17-live-tab-unavailable-state.png`
- Not yet dogfooded end-to-end through a fresh Plan Mode model run that creates review-only visual artifacts and then accepts/revises from the plan card.
