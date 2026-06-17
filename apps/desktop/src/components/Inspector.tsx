import { Check, FileText, Layers3, Loader2, Undo2, X } from "lucide-react";
import type { PointerEvent } from "react";
import { threadTitle } from "../itemUtils";
import { previewArtifactDisplayName } from "../mockupArtifacts";
import type {
  ComposerAppPreviewContext,
  ComposerMockupPreviewContext,
  InspectorSelection,
  MockupPreviewSet,
  PendingApproval,
  PlanProposal,
  PlanPreviewAreaMark,
  PlanPreviewSessionState,
  Project,
  SavedMockup,
  Thread,
  ThreadItem,
  Turn,
} from "../types";
import {
  LiveAppPreview,
  type LiveAppPreviewMarkMeta,
} from "./LiveAppPreview";
import { MockupPreview } from "./MockupPreview";
import { RichText } from "./RichText";

export function Inspector(props: {
  approvals: PendingApproval[];
  activeTurn: Turn | null;
  activeProject: Project | null;
  activeThread: Thread | null;
  previewProject: Project | null;
  planPreviewProposal: PlanProposal | null;
  appPreviewContext: ComposerAppPreviewContext | null;
  mockupPreviewSet: MockupPreviewSet | null;
  mockupCanShowLive: boolean;
  mockupPreviewLiveResetToken: number;
  mockupPreviewMarks: ComposerMockupPreviewContext[];
  mockupPreviewMode: "active" | "history";
  documentError: string | null;
  documentText: string | null;
  fileChanges: Extract<ThreadItem, { type: "fileChange" }>[];
  onAnswerApproval: (approval: PendingApproval, accepted: boolean) => void;
  onOpenDocument: (path: string) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onReviewChanges: () => void;
  onRollback: () => void;
  onSelect: (selection: InspectorSelection) => void;
  onUpdatePlanPreviewAreaMark: (
    proposalTurnId: string,
    areaMark: PlanPreviewAreaMark | null,
  ) => void;
  onUpdatePlanPreviewSession: (
    proposalTurnId: string,
    session: PlanPreviewSessionState | null,
  ) => void;
  onAttachAppPreviewMark: (
    project: Project,
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onAttachMockupPreviewMark: (
    previewSet: MockupPreviewSet,
    mockup: SavedMockup,
    areaMark: PlanPreviewAreaMark,
    meta?: {
      label?: string;
      source?: ComposerMockupPreviewContext["source"];
      viewport?: ComposerMockupPreviewContext["viewport"];
      highlightId?: string;
    },
  ) => void;
  onBuildBaselineApp: (project: Project) => void;
  onBuildMockup: (previewSet: MockupPreviewSet, mockup: SavedMockup) => void;
  onResetMockupProposalHighlights: (
    previewSet: MockupPreviewSet,
    mockup: SavedMockup,
    viewport: ComposerMockupPreviewContext["viewport"],
  ) => void;
  onSelectMockup: (proposalSetId: string, mockupId: string) => void;
  onUpdatePlanPreviewVariant: (proposalTurnId: string, variantId: string) => void;
  selection: InspectorSelection;
}) {
  const previewSelected =
    props.selection.type === "appPreview" ||
    props.selection.type === "planPreview" ||
    props.selection.type === "mockupPreview";
  const mockupPreviewProjectId =
    props.selection.type === "mockupPreview" ? props.selection.projectId : null;
  const mockupPreviewProposalSetId =
    props.selection.type === "mockupPreview"
      ? props.selection.proposalSetId
      : null;

  return (
    <aside className="inspector">
      <button
        type="button"
        className="inspector-resize-handle"
        aria-label="Resize inspector"
        onPointerDown={props.onResizePointerDown}
      />
      {!previewSelected && (
        <header className="inspector-header">
          <h2>{inspectorTitle(props.selection)}</h2>
        </header>
      )}
      {props.selection.type === "empty" && (
        <ActivityPanel
          activeProject={props.activeProject}
          activeThread={props.activeThread}
          activeTurn={props.activeTurn}
          approvals={props.approvals}
          fileChanges={props.fileChanges}
          mockupHistoryMode={props.mockupPreviewMode === "history"}
          mockupPreviewSet={props.mockupPreviewSet}
          onSelect={props.onSelect}
          onSelectMockup={props.onSelectMockup}
        />
      )}
      {props.selection.type === "planPreview" &&
        props.previewProject &&
        props.planPreviewProposal && (
          <LiveAppPreview
            project={props.previewProject}
            proposal={props.planPreviewProposal}
            onBuildBaselineRequest={props.onBuildBaselineApp}
            onAreaMarkChange={(areaMark) =>
              props.onUpdatePlanPreviewAreaMark(
                props.planPreviewProposal?.turnId ?? "",
                areaMark,
              )
            }
            onSessionChange={(session) =>
              props.onUpdatePlanPreviewSession(
                props.planPreviewProposal?.turnId ?? "",
                session,
              )
            }
            onVariantChange={(variantId) =>
              props.onUpdatePlanPreviewVariant(
                props.planPreviewProposal?.turnId ?? "",
                variantId,
              )
            }
          />
        )}
      {props.selection.type === "appPreview" && props.previewProject && (
        <LiveAppPreview
          project={props.previewProject}
          areaMark={props.appPreviewContext?.areaMark ?? null}
          onBuildBaselineRequest={props.onBuildBaselineApp}
          onAreaMarkChange={(areaMark, meta) =>
            props.previewProject &&
            props.onAttachAppPreviewMark(props.previewProject, areaMark, meta)
          }
        />
      )}
      {mockupPreviewProjectId && (
        <MockupPreview
          mode={props.mockupPreviewMode}
          appPreviewAreaMark={props.appPreviewContext?.areaMark ?? null}
          canShowLive={props.mockupCanShowLive}
          forceLiveToken={props.mockupPreviewLiveResetToken}
          markContexts={props.mockupPreviewMarks}
          project={props.previewProject}
          previewSet={props.mockupPreviewSet}
          onBuild={props.onBuildMockup}
          onLiveMarkArea={(project, areaMark, meta) =>
            props.onAttachAppPreviewMark(project, areaMark, meta)
          }
          onMarkArea={props.onAttachMockupPreviewMark}
          onResetHighlightContexts={props.onResetMockupProposalHighlights}
          onSelect={(mockupId) =>
            mockupPreviewProposalSetId &&
            props.onSelectMockup(mockupPreviewProposalSetId, mockupId)
          }
        />
      )}
      {props.selection.type === "document" && (
        <div className="document-surface">
          {props.documentError && (
            <p className="error-line">{props.documentError}</p>
          )}
          {props.documentText === null && !props.documentError ? (
            <Loader2 className="spin" />
          ) : props.documentText ? (
            <RichText className="document-rich-text" text={props.documentText} />
          ) : (
            <p className="muted compact">No content.</p>
          )}
        </div>
      )}
      {props.selection.type === "command" && (
        <div className="inspector-empty activity-panel">
          <section className="activity-card">
            <p className="eyebrow">Command</p>
            <h3>Shown in thought process</h3>
            <p>
              Commands stay inline with the turn so busy chats do not open a
              second detail surface.
            </p>
          </section>
        </div>
      )}
      {props.selection.type === "fileChange" && (
        <FileChangeDetail
          activeProject={props.activeProject}
          item={props.selection.item}
          onOpenDocument={props.onOpenDocument}
          onReviewChanges={props.onReviewChanges}
          onRollback={props.onRollback}
        />
      )}
      {props.selection.type === "approval" && (
        <ApprovalDetail
          approval={props.selection.approval}
          onAnswerApproval={props.onAnswerApproval}
        />
      )}
    </aside>
  );
}

function FileChangeDetail(props: {
  activeProject: Project | null;
  item: Extract<ThreadItem, { type: "fileChange" }>;
  onOpenDocument: (path: string) => void;
  onReviewChanges: () => void;
  onRollback: () => void;
}) {
  return (
    <div className="diff-detail file-detail-compact">
      <div className="review-actions">
        <button className="ghost-button" onClick={props.onRollback}>
          <Undo2 size={16} /> Roll back chat
        </button>
        <button className="ghost-button" onClick={props.onReviewChanges}>
          <Check size={16} /> Review
        </button>
      </div>
      <p className="muted compact">
        File changes are summarized in chat. Open Markdown files here without
        loading large diffs into the inspector.
      </p>
      <div className="inspector-file-list">
        {props.item.changes.map((change) => {
          const markdown = isMarkdownPath(change.path);
          const label = friendlyPath(change.path, props.activeProject);
          if (!markdown) {
            return (
              <div className="activity-row inert" key={change.path}>
                <FileText size={15} />
                <span>{label}</span>
              </div>
            );
          }
          return (
            <button
              className="activity-row"
              key={change.path}
              onClick={() =>
                props.onOpenDocument(documentPath(change.path, props.activeProject))
              }
            >
              <FileText size={15} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActivityPanel(props: {
  activeProject: Project | null;
  activeThread: Thread | null;
  activeTurn: Turn | null;
  approvals: PendingApproval[];
  fileChanges: Extract<ThreadItem, { type: "fileChange" }>[];
  mockupHistoryMode: boolean;
  mockupPreviewSet: MockupPreviewSet | null;
  onSelect: (selection: InspectorSelection) => void;
  onSelectMockup: (proposalSetId: string, mockupId: string) => void;
}) {
  const recentChanges = props.fileChanges.slice(-3).reverse();
  const mockupProjectId = props.mockupPreviewSet?.projectId ?? null;
  const mockupProposalSetId = props.mockupPreviewSet?.proposalSetId ?? null;
  const savedMockups = props.mockupPreviewSet?.mockups ?? [];
  return (
    <div className="inspector-empty activity-panel">
      <section className="activity-card">
        <p className="eyebrow">Current chat</p>
        <h3>
          {props.activeThread
            ? threadTitle(props.activeThread)
            : "No chat selected"}
        </h3>
        <p>
          {props.activeProject
            ? props.activeProject.name
            : "Add a local project to start."}
        </p>
        <span className={`activity-status ${props.activeTurn?.status ?? "idle"}`}>
          {props.activeTurn?.status ?? "idle"}
        </span>
      </section>

      {mockupProjectId && savedMockups.length > 0 && (
        <section className="activity-section">
          <p className="sidebar-label">
            {previewArtifactDisplayName(
              props.mockupPreviewSet?.artifactKind ?? "mockup",
              2,
              "title",
            )}
          </p>
          {props.mockupHistoryMode ? (
            savedMockups.map((mockup, index) => (
              <button
                className="activity-row activity-row-rich"
                key={mockup.id}
                onClick={() => {
                  if (!mockupProposalSetId) return;
                  props.onSelectMockup(mockupProposalSetId, mockup.id);
                  props.onSelect({
                    type: "mockupPreview",
                    projectId: mockupProjectId,
                    proposalSetId: mockupProposalSetId,
                  });
                }}
                type="button"
              >
                <Layers3 size={15} />
                <span className="activity-row-copy">
                  <strong>
                    {mockup.label || String.fromCharCode(65 + index)}:{" "}
                    {mockup.title}
                  </strong>
                  <small>{mockup.summary || mockup.filePath}</small>
                </span>
              </button>
            ))
          ) : (
            <button
              className="activity-row"
              onClick={() =>
                props.onSelect({
                  type: "mockupPreview",
                  projectId: mockupProjectId,
                  proposalSetId: mockupProposalSetId ?? "",
                })
              }
              type="button"
            >
              <Layers3 size={15} />
              <span>
                Open saved{" "}
                {previewArtifactDisplayName(
                  props.mockupPreviewSet?.artifactKind ?? "mockup",
                  2,
                  "lower",
                )}
              </span>
            </button>
          )}
        </section>
      )}

      {props.approvals.length > 0 && (
        <section className="activity-section">
          <p className="sidebar-label">Approvals</p>
          {props.approvals.map((approval) => (
            <button
              key={approval.id}
              className="activity-row"
              onClick={() => props.onSelect({ type: "approval", approval })}
            >
              <Check size={15} />
              <span>Approval waiting</span>
            </button>
          ))}
        </section>
      )}

      <section className="activity-section">
        <p className="sidebar-label">Files</p>
        {recentChanges.length === 0 && (
          <p className="muted compact">No file changes yet.</p>
        )}
        {recentChanges.map((item) => (
          <button
            key={item.id}
            className="activity-row activity-row-rich"
            onClick={() => props.onSelect({ type: "fileChange", item })}
          >
            <FileText size={15} />
            <span className="activity-row-copy">
              <strong>
                {item.changes.length} changed file
                {item.changes.length === 1 ? "" : "s"}
              </strong>
              <small>{fileChangePreview(item, props.activeProject)}</small>
            </span>
          </button>
        ))}
      </section>

    </div>
  );
}

function fileChangePreview(
  item: Extract<ThreadItem, { type: "fileChange" }>,
  activeProject: Project | null,
) {
  const labels = item.changes
    .slice(0, 4)
    .map((change) => friendlyPath(change.path, activeProject));
  const hidden = item.changes.length - labels.length;
  return hidden > 0 ? `${labels.join(", ")} +${hidden} more` : labels.join(", ");
}

function ApprovalDetail(props: {
  approval: PendingApproval;
  onAnswerApproval: (approval: PendingApproval, accepted: boolean) => void;
}) {
  return (
    <div className="approval-detail">
      <p className="eyebrow">{props.approval.method}</p>
      <pre>{JSON.stringify(props.approval.params, null, 2)}</pre>
      <div className="approval-actions">
        <button onClick={() => props.onAnswerApproval(props.approval, false)}>
          <X size={16} /> Decline
        </button>
        <button
          className="primary-action"
          onClick={() => props.onAnswerApproval(props.approval, true)}
        >
          <Check size={16} /> Approve
        </button>
      </div>
    </div>
  );
}

function inspectorTitle(selection: InspectorSelection) {
  switch (selection.type) {
    case "document":
      return selection.title ?? "Document";
    case "appPreview":
      return "App Preview";
    case "mockupPreview":
      return "Mockup Preview";
    case "planPreview":
      return "App Preview";
    case "command":
      return "Command";
    case "fileChange":
      return "File Review";
    case "approval":
      return "Approval";
    default:
      return "Activity";
  }
}

function isMarkdownPath(path: string) {
  return /\.(md|mdx|markdown)$/i.test(path);
}

function documentPath(path: string, activeProject: Project | null) {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || !activeProject) {
    return path;
  }
  return `${activeProject.path.replace(/[\\/]$/, "")}/${path}`;
}

function friendlyPath(path: string, activeProject: Project | null) {
  if (!activeProject) return path;
  const projectPath = activeProject.path.replace(/\\/g, "/").replace(/\/$/, "");
  return path
    .replace(new RegExp(escapeRegExp(projectPath), "g"), ".")
    .replace(/^\.\//, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
