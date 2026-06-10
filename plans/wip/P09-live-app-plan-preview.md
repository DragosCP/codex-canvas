# P09 - Live App Plan Preview

## Status

WIP. This plan replaces the old Live Canvas overlay direction. The live running app becomes the planning surface; proposed UI is temporarily injected into the app for review before implementation.

Current slice: shared desktop Live App Plan Preview UI is implemented, and the desktop shell is moving to Electron on this branch. The preview UI offers up to three temporary variants, opens a live app URL in the Inspector, swaps the selected proposal in one preview, supports temporary area marking, and includes the selected preview context in plan accept/revise prompts. Next: make preview area marks work in normal chat and automatically attach a composer chip when the user draws a rectangle. Full Electron-controlled page injection remains a later spike.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/wip/P02-visual-planning-canvas.md`
- `plans/wip/P08-unified-canvas-draft-overlay.md`

## User Workflow First

1. The user asks for a feature, ideally in Plan Mode when they want to review before implementation.
2. Codex starts or connects to the project's local app preview.
3. The user sees the real running app, not a generated Canvas made of containers.
4. Codex proposes the plan in chat and, when the plan has visible UI consequences, can provide up to three preview variants.
5. The plan card exposes `Show app preview` or `Compare options`.
6. The preview opens as option A/B/C tabs or compact comparison cards. Only one option needs to be interactive at a time.
7. Selecting an option loads the same real app route and injects that option's temporary proposed UI.
8. The proposed UI appears directly in the real app at the agent's best expected location. It is visually marked as proposed, usually muted/greyed, but it should still feel like app UI.
9. The user can click the proposed UI enough to understand the flow: menus open, drawers slide, tabs switch, dialogs appear, empty/error states can be previewed, and buttons can show their next temporary state.
10. If the proposed options miss the right location or shape, the user can press `Mark area`, draw a rectangle on the app/snapshot, and tell Codex what should happen there.
11. The marked rectangle is only communication context. It disappears after the revision or decision and is not saved as Canvas memory.
12. Codex revises one option or regenerates options when the user gives feedback.
13. `Yes, implement this plan` turns the selected preview variant and plan into real code changes.
14. `No, and tell Codex what to do differently` sends the user's feedback plus the selected preview/marked-area context for revision.
15. `Dismiss Esc` removes the temporary preview and leaves the real app unchanged.

Normal chat path:

1. The user opens the app preview from an active project without enabling Plan Mode and without typing `@Canvas`.
2. The user presses `Mark area` and draws a rectangle over the live preview.
3. The composer automatically shows a compact removable chip for that app mark.
4. The user types a normal request, such as "move the filters here and make the panel collapsible."
5. Sending the message includes the marked route, viewport, and rectangle context once. Removing the chip before send drops that context.

## Product Contract

- The live app is the Canvas for this workflow.
- Plan Mode is the permission mode: think, preview, and ask before writing code.
- Canvas/live preview is the visual surface, not a separate permission mode.
- Do not add a top-level `UI mode` or `Canvas mode` next to Plan Mode unless the owner explicitly changes this direction later.
- Normal chat can still attach visual context through `@Canvas` or a later `@Preview` mention. Plan Mode should automatically use the visual surface when the request has UI consequences.
- Normal chat can also attach visual context by marking the live app preview directly. The user should not need to know or type a mention first.
- When the user has not specified a clear design, Codex should prefer offering up to three preview variants before asking the user to manually mark a location.
- Do not build a second coordinate-based Canvas overlay on top of the live app as the primary experience.
- Do not rebuild Lovable-style DOM tag editing, CSS property panels, or raw element selection as the user-facing workflow.
- Proposed UI is a temporary planning prototype injected into the live app. It is not the implementation and it must not silently edit project files.
- Proposed UI should use product-facing labels and app-like behavior. Users should experience "this is how the feature would feel," not "this is a selected div."
- Location feedback is lightweight: screenshot/rectangle marking, a short instruction, and agent revision. It is not persistent design geometry.
- Outside Plan Mode, a completed area mark automatically becomes a composer chip. The chip is the user's confirmation that the next prompt includes the marked app area.
- Plan approval is still the implementation gate. Codex edits real code only after the user accepts.
- If live injection is blocked, Codex should fall back to screenshot marking plus a textual plan instead of pretending it can precisely edit the UI.
- The old grid Canvas can remain as legacy/project-memory infrastructure while existing plans depend on it, but it is not the desired future UX for visual planning.

## UI / UX Placement

- The project `Canvas` entry should eventually open the live app planning surface when a preview is available.
- In Plan Mode, the plan card remains the official decision surface: implement, revise, or dismiss.
- The plan card can expose `Show app preview` when there is one visual proposal, or `Compare options` when Codex has generated variants.
- Option controls should be compact and obvious: `A`, `B`, `C`, plus a short title/tradeoff for each option.
- Switching options should clean up the current injected UI before injecting the next option. It should not start three dev servers or write three branches of code.
- The preview surface uses the real app viewport with compact top chrome:
  - route or URL chip
  - viewport selector
  - reload
  - reset preview
  - `Mark area`
  - proposed UI visibility
- Proposed UI should be integrated into the app layout, not drawn as a separate blue-box layer.
- Proposed controls may be muted, ghosted, or tagged with a small temporary affordance so users know they are reviewing a plan.
- Avoid persistent layer panels, coordinate inputs, DOM badges, and design-property inspectors in this workflow.
- When the user clicks a proposed item, show the next temporary state in the same preview where possible.
- When the user marks an area, freeze or snapshot the preview just long enough to draw the rectangle, then return to interactive preview after feedback is submitted.
- Preview unavailable states should be short and actionable: choose URL, start app command, retry, or continue with a text/snapshot plan.

## Implementation Direction

### Phase 1 - Replace The Direction

Status: complete for this slice.

- Update product docs and plan language to remove the live app plus Canvas overlay model.
- Treat old Canvas draft overlays as existing implementation state, not the future product direction.
- Keep plan acceptance/revision semantics unchanged while changing the visual review surface.

### Phase 2 - Electron Preview Spike

Status: in progress. Electron is now the desktop shell target for this branch; the shell migration preserves the app-server sidecar and origin-stripping bridge while opening the path for deeper controlled-browser preview work.

- Validate whether an Electron-based shell gives the control needed for the new workflow:
  - load a local app preview in a controlled browser view
  - inject temporary preview UI into the page
  - switch between up to three preview variants without writing project files
  - preserve app clicks, focus, route changes, and composer input
  - reset injected UI cleanly
  - capture screenshots and area marks
- Keep the migration boundary documented while replacing the existing Tauri shell.
- If the spike fails, record the exact blocker and fall back to screenshot marking plus plan text.

### Phase 3 - Preview Host And App Lifecycle

Status: started. The Inspector preview host can load a user-provided local URL and preserve it per project; automatic app discovery/start is still pending.

- Add project preview state: URL, route label, viewport, availability, last opened time, and reset status.
- Add a preview host that can start from a known URL or a user-selected local dev server URL.
- Retarget preview state safely on project switch so one project's app never appears in another project's planning context.
- Keep the preview honest: if the app is not running, show a short recovery path instead of a blank editor.

### Phase 4 - Temporary UI Injection

Status: started. The current slice renders temporary proposed UI on the preview surface and supports option switching; deeper Electron page injection and cleanup validation are still pending.

- Define a small `PlanPreviewSpec` with up to three `PlanPreviewVariant`s for proposed UI and behavior:
  - option ID and short title
  - tradeoff summary
  - placement intent
  - component kind
  - visible copy
  - visual state
  - interactions/states
  - implementation notes for Codex
- Inject only the selected proposal variant into the live app with scoped styles and predictable cleanup.
- Option thumbnails/screenshots can be captured lazily. The app should not fully implement or build the variants before approval.
- Prefer placing proposed UI by semantic app anchors when available: visible text, accessibility role/name, route area, or user-marked area.
- Avoid hard dependency on exact DOM selectors. Source investigation happens during implementation, after approval.
- Provide a snapshot/mark-area fallback for apps where injection is unsafe or impossible.

### Phase 5 - Plan Mode Handoff

Status: started. Selected preview variant and area mark context are included when the user accepts or revises a plan.

- Extend Plan Mode context with preview URL, route, viewport, preview variants, selected variant, interaction state, and any temporary area mark.
- Send this context only when the user explicitly asks for revision or accepts implementation.
- Keep the plan text and injected preview synchronized enough that a user can trust both surfaces describe the same feature.

### Phase 5a - Normal Chat Preview Mark Handoff

Status: in progress.

- Make the live app preview available for an active project even when there is no pending Plan Mode proposal.
- When the user draws an area mark in that preview, create a compact composer context chip automatically.
- Include the selected route, viewport, and rectangle in the next submitted prompt context.
- Removing the chip removes the mark context.
- Keep this product-facing: no DOM tags, selectors, backend logs, or coordinate debug panels in the main workflow.

### Phase 6 - Implementation And Verification

Status: in progress for this slice.

- After approval, Codex investigates the real code and implements the feature.
- Reload the live app preview after implementation.
- Compare the real result to the accepted temporary preview.
- If the implementation differs materially, report the mismatch instead of claiming the preview was fulfilled.

## Data Model Sketch

- `ProjectPreviewState`: project ID, URL, route label, viewport, status, error, updated timestamp.
- `PlanPreviewSpec`: one to three preview variants plus shared plan context.
- `PlanPreviewVariant`: option ID, title, tradeoff summary, proposed components, placement intent, copy, visual state, temporary interactions, and implementation notes.
- `PlanPreviewSession`: preview ID, route, viewport, active variant ID, current temporary state, screenshot reference, optional area mark, and cleanup status.
- `AreaMark`: screenshot bounds, route, viewport, user instruction, and timestamp. It is temporary context, not durable Canvas geometry.

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

- For documentation-only work, read back the changed plan and durable docs.
- For implementation work, run the desktop app in the chosen shell and verify the workflow in the real app.
- Dogfood in two local projects when feasible:
  - one interface-heavy project with a running web UI
  - one backend/workflow-heavy project where live preview may be absent
- Check: open preview, switch project, reload route, generate up to three options, switch options, inject proposed UI, click through temporary states, mark an area, auto-attach a composer chip outside Plan Mode, revise the preview, accept implementation, dismiss preview, and confirm cleanup.
- Confirm no project files change until explicit implementation approval.

## Blockers To Record

- The app cannot start or discover a preview URL.
- Injected preview UI cannot be isolated or cleaned up reliably.
- Preview interaction steals focus from composer or Plan Mode controls.
- Project switching leaves the wrong app or injected preview visible.
- The user sees raw DOM tags or CSS properties as the primary workflow.
- The injected preview diverges from the accepted plan text.
- The implementation result cannot be compared honestly to the accepted preview.
