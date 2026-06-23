# P33 Testing - Live-First Draft Dogfood

## Status

- Active testing reference for P33 end-to-end dogfood.
- Goal: prove the default existing-project loop is Live-first: one normal feature-preview prompt creates one Draft in an isolated workspace, revisions update the same Draft, source stays unchanged before `Build this`, and A/B/C appears only for explicit alternatives.
- Current evidence: `scripts/p33-electron-dogfood.mjs` passes for both the interface-heavy static fixture and the backend/workflow-heavy Node fixture, storing screenshots plus DOM/source facts under `artifacts/p33-dogfood/evidence/`.
- Remaining gap: real agent-generated draft creation/revision and explicit A/B/C alternatives are not yet covered by the automated dogfood script.

## Scope

- Use the real Electron desktop app on the current branch.
- Use two local dogfood projects:
  - one interface-heavy app, automated through `scripts/p33-electron-dogfood.mjs`;
  - one backend/workflow-heavy Node app, automated through `scripts/p33-electron-dogfood.mjs`.
- Create intentional chats/folders as needed; do not reuse stale state as proof.
- Prefer Electron DOM/state checks for repeated assertions and screenshots for visual sanity.
- Capture source hashes before draft creation, before build, and after build.
- Keep visible UI simple: `Live`, `Draft`, `Build this`, `Park`, `Resume`, `Discard`.

## Failure Policy

- If behavior looks wrong, inspect for duplicated old proposal/draft paths before fixing.
- Prefer consolidating or deleting obsolete paths over patching around them.
- Do not add debugging platforms, internal panels, or extra visible steps to make the test pass.
- If a test app is too stale or confusing, create a fresh local fixture project and keep testing.
- Long commands must use a 5 minute timeout.

## Desktop Dogfood Matrix

### Chat 1 - Single Draft Loop

1. Open an existing runnable project and start Live.
2. Record visible thread count/active thread and source hash.
3. Prompt: `Show me how quick add could work in this app`.
4. Verify:
   - one Draft is created, not A/B/C;
   - Canvas shows `Live + Draft`;
   - main source hash/file list is unchanged except `.codex/drafts`;
   - `.codex/drafts/<draft>/brief.md` exists and contains no paths, ids, selectors, hidden JSON, or raw coordinates.
5. Prompt: `Make it less cluttered`.
6. Verify the same draft updates and no new thread or A/B/C set appears.
7. Use `Park`, then `Resume`.
8. Verify Draft state moves parked -> active and Live remains available.
9. Use `Discard`.
10. Verify Draft disappears, Live is clean, and source is unchanged.

### Chat 2 - Build This

1. Create or resume a fresh Draft in a disposable project.
2. Modify the draft once.
3. Record source hash immediately before build.
4. Trigger `Build this`.
5. Verify:
   - source changes only after the explicit build action;
   - draft lifecycle becomes built;
   - Live reloads or can be reloaded to the built result;
   - draft-only mock/preview assumptions are either removed or clearly recorded as follow-up.

### Chat 3 - Explicit Alternatives

1. Prompt: `Show me three different directions for quick add`.
2. Verify A/B/C appears only for this explicit alternatives request.
3. Verify a later single-feature prompt routes from Live or active Draft, not from stale A/B/C history.

## Evidence

Store evidence under `artifacts/p33-dogfood/`:

- screenshots for Live-only, Draft, parked/resumed, discarded, built, and A/B/C explicit alternatives;
- DOM facts for visible lane/action labels and absence of hidden internals;
- source hash/file-list snapshots before draft, before build, and after build;
- draft brief path existence checks and sanitized content summary;
- thread count/active thread snapshots before and after each prompt.

## Automated Verification

Run focused tests after fixes:

- `node scripts/p33-electron-dogfood.mjs`
- `node scripts/p33-draft-workspace-test.mjs`
- `node scripts/p33-draft-routing-test.mjs`
- any new P33 helper/UI tests added during implementation
- `npm --prefix apps/desktop run build`
- `git diff --check`

## Exit Criteria

- Existing project starts in Live without mandatory A/B/C.
- A normal single-feature preview creates exactly one Draft.
- Revisions update that Draft.
- Park, Resume, Discard, and Build this work without hidden implementation leaks.
- Main source stays unchanged until `Build this`.
- `Build this` mutates source only after the explicit action.
- Explicit alternatives still use A/B/C.
- Real Electron dogfood evidence exists, or blockers are recorded with the exact reason.
