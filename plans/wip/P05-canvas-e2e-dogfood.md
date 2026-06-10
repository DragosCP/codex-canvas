# P05 - Canvas E2E Dogfood

## Status

WIP. Use this as the end-to-end check for Canvas, Plan Mode, composer context, project switching, and generated interface drafts.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`

## Goal

Dogfood the Canvas workflow in two local projects before claiming user-visible Canvas or Plan Mode changes are complete.

## Projects

- One interface-heavy project.
- One backend/workflow-heavy project.

## Workflow Checks

1. Open each project in the real desktop app.
2. Confirm the project-level `Canvas` button opens the current project's Canvas.
3. Generate a current-interface mockup on an empty or sparse Canvas.
4. Review pages, sub-pages, item placement, labels, layers, and Apply/Dismiss behavior.
5. Edit a generated draft, confirm `Canvas edits attached` style feedback where relevant, then Apply or Reset.
6. Attach `@Canvas` in normal chat and ask a read-only placement/workflow question.
7. Turn on Plan Mode without opening Canvas automatically.
8. Ask for a visual/workflow change and confirm the plan decision surface is clear.
9. Open the Canvas draft overlay from the plan, edit it, and submit option 1 or option 2.
10. After implementation, use `View Canvas` or `Update Canvas` only when those actions are useful.
11. Switch projects with Canvas open and verify the inspector retargets safely.

## Pass Criteria

- No stale project Canvas is editable after project switching.
- Generated drafts are understandable without raw proposal text.
- Plan Mode decisions are not confused with Canvas save actions.
- Canvas context can answer concrete placement/workflow questions.
- The workflow uses the fewest reasonable clicks and avoids unclear loading or saving states.

## Blockers To Record

- Canvas cannot open, generate, apply, reset, or save.
- Plan Mode opens Canvas unexpectedly.
- Draft edits are lost or silently saved to project memory.
- Project switching leaves stale Canvas state visible.
- The user cannot tell whether they are editing a draft or saved Canvas.
