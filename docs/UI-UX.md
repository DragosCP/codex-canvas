# UI / UX Direction

## Desktop App V1

- The core loop is: add a project, create or resume a chat, send a prompt, stream the assistant response, show commands/file edits, handle permissions, and persist layout after restart.
- Keep the app feeling like a focused SPA: fast project/chat switching, no stale route flashes, no stale previous-screen UI, and no hidden panels reserving dead space.
- Left navigation is product navigation, not nested cards. Projects and chats should be slim rows with subtle selected/hover treatment.
- The composer stays reachable and primary. Attachments are compact, removable, and block Send only when unsupported.
- The settings/account popover should show a direct `Sign in` action when app-server reports OpenAI auth is required and no account is connected. The auth dialog keeps ChatGPT as the primary path, with device code and API key as compact fallbacks.
- Plan Mode belongs in the composer controls. Toggling Plan Mode should not navigate, open Canvas, or change Inspector focus by itself.
- The Inspector is a detail surface. When closed, chat should use the width. When open, it should show useful activity, documents, file review, approvals, or Canvas.

## Mode Model

- Plan Mode is the permission mode: no code changes until the user accepts.
- Canvas/live app preview is the visual surface: it helps the user understand and steer the plan.
- Do not add a separate top-level `UI mode` or `Canvas mode` beside Plan Mode.
- Normal chat can use `@Canvas` or a later `@Preview` mention to attach visual context while still allowing implementation, but the user should also be able to attach preview context by action alone.
- If the user draws a rectangle in the live app preview without Plan Mode and without a prior mention, add a removable composer chip automatically. The chip is the visible confirmation that the marked app area will be included with the next prompt.
- Plan Mode plus a UI-relevant request should automatically offer visual review through the live app preview.
- The user should not need to understand mode combinations. In plain behavior: Plan Mode means "show me first"; Canvas/preview means "show me visually."

## Canvas Surface

- Canvas remains the visible project planning entry point, but the future visual planning experience is the live running app.
- The project Canvas button should read plainly as `Canvas` until a better product name exists.
- When a local app preview is available, Canvas/Plan Mode should open the real app preview instead of a separate container editor.
- Proposed UI should be temporarily injected into the app itself. It should look like proposed app UI, not like an overlay of blue boxes or DOM tags.
- Raw DOM tags, selectors, CSS properties, and coordinate panels should not be the primary visible workflow.
- On a fresh or sparse project, prefer finding or starting a real app preview. Use generated current-interface mockups only as fallback.
- Generated mockups should render as editable drafts until applied while the legacy Canvas flow remains available. The raw `canvas-proposal` payload should be hidden after a suggestion snapshot is captured.
- Legacy draft review actions should stay compact: `Open draft`, `Apply`, `Apply edits`, `Reset`, `Ask Codex`, and `Dismiss`.
- Legacy Canvas edits inside a draft should show a quiet attached state such as `Canvas edits attached`.

## Live App Plan Preview

- The live app is the planning surface.
- The live app preview is available anytime a project is active, not only inside Plan Mode.
- In Plan Mode, a visual plan can show `Show app preview`. Opening it displays the real app with temporary proposed UI injected into the likely location.
- If Codex has multiple plausible designs, the plan can show `Compare options` with up to three variants.
- Option controls should be compact tabs or cards labeled `A`, `B`, and `C`, each with a short title and tradeoff. Avoid large marketing-style option panels.
- Switching options should reset the current temporary injection and inject the selected variant into the same live app preview.
- The app does not need to build or run three implementations. It should preview one selected temporary variant at a time, with optional screenshots for quick comparison.
- Proposed UI should be muted or tagged as temporary, but it should still be clickable enough to understand the workflow: menus, drawers, tabs, dialogs, and simple next states.
- Preview controls belong in compact top chrome: route or URL chip, viewport, reload, reset preview, `Mark area`, and proposed UI visibility.
- `Mark area` lets the user draw a temporary rectangle on the app or snapshot and explain what should move or change there.
- In normal chat, finishing a mark should add an `App mark`-style composer chip automatically. The user can then type naturally, send the prompt, or remove the chip.
- `Mark area` is an escape hatch after the options miss or need refinement, not the primary way users design from scratch.
- Area marks disappear after revision, acceptance, or dismissal. They are not saved as Canvas layers.
- Preview unavailable states should offer direct next steps: choose URL, start app command, retry, or continue with a screenshot/text plan.
- Advanced DOM/source hints should be hidden unless implementation accuracy requires them after approval.
- Plan Mode handoff should include live route, viewport, injected preview spec, temporary interaction state, and area mark only when explicitly accepted or submitted for revision.

## Legacy Pages, Sub-Pages, And Layers

These rules describe the existing coordinate-based Project Canvas while it remains implemented.

- Use Canvas pages for distinct routes, screens, or workflows.
- Use sub-pages for materially different states within a page, such as empty/active, panel open, modal open, selected tab, confirmation, or recovery/error.
- Keep Canvas page navigation prominent. Connections are not a visible Canvas tab in the current product direction.
- Keep Canvas top chrome compact: the header row owns the Canvas title, page navigation, active page states, Layers button, and saved/draft status. State labels can omit the page prefix because the active page is visible beside them.
- Layers and Details share one right-side Canvas panel. Selecting an item shows Layers with Details below; clicking empty Canvas space hides the whole panel. The Layers button can reveal the panel when nothing is selected.
- If a page has only one sub-page, keep the sub-page concept visually quiet.
- Layers should be compact rows with reference code, name, visibility, lock, and delete/mark-deleted where allowed.
- Details should show name, visible label/copy, note for Codex, state swatches, coordinates, dimensions, and only context-specific actions.
- Avoid duplicating layer/right-click actions in Details.

## Legacy Interaction Preview

These rules describe the existing coordinate-based interaction frame system while it remains implemented.

- Interaction preview frames show small same-page consequences without turning Canvas into a prototype timeline.
- A selected trigger can own frame 2 and optional frame 3. Playback shows the alternate geometry/visibility and Stop returns to base.
- Frame editing is an explicit mode with a clear banner, `Save frame`, and `Cancel`.
- Groups can be triggers or affected targets, but frame storage resolves to child item geometry/visibility deltas.
- Do not add frame-specific grouping, ungrouping, deletion, or group membership editing in v1.

## Plan Mode Review

- The chat-side plan card owns the official decision: `Yes, implement this plan`, `No, and tell Codex what to do differently`, `Submit`, and `Dismiss Esc`.
- If the plan is a safer alternative, option 1 should say that plainly, such as `Yes, implement safer plan`.
- Injected app previews, selected variants, and area marks are supporting visual context for the plan. They do not save project memory on plan acceptance.
- Option 1 can use the selected preview variant or marked area as implementation guidance.
- Option 2 can send typed feedback, selected variant context, area marks, or any combination.
- After implementation, prefer reloading the live app preview and comparing it to the accepted plan preview. Show `View Canvas` or `Update Canvas` only when the legacy Canvas flow is explicitly involved.

## Legacy Canvas Editing Rules

These rules describe the existing coordinate-based Project Canvas while it remains implemented. They are not the target UX for Live App Plan Preview.

- Current items are blue/current, proposed items are gold/draft, and deleted items are red.
- Moving a current item creates a grey original-position ghost with Apply position and Reset position.
- Proposed items can be removed directly. Current items should be marked deleted so the change can be reviewed.
- Grouped items select as one group. Ungroup is the escape hatch for editing children independently.
- An unlocked group moves as a unit; a locked group cannot move.
- Applying a moved group accepts all child positions as the new current baseline. Resetting returns them to the original ghost coordinates.
- Right-click is a major editing shortcut: add, paste, bring front/back, duplicate, copy, cut, group, ungroup, lock, state changes, apply/reset position, and delete/mark deleted.

## Responsive And Visual Quality

- Canvas, chat, sidebar, and inspector should resize without overlapping controls.
- At narrow widths, the left navigation should move into a drawer before the chat or Canvas becomes unusable.
- Text must fit inside buttons, chips, rows, and panels at desktop and mobile widths.
- Avoid boxes inside boxes unless the workflow truly requires it.
- Keep colors calm: dark product shell, blue for saved/current Canvas, soft yellow for drafts, red for planned deletions, and restrained borders.

## Verification

- Prefer DOM/state automation for repeated desktop checks when available.
- Use screenshots/manual review for final visual fit, not as the only regression method.
- For Live App Plan Preview changes, verify preview open/close, project switching, route reload, option comparison, option switching, proposed UI injection, temporary interactions, area marking, automatic composer chip attachment outside Plan Mode, revision, approval, dismissal, and cleanup.
- For legacy Canvas changes, verify open/close, generated draft review, page/sub-page navigation, editing, undo/redo, Plan Mode decision flow, and post-implementation Canvas update when relevant.
