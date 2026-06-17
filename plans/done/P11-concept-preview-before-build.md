# P11 - Empty Project Mockup Gate

## Status

Done. Implemented, built, and manually verified in the Electron desktop app against Desktop `agent3`.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/done/P09-live-app-plan-preview.md`
- `plans/done/P10-agent4-demo-readiness.md`

## User Workflow First

### Empty Project First Prompt

1. The user opens a fresh project.
2. The folder is empty or effectively empty.
3. The user types the first prompt and presses Send, in Plan Mode or normal mode.
4. Before the prompt reaches the OpenAI server, the desktop pauses and shows a compact card above the composer:
   - `This project is empty. Want to sketch the app before building?`
   - `Skip`
   - `Create mockup first`
5. If the user clicks `Skip`, the original prompt sends unchanged.
6. If the user clicks `Create mockup first`, the card expands with compact settings:
   - number of options: `1`, `2`, `3`
   - depth: `Quick sketch`, `Full demo`
7. The user clicks `Create mockups`.
8. Codex receives an adjusted prompt that asks for the selected number/depth of mockups only. It must not build the final app yet.
9. The generated mockups are saved locally in the project, then shown as concept previews in the right-side surface.
10. The user can switch mockups, ask for changes, add another mockup, or build from the selected mockup.
11. When the user chooses to build, Codex implements the real app from the selected mockup and original request.
12. App Preview then moves into the normal `Run Preview` / live localhost flow.

### Existing App Or Running Preview

1. The user asks for a new page, workflow, or significant UI feature.
2. If a local preview is running, Codex uses Live App Preview A/B/C variants against the real app.
3. The variants should respect the current app style, route, viewport, and marked area when available.
4. The user revises or accepts the selected live option.
5. Codex implements and reloads/compares the real app result.

### Non-UI Or Direct Work

1. The empty-project gate can appear for any first prompt in an empty folder because the trigger is project state, not prompt keyword guessing.
2. If the user clicks `Skip`, backend-only, script, config, bug fix, explanation, or search-style prompts proceed normally.
3. If the user already wrote a direct/no-plan instruction, `Skip` is the fast path and should be visually obvious.

## Product Contract

- Do not make the empty App Preview state feel like a builder dashboard before the user has typed a first prompt.
- Do not depend on a large keyword list for product understanding.
- Use a strong, simple trigger: first prompt in an empty folder.
- The user must be able to skip the gate with one click and send the original prompt unchanged.
- Mockup-first is an almost-Plan-Mode safety path, but it should work whether Plan Mode is on or off.
- Mockups are not localhost apps and not final code branches. They are saved local concept artifacts.
- Render mockups in a first-party concept preview surface or as static preview files, not in legacy Canvas and not in a fake running app.
- Keep user actions clear: switch mockups, revise selected, add another mockup, build from selected, or skip.

## UX States

- Empty project before first prompt:
  - Primary copy: no app to preview yet.
  - Secondary copy: describe what you want to build, then choose whether to mock up first.
  - No large `Build Baseline App` or `Show 3 Layouts` button before intent.
- First-prompt pause card:
  - Compact, above the composer.
  - Primary actions: `Create mockup first`, `Skip`.
  - Expanded settings: number of options and depth.
- Mockup preview available:
  - Show 1-3 compact option controls.
  - Show selected mockup in the right-side surface.
  - Label the surface `Mockup preview` and `Not implemented yet`.
  - Chat-side card owns decisions: build from selected, revise, add another, dismiss/skip.
- After build:
  - Switch to managed App Preview lifecycle.
  - User can `Run Preview`, mark areas, and use live A/B/C for future changes.

## Implementation Shape

- Add a lightweight prompt/context strategy, not a large per-turn meta prompt:
  - Session capability note: at thread start, after compaction, and on resume, remind the agent that the desktop supports mockup options, live preview options, decision cards, revise selected, and implement-after-choice flows.
  - Per-turn factual state: attach cheap facts such as folder empty/effectively empty, live preview available, current route, app mark, saved mockups, selected option, and active decision card.
  - Active-flow note: only while the user is reviewing mockups/live options, attach a tiny note such as "user is reviewing mockup B; if they ask for changes, offer revise selected or implement directly when appropriate."
- Avoid repeating the full product philosophy above every prompt. Keep the model aware of capabilities without flooding context or making small/direct tasks feel over-managed.
- After context compaction, restore the compact capability note and current active-flow state so the agent does not forget available visual planning tools.
- Add a send preflight for empty-folder first prompts:
  - Detect empty/effectively-empty project before calling the app-server turn start.
  - Store the original draft while the gate is open.
  - `Skip` resumes the original send unchanged.
  - `Create mockups` rewrites the first turn as a mockup-generation request with the selected count/depth plus the original prompt.
- Extend preview data so a preview can be either:
  - `live`: injected into a real localhost webview.
  - `mockup`: rendered from saved local mockup artifacts because no app exists yet.
- Keep the selected variant, revision, acceptance, route/viewport/context handoff patterns from P09.
- Save mockups under a local project-owned path such as:
  - `.codex/mockups/manifest.json`
  - `.codex/mockups/mockup-a.html`
  - `.codex/mockups/mockup-b.html`
  - `.codex/mockups/mockup-c.html`
- Prefer HTML mockups first because they can be previewed later, versioned locally, and opened with the managed static preview server.
- Add hidden mockup-generation guidance:
  - Generate only the requested mockups.
  - Do not build the final app yet.
  - Include enough visual structure for the user to compare workflow/layout.
  - Keep the original product request intact as the source of truth.
- Example session capability note:
  - "This desktop can show saved mockup options for empty/new UI surfaces, inject live preview options into running apps, render decision cards above the composer, attach selected options to revisions, and implement only after the user chooses. Use these for broad UI/product work when helpful; keep direct/backend/small tasks moving."

## Current Implementation

- Desktop IPC:
  - `project_empty_status` checks whether the selected folder is effectively empty before a turn starts.
  - `mockups_list` reads `.codex/mockups/manifest.json` plus up to three local HTML mockups.
- Composer:
  - Empty first send pauses before the app-server turn.
  - The card above the composer offers `Skip` or `Create mockup first`.
  - `Create mockup first` expands to 1/2/3 options and `Quick sketch` / `Full demo`.
  - `Skip` sends the original draft unchanged.
  - `Create mockups` sends a mockup-artifact-only task and forces Plan Mode off only for artifact creation.
- Inspector:
  - Saved mockups render in a first-party `Mockup preview` surface with A/B/C switching.
  - `Revise`, `Add`, and `Build selected` are normal Codex prompts with the selected mockup context attached.
  - `Build selected` implements the real app and then moves back to App Preview.
- Blank App Preview:
  - No longer shows `Build Baseline App` before the user has stated intent.

## Manual E2E Test Script

Use Desktop `agent3`, empty the folder first, and keep testing in the real Electron app.

1. Low reasoning, normal mode, empty folder:
   - Prompt: `Build me a to do app for my general tasks. It needs categories, tasks, todo/in progress/done, priorities I can move around, timeline expiration timers, bell reminders I can configure, multiple users, task popups with name/description/website, future email integration, future WhatsApp AI memory, topics above tasks, and an admin page later.`
   - Expected: prompt pauses; choose `Create mockup first`, `3`, `Full demo`; no final app files except `.codex/mockups`.
2. Mockup review:
   - Switch A/B/C.
   - Prompt from review: `Use option B as the base, but bring the timeline clarity from option A and the topic/memory idea from option C.`
   - Expected: saved mockup updates or adds/replaces an option; old injected/mockup UI does not stack.
3. Build:
   - Press `Build selected`.
   - Expected: real app files appear, App Preview can run it, no mockup-only controls in final app.
4. Low reasoning, non-plan:
   - Prompt: `Add categories and priority reordering. Keep the board simple.`
   - Expected: normal implementation path; no empty-project gate.
5. High reasoning, Plan Mode:
   - Prompt: `Plan a timeline and reminder workflow with expiration timers and a bell setup. Show me options before implementing.`
   - Expected: Plan/App Preview options are used against the real running app when preview is available.
6. Cancel/revise Plan Mode:
   - Cancel or revise the plan, then ask: `Make the reminder setup fewer clicks and avoid settings panels.`
   - Expected: selected option/context survives; old temporary UI is cleaned.
7. Low reasoning, non-plan:
   - Prompt: `Add task detail popups with name, description, and website.`
   - Expected: direct implementation, preview reload works.
8. High reasoning, Plan Mode:
   - Prompt: `Add an admin page for users and reminder defaults. It should feel like part of the same app, not a separate dashboard.`
   - Expected: new page/workflow options use the app style; no debug admin chrome.
9. Backend/workflow edge:
   - Prompt: `Add recurring daily jobs for reminders, but keep it local and do not wire email yet. Show honest placeholders for email/WhatsApp.`
   - Expected: no fake external integration; local state or simple scheduler is honest.
10. Final preview proof:
   - Run Preview, click/drag through board, open task modal, switch users/admin/timeline, mark an area, and screenshot the final Electron app.

## Manual Verification Log

- Static checks:
  - `node --check apps/desktop/electron/main.cjs` passes.
  - `corepack pnpm --dir apps/desktop build` passes.
  - `git diff --check` passes.
- Electron setup:
  - Emptied `C:\Users\drago\Desktop\agent3`.
  - Launched built Electron app with remote debugging.
  - Left the Electron app open with App Preview running at `http://127.0.0.1:3000/`.
- Empty first prompt:
  - Low reasoning, normal mode prompt paused before send.
  - Compact card appeared above composer with `Skip` and `Create mockup first`.
  - Send stayed blocked while the gate was open.
  - `3` and `Full demo` were selected.
- Mockup artifact generation:
  - Low reasoning created exactly `.codex/mockups/manifest.json`, `mockup-a.html`, `mockup-b.html`, and `mockup-c.html`.
  - No final app files were created during mockup generation.
  - Bug found/fixed: mockup reader did not accept manifest file paths saved as `.codex/mockups/mockup-a.html`.
  - Bug found/fixed: saved mockups were not visible from Activity after reload.
  - Bug found/fixed: internal mockup prompts appeared in chat/sidebar/composer; display is now masked and Revise/Add seed human text only.
- Mockup review:
  - Reopened saved mockups from Activity.
  - Switched A/B/C; exactly one mockup iframe remained.
  - Revised option B with user feedback; option B updated and stayed selected.
- Build selected:
  - Built selected option B into a Vite React app.
  - App Preview opened and managed preview ran at `127.0.0.1:3000`.
  - DOM/state inspection: app had 25 buttons, 3 inputs before modal, about 191 nodes, no debug/admin chrome.
- App Preview/App Mark:
  - Real click tests changed category, user, topic, opened task popup, saved a task, and changed task status.
  - App Mark drag in the live preview added an `App mark` composer chip with the current preview URL.
- High reasoning follow-up:
  - Used `App mark` context to fix generated app task creation/user-filter UX.
  - Verified real typed input saves the task name and defaults the owner to selected Mira.
- Plan Mode:
  - High reasoning Plan Mode produced a plan without editing files.
  - `Compare options` opened live App Preview A/B/C variants.
  - Switching variants B/C left exactly one injected root in the live app page.
  - Dismiss/cancel closed the preview surface; the plan remained in chat history.
- Screenshots:
  - `.tmp/p11-codex-electron.png`
  - `.tmp/p11-tempo-app.png`

## Verification

- Empty project, Plan Mode on: first prompt pauses before send and offers mockup-first or skip.
- Empty project, Plan Mode off: first prompt pauses before send and offers mockup-first or skip.
- Empty project, `Skip`: original prompt sends unchanged.
- Empty project, `Create mockups`: Codex creates only the selected number/depth of mockups and saves them locally.
- Empty project, backend-only prompt with `Skip`: Codex proceeds normally.
- Existing app with running preview: broad UI feature uses live injected A/B/C, not concept preview.
- Existing app without running preview: user gets honest fallback and can run preview or use saved mockups only when the project has no real app surface.
- Revision includes selected mockup and user feedback.
- Build selected mockup creates a runnable baseline app, then managed App Preview can run it.
- Saved mockups can be reopened later from `.codex/mockups`.
- Session capability note appears at new thread/start and survives resume/compaction.
- Per-turn factual preview/mockup state is attached without repeating the full capability prompt.
- No legacy Canvas draft strip appears in the mockup-first workflow unless the user explicitly chooses Canvas.

## Resolved Implementation Notes

- `Effectively empty` ignores `.git`, `.codex`, common OS files, and README/license-only scaffolding.
- The preflight gate is not persisted per project. It appears only when the current send has no active chat history and the folder is effectively empty.
- Full-demo mockups are standalone HTML files and may include light inline interactions.
- Mockup revisions update the selected saved option and manifest. `Add` keeps the saved option count at three or fewer.
