# P27 Cool - Canvas Lanes And Header Consistency

## Status

- Implemented.
- Desktop Canvas now renders separate Live and proposal lane rows, uses `A` for one generated proposal, moves Desktop/Mobile into a floating icon-only viewport control, keeps Live/proposal actions row-local, and hides internal proposal workspace paths from user-facing file rows.
- Added adapter-level/static regression coverage for lane labels, row-local actions, active-routing recovery, compact Change/Mark chip labels, no-preview live proposal exclusion, and accepted-proposal retargeting.
- Post-dogfood routing fix: ambiguous exploratory existing-app visual requests now ask through the above-composer Canvas questionnaire before proposal creation, while explicit one-preview or A/B/C wording still creates proposals directly. The agent authors the questionnaire content; desktop only supplies routing constraints and allowed Canvas actions.
- Post-dogfood header fix: saved Mockup Preview now uses the same Live/proposal lane rows as Live overlay and code-backed proposals, the old `Compare | Live | A/B/C` class path is removed, and stale mockup inspector selection retargets to the active live proposal instead of showing obsolete chrome.
- Post-dogfood usability fix: selecting a live-overlay proposal lane auto-starts/reconnects Live so proposal actions are usable, and active saved mockup lanes show a stopped Live target even before the project has runnable app files.
- Dogfooded in `exampleX` across two chats with vague prompts. Header/lane behavior and stale old-proposal routing were fixed; one ambiguous follow-up (`make that A real so I can judge it`) still showed product nuance because the agent applied the idea directly to Live instead of updating an isolated proposal preview.
- Created from owner direction after P27/P27-fix dogfood showed that one-row `Live | Preview/A/B/C` chrome makes single previews feel like Live and leaves proposal actions visually inconsistent.
- This is an owner-approved Canvas header contract change. Do not implement it as incidental cleanup inside unrelated work.
- Owner requested this plan be implemented and dogfooded in an empty `exampleX` project with vague prompts across multiple chats, using Full access and model `5.5 Medium`.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/P27-fix-canvas-action-wiring-regressions.md`
- `plans/P27b-canvas-legacy-cleanup.md`
- `plans/P28-canvas-mode-and-visual-plan-evidence.md`

## Problem

Canvas now has better proposal routing, but the visible surface still carries old mixed concepts:

- Before this plan, a single generated preview was called `Preview`, while multi-option review used `A/B/C`.
- One-preview proposal tabs can inherit Live-looking controls, so users cannot tell whether they are inspecting Live or a proposal.
- The one-row header mixes compare selection and actions under tight width pressure.
- Decision strips above the composer and proposal cards in chat can feel like two different approval/questionnaire systems.
- Proposal `Changes` marks are useful in concept, but they need better placement evidence and adjustment handoff.
- Updating A/B/C or Live can require manual reloads, and users need a small visible signal that a lane changed.

## Goal

Make Canvas feel like one consistent visual collaboration surface built from lanes:

1. Live is one lane row.
2. Proposal options are a second lane row.
3. A single proposal is `A`, not `Preview`.
4. Each row owns its own relevant actions.
5. Desktop/Mobile viewport switching moves out of the rows into a floating canvas control.
6. Updates to any lane refresh the Canvas and show a compact changed/updating signal.
7. Questionnaire choices and proposal decisions are one product surface, not two competing surfaces.

## New Header Contract

### Row 1 - Live Lane

- Show this row when a real Live app exists, app structure exists enough to offer Live stopped controls, or proposal lanes exist and need a visible stopped Live build/drop target.
- The row contains `Live` plus Live actions only.
- Live stopped actions:
  - `Preview`
  - `Detect`
  - `URL`
- Live running actions:
  - `Mark area`
  - `Reload`
  - `Stop`
  - `Open`
- Do not show proposal-only `Changes` or `Build selected` in the Live row.

### Row 2 - Proposal Lanes

- Show this row only when proposal lanes exist.
- Use `A`, `A | B`, or `A | B | C`.
- Never label a generated option as `Preview`.
- A one-preview flow is a one-option proposal set: `A`.
- Proposal actions:
  - `Changes` when agent change marks/highlights exist
  - `Mark area`
  - `Build selected`
- Do not show Live stopped/running actions in the proposal row.

### Floating Viewport Control

- `Desktop` / `Mobile` does not live in the Live row or proposal row.
- Show viewport switching as a floating transparent control inside the Canvas itself, centered at the top of the preview surface.
- Use icons only, with tooltips or accessible labels for `Desktop` and `Mobile`.
- The floating viewport control applies to the currently selected lane, whether that is Live, A, B, or C.
- Keep it visually light so it feels like Canvas chrome over the preview, not a button group inside the user's app.
- It must not block important app content more than necessary; hide, fade, or compact it under tight vertical pressure if needed.

### Selection

- Clicking `Live` shows the Live surface and Live row actions.
- Clicking `A/B/C` shows that proposal surface and proposal row actions.
- If both Live and proposal rows exist, both rows remain visible so the user understands Canvas is `Live AND A/B/C`, not `Live OR A/B/C`.
- If only one row exists, show only that row.
- In a blank project with proposals but no runnable Live app yet, keep `Live` visible as a stopped lane target; show Live controls only when the user selects `Live`.

## Lane Update Signals

- Each lane can show a tiny update dot when it changed since the user last viewed it.
- Each lane can show a subtle progress state while it is actively being updated.
- Opening/viewing the updated lane clears its dot.
- Finishing a Live or A/B/C update should refresh the visible Canvas automatically if that lane is selected.
- Manual reload remains a fallback, not the primary way to see the finished change.

## Decision Strip And Questionnaire Contract

- The above-composer questionnaire is the proposal decision surface.
- Do not also show a competing chat-side proposal approval card for the same decision.
- A questionnaire row has:
  - minimum 2 choices;
  - maximum 3 choices;
  - choice labels at or under 15 characters.
- Common first-row choices may include:
  - `Build directly`
  - `Show 1 option`
  - `Show 2-3`
- The agent may omit or replace choices when the user intent is already clear.
- A second questionnaire row may appear only when needed for fidelity, such as choosing between quick mockup, wireframe, and runnable preview.
- The agent should decide whether a request needs quick mockups, wireframes, or runnable proposal lanes from the user prompt, speed/clarity tradeoff, project state, and Canvas state.
- The desktop should render this structured decision model. It should not hardcode one-off branches for each wording.

## Drag And Drop Lane Updates

First slice should keep drag/drop narrow:

- Drag `A/B/C` onto `Live`:
  - ask for confirmation near the drop target: `Update Live with A?`
  - on confirm, send a plain agent instruction to update Live from the selected proposal lane.
  - do not open a questionnaire.
- Drag `Live` onto `A/B/C`:
  - ask: `Update A from Live?`
  - on confirm, send a plain agent instruction to refresh that proposal lane from current Live.
  - do not open a questionnaire.
- Broader drag/drop such as A-to-B, empty slot creation, reordering, and lane cloning are out of scope for the first slice.
- Agent-side routing may still ask a questionnaire when the requested lane update is semantically ambiguous, stale, or conflicts with current Canvas state.

## Proposal Change Marks

- This is a regression-sensitive area. Proposal Change Marks previously worked as an `agent_mark` flow: the agent-provided mark appeared over the actual changed area, the user could move it, and releasing the adjusted mark created a composer chip with the updated location as visual context.
- Preserve and reuse that existing agent-mark-to-chip mechanic where possible. Do not rebuild it as a second duplicated marking system for P27-cool.
- `Changes` marks should point to real changed areas whenever possible.
- Agent-produced proposal metadata should include product-facing labels and semantic anchors when available:
  - changed element text;
  - role/aria/title;
  - component/source hints;
  - confidence;
  - fallback rectangle.
- If the preview can locate the element after render, snap the mark to the element.
- If confidence is low, show it as a movable suggested area.
- Moving/resizing a proposal change mark creates a visual reference chip for the next user message.
- Composer chips created from adjusted agent marks should be visibly compact. Use names such as `Change 1`, `Change 2`, and keep backing project/thread/proposal/option/route/viewport/bounds metadata hidden.
- User-drawn marks should use compact names such as `Mark 1`, `Mark 2`. If the user adds a mark on top of an existing adjusted change, both chips may exist, but neither should expose long internal labels.
- The user can send that chip with natural language to either update the current proposal lane (`A`, `B`, or `C`) or implement the adjusted change directly into Live.
- Do not expose raw selectors, temp paths, hidden prompts, workspace mechanics, or coordinate payloads in user-facing UI.

## Technical Direction

- Model Canvas as lanes, not as separate Live, Preview, A/B/C special cases.
- Suggested state:

```ts
type CanvasLaneId = "live" | "A" | "B" | "C";

type CanvasLane = {
  id: CanvasLaneId;
  kind: "live" | "proposal";
  status: "empty" | "stopped" | "running" | "updating" | "ready" | "failed";
  changedSinceViewed?: boolean;
  sourceOfTruth?: boolean;
  proposalSetId?: string;
  optionId?: "A" | "B" | "C";
};
```

- The header renders from lane state and selected lane state.
- The resolver decides canonical actions such as `ASK_USER`, `CREATE_PROPOSAL`, `REVISE_PROPOSAL`, `ADD_OPTION`, `BUILD_SELECTED`, `BUILD_LIVE_DIRECTLY`, and lane update instructions.
- Existing saved mockup, live overlay, and code-backed workspace paths can remain underneath temporarily, but they should adapt into the same lane model.
- P27b cleanup should later identify duplicated single-preview, `Live | Preview`, and proposal-card paths made obsolete by this lane model.

## Implementation Phases

### Phase 1 - Contract And Fixtures

- Update tests/fixtures to treat one preview as proposal lane `A`.
- Add lane-state fixtures for:
  - no Live, A only;
  - no Live, A/B/C;
  - Live only stopped;
  - Live only running;
  - Live plus A;
  - Live plus A/B/C.
- Assert row-local button contracts and absence of `Preview` as a proposal label.

### Phase 2 - Lane State Adapter

- Build a single adapter from existing Live/proposal/mockup/code-backed state into Canvas lanes.
- Avoid new one-off branches for saved mockups versus live overlays versus code-backed workspaces where lane state can describe the behavior.
- Preserve project/thread scoping.

### Phase 3 - Two-Row Header

- Render the Live row and proposal row from the lane adapter.
- Keep rows visually distinct and compact.
- Only show row actions for the selected lane in that row.
- Remove Desktop/Mobile from both rows and render the icon-only floating viewport control at the top middle of the Canvas preview surface.
- Ensure width behavior is stable and does not overlap controls.

### Phase 4 - Remove `Preview` Proposal Naming

- Replace user-facing single-proposal compare naming with `A`.
- Keep product copy clear: `A` can still have a descriptive title/tradeoff, but the lane label is `A`.
- Scrub stale user-facing `Live | Preview` copy where it refers to proposal lanes.

### Phase 5 - Unified Questionnaire Surface

- Make decision strips the structured questionnaire/proposal decision UI.
- Prevent duplicate chat-side proposal approval cards for the same unresolved decision.
- Let the agent produce 1-row or 2-row questionnaires within the min/max choice constraints.

### Phase 6 - Update Signals And Auto Refresh

- Track lane update start/finish.
- Show updating state and changed dots.
- Auto-refresh the selected lane when its backing artifact/workspace/live URL changes.
- Clear dots when the user views the lane.

### Phase 7 - Drag And Drop Confirmation

- Add narrow lane-to-lane drag/drop affordance.
- Confirm before sending any backend instruction.
- Send clean user-visible instructions such as `Update Live with option A`.
- Do not trigger a questionnaire for confirmed direct lane updates.

### Phase 8 - Change Mark Evidence

- Audit the previous working `agent_mark` flow before changing this area, especially mark placement, move/resize behavior, composer chip creation, and hidden adjusted-location payloads.
- Improve proposal change metadata and DOM-assisted placement.
- Keep movable/resizable fallback behavior.
- Add tests for semantic mark labels, adjusted change chips, and compact visible chip names such as `Change 1` and `Mark 1`.

### Phase 9 - Dogfood

- Use an empty `exampleX` project and start from an empty chat.
- Use Full access and model `5.5 Medium` in the composer.
- Use vague prompts that resemble real users discovering the product. Avoid over-specific instructions.
- Do 5-10 prompts in one chat and 5-10 prompts in another chat. Creating multiple chat/thread sessions inside the same `exampleX` project is encouraged because A/B/C are unique per chat/thread while Live is project-wide.
- Verify the app does not accidentally create multiple sessions/threads for messages inside the same chat.
- Empty project:
  - broad app prompt;
  - choose one option;
  - verify `A`, not `Preview`;
  - build A;
  - verify Live plus A rows.
- Empty project:
  - choose 2-3 options;
  - verify A/B/C row and proposal actions.
- Existing app:
  - quick placement proposal;
  - verify questionnaire, proposal lane, `Changes`, mark adjustment, and build.
- Resize the desktop window and inspect DOM/screenshot evidence to confirm the two lane rows and floating viewport control do not collapse or overlap.
- Close the desktop app, build it, restart it, and continue dogfood after restart.
- Take screenshots when UI/UX judgment matters, especially header layout, lane rows, floating viewport control, proposal change marks, and compact composer chips.
- Compare an adjusted `Change 1` chip against a normal snapshot/image chip to ensure system-created chips stay compact.
- Verify no internal paths, hidden prompts, or workspace mechanics appear in chat, header, chips, or proposal copy.

## Out Of Scope

- P27b legacy deletion, except for recording cleanup candidates.
- Arbitrary Canvas freeform editing.
- Full visual design-tool layers.
- More than three proposal lanes.
- Complex lane cloning/reordering in the first drag/drop slice.
- Changing Plan Mode semantics.

## Success Criteria

- A single generated proposal is labeled `A`, never `Preview`.
- The header shows one row for Live and one row for proposals when both exist.
- Each row shows only its relevant actions.
- Desktop/Mobile is an icon-only floating Canvas control, not a row action.
- Live and proposal rows remain visible together when both exist.
- Updates to Live or A/B/C refresh the selected Canvas and show/clear lane dots predictably.
- Decision strips and proposal questions are one coherent surface.
- Dragging A onto Live or Live onto A creates a confirmation and a clean agent instruction.
- Proposal `Changes` marks preserve the previous working `agent_mark` behavior: correct placement when metadata is available, movable adjustment, composer chip creation after movement, and routing either to Live implementation or the current proposal lane update.
- System-created visual chips stay compact (`Change 1`, `Mark 1`) while backend metadata remains hidden.
- Empty-project dogfood in `exampleX` completes across at least two chats without accidental extra sessions for messages in a chat.
- The implementation reduces duplicated preview/proposal branching rather than adding another special-case path.

## Verification Summary

- Automated: `test:p19`, `test:p20`, `test:p24`, `test:p25`, `test:p25b`, `test:p27`, `npm --prefix apps/desktop run build`, `npm --prefix apps/desktop run electron:build`, and `git diff --check`.
- Electron dogfood: built/restarted the local desktop app, used `exampleX` with Full access and `5.5 Medium`, created two chats in the same project, verified Live is project-wide while proposal state is thread-owned, and confirmed the final app opens Live rather than stale accepted/no-preview proposal shells.
- UI checks: captured DOM/screenshot evidence for stopped Live row, running Live row, Live plus A/B/C compare row, floating viewport control, overflow menu, and narrow-width icon-only Live actions without row overflow.
- Not fully verified manually: dragging and adjusting an agent `Changes` mark into a compact composer `Change 1` chip, because the dogfood proposals did not produce a stable visible highlight to move during the final pass. The compact label/storage path is covered by focused tests.
