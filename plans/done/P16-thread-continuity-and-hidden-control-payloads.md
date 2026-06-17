# P16 - Thread Continuity And Hidden Control Payloads

## Status

Complete. Fixed the mockup-first workflow bugs found in `agent6` and verified the same prompt path in `agent7` in real Electron.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P15-mockup-marks-and-history-lifecycle.md`

## User Workflow First

1. User sends a first broad UI/app prompt in an empty project.
2. Chat should show visible work while the model is thinking, but never show raw `codex-decision-strip` JSON/control payloads.
3. The decision strip appears above the composer as product UI.
4. Choosing `wireframes` or `mockups` continues the same chat/thread, not a new conceptual sidebar session.
5. While wireframes/mockups are being generated, the user sees `Thinking`/activity in the same chat.
6. When mockups are created, option A opens immediately in Mockup Preview instead of leaving Activity/Inspector as the main right panel.
7. A/B mockup references remain available as chat history records after generation and after `Build selected`.
8. `Build selected` continues the same chat/thread, stages first, sends only when the user presses Send, and does not create another sidebar session.
9. After build, the real App Preview can be run, and the saved mockup references remain available from the chat/Activity history.

## Bugs To Fix

- Done: raw decision/control payload text is stripped during streaming and final rendering, including partially streamed loose JSON.
- Done: wireframe/build turns show visible `Thinking`/activity in the same chat.
- Done: visual decision choices and mockup build/revise/add sends target the active thread when one exists.
- Done: local-draft routing no longer forces a new thread for choices inside an existing thread.
- Done: generated mockups auto-open option A in Mockup Preview.
- Done: saved mockups are listed as individual A/B history records after `Build selected`.

## Verification

- Built desktop with `corepack pnpm --dir apps/desktop build`.
- Inspected `agent6` to confirm the broken duplicate-thread/raw-payload scenario and prompt.
- Cleared `C:\Users\drago\Desktop\agent7` and reran the same prompt in real Electron:
  `I want to create a personal TODO app, with lists (columns) in progress tasks, to do and done...`
- Verified first-turn decision strip showed no raw JSON/control payloads.
- Verified `Show wireframes` staged first, then sent in the same active thread, showed `Thinking`, and did not create a new conceptual sidebar chat.
- Verified mockup generation auto-opened option A in Mockup Preview.
- Verified `Build selected` lived only in Mockup Preview, staged the composer first, then sent in the same thread.
- Verified `Build selected` switched mockups into history mode during implementation and Activity listed A/B records after build.
- Verified App Preview started the built app at `http://127.0.0.1:4173/` and rendered the category TODO board.
- Verified preview DOM: title `Personal Todo Board`, headings `Today`, `Categories`, `To Do`, `In Progress`, `Done`; clicked `Home` category and saw the board filter to Home tasks.
- Independent app check: initial `npm run build` failed before dependencies were installed; after `npm install`, `npm run build` passed.
- Screenshot proof files saved under `.cache/`:
  `p16-agent7-rerun-decision.png`,
  `p16-agent7-rerun-wireframes-thinking.png`,
  `p16-agent7-rerun-mockup-auto-open.png`,
  `p16-agent7-rerun-build-staged.png`,
  `p16-agent7-rerun-build-thinking.png`,
  `p16-agent7-rerun-history-or-preview.png`,
  `p16-agent7-rerun-real-preview.png`,
  `p16-agent7-rerun-real-preview-filtered.png`.
- Electron was left open with the `agent7` App Preview running.
