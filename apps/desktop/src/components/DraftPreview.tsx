import { GitBranch } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  refreshNonce?: number;
  onBuild: (draft: FeatureDraft) => void;
  onBuildBaselineRequest: (project: Project) => void;
  onContinue: (draft: FeatureDraft) => void;
  onDiscard: (draft: FeatureDraft) => void;
  onPark: (draft: FeatureDraft) => void;
  onRefresh: (draft: FeatureDraft) => void;
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
  const [mountedTabs, setMountedTabs] = useState({
    draft: true,
    live: false,
  });

  useEffect(() => {
    setActiveTab("draft");
    setMountedTabs({ draft: true, live: false });
  }, [draft?.draftId]);

  const selectTab = useCallback((tab: "live" | "draft") => {
    setActiveTab(tab);
    setMountedTabs((current) =>
      current[tab] ? current : { ...current, [tab]: true },
    );
  }, []);

  const showLiveLane = Boolean(project);
  const liveSelected = showLiveLane && activeTab === "live";
  const draftProject = useMemo(() => {
    if (!project || !draft) return null;
    return {
      ...project,
      id: draft.previewOwnerId || `${project.id}:draft:${draft.draftId}`,
      path: draft.workspacePath,
      name: `${project.name} draft`,
    };
  }, [draft, project]);

  const draftAppPreviewContexts = useMemo(() => {
    if (!draftProject || !project) return props.appPreviewContexts;
    return props.appPreviewContexts.map((context) => ({
      ...context,
      projectId: draftProject.id,
      projectName: draftProject.name,
    }));
  }, [draftProject, project, props.appPreviewContexts]);
  const preferredDraftRoute = useMemo(
    () =>
      draft?.affectedRoutes.find((route) => route.trim().startsWith("/")) ?? "",
    [draft?.affectedRoutes],
  );

  if (!project || !draft || !draftProject) {
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
            onSelect: () => selectTab("live"),
          },
        ]
      : []),
    {
      id: "draft",
      label: "Draft",
      title: draft.summary || draft.name,
      active: draftSelected,
      onSelect: () => selectTab("draft"),
    },
  ];
  const canBuild =
    draft.lifecycle === "active" &&
    draft.status === "ready" &&
    draft.changedFiles.length > 0;
  const secondaryAction =
    draft.lifecycle === "active" && draft.status === "failed"
      ? {
          label: "Continue",
          title: "Continue this draft",
          action: () => props.onContinue(draft),
        }
      : draft.lifecycle === "parked"
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
  const draftControls = {
    autoStart: true,
    buildDisabled: !canBuild,
    buildLabel: draft.status === "building" ? "Building" : "Build this",
    buildTitle: canBuild
      ? "Build this draft into Live"
      : draft.status === "ready"
        ? "No draft changes detected yet"
        : "Draft is not ready yet",
    onBuild: () => props.onBuild(draft),
    dangerLabel: "Discard",
    dangerTitle: "Discard this draft",
    onDanger: () => props.onDiscard(draft),
    refreshLabel: "Refresh",
    refreshTitle: "Refresh Draft preview",
    onRefresh: () => props.onRefresh(draft),
    secondaryLabel: secondaryAction?.label,
    secondaryTitle: secondaryAction?.title,
    onSecondary: secondaryAction?.action,
  };

  return (
    <div className="draft-preview-warm-stack">
      {mountedTabs.live && showLiveLane ? (
        <div
          aria-hidden={!liveSelected}
          className={`draft-preview-warm-pane ${
            liveSelected ? "active" : "inactive"
          }`}
        >
          <LiveAppPreview
            appPreviewContexts={props.appPreviewContexts}
            appStateLaneStatus={
              props.canShowLive ? "Current app" : "Live is not ready"
            }
            appStateLaneTitle="Live"
            appStateTabOptions={tabOptions}
            key={`live:${project.id}`}
            onAreaMarkChange={(areaMark, meta) =>
              props.onMarkArea(project, areaMark, {
                ...meta,
                surface: "live",
                draftId: undefined,
              })
            }
            onBuildBaselineRequest={props.onBuildBaselineRequest}
            project={project}
            sessionPartitionKey={project.id}
            statusLabel=""
          />
        </div>
      ) : null}
      <div
        aria-hidden={!draftSelected}
        className={`draft-preview-warm-pane ${
          draftSelected ? "active" : "inactive"
        }`}
      >
        <LiveAppPreview
          appPreviewContexts={draftAppPreviewContexts}
          appStateLaneStatus={draftStatusLabel(draft)}
          appStateLaneTitle="Draft"
          appStateTabOptions={tabOptions}
          key={`draft:${draft.draftId}:${props.refreshNonce ?? 0}`}
          onAreaMarkChange={(areaMark, meta) =>
            props.onMarkArea(project, areaMark, {
              ...meta,
              surface: "draft",
              draftId: draft.draftId,
              threadId: draft.threadId,
            })
          }
          onBuildBaselineRequest={props.onBuildBaselineRequest}
          preferredRoute={preferredDraftRoute}
          project={draftProject}
          previewControls={draftControls}
          sessionPartitionKey={project.id}
          statusLabel=""
        />
      </div>
    </div>
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
