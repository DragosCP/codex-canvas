# P22 - Route-Aware Preview Proposals

## Status

- Plan only. No implementation has started.
- Created after investigating the current Live App Preview, Mockup Preview, decision strip, mark serialization, Plan Mode preview, docs, and completed P19/P19b context.
- P19 is now in `plans/done/`, not `plans/wip/`. The current WIP plan is P17, and this is the next numeric plan after P21.

## Relevant Docs

- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/wip/P17-existing-app-visual-decision-lifecycle.md`
- `plans/done/P19-visible-build-and-live-proposal-lifecycle.md`
- `plans/done/P19b-active-proposal-history-and-preview-header.md`

## Direction Precedence

- P22, P22b, P19, and P19b are the current visual-preview direction.
- `plans/wip/P17-existing-app-visual-decision-lifecycle.md` is useful background, but if P17 conflicts with P22/P22b/P19/P19b, follow the newer route/view-state preview direction.
- Do not revive older visual-planning assumptions, legacy Canvas behavior, generic local placement templates, or old builder-tab paths.

## Goal

Make preview proposals, marks, highlights, and Plan Mode visual context route-aware for multi-page apps. Route context becomes part of proposal identity, not a loose label. Users can compare `Live | Preview` or `Live | A | B | C` while seeing the relevant route/page context, and old starting mockups remain history only after build.

## Investigation Summary

- Current Live App Preview already captures a route string from the Electron webview URL on load, navigation, and in-page navigation, then serializes it into `PlanPreviewSessionState.route` and mark `areaMark.route`.
- Current Live proposal identity is turn/variant based. `PlanPreviewSpec` variants do not declare route targets, new-route status, or multi-route flows.
- Current App Preview mark context replaces the previous Live mark for the project, so it cannot represent multiple marks on different routes yet.
- Current Mockup Preview can compare `Live | Preview` or `Live | A | B | C` and already hides Live for blank projects or shows unavailable controls for stopped app previews.
- Current saved mockup manifest highlights load through Electron, normalize bounds, render as blue dashed draggable overlays, and serialize adjusted highlights as `proposalHighlight` mockup context.
- Current prompt wrappers pass Live mark route strings and remembered preview URL as plain text. They do not distinguish current route, source route, target route, route pattern, hash route, query state, or proposed route.
- Current Plan Mode preview parser accepts only placement-based temporary UI variants. It does not support route/page metadata, new route previews, or multi-step route flows.
- Current post-build history guard exists: build-selected marks saved mockups history-only, hides active composer selectors, and fresh current-app proposal tabs require a new artifact set.

## User Workflow Contract

### 1. Mark Current Live Route

- User opens Live App Preview, navigates to a route, marks an area, and asks for a change.
- The composer chip reads `Live mark 1` plus a compact route hint when useful, such as `/settings`.
- The next send includes project, preview URL, viewport, route identity, normalized rectangle, note, and timestamp.
- If the request is clear, Codex implements directly on that route. If the request asks to see it first or is broad, Codex creates route-scoped proposals based on that route.

### 2. Mark One Route, Ask For Another

- User marks `/inbox` and says to make the same change on `/settings`.
- The mark keeps `sourceRoute=/inbox`; the typed request creates `targetRoute=/settings`.
- The prompt context must say the mark is visual reference only and the target route is `/settings`.
- Preview proposals should open on `/settings` when that route exists. If it does not exist, the proposed tab is labeled `New route: /settings`.

### 3. Broad UI/UX Change Without Route

- User asks for a broad change without naming a route.
- Codex uses current Live route as the default scope, but the decision strip and preview context say `Current route`.
- If the agent decides the change should span routes, it must author route/page metadata and the UI shows a route/page switcher in the preview header.
- The route/page switcher is hidden for single-route proposals.

### 4. New Page Or Route

- User asks for a page that does not exist.
- The proposal option can target a proposed route with status `not implemented in Live`.
- In compare, `Live` shows the nearest current route or the normal unavailable/start state. The proposed tab shows the review artifact or temporary route preview with a clear chip: `New route: /reports`.
- The app must not pretend Live has that route.

### 5. Agent Proposes New Route In A/B/C

- A/B/C can include different route decisions, such as `Add /reports`, `Extend /dashboard`, or `Split flow into /tasks/:id`.
- The tab remains `A`, `B`, or `C`; the route chip inside the header names the route.
- Route/page switcher appears only if the selected option spans multiple routes/pages.

### 6. Multi-Step Flow Across Routes

- A proposal can define a flow with ordered steps: route, page title, step summary, and expected user action.
- The preview header shows the selected option plus a compact stepper for the flow routes.
- Switching steps changes the preview target without changing the selected A/B/C option.
- Accept/revise context includes the selected option, selected step, full flow map, and any route-specific marks or highlight adjustments.

### 7. User Switches Live Route While Compare Is Open

- Compare state keeps the selected proposal route stable.
- Live navigation updates the `Live` route chip and can refresh current-route context, but it does not retarget proposal options automatically.
- If Live moves away from the proposal route, show `Live now at /x` and keep the proposal route chip as `Proposal /y`.

### 8. Proposal Route Not In Live

- Proposed route tabs render review artifacts or route previews and show `Not implemented in Live`.
- `Open Live route` is disabled or replaced by `Build to create route`.
- Accepting the proposal sends `targetRoute` and `routeStatus=new`.

### 9. Live Route Changes From Clicks While Comparing

- Electron webview route updates remain observed.
- Route changes caused by user clicks update only Live session state unless the user is actively marking or has selected a proposal route switcher item.
- The app never silently moves proposal marks/highlights to the clicked Live route.

### 10. Marks On Different Routes

- Users can create multiple Live marks if they are on different routes.
- Composer chips group by route: `Live mark 1 /dashboard`, `Live mark 2 /settings`.
- Removing a chip removes only that route mark.
- Same-project same-route replacement remains allowed for a single active mark unless the user explicitly marks another area before sending.

### 11. Move Or Resize Highlight On One Route

- Moving a proposal highlight creates adjusted highlight context scoped to that option and route.
- The changed chip reads as a proposal context, not a user mark, such as `Adjusted highlight: Filters /reports`.
- The adjustment applies only to that route unless the user says `apply everywhere`.

### 12. Apply Everywhere

- If the user says `apply this everywhere`, route scope becomes `global`.
- The prompt includes the source route or highlight as the example and asks Codex to inspect/apply equivalent UI patterns across relevant routes.
- The UI keeps the original mark/highlight on its route but the chip gains an `Everywhere` scope label.

### 13. Plan Mode Route-Aware Previews

- Plan Mode can emit route-aware preview metadata before implementation.
- The plan card still owns the official decision. Preview compare only supports understanding, marking, revising, or selecting the preview context.
- Accept sends selected option, selected route/step, route map, viewport, temporary interaction state, and route-scoped marks/highlight adjustments.
- Revise sends the same context plus typed feedback and keeps Plan Mode on.

### 14. Apps Without Standard Routing

- No router: route identity is `root` plus optional page title and interaction state.
- Hash routing: route identity includes hash path, such as `#/settings`.
- Query params: preserve meaningful query params in route identity only when they change the page state; otherwise keep them in `stateKey` rather than the display route.
- Query/state privacy rule: strip or avoid serializing token, session, auth, secret, key, password, invite, reset, or similarly sensitive-looking query parameters. Prefer a compact `stateKey` summary over raw query strings when query params are noisy or possibly sensitive.
- Local state-only views: route identity is `root` plus a desktop-observed `viewStateLabel` from title/interaction state or agent-authored metadata.

### 15. Preview Server Cannot Run

- Live keeps the existing honest unavailable/start/use-URL state.
- Route-aware proposals can still use saved mockup artifacts with route metadata.
- Plan/accept/revise context must state Live route was unavailable and proposal route was inferred from files, user text, or saved artifact metadata.

### 16. Saved Mockup Routes Vs Real Live Routes

- Saved mockup routes are artifact routes, not proof that Live has the route.
- Manifest entries can declare `routeTargets`; compare maps them against Live routes when available.
- If the artifact route matches Live, show both route chips. If it does not, show `Artifact route` and `Live route unavailable/not implemented`.

### 17. Old Starting Mockups After Build

- Built starting mockups remain history/reference only.
- History mockups can show their saved artifact route labels, but they cannot become active current-app route proposals.
- Fresh `Live | Preview` or `Live | A | B | C` compare tabs require a new current-request proposal set with its own route identity.

## UI Behavior

- Keep `Live | Preview` and `Live | A | B | C` as the primary comparison control.
- Add a route/page switcher only when the selected proposal spans multiple route targets or flow steps.
- Hard UI rule: the route/page/step switcher is preview-only and must not add a second header row or chip clutter for single-route/single-step proposals.
- Place route/page switcher in the preview header under the segmented compare control or as a compact adjacent chip group when width allows.
- Route chips use product labels first, such as `Dashboard`, with path in tooltip or secondary text, such as `/dashboard`.
- New route chips say `New route` and never imply Live availability.
- Live route changes show in the Live chip without stealing selected proposal route.
- User marks keep solid mark styling. Proposal highlights keep soft dashed highlight styling. Adjusted highlights become context chips and remain visibly different from user marks.
- Highlight chrome disappears after accepted implementation because it is review metadata only. The real app reload should show normal app UI without highlight overlays.
- In history mode, Mockup Preview can show route labels but no `Revise`, `Add`, or `Build selected` actions.

## State Model

- Introduce a reusable `PreviewRouteContext`:
  - `id`: stable route identity for proposal comparison.
  - `kind`: `live`, `artifact`, `proposed`, `stateOnly`, or `unknown`.
  - `displayName`: user-facing label.
  - `path`: pathname/hash/query string when available.
  - `url`: full Live URL when available.
  - `stateKey`: optional local state or query-state key.
  - `status`: `implemented`, `notImplemented`, `unavailable`, or `unknown`.
  - `source`: `desktop`, `agent`, `manifest`, or `user`.
- Extend marks and highlights to include `routeContext`, while preserving old `route` string for migration.
- Extend `PlanPreviewSpec` with route-aware metadata:
  - `routes`: route targets used by the proposal set.
  - each variant has `routeIds`, optional `defaultRouteId`, and optional `flowSteps`.
  - each component/highlight can reference `routeId`.
- Extend `MockupPreviewSet` and saved manifest entries with route targets:
  - per mockup `routeTargets`, `defaultRouteId`, and highlight `routeId`.
  - one-preview manifests use `Preview` label; multi-option manifests keep A/B/C.
- Store route-aware proposal identity as `projectId + threadId + proposalTurnId + optionId + routeId`.
- Composer context supports multiple app marks per project when route IDs differ.
- Project switches and new chats continue to hide and block context from other projects or unrelated threads.

## Prompt And Context Model

- Route context is supporting context, never the hidden source of truth over visible user text.
- Every visual prompt wrapper that mentions Live context must include:
  - current Live route context;
  - attached mark contexts grouped by route;
  - selected proposal route or flow step when compare is open;
  - whether route is implemented in Live, proposed, artifact-only, or unavailable.
- For source-route-to-target-route requests, prompt text must explicitly separate:
  - `sourceVisualReferenceRoute`;
  - `targetImplementationRoute`;
  - `scope`: `singleRoute`, `flow`, or `global`.
- For `apply everywhere`, prompt scope is `global`, but the original marked route remains the example.
- Agent-authored metadata:
  - proposed route display names, route paths, new-vs-existing intent, option route maps, flow steps, and highlight semantic labels.
- Desktop-inferred metadata:
  - current Live URL, current route, preview availability, viewport, mark rectangles, drag/resize deltas, project/thread ownership, stale history state, and whether a remembered preview URL belongs to another project.
- The desktop may infer route kind for hash/query/no-router cases, but the agent must author route intent for new pages and multi-route flows.

## Lifecycle

1. User opens Live or Mockup Preview.
2. Desktop records current route context from webview URL, manifest, or fallback state.
3. User marks areas or adjusts highlights; composer chips carry route-scoped context.
4. User sends a prompt. The prompt wrapper includes visible text plus route-aware supporting context.
5. Decision strip, Plan Mode, or preview-first flow creates a route-aware proposal set.
6. Preview compare opens automatically for fresh review artifacts or Plan Mode preview actions.
7. User selects option and route/step, moves highlights, marks areas, revises, builds, accepts, or dismisses.
8. Revise keeps review state active and sends route-scoped feedback.
9. Accept/build sends selected route proposal context as support, turns Plan Mode off when appropriate, and implementation writes real app files.
10. After implementation, proposal/highlight chrome is cleared, Live reloads or returns to start controls, and built mockups become history/reference.

## Implementation Phases

### Phase 1 - Route Context Types And Migration

- Add `PreviewRouteContext` and route-aware mark/highlight/proposal fields.
- Normalize old persisted state by mapping legacy `areaMark.route` strings into route contexts.
- Preserve P20 legacy visual-planning cleanup; do not revive removed canvas/editor state.

### Phase 2 - Live Route Tracking And Multi-Mark Chips

- Upgrade Live App Preview route tracking into normalized route context.
- Allow multiple Live marks per project when route IDs differ.
- Update composer chips, removal, and prompt serialization to show route hints without clutter.

Implementation note: implement Phase 1 and Phase 2 first as the foundational slice. Route types, migration, Live route normalization, multi-route mark chips, and prompt serialization should be stable before touching mockup manifests or Plan Mode schema.

### Phase 3 - Route-Aware Mockup Manifests And Highlights

- Extend `.codex/mockups/manifest.json` reading for route targets, default route, and highlight route IDs.
- Keep old manifests working.
- Scope adjusted proposal highlights to option plus route and serialize them as proposal highlight context.

Implementation note: mockup manifests, adjusted-highlight route IDs, and Plan Mode schema/parser changes have broader blast radius. They should come after Phase 1 and Phase 2 are green unless the implementation session deliberately takes the whole plan in one end-to-end pass with tests at each boundary.

### Phase 4 - Compare Header Route Switcher

- Add route/page switcher only when the selected proposal has more than one route/step.
- Keep `Live | Preview` and `Live | A | B | C` stable.
- Label proposed routes as `New route` when Live does not have them.

### Phase 5 - Prompt Wrappers And Plan Mode Spec

- Update existing-app visual decision, preview-first, saved mockup review, build-selected, Plan Mode accept, and Plan Mode revise prompts to include route context.
- Extend `codex-plan-preview` JSON schema and parser for routes and flows.
- Add parser tests for old and new preview specs.

### Phase 6 - Lifecycle Guards

- Ensure Live route navigation while compare is open does not retarget proposals.
- Ensure project/thread ownership still prevents leaked marks or old mockups.
- Ensure built starting mockups remain history-only and cannot activate as current-app route proposals.

### Phase 7 - Verification

- Run parser/state tests:
  - route-aware `codex-plan-preview` parse/strip/summary;
  - legacy preview spec compatibility;
  - legacy `areaMark.route` migration;
  - app/mockup composer context route serialization;
  - old starting mockups remain history-only after build.
- Run desktop build checks:
  - `npm --prefix apps/desktop run test:p19`
  - `npm --prefix apps/desktop run test:p20`
  - `npm --prefix apps/desktop run build`
- Dogfood in real Electron with two projects:
  - interface-heavy app with multiple real routes;
  - backend/workflow-heavy app with no router or state-only views.
- Manual flows to verify:
  - mark current route and implement;
  - mark one route and target another;
  - broad change without route;
  - new route proposal;
  - A/B/C with different route choices;
  - multi-step flow across routes;
  - Live route changes while compare is open;
  - proposal route missing in Live;
  - hash/query/local-state route cases;
  - preview server unavailable fallback;
  - adjusted highlight accepted and highlight chrome disappears after implementation.

## Main Risks

- Route identity can become noisy if query params or local UI state are treated as separate pages too often.
- Multi-route proposal metadata can bloat prompts unless summaries are compact and grouped by selected option/route.
- Webview navigation can race with proposal injection, especially for hash routing and in-page navigation.
- Saved mockup artifact routes can be mistaken for real Live routes without strict `artifact` vs `implemented` status.
- Allowing multiple Live marks per project can clutter the composer unless route grouping and chip labels stay compact.
- Plan Mode parser changes must stay backward compatible with existing P19 preview blocks.
- Highlight adjustments need careful route scoping so `apply everywhere` is explicit and not inferred from a drag.

## Next Slice

Implement Phase 1 and Phase 2 together: route context types, migration, Live route normalization, multi-route mark chips, and prompt serialization for attached Live marks. Keep mockup manifest and Plan Mode schema changes for the following slice.
