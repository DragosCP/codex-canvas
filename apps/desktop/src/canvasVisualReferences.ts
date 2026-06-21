import type { CanvasTargetMetadataResult, ElementRef } from "./canvasTargeting";
import type { CanvasVisualReferenceMeta, ProposalHighlight } from "./types";
import type { VisualPatchBundle } from "./visualPatchRuntime";

export function proposalHighlightsForVisualPatchTargets(args: {
  bundle: VisualPatchBundle;
  targetMetadata: CanvasTargetMetadataResult;
  variantId: "A" | "B" | "C";
  route?: string;
  createdAt?: number;
  referenceMeta?: CanvasVisualReferenceMeta;
}): ProposalHighlight[] {
  if (!args.targetMetadata.ok) return [];
  const targetMetadata = args.targetMetadata;
  const targetMetadataByCanvasId = new Map(
    targetMetadata.targets.map((target) => [
      target.elementRef.canvasId,
      target,
    ]),
  );
  const refs = uniqueVisualPatchTargets(args.bundle);
  const createdAt = args.createdAt ?? Date.now();
  const highlights: ProposalHighlight[] = [];
  refs.forEach((ref, index) => {
    const metadata = targetMetadataByCanvasId.get(ref.canvasId);
    if (!metadata) return;
    const elementRef = {
      ...metadata.elementRef,
      ...withoutEmptyElementRef(ref),
    };
    const bounds = metadata.resolution.bounds;
    const label = `Change ${index + 1}`;
    const note = elementRef.componentName
      ? `Change target: ${elementRef.componentName}`
      : `Change target: ${elementRef.canvasId}`;
    highlights.push({
      id: `visual-patch:${args.variantId}:${elementRef.canvasId}`,
      label,
      note,
      areaMark: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        viewportWidth: bounds.viewportWidth,
        viewportHeight: bounds.viewportHeight,
        route: args.route || targetMetadata.route,
        note,
        createdAt: createdAt + index,
      },
      ...args.referenceMeta,
      proposalOptionId:
        args.referenceMeta?.proposalOptionId ?? args.variantId,
      canvasLane: args.referenceMeta?.canvasLane ?? args.variantId,
      canvasId: elementRef.canvasId,
      sourceFile: elementRef.sourceFile,
      componentName: elementRef.componentName,
      screenshotRef: metadata.resolution.screenshotRef,
      targetResolutionKind: metadata.resolution.kind,
      targetResolutionConfidence: metadata.resolution.confidence,
    });
  });
  return highlights;
}

export function mergeProposalHighlightsWithVisualPatchTargets(
  authoredHighlights: ProposalHighlight[],
  visualPatchHighlights: ProposalHighlight[],
) {
  if (authoredHighlights.length === 0) return visualPatchHighlights;
  return authoredHighlights.map((highlight, index) => {
    const visualPatchHighlight = visualPatchHighlights[index];
    if (!visualPatchHighlight) return highlight;
    return {
      ...highlight,
      threadId: highlight.threadId ?? visualPatchHighlight.threadId,
      proposalTurnId:
        highlight.proposalTurnId ?? visualPatchHighlight.proposalTurnId,
      proposalOptionId:
        highlight.proposalOptionId ?? visualPatchHighlight.proposalOptionId,
      canvasLane: highlight.canvasLane ?? visualPatchHighlight.canvasLane,
      canvasId: highlight.canvasId ?? visualPatchHighlight.canvasId,
      sourceFile: highlight.sourceFile ?? visualPatchHighlight.sourceFile,
      componentName:
        highlight.componentName ?? visualPatchHighlight.componentName,
      screenshotRef:
        highlight.screenshotRef ?? visualPatchHighlight.screenshotRef,
      targetResolutionKind:
        highlight.targetResolutionKind ??
        visualPatchHighlight.targetResolutionKind,
      targetResolutionConfidence:
        highlight.targetResolutionConfidence ??
        visualPatchHighlight.targetResolutionConfidence,
    } satisfies ProposalHighlight;
  });
}

function uniqueVisualPatchTargets(bundle: VisualPatchBundle): ElementRef[] {
  const seen = new Set<string>();
  const refs: ElementRef[] = [];
  for (const patch of bundle.patches) {
    const canvasId = patch.target.canvasId.trim();
    if (!canvasId || seen.has(canvasId)) continue;
    seen.add(canvasId);
    refs.push(patch.target);
  }
  return refs;
}

function withoutEmptyElementRef(ref: ElementRef): ElementRef {
  return {
    canvasId: ref.canvasId,
    sourceFile: ref.sourceFile?.trim() || undefined,
    componentName: ref.componentName?.trim() || undefined,
  };
}
