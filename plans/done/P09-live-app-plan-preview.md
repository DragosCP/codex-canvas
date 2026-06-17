# P09 - Live App Plan Preview

## Status

Complete. Electron is the desktop shell target on this branch, and Live App Plan Preview now uses the real running app as the review surface. Proposed Plan Mode UI is temporarily injected into the Electron-controlled app webview, one selected option at a time, with cleanup on option switch, hide/show, reset, route reload, dismissal, and project switch.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/wip/P02-visual-planning-canvas.md`
- `plans/wip/P08-unified-canvas-draft-overlay.md`

## User Workflow First

1. The user opens App Preview for the active project.
2. If the project has a remembered local preview URL, the real app opens in an Electron webview. If not, the user sees an honest choose/detect/start-app state.
3. In normal chat, the user can press `Mark area`, draw over the app, and get a removable `App mark` composer chip. The next prompt sends the mark once as `@AppMark` context.
4. In Plan Mode, a visual plan can expose `Show app preview` or `Compare options`.
5. Compare Options shows up to three compact options labeled A/B/C. Only the selected option is interactive.
6. Switching options removes the previous temporary injected UI and injects the selected option into the same live app route.
7. The user can click the proposed UI enough to understand simple temporary states.
8. `Yes, implement this plan` or `No, and tell Codex what to do differently` includes the selected variant, route, viewport, temporary interaction state, cleanup status, preview URL, and area mark context.
9. `Dismiss Esc`, project switching, hiding proposed UI, resetting, or reloading removes temporary injected UI and leaves the real app unchanged.

## Product Contract

- Plan Mode remains the implementation permission mode.
- The live running app is the visual planning surface for this workflow.
- Proposed UI is temporary review context, not a code implementation and not durable Canvas memory.
- Normal chat area marks work without requiring `@Canvas`, `@Preview`, or Plan Mode.
- The main UI does not expose DOM tag editing, CSS property panels, debug logs, or raw backend UI as the product workflow.
- If a preview URL is unavailable, wrong, blocked, or not an HTML app, the user gets a product-facing unavailable state instead of a blank/debug page.

## Implementation Completed

- Phase 1 - Direction replacement: complete. Product docs distinguish legacy coordinate Canvas from the live-app planning direction.
- Phase 2 - Electron preview host: complete. The app uses an Electron `<webview>` guest for previews and enables desktop-controlled URL probing/discovery.
- Phase 3 - Preview lifecycle: complete. Preview URLs are remembered per project, project switching avoids stale cross-project previews, Codex backend ports are rejected, and unavailable states are explicit.
- Phase 4 - Temporary UI injection: complete. The selected `PlanPreviewVariant` is injected into the guest app page through a scoped shadow root and cleaned up before every variant/lifecycle transition.
- Phase 5 - Plan Mode handoff: complete. Accept/revise context includes selected variant details, route, preview URL, viewport, interaction state, cleanup status, and area mark context.
- Phase 5a - Normal chat preview mark handoff: complete. Drawing an area mark outside Plan Mode creates a removable `App mark` composer chip and serializes it as one-shot `@AppMark` context.
- Phase 6 - Verification and comparison: complete for the P09 product implementation. The Electron app was rebuilt, reloaded, and compared against the intended live-preview workflow. A sample Plan Mode implementation accept was not clicked in fixture projects to avoid changing them; the selected preview handoff was verified through the revise path, and accept uses the same decision-summary path.

## Out Of Scope

- Full Figma-like design tooling.
- Direct DOM/CSS editing as the primary product workflow.
- Persistent coordinate overlays on top of the live app.
- Automatic source-file rewrites from a clicked DOM node without agent investigation.
- Multi-user collaboration.
- Remote production-site editing.
- A generic browser DevTools clone.
- A separate top-level UI/Canvas mode that competes with Plan Mode.

## Verification

- Build: `corepack pnpm --dir apps/desktop build` passed.
- Cleanliness: `git diff --check` passed.
- Desktop shell: the real Electron app was launched from the built desktop output and left open.
- Requested Desktop projects were visible in the app/project state: `example`, `Go_project`, `React_project`, `P05_clean_go_project`, `P05_clean_react_project`, `agent1`, `agent2`, `agent3`, and `agent4`.
- Interface-heavy dogfood: `React_project` running on `http://127.0.0.1:5173/`.
  - Normal App Preview opened the real app webview.
  - Drawing a rectangle produced a nonzero `App mark` composer chip.
  - Sending a real marked-area prompt included `@AppMark` context.
  - Plan Mode produced A/B/C options, injected one selected option into the guest app page, cleaned up on option switch, tracked route/viewport/interaction state, and sent selected option context through revise.
- Backend/workflow-heavy dogfood: `Go_project` running through WSL on `http://localhost:8080/`.
  - Windows `go.exe` was not on PATH; WSL Go 1.25.0 was used with a temporary SQLite database.
  - With no remembered URL, the app showed the unavailable state instead of leaking the React preview.
  - A blocked Codex bridge URL was rejected with an honest message and no crash.
  - The Go preview opened in a real webview, route changes were detected after clicking inside the guest page, and the host route chip updated.
- Final screenshots were captured for visual proof:
  - `.tmp/p09-react-plan-preview.png`
  - `.tmp/p09-go-preview.png`

## Residual Notes

- Installer packaging for the Electron shell remains separate from P09.
- If a future project has no local preview server, the intended fallback is screenshot/text planning or legacy Canvas review where still applicable.
