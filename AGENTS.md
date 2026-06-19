# Product Operating Rules

These rules describe how this project is managed on top of the upstream Codex repo rules.

## Operating Source Of Truth

- Treat this `AGENTS.md` as the root operating guide for this project.
- Keep project memory compact and useful. Prefer short, high-signal summaries over large journals.
- Durable product/backend/UI memory belongs in `docs/`.
- Active and completed plan files are execution state, not long-term memory stores.
- Upstream Rust/Codex repo rules live in `AGENTS.codex-rs.md`. Read that file before touching `codex-rs/`, app-server protocol, TUI code, Rust tests, or upstream internals.
- Target this file to stay around 150-250 lines. If it grows because of durable detail, move that detail into the right doc or referenced rule file.

## Product Docs

- `docs/Arch.md` is the backend architecture map. It should help an agent find the right existing backend feature before creating new code.
- `docs/Prod.md` is the product direction map. It should capture owner intent, product decisions, and whether each direction is implemented, planned, or not implemented.
- `docs/UI-UX.md` is the UI and workflow guidance map. It should capture interaction principles, visual direction, and manual UX checks.
- The docs do not need to refer to individual plans. Plans should refer back to the docs when relevant.
- Do not update docs only because a plan was created.
- Update docs when work moves into `plans/wip/` or `plans/done/`, or when the owner gives explicit product direction that should be recorded before implementation.
- If a WIP slice is large enough to affect later sessions or context windows, update the relevant doc with a compact state note.
- Do not duplicate durable doc content inside plan files. Link or name the relevant doc instead.

## Plan Lifecycle

- New plans start in `plans/` and should be named with a sequence and clear topic, such as `P01-UI-creation.md`.
- Active plans move from `plans/` into `plans/wip/`.
- Completed plans move from `plans/wip/` into `plans/done/`.
- WIP and done plans should stay compact. Tick off phases and add only brief status notes.
- Do not turn WIP or done plans into large implementation diaries. Put durable architecture, product, or UI lessons into the right `docs/` file instead.
- Active plans should contain only what helps the next session execute: current status, goal, relevant docs, scope, phases, blockers, verification, and the next slice plan.
- Completed slices inside a WIP plan should collapse to one-line summaries. Avoid date-by-date logs unless a date itself matters.
- Future plans should include a `Relevant Docs` section and should not restate all durable project facts.
- Plans should have long, self-contained phases so the owner is not forced to repeatedly say "continue".
- Every active plan should show enough status that the owner can tell what is done, what is next, and what is blocked.
- When creating, discussing, or revising a plan, write it as a user workflow first: define the UI/UX contract, the visible user states, the decision points, and the smallest useful interaction before describing product intent or implementation mechanics.
- If a plan introduces a new surface, card, button, approval path, preview behavior, or Plan Mode behavior, make the UI/UX placement explicit enough that another agent should not have to invent it from product direction alone.
- Canvas v2 preview header changes require explicit owner consent before implementation. Any future plan touching App Preview, Mockup Preview, proposal previews, or Canvas v2 must restate and preserve the locked header button contract from `docs/UI-UX.md`; backend/performance plans must not change that header by accident.

## Latest Implemented Plan Memory

- Keep summaries for only the latest 5 implemented plans and their main discussion lessons.
- Each summary should be one or two lines. This section is orientation memory, not a changelog.
- When a sixth implemented plan is added, remove the oldest summary so the second becomes first and the sixth becomes fifth.
- P23b - Unified Preview Shell And Overflow: made the preview button land on `Live`, kept proposal tabs thread-owned, reset compare views to `Live` on chat switch, and pushed lower-priority header actions into `...` before a third row appears. Main lesson: preview chrome needs one stable priority order across Live and proposal states.
- P25 - Live Overlay And Temp Code Proposals: routed small existing-app preview choices to temporary Live overlays with A/B/C, proposal highlights, and explicit accept handoff instead of copied HTML. Main lesson: streamed hidden preview blocks must survive completion but never leak into chat text.
- P25b - Code-Backed Proposal Workspaces: generated serious A/B/C proposals in isolated runnable workspaces and promoted accepted options into Live by patch instead of rebuild. Main lesson: hidden proposal metadata must be deduped from visible chat, and backend proposal changes must preserve the locked Canvas v2 preview header.
- P26 - Canvas V2 P25b Regression Recovery: restored composer-first `Build selected`, proposal `Mark area`, non-stuck proposal apply, and one-row header overflow after P25b regressions. Main lesson: code-backed proposal acceleration must remain underneath the locked Canvas v2 interaction contract.
- P26b - Composer Image Attachments: enabled native local image chips, transcript thumbnails, fullscreen preview, and visual mark/change chips for composer and chat. Main lesson: attachments and preview marks can share presentation UI while keeping hidden mark metadata and Canvas v2 header behavior untouched.

## Product And UX Principles

- The fewer clicks the user has to make, the better.
- Do not build admin-style debugging features unless the owner explicitly asks for them.
- Prefer end-user workflow clarity over exposing internal machinery.
- Live proposal previews must not inject visible Codex proposal chrome into the user's app surface. Use preview header state and `Show changes` marks, not `Proposed` banners, fake buttons, or generic proposal cards inside the app.
- Canvas v2 preview header is owner-locked. Live stopped shows `Preview`, `Detect`, `URL`; Live running shows `Desktop`/`Mobile`, `Mark area`, `Reload`, `Stop`, `Open`; A/B/C proposal tabs show `Desktop`/`Mobile`, `Changes` when present, `Mark area`, `Build selected`. The header stays one row: `Live | A | B | C` keeps a fixed compare slot and right-side actions collapse to icon-only/`...` before they can overlap it. Do not change order, labels, grouping, visibility, or header layout without explicit owner consent.
- Avoid stale route flashes, stale previous-screen UI, and jarring loading transitions.
- Avoid boxes inside boxes and panels inside panels unless there is a clear product reason.
- Keep the product feeling like a focused SPA where navigation is fast, stable, and predictable.
- For UI and UX plans, use the relevant UI/UX skill or current online research when needed, and cache useful reusable guidance locally only when it is clearly valuable.

## Investigation And Recommendations

- Investigate before recommending. Do not say something can be done until the relevant code, runtime, docs, or current online sources support it.
- If information may be outdated, uncertain, or fast-moving, research current sources online before making a recommendation.
- Be transparent about uncertainty, blockers, tradeoffs, and feasibility.
- Prefer product-facing language, user experience, and manual test expectations. Use source-level names only when the owner asks or when implementation accuracy requires them.
- Give the good, the bad, and the ugly when evaluating a direction.
- Do not flatter the owner or claim success without proof.

## Engineering Direction

- Reuse the existing backend and app-server architecture whenever possible.
- Do not duplicate backend flows that already exist.
- Avoid hardcoding. Prefer existing configuration, protocol, persistence, and tool abstractions.
- Less code is better when it preserves behavior and clarity.
- `docs/Arch.md` should point future agents to the right backend areas by feature and, when useful, by file, method, or type.

## Upstream Codex Rules

- Before changing `codex-rs/`, app-server protocol, TUI code, Rust tests, or upstream internals, read `AGENTS.codex-rs.md`.
- Critical upstream reminders:
  - Do not add or modify code related to `CODEX_SANDBOX_NETWORK_DISABLED_ENV_VAR` or `CODEX_SANDBOX_ENV_VAR`.
  - App-server API development should happen in v2, with schema/docs/test updates when API behavior changes.
  - Run `just fmt` in `codex-rs` after Rust changes, plus the scoped project tests requested by `AGENTS.codex-rs.md`.
  - Avoid adding new concepts to `codex-core` unless no better crate/module boundary exists.

## Verification Expectations

- After implementation work, manually run the app locally when feasible.
- Verify the user workflow, database or persisted state when relevant, console logs, automated tests, and any error surfaces touched by the work.
- For Codex Copy product features, "manually run the app" means using the real desktop app (`Codex Local`; Electron on the current branch) whenever feasible, not only a browser/dev-server approximation.
- Choose the fastest honest verification layer before falling back to coordinate screenshots: pure parser/state logic can use unit checks, component behavior can use a browser/component harness, repeated desktop flows should prefer a DOM/state automation gate when available, and screenshots/manual pointer driving are best kept for final visual sanity or when no better hook exists. Keep the tool choice guidance in `docs/UI-UX.md` and any dev-only gate architecture in `docs/Arch.md`.
- After implementing user-visible App Preview, Mockup Preview, Plan Mode, composer, or project behavior, dogfood the feature end-to-end in two local projects, preferably one interface-heavy and one backend/workflow-heavy project. Run them in parallel when the app/tooling allows it; otherwise run them in series.
- It is acceptable to close and reopen the desktop app for rebuilds, debug mode, or stale state. After testing, leave the app open unless the owner asks otherwise.
- If the E2E path is blocked by project switching, prompting, preview state, sizing, visibility, loading state, or too many unclear clicks, pause the feature claim, record the barrier, fix the Codex Copy product, and retest instead of shortcutting around the product.
- If something cannot be verified, say exactly what was not verified and why.
- For scaffolding-only documentation work, file and content verification is enough.

## Agent Team Guidance

- Use helper agents, subagents, researchers, security reviewers, and manual testers only when the task benefits from parallel investigation or independent review and the current session permits it.
- The main agent keeps final decision responsibility.
- For major plans, keep a product-review buddy perspective: one perspective builds the solution, the other checks whether it is actually better for the user.
- Do not delegate decisions that depend on subtle product context.
