# P28 - Canvas Mode And Visual Plan Evidence

## Status

- Draft plan.
- No implementation has started.
- Builds on P27 by defining how users enter, stay in, and reason through Canvas across follow-up messages and Plan Mode.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`
- `plans/done/P24-proposal-preview-agent-marks-and-routing.md`
- `plans/done/P25-live-overlay-and-temp-code-proposals.md`
- `plans/done/P25b-code-backed-proposal-workspaces.md`
- `plans/done/P26b-composer-image-attachments.md`

## Non-Negotiable Guardrail

- Do not change the Canvas v2 preview header buttons, order, grouping, labels, visibility, compare/lane placement, or overflow behavior.
- This plan may touch composer mode state, chat chips, plan context, prompt routing, and visual reference persistence.
- The locked header contract remains exactly as recorded in `docs/UI-UX.md` for this plan's scope. If P27-cool lands first, P28 should consume the lane-header contract rather than reintroducing the old one-row header.

## Problem

P27 makes Canvas a first-class capability, but capability alone does not solve conversational continuity.

Users will not reliably repeat `@Canvas` or restate the full visual context on every message. Once they are talking about a visible proposal, they will naturally say things like:

- `I don't like it there, put it up top.`
- `Put it in C.`
- `Use the one from B.`
- `Make that smaller.`
- `Build it now.`

Those messages only make sense if Codex remembers the active Canvas context: Live versus Preview, selected option, current proposal set, user marks, agent change marks, route, viewport, and previous plan/recommendation.

Plan Mode adds another problem: a written plan may depend on a visual proposal and several chips. If the plan is implemented later, Codex must receive the same visual evidence the user approved, not whatever Canvas happens to show at that later moment.

## Goal

Add a Canvas conversation mode and visual evidence model so Canvas behaves like a persistent visual discussion surface.

The desired behavior:

1. User can explicitly invoke Canvas with a composer toggle or `@Canvas`.
2. Once Canvas is involved, follow-up messages inherit the active Canvas context.
3. Chips are Visual References with full backing context, not just thumbnails.
4. Plan Mode can pin visual references and proposal states as plan evidence.
5. Implementation from a plan receives the approved visual evidence, marks, and proposal context.

## User Workflow Contract

### 1. Canvas Mode

- Add a composer-level Canvas Mode concept.
- When Canvas Mode is on, user messages are interpreted against the current Canvas state unless the user clearly changes topic.
- Canvas Mode does not replace Plan Mode:
  - Canvas Mode means "talk visually / use the preview context."
  - Plan Mode means "do not implement until accepted."
- Canvas Mode can coexist with Plan Mode.
- The UI placement of the toggle is not specified in this plan beyond composer ownership; do not alter the Canvas preview header.

### 2. `@Canvas` Call-Out

- `@Canvas` is typed intent, not an attachment chip.
- It can appear anywhere in the user message, not only at the start.
- `@Canvas` means: use Canvas for this request if the request is visual/workflow/layout/placement related.
- `@Canvas` may enable or attach Canvas context for the current send, but it is not the whole workflow.
- After `@Canvas` starts a visual conversation, follow-up messages should inherit Canvas context even if `@Canvas` is omitted.

### 3. Canvas Continuity

- If there is an active Canvas proposal or selected visual reference in the thread, follow-ups should resolve natural references:
  - `it`, `that`, `there`, `up top`, `the one from B`, `put it in C`, `try another`, `build it`.
- `put it in C` means:
  - if A/B exists and C is free, add or update Option C beside A/B using the currently discussed proposal/change;
  - do not create a separate one-option proposal unless the user asks for a fresh proposal set.
- `put it up top` means:
  - revise the active proposal/change location in Canvas;
  - do not implement Live unless the user explicitly asks to build.
- Continuity ends when:
  - the user builds/accepts and the implementation turn finishes;
  - the user dismisses the proposal;
  - the user switches to a new unrelated topic;
  - the user opens a different proposal set or project.

### 4. Visual References

- A chip should be backed by a Visual Reference.
- The chip is the visible thumbnail; the Visual Reference is the full context behind it.
- Visual References can represent:
  - user mark;
  - agent change mark;
  - plan recommendation area;
  - proposal snapshot;
  - before/after screenshot;
  - selected option state.
- A Visual Reference should include, when available:
  - project ID and path;
  - thread ID and turn ID;
  - Canvas mode/source: Live, Preview, A, B, or C;
  - proposal set ID and option ID;
  - route/URL and viewport;
  - screenshot or thumbnail path/data URL;
  - rectangle bounds;
  - user note or agent note;
  - DOM/source metadata such as `data-canvas-id`, component name, source file, text, and computed style;
  - created timestamp;
  - superseded/revised state.

### 5. Canvas Mode + Plan Mode

- When both Canvas Mode and Plan Mode are active, plans should be visual-evidence-aware.
- A UI/workflow plan should pin the visual references it depends on.
- A plan can include:
  - written recommendation;
  - user flow;
  - risk/tradeoff;
  - linked Visual References;
  - proposal option ID;
  - user marks and adjusted agent marks.
- The plan text should make those references visible in product language, such as:
  - `Visual reference: Preview mark 1 - settings button placement`
  - `Visual reference: Option B change 2 - bottom sheet state`
- If the user revises a mark or proposal after the plan is written, the plan should either:
  - update/supersede the pinned visual reference; or
  - create a revised plan/recommendation.

### 6. Implementation From Plan

- Implementing an accepted visual plan must send:
  - the visible plan text;
  - the pinned Visual References;
  - the selected proposal state;
  - relevant user/agent marks;
  - route and viewport context;
  - source metadata when available.
- Implementation must not rely only on current Canvas state, because the user may have changed Canvas after the plan was written.
- The agent should build from the approved visual evidence and then verify Live against that evidence.

## Proposed Technical Direction

### Canvas Conversation State

Track thread-scoped Canvas conversation state:

- canvas mode on/off;
- active proposal set ID;
- active option ID;
- active visual reference IDs;
- last visual subject;
- continuity expiry/supersession state;
- plan-mode association when applicable.

This state should be project/thread scoped and must not leak across projects.

### Visual Reference Model

Introduce a normalized Visual Reference model that extends today's composer contexts and sent context presentation.

Conceptual shape:

```ts
type VisualReference = {
  id: string;
  kind:
    | "user_mark"
    | "agent_change_mark"
    | "plan_recommendation"
    | "proposal_snapshot"
    | "before_after";
  projectId: string;
  threadId: string;
  turnId?: string;
  proposalSetId?: string;
  optionId?: "Preview" | "A" | "B" | "C" | "Live";
  route?: string;
  url?: string;
  viewport: { width: number; height: number };
  rect?: { x: number; y: number; width: number; height: number };
  thumbnail?: { path?: string; dataUrl?: string };
  note?: string;
  source?: {
    canvasId?: string;
    component?: string;
    sourceFile?: string;
    text?: string;
    computedStyle?: Record<string, string>;
  };
  createdAt: number;
  supersededBy?: string;
};
```

The exact persisted schema can be smaller in the first slice, but the product model should treat chips as references, not images.

### Prompt Context

- If Canvas Mode is on, attach compact Canvas context to sends.
- If a message follows an active Canvas proposal, attach the active proposal and visual references even without `@Canvas`.
- If Plan Mode is on, attach pinned plan visual evidence, not just the latest live Canvas state.
- Keep visible chat text clean. Internal Visual Reference payloads must not leak into chat bubbles, thread titles, or sidebar rows.

### Agent Behavior

When Canvas context is present, the agent should:

- answer based on the Canvas state and visual references;
- update Canvas proposal(s) for visual requests;
- explain the recommendation in terms of user flow and visual references;
- ask a concise question only when the reference is ambiguous;
- avoid direct implementation until the user accepts/builds or Plan Mode allows it.

## Implementation Phases

### Phase 1 - Canvas Mode Product Contract

- Define Canvas Mode state and activation rules.
- Decide how `@Canvas` interacts with Canvas Mode:
  - one-message force;
  - turn-on shortcut;
  - or both.
- Keep Canvas header unchanged.

### Phase 2 - Visual Reference Data Model

- Normalize existing mark chips and agent change chips into Visual References.
- Preserve existing composer/chat chip appearance.
- Store enough context to reconstruct the visual state later.
- Add project/thread scoping guards.

### Phase 3 - Continuity Routing

- Route follow-ups like `move it up`, `put it in C`, and `use B` through active Canvas state.
- Add tests for inherited Canvas context without repeated `@Canvas`.
- Prevent stale proposal sets from catching unrelated new topics.

### Phase 4 - Plan Evidence

- Let Plan Mode pin Visual References.
- Show linked visual references in plan-facing copy without raw payloads.
- Supersede/update plan evidence when marks or proposal states are revised.

### Phase 5 - Implementation Handoff

- Ensure accepted plans/builds carry pinned visual evidence to the implementation turn.
- Verify Live against the approved evidence after implementation.
- Make mismatch reporting explicit if Live differs materially from the approved preview.

### Phase 6 - Verification

- Dogfood at least two flows:
  - Canvas Mode only: create proposal, follow up without `@Canvas`, revise, build.
  - Canvas Mode + Plan Mode: create visual plan, pin chips, revise a mark, accept, implement.
- Add regression tests:
  - `@Canvas` can appear anywhere in the prompt;
  - follow-ups inherit Canvas state;
  - chips have Visual Reference backing data;
  - plan implementation uses pinned evidence, not current stale Canvas state;
  - no Canvas header changes.

## Out Of Scope

- Changing the Canvas preview header.
- Turning Canvas into a full drag-and-drop visual editor.
- Arbitrary movable DIVs as the first implementation.
- Replacing Plan Mode.
- Building a separate visual design tool.

## Open Questions

- Should Canvas Mode be a visible composer toggle from the first slice, or should `@Canvas` plus inferred continuity ship first?
- How long should Canvas continuity persist before it becomes stale?
- How should the UI show that a plan has pinned visual evidence without making the plan card heavy?
- Should a Visual Reference snapshot be stored as a file path, data URL, or app-owned blob record?

## Success Criteria

- Users do not need to repeat `@Canvas` during a visual back-and-forth.
- Plan Mode can produce and preserve visual evidence through chips.
- A later implementation turn receives the visual story the user approved.
- Chips remain simple visually but have enough backing context for the agent.
- The Canvas header remains unchanged.
