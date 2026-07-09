# Doc-prompt-canvas-v2 - Deferred Canvas Constitution

This document holds the richer Canvas product ideas that should wait until the minimal Live/Draft loop in `docs/Doc-prompt-00-canvas.md` is proven.

Do not use this document to inflate v1. V1 should remain one target switch, one Draft workspace, one build bridge.

## When V2 Begins

Start Canvas v2 only after v1 proves:

- one Draft can be created from Live;
- related follow-ups revise the same Draft;
- Live source stays unchanged until Build Draft;
- Build Draft and Discard are reliable;
- preview runtime is platform-owned;
- no duplicate Draft or prompt-loop recovery appears during dogfood.

## Product Direction

Canvas v2 expands the minimal Live/Draft model without replacing it.

The hierarchy remains:

```text
Live = real current project/source
Draft = default safe preview path
A/B/C = explicit alternatives
Wireframes/mockups = lower-fidelity artifacts for the right situation
```

A/B/C and mockups are not the default Canvas mental model. They are special occupants when comparison or lower-fidelity exploration is the job.

## Deferred Work Items

### Parked Drafts

Park preserves useful temporary work without keeping it as the current target.

Use when:

- the user wants to pause a Draft;
- a new unrelated Draft should start;
- a Draft should be saved for later review.

Restore brings back a parked Draft without leaking workspace paths or stale preview URLs.

### Multiple Named Drafts

Multiple Drafts should wait until one-Draft iteration feels excellent.

Named Drafts should be product-facing:

```text
Quick add flow
Settings location
Analytics review
```

Do not expose workspace names, IDs, or registry paths.

### Draft Staleness

If Live changes after Draft creation, build/apply should check staleness.

Possible decisions:

```text
Update Draft from Live
Keep old Draft
Discard Draft
```

Do not silently merge or silently discard.

## Placement Preflight

V1 may infer obvious homes. V2 adds stronger placement reasoning.

Before meaningful Draft edits, Codex should identify:

- source/base surface, usually Live;
- target surface, usually Draft;
- natural entry point in the current product;
- temporary behavior boundary;
- what build/apply would need to replace.

If the natural home is obvious and safe, state it and proceed:

```text
I will try this in Draft from the Members page header. Source unchanged.
```

If materially different homes are plausible, ask a governed decision:

```text
Where should this live?
Members page header
Workspace settings
Onboarding checklist
```

Placement options must come from real app structure, not generic UX categories.

## Rich Temporary Experiments

V2 can make Drafts more experiential.

For an existing app, a richer Draft should:

- preserve app shell, route shape, providers, navigation, density, typography, and styling;
- use fake local behavior only for the requested idea;
- avoid real backend, network, auth, billing, storage, or connector integration unless explicitly requested;
- show entry point, first action, selected state, review/approval state when relevant, and result state;
- name temporary assumptions so build/apply can replace them.

A valid Draft must not become:

- unrelated standalone demo page;
- wildcard route takeover;
- marketing page;
- explanation screen;
- static diagram;
- fake app that ignores the existing product.

## Compare Mode

A/B/C is for explicit alternatives.

Use when the user says:

```text
show me three directions
compare two layouts
give me conservative and bold versions
wireframe a few options
mock up three homepage concepts
```

Do not use A/B/C for:

- one feature preview;
- one placement change;
- one workflow exploration;
- "show me before building";
- follow-up refinement on an existing Draft;
- ordinary implementation work.

Compare options should have concrete product-facing labels and tradeoffs. A single generated proposal is not A/B/C.

## Wireframes And Mockups

Keep wireframes/mockups as artifact types, not the default for existing apps.

Prefer:

1. Draft in real app context for existing-app feature previews.
2. A/B/C live or code-backed options for explicit alternatives.
3. Wireframes/mockups when the app is unavailable, empty, broad, lower-fidelity, or explicitly requested.

Wireframes/mockups should still use the same target, work-item, and build/apply principles:

- source unchanged until explicit build/apply;
- visible artifact labels are product-facing;
- hidden paths and payloads never show;
- build/apply routes through normal implementation work.

## Side-By-Side And Viewed Surface

V2 may support side-by-side comparison.

Separate these concepts:

- `Message target`: where the next prompt applies.
- `Viewed surface`: what the user is looking at.

They often match, but not always. Viewing Draft should not silently make every next prompt Draft-targeted if the composer/footer says Live. The footer remains the source of truth.

Side-by-side can show:

- Live next to Draft;
- Live next to one selected option;
- selected A/B/C option beside another option when explicitly comparing.

## Visual References

Marks, screenshots, adjusted change areas, images, and captures are visual references.

Visible chip labels should stay short:

```text
Mark 1
Change 1
Image 1
```

Behind the scenes, preserve:

- project;
- thread;
- surface;
- work item;
- route/view state;
- viewport;
- screenshot;
- bounds;
- optional source/component hint.

Do not expose raw coordinates, DOM paths, internal IDs, route secrets, auth data, or source paths in visible UI.

## Surface Occupant Metadata

V2 occupants should carry enough internal state for routing and build/apply safety:

- surface id;
- occupant kind;
- display name;
- source/base surface;
- route and view state;
- viewport;
- status: empty, loading, ready, blocked, stale, parked, building, built, failed;
- protected/pinned state;
- buildable state;
- build policy;
- commitment level;
- data scope;
- recovery actions;
- verification state;
- attached marks or change evidence;
- durable backing reference.

Renderer-only state is not enough authority for anything that can later affect source.

## Build Policies

Build policy belongs to the occupant, not the visible button.

The same visible action can dispatch differently:

```text
direct_apply
agent_integrate
implement_from_artifact
convert_visual_to_code
explain_blocker
```

If an occupant contains fake local behavior, build/apply should usually route through integration work instead of blindly copying temporary behavior.

## Governed Decisions

Above-composer decisions remain rare.

Use them when:

- replacing or discarding valuable Draft/compare work;
- choosing between materially different placement homes;
- more than one protected surface is plausible;
- build/apply target is ambiguous;
- a stale Draft needs user direction;
- the action may touch real data or real source unexpectedly.

Do not use them as a general questionnaire, navigation bar, or replacement for the composer/footer target.

## Planning Mode With Canvas

Planning mode can use Canvas, but implementation writes remain blocked until accepted.

In v2, planning mode may prepare:

- visual references;
- Draft plans;
- mockup artifacts;
- compare options.

Accepting a plan starts normal implementation with selected surface/reference context. Rejecting keeps feedback focused and does not expose hidden Canvas machinery.

## V2 Implementation Order

Add complexity in this order:

1. Park and restore Draft.
2. Staleness check before build.
3. Placement preflight for materially different homes.
4. Richer fake local behavior inside Draft.
5. Multiple named Drafts.
6. A/B/C compare for explicit alternatives.
7. Wireframe/mockup artifacts for empty, broad, unavailable, or explicit lower-fidelity work.
8. Side-by-side comparison.
9. More advanced build policies.

Stop after each step and dogfood. If the product starts relying on transcript archaeology or duplicated header/footer controls, simplify before continuing.

## V2 Verification

Before claiming v2 is ready, verify:

- a parked Draft can be restored without stale paths or preview URLs;
- unrelated work parks or protects the existing Draft instead of overwriting it;
- stale Draft build asks or blocks instead of silently merging;
- A/B/C appears only for explicit alternatives;
- wireframes/mockups are not used when a product-context Draft is the better default;
- message target and viewed surface do not drift silently;
- build/apply always creates a reviewable source-changing turn;
- hidden payloads, prompt wrappers, and workspace paths never render in UI.

## V2 Non-Goals

Even in v2, avoid:

- a general visual DOM editor unless explicitly revived;
- developer/debug panels for ordinary users;
- raw activity log walls;
- permanent side panels required to understand Draft;
- a large artifact taxonomy exposed to users;
- full backend mocking platform before simple fake local behavior is proven;
- duplicating Live/Draft global target controls in both footer and preview header.
