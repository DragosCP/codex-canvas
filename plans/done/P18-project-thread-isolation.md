# P18 - Project Thread Isolation

## Relevant Docs

- `docs/Arch.md`
- `docs/UI-UX.md`

## Goal

Stop old chats, internal visual-planning prompts, and saved mockup context from leaking into a fresh chat when a folder is removed, re-added, or reused.

## User Workflow Contract

- `Remove from list` removes the folder from the sidebar only; saved app-server chats may reappear if the same folder is added again.
- Re-adding a folder must not auto-hijack a new chat with the newest old session when there is no valid last-active chat.
- Starting a new chat must show a real draft state until the new turn creates its own thread.
- The stop/running state belongs only to the active thread that owns the running turn.
- Saved mockups can stay visible as project artifacts, but composer A/B/C strips and hidden selected-option context belong only to the chat that created the active mockup decision.
- Internal prompt sentinels must never appear in sidebar, header, chat display, or composer text.
- Operational no-edit prompts, command prompts, and explicit test replies in empty projects must not be intercepted by the visual-planning guard.

## Completed

- Guarded thread refresh and startup reconciliation so active drafts and pending sends are not replaced by older server threads.
- Removed newest-thread fallback when there is no valid active or last-active thread.
- Scoped running/stop UI to the active thread's in-progress turn.
- Scoped saved mockup composer context and A/B/C strip to the owning thread instead of the whole project.
- Hardened sidebar and shared title formatting against persisted internal prompt titles.
- Kept active thread archive controls visible so stale chats are easier to remove from the project list.
- Protected thread archive confirmations from the sidebar outside-click handler, so clicking `Archive` runs the archive action instead of just dismissing the popover.
- Narrowed empty-project visual planning so command/script/no-edit prompts proceed normally.
- Stopped planning-only empty-project turns from claiming saved mockup ownership unless mockup artifacts actually changed.

## Verification

- Built desktop with `npm run build` in `apps/desktop`.
- Reloaded the real Electron desktop app through DevTools port `9230`.
- In `agent2`, started a fresh chat while old project chats and `.codex/mockups` artifacts were still present.
- Sent a no-edit isolation prompt and confirmed the new thread stayed active, returned `PROJECT ISOLATION OK`, showed no raw `[Codex ...]` rows, and did not show the old mockup A/B composer strip.
- Sent a second fresh-chat timing prompt that ran while inspected: mid-run showed the active timing thread, `Stop`, no `Preparing choices`, no raw internal rows, and no mockup strip; final output was `TIMING REGRESSION OK` with no file changes.
- Reproduced the sidebar archive confirm path with real mouse events in Electron and confirmed a test chat disappeared with no sidebar error.
- Screenshot proof: `.codex-screenshots/p18-agent2-isolated.png`.
- Screenshot proof: `.codex-screenshots/p18-agent2-timing-regression.png`.
