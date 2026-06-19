import { GitBranch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CodeProposalOption,
  CodeProposalSet,
  ComposerAppPreviewContext,
  PlanPreviewAreaMark,
  Project,
} from "../types";
import type { PreviewToolbarSelectOption } from "./PreviewToolbarSelect";
import {
  LiveAppPreview,
  type LiveAppPreviewMarkMeta,
} from "./LiveAppPreview";

export function CodeProposalPreview(props: {
  appPreviewContexts: ComposerAppPreviewContext[];
  canShowLive: boolean;
  project: Project | null;
  previewSet: CodeProposalSet | null;
  onBuild: (previewSet: CodeProposalSet, option: CodeProposalOption) => void;
  onBuildBaselineRequest: (project: Project) => void;
  onMarkArea: (
    project: Project,
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onSelect: (proposalSetId: string, optionId: "A" | "B" | "C") => void;
}) {
  const previewSet = props.previewSet;
  const project = props.project;
  const canShowLive = props.canShowLive && Boolean(project);
  const [activeTab, setActiveTab] = useState<"live" | "A" | "B" | "C">("A");
  const selected =
    previewSet?.options.find(
      (option) => option.id === previewSet.selectedOptionId,
    ) ??
    previewSet?.options[0] ??
    null;
  useEffect(() => {
    if (previewSet?.selectedOptionId) {
      setActiveTab(previewSet.selectedOptionId);
    }
  }, [previewSet?.proposalSetId, previewSet?.selectedOptionId]);
  useEffect(() => {
    if (!canShowLive && activeTab === "live" && selected) {
      setActiveTab(selected.id);
    }
  }, [activeTab, canShowLive, selected]);
  const liveSelected = canShowLive && activeTab === "live";
  const activeOption =
    liveSelected
      ? null
      : previewSet?.options.find((option) => option.id === activeTab) ??
        selected;
  const selectedProject = useMemo(() => {
    if (!project || !previewSet || !activeOption) return project;
    return {
      ...project,
      id: `${project.id}:code-proposal:${previewSet.proposalSetId}:${activeOption.id}`,
      path: activeOption.workspacePath,
      name: `${project.name} proposal ${activeOption.id}`,
    };
  }, [activeOption, project, previewSet]);

  if (!project || !previewSet || !selected || !selectedProject) {
    return (
      <div className="live-preview-empty">
        <GitBranch size={18} />
        <strong>No proposal selected</strong>
        <span>Choose a runnable proposal from the chat strip.</span>
      </div>
    );
  }

  const tabOptions: PreviewToolbarSelectOption[] = [
    ...(canShowLive
      ? [
          {
            id: "live",
            label: "Live",
            title: "Current live app",
            active: liveSelected,
            onSelect: () => setActiveTab("live"),
          },
        ]
      : []),
    ...previewSet.options.map((option) => ({
      id: option.id,
      label: option.id,
      title: option.summary || option.title,
      active: activeTab === option.id,
      onSelect: () => {
        setActiveTab(option.id);
        props.onSelect(previewSet.proposalSetId, option.id);
      },
    })),
  ];
  const changedCount = activeOption?.changedFiles.length ?? 0;
  const canApply =
    Boolean(activeOption) &&
    previewSet.status !== "applied" &&
    activeOption?.status === "ready";

  return (
    <LiveAppPreview
      appPreviewContexts={props.appPreviewContexts}
      compareTabOptions={tabOptions}
      onAreaMarkChange={(areaMark, meta) =>
        project && props.onMarkArea(project, areaMark, meta)
      }
      onBuildBaselineRequest={props.onBuildBaselineRequest}
      project={selectedProject}
      proposalControls={
        activeOption
          ? {
              autoStart: true,
              buildDisabled: !canApply,
              buildLabel:
                activeOption.status === "applying"
                  ? "Building"
                  : activeOption.status === "applied"
                    ? "Built"
                    : "Build selected",
              onBuild: () => props.onBuild(previewSet, activeOption),
            }
          : undefined
      }
      statusLabel=""
      titleLabel={canShowLive ? "Compare" : "Wireframes preview"}
    />
  );
}
