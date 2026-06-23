# Doc-prompt-00 - Codex Local Starting-Over Prompt

You are building Codex Local from an existing Rust Codex CLI/runtime.

The goal is to turn the Rust CLI into a local desktop UX workbench where Codex can collaborate with the user through chat, compact choices, and a visual Canvas.

## Product Framing

Codex Local is not just a chat app with a preview panel.

It is a UX workbench for agent-built apps.

Agents can write code, but builders still need to feel an app experience before paying the cost of full implementation. The core product should help the builder see a feature in the real app, react to it naturally, revise it quickly, and only then ask Codex to build the real source/backend path.

The default existing-project loop is Live-first:

```text
Here is your real app.
I can try the feature inside it.
You can react until it feels right.
Then I will build it for real.
```

Codex Local has three visible collaboration channels:

1. Chat: conversation, progress, summaries, explanations, and implementation reports.
2. Above-composer choices: compact questions or decision options shown directly above the composer.
3. Canvas: a visual collaboration surface where the agent can show the Live app, a temporary feature draft inside the app's real styling context, optional alternatives, marks, proposed changes, and build-ready evidence.

The agent should understand that these are available ways to interact with the user.

The agent can:

- answer in chat;
- ask a compact question above the composer;
- build directly into the Live app;
- create one Live-first feature draft;
- revise the current feature draft;
- park, resume, discard, or build the current draft;
- update a draft brief when the feature direction changes;
- show one visual proposal;
- show A/B/C proposal options;
- create a quick wireframe;
- create a fuller mockup;
- create runnable proposal candidates;
- revise an existing proposal;
- add another option;
- use marks or fallback visual edit intent when location matters;
- build the selected proposal into an implementation candidate;
- archive old proposals and start fresh.

The agent decides which path fits the user's request, inside validated product state transitions. Do not hardcode product decisions as scattered keyword branches.

## Architecture

- Start from the Rust Codex CLI/runtime.
- Do not create a parallel agent runtime.
- Rust/app-server owns agent execution, threads, turns, streaming, tools, approvals, sandboxing, auth, model config, file changes, persisted transcript state, and source-affecting proposal metadata.
- Electron/React owns the desktop product shell, project list, layout, selected thread, composer, Canvas display state, preview display, local visual references, and proposal presentation metadata.
- Source-affecting proposal metadata must be known to Rust/app-server through a shared proposal registry.
- Electron may cache Canvas display state, but it must not be the only owner of proposal artifacts that can later become source edits.
- Proposal-to-code conversion runs as a normal app-server/agent implementation turn, with Rust/app-server owning file writes, diffs, permissions, and auditability.
- The desktop passes structured state to the agent so the agent understands what it can do.
- The user should never see internal prompt wrappers, hidden JSON, internal sentinels, temp folders, proposal workspace paths, or routing metadata.

## Prompt Memory And Runtime Principles

- Use compact capability guidance plus small factual per-turn state, not a giant repeated philosophy prompt on every message.
- Restore compact capability guidance after thread resume or context compaction so the agent does not forget Canvas, choices, marks, proposal lanes, or Plan Mode.
- Visible user text is the primary instruction. Hidden selected option, mark, route, view state, screenshot, and proposal context are supporting evidence.
- If hidden context conflicts with visible user text, visible user text wins.
- Hidden prompt wrappers and control payloads must never become chat text, sidebar titles, composer text, Activity rows, or copied transcript content.
- Above-composer choices, proposal actions, and build shortcuts must continue the active chat/thread unless the user explicitly starts a new chat.
- The first user bubble should remain visible during thread creation and active turns; never flash back to an empty/new-chat state while Codex is working.
- Active turn progress is product UI, not a debug console. Show compact human labels for command activity and file changes, group final edited-file summaries, and hide raw event names or filesystem logs.
- Review-only artifacts such as mockups, proposal JSON, screenshots, marks, and VisualPatch metadata are user-facing work products, but they are not implementation source edits.

## Core Desktop Product

- User can add local project folders.
- Each project has its own chats/threads.
- User can start or resume a thread inside a project.
- User sees streamed assistant progress, command activity, file edits, approvals, and final summaries.
- User can inspect changed files.
- User can run, stop, reload, detect, or open a local app preview.
- User can attach files/images.
- User can mark visual areas and send those marks as context.
- User can create, revise, park, discard, and build Live-first feature drafts.
- User may use Canvas Edit/Move Mode as supporting visual evidence, but direct manipulation is not the primary product loop.

## Chat, Progress, Composer, And Attachment UI

The chat surface is part of the product experience, not a debug log.

Turn progress:

- While a turn is running and there is no final content yet, show a compact progress/thinking area so the user can tell Codex is working.
- Use product-facing status such as `Working for ...` while active and `Worked for ...` after completion.
- After completion, collapse progress under the duration row by default. Expanding it reveals summarized progress, command activity, file activity, and context-compaction notices.
- Never expose hidden chain-of-thought. Progress text should be concise action summaries, not private reasoning.
- Context compaction belongs inside collapsed activity/progress, not as visible assistant response body text.
- If a turn fails or is cancelled, clear running state honestly and show the failure/cancel state in the same progress surface.

Command and file activity:

- Reading/running commands appear as expandable rows with concise labels, command count, and optional details.
- File creation, editing, and deletion appear as compact activity rows. Group multiple operations when possible, such as one edited file plus two created files.
- Show changed-line counts with green additions and red deletions.
- Long command strings should be truncated in the row and expandable for details.
- Use a rolling/cipher-like count animation for active command counts, file counts, and thread change totals where motion helps the user notice progress.
- Do not show raw event names, hidden sentinels, internal activity JSON, temp folders, or registry paths in the collapsed view.

Thread change totals and turn endings:

- When the thread has source changes, show a compact total change summary above the composer for that chat/thread.
- The thread change total should use the same visual language as changed-file activity and does not need a separate `Review` button.
- If an assistant turn produced changes, end the turn with a compact changed-files summary.
- If an assistant turn produced no changes, end simply with the response. Do not force an empty changed-files card.

Message layout:

- User prompts appear inside a readable container.
- Long user prompts clamp to about 15 rows, then reveal with `Show more`.
- On hover, show secondary message controls below the message: on the right for user prompts and on the left for assistant responses.
- Assistant responses should support normal markdown, compact code or quote blocks, and copy affordances for quoted/snippet containers.
- Keep response formatting calm and readable. Avoid nested cards, panels inside panels, or giant transcript machinery.

Composer:

- The composer supports normal text, files/images, marks, changes, snapshots, and app/browser references.
- The `+` menu can expose files/folders, Plan Mode, skills/plugins, browser, and related add-context actions.
- `@` references should appear in the composer and above the composer as compact chips/evidence, not as raw paths or hidden payloads.
- When the user scrolls up away from the latest message, show a small chevron/down affordance above the composer to jump back to the latest turn.
- On a new chat, keep the first user message and project/branch/footer context visible so the user can confirm they are in the right project and branch.

Visual chips and attachments:

- Marks, changes, snapshots, images, and references use one visual chip system in the composer and transcript.
- In the composer, chips can be detached with a small `X`.
- After send, transcript chips remain as evidence but do not show detach controls.
- Chips should be mostly visual thumbnails. Avoid long labels; if text is needed, overlay it lightly on the thumbnail or show a tiny label such as `Mark 1`, `Change 1`, or `Image 1`.
- The composer lays chips in a horizontal row with horizontal scroll when space runs out.
- In chat, chips should keep the same visual language. If attachments exceed one row, shrink thumbnails rather than creating a heavy gallery.
- Clicking a chip opens a larger preview/lightbox with a simple close action. The full preview supports moving through multiple attachments.
- Do not show internal project, thread, lane, route, bounds, or registry metadata on visible chips.

## State Ownership

- Live preview state is project-owned: the current app, current preview URL, run/stop status, and current observed screen belong to the project.
- Feature drafts are thread-owned temporary product branches shown against Live: the draft name, preview URL, affected routes, mock assumptions, user decisions, and build status belong to the thread that created them.
- Proposal decisions are thread-owned: A/B/C sets, selected proposal context, proposal marks, adjusted changes, and active decision strips belong to the chat/thread that created them.
- Old proposal artifacts may be reopenable as history/reference, but opening history must not make it active context for a different chat.
- Project switching and new chats must clear or hide marks, chips, edit sessions, selected proposals, and hidden context that belong to another project or thread.
- Removing and re-adding a folder must not auto-hijack a fresh chat with old proposal context or stale hidden prompts.
- Internal draft/running/stop state belongs to the active thread that owns the active turn.

## Agent Capability Prompt

The agent should receive compact system/context guidance like:

```text
You are Codex Local, working inside a local project.

You can collaborate through:
1. Chat.
2. Above-composer choices.
3. Canvas.

Use chat for explanations, progress, summaries, and normal answers.
Use progress/activity UI for compact work visibility: command rows, file rows, changed-file summaries, and product-facing status. Never expose hidden chain-of-thought.
Use above-composer choices when the next action needs user direction.
Use Canvas when the user is asking about product shape, UI, UX, workflow, placement, visual direction, layout, or app behavior that benefits from seeing before building.

Canvas is an agent capability, not just a preview panel.

Canvas is a visual collaboration surface:
- Live is the current source of truth.
- Draft is a temporary feature layer shown in the real app's styling/runtime context.
- A/B/C are optional compare lanes, not the default existing-project workflow.

For existing projects, default to one Live-first feature draft when the user asks to visualize a feature before building it. Use A/B/C only when the user asks for multiple directions or a real compare decision is needed.

You can build directly, ask a compact question, create or revise a Draft, park/resume/discard a Draft, update a draft brief, create A/B/C options when explicitly useful, interpret marks or fallback visual edits, build the approved Draft, build selected into an implementation candidate, or archive old work.

Reason from the user's latest message, current project state, Live state, active Draft, draft brief, selected Canvas lane, optional proposal lanes, marks, change marks, user edit intents, move drafts, Plan Mode, and accepted history.

Also reason from route, view state, viewport, screenshot evidence, target confidence, generated Canvas IDs, and browser-observed facts when available.

Visible user text is authoritative. Treat active Draft state, selected lanes, marks, images, route/view state, and proposal metadata as supporting context.

Never expose hidden payloads, proposal folders, temp paths, JSON control blocks, routing names, or workspace mechanics to the user.
```

## Canvas

- Canvas is the visual collaboration surface.
- Live is the current app/source of truth.
- Draft is the default existing-project feature exploration layer.
- A, B, and C are optional compare lanes.
- Existing projects should open Live-first with no empty proposal row.
- A single feature request creates one Draft, not A/B/C.
- Canvas shows the app as `Live + Draft` when a feature draft exists.
- Draft UI should feel native because it uses the app's real source, components, styles, tokens, and layout.
- Draft behavior may use fake/mock data where backend integration would slow the loop.
- The user can revise the same Draft conversationally and with marks.
- If Live and optional proposals both exist, show both only when comparison is genuinely useful.
- Canvas uses one interactive preview surface by default.
- Live, Draft, A, B, and C are Canvas states shown in chrome, not separate live webviews by default.
- Selecting a state swaps the active backing view or overlay where possible.
- Side-by-side comparison should be an explicit compare mode, not the default feature-draft mode.
- Proposal lanes can represent quick wireframes, fuller mockups, lightweight Live proposals, user-refined proposals, or runnable candidate apps.
- A/B/C are display lanes, not implementation types and not long-running feature names.
- Old proposals can remain visible as history/reference, but future ambiguous requests should route from Live or the active Draft unless the user explicitly asks to revisit a proposal.

## Live-First Feature Draft Layer

The primary existing-project workflow is a temporary feature layer on top of Live.

Use this when the user says things like:

- "show me how this feature could work";
- "try a settings flow";
- "let me feel the dashboard before we build it";
- "where would this button/panel live?";
- "I want to visualize this before implementing it."

The default behavior should be:

1. Inspect the real app's framework, routes, components, styling, tokens, and data patterns.
2. Create one native-looking Draft in the app's styling/runtime context.
3. Use fake or mock behavior where backend integration would slow the loop.
4. Keep main Live source untouched while the Draft is being explored.
5. Show the result as `Live + Draft`.
6. Let the user revise the same Draft through chat and marks.
7. When the user says `Build this`, convert the approved Draft into real source/backend implementation.

This is the "temporary UI comments" model: the user sees and feels UI inside the real app, but the implementation remains reversible and source-safe until approval.

The practical implementation is:

```text
isolated draft source/worktree + preview flag + mock data/backend layer
```

The user should not see those mechanics.

Internally, a feature draft may use:

- a temporary worktree or draft workspace;
- a preview-only flag such as `preview.isOn("feature-name")`;
- a mock data module such as `preview.mock.*`;
- the app's real component library and styling system;
- generated UI code that is easy to delete, revise, or promote.

Default safety rule:

**Do not write feature-draft code into the user's main working tree until the user chooses `Build this`.**

If a narrow future implementation writes gated draft code into the main tree, it must still be source-safe, reversible, lint/build-aware, and clearly removable. The preferred v1 route is an isolated draft workspace presented as `Live + Draft`.

## Draft Lifecycle

A Draft is a thread-owned temporary product branch.

Visible UI should stay simple:

- `Draft: Quick add flow`;
- `Build this`;
- `Park`;
- `Discard`;
- `New draft` when the user clearly starts a separate feature thread.

Hidden state should track:

- project and owning thread;
- name, such as `Quick add flow` or `Analytics impact`;
- status: `active`, `parked`, `built`, or `discarded`;
- draft workspace/branch pointer;
- preview URL and route state;
- affected routes/screens;
- fake/mock backend assumptions;
- user decisions so far;
- open questions;
- associated draft brief path.

Rules:

- Revising the same feature updates the same active Draft.
- A new affected page that belongs to the same feature expands the same Draft.
- A different solution or separate feature creates a new named Draft.
- Multiple drafts are named product branches, not A/B/C.
- Alternative designs for one decision may use compare mode inside the Draft, but should not become the default model.
- A/B/C remains for comparing visual variants of one decision, not for managing long-running feature work.

## Draft Brief

Every non-trivial Draft should have a living markdown brief.

Suggested path:

```text
.codex/drafts/<draft-slug>/brief.md
```

The brief is the continuity layer between chat, preview, parked drafts, and final build.

It should capture:

- draft name and status;
- feature goal;
- current draft summary;
- affected routes/screens;
- fake/mock backend assumptions;
- user-approved decisions;
- rejected ideas;
- open product questions;
- implementation/build plan;
- backend integration notes;
- risks and follow-up pages.

Update the brief at important checkpoints:

- draft created;
- major direction approved or rejected;
- draft expands to another route/page;
- draft parked or resumed;
- user asks for a plan;
- user says `Build this`.

Do not update the brief after every tiny message. The brief should stay useful, not become a transcript dump.

When the user asks for a plan for the feature, update the draft brief into a clear build-ready markdown plan, then show a concise summary in chat.

## Native-Looking Drafts

The Draft must look like the app, not like an external mockup.

Agent rules:

- inspect the app's framework, file structure, components, styling, tokens, and data patterns first;
- compose existing components before inventing markup;
- match current density, border radius, typography, spacing, and color semantics;
- avoid inline-style sludge unless the app already uses that convention;
- add only enough fake data/behavior to feel the flow;
- do not build the real backend path during the Draft unless it is trivial and safe.

This is why existing-project feature work should draft inside the app's source/runtime context rather than in standalone mockup artifacts.

## Mock Backend Convention

Drafts may use boring, consistent fake-backend conventions.

V1 can define a small app-local convention such as:

```ts
preview.isOn("feature-name")
preview.mock.query(...)
preview.mock.mutate(...)
preview.mock.reset(...)
preview.mock.seed(...)
```

The exact API can be framework-neutral at first, but the product contract is:

- fake data is allowed and expected in Draft mode;
- fake mutations should update local/in-memory draft state so the flow feels real;
- mock state must not touch production backend, user data, persistent app storage, or source files outside the draft workspace;
- the final build replaces or removes mock calls.

## Build This Contract

`Build this` is two conceptual operations:

1. Promote the approved UI:
   - remove draft-only gates;
   - place the UI in the real app structure;
   - preserve the approved visual/interaction result.
2. Replace fake behavior with real integration:
   - wire API calls, database writes, auth, routing, state management, and persistence;
   - remove preview/mock modules or leave only reusable test fixtures if the app convention supports them;
   - run tests/build and reload Live.

The implementation may do these in one agent turn, but the hidden prompt and verification should treat them as separate risks.

## Existing Canvas Work Under P33

Keep:

- Live preview webview and run/reload/open lifecycle.
- Mark area and visual reference chips.
- Route/viewport/screenshot evidence.
- Code-backed isolated workspaces as internal infrastructure.
- Existing VisualPatch/proposal infrastructure only where it helps the Live-first Draft loop.

Demote or shelve:

- A/B/C as the default existing-project workflow.
- Element dragging as the primary interaction model.
- General DOM editing.
- Proxy/move-intent UI as the main product surface.
- Generated DOM addressability and Move Mode lint as a product gate.
- P31/P32 edit chips unless explicitly revived as fallback visual evidence.
- Fixed questionnaires when the user already asked for a clear target.

Do not rebuild abandoned P31/P32 capabilities just to make the Live-first Draft plan possible. First make the new Live-first Draft loop work and let unused surfaces fade behind routing/UI changes.

## Canvas Lane Movement

Lane movement is optional compare-mode behavior, not the primary existing-project feature workflow.

The user may move intent between lanes when proposals or compare alternatives exist.

- Drag A to Live: promote/build this proposal into the real app.
- Drag Live to A: fork the current app into a proposal lane so changes can be explored safely.
- Drag A to B: copy or derive one proposal into another lane.
- If there is no Live app yet but proposals exist, Live still appears as a stopped/drop target so the user can promote A/B/C.

The UX matters: dragging should not instantly mutate files. It should show a small confirmation near the drop target, such as:

- Build A into Live?
- Update A from Live?
- Create proposal from Live?

When confirmed, the app sends a clean agent action/instruction. Do not show a questionnaire unless the intent is ambiguous.

By default there is one active preview surface, not four running apps. Live, Draft, A, B, and C are states in the Canvas chrome. Selecting or dropping states changes what the surface shows or what operation is requested.

## Canvas Header

- If no Live app exists and no proposal exists, keep Canvas quiet.
- If Live exists, show a Live row.
- Live stopped row actions: Preview, Detect, URL.
- Live running row actions: Mark area, Reload, Stop, Open.
- If an active Draft exists, show compact Draft state and actions such as `Build this`, `Park`, and `Discard`, while preserving the locked header contract until an owner-approved replacement is planned.
- Do not show an empty proposal row for an existing project with no alternatives.
- If compare proposals exist, show a proposal row with A, A | B, or A | B | C.
- Proposal row actions: Changes when agent change marks exist, Mark area, Edit, Build selected.
- Desktop/Mobile is an icon-only floating control at the top middle of the Canvas.
- Do not put Desktop/Mobile inside the Live or proposal rows.
- Keep row actions local to their lane.

## Above-Composer Choices

- The above-composer layer is the agent's compact question surface.
- Use it when the agent needs the user to choose direction, fidelity, scope, or target.
- The agent writes the question and choices based on the user's request.
- Use 2 or 3 choices.
- Visible choice labels should be short, usually 2-4 words, and fit on one line.
- Choices should be specific to the request.
- The decision strip should feel like a lighter composer state, not a separate heavy card.
- The user must still be able to attach or keep marks, changes, snapshots, images, and references while a choice is visible.
- For broad creation questions, the agent may offer options such as `Build app`, `Create mockup`, `High-fidelity draft`, or `Tell me what to do`, but only when those choices fit the request.
- `Tell me what to do` means the user will type more direction. Keep that path simple and do not open extra reference pickers by default.
- The desktop may attach hidden routing metadata, but the user should only see simple product language.
- Do not use fixed canned choices unless they genuinely fit.
- A choice should continue the same chat/thread and should not create a new conceptual session.
- A choice may stage editable composer text or send a structured follow-up only when the user action clearly implies that commitment.
- Do not show a competing chat-side approval/proposal card for the same unresolved decision.
- Do not block operational, backend, command, no-edit, or explicitly direct prompts with visual choices just because the project is empty.

## Canvas Action Model

- Build one Canvas resolver/state model.
- Do not scatter one-off prompt patches throughout the app.
- Canonical Canvas actions:
  - ASK_USER
  - CREATE_PROPOSAL
  - REVISE_PROPOSAL
  - ADD_OPTION
  - CREATE_DRAFT
  - REVISE_DRAFT
  - PARK_DRAFT
  - DISCARD_DRAFT
  - BUILD_DRAFT
  - BUILD_SELECTED
  - BUILD_LIVE_DIRECTLY
  - ARCHIVE_PROPOSALS
  - RECORD_USER_EDIT_INTENT
  - RECORD_MOVE_DRAFT
- The resolver should consider:
  - current project state;
  - whether Live exists or is running;
  - active Draft state;
  - draft brief;
  - selected lane;
  - active proposal set;
  - proposal history;
  - proposal backing type;
  - user marks;
  - agent change marks;
  - user edit intents;
  - move drafts;
  - attachments;
  - Plan Mode;
  - the latest user request.
- The resolver decides the broad action class.
- The agent authors the user-facing question, proposal shape, option wording, and implementation details.
- For existing-project feature visualization, the resolver should prefer `CREATE_DRAFT` or `REVISE_DRAFT` over A/B/C unless the user explicitly asks for alternatives.
- When the user says `Build this`, `Let's build it`, or equivalent approval around the active Draft, resolve to `BUILD_DRAFT`, not generic proposal selection.

## Resolver Architecture

- The agent should be flexible, but product state transitions must be validated by deterministic code.
- Flow:
  - user message + structured Canvas/project state;
  - agent expresses intended action or returns a decision/proposal;
  - resolver validates the action against current state, permissions, lane lifecycle, edit intent, and Plan Mode;
  - app executes the allowed action;
  - agent writes user-facing content inside that allowed action space.
- The resolver owns broad action validity.
- The agent owns product wording, proposal intent, option descriptions, tradeoffs, and implementation details.
- Do not build a hidden second product brain with scattered keyword branches.

## Proposal Backing And Intent Layers

A proposal lane can be backed by:

- wireframe_artifact
- mockup_artifact
- live_dom_patch
- code_backed_workspace

Semantic edit intent is an intent layer on top of a proposal backing, not a backing type itself.

```ts
type ProposalBackingType =
  | "wireframe_artifact"
  | "mockup_artifact"
  | "live_dom_patch"
  | "code_backed_workspace";

type ProposalIntentLayer = {
  kind: "semantic_edit_intent";
  edits: CanvasUserEdit[];
};
```

- Use the smallest honest backing type for the user's request.
- A/B/C are display lanes. They are not backing types.
- A proposal may have a backing type plus an optional semantic edit intent layer.

## Proposal Data Model And Rendering Mechanics

- A Canvas proposal is not a full copy of the project by default.
- A proposal is a small, typed artifact rendered against the current project state.
- For lightweight Live proposals, do not copy the project, create a branch, create a worktree, or mutate Live source files.
- The default lightweight representation is a preview-only patch bundle rendered externally inside the Canvas preview surface.
- The v1 lightweight patch runtime supports:
  - style changes;
  - text changes;
  - hide changes;
  - show changes.
- Do not assume v1 can safely move, insert, reparent, replace components, or reconstruct layouts.
- Structural layout changes, new pages, workflow changes, and component replacement should use semantic edit intent plus code-backed proposal/implementation.

## Patch Target Model

```ts
type ElementRef = {
  canvasId: string;
  sourceFile?: string;
  componentName?: string;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

type TargetResolution = {
  kind: "exact" | "inferred" | "visual_only";
  confidence: "high" | "medium" | "low";
  elementRef?: ElementRef;
  bounds: Rect;
  screenshotRef: string;
};

type VisualPatch =
  | { op: "style"; target: ElementRef; css: Record<string, string> }
  | { op: "text"; target: ElementRef; value: string }
  | { op: "hide"; target: ElementRef }
  | { op: "show"; target: ElementRef };
```

- Prefer stable data-canvas-id targets.
- When possible, collect source metadata such as component name and source file.
- Source metadata is hidden agent/runtime context, not user-facing UI.
- High-confidence targets can be used for patch proposals and later code conversion.
- Medium-confidence targets can be used for visual proposals, but should be verified before conversion into source edits.
- Low-confidence or visual-only targets should be treated as screenshot context, not direct patch/code targets.
- Switching Live/A/B/C should hot-swap preview-only patch bundles where possible instead of reloading the app, so scroll, form, modal, and interaction state can be preserved.
- Accepted lightweight proposals are converted into real source edits only after user approval.
- Conversion must follow the project's existing styling and component conventions.
- Do not dump inline styles unless the project already uses inline styles for that pattern.

## Route And View State Evidence

- Route and view state are part of visual context, not loose labels.
- A mark, proposal highlight, VisualPatch target, or semantic edit should preserve the route, view state, viewport, screenshot, bounds, and timestamp when available.
- For multi-page apps, distinguish the current Live route, source visual reference route, target implementation route, and whether a route is implemented, proposed, artifact-only, unavailable, or unknown.
- For one-route apps, preserve meaningful view state such as selected tab, step, modal, drawer, selected record, or filter state when it affects the visual request.
- Keep labels product-facing and compact, such as Settings, Step 2, Recipe drawer, or New route. Avoid raw DOM state names.
- Do not treat every query parameter, filter, hover, or focus state as durable context. Capture state only when it changes the screen being discussed.
- Sanitize route/query/state data. Never serialize token, session, auth, secret, password, invite, reset, key, or similarly sensitive-looking values.
- Browser-observed route/view state is evidence. The app/server proposal registry and explicit user request remain the source of truth for what should be edited.

## Browser Observer/Actor

The app may provide a browser observer/actor capability through Playwright, jsdom, custom preview instrumentation, or the smallest useful browser control layer.

- It can let Codex inspect the running preview through screenshots, DOM/accessibility metadata, element bounds, interaction state, and before/after comparisons.
- It can improve target confidence, verify VisualPatch application, support Edit Mode proxy detection, and help the agent understand what the user is seeing.
- Browser observation is supporting evidence, not the source of truth for Canvas state.
- Canvas proposal lifecycle, lane state, proposal registry, Plan Mode permissions, and source edits remain owned by the app/server model.
- Do not make Milestone 0 depend on a full browser automation system.
- Use the smallest browser/preview inspection needed to prove one patch on one real element.
- Browser Actor interactions are for scoped verification. Do not let browser automation click destructive app controls unless the agent explicitly asks for a safe verification target and the element is clearly non-destructive.

## Supporting Generated App Addressability

Generated/test app addressability is supporting infrastructure, not the primary P33 product loop.

If Canvas Move Mode or deterministic target selection is revived, Codex-generated and test apps should be born Canvas-ready.

The user should not have to:

- create `data-canvas-id` attributes manually;
- know what DOM is;
- ask for broad editable categories such as "major buttons, cards, filters, headings, and sections";
- inspect source files;
- use DevTools;
- negotiate with vague element recognition before moving a visible thing.

Generated apps should expose important movable UI pieces with stable, clean Canvas IDs:

```html
<button data-canvas-id="add-task-button">Add task</button>

<section data-canvas-id="todo-column">
  ...
</section>

<div data-canvas-id="filter-bar">
  ...
</div>

<article data-canvas-id="task-card-1">
  ...
</article>
```

Rules:

- The user never creates these IDs. Codex does.
- Important movable pieces should have obvious selectable wrappers.
- Important movable pieces should not be buried inside anonymous wrapper stacks.
- If a component needs inner wrappers, the intended movable outer element must still be clear.
- IDs should be stable enough for Canvas editing and source conversion.
- Generated app prompts/templates can encourage Canvas-addressable structure for buttons, cards, filters, columns, sections, list items, headers, nav, and primary action groups.
- If Move Mode is shipped, add an addressability lint/self-correction step for generated apps. Before Edit/Move Mode claims an app is movable, verify important visible pieces have stable `data-canvas-id` targets.
- If Move Mode is shipped, test freshly generated apps, not only curated fixtures, so generation drift does not quietly reintroduce unaddressable markup.

## Supporting Canvas Move Mode

Canvas Move Mode is a supporting/fallback interaction for generated/test apps, not the active P33 core product loop.

We are not building a general DOM editor. We are building a way for the user to grab a visible thing in a generated app, move it as a reversible draft, and send that intent to Codex.

User workflow:

1. Codex generates or updates an app with Canvas-addressable markup.
2. User opens `Live` or proposal `A/B/C`.
3. User clicks floating `Edit` or `Move` Canvas chrome.
4. Canvas highlights movable elements deterministically from `[data-canvas-id]`.
5. User selects the visible thing they want to move.
6. User drags it to a new relation or visual position.
7. Canvas shows the item moved as a reversible draft.
8. User presses `Save`.
9. Composer receives or updates a compact `Edit 1` chip.
10. Removing `Edit 1` reverts the pending move draft.
11. Sending `Edit 1` asks Codex to convert the move into source changes or a proposal revision.

If revived, Move Mode v1 supports move only.

In scope:

- generated/test apps;
- deterministic picking from stable Canvas IDs;
- hover highlights for movable elements;
- selected-element state;
- relation-based drag targets;
- reversible move draft;
- `Cancel`, `Reset`, and `Save`;
- compact `Edit N` chip lifecycle;
- send-to-source or send-to-proposal conversion through the normal agent/app-server path.

Out of scope:

- arbitrary external website editing;
- user-authored IDs;
- text editing;
- style editing;
- hide/show;
- resize;
- property panels;
- DOM tree UI;
- generic DevTools-like editing;
- automatic cross-parent reparenting;
- source writes before send/build.

Move drafts are not source edits. Do not mutate source files, app data, localStorage, or permanent Live state while the user is drafting a move.

Prefer overlay/proxy previews for relation-based moves:

- show a ghost or clone of the moved element;
- softly dim or mark the original;
- show the relation/drop intent clearly;
- do not fake completed in-flow placement for cross-parent or structural moves.

Use raw CSS transform only for loose visual nudges without a relation target. Relation moves should not leave layout holes or pretend the app's real layout has already changed.

For cross-parent or structural moves, show an intent indicator rather than a fake final layout. The user should understand where the item is intended to go, but Canvas should not claim the source layout changed before send/build.

## Move Draft Model

```ts
type CanvasMoveDraft = {
  id: string;
  projectId: string;
  threadId: string;
  lane: "live" | "A" | "B" | "C";
  proposalId?: string;
  optionId?: string;
  route?: string;
  viewport: "desktop" | "mobile";
  target: {
    canvasId: string;
    tagName: string;
    role?: string;
    text?: string;
    sourceFile?: string;
    componentName?: string;
  };
  beforeBounds: Rect;
  afterBounds: Rect;
  moveClass: "same-parent-reorder" | "cross-parent" | "structural";
  relation?: {
    kind: "above" | "below" | "before" | "after" | "near";
    targetCanvasId: string;
  };
  draftCss?: {
    transform?: string;
  };
  screenshotId?: string;
  createdAt: number;
  updatedAt: number;
};
```

Classify `moveClass` when the drag/relation target is resolved:

- `same-parent-reorder`: source and target share a meaningful parent/container.
- `cross-parent`: source and target are in different meaningful containers.
- `structural`: the move implies reparenting, creating a new slot, or changing component hierarchy.

Same-parent moves may become small source reorder/layout edits after send/build. Cross-parent and structural moves route through code-backed proposal/workspace handling or a clarifying question unless a safe existing slot is proven.

## Interactive Canvas Edit Mode

- Edit Mode lets the user directly shape UX intent by manipulating recognized UI element proxies.
- To the user, Edit Mode should feel like editing the Canvas. The proxy/screenshot machinery is an internal safety layer.
- For generated/test apps, prefer Canvas Move Mode over vague element recognition: deterministic `[data-canvas-id]` targets should make the visible thing directly selectable.
- Edit Mode does not manipulate the live DOM.
- Edit Mode does not reparent React nodes.
- Edit Mode does not mutate Live.
- Edit Mode renders a frozen screenshot snapshot as the background and overlays editable element proxies on top.
- `Edit` should be floating Canvas chrome outside the locked Live/proposal header rows.
- Edit controls appear only while editing: `Cancel`, `Reset`, and `Save`.
- Do not add a separate Undo control in v1; `Reset` returns the current edit session to the original snapshot/proxy state.
- `Save` creates or updates an `Edit N` composer chip and does not auto-send in v1.
- Removing an `Edit N` chip removes the pending edit intent. Moving the same proxy again updates the hidden payload for the same chip instead of creating duplicates.
- Only high-confidence recognized elements receive edit handles.
- Medium-confidence areas can be selected or marked.
- Low-confidence areas remain screenshot marks only.
- Dragging records semantic UX intent, not absolute pixel position.
- Drops should snap to valid relations such as:
  - above;
  - below;
  - before;
  - after;
  - near;
  - grouped;
  - reordered;
  - primary;
  - secondary;
  - hidden.
- The inside relation is structural by default and routes to code-backed implementation unless the resolver can prove it maps to a safe existing slot/container.
- Editing Live saves an `Edit N` chip scoped to Live; it does not immediately create a proposal lane or mutate Live.
- Editing A/B/C saves an `Edit N` chip scoped to the selected proposal lane/option; it does not overwrite the proposal.
- When the user sends, the agent decides whether to update Live, revise selected A/B/C, create/update options, or ask a decision-strip question when the target is unclear.
- If the user explicitly names a lane such as B, do not ask an A/B/C questionnaire for that choice.
- Agent `Change N` marks are suggestions/evidence. User `Edit N` chips are explicit user intent.
- Flow-level screen/workflow editing is future work, not v1 element Edit Mode.

## Semantic Edit Model

```ts
type CanvasElement = {
  id: string;
  canvasId?: string;
  sourceFile?: string;
  componentName?: string;
  role:
    | "button"
    | "input"
    | "menu"
    | "panel"
    | "card"
    | "heading"
    | "text"
    | "nav"
    | "unknown";
  text?: string;
  bounds: Rect;
  confidence: "high" | "medium" | "low";
};

type CanvasUserEdit =
  | {
      op: "move_intent";
      elementId: string;
      relation: "above" | "below" | "before" | "after" | "inside" | "near";
      targetElementId: string;
    }
  | {
      op: "rename";
      elementId: string;
      value: string;
    }
  | {
      op: "hide";
      elementId: string;
    }
  | {
      op: "promote";
      elementId: string;
      meaning: "primary" | "secondary" | "less_prominent";
    }
  | {
      op: "group";
      elementIds: string[];
      meaning: string;
    };
```

- Avoid resize_intent in v1.
- Resize usually means a semantic change such as more prominent, less dominant, or more compact.
- Record intent such as "move Settings below Add Task," not left/top/margin pixels.
- Bounds and screenshots can be stored as evidence, but implementation intent should stay semantic.

## Edit Intent Resolution

- A recorded edit is not code yet.
- A move draft is not code yet and is not a VisualPatch.
- Same-parent move drafts may become small reorder/layout source edits after send/build.
- Same-parent reorder may become a small order/layout change.
- Rename, hide, and promote may become direct source edits when target confidence is high.
- Cross-parent move drafts, reparenting, structural layout changes, inside drops, or component replacement must route through code-backed proposal or implementation unless a safe existing slot is proven.
- Do not pretend a cheap VisualPatch can safely implement structural changes.

## Proposal Persistence

- Draft metadata that can later affect source should be persisted in the same app/server-owned model as source-affecting proposals, or in a dedicated Draft registry with the same safety guarantees.
- Proposal metadata should be persisted in a shared proposal registry owned by Rust/app-server.
- Electron may own visual display state and cache proposal presentation data.
- Any Draft or proposal artifact that can later become a source edit must be known to Rust/app-server.
- The proposal/draft registry should track identity, project, thread, lane or draft name, backing type, lifecycle, baseline/staleness metadata, target references, build strategy, draft brief, mock assumptions, edit intents, and artifact locations.
- Electron-only state must not be the sole source of truth for source-affecting Drafts or proposals.

## Proposal Lifecycle

Proposal states should distinguish:

- draft
- shown
- revised
- selected
- accepted_for_build
- building
- built
- verified
- promoted_to_live
- rejected
- archived

Visible, selected, accepted, building, built, verified, and promoted are different states. Do not collapse them into one boolean.

## User Decision Lifecycle

- Accept visual direction: user likes the proposal direction.
- Build into code: Codex converts the proposal into an implementation candidate.
- Review result: user/app verifies the changed Live app, diff, or candidate result.
- Promote/apply to Live: implementation becomes the project source-of-truth state.
- Build selected means convert the selected proposal into an implementation candidate for review.
- Build selected must not silently commit, merge, or permanently replace Live without review.
- Build selected, Apply, Promote, and lane drag/drop confirmations must preserve visible user intent and should not bypass the active chat/thread record.

## Proposal Staleness

A proposal can become stale if:

- the base commit or baseline snapshot changed;
- the route changed;
- the viewport changed significantly;
- a targeted source file changed;
- a target data-canvas-id disappeared;
- the Live preview URL changed;
- the project switched;
- the proposal workspace was deleted.

When stale, show product-facing recovery actions such as Refresh, Archive, or Rebase. Do not silently apply stale proposals.

## Build Selected Strategies

BUILD_SELECTED is a user-facing action, not one implementation path.

Internally resolve it to:

- build_live_first_draft
- implement_from_wireframe
- implement_from_mockup
- convert_dom_patch_to_code
- resolve_semantic_edit_intent
- resolve_move_draft
- promote_code_workspace

A Live-first Draft, wireframe, mockup, DOM patch, semantic edit intent, move draft, and runnable workspace must not be promoted the same way.

## Proposal Behavior

- For existing projects, default to one Live-first Draft for one feature request.
- Create A/B/C only when alternatives represent meaningfully different UX directions, not minor visual variations, or when the user explicitly asks for multiple directions.
- Good A/B/C:
  - conservative cleanup;
  - compact power-user layout;
  - guided beginner layout.
- Bad A/B/C:
  - blue button;
  - slightly bluer button;
  - same button but 2px taller.
- For feature visualization in an existing app, create a native-looking Draft inside the app's real styling/runtime context.
- For small visual tweaks to an existing app, a lightweight Live-based proposal may still be useful, but it should not replace the Draft loop when the user wants to feel a feature.
- For blank projects, explicit wireframes, rough directions, or fallback visual review, create saved wireframe/mockup proposals.
- For serious app/page/workflow/redesign alternatives, create code-backed proposal workspaces.
- Code-backed A/B/C are isolated runnable candidates.
- Code-backed proposal workspaces are expensive:
  - limit active candidates per project;
  - clean them up explicitly;
  - allocate separate preview ports;
  - never share stale preview URLs across Live/workspaces/projects;
  - require explicit promotion before affecting Live.
- Building a selected code-backed proposal creates or promotes an implementation candidate.
- After promotion, Live becomes the source of truth for future ambiguous requests.
- Accepted or built proposal sets become history/reference unless the user explicitly asks to continue editing that historical proposal.
- Future vague requests after a build route from Live or the current active Draft, not from the old A/B/C set.
- If the user explicitly asks for another option and A/B/C is full, ask whether to replace an option, archive/start fresh, or revise an existing option. Do not invent Option D.

## Marks And Changes

- Prioritize visual marks early. Marks are the bridge between user intent and agent action.
- User can mark an area in Live, Draft, or proposal lanes.
- User marks create compact composer chips such as Mark 1.
- Agent change marks appear through the Changes action on proposal lanes.
- User can move or adjust an agent change mark.
- Adjusted change marks create compact composer chips such as Change 1.
- Edit Mode intent can create compact composer chips such as Edit 1 when sent as context.
- Chips are visual references.
- Behind the scenes, preserve project, thread, active Draft, lane, proposal, option, route, viewport, screenshot, bounds, target resolution, edit intent, note, and source.
- In visible UI, keep chip labels short. Do not show internal IDs, routes, or paths.
- User marks and agent change marks share the same visible chip/lightbox treatment, but preserve source metadata internally.
- Visual chip behavior should match the composer/transcript attachment contract: thumbnail first, tiny label only when useful, detach only before send, click to preview larger.
- Removing a chip removes the backing unsent context for the next message.
- Sent visual chips remain visible above the user message as transcript evidence, but they should not remain stuck in the composer as unsent state.

## Plan Mode

- Plan Mode is the implementation gate.
- Plan Mode uses the normal Canvas system.
- Plan Mode starts from the composer `+` menu or from a mode toggle in the composer.
- A plan should appear after normal progress/activity, inside one focused plan panel, not as scattered chat fragments.
- The plan panel should transform the composer into a confirmation surface with two clear paths:
  - `Yes, implement this plan`;
  - `No, tell Codex what to do differently`.
- The `No` path should focus simple text feedback and should not open extra `@` reference picking by default.
- A Plan Mode visual Draft or proposal is normal Canvas work with planning-only permissions.
- In Plan Mode, Codex can investigate, propose, create Draft briefs, visual artifacts, patch previews, marks, user flows, tradeoffs, risk summaries, and semantic edit intent.
- In Plan Mode, writes are allowed only to non-source proposal/artifact storage managed by Codex Local, such as draft briefs, screenshots, proposal JSON, patch previews, mark metadata, and edit-intent metadata.
- In Plan Mode, write-capable tools for implementation files should be disabled by Rust/app-server until the user accepts.
- Do not rely only on prompt text to prevent implementation writes.
- Accepted plans may carry selected visual references into the implementation turn.
- Plan Mode should not become a separate visual product.

## Live Preview

- Use a real browser/webview surface for running apps.
- Managed preview can start common local web apps or serve static index.html projects.
- Detect existing localhost apps as fallback.
- Reject Codex/backend/debug ports.
- Remember preview URLs per project.
- Never show another project's stale localhost preview.
- App Preview owns starting, stopping, and reloading preview servers after implementation. Agent implementation turns should not leave long-running preview/server processes as part of the build turn.
- If preview URL discovery fails, show an honest unavailable/start/use-URL state rather than a blank page or backend/debug surface.

## User-Facing Privacy And Rationale

- Never expose hidden chain-of-thought.
- Never expose hidden control JSON.
- Never expose internal sentinel strings.
- Never expose draft workspace paths.
- Never expose preview flags or mock-backend implementation names.
- Never expose proposal workspace paths.
- Never expose temp paths.
- Never expose raw prompt wrappers.
- Never expose routing metadata or workspace mechanics.
- It is okay, and often required, to show product-facing rationale:
  - proposal intent;
  - user flow;
  - changed elements;
  - tradeoffs;
  - risk summary;
  - what will happen if the user chooses an option.
- Never inject agent/proposal chrome inside the user's app preview.
- Draft/proposal state belongs in desktop Canvas chrome and Changes marks.
- Keep language product-facing and concise.
- Prefer fewer clicks.
- Avoid stale route flashes, stale proposal routing, and stale previous-screen UI.
- Do not preserve obsolete visual systems as hidden compatibility paths. Once a replacement model is verified, remove or quarantine old routing, prompt, parser, state, and UI paths so future agents cannot revive old behavior.
- Avoid admin/debug/builder surfaces unless the user is explicitly building such a surface inside their own app.

## Implementation Gates

Do not build more A/B/C, move-mode, or general DOM-editor complexity until the Live-first Draft loop passes on real existing apps.

The current core gate is a Live-first Draft proof:

- existing app opens Live-only with no empty proposal row;
- one feature request creates one native-looking Draft, not A/B/C;
- the Draft uses the app's real styling/component context;
- fake backend behavior is convincing enough to feel the flow;
- main Live source stays untouched before `Build this`;
- the user can revise the same Draft naturally;
- `Build this` converts the approved Draft into real source/backend work;
- Live reloads and matches the approved Draft closely enough to claim success.

Milestone 0 and Milestone 0.5 remain useful historical gates for lightweight patching and screenshot/proxy editing, but they are not the active product direction.

## Historical Milestone 0

Validate the lightweight proposal runtime before building the old full Canvas proposal system. This remains useful infrastructure evidence, not the active P33 product loop.

- Run one real local app in the preview surface.
- Add data-canvas-id to one real button.
- Inject a preview-only Canvas runtime.
- Apply one style patch.
- Trigger a React re-render.
- Confirm the patch remains or is safely reapplied.
- Capture before/after screenshots.
- Confirm Live source files are untouched.
- Confirm Live/A lane switching applies and clears the patch without launching separate webviews by default.

## Historical Milestone 0.5

Validate proxy edit mode before building full semantic editing. This remains useful fallback evidence, not the active P33 product loop.

- Freeze a screenshot of one real running screen.
- Recognize one real button with high confidence.
- Overlay one draggable proxy on that button.
- Recognize one target element.
- Drag the proxy below the target.
- Snap to relation: below targetElementId.
- Record one move_intent.
- Save it as an `Edit N` composer chip without auto-sending.
- Remove the chip and confirm the pending edit intent clears.
- When send serialization is present, send that intent to the agent and confirm the agent reads it as "move this button below that element."
- Confirm Live DOM and source files were untouched.
- Run `plans/wip/P31-test-0.5.md` before continuing into later Edit Mode phases.

## Supporting Generated Move Mode Gate

Validate Canvas Move Mode on a freshly generated/test app only if this fallback path is revived. Do not treat visual dragging as the active core product path while P33 is the direction.

- Generate a task-board-style app without hand-editing IDs.
- Verify important buttons, cards, columns, filters, sections, list items, and headers expose stable `data-canvas-id` targets.
- Verify addressability lint/self-correction catches missing IDs.
- Open Move Mode and select a visible movable element deterministically.
- Move it within the same parent and classify it as `same-parent-reorder`.
- Reset and confirm the draft returns to the original position.
- Move it toward a different meaningful container and classify it as `cross-parent` or `structural`.
- Show cross-parent/structural moves as intent indicators, not fake in-flow layout changes.
- Save as `Edit 1`, remove the chip, and verify the draft reverts.
- Save again, send `Apply this to Live`, and verify source changes only after send.
- Reload Live and compare the implemented result to the move draft.
- Confirm no hidden IDs, paths, JSON, or draft metadata leak into visible UI.

## Implementation Order

1. Rust app-server boundary over Codex CLI.
2. Electron + React desktop shell.
3. Project list, project-scoped threads, composer, streamed turns, approvals, file changes.
4. Managed Live preview.
5. Mark area.
6. Visual reference chips.
7. Target resolution with screenshot, bounds, DOM/source metadata, and confidence.
8. Above-composer decision strip.
9. Canvas resolver/state model.
10. Live-first Draft routing for existing projects.
11. Draft workspace/registry model.
12. Draft brief memory.
13. Preview/mock convention.
14. Draft revision loop.
15. `Build this` conversion path.
16. Header/UI simplification so existing projects do not show empty proposal mechanics.
17. Optional compare mode with A/B/C only for explicit alternatives.
18. Lightweight Live patch proposals only where they support the Draft loop.
19. Screenshot/proxy Edit Mode and Move Mode only as fallback/supporting visual evidence.
20. Plan Mode visual evidence and server-level write enforcement.
21. Regression tests and Electron dogfood.

## Testing

- Add resolver fixture tests for realistic workflows.
- Add adapter-level tests, not only pure resolver tests.
- Test existing app opens Live-only with no empty proposal row.
- Test existing-project single-feature prompt creates one Draft, not A/B/C.
- Test draft UI uses the app's real styling/component context.
- Test draft behavior can use fake/mock data without touching production backend, user data, persistent app storage, or main Live source.
- Test natural follow-up messages revise the same active Draft instead of creating new chats, new A/B/C sets, or redundant decision strips.
- Test a mark can guide a Draft revision without exposing internal routing/state.
- Test an affected second route/page expands the same Draft when it belongs to the same feature.
- Test a separate feature creates a separate named Draft that can be parked and resumed.
- Test draft brief creation and checkpoint updates:
  - draft created;
  - major decision approved or rejected;
  - route/page added;
  - draft parked or resumed;
  - user asks for a feature plan;
  - user says `Build this`.
- Test draft brief stays useful and does not become a transcript dump.
- Test `Build this`, `Let's build it`, and equivalent approval resolve to the active Draft build path.
- Test main source stays unchanged before `Build this`.
- Test main source changes only after `Build this`.
- Test build conversion removes/replaces draft-only gates and mock behavior or reports remaining backend integration explicitly.
- Test Live reload matches the approved Draft closely enough to claim success.
- Test Discard removes the Draft and leaves Live clean.
- Test Park/Resume restores the named Draft without leaking workspace paths or stale preview URLs.
- Test explicit compare requests still create alternatives:
  - `show me 3 directions`;
  - A/B/C appears only then;
  - normal single-feature requests never enter compare mode accidentally.
- Test optional lane movement only when proposal/compare alternatives exist:
  - drag A to Live;
  - drag Live to A;
  - drag A to B;
  - stopped Live as drop target when proposals exist but no Live app exists.
- Test drag confirmations do not mutate files before confirmation.
- Test choices, draft actions, and lane confirmations continue the same active thread and do not create duplicate sidebar sessions.
- Test hidden control JSON, prompt wrappers, selected-option payloads, and internal paths never render in chat, sidebar titles, composer text, Activity, or transcript copy.
- Test visible user text remains authoritative when selected proposal context, marks, or hidden build context conflict with the typed instruction.
- Test Live/project-owned state and Draft/proposal/thread-owned state do not leak across project switches, new chats, removed/re-added folders, or resumed old chats.
- Test built proposal sets become history/reference and no longer capture future vague prompts.
- Test route/view-state evidence:
  - current route mark;
  - source route to target route request;
  - one-route multi-step state;
  - modal/drawer state;
  - sensitive query/state sanitization.
- Test one interactive preview surface hot-swaps patches rather than launching separate webviews by default.
- Test browser observer/actor evidence stays supporting evidence and does not become Canvas source of truth.
- Test target confidence:
  - high-confidence targets can patch/convert;
  - medium-confidence targets require verification before conversion;
  - low-confidence/visual-only targets do not convert directly into source edits.
- Keep historical/supporting tests for Milestone 0 lightweight patch runtime when that infrastructure changes.
- Keep historical/supporting tests for Milestone 0.5 proxy edit runtime when that fallback changes.
- Keep supporting tests for Edit Mode only if that path is still shipped:
  - opens from Live/proposal;
  - freezes screenshot;
  - overlays high-confidence proxies;
  - uses floating `Edit` chrome outside the locked header rows;
  - supports Cancel, Reset to original snapshot, and Save to `Edit N` chip;
  - does not include separate Undo in v1;
  - does not drag live DOM;
  - records semantic move_intent;
  - creates or updates an edit chip when editing Live;
  - creates or updates an edit chip scoped to selected A/B/C;
  - removes pending edit intent when the chip is removed;
  - updates the same chip when the same proxy moves again.
- Keep supporting tests for Canvas Move Mode only if that path is revived:
  - generated app exposes stable movable `data-canvas-id` targets;
  - addressability lint catches missing IDs;
  - picker selects `[data-canvas-id]` deterministically;
  - nested markup selects the nearest addressable ancestor;
  - hover highlights movable elements without exposing internal IDs;
  - drag creates a reversible move draft;
  - same-parent, cross-parent, and structural move classes are classified at drag/relation time;
  - relation moves use overlay/proxy intent indicators rather than layout-breaking transforms;
  - Reset, Cancel, Save, chip update, and chip removal behave correctly;
  - source files do not change before send/build;
  - sending `Edit 1` routes explicit Live, explicit A/B/C, ambiguous, and structural cases correctly;
  - implemented source result can be compared back to the saved move draft.
- Test Build selected strategies:
  - Live-first Draft to real implementation;
  - wireframe to implementation;
  - mockup to implementation;
  - DOM patch to code;
  - semantic edit intent to implementation/proposal;
  - move draft to implementation/proposal;
  - code workspace promotion.
- Test Build selected does not silently promote source-affecting proposals without review.
- Test proposal staleness and recovery.
- Test mark creation, Change mark adjustment, Draft context chips, Edit intent chips, and composer chips.
- Test project switching does not leak previews, marks, drafts, edit sessions, chips, or proposals.
- Test draft/code-backed workspace ports and URLs do not leak into Live or other workspaces.
- Test Canvas header behavior at narrow widths.
- Test Plan Mode blocks implementation writes at tool/server level.
- Test Plan Mode allows app-managed non-source proposal/artifact writes.
- Test active-turn progress: first-send user bubble stays visible, command/file progress is grouped, final edited-file summaries are not duplicated, and cancellation/failure clears running state honestly.
- Test active turn progress starts visible while work is running, then collapses under `Worked for ...` after completion.
- Test expanded progress shows product-facing activity summaries, command rows, file rows, context-compaction notices, and no hidden chain-of-thought or raw control payloads.
- Test command rows truncate long commands, expand details, and use rolling count animation for active command/file totals where implemented.
- Test changed-file activity groups multiple file operations and shows green additions/red deletions.
- Test thread-level change totals appear above the composer after source changes, use the same count language, and do not require a separate review button.
- Test no-change assistant turns end simply without empty file-change cards.
- Test long user prompts clamp to about 15 rows with `Show more`.
- Test message hover controls appear on the correct side without shifting layout.
- Test quote/snippet containers are copyable without turning the response into nested panels.
- Test composer `+` menu, Plan Mode entry, and `@` references appear as compact composer/above-composer evidence.
- Test Plan Mode confirmation uses one plan panel and two options only, and the `No` path focuses text feedback without opening extra reference pickers by default.
- Test Questionnaire mode reuses the above-composer/composer pattern, supports agent-authored choices, and still allows marks, changes, snapshots, images, and references.
- Test visual chips for marks, changes, snapshots, images, and references share one thumbnail/lightbox treatment in composer and transcript.
- Test composer chips detach before send, sent chips cannot be detached, overflow chips scroll horizontally, and multi-row transcript attachments shrink cleanly.
- Test the attachment lightbox supports closing and moving through multiple attachments.
- Test the scroll-down chevron appears above the composer when the thread is scrolled away from the latest turn.
- Test new-chat/project footer context remains visible enough for the user to confirm project and branch before/during the first turn.
- Build the desktop app.
- Dogfood in real Electron with:
  - one existing production-like app with auth/login route;
  - one existing interface-heavy app;
  - one empty generated app only as a secondary check.

## What Not To Build First

- A new general programming language.
- Full feature-flag framework for every app/framework.
- Full backend mocking platform.
- A/B/C redesign before the one-Draft loop works.
- More direct manipulation or Edit Mode features.
- Route/page management as a separate browser product.
- Visible developer/debug panels.
- Raw activity log walls exposed as the default progress UI.
- Nested attachment galleries, cards inside cards, or heavy review panels around simple chips.
- Generic DOM editor UI.
- Property panels, node trees, raw coordinates, source paths, or registry views.

Start with one native-looking Draft feature in one real existing app, isolated from main source, revised once, then built for real.

## Success Criteria

- Existing-project Canvas feels Live-first.
- The builder can preview one feature without creating A/B/C.
- The Draft looks native because it runs through the app's real styling/component context.
- Fake backend behavior is convincing enough to feel the feature.
- Main source stays clean until `Build this`.
- `Build this` converts the approved Draft into real source/backend work.
- A/B/C remains available only for explicit compare workflows.
- Chat progress, changes, choices, and chips make work visible without exposing internal machinery.
- The visible UI is simple enough that a non-developer builder understands what is happening.

## Open Questions

- Should v1 draft workspaces reuse the existing code-backed proposal workspace registry or get a separate draft registry?
- What is the smallest preview/mock API that works across static apps, React/Vite apps, and common backend-heavy apps?
- How should auth/login-gated apps expose a useful signed-in draft state without requiring real credentials?
- Should draft-only code ever be written into the main tree behind a flag, or must v1 always isolate it in a worktree?
- What should the visible label be: `Draft`, `Trying`, `Feature preview`, or something else?
