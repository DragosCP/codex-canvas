# UI / UX Direction

## P35 Current Canvas UX Contract

This section is authoritative for current Canvas UX. Older sections that describe agent change chips, change overlays, active Mockup Preview, active Plan Preview visuals, proposal rows, or A/B/C lanes are historical unless explicitly rewritten for Draft.

- Existing-app visual work uses `Live` and `Draft` only.
- `Live` has `Mark area`; Draft has `Mark area` plus Draft lifecycle actions such as `Build this`, `Refresh`, `Park`, `Resume`, `Continue`, and `Discard`.
- Area chips in the composer and transcript are always `Mark N`.
- Hidden metadata, not visible chip wording, records whether the mark came from Live or Draft.
- Draft-origin marks keep follow-up routing on that Draft.
- Live-origin visual change requests should go through the Draft path unless the user explicitly asks for direct Live editing.
- Do not show active change-overlay controls, agent-created change chips, active saved mockup preview surfaces, visual Plan Preview comparison surfaces, proposal rows, `Build selected`, or A/B/C tabs.
- Above-composer choices remain allowed only as short agent-authored Draft/Live routing questions when intent is genuinely ambiguous.

## P34 Current Canvas UX Contract

This section remains the Draft contract and is now governed by the P35 single-Mark contract above.

- Existing-app visual work uses `Live` and `Draft` only.
- Draft preview actions use plain labels: `Build this`, `Refresh`, `Park`, `Resume`, `Continue`, and `Discard`.
- Do not show lettered proposal tabs, proposal rows, option-limit errors, or `Build selected`.
- Multiple directions should appear as named Draft directions or a short agent-authored choice asking which Draft to create first.
- Above-composer choices are allowed only when target intent is genuinely ambiguous. They should be authored by the agent from the request and disappear once acted on.
- Draft controls belong in the Canvas/Draft header and compact Draft recovery surface, not in a persistent above-composer selector.
- Historical saved previews may still be opened as records, but they should use `Build this` / selected-preview wording and must not reactivate old lettered routing.

## Desktop App V1

- The core loop is: add a project, create or resume a chat, send a prompt, stream the assistant response, show commands/file edits, handle permissions, and persist layout after restart.
- Active turns should show compact live progress while Codex is working: a transcript activity row plus an above-composer progress pill that appears before file writes and turns into a changed-lines review pill once writes are observed. It may show observable activity such as files being written, line-count deltas, command activity, elapsed time, and bounded pending-change counts; it must not expose hidden chain-of-thought, internal prompt payloads, raw filesystem logs, or repeated transcript spam. During long model/tool gaps, the transcript progress card should step forward with bounded 10-second observable checkpoints and honest copy like `no file writes observed yet` rather than fake thinking text. First-send chat state must stay stable so the user's prompt never disappears while a new thread materializes.
- Keep the app feeling like a focused SPA: fast project/chat switching, no stale route flashes, no stale previous-screen UI, and no hidden panels reserving dead space.
- Left navigation is product navigation, not nested cards. Projects and chats should be slim rows with subtle selected/hover treatment.
- Project action menus should behave like normal menus: no clipped micro-scroll, close on outside click/Escape, and make destructive scope explicit. `Remove from list` keeps saved chats so re-adding the folder can show them again; `Archive chats` is the visible way to clear chats from that project list.
- Re-adding a folder may restore saved chats, but it must not auto-open the newest old chat when the user is starting fresh. A new-chat draft should remain visually active until the user selects an old chat or the new turn creates its own thread.
- The composer stays reachable and primary. Attachments are compact, removable, and block Send only when unsupported. Sent image attachments should remain visible in the chat transcript as compact thumbnails above the user message. Image attachments and user preview marks should share the same picture-chip pattern in the composer and transcript, with click-to-preview fullscreen viewing.
- The settings/account popover should show a direct `Sign in` action when app-server reports OpenAI auth is required and no account is connected. The auth dialog keeps ChatGPT as the primary path, with device code and API key as compact fallbacks.
- Plan Mode belongs in the composer controls. Toggling Plan Mode should not navigate or change Inspector focus by itself.
- The Inspector is a detail surface. When closed, chat should use the width. When open, it should show useful activity, documents, file review, approvals, Live App Preview, or Draft Preview.

## Mode Model

- Plan Mode is the permission mode: no app implementation changes until the user accepts.
- Live and Draft are the visual surfaces: they help the user understand and steer work before source changes.
- Canvas Mode is the visual conversation mode direction: when active, follow-up messages inherit the current Live/Draft surface, marks, route, and viewport unless the user clearly changes topic. Canvas Mode may coexist with Plan Mode.
- Canvas follow-ups should be interpreted through compact surface awareness: selected Live/Draft surface, Draft lifecycle, Live status, viewport, and attached `Mark N` context. This state is hidden support for the agent, not visible UI chrome.
- Do not add a separate top-level visual mode beside Plan Mode.
- Normal chat can attach preview context by action alone. If the user draws a rectangle in the live app preview without Plan Mode, add a removable composer chip automatically.
- Plan Mode plus a UI-relevant request should prefer Live/Draft review, not saved comparison artifacts.
- The user should not need to understand mode combinations. In plain behavior: Plan Mode means "show me first"; preview marks mean "use this visual area."

## Live App Preview

- The live app is the planning surface for existing runnable projects.
- Planned P33 direction: for existing projects, Live is the default and proposals are not mandatory. A normal feature-preview request should show one temporary draft inside the live app's native styling/context, with simple visible actions such as `Build this`, `Park`, and `Discard`.
- Planned P34 direction: remove A/B/C entirely from Canvas. The only preview-before-build workflow is Draft; multiple directions should be named Drafts or agent-authored Draft choices, not lettered proposal lanes.
- Planned P33b direction: when the user asks to see how a new feature would work, the Draft should be an experiential click-through inside the app, not a static explanation. It should include a plausible entry point, first menu/action, selected state, review/approval state when relevant, and result state, using fabricated local data instead of real backend integration.
- Planned P33c direction: feature-preview Drafts should preserve the current app shell and insert the new feature into the natural product journey. A standalone route/page that only explains the feature is not enough for mature existing apps unless the user explicitly asks for a prototype or wireframe.
- Implemented P33d first slice: the user should not have to infer whether the next prompt targets Live or Draft from stale thread history. The UI shows failed Draft recovery with `Continue`, `Open Live`, and `Discard`, keeps failed Drafts non-buildable, retargets successful builds to Live, and asks compact target questions when Live/Draft intent conflicts.
- Implemented P33d manual-test fix: active and failed Drafts should never trap the user between `Continue` and destructive `Discard`. The strip keeps `Park` available as a preserve-later path, `Continue` rejoins the current in-flight Draft repair when one exists, soft Draft preflight warnings do not interrupt the agent mid-turn, and valid interrupted Draft edits can settle back to `Draft ready` instead of recovery.
- Implemented P33d refresh UX: Draft has an explicit `Refresh` action in the compact strip and Draft preview row. Refresh reloads the current Draft preview lane without sending another prompt or asking the agent to find a new port.
- Implemented P33d continuity UX: Draft preview should feel like one WIP lane. Related follow-ups revise the same active/last-active Draft, the preview should reconnect to its remembered URL where possible, and the agent should not narrate or create fresh localhost preview servers on every Draft revision.
- Planned P33 direction: multiple long-running feature explorations should appear as named drafts such as `Quick add flow` or `Analytics impact`, with `Park`, `Resume`, `Build this`, and `Discard` behavior.
- The live app preview is available anytime a project is active, not only inside Plan Mode.
- Empty projects should stay quiet before user intent. Do not show a large builder dashboard immediately; invite the user to describe what they want to build.
- On the first prompt in an empty project, do not show a fixed pre-send questionnaire. Send the prompt with compact empty-project state and visual-planning capability context in a guarded planning-only turn so the LLM can decide whether a choice surface is useful before files are created.
- For broad user-facing app/UI requests in empty projects, the model should usually return a compact decision strip above the composer first. The user can choose to build directly, show wireframes, or show detailed mockups; files are created only after the user sends the chosen path.
- Empty-project decision strips must be state-valid. Once the project has meaningful app files, saved mockups, or a running preview, the old empty-project strip should disappear automatically and must not survive reload as an active choice.
- Existing apps can also use decision strips for broad UX/UI prompts, but the copy must describe the current app. The agent authors the choice labels under the 15-character limit; examples like direct build, one proposal, or multiple options are guidance, not hardcoded UI.
- Planned P33/P35 direction: when an existing-app user asks to see one feature/change first, create or revise the current Draft. Use the current-app decision strip only when the user genuinely has not chosen between direct build, revising the current Draft, or starting a new named Draft direction.
- Implemented P33 decision behavior: the current-app decision strip can carry a hidden `show_draft` action. A one-feature `Show Draft` choice should create/revise a Draft in the real app context.
- Implemented P33c routing behavior: explicit existing-app feature/workflow requests before implementation should enter Draft directly, not as a proposal that is later converted. Draft prompts should avoid proposal/A-B-C vocabulary and focus on the current app plus one temporary feature.
- Implemented P33 Draft action behavior: a ready active Draft should offer `Build this`, `Park`, and `Discard` from the compact Draft strip, while the preview header may offer the same build action when the Draft preview is open. Draft transcript labels should stay product-facing, such as `Draft / src/...`, and must not expose hidden workspace roots.
- Planned P33b Draft lifecycle UX: `Build this` updates Live and closes the Draft as built; `Park` saves a Draft for later without cancelling it; `Discard` cancels it with Live unchanged. If the user starts unrelated work while a Draft is active, prefer parking the old Draft and starting a new Draft from Live. If intent is ambiguous, ask a compact `Revise Draft` / `New Draft` choice.
- Planned P33b staleness UX: if Live changed since a Draft was created or parked, do not silently rebuild, discard, or merge the Draft. When there is overlap, show a small product-facing choice such as `Update Draft`, `Keep Draft`, or `Discard`.
- Planned P33b preview feel: `Live` and `Draft` switching should feel like toggling a layer, not booting two apps. Keep preview guests mounted and preserve route, scroll, viewport, and session state where feasible; reload Draft only when its underlying files changed.
- Implemented P33b/P35 header evolution slice: `Live | Draft` shares one app-state row because Draft is the current app plus one temporary change. Draft actions such as `Build this`, `Refresh`, `Park`/`Resume`, and recovery `Continue` live in the Canvas header, not in a persistent above-composer Draft menu.
- Exploratory existing-app visual questions should use the above-composer decision strip only when the user has not clearly chosen direct build, revising the current Draft, or starting a new Draft. The agent owns the questionnaire wording and choices under the short-label constraint; desktop routing must not hardcode product-specific button labels for these questions. Choices should stack vertically like Plan Mode responses instead of appearing as a horizontal toolbar.
- When the user explicitly asks for multiple directions on an existing app, ask which named Draft direction to create first or create one recommended Draft. Do not create lettered comparison lanes.
- Before a new current-app Draft is generated, the preview surface should show Live only. Old starting mockups built into the app are history/reference and must not reappear as compare tabs or above-composer selectors.
- The app-preview button is the direct path to Live; Draft appears only when there is an active or selected Draft.
- Drafts should preserve the live app's visual system whenever possible: layout, palette, typography, density, and brand. Do not inject visible Codex proposal chrome, banners, `Proposed` labels, greyed/tinted bars, or fake CTA buttons into the user's app preview.
- After building any Draft into Live, reload or hard-refresh the Live preview when feasible. If the preview cannot be refreshed, show a compact reload-needed state; do not leave stale pixels that make the user repeat the same build or fix prompt.
- Canvas should default to one Draft for one visual change. Small button, copy, visibility, emphasis, and simple placement changes should prefer the Draft path over copied app workspaces.
- P27/P30 comparison-lane behavior is historical after P35. Do not revive fixed-question wrappers, chat-side live proposal approval cards, old `Preview` lane labels, option-limit send errors, or proposal-row actions.
- Do not show Live for a truly blank project with no app structure. If app structure exists but the preview is stopped, show Live with the normal App Preview start/detect/use-URL state instead of a blank pane.
- The first empty-project decision turn should stay quiet: show a small status such as `Preparing choices...` while it is running, then only the decision strip.
- The user should still see normal progress for later wireframe, mockup, revision, and build turns, but never raw JSON/control payloads. Decision strips are product UI, not chat text.
- For backend-only, direct, small, or explicitly direct prompts, the model should proceed normally. Do not force mockups just because the folder is empty.
- Command/script/no-edit prompts in an empty project should also bypass the visual-choice guard.

## Historical Mockup Preview

- P35 removes Mockup Preview as an active Inspector/composer route. Saved `.codex/mockups` artifacts are compatibility records only unless a future plan explicitly reintroduces them.
- Saved artifact state must not revive comparison tabs, agent change overlays, selected-option chips, or build-selected actions.
- Current visual steering should use Live/Draft `Mark area` chips labeled `Mark N`.

## Preview Toolbar

- Current P35 toolbar chrome is Live/Draft based. Live owns run/reload/stop/open controls, and Draft owns Draft lifecycle controls. There is no active proposal row.
- Implemented P33b/P35 header evolution slice: the app-state row owns `Live | Draft` plus Draft actions such as `Build this`, `Refresh`, `Park`, `Resume`, and `Continue`.
- A remembered project preview URL can open directly only when it is not also remembered for another project, or when Electron confirms the active project owns the managed preview process. Shared stale localhost URLs should be cleared and shown as stopped state; never show another project's stale preview as a convenience shortcut.
- The preview toolbar is state-based:
  - Live stopped: `Preview`, `Detect`, `URL`.
  - Live starting: `Starting`, `Cancel`.
  - Live running: `Mark area`, `Reload`, `Stop`, `Open`.
  - Live failed: `Retry`, `Detect`, `URL`.
  - Draft active/review: app-state tabs `Live | Draft`, then `Mark area`, `Refresh`, `Build this`, and the relevant lifecycle action such as `Park`, `Resume`, or `Continue`.
  - Floating viewport control: icon-only `Desktop` / `Mobile`.
  - Blank project: quiet unavailable state; no builder button before the user sends a first prompt.
- Canvas v2 preview header changes require explicit owner consent. P35's owner-approved contract is one Live/Draft app-state row, icon-only floating viewport switch, and no active proposal row. Do not drift from that contract without fresh owner consent.
- `Preview`, `Detect`, and `URL` are Live stopped-state controls only.
- `Reload`, `Stop`, and `Open` are Live running controls only.
- `Live` appears only in the Live/Draft app-state row. For a blank/new project with no app, keep Live quiet until the user sends a first prompt.
- Canvas v2 preview surfaces have exactly one header. Do not stack a proposal metadata header above the shared preview toolbar.
- The preview canvas should fill the available inspector area below the single header; proposal implementations must not leave a half-height frame with unused empty space underneath.
- At narrow widths, each Live/Draft row should collapse its own right-side actions under `...` before controls overlap. The floating viewport control should stay compact, icon-only, and avoid covering important app content.
- Pre-P35 code used compare switches such as `Live | Preview` or `Live | A | B | C`; new work should not expand that path. The current model is Live/Draft only.
- Do not show disabled running-only controls in stopped states. No empty URL field should dominate the first row unless the user has chosen `Use URL`.
- `Detect existing` is a fallback for already-running local servers. If multiple app-like previews are found, show a compact picker. Codex runtime/debug ports must not appear as valid app choices.
- `Run Preview` should start only the active project's preview. Users with many projects should see per-project running/stopped state, not many auto-started local servers.
- The preview must block obvious Codex backend/debug ports and explain the problem in product language instead of rendering blank backend UI.
- Live and Draft share compact Canvas chrome. Lower-priority actions should move into `...` before controls overlap; at narrow widths, keep core Live/Draft actions visible as icon-only buttons when space allows.

## Preview Interaction

- In Plan Mode, a visual plan can attach Live/Draft `Mark N` context, but it must not open a separate visual comparison surface.
- Live and Draft must not inject visible Codex-authored UI chrome into the app webview.
- Do not show both a root URL field and a duplicate root-route chip. Show route/location metadata when it adds information, such as after navigation or a non-root route.
- `Mark area` lets the user draw a temporary rectangle on the app or snapshot and explain what should move or change there.
- In normal chat, finishing a mark should add a `Mark 1` composer picture chip automatically. The user can then type naturally, send the prompt, remove the chip, or click it for fullscreen preview. Do not include project names, IPs, or route noise in the visible chip label.
- Canvas chips are Visual References, not just images. Behind each chip, preserve enough project/thread/surface/draft/route/viewport/screenshot/bounds/note/source context for the agent to understand and for Plan Mode to pin as evidence later.
- `Mark area` is the one visible pinpointing control for both Live and Draft.
- Area marks disappear after revision, acceptance, or dismissal. They are not saved as durable layers.
- Preview unavailable states should offer direct next steps: choose URL, start app command, retry, or continue with a screenshot/text plan.
- Advanced DOM/source hints should be hidden unless implementation accuracy requires them after approval.
- Plan Mode handoff should include live route, viewport, Draft identity when relevant, temporary interaction state, and area marks only when explicitly accepted or submitted for revision.
- After accepted implementation work, reload or revisit the live app and compare the real result to the accepted Draft/plan. If they differ materially, record the mismatch instead of claiming parity.

## Canvas Edit Mode Direction

- Shelved direction: P31/P32 direct Canvas editing, proxy movement, and move-only DOM addressability are not the next primary product path. Keep this guidance as historical/fallback context only; P33 Live-first feature drafts should receive new implementation investment first.
- The historical product promise was simple: the user edits the Canvas. Internally, Edit Mode uses a frozen screenshot plus semantic element proxies so Live DOM, runtime app state, and source files stay untouched until the user sends or builds.
- `Edit` should live as floating Canvas chrome near the preview surface, not inside the locked Live/Draft header row. The P35 header contract stays unchanged.
- When Edit is inactive, do not show edit controls. When active, show only the editing controls that matter: `Cancel`, `Reset`, and `Save`. Do not add separate `Undo` in v1; `Reset` returns the current edit session to its original snapshot state.
- `Save` should create or update a compact composer chip such as `Edit 1`; it should not auto-send in v1. The chip is the user's confirmation and instruction handle. The user can type a prompt, remove the chip, or edit the Canvas again before sending.
- Removing an `Edit N` chip removes that pending edit intent and restores the edit snapshot/proxy state for that intent. Moving the same edited proxy again should keep the same visible chip while updating the hidden edit metadata.
- User edits are instructions, not implementation. The agent receives semantic operations, target confidence, screenshot/bounds evidence, route, viewport, lane, proposal/option, and source hints when available.
- The agent decides whether a sent edit should update Live, revise the active Draft, create a new Draft, or ask an above-composer question.
- User `Edit N` chips are explicit user intent. Agent-created change chips are not part of the current P35 workflow.
- If no high-confidence editable targets are available, do not pretend the Canvas is editable. Fall back to normal `Mark area` behavior or a quiet unavailable edit state.

## Plan Mode Review

- The chat-side plan card owns the official decision: `Yes, implement this plan`, `No, and tell Codex what to do differently`, `Submit`, and `Dismiss Esc`.
- Plan Mode may create or update review-only preview artifacts under `.codex/mockups`, but it must not change app implementation files until the user chooses the implement path.
- When visual context exists, it should be Live/Draft `Mark N` context attached to the plan decision or revision.
- Marking an area should select the feedback path, focus `Tell Codex what to do differently`, and attach a removable `Mark N` chip.
- The feedback submit should send route, viewport, temporary interaction state, Draft identity when relevant, and marks along with typed text.
- If the plan is a safer alternative, option 1 should say that plainly, such as `Yes, implement safer plan`.
- Live/Draft area marks are supporting visual context for the plan. They do not save project memory on plan acceptance.
- Visual plans should pin the Visual References they depend on. Later implementation should use those pinned references rather than whatever Canvas currently shows.
- Option 1 can use the marked area as implementation guidance.
- Option 2 can send typed feedback, area marks, or any combination.
- After implementation, prefer reloading the live app preview and comparing it to the accepted plan or Draft.

## Responsive And Visual Quality

- Chat, sidebar, inspector, Live Preview, and Draft Preview should resize without overlapping controls.
- At narrow widths, the left navigation should move into a drawer before chat or preview surfaces become unusable.
- Text must fit inside buttons, chips, rows, and panels at desktop and mobile widths.
- Avoid boxes inside boxes unless the workflow truly requires it.
- Keep colors calm: dark product shell, restrained borders, blue for live/ready context, soft yellow for review/proposed context, and red only for destructive/error states.

## Verification

- Prefer DOM/state automation for repeated desktop checks when available.
- Use screenshots/manual review for final visual fit, not as the only regression method.
- For Live/Draft Preview changes, verify preview open/close, project switching, route reload, temporary interactions, area marking, automatic `Mark N` composer chip attachment outside Plan Mode, Draft revision, approval, dismissal, and cleanup.
- For P33/P35, repeated verification should prove the Live-first draft loop rather than direct manipulation: Live-only existing app start, one normal feature prompt to one draft, source unchanged before `Build this`, same-draft conversational revision, named draft park/resume, draft brief update, and build conversion.
