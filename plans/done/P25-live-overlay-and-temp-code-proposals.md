# P25 - Live Overlay And Temp Code Proposals

## Status

- Done for the live-overlay proposal lane.
- Static `.codex/mockups` remain as explicit/fallback review artifacts.
- Temporary code preview for complex structural changes was investigated as a later lane, not implemented in this slice.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`
- `plans/done/P23b-unified-preview-shell-and-overflow.md`
- `plans/P24-proposal-preview-agent-marks-and-routing.md`
- `plans/wip/P22-route-aware-preview-proposals.md`
- `plans/wip/P22b-view-state-preview-proposals.md`

## Goal

Make proposal previews for existing runnable apps scale beyond copied static mockups.

For small placement and interaction ideas, Codex should preview choices against the real Live app with hidden proposal metadata and `Show changes` marks, without injecting Codex-authored UI into the app surface. For larger structural changes, Codex should use an isolated temporary code preview. Full standalone HTML mockups should remain available for early concepts, blank projects, and fallback cases, but should not be the default for every existing-app change.

## User Workflow Contract

### 1. Existing App, Small Placement Change

- User has a running Live app.
- User asks something like:
  - `Where should a settings button go?`
  - `Show me a quick proposal for filters here.`
  - `Try a compact task action in this header.`
- Codex creates a temporary proposal against the Live app.
- The preview header shows:
  - `Live | Proposal` for one direction; or
  - `Live | A | B | C` for multiple lightweight directions.
- The Canvas v2 preview header is owner-locked. This plan must not be read as permission to change button labels, order, grouping, or visibility without explicit owner consent. Preserve the contract in `docs/UI-UX.md`.
- The user can click `Show changes` to see agent marks around the inserted or changed areas.
- The real project files are not changed until the user accepts.
- If the user accepts, Codex implements the chosen overlay proposal in real code.

### 2. Existing App, Multiple Lightweight Directions

- User asks for options or directions on an existing app.
- If the changes are small enough to overlay, Codex should avoid copying the entire UI into static HTML files.
- Each option should be a compact proposal spec applied over Live:
  - option A might place a button in the header;
  - option B might place it in a profile/settings menu;
  - option C might place it in bottom navigation.
- Switching A/B/C swaps selected proposal metadata and change marks on the same Live app, not separate copied HTML documents.

### 3. Existing App, Complex Structural Change

- User asks for a broader change:
  - redesign a whole dashboard;
  - add a real new page;
  - change navigation structure;
  - preview a multi-step workflow;
  - change stateful interactions that cannot be represented honestly as an overlay.
- In the implemented P25 slice, Codex should use the existing saved-artifact fallback honestly rather than pretending temporary code preview exists.
- A future isolated code-preview lane should keep the same mental model:
  - `Live | Proposal`; or
  - `Live | A | B | C`.
- The real project remains untouched until acceptance.
- Accepted proposal changes are applied to the real project.
- Rejected or abandoned proposals can be discarded.

### 4. Blank Project Or Early Ideation

- Static wireframes/mockups remain appropriate when:
  - the project is empty;
  - no runnable app exists;
  - the user explicitly asks for wireframes or mockups;
  - the desired work is broad visual exploration before implementation.
- The current `.codex/mockups` artifact model remains useful here.

### 5. Post-Acceptance Verification

- After any proposal is implemented, `Live` becomes the source of truth.
- The chosen proposal may remain temporarily as a verification source.
- Future forward-looking prompts should work from Live and create fresh proposals, not continue old proposal artifacts.

## Current Problem

- Existing-app preview-first and A/B/C flows currently lean on saved `.codex/mockups` HTML artifacts.
- For a small app, copied HTML proposals are acceptable.
- For larger apps, this means Codex may duplicate hundreds or thousands of lines of UI for every option.
- The result is slower, more expensive, more likely to drift from real code, and less useful when the app has multiple routes, dynamic state, or component-level behavior.

## Current Implementation Findings

Checked against the desktop implementation before this slice:

- Existing runnable app prompts are split between two preview systems:
  - Normal chat current-app proposal flows use saved `.codex/mockups` artifacts.
  - Plan Mode can use temporary live preview variants through a fenced `codex-plan-preview` JSON block.
- `apps/desktop/src/App.tsx` routes current-app visual decision and explicit preview-first turns through prompt wrappers that still tell the agent to create saved HTML review previews under `.codex/mockups`.
- `apps/desktop/src/App.tsx` also has a Plan Mode wrapper that already says: for an existing running app, prefer temporary live preview variants when enough context exists, and include a `codex-plan-preview` JSON block.
- `apps/desktop/src/components/LiveAppPreview.tsx` already has a live proposal lane:
  - it registers temporary proposal state for the controlled Electron webview;
  - it cleans up the hidden proposal root with `codex-live-plan-preview-root`;
  - it tracks temporary interaction state on `window.__codexPlanPreview`;
  - it supports switching between one to three variants.
- The current live proposal spec is intentionally coarse. `PlanPreviewSpec` supports only A/B/C variants with `topbar`, `sidePanel`, or `modal` placement and generic component descriptions. It does not yet target real app regions, route/view state, changed-element highlights, or multi-page flows.
- Saved mockup highlights already exist separately. `.codex/mockups/manifest.json` entries can include `highlights`, Electron normalizes them, Mockup Preview renders them as temporary proposal overlays, and adjusted highlights become supporting composer context.
- There is no equivalent highlight model in `PlanPreviewSpec` yet, so Live overlay proposals cannot currently power the same `Show changes` behavior as saved mockups.
- There is no temporary code preview lane yet. Managed App Preview starts the real project preview, and `.codex/mockups` reads static HTML artifacts, but there is no disposable worktree, patch lane, or copy-on-write runnable preview path for complex proposals.

Implication: P25 should first reuse and graduate the existing live proposal path instead of inventing a parallel preview system. The missing work is routing, schema depth, highlights, and acceptance handoff.

## Implemented Outcome

- Normal-chat existing-app preview-first choices can create `live_proposal` review turns using the existing `codex-plan-preview` live proposal metadata format.
- Small current-app placement/control/menu/panel requests prefer temporary Live overlay proposals instead of saved copied HTML mockups.
- `PlanPreviewSpec` now carries route, view state, target region, and per-variant proposal highlights.
- Live Preview renders `Show changes` for proposal highlights and shows those agent marks when toggled. It must not inject visible Codex proposal chrome such as `Proposed` banners, fake buttons, or generic proposal cards into the user's app.
- The chat proposal card names the selected variant, exposes `Compare options`, and accepts live proposals through an explicit implementation turn.
- The completion path preserves streamed hidden proposal blocks so preview specs survive app-server completion/list refresh.
- Decision-strip stripping now tolerates nested/backtick mistakes and keeps hidden control JSON out of chat text.
- Complex structural changes still use the existing honest fallback path until a real temporary code preview lane exists.

## Product Direction

Use the lightest honest preview layer:

1. **Live overlay proposal**
   - Best for small placement, copy, control, panel, sheet, modal, and local interaction proposals.
   - Does not duplicate the whole app.
   - Uses the real Live Preview plus hidden proposal metadata and `Show changes` marks.
   - Must not render Codex proposal banners, fake buttons, generic cards, or other visible proposal chrome inside the user's app.

2. **Temporary code preview**
   - Best for larger structural changes that need real component code, routing, app state, or multi-step behavior.
   - Should be isolated from the real project until acceptance.
   - Can behave like a disposable preview branch/worktree or patch lane.

3. **Static mockup/wireframe**
   - Best for blank projects, early ideation, explicit wireframes/mockups, or fallback when Live is unavailable.
   - Should not be the default for small existing-app changes.

## Proposed UX Model

### Header Labels

- `Live`: current real app.
- `Proposal`: one temporary candidate based on Live.
- `A/B/C`: multiple temporary candidates based on Live.
- `Source`: optional verification reference after implementation.
- `History`: older proposal artifacts and unselected alternatives.

### Actions

- `Show changes`: reveal agent marks for changed proposal areas.
- `Mark live area`: user marks the real app as context.
- `Mark proposal`: user marks a proposal to revise it.
- `Build selected`: accept the selected proposal and implement it in real code.

## Architecture Direction

### Live Overlay Proposal Spec

- Evolve the current `codex-plan-preview` temporary proposal metadata format where possible before introducing a separate concept.
- The compact proposal spec needs to express:
  - target route or route status;
  - target region or placement;
  - inserted controls;
  - temporary panels/modals/sheets;
  - simple interaction states;
  - agent mark/highlight metadata.
- Keep proposal specs small and product-facing.
- Do not represent changes as DOM tag editors or CSS property panels.

### Temporary Code Preview

- Investigate an isolated preview lane for larger changes:
  - disposable worktree;
  - generated patch branch;
  - copy-on-write project preview folder;
  - or another app-server-supported temporary workspace.
- The lane must make it obvious that the real project has not changed yet.
- Accepting a proposal should apply the chosen change to the real project through the normal Codex implementation flow.

### Static Mockup Fallback

- Keep `.codex/mockups` support.
- Use it for blank projects, user-requested wireframes/mockups, Live-unavailable fallbacks, or very broad visual exploration.
- Make existing-app prompt routing prefer Live overlays before static mockups when feasible.

## Implementation Phases

### Phase 1 - Routing And Classification

- Done: graduated the existing live overlay preview path out of Plan Mode for suitable normal-chat current-app proposal turns.
- Done: added a proposal preview classifier:
  - small existing-app visual change -> Live overlay;
  - complex existing-app structural change -> saved artifact fallback for now;
  - blank/early concept -> static mockup.
- Done: updated prompt wrappers so existing-app quick previews do not default to full copied HTML when overlay is enough.
- Done: preserved direct implementation for precise small requests.

### Phase 2 - Overlay Proposal Spec

- Done: evolved `PlanPreviewSpec` instead of adding a parallel `LiveProposalSpec`.
- Done: supports one or multiple options.
- Done: includes `highlights` for `Show changes`.
- Done: adds route/view-state/target-region hooks.
- Done: adds parser, stripper, and completion-merge regression tests.
- Done: keeps backward compatibility with current `codex-plan-preview` blocks and tolerates missing top-level `version`.

### Phase 3 - Live Proposal Renderer

- Done: records selected proposal metadata for the existing Live App Preview webview without rendering visible Codex proposal UI into the user's app.
- Done: supports option switching without copying the full app.
- Done: supports visible proposal highlights in the desktop overlay layer that match the saved mockup `Show changes` behavior.
- Existing cleanup behavior remains owned by the Live Preview proposal-selection lifecycle.

### Phase 4 - Acceptance Handoff

- Done: serializes the selected overlay proposal as supporting context.
- Done: user-visible text remains authoritative and hidden support text is stripped from chat.
- Done: Codex implements the accepted proposal in real project files only after explicit accept.
- Manual dogfood confirmed accepted option A changed real `example_d` files after acceptance.

### Phase 5 - Temporary Code Preview Investigation

- Investigated only. This slice does not prototype temporary code preview.
- Keep complex structural changes on saved artifact fallback until there is a real isolated code-preview lane.
- Do not represent unbuilt temporary code preview as user-visible capability.

### Phase 6 - Static Mockup Narrowing

- Done: static `.codex/mockups` remain for explicit wireframes/mockups, blank projects, broad visual exploration, and fallback cases.
- Done: full copied HTML is no longer the default for small existing-app quick preview.
- Existing saved mockup history remains readable.

## Verification

- Automated:
  - `npm --prefix apps/desktop run test:p25`
  - `npm --prefix apps/desktop run test:p19`
  - `npm --prefix apps/desktop run test:p24`
  - `npm --prefix apps/desktop run test:p20`
  - `npm --prefix apps/desktop run build`
- Manual Electron:
  - passed in real `Codex Local` Electron via CDP on `example_d`;
  - vague settings prompt produced a decision strip and did not edit files;
  - `Show 2-3 directions` produced a `live_proposal`, not `.codex/mockups`;
  - `Compare options` opened the current Live proposal with `Live | A | B | C`;
  - `Show changes` rendered a proposal highlight over the live preview;
  - accepting option A edited real `example_d` files only after acceptance.
  - not re-dogfooded in a second project in this slice.

## Acceptance Criteria

- Existing-app small preview requests do not copy the whole app into standalone HTML files by default.
- A/B/C for small current-app changes are fast, lightweight overlays on Live.
- Static HTML proposals remain available only for the right cases.
- Users can clearly tell whether they are seeing Live, a proposal overlay, a temporary code preview, or history.
- No accepted implementation contains proposal-only overlay chrome.
- Proposal marks/highlights survive option switching and serialize as supporting context.
- Rejected or abandoned proposals do not mutate real app files.
- Temporary code preview remains an open follow-up and is not represented as implemented UI.

## Open Questions

- What is the smallest proposal spec that can cover useful overlays without becoming a DOM/CSS editor?
- Where is the boundary between Live overlay and temporary code preview?
- Should temporary code previews use real git worktrees, app-server-managed sandboxes, or copied preview folders?
- How should source verification look after a temp code preview is accepted?
- Should the user ever see the implementation mechanics, or only `Live | Proposal`?
