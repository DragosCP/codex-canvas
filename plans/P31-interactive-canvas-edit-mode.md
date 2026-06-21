# P31 - Interactive Canvas Edit Mode

## Status

- Draft plan, not started.
- Goal: let the user edit the Canvas visually while Codex safely records semantic intent from screenshot-backed element proxies, without dragging the live DOM or mutating source files during the edit session.
- P31 depends on P30's Milestone 0 patch-runtime proof and P30b's target identity, target confidence, screenshot, proposal registry, and Canvas lane/backing model.
- Hard gate: do not implement full Edit Mode beyond Milestone 0.5 until P30 Milestone 0, relevant P30b target/proposal foundations, and P31 Milestone 0.5 pass on a real app.
- Owner direction: the user does not need to understand the proxy machinery. `Edit` should feel like editing Canvas, live as floating Canvas chrome outside the locked lane header rows, and use `Cancel`, `Reset`, and `Save` only while editing. Do not add `Undo` in v1; `Reset` is the recovery control.

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
- `plans/wip/P31-test-0.5.md`
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
2. User clicks floating `Edit` chrome on the Canvas surface, outside the Live/proposal header rows.
3. Codex Local freezes the current view into a screenshot snapshot.
4. The app overlays recognized UI element proxies on top of the screenshot.
5. Only high-confidence elements receive edit handles.
6. User drags one recognized proxy in the first milestone, then later can rename, hide, promote, group, or reorder supported proxies.
7. Dragging snaps to semantic relations such as `above`, `below`, `before`, `after`, `inside`, or `near`.
8. Codex Local records structured UX intent, not pixels.
9. User presses `Save`, and the composer receives or updates a compact chip such as `Edit 1`.
10. User can type a prompt and send. The agent receives the edit intent and can revise the selected proposal, update Live, create/update A/B/C, or ask an above-composer decision question when the target is genuinely ambiguous.
11. Live DOM and source files remain untouched until the user explicitly sends/builds a result.

If the user removes the `Edit 1` chip before sending, the pending edit intent is removed and the edit snapshot/proxy state returns to the original position for that intent.

If the user moves the same edited proxy again before sending, keep the same visible `Edit 1` chip and update the hidden edit metadata.

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

## Agent Marks And User Edits

Agent marks and user edits are related, but they are not the same state.

- Agent `Change N` marks are suggestions/evidence attached to a proposal.
- User `Edit N` chips are explicit user intent.
- If the user drags or adjusts an agent change into a new desired position, create or update a user-owned `Edit N` and keep the original `Change N` as proposal evidence when useful.
- The agent receives both authorship signals when relevant: what Codex suggested, and what the user intentionally changed.

## Proposal Relationship

Do not add child proposal UI in the first implementation slice.

- Editing `Live` and saving creates a pending `Edit N` chip, not an immediate proposal lane.
- Editing `A/B/C` and saving creates a pending `Edit N` chip scoped to the selected proposal lane/option.
- When the user sends, the agent decides whether to update Live, revise the selected proposal, create/update A/B/C, or ask a decision-strip question if the user's target is unclear.
- If the user explicitly says `B`, route the edit context to `B` without asking an A/B/C questionnaire.
- Later versions may persist child/refined proposal identity internally, but the visible P27-cool proposal row must remain compact unless the owner approves a new history surface.

## Edit Session Controls

Experimenting must feel reversible.

Edit Mode v1 must include:

- Cancel edit: closes the edit session without saving new intent.
- Reset: returns the current edit session to its original screenshot/proxy state. In this context Reset replaces a separate Undo control.
- Save: creates or updates a compact composer chip such as `Edit 1`; it does not auto-send in v1.

These controls appear only while Edit is active. When Edit is inactive, do not show Cancel, Reset, or Save.

## Milestone 0.5 - Validate Proxy Edit Mode

Prove the scary mechanic before building the full edit mode:

Hard gate: no full Edit Mode, multi-element editing, proposal-child UI, auto-send, or build-resolution complexity should proceed until this passes on a real app.

Run `plans/wip/P31-test-0.5.md` after Phases 1-4 and before starting Phase 5+.

1. Freeze a screenshot of one real running screen.
2. Recognize one real button with high confidence.
3. Overlay one draggable proxy on that button.
4. Recognize one target element.
5. Drag the proxy below the target.
6. Snap to relation: `below targetElementId`.
7. Record one `move_intent`.
8. Press `Save` and create or update an `Edit 1` composer chip.
9. Send a normal prompt with the chip attached.
10. Confirm the agent reads it as: move this button below that element.
11. Confirm Live DOM and source files were untouched.

Exit criteria:

- One screenshot-backed edit session opens.
- One proxy is draggable.
- One semantic relation is recorded.
- `Save` creates or updates one removable `Edit 1` composer chip.
- Removing the chip clears the pending edit intent.
- The composer/agent receives product-facing intent, not raw pixels.
- No implementation source files change.

## Implementation Phases

### Phase 1 - Edit Mode Entry And Snapshot

- Add floating `Edit` Canvas chrome only where target metadata is available enough to be useful.
- Keep `Edit` outside the locked Live/proposal header rows.
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
- Store the first slice as temporary desktop/session edit state because it is not source-affecting until the user sends.

### Phase 4 - Save To Composer Chip

- `Save` creates or updates an `Edit 1` composer chip.
- Removing the chip removes the pending edit intent.
- Moving the same edited proxy again updates the hidden edit metadata without creating a duplicate chip.
- The chip should serialize route, viewport, lane, proposal/option, screenshot, bounds, target confidence, source hints, and semantic edit operations.

### Phase 5 - Edit Session Controls

- Add Cancel edit.
- Add Reset to original snapshot/proxy state.
- Do not add a separate Undo control in v1.
- Verify each control updates only edit-session/composer-chip metadata, not Live DOM/source.

### Phase 6 - Agent Handoff

- Serialize edit intent as hidden context behind the `Edit N` chip.
- Agent receives semantic operations, target confidence, screenshot reference, bounds, lane/proposal/option, and source metadata when available.
- Agent responds in product language and chooses whether to revise a proposal, update Live, ask a question, or build an implementation candidate.
- If the user explicitly names a lane such as `B`, do not ask an A/B/C questionnaire for that choice.

### Phase 7 - Rename, Hide, Promote

- Add simple edit affordances for:
  - rename;
  - hide;
  - primary/secondary/less prominent.
- Store edits as semantic operations.
- Keep visible labels compact and product-facing.

### Phase 8 - Proposal Refinement State

- Decide when saved `Edit N` intent should revise the selected proposal versus create/update A/B/C.
- Keep visible proposal lanes compact and preserve the P27-cool row contract.
- Preserve internal parent/refinement identity only when it is needed for history, comparison, and build strategy.

### Phase 9 - Build Resolution

- Classify edit operations into build strategies.
- Same-parent reorder/rename/hide/promote with high-confidence targets may become direct implementation work.
- Cross-parent move, `inside`, reparenting, or structural layout changes route through code-backed proposal/workspace unless proven safe.
- Prevent silent source changes from edit mode.

## Testing

- Test snapshot edit mode opens without mutating Live DOM/source.
- Test floating `Edit` does not alter the locked Live/proposal header rows.
- Test only high-confidence elements receive edit handles.
- Test medium/low-confidence elements remain marks/selection only.
- Test dragging records semantic `move_intent`, not absolute coordinates.
- Test relation snapping: above/below/before/after/inside/near.
- Test `inside` routes structural cases to code-backed implementation/proposal unless a safe slot is known.
- Test Cancel edit, Reset to original snapshot, and Save to `Edit N` chip.
- Test removing `Edit N` clears the pending edit and restores the edit snapshot/proxy position for that intent.
- Test moving the same edited proxy again updates the existing `Edit N` hidden payload instead of creating duplicate chips.
- Test editing Live creates an edit chip instead of changing Live.
- Test editing `A/B/C` creates an edit chip scoped to the selected proposal lane/option instead of overwriting the proposal.
- Test agent handoff receives semantic intent and screenshot/bounds metadata.
- Test explicit lane wording such as `Implement this in B` does not trigger an A/B/C questionnaire.
- Test ambiguous edit prompts can use the agent-authored decision strip above the composer.
- Test agent `Change N` suggestions and user `Edit N` instructions remain separate.
- Test build resolution routes cross-parent moves to code-backed implementation/proposal.
- Test project switching clears edit sessions and does not leak proxies/chips.
- Test Plan Mode edit sessions write only proposal/artifact metadata until acceptance.
- Add focused `test:p31`.
- Dogfood in real Electron with one existing app and one generated proposal.
- After Phases 1-4, run `plans/wip/P31-test-0.5.md` as the manual Milestone 0.5 gate.

## What Not To Build First

- Freeform drag-anywhere editing.
- Live DOM movement.
- Absolute positioning.
- Resize handles.
- Multi-element layout editing.
- Automatic reparenting.
- Auto-send on Save.
- Child proposal/history UI.
- Separate Undo control.
- Flow graph editing.
- Full Figma-like canvas.

Flow-level editing of screens, routes, workflow steps, and journey diagrams is a future mode and must not be mixed into v1 element-level Edit Mode.

Start with one screenshot, one recognized element, one draggable proxy, one semantic relation, one recorded intent, and one agent interpretation.

## Open Questions

- Which semantic relations are safe enough for v1 beyond `below`?
- Can P29 Browser Observer/Actor provide better role/source metadata for proxies?
- How should multiple user edits be batched before agent handoff?
- When later implementation adds durable refinement history, should edited-child proposals be visible as nested history or promoted into the active A/B/C lane after user confirmation?
