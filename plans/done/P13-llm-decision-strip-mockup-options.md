# P13 - LLM Decision Strip And Mockup Option Strip

## Status

Complete. Electron `agent1` dogfood found and fixed three issues: the first unguarded turn could write mockups immediately, the Plan Mode guard added extra plan UI plus leaked hidden prompt text, and selected visual options exposed internal artifact instructions in the composer.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/done/P12-llm-led-empty-project-visual-options.md`

## User Workflow First

### Empty Project First Prompt

1. The user opens an empty project and asks for a broad app/UI.
2. The desktop sends compact empty-project state and available visual-planning tools.
3. The LLM considers visual planning, but does not automatically create mockups.
4. The LLM can return a structured decision strip:
   - `Build directly`
   - `Show wireframes`
   - `Show detailed mockups`
   - another concise option if the prompt calls for it
5. The app renders those choices above the composer.
6. Clicking an option updates the composer with the chosen path; the user can edit or press Send.
7. If the selected path creates mockups/wireframes, the agent saves `.codex/mockups` artifacts.
8. Once artifacts exist, the app shows a compact A/B/C strip above the composer.
9. Clicking A/B/C opens Mockup Preview in the inspector, even if the right panel was closed.

### Saved Mockup Review

1. The user can switch A/B/C from above the composer or in Mockup Preview.
2. The user can ask naturally to combine, revise, or implement.
3. The app attaches selected mockup context behind the scenes.
4. The LLM decides whether to revise mockups, ask one concise question, or implement directly.

## Product Contract

- Enforce consideration, not mockup creation.
- The desktop renders generic choices; the LLM owns what choices make sense.
- Do not show fixed desktop questionnaires before the LLM thinks.
- Do not make the user discover mockups through Activity only.
- App Preview remains for runnable apps. Mockup Preview remains for concept artifacts.
- When saved mockups exist and no app is built, the primary visible bridge is the above-composer option strip.

## Implementation Shape

- Done: added a `codex-decision-strip` fenced JSON protocol parsed from assistant responses.
- Done: stripped that protocol from visible assistant markdown/activity.
- Done: rendered the latest pending decision strip above the composer.
- Done: option click fills the composer with the selected option's prompt and dismisses that strip.
- Done: changed empty-project prompt guidance so broad UI requests return a decision strip first instead of immediately creating files.
- Done: changed the first empty-project visual consideration turn to read-only/no-approval so the model cannot write files before the user chooses without surfacing a Plan Mode review card.
- Done: tightened hidden prompt display cleanup for Plan Mode-wrapped empty-project/mockup-review prompts.
- Done: hid selected decision-option payloads behind a friendly composer line while preserving the full internal prompt for the agent.
- Done: added a saved mockup strip above the composer whenever the active project has saved mockups.
- Done: wired A/B/C clicks to select/open Mockup Preview.
- Done: kept `Run Preview` unchanged for real apps.
- Verified: desktop build passes.
- Found/fixed in Electron `agent1`: the initial unguarded prompt still created `.codex/mockups` directly. A Plan Mode guard prevented files but introduced confusing extra plan UI and leaked hidden prompt text. The read-only guard fixed that, then selecting `Show mockups` exposed internal artifact instructions in the composer; hidden selected-option sends fixed the final UX.

## Verification

- Use Desktop `agent1`, which the owner emptied.
- First prompt: `I want you to create me a TO DO app on different categories.`
- Done: first read-only/no-approval turn created no files and showed one decision strip above the composer.
- Done: hidden context and `codex-decision-strip` JSON were not visible in the active chat.
- Done: Plan review UI is suppressed when the same turn already contains a visual decision strip.
- Done: selecting `Show mockups` fills the composer with a friendly one-line choice while sending the full selected-option prompt behind the scenes.
- Done: selected option created `.codex/mockups/manifest.json`, `mockup-a.html`, `mockup-b.html`, and `mockup-c.html`; no runnable app scaffold was created.
- Done: above-composer A/B/C strip appeared and opened Mockup Preview.
- Done: clicking B and C switched both the strip and Mockup Preview selection.
- Visual proof: `.cache/p13-agent1-mockup-preview-codex-front.png`.
