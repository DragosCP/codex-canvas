# P26 - Canvas V2 P25b Regression Recovery

## Status

Done.

## Relevant Docs

- `AGENTS.md`
- `docs/UI-UX.md`
- `docs/Prod.md`
- `docs/Arch.md`
- `plans/done/P23b-unified-preview-shell-and-overflow.md`
- `plans/done/P24-proposal-preview-agent-marks-and-routing.md`
- `plans/done/P25-live-overlay-and-temp-code-proposals.md`
- `plans/done/P25b-code-backed-proposal-workspaces.md`

## Goal

Restore the GitHub Canvas v2 interaction contract after P25b while keeping the useful code-backed proposal acceleration underneath.

P25b must not create a new user workflow. It should make proposal acceptance faster after the user explicitly commits, not make preview header controls directly mutate Live or bypass composer-visible intent.

## User Workflow Contract

- `Build selected` in any proposal preview is a composer shortcut only.
- Clicking `Build selected` stages editable text such as `Implement option A` in the composer and focuses the composer.
- The user can edit that text, then presses Enter/Send to commit.
- Only that explicit Send may promote a code-backed proposal into Live.
- `Mark area` in a code-backed proposal must behave like App Preview/Mockup Preview marks: drawing a rectangle creates a removable composer chip for the real project.
- Header button labels, grouping, order, one-row behavior, fixed compare slot, and overflow rules remain locked by `docs/UI-UX.md`.
- The preview header must not expose implementation details such as temp workspace paths, patch internals, or direct apply state.

## Findings

- Baseline `origin/codex/canvas-v2` uses `stageBuildMockup(...)` for `Build selected`; it writes visible composer text and does not auto-send.
- P25b introduced `CodeProposalPreview` with a direct `onApply(...)` callback from the header, which bypassed the composer.
- P25b also wired code-backed proposal `Mark area` to a no-op callback, so marks did not create composer context.
- Code-backed proposal previews were not included in every App-level preview preservation path, so staging `Build selected` could fall back to Activity.
- Proposal apply could hang in `Building` because the UI waited for source preview shutdown before promoting the selected workspace.
- Persisted `applying` status could resurrect as a permanently disabled `Building` button after restart.
- P25b added an Electron-local proposal workspace helper. This is not Rust app-server duplication, but it does duplicate file walking/exclusion ideas from the desktop progress snapshot helper and should be consolidated later.

## Completed Patch

1. Restored composer-first proposal acceptance for code-backed previews.
2. Restored code-backed proposal area marks through the normal App Preview composer context path.
3. Kept the Send/Enter path as the only place that calls `proposal_workspace_apply`.
4. Made accepted proposal promotion non-blocking on source preview stop/start cleanup.
5. Added bounded static preview server shutdown.
6. Normalized persisted `applying` proposal state back to `ready` on reload.
7. Adjusted Live header responsive priority so `Desktop / Mobile` stays visible and lower-priority actions move into `...`.
8. Added static regression guards for direct header apply, no-op marks, stale applying state, preview preservation, and composer cleanup.

## Verification

- `npm --prefix apps/desktop run test:p19`
- `npm --prefix apps/desktop run test:p20`
- `npm --prefix apps/desktop run test:p24`
- `npm --prefix apps/desktop run test:p25`
- `npm --prefix apps/desktop run test:p25b`
- `npm --prefix apps/desktop run build`
- `git diff --check`
- Electron DOM verification on `ToDo App`:
  - `Build selected` staged `Implement option B`, focused the composer, and kept proposal preview open.
  - `Mark area` created a `Live mark 1` composer chip and visible preview mark.
  - Send promoted the selected proposal into Live, cleared the composer, removed active A/B proposal state, and opened Live preview.
  - Live running header showed `Desktop / Mobile`, `Mark area`, `Reload`, `Stop`, and `Open` under `...` at the tested width.
  - Screenshots are in `artifacts/p26-canvas-v2-regression-recovery/`.

## Backend Follow-Up

- Keep `proposal-workspaces.cjs` for the current P25b vertical slice.
- Next cleanup should extract shared Electron file traversal/exclusion helpers so proposal snapshot/diff/apply and workspace progress snapshots do not maintain separate ignore rules.
- Do not move this into app-server/Rust unless a future plan explicitly defines a protocol-level proposal workspace API.
