# P15 - Mockup Marks And History Lifecycle

## Status

Completed. Implemented the owner's mockup mark and post-build history workflow, then verified it in Codex Local using `C:\Users\drago\Desktop\agent5`.

## Relevant Docs

- `docs/Prod.md`
- `docs/UI-UX.md`
- `docs/Arch.md`
- `plans/done/P14-mockup-preview-as-preview-surface.md`

## User Workflow First

### Active Mockup Decision

1. Before implementation, saved mockups appear as one compact `A`, `B`, `C` selector above the composer.
2. Clicking an option opens Mockup Preview and switches the active preview.
3. Mockup Preview shows `A`, `B`, `C`, `Mark area`, `Revise`, `Add`, and `Build selected`.
4. `Build selected` only stages an editable composer prompt. The user still presses Send.

### Named Marks

1. Every mark gets a stable product-facing name:
   - `Area A mark 1`
   - `Area A mark 2`
   - `Area B mark 1`
2. The same name appears on the preview rectangle and the composer chip.
3. Marks never block clicks after drawing. The rectangle is visual-only.
4. Removing a mark chip from the composer removes the matching rectangle from Mockup Preview.
5. To move a mark, the user removes the chip and draws a new mark.
6. Multiple marks can coexist across options and are sent with the next prompt.

### After Build Selected Is Sent

1. Once the user sends a staged `Build selected mockup` prompt, the active mockup decision ends.
2. The above-composer `A`, `B`, `C` strip disappears.
3. Mockup Preview becomes history/reference mode:
   - still shows one option at a time,
   - still allows `Mark area`,
   - keeps `A`, `B`, `C` as history pages,
   - hides `Revise`, `Add`, and `Build selected`.
4. Activity keeps individual saved mockup rows so the user can reopen A/B/C later as records.
5. History mockups remain clickable/interactive and markable, but no longer compete with the final app build workflow.

## Implementation Shape

- Add a `markLabel` to mockup composer contexts.
- Compute mark numbers per project/mockup from current composer contexts when a new mark is created.
- Render mockup marks from composer contexts instead of local-only component state.
- Remove overlays when the corresponding composer chip is removed.
- Track per-project built mockup sets locally once a build-selected prompt is sent.
- Hide active composer strip for built mockup sets.
- Pass Mockup Preview a mode so history mode hides revise/add/build and keeps only selector plus marking.
- Update hidden prompt guidance to ask generated mockups to include lightweight interactions when the user chose wireframe/full-demo quality.
- Update build-selected prompt guidance so the agent implements files but does not launch preview/server processes; App Preview owns server start/stop.

## Verification

- Built the desktop bundle with `corepack pnpm --dir apps/desktop build`.
- Used `agent5` as a normal user with: "Build a tiny app for planning weekend chores with rooms, people, and a done list."
- Chose wireframes from the visible flow; the agent created two interactive HTML mockups under `.codex/mockups`.
- Confirmed the active composer strip showed only `A` and `B`; Mockup Preview owned `Mark area`, `Revise`, `Add`, and `Build selected`.
- Confirmed full-demo/wireframe mockup buttons worked: `Add chore` opened a drawer and `Done` filtered tasks.
- Confirmed marks were named and mirrored: `Area A mark 1`, `Area A mark 2`, and `Area B mark 1`.
- Confirmed removing the `Area B mark 1` composer chip removed the matching rectangle.
- Confirmed marked preview controls remained clickable because saved rectangles are visual-only.
- Confirmed `Build selected` staged `Build selected mockup: Board With Side Lists` and did not auto-send.
- Sent the staged build prompt. The previous prompt guidance allowed a server process to be launched during implementation; the app files were created, but the turn stayed running until the process/approval was handled. Fixed the build-selected hidden prompt so future turns do not run preview/server commands and leave server launch to App Preview.
- Confirmed the tightened no-server build-selected rule is present in both `apps/desktop/src/App.tsx` and the rebuilt desktop bundle.
- Confirmed after send/restart that the composer A/B strip disappeared, Activity listed individual mockup rows, and history Mockup Preview kept only `A`, `B`, and `Mark area`.
- Confirmed a history mockup can still be marked and interacted with.
- Ran App Preview for the built `agent5` app; it started the managed preview at `127.0.0.1:3000` and loaded `Weekend Chore Planner`.
- Compared real app to selected mockup A: workflow matches room categories, task list, done filtering, and add-chore drawer; it is not pixel-identical because the final implementation made the layout more polished and rearranged some sections.
- Final visual proof saved at `.cache/p15-agent5-history-proof.png`, `.cache/p15-agent5-real-preview.png`, and `.cache/p15-agent5-real-preview-click.png`.
- Electron is left open with the managed `agent5` App Preview running.
