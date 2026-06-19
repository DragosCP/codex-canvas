# P24 - Proposal Preview Agent Marks And Routing

## Status

- Draft.
- Created from the `example_d` workflow where a settings-placement request updated proposal option A but did not expose a `Show changes` agent-mark overlay.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`
- `plans/done/P20-prompt-wrapper-and-legacy-canvas-cleanup.md`
- `plans/done/P23b-unified-preview-shell-and-overflow.md`

## Goal

Make the Live Preview / Proposal Preview workflow match the user's mental model:

- `Live` is the current implemented app.
- `A/B/C` or `Preview` are proposed future UI states.
- User marks are areas the user points out to Codex.
- Agent marks are areas Codex points out to the user as changed proposal areas.
- Ambiguous placement requests should show a proposal before implementation.
- A changed proposal should make `Show changes` available whenever Codex can identify the changed visual area.

## User Workflow Contract

### 1. Starting From Visual Options

- User asks for a new app in an empty project.
- Codex may offer `Build directly`, `Show wireframes`, or `Show mockups`.
- User chooses wireframes/mockups and Codex creates saved proposal options.
- Mockup Preview opens with `A/B/C` proposal options.
- The proposal options are review artifacts, not the real app.

### 2. Building One Proposal Into Live

- User chooses an option and asks to implement it.
- Codex builds real app files.
- `Live` becomes the main running app surface.
- The old starting proposals become history/reference unless the current chat is still explicitly working with that proposal set.

### 3. Ambiguous Follow-Up On A Real App

- User says something like: `I am looking to implement user settings. No login yet. Just a settings button somewhere for now.`
- Because the user did not choose an exact location, Codex should not immediately implement the feature.
- Codex should offer a proposal-first path or create a review preview, depending on current state and wording.
- If a proposal set is already open, Codex may revise the selected proposal option first, but it must keep that clearly review-only unless the user explicitly asks to build/apply/implement now.

### 4. Show It First

- User says: `Show it to me first where it should be.`
- Codex should update the relevant proposal preview, such as option A, without changing real app files.
- Codex should add agent marks to the proposal manifest for the changed areas.
- The preview header should show `Show changes`.
- Clicking `Show changes` should render soft overlays on top of the proposal preview, such as a rectangle around the new settings button and, when relevant, the settings panel.
- These agent marks are temporary review overlays. They must not become accepted app UI.

### 5. User Mark Versus Agent Mark

- User mark:
  - Created by the user with `Mark area`.
  - Means "look here" or "use this area as context."
  - Serializes as explicit user-drawn context.
- Agent mark:
  - Created by Codex as proposal highlight metadata.
  - Means "this is what changed in the proposal."
  - Powers the `Show changes` / `Hide changes` button.
  - Can be moved/resized by the user and then sent back as supporting context.

## Observed Problems

### Problem 1 - Ambiguous "Looking To Implement" Routed Too Directly

- In `example_d`, the prompt `I am looking to implement a user settings. No login yet. Just a settings button somewhere for now.` was treated too much like an implementation request.
- The phrase `looking to implement` should not be equivalent to `implement now` when the user also says `somewhere for now`.
- Vague placement should trigger proposal-first behavior.

### Problem 2 - Active Proposal Context Wins Too Early

- Because the user was already in the saved proposal / Mockup Preview workflow, the saved-mockup review wrapper handled the prompt before current-app visual-decision routing.
- That wrapper says explicit build/implement requests can build from the selected proposal direction.
- This is too eager for exploratory wording.

### Problem 3 - Proposal HTML Updated Without Agent Marks

- The follow-up `Show it to me first where it should be` updated `wireframe-a.html`.
- The new settings button and settings panel appeared in option A.
- But `manifest.json` did not receive a `highlights` array for option A.
- The preview toolbar therefore showed disabled `No changes` instead of enabled `Show changes`.

### Problem 4 - Current Prompt Rules Are Uneven

- Existing-app preview-first prompts ask Codex to add `highlights` metadata.
- Saved proposal review/revision prompts do not require the same metadata when updating an existing proposal option.
- This makes agent marks available in some proposal-generation paths but not in natural follow-up proposal revisions.

## Product Decisions

- Keep `Live` and `Proposal Preview` as the two visible concepts. Do not add another visual mode.
- Use `agent mark` as owner-facing shorthand, but product UI can continue saying `Show changes` / `Hide changes`.
- Treat proposal highlights as part of Proposal Preview, not as a separate Canvas-like feature.
- If Codex changes a proposal preview, it should create or update highlights for the visual changes whenever practical.
- If Codex cannot confidently locate a changed area, it should still explain the preview changed, but the UI may honestly show `No changes`.
- After a proposal is implemented, the selected proposal may remain temporarily as a verification reference so the user can compare the real `Live` result against its source. Future forward-looking prompts should work from `Live` and create fresh proposals rather than continuing old `A/B/C` options.

## Implementation Direction

### Routing

- Refine the saved proposal review path so exploratory phrases do not trigger real implementation too early.
- Treat these as proposal-first unless paired with explicit commitment wording:
  - `looking to implement`
  - `thinking of adding`
  - `where should`
  - `somewhere`
  - `show it first`
  - `where it should be`
- Keep these as implementation commitments:
  - `implement now`
  - `build selected`
  - `apply this`
  - `make this real`
  - `use option A and implement`

### Prompt Wrappers

- Update saved proposal review/revision prompts so proposal updates include manifest highlights.
- Preserve visible user text as authoritative.
- Make selected proposal context supporting only.
- When revising an existing proposal option, instruct Codex to:
  - update the selected HTML file;
  - update that option's manifest summary;
  - add or refresh `highlights` for the new or changed UI areas;
  - keep the proposal review-only unless the user explicitly committed to implementation.

### Manifest And UI

- Continue reading `mockups[].highlights` from the manifest.
- Keep `No changes` disabled only when no highlights exist.
- When highlights exist, show `Show changes`.
- Clicking `Show changes` renders proposal highlights as soft overlays.
- Moving/resizing a highlight should attach supporting proposal-highlight context for the next revision/build turn.

## Implementation Phases

### Phase 1 - Routing Audit

- Trace the send-order between:
  - selected saved proposal review;
  - existing-app visual decision;
  - explicit preview-first request;
  - direct implementation.
- Add tests for ambiguous implementation wording while a proposal set is active.

### Phase 2 - Saved Proposal Prompt Update

- Update `savedMockupReviewPrompt` so proposal revisions request highlights.
- Add wording that `looking to implement` with vague placement is review/proposal intent, not automatic build intent.
- Ensure visible composer text still wins over hidden selected-option context.

### Phase 3 - Highlight Regression Tests

- Add a fixture where a saved proposal option is revised with a new settings button.
- Verify the manifest includes `highlights`.
- Verify Mockup Preview receives non-empty `selected.highlights`.
- Verify the toolbar shows `Show changes`, not disabled `No changes`.

### Phase 4 - Real Electron Dogfood

- Use `example_d` or a fresh equivalent project.
- Reproduce the sequence:
  - create app;
  - choose wireframes/mockups;
  - build option A;
  - ask vaguely for settings placement;
  - ask to show it first;
  - verify option A updates and `Show changes` appears.
- Click `Show changes` and confirm the overlay points at the new settings button.
- Move or resize the agent mark and send a revision to confirm it serializes as proposal-highlight context.

## Verification

- Automated:
  - prompt-routing tests for ambiguous implementation wording;
  - saved proposal revision prompt tests;
  - manifest highlight parsing tests;
  - Mockup Preview toolbar state tests.
- Manual:
  - real Electron run on `example_d`;
  - one fresh interface-heavy project;
  - one backend/workflow-heavy project where vague UI placement should not create irrelevant visual proposals.

## Acceptance Criteria

- Ambiguous placement requests do not silently implement real app files.
- `Show it to me first` updates Proposal Preview, not Live, unless the user explicitly asks to implement.
- Proposal revisions create agent marks/highlights when a changed visual area is identifiable.
- `Show changes` appears for revised proposals with highlights.
- Agent marks are visually distinct from user marks and remain review-only.
- Adjusted agent marks serialize as supporting context, not as accepted app chrome.
- Existing direct implementation paths still work when the user explicitly asks to build/apply/implement now.

## Open Questions

- Should product copy call these `changes`, `agent marks`, or `proposal highlights` in user-visible UI?
- Should proposal revisions require highlights always, or only when changed areas can be bounded confidently?
- Should a vague implementation request while a history proposal is open route to current-app `Live | Preview` instead of revising old option A?
