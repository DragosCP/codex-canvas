# Canvas Slots V2 Prompt Fit Analysis

## Status

This continues `docs/Canvas-Slots.md`. It analyzes how the existing Draft, A/B/C, mockup, wireframe, live overlay, and questionnaire prompts fit into a future `SLOT1 + SLOT2` Canvas model.

This is not an implementation plan. It is a product and prompt architecture note.

## Summary

The existing prompts already contain useful behavior, but they are organized around product modes:

- Live Canvas
- Draft Canvas
- Proposal Canvas
- A/B/C options
- saved mockups/wireframes
- live overlay proposals
- decision strips

The slot direction wants a different organizing principle:

```text
Canvas has SLOT1 and SLOT2.
Each slot has an occupant.
The occupant type determines the backing implementation.
```

So the existing prompts should not be discarded. They should be lowered into backing-specific prompt modules behind a slot-first agent contract.

## Existing Prompt Stack

### Canvas Operating Prompt

Current shape:

- Defines Canvas as `Live Canvas`, `Draft Canvas`, `Proposal Canvas`, and `Agent Question Placeholder`.
- Tells the agent to prefer Draft for one existing-app visual change.
- Tells the agent to use A/B/C only for alternatives.
- Treats proposal surfaces as `Live`, `A`, `B`, and `C`.

What fits the slot model:

- It already separates visual work from normal implementation.
- It already says not every visual request should create A/B/C.
- It already recognizes that the agent needs current visual state and marks.
- It already hides internal payloads from the user.

What does not fit:

- `Live`, `Draft`, and `Proposal` are primary product concepts.
- `A/B/C` is baked into the resolver type system as Canvas surfaces.
- The prompt treats comparison as option labels, not as slot occupants.
- It has no notion of `@SLOT1`, `@SLOT2`, selected slot, protected slot, or target-slot defaults.

Slot reinterpretation:

```text
Live Canvas -> a live-app occupant in a slot
Draft Canvas -> a workspace-backed attempt occupant in a slot
Proposal Canvas -> one or more proposal occupants, or a compare occupant, in slots
Agent Question Placeholder -> governed decision space above the composer
```

## Draft Prompts

Current Draft prompt strengths:

- Draft is one temporary feature inside the existing app.
- Live source remains unchanged until `Build this`.
- The agent must preserve the existing app shell and normal workflow.
- The draft must be feature-in-place, not a standalone demo.
- Fake data/local adapters are allowed for the requested feature only.
- The final response must name the entry point, temporary boundary, and real integration replacement.

These rules fit the slot model very well.

In slot language, Draft is not a product mode. It is one possible slot occupant:

```ts
{
  slotId: "SLOT2",
  occupantKind: "workspace_attempt",
  displayName: "Workflow Draft",
  sourceBase: "SLOT1" // often the live app occupant
}
```

What should survive:

- Source safety.
- Feature-in-place behavior.
- Temporary adapter rules.
- Product-facing final response.
- Validation against standalone demo pages.

What should change:

- Replace `Draft` as a primary visible surface with `SLOT2 - Workflow Draft`.
- Replace `Live as the source app state` with `source slot/base occupant`.
- Replace `Build this` ambiguity with `Build @SLOT2` or a build action on the selected slot.
- Make revision routing slot-targeted: `Revise @SLOT2`, not "revise the active Draft."

Recommended future prompt name:

```text
slotWorkspaceAttemptPrompt
```

### Draft System-Front Prompt Inventory

Important correction: the Draft path has a substantial prompt prefix before the visible user request. It is not a separate OpenAI `system` role prompt in the code path inspected here; it is a hidden user-message front matter block assembled before `User request:` in `featureDraftWorkspacePrompt` and `featureDraftRevisionPrompt`.

Creation prompt order:

```text
[Codex Feature Draft Context]

Draft operating prompt

Desktop state

Draft rules

Experiential Draft contract

Feature-in-place Draft contract

Draft placement preflight

Draft final response contract

User request
```

Revision prompt order:

```text
[Codex Feature Draft Context]

Draft operating prompt

Desktop state for active Draft

Draft revision rules

Experiential Draft contract

Feature-in-place Draft contract

Draft placement preflight

Draft final response contract

User request
```

What the system-front prompt currently does:

- Establishes Draft as one temporary feature inserted into the existing app.
- Keeps Live source unchanged until explicit build.
- Forbids comparison artifacts, standalone review surfaces, and decision questionnaires during a Draft turn.
- Requires the existing app entry point and shell.
- Allows only the requested feature to use temporary local adapters, component state, prop wiring, or visual-only UI changes.
- Requires a real product workflow outcome, not just configuration or explanation.
- Forces placement preflight before meaningful edits.
- Blocks standalone demo pages, preview routes, wildcard route takeovers, and app-shell replacement.
- Requires the final response to name `Entry point`, `Temporary feature boundary`, and `Build this should replace`.

How this fits Slots:

The Draft system-front prompt is one of the strongest assets for the slot model. It should survive almost intact, but its nouns should shift:

```text
Draft -> slot workspace attempt
Live -> source slot/base occupant
Build this -> Build @SLOTn
active Draft -> selected/target slot occupant
```

Slot-shaped rewrite direction:

```text
Slot workspace attempt operating prompt:
- This turn creates or revises one temporary occupant in the target slot.
- The source slot remains unchanged until the user builds the target slot.
- Work only in the target slot's backing workspace.
- Preserve the source app shell, workflow, components, and route shape unless the user explicitly asks for a standalone artifact.
- The target slot must show the requested feature inside the normal product journey.
- Temporary adapters/local state are allowed only for this requested occupant.
- Final response must name the source entry point, temporary slot boundary, and build/integration policy.
```

Product implication:

This prompt should become the backbone of `slotWorkspaceAttemptPrompt`. The migration should not flatten it into a generic slot instruction. Its hard-won constraints are exactly what prevent slot occupants from becoming standalone demos or decorative mockups when the user wanted an in-app workflow.

## A/B/C Runnable Proposal Prompts

Current A/B/C code proposal strengths:

- The desktop prepares isolated option folders.
- The agent works only inside those folders.
- The live project is protected.
- Each option becomes a runnable candidate app.
- The final response hides workspace paths and uses product-facing option names.
- Build-selected can use a selected option as source/reference.

These rules are still valuable as an implementation backing.

What does not fit the slot model:

- Visible identity is hardcoded to `Option A/B/C`.
- The resolver supports exactly `Live | A | B | C`.
- The comparison model allows three options, while the slot thesis starts with two visible workbenches.
- Follow-up language such as `put it in C` is option-label language, not slot-target language.
- The prompts assume an active proposal set rather than a stable Canvas with occupied slots.

Slot reinterpretation:

```text
Option A -> occupant in SLOT1 or SLOT2
Option B -> occupant in SLOT1 or SLOT2
Option C -> either unsupported in two-slot mode, parked history, or an advanced compare occupant
```

The strongest two-slot version is:

```text
SLOT1 - Option direction 1
SLOT2 - Option direction 2
```

If the user asks for three directions, the product needs a decision:

- allow a temporary third slot,
- create a compare-set occupant inside one slot,
- or ask the user to choose two directions to view first.

Recommended future prompt name:

```text
slotRunnableAttemptPrompt
```

or, if multiple alternatives remain grouped:

```text
slotCompareSetPrompt
```

## Saved Mockup And Wireframe Prompts

Current saved preview artifact strengths:

- Good fit for early projects before a live app exists.
- Can create one, two, or three saved review artifacts.
- Keeps real app implementation files unchanged.
- Names options after user-facing workflow concepts.
- Can include local interactions and highlights.

This maps naturally to slots.

Slot reinterpretation:

```text
SLOT1 - Wireframe
SLOT2 - Detailed mockup
```

or:

```text
SLOT1 - Mockup direction 1
SLOT2 - Mockup direction 2
```

What should change:

- Storage can still use internal artifacts, but visible labels should be slot labels plus occupant names.
- The prompt should receive a target slot or target slots.
- It should not require A/B/C labels for user-facing identity.
- The decision surface should ask artifact-type questions only when the user has not made the artifact type clear.

Recommended future prompt name:

```text
slotArtifactPrompt
```

## Live Overlay Proposal Prompt

Current live overlay strengths:

- Lightweight review path for small visual changes.
- Does not edit app files.
- Uses the live app as base.
- Provides highlight metadata for `Show changes`.
- Avoids injecting visible Codex proposal chrome into the app.

This can fit slots, but only if renamed conceptually.

In the slot model, a live overlay is not a proposal lane. It is an occupant that renders a temporary visual state using another slot as base:

```ts
{
  slotId: "SLOT2",
  occupantKind: "overlay_attempt",
  sourceBase: "SLOT1",
  buildable: true
}
```

What should change:

- Replace variant IDs `A/B/C` with slot occupant IDs.
- Replace `proposal metadata` language with `slot overlay attempt`.
- Keep highlights as slot-level change marks.
- Keep the rule that no Codex proposal chrome appears inside the user's app.

Recommended future prompt name:

```text
slotOverlayAttemptPrompt
```

## Questionnaire Prompt

Current questionnaire strengths:

- The desktop asks the model to author the question.
- The turn is decision-only.
- The user sees product-facing choices above the composer.
- Clicking a choice fills the composer for the next turn.

This strongly fits the slot direction.

Current gaps:

- The allowed `canvasAction` values are mode-specific: `show_draft`, `show_preview`, `show_options`, etc.
- The prompt says use 2 or 3 choices, while the slot discussion allows 1 to 4 rows and has examples with 5 choices.
- The questionnaire decides between Canvas modes, not between user futures.
- There is no governed ask policy in the prompt itself.
- There is no target slot, occupant kind, overwrite status, or default action encoded in each row.

Slot reinterpretation:

The questionnaire should become a governed decision request. The host decides whether asking is allowed; the agent authors rows.

Future row shape:

```ts
{
  label: string,
  description?: string,
  promptToFillComposer: string,
  targetSlot?: "SLOT1" | "SLOT2" | "agent_choose",
  occupantKind?: "wireframe" | "mockup" | "workspace_attempt" | "overlay_attempt" | "direct_build",
  reasonKind?: "artifact_type" | "slot_target" | "overwrite_protection" | "build_commitment" | "scope_ambiguity"
}
```

The prompt should not say "choose Draft or A/B/C." It should say "ask only when the user is choosing between materially different futures."

Recommended future prompt name:

```text
slotDecisionPrompt
```

## Build And Revision Prompts

Current behavior is inconsistent:

- Draft `Build this` directly applies the draft workspace to Live.
- A/B/C `Build selected` stages an implementation turn through the composer.
- Saved mockup review asks the agent to decide whether to revise the artifact or implement.
- Live overlay accept prompts convert visual guidance into source edits.

In the slot model, the visible action should be unified:

```text
Build @SLOT2
Revise @SLOT2
Park @SLOT2
Discard @SLOT2
```

But the backing behavior can differ by occupant:

```text
visual-only workspace attempt -> direct apply may be okay
fake-data workflow attempt -> agent integration turn may be required
mockup/wireframe -> implementation turn required
overlay patch -> convert to source edits
live app -> direct implementation in Live
```

The key product requirement is that the build policy belongs to the occupant metadata, not to whether the UI happened to call the thing Draft or A/B/C.

## Proposed Slot-First Prompt Contract

Every visual turn should start from a compact slot state:

```text
Canvas slots:
- SLOT1: Live app, running, route /dashboard, buildable=false, protected=true
- SLOT2: Empty
- Selected slot: SLOT1
- Mentioned slots: @SLOT2
- Attached marks:
  - Mark 1 on SLOT1, route /dashboard, viewport desktop
```

The agent should resolve work in this order:

1. Target slot.
2. Desired occupant type.
3. Backing strategy.
4. Whether a governed decision is needed.
5. Build/revise/park/discard action.

Target slot defaults:

```text
Explicit @SLOT mention wins.
Selected/marked slot wins for "this" references.
Use an empty slot for new review work.
If one slot is Live and the other is non-Live, use the non-Live slot for new experiments.
Park replaceable occupants rather than asking.
Ask only if both plausible targets are protected, busy, buildable, or valuable to preserve.
```

## Compatibility Layer

The current prompt modules can be preserved behind a slot adapter:

```text
slotArtifactPrompt
  -> current savedPreviewArtifactPrompt

slotOverlayAttemptPrompt
  -> current liveOverlayProposalPrompt

slotWorkspaceAttemptPrompt
  -> current featureDraftWorkspacePrompt

slotRunnableAttemptPrompt / slotCompareSetPrompt
  -> current codeProposalWorkspacePrompt

slotDecisionPrompt
  -> current canvasQuestionPrompt, with a new governed schema

slotReviewPrompt
  -> current featureDraftRevisionPrompt, codeProposalReviewPrompt, savedMockupReviewPrompt
```

This preserves the hard-won instructions while changing the product grammar.

## Required Prompt Changes

### 1. Replace surface names

Current:

```text
baseSurface: Live
targetSurface: A
selected option: Option B
```

Future:

```text
sourceSlot: SLOT1
targetSlot: SLOT2
selected occupant: Settings workflow mockup
```

### 2. Replace A/B/C identity with slot identity

A/B/C can remain internal file labels if useful, but they should not be the user's primary handles.

The user's handles are:

```text
@SLOT1
@SLOT2
```

### 3. Move backing choice out of user-facing language

The agent can choose:

- artifact
- overlay
- workspace attempt
- runnable candidate
- direct build

The user should experience:

```text
I put the wireframe in @SLOT1.
I put the detailed workflow in @SLOT2.
```

### 4. Add governed decision metadata

Decision rows should carry why the question is allowed:

```text
artifact_type
slot_target
overwrite_protection
build_commitment
scope_ambiguity
```

The host should be able to deny weak questions and force a safe default.

### 5. Unify build language

Use slot build language everywhere:

```text
Build @SLOT2
```

Then dispatch by occupant build policy:

```text
direct_apply
agent_integrate
convert_overlay_to_code
implement_from_artifact
```

## Fit Score By Existing Prompt Family

```text
Draft prompts: high fit
Saved mockup/wireframe prompts: high fit
Questionnaire prompt: medium-high fit, needs governed schema
Live overlay prompt: medium fit, needs slot occupant framing
Code-backed A/B/C prompts: medium fit, strong backend but label-bound UX
Canvas operating prompt/resolver: low-medium fit, needs type-system rewrite from surfaces to slots
```

## Product Recommendation

Do not rewrite the successful backing prompts first.

Instead, introduce a slot-first contract above them:

```text
User language -> slot router -> occupant/backing prompt -> slot preview -> slot build policy
```

The product should converge on this visible model:

```text
SLOT1 + SLOT2
Decision space when needed
Composer
```

The implementation can still use draft workspaces, proposal workspaces, saved mockups, live overlays, and visual patches internally. The user and agent-facing contract should increasingly talk in slots, occupants, and build policies.

## Open Questions For V3

- Are two slots a hard product limit, or can a compare-set occupant temporarily contain more than two directions?
- Should `Live` default to `SLOT1`, or can Live move between slots?
- Should protected/pinned slots be visible as lock icons, labels, or only enforced by default behavior?
- Should `Build @SLOT2` ever direct-apply fake-data workflow code, or always route through an integration turn?
- What is the exact maximum decision rows: 4 or 5?
- How much A/B/C compatibility should remain for existing persisted proposal sets?
