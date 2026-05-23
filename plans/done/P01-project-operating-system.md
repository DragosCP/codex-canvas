# P01 - Project Operating System

## Status

- State: Done
- Location: `plans/done/`
- Started: Yes
- Completed: Yes
- Related docs: `AGENTS.md`, `docs/Arch.md`, `docs/Prod.md`, `docs/UI-UX.md`

## Goal

Create the basic operating structure for this project so future work has a clear lifecycle: plans start in `plans/`, active work moves to `plans/wip/`, completed work moves to `plans/done/`, and durable product knowledge lands in the right doc only when implementation or explicit product direction justifies it.

## Success Criteria

- [x] `AGENTS.md` starts with product operating rules and preserves upstream repo rules.
- [x] `docs/Arch.md`, `docs/Prod.md`, and `docs/UI-UX.md` exist as starter docs.
- [x] `plans/`, `plans/wip/`, and `plans/done/` exist.
- [x] This plan stayed in `plans/` until active work began, then moved to `plans/done/` after completion.
- [x] Future agents can understand where plans live, when docs are updated, and how to verify work.

## Phase 1 - Establish The Operating Structure

- [x] Reuse the existing `docs/` folder without deleting or renaming upstream docs.
- [x] Create empty starter docs for architecture, product direction, and UI/UX.
- [x] Create the plan lifecycle folders: planned, work in progress, and done.
- [x] Add this seed plan in the planned state.

## Phase 2 - Add Project Rules Without Losing Upstream Rules

- [x] Prepend product operating rules to `AGENTS.md`.
- [x] Keep existing Rust/Codex repo instructions intact below the new project section.
- [x] Record that the AGENTS line target is temporarily exceeded because the existing file was already large.
- [x] Include the latest-5 implemented plan memory policy.

## Phase 3 - Define Planning And Documentation Behavior

- [x] Document that new plans start in `plans/`.
- [x] Document that active plans move into `plans/wip/`.
- [x] Document that completed plans move into `plans/done/`.
- [x] Document that WIP status is updated by ticking phases instead of writing long logs.
- [x] Document that durable lessons go into `docs/` only after meaningful WIP or done work, or after explicit owner direction.

## Phase 4 - Encode Product And UX Defaults

- [x] Capture the "fewer clicks is better" rule.
- [x] Capture the rule against unnecessary admin/debug surfaces.
- [x] Capture SPA stability expectations, including avoiding stale route flashes.
- [x] Capture the preference against boxes inside boxes and panels inside panels.
- [x] Capture the requirement to investigate before recommending.

## Phase 5 - Verification

- [x] Verify all expected files and folders exist.
- [x] Verify the three new docs were created as empty starter docs during setup.
- [x] Verify this plan is in `plans/done/` after completion.
- [x] Verify `AGENTS.md` starts with `# Product Operating Rules`.
- [x] Verify the original `# Rust/codex-rs` section still exists.

## Manual Verification Notes

This is scaffolding-only work. No app runtime, database, browser, or backend verification is required. If this plan later becomes active implementation work, verification should be limited to filesystem structure and content checks.

Completed verification: files and folders exist, product docs were created, `AGENTS.md` starts with product operating rules, and upstream Rust/Codex guidance remains below. `docs/Prod.md` was later filled with explicit owner product direction.

## Documentation Update Rule

Do not update `docs/Arch.md`, `docs/Prod.md`, or `docs/UI-UX.md` for this plan while it remains planned. If this setup is moved to `plans/wip/` or `plans/done/`, add only compact durable knowledge to the relevant doc if needed.
