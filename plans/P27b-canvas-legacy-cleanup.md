# P27b - Canvas Legacy Cleanup Handoff

## Status

- Active cleanup is underway.
- Refreshed after P27-fix, P27-cool, P27-agent-aware planning, P29 planning, and the first P27b deletion pass.
- P27-cool header work is now implemented: Canvas uses Live/proposal lane rows, one proposal is `A`, and the old saved-mockup one-row `Compare | Live | A/B/C` toolbar path has been removed and guarded by `test:p27`.
- P27-agent-aware is now a separate prerequisite/follow-up plan for prompt/routing lane awareness. P27b should not delete routing/prompt branches that still provide lane facts until that payload is implemented and covered.
- P29 is separate browser Observer/Actor work. P27b should not remove local verification fallbacks merely because P29 is planned.

## Relevant Docs

- `AGENTS.md`
- `docs/Arch.md`
- `docs/Prod.md`
- `docs/UI-UX.md`
- `plans/done/P27-canvas-agent-capability.md`
- `plans/done/P27-cool-canvas-lanes-and-header-consistency.md`
- `plans/P27-fix-canvas-action-wiring-regressions.md`
- `plans/P27-agent-aware-canvas-lane-state.md`
- `plans/P28-canvas-mode-and-visual-plan-evidence.md`
- `plans/P29-canvas-browser-observer-and-actor.md`
- `plans/done/P24-proposal-preview-agent-marks-and-routing.md`
- `plans/done/P25-live-overlay-and-temp-code-proposals.md`
- `plans/done/P25b-code-backed-proposal-workspaces.md`
- `plans/done/P26-canvas-v2-p25b-regression-recovery.md`
- `plans/done/P26b-composer-image-attachments.md`

## User Workflow First

Cleanup must preserve the visible Canvas contract:

- Canvas is `Live AND A/B/C` when both exist, not `Live OR A/B/C`.
- `Live` is the current app/source-of-truth lane.
- A single proposal is `A`, never `Preview`.
- Proposal lanes can be backed by live overlay metadata, saved static mockups, or runnable code-backed workspaces.
- Saved mockup A opens as a static review artifact; if active, it still shows a stopped `Live` target even before the project has runnable files.
- Selecting a live-overlay proposal lane should auto-start or reconnect Live when feasible so `Changes`, `Mark area`, and `Build selected` are usable.
- `Build selected` remains a composer/agent handoff or normal agent-send commitment according to backing lane; cleanup must not quietly turn it into a hidden direct apply unless a specific existing direct-apply path already owns that backing type.
- Marks and `Changes` remain compact visual chips/overlays, not raw coordinate text.
- Old built proposal sets stay visible only as history/reference and must not capture new Live-based requests.
- Users never need to know about `.codex/mockups`, proposal workspace roots, temp paths, hidden sentinels, browser protocol details, or patch mechanics.

## Keep As Product Contract

- P27-cool Canvas header contract:
  - Live stopped row: `Preview`, `Detect`, `URL`.
  - Live running row: `Mark area`, `Reload`, `Stop`, `Open`.
  - Proposal row: `A`, `A | B`, or `A | B | C` with `Changes` when present, `Mark area`, `Build selected`.
  - Desktop/Mobile is an icon-only floating viewport control.
- App Preview as the visible Live Canvas surface.
- Mockup Preview as the saved static review-artifact lane.
- Code-backed proposal workspaces as the runnable proposal lane for serious app/page/workflow options.
- Live overlay proposals as lightweight current-app proposal lanes using hidden preview metadata and optional highlights.
- Composer-first visible text for user messages, thread titles, sidebar rows, and Activity.
- User mark chips, sent visual chips, agent `Changes` marks, and compact labels such as `Mark 1` / `Change 1`.
- Project/thread scoping for proposal sets and visual context.
- Applied/history separation after a saved mockup or code-backed proposal is built into Live.
- Agent-authored decision strips. The desktop should provide routing capabilities and constraints, not fixed product copy masquerading as user choice.

## Keep Only Until P27-Agent-Aware Replaces

Do not preserve duplicate legacy branches just because P27-agent-aware is planned. Keep only the current adapters that still own live lane behavior, and delete stale wrappers, display scrubbers, and dead fallback branches as soon as resolver coverage exists. P27-agent-aware should replace the remaining necessary adapters with one compact lane-awareness payload:

- `canvasResolverInput`, `canvasActiveProposalSet`, `canvasHistoricalProposalSets`, `selectedCanvasSurface`, and mark-to-surface mapping.
- Active versus comparison-history code proposal pointers.
- Saved mockup history mode and selected option mapping.
- Live overlay proposal lookup and stale inspector retargeting.
- Prompt wrapper context that tells the agent the current Live/proposal/mark situation.

P27-agent-aware should replace these with one compact lane-awareness payload. After that lands, P27b can remove duplicated state derivation and prompt-specific lane inference.

## Replaced By Canvas Operating Prompt

Candidate cleanup after fixture parity:

- Repeated prose explaining what Canvas is across empty-project, current-app, live-overlay, saved-mockup, code-workspace, and Plan Mode wrappers.
- Separate reminders that `Canvas` / `@Canvas`, preview, show-me, where-should, wireframe, mockup, layout, workflow, and A/B/C requests should use visual collaboration.
- Duplicated wording about one proposal by default and A/B/C only for explicit alternatives or genuinely different directions.
- Duplicated warnings not to expose hidden payloads, temp folders, project-root proposal folders, raw browser details, or visible Codex proposal chrome.
- Duplicated guidance that small changes inside existing proposals should revise only the relevant area.
- Fixed decision-strip examples inside old wrappers when the agent-authored questionnaire contract plus allowed `canvasAction` values can cover the same workflow.

Keep lane-specific output formats, storage rules, and hidden execution data. The shared operating prompt does not replace instructions that tell the agent where to write a saved mockup manifest, how to fill prepared code proposal folders, or how to return a `codex-plan-preview` block.

## Replaced By Canvas State Primitives

Candidate cleanup after P27-agent-aware:

- Ad hoc inference of whether the selected surface is Live, A, B, or C.
- Any remaining single-preview branch that treats `Preview` as a separate proposal identity.
- Separate prompt-time notions of active saved mockup set, active code proposal set, pending live overlay proposal, and visible comparison history when deciding the next Canvas turn.
- Code-only checks for whether a proposal set is active, history, accepted, stale, applied, or dismissed when those should be represented in a shared lane lifecycle.
- One-off mark context checks that do not describe whether a mark belongs to Live, a proposal option, or an agent change mark.
- Option-limit dead ends that surface as send errors instead of Canvas questions.

## Already Cleaned Up Or Guarded

- User-facing `Preview` proposal lane naming has been replaced with `A` for one proposal.
- The saved-mockup legacy one-row `Compare | Live | A/B/C` toolbar path has been replaced with lane rows.
- The unused `preview-compare-options` style path has been removed from active source and guarded in `test:p27`.
- Plan Preview proposal lanes now auto-start/reconnect Live so proposal actions are not stuck in a stopped half-state.
- Active saved mockups now expose a stopped Live target even when the project has no runnable app files.
- Live-running `Changes` is restricted to proposal lane contexts, not Live row actions.
- Deleted the chat-side live proposal approval card branch from `PlanProposalReview`. Live proposals now stay in Canvas lanes; the old `Implement this proposal?` / `Build selected proposal` chat card path is guarded against returning in `test:p27`.
- Deleted the old fixed-question routing wrappers for `[Codex Empty Project Visual Planning Context]` and `[Codex Existing App Visual Decision Context]`, including their sentinels, prompt builders, completed-turn fallback synthesis, and prompt classifiers. Canvas questions now come through `[Codex Canvas Question Context]` with agent-authored `codex-decision-strip` choices.
- Deleted title/sidebar/transcript scrubbers for those removed wrappers, and moved the P20 title fixture to the current Canvas question wrapper.
- Deleted the unused `codeProposalAddOptionBlockReason` send-error path and its private unsupported-option message helpers. Option-limit cases should route through the Canvas resolver question flow instead of blocking in the composer.
- Removed dead live-proposal branches from Plan Mode accept/revise handlers. Live proposals remain lane-owned; PlanProposalReview stays for Plan Mode and safer-plan flows only.
- Replaced remaining Plan Mode card copy that said `Preview selected` with neutral `Visual reference selected` so `Preview` does not reappear as a proposal lane name.
- Deleted the old `[Codex Existing App Preview First Context]` saved-preview creation sentinel and its title/sidebar/transcript scrubbers. Saved review artifact creation now uses the existing saved-mockup review sentinel/path and is guarded in `test:p27`.

Do not spend P27b deleting these again. Keep regression coverage so they do not return through another component.

## Current Cleanup Candidates

- Duplicate Canvas behavior bullets inside:
  - `savedPreviewArtifactPrompt`
  - `liveOverlayProposalPrompt`
  - `savedMockupReviewPrompt`
  - `codeProposalWorkspacePrompt`
  - `codeProposalAddOptionPrompt`
  - `codeProposalReviewPrompt`
  - Plan Mode visual wrapper text
- Legacy classifier branches that overlap with `resolveCanvasAction`, after fixture coverage proves parity:
  - saved/code implementation commitment helpers that duplicate resolver decisions
- Hidden-sentinel/title scrubbers that can be consolidated into one shared sentinel extraction and display sanitization helper.
- Static prompt-regression tests that only assert old wrapper prose, after equivalent resolver, lane-awareness, parser, and display-scrubbing tests protect the behavior.
- Any remaining source or copy that implies a proposal lane is named `Preview`.

## Risky Or Needs More Investigation

- Saved `.codex/mockups` review/update prompts still need lane-specific storage instructions and manifest/highlight rules.
- Code-backed proposal workspace prompts still need real prepared folder paths as hidden execution context. Cleanup should keep those paths hidden from user-facing copy, not remove the execution data.
- Live overlay proposal parsing and `codex-plan-preview` completion buffering are still required for streamed proposal metadata.
- Plan Mode still owns implementation gating. Do not collapse it into normal Canvas sends until P28 visual evidence is implemented enough to pin accepted references.
- P29 Browser Observer/Actor is not a replacement for local static/build checks yet. Do not delete verification fallbacks before P29 exists.
- Existing tests for P19/P20/P24/P25/P25b protect regressions outside P27. Delete or rewrite them only after P27/P27-agent-aware fixtures cover the same user-visible contract.
- Chat-side `PlanProposalReview` still belongs to Plan Mode and safer-plan flows. Cleanup may remove dead live-proposal branches inside that component only if tests prove live proposals now use Canvas lanes exclusively.

## Cleanup Phases

### Phase 1 - Verification Audit

- Re-run the focused desktop regression set:
  - `test:p24`
  - `test:p25`
  - `test:p25b`
  - `test:p27`
  - `npm --prefix apps/desktop run build`
  - `npm --prefix apps/desktop run electron:build`
  - `git diff --check`
- Dogfood one existing-app project and one empty project in Electron.
- List which old prompt branches still execute in:
  - empty project direct build;
  - empty project one proposal;
  - empty project A/B/C runnable proposals;
  - existing app one live-overlay proposal;
  - existing app A/B/C live-overlay proposals;
  - saved mockup A;
  - code-backed A/B/C;
  - applied proposal comparison history;
  - moved `Change 1` context.
- Add missing resolver/lane-awareness fixtures before deleting branch logic.

### Phase 2 - P27-Agent-Aware First

- Implement or confirm the compact lane-awareness payload before removing prompt-time lane inference.
- Make the payload the shared source for selected lane, backing kind, lifecycle, route, viewport, marks/changes, and build meaning.
- Verify the agent can distinguish active `A`, history `A`, Live source-of-truth, saved mockup A, live-overlay A, and code-backed A.
- Only then collapse duplicate state derivation.

### Phase 3 - Prompt Deduplication

- Remove duplicated behavior prose where `CANVAS_OPERATING_PROMPT` plus lane awareness is authoritative.
- Keep output schemas, hidden execution data, storage paths, and safety constraints that are specific to backing lanes.
- Replace fixed decision-strip examples with agent-authored questionnaire guidance and allowed `canvasAction` values.
- Verify hidden payload scrubbing and visible title/sidebar/chat display after each removal.

### Phase 4 - Routing Collapse

- Make `resolveCanvasAction` plus lane awareness the normal Canvas-routing decision point.
- Retire overlapping `shouldOffer*` and explicit-preview/options branches only when fixtures prove no workflow regression.
- Replace option-limit send errors with Canvas questions everywhere.
- Preserve direct code-backed apply behavior only where the product intentionally owns that direct path.

### Phase 5 - Display And Sentinel Cleanup

- Consolidate sentinel extraction and user-facing display scrubbing.
- Keep user-facing prompts/titles equal to the visible composer text.
- Remove duplicate fallback scrubbers only after transcript, sidebar, Activity, and copied-text checks pass.
- Verify no `.codex/mockups`, proposal workspace paths, hidden JSON, or temporary folders appear in user-facing surfaces.

### Phase 6 - Test Cleanup

- Convert legacy static prompt tests into resolver, lane-awareness, parser, and display-scrubbing tests where possible.
- Keep header-contract tests for P27-cool exactly.
- Keep regression tests for:
  - no `Preview` proposal lane label;
  - no old one-row saved-mockup compare toolbar;
  - live proposal auto-start/reconnect;
  - active/history routing split;
  - compact `Mark N` / `Change N` chips.

### Phase 7 - Final Dogfood

- Dogfood one interface-heavy project and one backend/workflow-heavy project.
- Confirm small visual proposals, A/B/C requests, option replacement, build handoff, history cleanup, marks, adjusted `Changes`, and hidden-payload display.
- Confirm vague follow-ups route from the selected lane while applied proposals remain history only.
- Record durable product or architecture lessons in `docs/Arch.md`, `docs/Prod.md`, or `docs/UI-UX.md`; keep P27b itself compact.

## Acceptance Criteria

- Legacy prompt/routing code is smaller without losing P24-P27 user workflows.
- Canvas action and lane-awareness fixtures, not old wrapper prose, protect core routing behavior.
- The user-visible Canvas surface is unchanged except for fewer dead ends and cleaner questions.
- No internal storage paths, hidden Canvas payloads, browser protocol details, or workspace mechanics appear in chat, sidebar titles, preview chrome, chips, or the user's app surface.
- P27-cool header remains unchanged by cleanup work.
- Applied/history proposals remain visible for comparison but do not catch new unspecified Live-based requests.
- P29 can later consume the canonical lane state without duplicating legacy routing logic.
