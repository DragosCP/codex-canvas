import type { ComposerContextReference } from "./types";

export function nextAppPreviewMarkNumber(
  contexts: ComposerContextReference[],
  projectId: string,
) {
  return (
    contexts.reduce((max, context) => {
      if (context.type !== "appPreview" || context.projectId !== projectId) {
        return max;
      }
      if (context.source === "proposalHighlight") return max;
      return Math.max(max, context.markNumber || markNumberFromLabel(context.markLabel));
    }, 0) + 1
  );
}

export function nextAppPreviewChangeNumber(
  contexts: ComposerContextReference[],
  projectId: string,
) {
  return (
    contexts.reduce((max, context) => {
      if (
        context.type !== "appPreview" ||
        context.projectId !== projectId ||
        context.source !== "proposalHighlight"
      ) {
        return max;
      }
      return Math.max(max, context.markNumber || markNumberFromLabel(context.markLabel));
    }, 0) + 1
  );
}

function markNumberFromLabel(label: string | undefined) {
  if (!label) return 0;
  const match = label.match(/\b(?:mark|change)\s+(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}
