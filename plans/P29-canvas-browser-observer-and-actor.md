# P29 - Canvas Browser Observer And Actor

## Status

- Draft plan.
- No implementation has started.
- Created from owner direction after P27-cool dogfood showed agents still fall back to project-local Playwright/jsdom/Chrome availability when they need visual verification.
- Goal is to give Codex Local an app-owned browser verification capability that understands Canvas lanes (`Live`, `A`, `B`, `C`) instead of asking each user project to install Playwright.
- Depends on `plans/P27-agent-aware-canvas-lane-state.md` for baseline agent lane awareness. P29 should consume canonical lane state; it should not own the prompt/routing awareness work.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`
- `plans/P27-agent-aware-canvas-lane-state.md`
- `plans/P28-canvas-mode-and-visual-plan-evidence.md`

## Non-Negotiable Guardrails

- Do not require `npm install playwright` or `jsdom` inside user projects.
- Do not expose local proposal folders, temp paths, hidden prompt payloads, raw browser protocol details, or workspace mechanics to the user.
- Do not change the P27-cool Canvas header contract:
  - Live stopped row: `Preview`, `Detect`, `URL`.
  - Live running row: `Mark area`, `Reload`, `Stop`, `Open`.
  - Proposal row: `A`, `A | B`, or `A | B | C` with `Changes` when present, `Mark area`, `Build selected`.
  - Desktop/Mobile is an icon-only floating viewport control.
- Do not let browser automation mutate the real app or proposal state unless the agent is in the explicit Actor path and the requested action is scoped to a verification interaction.
- Browser observation and acting must preserve the app-server runtime boundary. The desktop may render, inspect, screenshot, and report evidence, but Codex implementation work still goes through app-server turns.

## Problem

When Codex needs to verify a UI, it currently often checks the selected project for tools such as Playwright or jsdom. If the user project is a plain HTML folder or a small app without those dependencies, the agent falls back to whatever browser binary is locally available or to source checks.

That creates an uneven user experience:

- The user sees agent messages like `Playwright is not installed in this workspace`.
- Visual verification depends on project dependencies instead of Codex Local capability.
- A/B/C proposal lanes may be verified by internal files or paths instead of the same Canvas concepts the user sees.
- Agents can miss rendered behavior, overflow, console errors, and interaction bugs when local browser tooling is unavailable.

Original Codex has app-level Browser Use / browser automation concepts. Codex Local should do the same in product terms: the agent should inspect and interact with Canvas lanes, not arbitrary folders.

P29 assumes the agent already receives compact lane awareness from P27-agent-aware: selected lane, Live status, proposal backing kind, active/history lifecycle, route, viewport, marks/changes, and build meaning. Without that state, browser observation can still inspect pixels but routing remains confused.

## Goal

Add a Codex Local-owned browser capability in two layers:

1. **Canvas Observer** - read-only inspection of `Live`, `A`, `B`, and `C`.
2. **Canvas Actor** - controlled interaction inside those lanes for click/type/flow verification.

The agent-facing mental model should be:

- `Inspect Live at mobile.`
- `Screenshot A at desktop.`
- `Check B for console errors.`
- `Compare Live and A.`
- `Click the Settings button in A and report what opens.`
- `Check whether C has horizontal overflow.`

The user-facing mental model should be:

- Codex can look at the same Canvas surfaces the user sees.
- Codex can verify the UI without requiring dependencies in the user's app.
- Codex should report product evidence, not browser internals.

## User Workflow Contract

### 1. Canvas Observer

The Observer is read-only and should be the first implementation slice.

When the agent needs visual evidence, it can ask Codex Local to inspect a Canvas lane:

- `Live`
- `A`
- `B`
- `C`

For each lane, the helper can return:

- screenshot artifact;
- DOM text summary;
- selected element summaries;
- console errors and warnings;
- current route or file URL in product-safe form;
- viewport size and mode;
- horizontal overflow result;
- visible button/control names;
- simple element presence checks;
- render status such as blank, loaded, failed, or navigation error.

Observer must not:

- click or type;
- change app state;
- reveal internal proposal workspace paths;
- move the user's visible Canvas selection unless explicitly requested.

Preferred UX:

- Run observation in a hidden managed browser context by default.
- Optionally allow observing the currently visible Canvas later, but that is not required for MVP.
- Report findings in plain product language such as `A renders at mobile width with no horizontal overflow and one console warning`.

### 2. Canvas Actor

The Actor is interactive and should be the second implementation slice after Observer is stable.

The agent can ask Codex Local to interact with a Canvas lane for verification:

- click a visible button or link by text/role;
- type into a field by label/placeholder;
- select an option;
- open a menu or sheet;
- submit a simple form;
- run a short scripted flow;
- take before/after screenshots;
- return console errors, DOM deltas, and visible state changes.

Actor must remain scoped:

- It acts inside the chosen Canvas lane only.
- It uses a hidden browser by default so the user's visible Canvas is not jerked around.
- It should not click destructive controls unless the agent explicitly asks for a safe verification target and the element is clearly non-destructive.
- It should not accept Codex approvals, send composer messages, or operate the Codex desktop UI itself in the MVP. It acts on the rendered user app/proposal, not on Codex chrome.

### 3. Lane Resolution

Codex Local resolves lane requests behind the scenes:

- `Live` maps to the current project App Preview URL or managed preview lifecycle.
- Code-backed proposal `A/B/C` maps to the selected option's runnable workspace.
- Live overlay proposal `A/B/C` maps to the live app plus hidden proposal preview metadata.
- Saved mockup `A/B/C` maps to the saved review artifact.
- If the requested lane is unavailable, return a product-safe unavailable reason.
- Lane resolution should start from the canonical P27-agent-aware lane payload, then map the selected lane to the correct browser surface. P29 should not duplicate a separate interpretation of active versus history proposals.

The agent should not receive or mention:

- proposal workspace folder names;
- temp file names;
- hidden prompt blocks;
- raw browser protocol IDs;
- internal webview IDs.

### 4. Evidence Handoff

Observer and Actor output should become usable visual evidence:

- screenshots can be shown in transcript when useful;
- DOM/console/layout summaries can support implementation decisions;
- discovered element bounds can seed `Change N` or `Mark N` style Visual References later;
- P28 visual plan evidence can pin Observer/Actor snapshots when a plan depends on them.

The first slice should only return evidence. Later work can connect evidence directly to Visual Reference chips.

## Architecture Direction

### App-Owned Browser Runtime

Preferred implementation:

- Add an Electron-owned hidden browser/inspection helper or reuse an existing browser-control/plugin path if one is already available in Codex Local.
- The helper should live outside user project dependency resolution.
- The helper should be callable from desktop/app-server coordination code through a narrow request/response API.
- If a bundled Chromium/Electron runtime is already available, reuse it before adding a new browser binary.

Do not implement the MVP as:

- `npm install playwright` in every user project;
- ad hoc shell commands that depend on project `node_modules`;
- visible Canvas webview pointer driving as the only path;
- a second app preview implementation with separate routing rules.

### Suggested Request Shape

```ts
type CanvasBrowserLane = "live" | "A" | "B" | "C";

type CanvasBrowserViewport = {
  mode: "desktop" | "mobile" | "custom";
  width?: number;
  height?: number;
};

type CanvasBrowserObserveRequest = {
  projectId: string;
  threadId: string | null;
  lane: CanvasBrowserLane;
  viewport: CanvasBrowserViewport;
  checks?: Array<
    | "screenshot"
    | "dom_text"
    | "console"
    | "horizontal_overflow"
    | "visible_controls"
  >;
  selectors?: Array<{
    name: string;
    role?: string;
    text?: string;
    css?: string;
  }>;
};

type CanvasBrowserActRequest = CanvasBrowserObserveRequest & {
  actions: Array<
    | { type: "click"; role?: string; text?: string; css?: string }
    | { type: "type"; role?: string; text?: string; css?: string; value: string }
    | { type: "press"; key: string }
    | { type: "wait_for_text"; text: string; timeoutMs?: number }
  >;
};
```

The real protocol can differ, but it should keep lane, viewport, evidence, and user-safe summaries as first-class concepts.

### Relationship To App Preview

- App Preview remains the visible user surface.
- Canvas Browser Observer/Actor is a verification helper, not a replacement for App Preview.
- Managed preview start/stop remains owned by App Preview/Electron lifecycle.
- If Live is stopped, Observer may request a managed preview start only when the agent explicitly needs rendered verification and the project can safely start.
- If a remembered URL belongs to another project, Observer must follow the existing stale-URL protection and report stopped/unavailable.

### Relationship To P27-Agent-Aware

- P27-agent-aware answers what the agent knows about `Live/A/B/C` before choosing an action.
- P29 answers how the agent can inspect or interact with the rendered lane after choosing to observe or verify.
- P29 should consume the P27-agent-aware payload for lane identity, selected lane, backing type, active/history lifecycle, route, viewport, marks, and product-safe labels.
- P29 should not add prompt patches that make routing decisions from browser text alone.

### Relationship To P28

- P28 visual evidence should be able to pin Observer screenshots and element evidence.
- Observer/Actor evidence can become a source for Visual References.
- P29 should not add a new top-level mode. It strengthens Canvas Mode by giving it real rendered evidence.

## Implementation Phases

### Phase 1 - Discovery And Plan Confirmation

- Inspect current Electron App Preview, managed preview, webview, browser/plugin, and IPC paths.
- Inspect the P27-agent-aware lane payload and confirm Observer/Actor can resolve lanes from it without duplicating active/history proposal logic.
- Decide whether to reuse existing in-app browser/plugin code or add a small Electron hidden-browser helper.
- Confirm where the agent can call the helper from without crossing app-server boundaries incorrectly.
- Document the chosen internal route in `docs/Arch.md` only when implementation begins.

### Phase 2 - Canvas Observer MVP

- Implement lane resolution for:
  - Live stopped/running;
  - code-backed proposal A/B/C;
  - saved mockup A/B/C when active;
  - live overlay proposal A when preview-backed.
- Add read-only observation:
  - screenshot;
  - DOM text;
  - console errors;
  - horizontal overflow;
  - viewport size;
  - visible controls.
- Return product-safe summaries and screenshot references.
- Make sure user projects need no browser automation dependency.

### Phase 3 - Observer Tests

- Unit/adapter tests:
  - lane request resolves to the correct backing surface;
  - unavailable lane returns product-safe reason;
  - internal paths are sanitized;
  - stale remembered URL from another project is rejected;
  - desktop and mobile viewport sizes are honored.
- Integration-style desktop test or script:
  - observe a plain `index.html` project with no `node_modules`;
  - capture screenshot;
  - catch a console error;
  - detect horizontal overflow.

### Phase 4 - Canvas Actor MVP

- Add a small action set:
  - click by role/text;
  - type by label/placeholder/text selector;
  - press key;
  - wait for visible text;
  - screenshot after action.
- Keep destructive/sensitive restrictions simple and conservative.
- Return before/after evidence.
- Keep Actor hidden by default.

### Phase 5 - Actor Tests

- Test a plain HTML app:
  - click a button;
  - type in an input;
  - submit a task;
  - verify DOM text changes;
  - verify console remains clean.
- Test mobile viewport interaction and overflow.
- Test that Actor cannot operate Codex desktop chrome or composer.

### Phase 6 - Canvas Evidence Integration

- Let Observer/Actor screenshots and element bounds optionally create Visual Reference evidence for P28.
- Keep visible chips compact:
  - `Snapshot 1` for raw screenshots if needed;
  - `Change 1` for agent change evidence;
  - `Mark 1` for user marks.
- Store lane, project, thread, proposal, option, route, viewport, screenshot, and bounds metadata behind the chip.

### Phase 7 - Dogfood

- Use an empty project with no `node_modules`.
- Build a simple HTML app progressively.
- Verify with Observer:
  - Live desktop screenshot;
  - Live mobile screenshot;
  - DOM text;
  - console error capture;
  - horizontal overflow.
- Create A/B/C proposals and verify:
  - screenshot each lane;
  - compare Live vs A;
  - verify proposal lane `A` does not expose workspace paths.
- Verify with Actor:
  - click a real app button in Live;
  - type into a proposal lane input;
  - open a modal/menu/sheet;
  - verify before/after state.
- Restart Electron and verify the helper still works after app restart.

## Out Of Scope

- Baseline prompt/routing awareness of `Live/A/B/C`; that belongs to P27-agent-aware.
- Installing Playwright into user projects.
- Full Playwright test runner parity.
- Cross-browser testing beyond the bundled/Electron browser.
- Network tracing and performance profiling in the MVP.
- Visual diff engine beyond simple screenshot capture and optional compare metadata.
- Driving Codex desktop UI, composer, approvals, or sidebar through Actor.
- Replacing App Preview or Canvas header UI.

## Success Criteria

- The agent can visually verify a plain HTML project with no project-local Playwright/jsdom dependency.
- The agent can inspect `Live`, `A`, `B`, and `C` using Canvas lane names.
- Observer/Actor lane resolution consumes the canonical P27-agent-aware lane state instead of rebuilding its own proposal-routing model.
- Observer returns screenshot, DOM text, console errors, viewport, visible controls, and overflow status.
- Actor can click/type/press/wait inside the selected user app/proposal lane without touching Codex chrome.
- User-facing chat never mentions proposal workspace paths, temp folders, hidden browser protocol, or project-local dependency absence.
- P27-cool header remains unchanged.
- Tests cover lane resolution, internal path sanitization, stale URL protection, desktop/mobile viewport checks, console capture, overflow detection, and at least one actor flow.
