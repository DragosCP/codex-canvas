# P02 - Visual Planning Canvas

## Status

WIP. The product direction is now a single project Canvas focused on interface/workflow planning. The older graph/proof direction has been removed from scope.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`

## User Workflow Contract

1. The user opens a project and clicks `Canvas`.
2. If Canvas is empty or sparse, the user can run `Generate current interface mockup`.
3. Codex returns a reviewable Canvas draft, not raw parser output.
4. The user reviews, edits, resets, applies, or dismisses the draft.
5. Future normal prompts can attach `@Canvas` as project context.
6. Plan Mode can open an active Canvas draft overlay only through explicit review actions.
7. Accepting a plan implements code/workflow changes but does not automatically save Canvas memory.
8. After implementation, `Update Canvas` can explicitly promote useful visual results into project Canvas memory.

## Current Implemented Surface

- Project Canvas state persists locally per project.
- Canvas supports pages, sub-pages, current/proposed/deleted item states, groups, locks, visibility, comments, coordinates, bounds, undo/redo, zoom/pan, and context-menu editing.
- Generated current-interface drafts use the normal Canvas suggestion flow.
- Canvas proposal parsing supports `xywh`, `grid`, `norm`, and interaction frame lines.
- Plan Mode stores draft snapshots and can reopen historical drafts read-only.
- Interaction preview frames can model small same-page consequences.

## Remaining Work

- Polish generated mockup density and naming across more real projects.
- Keep Plan Mode review labels Canvas-only: `Show Canvas`, `View Canvas`, `Update Canvas`, and `Canvas edits attached`.
- Improve empty/sparse Canvas first-run feel so default pages do not feel pre-shaped or noisy.
- Verify project switching while Canvas or a draft overlay is open.
- Verify `@Canvas` context in normal chat and Plan Mode after the single-surface simplification.

## Verification

- Run `npm run build` in `apps/desktop`.
- Run focused parser/state checks when proposal behavior changes.
- Dogfood in two local projects through the real desktop app when the workflow changes are user-visible.
