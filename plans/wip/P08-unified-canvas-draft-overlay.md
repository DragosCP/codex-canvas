# P08 - Unified Canvas Draft Overlay

## Status

WIP. The active direction is one Project Canvas plus temporary draft overlays.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`

## User Workflow First

1. The user opens Project Canvas and sees saved project memory.
2. A generated mockup or plan can create a draft overlay on top of that Canvas.
3. The top Canvas affordance should make the draft state clear.
4. The user can edit the draft without saving durable project memory.
5. Plan option 1 can use draft edits as implementation guidance.
6. Plan option 2 can revise using typed feedback plus draft deltas.
7. `Update Canvas` is the explicit durable save after implementation.

## Product Rules

- There is no separate Canvas mode switch.
- Draft overlays are temporary and turn-scoped.
- Historical drafts open read-only by default.
- `Edit draft` copies a historical snapshot into the active draft overlay.
- `Apply` is for normal Canvas suggestions.
- `Update Canvas` is for post-implementation visual memory.
- `Accept plan` never silently saves Canvas memory.

## Implementation Notes

- Keep draft state in `planProposals` and `canvasSuggestions`.
- Store base snapshot, mutable draft snapshot, parse status, summary, and user-edit timestamp.
- Use compact draft-delta summaries when submitting option 1/2 or `Ask Codex`.
- Promote proposed/deleted visual results into saved Canvas only through explicit Apply/Update actions.

## Verification

- Open saved Canvas, open a draft, close/reopen, and confirm the app does not silently switch state.
- Edit a draft item, submit Plan Mode option 2, and confirm the latest draft delta is included.
- Accept a plan with edited draft guidance and confirm saved Canvas is unchanged until `Update Canvas`.
- Reopen a historical draft read-only and then use `Edit draft`.
