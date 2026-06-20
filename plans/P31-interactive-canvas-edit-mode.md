# P31 - Interactive Canvas Edit Mode

## Status

- Draft plan, not started.
- Goal: let the user visually shape UX intent by manipulating semantic element proxies over a frozen screenshot, without dragging the live DOM or mutating source files.
- P31 depends on P30's Milestone 0 patch-runtime proof and P30b's target identity, target confidence, screenshot, proposal registry, and Canvas lane/backing model.
- Hard gate: do not implement full Edit Mode beyond Milestone 0.5 until P30 Milestone 0, relevant P30b target/proposal foundations, and P31 Milestone 0.5 pass on a real app.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P30-canvas-proposal-runtime-and-visualpatch-spine.md`
- `plans/wip/P30b-canvas-visualpatch-spine.md`
- `plans/P27-agent-aware-canvas-lane-state.md`
- `plans/P27b-canvas-legacy-cleanup.md`
- `plans/P29-canvas-browser-observer-and-actor.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`

## Product Thesis

Codex Local is a UX workbench for agent-built apps.

Agents can write code, but users still need a fast way to shape the experience: simplify a menu, move the primary action, hide advanced options, group related controls, reorder steps, or rename confusing labels.

Canvas Edit Mode should let the user edit UX intent visually without becoming a Figma clone or a fragile DOM editor.

```text
Chat explains.
Choices decide.
Canvas shows.
Edit Mode lets the user shape intent.
Codex turns accepted intent into clean implementation.
```

## User Workflow First

1. User opens `Live` or proposal `A`.
2. User clicks `Edit`.
3. Codex Local freezes the current view into a screenshot snapshot.
4. The app overlays recognized UI element proxies on top of the screenshot.
5. Only high-confidence elements receive edit handles.
6. User drags, renames, hides, promotes, groups, or reorders a proxy.
7. Dragging snaps to semantic relations such as `above`, `below`, `before`, `after`, `inside`, or `near`.
8. Codex Local records structured UX intent, not pixels.
9. The agent receives the intent and can revise the proposal, create a child proposal, or build an implementation candidate.
10. Live DOM and source files remain untouched until the user explicitly builds/promotes a result.

If the user edits `Live`, Codex Local first creates proposal lane `A` from the Live snapshot and applies edits there. Live remains the source of truth.

If the user edits proposal `A`, the edit creates a child/refined proposal rather than destructively replacing `A`.

```text
A
`-- A-edited
```

## Hard Boundary

Do not drag the live DOM.

P31 manipulates semantic proxies over a frozen screenshot. It must not:

- move live DOM nodes;
- reparent React components;
- mutate runtime app state;
- write implementation source files during edit mode;
- record absolute pixel-position edits as the primary intent;
- become a freeform Figma-style canvas.

The user should feel like they are moving the real button or panel. Mechanically, they are editing a proxy and recording UX intent.

## Intent, Not Pixels

Record semantic UX operations:

- Move this below that.
- Put this inside the card.
- Make this the primary action.
- Make this less prominent.
- Hide this advanced option.
- Rename this button.
- Group these together.
- Reorder these steps.

Avoid primary records like:

- `left: 80px`
- `top: 420px`
- absolute x/y position
- arbitrary resize dimensions

Bounds and screenshots may be stored as evidence, but implementation intent should be semantic.

## Element Model

Use P30b's `TargetResolution` and `ElementRef` foundation, extended into editable element proxies:

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
```

Confidence gates editability:

- High confidence: editable proxy handles are allowed.
- Medium confidence: selectable and markable, but verify before conversion.
- Low confidence: screenshot mark only.

High confidence generally requires stable `data-canvas-id`, known bounds, role, and ideally component/source metadata.

## User Edit Model

```ts
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

Avoid `resize_intent` in v1. Resize usually means a semantic change such as more prominent, less dominant, or more compact.

## Drag And Drop Rules

Free dragging is not the product.

Dragging should expose valid semantic drop targets:

- above this;
- below this;
- before this item;
- after this item;
- inside this panel;
- near this field;
- move to header;
- move to footer.

The resulting record should look like:

```ts
{
  op: "move_intent",
  elementId: "settings-button",
  relation: "below",
  targetElementId: "add-task-button"
}
```

Not:

```ts
{
  x: 124,
  y: 382
}
```

## Resolution Boundary

A recorded edit is not code yet.

At build time, classify it:

- same-parent reorder: may become a small order/layout change;
- rename/hide/promote: may become direct source edits when target confidence is high;
- `inside`: structural by default and should route to code-backed implementation unless the resolver can prove it maps to an existing safe slot/container;
- cross-parent move: route through code-backed implementation/proposal;
- reparenting, structural layout changes, component replacement: route through code-backed proposal or implementation.

Do not pretend a cheap VisualPatch can safely implement structural changes.

## Proposal Relationship

User-edited proposal variants are children, not destructive replacements.

- Editing `Live` creates proposal `A` or a new child proposal from Live.
- Editing `A` creates `A-edited`.
- User can return to original `A`.
- The agent can merge user intent back into the active proposal when asked.

The UI can later simplify labels, but internally preserve parent/child proposal identity.

## Edit Session Controls

Experimenting must feel reversible.

Edit Mode v1 must include:

- Cancel edit: closes the edit session without saving new intent.
- Undo last edit: removes the most recent semantic edit operation.
- Reset to original proposal: clears all edits from the current edit session.
- Save as refinement: stores the edit intent as a child/refined proposal.

These controls are part of the minimum usable loop, not polish.

## Milestone 0.5 - Validate Proxy Edit Mode

Prove the scary mechanic before building the full edit mode:

Hard gate: no full Edit Mode, multi-element editing, proposal-child UI, or build-resolution complexity should proceed until this passes on a real app.

1. Freeze a screenshot of one real running screen.
2. Recognize one real button with high confidence.
3. Overlay one draggable proxy on that button.
4. Recognize one target element.
5. Drag the proxy below the target.
6. Snap to relation: `below targetElementId`.
7. Record one `move_intent`.
8. Send that intent to the agent.
9. Confirm the agent reads it as: move this button below that element.
10. Confirm Live DOM and source files were untouched.

Exit criteria:

- One screenshot-backed edit session opens.
- One proxy is draggable.
- One semantic relation is recorded.
- The composer/agent receives product-facing intent, not raw pixels.
- No implementation source files change.

## Implementation Phases

### Phase 1 - Edit Mode Entry And Snapshot

- Add an `Edit` entry point only where target metadata is available enough to be useful.
- Freeze the current Live/proposal lane as a screenshot snapshot.
- Store snapshot identity with project, thread, lane, proposal, route, viewport, and timestamp.
- Keep Live DOM untouched and visually separate from edit snapshot state.

### Phase 2 - Element Proxy Overlay

- Use P30b target metadata to render proxy rectangles over the screenshot.
- Gate handles by confidence.
- Medium/low confidence regions remain selectable/markable only.
- Avoid resize handles in v1.

### Phase 3 - Semantic Drag

- Add one draggable proxy.
- Add valid relation drop targets.
- Snap to relation, not absolute position.
- Treat `inside` as structural unless it maps to a known safe slot/container.
- Record `move_intent`.
- Persist edit intent through the app-server proposal registry when it can affect source.

### Phase 4 - Edit Session Controls

- Add Cancel edit.
- Add Undo last edit.
- Add Reset to original proposal.
- Add Save as refinement.
- Verify each control updates only edit-session/proposal metadata, not Live DOM/source.

### Phase 5 - Rename, Hide, Promote

- Add simple edit affordances for:
  - rename;
  - hide;
  - primary/secondary/less prominent.
- Store edits as semantic operations.
- Keep visible labels compact and product-facing.

### Phase 6 - Child Proposal Creation

- Editing Live creates a proposal lane instead of mutating Live.
- Editing A/B/C creates a child/refined proposal state.
- Preserve parent/child identity for history, comparison, and build strategy.

### Phase 7 - Agent Handoff

- Serialize edit intent as hidden context plus a short visible chip or message.
- Agent receives semantic operations, target confidence, screenshot reference, bounds, and source metadata when available.
- Agent responds in product language and chooses whether to revise proposal, ask a question, or build an implementation candidate.

### Phase 8 - Build Resolution

- Classify edit operations into build strategies.
- Same-parent reorder/rename/hide/promote with high-confidence targets may become direct implementation work.
- Cross-parent move, `inside`, reparenting, or structural layout changes route through code-backed proposal/workspace unless proven safe.
- Prevent silent source changes from edit mode.

## Testing

- Test snapshot edit mode opens without mutating Live DOM/source.
- Test only high-confidence elements receive edit handles.
- Test medium/low-confidence elements remain marks/selection only.
- Test dragging records semantic `move_intent`, not absolute coordinates.
- Test relation snapping: above/below/before/after/inside/near.
- Test `inside` routes structural cases to code-backed implementation/proposal unless a safe slot is known.
- Test Cancel edit, Undo last edit, Reset to original, and Save as refinement.
- Test editing Live creates a proposal lane instead of changing Live.
- Test editing `A` creates a child/refined proposal instead of overwriting `A`.
- Test agent handoff receives semantic intent and screenshot/bounds metadata.
- Test build resolution routes cross-parent moves to code-backed implementation/proposal.
- Test project switching clears edit sessions and does not leak proxies/chips.
- Test Plan Mode edit sessions write only proposal/artifact metadata until acceptance.
- Add focused `test:p31`.
- Dogfood in real Electron with one existing app and one generated proposal.

## What Not To Build First

- Freeform drag-anywhere editing.
- Live DOM movement.
- Absolute positioning.
- Resize handles.
- Multi-element layout editing.
- Automatic reparenting.
- Flow graph editing.
- Full Figma-like canvas.

Flow-level editing of screens, routes, workflow steps, and journey diagrams is a future mode and must not be mixed into v1 element-level Edit Mode.

Start with one screenshot, one recognized element, one draggable proxy, one semantic relation, one recorded intent, and one agent interpretation.

## Open Questions

- Should the visible label be `Edit`, `Refine`, or something else?
- How should `A-edited` be shown without making the proposal row too busy?
- Should edited-child proposals be visible as nested history or promoted to the active A lane after user confirmation?
- Which semantic relations are safe enough for v1?
- Can P29 Browser Observer/Actor provide better role/source metadata for proxies?
- How should multiple user edits be batched before agent handoff?
