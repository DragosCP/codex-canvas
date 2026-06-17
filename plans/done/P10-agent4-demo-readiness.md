# P10 - Agent4 Demo Readiness

## Status

Complete. The Electron desktop app was dogfooded end-to-end in `C:\Users\drago\Desktop\agent4`; product issues found during the run were fixed directly and retested in the real desktop shell.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/done/P09-live-app-plan-preview.md`

## Owner Truth For This Slice

- Demo-ready means chat plus the real App Preview get priority.
- Less is more: fewer clicks, fewer duplicate labels, fewer panels, and no visible debug/backend machinery.
- App Preview should take the most space possible when selected.
- Plan Mode and normal chat must both work naturally.
- Legacy Canvas should not compete with the live-app workflow unless the user explicitly chooses Canvas.
- Keep the workflow agentic: no hardcoded user-app routes, DOM tag editing, CSS property panels, or brittle project-specific pipelines.

## User Workflow Verified

1. Opened Desktop `agent4` in the real Electron app.
2. Built a real local app, `Signal Kitchen`, through normal chat.
3. Started the project server on `http://127.0.0.1:4173/`.
4. Used normal chat with App Preview context and an area mark.
5. Used Plan Mode to produce A/B/C live preview variants, revise a selected option, accept implementation, and compare the real result.
6. Continued with low/high reasoning follow-up prompts for mobile, accessibility, interaction, and final polish.

## Prompt Log

1. High reasoning normal chat: create an edge-case local web app called `Signal Kitchen`.
2. Low reasoning normal chat: make the command composer more important.
3. Low reasoning normal chat with `App mark`: move the incident timeline/feed into the marked destination.
4. High reasoning Plan Mode: plan a Contamination Forecast visual feature with options.
5. Plan Mode revision: revise toward option C with a less modal treatment.
6. Plan acceptance: implement the selected Contamination Forecast preview.
7. Low reasoning normal chat: make the app usable at narrow mobile viewport.
8. Low reasoning normal chat: quality pass for brittle UI, accessibility, text overflow, and complexity.
9. High reasoning Plan Mode: propose one final visual improvement with one acceptance check, then dismiss.
10. High reasoning normal chat: implement the dismissed plan's risk pulse treatment.

## Product Fixes Implemented

- Removed legacy Canvas from the topbar primary path.
- Added preview-focused shell layout so App Preview and Plan Preview get the dominant column.
- Compacted Live App Preview controls; hid duplicate root-route metadata once a preview URL is already shown.
- Kept Canvas suggestions explicit-only for the primary live-app workflow, preventing ordinary `move/map/layout` prompts from surfacing Canvas draft strips.
- Added a direct approval path from the composer banner to the approvals inspector.
- Added native Electron bridge token gating so arbitrary preview/webview content cannot connect to the Codex bridge.
- Added preview probe redirect validation, Codex-port rejection, and bounded response reads.
- Added generation guards for async preview probes and temporary UI injection cleanup.
- Verified Plan Mode A/B/C injection switches cleanly and leaves no stale injected root after dismissal.

## Agent4 App Result

- Project path: `C:\Users\drago\Desktop\agent4`
- Server: `node server.js`, running on `http://127.0.0.1:4173/`
- Files created/edited: `app.js`, `index.html`, `package.json`, `README.md`, `server.js`, `styles.css`
- Final app: a dependency-free `Signal Kitchen` operations console with live service map, ingredient queue, incident timeline, command composer, contamination forecast, mobile layout, keyboard/accessibility polish, and risk pulse visual treatment.

## Verification

- `corepack pnpm --dir apps/desktop build` passed after the final desktop changes.
- `git diff --check` passed.
- `node --check C:\Users\drago\Desktop\agent4\app.js` passed.
- `node --check C:\Users\drago\Desktop\agent4\server.js` passed.
- `http://127.0.0.1:4173/` returned `200`.
- Real Electron app was restarted on the production `dist/index.html` build.
- App Preview loaded `http://127.0.0.1:4173/` in a controlled Electron webview.
- DOM/state checks confirmed no active Canvas draft strip, no debug/backend copy, no leftover temporary plan-preview root, and a dominant preview-focused shell layout.
- Anonymous websocket attempt from preview-like origin to the Codex bridge returned `HTTP/1.1 403 Forbidden`.
- Webview interaction check clicked the forecast control and focused/typed into the command composer.
- Final screenshots:
  - `C:\Users\drago\Desktop\harnesses\codex-main\.tmp\p10-agent4-final-desktop-clean.png`
  - `C:\Users\drago\Desktop\harnesses\codex-main\.tmp\p10-agent4-final-mobile-clean.png`

## Honest Notes

- The first creation prompt wrote the project files but stayed in a running/approval-adjacent state long enough that it was manually stopped. The reachable composer approval path was tightened afterward, and the remaining prompts completed normally.
- The Plan Mode option preview was validated through DOM/state and Electron interaction checks, not by creating three separate code implementations. This matches the intended temporary preview model.
- Electron was left open on the final `agent4` App Preview, and the `agent4` server was left running.
