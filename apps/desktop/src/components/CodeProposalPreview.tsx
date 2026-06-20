import { GitBranch } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CodeProposalOption,
  CodeProposalSet,
  ComposerAppPreviewContext,
  PlanPreviewAreaMark,
  PlanProposal,
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
  onLaneTransfer?: (
    previewSet: CodeProposalSet,
    from: "live" | "A" | "B" | "C",
    to: "live" | "A" | "B" | "C",
  ) => void;
  onSelect: (proposalSetId: string, optionId: "A" | "B" | "C") => void;
}) {
  const previewSet = props.previewSet;
  const project = props.project;
  const canShowLive = props.canShowLive && Boolean(project);
  const showLiveLane = Boolean(project);
  const [activeTab, setActiveTab] = useState<"live" | "A" | "B" | "C">(() =>
    initialCodeProposalTab(previewSet, canShowLive),
  );
  const selected =
    previewSet?.options.find(
      (option) => option.id === previewSet.selectedOptionId,
    ) ??
    previewSet?.options[0] ??
    null;
  useEffect(() => {
    if (!previewSet) return;
    if (codeProposalDefaultsToLive(previewSet, canShowLive)) {
      setActiveTab("live");
      return;
    }
    if (previewSet.selectedOptionId) {
      setActiveTab(previewSet.selectedOptionId);
    }
  }, [canShowLive, previewSet?.proposalSetId, previewSet?.status]);
  useEffect(() => {
    if (!previewSet?.selectedOptionId) return;
    if (codeProposalDefaultsToLive(previewSet, canShowLive)) return;
    setActiveTab(previewSet.selectedOptionId);
  }, [
    canShowLive,
    previewSet?.proposalSetId,
    previewSet?.selectedOptionId,
    previewSet?.status,
  ]);
  useEffect(() => {
    if (!showLiveLane && activeTab === "live" && selected) {
      setActiveTab(selected.id);
    }
  }, [activeTab, selected, showLiveLane]);
  const liveSelected = showLiveLane && activeTab === "live";
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
    ...(showLiveLane
      ? [
          {
            id: "live",
            label: "Live",
            title: canShowLive
              ? "Current live app"
              : "Build or run Live from a selected proposal",
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
  const canApply =
    Boolean(activeOption) &&
    previewSet.status !== "applied" &&
    activeOption?.status === "ready";
  const previewKey = liveSelected
    ? `live:${project.id}`
    : codeProposalPreviewKey(previewSet, activeOption);
  const proposal = activeOption
    ? codeProposalPreviewProposal(project, previewSet, activeOption)
    : null;

  return (
    <LiveAppPreview
      appPreviewContexts={props.appPreviewContexts}
      compareTabOptions={tabOptions}
      key={previewKey}
      onAreaMarkChange={(areaMark, meta) =>
        project && props.onMarkArea(project, areaMark, meta)
      }
      onBuildBaselineRequest={props.onBuildBaselineRequest}
      onLaneTransfer={(from, to) => {
        if (!isCodeProposalLane(from) || !isCodeProposalLane(to)) return;
        props.onLaneTransfer?.(previewSet, from, to);
      }}
      project={selectedProject}
      proposal={proposal}
      proposalControls={
        activeOption
          ? {
              autoStart: true,
              buildDisabled: !canApply,
              buildLabel:
                activeOption.status === "applying"
                  ? "Building"
                  : "Build selected",
              onBuild: () => props.onBuild(previewSet, activeOption),
            }
          : undefined
      }
      statusLabel=""
    />
  );
}

function isCodeProposalLane(value: string): value is "live" | "A" | "B" | "C" {
  return value === "live" || value === "A" || value === "B" || value === "C";
}

export function codeProposalPreviewKey(
  previewSet: CodeProposalSet,
  option: CodeProposalOption | null,
) {
  if (!option) return `${previewSet.proposalSetId}:none:${previewSet.updatedAt}`;
  const changeSignature = option.changedFiles
    .map((change) => `${change.kind}:${change.path}:${change.hash}:${change.size}`)
    .join("|");
  return [
    previewSet.proposalSetId,
    option.id,
    option.status,
    previewSet.updatedAt,
    changeSignature,
  ].join(":");
}

export function initialCodeProposalTab(
  previewSet: CodeProposalSet | null,
  canShowLive: boolean,
): "live" | "A" | "B" | "C" {
  if (!previewSet) return "A";
  if (codeProposalDefaultsToLive(previewSet, canShowLive)) return "live";
  return previewSet.selectedOptionId ?? previewSet.options[0]?.id ?? "A";
}

export function codeProposalDefaultsToLive(
  previewSet: CodeProposalSet,
  canShowLive: boolean,
) {
  return canShowLive && previewSet.status === "applied";
}

export function codeProposalPreviewProposal(
  project: Project,
  previewSet: CodeProposalSet,
  option: CodeProposalOption,
): PlanProposal | null {
  if (option.changedFiles.length === 0) return null;
  const now = previewSet.updatedAt || Date.now();
  const note =
    option.changedFiles.length === 1
      ? "One proposal change is ready for visual review."
      : `${option.changedFiles.length} proposal changes are ready for visual review.`;
  const highlightLabel = codeProposalHighlightLabel(previewSet.originalPrompt, option);
  return {
    id: `code-proposal:${previewSet.proposalSetId}:${option.id}`,
    projectId: project.id,
    threadId: previewSet.threadId ?? "",
    turnId: previewSet.turnId ?? previewSet.proposalSetId,
    prompt: previewSet.originalPrompt,
    contexts: [],
    previewSpec: {
      version: 1,
      summary: note,
      createdAt: previewSet.createdAt || now,
      updatedAt: now,
      variants: [
        {
          id: option.id,
          title: option.title,
          tradeoff: "Review the changed proposal surface before building it.",
          placement: "topbar",
          summary: option.summary || note,
          targetRegion: "Changed proposal surface",
          highlights: [
            {
              id: `code-change-${option.id}`,
              label: highlightLabel,
              note,
              areaMark: {
                x: 28,
                y: 28,
                width: 430,
                height: 260,
                viewportWidth: 1440,
                viewportHeight: 900,
                note,
                createdAt: now,
              },
            },
          ],
          components: [],
        },
      ],
    },
    previewSelectedVariantId: option.id,
    previewAreaMark: null,
    previewSession: null,
    proposalKind: "live_proposal",
    status: "pending",
    createdAt: previewSet.createdAt || now,
    updatedAt: now,
  };
}

function codeProposalHighlightLabel(
  prompt: string,
  option: CodeProposalOption,
) {
  const text = `${prompt} ${option.title} ${option.summary}`.toLowerCase();
  const buttonMatch = text.match(/\b([a-z][a-z0-9'-]{2,})\s+button\b/i);
  if (buttonMatch?.[1]) return titleCase(`${buttonMatch[1]} button`);
  const subjectMatch = text.match(
    /\b(settings|profile|account|preferences|notifications?|reminders?|filters?|search|categories|category|theme|billing|help)\b/i,
  );
  if (subjectMatch?.[1]) return titleCase(subjectMatch[1]);
  return "Proposed change";
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
