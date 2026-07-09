import { Check, FileText, Loader2, Undo2, X } from "lucide-react";
import type { PointerEvent } from "react";
import { threadTitle } from "../itemUtils";
import {
  projectRelativeDisplayPath,
  proposalWorkspaceDisplayPath,
} from "../proposalWorkspaceDisplay";
import type {
  ComposerAppPreviewContext,
  FeatureDraft,
  InspectorSelection,
  PendingApproval,
  PlanPreviewAreaMark,
  Project,
  Thread,
  ThreadItem,
  Turn,
} from "../types";
import { DraftPreview } from "./DraftPreview";
import {
  LiveAppPreview,
  type LiveAppPreviewMarkMeta,
} from "./LiveAppPreview";
import { RichText } from "./RichText";

export function Inspector(props: {
  approvals: PendingApproval[];
  activeTurn: Turn | null;
  activeProject: Project | null;
  activeThread: Thread | null;
  previewProject: Project | null;
  appPreviewContexts: ComposerAppPreviewContext[];
  featureDraft: FeatureDraft | null;
  featureDraftCanShowLive: boolean;
  featureDraftRefreshNonce: number;
  livePreviewAutoStartNonce: number;
  documentError: string | null;
  documentText: string | null;
  fileChanges: Extract<ThreadItem, { type: "fileChange" }>[];
  onAnswerApproval: (approval: PendingApproval, accepted: boolean) => void;
  onOpenDocument: (path: string) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onReviewChanges: () => void;
  onRollback: () => void;
  onSelect: (selection: InspectorSelection) => void;
  onAttachAppPreviewMark: (
    project: Project,
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onBuildBaselineApp: (project: Project) => void;
  onBuildFeatureDraft: (draft: FeatureDraft) => void;
  onContinueFeatureDraft: (draft: FeatureDraft) => void;
  onDiscardFeatureDraft: (draft: FeatureDraft) => void;
  onParkFeatureDraft: (draft: FeatureDraft) => void;
  onRefreshFeatureDraft: (draft: FeatureDraft) => void;
  onResumeFeatureDraft: (draft: FeatureDraft) => void;
  selection: InspectorSelection;
}) {
  const previewSelected =
    props.selection.type === "appPreview" ||
    props.selection.type === "draftPreview";

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
          onSelect={props.onSelect}
        />
      )}
      {props.selection.type === "appPreview" &&
        props.previewProject &&
        (props.featureDraft ? (
          <DraftPreview
            appPreviewContexts={props.appPreviewContexts}
            canShowLive={props.featureDraftCanShowLive}
            draft={props.featureDraft}
            refreshNonce={props.featureDraftRefreshNonce}
            onBuild={props.onBuildFeatureDraft}
            onBuildBaselineRequest={props.onBuildBaselineApp}
            onContinue={props.onContinueFeatureDraft}
            onDiscard={props.onDiscardFeatureDraft}
            onPark={props.onParkFeatureDraft}
            onRefresh={props.onRefreshFeatureDraft}
            onResume={props.onResumeFeatureDraft}
            onMarkArea={(project, areaMark, meta) =>
              props.onAttachAppPreviewMark(project, areaMark, meta)
            }
            project={props.previewProject}
          />
        ) : (
          <LiveAppPreview
            project={props.previewProject}
            appPreviewContexts={props.appPreviewContexts}
            autoStartNonce={props.livePreviewAutoStartNonce}
            onBuildBaselineRequest={props.onBuildBaselineApp}
            onAreaMarkChange={(areaMark, meta) =>
              props.previewProject &&
              props.onAttachAppPreviewMark(props.previewProject, areaMark, {
                ...meta,
                surface: "live",
              })
            }
          />
        ))}
      {props.selection.type === "draftPreview" && (
        <DraftPreview
          appPreviewContexts={props.appPreviewContexts}
          canShowLive={props.featureDraftCanShowLive}
          draft={props.featureDraft}
          refreshNonce={props.featureDraftRefreshNonce}
          onBuild={props.onBuildFeatureDraft}
          onBuildBaselineRequest={props.onBuildBaselineApp}
          onContinue={props.onContinueFeatureDraft}
          onDiscard={props.onDiscardFeatureDraft}
          onPark={props.onParkFeatureDraft}
          onRefresh={props.onRefreshFeatureDraft}
          onResume={props.onResumeFeatureDraft}
          onMarkArea={(project, areaMark, meta) =>
            props.onAttachAppPreviewMark(project, areaMark, meta)
          }
          project={props.previewProject}
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
  onSelect: (selection: InspectorSelection) => void;
}) {
  const recentChanges = props.fileChanges.slice(-3).reverse();
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
    case "draftPreview":
      return "Draft";
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
  const proposalPath = proposalWorkspaceDisplayPath(path);
  if (proposalPath) return proposalPath;
  if (!activeProject) return path;
  const relativePath = projectRelativeDisplayPath(path, activeProject.path);
  if (relativePath) return relativePath;
  const projectPath = activeProject.path.replace(/\\/g, "/").replace(/\/$/, "");
  return path
    .replace(new RegExp(escapeRegExp(projectPath), "g"), ".")
    .replace(/^\.\//, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
