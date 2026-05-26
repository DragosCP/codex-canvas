import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Gauge,
  Loader2,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  UserCircle,
  X,
  Zap,
} from "lucide-react";
import { connectionVerb, type RuntimeInfo } from "../runtime";
import { threadTitle } from "../itemUtils";
import type {
  AppServerSnapshot,
  ConnectionStatus,
  LocalChatDraft,
  Project,
  Thread,
} from "../types";
import { formatRelative } from "../utils/format";

type ProjectThreadGroup = {
  project: Project;
  threads: Thread[];
  draft: LocalChatDraft | null;
};

type Confirmation =
  | { type: "archiveThread"; threadId: string }
  | { type: "archiveProject"; projectId: string }
  | { type: "removeProject"; projectId: string };

export function ProjectSidebar(props: {
  activeDraftProjectId: string | null;
  activeProject: Project | null;
  activeThreadId: string | null;
  actionError: string | null;
  connectionStatus: ConnectionStatus;
  connectionError: string | null;
  expandedProjectIds: string[];
  onAddProject: () => void;
  onArchiveProjectChats: (project: Project) => void;
  onArchiveThread: (threadId: string, project: Project) => void;
  onConnect: () => void;
  onLogout: () => Promise<void>;
  onPickProjectFolder: () => Promise<boolean>;
  onProjectPathChange: (value: string) => void;
  onRemoveProject: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onRenameThread: (threadId: string, name: string) => void;
  onSelectDraft: (project: Project) => void;
  onSelectProject: (project: Project) => void;
  onSelectThread: (threadId: string, project: Project) => void;
  onStartThread: (project?: Project | null) => void;
  onThreadSearchChange: (value: string) => void;
  onTogglePinnedThread: (threadId: string) => void;
  onToggleProjectExpanded: (projectId: string) => void;
  pinnedThreadIds: string[];
  projectPath: string;
  projectThreadGroups: ProjectThreadGroup[];
  runtime: RuntimeInfo;
  snapshot: AppServerSnapshot;
  threadSearch: string;
  updateProject: (
    projectId: string,
    updater: (project: Project) => Project,
  ) => void;
}) {
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [addingProject, setAddingProject] = useState(
    props.projectThreadGroups.length === 0,
  );
  const [openProjectMenuId, setOpenProjectMenuId] = useState<string | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraftName, setProjectDraftName] = useState("");
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [threadDraftName, setThreadDraftName] = useState("");
  const [confirming, setConfirming] = useState<Confirmation | null>(null);
  const settingsAreaRef = useRef<HTMLDivElement>(null);
  const connecting =
    props.connectionStatus === "starting" ||
    props.connectionStatus === "connecting";
  const pinnedThreads = new Set(props.pinnedThreadIds);
  const account = describeAccount(props.snapshot);
  const usageRows = usageSummaryRows(props.snapshot);
  const canLogout = Boolean(props.snapshot.account?.account);

  useEffect(() => {
    function closeSettings(event: MouseEvent) {
      if (
        settingsOpen &&
        !settingsAreaRef.current?.contains(event.target as Node)
      ) {
        setSettingsOpen(false);
      }
    }
    document.addEventListener("mousedown", closeSettings);
    return () => document.removeEventListener("mousedown", closeSettings);
  }, [settingsOpen]);

  function beginProjectRename(project: Project) {
    setOpenProjectMenuId(null);
    setEditingProjectId(project.id);
    setProjectDraftName(project.name);
  }

  function finishProjectRename(projectId: string) {
    const name = projectDraftName.trim();
    if (!name) return;
    props.onRenameProject(projectId, name);
    setEditingProjectId(null);
    setProjectDraftName("");
  }

  function beginThreadRename(thread: Thread) {
    setEditingThreadId(thread.id);
    setThreadDraftName(threadTitle(thread));
  }

  function finishThreadRename(threadId: string) {
    const name = threadDraftName.trim();
    if (!name) return;
    props.onRenameThread(threadId, name);
    setEditingThreadId(null);
    setThreadDraftName("");
  }

  function confirmArchiveThread(threadId: string, project: Project) {
    props.onArchiveThread(threadId, project);
    setConfirming(null);
  }

  function confirmArchiveProject(project: Project) {
    props.onArchiveProjectChats(project);
    setConfirming(null);
    setOpenProjectMenuId(null);
  }

  function confirmRemoveProject(projectId: string) {
    props.onRemoveProject(projectId);
    setConfirming(null);
    setOpenProjectMenuId(null);
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      await props.onLogout();
      setSettingsOpen(false);
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div>
          <strong>Codex</strong>
          <span title={props.runtime.backendLabel}>Local projects</span>
        </div>
        <button
          className="icon-button small"
          onClick={props.onConnect}
          disabled={connecting}
          title={props.connectionError ?? props.runtime.backendLabel}
        >
          {connecting ? (
            <Loader2 className="spin" size={15} />
          ) : (
            <Zap size={15} />
          )}
        </button>
      </header>

      <button
        className="sidebar-primary"
        onClick={() => props.onStartThread()}
        disabled={false}
        title={
          props.activeProject
            ? "Start a new draft in this project"
            : "Select or add a project first"
        }
      >
        <Plus size={16} /> New Chat
      </button>

      <div className="sidebar-search">
        <Search size={14} />
        <input
          value={props.threadSearch}
          onChange={(event) => props.onThreadSearchChange(event.target.value)}
          placeholder="Filter visible projects and chats"
          title="Filters the projects and chats already visible in this sidebar"
        />
      </div>

      <div className={`connection-pill ${props.connectionStatus}`}>
        <span />
        {connectionVerb(props.connectionStatus)}
      </div>

      {props.actionError && <p className="sidebar-error">{props.actionError}</p>}

      {!props.activeProject && (
        <p className="sidebar-guidance">Select or add a project to start a chat.</p>
      )}

      <section className="sidebar-section projects-section">
        <div className="section-title-row projects-title">
          <p className="sidebar-label">Projects</p>
          <div className="menu-anchor">
            <button
              className="icon-button mini project-add-button"
              onClick={() => setAddMenuOpen((value) => !value)}
              title="Add project"
            >
              <FolderPlus size={13} />
            </button>
            {addMenuOpen && (
              <div className="sidebar-menu add-project-menu">
                <button
                  disabled
                  title="Deferred: current desktop projects need a local folder."
                >
                  <FilePlus2 size={14} />
                  <span>Start from scratch</span>
                </button>
                <button
                  onClick={async () => {
                    const picked = await props.onPickProjectFolder();
                    setAddingProject(!picked);
                    setAddMenuOpen(false);
                  }}
                >
                  <FolderOpen size={14} />
                  <span>Use existing folder</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {addingProject && (
          <label className="path-adder">
            <span>Local folder</span>
            <div>
              <input
                value={props.projectPath}
                onChange={(event) =>
                  props.onProjectPathChange(event.target.value)
                }
                placeholder={props.runtime.projectPathHint}
              />
              <button
                className="icon-button small"
                onClick={() => {
                  props.onAddProject();
                  if (props.projectPath.trim()) setAddingProject(false);
                }}
                title="Add folder path"
              >
                <Plus size={15} />
              </button>
            </div>
          </label>
        )}

        <div className="project-list">
          {props.projectThreadGroups.length === 0 && (
            <div className="empty-sidebar-state">
              <MessageSquare size={16} />
              <span>
                {props.threadSearch.trim() ? "No visible matches" : "No projects yet"}
              </span>
              <small>
                {props.threadSearch.trim()
                  ? "Search filters only loaded sidebar rows."
                  : "Use the folder button above to add one."}
              </small>
            </div>
          )}
          {props.projectThreadGroups.map(({ project, threads, draft }) => {
            const expanded = props.expandedProjectIds.includes(project.id);
            const visibleThreads = threads.slice(0, expanded ? 10 : 5);
            const hasRows = Boolean(draft) || visibleThreads.length > 0;
            const hiddenThreadCount = Math.max(0, threads.length - visibleThreads.length);
            return (
              <div key={project.id} className="project-block">
                {editingProjectId === project.id ? (
                  <form
                    className="project-rename"
                    onSubmit={(event) => {
                      event.preventDefault();
                      finishProjectRename(project.id);
                    }}
                  >
                    <input
                      autoFocus
                      value={projectDraftName}
                      onChange={(event) => setProjectDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setEditingProjectId(null);
                          setProjectDraftName("");
                        }
                      }}
                    />
                    <button className="icon-button mini" title="Save project name">
                      <Check size={13} />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="project-row-wrap">
                      <button
                        className="project-row"
                        onClick={() => props.onSelectProject(project)}
                        title={project.path}
                      >
                        <Folder size={14} />
                        <span>{project.name}</span>
                        {project.pinned && <Pin size={11} />}
                      </button>
                      <div className="project-actions">
                        <button
                          className="icon-button mini"
                          onClick={() => props.onStartThread(project)}
                          title="Start new chat draft"
                        >
                          <Plus size={13} />
                        </button>
                        <div className="menu-anchor">
                          <button
                            className="icon-button mini"
                            onClick={() =>
                              setOpenProjectMenuId((current) =>
                                current === project.id ? null : project.id,
                              )
                            }
                            title="Project actions"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {openProjectMenuId === project.id && (
                            <div className="sidebar-menu project-menu">
                              <button
                                onClick={() =>
                                  props.updateProject(project.id, (item) => ({
                                    ...item,
                                    pinned: !item.pinned,
                                  }))
                                }
                              >
                                {project.pinned ? (
                                  <PinOff size={14} />
                                ) : (
                                  <Pin size={14} />
                                )}
                                <span>
                                  {project.pinned ? "Unpin project" : "Pin project"}
                                </span>
                              </button>
                              <button
                                disabled
                                title="Deferred until the desktop file-manager bridge is wired."
                              >
                                <FolderOpen size={14} />
                                <span>Open in Explorer</span>
                              </button>
                              <button onClick={() => beginProjectRename(project)}>
                                <Edit3 size={14} />
                                <span>Rename project</span>
                              </button>
                              <button
                                onClick={() =>
                                  setConfirming({
                                    type: "archiveProject",
                                    projectId: project.id,
                                  })
                                }
                                disabled={threads.length === 0}
                              >
                                <Archive size={14} />
                                <span>Archive chats</span>
                              </button>
                              <button
                                onClick={() =>
                                  setConfirming({
                                    type: "removeProject",
                                    projectId: project.id,
                                  })
                                }
                              >
                                <X size={14} />
                                <span>Remove</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {confirming?.type === "archiveProject" &&
                      confirming.projectId === project.id && (
                        <div className="confirm-popover project-confirm">
                          <span>Archive the visible chats for this project?</span>
                          <button onClick={() => confirmArchiveProject(project)}>
                            Archive
                          </button>
                          <button onClick={() => setConfirming(null)}>Cancel</button>
                        </div>
                      )}
                    {confirming?.type === "removeProject" &&
                      confirming.projectId === project.id && (
                        <div className="confirm-popover project-confirm">
                          <span>Remove this project from the sidebar?</span>
                          <small>The folder stays on disk.</small>
                          <button onClick={() => confirmRemoveProject(project.id)}>
                            Remove
                          </button>
                          <button onClick={() => setConfirming(null)}>Cancel</button>
                        </div>
                      )}
                  </>
                )}

                <div className="project-thread-list">
                  {!hasRows && (
                    <p className="empty-project-chats">No chats yet</p>
                  )}
                  {draft && (
                    <div
                      key={draft.id}
                      className={`thread-stack draft-thread ${
                        props.activeDraftProjectId === project.id ? "active" : ""
                      }`}
                    >
                      <div
                        className={`thread-row-wrap draft-row-wrap ${
                          props.activeDraftProjectId === project.id ? "active" : ""
                        }`}
                      >
                        <span className="thread-draft-gutter" />
                        <button
                          className="thread-row"
                          onClick={() => props.onSelectDraft(project)}
                          title="Unsent new chat draft"
                        >
                          <MessageSquare size={12} />
                          <span>New chat</span>
                        </button>
                        <div className="thread-row-meta">
                          <small className="thread-time">
                            {draft.text.trim() ||
                            draft.attachments.length > 0 ||
                            (draft.contexts?.length ?? 0) > 0
                              ? formatRelative(draft.updatedAt)
                              : "Draft"}
                          </small>
                        </div>
                      </div>
                    </div>
                  )}
                  {visibleThreads.map((thread) => {
                    const pinned = pinnedThreads.has(thread.id);
                    const active = props.activeThreadId === thread.id;
                    const running = thread.status.type === "active";
                    return (
                      <div key={thread.id} className="thread-stack">
                        <div
                          className={`thread-row-wrap ${active ? "active" : ""} ${
                            pinned ? "pinned" : ""
                          }`}
                        >
                          <button
                            className="icon-button mini thread-pin-action"
                            onClick={() => props.onTogglePinnedThread(thread.id)}
                            title={pinned ? "Unpin chat" : "Pin chat"}
                          >
                            {pinned ? <PinOff size={12} /> : <Pin size={12} />}
                          </button>
                          {editingThreadId === thread.id ? (
                            <form
                              className="thread-rename"
                              onSubmit={(event) => {
                                event.preventDefault();
                                finishThreadRename(thread.id);
                              }}
                            >
                              <input
                                autoFocus
                                value={threadDraftName}
                                onChange={(event) =>
                                  setThreadDraftName(event.target.value)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    setEditingThreadId(null);
                                    setThreadDraftName("");
                                  }
                                }}
                              />
                              <button className="icon-button mini" title="Save name">
                                <Check size={13} />
                              </button>
                            </form>
                          ) : (
                            <button
                              className="thread-row"
                              onClick={() => props.onSelectThread(thread.id, project)}
                              onDoubleClick={() => beginThreadRename(thread)}
                              title={`${threadTitle(thread)}. Double-click to rename.`}
                            >
                              {running && <Loader2 className="spin" size={12} />}
                              <span>{threadTitle(thread)}</span>
                            </button>
                          )}
                          <div className="thread-row-meta">
                            <small className="thread-time">
                              {formatRelative(thread.updatedAt)}
                            </small>
                            <button
                              className="icon-button mini thread-archive-action"
                              onClick={() =>
                                setConfirming({
                                  type: "archiveThread",
                                  threadId: thread.id,
                                })
                              }
                              title="Archive chat"
                            >
                              <Archive size={12} />
                            </button>
                          </div>
                        </div>
                        {confirming?.type === "archiveThread" &&
                          confirming.threadId === thread.id && (
                            <div className="confirm-popover thread-confirm">
                              <span>You sure?</span>
                              <button
                                onClick={() =>
                                  confirmArchiveThread(thread.id, project)
                                }
                              >
                                Archive
                              </button>
                              <button onClick={() => setConfirming(null)}>
                                Cancel
                              </button>
                            </div>
                          )}
                      </div>
                    );
                  })}
                  {threads.length > 5 && (
                    <button
                      className="show-more-row"
                      onClick={() => props.onToggleProjectExpanded(project.id)}
                      title={
                        expanded
                          ? "Show only the latest 5 chats"
                          : `Show 5 more chats${hiddenThreadCount > 5 ? "; older chats stay hidden" : ""}`
                      }
                    >
                      {expanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="settings-area" ref={settingsAreaRef}>
        {settingsOpen && (
          <div className="settings-popover">
            <div className="settings-popover-row account-row">
              <UserCircle size={15} />
              <span title={account.title}>{account.title}</span>
            </div>
            <div className="settings-popover-row account-row muted-row">
              <Settings size={15} />
              <span>{account.detail}</span>
            </div>
            <div className="settings-menu-divider" />
            <div className="settings-popover-row">
              <Settings size={15} />
              <span>Settings</span>
            </div>
            {usageRows.length > 0 && (
              <>
                <div className="settings-menu-divider" />
                <button
                  className="settings-popover-row"
                  onClick={() => setUsageOpen((value) => !value)}
                >
                  <Gauge size={15} />
                  <span>Usage remaining</span>
                  {usageOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
                {usageOpen && (
                  <div className="usage-summary">
                    {usageRows.map((row) => (
                      <div className="usage-summary-row" key={row.label}>
                        <strong>{row.label}</strong>
                        <span>{row.remaining}</span>
                        {row.reset && <span>{row.reset}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {canLogout && (
              <>
                <div className="settings-menu-divider" />
                <button
                  className="settings-popover-row"
                  onClick={() => void logout()}
                  disabled={logoutBusy || props.connectionStatus !== "connected"}
                >
                  {logoutBusy ? (
                    <Loader2 className="spin" size={15} />
                  ) : (
                    <LogOut size={15} />
                  )}
                  <span>Log out</span>
                </button>
              </>
            )}
          </div>
        )}
        <button
          className={`settings-link ${settingsOpen ? "active" : ""}`}
          onClick={() => {
            setAddMenuOpen(false);
            setOpenProjectMenuId(null);
            setSettingsOpen((value) => !value);
          }}
        >
          <Settings size={15} /> Settings
        </button>
      </div>
    </aside>
  );
}

function describeAccount(snapshot: AppServerSnapshot): {
  title: string;
  detail: string;
} {
  const account = snapshot.account?.account;
  if (account?.type === "chatgpt") {
    return {
      title: account.email,
      detail: personalAccountLabel(account.planType),
    };
  }
  if (account?.type === "apiKey") {
    return { title: "API key", detail: "Local credential" };
  }
  if (account?.type === "amazonBedrock") {
    return { title: "Amazon Bedrock", detail: "External provider" };
  }
  if (snapshot.accountError) {
    return { title: "Account unavailable", detail: "Could not read account" };
  }
  if (snapshot.account?.requiresOpenaiAuth) {
    return { title: "Not signed in", detail: "OpenAI auth required" };
  }
  return { title: "No account required", detail: "Local model provider" };
}

function personalAccountLabel(planType: string) {
  switch (planType) {
    case "team":
    case "business":
    case "self_serve_business_usage_based":
      return "Team account";
    case "enterprise":
    case "enterprise_cbp_usage_based":
    case "edu":
      return "Workspace account";
    default:
      return "Personal account";
  }
}

function usageSummaryRows(snapshot: AppServerSnapshot) {
  const rateLimits =
    snapshot.rateLimits?.rateLimitsByLimitId?.codex ??
    snapshot.rateLimits?.rateLimits ??
    null;
  if (!rateLimits) return [];

  return [
    rateLimits.primary
      ? usageRow(
          durationLabel(rateLimits.primary.windowDurationMins, "Usage"),
          rateLimits.primary.usedPercent,
          rateLimits.primary.resetsAt,
        )
      : null,
    rateLimits.secondary
      ? usageRow(
          durationLabel(rateLimits.secondary.windowDurationMins, "Weekly"),
          rateLimits.secondary.usedPercent,
          rateLimits.secondary.resetsAt,
        )
      : null,
  ].filter(
    (row): row is { label: string; remaining: string; reset: string | null } =>
      row !== null,
  );
}

function usageRow(label: string, usedPercent: number, resetsAt: number | null) {
  return {
    label,
    remaining: usageRemainingLabel(usedPercent),
    reset: resetLabel(resetsAt),
  };
}

function usageRemainingLabel(usedPercent: number) {
  if (!Number.isFinite(usedPercent)) return "Unknown";
  const remaining = Math.max(0, Math.min(100, 100 - usedPercent));
  return `${Math.round(remaining)}%`;
}

function durationLabel(minutes: number | null, fallback: string) {
  if (!minutes) return fallback;
  if (minutes % 10080 === 0) {
    return minutes === 10080 ? "Weekly" : `${minutes / 10080}w`;
  }
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function resetLabel(resetsAt: number | null) {
  if (!resetsAt) return null;
  const reset = new Date(resetsAt * 1000);
  const now = new Date();
  if (
    reset.getFullYear() === now.getFullYear() &&
    reset.getMonth() === now.getMonth() &&
    reset.getDate() === now.getDate()
  ) {
    return reset.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return reset.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
