# P33 - Live-First Feature Draft Layer

## Status

- WIP: Phase 0 audit complete; Phase 1/2/2b/4/5/6 have a tested first implementation for the local single-draft loop.
- Goal: replace proposal-lane-first thinking with a Live-first feature draft workflow for existing projects.
- Product reset: A/B/C, Canvas Edit move mode, and semantic proxy editing are not the core product. They are supporting/fallback capabilities. The primary builder loop is: show one feature inside the real app, shape it conversationally, then build it into real source/backend only after approval.
- Owner thesis: builders want to feel a feature in their app before paying the backend/integration cost. They do not want DevTools UI, lane mechanics, visible internal honesty, or mandatory A/B/C decision workflows.
- Cleanup note: the uncommitted P31/P32 direct-manipulation implementation was discarded from the working tree on owner direction. P33 docs/plan are the durable direction to carry forward.
- Implemented slice: added hidden draft workspace helpers that reuse code-backed proposal workspace isolation/diff/bounds under a separate draft registry, plus draft brief creation/update under `.codex/drafts/<draft-slug>/brief.md`.
- Implemented slice: added renderer draft state, a `DraftPreview` surface that reuses the locked Live/proposal header shape as `Live + Draft`, single-draft routing for existing-project feature-preview prompts, draft revision routing, direct conflict-checked `Build this`, `Discard`, and a compact owning-thread draft strip for `Park` / `Resume` / `Discard`.
- Audit result: A/B/C still exists for explicit options and legacy proposal flows; normal existing-project single-feature preview now has a draft path without source mutation before `Build this`.
- Electron dogfood: `scripts/p33-electron-dogfood.mjs` passes on interface-heavy static and backend/workflow-heavy Node fixtures, capturing Live-only, Draft, Park, Resume, Discard, Build, and built-Live screenshots under `artifacts/p33-dogfood/evidence/`.
- Next slice: dogfood real agent-created drafts, then harden route/viewport continuity, named-draft selection, explicit alternatives, and build/discard recovery states.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`
- P31/P32 historical notes only when needed for context; do not treat them as the active implementation path.

## Product Thesis

Canvas should feel like a builder's thinking surface:

```text
Here is your real app.
I can try the feature inside it.
You can react until it feels right.
Then I will build it for real.
```

The product is not a visible multi-lane proposal system by default.

The product is a **temporary feature layer on top of Live**:

- native-looking UI because it uses the app's real source, components, styles, tokens, and layout;
- fake/mock behavior where backend integration would slow the loop down;
- source-safe until the user says to build;
- one draft by default, not A/B/C;
- longer-lived drafts can be parked, resumed, named, and documented;
- conversational iteration, with marks as visual context when needed;
- final build turns the approved draft into real source/backend implementation.

## User Workflow First

### Existing Project Default

1. User opens an existing project.
2. Canvas shows `Live` as the home surface.
3. No A/B/C row appears unless the current thread has actual alternatives.
4. User asks: `show me how this feature could work`.
5. Codex creates one feature draft in the real app's styling context.
6. Canvas shows the app as `Live + Draft`, not as a separate abstract proposal lane.
7. User reacts naturally:
   - `move it there`;
   - `less cluttered`;
   - `take that panel out`;
   - `try again`;
   - draws `Mark 1` if location matters.
8. Codex revises the same draft.
9. User says: `Let's build it`.
10. Codex converts the approved draft into real source/backend changes and reloads Live.

### Compare Is Optional

A/B/C appears only when:

- the user explicitly asks for multiple directions;
- Codex genuinely needs divergent alternatives;
- an empty-project flow asks for visual options before a real app exists.

One feature request creates one draft. It should not create A/B/C just because Canvas has proposal machinery.

## Terminology

Use product-facing language:

- `Live`: the current real app.
- `Draft`: a temporary feature sketch running inside or beside Live.
- `Parked draft`: a named draft the builder can resume later.
- `Draft brief`: a living markdown note that records the product decisions, affected screens, mock assumptions, rejected ideas, and build plan for one draft.
- `Build this`: commit the approved draft into real implementation.
- `Discard`: remove the draft.
- `Revise`: keep the same draft and change it.

Avoid primary user-facing language such as:

- `proposal workspace`;
- `A/B/C` for one draft;
- `DOM edit`;
- `move intent`;
- `VisualPatch`;
- `mock backend`;
- `feature flag`;
- `registry`.

Those can remain hidden implementation details.

## Draft Lifecycle

A draft is a thread-owned temporary product branch.

Each draft should have hidden state for:

- project and owning thread;
- name, such as `Quick add flow` or `Analytics impact`;
- status: `active`, `parked`, `built`, or `discarded`;
- draft workspace/branch pointer;
- preview URL and route state;
- affected routes/screens;
- mock data/backend assumptions;
- user decisions so far;
- open questions;
- associated draft brief path.

Visible UI should stay simple:

- `Draft: Quick add flow`;
- `Build this`;
- `Park`;
- `Discard`;
- `New draft` when the user clearly starts a separate feature thread.

### Long Drafts

Long-running drafts are expected.

A builder may discuss a feature for a while, click through the draft, revise it, park it, revisit it later, and only then ask for a build plan. This should not require A/B/C or a new chat for every revision.

Rules:

- Revising the same feature updates the same active draft.
- A new affected page that belongs to the same feature expands the same draft.
- A different solution or separate feature creates a new named draft.
- Alternative designs for one decision may use compare mode inside the draft, but should not become the default model.

Example:

```text
Draft: Quick add flow
Affected routes:
- /tasks
- /analytics
```

If the user says: `wait, this affects analytics`, create or update the `Analytics impact` screen inside the same draft unless the user is clearly starting a separate feature.

### Multiple Drafts

Multiple drafts are named product branches, not A/B/C.

Use names for separate feature threads:

- `Draft: Quick add`;
- `Draft: Bulk import`;
- `Draft: Analytics impact`;
- `Draft: Mobile checkout`.

A/B/C remains for comparing visual variants of one decision, not for managing long-running feature work.

## Draft Brief Markdown

Every non-trivial draft should have a living markdown brief.

Suggested path:

```text
.codex/drafts/<draft-slug>/brief.md
```

The brief is the continuity layer between chat, preview, parked drafts, and final build.

It should capture:

- draft name and status;
- feature goal;
- current draft summary;
- affected routes/screens;
- fake/mock backend assumptions;
- user-approved decisions;
- rejected ideas;
- open product questions;
- implementation/build plan;
- backend integration notes;
- risks and follow-up pages.

The agent should update the brief at important checkpoints:

- draft created;
- user approves or rejects a major direction;
- draft expands to another route/page;
- draft is parked or resumed;
- user asks for a plan;
- user says `Build this`.

Do not update the brief after every tiny message. The brief should stay useful, not become a transcript dump.

When the user asks `write me a plan for this feature`, Codex should update the draft brief into a clear build-ready markdown plan, then show the user the concise summary in chat.

## Core Mechanism

The practical version of "temporary UI comments" is:

```text
isolated draft source/worktree + preview flag + mock data/backend layer
```

The user should not see those mechanics.

Internally, a feature draft may use:

- a temporary worktree or draft workspace;
- a preview-only flag such as `preview.isOn("feature-name")`;
- a mock data module such as `preview.mock.*`;
- the app's real component library and styling system;
- generated UI code that is easy to delete, revise, or promote.

Default safety rule:

**Do not write feature-draft code into the user's main working tree until the user chooses `Build this`.**

If a future implementation writes gated draft code into the main tree for a narrow reason, it must still be source-safe, reversible, lint/build-aware, and clearly removable. The preferred v1 route is an isolated draft workspace presented as `Live + Draft`.

## Native-Looking Drafts

The draft must look like the app, not like an external mockup.

Agent rules:

- inspect the app's framework, file structure, components, styling, tokens, and data patterns first;
- compose existing components before inventing markup;
- match current density, border radius, typography, spacing, and color semantics;
- avoid inline-style sludge unless the app already uses that convention;
- add only enough fake data/behavior to feel the flow;
- do not build the real backend path during the draft unless it is trivial and safe.

This is the reason to draft inside the app's source/runtime context rather than in standalone `.codex/mockups` for normal existing-project feature work.

## Mock Backend Convention

The draft layer needs a boring, consistent fake-backend convention.

V1 should define a small app-local convention that agents can reuse:

```ts
preview.isOn("feature-name")
preview.mock.query(...)
preview.mock.mutate(...)
preview.mock.reset(...)
preview.mock.seed(...)
```

The exact API can be framework-neutral at first, but the product contract is:

- fake data is allowed and expected in draft mode;
- fake mutations should update local/in-memory draft state so the flow feels real;
- mock state must not touch production backend, user data, persistent app storage, or source files outside the draft workspace;
- the final build replaces or removes mock calls.

## Build This Contract

`Build this` is two conceptual operations:

1. Promote the approved UI:
   - remove draft-only gates;
   - place the UI in the real app structure;
   - preserve the approved visual/interaction result.
2. Replace fake behavior with real integration:
   - wire API calls, database writes, auth, routing, state management, and persistence;
   - remove preview/mock modules or leave only reusable test fixtures if the app convention supports them;
   - run tests/build and reload Live.

The implementation may do these in one agent turn, but the hidden prompt and verification should treat them as separate risks.

## What Happens To Existing Canvas Work

Keep:

- Live preview webview and run/reload/open lifecycle.
- Mark area and visual reference chips.
- Route/viewport/screenshot evidence.
- Code-backed isolated workspaces as internal infrastructure.
- Existing VisualPatch/proposal infrastructure only where it helps the Live-first draft loop.

Demote/shelve:

- A/B/C as the default existing-project workflow.
- Element dragging as the primary interaction model.
- General DOM editing.
- Proxy/move-intent UI as the main product surface.
- Generated DOM addressability and move-mode lint as a product gate.
- P31/P32 edit chips unless explicitly revived as fallback visual evidence.
- Fixed questionnaires when the user already asked for a clear target.

Do not rebuild abandoned P31/P32 capabilities just to make this plan possible. First make the new Live-first draft loop work and let unused surfaces fade behind routing/UI changes.

## UX Contract

Existing app with no active alternatives:

- Show `Live`.
- Do not show an empty proposal row.
- Do not require the user to create `A`.
- Do not ask how to turn Live into A when the user already requested a draft or build.

When a draft exists:

- Show a compact state such as `Draft` / `Trying feature` / `Source unchanged`.
- Primary actions:
  - `Build this`;
  - `Discard`;
  - `Mark area` when visual feedback helps;
  - `Reload` / `Open` as Live controls.
- Keep technical state out of view.

When alternatives exist:

- Show compare affordances only then.
- Prefer named directions over naked A/B/C if possible, while preserving compact lane labels if the current header requires them.

## Hard Constraints

- Do not mutate the user's main source before `Build this`.
- Do not make A/B/C mandatory for existing projects.
- Do not auto-build from a draft.
- Do not expose preview flags, mock backend names, workspace paths, hidden IDs, registry IDs, source paths, raw coordinates, or hidden JSON.
- Do not revive old Preview naming, fixed questionnaires, live approval cards, or option-limit send errors.
- Preserve P27-cool header behavior until a specific owner-approved header replacement is planned.
- Do not continue investing in general DOM editor behavior as the primary product path.

## Implementation Phases

### Phase 0 - Product Reset And Audit

Status: complete for this slice.

- Audit current Live/proposal/A/B/C routing for existing projects.
- Identify where explicit prompts such as `put Live into A` or `show this in A` trigger unnecessary questionnaires.
- Identify which UI surfaces make proposals feel mandatory.
- Update product docs to mark Live-first drafts as the next direction and A/B/C as optional compare mode.
- Decide which existing code paths can be reused as internal draft workspaces.

Exit criteria:

- Clear list of code paths to reuse, de-emphasize, or avoid.
- No code behavior changes yet except docs/tests if needed.

### Phase 1 - Manual Draft Loop Proof

Status: implemented and dogfooded for one interface-heavy static project plus one backend/workflow-heavy Node project.

Prove the product by hand before automating it.

In one real app:

1. Create an isolated draft workspace from Live source.
2. Add a tiny `preview` runtime or equivalent flag.
3. Add one native-looking feature UI behind that draft mechanism.
4. Wire it to fake local data/mutations.
5. Show it in the preview as `Live + Draft`.
6. Confirm the main project source stays untouched.
7. Revise the draft once from a natural chat prompt.
8. Promote it through explicit `Build this`; the current v1 directly applies the conflict-checked draft workspace diff into Live and reloads Live.

Exit criteria:

- The draft looks native.
- It feels faster than full implementation.
- Discarding it leaves Live clean.
- Building it produces a real source diff only after approval.

### Phase 2 - Draft Workspace Model

Status: foundation implemented for hidden Electron helpers, renderer state, active/parked thread-owned draft selection, and `Live + Draft` preview selection.

- Add a desktop-owned draft-workspace registry or adapt the code-backed proposal workspace registry.
- Present draft workspaces as `Live + Draft`, not `A` by default.
- Track draft identity by project/thread/turn/route/viewport.
- Track draft name, status, affected routes, open questions, and draft brief path.
- Track whether the draft has source changes, mock runtime files, and build-promote status.
- Support `active`, `parked`, `built`, and `discarded` lifecycle states.
- Keep workspace paths hidden.

Exit criteria:

- One active draft can be created, selected, discarded, and reopened for the current thread.
- A draft can be parked and resumed from its owning thread.
- Live preview can switch between main Live and draft preview without leaking URLs across projects.

### Phase 2b - Draft Brief Memory

Status: foundation implemented with draft brief create/update helpers and checkpoint updates on create/finalize/park/resume/build/discard.

- Create `.codex/drafts/<draft-slug>/brief.md` for non-trivial drafts.
- Keep the brief in sync at checkpoint moments, not every message.
- Include feature goal, current state, affected screens/routes, mock assumptions, approved/rejected decisions, open questions, build plan, backend notes, and risks.
- Ensure hidden draft workspace paths and registry IDs do not appear in the visible brief unless the user explicitly asks for implementation internals.
- Include the draft brief as hidden context for draft revision and build turns.

Exit criteria:

- Draft creation writes a useful brief.
- Draft revision updates the brief when a major decision changes.
- `write me a plan for this feature` produces or refreshes the markdown plan from the draft brief.
- `Build this` includes the brief as implementation context.

### Phase 3 - Preview Runtime And Mock Convention

- Define a minimal cross-framework preview/mock convention.
- Provide prompt guidance for agents:
  - reuse real components;
  - create fake data locally;
  - isolate draft-only code;
  - do not wire real backend unless requested.
- Add detection/lint for draft-only markers so discard/build can find them.
- Support simple static/vanilla apps first, then React/Vite-style apps.

Exit criteria:

- A generated draft feature can add and update fake data locally.
- The draft can be reset/discarded.
- Main Live source remains unchanged.

### Phase 4 - Existing-Project Routing

Status: first routing proof implemented for clear existing-project feature-preview prompts; explicit options still route through proposal paths.

- Change Canvas routing for existing projects:
  - clear `show me how this feature works` creates one draft;
  - clear `build it` builds the current draft;
  - clear `show me 3 options` creates compare alternatives;
  - explicit Live/draft targets do not trigger an unnecessary decision strip.
- Avoid `put Live into A` as the suggested mental model. Translate it into a review-only draft or compare mode only when the user truly asks for that.

Exit criteria:

- Existing app starts Live-only.
- A single feature preview appears as a draft, not mandatory A/B/C.
- Explicit target wording does not ask the same question again.

### Phase 5 - Draft Revision Loop

Status: first active-draft revision route plus active/parked lifecycle strip implemented; multi-route/named-draft expansion remains.

- Let natural follow-ups revise the current draft:
  - no new draft unless the user asks for a new idea;
  - no A/B/C unless comparing;
  - marks attach location context;
  - source remains isolated.
- If a follow-up adds an affected page or route for the same feature, expand the same draft and update the brief.
- If a follow-up starts a separate feature, create a new named draft and keep the old draft parked or inactive.
- Show clear progress while the draft is being updated.
- Keep chat text user-facing and hide internal draft prompts.

Exit criteria:

- User can revise the same draft 2-3 times without extra chats/threads.
- User can expand the draft to a second route/page without creating A/B/C.
- User can park one draft, create another, and resume the first by name.
- Visual result updates in the preview.
- Discard removes the draft state.

### Phase 6 - Build This Conversion

Status: first explicit `Build this` action implemented as direct draft workspace apply using the existing proposal workspace promotion/conflict machinery; richer backend/mock replacement remains.

- Add a `Build this` path for the current draft.
- V1 direct apply uses the registered draft workspace diff and rejects conflicts if Live changed since the draft baseline.
- Future richer builds should include the draft brief, route/viewport/screenshot evidence, mock calls/data to replace, user revision history, and app architecture findings when an agent turn is needed for backend integration.
- Agent-assisted promotion can later replace mock behavior and remove draft-only helpers when direct apply is insufficient.
- Reload Live and compare against the draft.

Exit criteria:

- Main source changes only after `Build this`.
- Draft-only flags/mocks are removed or justified.
- Live reload matches the approved draft closely enough to claim success.

### Phase 7 - Header And UI Simplification

After the draft loop works, simplify visible Canvas chrome:

- Existing project: Live row only by default.
- Draft state: compact `Draft`/`Build this`/`Discard` affordances.
- Proposal row: appears only for alternatives/history verification.
- Route/location display cleanup can happen here if still needed.

Exit criteria:

- Existing-project users do not see empty proposal mechanics.
- Header feels like an app preview plus a draft layer, not DevTools.

### Phase 8 - Optional Compare Mode

- Reintroduce A/B/C only for explicit alternatives.
- Consider naming alternatives with product labels while keeping compact lane letters for narrow UI.
- Compare mode can still use code-backed workspaces internally.
- Compare variants belong inside a named draft when they are alternatives for the same feature decision.
- Separate feature threads should be separate named drafts, not A/B/C.

Exit criteria:

- `show me 3 directions` works.
- Normal single-feature requests never enter compare mode accidentally.
- Separate drafts can coexist without being mislabeled as A/B/C variants.

### Phase 9 - Dogfood

Status: real Electron dogfood passes for interface-heavy static and backend/workflow-heavy Node fixtures. Real agent-generated drafts and explicit alternatives remain.

Dogfood in real Electron with:

- one existing production-like app with auth/login route;
- one existing interface-heavy app;
- one empty generated app only as a secondary check.

Scenarios:

1. Existing app opens Live-only with no A/B/C.
2. User asks for one feature preview.
3. Draft appears inside the app styling context.
4. User revises draft twice via chat.
5. User marks a location and asks to move part of the draft there.
6. User asks how an affected second page should look; the same draft expands to that route/page and the brief updates.
7. User asks for `write me a markdown plan for this feature`; the draft brief becomes build-ready.
8. User parks the draft, creates a second named draft, then resumes the first.
9. User discards a draft and verifies Live is clean.
10. User creates or resumes a draft and says `Build this`.
11. Source changes only after build.
12. Mock behavior is replaced or explicitly queued for real backend integration.
13. Live reload matches the approved draft.
14. User asks for three directions and A/B/C appears only then.

Capture screenshots, source hashes, diffs, thread counts, route/viewport state, and visible-chat cleanliness.

## Testing

- Add focused tests for draft-state routing:
  - existing app single-feature prompt creates one draft;
  - explicit build uses current draft;
  - explicit compare creates alternatives;
  - explicit target does not ask a redundant questionnaire.
- Add draft workspace registry tests:
  - project bounds;
  - cleanup/discard;
  - park/resume;
  - multiple named drafts;
  - no workspace path leaks.
- Add draft brief tests:
  - brief created on non-trivial draft;
  - brief updated on checkpoint revisions;
  - brief included in build context;
  - hidden workspace paths/registry IDs are not visible.
- Add mock convention tests:
  - draft markers detectable;
  - mock calls removable/replaceable.
- Add UI tests:
  - no empty proposal row for existing app with no alternatives;
  - draft actions visible only when draft exists;
  - A/B/C appears only for alternatives.
- Add build-conversion tests:
  - main source unchanged before build;
  - source changed after build;
  - draft-only markers removed or reported.

## What Not To Build First

- A new general programming language.
- Full feature-flag framework for every app/framework.
- Full backend mocking platform.
- A/B/C redesign before the one-draft loop works.
- More direct manipulation/edit-mode features.
- Route/page management as a separate browser product.
- Visible developer/debug panels.

Start with one native-looking draft feature in one real app, isolated from source, revised once, then built for real.

## Success Criteria

- Existing-project Canvas feels Live-first.
- The builder can preview one feature without creating A/B/C.
- The draft looks native because it runs through the app's real styling/component context.
- Fake backend behavior is convincing enough to feel the feature.
- Source stays clean until `Build this`.
- `Build this` converts the approved draft into real source/backend work.
- A/B/C remains available only for explicit compare workflows.
- The visible UI is simple enough that a non-developer builder understands what is happening.

## Open Questions

- Should v1 draft workspaces reuse the existing code-backed proposal workspace registry or get a separate draft registry?
- What is the smallest preview/mock API that works across static apps, React/Vite apps, and common backend-heavy apps?
- How should auth/login-gated apps expose a useful signed-in draft state without requiring real credentials?
- Should draft-only code ever be written into the main tree behind a flag, or must v1 always isolate it in a worktree?
- What should the visible label be: `Draft`, `Trying`, `Feature preview`, or something else?
