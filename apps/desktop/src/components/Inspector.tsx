import { Check, Database, FileText, Loader2, Square, Undo2, X } from "lucide-react";
import type { PointerEvent } from "react";
import { threadTitle } from "../itemUtils";
import type {
  InspectorSelection,
  PendingApproval,
  CanvasSuggestion,
  PlanProposal,
  Project,
  ProjectCanvas,
  Thread,
  ThreadItem,
  Turn,
} from "../types";
import { CanvasInspector } from "./CanvasInspector";
import { RichText } from "./RichText";

export function Inspector(props: {
  approvals: PendingApproval[];
  activeTurn: Turn | null;
  activeProject: Project | null;
  activeThread: Thread | null;
  canvas: ProjectCanvas | null;
  canvasProject: Project | null;
  canvasProposal: PlanProposal | null;
  canvasSuggestion: CanvasSuggestion | null;
  canvasReadOnly: boolean;
  canvasSaveStatus: "saving" | "saved";
  documentError: string | null;
  documentText: string | null;
  fileChanges: Extract<ThreadItem, { type: "fileChange" }>[];
  onAnswerApproval: (approval: PendingApproval, accepted: boolean) => void;
  onOpenDocument: (path: string) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onRequestGenerateMockup: (project: Project) => void;
  onReviewChanges: () => void;
  onRollback: () => void;
  onSelect: (selection: InspectorSelection) => void;
  onUpdateCanvas: (projectId: string, canvas: ProjectCanvas) => void;
  onUpdateCanvasProposal: (proposalTurnId: string, canvas: ProjectCanvas) => void;
  onUpdateCanvasSuggestion: (
    suggestionTurnId: string,
    canvas: ProjectCanvas,
  ) => void;
  selection: InspectorSelection;
}) {
  const canvasSelected =
    props.selection.type === "canvas" ||
    props.selection.type === "canvasProposal" ||
    props.selection.type === "canvasSuggestion";
  const proposalSelected =
    props.selection.type === "canvasProposal" ||
    props.selection.type === "canvasSuggestion";
  const canvasProposalSummary = proposalSelected
    ? (props.selection.type === "canvasProposal"
        ? props.canvasProposal?.canvasProposalSummary
        : props.canvasSuggestion?.canvasProposalSummary)
    : null;
  function updateVisibleCanvas(canvas: ProjectCanvas) {
    if (props.selection.type === "canvasProposal") {
      props.onUpdateCanvasProposal(props.selection.proposalTurnId, canvas);
      return;
    }
    if (props.selection.type === "canvasSuggestion") {
      props.onUpdateCanvasSuggestion(props.selection.suggestionTurnId, canvas);
      return;
    }
    props.onUpdateCanvas(canvas.projectId, canvas);
  }

  return (
    <aside className="inspector">
      <button
        type="button"
        className="inspector-resize-handle"
        aria-label="Resize inspector"
        onPointerDown={props.onResizePointerDown}
      />
      <header
        className={`inspector-header ${
          canvasSelected ? "canvas-inspector-header" : ""
        }`}
      >
        <h2>{inspectorTitle(props.selection)}</h2>
        {canvasSelected && (
          <span className={`canvas-save-status ${props.canvasSaveStatus}`}>
            {props.canvasSaveStatus === "saving" ? "Saving" : "Saved"}
          </span>
        )}
        {canvasSelected && props.canvas ? (
          <CanvasModeSwitch
            canvas={props.canvas}
            onChange={updateVisibleCanvas}
          />
        ) : null}
      </header>
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
      {canvasSelected &&
        props.canvas &&
        props.canvasProject && (
          <CanvasInspector
            canvas={props.canvas}
            project={props.canvasProject}
            readOnly={props.canvasReadOnly}
            onChange={updateVisibleCanvas}
            onRequestGenerateMockup={props.onRequestGenerateMockup}
            focusReference={
              props.selection.type === "canvas" ||
              props.selection.type === "canvasProposal" ||
              props.selection.type === "canvasSuggestion"
                ? (props.selection.focusReference ?? null)
                : null
            }
            focusRequestId={
              props.selection.type === "canvas" ||
              props.selection.type === "canvasProposal" ||
              props.selection.type === "canvasSuggestion"
                ? props.selection.focusRequestId
                : undefined
            }
            proposalMode={proposalSelected}
            proposalLabel={
              props.selection.type === "canvasSuggestion"
                ? "Canvas suggestion"
                : "Plan proposal"
            }
            proposalSummary={canvasProposalSummary}
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

function CanvasModeSwitch(props: {
  canvas: ProjectCanvas;
  onChange: (canvas: ProjectCanvas) => void;
}) {
  function switchMode(mode: ProjectCanvas["mode"]) {
    if (props.canvas.mode === mode) return;
    props.onChange({ ...props.canvas, mode, updatedAt: Date.now() });
  }

  return (
    <div className="canvas-mode-switch" role="tablist" aria-label="Canvas mode">
      <button
        className={props.canvas.mode === "ui" ? "active" : ""}
        onClick={() => switchMode("ui")}
        type="button"
      >
        <Square size={15} /> UI
      </button>
      <button
        className={props.canvas.mode === "backend" ? "active" : ""}
        onClick={() => switchMode("backend")}
        type="button"
      >
        <Database size={15} /> Backend
      </button>
    </div>
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
            className="activity-row"
            onClick={() => props.onSelect({ type: "fileChange", item })}
          >
            <FileText size={15} />
            <span>
              {item.changes.length} changed file
              {item.changes.length === 1 ? "" : "s"}
            </span>
          </button>
        ))}
      </section>

    </div>
  );
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
    case "canvas":
      return "Canvas";
    case "canvasProposal":
      return "Canvas";
    case "canvasSuggestion":
      return "Canvas";
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
