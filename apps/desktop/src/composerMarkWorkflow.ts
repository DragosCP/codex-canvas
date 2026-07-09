import {
  composerContextIdentity,
  nextAppPreviewMarkNumber,
} from "./composerContexts";
import type {
  CanvasVisualReferenceMeta,
  ComposerAppPreviewContext,
  ComposerContextReference,
  PlanPreviewAreaMark,
  Project,
} from "./types";

export function upsertAppPreviewMarkContext(args: {
  contexts: ComposerContextReference[];
  project: Project;
  areaMark: PlanPreviewAreaMark | null;
  meta: {
    previewUrl: string;
    route?: string;
    viewport: "desktop" | "mobile";
    thumbnailDataUrl?: string;
    label?: string;
    surface?: ComposerAppPreviewContext["surface"];
    draftId?: string;
    threadId?: string | null;
  } & CanvasVisualReferenceMeta;
  activeThreadId: string | null;
}) {
  if (!args.areaMark) {
    return clearAppPreviewMarksForProject(args.contexts, args.project.id);
  }
  const existingContext = args.contexts.find(
    (context): context is ComposerAppPreviewContext =>
      context.type === "appPreview" &&
      context.projectId === args.project.id &&
      context.areaMark.createdAt === args.areaMark?.createdAt,
  );
  const markNumber =
    existingContext?.markNumber ??
    nextAppPreviewMarkNumber(args.contexts, args.project.id);
  const nextContext: ComposerAppPreviewContext = {
    type: "appPreview",
    id:
      existingContext?.id ??
      `app-preview:${args.project.id}:${args.areaMark.createdAt}`,
    projectId: args.project.id,
    projectName: args.project.name,
    surface: args.meta.surface ?? "live",
    draftId: args.meta.draftId ?? existingContext?.draftId,
    threadId:
      args.meta.threadId ?? existingContext?.threadId ?? args.activeThreadId,
    route: args.meta.route ?? args.areaMark.route ?? existingContext?.route,
    previewUrl: args.meta.previewUrl,
    viewport: args.meta.viewport,
    markLabel: existingContext?.markLabel ?? `Mark ${markNumber}`,
    markNumber,
    areaMark: args.areaMark,
    thumbnailDataUrl:
      args.meta.thumbnailDataUrl ?? existingContext?.thumbnailDataUrl,
    canvasId: args.meta.canvasId ?? existingContext?.canvasId,
    sourceFile: args.meta.sourceFile ?? existingContext?.sourceFile,
    componentName: args.meta.componentName ?? existingContext?.componentName,
    screenshotRef: args.meta.screenshotRef ?? existingContext?.screenshotRef,
    targetResolutionKind:
      args.meta.targetResolutionKind ?? existingContext?.targetResolutionKind,
    targetResolutionConfidence:
      args.meta.targetResolutionConfidence ??
      existingContext?.targetResolutionConfidence,
  };
  const withoutCurrentMark = args.contexts.filter(
    (context) =>
      context.type !== "appPreview" ||
      context.projectId !== args.project.id ||
      context.areaMark.createdAt !== args.areaMark?.createdAt,
  );
  return [...withoutCurrentMark, nextContext];
}

export function clearAppPreviewMarksForProject(
  contexts: ComposerContextReference[],
  projectId: string,
) {
  return contexts.filter(
    (context) =>
      context.type !== "appPreview" || context.projectId !== projectId,
  );
}

export function removeComposerContextByIdentity(
  contexts: ComposerContextReference[],
  context: ComposerContextReference,
) {
  return contexts.filter(
    (candidate) =>
      candidate.type !== context.type ||
      composerContextIdentity(candidate) !== composerContextIdentity(context),
  );
}
