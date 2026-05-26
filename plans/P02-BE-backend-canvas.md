# P02-BE - Connections Planning Track

## Status

- State: Planning
- Location: `plans/`
- Related plan: `plans/wip/P02-visual-planning-canvas.md`
- Implementation: Deferred

## Summary

Connections is the non-UI half of Canvas. It is not a separate frontend/backend tab, not a draft canvas, and not a user-maintained architecture board.

The product-facing modes are:

- UI: what the app looks like and how it should behave.
- Connections: what the app is made of and how the code relates.

Connections should become living project truth for agents and humans. Codex should read it first before planning or changing code, and update it last after code changes.

## Product Direction

- Connections maps files, classes, functions, methods, components, hooks, stores, routes, APIs, services, persistence, tools, jobs, external integrations, and UI anchors.
- Connections should prevent duplicate or misplaced work by showing where a change belongs in the existing product/code graph.
- Connections is maintained automatically. The user should not have to babysit graph updates or approve routine graph maintenance.
- A large existing project may need a one-time scan/indexing pass. After that, the graph updates incrementally from changed neighborhoods.
- New or tiny projects can build Connections progressively as Codex creates and reads code.
- Hidden model thinking is not graph evidence. Durable graph updates should come from static scans, file reads, searches, edits, tool calls, and low-reasoning model summaries when needed.

## UX Model

Connections should feel like a calm zoomable map of ownership and flow.

- Zoomed out: product areas and feature clusters.
- Medium zoom: UI anchors, routes, components, stores, APIs, services, persistence, jobs/tools.
- Zoomed in: files, classes, functions, methods, calls, imports, reads/writes, data flow.

The graph itself should stay clean. Do not put primary buttons inside graph nodes. Header/status controls may show indexing state, refresh, or map status. Node and edge actions belong in right-click or the composer.

Useful right-click actions:

- Reference in composer
- Ask about this
- Flag as wrong

Connections does not use UI Canvas blue/current, gold/proposed, or red/deleted as truth states. It may use temporary emphasis for:

- selected neighborhood
- active change path
- recently changed path
- possible duplicate
- high-confidence conflict
- stronger flow through a child node

## Chat And `@` Model

The composer should eventually work like a project-wide reference picker:

- `@Canvas`: Canvas All or picker entry.
- `@Canvas-UI`: UI canvas only.
- `@Canvas-Connections`: current Connections graph only.
- Later picker entries can include files, UI refs, graph clusters, graph nodes, and relationships.

Selecting a Connections node or edge should insert a chip that sends compact graph context, not a screenshot. The user can also right-click a graph element and send it to the composer.

## Planning Model

Detailed text plans should become lighter as UI and Connections become the source of truth.

- UI shows proposed visual changes when human review is needed.
- Connections shows current code truth and ownership.
- Codex should use both before implementation.
- After implementation, Codex updates Connections automatically for the changed code neighborhoods.

Connections should not normally use Apply/Dismiss. Apply/Dismiss remains for UI generated drafts and UI proposal snapshots.

## Deferred Implementation Slice

- Add product-facing Connections tab beside UI.
- Add a Connections graph data contract: nodes, edges, clusters, UI anchors, relationship labels, confidence, evidence, and zoom/detail level.
- Add one-time project indexing for existing projects, with compact status in the Canvas header.
- Add incremental graph maintenance after Codex turns using changed files, searches, reads, edits, and tool activity.
- Add compact serialization for `@Canvas-Connections` and Plan Mode.
- Add right-click reference actions for graph nodes/edges.

## Open Questions

- What is the smallest reliable index we can build without slowing the app down?
- Which graph relationships should appear at each zoom level?
- How should stale or uncertain graph evidence be shown without making the user approve routine maintenance?
- Should Connections run indexing automatically on project load, on first Canvas open, or after the first code-related prompt?
