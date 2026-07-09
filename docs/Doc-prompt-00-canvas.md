# Doc-prompt-00-canvas - Minimal Live/Draft Prompt

You are building the minimum useful Canvas layer for the future platform.

This document assumes the app shell from `docs/Doc-prompt-00.md` exists: projects, chats, composer, progress, approvals, file review, decision space, visual chips, planning mode, and managed preview.

This is the v1 Canvas constitution. It intentionally avoids the larger Canvas system. Deferred ideas such as A/B/C, rich wireframes/mockups, multiple drafts, parked drafts, stale-draft rebasing, and broad visual planning live in `docs/Doc-prompt-canvas-v2.md`.

## Product Thesis

The first Canvas product should prove one boring, powerful loop:

```text
Work in Live when changes should affect the real project.
Switch to Draft when the builder wants to try an idea safely.
Keep revising the same Draft until the workflow feels right.
Build Draft into Live only when the builder chooses that path.
```

The minimum minimum is:

```text
One target switch.
One Draft workspace.
One build bridge.
```

Do not begin with a routing-heavy Canvas that guesses from transcript history. The platform should know where the next message goes before an agent turn starts.

## Scope

This minimal Canvas owns:

- a composer/footer `Live | Draft` message target;
- one active Draft work item for the current thread or project;
- a Draft workspace copied from the Live project;
- targeted sends to either Live or Draft;
- a small hidden prompt wrapper for the selected target;
- optional Draft preview using the platform-owned preview runtime;
- `Build Draft`;
- `Discard Draft`;
- small target-transition receipts;
- the minimum recovery behavior needed to preserve valid Draft work.

This minimal Canvas does not own:

- A/B/C compare;
- wireframe/mockup artifact flows;
- multiple named Drafts;
- parked/restored Drafts;
- Draft staleness and rebase workflows;
- advanced placement questionnaires;
- broad fake backend or mocking infrastructure;
- visual DOM editing;
- rich Canvas headers;
- side-by-side compare.

Those belong in `docs/Doc-prompt-canvas-v2.md` after the first Live/Draft loop is proven.

## Core Objects

The architecture should stay small.

```ts
type MessageTarget = "live" | "draft";

type Draft = {
  id: string;
  projectId: string;
  threadId: string;
  status: "active" | "ready" | "failed" | "built" | "discarded";
  basePath: string;
  workspacePath: string;
  createdAt: number;
  updatedAt: number;
};
```

Use these primitives:

- `Live`: the real project/source path.
- `Draft`: one temporary workspace copied from Live.
- `Message target`: the composer/footer destination for the next user message.
- `Target resolver`: the small deterministic layer that resolves the next turn before send.
- `Preview runtime`: platform-owned local preview lifecycle.
- `Commit boundary`: the explicit bridge from temporary Draft work to real Live source changes.

The transcript is evidence, not the source of truth. A chat turn attaches to a target and work item. It does not secretly create a new work item because the previous transcript mentioned Draft.

## UI Contract

Global intent belongs where the message is formed: under the composer.

Minimum footer:

```text
Target: [ Live | Draft ]
```

The target should include a small source-effect hint:

```text
Live changes project files
Draft keeps source unchanged
```

When a Draft exists, show only the minimum lifecycle affordances near the target:

```text
Draft: Active
Build Draft
Discard
```

If Draft preview exists, add:

```text
Refresh
```

The preview header should not duplicate the global target switch. It owns preview-local controls:

- refresh/reload;
- open;
- stop;
- detect/use URL;
- mark area;
- show changes when later features support change evidence.

Above-composer decisions are not navigation and not a mode bar. They are rare brakes for real choices.

## Default Target Rules

Use blunt defaults.

```text
If no Draft exists:
  default target is Live.

If the user asks for direct implementation, fixing, refactoring, backend work, or ordinary source changes:
  target Live.

If the user says "show me first", "try", "visualize", "before building", or equivalent:
  create Draft if needed, switch target to Draft, and keep source unchanged.

If target is Draft and the request is related:
  revise the same Draft.

If target is Draft and the user says "build", "apply", "make it real", or "push live":
  build Draft into Live.

If Draft is built:
  mark Draft built and switch target to Live.

If Draft is discarded:
  mark Draft discarded and switch target to Live.

If the user explicitly switches target:
  use the selected target unless the transition would lose work or cross the source boundary ambiguously.

If user wording clearly contradicts the footer target:
  resolve the contradiction with a small receipt when safe, or ask a governed decision when unsafe.
```

Examples:

```text
Switched to Draft. Source unchanged.
```

```text
Continuing in Live because you asked to make it real.
```

```text
Building Draft into Live. Source will change.
```

## Target Resolver

Before every send, resolve the target and commitment.

Minimum resolver:

```text
If the user explicitly says build/apply/make real:
  if Draft exists:
    run Build Draft
  else:
    send to Live

Else if the user says show/try/visualize/before building:
  ensure Draft exists
  set target to Draft
  send to Draft

Else:
  send to the current composer/footer target
```

The resolver should return:

- resolved target;
- work item id;
- commitment: temporary or source-changing;
- source effect;
- whether a governed decision is needed.

The agent receives the resolved state as compact context. The user sees only small product-facing receipts when state changes.

## Prompt Wrapper

Keep target instructions short.

For Live:

```text
You are working on the real project source. Changes affect Live.
Use the normal project files and verification path.
```

For Draft:

```text
You are working in a temporary Draft workspace.
Keep Live source unchanged.
Use fake local state only where needed to show the requested workflow.
Do not start preview or dev servers; the platform owns preview.
```

The wrapper should never leak workspace paths, hidden IDs, registry data, or internal routing names into visible chat.

## Draft Workspace Contract

When Draft is created:

```text
copy Live project source -> Draft workspace
```

All Draft-targeted turns run in the Draft workspace. All Live-targeted turns run in the real project.

Draft source labels shown to the user should be product-facing:

```text
Draft / src/...
```

not hidden workspace paths.

The Draft workspace may use temporary component state, local fixture data, visual-only adapters, or mock handlers only for the requested workflow. It should preserve the app shell, route shape, providers, navigation, components, density, and visual language unless the user explicitly asks for a standalone prototype.

## Preview Runtime

Preview is platform-owned.

Agents must not:

- start long-running preview servers;
- keep searching for fresh ports;
- use preview-server commands to prove Draft readiness;
- leave unmanaged preview processes behind.

The platform may show:

- Live preview from the real project;
- Draft preview from the Draft workspace;
- unavailable state with honest next steps.

If preview is not implemented yet, the first Live/Draft proof can still use source diff review. Do not block the architecture on rich preview.

## Build Draft

`Build Draft` is the explicit bridge from temporary work to real source changes.

Minimum behavior:

1. Diff Draft workspace against the Live baseline.
2. Apply the patch to Live if clean.
3. If the patch does not apply cleanly, stop and route to integration work or ask for help.
4. Run the fastest honest verification.
5. Mark Draft built.
6. Switch target to Live.
7. Show changed-file review through the app shell.

Build should be conservative. Do not blindly copy temporary behavior if it depends on fake data or mock handlers that should become real integration later.

## Discard Draft

`Discard` cancels the active Draft and leaves Live unchanged.

Minimum behavior:

1. Mark Draft discarded.
2. Delete or archive the Draft workspace.
3. Switch target to Live.
4. Clear Draft preview state.

Discard is destructive for Draft work, so keep the label explicit.

## Recovery

Recovery is a state transition, not a prompt loop.

Minimum rules:

- If no Draft work happened, retry or continue may be valid.
- If valid Draft file changes happened but final verification was interrupted, preserve the Draft and show reviewable state.
- If Draft touched files outside its workspace, block and explain.
- If preview failed, offer refresh/reconnect through the platform instead of asking the agent to start a new server.
- Always avoid trapping the user between `Continue` and `Discard` when useful Draft work exists.

## Decision Space

Keep above-composer decisions rare.

Use a governed decision only when:

- proceeding would overwrite or discard useful Draft work;
- the user wording conflicts with the current target and source effect matters;
- build/apply target is ambiguous;
- the platform cannot safely choose between Live and Draft;
- continuing would waste meaningful time or lose work.

Do not ask when:

- the footer target is clear;
- the user clearly requested a safe target transition;
- Draft is empty and "show me first" naturally means Draft;
- the task is informational or operational.

Decision choices should be concrete and should fill the composer. Nothing proceeds until the user presses Send.

Examples:

```text
Revise Draft
New Draft
```

```text
Build Draft
Keep reviewing
```

For v1, avoid broader questionnaires about artifact type, fidelity, A/B/C, or wireframe style. Those belong in v2.

## Minimum Implementation Phases

Each phase must end with a visible product checkpoint.

### Phase 1 - Target Footer

Add the composer/footer `Live | Draft` target.

Visible checkpoint:

- New chat defaults to Live.
- The footer states the source effect.
- Switching target changes the next-message target state.
- No Draft workspace is created until needed.

### Phase 2 - Draft Workspace

Create one Draft workspace lazily.

Visible checkpoint:

- "Show me first" creates Draft.
- Target switches to Draft.
- Draft is attached to the thread or project.
- Live source remains unchanged.

### Phase 3 - Targeted Sends

Route turns to Live or Draft.

Visible checkpoint:

- Live target edits real project files.
- Draft target edits Draft workspace files.
- Transcript labels hide workspace internals.
- Related follow-ups revise the same Draft.

### Phase 4 - Build And Discard

Add the two lifecycle actions.

Visible checkpoint:

- `Build Draft` applies clean Draft diff to Live and switches target to Live.
- `Discard` removes Draft and switches target to Live.
- Changed-file review appears after build.

### Phase 5 - Optional Draft Preview

Connect Draft workspace to the platform preview runtime.

Visible checkpoint:

- Live and Draft can be previewed without agent-started servers.
- Refresh reloads the selected preview.
- Preview state does not leak across projects or targets.

### Phase 6 - Dogfood

Prove the loop.

Visible checkpoint:

- Use one existing app.
- Create one Draft.
- Revise it through at least two follow-up prompts.
- Verify no duplicate Draft is created.
- Verify no prompt-created preview ports appear.
- Build it or discard it.

## Verification Checklist

- New chat defaults to Live.
- User can switch footer target to Draft.
- "Show me first" creates Draft and switches target to Draft.
- Draft edits do not change Live source.
- Related follow-ups revise the same Draft.
- Agent does not start preview/dev servers for Draft verification.
- Build Draft changes Live only after explicit action.
- Discard Draft leaves Live unchanged.
- Interrupted valid Draft work returns to reviewable state instead of a prompt loop.
- Hidden workspace paths, IDs, and prompt wrappers never render in chat, composer, Activity, titles, or copied transcript.

## What Not To Build First

- A/B/C.
- Wireframe/mockup artifacts.
- Parked/restored Drafts.
- Multiple named Drafts.
- Draft staleness/rebase.
- Full placement preflight.
- Rich fake backend infrastructure.
- General visual DOM editor.
- Permanent Canvas side panels.
- Header-level global Live/Draft tabs duplicating the footer.

Start with one existing app, one Draft, repeated Draft revision, and one explicit build/discard path.

## Success Criteria

- The builder understands where the next message goes.
- Draft feels like a safe place to iterate, not a separate agent instance.
- Live remains the real source of truth.
- Build Draft is the only bridge from temporary Draft work to real source changes.
- The architecture is small enough to reason about without transcript archaeology.
