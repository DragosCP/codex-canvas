import { featureDraftIsActiveForRouting } from "./featureDraftWorkflow";
import type {
  DesktopState,
  FeatureDraft,
  InspectorSelection,
  Project,
} from "./types";

export function preferredLivePreviewSelection(args: {
  projects: Project[];
  featureDrafts: DesktopState["featureDrafts"];
  featureDraftActiveIdsByThreadId: DesktopState["featureDraftActiveIdsByThreadId"];
  projectId: string;
  threadId: string | null;
}): InspectorSelection {
  const project = args.projects.find((item) => item.id === args.projectId);
  const featureDraftThreadId = args.threadId ?? project?.lastActiveThreadId ?? null;
  const featureDraftId =
    featureDraftThreadId != null
      ? args.featureDraftActiveIdsByThreadId[featureDraftThreadId]?.trim() ||
        ""
      : latestActiveFeatureDraft(args.featureDrafts, args.projectId)?.draftId ??
        "";
  const featureDraft = featureDraftId
    ? args.featureDrafts[featureDraftId]
    : null;
  if (featureDraftIsActiveForRouting(featureDraft ?? null, args.projectId)) {
    return {
      type: "draftPreview",
      projectId: args.projectId,
      draftId: featureDraftId,
    };
  }
  return {
    type: "appPreview",
    projectId: args.projectId,
  };
}

function latestActiveFeatureDraft(
  featureDrafts: DesktopState["featureDrafts"],
  projectId: string,
): FeatureDraft | null {
  return (
    Object.values(featureDrafts)
      .filter(
        (draft) =>
          draft.projectId === projectId &&
          draft.lifecycle === "active",
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}
