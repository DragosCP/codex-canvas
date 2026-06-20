# P27 Fix - Canvas Action Wiring Regressions

## Status

- Implemented fix slice; final verification notes should be kept in this file when the test/build pass completes.
- Follow-up P27-cool dogfood fix implemented: P27 Canvas questions are now agent-authored decision strips rather than desktop-generated fixed choices, and agent-authored `show_preview` / `show_options` choices route to the right proposal lane by structured `canvasAction` plus request semantics instead of magic prompt words.
- Verified in real Electron on `ExampleY`: ambiguous Settings placement prompt produced an agent-authored strip (`Preview`, `Compare`, `Build`); selecting `Preview` and sending created a Live proposal `A` with one highlight, no `.codex/mockups` files, and no premature implement card.
- Follow-up P27-cool wiring fix implemented after owner dogfood: removed the legacy saved-mockup one-row `Compare | Live | A/B/C` toolbar path, removed unused compare-title props, and retargeted stale saved-mockup inspector selection to the current active live proposal when one exists.
- Follow-up proposal-lane usability fix implemented: Plan Preview proposal lanes now auto-start/reconnect Live so `A` can show `Changes`, `Mark area`, and `Build selected` instead of only a stopped-state build button; active saved mockups also expose a stopped `Live` target even in blank projects.
- Created after real P27 dogfood showed the resolver exists but the execution wiring still fell back into old proposal behavior.
- Follow-up dogfood found an applied code-backed A/B/C set could remain visually open and still catch later routing. The fix splits active proposal routing from visible comparison history.
- This plan remains before P27b cleanup. P27b should not delete legacy paths until these regressions are fixed and verified.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/P27b-canvas-legacy-cleanup.md`
- `plans/P28-canvas-mode-and-visual-plan-evidence.md`

## Non-Negotiable Guardrail

- This plan was created before the owner-approved P27-cool header change. For current work, preserve the P27-cool contract from `docs/UI-UX.md`: distinct Live and proposal lane rows, proposal labels `A/B/C`, row-local actions, and floating icon-only viewport switching.
- Do not change the Canvas v2 preview header buttons, labels, order, grouping, visibility, lane placement, or overflow behavior without explicit owner consent.
- Preserve the current locked header contract from `docs/UI-UX.md`:
  - Live stopped: `Preview`, `Detect`, `URL`.
  - Live running: `Mark area`, `Reload`, `Stop`, `Open`.
  - A/B/C proposal tabs: `Changes` when present, `Mark area`, `Build selected`.
  - Floating viewport control: icon-only `Desktop` / `Mobile`.
- `Changes` belongs to proposal tabs only. It must not appear as a Live-running header action.

## Observed Broken Workflow

Test project: empty local project `pl27`.

1. User asked for a mobile-first glassmorphism to-do app.
2. P27 correctly showed the first Canvas question:
   - `Build directly`
   - `Show one preview`
   - `Show 2-3 options`
3. User chose `Show 2-3 options`.
4. After a few seconds, the app showed `Implement this proposal?` instead of waiting for A/B/C runnable proposals.
5. Submitting while the turn was still running produced:
   - `Codex is already working on another turn. Wait for it to finish before sending again.`
6. After waiting and submitting again, it sent `I accept this proposal. Implement it now.`
7. The app eventually built Live directly after several thinking rounds.
8. The expected A/B/C proposal comparison was never available as a real review surface.

## Diagnosis

P27 added a pure Canvas resolver, but the resolver is not yet enough. The adapter from resolver output to existing desktop execution lanes still allows legacy behavior to take over.

### Failure 1 - ASK_USER Choice Loses The Intended Lane

- Empty-project `ASK_USER` asks the user whether to build, show one preview, or show 2-3 options.
- Before the post-dogfood correction, the selected `Show 2-3 options` choice was converted by a desktop-owned `canvasQuestionChoicePrompt`.
- Because the `ASK_USER` resolution did not carry `lanePreference: "code_workspace"` for the no-Live case, the choice was converted into a temporary Live proposal prompt instead of code-backed A/B/C proposal workspaces.
- Result: the old Live proposal/plan card appears (`Implement this proposal?`) instead of A/B/C.
- Follow-up correction: P27 Canvas questions should now be agent-authored decision strips. Desktop still supplies allowed `canvasAction` routing values and lane context, but it should not generate the exact questionnaire choices or prompts.

### Failure 2 - Proposal Accept Card Appears While Turn Is Running

- `sendDraft` creates a `PlanProposal` immediately for `liveOverlayProposalOnComplete`.
- `shouldShowPlanProposalReview` allows the proposal review card to render before the agent turn is finished.
- The UI invites the user to submit while `runningTurnId` is still active.
- The send layer then blocks with `Codex is already working on another turn...`.

### Failure 3 - Tests Cover Resolver Only, Not The Product Flow

- `npm --prefix apps/desktop run test:p27` passes.
- The current P27 tests exercise `resolveCanvasAction`, but not the adapter path:
  - Canvas question choice
  - prompt conversion
  - proposal lane selection
  - `openMockupsOnComplete` / `codeProposalOnComplete` / `liveOverlayProposalOnComplete`
  - visible proposal card timing
- The regression is therefore outside the current fixture coverage.

### Failure 4 - Live Header Can Show `Show changes`

- The dogfood screenshot showed `Show changes` in the Live running header.
- That violates the locked header contract.
- `Changes` is for Proposal Canvas A/B/C when agent change marks are present.
- Live running should show only `Desktop` / `Mobile`, `Mark area`, `Reload`, `Stop`, `Open`.

## User Workflow Contract To Restore

### Empty Project Start

- If there is no Live app and the user chooses `Show 2-3 options`, the product should create A/B/C proposal options.
- The user should see A/B/C in the proposal preview only after the proposals are actually ready.
- No `Implement this proposal?` accept card should appear before the proposal artifacts exist.

### Running Turns

- The UI must not show an actionable Submit/Build proposal card for a proposal that is still being generated.
- If a review placeholder must exist during generation, it should be non-actionable and clearly show a generating/waiting state.
- The user should never be invited into an action that will immediately fail with `Codex is already working`.

### Proposal Versus Live

- A/B/C proposal review must happen before implementation.
- `Build selected` remains a composer/agent handoff after the user has seen/selects an option.
- Live should not inherit proposal `Changes` header behavior.
- After a selected code-backed option is built into Live, Live is the source of truth. The just-built `Live | A | B | C` comparison may remain visible for verification, but the old proposal set must not remain active routing for new ambiguous requests.
- Proposal `Changes` marks should be useful visual evidence. If a change mark is approximate, the user must be able to move/resize it into the intended spot and send that adjusted mark as context.

## Implementation Plan

### Phase 1 - Fix Canvas Question Lane Preservation

- Make `ASK_USER` resolutions preserve the lane they are asking about.
- For no-Live `Show one preview` and `Show 2-3 options`, default to `code_workspace`.
- Ensure agent-authored decision-strip choices can route through the intended lane from the question context, not from a desktop-generated fixed prompt template.
- Expected result:
  - empty project + `Show 2-3 options` -> code-backed proposal workspaces A/B/C;
  - existing Live app + `Show one preview` -> lightweight Live proposal unless structural/broad request needs code workspace.

### Phase 2 - Block Premature Proposal Review Cards

- Prevent `PlanProposal` review cards from rendering as actionable while the turn that will produce the actual proposal is still `inProgress`.
- Prefer one of:
  - do not create the review card until the turn completes and proposal metadata exists;
  - render a passive generating state with no Submit button.
- Ensure clicking Submit cannot happen while `runningTurnId` is active.
- Do not rely only on send-layer blocking as the user-facing protection.

### Phase 3 - Re-Lock Live Header `Changes`

- Restrict inline/menu `Changes` controls to proposal toolbar contexts only.
- Live running header must not show `Show changes`.
- Proposal A/B/C tabs should still show `Changes` when agent marks/highlights are present.

### Phase 4 - Add Adapter-Level Tests

- Add tests beyond pure `resolveCanvasAction`.
- Cover at least:
  - no-Live `ASK_USER` + `Show 2-3 options` converts to code-backed A/B/C proposal workspace generation;
  - no-Live `ASK_USER` + `Show one preview` converts to one code-backed proposal workspace, not Live overlay;
  - existing Live + `Show one preview` converts to Live overlay proposal;
  - proposal accept/review card is not actionable while the generating turn is in progress;
  - Live running header does not show `Show changes`;
  - proposal tabs still show `Changes` when highlights exist.

### Phase 5 - Dogfood The Exact Broken Flow

- Use a new empty local project, not the owner’s current example projects.
- Prompt for the mobile-first glassmorphism to-do app.
- Select `Show 2-3 options`.
- Verify:
  - no premature `Implement this proposal?` card;
  - no `already working` error from clicking a visible action;
  - A/B/C proposal tabs appear only when proposal workspaces are ready;
  - `Build selected` is available in the proposal header/composer flow;
  - Live preview can be built after selecting an option;
  - Live running header does not show `Show changes`.

### Phase 6 - Applied Proposal Comparison History

- Split code-backed proposal state into:
  - active routing proposal set, which can be revised, extended, or built;
  - visible comparison proposal set, which can remain open beside Live for selected-versus-implemented verification.
- On successful code-backed build/apply:
  - mark the proposal set applied;
  - clear the active routing pointer;
  - store it as the thread's visible comparison set;
  - open the compare shell and default to `Live`.
- Guard send-adapter proposal branches so applied/history code proposal sets cannot receive `REVISE_PROPOSAL`, `ADD_OPTION`, or `BUILD_SELECTED` just because their tab is visible.
- Recover pre-fix stale state by detecting old active code proposal sets that have a later completed explicit build/apply turn with file changes, then moving that set to applied comparison history.
- Update the Canvas operating prompt to say applied proposals are comparison history and new ambiguous visual work starts from Live.

### Phase 7 - Proposal Change Mark Evidence

- Code-backed proposal tabs expose `Changes` only as proposal toolbar state, never Live-running toolbar state.
- Code-backed fallback highlights use product-facing `Proposed change` language instead of implementation file names.
- Live proposal highlights can be moved/resized like saved mockup highlights. Releasing an adjusted highlight attaches a visual chip marked as proposal-highlight context for the next turn.
- Precise element-level marks still require richer agent-produced or DOM-derived highlight metadata; this fix provides an adjustable fallback instead of pretending file diffs contain exact geometry.

## Out Of Scope

- P27b cleanup/deletion work.
- Changing Canvas header layout or labels.
- Reworking the whole resolver from scratch.
- Adding new Canvas product surfaces beyond what is needed to fix the broken wiring.

## Success Criteria

- The exact dogfood flow no longer falls into a premature `Implement this proposal?` card.
- The user can choose `Show 2-3 options` and get real A/B/C proposal review before implementation.
- The user is not shown an action that fails because Codex is already working.
- `test:p27` or a new P27 fix test fails before the fix and passes after it.
- Live running header matches the locked contract.
- Proposal `Changes` remains available only where proposal agent marks exist.
- After implementing A/B/C into Live, the user can still compare `Live | A | B | C`, but future unspecified visual prompts route from Live.
- Adjusting a proposal `Changes` highlight creates a supporting visual chip instead of leaving the mark immovable.
