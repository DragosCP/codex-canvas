# P19b - Active Proposal History And Preview Header

## Status

- Completed.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`

## Goal

Fix P19 regressions where old starting mockups reappear as active proposals after a real Live app exists, and make the Live/Preview Compare header stable and polished across Live and proposal tabs. Add proposal highlight metadata so generated proposal previews can call out added or changed areas, and the user can adjust those highlights as revision/implementation context.

## User Workflow Contract

### 1. Build From Initial Mockups

- User starts from an empty project and asks for a simple app.
- Codex may create initial A/B/C mockups before implementation.
- User chooses one and builds it into real app files.
- Once build starts, those initial mockups become history/reference only.
- The above-composer mockup selector disappears and must not come back for that built app unless a new active proposal set is created for the current thread/request.

### 2. Existing App Follow-Up Before New Proposals

- User opens/runs Live app, marks an area, and asks for a UI/UX change.
- If the request is clear and location is clear, direct implementation is allowed.
- If the user asks to see it first, asks for wireframes/preview/directions, or the change could fit in multiple places, Codex should first use the current-app decision workflow.
- Before a new proposal artifact exists, the preview surface should show Live only. It must not reuse old starting mockups as `Live | A | B`.

### 3. Current-App Decision Choices

- Broad/uncertain existing-app UI prompts show the decision strip:
  - `Build directly`
  - `Show quick preview`
  - `Show 2-3 directions`
- Choosing `Show quick preview` creates one new Live-based proposal and shows `Live | Preview`.
- Choosing `Show 2-3 directions` creates new Live-based proposals and shows `Live | A | B | C`.
- Proposal labels must describe user-facing workflow concepts, not generic placement buckets.

### 4. Preview Header UX

- Live Preview and Preview Compare use one consistent compact header layout.
- Segment switcher position remains stable while switching `Live -> A -> B -> C`.
- Shared actions stay in a predictable action cluster.
- Compare-only actions such as `Revise`, `Add`, and `Build selected` appear in the same action cluster area without shifting the segment switcher.
- Avoid duplicated title/status chrome and keep maximum vertical space for the preview content.

### 5. Proposal Highlights

- When proposal previews are generated, the agent should describe visual areas it added or changed as highlight metadata.
- The preview renders proposal highlights as soft draggable/resizable overlays, distinct from user marks.
- The user can move or resize a highlight and send it as supporting context for revision or implementation.
- Accepted implementation must not keep highlight chrome.

## Implementation Phases

### Phase 1 - Active Proposal State

- Done: built starting mockups switch to history/reference mode, composer selectors hide after build, and current-app compare tabs require a fresh current-request proposal set.

### Phase 2 - Existing-App Decision Routing

- Done: ambiguous preview/wireframe-first follow-ups show the current-app decision strip; clear direct, single-preview, and multi-direction requests keep their intended paths.

### Phase 3 - Unified Header

- Done: Live Preview and Preview Compare share compact header structure, with a stable segmented switcher and predictable action cluster across Live/A/B/C tabs.

### Phase 4 - Proposal Highlights

- Done: proposal highlight metadata is loaded from mockup manifests, rendered as soft adjustable overlays, and serialized as supporting composer context when moved or resized.

### Phase 5 - Verification

- Done: re-ran the recipe app flow in real Electron with a fresh desktop test project.
- Verified: old A/B mockup selector disappears after build and old mockups stay history-only; preview-first follow-up shows current-app decision strip; `Show 2-3 directions` creates fresh current-app proposals with `Live | A | B | C`; header tab/action positions stay stable across Live and proposal tabs; proposal highlights are adjustable and attach context.
- Automated checks run: `npm --prefix apps/desktop run test:p19`, `npm --prefix apps/desktop run build`
