# P21 - Live Turn Progress Lifecycle

## Status

- Done.
- Goal handled: active turns now stay visibly alive from send through completion, especially while mockup/wireframe/proposal files and new app files are being written.

## Relevant Docs

- `docs/Arch.md`
- `docs/UI-UX.md`
- `docs/Prod.md`

## User Workflow Contract

- When the user sends the first prompt in a fresh project, the user bubble remains visible immediately; the chat must not flash back to an empty/new-chat state.
- While Codex thinks, runs commands, writes files, or waits between observable events, the active turn shows one compact activity surface in the transcript.
- While files are changing, a composer-adjacent progress pill shows the current aggregate, such as `3 files changed +420 -8`, with a `Review` action once real file-change diffs exist.
- Inline activity uses human labels like `Editing App.tsx +20 -14`, not raw event names or debug logs.
- Expanding activity shows grouped details: edited files and command rows together, without repeating the same final `Edited 1 file` card many times.
- On completion, cancellation, or failure, live progress stops cleanly and the final file summary remains grouped.

## Scope

- Reuse app-server turn items and file-change streaming first.
- Keep the Electron workspace progress watcher as a bounded fallback only for active turns.
- Do not expose hidden chain-of-thought, prompt wrappers, internal payloads, or raw filesystem logs.
- Do not change app-server protocol unless the renderer/Electron path cannot cover the workflow.

## Phases

- [x] Capture feedback and desired original-Codex-style progress behavior.
- [x] Normalize turn progress across app-server file changes, command items, and workspace snapshots.
- [x] Render progress in transcript plus a compact above-composer review pill.
- [x] Stabilize first-send display so the prompt never disappears during thread creation.
- [x] Collapse duplicate file-change output into one final grouped summary per turn.
- [x] Verify with desktop build, P20 checks, and real Electron flows for fresh project, multi-file generation, and cancellation.

## Notes

- The progress UI is product UI, not an Activity/debug console.
- `.codex/mockups` writes count as visible file work because they are user-facing review artifacts.
- Verification used the real Electron app on cleared Desktop test-project folders. The deterministic encoded-writer prompt proved live workspace progress and cancellation cleanup; a direct file-edit prompt proved grouped final `Edited 2 files` output. A larger encoded-command prompt failed because the agent included adjacent prose in the command, so broad model-driven large-generation timing remains non-deterministic.
