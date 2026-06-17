# P14 - Mockup Preview As A Real Preview Surface

## Status

Complete. Implemented and verified in Codex Local/Electron.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/done/P13-llm-decision-strip-mockup-options.md`

## User Workflow First

### Above Composer

1. Saved mockups produce one compact strip above the composer.
2. The strip is only a selector: `A`, `B`, `C`.
3. Clicking an option switches the selected mockup and opens Mockup Preview.
4. The strip does not show `Open` because option click already opens.
5. The strip does not show `Build selected` because build is a commitment action and can be pressed before review.

### Mockup Preview

1. The right preview owns the heavier actions:
   - `A`, `B`, `C`
   - `Mark area`
   - `Revise`
   - `Add`
   - `Build selected`
2. Normal mode keeps the mockup iframe interactive so the user can click tabs, filters, popups, and mockup controls.
3. `Mark area` starts one-shot drawing mode. While marking, clicks/drags create rectangles instead of interacting with the iframe.
4. Completing a mark creates a removable composer chip such as `Mockup A mark`, then returns the iframe to normal interaction.
5. Multiple mockup marks can be attached, including marks from different options.
6. The next prompt includes selected mockup option, file, viewport, and each area mark.

### Action Staging

1. `Revise` fills the composer with a friendly revise prompt; it does not auto-send.
2. `Add` fills the composer with a friendly add-option prompt; it does not auto-send.
3. `Build selected` fills the composer with a friendly build prompt; it does not auto-send.
4. The user can edit or delete the staged prompt before pressing Send.

## Product Contract

- Mockups and app preview should feel like the same preview workflow.
- The user should be able to inspect and interact before committing to build.
- Avoid accidental implementation actions.
- Do not expose DOM tags, CSS property panels, debug logs, or hardcoded app-specific tools.
- Area marks are communication context, not durable Canvas geometry.

## Implementation Shape

- Simplify `MockupOptionStrip` to A/B/C only.
- Extend mockup build action into a staged composer action instead of immediate send.
- Add mockup mark composer context and prompt serialization.
- Add `Mark area` mode to `MockupPreview` with an overlay only while marking.
- Return to normal iframe interaction after a valid or tiny mark attempt.
- Keep iframe interaction available in normal mode.
- Update docs with the implemented workflow.

## Verification

- Passed in real Electron desktop app using `C:\Users\drago\Desktop\agent1`.
- Confirmed above-composer strip has only A/B/C.
- Confirmed A/B/C opens/switches Mockup Preview.
- Confirmed iframe accepts normal interaction and text input before and after marking.
- Confirmed `Mark area` creates chips and preserves option identity across A and B.
- Confirmed `Revise`, `Add`, and `Build selected` stage composer text without auto-sending.
- Passed `corepack pnpm --dir apps/desktop build`.
- Electron left open.
