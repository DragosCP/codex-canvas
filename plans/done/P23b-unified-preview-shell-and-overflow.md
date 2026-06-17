# P23b - Unified Preview Shell And Overflow

## Status

- Done.
- This slice follows the local P23 preview ownership work and focuses on making Live Preview and proposal preview feel like one surface instead of two adjacent systems.

## Completed

- Unified the preview shell so the app-preview button opens `Live`, proposal compare stays thread-owned, and chat switching resets compare back to `Live`.
- Simplified preview overflow, removed confusing low-value live actions, and improved fallback labels for proposal highlights.
- Verified with `build`, `test:p19`, `test:p20`, and real Electron runs against `example_C`, including compact overflow checks, meaningful highlight labels, and chat-switch reset screenshots.

## Relevant Docs

- `docs/UI-UX.md`
- `docs/Prod.md`
- `plans/P23-thread-scoped-proposals-and-preview-controls.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`

## Goal

Unify the preview surface so the user always understands where they are: `Live` first, proposal options only when this chat owns them, stable viewport and mark controls, cleaner metadata, and overflow that hides low-priority actions before the header becomes messy.

## User Workflow Contract

### 1. One Preview Surface

- `Open App Preview` opens the preview surface directly in `Live`.
- If the current chat has no proposal set, the preview surface shows only `Live`.
- If the current chat has a proposal set, the preview surface shows `Live | A | B | C` or `Live | Preview`.
- Switching chats resets the preview surface to `Live` so a previous chat's option does not carry visual authority into the next one.

### 2. Stable Header Priority

- The preview header uses one priority order across Live and proposal tabs:
  - `Live | Preview` or `Live | A | B | C`
  - `Desktop | Mobile`
  - `Mark area`
  - context-specific actions
- The header may use two rows.
- It must not grow to a third row.
- Before a third row would appear, lower-priority actions move under `...`.
- Title, summary, route, and status chips truncate or collapse before the core controls disappear.

### 3. Cleaner Live Preview Actions

- Running Live Preview keeps obvious primary controls inline:
  - `Reload`
  - `Stop`
  - `Open`
- Stopped/failed Live Preview keeps obvious primary controls inline:
  - `Live Preview`
  - `Detect existing`
  - `Use URL`
- The overflow menu keeps only secondary actions that a normal user might still plausibly need.
- Internal-feeling actions such as `Reset temporary UI` and `Clear remembered URL` should not be surfaced as first-class product controls.

### 4. Cleaner Proposal Actions

- Proposal tabs keep:
  - `Desktop | Mobile`
  - `Mark area`
  - `Show changes` / `Hide changes`
  - `Reset changes` only when there is something to reset
  - `Build selected` only if it remains a pure composer shortcut
- Proposal highlights stay per option and hidden by default.
- Adjusted highlights stay bound to the option and viewport where they were changed.

### 5. Proposal Highlight Clarity

- A/B/C proposal highlights remain stored per option, not shared globally.
- The UI should stop making them look like anonymous repeated overlays whenever possible.
- When manifest labels are missing, derive a better user-facing label from the highlight note before falling back to `Highlight 1`.

### 6. Inspector Relationship

- The preview surface remains inside the inspector for now, but the user should not have to think about "Inspector mode" versus "App Preview mode".
- The app-preview button is the direct path to `Live`.
- The separate inspector toggle remains a layout control, not a second preview concept.

## Scope

- Shared preview-shell behavior in `LiveAppPreview` and `MockupPreview`
- Shared responsive header and overflow rules
- Simplified metadata copy and action copy
- Better fallback labels for proposal highlights
- Direct `Open App Preview` to `Live`

## Out Of Scope

- Replacing the inspector architecture entirely
- New history browsing surfaces
- Reworking proposal generation prompts beyond highlight labels and copy

## Implementation Phases

### Phase 1 - Header Contract

- Tighten the shared toolbar density model so the header never spills into a third row.
- Explicitly decide which controls stay inline at `full`, `balanced`, and `compact`.
- Hide metadata chips earlier when width is constrained.

### Phase 2 - Unified Live/Proposal Chrome

- Make `Live` the default active tab when opening preview or switching chat.
- Keep `Live | ...` first and visually stable between preview states.
- Align Live and proposal action ordering so the toolbar reads as one family.

### Phase 3 - Menu Simplification

- Remove or demote confusing overflow actions.
- Keep `...` functional and unclipped in both Live and proposal headers.
- Ensure overflow only contains lower-priority actions.

### Phase 4 - Highlight Label Cleanup

- Improve fallback labels for proposal highlights when the manifest provides only notes.
- Confirm A/B/C still use separate stored highlight arrays.

### Phase 5 - Verification

- Run:
  - `corepack pnpm --filter @openai/codex-desktop build`
  - `corepack pnpm --filter @openai/codex-desktop test:p19`
  - `corepack pnpm --filter @openai/codex-desktop test:p20`
- Dogfood in the real Electron app with `example_C`:
  - open preview from the topbar and confirm it lands on `Live`
  - switch between chats and confirm the preview resets to `Live`
  - verify no third preview-header row appears while narrowing the inspector
  - verify `...` opens in both Live and proposal tabs
  - verify running Live preview keeps only primary actions inline
  - verify proposal tabs keep `Show changes` and `Reset changes` in the right priority order
  - verify per-option highlight labels no longer collapse into generic repeated `Highlight 1/2/3` when notes exist

## Risks

- Toolbar priority changes can hide actions too aggressively if thresholds are not tuned on real widths.
- Simplifying Live overflow can remove recovery actions that are still occasionally useful; if so, they should stay secondary, not primary.
- Deriving labels from notes must stay short and predictable or the chips will become noisy.

## Next Slice

If this lands cleanly, the next pass should decide whether preview should remain inside the inspector long-term or whether preview becomes the primary right-side workspace and the inspector becomes a narrower detail drawer.
