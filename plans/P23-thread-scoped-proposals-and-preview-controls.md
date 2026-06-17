# P23 - Thread-Scoped Proposals And Preview Controls

## Status

- Plan only. No implementation has started.
- Created after reading `AGENTS.md`, `docs/Arch.md`, `docs/Prod.md`, `docs/UI-UX.md`, P19, P19b, and the active P22/P22b preview plans.
- This is P23 instead of P19c because P22 and P22b already exist in `plans/wip/`.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`
- `plans/wip/P22-route-aware-preview-proposals.md`
- `plans/wip/P22b-view-state-preview-proposals.md`

## Goal

Make proposed preview sets belong to the current chat/thread, while Live Preview stays project-owned. Simplify Compare controls so the user sees the important choices first: `Live | A | B | C`, `Desktop | Mobile`, `Mark area`, and proposal highlight visibility/reset. Remove confusing revise/add shortcuts, make wireframes read as wireframes, and keep selected-option context subordinate to the user's visible composer text.

## Current-State Notes

- Saved mockups are currently loaded from one project-level `.codex/mockups/manifest.json` and cached as `mockupPreviewSets[projectId]`.
- Active composer selectors are guarded by `mockupDecisionThreadIds[projectId] === activeThread.id`, but Inspector can still open the project-level set, which makes A/B/C feel project-scoped.
- Electron currently discovers `mockup-a.html`, `mockup-b.html`, and `mockup-c.html` in the project-level mockups folder when no manifest is present.
- The agent-created overlay is named `ProposalHighlight` in code. It is visible by default, draggable/resizable, and an adjusted highlight becomes a `source=proposal-highlight` composer context.
- `Build selected` currently stages visible text and sends selected mockup context as supporting context, but the send path also auto-wraps implementation-like typed prompts when an active Mockup Preview is selected.
- Live Preview has a `Desktop | Mobile` viewport control. Saved proposed preview artifacts currently render as one desktop iframe and mockup marks serialize `viewport: "desktop"`.

## User Workflow Contract

### 1. A/B/C Belongs To The Chat

- User creates proposal options in Chat 1 for a project.
- Chat 1 can show `Live | A | B | C` and can reopen those options as its active decision.
- User starts Chat 2 in the same project.
- Chat 2 does not inherit Chat 1's active A/B/C selector, selected option, hidden selected-option context, adjusted highlights, or mark chips.
- Live Preview remains shared by the project, so Chat 2 can still run and inspect the same current app.
- Old proposal artifacts can be opened from Activity/history as records, but opening them must not make them the active decision for a different chat.

### 2. Proposal Files Are Session-Owned

- Preferred storage shape:
  - `.codex/mockups/<proposal-set-id>/manifest.json`
  - `.codex/mockups/<proposal-set-id>/mockup-a.html`
  - `.codex/mockups/<proposal-set-id>/mockup-b.html`
  - `.codex/mockups/<proposal-set-id>/mockup-c.html`
- `proposal-set-id` should be stable and compact, based on thread/turn identity when available, such as `thread-abc123-turn-def456`.
- The manifest stores `proposalSetId`, `threadId`, `createdTurnId`, `artifactKind`, `originalPrompt`, `selectedMockupId`, and entries for each saved file.
- If the implementation needs a smaller first step, flat names such as `s-1_mockup-a.html` are acceptable only if the manifest still gives each proposal set a thread-owned identity.
- Legacy `.codex/mockups/manifest.json` remains readable as history/reference and migrates lazily into the new model when practical.

### 3. Wireframes Say Wireframes

- If the user chooses wireframes, UI copy says `wireframe`, not `mockup`.
- Above-composer strip copy becomes things like `2 wireframes ready`.
- Preview title becomes `Wireframe preview` or `Compare wireframes`.
- Chips become `Wireframe A mark 1` where useful, not `Mockup mark 1`.
- File naming should prefer `wireframe-a.html` for new wireframe artifacts, while old `mockup-a.html` remains supported.
- If a set mixes artifact kinds or the kind is unknown, use the neutral label `preview`.

### 4. Proposal Highlights Are Hidden By Default

- Proposal highlights are agent-created changed-area overlays, not user marks.
- Proposed tabs hide proposal highlights by default.
- The Compare toolbar has a compact toggle such as `Show changes` / `Hide changes` or an eye icon with that tooltip.
- When shown, highlights keep their soft draggable/resizable treatment.
- Moving/resizing a highlight records an adjustment for the selected option only.
- A reset action, such as `Reset changes`, restores adjusted highlights to their manifest positions and removes the adjusted-highlight context.
- Untouched proposal highlights create no composer chips or prompt context. A composer chip appears only after the user moves or resizes a highlight, and later adjustments update that same chip instead of creating extras.
- Do not show both the original and moved highlight as competing overlays.

### 5. User Marks And Proposal Highlights Share One Mental Model

- Keep the underlying data distinction:
  - user mark: explicitly drawn by the user with `Mark area`;
  - proposal highlight: suggested by the agent to call out a changed area.
- In the UI, group them under visual context instead of making the user reason about "agent mark", "moved agent mark", and "user mark" as separate design modes.
- Adjusted highlights should read like `Moved change area: Filters`, not like a second user mark.
- User marks stay user-owned and removable. Proposal highlight adjustments stay proposal-owned and resettable.
- Prompt serialization should still identify the source so Codex knows whether the rectangle came from the user or from an adjusted proposal highlight.

### 6. Remove Revise And Add From Compare

- Remove `Revise` and `Add` buttons from Mockup/Proposed Preview Compare.
- Users can type natural feedback in the composer instead:
  - `Make A tighter and keep the left nav from Live.`
  - `Show one more direction focused on search.`
  - `Use the moved change area but make it smaller.`
- The existing saved-mockup review prompt can still interpret typed revise/add/explore requests without dedicated toolbar buttons.
- If no caller remains for explicit revise/add composer actions, delete that UI-only plumbing rather than leaving dead state behind.

### 7. Build Selected Audit

- Target behavior: selected-option context supports the visible prompt, never outranks it.
- If `Build selected` remains, it must be only a transparent composer shortcut:
  - stage text such as `Implement option A`;
  - keep the text editable;
  - never auto-send;
  - turn Plan Mode off only as an explicit implementation path;
  - attach selected option context as support.
- Audit the automatic send-time build wrapper for typed prompts while Mockup Preview is active. If it surprises normal user prompts, narrow it to cases that explicitly reference the selected option or remove it.
- If implementation finds `Build selected` has hidden behavior that cannot be made transparent, remove the button and rely on the user's typed prompt.

### 8. Desktop/Mobile Applies To Proposed Tabs

- Proposed preview tabs get the same viewport choice as Live Preview.
- Header order should be:
  - primary compare switch: `Live | Preview` or `Live | A | B | C`;
  - viewport: `Desktop | Mobile`;
  - `Mark area`;
  - proposal-specific actions such as `Show changes`, `Reset changes`, and any implementation shortcut that survives the audit.
- Switching `Desktop | Mobile` updates the selected proposed artifact viewport and mark coordinate system.
- Marks and adjusted highlights serialize the selected viewport.
- Live and proposed tabs should share the selected viewport unless a specific implementation reason requires separate state.

### 9. Header Responsiveness

- Live Preview and Proposed Preview should use one shared header layout model.
- The compare switch stays the most stable control and should remain visible first.
- `Mark area` and `Desktop | Mobile` are the next most important controls.
- Left-side title/status/route chips truncate or hide before core controls disappear.
- Secondary proposal actions move under `...` when the Inspector narrows.
- The header may wrap to a second row, and at most a third row, but must not grow beyond three rows. Anything lower priority goes into `...`.
- No overlapping controls, no clipped button text, and no extra panel/card nesting.

## State Model

- Introduce a proposal-set identity:
  - `proposalSetId`
  - `projectId`
  - `threadId`
  - `createdTurnId`
  - `artifactKind`: `mockup`, `wireframe`, or `preview`
  - `status`: `active`, `history`, `stale`, or `superseded`
- Replace project-keyed active proposal state with proposal-set keyed state.
- Keep project-owned Live Preview state unchanged.
- Replace or augment `mockupHistoryProjectIds` with proposal-set history state. A built proposal set becomes history; it should not make every other chat's proposal set disappear unless that set is explicitly stale after implementation.
- Composer contexts for proposal marks/highlights include `proposalSetId` and `threadId`, and are hidden/blocked when the active thread does not match.
- P22/P22b route/view identity should compose with proposal-set identity rather than creating a second ownership model.

## Prompt And Manifest Rules

- Visual artifact prompts should tell Codex to write into a thread-owned proposal folder once the desktop has a `proposalSetId`.
- Manifest entries include `kind` or inherit `artifactKind` from the set.
- One-preview current-app sets use label `Preview`; multi-option sets use `A`, `B`, `C`.
- Wireframe prompts use wireframe labels and may generate simpler visual fidelity, but they still use the same preview/compare lifecycle.
- Existing accepted rule stays: visible user request is authoritative over selected mockup/preview/highlight context.
- Proposal highlight prompt rules should say highlights are hidden review overlays by default and must never appear in accepted app UI.

## Implementation Phases

### Phase 1 - Proposal Set Identity And Storage

- Add proposal-set types and migration helpers.
- Key active proposal preview sets by `proposalSetId`, not only by `projectId`.
- Make `mockups_list` accept optional `proposalSetId` or thread context and return the matching set.
- Support reading old root `.codex/mockups/manifest.json` as legacy history.
- Update history/stale handling so build completion marks the selected proposal set, not the whole project by default.

### Phase 2 - Prompt And Manifest Naming

- Update empty-project and current-app visual prompts to request session-owned folders.
- Add `artifactKind` to prompt rules and manifest parsing.
- Update UI title helpers, Activity titles, strip copy, composer chip labels, and friendly title scrubbers so wireframes say wireframes.
- Keep old manifests and old file names working.

### Phase 3 - Highlight Controls

- Hide proposal highlights by default.
- Add `Show changes` / `Hide changes` and `Reset changes`.
- Store adjusted highlight state per `proposalSetId + optionId + highlightId + viewport`.
- Create prompt context for proposal highlights only after a user adjustment, and update the existing context instead of adding duplicate chips.
- Reset adjusted highlights without touching user marks.
- Prevent adjusted highlights from creating confusing duplicate chips.

### Phase 4 - Toolbar And Viewport Consistency

- Extract or converge on one preview header layout shared by Live and Proposed Preview.
- Add `Desktop | Mobile` to proposed tabs and serialize proposed marks/highlights with the selected viewport.
- Apply the action priority and `...` overflow rules.
- Ensure the header never exceeds three rows at narrow Inspector widths.

### Phase 5 - Remove Revise/Add And Audit Build Selected

- Remove `Revise` and `Add` from Compare.
- Keep natural typed revise/add behavior through saved preview review prompts.
- Audit `Build selected` and the automatic build-wrapper path.
- Keep `Build selected` only if it is a pure editable composer shortcut; otherwise remove it and rely on typed prompts plus selected-option context.

### Phase 6 - P22/P22b Compatibility

- Ensure route/view-aware proposal identity includes `proposalSetId`.
- Make route/view marks and adjusted highlights thread-owned.
- Ensure Live route/view state remains project-owned and does not activate another chat's proposals.

### Phase 7 - Verification

- Add parser/state tests for:
  - thread-owned proposal set selection;
  - no A/B/C leakage across chats in the same project;
  - legacy root `.codex/mockups` loading;
  - wireframe labels in UI helpers and prompt/title scrubbers;
  - hidden proposal highlights by default;
  - reset adjusted highlight position;
  - `Build selected` visible prompt priority.
- Run desktop checks:
  - `npm --prefix apps/desktop run test:p19`
  - `npm --prefix apps/desktop run test:p20`
  - `npm --prefix apps/desktop run build`
- Dogfood in real Electron with two projects:
  - interface-heavy project with Live running and current-app proposals;
  - backend/workflow-heavy or empty project using wireframes first.
- Manual flows:
  - create A/B/C in Chat 1, start Chat 2, confirm Chat 2 has no active A/B/C;
  - reopen Chat 1 and confirm its A/B/C returns;
  - create wireframes and confirm all visible labels say wireframe;
  - compare `Live | A | B | C`, switch Desktop/Mobile, mark an area, and send;
  - show/hide proposal highlights, move one, reset it, and confirm context is removed;
  - type a custom implementation prompt mentioning option A and confirm visible text wins;
  - narrow Inspector and confirm core controls stay visible without exceeding three rows.

## Main Risks

- Session folders can create orphaned artifacts unless Activity/history has a clear way to list them.
- Moving from project-keyed to proposal-set keyed state can break the current convenient "open saved mockups" behavior if legacy fallback is not preserved.
- Hiding highlights by default may make some proposals feel less explanatory unless option labels and summaries remain strong.
- Removing Revise/Add shifts more responsibility to natural typed prompts, so prompt wrappers need to interpret follow-ups reliably.
- Mobile rendering of arbitrary saved HTML artifacts may need scaling rules to avoid false layout regressions.
- Header overflow can become fiddly if every action competes for first-row space; the priority order must stay strict.

## Next Slice

Implement Phase 1 and Phase 2 together first: proposal-set identity, session-owned storage, legacy loading, and wireframe naming. Then implement highlight controls and toolbar cleanup as the second slice.
