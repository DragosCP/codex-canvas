# Product Direction

## Current Focus

This repository is a local Codex desktop copy built on top of the upstream Codex runtime. The owner wants a clear local app where users can review interface/workflow plans against the real running app or saved preview artifacts before implementation.

## Problem To Solve

- Users often have rough product ideas but not enough time to specify every workflow detail.
- Agent-written plans can become technical too quickly and miss visible placement, state changes, and user decision points.
- Bad plans can create extra end-user steps, confusing recovery paths, hidden state, duplicate surfaces, or brittle edge-case matrices.
- The live app should make current interface state, proposed changes, and small interaction consequences visible before implementation.
- Plan Mode should stay the implementation decision surface: it asks whether to implement, revise, or dismiss a plan. App Preview and Mockup Preview are supporting visual review surfaces, not separate implementation approvals.

## Mode Model

- Chat is the default work surface.
- Plan Mode is the permission mode: Codex thinks, previews, and asks before writing app implementation files.
- Canvas Mode is the visual conversation mode direction: when active, user messages are interpreted against the current Canvas state and visual references unless the user clearly changes topic. It can coexist with Plan Mode.
- App Preview is the visual surface for existing runnable projects.
- Mockup Preview is the visual surface for saved review artifacts under `.codex/mockups`.
- Do not add a top-level visual mode beside Plan Mode unless the owner explicitly changes this direction later.
- If the user draws a marked area in App Preview or Mockup Preview, the app automatically attaches that visual context to the composer as a removable picture chip.
- The user should not need to understand mode combinations. In plain behavior: Plan Mode means "show me first"; preview marks mean "use this visual area as context."

## Live App Direction

- Current product direction: the live running app is the preferred visual planning surface for existing projects.
- Current product direction: Canvas should become a first-class agent capability for UI/UX/workflow/layout collaboration, not a collection of special-case prompt wrappers. For visual requests, the agent should be able to create, inspect, revise, mark, and build Canvas proposals through one product contract without asking the user to reason about internal storage paths.
- Current product direction: Codex should understand the user's current Canvas lanes before it acts. `Live`, `A`, `B`, `C`, selected lane, proposal backing type, active/history lifecycle, route, viewport, and compact `Mark N` / `Change N` references should be available to the agent as hidden lane awareness so natural follow-ups like `make A real` or `move that change` route correctly.
- Current product direction: one visual change should produce one Canvas proposal by default. A/B/C is reserved for explicit alternatives or genuinely different UX directions, and lightweight visual patch proposals should handle small changes before heavier code-backed workspaces are used.
- Implemented product direction: Canvas uses lane language consistently. Live is the current app lane; generated proposals are `A`, `A | B`, or `A | B | C`. A single generated proposal is `A`, not `Preview`. P27-cool implements a two-row Canvas header: one Live row when Live exists and one proposal row when proposals exist, each with its own relevant controls, while Desktop/Mobile is an icon-only floating control at the top middle of the Canvas preview surface.
- In Plan Mode, visible proposals may be temporarily shown against the real app so the user can understand the proposed feature before approving implementation.
- When the user has not specified a precise design, Codex may offer up to three visual preview options before asking the user to manually mark a location.
- For lightweight Live overlay proposals, the app does not build three code implementations for options. It loads one live app preview and swaps temporary preview variants or review artifacts. Serious P25b proposals may use isolated runnable A/B/C workspaces.
- Live proposal state should be represented by desktop preview chrome and optional `Show changes` marks, not by visible Codex UI injected into the user's app. Do not render `Proposed` banners, generic proposal cards, fake buttons, DOM tags, CSS boxes, or coordinate overlays inside the app preview.
- Implemented direction: serious new-app, new-page, redesign, and large UI proposals can become code-backed proposal workspaces. In that lane, A/B/C are isolated runnable project versions with stored patches, and accepting one promotes its patch into Live instead of asking Codex to recreate the proposal from prose.
- Location feedback should be lightweight: the user can mark an area on a snapshot/live preview and describe what should happen there. The mark is temporary communication context, not durable geometry.
- Area marking must work outside Plan Mode. A normal chat user can draw a rectangle in the app preview; the composer immediately gains a compact picture chip such as `Mark 1`, and the next message sends that mark context.
- Plan acceptance turns the approved preview and plan into real implementation work. It must not silently save visual planning artifacts.
- If live proposal metadata or change marks are unavailable, Codex should fall back to screenshot marking, saved review artifacts, or text planning instead of pretending it has precise UI control.
- App Preview should be run/stop oriented, not port-list oriented. `Run Preview` is primary; detecting existing localhost apps and manually entering a URL are fallback actions.
- Blank projects should not show fake previews or a builder dashboard before the user has stated intent. The empty App Preview state stays quiet.

## Decision And Mockup Direction

- For an empty project, the first broad UI/app prompt should reach the model with compact project state and visual-planning capability context in a guarded planning-only turn. The model should usually return a compact decision strip above the composer first, offering direct build versus wireframes/mockups.
- Do not implement empty-project or existing-app Canvas questions as desktop-authored fixed wrappers with canned choices. The desktop resolves the Canvas action and provides constraints; the agent authors the question and short choices in the single decision-strip surface.
- Files are created only after the user chooses a path or explicitly asks for direct implementation.
- Visual decision strips are not only for empty projects. Existing apps can use a current-app decision strip for broad UX/UI changes, with wording such as direct build versus quick preview versus two or three directions.
- Decision strips and proposal questions should converge into one questionnaire surface above the composer. A row should have 2-3 choices, each no longer than 15 characters, and an optional second row only when the agent needs to clarify fidelity such as quick mockup versus wireframe versus runnable preview.
- Empty-project wording must expire once real app files, saved mockups, or a running preview exist.
- If an existing-app user asks to view a change before implementation but leaves the proposal shape open, Codex should show the current-app decision strip first. A clear single-preview request creates one review preview; a clear multiple-directions request creates A/B/C review previews.
- If an existing-app user explores a visual decision without choosing output shape, ask through the above-composer decision strip rather than silently creating a proposal. The agent should author the actual question and choices from the request, with desktop providing only routing capabilities and constraints.
- Saved review mockups are user-visible preview artifacts. The user should not need to browse `.codex/mockups` manually to inspect what Codex created.
- When a real app exists and proposed mockups/review previews exist, the Canvas surface should offer quick visual comparison through lane rows: Live for the current implementation and `A`, `A | B`, or `A | B | C` for proposal options.
- For small existing-app placement/control/menu/panel ideas, the preferred review preview is now a temporary live overlay proposal, not copied standalone HTML. Saved mockups stay for explicit mockup/wireframe requests, blank projects, broad exploration, and fallback.
- After a saved mockup is built into the real app, that starting set becomes history/reference only. It must not come back as active current-app proposal tabs or an above-composer selector; fresh current-app proposals come from the new request.
- Normal follow-up feature requests after building a saved mockup must not edit the old saved Option A/B/C as the active proposal. They should route from current Live state, using direct build, lightweight Live proposal, code-backed proposal workspace, or a fresh saved mockup set depending on intent.
- After a code-backed A/B/C proposal is built into Live, Live is the source of truth for future ambiguous requests. The just-built A/B/C set may remain visible beside Live for the verification moment, but it is comparison history rather than active proposal routing.
- Do not show a blank `Live` tab for projects with no app structure and no proposals. If proposal lanes exist, `Live` can appear as the stopped build/drop target so the user can promote `A/B/C` into the project; show Live controls only after the user selects Live. If app structure exists but the preview is stopped, `Live` can show the normal start/detect/use-URL state.
- Existing generated mockups are reviewable artifacts. They should not be expanded into a separate editor product unless explicitly revived.

## Plan Mode Direction

- Plan Mode activation, including `Shift+Tab`, must not navigate or open a visual surface by itself.
- A plan can expose visual review only through explicit actions such as `Show app preview`, `Compare options`, opening App/Mockup Preview, or attaching marked-area context.
- Plan Mode forbids implementation-file changes until the user accepts, but it may create tightly scoped review-only preview artifacts such as `.codex/mockups` when visual planning is the work being reviewed.
- Existing-app Plan Mode should prefer temporary live preview variants when possible. Blank projects or proposal-preview failures can use saved mockup artifacts as review material.
- `Yes, implement this plan` proceeds with the real project/code work. It may use the selected preview option or marked-area context as guidance, but it must not silently save visual planning artifacts.
- `No, and tell Codex what to do differently` sends typed feedback plus any active preview option/marked-area context.
- `Dismiss Esc` drops the current plan decision and clears temporary proposal state and marks.
- After successful implementation, prefer reloading the live app preview and comparing it to the accepted plan preview.

## Implementation State

- Implemented: project operating docs and plan lifecycle.
- Implemented: React/TypeScript desktop shell with sidebar, chat/composer, inspector, app-server connection states, Electron shell, native app-server sidecar bridge, optional WSL app-server bridge, account/model visibility, streamed assistant responses, command cards, and cancellation.
- Implemented: in-app Codex account recovery with ChatGPT browser login, device-code fallback, API-key fallback, login completion refresh, and signed-out send blocking for OpenAI-hosted models.
- Implemented: Windows Electron run/build lane with a staged native Codex app-server sidecar and Electron-owned local bridge. Installer packaging is still pending for the Electron shell.
- Implemented: Electron-controlled App Preview with a real app webview, remembered per-project preview URLs, honest unavailable states, normal-chat `App mark` composer chips, Plan Mode variants, temporary proposal metadata, cleanup/reset, route/viewport/interaction tracking, and accept/revise preview context handoff.
- Implemented: state-based App Preview chrome with `Run Preview`, `Stop`, `Reload`, viewport selection, `Mark area`, external open, secondary URL entry, existing-preview detection, and managed per-project preview start/stop for common local web apps.
- Implemented: saved A/B/C HTML mockup artifacts can be reviewed from a compact selector, opened in Mockup Preview, marked with named multi-option composer chips, compared against `Live`, and built from without exposing internal prompt payloads or auto-sending commitment actions.
- Implemented: empty-project broad UI starts use an LLM-generated decision strip in a read-only/no-approval first turn, with no file creation until the user chooses. This first decision turn hides the normal activity transcript and shows only a quiet preparing state plus the final decision UI; later runnable proposal/mockup/build turns still show normal progress. Decision/control payloads are hidden from chat text.
- Implemented: after `Build selected`, saved mockups become history/reference pages and the app server preview lifecycle owns running the final local app; build-selected prompts should not launch preview servers inside the agent turn.
- Implemented: build-selected and visual proposal sends preserve editable visible composer text for chat, sidebar, Activity, and transcript display. Selected mockup/preview/mark context is hidden supporting guidance, and visible user edits win on conflict.
- Implemented: active agent turns show live user-facing progress while files are being produced, using streamed app-server file-change data when available and a bounded Electron workspace snapshot fallback for observable text-file line deltas during quiet write periods. The current UI keeps first-send chat state stable, shows inline `Editing file` rows, adds an above-composer changed-lines pill, and collapses final file output into one grouped summary instead of repeated `Edited 1 file` cards.
- Implemented: visual decisions are state-aware across empty and existing projects. Empty-project decisions disappear after meaningful app files or saved mockups exist; broad current-app UI prompts can offer direct build, quick preview, or two/three directions; explicit view-first/options prompts create review-only `.codex/mockups` artifacts and open Mockup Preview automatically.
- Implemented: Mockup Preview can compare proposed artifacts against the current app through the same P27-cool lane rows as Live overlay and code-backed proposals. Single proposals are `A`, not `Preview`; saved mockups no longer use the old one-row `Compare | Live | A/B/C` header. Blank projects hide `Live`; stopped app previews show the normal start/detect/use-URL controls. Preview marks use simple labels such as `Mark 1`.
- Implemented: built starting mockups stay history-only, current-app decisions generate fresh proposal sets, proposal highlights are adjustable supporting context, and Live/Preview Compare share a stable compact header.
- Implemented: the preview button lands on `Live`, proposal tabs are scoped to the active chat, switching chats resets the compare shell back to `Live`, and compact preview headers push lower-priority controls into `...` before a third row appears.
- Implemented: Plan Mode distinguishes app implementation files from review-only preview artifacts, keeps implementation gated until accept, names selected preview options in the accept path, sends marked preview context through the revise path, and treats `Build selected` from a preview as an explicit editable acceptance step.
- Implemented: normal-chat existing-app preview choices can create lightweight Live overlay proposal lanes with `A`, `A | B`, or `A | B | C`, per-option proposal highlights, proposal-row `Changes`, and explicit `Build selected` handoff. Hidden proposal blocks are preserved through streamed completion and stripped from chat text.
- Implemented: after a saved mockup is built, that proposal set is removed from active routing and treated as history so later feature requests work from current Live instead of silently editing old Option A/B/C.
- Implemented: P25b code-backed proposal workspaces create app-owned isolated A/B/C folders, run proposal generation inside those folders, preview selected options through App Preview, add requested C options beside existing A/B when possible, and apply clean selected proposals to Live through desktop-owned file operations with conflict checks. Requests beyond A/B/C route to an honest Canvas question about revising/replacing A/B/C or starting fresh instead of silently relabeling.
- Implemented: applied code-backed proposal sets split visible comparison from active routing. After `Build selected`, Canvas can still show `Live | A | B | C` for selected-versus-implemented verification, while new unspecified visual requests start from Live instead of silently revising the old proposal set.
- Implemented: composer image attachments can be dragged or picked, shown as compact removable composer chips, sent as native local image inputs, opened fullscreen, and shown again as thumbnails in the chat transcript.
- Implemented: App Preview and Mockup Preview user marks plus attached agent change marks render as picture chips in the composer and sent chat transcript, with fullscreen preview, while preserving their hidden rectangle context for Codex.
- Implemented: sent preview mark chips move into the chat transcript and clear from the composer, while decision-choice follow-ups can still reattach that sent visual context. Saved mockup review turns now route direct requests such as `Option C based on B` to saved preview updates instead of surfacing a generic decision strip.
- Implemented: P20 removed the old coordinate-based visual editor product from active desktop code and current product direction. Old persisted state for that removed feature is ignored during load.
- Current direction: keep visual planning as one focused live-app/mockup-preview workflow and avoid rebuilding separate graph/proof/design-editor surfaces unless the owner explicitly asks later.
- Current direction: keep App Preview on Electron browser control surfaces and avoid rebuilding old overlay/editor models for this workflow.
- Current direction: in the demo workflow, chat plus App Preview is the primary surface.
- Implemented P27: Live overlays, saved mockups, code-backed workspaces, user marks, and agent change marks route through a Canvas action resolver/capability before using the existing preview lanes. The agent receives one Canvas operating prompt plus compact action/state context, while the existing Canvas v2 header contract stays locked.
- Implemented P27-cool: the mixed one-row `Live | Preview/A/B/C` header is replaced by Live and proposal lane rows with a separate floating viewport switch. Live and proposal lanes can be visible together, single proposals are `A`, accepted/no-preview proposal shells no longer remain selected, and narrow drag/drop between Live and A/B/C asks for confirmation before sending a clean agent instruction. Dogfood showed one remaining product nuance: vague language like `make A real` can still be interpreted as direct Live implementation rather than proposal-only revision, so future routing work should keep sharpening proposal-vs-Live intent.
- Implemented P30: the preview-only VisualPatch proof can temporarily style one `data-canvas-id` target in an Electron-rendered app, survive a target re-render, clear back to the original visual state, fail honestly for missing targets, and leave source files untouched. This does not yet create user-facing proposal lanes or convert patches into code.
- P27b cleanup direction: old fixed questionnaire wrappers, chat-side live proposal approval cards, one-row `Preview` proposal naming, and composer send-error option-limit blockers are obsolete. Future Canvas work should extend the resolver/lane model and agent-authored decision strip, not revive those paths.
- Current direction: chips created from Canvas marks, agent change marks, and plan recommendations should be Visual References with backing route, viewport, proposal, option, screenshot, bounds, notes, and source metadata when available. Plan Mode should pin those references as evidence so later implementation uses the visual story the user approved.
- Current direction: mockup-first reuses the A/B/C preview decision model where useful, but the trigger is project state plus explicit user choice, not a broad keyword detector. The above-composer mockup strip is selection only; commit actions belong in Mockup Preview after the user has looked at the option. After the user sends `Build selected`, the mockups become history/reference pages instead of an active decision strip.
- Current direction: make the agent aware of visual-planning capabilities through compact session/resume guidance plus small per-turn factual state, not a large repeated meta prompt before every user message.
- Current direction: a shareable demo package should use the native sidecar lane or a polished viewer/demo mode, not the WSL/Node dev bridge.

## Verification Direction

- User-visible work is not done until it is honestly verified.
- Prefer the real Electron desktop app for App Preview, Mockup Preview, Plan Mode, composer, and project workflow checks whenever feasible.
- Dogfood meaningful App Preview/Mockup Preview/Plan Mode changes in two local projects when possible: one interface-heavy project and one backend/workflow-heavy project.
- If a blocker prevents honest end-to-end testing, record the blocker, fix the product issue, and retest instead of bypassing the workflow.
