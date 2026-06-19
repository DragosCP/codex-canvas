# P25b - Code-Backed Proposal Workspaces

## Status

- Done for the P25b vertical slice.
- Phase 0 saved-mockup history guard is implemented.
- Code-backed proposal workspaces are implemented for empty-project runnable A/B/C choices and explicit serious existing-app preview-first requests.
- Follow-up work remains for cleanup/history polish, richer revision handling, and broader dogfood, but the core branch-like proposal and promotion path is implemented.
- Builds on P25, but solves a different problem: accepted proposals should be promotable code, not just visual guidance that Codex recreates later.
- Static `.codex/mockups` and lightweight Live proposal metadata remain valid for the cases where they are honest and fast.
- Also covers the post-implementation follow-up bug where an old saved Option A mockup is edited again after it has already been built into Live.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`
- `plans/done/P23b-unified-preview-shell-and-overflow.md`
- `plans/done/P25-live-overlay-and-temp-code-proposals.md`
- `plans/P24-proposal-preview-agent-marks-and-routing.md`

## Goal

Make serious preview proposals feel like temporary code branches.

When Codex creates proposal A/B/C for a new app, new page, redesign, or substantial UI/workflow change, the proposal should already be real runnable project code in an isolated workspace. If the user accepts option A, Codex should promote option A into the Live project by applying its patch, not rebuild the same design from scratch in a second slow implementation turn.

## User Workflow Contract

### 1. New Project, First App

- User creates an empty folder and asks for an app.
- Codex can still offer `Build directly`, `Show wireframes`, or `Show 2-3 runnable proposals`.
- If the user chooses runnable proposals:
  - Codex creates proposal A/B/C as isolated runnable project workspaces.
  - The preview header shows `Live | A | B | C`, but `Live` is blank/stopped until one proposal is accepted.
  - A/B/C are real preview apps, not copied static mockup pages.
- When the user accepts A:
  - the patch behind A is promoted into the real project folder;
  - `Live` reloads from the real project;
  - A can remain briefly as `Source` or `Accepted proposal` for verification, then becomes history.

### 2. Existing App, Big UI Or New Page

- User has a running Live app and asks for something substantial:
  - redesign this dashboard;
  - add a settings page;
  - add a multi-step workflow;
  - create a new view with real routing/state;
  - try two very different layouts.
- Codex should create code-backed proposal workspaces instead of static copied HTML when the proposal would otherwise duplicate a large UI.
- The preview header stays conceptually simple:
  - `Live | Proposal` for one runnable proposal;
  - `Live | A | B | C` for multiple runnable proposals.
- The user compares against Live, marks areas, asks for revisions, or accepts one option.
- If the user asks to add a named option such as `Option C based on B`, the app adds or refreshes C inside the current proposal set and keeps existing A/B visible for comparison. It must not create a fresh one-option set labeled A.
- Canvas v2 currently supports A/B/C as the active comparison set. If the user asks for Option D or a fourth simultaneous option, Codex must stop and explain the limit before generation, asking whether to revise/replace A/B/C or start a fresh proposal set.

### 3. Small Existing-App Placement Changes

- P25 lightweight Live proposal metadata remains the default for small controls, copy, menus, panels, sheets, and local placement ideas.
- The app should not spin up separate proposal workspaces just to show a settings icon placement or a tiny filter button.
- If a small proposal grows into real component/routing work during revision, it may be upgraded to a code-backed proposal.

### 4. Accepting A Proposal

- Accepting a code-backed proposal applies the selected proposal patch to the real project.
- The accept path should be fast and deterministic when the real project has not changed since the proposal baseline.
- Codex may run a short follow-up verification/fix turn after patch application, but it must not regenerate the whole proposal from prose.
- If the real project changed after the proposal was created, the user should see an honest conflict/stale state instead of a silent best-effort rewrite.

### 5. Rejecting Or Abandoning Proposals

- Rejected proposal workspaces do not mutate the real project.
- Old proposal workspaces can be cleaned up automatically after acceptance, dismissal, project close, or an age/size limit.
- The user should not need to manage proposal folders manually.

### 6. Follow-Up After A Saved Mockup Was Built

- User starts with static A/B mockups, tweaks A, then builds A into the real app.
- After build, saved A/B are history/reference only.
- If the user later asks for a new feature such as `I'm looking to create a settings option for the user`, Codex must not update the old saved Option A as the active proposal surface.
- The correct follow-up path is based on current Live:
  - precise/direct request -> implement in Live;
  - ambiguous placement/UX request -> show `Build directly`, `Show quick proposal`, or `Show 2-3 directions`;
  - tiny placement proposal -> P25 Live metadata proposal;
  - serious runnable proposal -> P25b code-backed proposal workspace;
  - explicit rough mockup/wireframe request -> fresh saved `.codex/mockups` proposal set.
- Old saved A may be reopened as `Source` or `History` for comparison, but should not be silently mutated unless the user explicitly says they want to edit that historical mockup rather than the app.

## Product Model

Use three preview layers, each with a clear job:

1. **Live metadata proposal**
   - Fastest.
   - Best for tiny changes on top of the current app.
   - Uses `Show changes` marks and hidden metadata.
   - No fake in-app Codex chrome.

2. **Code-backed proposal workspace**
   - Best for serious UI, new pages, app creation, routing, state, and multi-step flows.
   - Real files are generated in an isolated workspace.
   - Preview runs from that workspace.
   - Acceptance promotes the selected patch into Live.

3. **Static mockup / wireframe**
   - Best for early ideation, explicit wireframes/mockups, rough visual exploration, and fallback when runnable preview is not honest.
   - Not a code branch and not directly promotable.
   - After it is built into Live, it is history/reference. It must not become the target for normal follow-up feature requests.

## Technical Model

### Core Concepts

- **Proposal Set**
  - Thread-owned group of one to three proposal options.
  - Has a base project path, base snapshot ID, user prompt, proposal kind, selected option, status, and timestamps.

- **Proposal Workspace**
  - One isolated filesystem workspace per option.
  - Example internal shape:
    - option A workspace path;
    - option B workspace path;
    - option C workspace path;
    - baseline manifest;
    - generated patch;
    - preview URL/process state;
    - changed-file summary;
    - verification status.

- **Baseline Snapshot**
  - Text-file manifest of the real project at the moment proposal generation starts.
  - Excludes heavy/generated directories such as `node_modules`, `dist`, `.git`, `.codex/proposals`, lockfile caches, and binary assets unless they are explicitly changed.
  - Lets the desktop decide whether a proposal can be safely promoted later.

- **Proposal Patch**
  - Diff from baseline snapshot to the proposal workspace.
  - Stored as structured file operations plus a patch text when possible:
    - create file;
    - update file;
    - delete file;
    - rename/move only if detected safely.
  - Accepting a proposal applies this patch to the real project.

### Workspace Storage

- Prefer app-owned local cache storage for proposal workspaces, not nested folders inside the user's project.
- Store only small metadata in the real project if needed, such as `.codex/proposals/manifest.json` references, but avoid copying full proposal workspaces into the project folder.
- The workspace root should be safe to delete without touching user files.
- Proposal workspace paths must be project-scoped so two projects never share or reopen each other's preview.

### How Proposal Code Is Generated

Implemented vertical slice:

1. Desktop creates one isolated proposal workspace per requested option under app-owned Electron cache storage.
2. Desktop starts one normal app-server turn with `cwd` set to the proposal-set root and hidden instructions to edit only the prepared option folders.
3. Electron's managed App Preview can run each selected option folder as a normal project path.
4. Desktop computes changed-file summaries by diffing each option folder against its baseline snapshot.
5. The Inspector preview surface switches among proposal workspaces with `Live | A | B | C` chrome.

### Accepting A Proposal

Accept should be a promotion, not a rewrite:

1. Desktop checks the real project still matches the proposal baseline for all files touched by the proposal patch.
2. If clean:
   - apply the stored file operations to the real project;
   - show normal edited-files cards;
   - reload Live preview.
3. If partly changed:
   - try a structured merge when safe;
   - otherwise show a conflict state and ask whether Codex should merge the accepted proposal into the current Live project.
4. Optional short finalization turn:
   - run only after patch application;
   - fix integration issues, dependency names, imports, or tests;
   - must not re-design the whole proposal.

### Why Not Just Copy Static A/B/C HTML Into Live

- Static mockups are often standalone and fake-data-heavy.
- They may not match the app's component structure, package setup, routing, state model, or build system.
- Copying them directly can create a worse implementation than a careful build.
- Code-backed proposals solve this by generating the proposal inside a real project workspace from the start.

### Active Versus History Proposal State

- Every proposal set needs an explicit lifecycle state:
  - `active`: current decision surface; can be revised or accepted.
  - `accepted`: selected proposal has been built or promoted to Live.
  - `history`: reopenable reference only; cannot receive normal follow-up edits.
  - `dismissed`: hidden from active controls.
  - `stale`: baseline no longer matches current Live.
- Hidden selected-option context should serialize only for `active` proposal sets.
- Once a proposal is accepted, the next unrelated user request must be interpreted against Live, not the accepted proposal artifact.
- If a user says `tweak A` after acceptance, desktop should clarify whether they mean:
  - update the current Live app based on old A as reference; or
  - edit the historical mockup only.

### Git Worktree Versus Snapshot Copy

Start with snapshot-copy workspaces because many user projects are not git repositories.

- Snapshot-copy works for plain folders, static HTML apps, and non-git projects.
- It can exclude heavy folders and optionally junction/symlink safe dependency folders where useful.
- Later, git repositories can use `git worktree` as an optimization when the repo state is suitable.
- The UI should not expose this implementation detail; it should just say proposal previews are isolated.

## UI / UX Placement

- Canvas v2 preview header is owner-locked. P25b changes the backend/proposal workspace mechanics only; it must not change the header labels, order, grouping, or visibility without explicit owner consent.
- Preserve the locked header contract:
  - Live stopped: `Preview`, `Detect`, `URL`;
  - Live running: `Desktop` / `Mobile`, `Mark area`, `Reload`, `Stop`, `Open`;
  - A/B/C proposal tabs: `Desktop` / `Mobile`, `Changes` when present, `Mark area`, `Build selected`.
- Do not show a `Live` tab unless there is a real Live app. New-project proposal sets should show only `A | B | C` until one option is built into Live.
- Do not add a second proposal header above the shared preview toolbar. Code-backed proposals must use the same single Canvas v2 header and full-height preview stage as saved mockups.
- Keep the preview header model:
  - `Live | Proposal`;
  - `Live | A | B | C`.
- Keep the shared Canvas v2 toolbar responsive behavior: one row only, a fixed compare slot so `A/B` stays anchored when `Live` appears, and right-side controls collapse to icon-only/`...` before they can overlap the compare tabs.
- Add a subtle proposal type/status in desktop chrome, not inside the app:
  - `Runnable proposal`;
  - `Generating A`;
  - `Ready`;
  - `Stale`;
  - `Accepted`.
- `Build selected` should explain the action in the button title or confirmation copy:
  - `Apply option A to Live`.
- If a proposal is stale because Live changed, the primary action becomes:
  - `Merge into current Live`;
  - or `Refresh proposal from Live`.
- The user should not see temp paths, worktree paths, patch internals, or baseline IDs unless a conflict/debug case requires it.

## Implementation Phases

### Phase 0 - Saved Mockup History Guard

- Done: fixed the immediate routing hole before building code-backed workspaces.
- Done: when `Build selected` starts for a saved mockup set, that set is marked as history and removed from active proposal routing.
- Done: composer A/B/C selectors and hidden selected-mockup context are hidden for history sets.
- Done: natural follow-up prompts after build use current Live state and normal decision-strip routing.
- Done: follow-up preview/options requests create fresh current-app proposal sets instead of editing the old saved Option A.
- Done: ambiguous current-app follow-ups no longer go through the saved-mockup review prompt that produced an unstructured yes/no question.
- Done: added `npm --prefix apps/desktop run test:p25b` to guard the observed flow at the prompt-routing/state level.

### Phase 1 - Data Model And Helpers

- Done: added proposal-set and proposal-workspace records to desktop local state.
- Done: added Electron helpers:
  - create proposal workspace from project snapshot;
  - compute proposal patch;
  - apply proposal patch to the real project when clean.
- Done: added exclusion rules for heavy/generated folders.
- Done: added tests for snapshot, diff, apply, and stale baseline conflicts.

### Phase 2 - Single Code-Backed Proposal

- Done: explicit serious preview-first requests route to code-backed proposal workspaces.
- Done: app-server turns run in the prepared proposal root.
- Done: proposal option folders run through managed App Preview.
- Done: changed-file summaries are stored when generation completes.

### Phase 3 - Promotion To Live

- Done: added `Apply A/B/C` for code-backed proposals.
- Done: clean proposals apply by file operations without asking the model to recreate the proposal.
- Done: Live preview reopens after apply.
- Done: stale/conflict detection blocks apply when touched live files changed since baseline.
- Future: optional finalization turn for integration fixes only.

### Phase 4 - A/B/C Code-Backed Proposals

- Done: generated one workspace per option for the selected proposal path.
- Done: progress stays in the current chat turn.
- Done: proposal tabs preview the selected workspace.
- Done: add/refresh a requested C option beside existing A/B without regenerating all options.
- Future: richer revision of any existing option without regenerating all options unless requested.
- Done: apply only the selected option's patch on acceptance.

### Phase 5 - Classification And Fallbacks

- Partially done: updated prompt wrappers/classification:
  - tiny current-app placement -> P25 Live metadata proposal;
  - serious runnable UI/new page/new app -> P25b code-backed proposal;
  - explicit rough wireframe/mockup -> saved `.codex/mockups`;
  - unavailable runner or impossible workspace -> saved artifact or text plan.
- Done: accepted/history saved mockups do not capture new normal follow-up prompts.
- Done: empty-project decision strip wording asks for runnable proposal workspaces instead of promotable-looking static mockups.
- Future: broaden existing-app decision wording and fallbacks through more dogfood.
  - `Show runnable proposal`;
  - `Show 2-3 runnable directions`;
  - not just `Show mockups`.

### Phase 6 - Cleanup, History, And Verification

- Future: add proposal workspace cleanup by age, acceptance, dismissal, and project removal.
- Future: preserve enough history to reopen an accepted proposal as `Source` for verification.
- Done: dogfooded a new project generated from scratch through decision strip -> runnable A/B workspaces -> proposal preview -> apply B -> Live preview from the real folder.
- Done: captured screenshots before each major click/state change in `artifacts/p25b-dogfood-screenshots/`.
- Done: verified accept is a direct patch promotion, not a second prose-driven rebuild.

## Acceptance Criteria

- Implemented: new-project A/B/C proposals can be generated as runnable code without mutating the real project.
- Implemented: explicit existing-app serious proposals can preview from isolated workspaces.
- Implemented: accepting a clean proposal applies a stored patch to Live instead of re-generating the UI from prompt text.
- The accepted Live app visually matches the accepted proposal unless a mismatch is explicitly reported.
- The user can still compare `Live | A | B | C` without understanding temp folders or git.
- Implemented: unaccepted proposals leave the real project untouched.
- Implemented: stale/conflicting proposals are detected before applying.
- Implemented: tiny placement proposals stay fast and do not create unnecessary workspaces.
- Implemented: a requested C option can be added beside existing A/B as C, while requests beyond A/B/C are rejected honestly before generation.
- Implemented: after a saved mockup has been built, later settings/options/placement prompts do not update that old saved mockup unless the user explicitly asks to edit the historical mockup itself.
- Implemented: ambiguous current-app follow-ups show or route through the current-app decision model instead of asking a freeform yes/no question about old wireframes.

## Verification

- Automated:
  - Done: snapshot-copy helper tests;
  - Done: diff/patch generation tests;
  - Done: patch apply tests for create/update files;
  - Done: stale baseline tests.
- Desktop DOM/state:
  - Done: create proposal workspace;
  - Done: preview proposal workspace;
  - Done: switch `Live | Proposal` and `Live | A | B | C`;
  - Done: accept proposal and confirm Live can run from the real project.
- Manual Electron dogfood:
  - Done: `p25b_dogfood_new`: prompt, generate two runnable options, preview A, switch to B, accept B, verify the real project receives `index.html`, `styles.css`, and `app.js`.
  - Done: after acceptance, the active proposal strip is cleared and Live runs from `C:\Users\drago\Desktop\p25b_dogfood_new`.
  - Done: duplicate visible decision text from stripped hidden JSON was fixed and visually verified.
  - Not completed in this slice: a second long model-run dogfood for an existing app/new page. The code-backed route is implemented and covered by state/helper tests; broader model dogfood remains follow-up.

## Risks And Tradeoffs

- Proposal generation may still take time up front, especially for A/B/C, but acceptance should be fast because code already exists.
- Copying workspaces can be expensive for large projects; exclusion rules and later git-worktree optimization matter.
- Dependency folders are tricky. Junctions/symlinks can speed previews but must not let proposal turns mutate shared dependencies.
- Applying patches without git requires careful file-operation logic.
- Parallel A/B/C generation can overload the machine or confuse progress; bounded sequential generation is safer for the first version.
- A proposal may preview successfully but still need integration cleanup after promotion; keep that finalization narrow and visible.

## Open Questions

- Should the first implementation support only one code-backed proposal, then A/B/C, or go straight to multi-option?
- Where should proposal workspaces live on Windows for easiest cleanup and least user confusion?
- Should accepted proposal patch application be desktop-owned only, or should app-server expose a first-class apply-patch endpoint?
- How much of proposal generation progress should appear in chat versus Activity?
- What is the exact cutoff between P25 lightweight metadata proposals and P25b runnable proposal workspaces?
