# P31 Test 0.5 - Canvas Edit Mode Milestone Gate

## Status

- Planned verification plan.
- Run this after P31 Phases 1-4 are implemented:
  - floating Edit entry and screenshot snapshot;
  - one high-confidence proxy overlay;
  - one semantic drag relation;
  - Save to removable `Edit 1` composer chip.
- Do not continue into P31 Phase 5+ until this plan passes on a real Electron app or the remaining failures are explicitly recorded as blockers.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/P31-interactive-canvas-edit-mode.md`
- `plans/wip/P30b-testing.md`
- `plans/wip/P30b-canvas-visualpatch-spine.md`

## Goal

Verify that the first real slice of Canvas Edit Mode feels like editing Canvas while staying technically safe:

1. `Edit` is floating Canvas chrome, not a Canvas header-row change.
2. The app freezes a screenshot-backed edit session.
3. One recognized high-confidence element can move as a proxy.
4. The recorded edit is semantic intent, not primary pixel coordinates.
5. `Save` creates or updates `Edit 1`.
6. Removing `Edit 1` removes the pending edit intent.
7. Live DOM, runtime app state, and source files are untouched during edit mode.

## Hard Locks

- Preserve the P27-cool header contract exactly.
- Do not add `Edit`, `Cancel`, `Reset`, or `Save` into the Live/proposal lane rows.
- Do not add `Undo`; `Reset` is the recovery control.
- Do not auto-send on Save.
- Do not implement child proposal UI, `A-edited`, rename/hide/promote, build resolution, automatic reparenting, or freeform Figma-style editing.
- Do not move live DOM nodes, mutate runtime app state, or write source files during the edit session.
- Do not expose internal target ids, coordinates, source paths, registry ids, or hidden JSON in visible UI.

## Setup

- Use the real Electron desktop app on the current branch.
- Use one fresh local project, preferably `C:\Users\drago\Desktop\P31Test05`, unless the owner provides another folder.
- The app under test must have at least two visible controls with high-confidence target metadata, such as:
  - one draggable source button, for example `Settings`;
  - one relation target, for example `Add task`.
- If the project does not naturally have high-confidence targets, create or use a small test app with stable `data-canvas-id` attributes. This setup work is allowed only to create the test fixture, not to fake the Edit Mode behavior.
- Capture source-file hashes or `git diff --no-index` style baselines before opening Edit Mode.
- Record visible thread rows before testing so accidental chat/thread creation is detectable.

## Desktop Dogfood Matrix

Use Electron DOM automation plus screenshots. Prefer DOM/state checks for repeated assertions and screenshots for visual sanity.

### 1. Live Snapshot And Header Contract

1. Open the project in the desktop app and start Live preview.
2. Capture the Live running header row and floating viewport chrome.
3. Verify `Edit` appears as floating Canvas chrome outside the lane rows.
4. Click `Edit`.
5. Verify the edit session opens over a frozen screenshot.
6. Verify the header rows still match the P27-cool contract:
   - Live running row: `Mark area`, `Reload`, `Stop`, `Open`;
   - proposal row unchanged if present;
   - Desktop/Mobile remains icon-only floating Canvas chrome.
7. Verify edit controls appear only while editing: `Cancel`, `Reset`, `Save`.
8. Verify no `Undo` control exists.

### 2. Proxy Overlay And Confidence Gate

1. Inspect overlay rectangles/proxies.
2. Verify one high-confidence source element is draggable.
3. Verify one target element is recognized for a semantic relation.
4. Verify medium/low-confidence areas, if present, are not draggable edit handles.
5. Capture a screenshot showing proxy alignment over the frozen screenshot.

### 3. Semantic Drag

1. Drag the source proxy below the target element.
2. Verify the proxy visually moves in the edit snapshot.
3. Verify the recorded edit is a semantic operation like:

```ts
{
  op: "move_intent",
  relation: "below",
  elementId: "...",
  targetElementId: "..."
}
```

4. Verify absolute coordinates are evidence only and are not the primary operation.
5. Verify the live webview DOM did not change.
6. Verify source files did not change.

### 4. Reset, Save, And Chip Lifecycle

1. Press `Reset`.
2. Verify the proxy returns to the original screenshot/proxy position.
3. Verify no composer chip is created by Reset.
4. Drag the same proxy again to a valid relation.
5. Press `Save`.
6. Verify one compact composer chip appears, such as `Edit 1`.
7. Verify Save does not auto-send a message.
8. Verify Live DOM and source files are still unchanged.
9. Remove the `Edit 1` chip.
10. Verify the pending edit intent is removed.
11. Reopen Edit or continue editing, move the same proxy again, and Save.
12. Verify the app creates or updates one `Edit 1` chip rather than duplicating chips for the same pending edit.
13. If the proxy is moved again while `Edit 1` already exists, verify the visible chip stays stable and only the hidden payload changes.

### 5. Proposal Lane Scope

Run this only if a proposal lane can be created without starting Phase 5+ work.

1. Create or open a single proposal lane `A`.
2. Select `A`.
3. Click floating `Edit`.
4. Drag one recognized proxy and Save.
5. Verify `Edit 1` is scoped to proposal `A` in hidden state.
6. Verify proposal `A` is not overwritten, promoted, or converted into `A-edited`.
7. Verify Live is unchanged.

### 6. Send/Handoff Smoke

P31 Phases 1-4 should at least preserve enough hidden chip payload for a later agent handoff. If the implementation also wires minimal send serialization, run this smoke test.

1. Create an `Edit 1` chip.
2. Type a normal prompt such as `Apply this to the selected proposal` or `Make this change in B` when B exists.
3. Send the message.
4. Verify visible chat/sidebar text shows the user's prompt, not hidden edit JSON.
5. Verify the hidden payload sent to the agent contains:
   - semantic operation;
   - element and target identity;
   - lane and proposal/option;
   - route and viewport;
   - screenshot/bounds evidence;
   - target confidence and source hints when available.
6. If the user explicitly names a lane, verify the app does not ask an A/B/C questionnaire just to rediscover that choice.
7. If send serialization is intentionally not implemented until Phase 6, record this section as unverified and do not claim the full Milestone 0.5 agent-readiness exit criterion.

### 7. Project And Thread Leakage

1. Record current visible thread rows and active thread id.
2. Create an `Edit 1` chip but do not send.
3. Switch to another project or add a temporary second folder.
4. Verify the chip and edit overlay do not leak into the other project.
5. Return to the original project.
6. Verify the intended pending chip behavior is preserved or cleared according to implementation design, but never visible in the wrong project.
7. Verify no extra chat/thread was created by opening Edit, dragging, Reset, Save, removing a chip, or switching projects.

## Automated Verification

Run focused tests after fixing any issues found during dogfood:

- `npm --prefix apps/desktop run test:p20`
- `npm --prefix apps/desktop run test:p24`
- `npm --prefix apps/desktop run test:p25`
- `npm --prefix apps/desktop run test:p25b`
- `npm --prefix apps/desktop run test:p27`
- `npm --prefix apps/desktop run test:p30`
- `npm --prefix apps/desktop run test:p31` if added by the implementation
- `npm --prefix apps/desktop run build`
- `git diff --check`

If P31 touches Rust/app-server protocol or planning-only behavior, also read `AGENTS.codex-rs.md` and run the scoped Rust verification required by that file.

## Failure Policy

- If behavior looks wrong, inspect for duplicated code before fixing.
- Prefer deleting or consolidating duplicated paths over patching around them.
- Fix failures on the go, then continue to the closest related check before concluding the root cause.
- If the agent's decision after a send looks suspect, switch the tested agent to GPT 5.5 with high/xHigh reasoning before continuing handoff verification.
- Do not expand scope into Phase 5+ features to make the test pass.

## Evidence

Store evidence under `artifacts/p31-test-0.5/`:

- screenshots before Edit, during Edit, after drag, after Reset, after Save, after chip removal;
- DOM facts for header rows, floating Edit chrome, edit controls, proxy count, chip count, and visible thread rows;
- hidden state summaries for `Edit N` payloads without exposing raw large screenshots in chat;
- source-file hash or diff summaries before and after edit sessions;
- if send smoke runs, a summary of the hidden edit payload sent to the agent and the visible user prompt.

## Exit Criteria

P31 Milestone 0.5 passes only when:

- floating `Edit` works without changing the Canvas header contract;
- one real screenshot-backed edit session opens in Electron;
- one high-confidence proxy can be dragged to a recognized target;
- one `move_intent` semantic relation is recorded;
- `Reset` restores the original proxy position;
- `Save` creates or updates one removable `Edit 1` chip and does not auto-send;
- removing the chip removes pending edit intent;
- Live DOM and source files remain untouched during edit mode;
- project/thread switching does not leak edit state or create unintended chats;
- focused desktop tests, build, and `git diff --check` pass;
- any unverified send/handoff behavior is explicitly reported before moving to Phase 6.
