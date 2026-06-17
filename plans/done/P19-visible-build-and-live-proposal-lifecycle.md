# P19 - Visible Build And Live Proposal Lifecycle

## Status

- Implemented.

## Relevant Docs

- `docs/Arch.md`
- `docs/UI-UX.md`
- `plans/done/P20-prompt-wrapper-and-legacy-canvas-cleanup.md`
- `plans/wip/P17-existing-app-visual-decision-lifecycle.md`

## Goal

Make visual build and comparison flows behave like a product workflow instead of a hidden script. The user's visible composer text must be the source of truth, old empty-project mockups must become history after implementation, and new design options for an existing app must compare against the current Live app.

## User Workflow Contract

### 1. Empty Project Starting Options

- User asks for a new app in an empty folder.
- Codex Local can offer `Build directly`, `Show wireframes`, or `Show mockups`.
- If the user chooses wireframes/mockups, Codex creates A/B/C starting directions.
- A/B/C are concept artifacts, not real app branches.

### 2. Build Selected Option

- In Mockup Preview, `Build selected` stages friendly composer text, such as:
  - `Implement option A`
  - `Implement selected preview`
- The user can edit that composer text before sending.
- Any user edit is authoritative:
  - `Implement option A, but change the marked area to use compact filters`
  - `Build A, but combine it with the marked part from B`
- On send, the chat must show the visible text the user sent, not the hidden build payload.
- Hidden context may include selected option, mockup file, original request, and mark chips, but it must support the visible text rather than replace it.
- The agent instruction should explicitly say: user-visible request overrides the selected mockup where they conflict.
- If the user says `Implement option A, but move it to the marked area`, the implementation must apply the selected option plus the user's mark/text changes in the real Live app.
- Once implemented, the result is normal app UI using the current layout, palette, and brand. Temporary proposal styling such as grey labels, gold borders, or red highlights must not leak into the accepted Live result unless the user explicitly asked for that style.

### 3. After Build Selected Completes

- The agent implements real app files and stops.
- App Preview controls own starting/reloading the real app.
- Initial A/B/C mockups switch to history/reference mode.
- The composer A/B/C selector disappears.
- Mockup Preview can still open old A/B/C pages as records, but they are no longer active future proposals.
- The primary visual surface becomes `Live`.

### 4. Existing App Direct Changes

- If the user is precise enough, Codex can implement directly:
  - “Change this button text”
  - “Move this marked card to the top”
  - “Make the marked modal smaller”
- A mark chip can support direct implementation when the intent is clear.
- No A/B/C options are needed for obvious small changes.

### 5. Existing App Design Questions

- If the user asks a broad UI/UX/product question and does not provide a precise implementation direction, Codex should create proposed future variants based on the current Live app.
- Examples:
  - “How would you add an agentic task inbox?”
  - “What is the best workflow for recurring tasks?”
  - “How should AI memory fit into this app?”
- The preview surface shows:
  - `Live | Preview` for one proposed direction
  - `Live | A | B | C` for multiple proposed directions
- `Live` is the current implemented app.
- Proposed tabs are temporary future UI directions based on Live, not stale empty-project mockups.
- Proposed tabs should inherit the current Live app's layout, palette, density, typography, and interaction model whenever possible. If the live app is visually heavy, the proposal may use subtle temporary distinction such as a muted `Proposed` label, soft tint, or greyed comparison chrome so the user can immediately tell Live from proposed.
- Proposed tabs must be authored from the agent's actual plan, not generated from generic local placement templates.
- Labels should name the product idea, such as `Countdown cards`, `Deadline lane`, or `Reminder sheet`, not implementation buckets such as `Inline action`, `Focused panel`, or `Guided dialog`.
- If the written plan has only one real direction, show `Live | Preview`; do not invent fake A/B/C variants.
- If A/B/C are shown, each option must visually differ and describe a distinct user workflow/tradeoff.

### 6. Existing App Marked Area Ambiguity

- If the user marks an area and gives clear instructions, implement directly.
- If the user marks an area and asks an open design question, create proposed variants scoped to that area and current route.
- Mark chips can be included in revise/build prompts, and visible user text still wins.

## Visible UI Rules

- `Build selected` must stage text and never auto-send.
- The staged text must remain visible and editable.
- The chat bubble for the submitted turn must show the visible user text, not the internal selected-option/build payload.
- Internal build/select prompts must not appear in chat, sidebar, header, Activity, or copied transcript text.
- If the user edits the staged text, the edited text is the title, chat bubble, and primary instruction.
- Mockup marks remain removable chips. Removing a chip removes the rectangle and removes it from the next send.
- Old starting mockups may appear in Activity/history, but they must not keep the active composer selector alive after build.
- Existing-app proposed variants should open in the right preview surface automatically.
- Compare tabs belong in the preview header, not above the composer.
- Do not show generic placeholder preview text like `Temporary option`, repeated plan prose, or “Proposed Add” as the main comparison UI. The preview should demonstrate the concrete proposed workflow.

## Architecture Rules

- Separate three concepts:
  - visible user request;
  - hidden selected visual context;
  - internal agent guardrails.
- P19 assumes P20 has made prompt wrappers intent-preserving. Hidden selected-option context must never be described as the source of truth over the visible composer text.
- P19 should use Live App Preview and Mockup Preview vocabulary only. Do not carry forward removed legacy visual-planning memory, proposal parsers, generic draft-edit language, or old save/update actions into the new path.
- `Build selected` should serialize hidden selected-option context through the same context channel as marks, not by replacing the user's prompt.
- `SubmissionDraft` or turn metadata should preserve the visible composer text for display/title purposes.
- The sent prompt can include hidden context, but it must phrase it as supporting context:
  - “The user selected option A as a starting point.”
  - “The user-visible request below overrides this context.”
- Active mockup decision ownership is thread-scoped.
- Post-build history state is project-scoped for saved artifacts, but not composer-scoped.
- Existing-app proposals should be generated from current app state/route/viewport when available.

## Implementation Phases


### Phase 1 - Visible Prompt Preservation

- Done. Submission drafts preserve visible prompt text; chat, Activity, title/sidebar, and transcript-facing text scrub hidden context markers.

### Phase 2 - Build Prompt Priority

- Done. Build prompts treat selected mockup/marks as supporting context and make the visible request authoritative.

### Phase 3 - Mark Context Integration

- Done. Mockup/App marks serialize through composer context and remain removable scoped chips.

### Phase 4 - Post-Build History Transition

- Done. Build start flips saved mockups into history/reference mode and hides commit actions on history pages.

### Phase 5 - Existing-App Proposal Lifecycle

- Done. Broad current-app prompts offer direct/preview/directions; accepted preview artifacts compare against `Live` with concrete LLM-authored labels and summaries.

### Phase 6 - Verification

- Done. Real Electron dogfood covered empty-project mockup choice, mockup mark, edited build-selected send, Live Preview run, broad existing-app directions, Plan Mode review artifacts, marked revision, hidden-context scrubbing, and Build selected acceptance staging.
- Automated checks: `npm --prefix apps/desktop run test:p19`, and `npm --prefix apps/desktop run build`.
- Remaining honest gap: the dogfood used the mockup/review artifact path for Plan Mode visual previews, not a model-emitted `codex-plan-preview` JSON block; the parser path is covered by `test:p19`.
