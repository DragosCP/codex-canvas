import { hasDraftContent } from "./attachments";
import type {
  ComposerAppPreviewContext,
  ComposerContextReference,
  LocalChatDraft,
} from "./types";

export function nextAppPreviewMarkNumber(
  contexts: ComposerContextReference[],
  projectId: string,
) {
  return (
    contexts.reduce((max, context) => {
      if (context.type !== "appPreview" || context.projectId !== projectId) {
        return max;
      }
      return Math.max(max, context.markNumber || markNumberFromLabel(context.markLabel));
    }, 0) + 1
  );
}

function markNumberFromLabel(label: string | undefined) {
  if (!label) return 0;
  const match = label.match(/\bmark\s+(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) || 0 : 0;
}

export function promptWithComposerContexts(
  prompt: string,
  contexts: ComposerContextReference[],
) {
  if (contexts.length === 0) return prompt;
  const blocks = contexts
    .map((context) => serializeAppPreviewContext(context))
    .filter((block): block is string => Boolean(block));
  if (blocks.length === 0) return prompt;
  const guidance = [
    "The user-visible request remains authoritative. Use the attached context only as supporting visual guidance.",
    "Use only the attached context unless the user asks you to inspect more.",
    "For @AppMark context, treat the rectangle as user-created visual intent in the stated Live or Draft surface. Draft-origin marks should keep follow-up work on that Draft unless the user explicitly changes target.",
    "Do not assume this context is attached to future prompts unless the user attaches it again.",
  ].filter((line): line is string => Boolean(line));
  return `${prompt}\n\nProject context explicitly attached by the user:\n${blocks.join(
    "\n\n",
  )}\n\n${guidance.join("\n")}`;
}

function serializeAppPreviewContext(context: ComposerAppPreviewContext) {
  const mark = context.areaMark;
  const lines = [
    `@AppMark project="${quotePromptValue(context.projectName, 80)}"`,
    `mark=${quotePromptValue(context.markLabel || "Mark 1", 80)}`,
    `surface=${context.surface}`,
    `previewUrl=${quotePromptValue(context.previewUrl, 160)}`,
    `route=${quotePromptValue(context.route ?? mark.route ?? context.previewUrl, 180)}`,
    `viewport=${context.viewport}`,
    `areaRect=${Math.round(mark.x)},${Math.round(mark.y)},${Math.round(
      mark.width,
    )},${Math.round(mark.height)}`,
    `previewSize=${Math.round(mark.viewportWidth)}x${Math.round(
      mark.viewportHeight,
    )}`,
    `createdAt=${mark.createdAt}`,
  ];
  if (context.draftId) {
    lines.push(`draftId=${quotePromptValue(context.draftId, 120)}`);
  }
  if (context.threadId) {
    lines.push(`threadId=${quotePromptValue(context.threadId, 120)}`);
  }
  if (context.canvasId) {
    lines.push(`canvasId=${quotePromptValue(context.canvasId, 120)}`);
  }
  if (context.sourceFile) {
    lines.push(`sourceFile=${quotePromptValue(context.sourceFile, 180)}`);
  }
  if (context.componentName) {
    lines.push(`component=${quotePromptValue(context.componentName, 120)}`);
  }
  if (context.screenshotRef) {
    lines.push(`screenshotRef=${quotePromptValue(context.screenshotRef, 160)}`);
  }
  if (context.targetResolutionKind || context.targetResolutionConfidence) {
    lines.push(
      `targetResolution=${context.targetResolutionKind ?? "unknown"}/${
        context.targetResolutionConfidence ?? "unknown"
      }`,
    );
  }
  if (mark.note.trim()) {
    lines.push(`note="${quotePromptValue(mark.note.trim(), 180)}"`);
  }
  return lines.join("\n");
}

export function quotePromptValue(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  const clipped =
    compact.length > maxLength
      ? `${compact.slice(0, maxLength - 1)}...`
      : compact;
  return clipped.replace(/"/g, "'");
}

export function visibleDraftForProject(
  draft: LocalChatDraft | undefined,
  activeDraftProjectId: string | null,
) {
  if (!draft) return null;
  return draft.projectId === activeDraftProjectId || hasDraftContent(draft)
    ? draft
    : null;
}

export function composerContextsForProject(
  contexts: ComposerContextReference[],
  projectId: string,
) {
  return contexts.filter((context) => context.projectId === projectId);
}

export function dedupeComposerContexts(contexts: ComposerContextReference[]) {
  const seen = new Set<string>();
  const deduped: ComposerContextReference[] = [];
  for (const context of contexts) {
    const key = composerContextIdentity(context);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(context);
  }
  return deduped;
}

export function pruneSentComposerContextsByTurnId(
  contextsByTurnId: Record<string, ComposerContextReference[]>,
) {
  const entries = Object.entries(contextsByTurnId).filter(
    ([, contexts]) => contexts.length > 0,
  );
  return Object.fromEntries(entries.slice(-80));
}

export function composerContextIdentity(context: ComposerContextReference) {
  return `${context.projectId}:app-preview:${context.id}`;
}

export function composerContextSearchLabel(context: ComposerContextReference) {
  return `${context.projectName} App Preview ${
    context.markLabel || "Mark 1"
  } ${context.previewUrl}`;
}

export function sameComposerContextList(
  left: ComposerContextReference[],
  right: ComposerContextReference[],
) {
  if (left.length !== right.length) return false;
  return left.every((context, index) => {
    const other = right[index];
    return other
      ? other.type === context.type &&
          composerContextIdentity(other) === composerContextIdentity(context)
      : false;
  });
}
