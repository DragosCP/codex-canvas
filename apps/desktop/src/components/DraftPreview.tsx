import { GitBranch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ComposerAppPreviewContext,
  FeatureDraft,
  PlanPreviewAreaMark,
  Project,
} from "../types";
import type { PreviewToolbarSelectOption } from "./PreviewToolbarSelect";
import {
  LiveAppPreview,
  type LiveAppPreviewMarkMeta,
} from "./LiveAppPreview";

export function DraftPreview(props: {
  appPreviewContexts: ComposerAppPreviewContext[];
  canShowLive: boolean;
  draft: FeatureDraft | null;
  project: Project | null;
  onBuild: (draft: FeatureDraft) => void;
  onBuildBaselineRequest: (project: Project) => void;
  onDiscard: (draft: FeatureDraft) => void;
  onPark: (draft: FeatureDraft) => void;
  onResume: (draft: FeatureDraft) => void;
  onMarkArea: (
    project: Project,
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
}) {
  const project = props.project;
  const draft = props.draft;
  const [activeTab, setActiveTab] = useState<"live" | "draft">("draft");

  useEffect(() => {
    setActiveTab("draft");
  }, [draft?.draftId]);

  const showLiveLane = Boolean(project);
  const liveSelected = showLiveLane && activeTab === "live";
  const selectedProject = useMemo(() => {
    if (!project || !draft || liveSelected) return project;
    return {
      ...project,
      id: draft.previewOwnerId || `${project.id}:draft:${draft.draftId}`,
      path: draft.workspacePath,
      name: `${project.name} draft`,
    };
  }, [draft, liveSelected, project]);

  const appPreviewContexts = useMemo(() => {
    if (!selectedProject || !project) return props.appPreviewContexts;
    if (selectedProject.id === project.id) return props.appPreviewContexts;
    return props.appPreviewContexts.map((context) => ({
      ...context,
      projectId: selectedProject.id,
      projectName: selectedProject.name,
    }));
  }, [project, props.appPreviewContexts, selectedProject]);

  if (!project || !draft || !selectedProject) {
    return (
      <div className="live-preview-empty">
        <GitBranch size={18} />
        <strong>No draft selected</strong>
        <span>Choose an active draft from this chat.</span>
      </div>
    );
  }

  const draftSelected = !liveSelected;
  const tabOptions: PreviewToolbarSelectOption[] = [
    ...(showLiveLane
      ? [
          {
            id: "live",
            label: "Live",
            title: props.canShowLive ? "Current live app" : "Live is not ready",
            active: liveSelected,
            onSelect: () => setActiveTab("live"),
          },
        ]
      : []),
    {
      id: "draft",
      label: "Draft",
      title: draft.summary || draft.name,
      active: draftSelected,
      onSelect: () => setActiveTab("draft"),
    },
  ];
  const canBuild =
    draft.lifecycle === "active" &&
    draft.status === "ready" &&
    draft.changedFiles.length > 0;
  const secondaryAction =
    draft.lifecycle === "parked"
      ? {
          label: "Resume",
          title: "Resume this draft",
          action: () => props.onResume(draft),
        }
      : draft.lifecycle === "active"
        ? {
            label: "Park",
            title: "Park this draft",
            action: () => props.onPark(draft),
          }
        : null;
  const previewKey = liveSelected
    ? `live:${project.id}`
    : `draft:${draft.draftId}:${draft.status}:${draft.updatedAt}:${draft.changedFiles.length}`;

  return (
    <LiveAppPreview
      appPreviewContexts={appPreviewContexts}
      compareTabOptions={tabOptions}
      key={previewKey}
      onAreaMarkChange={(areaMark, meta) =>
        props.onMarkArea(project, areaMark, meta)
      }
      onBuildBaselineRequest={props.onBuildBaselineRequest}
      project={selectedProject}
      proposalControls={
        draftSelected
          ? {
              autoStart: true,
              buildDisabled: !canBuild,
              buildLabel: draft.status === "building" ? "Building" : "Build this",
              buildTitle: canBuild
                ? "Build this draft into Live"
                : draft.status === "ready"
                  ? "No draft changes detected yet"
                  : "Draft is not ready yet",
              onBuild: () => props.onBuild(draft),
              secondaryLabel: secondaryAction?.label,
              secondaryTitle: secondaryAction?.title,
              onSecondary: secondaryAction?.action,
            }
          : undefined
      }
      proposalLaneStatus={draftStatusLabel(draft)}
      proposalLaneTitle="Draft"
      statusLabel=""
    />
  );
}

function draftStatusLabel(draft: FeatureDraft) {
  if (draft.lifecycle === "discarded") return "Discarded";
  if (draft.lifecycle === "built") return "Built";
  if (draft.lifecycle === "parked") return "Parked";
  if (draft.status === "generating" || draft.status === "preparing") {
    return "Building draft";
  }
  if (draft.status === "failed") return "Needs attention";
  if (draft.changedFiles.length === 0) return "Ready";
  return "Ready";
}
