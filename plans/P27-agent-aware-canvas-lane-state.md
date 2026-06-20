# P27 Agent Aware - Canvas Lane State

## Status

- Draft plan.
- No implementation has started.
- Created after P27-cool dogfood showed that Canvas lane UI can be correct while the agent may still route from incomplete or stale Canvas context.
- This plan is intentionally smaller than P29. It makes the agent reliably understand `Live`, `A`, `B`, and `C`; P29 later lets the agent visually inspect and act inside those lanes.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`
- `plans/P27-fix-canvas-action-wiring-regressions.md`
- `plans/P28-canvas-mode-and-visual-plan-evidence.md`
- `plans/P29-canvas-browser-observer-and-actor.md`

## User Workflow Contract

The user should be able to speak naturally from the current Canvas surface:

- `make A real`
- `move that change a bit lower`
- `show me another option based on B`
- `put this in Live`
- `compare this with the current app`
- `the Settings button in A feels wrong`

Codex should know what the user is referring to because the desktop sends compact Canvas lane state with the turn:

- whether `Live` exists, is stopped, starting, running, or blank;
- which lane the user is viewing;
- whether proposal lanes are `A`, `A | B`, or `A | B | C`;
- what backs each proposal lane: live overlay, saved mockup, or code-backed workspace;
- whether a proposal set is active routing or comparison history;
- whether a selected lane has agent change marks or user marks;
- whether `Build selected` would update Live, stage composer text, or start a normal agent turn;
- relevant route, viewport, proposal title, and product-facing summary.

The user must not see this payload. They should only see clearer behavior: follow-ups route to the lane they are looking at, old applied A/B/C does not catch new work, and ambiguous requests ask one concise question instead of guessing.

## Problem

P27 introduced a canonical Canvas resolver and P27-cool made the header lane-based, but the agent's prompt context can still be less precise than the UI:

- The user sees `Live + A`, but the agent may only receive a generic selected proposal or saved artifact context.
- The user asks for `A`, but the backing surface might be live overlay, mockup, or code workspace, and each needs different routing.
- After A is built into Live, the old proposal may remain visible for comparison but should not remain active routing.
- Marks and moved `Changes` highlights need to travel with lane identity, not just as generic rectangles.
- Vague phrases such as `make A real` or `show me where` need the agent to understand current Canvas state before choosing direct build, proposal revision, or questionnaire.

This is not browser automation. The agent does not need to screenshot or click anything for this plan; it needs reliable state awareness.

## Goal

Create a single product-safe Canvas lane awareness payload and attach it to Canvas-relevant turns.

The agent-facing mental model should be:

```text
Canvas:
- Live: running, source of truth, mobile viewport
- Selected lane: A
- A: active live-overlay proposal, pending, has Change 1, build updates Live
- B/C: unavailable
- Previous A/B/C code proposal: comparison history only
```

The desktop should derive that payload from the same lane adapter/state used by the visible Canvas header. Do not create a second interpretation of Canvas state for prompts.

## Lane Awareness Payload

Suggested shape:

```ts
type CanvasLaneAwareness = {
  projectId: string;
  threadId: string | null;
  selectedLane: "live" | "A" | "B" | "C" | null;
  viewport: "desktop" | "mobile";
  live: {
    visible: boolean;
    status: "blank" | "stopped" | "starting" | "running" | "failed";
    sourceOfTruth: boolean;
    route?: string;
  };
  proposals: Array<{
    id: "A" | "B" | "C";
    title?: string;
    summary?: string;
    backing: "live_overlay" | "saved_mockup" | "code_workspace";
    lifecycle: "active" | "history" | "applying" | "applied" | "failed";
    selected: boolean;
    hasAgentChanges: boolean;
    hasUserMarks: boolean;
    buildMeaning: "update_live" | "stage_build_request" | "agent_turn";
  }>;
  routingHint:
    | "live_source_of_truth"
    | "revise_selected_proposal"
    | "build_selected_to_live"
    | "ask_user"
    | "history_reference_only";
};
```

The real type can differ, but these concepts should be present.

## Agent Prompt Contract

When Canvas lane awareness is attached:

- Refer to lanes as `Live`, `A`, `B`, and `C`, not internal artifact names.
- Treat `Live` as source of truth unless the user explicitly asks to revise or inspect a proposal lane.
- Treat applied proposal sets as comparison history, not active routing.
- If the selected lane is `A/B/C` and the user says `change this`, prefer revising that proposal lane.
- If the selected lane is `A/B/C` and the user says `build`, `implement`, `make real`, or drags A into Live, prefer building the selected lane into Live.
- If the selected lane is `Live` and the user asks a vague visual question, ask through the decision strip before creating proposal artifacts.
- If the request conflicts with lane state, ask one concise product question instead of inventing a branch.
- Never mention workspace folders, hidden prompt payloads, proposal file paths, internal JSON, or resolver names.

## UI / UX Contract

- Do not change the P27-cool header contract.
- Do not add visible debug chips or lane-state panels.
- The visible proof of this work is behavioral:
  - the agent answers and routes according to the lane the user is viewing;
  - above-composer decision strips use current lane wording;
  - marks and `Change N` chips remain compact;
  - after building A into Live, new unspecified requests route from Live.

## Architecture Direction

- Derive awareness from the existing Canvas action/state resolver and lane adapters, not from a new hardcoded prompt patch.
- Keep a single canonical lane state model for:
  - prompt context;
  - resolver fixtures;
  - header state where practical;
  - future P29 lane observation.
- Attach awareness only when the active project/thread has meaningful Canvas state or the request is Canvas-relevant.
- Keep the payload compact and bounded. Prefer product summaries over raw file/path data.
- Preserve app-server boundaries: this is desktop prompt/routing context, not a new agent runtime.

## Implementation Phases

### Phase 1 - State Inventory

- Audit current sources of Canvas state:
  - live preview status;
  - plan/live-overlay proposals;
  - saved mockup sets;
  - code-backed proposal sets;
  - active versus comparison-history pointers;
  - selected inspector lane;
  - composer/sent visual contexts.
- Identify the smallest common lane model that can describe all active surfaces.

### Phase 2 - Lane Awareness Builder

- Implement one builder that returns the compact lane awareness payload.
- Ensure single proposal is `A`, never `Preview`.
- Include selected lane, backing kind, lifecycle, mark/change availability, route, viewport, and build meaning.
- Sanitize paths and internal IDs before prompt usage.

### Phase 3 - Prompt Integration

- Attach lane awareness to Canvas-relevant sends.
- Include it in the Canvas operating context and decision-strip context.
- Avoid repeating large static instructions every turn; send small factual state plus the existing Canvas operating prompt where needed.
- Make sure visible user text, titles, sidebar rows, and Activity stay clean.

### Phase 4 - Resolver Fixture Tests

- Add fixtures for:
  - Live only, selected Live;
  - Live plus A live-overlay proposal;
  - Live plus A/B/C code-backed proposals;
  - blank project plus saved mockup A;
  - applied A/B/C visible as history;
  - moved `Change 1` attached to A;
  - selected Live with old proposal history visible.
- Assert canonical actions resolve from state, not prompt-word hardcoding.

### Phase 5 - Adapter Tests

- Verify the prompt wrapper receives the same lane facts the header would show.
- Verify old applied proposals are marked history-only.
- Verify selected lane changes when the user switches Live/A/B/C.
- Verify saved mockup A and live-overlay A produce different backing kinds but the same user-facing lane identity.

### Phase 6 - Dogfood

- In an existing app, create one live-overlay A and ask vague follow-ups from A and from Live.
- Build A into Live, keep comparison visible, then ask a new vague placement question; verify routing starts from Live.
- In a blank project, ask for a quick mockup only; verify A opens as mockup and Live appears only as stopped target.
- Move a `Changes` highlight and send a compact `Change 1` chip with a natural instruction; verify the agent knows which lane it belongs to.

## Relationship To P29

P27 Agent Aware is a dependency for P29.

- This plan answers: `What does the agent know about Live/A/B/C before acting?`
- P29 answers: `How can the agent visually inspect or interact with Live/A/B/C?`

P29 should consume the same canonical lane state for lane resolution, but it should not own the prompt/routing awareness work.

## Out Of Scope

- Browser screenshots, DOM inspection, console capture, clicking, typing, or visual diffing. Those belong to P29.
- P27b legacy deletion.
- Header UI changes.
- More than three proposal lanes.
- A visible Canvas debug panel.
- Exposing internal proposal storage or workspace mechanics.

## Success Criteria

- The agent receives compact, accurate Canvas lane state on Canvas-relevant turns.
- The agent can distinguish Live, active A/B/C, and comparison-history A/B/C.
- The agent can distinguish live-overlay, saved-mockup, and code-backed backing kinds without exposing them to the user.
- Follow-up routing works from the selected lane unless the user clearly changes topic.
- `make A real`, `update A`, `use Live`, and moved `Change 1` prompts resolve consistently in fixtures and dogfood.
- P29 can later reuse the same lane state for Observer/Actor lane resolution.
