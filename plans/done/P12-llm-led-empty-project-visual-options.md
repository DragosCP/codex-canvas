# P12 - LLM-Led Empty Project Visual Options

## Status

Done. Implemented, built, and manually verified in Electron with Desktop `TO DO`.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/done/P11-concept-preview-before-build.md`

## User Workflow First

### Empty Project First Prompt

1. The user opens an effectively empty project.
2. The user types a normal first prompt and presses Send.
3. The desktop does not show a fixed questionnaire before the model sees the prompt.
4. The desktop attaches compact factual state:
   - project is effectively empty
   - no live preview is running
   - no saved mockups exist, or saved mockups exist
   - visual tools available: saved mockups, live preview variants, decision cards, revise selected, build selected
5. The LLM decides whether the prompt is broad user-facing app/UI work.
6. For broad user-facing app/UI work, the LLM should create three visual directions first and save them under `.codex/mockups` without implementing the app.
7. For backend-only, direct, small, or explicitly "build directly" work, the LLM proceeds normally.
8. After mockups are saved, the app opens the saved mockup preview.
9. If the user asks to combine/revise options, the LLM should offer the right next step in the response: revised single mockup or direct implementation, instead of the desktop hardcoding another questionnaire.

### Existing App Or New Surface

1. When a real preview is running, broad UI changes should use live preview options on the existing app when useful.
2. If the requested page/surface does not exist yet, the LLM may create concept mockups that match the existing app style instead of pretending the current route contains that page.
3. The user can revise or implement after the selected path is clear.

## Product Contract

- The app supplies tools and factual context; the LLM owns the design conversation.
- Do not hardcode product-specific terms, routes, app concepts, or fixed questionnaires.
- It is acceptable to nudge behavior with a compact capability note and a first-empty-project instruction.
- The strongest default rule is: empty project plus broad user-facing UI/app request means propose three visual directions before implementation, unless the user explicitly asks to build directly.
- Do not block the send button or require pre-send UI choices for this flow.
- Keep the user-facing UI simple: no DOM editing, no CSS panels, no debug logs, no nested decision panels.

## Implementation Shape

- Remove the visible fixed `MockupGateCard` from the first-send path.
- Keep `project_empty_status` as cheap factual state.
- Add a lightweight prompt prefix/wrapper for the first turn in an effectively empty folder.
- The wrapper should:
  - restate available desktop visual-planning capabilities
  - say when to prefer three visual directions first
  - require saved mockup artifacts when the LLM chooses that path
  - preserve the original user request exactly
  - allow direct implementation for backend/direct/small/explicitly-direct prompts
- Reuse the existing `.codex/mockups` manifest and HTML preview renderer.
- After a turn completes, load/open saved mockups when the first-empty-project wrapper was used and saved mockups exist.
- Hide internal wrapper text in chat/sidebar display so the user sees their real prompt, not app instructions.
- When saved mockups exist, attach selected-option context to natural follow-up prompts so the LLM can decide whether to revise mockups, ask one concise question, or implement directly.

## Verification

- In Desktop `TO DO`, empty the folder or use an effectively empty folder.
- First prompt: `Build me a to do app for my general tasks. It needs categories, tasks, todo/in progress/done.`
- Expected: no fixed questionnaire appears; prompt sends to LLM; for this UI app request, the LLM creates three saved mockups first, not final app files.
- Verify chat/sidebar show the user prompt cleanly.
- Verify saved mockups open in `Mockup preview`.
- Follow-up prompt: `I want the board from option 2 and the timeline idea from option 3.`
- Expected: LLM response steers to revised mockup or direct implementation with selected context; no desktop hardcoded questionnaire appears.
- Direct/backend edge: first prompt in empty folder with an explicit non-UI/direct instruction should proceed without forced mockups.

## Manual Verification Log

- Build: `corepack pnpm --dir apps/desktop build` passes.
- Static checks: `node --check apps/desktop/electron/main.cjs` and `git diff --check` pass.
- Electron `TO DO` first prompt:
  - Old fixed `.mockup-gate-card` did not render.
  - Send enabled after real text input and the prompt sent immediately.
  - User bubble displayed only the original user prompt.
  - Low-reasoning model chose the visual-directions path and created exactly `.codex/mockups/manifest.json`, `mockup-a.html`, `mockup-b.html`, and `mockup-c.html`.
  - No final app scaffold files were created.
  - `Mockup preview` opened with A/B/C and `Not implemented yet`.
- Electron `TO DO` follow-up prompt:
  - Natural prompt: `I want the board focus from option B and the weekly flow idea from option C. Create one revised mockup option, do not build the app yet.`
  - Saved-mockup context was attached behind the scenes; the user bubble stayed clean.
  - The model revised saved option A into `Weekly Command Board`.
  - Only `.codex/mockups/manifest.json` and `.codex/mockups/mockup-a.html` changed; no real app was scaffolded.
  - A transient duplicate user bubble appeared while the turn was in progress, then settled to one bubble after completion. Added display-level de-dupe for identical user-message items in a turn.
- Screenshot proof: `.tmp/p12-to-do-llm-led-mockups.png`.
- Direct/backend first-prompt edge was covered by the decision policy and wrapper path, but not separately dogfooded with a live model turn in this pass.
- Final checks:
  - `corepack pnpm --dir apps/desktop build` passes.
  - `node --check apps/desktop/electron/main.cjs` passes.
  - `git diff --check` passes.
