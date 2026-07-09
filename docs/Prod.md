# Product Direction

## Current Focus

This repository is a local Codex desktop copy built on top of the upstream Codex runtime. The owner wants a clear local app where users can review interface/workflow plans against the real running app or saved preview artifacts before implementation.

New owner direction: the primary Canvas product should be Live-first feature drafting, not proposal-lane-first visual planning. For existing projects, the builder wants Codex to show one feature inside the real app's styling/component context with fake/mock behavior, revise it conversationally, and only then build it into real source/backend. P34 supersedes the previous A/B/C exception: remove lettered proposal lanes entirely and express multiple directions as named Drafts or agent-authored Draft choices. P35 further simplifies visual references: user-created `Mark N` chips are the only visible area-reference chip, and active preview surfaces are `Live` and `Draft` only.

## P35 Single-Mark Contract

This is the current marking and preview-surface contract. It supersedes older notes below that describe agent change chips, proposal highlight overlays, active Mockup Preview, active Plan Preview visuals, or saved A/B/C review lanes.

- Existing-app visual work has two active preview surfaces: `Live` and `Draft`.
- Both surfaces expose one marking action: `Mark area`.
- Composer and transcript visual-reference chips are always labeled `Mark 1`, `Mark 2`, and so on.
- Hidden mark metadata records whether the mark came from Live or Draft, including the draft id when the mark was created in Draft.
- A Draft-origin mark routes the next visual follow-up to that Draft without requiring the user to type `Draft`.
- A Live-origin mark is visual context for Live. If the user asks for a visible change from Live and does not explicitly request direct Live editing, route through the Draft decision path.
- The agent should not create separate visible area-reference chips to show what changed. The Draft itself is the visible proof of the proposed change.
- Historical saved mockup, proposal highlight, and plan-preview records are compatibility state only. They must not become active routing state or current product UI.

## P34 Draft-Only Contract

This remains the current Draft contract and is now governed by the P35 single-Mark contract above.

- Canvas has two user-facing surfaces for existing apps: `Live` and `Draft`.
- Draft is the only preview-before-build workflow. A Draft is a source-safe copy of the real app context with temporary feature behavior or visual edits.
- The product must not expose lettered proposal lanes, option-limit behavior, proposal-row compare mode, or `Build selected`.
- Multiple directions become named Draft directions or an agent-authored question that asks which named Draft to create first.
- The above-composer questionnaire remains allowed only as a transient agent-authored ambiguity surface. It should offer product choices such as `Build now`, `Show Draft`, `Revise Draft`, or `New Draft`, not fixed proposal/options choices.
- Legacy saved mockup, plan-preview, and proposal workspace records are historical compatibility state only. They must not become active routing state or current product UI.
- Open-source readiness is a separate follow-up phase after P34 validation.

## Problem To Solve

- Users often have rough product ideas but not enough time to specify every workflow detail.
- Agent-written plans can become technical too quickly and miss visible placement, state changes, and user decision points.
- Bad plans can create extra end-user steps, confusing recovery paths, hidden state, duplicate surfaces, or brittle edge-case matrices.
- The live app should make current interface state, proposed changes, and small interaction consequences visible before implementation.
- Plan Mode should stay the implementation decision surface: it asks whether to implement, revise, or dismiss a plan. Live and Draft are supporting visual review surfaces, not separate implementation approvals.

## Mode Model

- Chat is the default work surface.
- Plan Mode is the permission mode: Codex thinks, previews, and asks before writing app implementation files.
- Canvas Mode is the visual conversation mode direction: when active, user messages are interpreted against the current Canvas state and visual references unless the user clearly changes topic. It can coexist with Plan Mode.
- Live is the visual surface for existing runnable projects.
- Draft is the visual surface for source-safe preview-before-build work.
- Do not add a top-level visual mode beside Plan Mode unless the owner explicitly changes this direction later.
- If the user draws a marked area in Live or Draft, the app automatically attaches that visual context to the composer as a removable `Mark N` picture chip.
- The user should not need to understand mode combinations. In plain behavior: Plan Mode means "show me first"; preview marks mean "use this visual area as context."

## Live App Direction

- Current product direction: the live running app is the preferred visual planning surface for existing projects.
- Planned direction: existing projects should open and stay Live-first. A single feature request should create one temporary draft layer inside the real app context, with source unchanged until the user chooses to build. Internally this may use isolated draft source/workspaces, preview flags, and mock data; visibly it should use simple language such as `Draft`, `Build this`, `Park`, and `Discard`.
- Planned P33b direction: for new feature ideas inside an existing app, Draft should materialize the feature as a temporary in-app workflow, not stop at an explanatory card, diagram, or static concept strip. Use fabricated local data and temporary interaction state so the user can click through the entry point, menu/choice, review/approval state, and result state before implementation.
- Planned P33c direction: a new-feature Draft must be feature-in-place: the current app plus one temporary feature, not a standalone demo page that merely resembles the app. Evaluate faster/saner Draft mechanisms in this order: dependency reuse, runtime demo-state support, Git worktree Drafts for serious feature visualization, direct Live reversible patches for tiny UI tweaks, and copied Draft as fallback for non-Git or unsafe projects.
- Implemented P33d/P35 slice: Canvas derives a temporal workflow ledger so long threads do not get trapped in stale Draft or legacy proposal context. After a Draft is built into Live, Live becomes authoritative for ordinary follow-ups; explicit `Draft` or `Live` wording overrides stale context; ambiguous surface targets ask a tiny routing question instead of guessing.
- Implemented P33d manual-test fix: Draft is treated as continuous WIP during repair and revision. Soft preflight warnings no longer force `Draft needs attention`, `Continue` does not duplicate an already running Draft turn, related visual follow-ups revise the active/last-active Draft instead of creating a second Draft, failed/active Drafts have a non-destructive `Park` path, and `Refresh` reloads the Draft preview without asking the agent to restart work.
- Implemented P33d preview-continuity direction: the desktop owns Draft preview serving and refresh. Agent prompts now explicitly forbid starting fresh localhost preview servers for every Draft turn, Draft command validation hard-blocks preview-server commands, and the preview layer first reconnects to the remembered Draft URL before allocating a new managed server.
- Implemented direction: current-app decision strips can route one "show first" path through structured `show_draft` metadata. The user may see a simple `Show Draft` style choice, while the desktop creates a Draft workspace instead of a legacy proposal lane.
- Planned direction: longer feature exploration should use named drafts plus living markdown briefs. A draft can be active, parked, resumed, built, or discarded; its brief should capture the feature goal, affected routes/screens, fake backend assumptions, approved/rejected decisions, open questions, and eventual build plan.
- Planned P33b direction: `Build this` should make the accepted Draft become Live, then close that Draft as built rather than leaving it as the next active editing target. `Park` means save the Draft for later, not cancel it. `Discard` cancels the Draft with Live unchanged.
- Planned P33b direction: when an active Draft exists, related follow-ups revise that Draft. A clearly unrelated feature request should start a new Draft from current Live and park the old Draft; an ambiguous request should ask a tiny choice such as `Revise Draft` versus `New Draft`, not a broad questionnaire. Drafts should not be silently discarded or recomposed.
- Planned P33b direction: if Live changes after a Draft was created, resume/build should check for staleness. Non-overlapping Live changes can proceed; overlapping changes should ask whether to update the Draft from Live, keep reviewing the old Draft, or discard it. The app should not auto-merge or silently apply a stale Draft.
- Planned P35 direction: multiple directions should become named Draft choices, not lettered proposal lanes.
- Implemented P33b/P35 header direction: Draft belongs beside Live. Canvas shows `Live | Draft` as the app-state row when a Draft exists.
- Current product direction: Canvas should become a first-class agent capability for UI/UX/workflow/layout collaboration, not a collection of special-case prompt wrappers. For visual requests, the agent should be able to create, inspect, revise, mark, and build Canvas proposals through one product contract without asking the user to reason about internal storage paths.
- Current product direction: Codex should understand the user's current Canvas surface before it acts. Live/Draft, Draft lifecycle, route, viewport, and compact `Mark N` references should be available to the agent as hidden surface awareness.
- Current product direction: one visual change should produce one Draft by default. Named Draft choices can handle alternative directions when the user wants a comparison.
- Shelved product direction: P31/P32 Canvas direct-manipulation editing and move mode are not the primary product path. Do not continue investing in general DOM editing, proxy movement, or move-intent workflows unless the owner explicitly brings that back as a fallback feature.
- Implemented P35 direction: Canvas uses surface language consistently. Live is the current app, Draft is the current reviewable change, and Desktop/Mobile is an icon-only floating control at the top middle of the Canvas preview surface.
- In Plan Mode, visual review should use Live/Draft marks and Draft guidance rather than temporary proposal surfaces.
- When the user has not specified a precise design, Codex may ask a short Draft/Live question before asking the user to manually mark a location.
- Draft state should be represented by desktop preview chrome and user-created `Mark N` chips, not by visible Codex UI injected into the user's app. Do not render `Proposed` banners, generic proposal cards, fake buttons, DOM tags, CSS boxes, or coordinate overlays inside the app preview.
- Location feedback should be lightweight: the user can mark an area on a snapshot/live preview and describe what should happen there. The mark is temporary communication context, not durable geometry.
- Area marking must work outside Plan Mode. A normal chat user can draw a rectangle in the app preview; the composer immediately gains a compact picture chip such as `Mark 1`, and the next message sends that mark context.
- Edit chips are stronger than marks: `Mark N` is visual evidence, while user `Edit N` is explicit visual intent. Sending a prompt with an edit chip lets the agent decide whether to update Live, revise the active Draft, create a new Draft, or ask a decision-strip question when the user's target is genuinely ambiguous.
- Plan acceptance turns the approved preview and plan into real implementation work. It must not silently save visual planning artifacts.
- If Live/Draft mark metadata is unavailable, Codex should fall back to screenshot marking or text planning instead of pretending it has precise UI control.
- App Preview should be run/stop oriented, not port-list oriented. `Run Preview` is primary; detecting existing localhost apps and manually entering a URL are fallback actions.
- Blank projects should not show fake previews or a builder dashboard before the user has stated intent. The empty App Preview state stays quiet.

## Decision And Draft Direction

- For an empty project, the first broad UI/app prompt should reach the model with compact project state and visual-planning capability context in a guarded planning-only turn. The model should usually return a compact decision strip above the composer first.
- Do not implement empty-project or existing-app Canvas questions as desktop-authored fixed wrappers with canned choices. The desktop resolves the Canvas action and provides constraints; the agent authors the question and short choices in the single decision-strip surface.
- Files are created only after the user chooses a path or explicitly asks for direct implementation.
- Existing apps can use a current-app decision strip for broad UX/UI changes, with wording such as direct build, revise current Draft, or create a new named Draft.
- Decision strips render as stacked response rows, each with a short label and optional explanation; this questionnaire should be the only persistent Canvas choice/control surface above the composer.
- Empty-project wording must expire once real app files, a running preview, or an active Draft exists.
- If an existing-app user asks to view a change before implementation but leaves the output shape open, Codex should create one Draft or ask which named Draft direction to create first.
- Saved review mockups and code-backed proposal records are historical compatibility artifacts after P35. They must not come back as active current-app tabs, above-composer selectors, or routing context.

## Plan Mode Direction

- Plan Mode activation, including `Shift+Tab`, must not navigate or open a visual surface by itself.
- A plan can use Live/Draft visual review only through explicit actions such as opening Live, opening Draft, or attaching marked-area context.
- Plan Mode forbids implementation-file changes until the user accepts, but it may create tightly scoped review-only preview artifacts such as `.codex/mockups` when visual planning is the work being reviewed.
- Existing-app Plan Mode should prefer Draft guidance when visual review is useful.
- `Yes, implement this plan` proceeds with the real project/code work. It may use marked-area context as guidance, but it must not silently save visual planning artifacts.
- `No, and tell Codex what to do differently` sends typed feedback plus any attached Live/Draft mark context.
- `Dismiss Esc` drops the current plan decision and clears temporary marks.
- After successful implementation, prefer reloading the live app preview and comparing it to the accepted plan or Draft.

## Implementation State

- Implemented: project operating docs and plan lifecycle.
- Implemented: React/TypeScript desktop shell with sidebar, chat/composer, inspector, app-server connection states, Electron shell, native app-server sidecar bridge, optional WSL app-server bridge, account/model visibility, streamed assistant responses, command cards, and cancellation.
- Implemented: in-app Codex account recovery with ChatGPT browser login, device-code fallback, API-key fallback, login completion refresh, and signed-out send blocking for OpenAI-hosted models.
- Implemented: Windows Electron run/build lane with a staged native Codex app-server sidecar and Electron-owned local bridge. Installer packaging is still pending for the Electron shell.
- Implemented: Electron-controlled App Preview with a real app webview, remembered per-project preview URLs, honest unavailable states, normal-chat `App mark` composer chips, Plan Mode variants, temporary proposal metadata, cleanup/reset, route/viewport/interaction tracking, and accept/revise preview context handoff.
- Implemented: state-based App Preview chrome with `Run Preview`, `Stop`, `Reload`, viewport selection, `Mark area`, external open, secondary URL entry, existing-preview detection, and managed per-project preview start/stop for common local web apps.
- Historical before P35: saved HTML mockup artifacts, live overlay proposals, and code-backed proposal workspaces existed as comparison/review surfaces. They are compatibility records now, not active Live/Draft product UI.
- Implemented: empty-project broad UI starts use an LLM-generated decision strip in a read-only/no-approval first turn, with no file creation until the user chooses. This first decision turn hides the normal activity transcript and shows only a quiet preparing state plus the final decision UI; later runnable proposal/mockup/build turns still show normal progress. Decision/control payloads are hidden from chat text.
- Implemented P35: Draft `Build this` is the active preview-to-source path, and the app server preview lifecycle owns running the final local app.
- Implemented: build-selected and visual proposal sends preserve editable visible composer text for chat, sidebar, Activity, and transcript display. Selected mockup/preview/mark context is hidden supporting guidance, and visible user edits win on conflict.
- Implemented: active agent turns show live user-facing progress while files are being produced, using streamed app-server file-change data when available and a bounded Electron workspace snapshot fallback for observable text-file line deltas during quiet write periods. The current UI keeps first-send chat state stable, shows inline `Editing file` rows, adds an above-composer changed-lines pill, and collapses final file output into one grouped summary instead of repeated `Edited 1 file` cards.
- Implemented P35: visual decisions are state-aware across empty and existing projects. Existing-app view-first work creates or revises Draft unless the user explicitly asks for direct Live implementation.
- Implemented P35: the preview button lands on Live, Draft appears when active/selected, and compact preview headers push lower-priority controls into `...` before controls overlap.
- Implemented P35: Plan Mode distinguishes implementation files from visual guidance. Marked Live/Draft context can support revise/accept paths without creating active preview-option UI.
- Implemented: Draft repair/revision no longer treats soft workflow preflight warnings as user-blocking failures. Active Drafts can be parked, refreshed, or continued without duplicate recovery turns; related follow-ups stay on the same Draft; interrupted turns with valid Draft file changes can finalize without surfacing `Continue`; and Draft preview reconnects to the existing remembered URL before starting a new managed preview.
- Historical before P35: code-backed proposal workspace registries and applied proposal sets remain lower-level compatibility infrastructure only.
- Implemented: composer image attachments can be dragged or picked, shown as compact removable composer chips, sent as native local image inputs, opened fullscreen, and shown again as thumbnails in the chat transcript.
- Implemented P35: Live and Draft user marks render as `Mark N` picture chips in the composer and sent chat transcript, with fullscreen preview, while preserving hidden rectangle and surface context for Codex.
- Implemented: sent preview mark chips move into the chat transcript and clear from the composer, while decision-choice follow-ups can still reattach that sent visual context. Saved mockup review turns now route direct requests such as `Option C based on B` to saved preview updates instead of surfacing a generic decision strip.
- Implemented: P20 removed the old coordinate-based visual editor product from active desktop code and current product direction. Old persisted state for that removed feature is ignored during load.
- Current direction: keep visual planning as one focused live-app/mockup-preview workflow and avoid rebuilding separate graph/proof/design-editor surfaces unless the owner explicitly asks later.
- Current direction: keep App Preview on Electron browser control surfaces and avoid rebuilding old overlay/editor models for this workflow.
- Current direction: in the demo workflow, chat plus App Preview is the primary surface.
- Historical before P35: P27/P27-cool introduced proposal rows and live overlays. P35 supersedes those product surfaces with Live/Draft only.
- Implemented P30: the preview-only VisualPatch proof can temporarily style one `data-canvas-id` target in an Electron-rendered app, survive a target re-render, clear back to the original visual state, fail honestly for missing targets, and leave source files untouched. This does not yet create user-facing proposal lanes or convert patches into code.
- Planned P33: Live-first feature drafting should become the next major product path. The first proof should use isolated draft source/workspaces, native app components/styles, fake local behavior where backend integration would slow the loop, named drafts for longer work, and markdown draft briefs under `.codex/drafts/<draft-slug>/brief.md`.
- P27b cleanup direction: old fixed questionnaire wrappers, chat-side live proposal approval cards, one-row `Preview` proposal naming, and composer send-error option-limit blockers are obsolete. Future Canvas work should extend the resolver/lane model and agent-authored decision strip, not revive those paths.
- Current direction: chips created from Canvas marks and plan recommendations should be Visual References with backing route, viewport, surface, draft id when relevant, screenshot, bounds, notes, and source metadata when available. Plan Mode should pin those references as evidence so later implementation uses the visual story the user approved.
- Current direction: mockup-first and lettered comparison paths are historical compatibility only after P35.
- Current direction: make the agent aware of visual-planning capabilities through compact session/resume guidance plus small per-turn factual state, not a large repeated meta prompt before every user message.
- Current direction: a shareable demo package should use the native sidecar lane or a polished viewer/demo mode, not the WSL/Node dev bridge.

## Verification Direction

- User-visible work is not done until it is honestly verified.
- Prefer the real Electron desktop app for Live Preview, Draft Preview, Plan Mode, composer, and project workflow checks whenever feasible.
- P35 is not product-ready until a real Electron dogfood proves an existing app opens Live-only, one normal feature request creates one native-looking Draft without mutating main source, conversational revision updates the same Draft, `Build this` changes source only after approval, and only `Mark N` chips appear.
- Dogfood meaningful Live/Draft/Plan Mode changes in two local projects when possible: one interface-heavy project and one backend/workflow-heavy project.
- If a blocker prevents honest end-to-end testing, record the blocker, fix the product issue, and retest instead of bypassing the workflow.
