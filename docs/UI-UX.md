# UI / UX Direction

## Desktop App V1

- The core loop is: add a project, create or resume a chat, send a prompt, stream the assistant response, show commands/file edits, handle permissions, and persist layout after restart.
- Active turns should show compact live progress while Codex is working: a transcript activity row plus an above-composer progress pill that appears before file writes and turns into a changed-lines review pill once writes are observed. It may show observable activity such as files being written, line-count deltas, command activity, elapsed time, and bounded pending-change counts; it must not expose hidden chain-of-thought, internal prompt payloads, raw filesystem logs, or repeated transcript spam. During long model/tool gaps, the transcript progress card should step forward with bounded 10-second observable checkpoints and honest copy like `no file writes observed yet` rather than fake thinking text. First-send chat state must stay stable so the user's prompt never disappears while a new thread materializes.
- Keep the app feeling like a focused SPA: fast project/chat switching, no stale route flashes, no stale previous-screen UI, and no hidden panels reserving dead space.
- Left navigation is product navigation, not nested cards. Projects and chats should be slim rows with subtle selected/hover treatment.
- Project action menus should behave like normal menus: no clipped micro-scroll, close on outside click/Escape, and make destructive scope explicit. `Remove from list` keeps saved chats so re-adding the folder can show them again; `Archive chats` is the visible way to clear chats from that project list.
- Re-adding a folder may restore saved chats, but it must not auto-open the newest old chat when the user is starting fresh. A new-chat draft should remain visually active until the user selects an old chat or the new turn creates its own thread.
- The composer stays reachable and primary. Attachments are compact, removable, and block Send only when unsupported. Sent image attachments should remain visible in the chat transcript as compact thumbnails above the user message. Image attachments, user preview marks, and agent change marks should share the same picture-chip pattern in the composer and transcript, with click-to-preview fullscreen viewing.
- The settings/account popover should show a direct `Sign in` action when app-server reports OpenAI auth is required and no account is connected. The auth dialog keeps ChatGPT as the primary path, with device code and API key as compact fallbacks.
- Plan Mode belongs in the composer controls. Toggling Plan Mode should not navigate or change Inspector focus by itself.
- The Inspector is a detail surface. When closed, chat should use the width. When open, it should show useful activity, documents, file review, approvals, App Preview, or Mockup Preview.

## Mode Model

- Plan Mode is the permission mode: no app implementation changes until the user accepts.
- App Preview and Mockup Preview are visual surfaces: they help the user understand and steer plans.
- Do not add a separate top-level visual mode beside Plan Mode.
- Normal chat can attach preview context by action alone. If the user draws a rectangle in the live app preview without Plan Mode, add a removable composer chip automatically.
- Plan Mode plus a UI-relevant request should automatically offer visual review through the live app preview or saved review artifacts.
- The user should not need to understand mode combinations. In plain behavior: Plan Mode means "show me first"; preview marks mean "use this visual area."

## Live App Preview

- The live app is the planning surface for existing runnable projects.
- The live app preview is available anytime a project is active, not only inside Plan Mode.
- Empty projects should stay quiet before user intent. Do not show a large builder dashboard immediately; invite the user to describe what they want to build.
- On the first prompt in an empty project, do not show a fixed pre-send questionnaire. Send the prompt with compact empty-project state and visual-planning capability context in a guarded planning-only turn so the LLM can decide whether a choice surface is useful before files are created.
- For broad user-facing app/UI requests in empty projects, the model should usually return a compact decision strip above the composer first. The user can choose to build directly, show wireframes, or show detailed mockups; files are created only after the user sends the chosen path.
- Empty-project decision strips must be state-valid. Once the project has meaningful app files, saved mockups, or a running preview, the old empty-project strip should disappear automatically and must not survive reload as an active choice.
- Existing apps can also use decision strips for broad UX/UI prompts, but the copy must describe the current app. Use choices such as `Build directly`, `Show quick preview`, and `Show 2-3 directions`.
- When an existing-app user asks to see a change first but does not specify one preview versus multiple directions, use the current-app decision strip before generating artifacts. Clear single-preview requests create `Live | Preview`; clear multiple-direction requests create `Live | A | B | C`.
- For small current-app placement/control/menu/panel proposals, those `Live | Preview` or `Live | A | B | C` tabs should be temporary overlays on the running Live app, not copied standalone HTML. Saved `.codex/mockups` are still appropriate for explicit wireframes/mockups, broad exploration, blank projects, and fallback.
- When the user explicitly asks for multiple directions on an existing app, create and open A/B/C style options. Keep A/B/C for multi-option sets only; a single revised preview should stay a single selected artifact, not become a fake D option.
- When both current app and proposed previews exist, the right preview header should include a compare switch: `Live | Preview` for one proposal or `Live | A | B | C` for multiple proposals. `Live` shows the current implementation; proposed tabs show saved mockup/review artifacts. If the user switches chats while that surface stays open, the compare shell must reset back to `Live` because proposal tabs are thread-owned.
- Before a new current-app proposal set is generated, the preview surface should show `Live` only. Old starting mockups built into the app are history/reference and must not reappear as compare tabs or above-composer selectors.
- The app-preview button is the direct path to `Live`. If the current chat owns proposals, the same preview surface adds `Live | Preview` or `Live | A | B | C` without a second preview mode or extra transition layer.
- Proposed options should preserve the live app's visual system whenever possible: layout, palette, typography, density, and brand. Do not inject visible Codex proposal chrome, banners, `Proposed` labels, greyed/tinted bars, or fake CTA buttons into the user's app preview. Use the desktop preview header and optional `Show changes` marks to communicate proposal state.
- P25b behavior: for serious runnable proposals such as a new app, new page, redesign, or large workflow change, A/B/C behave like isolated proposal branches. The user still sees `Live | A | B | C`, but accepting a clean option promotes its prepared code into Live instead of making Codex rebuild the proposal. Cleanup/history and richer revision UX are still being refined.
- For code-backed proposal revisions, `add Option C based on B` means add or refresh a real `C` workspace inside the current proposal set, keep existing A/B available for comparison, and select C. A one-option follow-up must not be relabeled as `A` just because only one new workspace was generated.
- Canvas v2 currently supports three active comparison options at once: A, B, and C. If the user asks for Option D or a fourth simultaneous option, Codex must say that honestly before generation and ask whether to revise/replace A/B/C or start a fresh proposal set; it must not silently remap D to A/B/C.
- Compare options must be authored from the actual agent plan. Do not expose generic placement-template labels as the main user-facing alternatives.
- Option labels should name concrete product workflows, such as `Countdown cards`, `Deadline lane`, or `Reminder sheet`. The written plan and preview tabs should use the same option names, summaries, and tradeoffs.
- If the agent has one real proposed direction, show `Live | Preview`; do not invent fake A/B/C variants. If A/B/C are shown, each option must be visually distinct and represent a different user workflow.
- Do not show `Live` for a truly blank project with no app structure. If app structure exists but the preview is stopped, show `Live` with the normal App Preview start/detect/use-URL state instead of a blank pane.
- The first empty-project decision turn should stay quiet: show a small status such as `Preparing choices...` while it is running, then only the decision strip.
- The user should still see normal progress for later wireframe, mockup, revision, and build turns, but never raw JSON/control payloads. Decision strips are product UI, not chat text.
- For backend-only, direct, small, or explicitly direct prompts, the model should proceed normally. Do not force mockups just because the folder is empty.
- Command/script/no-edit prompts in an empty project should also bypass the visual-choice guard.

## Mockup Preview

- Mockup previews use the same mental model as live previews where useful: switch options, mark areas, revise selected, add another, build selected, or dismiss. They are saved local artifacts, not localhost apps and not code branches.
- `Build selected` stages visible composer text such as `Implement option A`; the user can edit that text before sending. The edited visible text is the user request and must override the selected mockup where they conflict.
- If the user combines an option with typed changes or marks, such as `Implement A, but move it to Mark 1`, the implementation must reflect both the selected option and the user's additional instruction.
- Saved mockups can be reopened from Activity and, while they are the current chat's active decision, from a compact A/B/C strip above the composer. That strip is only a selector; choosing an option opens or switches Mockup Preview.
- Newly created or revised saved review mockups should open in Mockup Preview automatically. Activity and Inspector should show them as clickable preview records so the user never has to manually browse `.codex/mockups`.
- Compare tabs belong in the preview surface, not above the composer. Composer strips stay shortcuts/selectors; the visual comparison happens where the preview is displayed.
- Mockup Preview owns heavier actions after the user is looking at the option: `Mark area`, `Show changes` / `Hide changes`, `Reset changes` when the user has moved an agent-provided highlight, and `Build selected` only as a friendly composer shortcut. These actions may stage composer text, but they must not auto-send.
- On proposal tabs, the change-visibility action is part of inspecting the option and should stay visible before mark/build actions whenever width pressure forces prioritization. It may compact to an eye-only button before moving into `...`. If an option has no saved highlight metadata, show an unavailable `No changes` affordance instead of silently removing the control.
- Visual option choices, mockup generation, and `Build selected` belong to the current conversation. They must not create extra sidebar chats inside the same project.
- Above-composer mockup selectors and hidden selected-option context are thread-owned, not project-owned. Opening saved project mockups in Activity or Inspector must not make them part of an unrelated fresh chat.
- Mockup Preview should remain clickable in normal mode. `Mark area` is a one-shot drawing mode; completing or cancelling a mark returns the preview to normal interaction and creates a removable named picture chip when the rectangle is valid, such as `Area A mark 1` or `Area B mark 2`.
- Removing a mockup mark chip removes the matching rectangle from Mockup Preview. The move workflow is delete the chip and draw again; do not add resize handles, DOM editing, or a property panel.
- Proposal highlights are different from user-drawn marks: they are soft temporary overlays generated with preview proposals to point at changed visual areas, and they stay hidden until the user asks to see them. The user may move or resize a highlight, and that adjusted rectangle becomes supporting context for revision or implementation. When a proposal highlight is attached as context, it should appear as a picture chip like user marks, not as raw coordinate text.
- After the user sends a prompt with mark chips, those chips move to the sent chat message and must clear from the composer. If the agent returns a decision strip, clicking one of its choices may reattach the sent visual context for that follow-up, but the original chip must not sit in the composer as unsent duplicate state.
- When the user is already reviewing saved A/B/C mockups and asks for a specific revision such as `add Option C based on B`, the saved-mockup review path should perform that direct saved preview update. It must not show generic `Build directly` / `Add option` / `Show mockups` decision choices for that already-scoped request.
- In Live overlay proposals, the chat card's `Compare options` action should retarget the inspector to the current proposal if the preview pane was left on another comparison. Once the current proposal is open, `Show changes` toggles agent marks over the proposed Live overlay.
- Composer chips and preview references must never leak across projects. Switching projects or opening a new folder should hide and prevent sending marks, mockup references, and App Preview marks from the previous project.
- After `Build selected` is sent, saved mockups switch to history mode. The composer A/B/C selector disappears, Mockup Preview keeps one-at-a-time A/B/C history pages plus comparison/mark controls, and old staging actions must not quietly reappear in that history view.
- In history mode, Activity should list the individual saved mockup pages so the user can reopen A, B, or C as records without reopening the active decision workflow.
- After `Build selected`, the agent should implement files and stop. Starting or stopping the real app belongs to the App Preview toolbar so the user has one obvious place to control local servers.
- Chat, sidebar, and composer display must hide internal mockup artifact/build prompts. Show human-readable titles such as `Create 3 full demo mockups first`, `Revise mockup B`, or `Build selected mockup`.
- Build-selected chat bubbles and thread titles should show the visible text the user sent, not the hidden selected-option/build context.
- Build-selected hidden context may include selected option, saved file, original prompt, and marks, but the UI must show the staged or edited composer text everywhere: chat bubble, title, sidebar row, Activity, and copied transcript.
- Sidebar, header, and chat titles must also scrub stale persisted internal sentinels, including saved-mockup review and visual-decision context titles.
- When saved mockups exist and are still the active decision, natural follow-up prompts may receive selected-option context behind the scenes. Once a saved mockup has been built into Live, normal follow-up prompts must work from Live and create fresh current-app proposals when needed; they must not silently update the old saved Option A/B/C history artifact.

## Preview Toolbar

- A remembered project preview URL can open directly only when it is not also remembered for another project, or when Electron confirms the active project owns the managed preview process. Shared stale localhost URLs should be cleared and shown as stopped state; never show another project's stale preview as a convenience shortcut.
- The preview toolbar is state-based:
  - Live stopped: `Preview`, `Detect`, `URL`.
  - Live starting: `Starting`, `Cancel`.
  - Live running: `Desktop` / `Mobile`, `Mark area`, `Reload`, `Stop`, `Open`.
  - Live failed: `Retry`, `Detect`, `URL`.
  - A/B/C proposal tabs: `Desktop` / `Mobile`, `Changes` when present, `Mark area`, `Build selected`.
  - Blank project: quiet unavailable state; no builder button before the user sends a first prompt.
- The Canvas v2 preview header is owner-locked. Do not change button labels, order, grouping, or visibility without explicit owner consent. Backend implementation plans, code-backed proposal workspaces, and preview performance work must preserve this header contract.
- `Preview`, `Detect`, and `URL` are Live stopped-state controls only. Do not show them on generated A/B/C proposal tabs.
- `Reload`, `Stop`, and `Open` are Live running controls only. Do not show them on generated A/B/C proposal tabs unless the owner explicitly changes the header contract.
- `Live` appears in `Live | A | B | C` only when there is a real Live app to compare against. For a blank/new project with only generated proposal options, show `A | B | C` without `Live`.
- Canvas v2 preview surfaces have exactly one header. Do not stack a proposal metadata header above the shared preview toolbar.
- The preview canvas should fill the available inspector area below the single header; proposal implementations must not leave a half-height frame with unused empty space underneath.
- At the smallest preview widths, right-side actions and the viewport switch collapse before the compare switch. The remaining actions should move under `...` instead of clipping or creating a noisy extra row; only the tightest widths may collapse the compare switch into a current-value selector.
- The preview toolbar should stay on one row. Keep the left status block stable across Live and proposal tabs, and anchor `Live | Preview` or `Live | A | B | C` immediately after that fixed left block so right-side action width cannot move the compare tabs. The compare switch keeps a reserved slot, so `A/B` does not shift when `Live` appears and becomes `Live/A/B`. Resize pressure should shrink the space between the tabs and actions, collapse the viewport switch before the compare switch, prefer full compare tabs plus an icon-only viewport over hidden A/B/C plus viewport text, compress longer action labels such as `Show changes` before hiding them, and move right-side actions under `...` gradually instead of all at once.
- Do not show disabled running-only controls in stopped states. No empty URL field should dominate the first row unless the user has chosen `Use URL`.
- `Detect existing` is a fallback for already-running local servers. If multiple app-like previews are found, show a compact picker. Codex runtime/debug ports must not appear as valid app choices.
- `Run Preview` should start only the active project's preview. Users with many projects should see per-project running/stopped state, not many auto-started local servers.
- The preview must block obvious Codex backend/debug ports and explain the problem in product language instead of rendering blank backend UI.
- Live Preview and Preview Compare share one compact header layout: left status/title chips, a stable compare switcher, and a right action cluster. Compare-only actions may appear, but the `Live | Preview` or `Live | A | B | C` switcher should not jump when changing tabs, and lower-priority actions should move into `...` before the header grows to a third row.

## Preview Interaction

- In Plan Mode, a visual plan can show `Show app preview`. Opening it displays the real app and may attach hidden proposal metadata plus optional `Show changes` marks, but it must not place Codex-authored proposal UI inside the app surface.
- If Codex has multiple plausible designs, the plan can show `Compare options` with up to three variants.
- Option controls should be compact tabs or cards labeled `A`, `B`, and `C`, each with a short title and tradeoff. Avoid large marketing-style option panels.
- Switching options should select the current proposal variant in the same live app preview and refresh its hidden metadata and change marks.
- Live overlay proposals must not inject visible Codex-authored UI chrome into the app webview. Selecting an option may store invisible proposal metadata and marks for acceptance/revision, but the user app surface should remain free of Codex banners, labels, popovers, fake buttons, and generic proposal cards.
- Proposal state belongs in compact desktop chrome: `Live | Preview` / `Live | A | B | C`, route or URL chip, viewport, reload, `Mark area`, `Show changes`, and an overflow for lower-priority actions.
- If the user needs to inspect what changed, use `Show changes` highlights. Do not use visible placeholder copy such as `Temporary option`, `Proposed Add`, `Proposed`, raw implementation-placement labels, or a Codex-generated CTA inside the app.
- Do not show both a root URL field and a duplicate root-route chip. Show route/location metadata when it adds information, such as after navigation or a non-root route.
- `Mark area` lets the user draw a temporary rectangle on the app or snapshot and explain what should move or change there.
- In normal chat, finishing a mark should add a `Mark 1` composer picture chip automatically. The user can then type naturally, send the prompt, remove the chip, or click it for fullscreen preview. Do not include project names, IPs, or route noise in the visible chip label.
- `Mark area` is an escape hatch after the options miss or need refinement, not the primary way users design from scratch.
- Area marks disappear after revision, acceptance, or dismissal. They are not saved as durable layers.
- Preview unavailable states should offer direct next steps: choose URL, start app command, retry, or continue with a screenshot/text plan.
- Advanced DOM/source hints should be hidden unless implementation accuracy requires them after approval.
- Plan Mode handoff should include live route, viewport, selected proposal spec, temporary interaction state, and area mark only when explicitly accepted or submitted for revision.
- After accepted implementation work, reload or revisit the live app and compare the real result to the accepted preview. If they differ materially, record the mismatch instead of claiming parity.

## Plan Mode Review

- The chat-side plan card owns the official decision: `Yes, implement this plan`, `No, and tell Codex what to do differently`, `Submit`, and `Dismiss Esc`.
- Plan Mode may create or update review-only preview artifacts under `.codex/mockups`, but it must not change app implementation files until the user chooses the implement path.
- When visual options exist, the primary action should name what will be implemented, such as `Implement option B` or `Implement selected preview`.
- Marking an area in a proposed option should select the feedback path, focus `Tell Codex what to do differently`, and attach a removable context chip such as `Area B mark 1`.
- The feedback submit should send selected option, route, viewport, temporary interaction state, and marks along with typed text.
- For review-only mockup artifacts created during Plan Mode, `Revise` keeps Plan Mode on and sends typed feedback plus marks; `Build selected` stages editable implementation text and turns Plan Mode off as the explicit accept path.
- If the plan is a safer alternative, option 1 should say that plainly, such as `Yes, implement safer plan`.
- App preview proposals, selected variants, and area marks are supporting visual context for the plan. They do not save project memory on plan acceptance.
- Option 1 can use the selected preview variant or marked area as implementation guidance.
- Option 2 can send typed feedback, selected variant context, area marks, or any combination.
- After implementation, prefer reloading the live app preview and comparing it to the accepted plan preview.

## Responsive And Visual Quality

- Chat, sidebar, inspector, App Preview, and Mockup Preview should resize without overlapping controls.
- At narrow widths, the left navigation should move into a drawer before chat or preview surfaces become unusable.
- Text must fit inside buttons, chips, rows, and panels at desktop and mobile widths.
- Avoid boxes inside boxes unless the workflow truly requires it.
- Keep colors calm: dark product shell, restrained borders, blue for live/ready context, soft yellow for review/proposed context, and red only for destructive/error states.

## Verification

- Prefer DOM/state automation for repeated desktop checks when available.
- Use screenshots/manual review for final visual fit, not as the only regression method.
- For App Preview and Mockup Preview changes, verify preview open/close, project switching, route reload, option comparison, option switching, proposal selection without visible in-app Codex chrome, change highlights, temporary interactions, area marking, automatic composer chip attachment outside Plan Mode, revision, approval, dismissal, and cleanup.
