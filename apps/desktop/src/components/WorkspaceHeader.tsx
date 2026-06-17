import {
  AppWindow,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { ConnectionBadge } from "./ConnectionBadge";
import { threadTitle } from "../itemUtils";
import type { ConnectionStatus, Project, Thread } from "../types";

export function WorkspaceHeader(props: {
  activeProject: Project | null;
  activeAppPreviewSelected: boolean;
  activeThread: Thread | null;
  hasActiveProject: boolean;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  backendLabel: string;
  inspectorOpen: boolean;
  onOpenAppPreview: () => void;
  onOpenSidebar: () => void;
  onToggleInspector: () => void;
}) {
  const InspectorIcon = props.inspectorOpen ? PanelRightClose : PanelRightOpen;
  return (
    <header className="topbar">
      <button
        className="icon-button sidebar-open-toggle"
        onClick={props.onOpenSidebar}
        title="Open sidebar"
        aria-label="Open sidebar"
        type="button"
      >
        <PanelLeftOpen size={18} />
      </button>
      <div
        className="topbar-title"
        title={props.activeProject?.path ?? "No local project selected"}
      >
        <p className="eyebrow">
          {props.activeProject ? props.activeProject.name : "No project"}
        </p>
        <h1>
          {props.activeThread
            ? threadTitle(props.activeThread)
            : props.hasActiveProject
              ? "New chat"
              : "Choose a project"}
        </h1>
      </div>
      <div className="topbar-actions">
        <ConnectionBadge
          status={props.connectionStatus}
          error={props.connectionError}
          backendLabel={props.backendLabel}
        />
        <button
          className={`icon-button app-preview-toggle ${
            props.activeAppPreviewSelected ? "active" : ""
          }`}
          onClick={props.onOpenAppPreview}
          disabled={!props.activeProject}
          aria-pressed={props.activeAppPreviewSelected}
          title={
            props.activeProject
              ? "Open live preview"
              : "Select a project before opening live preview"
          }
          type="button"
        >
          <AppWindow size={18} />
        </button>
        <button
          className={`icon-button inspector-toggle ${
            props.inspectorOpen ? "active" : ""
          }`}
          onClick={props.onToggleInspector}
          aria-pressed={props.inspectorOpen}
          title={props.inspectorOpen ? "Close inspector" : "Open inspector"}
        >
          <InspectorIcon size={18} />
        </button>
      </div>
    </header>
  );
}
