import type { CanvasTargetMetadataResult } from "./canvasTargeting";
import type { CanvasVisualReferenceMeta, ProposalHighlight } from "./types";
import type { VisualPatchBundle } from "./visualPatchRuntime";

export function proposalHighlightsForVisualPatchTargets(_args: {
  bundle: VisualPatchBundle;
  targetMetadata: CanvasTargetMetadataResult;
  variantId: "A" | "B" | "C";
  route?: string;
  createdAt?: number;
  referenceMeta?: CanvasVisualReferenceMeta;
}): ProposalHighlight[] {
  return [];
}

export function mergeProposalHighlightsWithVisualPatchTargets(
  authoredHighlights: ProposalHighlight[],
  _visualPatchHighlights: ProposalHighlight[],
) {
  return authoredHighlights;
}
