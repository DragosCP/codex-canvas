# Canvas Slots Product Direction

## Status

This is a product direction note, not implemented behavior. It captures the discussion about replacing the current `Live / Draft / A / B / C` mental model with a simpler slot-based Canvas model.

## Core Thesis

The user should not have to understand separate product modes such as Live, Draft, A/B/C, mockups, wireframes, proposal lanes, or preview artifacts.

The primary visual model should be:

```text
SLOT1 + SLOT2
```

Each slot is a visual workbench. A slot can contain different kinds of material depending on the user's request and the project state.

Examples:

```text
SLOT1: Live app
SLOT2: Draft feature

SLOT1: Wireframe
SLOT2: Detailed mockup

SLOT1: Existing app
SLOT2: New workflow with fake data
```

The product concepts become stable:

- Canvas
- Slot
- Slot occupant
- Decision space above the composer
- Composer

Live, Draft, mockup, wireframe, and proposal options become slot occupant types, not primary product surfaces.

## Slot Occupants

A slot can hold:

- Empty state
- Live app
- Draft app or feature attempt
- Mockup
- Wireframe
- Screenshot/reference
- External URL
- Failed or blocked attempt

The visible slot label should stay stable, such as `SLOT1` and `SLOT2`, with a secondary occupant label:

```text
SLOT1 - Live
SLOT2 - Workflow Draft
```

This lets the user speak naturally:

```text
Put a wireframe in @SLOT1.
Try the workflow in @SLOT2.
Make @SLOT2 more detailed.
Build @SLOT2.
Compare @SLOT1 and @SLOT2.
```

The user may mention `@SLOT1` or `@SLOT2` anywhere in the chat input: beginning, middle, or end. The agent should see those mentions, the current Canvas state, and the available slot occupants.

## Parallel View

The user should be able to view slots side by side.

The parallel view is the main comparison primitive. It replaces the need for hardcoded `Live | Draft` and `A | B | C` UI concepts at the product level.

If the user wants two mockups, the slots can show two mockups.
If the user wants a live app and a fake-data feature preview, the slots can show Live and that feature preview.
If the user wants wireframe versus detailed mockup, the slots can show those.

## Agent View Of Canvas

Every relevant agent turn should receive compact Canvas state:

```text
Canvas:
- SLOT1: Live app, running, route /dashboard
- SLOT2: Empty
- Selected slot: SLOT1
- User marks: Mark 1 on SLOT1 header
- User mentioned slots: @SLOT2
```

The agent should reason against the slots directly, not against internal artifacts.

## Questionnaire Direction

The questionnaire above the composer should not be hardcoded as `Draft versus A/B/C` or any fixed product ladder.

It should be an agent-authored decision surface that appears only when the next step is genuinely ambiguous and the product allows the agent to ask.

The UI surface is simple:

- It appears in the empty space above the composer.
- Each decision is displayed as one row.
- A questionnaire can contain 1, 2, 3, or 4 decision rows.
- Clicking a row fills the composer with that row's prompt.
- The user can edit the filled composer text before sending.

Example:

```text
What should I create?

1. I want a wireframe
2. I want a detailed mockup
3. I want to view the feature inside the existing app, with fake data
4. I want a detailed feature workflow inside the existing app, with fake data
5. Implement it now
```

Note: the exact max row count needs a product decision. The discussion allowed 1 to 4 rows, while the example used 5 choices. If 5 is desired, make that explicit rather than letting the UI drift.

## Governed Question Asking

The agent should not have an unconditional free-form questionnaire tool. If it does, it will over-ask.

The better split is:

- The product controls when asking is allowed.
- The agent authors the question and decision rows.

The agent should be allowed to ask only when:

1. Acting would overwrite, hide, or replace something valuable.
2. Acting would commit to a materially different artifact type, such as wireframe versus mockup versus in-app fake workflow versus real implementation.
3. More than one slot is a plausible target and there is no safe default.
4. The request is underspecified enough that a wrong guess would waste meaningful time.
5. The action is irreversible or close to irreversible, such as building/applying to the real project.

The agent should not ask merely because it is uncertain. It should ask when the user is choosing between materially different futures.

## Slot Target Defaults

The product should define safe defaults so the agent does not ask `SLOT1 or SLOT2?` too often.

Proposed defaults:

```text
If the user mentions @SLOT1 or @SLOT2:
  use that slot.

If the user marked or selected a slot and says "this":
  use that slot.

If one slot is empty:
  use the empty slot.

If both slots are occupied and one is Live:
  use the non-Live slot for new experiments.

If both slots are occupied and replacing is non-destructive:
  park the previous occupant and use the default working slot.

If both slots are occupied, both are pinned/protected, and target is unclear:
  ask.

If building/applying and more than one buildable occupant exists:
  ask or require an explicit @SLOT mention.
```

Parking matters. Slot replacement should not destroy useful work. If older slot contents are parked into history, the agent can choose a sensible default more often without asking.

## Questionnaire Tool Shape

A possible governed tool shape:

```ts
requestDecision({
  reasonKind:
    | "artifact_type"
    | "slot_target"
    | "overwrite_protection"
    | "build_commitment"
    | "scope_ambiguity",
  whyAgentCannotSafelyChoose: string,
  defaultActionIfDenied: string,
  rows: [
    {
      label: string,
      description?: string,
      promptToFillComposer: string,
    },
  ],
});
```

The host can validate the request.

Examples:

- If the agent asks which slot to use while one slot is empty, the host can deny and instruct it to use the empty slot.
- If the agent asks whether to create a wireframe, detailed mockup, in-app fake workflow, or real implementation for a vague early-project request, the host can allow it.
- If both slots are protected and the user did not name a target, the host can allow a slot-target decision.

## Example Flow

State:

```text
SLOT1: Live
SLOT2: Draft
User: "Can you make a new page?"
```

The agent can ask an artifact-type question because the request has a real product fork:

```text
1. Wireframe
2. Detailed mockup
3. Feature in the app with fake data
4. Detailed workflow in the app with fake data
5. Implement it now
```

If the user chooses the detailed workflow path, the product should usually avoid a second slot question. It should use the safe default, likely `SLOT2`, unless `SLOT2` is protected, currently generating, explicitly pinned, or both current slots must remain visible.

Only then should the agent ask:

```text
1. Put it in @SLOT1
2. Put it in @SLOT2
3. Let Codex choose
```

## Product Principle

Do not ask because the agent is uncertain.

Ask because the user is choosing between materially different futures.

## Why This Is Cleaner

The current product direction has accumulated many overlapping concepts:

- Live
- Draft
- A/B/C
- Mockup Preview
- App Preview
- Proposal lanes
- Code-backed workspaces
- Visual patches
- Decision strips

The slot model keeps the useful capabilities but hides the taxonomy.

The user sees two visual workbenches. The agent decides what to put in them.

## Open Product Questions

- Are there exactly two slots, or can advanced comparison temporarily add more?
- Is the maximum questionnaire row count 4, or should 5 be allowed for cases like wireframe, mockup, in-app preview, detailed workflow, implement now?
- Should slot occupants have names beyond the stable slot labels, such as `Checkout flow` or `Settings mockup`?
- What does pinning/protecting a slot look like?
- Where does parked slot history live?
- Should `Build @SLOT2` always apply directly, or should some occupants require an agent integration turn first?
- How much should the agent be allowed to choose versus the host enforcing deterministic slot defaults?

## Implementation Implication

If this direction is adopted, future plans should avoid deepening the `Live / Draft / A / B / C` product taxonomy.

Instead, they should converge the existing mechanics into slot primitives:

- Slot state
- Slot occupant backing type
- Slot preview session
- Slot diff/change set
- Slot build action
- Governed agent-authored decisions

Existing Draft, mockup, proposal, and preview systems can remain as backing implementations while the product UI and agent-facing contract move toward `SLOT1 + SLOT2`.
