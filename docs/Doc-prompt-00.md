# Doc-prompt-00 - Codex Local App Shell Prompt

You are building Codex Local from the existing Codex CLI/runtime.

This document covers the actual desktop app that sits on top of Codex: projects, chats, composer, progress, approvals, file review, local preview, and the product shell needed before Canvas becomes useful.

The companion minimal Canvas prompt is `docs/Doc-prompt-00-canvas.md`. Deferred richer Canvas work lives in `docs/Doc-prompt-canvas-v2.md`. Do not implement full Canvas from this app-shell document. Build the app shell first, with clean integration points for the minimal Live/Draft loop later.

## Product Thesis

Codex Local is a calm local builder workbench, not a terminal log wrapped in desktop chrome.

The first product promise is simple:

```text
Open a local project.
Talk to Codex.
See what Codex is doing.
Review source changes safely.
Run or inspect the local app.
Keep control before anything source-changing happens.
```

The UI should feel like a focused conversation with useful work surfaces nearby. It should not feel like a debugger, process monitor, or cockpit full of panels.

## Scope

This app-shell prompt owns:

- project and folder selection;
- project-scoped chats/threads;
- the transcript;
- the composer;
- attachments, visual chips, and references;
- compact progress and activity;
- approvals and permission prompts;
- changed-file summaries and diff review entry points;
- managed local preview;
- planning permission mode;
- the future message-target primitive for Live/Draft work;
- the above-composer decision space;
- state isolation between projects and chats;
- durable handoff points for future Canvas state.

This prompt does not own the full Canvas product:

- no full Live + Draft implementation yet;
- no temporary feature Draft engine yet;
- no placement preflight yet;
- no compare A/B/C system yet;
- no build/apply from Draft yet;
- no fake-backed UX workflow generation yet.

The app shell may show a quiet preview area, reserve a composer/footer target slot, accept surface mentions later, and preserve enough state for Canvas to plug in, but it should not pretend Canvas exists before it is built.

## Architecture Boundary

- Start from the existing Codex CLI/runtime.
- Do not create a parallel agent runtime.
- The runtime owns agent execution, threads, turn events, tools, approvals, sandboxing, auth, model config, file writes, diffs, permissions, auditability, and persisted transcript state.
- The desktop shell owns product UI: projects, chats, layout, composer, progress display, approvals UI, file review surfaces, preview display, attachments, visual chips, and local interaction state.
- The desktop may cache renderer state, but it must not be the only owner of anything that can later change files.
- Hidden prompts, control JSON, temp paths, internal IDs, raw tool events, and workspace mechanics must never become visible UI.

#notes: Code shape is part of the product contract, not optional cleanup after the app works.

## Readable Codebase Contract

Build the app shell as a readable codebase, not as one accumulating app file.

The top-level app component should compose the shell, providers, layout, and feature adapters. It should not own project/thread orchestration, protocol translation, preview lifecycle, composer send flow, approval mapping, file review state, Canvas routing, prompt construction, and UI rendering in the same file.

Use feature-owned modules from the beginning:

- `app/` or `shell/`: top-level layout, providers, and app composition.
- `projects/`: project selection, project metadata, and project-scoped state.
- `threads/`: thread list, transcript state, turn progress, and thread actions.
- `composer/`: composer UI, attachments, chips, settings, and send flow.
- `preview/`: managed local preview runtime, detection, controls, and status.
- `approvals/`: approval UI and runtime approval mapping.
- `file-review/`: changed-file summaries, diff entry points, and review state.
- `canvas/`: only integration points in this app-shell phase, not full Canvas behavior.

Rule of thumb:

- A file should have one main reason to change.
- A component should render UI and delegate workflow logic.
- A hook should own one workflow, not the entire app.
- Pure product logic, protocol mapping, prompt building, serialization, validation, and routing should live outside React components.
- If a file passes roughly 400-600 lines, check whether it is hiding multiple responsibilities.
- If a file approaches 800 lines, split it before adding more behavior.
- `App.tsx` should stay small enough to understand in one sitting, ideally under 300-500 lines.
- No hand-written source file should reach 1,000+ lines without an explicit owner-approved reason. Generated and vendor files are exempt.
- If a phase adds enough behavior to make a file too large, extracting the feature module is part of that phase, not later cleanup.

## Ground-Up Work Model

Build the shell around the slimmer future model from the beginning. Do not first create a routing-heavy product where Canvas guesses from transcript history, then try to simplify it later.

The core objects are:

- `Project`: owns the local folder, Live runtime, preview config, project settings, and project-scoped memory.
- `Thread`: owns the conversation and its current work context.
- `Work item`: the durable unit of intent a chat turn attaches to, such as Live, a future Draft, a parked Draft, or a compare set.
- `Message target`: the composer/footer destination for the next user message.
- `Preview runtime`: platform-owned preview process/webview lifecycle.
- `Commitment boundary`: the explicit transition between safe/temporary work and real source-changing work.

The transcript is evidence, not the source of truth for what work item exists. A user message should attach to a target and work item before it becomes agent work. If the user clearly asks to change target, Codex may request that transition and the platform should show a small receipt; if the transition is risky or ambiguous, use the governed decision space.

## Core App Workflow

1. The user opens Codex Local.
2. The user selects or adds a local project folder.
3. The app shows a calm project-scoped chat.
4. The user asks Codex to inspect, explain, plan, or implement.
5. The app shows one compact progress surface for the active assistant turn.
6. The app groups command, approval, and file activity in product language.
7. The assistant gives a final response after progress completes.
8. If source changed, the user can inspect the changed files.
9. If a local app exists, the user can start, detect, reload, or open the preview.
10. Project and chat state remain isolated when the user switches context.

## Product Principles

- The composer is the main control surface.
- The transcript should remain readable and human.
- Progress should reassure the user, not expose machinery.
- Ask only when the user is choosing between materially different outcomes.
- Never show empty Canvas chrome, stale preview state, or debug-looking panels in a new chat.
- Make source-changing work obvious before, during, and after the turn.
- Preserve user trust by keeping project, branch/workspace, data scope, and source effect legible.
- Keep the app useful before Canvas exists.

## Project Operating Rules

- Marks, images, and chips are compact visual references, not visible internal metadata.
- If end-to-end verification is blocked, record the blocker and fix the product instead of bypassing the workflow.
- Use helper agents only when parallel investigation or independent review helps; the main agent keeps final responsibility.
- Progress should reassure, not expose raw machinery or hidden reasoning.
- Avoid admin/debug surfaces unless the owner explicitly asks for them.
- Keep the app feeling like a focused SPA: fast, stable, and no stale route flashes.
- Avoid boxes inside boxes unless there is a real product reason.
- Do not update durable docs just because a plan exists; update docs when durable direction changes.
- Do not record unimplemented future work as current product state in durable docs. Future work belongs in plans; durable docs should describe the current codebase and accepted direction clearly.
- Investigate before recommending; do not claim feasibility without code, runtime, or doc proof.
- Reuse the existing backend and app-server architecture before creating new flows.
- Hidden prompts, payloads, sentinels, internal IDs, workspace paths, and raw event names must never appear in UI.
- Prefer end-user workflow clarity over exposing internal machinery.

## Shared Intent Language

The product should make action intent legible without showing an internal state table.

For meaningful work, Codex and the UI should be able to express:

```text
Inspecting project files. Source unchanged.
```

```text
Applying changes to project files.
```

```text
Checked the local preview. No app data changed.
```

Use short product-facing language. Avoid visible labels like `intent_class`, `commitment_level`, `data_scope`, raw JSON, or internal routing names.

## Chat And Transcript

The chat surface is part of the product experience, not a debug log.

- Show user messages in readable containers.
- Long user prompts should clamp with a `Show more` affordance.
- Assistant responses should support normal markdown, compact code blocks, quote blocks, and copy affordances.
- Keep one assistant response per turn after the completed progress surface.
- Do not replace the final assistant response with only a collapsed progress row.
- Never expose hidden chain-of-thought.
- Context compaction belongs in collapsed activity/progress, not as visible assistant text.
- If a turn fails or is cancelled, clear running state honestly and show the failure or cancel state in the same progress surface.

## Progress And Activity

Progress should answer: "Is Codex working, what kind of work is happening, and did it change anything?"

- Keep one progress container per assistant turn.
- While active, show compact product-facing status.
- After completion, collapse progress under a duration/status row by default.
- Expanding progress may reveal summarized command activity, file activity, approvals, and context notices.
- Use product-facing labels for commands, file activity, approvals, and failures.
- Group changed-file activity instead of spamming repeated edit cards.
- Show changed-line counts when source changes occur.
- Long commands should be truncated in rows and expandable for details.
- Do not show raw event names, hidden sentinels, internal activity JSON, temp folders, or registry paths.

Completion receipts should appear only when state, source, data, or verification status matters. They are guardrails, not bureaucracy.

Examples:

```text
Checked: local preview
Source: unchanged
Result: app loaded successfully
```

```text
Changed: project source
Verified: tests passed
Next: review changed files
```

## Composer

The composer should be reliable enough to carry the whole product.

- It supports text, files, images, screenshots, marks, references, and future surface mentions.
- It expands for long prompts before internal scrolling begins.
- It keeps core controls visible when text or chips are present.
- The `+` menu can expose add-context actions, files/images, planning mode, browser/context capture, and relevant integrations.
- Visual chips should be compact, removable before send, and visible as evidence after send.
- Sent visual chips remain in the transcript but do not remain stuck in the composer as unsent context.
- Clicking a visual chip opens a larger preview/lightbox.
- Visible chips should not show internal project IDs, thread IDs, paths, route noise, bounds, or registry metadata.

Future Canvas mentions such as `@Live` and `@Draft` can be reserved by the composer, but the app shell should not rely on them before Canvas is implemented.

For the future minimal Canvas product, the composer/footer should become the owner of the current message target. The target is the default place the next prompt applies, initially `Live` or `Draft`, and should carry a short source-effect hint such as `Live changes project files` or `Draft keeps source unchanged`. This target is agent-readable and agent-changeable: if the user clearly says "push this live" while the current target is Draft, or "try this in Draft only" while the current target is Live, Codex may request the target transition instead of forcing the user to manually flip a control. Safe transitions should show a small visible receipt such as `Switched to Draft. Source unchanged.` or `Building Draft into Live. Source will change.`

## New Chat State

A new chat should be calm and clearly scoped.

- Before the first message, show a simple prompt such as `What should we build in <project>?`.
- Keep the composer primary.
- Show only compact environment context near the composer: project/folder, work mode, branch/workspace label when useful.
- Do not show empty Canvas chrome, visual decision choices, changed-file totals, Draft controls, proposal controls, or stale preview state before the user asks for work.
- After the first send, keep the first user message visible while the turn starts.
- Never flash back to an empty chat state while Codex is working.

## Decision Space

The decision space above the composer is for compact, agent-authored choices.

It is not a persistent mode bar. Future Live/Draft target state belongs in the composer/footer, while this above-composer space is reserved for real choices that should not be silently guessed.

Use it when:

- acting would overwrite, hide, or replace valuable work;
- the user is choosing between materially different artifact types or commitments;
- a source-changing action is ambiguous;
- a wrong guess would waste meaningful time.

Do not use it when:

- the task is informational;
- there is one obvious safe default;
- the user clearly asked for direct implementation;
- the future composer target plus the user's wording give Codex a safe target transition with a visible receipt;
- the app is merely uncertain but can proceed safely.

Decision UI rules:

- Show 2 or 3 concise choices.
- Each choice should be specific to the user's request.
- Clicking a choice fills the composer with editable text.
- The user must press Send to proceed.
- The normal composer remains available after a choice is inserted.

This app-shell document owns the decision UI primitive. The minimal Canvas document owns only the decision reasons needed for one Live/Draft loop. Deferred Canvas v2 owns broader placement, Draft overwrite protection, compare, and build/apply ambiguity.

## Managed Preview

The app shell should support local preview without becoming Canvas.

- Use a real browser/webview surface for local app previews.
- Managed preview can start common local web apps or serve static projects.
- Detect already-running localhost apps as a fallback.
- Reject Codex/backend/debug ports.
- Remember preview URLs per project.
- Never show another project's stale localhost preview.
- Preview controls own starting, stopping, reloading, and opening previews.
- Agent implementation turns should not leave long-running preview/server processes as part of the build turn.
- If preview discovery fails, show an honest unavailable/start/use-URL state.

The preview is not yet Live/Draft. It is the foundation Canvas will later use.

## Approvals And File Review

Source-changing work must remain reviewable and auditable.

- Runtime permissions and approvals stay runtime-owned.
- The app shell shows approvals in product language.
- The user can accept, deny, or cancel approval requests without losing the thread.
- Changed files are grouped and readable.
- The user can open file review from the thread change summary.
- No source-changing operation should be hidden behind a visual-only action.

## Planning Permission Mode

Planning mode is an implementation gate.

- It can investigate, explain, prepare notes, attach references, and ask decisions.
- It must not write implementation files until the user accepts.
- Server/runtime enforcement should guard this. Do not rely only on prompt text.
- A plan should appear after normal progress/activity, inside one focused plan panel.
- The plan confirmation should show two clear paths:
  - `Yes, implement this plan`;
  - `No, tell Codex what to do differently`.
- The `No` path should open a simple focused text input for feedback, not the full composer with extra pickers by default.
- Accepted plans become normal implementation turns.

Planning mode should not become a separate visual product.

## State Ownership

- Project-owned state: current project, preview URL/status, current app screen if known, project settings, remembered layout.
- Thread-owned state: chat turns, current message target when future work-item flows exist, decisions, attachments, visual chips, approvals, and build/apply history.
- Runtime-owned state: source-affecting operations, file changes, approvals, tool events, and persisted transcript state.
- Renderer-only state must not be the sole source of truth for anything that can later change files.
- Switching projects or chats must hide context that belongs elsewhere.

## Privacy And Surface Cleanliness

Never expose:

- hidden chain-of-thought;
- hidden prompt wrappers;
- hidden control JSON;
- internal sentinel strings;
- temp paths;
- registry IDs;
- raw tool event names;
- raw prompt payloads;
- routing names;
- workspace mechanics;
- raw coordinates;
- sensitive route/query/auth values.

It is okay to show product-facing rationale:

- what Codex is doing;
- what will happen if the user approves;
- which files changed;
- what was verified;
- risks and next steps.

## Implementation Phases

Each phase must end with a visible UI checkpoint that a builder or implementing agent can verify in the real desktop app. Passing hidden unit tests is not enough.

#notes: Every phase must preserve the readable codebase contract while it ships the visible checkpoint.

### Phase 1 - Runtime Boundary And App Frame

Build the desktop shell around the existing Codex runtime.

Visible checkpoint:

- The app launches.
- The user can see the app frame.
- The app can connect to the runtime.
- A simple health/error state appears if runtime connection fails.

### Phase 2 - Projects

Add local project selection and project-scoped state.

Visible checkpoint:

- The user can add/select a folder.
- The selected project name/path is visible in calm product language.
- Switching projects clears stale thread, preview, attachment, and progress state from the previous project.

### Phase 3 - Chats And New Chat State

Add project-scoped chats and the calm first-message state.

Visible checkpoint:

- A new chat shows `What should we build in <project>?`.
- The composer is primary.
- No empty Canvas, Draft controls, file totals, or stale preview chrome is shown.
- After first send, the first user message remains visible while the turn starts.

### Phase 4 - Composer And Attachments

Build the composer, `+` menu, and visual chips.

Visible checkpoint:

- Long text expands before scrolling.
- Files/images can be attached and removed before send.
- Sent chips remain as transcript evidence.
- Clicking a chip opens a lightbox.
- Internal paths and IDs are not visible in chip labels.

### Phase 5 - Turn Progress

Render active and completed turn progress.

Visible checkpoint:

- One active progress container appears while Codex works.
- Command/activity rows append inside that one container.
- On completion, progress collapses and the final assistant response appears after it.
- Cancellation or failure clears active state honestly.

### Phase 6 - Approvals

Expose runtime approvals in product language.

Visible checkpoint:

- A permission request appears when runtime asks for approval.
- Accept, deny, and cancel paths are visible and recoverable.
- Denying does not corrupt the thread state.

### Phase 7 - File Activity And Review

Show source changes clearly.

Visible checkpoint:

- Changed files are grouped.
- Additions/deletions are visible.
- The thread shows a compact changed-file summary after a source-changing turn.
- The user can open a review surface for changed files.

### Phase 8 - Managed Preview

Add local preview start/detect/reload/open behavior.

Visible checkpoint:

- The user can start or connect to a local app preview.
- Reload and open controls work.
- Preview unavailable state gives honest next steps.
- Preview state does not leak across projects.

### Phase 9 - Decision Space

Add above-composer governed choices.

Visible checkpoint:

- A turn can show 2 or 3 compact choices above the composer.
- Clicking a choice prefills editable composer text.
- Nothing proceeds until the user presses Send.
- The normal composer and attachments remain usable.

### Phase 10 - Planning Permission Mode

Add planning as a write gate.

Visible checkpoint:

- The user can enter planning mode.
- A plan appears in one focused panel.
- `Yes, implement this plan` starts an implementation turn.
- `No, tell Codex what to do differently` opens focused feedback.
- Source writes are blocked until the plan is accepted.

### Phase 11 - Canvas Integration Points

Prepare the app shell for Canvas without implementing Canvas.

Visible checkpoint:

- The layout can reserve or reveal a preview/Canvas area only when meaningful.
- New chats remain quiet when no visual surface exists.
- Future Live/Draft target, surface mentions, and visual references have clean state hooks.
- No fake Draft/Live system appears before the minimal Canvas document is implemented.

### Phase 12 - Dogfood And Regression

Verify the app shell in realistic use.

Visible checkpoint:

- Use one existing project with a local app.
- Use one source-changing task.
- Use one no-change inspection task.
- Use one planning-mode task.
- Switch projects and confirm no leaked state.

## Verification Checklist

- App opens and connects to the existing runtime.
- A local project can be selected.
- A new chat state is calm and scoped.
- First user message remains visible during the first active turn.
- Composer supports long text and attachments.
- Visual chips attach, detach, send, and open in a lightbox.
- Progress appears once per turn and ends cleanly.
- Final assistant response appears after completed progress.
- File activity is grouped and readable.
- Approvals are clear and recoverable.
- Preview can start, detect, reload, and show unavailable states.
- Decision choices prefill the composer and require Send.
- Planning mode blocks implementation writes until accepted.
- Project/chat switching does not leak previews, chips, approvals, progress, or changed-file state.
- Hidden payloads and internal paths never render in chat, composer, Activity, titles, or copied transcript.

## What Not To Build First

- Full Canvas.
- Live + Draft.
- A/B/C compare.
- A general visual DOM editor.
- Developer/debug panels for ordinary users.
- Raw activity log walls.
- Nested panels around simple content.
- A large artifact taxonomy.
- A full backend mocking platform.
- A new runtime beside Codex.

Start with one project, one chat, one real Codex turn, one approval path, one changed-file review path, and one local preview.

## Success Criteria

- Codex Local feels like a focused local builder workbench.
- The user understands which project and chat they are in.
- The user can talk to Codex without seeing runtime machinery.
- Progress is visible without becoming a debug log.
- Source changes are obvious and reviewable.
- The local preview is useful before Canvas exists.
- The app shell is ready for Canvas but not polluted by premature Canvas UI.
