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
- Canvas Mode is the visual conversation mode direction: when active, follow-up messages inherit the current Canvas proposal, option, marks, route, and viewport unless the user clearly changes topic. Canvas Mode may coexist with Plan Mode.
- Canvas follow-ups should be interpreted through compact lane awareness: the selected lane, Live status, proposal backing kind, active/history lifecycle, viewport, and attached `Mark N` / `Change N` context. This state is hidden support for the agent, not visible UI chrome.
- Do not add a separate top-level visual mode beside Plan Mode.
- Normal chat can attach preview context by action alone. If the user draws a rectangle in the live app preview without Plan Mode, add a removable composer chip automatically.
- Plan Mode plus a UI-relevant request should automatically offer visual review through the live app preview or saved review artifacts.
- The user should not need to understand mode combinations. In plain behavior: Plan Mode means "show me first"; preview marks mean "use this visual area."

## Live App Preview

- The live app is the planning surface for existing runnable projects.
- Planned P33 direction: for existing projects, Live is the default and proposals are not mandatory. A normal feature-preview request should show one temporary draft inside the live app's native styling/context, with simple visible actions such as `Build this`, `Park`, and `Discard`; A/B/C appears only when the user asks to compare alternatives.
- Planned P33 direction: multiple long-running feature explorations should appear as named drafts such as `Quick add flow` or `Analytics impact`, with `Park`, `Resume`, `Build this`, and `Discard` behavior. A/B/C should compare variants inside one draft, not represent separate feature threads.
- The live app preview is available anytime a project is active, not only inside Plan Mode.
- Empty projects should stay quiet before user intent. Do not show a large builder dashboard immediately; invite the user to describe what they want to build.
- On the first prompt in an empty project, do not show a fixed pre-send questionnaire. Send the prompt with compact empty-project state and visual-planning capability context in a guarded planning-only turn so the LLM can decide whether a choice surface is useful before files are created.
- For broad user-facing app/UI requests in empty projects, the model should usually return a compact decision strip above the composer first. The user can choose to build directly, show wireframes, or show detailed mockups; files are created only after the user sends the chosen path.
- Empty-project decision strips must be state-valid. Once the project has meaningful app files, saved mockups, or a running preview, the old empty-project strip should disappear automatically and must not survive reload as an active choice.
- Existing apps can also use decision strips for broad UX/UI prompts, but the copy must describe the current app. The agent authors the choice labels under the 15-character limit; examples like direct build, one proposal, or multiple options are guidance, not hardcoded UI.
- Planned P33 direction: when an existing-app user asks to see one feature/change first, create or revise the current draft instead of forcing proposal lane `A`. Use the current-app decision strip only when the user genuinely has not chosen between direct build, one draft, or alternatives. Clear multiple-direction requests create `A/B/C`.
- Exploratory existing-app visual questions should use that same above-composer decision strip when the user has not clearly chosen direct build, one preview, or multiple options. The agent owns the questionnaire wording and choices under the 2-3 choice / 15-character-label constraints; desktop routing must not hardcode product-specific button labels for these questions.
- For small current-app placement/control/menu/panel proposals, those `A` or `A/B/C` proposal lanes should be temporary overlays on the running Live app, not copied standalone HTML. Saved `.codex/mockups` are still appropriate for explicit wireframes/mockups, broad exploration, blank projects, and fallback.
- When the user explicitly asks for multiple directions on an existing app, create and open A/B/C style options. Keep A/B/C for multi-option sets only; a single revised preview should stay a single selected artifact, not become a fake D option.
- When both current app and proposed previews exist, the Canvas header should show a Live row and a proposal row: `A` for one proposal or `A | B | C` for multiple proposals. `Live` shows the current implementation; proposal lanes show saved mockup/review artifacts or runnable proposal workspaces. If the user switches chats while that surface stays open, the proposal row must reset to the active thread's proposal state because proposal lanes are thread-owned.
- Before a new current-app proposal set is generated, the preview surface should show `Live` only. Old starting mockups built into the app are history/reference and must not reappear as compare tabs or above-composer selectors.
- The app-preview button is the direct path to `Live`. If the current chat owns proposals, the same preview surface can add the proposal lane row without a second preview mode or extra transition layer.
- Proposed options should preserve the live app's visual system whenever possible: layout, palette, typography, density, and brand. Do not inject visible Codex proposal chrome, banners, `Proposed` labels, greyed/tinted bars, or fake CTA buttons into the user's app preview. Use the desktop preview header and optional `Show changes` marks to communicate proposal state.
- P25b behavior: for serious runnable proposals such as a new app, new page, redesign, or large workflow change, A/B/C behave like isolated proposal branches. The user sees the Live row and proposal row together when both exist, and the prepared code is available as implementation source/context so Codex does not need to rebuild the design from scratch. Cleanup/history and richer revision UX are still being refined.
- After building a code-backed option into Live, keep `Live | A | B | C` available for that verification moment and default the compare surface to `Live`. The old proposal set is history/reference only; future ambiguous feature or placement requests route from Live unless the user explicitly asks to revisit the old proposal.
- For code-backed proposal revisions, `add Option C based on B` means add or refresh a real `C` workspace inside the current proposal set, keep existing A/B available for comparison, and select C. A one-option follow-up must not be relabeled as `A` just because only one new workspace was generated.
- Canvas v2 currently supports three active comparison options at once: A, B, and C. If the user asks for Option D or a fourth simultaneous option, route to an honest Canvas question about revising/replacing A/B/C or starting a fresh proposal set; do not block the composer with a send error and do not silently remap D to A/B/C.
- Pressing Enter from the composer on a code-backed proposal must always send a normal agent turn with proposal context. Do not desktop-fast-promote A/B/C directly from composer text, even for clean text such as `Implement option A`; Codex must decide whether to revise the proposal, build Live with changes, or ask a clarifying question.
- Canvas should default to one draft/proposal for one visual change. Use A/B/C only when the user asks for alternatives or when the alternatives are materially different UX directions. Small button, copy, visibility, emphasis, and simple placement changes should prefer a lightweight draft/visual patch path over copied app workspaces.
- P27 implementation note: normal Canvas-related sends resolve to a canonical Canvas action before existing preview/mockup/workspace lanes run. Users should experience this as clearer questions, one-proposal defaults, preserved proposal context for revisions, and no dead-end A/B/C option-limit errors; they should not see resolver names, hidden payloads, or workspace mechanics.
- P27b cleanup note: do not revive the removed fixed-question wrappers, chat-side live proposal approval card, old `Preview` lane label, or option-limit send-error path. The decision strip, Canvas lanes, and row-local proposal actions are the supported surfaces.
- Implemented P27-cool: Canvas uses lane rows instead of one mixed compare header. Live is its own row when a real app exists; proposals are a separate `A`, `A | B`, or `A | B | C` row. Do not use `Preview` as a proposal lane label; one generated preview is proposal `A`. Desktop/Mobile viewport switching lives in an icon-only floating transparent control at the top middle of the Canvas preview surface.
- Compare options must be authored from the actual agent plan. Do not expose generic placement-template labels as the main user-facing alternatives.
- Option labels should name concrete product workflows, such as `Countdown cards`, `Deadline lane`, or `Reminder sheet`. The written plan and preview tabs should use the same option names, summaries, and tradeoffs.
- If the agent has one real proposed direction, show proposal lane `A`; do not invent fake B/C variants. If A/B/C are shown, each option must be visually distinct and represent a different user workflow.
- Do not show `Live` for a truly blank project with no app structure and no proposals. If proposal lanes exist, show a stopped `Live` lane as the build/drop target even before the live app can run; reveal its stopped controls only when the user selects `Live`. If app structure exists but the preview is stopped, show `Live` with the normal App Preview start/detect/use-URL state instead of a blank pane.
- The first empty-project decision turn should stay quiet: show a small status such as `Preparing choices...` while it is running, then only the decision strip.
- The user should still see normal progress for later wireframe, mockup, revision, and build turns, but never raw JSON/control payloads. Decision strips are product UI, not chat text.
- For backend-only, direct, small, or explicitly direct prompts, the model should proceed normally. Do not force mockups just because the folder is empty.
- Command/script/no-edit prompts in an empty project should also bypass the visual-choice guard.

## Mockup Preview

- Mockup previews use the same Canvas lane chrome as live previews where useful: switch options, mark areas, revise selected, add another, build selected, or dismiss. They are saved local artifacts, not localhost apps and not code branches.
- `Build selected` stages visible composer text such as `Implement option A`; the user can edit that text before sending. The edited visible text is the user request and must override the selected mockup where they conflict.
- If the user combines an option with typed changes or marks, such as `Implement A, but move it to Mark 1`, the implementation must reflect both the selected option and the user's additional instruction.
- Saved mockups can be reopened from Activity and, while they are the current chat's active decision, from a compact A/B/C strip above the composer. That strip is only a selector; choosing an option opens or switches Mockup Preview.
- Newly created or revised saved review mockups should open in Mockup Preview automatically. Activity and Inspector should show them as clickable preview records so the user never has to manually browse `.codex/mockups`.
- Compare tabs belong in the preview surface, not above the composer. Composer strips stay shortcuts/selectors; the visual comparison happens where the preview is displayed.
- Saved mockups must not use the pre-P27-cool one-row `Compare | Live | A/B/C` toolbar. If Live and saved proposal artifacts are both available, render the Live row and proposal row separately, with `A` for a single proposal and row-local actions.
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

- Implemented P27-cool: Canvas header chrome is lane-based. The Live row owns Live controls, and the proposal row owns A/B/C proposal controls. If both Live and proposal lanes exist, show both rows; if only one lane class exists, show only that row. The viewport switch is not a row action.
- A remembered project preview URL can open directly only when it is not also remembered for another project, or when Electron confirms the active project owns the managed preview process. Shared stale localhost URLs should be cleared and shown as stopped state; never show another project's stale preview as a convenience shortcut.
- The preview toolbar is state-based:
  - Live stopped: `Preview`, `Detect`, `URL`.
  - Live starting: `Starting`, `Cancel`.
  - Live running: `Mark area`, `Reload`, `Stop`, `Open`.
  - Live failed: `Retry`, `Detect`, `URL`.
  - A/B/C proposal tabs: `Changes` when present, `Mark area`, `Build selected`.
  - Floating viewport control: icon-only `Desktop` / `Mobile`.
  - Blank project: quiet unavailable state; no builder button before the user sends a first prompt.
- Canvas v2 preview header changes require explicit owner consent. P27-cool is the current owner-approved replacement contract: two distinct lane rows, no `Preview` proposal label, row-local actions, icon-only floating viewport switch, and lane update dots. Do not drift from that contract without fresh owner consent.
- `Preview`, `Detect`, and `URL` are Live stopped-state controls only. Do not show them on generated A/B/C proposal tabs.
- `Reload`, `Stop`, and `Open` are Live running controls only. Do not show them on generated A/B/C proposal tabs unless the owner explicitly changes the header contract.
- `Live` appears only in the Live lane. For a blank/new project with no app and no proposals, keep Live hidden. For a blank/new project with generated proposal options, show a stopped `Live` lane as the build/drop target alongside `A`, `A | B`, or `A | B | C`; keep Live controls hidden until `Live` is selected.
- Canvas v2 preview surfaces have exactly one header. Do not stack a proposal metadata header above the shared preview toolbar.
- The preview canvas should fill the available inspector area below the single header; proposal implementations must not leave a half-height frame with unused empty space underneath.
- At narrow widths, each lane row should collapse its own right-side actions under `...` before controls overlap. The Live row and proposal row should remain visually distinct instead of squeezing into one ambiguous action strip. The floating viewport control should stay compact, icon-only, and avoid covering important app content.
- Pre-P27-cool code used a one-row compare switch such as `Live | Preview` or `Live | A | B | C`; new work should not expand that path. The lane model replaces it with a Live row and a proposal row.
- Do not show disabled running-only controls in stopped states. No empty URL field should dominate the first row unless the user has chosen `Use URL`.
- `Detect existing` is a fallback for already-running local servers. If multiple app-like previews are found, show a compact picker. Codex runtime/debug ports must not appear as valid app choices.
- `Run Preview` should start only the active project's preview. Users with many projects should see per-project running/stopped state, not many auto-started local servers.
- The preview must block obvious Codex backend/debug ports and explain the problem in product language instead of rendering blank backend UI.
- Live Preview and proposal comparison share compact Canvas lane chrome. Lower-priority actions should move into `...` inside their own row before controls overlap; at narrow widths, keep core Live actions visible as icon-only buttons when space allows.

## Preview Interaction

- In Plan Mode, a visual plan can show `Show app preview`. Opening it displays the real app and may attach hidden proposal metadata plus optional `Show changes` marks, but it must not place Codex-authored proposal UI inside the app surface.
- If Codex has multiple plausible designs, the plan can show `Compare options` with up to three variants.
- Option controls should be compact tabs or cards labeled `A`, `B`, and `C`, each with a short title and tradeoff. Avoid large marketing-style option panels.
- Switching options should select the current proposal variant in the same live app preview and refresh its hidden metadata and change marks.
- Live overlay proposals must not inject visible Codex-authored UI chrome into the app webview. Selecting an option may store invisible proposal metadata and marks for acceptance/revision, but the user app surface should remain free of Codex banners, labels, popovers, fake buttons, and generic proposal cards.
- Proposal state belongs in compact desktop chrome: a Live lane row when Live exists, an `A/B/C` proposal lane row when proposals exist, route or URL chip when useful, an icon-only floating viewport switch, `Mark area`, proposal-only `Changes`, `Build selected`, and overflow for lower-priority actions.
- If the user needs to inspect what changed, use `Show changes` highlights. Do not use visible placeholder copy such as `Temporary option`, `Proposed Add`, `Proposed`, raw implementation-placement labels, or a Codex-generated CTA inside the app.
- Selecting a Live overlay proposal lane should auto-start or reconnect the Live preview when feasible so proposal actions are usable. A selected proposal lane should not sit in a stopped half-state with only `Build selected` visible when change highlights and marking depend on the running preview.
- On proposal tabs, agent `Changes` highlights are adjustable suggested areas. The user can move or resize a shown highlight, and the adjusted area becomes a supporting visual chip for the next prompt; it is not accepted app UI and it must not alter the preview header contract.
- Patch-backed proposal lanes can derive `Changes` highlights from exact VisualPatch targets. The visible chip text stays compact, such as `Change 1`; target/source metadata remains hidden behind the Visual Reference and out of Canvas chrome.
- Stale patch-backed proposals should use the existing proposal row, not new approval cards or in-app chrome. If route, viewport, preview URL, target, source hint, project, or backing artifact no longer matches, show compact recovery language such as refresh/rebase/archive/open-live and disable `Build selected` until the proposal is refreshed.
- Do not show both a root URL field and a duplicate root-route chip. Show route/location metadata when it adds information, such as after navigation or a non-root route.
- `Mark area` lets the user draw a temporary rectangle on the app or snapshot and explain what should move or change there.
- In normal chat, finishing a mark should add a `Mark 1` composer picture chip automatically. The user can then type naturally, send the prompt, remove the chip, or click it for fullscreen preview. Do not include project names, IPs, or route noise in the visible chip label.
- Canvas chips are Visual References, not just images. Behind each chip, preserve enough project/thread/proposal/option/route/viewport/screenshot/bounds/note/source context for the agent to understand and for Plan Mode to pin as evidence later.
- `Mark area` is an escape hatch after the options miss or need refinement, not the primary way users design from scratch.
- Area marks disappear after revision, acceptance, or dismissal. They are not saved as durable layers.
- Preview unavailable states should offer direct next steps: choose URL, start app command, retry, or continue with a screenshot/text plan.
- Advanced DOM/source hints should be hidden unless implementation accuracy requires them after approval.
- Plan Mode handoff should include live route, viewport, selected proposal spec, temporary interaction state, and area mark only when explicitly accepted or submitted for revision.
- After accepted implementation work, reload or revisit the live app and compare the real result to the accepted preview. If they differ materially, record the mismatch instead of claiming parity.

## Canvas Edit Mode Direction

- Shelved direction: P31/P32 direct Canvas editing, proxy movement, and move-only DOM addressability are not the next primary product path. Keep this guidance as historical/fallback context only; P33 Live-first feature drafts should receive new implementation investment first.
- The historical product promise was simple: the user edits the Canvas. Internally, Edit Mode uses a frozen screenshot plus semantic element proxies so Live DOM, runtime app state, and source files stay untouched until the user sends or builds.
- `Edit` should live as floating Canvas chrome near the preview surface, not inside the locked Live/proposal lane rows. The P27-cool header contract stays unchanged.
- When Edit is inactive, do not show edit controls. When active, show only the editing controls that matter: `Cancel`, `Reset`, and `Save`. Do not add separate `Undo` in v1; `Reset` returns the current edit session to its original snapshot state.
- `Save` should create or update a compact composer chip such as `Edit 1`; it should not auto-send in v1. The chip is the user's confirmation and instruction handle. The user can type a prompt, remove the chip, or edit the Canvas again before sending.
- Removing an `Edit N` chip removes that pending edit intent and restores the edit snapshot/proxy state for that intent. Moving the same edited proxy again should keep the same visible chip while updating the hidden edit metadata.
- User edits are instructions, not implementation. The agent receives semantic operations, target confidence, screenshot/bounds evidence, route, viewport, lane, proposal/option, and source hints when available.
- The agent decides whether a sent edit should update Live, revise the selected proposal, create/update A/B/C, or ask an above-composer question. If the user explicitly names a target such as `B`, do not ask an A/B/C questionnaire just to rediscover that choice.
- Agent `Change N` marks remain suggestions/evidence. User `Edit N` chips are explicit user intent. If the user drags or adjusts an agent change into a new intended position, create or update a user-owned `Edit N` while preserving the agent change as proposal evidence when useful.
- If no high-confidence editable targets are available, do not pretend the Canvas is editable. Fall back to normal `Mark area` behavior or a quiet unavailable edit state.

## Plan Mode Review

- The chat-side plan card owns the official decision: `Yes, implement this plan`, `No, and tell Codex what to do differently`, `Submit`, and `Dismiss Esc`.
- Plan Mode may create or update review-only preview artifacts under `.codex/mockups`, but it must not change app implementation files until the user chooses the implement path.
- When visual options exist, the primary action should name what will be implemented, such as `Implement option B` or `Implement selected preview`.
- Marking an area in a proposed option should select the feedback path, focus `Tell Codex what to do differently`, and attach a removable context chip such as `Area B mark 1`.
- The feedback submit should send selected option, route, viewport, temporary interaction state, and marks along with typed text.
- For review-only mockup artifacts created during Plan Mode, `Revise` keeps Plan Mode on and sends typed feedback plus marks; `Build selected` stages editable implementation text and turns Plan Mode off as the explicit accept path.
- If the plan is a safer alternative, option 1 should say that plainly, such as `Yes, implement safer plan`.
- App preview proposals, selected variants, and area marks are supporting visual context for the plan. They do not save project memory on plan acceptance.
- Visual plans should pin the Visual References they depend on. Later implementation should use those pinned references rather than whatever Canvas currently shows.
- For live DOM patch proposals, `Build selected` starts a normal implementation turn rather than silently promoting the preview patch. The accepted proposal may remain visible as a reference, but it is no longer active routing state and the build action should not invite duplicate acceptance.
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
- For P33, repeated verification should prove the Live-first draft loop rather than direct manipulation: Live-only existing app start, one normal feature prompt to one draft, source unchanged before `Build this`, same-draft conversational revision, named draft park/resume, draft brief update, build conversion, and A/B/C only for explicit alternatives.
