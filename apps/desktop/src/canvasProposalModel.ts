export type CanvasProposalDisplayLane = "A" | "B" | "C";

export type ProposalPreviewArtifactKind = "mockup" | "wireframe" | "preview";

export type ProposalBacking =
  | "wireframe_artifact"
  | "mockup_artifact"
  | "live_dom_patch"
  | "code_backed_workspace";

export type ProposalLifecycle =
  | "draft"
  | "shown"
  | "revised"
  | "selected"
  | "accepted_for_build"
  | "building"
  | "built"
  | "verified"
  | "promoted_to_live"
  | "rejected"
  | "archived";

export type BuildSelectedStrategy =
  | "implement_from_wireframe"
  | "implement_from_mockup"
  | "convert_dom_patch_to_code"
  | "promote_code_workspace";

export function isCanvasProposalDisplayLane(
  value: unknown,
): value is CanvasProposalDisplayLane {
  return value === "A" || value === "B" || value === "C";
}

export function normalizeProposalBacking(
  value: unknown,
  fallback: ProposalBacking,
): ProposalBacking {
  return value === "wireframe_artifact" ||
    value === "mockup_artifact" ||
    value === "live_dom_patch" ||
    value === "code_backed_workspace"
    ? value
    : fallback;
}

export function normalizeProposalLifecycle(
  value: unknown,
  fallback: ProposalLifecycle,
): ProposalLifecycle {
  return value === "draft" ||
    value === "shown" ||
    value === "revised" ||
    value === "selected" ||
    value === "accepted_for_build" ||
    value === "building" ||
    value === "built" ||
    value === "verified" ||
    value === "promoted_to_live" ||
    value === "rejected" ||
    value === "archived"
    ? value
    : fallback;
}

export function buildStrategyForProposalBacking(
  backing: "wireframe_artifact",
): "implement_from_wireframe";
export function buildStrategyForProposalBacking(
  backing: "mockup_artifact",
): "implement_from_mockup";
export function buildStrategyForProposalBacking(
  backing: "live_dom_patch",
): "convert_dom_patch_to_code";
export function buildStrategyForProposalBacking(
  backing: "code_backed_workspace",
): "promote_code_workspace";
export function buildStrategyForProposalBacking(
  backing: ProposalBacking,
): BuildSelectedStrategy;
export function buildStrategyForProposalBacking(
  backing: ProposalBacking,
): BuildSelectedStrategy {
  switch (backing) {
    case "wireframe_artifact":
      return "implement_from_wireframe";
    case "mockup_artifact":
      return "implement_from_mockup";
    case "live_dom_patch":
      return "convert_dom_patch_to_code";
    case "code_backed_workspace":
      return "promote_code_workspace";
  }
}

export function proposalBackingForPreviewArtifactKind(
  artifactKind: ProposalPreviewArtifactKind,
): Extract<ProposalBacking, "wireframe_artifact" | "mockup_artifact"> {
  return artifactKind === "wireframe" ? "wireframe_artifact" : "mockup_artifact";
}

export function normalizeBuildSelectedStrategy(
  value: unknown,
  backing: ProposalBacking,
): BuildSelectedStrategy {
  void value;
  const expected = buildStrategyForProposalBacking(backing);
  return expected;
}
