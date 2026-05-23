import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChatThread } from "./components/ChatThread";
import { Composer } from "./components/Composer";
import { Inspector } from "./components/Inspector";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import {
  classifyAttachment,
  hasDraftContent,
  promptWithInspectableFiles,
  unsupportedAttachments,
} from "./attachments";
import { createProjectCanvas } from "./canvasState";
import { useAppServerConnection } from "./hooks/useAppServerConnection";
import { useAppServerEvents } from "./hooks/useAppServerEvents";
import { useDocumentPreview } from "./hooks/useDocumentPreview";
import {
  activeTurn,
  allItems,
  ensureTurn,
  sandboxPolicyFor,
  threadTitle,
} from "./itemUtils";
import {
  createProject,
  defaultSettings,
  loadDesktopState,
  saveDesktopState,
} from "./localState";
import { runtimeInfo, sameRuntimePath } from "./runtime";
import type {
  AppServerSnapshot,
  ComposerAttachment,
  DesktopState,
  InspectorSelection,
  LocalChatDraft,
  PendingApproval,
  Project,
  ProjectCanvas,
  ProjectSettings,
  Thread,
  ThreadItem,
  ThreadMap,
  ThreadTokenUsage,
  ThreadTokenUsageMap,
  Turn,
} from "./types";

type SubmissionDraft = {
  prompt: string;
  projectId: string;
  settings: ProjectSettings;
  attachments: ComposerAttachment[];
  createdAt: number;
  localDraftProjectId?: string | null;
};

type ProjectThreadGroup = {
  project: Project;
  threads: Thread[];
  draft: LocalChatDraft | null;
};

type TauriWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

const SIDEBAR_DRAWER_WIDTH = 700;
const INSPECTOR_AUTO_COLLAPSE_WIDTH = 660;
const INSPECTOR_MIN_WIDTH = 320;
const CHAT_MIN_WIDTH = 360;
const CHAT_PHONE_LAYOUT_WIDTH = 460;
const INSPECTOR_AUTO_COLLAPSE_QUERY = `(max-width: ${INSPECTOR_AUTO_COLLAPSE_WIDTH}px)`;

export function App() {
  const [desktop, setDesktop] = useState<DesktopState>(() =>
    loadDesktopState(),
  );
  const [threads, setThreads] = useState<ThreadMap>({});
  const [tokenUsageByThread, setTokenUsageByThread] =
    useState<ThreadTokenUsageMap>({});
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [inspector, setInspector] = useState<InspectorSelection>({
    type: "empty",
  });
  const [chatDrafts, setChatDrafts] = useState<Record<string, LocalChatDraft>>(
    {},
  );
  const [activeDraftProjectId, setActiveDraftProjectId] = useState<string | null>(
    null,
  );
  const [composerText, setComposerText] = useState("");
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [projectPath, setProjectPath] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryDraft, setRetryDraft] = useState<SubmissionDraft | null>(null);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [shellWidth, setShellWidth] = useState(() =>
    typeof window === "undefined" ? 1200 : window.innerWidth,
  );
  const shellRef = useRef<HTMLDivElement | null>(null);
  const refreshThreadsRef = useRef<
    (cwd: string | null, limit?: number) => Promise<Thread[]>
  >(async () => []);
  const syncThreadRef = useRef<(threadId: string) => Promise<Thread | null>>(
    async () => null,
  );
  const threadsRef = useRef<ThreadMap>({});
  const activeThreadIdRef = useRef<string | null>(null);
  const threadSelectionVersionRef = useRef(0);
  const justStartedThreadIdRef = useRef<string | null>(null);
  const turnPollsRef = useRef<Set<string>>(new Set());
  const inFlightDraftsRef = useRef<Map<string, SubmissionDraft>>(new Map());
  const inspectorRetargetThreadIdRef = useRef<string | null>(null);

  const activeProject = useMemo(
    () =>
      desktop.projects.find(
        (project) => project.id === desktop.activeProjectId,
      ) ?? null,
    [desktop.activeProjectId, desktop.projects],
  );
  const activeCanvasProjectId =
    inspector.type === "canvas" ? inspector.projectId : null;
  const sidebarDockedWidth = sidebarWidthForShell(shellWidth);
  const sidebarDrawerMode =
    shellWidth <= SIDEBAR_DRAWER_WIDTH ||
    (desktop.layout.inspectorOpen &&
      shellWidth - sidebarDockedWidth - desktop.layout.inspectorWidth <
        CHAT_MIN_WIDTH);
  const availableChatWidth = Math.max(
    0,
    shellWidth -
      (sidebarDrawerMode ? 0 : sidebarDockedWidth) -
      (desktop.layout.inspectorOpen ? desktop.layout.inspectorWidth : 0),
  );
  const chatPhoneLayout = availableChatWidth <= CHAT_PHONE_LAYOUT_WIDTH;
  const visibleProjects = useMemo(
    () =>
      desktop.projects
        .filter((project) => !project.hidden && !project.archived)
        .sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order,
        ),
    [desktop.projects],
  );
  const activeThread = desktop.activeThreadId
    ? (threads[desktop.activeThreadId] ?? null)
    : null;
  const activeDraft = activeDraftProjectId
    ? (chatDrafts[activeDraftProjectId] ?? null)
    : null;
  const activeItems = allItems(activeThread);
  const fileChangeItems = activeItems.filter(
    (item): item is Extract<ThreadItem, { type: "fileChange" }> =>
      item.type === "fileChange",
  );
  const currentSettings = activeProject?.settings ?? defaultSettings;
  const promptReady = composerText.trim().length > 0;
  const activeContextUsage = desktop.activeThreadId
    ? (tokenUsageByThread[desktop.activeThreadId] ?? null)
    : null;
  const defaultInspectorSelection = useMemo(
    () => firstMarkdownChangeSelection(activeThread, activeProject),
    [activeProject, activeThread],
  );

  function sortThreadsForProject(project: Project) {
    const pinned = new Set(desktop.pinnedThreadIds);
    return Object.values(threads)
      .filter((thread) => sameRuntimePath(thread.cwd, project.path))
      .sort(
        (a, b) =>
          Number(pinned.has(b.id)) - Number(pinned.has(a.id)) ||
          b.updatedAt - a.updatedAt,
      );
  }

  const patchThread = useCallback(
    (threadId: string, updater: (thread: Thread) => Thread) => {
      setThreads((current) => {
        const thread = current[threadId];
        if (!thread) return current;
        return { ...current, [threadId]: updater(thread) };
      });
    },
    [],
  );

  const { handleNotification, handleServerRequest } = useAppServerEvents({
    activeProjectPath: activeProject?.path ?? null,
    patchThread,
    refreshThreads: (cwd) => refreshThreadsRef.current(cwd),
    syncThread: (threadId) => syncThreadRef.current(threadId),
    onThreadArchived: handleThreadArchived,
    onThreadNameUpdated: handleThreadNameUpdated,
    onTokenUsageUpdated: handleTokenUsageUpdated,
    onTurnCompleted: handleTurnCompleted,
    setInspector,
    setPendingApprovals,
    setRunningTurnId,
  });

  const {
    client,
    connectionStatus,
    connectionError,
    snapshot,
    connect,
    refreshSettings,
  } = useAppServerConnection({
    appServerUrl: desktop.appServerUrl,
    activeProjectPath: activeProject?.path ?? null,
    autoConnect: runtimeInfo.autoConnect,
    onNotification: handleNotification,
    onServerRequest: handleServerRequest,
  });
  const { documentText, documentError } = useDocumentPreview(client, inspector);
  const sendDisabledReason = sendBlockReason({
    activeProject,
    connectionStatus,
    hasUnsupportedAttachments: unsupportedAttachments(attachments).length > 0,
    pendingApprovals,
    promptReady,
    runningTurnId,
  });

  const syncThread = useCallback(
    async (threadId: string, includeTurns = true) => {
      if (!client.connected) return null;
      let response: { thread: Thread };
      try {
        response = await client.request<{ thread: Thread }>("thread/read", {
          threadId,
          includeTurns,
        });
      } catch (error) {
        if (includeTurns && isThreadNotMaterialized(error)) {
          response = await client.request<{ thread: Thread }>("thread/read", {
            threadId,
            includeTurns: false,
          });
        } else {
          throw error;
        }
      }
      setThreads((current) => ({
        ...current,
        [response.thread.id]: response.thread,
      }));
      return response.thread;
    },
    [client],
  );

  const refreshThreads = useCallback(
    async (cwd: string | null, limit = 10) => {
      if (!client.connected) return [];
      try {
        const response = await client.request<{ data: Thread[] }>(
          "thread/list",
          {
            limit,
            cwd,
            archived: false,
            sortKey: "updated_at",
            sortDirection: "desc",
          },
        );
        const listedIds = new Set(response.data.map((thread) => thread.id));
        setThreads((current) => {
          const next = { ...current };
          if (cwd) {
            for (const [threadId, thread] of Object.entries(next)) {
              if (
                sameRuntimePath(thread.cwd, cwd) &&
                !listedIds.has(threadId)
              ) {
                delete next[threadId];
              }
            }
          }
          for (const thread of response.data) {
            const existing = next[thread.id];
            next[thread.id] =
              existing && existing.turns.length > 0 && thread.turns.length === 0
                ? { ...thread, turns: existing.turns }
                : thread;
          }
          return next;
        });
        setDesktop((current) => {
          if (!cwd) return current;
          const project = current.projects.find(
            (item) =>
              item.id === current.activeProjectId &&
              sameRuntimePath(item.path, cwd),
          );
          if (!project) return current;
          if (activeDraftProjectId === project.id) return current;
          const preferredActiveThreadId =
            justStartedThreadIdRef.current &&
            isKnownThreadForCwd(
              threadsRef.current,
              justStartedThreadIdRef.current,
              cwd,
            )
              ? justStartedThreadIdRef.current
              : activeThreadIdRef.current &&
                  isKnownThreadForCwd(
                    threadsRef.current,
                    activeThreadIdRef.current,
                    cwd,
                  )
                ? activeThreadIdRef.current
              : null;
          const activeStillExists =
            current.activeThreadId !== null &&
            (listedIds.has(current.activeThreadId) ||
              isKnownThreadForCwd(threadsRef.current, current.activeThreadId, cwd));
          const lastStillExists =
            project.lastActiveThreadId !== null &&
            (listedIds.has(project.lastActiveThreadId) ||
              isKnownThreadForCwd(
                threadsRef.current,
                project.lastActiveThreadId,
                cwd,
              ));
          const nextThreadId =
            preferredActiveThreadId ??
            (activeStillExists
              ? current.activeThreadId
              : lastStillExists
                ? project.lastActiveThreadId
                : (response.data[0]?.id ?? null));
          if (
            current.activeThreadId === nextThreadId &&
            project.lastActiveThreadId === nextThreadId
          ) {
            return current;
          }
          activeThreadIdRef.current = nextThreadId;
          return {
            ...current,
            activeThreadId: nextThreadId,
            projects: current.projects.map((item) =>
              item.id === project.id
                ? { ...item, lastActiveThreadId: nextThreadId }
                : item,
            ),
          };
        });
        return response.data;
      } catch (error) {
        console.error("Failed to refresh Codex chats", error);
        return [];
      }
    },
    [activeDraftProjectId, client],
  );

  useEffect(() => {
    refreshThreadsRef.current = refreshThreads;
  }, [refreshThreads]);

  useEffect(() => {
    syncThreadRef.current = syncThread;
  }, [syncThread]);

  useEffect(() => saveDesktopState(desktop), [desktop]);

  useEffect(() => {
    function updateShellWidth() {
      setShellWidth(shellRef.current?.clientWidth ?? window.innerWidth);
    }

    updateShellWidth();
    window.addEventListener("resize", updateShellWidth);

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateShellWidth);
    if (observer && shellRef.current) observer.observe(shellRef.current);

    return () => {
      window.removeEventListener("resize", updateShellWidth);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!desktop.layout.inspectorOpen) return;
    if (shellWidth <= INSPECTOR_AUTO_COLLAPSE_WIDTH) {
      setDesktop((current) =>
        current.layout.inspectorOpen
          ? {
              ...current,
              layout: { ...current.layout, inspectorOpen: false },
            }
          : current,
      );
      return;
    }

    const maxWidth = maxInspectorWidthForShell(shellWidth);
    setDesktop((current) => {
      if (!current.layout.inspectorOpen) return current;
      const nextWidth = clamp(
        current.layout.inspectorWidth,
        INSPECTOR_MIN_WIDTH,
        maxWidth,
      );
      if (nextWidth === current.layout.inspectorWidth) return current;
      return {
        ...current,
        layout: { ...current.layout, inspectorWidth: nextWidth },
      };
    });
  }, [desktop.layout.inspectorOpen, shellWidth]);

  useEffect(() => {
    if (!sidebarDrawerMode && sidebarDrawerOpen) {
      setSidebarDrawerOpen(false);
    }
  }, [sidebarDrawerMode, sidebarDrawerOpen]);

  useEffect(() => {
    const media = window.matchMedia(INSPECTOR_AUTO_COLLAPSE_QUERY);
    const collapseInspectorIfNeeded = () => {
      if (!media.matches) return;
      setDesktop((current) =>
        current.layout.inspectorOpen
          ? {
              ...current,
              layout: {
                ...current.layout,
                inspectorOpen: false,
              },
            }
          : current,
      );
    };
    collapseInspectorIfNeeded();
    media.addEventListener("change", collapseInspectorIfNeeded);
    return () => media.removeEventListener("change", collapseInspectorIfNeeded);
  }, []);

  useEffect(() => {
    activeThreadIdRef.current = desktop.activeThreadId;
  }, [desktop.activeThreadId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    inspectorRetargetThreadIdRef.current = desktop.activeThreadId;
  }, [desktop.activeThreadId]);

  useEffect(() => {
    if (inspectorRetargetThreadIdRef.current !== desktop.activeThreadId) return;
    if (desktop.activeThreadId && !activeThread) return;
    if (activeThread?.status.type === "notLoaded") return;
    setInspector((current) => {
      if (current.type === "canvas") return current;
      return sameInspectorSelection(current, defaultInspectorSelection)
        ? current
        : defaultInspectorSelection;
    });
    inspectorRetargetThreadIdRef.current = null;
  }, [activeThread?.status.type, defaultInspectorSelection, desktop.activeThreadId]);

  useEffect(() => {
    if (!activeDraftProjectId) return;
    setChatDrafts((current) => {
      const existing = current[activeDraftProjectId];
      const project = desktop.projects.find(
        (candidate) => candidate.id === activeDraftProjectId,
      );
      if (!existing && !project) return current;
      const base = existing ?? createChatDraft(project as Project);
      if (base.text === composerText && base.attachments === attachments) return current;
      return {
        ...current,
        [activeDraftProjectId]: {
          ...base,
          text: composerText,
          attachments,
          updatedAt: Date.now(),
        },
      };
    });
  }, [activeDraftProjectId, attachments, composerText, desktop.projects]);

  useEffect(() => {
    if (connectionStatus === "connected") {
      const projectsToRefresh = visibleProjects;
      const activeThreadIdAtRefreshStart = activeThreadIdRef.current;
      void Promise.all(
        projectsToRefresh.map((project) => refreshThreads(project.path)),
      ).then((listedThreadGroups) => {
        if (!activeProject) return;
        if (activeThreadIdRef.current !== activeThreadIdAtRefreshStart) return;
        const activeProjectIndex = projectsToRefresh.findIndex(
          (project) => project.id === activeProject.id,
        );
        const listedThreads =
          activeProjectIndex === -1
            ? []
            : listedThreadGroups[activeProjectIndex];
        const listedThreadIds = new Set(listedThreads.map((thread) => thread.id));
        const activeThreadStillExists =
          activeThreadIdAtRefreshStart !== null &&
          (listedThreadIds.has(activeThreadIdAtRefreshStart) ||
            isKnownThreadForCwd(
              threadsRef.current,
              activeThreadIdAtRefreshStart,
              activeProject.path,
            ));
        const lastThreadStillExists =
          activeProject.lastActiveThreadId !== null &&
          listedThreadIds.has(activeProject.lastActiveThreadId);
        const threadId = activeThreadStillExists
          ? activeThreadIdAtRefreshStart
          : lastThreadStillExists
            ? activeProject.lastActiveThreadId
            : (listedThreads[0]?.id ?? null);
        if (activeDraftProjectId === activeProject.id) return;
        if (
          justStartedThreadIdRef.current &&
          isKnownThreadForCwd(
            threadsRef.current,
            justStartedThreadIdRef.current,
            activeProject.path,
          )
        ) {
          return;
        }
        if (threadId) {
          void readThread(threadId, activeProject).catch((error) => {
            if (isStaleThreadError(error)) {
              forgetThread(
                threadId,
                "That empty chat is no longer available. Start a new chat when you're ready.",
              );
              return;
            }
            setSendError(`Could not open that chat: ${errorMessage(error)}`);
          });
        }
      });
    }
  }, [activeDraftProjectId, activeProject?.id, activeProject?.path, connectionStatus, refreshThreads, visibleProjects]);

  function handleTurnCompleted(_threadId: string, turn: Turn) {
    const draft = inFlightDraftsRef.current.get(turn.id);
    if (!draft) return;
    inFlightDraftsRef.current.delete(turn.id);
    if (turn.status === "failed" || turn.status === "interrupted") {
      setRetryDraft(draft);
      return;
    }
    setSendError(null);
    setRetryDraft((current) => (current === draft ? null : current));
  }

  function handleThreadNameUpdated(threadId: string, name: string | null) {
    patchThread(threadId, (thread) => ({ ...thread, name }));
  }

  function handleTokenUsageUpdated(
    threadId: string,
    tokenUsage: ThreadTokenUsage,
  ) {
    setTokenUsageByThread((current) => ({
      ...current,
      [threadId]: tokenUsage,
    }));
  }

  function handleThreadArchived(threadId: string) {
    forgetThread(threadId);
    void refreshThreadsRef.current(activeProject?.path ?? null);
  }

  function selectInspector(selection: InspectorSelection) {
    setInspector(selection);
    if (selection.type === "empty") return;
    setDesktop((current) =>
      current.layout.inspectorOpen
        ? current
        : {
            ...current,
            layout: {
              ...current.layout,
              inspectorOpen: true,
            },
      },
    );
  }

  function selectProjectCanvas(project = activeProject) {
    if (!project) {
      setActionError("Add or select a local project before opening Canvas.");
      return;
    }
    const preferredWidth = preferredCanvasInspectorWidth();
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector({ type: "canvas", projectId: project.id });
    inspectorRetargetThreadIdRef.current = "canvas";
    setDesktop((current) => {
      const canvas =
        current.canvases[project.id] ?? createProjectCanvas(project);
      return {
        ...current,
        activeProjectId: project.id,
        canvases: {
          ...current.canvases,
          [project.id]: canvas,
        },
        layout: {
          ...current.layout,
          inspectorOpen: true,
          inspectorWidth: Math.max(current.layout.inspectorWidth, preferredWidth),
        },
      };
    });
  }

  function updateProjectCanvas(projectId: string, canvas: ProjectCanvas) {
    setDesktop((current) => ({
      ...current,
      canvases: {
        ...current.canvases,
        [projectId]: canvas,
      },
    }));
  }

  function createChatDraft(project: Project, now = Date.now()): LocalChatDraft {
    return {
      id: `draft:${project.id}`,
      projectId: project.id,
      projectPath: project.path,
      text: "",
      attachments: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function selectLocalDraft(project = activeProject) {
    if (!project) {
      setActionError("Add or select a local project before starting a chat.");
      return;
    }
    const existing = chatDrafts[project.id];
    const draft = existing ?? createChatDraft(project);
    setChatDrafts((current) =>
      current[project.id] ? current : { ...current, [project.id]: draft },
    );
    setActiveDraftProjectId(project.id);
    activeThreadIdRef.current = null;
    inspectorRetargetThreadIdRef.current = null;
    setComposerText(draft.text);
    setAttachments(draft.attachments);
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector((current) =>
      current.type === "canvas"
        ? { type: "canvas", projectId: project.id }
        : { type: "empty" },
    );
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      activeThreadId: null,
    }));
  }

  function clearActiveDraftSelection() {
    if (!activeDraftProjectId) return;
    setActiveDraftProjectId(null);
    setComposerText("");
    setAttachments([]);
  }

  async function readThread(threadId: string, project?: Project | null) {
    const selectionVersion = threadSelectionVersionRef.current + 1;
    threadSelectionVersionRef.current = selectionVersion;
    inspectorRetargetThreadIdRef.current = threadId;
    const projectForThread =
      project ??
      desktop.projects.find((candidate) => {
        const loadedThread = threads[threadId];
        return loadedThread && sameRuntimePath(loadedThread.cwd, candidate.path);
      }) ??
      activeProject;
    clearActiveDraftSelection();
    setInspector((current) =>
      current.type === "canvas" && projectForThread
        ? { type: "canvas", projectId: projectForThread.id }
        : current.type === "canvas"
          ? current
          : { type: "empty" },
    );
    setRetryDraft(null);
    setActionError(null);
    setSendError(null);
    activeThreadIdRef.current = threadId;
    setDesktop((current) => {
      const projectId = projectForThread?.id ?? current.activeProjectId;
      if (current.activeProjectId === projectId && current.activeThreadId === threadId) {
        return current;
      }
      return {
        ...current,
        activeProjectId: projectId,
        activeThreadId: threadId,
        projects: current.projects.map((stored) =>
          stored.id === projectId
            ? { ...stored, lastActiveThreadId: threadId }
            : stored,
        ),
      };
    });

    let thread: Thread | null = null;
    try {
      thread = projectForThread
        ? await resumeThread(threadId, projectForThread, projectForThread.settings, {
            select: false,
          })
        : await syncThread(threadId);
    } catch (error) {
      if (threadSelectionVersionRef.current !== selectionVersion) return;
      if (isStaleThreadError(error)) {
        forgetThread(
          threadId,
          "That empty chat is no longer available. Start a new chat when you're ready.",
        );
        return;
      }
      setSendError(`Could not open that chat: ${errorMessage(error)}`);
      return;
    }
    if (threadSelectionVersionRef.current !== selectionVersion) return;
    if (!thread) return;
    activeThreadIdRef.current = thread.id;
    setDesktop((current) => {
      const projectId = projectForThread?.id ?? current.activeProjectId;
      const projectAlreadyCurrent = current.projects.some(
        (project) =>
          project.id === projectId && project.lastActiveThreadId === thread.id,
      );
      if (
        current.activeProjectId === projectId &&
        current.activeThreadId === thread.id &&
        projectAlreadyCurrent
      ) {
        return current;
      }
      return {
        ...current,
        activeProjectId: projectId,
        activeThreadId: thread.id,
        projects: current.projects.map((project) =>
          project.id === projectId
            ? { ...project, lastActiveThreadId: thread.id }
            : project,
        ),
      };
    });
  }

  async function resumeThread(
    threadId: string,
    project: Project,
    settings: ProjectSettings = project.settings,
    options: { select: boolean } = { select: true },
  ) {
    try {
      const response = await client.request<{ thread: Thread }>(
        "thread/resume",
        {
          threadId,
          cwd: project.path,
          approvalPolicy: settings.approvalPolicy,
          sandbox: settings.sandbox,
          model: settings.model,
          serviceTier: settings.serviceTier,
        },
      );
      setThreads((current) => ({
        ...current,
        [response.thread.id]: response.thread,
      }));
      if (options.select) {
        setDesktop((current) => {
          const projectAlreadyCurrent = current.projects.some(
            (stored) =>
              stored.id === project.id &&
              stored.lastActiveThreadId === response.thread.id,
          );
          if (
            current.activeProjectId === project.id &&
            current.activeThreadId === response.thread.id &&
            projectAlreadyCurrent
          ) {
            return current;
          }
          return {
            ...current,
            activeProjectId: project.id,
            activeThreadId: response.thread.id,
            projects: current.projects.map((stored) =>
              stored.id === project.id
                ? { ...stored, lastActiveThreadId: response.thread.id }
                : stored,
            ),
          };
        });
      }
      return response.thread;
    } catch (error) {
      if (isStaleThreadError(error)) {
        forgetThread(threadId);
        return null;
      }
      throw error;
    }
  }

  async function startThread(
    project = activeProject,
    settings: ProjectSettings | null = project?.settings ?? null,
  ) {
    if (!project) return null;
    const response = await client.request<{ thread: Thread }>("thread/start", {
      cwd: project.path,
      approvalPolicy: settings?.approvalPolicy ?? project.settings.approvalPolicy,
      sandbox: settings?.sandbox ?? project.settings.sandbox,
      model: settings?.model ?? project.settings.model,
      serviceTier: settings?.serviceTier ?? project.settings.serviceTier,
      threadSource: "user",
    });
    return response.thread;
  }

  function createNewChat(project = activeProject) {
    selectLocalDraft(project);
  }

  async function renameThread(threadId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setActionError("Chat name cannot be empty.");
      return;
    }
    try {
      setActionError(null);
      await client.request("thread/name/set", { threadId, name: trimmed });
      handleThreadNameUpdated(threadId, trimmed);
      await refreshThreads(activeProject?.path ?? null);
    } catch (error) {
      setActionError(`Could not rename chat: ${errorMessage(error)}`);
    }
  }

  async function archiveThread(threadId: string, project = activeProject) {
    try {
      setActionError(null);
      await client.request("thread/archive", { threadId });
      setDesktop((current) => ({
        ...current,
        pinnedThreadIds: current.pinnedThreadIds.filter((id) => id !== threadId),
      }));
      const nextThread =
        (project ? sortThreadsForProject(project) : projectThreads).find(
          (thread) => thread.id !== threadId,
        ) ?? null;
      handleThreadArchived(threadId);
      await refreshThreads(project?.path ?? activeProject?.path ?? null);
      if (desktop.activeThreadId === threadId && nextThread) {
        await readThread(nextThread.id, project ?? activeProject);
      }
    } catch (error) {
      setActionError(`Could not archive chat: ${errorMessage(error)}`);
    }
  }

  async function threadForSend(
    project: Project,
    candidate: Thread | null,
    settings: ProjectSettings,
  ) {
    if (!candidate) return startThread(project, settings);
    if (candidate.status.type === "notLoaded") {
      return (
        (await resumeThread(candidate.id, project, settings)) ??
        startThread(project, settings)
      );
    }
    return candidate;
  }

  async function sendPrompt(event?: FormEvent) {
    event?.preventDefault();
    const prompt = composerText.trim();
    if (!activeProject) {
      setSendError("Add or select a local project before sending.");
      return;
    }
    const draft: SubmissionDraft = {
      prompt,
      projectId: activeProject.id,
      settings: { ...activeProject.settings },
      attachments: [...attachments],
      createdAt: Date.now(),
      localDraftProjectId:
        activeDraftProjectId === activeProject.id ? activeDraftProjectId : null,
    };
    await sendDraft(draft, { clearComposer: true });
  }

  async function retryPrompt() {
    if (!retryDraft) return;
    await sendDraft(retryDraft, { clearComposer: false, retry: true });
  }

  async function sendDraft(
    draft: SubmissionDraft,
    options: { clearComposer: boolean; retry?: boolean },
  ) {
    const project =
      desktop.projects.find((candidate) => candidate.id === draft.projectId) ??
      activeProject;
    const blocked = sendBlockReason({
      activeProject: project,
      connectionStatus,
      hasUnsupportedAttachments: unsupportedAttachments(draft.attachments).length > 0,
      pendingApprovals,
      promptReady: Boolean(draft.prompt.trim()),
      runningTurnId,
    });
    if (blocked) {
      setSendError(blocked);
      return;
    }
    if (!project) return;
    if (unsupportedAttachments(draft.attachments).length > 0) {
      setSendError("Remove unsupported files before sending.");
      return;
    }
    const sendingLocalDraft =
      draft.localDraftProjectId === project.id && activeDraftProjectId === project.id;
    try {
      setSendError(null);
      if (!options.retry) setRetryDraft(null);
      const candidateThread =
        sendingLocalDraft || desktop.activeProjectId !== project.id
          ? null
          : activeThread;
      let targetThread = await threadForSend(
        project,
        candidateThread,
        draft.settings,
      );
      if (!targetThread) throw new Error("Could not create a chat thread.");
      const promptText = promptWithInspectableFiles(
        draft.settings.planMode
          ? `Plan Mode: investigate and propose the plan first. Do not edit files unless I approve.\n\n${draft.prompt}`
          : draft.prompt,
        draft.attachments,
      );
      const input = [
        {
          type: "text",
          text: promptText,
          text_elements: [],
        },
        ...draft.attachments
          .filter((attachment) => attachment.kind === "image")
          .map((attachment) => ({
            type: "localImage",
            path: attachment.path,
          })),
      ];
      let response: { turn: Turn };
      try {
        response = await startTurn(targetThread, project, draft.settings, input);
      } catch (error) {
        if (!isStaleThreadError(error)) throw error;
        forgetThread(targetThread.id);
        const replacementThread = await startThread(project, draft.settings);
        if (!replacementThread) {
          throw new Error("Could not create a replacement chat thread.");
        }
        targetThread = replacementThread;
        response = await startTurn(targetThread, project, draft.settings, input);
      }
      inFlightDraftsRef.current.set(response.turn.id, {
        ...draft,
        localDraftProjectId: null,
      });
      setRunningTurnId(response.turn.id);
      activeThreadIdRef.current = targetThread.id;
      justStartedThreadIdRef.current = targetThread.id;
      if (draft.localDraftProjectId) {
        setChatDrafts((current) => {
          const next = { ...current };
          delete next[draft.localDraftProjectId ?? ""];
          return next;
        });
        setActiveDraftProjectId((current) =>
          current === draft.localDraftProjectId ? null : current,
        );
      }
      if (options.clearComposer || sendingLocalDraft) {
        setComposerText("");
        setAttachments([]);
      }
      const targetThreadWithTurn = {
        ...targetThread,
        turns: ensureTurn(targetThread.turns, response.turn),
      };
      threadsRef.current = {
        ...threadsRef.current,
        [targetThread.id]: targetThreadWithTurn,
      };
      setThreads((current) => ({
        ...current,
        [targetThread.id]: targetThreadWithTurn,
      }));
      setDesktop((current) => ({
        ...current,
        activeProjectId: project.id,
        activeThreadId: targetThread.id,
        projects: current.projects.map((stored) =>
          stored.id === project.id
            ? { ...stored, lastActiveThreadId: targetThread.id }
            : stored,
        ),
      }));
      void pollTurnUntilSettled(
        targetThread.id,
        response.turn.id,
        project.path,
      );
    } catch (error) {
      setRetryDraft(draft);
      setSendError(sendFailureMessage(error));
      setRunningTurnId(null);
      justStartedThreadIdRef.current = null;
    }
  }

  async function startTurn(
    targetThread: Thread,
    project: Project,
    settings: ProjectSettings,
    input: Array<Record<string, unknown>>,
  ) {
    return withRequestTimeout(
      client.request<{ turn: Turn }>("turn/start", {
        threadId: targetThread.id,
        cwd: project.path,
        input,
        approvalPolicy: settings.approvalPolicy,
        sandboxPolicy: sandboxPolicyFor(settings.sandbox, project.path),
        model: settings.model,
        effort: settings.effort,
        serviceTier: settings.serviceTier,
      }),
      20000,
      "Codex did not acknowledge this message. Check the backend status and retry.",
    );
  }

  async function cancelRun() {
    if (!activeThread || !runningTurnId) return;
    await client.request("turn/interrupt", {
      threadId: activeThread.id,
      turnId: runningTurnId,
    });
  }

  async function rollbackChat() {
    if (!activeThread) return;
    const response = await client.request<{ thread: Thread }>(
      "thread/rollback",
      {
        threadId: activeThread.id,
        numTurns: 1,
      },
    );
    setThreads((current) => ({
      ...current,
      [response.thread.id]: response.thread,
    }));
  }

  async function reviewChanges() {
    if (!activeThread) return;
    const response = await client.request<{ turn: Turn }>("review/start", {
      threadId: activeThread.id,
    });
    setRunningTurnId(response.turn.id);
  }

  function addProjectFromPath(pathValue: string) {
    const path = pathValue.trim();
    if (!path) return;
    const existing = desktop.projects.find((project) =>
      sameRuntimePath(project.path, path),
    );
    const project = existing ?? createProject(path, desktop.projects.length);
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      projects: existing ? current.projects : [...current.projects, project],
      activeThreadId: existing?.lastActiveThreadId ?? null,
    }));
    setActionError(null);
    setProjectPath("");
    return true;
  }

  function addProject() {
    addProjectFromPath(projectPath);
  }

  async function pickProjectFolder() {
    const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
    if (!invoke) {
      setActionError("Use the folder path field in this browser build.");
      return false;
    }
    try {
      const path = await invoke<string | null>("pick_folder");
      if (!path) return false;
      return Boolean(addProjectFromPath(path));
    } catch (error) {
      setActionError(`Could not open the folder picker: ${errorMessage(error)}`);
      return false;
    }
  }

  function updateProject(
    projectId: string,
    updater: (project: Project) => Project,
  ) {
    setDesktop((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId ? updater(project) : project,
      ),
    }));
  }

  function renameProject(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setActionError("Project name cannot be empty.");
      return;
    }
    updateProject(projectId, (project) => ({ ...project, name: trimmed }));
    setActionError(null);
  }

  function removeProject(projectId: string) {
    const project = desktop.projects.find((item) => item.id === projectId);
    const removedThreadIds = new Set(
      project
        ? Object.values(threads)
            .filter((thread) => sameRuntimePath(thread.cwd, project.path))
            .map((thread) => thread.id)
        : [],
    );
    setChatDrafts((current) => {
      if (!(projectId in current)) return current;
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    setActiveDraftProjectId((current) => (current === projectId ? null : current));
    setThreads((current) => {
      if (removedThreadIds.size === 0) return current;
      const next = { ...current };
      for (const threadId of removedThreadIds) delete next[threadId];
      return next;
    });
    setTokenUsageByThread((current) => {
      if (removedThreadIds.size === 0) return current;
      const next = { ...current };
      for (const threadId of removedThreadIds) delete next[threadId];
      return next;
    });
    setDesktop((current) => {
      const remainingProjects = current.projects.filter(
        (item) => item.id !== projectId,
      );
      const nextActiveProject =
        current.activeProjectId === projectId
          ? remainingProjects
              .filter((item) => !item.hidden && !item.archived)
              .sort(
                (a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order,
              )[0] ?? null
          : null;
      return {
        ...current,
        projects: remainingProjects,
        activeProjectId:
          current.activeProjectId === projectId
            ? (nextActiveProject?.id ?? null)
            : current.activeProjectId,
        activeThreadId:
          current.activeProjectId === projectId
            ? (nextActiveProject?.lastActiveThreadId ?? null)
            : current.activeThreadId,
        expandedProjectIds: current.expandedProjectIds.filter(
          (id) => id !== projectId,
        ),
        pinnedThreadIds: current.pinnedThreadIds.filter(
          (id) => !removedThreadIds.has(id),
        ),
      };
    });
    setActionError(null);
    setRetryDraft(null);
  }

  async function archiveProjectChats(project: Project) {
    const threadIds = sortThreadsForProject(project).map((thread) => thread.id);
    if (threadIds.length === 0) {
      setActionError("There are no visible chats to archive for this project.");
      return;
    }
    const archivedIds = new Set(threadIds);
    try {
      setActionError(null);
      await Promise.all(
        threadIds.map((threadId) =>
          client.request("thread/archive", { threadId }),
        ),
      );
      setThreads((current) => {
        const next = { ...current };
        for (const threadId of archivedIds) delete next[threadId];
        return next;
      });
      setTokenUsageByThread((current) => {
        const next = { ...current };
        for (const threadId of archivedIds) delete next[threadId];
        return next;
      });
      setDesktop((current) => ({
        ...current,
        activeThreadId: archivedIds.has(current.activeThreadId ?? "")
          ? null
          : current.activeThreadId,
        pinnedThreadIds: current.pinnedThreadIds.filter(
          (id) => !archivedIds.has(id),
        ),
        projects: current.projects.map((item) =>
          item.id === project.id || archivedIds.has(item.lastActiveThreadId ?? "")
            ? { ...item, lastActiveThreadId: null }
            : item,
        ),
      }));
      if (archivedIds.has(desktop.activeThreadId ?? "")) {
        setRunningTurnId(null);
        setRetryDraft(null);
      }
      await refreshThreads(project.path);
    } catch (error) {
      setActionError(`Could not archive project chats: ${errorMessage(error)}`);
    }
  }

  function togglePinnedThread(threadId: string) {
    setDesktop((current) => {
      const pinned = new Set(current.pinnedThreadIds);
      if (pinned.has(threadId)) {
        pinned.delete(threadId);
      } else {
        pinned.add(threadId);
      }
      return { ...current, pinnedThreadIds: Array.from(pinned) };
    });
  }

  function toggleProjectExpanded(projectId: string) {
    setDesktop((current) => {
      const expanded = new Set(current.expandedProjectIds);
      if (expanded.has(projectId)) {
        expanded.delete(projectId);
      } else {
        expanded.add(projectId);
      }
      return { ...current, expandedProjectIds: Array.from(expanded) };
    });
  }

  function beginInspectorResize(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = desktop.layout.inspectorWidth;
    const shellBounds = shellRef.current?.getBoundingClientRect();
    const maxWidth = maxInspectorWidthForShell(
      Math.round(shellBounds?.width ?? window.innerWidth),
    );

    function handlePointerMove(pointerEvent: globalThis.PointerEvent) {
      const nextWidth = Math.round(
        clamp(
          startWidth + startX - pointerEvent.clientX,
          INSPECTOR_MIN_WIDTH,
          maxWidth,
        ),
      );
      setDesktop((current) => ({
        ...current,
        layout: { ...current.layout, inspectorWidth: nextWidth },
      }));
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.classList.remove("resizing-inspector");
    }

    document.body.classList.add("resizing-inspector");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function updateActiveSettings(patch: Partial<ProjectSettings>) {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      settings: { ...project.settings, ...patch },
    }));
    if (patch.planMode === true) {
      selectProjectCanvas(activeProject);
    }
  }

  async function logoutAccount() {
    if (!client.connected) {
      setActionError("Codex is not connected. Try again after it reconnects.");
      return;
    }
    setActionError(null);
    try {
      await client.request("account/logout");
      await refreshSettings(activeProject?.path ?? null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  }

  function addAttachmentPaths(paths: string[]) {
    const cleanPaths = paths.map((path) => path.trim()).filter(Boolean);
    if (cleanPaths.length === 0) return;
    if (!activeProject) {
      setSendError("Select a local project before adding files.");
      return;
    }
    const nextAttachments = cleanPaths.map((path) =>
      classifyAttachment(path, activeProject),
    );
    setAttachments((current) => {
      const existing = new Set(current.map((attachment) => attachment.id));
      const additions = nextAttachments.filter(
        (attachment) => !existing.has(attachment.id),
      );
      return additions.length === 0 ? current : [...current, ...additions];
    });
    if (
      nextAttachments.some((attachment) => attachment.status === "unsupported")
    ) {
      setSendError("Remove unsupported files before sending.");
    } else if (sendError && !isUnsupportedAttachmentError(sendError)) {
      setSendError(null);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const next = current.filter((item) => item.id !== id);
      if (
        unsupportedAttachments(next).length === 0 &&
        isUnsupportedAttachmentError(sendError)
      ) {
        setSendError(null);
      }
      return next;
    });
  }

  function answerApproval(approval: PendingApproval, accepted: boolean) {
    if (approval.method === "item/commandExecution/requestApproval") {
      client.respond(approval.id, {
        decision: accepted ? "accept" : "decline",
      });
    } else if (approval.method === "item/fileChange/requestApproval") {
      client.respond(approval.id, {
        decision: accepted ? "accept" : "decline",
      });
    } else if (approval.method === "item/permissions/requestApproval") {
      client.respond(approval.id, {
        permissions: accepted ? (approval.params.permissions ?? {}) : {},
        scope: "turn",
      });
    } else {
      client.reject(
        approval.id,
        -32000,
        accepted ? "Unsupported approval type" : "Declined",
      );
    }
    setPendingApprovals((current) =>
      current.filter((item) => item.id !== approval.id),
    );
    setInspector({ type: "empty" });
  }

  function forgetThread(threadId: string, message?: string) {
    setThreads((current) => {
      const next = { ...current };
      delete next[threadId];
      return next;
    });
    setTokenUsageByThread((current) => {
      if (!(threadId in current)) return current;
      const next = { ...current };
      delete next[threadId];
      return next;
    });
    setDesktop((current) => ({
      ...current,
      activeThreadId:
        current.activeThreadId === threadId ? null : current.activeThreadId,
      projects: current.projects.map((project) =>
        project.lastActiveThreadId === threadId
          ? { ...project, lastActiveThreadId: null }
          : project,
      ),
    }));
    setRunningTurnId(null);
    setRetryDraft(null);
    if (message) setSendError(message);
  }

  async function pollTurnUntilSettled(
    threadId: string,
    turnId: string,
    cwd: string,
  ) {
    const pollKey = `${threadId}:${turnId}`;
    if (turnPollsRef.current.has(pollKey)) return;
    turnPollsRef.current.add(pollKey);
    try {
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await wait(1500);
        let thread: Thread | null = null;
        try {
          thread = await syncThread(threadId);
        } catch (error) {
          if (isStaleThreadError(error)) continue;
          throw error;
        }
        const turn = thread?.turns.find((candidate) => candidate.id === turnId);
        if (turn && turn.status !== "inProgress") {
          setRunningTurnId((current) => (current === turnId ? null : current));
          handleTurnCompleted(threadId, turn);
          await refreshThreads(cwd);
          if (justStartedThreadIdRef.current === threadId) {
            justStartedThreadIdRef.current = null;
          }
          return;
        }
      }
      setRunningTurnId((current) => (current === turnId ? null : current));
      if (inFlightDraftsRef.current.has(turnId)) {
        setSendError(
          "Codex started this turn, but the app did not receive a completion update. Refresh the chat or retry.",
        );
      }
    } catch (error) {
      console.error("Failed to reconcile Codex turn", error);
      setRunningTurnId((current) => (current === turnId ? null : current));
      if (justStartedThreadIdRef.current === threadId) {
        justStartedThreadIdRef.current = null;
      }
      if (inFlightDraftsRef.current.has(turnId)) {
        setSendError(
          "Codex started this turn, but the app could not refresh its status. Check the backend logs and retry.",
        );
      }
    } finally {
      turnPollsRef.current.delete(pollKey);
    }
  }

  const threadsByProject = useMemo(() => {
    const groups = new Map<string, Thread[]>();
    for (const project of visibleProjects) {
      groups.set(project.id, sortThreadsForProject(project));
    }
    return groups;
  }, [desktop.pinnedThreadIds, threads, visibleProjects]);

  const projectThreadGroups = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    return visibleProjects
      .map((project): ProjectThreadGroup | null => {
        const projectThreads = threadsByProject.get(project.id) ?? [];
        const draft = visibleDraftForProject(chatDrafts[project.id], activeDraftProjectId);
        if (!query) return { project, threads: projectThreads, draft };
        const projectMatches =
          project.name.toLowerCase().includes(query) ||
          project.path.toLowerCase().includes(query);
        const matchingThreads = projectThreads.filter((thread) =>
          threadTitle(thread).toLowerCase().includes(query),
        );
        const draftMatches =
          draft &&
          ("new chat".includes(query) ||
            draft.text.toLowerCase().includes(query) ||
            draft.attachments.some((attachment) =>
              attachment.name.toLowerCase().includes(query),
            ));
        if (
          !projectMatches &&
          matchingThreads.length === 0 &&
          !draftMatches
        )
          return null;
        return {
          project,
          threads: projectMatches ? projectThreads : matchingThreads,
          draft: projectMatches || draftMatches ? draft : null,
        };
      })
      .filter((group): group is ProjectThreadGroup => group !== null);
  }, [activeDraftProjectId, chatDrafts, threadSearch, threadsByProject, visibleProjects]);

  const projectThreads = activeProject
    ? (threadsByProject.get(activeProject.id) ?? [])
    : [];
  const canvasProject =
    activeCanvasProjectId
      ? (desktop.projects.find((project) => project.id === activeCanvasProjectId) ??
        null)
      : null;
  const selectedCanvas = canvasProject
    ? (desktop.canvases[canvasProject.id] ?? createProjectCanvas(canvasProject))
    : null;
  const canvasReadOnly = canvasProject
    ? (threadsByProject.get(canvasProject.id) ?? []).some(
        (thread) => thread.status.type === "active",
      )
    : false;

  return (
    <div
      ref={shellRef}
      className={`app-shell ${
        desktop.layout.inspectorOpen ? "inspector-open" : "inspector-closed"
      } ${sidebarDrawerMode ? "sidebar-drawer-mode" : ""} ${
        sidebarDrawerOpen ? "sidebar-drawer-open" : ""
      } ${chatPhoneLayout ? "chat-phone-layout" : ""}`}
      style={
        {
          "--inspector-width": `${desktop.layout.inspectorWidth}px`,
          "--inspector-min-width": `${INSPECTOR_MIN_WIDTH}px`,
        } as CSSProperties
      }
    >
      <ProjectSidebar
        activeProject={activeProject}
        activeDraftProjectId={activeDraftProjectId}
        activeThreadId={desktop.activeThreadId}
        connectionStatus={connectionStatus}
        connectionError={connectionError}
        onAddProject={addProject}
        onPickProjectFolder={pickProjectFolder}
        onConnect={() => void connect()}
        onLogout={logoutAccount}
        onProjectPathChange={setProjectPath}
        onArchiveProjectChats={(project) => void archiveProjectChats(project)}
        onArchiveThread={(threadId, project) => void archiveThread(threadId, project)}
        onRenameThread={(threadId, name) => void renameThread(threadId, name)}
        onRemoveProject={removeProject}
        onRenameProject={renameProject}
        onSelectProject={(project) =>
          {
            setSidebarDrawerOpen(false);
            setActionError(null);
            setRetryDraft(null);
            setActiveDraftProjectId(null);
            setInspector((current) =>
              current.type === "canvas"
                ? { type: "canvas", projectId: project.id }
                : { type: "empty" },
            );
            inspectorRetargetThreadIdRef.current = project.lastActiveThreadId;
            setComposerText("");
            setAttachments([]);
            setDesktop((current) => ({
              ...current,
              activeProjectId: project.id,
              activeThreadId: project.lastActiveThreadId,
            }));
          }
        }
        onSelectThread={(threadId, project) => {
          setSidebarDrawerOpen(false);
          void readThread(threadId, project);
        }}
        onStartThread={(project) => {
          setSidebarDrawerOpen(false);
          void createNewChat(project);
        }}
        onSelectDraft={(project) => {
          setSidebarDrawerOpen(false);
          selectLocalDraft(project);
        }}
        onThreadSearchChange={setThreadSearch}
        onTogglePinnedThread={togglePinnedThread}
        onToggleProjectExpanded={toggleProjectExpanded}
        actionError={actionError}
        expandedProjectIds={desktop.expandedProjectIds}
        pinnedThreadIds={desktop.pinnedThreadIds}
        projectPath={projectPath}
        projectThreadGroups={projectThreadGroups}
        runtime={runtimeInfo}
        snapshot={snapshot}
        threadSearch={threadSearch}
        updateProject={updateProject}
      />
      <button
        type="button"
        className="sidebar-scrim"
        aria-label="Close sidebar"
        onClick={() => setSidebarDrawerOpen(false)}
      />

      <main className="workspace">
        <WorkspaceHeader
          activeProject={activeProject}
          activeCanvasSelected={Boolean(activeCanvasProjectId)}
          activeThread={activeThread}
          hasActiveProject={Boolean(activeProject)}
          connectionStatus={connectionStatus}
          connectionError={connectionError}
          inspectorOpen={desktop.layout.inspectorOpen}
          onOpenCanvas={() => selectProjectCanvas()}
          onOpenSidebar={() => setSidebarDrawerOpen(true)}
          onToggleInspector={() => {
            const tooNarrow = window.matchMedia(
              INSPECTOR_AUTO_COLLAPSE_QUERY,
            ).matches;
            setDesktop((current) => ({
              ...current,
              layout: {
                ...current.layout,
                inspectorOpen: tooNarrow
                  ? false
                  : !current.layout.inspectorOpen,
              },
            }));
          }}
        />

        <section className="chat-pane">
          <ChatThread
            activeProject={activeProject}
            activeDraft={activeDraft}
            activeThread={activeThread}
            onSelect={selectInspector}
          />
        </section>

        <Composer
          attachments={attachments}
          canSend={
            connectionStatus === "connected" &&
            Boolean(activeProject) &&
            !runningTurnId &&
            promptReady &&
            unsupportedAttachments(attachments).length === 0 &&
            pendingApprovals.length === 0
          }
          canRetry={Boolean(retryDraft) && !runningTurnId}
          contextUsage={activeContextUsage}
          currentSettings={currentSettings}
          modelDisplay={resolveModelDisplay(snapshot, currentSettings)}
          models={snapshot.models}
          onAddAttachmentPaths={addAttachmentPaths}
          onAttachmentError={setSendError}
          onCancel={cancelRun}
          onRemoveAttachment={removeAttachment}
          onRetry={() => void retryPrompt()}
          onSend={sendPrompt}
          onSettingsChange={updateActiveSettings}
          pendingApprovals={pendingApprovals}
          running={Boolean(runningTurnId)}
          sendDisabledReason={sendDisabledReason}
          sendError={sendError}
          text={composerText}
          onTextChange={(value) => {
            setComposerText(value);
            if (sendError) setSendError(null);
          }}
        />

      </main>

      {desktop.layout.inspectorOpen && (
        <Inspector
          approvals={pendingApprovals}
          documentError={documentError}
          documentText={documentText}
          fileChanges={fileChangeItems}
          activeProject={activeProject}
          activeThread={activeThread}
          canvas={selectedCanvas}
          canvasProject={canvasProject}
          canvasReadOnly={canvasReadOnly}
          onAnswerApproval={answerApproval}
          onOpenDocument={(path) => selectInspector({ type: "document", path })}
          onResizePointerDown={beginInspectorResize}
          onReviewChanges={() => void reviewChanges()}
          onRollback={() => void rollbackChat()}
          onSelect={selectInspector}
          onUpdateCanvas={updateProjectCanvas}
          selection={inspector}
          activeTurn={activeTurn(activeThread)}
        />
      )}
    </div>
  );
}

function sendBlockReason(args: {
  activeProject: Project | null;
  connectionStatus: string;
  hasUnsupportedAttachments: boolean;
  pendingApprovals: PendingApproval[];
  promptReady: boolean;
  runningTurnId: string | null;
}) {
  if (args.connectionStatus !== "connected") {
    return "Codex is still connecting. Try again when the status says Connected.";
  }
  if (!args.activeProject) return "Add or select a local project before sending.";
  if (args.runningTurnId) return "Codex is already working on this chat.";
  if (args.pendingApprovals.length > 0) {
    return "Answer the pending approval before sending another message.";
  }
  if (args.hasUnsupportedAttachments) return "Remove unsupported files before sending.";
  if (!args.promptReady) return "Type a message to send.";
  return null;
}

function visibleDraftForProject(
  draft: LocalChatDraft | undefined,
  activeDraftProjectId: string | null,
) {
  if (!draft) return null;
  return draft.projectId === activeDraftProjectId || hasDraftContent(draft)
    ? draft
    : null;
}

function firstMarkdownChangeSelection(
  thread: Thread | null,
  project: Project | null,
): InspectorSelection {
  if (!thread || !project) return { type: "empty" };
  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (item.type !== "fileChange") continue;
      for (const change of item.changes) {
        if (!isMarkdownPath(change.path)) continue;
        return {
          type: "document",
          path: documentPath(change.path, project),
          title: friendlyPath(change.path, project),
        };
      }
    }
  }
  return { type: "empty" };
}

function sameInspectorSelection(
  left: InspectorSelection,
  right: InspectorSelection,
) {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case "document":
      return (
        right.type === "document" &&
        left.path === right.path &&
        left.title === right.title
      );
    case "fileChange":
      return right.type === "fileChange" && left.item.id === right.item.id;
    case "command":
      return right.type === "command" && left.item.id === right.item.id;
    case "approval":
      return right.type === "approval" && left.approval.id === right.approval.id;
    case "canvas":
      return right.type === "canvas" && left.projectId === right.projectId;
    case "empty":
      return true;
  }
}

function preferredCanvasInspectorWidth() {
  if (typeof window === "undefined") return 620;
  return Math.min(
    maxInspectorWidthForShell(window.innerWidth),
    Math.max(560, Math.round(window.innerWidth * 0.55)),
  );
}

function maxInspectorWidthForShell(shellWidth: number) {
  return Math.max(INSPECTOR_MIN_WIDTH, shellWidth - CHAT_MIN_WIDTH);
}

function sidebarWidthForShell(shellWidth: number) {
  if (shellWidth <= 1240) {
    return clamp(shellWidth * 0.22, 236, 280);
  }
  return clamp(shellWidth * 0.17, 248, 304);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isMarkdownPath(path: string) {
  return /\.(md|mdx|markdown)$/i.test(path);
}

function documentPath(path: string, activeProject: Project) {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
  return `${activeProject.path.replace(/[\\/]$/, "")}/${path}`;
}

function friendlyPath(path: string, activeProject: Project) {
  const projectPath = activeProject.path.replace(/\\/g, "/").replace(/\/$/, "");
  return path
    .replace(new RegExp(escapeRegExp(projectPath), "g"), ".")
    .replace(/^\.\//, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sendFailureMessage(error: unknown) {
  const message = errorMessage(error);
  if (message.includes("AbsolutePathBuf")) {
    return "Codex could not use that project path with the current WSL runtime. Re-add the folder with a /mnt/c/... path or restart so the saved path can be normalized.";
  }
  if (message.includes("thread not found")) {
    return "That saved chat is no longer available. Send again to start a fresh chat.";
  }
  if (message.includes("Not connected")) {
    return "Codex is not connected to app-server yet. Retry after it reconnects.";
  }
  return `Send failed: ${message}`;
}

type ModelDisplay = {
  label: string;
  title: string;
  tone: "ready" | "loading" | "error";
};

function resolveModelDisplay(
  snapshot: AppServerSnapshot,
  settings: ProjectSettings,
): ModelDisplay {
  if (settings.model) {
    return {
      label: modelDisplayName(snapshot, settings.model),
      title: "Selected for this project",
      tone: "ready",
    };
  }

  if (snapshot.modelsError || snapshot.configError) {
    return {
      label: "Model unavailable",
      title: snapshot.modelsError ?? snapshot.configError ?? "Model unavailable",
      tone: "error",
    };
  }

  if (!snapshot.config) {
    return {
      label: "Loading model...",
      title: "Reading model settings",
      tone: "loading",
    };
  }

  const configuredModel = configModel(snapshot.config);
  if (configuredModel) {
    return {
      label: modelDisplayName(snapshot, configuredModel),
      title: "Using the model from Codex settings",
      tone: "ready",
    };
  }

  return {
    label: "Auto model",
    title: "Codex will choose the configured default model",
    tone: "ready",
  };
}

function modelDisplayName(snapshot: AppServerSnapshot, modelId: string) {
  return (
    snapshot.models.find((model) => model.model === modelId)?.displayName ??
    modelId
  );
}

function configModel(config: unknown) {
  if (!config || typeof config !== "object") return null;
  const maybeConfig = "config" in config ? config.config : null;
  if (!maybeConfig || typeof maybeConfig !== "object") return null;
  const model = "model" in maybeConfig ? maybeConfig.model : null;
  return typeof model === "string" && model.length > 0 ? model : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isUnsupportedAttachmentError(error: string | null) {
  if (!error) return false;
  const message = error.toLowerCase();
  return message.includes("unsupported") || message.includes("not supported");
}

function isKnownThreadForCwd(
  threads: ThreadMap,
  threadId: string,
  cwd: string | null,
) {
  const thread = threads[threadId];
  return Boolean(thread && cwd && sameRuntimePath(thread.cwd, cwd));
}

function isThreadNotFound(error: unknown) {
  return errorMessage(error).includes("thread not found");
}

function isStaleThreadError(error: unknown) {
  return isThreadNotFound(error) || isThreadNotMaterialized(error);
}

function isThreadNotMaterialized(error: unknown) {
  const message = errorMessage(error);
  return (
    message.includes("no rollout found") ||
    message.includes("not materialized yet") ||
    message.includes("includeTurns is unavailable")
  );
}

function withRequestTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
