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
import { CanvasSuggestionReview, ChatThread } from "./components/ChatThread";
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
import {
  CANVAS_GRID_UNIT,
  CANVAS_NORMALIZED_UNITS,
  CANVAS_WORLD_HEIGHT,
  CANVAS_WORLD_WIDTH,
  cloneProjectCanvas,
  createProjectCanvas,
  gridRectFromCanvasRect,
  normalizedRectFromCanvasRect,
} from "./canvasState";
import {
  CANVAS_PROPOSAL_PARSER_VERSION,
  applyCanvasProposalText,
  finalizeAcceptedCanvasProposal,
} from "./canvasProposal";
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
  CanvasBounds,
  CanvasGroup,
  CanvasItem,
  CanvasPage,
  CanvasSuggestion,
  ComposerAttachment,
  ComposerCanvasContext,
  ComposerCanvasContextOption,
  ComposerContextReference,
  DesktopState,
  InspectorSelection,
  LocalChatDraft,
  PendingApproval,
  PlanCanvasStatus,
  PlanProposal,
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
  contexts: ComposerContextReference[];
  createdAt: number;
  localDraftProjectId?: string | null;
  targetThreadId?: string | null;
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
  const [composerContexts, setComposerContexts] = useState<
    ComposerContextReference[]
  >([]);
  const [projectPath, setProjectPath] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryDraft, setRetryDraft] = useState<SubmissionDraft | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved">("saved");
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
  const runningTurnIdRef = useRef<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const threadSelectionVersionRef = useRef(0);
  const justStartedThreadIdRef = useRef<string | null>(null);
  const turnPollsRef = useRef<Set<string>>(new Set());
  const inFlightDraftsRef = useRef<Map<string, SubmissionDraft>>(new Map());
  const inspectorRetargetThreadIdRef = useRef<string | null>(null);
  const planModeOpenedCanvasProjectIdRef = useRef<string | null>(null);
  const desktopRef = useRef(desktop);

  const activeProject = useMemo(
    () =>
      desktop.projects.find(
        (project) => project.id === desktop.activeProjectId,
      ) ?? null,
    [desktop.activeProjectId, desktop.projects],
  );
  const activeCanvasProjectId =
    inspector.type === "canvas" ||
    inspector.type === "canvasProposal" ||
    inspector.type === "canvasSuggestion"
      ? inspector.projectId
      : null;
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
  const activePendingCanvasSuggestion = activeThread
    ? [...activeThread.turns]
        .reverse()
        .map((turn) => desktop.canvasSuggestions[turn.id])
        .find((suggestion) => suggestion?.status === "pending") ?? null
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
  const promptReady =
    composerText.trim().length > 0 || composerContexts.length > 0;
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

  useEffect(() => {
    setDesktop((current) => {
      let nextPlanProposals = current.planProposals;
      let nextCanvasSuggestions = current.canvasSuggestions;
      let changed = false;
      for (const proposal of Object.values(current.planProposals)) {
        if (
          !proposal.canvasBaseSnapshot ||
          (proposal.canvasProposalParseStatus !== "pending" &&
            (proposal.canvasProposalParserVersion ?? 0) >=
              CANVAS_PROPOSAL_PARSER_VERSION)
        ) {
          continue;
        }
        const turn = threads[proposal.threadId]?.turns.find(
          (candidate) => candidate.id === proposal.turnId,
        );
        if (!turn || turn.status === "inProgress") continue;
        const finalText = finalAgentText(turn);
        if (!finalText.trim()) continue;
        const parsedProposal = parseCanvasProposalForPlan(proposal, finalText);
        if (parsedProposal === proposal) continue;
        if (!changed) nextPlanProposals = { ...current.planProposals };
        nextPlanProposals[proposal.turnId] = parsedProposal;
        changed = true;
      }
      for (const suggestion of Object.values(current.canvasSuggestions)) {
        if (
          !suggestion.canvasBaseSnapshot ||
          suggestion.status !== "pending" ||
          (suggestion.canvasProposalParseStatus !== "pending" &&
            (suggestion.canvasProposalParserVersion ?? 0) >=
              CANVAS_PROPOSAL_PARSER_VERSION)
        ) {
          continue;
        }
        const turn = threads[suggestion.threadId]?.turns.find(
          (candidate) => candidate.id === suggestion.turnId,
        );
        if (!turn || turn.status === "inProgress") continue;
        const finalText = finalAgentText(turn);
        if (!finalText.trim()) continue;
        const parsedSuggestion = parseCanvasSuggestionForTurn(
          suggestion,
          finalText,
        );
        if (parsedSuggestion === suggestion) continue;
        if (!changed) {
          nextPlanProposals = { ...current.planProposals };
          nextCanvasSuggestions = { ...current.canvasSuggestions };
        } else if (nextCanvasSuggestions === current.canvasSuggestions) {
          nextCanvasSuggestions = { ...current.canvasSuggestions };
        }
        nextCanvasSuggestions[suggestion.turnId] = parsedSuggestion;
        changed = true;
      }
      return changed
        ? {
            ...current,
            planProposals: nextPlanProposals,
            canvasSuggestions: nextCanvasSuggestions,
          }
        : current;
    });
  }, [threads]);

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
            (runningTurnIdRef.current &&
            current.activeThreadId &&
            isKnownThreadForCwd(threadsRef.current, current.activeThreadId, cwd)
              ? current.activeThreadId
              : null) ??
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

  useEffect(() => {
    desktopRef.current = desktop;
    setSaveStatus("saving");
    const timer = window.setTimeout(() => {
      saveDesktopState(desktop);
      setSaveStatus("saved");
    }, 250);
    return () => window.clearTimeout(timer);
  }, [desktop]);

  useEffect(() => {
    const flushState = () => saveDesktopState(desktopRef.current);
    window.addEventListener("beforeunload", flushState);
    window.addEventListener("pagehide", flushState);
    return () => {
      window.removeEventListener("beforeunload", flushState);
      window.removeEventListener("pagehide", flushState);
    };
  }, []);

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
    setInspector((current) => {
      if (current.type !== "canvas") return current;
      if (!desktop.activeProjectId) return { type: "empty" };
      return current.projectId === desktop.activeProjectId
        ? current
        : { type: "canvas", projectId: desktop.activeProjectId };
    });
  }, [desktop.activeProjectId]);

  useEffect(() => {
    runningTurnIdRef.current = runningTurnId;
  }, [runningTurnId]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    inspectorRetargetThreadIdRef.current = desktop.activeThreadId;
  }, [desktop.activeThreadId]);

  useEffect(() => {
    if (inspectorRetargetThreadIdRef.current !== desktop.activeThreadId) return;
    if (runningTurnIdRef.current) return;
    if (desktop.activeThreadId && !activeThread) return;
    if (activeThread?.status.type === "notLoaded") return;
    setInspector((current) => {
      if (current.type === "canvas" || current.type === "canvasProposal") {
        return current;
      }
      return sameInspectorSelection(current, defaultInspectorSelection)
        ? current
        : defaultInspectorSelection;
    });
    inspectorRetargetThreadIdRef.current = null;
  }, [
    activeThread?.status.type,
    defaultInspectorSelection,
    desktop.activeThreadId,
    runningTurnId,
  ]);

  useEffect(() => {
    if (
      inspector.type !== "canvasProposal" &&
      inspector.type !== "canvasSuggestion"
    ) {
      return;
    }
    const record =
      inspector.type === "canvasProposal"
        ? desktop.planProposals[inspector.proposalTurnId]
        : desktop.canvasSuggestions[inspector.suggestionTurnId];
    if (record?.status === "pending" && record.canvasProposalSnapshot) return;
    inspectorRetargetThreadIdRef.current = null;
    setInspector({ type: "empty" });
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
  }, [desktop.canvasSuggestions, desktop.planProposals, inspector]);

  useEffect(() => {
    if (!activeDraftProjectId) return;
    setChatDrafts((current) => {
      const existing = current[activeDraftProjectId];
      const project = desktop.projects.find(
        (candidate) => candidate.id === activeDraftProjectId,
      );
      if (!existing && !project) return current;
      const base = existing ?? createChatDraft(project as Project);
      if (
        base.text === composerText &&
        base.attachments === attachments &&
        base.contexts === composerContexts
      ) {
        return current;
      }
      return {
        ...current,
        [activeDraftProjectId]: {
          ...base,
          text: composerText,
          attachments,
          contexts: composerContexts,
          updatedAt: Date.now(),
        },
      };
    });
  }, [
    activeDraftProjectId,
    attachments,
    composerContexts,
    composerText,
    desktop.projects,
  ]);

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
    capturePlanCanvasProposal(turn);
    captureCanvasSuggestion(turn);
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

  function capturePlanCanvasProposal(turn: Turn, retryCount = 0) {
    const finalText = finalAgentText(turn);
    if (!finalText.trim()) return;
    let shouldRetry = false;
    setDesktop((current) => {
      const proposal = current.planProposals[turn.id];
      if (!proposal?.canvasBaseSnapshot) {
        shouldRetry = retryCount < 8;
        return current;
      }
      return {
        ...current,
        planProposals: {
          ...current.planProposals,
          [turn.id]: parseCanvasProposalForPlan(proposal, finalText),
        },
      };
    });
    if (shouldRetry) {
      window.setTimeout(() => capturePlanCanvasProposal(turn, retryCount + 1), 100);
    }
  }

  function captureCanvasSuggestion(turn: Turn, retryCount = 0) {
    const finalText = finalAgentText(turn);
    if (!finalText.trim()) return;
    let shouldRetry = false;
    setDesktop((current) => {
      const suggestion = current.canvasSuggestions[turn.id];
      if (!suggestion?.canvasBaseSnapshot) {
        shouldRetry = retryCount < 8;
        return current;
      }
      return {
        ...current,
        canvasSuggestions: {
          ...current.canvasSuggestions,
          [turn.id]: parseCanvasSuggestionForTurn(suggestion, finalText),
        },
      };
    });
    if (shouldRetry) {
      window.setTimeout(() => captureCanvasSuggestion(turn, retryCount + 1), 100);
    }
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

  function closeInspectorPanel() {
    inspectorRetargetThreadIdRef.current = null;
    setInspector({ type: "empty" });
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
  }

  function toggleInspectorPanel() {
    const tooNarrow = window.matchMedia(INSPECTOR_AUTO_COLLAPSE_QUERY).matches;
    if (desktop.layout.inspectorOpen || tooNarrow) {
      closeInspectorPanel();
      return;
    }
    setDesktop((current) => ({
      ...current,
      layout: {
        ...current.layout,
        inspectorOpen: true,
      },
    }));
  }

  function selectProjectCanvas(
    project = activeProject,
    focusReference: string | null = null,
  ) {
    if (!project) {
      setActionError("Add or select a local project before opening Canvas.");
      return;
    }
    const preferredWidth = preferredCanvasInspectorWidth();
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector({
      type: "canvas",
      projectId: project.id,
      focusReference,
      focusRequestId: Date.now(),
    });
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

  function toggleProjectCanvas(project = activeProject) {
    if (
      project &&
      desktop.layout.inspectorOpen &&
      inspector.type === "canvas" &&
      inspector.projectId === project.id
    ) {
      planModeOpenedCanvasProjectIdRef.current = null;
      closeInspectorPanel();
      return;
    }
    planModeOpenedCanvasProjectIdRef.current = null;
    selectProjectCanvas(project);
  }

  function selectPlanProposalCanvas(
    proposal: PlanProposal,
    focusReference: string | null = null,
  ) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === proposal.projectId,
    );
    if (!project) {
      setSendError("That plan belongs to a project that is no longer available.");
      return;
    }
    if (!proposal.canvasProposalSnapshot) {
      setSendError("That plan does not have a Canvas proposal to open.");
      return;
    }
    if (proposal.status !== "pending") {
      setSendError("That plan proposal is no longer active.");
      return;
    }
    const preferredWidth = preferredCanvasInspectorWidth();
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector({
      type: "canvasProposal",
      projectId: project.id,
      proposalTurnId: proposal.turnId,
      focusReference,
      focusRequestId: Date.now(),
    });
    inspectorRetargetThreadIdRef.current = "canvas";
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      activeThreadId: proposal.threadId,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(current.layout.inspectorWidth, preferredWidth),
      },
    }));
  }

  function selectCanvasSuggestionCanvas(
    suggestion: CanvasSuggestion,
    focusReference: string | null = null,
  ) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === suggestion.projectId,
    );
    if (!project) {
      setSendError("That Canvas suggestion belongs to a project that is no longer available.");
      return;
    }
    if (!suggestion.canvasProposalSnapshot) {
      setSendError("That response does not have a Canvas suggestion to open.");
      return;
    }
    if (suggestion.status !== "pending") {
      setSendError("That Canvas suggestion is no longer active.");
      return;
    }
    const preferredWidth = preferredCanvasInspectorWidth();
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector({
      type: "canvasSuggestion",
      projectId: project.id,
      suggestionTurnId: suggestion.turnId,
      focusReference,
      focusRequestId: Date.now(),
    });
    inspectorRetargetThreadIdRef.current = "canvas";
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      activeThreadId: suggestion.threadId,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(current.layout.inspectorWidth, preferredWidth),
      },
    }));
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

  function updateCanvasSuggestionCanvas(
    suggestionTurnId: string,
    canvas: ProjectCanvas,
  ) {
    setDesktop((current) => {
      const suggestion = current.canvasSuggestions[suggestionTurnId];
      if (!suggestion) return current;
      const nextCanvas = cloneProjectCanvas({
        ...canvas,
        projectId: suggestion.projectId,
        updatedAt: Date.now(),
      });
      const nextParseStatus =
        suggestion.canvasProposalParseStatus === "none" ||
        suggestion.canvasProposalParseStatus === "pending"
          ? "parsed"
          : suggestion.canvasProposalParseStatus;
      return {
        ...current,
        canvasSuggestions: {
          ...current.canvasSuggestions,
          [suggestionTurnId]: {
            ...suggestion,
            canvasProposalSnapshot: nextCanvas,
            canvasProposalParseStatus: nextParseStatus,
            canvasProposalSummary:
              suggestion.canvasProposalChangeCount > 0
                ? suggestion.canvasProposalSummary
                : "Canvas suggestion edited manually.",
            updatedAt: Date.now(),
          },
        },
      };
    });
  }

  function updatePlanProposalCanvas(proposalTurnId: string, canvas: ProjectCanvas) {
    setDesktop((current) => {
      const proposal = current.planProposals[proposalTurnId];
      if (!proposal) return current;
      const nextCanvas = cloneProjectCanvas({
        ...canvas,
        projectId: proposal.projectId,
        updatedAt: Date.now(),
      });
      const nextParseStatus =
        proposal.canvasProposalParseStatus === "none" ||
        proposal.canvasProposalParseStatus === "pending"
          ? "parsed"
          : proposal.canvasProposalParseStatus;
      return {
        ...current,
        planProposals: {
          ...current.planProposals,
          [proposalTurnId]: {
            ...proposal,
            canvasProposalSnapshot: nextCanvas,
            canvasProposalParseStatus: nextParseStatus,
            canvasProposalSummary:
              proposal.canvasProposalChangeCount > 0
                ? proposal.canvasProposalSummary
                : "Canvas proposal edited manually.",
            updatedAt: Date.now(),
          },
        },
      };
    });
  }

  function addCanvasComposerContext(
    context: ComposerCanvasContext | null = null,
    project = activeProject,
  ) {
    if (!project) {
      setSendError("Select a local project before attaching Canvas.");
      return;
    }
    const nextContext =
      context ??
      ({
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: { kind: "project" },
      } satisfies ComposerCanvasContext);
    setComposerContexts((current) => {
      if (
        current.some(
          (candidate) =>
            candidate.type === "canvas" &&
            canvasContextIdentity(candidate) ===
              canvasContextIdentity(nextContext),
        )
      ) {
        return current;
      }
      return [
        ...current.filter((context) => context.type !== "canvas"),
        nextContext,
      ];
    });
    setSendError(null);
  }

  function removeComposerContext(context: ComposerContextReference) {
    setComposerContexts((current) =>
      current.filter(
        (candidate) =>
          candidate.type !== context.type ||
          canvasContextIdentity(candidate) !== canvasContextIdentity(context),
      ),
    );
  }

  function requestCurrentUiMockup(project: Project) {
    const prompt = [
      "Inspect this local project and generate a low-fidelity current UI Canvas mockup.",
      "",
      "Focus on UI that exists today. Do not design future UI and do not edit files.",
      "",
      "Return a short summary, then a parseable fenced ```canvas-proposal block. Use one line per visible UI piece, using create lines with state=current. Prefer grid coordinates when estimating placement.",
      "Use one Canvas page per distinct route or workflow. Use subPage when one route has meaningfully different states, such as empty chat, active chat, inspector open, auth OTP, onboarding, or settings tabs. Keep coordinates local to that sub-page.",
      "Use a compact screen-sketch grid for each subPage: x=0..36 and y=0..24. Keep important UI pieces readable inside that frame. Most panels should be 4..14 grid units wide, not page-sized.",
      "Do not create giant workspace/background/page-shell containers. The Canvas page and subPage already represent the screen frame. Output only visible UI pieces the user should review.",
      "",
      'Example: create container title="Main chat" state=current page="Page 1" grid=2,2,12,18 label="Current chat area" noteForCodex="Existing primary conversation surface."',
      'Example: create container title="Active chat" state=current page="Page 1" subPage="Active" grid=2,2,12,18 label="Thread with messages"',
      'Example: create button title="Send" state=current page="Page 1" grid=15,19,1.5,1.5 label="Send"',
      "",
      "Use Page 1, Page 2, etc. unless the project has obvious named screens. Keep the mockup simple and reviewable; omit uncertain internals rather than inventing them.",
    ].join("\n");
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setActiveDraftProjectId(project.id);
    setComposerText(prompt);
    setAttachments([]);
    setComposerContexts([
      {
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: { kind: "project" },
      },
    ]);
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      activeThreadId:
        current.activeProjectId === project.id
          ? current.activeThreadId
          : project.lastActiveThreadId,
      projects: current.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              settings: {
              ...candidate.settings,
                planMode: false,
              },
            }
          : candidate,
      ),
    }));
  }

  function createChatDraft(project: Project, now = Date.now()): LocalChatDraft {
    return {
      id: `draft:${project.id}`,
      projectId: project.id,
      projectPath: project.path,
      text: "",
      attachments: [],
      contexts: [],
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
    setComposerContexts(draft.contexts ?? []);
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
    setComposerContexts([]);
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
      contexts: [...composerContexts],
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
    options: {
      clearComposer: boolean;
      retry?: boolean;
      desktopOverride?: DesktopState;
    },
  ) {
    const promptDesktop = options.desktopOverride ?? desktop;
    const project =
      promptDesktop.projects.find((candidate) => candidate.id === draft.projectId) ??
      activeProject;
    const blocked = sendBlockReason({
      activeProject: project,
      connectionStatus,
      hasUnsupportedAttachments: unsupportedAttachments(draft.attachments).length > 0,
      pendingApprovals,
      promptReady: Boolean(draft.prompt.trim()) || draft.contexts.length > 0,
      runningTurnId,
    });
    if (blocked) {
      setSendError(blocked);
      return false;
    }
    if (!project) return false;
    if (unsupportedAttachments(draft.attachments).length > 0) {
      setSendError("Remove unsupported files before sending.");
      return false;
    }
    const sendingLocalDraft =
      draft.localDraftProjectId === project.id && activeDraftProjectId === project.id;
    try {
      setSendError(null);
      if (!options.retry) setRetryDraft(null);
      const explicitThread = draft.targetThreadId
        ? (threadsRef.current[draft.targetThreadId] ??
          threads[draft.targetThreadId] ??
          null)
        : null;
      const candidateThread =
        explicitThread ??
        (sendingLocalDraft || promptDesktop.activeProjectId !== project.id
          ? null
          : activeThread);
      let targetThread = await threadForSend(
        project,
        candidateThread,
        draft.settings,
      );
      if (!targetThread) throw new Error("Could not create a chat thread.");
      const userPrompt =
        draft.prompt.trim() || "Use the attached project context.";
      const generatedMockupPrompt = isGeneratedCurrentUiMockupPrompt(userPrompt);
      const planCanvasContext = draft.settings.planMode
        ? canvasContextForPrompt(draft.contexts, promptDesktop, project, true)
        : null;
      const canvasSuggestionContext = !draft.settings.planMode
        ? generatedMockupPrompt
          ? generatedMockupCanvasContext(project)
          : canvasContextForPrompt(draft.contexts, promptDesktop, project, false)
        : null;
      const promptedWithCanvas = planCanvasContext
        ? promptWithPlanModeContext(userPrompt, planCanvasContext)
        : generatedMockupPrompt
          ? promptWithGeneratedMockupContext(userPrompt)
          : promptWithComposerContexts(
              userPrompt,
              draft.contexts,
              promptDesktop,
              project,
            );
      const promptText = promptWithInspectableFiles(
        promptedWithCanvas,
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
      if (planCanvasContext) {
        const now = Date.now();
        const proposal: PlanProposal = {
          id: `plan:${response.turn.id}`,
          projectId: project.id,
          threadId: targetThread.id,
          turnId: response.turn.id,
          prompt: userPrompt,
          contexts: draft.contexts,
          canvasStatus: planCanvasContext.status,
          canvasSummary: planCanvasContext.summary,
          canvasBaseSnapshot: planCanvasContext.snapshot,
          canvasProposalSnapshot: planCanvasContext.snapshot,
          canvasProposalParseStatus: planCanvasContext.snapshot
            ? "pending"
            : "none",
          canvasProposalParserVersion: 0,
          canvasProposalChangeCount: 0,
          canvasProposalSummary: planCanvasContext.snapshot
            ? "Canvas proposal snapshot waiting for the plan response."
            : "No Canvas snapshot for this plan.",
          canvasProposalErrors: [],
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        setDesktop((current) => ({
          ...current,
          planProposals: {
            ...supersedePendingPlanProposals(
              current.planProposals,
              targetThread.id,
              response.turn.id,
            ),
            [response.turn.id]: proposal,
          },
        }));
      } else if (canvasSuggestionContext?.snapshot) {
        const now = Date.now();
        const suggestion: CanvasSuggestion = {
          id: `canvas-suggestion:${response.turn.id}`,
          projectId: project.id,
          threadId: targetThread.id,
          turnId: response.turn.id,
          prompt: userPrompt,
          contexts: draft.contexts,
          canvasStatus: canvasSuggestionContext.status,
          canvasSummary: canvasSuggestionContext.summary,
          canvasBaseSnapshot: canvasSuggestionContext.snapshot,
          canvasProposalSnapshot: canvasSuggestionContext.snapshot,
          canvasProposalParseStatus: "pending",
          canvasProposalParserVersion: 0,
          canvasProposalChangeCount: 0,
          canvasProposalSummary:
            "Canvas suggestion snapshot waiting for the response.",
          canvasProposalErrors: [],
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };
        setDesktop((current) => ({
          ...current,
          canvasSuggestions: {
            ...current.canvasSuggestions,
            [response.turn.id]: suggestion,
          },
        }));
      }
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
        setComposerContexts([]);
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
        planProposals: planCanvasContext
          ? supersedePendingPlanProposals(
              current.planProposals,
              targetThread.id,
              response.turn.id,
            )
          : supersedePendingPlanProposals(
              current.planProposals,
              targetThread.id,
            ),
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
      return true;
    } catch (error) {
      setRetryDraft(draft);
      setSendError(sendFailureMessage(error));
      setRunningTurnId(null);
      justStartedThreadIdRef.current = null;
      return false;
    }
  }

  async function acceptPlanProposal(proposal: PlanProposal) {
    const latestProposal = desktop.planProposals[proposal.turnId] ?? proposal;
    const project =
      desktop.projects.find(
        (candidate) => candidate.id === latestProposal.projectId,
      ) ??
      activeProject;
    if (!project) {
      setSendError("That plan belongs to a project that is no longer available.");
      return;
    }
    const acceptedCanvas = latestProposal.canvasProposalSnapshot
      ? finalizeAcceptedCanvasProposal(
          latestProposal.canvasProposalSnapshot,
          latestProposal.canvasBaseSnapshot,
        )
      : null;
    const promotedDesktop = acceptedCanvas
      ? {
          ...desktop,
          canvases: {
            ...desktop.canvases,
            [project.id]: acceptedCanvas,
          },
        }
      : desktop;
    const accepted = await sendDraft(
      {
        prompt: "I accept this plan. Implement it now.",
        projectId: project.id,
        settings: {
          ...project.settings,
          planMode: false,
        },
        attachments: [],
        contexts: latestProposal.contexts,
        createdAt: Date.now(),
        localDraftProjectId: null,
        targetThreadId: latestProposal.threadId,
      },
      { clearComposer: false, desktopOverride: promotedDesktop },
    );
    if (!accepted) return;
    setDesktop((current) => ({
      ...current,
      canvases: acceptedCanvas
        ? {
            ...current.canvases,
            [project.id]: acceptedCanvas,
          }
        : current.canvases,
      planProposals: updatePlanProposalStatus(
        current.planProposals,
        latestProposal.turnId,
        "accepted",
        true,
      ),
      projects: current.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              settings: {
                ...candidate.settings,
                planMode: false,
              },
            }
          : candidate,
      ),
    }));
    setInspector((current) =>
      current.type === "canvasProposal" &&
      current.proposalTurnId === latestProposal.turnId
        ? { type: "canvas", projectId: project.id }
        : current,
    );
  }

  async function modifyPlanProposal(proposal: PlanProposal) {
    const latestProposal = desktop.planProposals[proposal.turnId] ?? proposal;
    const project = desktop.projects.find(
      (candidate) => candidate.id === latestProposal.projectId,
    );
    if (!project) {
      setSendError("That plan belongs to a project that is no longer available.");
      return;
    }
    const revisionSummary = canvasProposalDeltaSummary(
      latestProposal.canvasBaseSnapshot,
      latestProposal.canvasProposalSnapshot,
    );
    if (revisionSummary) {
      const sent = await sendDraft(
        {
          prompt: planProposalRevisionPrompt(latestProposal, revisionSummary),
          projectId: project.id,
          settings: {
            ...project.settings,
            planMode: true,
          },
          attachments: [],
          contexts: planProposalRevisionContexts(latestProposal, project),
          createdAt: Date.now(),
          localDraftProjectId: null,
          targetThreadId: latestProposal.threadId,
        },
        { clearComposer: true },
      );
      if (!sent) return;
      setDesktop((current) => ({
        ...current,
        planProposals: updatePlanProposalStatus(
          current.planProposals,
          latestProposal.turnId,
          "superseded",
          false,
        ),
        projects: current.projects.map((candidate) =>
          candidate.id === project.id
            ? {
                ...candidate,
                settings: {
                  ...candidate.settings,
                  planMode: true,
                },
              }
            : candidate,
        ),
      }));
      return;
    }
    setSendError(null);
    setActionError(null);
    setRetryDraft(null);
    setActiveDraftProjectId(null);
    setComposerText(planProposalRevisionPrompt(latestProposal, revisionSummary));
    setAttachments([]);
    setComposerContexts(planProposalRevisionContexts(latestProposal, project));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
    });
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      activeThreadId: latestProposal.threadId,
      projects: current.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              settings: {
                ...candidate.settings,
                planMode: true,
              },
            }
          : candidate,
      ),
    }));
  }

  function declinePlanProposal(proposal: PlanProposal) {
    const latestProposal = desktop.planProposals[proposal.turnId] ?? proposal;
    const closeProposalInspector =
      inspector.type === "canvasProposal" &&
      inspector.proposalTurnId === latestProposal.turnId;
    if (closeProposalInspector) {
      inspectorRetargetThreadIdRef.current = null;
    }
    setDesktop((current) => ({
      ...current,
      planProposals: updatePlanProposalStatus(
        current.planProposals,
        latestProposal.turnId,
        "declined",
        true,
      ),
      layout: closeProposalInspector
        ? {
            ...current.layout,
            inspectorOpen: false,
          }
        : current.layout,
    }));
    if (closeProposalInspector) {
      setInspector({ type: "empty" });
    }
  }

  function applyCanvasSuggestion(suggestion: CanvasSuggestion) {
    const latestSuggestion =
      desktop.canvasSuggestions[suggestion.turnId] ?? suggestion;
    const project =
      desktop.projects.find(
        (candidate) => candidate.id === latestSuggestion.projectId,
      ) ?? activeProject;
    if (!project) {
      setSendError(
        "That Canvas suggestion belongs to a project that is no longer available.",
      );
      return;
    }
    const acceptedCanvas = latestSuggestion.canvasProposalSnapshot
      ? finalizeAcceptedCanvasProposal(
          latestSuggestion.canvasProposalSnapshot,
          latestSuggestion.canvasBaseSnapshot,
        )
      : null;
    const closeSuggestionInspector =
      inspector.type === "canvasSuggestion" &&
      inspector.suggestionTurnId === latestSuggestion.turnId;
    setDesktop((current) => ({
      ...current,
      canvases: acceptedCanvas
        ? {
            ...current.canvases,
            [project.id]: acceptedCanvas,
          }
        : current.canvases,
      canvasSuggestions: updateCanvasSuggestionStatus(
        current.canvasSuggestions,
        latestSuggestion.turnId,
        "applied",
        true,
      ),
    }));
    if (closeSuggestionInspector) {
      setInspector({ type: "canvas", projectId: project.id });
    }
  }

  function dismissCanvasSuggestion(suggestion: CanvasSuggestion) {
    const latestSuggestion =
      desktop.canvasSuggestions[suggestion.turnId] ?? suggestion;
    const closeSuggestionInspector =
      inspector.type === "canvasSuggestion" &&
      inspector.suggestionTurnId === latestSuggestion.turnId;
    if (closeSuggestionInspector) {
      inspectorRetargetThreadIdRef.current = null;
    }
    setDesktop((current) => ({
      ...current,
      canvasSuggestions: updateCanvasSuggestionStatus(
        current.canvasSuggestions,
        latestSuggestion.turnId,
        "dismissed",
        true,
      ),
      layout: closeSuggestionInspector
        ? {
            ...current.layout,
            inspectorOpen: false,
          }
        : current.layout,
    }));
    if (closeSuggestionInspector) {
      setInspector({ type: "empty" });
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
    setInspector((current) =>
      current.type === "canvas"
        ? { type: "canvas", projectId: project.id }
        : current,
    );
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
      planModeOpenedCanvasProjectIdRef.current = activeProject.id;
      selectProjectCanvas(activeProject);
    } else if (
      patch.planMode === false &&
      (planModeOpenedCanvasProjectIdRef.current === activeProject.id ||
        ((inspector.type === "canvas" ||
          inspector.type === "canvasProposal" ||
          inspector.type === "canvasSuggestion") &&
          inspector.projectId === activeProject.id))
    ) {
      planModeOpenedCanvasProjectIdRef.current = null;
      if (
        desktop.layout.inspectorOpen &&
        (inspector.type === "canvas" ||
          inspector.type === "canvasProposal" ||
          inspector.type === "canvasSuggestion") &&
        inspector.projectId === activeProject.id
      ) {
        closeInspectorPanel();
      }
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
            ) ||
            draft.contexts.some((context) =>
              ["canvas", canvasContextSearchLabel(context).toLowerCase()].some(
                (value) => value.includes(query),
              ),
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
  const selectedPlanProposal =
    inspector.type === "canvasProposal"
      ? (desktop.planProposals[inspector.proposalTurnId] ?? null)
      : null;
  const selectedCanvasSuggestion =
    inspector.type === "canvasSuggestion"
      ? (desktop.canvasSuggestions[inspector.suggestionTurnId] ?? null)
      : null;
  const selectedCanvas =
    canvasProject && inspector.type === "canvasProposal"
      ? (selectedPlanProposal?.canvasProposalSnapshot ?? null)
      : canvasProject && inspector.type === "canvasSuggestion"
        ? (selectedCanvasSuggestion?.canvasProposalSnapshot ?? null)
        : canvasProject
          ? (desktop.canvases[canvasProject.id] ?? createProjectCanvas(canvasProject))
          : null;
  const canvasContextOptions = activeProject
    ? buildCanvasContextOptions(activeProject, desktop)
    : [];
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
            setComposerContexts([]);
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
          activeCanvasSelected={
            desktop.layout.inspectorOpen &&
            inspector.type === "canvas" &&
            inspector.projectId === activeProject?.id
          }
          activeThread={activeThread}
          hasActiveProject={Boolean(activeProject)}
          connectionStatus={connectionStatus}
          connectionError={connectionError}
          inspectorOpen={desktop.layout.inspectorOpen}
          onOpenCanvas={() => toggleProjectCanvas()}
          onOpenSidebar={() => setSidebarDrawerOpen(true)}
          onToggleInspector={toggleInspectorPanel}
        />

        <section className="chat-pane">
          <ChatThread
            activeProject={activeProject}
            activeDraft={activeDraft}
            activeThread={activeThread}
            onAcceptPlanProposal={(proposal) => void acceptPlanProposal(proposal)}
            onApplyCanvasSuggestion={applyCanvasSuggestion}
            onDeclinePlanProposal={declinePlanProposal}
            onDismissCanvasSuggestion={dismissCanvasSuggestion}
            onModifyPlanProposal={modifyPlanProposal}
            onOpenCanvasSuggestion={selectCanvasSuggestionCanvas}
            onOpenPlanProposalCanvas={selectPlanProposalCanvas}
            onSelect={selectInspector}
            canvasSuggestions={desktop.canvasSuggestions}
            planProposals={desktop.planProposals}
          />
        </section>

        {activePendingCanvasSuggestion && (
          <div className="composer-review-strip">
            <CanvasSuggestionReview
              suggestion={activePendingCanvasSuggestion}
              onApply={applyCanvasSuggestion}
              onDismiss={dismissCanvasSuggestion}
              onOpenCanvas={selectCanvasSuggestionCanvas}
              surface="strip"
            />
          </div>
        )}

        <Composer
          attachments={attachments}
          contexts={composerContexts}
          canUseCanvasContext={Boolean(activeProject)}
          canvasContextOptions={canvasContextOptions}
          canvasContextProjectName={activeProject?.name ?? null}
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
          onAddCanvasContext={(context) => addCanvasComposerContext(context)}
          onAttachmentError={setSendError}
          onCancel={cancelRun}
          onRemoveAttachment={removeAttachment}
          onRemoveContext={removeComposerContext}
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
          canvasProposal={selectedPlanProposal}
          canvasSuggestion={selectedCanvasSuggestion}
          canvasReadOnly={canvasReadOnly}
          canvasSaveStatus={saveStatus}
          onAnswerApproval={answerApproval}
          onOpenDocument={(path) => selectInspector({ type: "document", path })}
          onResizePointerDown={beginInspectorResize}
          onRequestGenerateMockup={requestCurrentUiMockup}
          onReviewChanges={() => void reviewChanges()}
          onRollback={() => void rollbackChat()}
          onSelect={selectInspector}
          onUpdateCanvas={updateProjectCanvas}
          onUpdateCanvasProposal={updatePlanProposalCanvas}
          onUpdateCanvasSuggestion={updateCanvasSuggestionCanvas}
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

function finalAgentText(turn: Turn) {
  return turn.items
    .filter(
      (item): item is Extract<ThreadItem, { type: "agentMessage" }> =>
        item.type === "agentMessage" &&
        (item.phase === "final_answer" || item.phase === null),
    )
    .map((item) => item.text)
    .join("\n\n");
}

type PlanCanvasPromptContext = {
  status: PlanCanvasStatus;
  summary: string;
  serialized: string | null;
  snapshot: ProjectCanvas | null;
};

function updatePlanProposalStatus(
  proposals: Record<string, PlanProposal>,
  turnId: string,
  status: PlanProposal["status"],
  clearSnapshots = false,
) {
  const proposal = proposals[turnId];
  if (!proposal) return proposals;
  return {
    ...proposals,
    [turnId]: {
      ...proposal,
      status,
      canvasBaseSnapshot: clearSnapshots ? null : proposal.canvasBaseSnapshot,
      canvasProposalSnapshot: clearSnapshots
        ? null
        : proposal.canvasProposalSnapshot,
      canvasProposalParserVersion: clearSnapshots
        ? undefined
        : proposal.canvasProposalParserVersion,
      updatedAt: Date.now(),
    },
  };
}

function updateCanvasSuggestionStatus(
  suggestions: Record<string, CanvasSuggestion>,
  turnId: string,
  status: CanvasSuggestion["status"],
  clearSnapshots = false,
) {
  const suggestion = suggestions[turnId];
  if (!suggestion) return suggestions;
  return {
    ...suggestions,
    [turnId]: {
      ...suggestion,
      status,
      canvasBaseSnapshot: clearSnapshots ? null : suggestion.canvasBaseSnapshot,
      canvasProposalSnapshot: clearSnapshots
        ? null
        : suggestion.canvasProposalSnapshot,
      canvasProposalParserVersion: clearSnapshots
        ? undefined
        : suggestion.canvasProposalParserVersion,
      updatedAt: Date.now(),
    },
  };
}

function supersedePendingPlanProposals(
  proposals: Record<string, PlanProposal>,
  threadId: string,
  exceptTurnId: string | null = null,
) {
  let changed = false;
  const next: Record<string, PlanProposal> = {};
  for (const [turnId, proposal] of Object.entries(proposals)) {
    if (
      proposal.threadId === threadId &&
      proposal.status === "pending" &&
      proposal.turnId !== exceptTurnId
    ) {
      next[turnId] = {
        ...proposal,
        status: "superseded",
        updatedAt: Date.now(),
      };
      changed = true;
    } else {
      next[turnId] = proposal;
    }
  }
  return changed ? next : proposals;
}

function parseCanvasProposalForPlan(
  proposal: PlanProposal,
  finalText: string,
): PlanProposal {
  if (!proposal.canvasBaseSnapshot) return proposal;
  const parsed = applyCanvasProposalText(proposal.canvasBaseSnapshot, finalText);
  const parseStatus =
    parsed.changeCount > 0
      ? "parsed"
      : parsed.errors.length > 0
        ? "failed"
        : "empty";
  return {
    ...proposal,
    canvasProposalSnapshot: parsed.canvas,
    canvasProposalParseStatus: parseStatus,
    canvasProposalParserVersion: CANVAS_PROPOSAL_PARSER_VERSION,
    canvasProposalChangeCount: parsed.changeCount,
    canvasProposalSummary: parsed.summary,
    canvasProposalErrors: parsed.errors,
    updatedAt: Date.now(),
  };
}

function parseCanvasSuggestionForTurn(
  suggestion: CanvasSuggestion,
  finalText: string,
): CanvasSuggestion {
  if (!suggestion.canvasBaseSnapshot) return suggestion;
  const parsed = applyCanvasProposalText(suggestion.canvasBaseSnapshot, finalText);
  const parsedCanvas = isGeneratedCurrentUiMockupPrompt(suggestion.prompt)
    ? polishGeneratedCurrentUiDraft(parsed.canvas)
    : parsed.canvas;
  const parseStatus =
    parsed.changeCount > 0
      ? "parsed"
      : parsed.errors.length > 0
        ? "failed"
        : "empty";
  return {
    ...suggestion,
    canvasProposalSnapshot: parsedCanvas,
    canvasProposalParseStatus: parseStatus,
    canvasProposalParserVersion: CANVAS_PROPOSAL_PARSER_VERSION,
    canvasProposalChangeCount: parsed.changeCount,
    canvasProposalSummary: isGeneratedCurrentUiMockupPrompt(suggestion.prompt)
      ? generatedCurrentUiDraftSummary(parsedCanvas)
      : parsed.summary,
    canvasProposalErrors: parsed.errors,
    updatedAt: Date.now(),
  };
}

function polishGeneratedCurrentUiDraft(canvas: ProjectCanvas): ProjectCanvas {
  const items = canvas.items.filter((item) => !isOversizedGeneratedShell(item));
  if (items.length === canvas.items.length) return canvas;
  const visibleItemIds = new Set(items.map((item) => item.id));
  return {
    ...canvas,
    items,
    groups: canvas.groups
      .map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => visibleItemIds.has(itemId)),
      }))
      .filter((group) => group.itemIds.length > 1),
    updatedAt: Date.now(),
  };
}

function isOversizedGeneratedShell(item: CanvasItem) {
  const area = item.width * item.height;
  const worldArea = CANVAS_WORLD_WIDTH * CANVAS_WORLD_HEIGHT;
  const coversMostWorld =
    item.width >= CANVAS_WORLD_WIDTH * 0.72 ||
    item.height >= CANVAS_WORLD_HEIGHT * 0.72 ||
    area >= worldArea * 0.42;
  if (!coversMostWorld) return false;
  const text = `${item.title} ${item.body} ${item.comment}`.toLowerCase();
  return /\b(shell|workspace|background|desktop|screen|page|canvas|app frame|layout frame)\b/.test(
    text,
  );
}

function generatedCurrentUiDraftSummary(canvas: ProjectCanvas) {
  const visibleItems = canvas.items.filter((item) => item.visible !== false);
  const pageIds = new Set(
    visibleItems
      .map((item) => item.pageId)
      .filter((pageId): pageId is string => Boolean(pageId)),
  );
  const pages = pageIds.size > 0 ? pageIds.size : canvas.pages.length;
  return `Draft ready: ${visibleItems.length} item${
    visibleItems.length === 1 ? "" : "s"
  } across ${pages} page${pages === 1 ? "" : "s"}.`;
}

function planProposalRevisionPrompt(
  proposal: PlanProposal,
  summary = canvasProposalDeltaSummary(
    proposal.canvasBaseSnapshot,
    proposal.canvasProposalSnapshot,
  ),
) {
  if (!summary) {
    return "Please revise the plan: ";
  }
  return [
    "Please revise the previous plan using these edits to the Canvas proposal.",
    "Do not edit files yet.",
    "Return a revised product-facing plan and, if Canvas changes still matter, a fresh parseable canvas-proposal block.",
    "",
    "User-edited Canvas proposal changes:",
    summary,
  ].join("\n");
}

function planProposalRevisionContexts(
  proposal: PlanProposal,
  project: Project,
): ComposerContextReference[] {
  if (
    proposal.contexts.some(
      (context) =>
        context.type === "canvas" && context.projectId === proposal.projectId,
    )
  ) {
    return proposal.contexts;
  }
  if (!proposal.canvasBaseSnapshot && !proposal.canvasProposalSnapshot) {
    return proposal.contexts;
  }
  return [
    ...proposal.contexts,
    {
      type: "canvas",
      projectId: project.id,
      projectName: project.name,
      target: { kind: "project" },
    },
  ];
}

function canvasContextIdentity(context: ComposerContextReference) {
  const target = context.target ?? { kind: "project" as const };
  if (target.kind === "project") return `${context.projectId}:project`;
  if (target.kind === "page") {
    return `${context.projectId}:page:${target.mode}:${target.pageId ?? "backend"}:${
      target.subPageId ?? "all"
    }`;
  }
  if (target.kind === "item") {
    return `${context.projectId}:item:${target.itemId}`;
  }
  return `${context.projectId}:group:${target.groupId}`;
}

function canvasContextSearchLabel(context: ComposerContextReference) {
  const target = context.target;
  if (!target || target.kind === "project") return context.projectName;
  if (target.kind === "page") {
    return `${context.projectName} ${target.pageName} ${
      target.subPageName ?? ""
    }`;
  }
  return `${context.projectName} ${target.reference} ${target.label}`;
}

function canvasProposalDeltaSummary(
  baseCanvas: ProjectCanvas | null,
  proposalCanvas: ProjectCanvas | null,
) {
  if (!baseCanvas || !proposalCanvas) return "";
  const baseByReference = new Map(
    baseCanvas.items.map((item) => [item.reference.toUpperCase(), item]),
  );
  const proposalReferences = new Set(
    proposalCanvas.items.map((item) => item.reference.toUpperCase()),
  );
  const changes: string[] = [];
  const proposalItems = [...proposalCanvas.items].sort(
    (left, right) => left.numericId - right.numericId,
  );
  for (const item of proposalItems) {
    const base = baseByReference.get(item.reference.toUpperCase()) ?? null;
    if (!base) {
      changes.push(
        `- ${item.reference} created: ${item.state} ${item.kind}; xywh=${formatCanvasRect(item)}`,
      );
      continue;
    }
    const parts: string[] = [];
    if (item.state !== base.state) {
      parts.push(`state ${base.state} -> ${item.state}`);
    }
    if (!sameCanvasRect(item, base)) {
      parts.push(
        `xywh ${formatCanvasRect(base)} -> ${formatCanvasRect(item)}`,
      );
    }
    if (item.title !== base.title) {
      parts.push(
        `name "${quotePromptValue(base.title, 40)}" -> "${quotePromptValue(
          item.title,
          40,
        )}"`,
      );
    }
    if (item.body !== base.body) {
      parts.push("label changed");
    }
    if (item.comment !== base.comment) {
      parts.push("note changed");
    }
    if (parts.length > 0) {
      changes.push(`- ${item.reference}: ${parts.join("; ")}`);
    }
  }
  for (const item of baseCanvas.items) {
    if (!proposalReferences.has(item.reference.toUpperCase())) {
      changes.push(`- ${item.reference} removed from proposal snapshot`);
    }
  }
  if (changes.length === 0) return "";
  const clipped = changes.slice(0, 16);
  if (changes.length > clipped.length) {
    clipped.push(`- ${changes.length - clipped.length} more changes`);
  }
  return clipped.join("\n");
}

function sameCanvasRect(left: CanvasItem, right: CanvasItem) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function isGeneratedCurrentUiMockupPrompt(prompt: string) {
  return prompt
    .trimStart()
    .startsWith(
      "Inspect this local project and generate a low-fidelity current UI Canvas mockup.",
    );
}

function generatedMockupCanvasContext(project: Project): PlanCanvasPromptContext {
  const snapshot = createProjectCanvas(project);
  return {
    status: "empty",
    summary: "Generated current UI draft",
    serialized: null,
    snapshot,
  };
}

function promptWithGeneratedMockupContext(prompt: string) {
  return [
    prompt,
    "",
    "Canvas generation mode:",
    "The attached Canvas is only the destination for a generated current-UI draft. Do not treat existing Canvas items as accepted UI truth for this generation run.",
    "Create a fresh reviewable Canvas suggestion that represents existing UI only. Use state=current for UI that exists today, but remember the draft is not accepted until the user applies it.",
    "Prefer readable pages and sub-pages over one large workspace map. Keep one sub-page visible/readable at a time by using page and subPage fields.",
    "Use a compact screen-sketch grid per subPage: x=0..36 and y=0..24. The Canvas page/subPage is the screen frame; do not output giant workspace/background/page-shell containers as items.",
    "Only output visible UI pieces the user should review. Omit decorative backgrounds and uncertain internals.",
  ].join("\n");
}

function promptWithPlanModeContext(
  prompt: string,
  canvasContext: PlanCanvasPromptContext,
) {
  const rules = [
    "Plan Mode: investigate and propose the plan first.",
    "Do not edit files, run implementation commands, or mutate the accepted Canvas unless the user accepts the plan.",
    "If the user later accepts the plan, implementation can proceed in a separate turn.",
    "Return a clear product-facing plan. Keep source-level details only where they make the plan accurate.",
  ];

  if (canvasContext.status === "not_attached" || canvasContext.status === "empty") {
    rules.push(
      "Canvas status: empty. There are no accepted Canvas items yet. Do not invent existing Canvas item references or exact current coordinates; if visual planning matters, propose new gold/proposed Canvas items for user review.",
    );
  } else if (canvasContext.status === "sparse") {
    rules.push(
      "Canvas status: sparse. Use available Canvas references as rough user context, not as complete application truth.",
    );
  } else {
    rules.push(
      "Canvas status: usable. Use Canvas reference codes, coordinates, groups, and states automatically when the plan affects layout or workflow.",
    );
  }

  rules.push(
    "When Canvas changes are relevant, include a compact Canvas proposal section that uses existing reference codes and the states current, proposed, and deleted. Canvas proposal text is not accepted Canvas state until the user accepts.",
    'Use this parseable format in a fenced ```canvas-proposal block when possible: `C5 state=deleted`, `C4 xywh=120,80,220,132 state=current`, `C4 grid=4.29,2.86,7.86,4.71 state=current`, or `create container title="Settings panel" state=proposed page="Page 1" subPage="Active" xywh=360,80,220,132`. Keep one canvas change per line.',
  );

  const canvasBlock = canvasContext.serialized
    ? `\n\nProject Canvas for this plan:\n${canvasContext.serialized}`
    : "";

  return `${rules.join("\n")}\n\nUser request:\n${prompt}${canvasBlock}`;
}

function promptWithComposerContexts(
  prompt: string,
  contexts: ComposerContextReference[],
  desktop: DesktopState,
  fallbackProject: Project,
) {
  if (contexts.length === 0) return prompt;
  const blocks = contexts
    .map((context) => {
      if (context.type !== "canvas") return null;
      return serializeCanvasContext(context, desktop, fallbackProject);
    })
    .filter((block): block is string => Boolean(block));
  if (blocks.length === 0) return prompt;
  return `${prompt}\n\nProject context explicitly attached by the user:\n${blocks.join(
    "\n\n",
  )}\n\nUse only the attached Canvas scope as visual context. Use the included canvas reference codes when discussing layout changes. If you propose a concrete Canvas change, include a compact suggestion in a fenced \`\`\`canvas-proposal block using one change per line, such as \`C6 xywh=720,75,220,132 state=proposed\`, \`C6 grid=25.71,2.68,7.86,4.71 state=proposed\`, or \`create container title=\"Inspector\" page=\"Page 1\" subPage=\"Inspector\" state=proposed grid=18,2,8,18\`. Do not assume this canvas is attached to future prompts unless the user attaches it again.`;
}

function canvasContextForPrompt(
  contexts: ComposerContextReference[],
  desktop: DesktopState,
  fallbackProject: Project,
  allowImplicit: boolean,
): PlanCanvasPromptContext | null {
  const explicitContext = contexts.find((candidate) => candidate.type === "canvas");
  if (!explicitContext && !allowImplicit) return null;
  const project =
    (explicitContext
      ? desktop.projects.find((candidate) => candidate.id === explicitContext.projectId)
      : null) ??
    fallbackProject;
  const context =
    explicitContext ??
    ({
      type: "canvas",
      projectId: project.id,
      projectName: project.name,
      target: { kind: "project" },
    } satisfies ComposerContextReference);
  const canvas = desktop.canvases[project.id] ?? createProjectCanvas(project);
  const visibleItems = canvas.items.filter((item) => item.visible);
  const visibleGroups = canvas.groups.filter((group) =>
    group.itemIds.some((itemId) =>
      visibleItems.some((item) => item.id === itemId),
    ),
  );
  const visualCount = visibleItems.length + visibleGroups.length;
  const status: PlanCanvasStatus =
    visualCount === 0 ? "empty" : visualCount < 3 ? "sparse" : "usable";
  const summary =
    status === "empty"
      ? "Canvas has no items yet"
      : status === "sparse"
        ? `Canvas available, sparse (${visibleItems.length} item${
            visibleItems.length === 1 ? "" : "s"
          })`
        : `Canvas available (${visibleItems.length} item${
            visibleItems.length === 1 ? "" : "s"
          }, ${visibleGroups.length} group${
            visibleGroups.length === 1 ? "" : "s"
          })`;
  return {
    status,
    summary,
    serialized: serializeCanvasContext(context, desktop, fallbackProject),
    snapshot: cloneProjectCanvas(canvas),
  };
}

function serializeCanvasContext(
  context: ComposerContextReference,
  desktop: DesktopState,
  fallbackProject: Project,
) {
  const project =
    desktop.projects.find((candidate) => candidate.id === context.projectId) ??
    fallbackProject;
  const canvas = desktop.canvases[project.id] ?? createProjectCanvas(project);
  const pages = [...canvas.pages].sort((left, right) => left.order - right.order);
  const pageName = (pageId: string | null) =>
    pageId
      ? (pages.find((page) => page.id === pageId)?.name ?? pageId)
      : "Backend";
  const subPageLabelFor = (pageId: string | null, subPageId: string | null) =>
    pageId && subPageId
      ? canvasSubPageDisplay(pages, pageId, subPageId)
      : null;
  const groupById = new Map(canvas.groups.map((group) => [group.id, group]));
  const scoped = scopedCanvasReferences(canvas, context);
  const items = scoped.items.sort(
    (left, right) =>
      pageName(left.pageId).localeCompare(pageName(right.pageId)) ||
      left.zIndex - right.zIndex ||
      left.numericId - right.numericId,
  );
  const groups = scoped.groups.sort(
    (left, right) => left.numericId - right.numericId,
  );
  const lines = [
    `@Canvas project="${quotePromptValue(project.name, 80)}"`,
    `target=${canvasContextTargetDescription(context, pageName)}`,
    `coordinates=local sub-page canvas xywh in raw units; grid unit=${CANVAS_GRID_UNIT}px; norm=${CANVAS_NORMALIZED_UNITS} units over ${CANVAS_WORLD_WIDTH}x${CANVAS_WORLD_HEIGHT}`,
    `mode=${canvas.mode}; activePage=${quotePromptValue(
      pageName(canvas.activePageId),
      40,
    )}; activeDevice=${canvas.activeDevice}; updatedAt=${canvas.updatedAt}`,
    `pages=${pages
      .map(
        (page, pageIndex) =>
          `${page.name}:${page.id} subPages=${page.subPages
            .map(
              (subPage, subPageIndex) =>
                `P${pageIndex + 1}.${subPageIndex + 1}:${subPage.name}:${subPage.id}`,
            )
            .join("|")}`,
      )
      .join(", ")}`,
  ];

  if (groups.length > 0) {
    lines.push("groups:");
    for (const group of groups.slice(0, 40)) {
      lines.push(serializeCanvasGroup(group, pageName, subPageLabelFor));
    }
    if (groups.length > 40) {
      lines.push(`- ${groups.length - 40} more groups omitted`);
    }
  }

  lines.push("items:");
  for (const item of items.slice(0, 120)) {
    lines.push(serializeCanvasItem(item, pageName, subPageLabelFor, groupById));
  }
  if (items.length > 120) {
    lines.push(`- ${items.length - 120} more items omitted`);
  }
  return lines.join("\n");
}

function buildCanvasContextOptions(
  project: Project,
  desktop: DesktopState,
): ComposerCanvasContextOption[] {
  const canvas = desktop.canvases[project.id] ?? createProjectCanvas(project);
  const pages = [...canvas.pages].sort((left, right) => left.order - right.order);
  const pageName = (pageId: string | null) =>
    pageId
      ? (pages.find((page) => page.id === pageId)?.name ?? pageId)
      : "Backend";
  const subPageName = (pageId: string | null, subPageId: string | null) =>
    pageId && subPageId
      ? canvasSubPageDisplay(pages, pageId, subPageId)
      : null;
  const itemCountByPage = new Map<string, number>();
  const itemCountBySubPage = new Map<string, number>();
  for (const item of canvas.items.filter((item) => item.visible)) {
    const key = item.pageId ?? "backend";
    itemCountByPage.set(key, (itemCountByPage.get(key) ?? 0) + 1);
    if (item.pageId && item.subPageId) {
      const subPageKey = `${item.pageId}:${item.subPageId}`;
      itemCountBySubPage.set(
        subPageKey,
        (itemCountBySubPage.get(subPageKey) ?? 0) + 1,
      );
    }
  }
  const options: ComposerCanvasContextOption[] = [
    {
      id: `${project.id}:project`,
      label: "Canvas",
      detail: project.name,
      context: {
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: { kind: "project" },
      },
    },
  ];

  for (const page of pages) {
    const count = itemCountByPage.get(page.id) ?? 0;
    options.push({
      id: `${project.id}:page:${page.id}`,
      label: page.name,
      detail: `UI page · ${count} item${count === 1 ? "" : "s"}`,
      context: {
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: {
          kind: "page",
          mode: "ui",
          pageId: page.id,
          pageName: page.name,
          subPageId: null,
          subPageName: null,
        },
      },
    });
    if (page.subPages.length > 1) {
      for (const subPage of page.subPages) {
        const count = itemCountBySubPage.get(`${page.id}:${subPage.id}`) ?? 0;
        options.push({
          id: `${project.id}:page:${page.id}:subpage:${subPage.id}`,
          label: canvasSubPageDisplay(pages, page.id, subPage.id),
          detail: `${page.name} · ${count} item${count === 1 ? "" : "s"}`,
          context: {
            type: "canvas",
            projectId: project.id,
            projectName: project.name,
            target: {
              kind: "page",
              mode: "ui",
              pageId: page.id,
              pageName: page.name,
              subPageId: subPage.id,
              subPageName: subPage.name,
            },
          },
        });
      }
    }
  }

  const backendCount = itemCountByPage.get("backend") ?? 0;
  if (backendCount > 0) {
    options.push({
      id: `${project.id}:page:backend`,
      label: "Backend",
      detail: `${backendCount} item${backendCount === 1 ? "" : "s"}`,
      context: {
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: {
          kind: "page",
          mode: "backend",
          pageId: null,
          pageName: "Backend",
          subPageId: null,
          subPageName: null,
        },
      },
    });
  }

  const groups = [...canvas.groups].sort((left, right) => {
    return (
      pageName(left.pageId).localeCompare(pageName(right.pageId)) ||
      left.numericId - right.numericId
    );
  });
  for (const group of groups) {
    options.push({
      id: `${project.id}:group:${group.id}`,
      label: `${group.reference} ${group.title}`,
      detail: `${pageName(group.pageId)} · group · ${group.state}`,
      context: {
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: {
          kind: "group",
          mode: group.pageId ? "ui" : "backend",
          pageId: group.pageId,
          pageName: pageName(group.pageId),
          subPageId: group.subPageId,
          subPageName: subPageName(group.pageId, group.subPageId),
          groupId: group.id,
          reference: group.reference,
          label: group.title,
        },
      },
    });
  }

  const items = [...canvas.items]
    .filter((item) => item.visible)
    .sort((left, right) => {
      return (
        pageName(left.pageId).localeCompare(pageName(right.pageId)) ||
        left.numericId - right.numericId
      );
    });
  for (const item of items) {
    options.push({
      id: `${project.id}:item:${item.id}`,
      label: `${item.reference} ${item.title}`,
      detail: `${pageName(item.pageId)} · ${item.state} ${item.kind}`,
      context: {
        type: "canvas",
        projectId: project.id,
        projectName: project.name,
        target: {
          kind: "item",
          mode: item.pageId ? "ui" : "backend",
          pageId: item.pageId,
          pageName: pageName(item.pageId),
          subPageId: item.subPageId,
          subPageName: subPageName(item.pageId, item.subPageId),
          itemId: item.id,
          reference: item.reference,
          label: item.title,
        },
      },
    });
  }

  return options.slice(0, 180);
}

function scopedCanvasReferences(
  canvas: ProjectCanvas,
  context: ComposerContextReference,
) {
  const target = context.target;
  const allItems = [...canvas.items];
  const allGroups = [...canvas.groups];
  if (!target || target.kind === "project") {
    return { items: allItems, groups: allGroups };
  }
  if (target.kind === "page") {
    return {
      items: allItems.filter(
        (item) =>
          item.pageId === target.pageId &&
          (!target.subPageId || item.subPageId === target.subPageId),
      ),
      groups: allGroups.filter(
        (group) =>
          group.pageId === target.pageId &&
          (!target.subPageId || group.subPageId === target.subPageId),
      ),
    };
  }
  if (target.kind === "item") {
    const item = allItems.find((candidate) => candidate.id === target.itemId);
    const groups = item?.groupId
      ? allGroups.filter((group) => group.id === item.groupId)
      : [];
    return { items: item ? [item] : [], groups };
  }
  const group = allGroups.find((candidate) => candidate.id === target.groupId);
  const memberIds = new Set(group?.itemIds ?? []);
  return {
    items: allItems.filter((item) => memberIds.has(item.id)),
    groups: group ? [group] : [],
  };
}

function canvasContextTargetDescription(
  context: ComposerContextReference,
  pageName: (pageId: string | null) => string,
) {
  const target = context.target;
  if (!target || target.kind === "project") return "whole-canvas";
  if (target.kind === "page") {
    return `page:${quotePromptValue(target.pageName || pageName(target.pageId), 60)}${
      target.subPageName
        ? `; subPage=${quotePromptValue(target.subPageName, 60)}`
        : ""
    }`;
  }
  if (target.kind === "item") {
    return `item:${target.reference}; page=${quotePromptValue(
      target.pageName || pageName(target.pageId),
      60,
    )}${
      target.subPageName
        ? `; subPage=${quotePromptValue(target.subPageName, 60)}`
        : ""
    }`;
  }
  return `group:${target.reference}; page=${quotePromptValue(
    target.pageName || pageName(target.pageId),
    60,
  )}${
    target.subPageName
      ? `; subPage=${quotePromptValue(target.subPageName, 60)}`
      : ""
  }`;
}

function canvasSubPageDisplay(
  pages: CanvasPage[],
  pageId: string,
  subPageId: string,
) {
  const pageIndex = pages.findIndex((page) => page.id === pageId);
  const page = pages[pageIndex];
  if (!page) return subPageId;
  const subPages = [...page.subPages].sort((left, right) => left.order - right.order);
  const subPageIndex = subPages.findIndex((subPage) => subPage.id === subPageId);
  const subPage = subPages[subPageIndex];
  if (!subPage) return subPageId;
  return `P${pageIndex + 1}.${subPageIndex + 1} ${subPage.name}`;
}

function serializeCanvasGroup(
  group: CanvasGroup,
  pageName: (pageId: string | null) => string,
  subPageLabelFor: (pageId: string | null, subPageId: string | null) => string | null,
) {
  return [
    `- ${group.reference} "${quotePromptValue(group.title, 80)}"`,
    `state=${group.state}`,
    `page=${quotePromptValue(pageName(group.pageId), 40)}`,
    ...(subPageLabelFor(group.pageId, group.subPageId)
      ? [
          `subPage=${quotePromptValue(
            subPageLabelFor(group.pageId, group.subPageId) ?? "",
            60,
          )}`,
        ]
      : []),
    `locked=${group.locked}`,
    `items=${group.itemIds.join(",")}`,
    `xywh=${formatCanvasRect(group.bounds)}`,
    `bounds=${formatCanvasBounds(group.bounds)}`,
    `grid=${formatCanvasDerivedRect(gridRectFromCanvasRect(group.bounds))}`,
    `norm=${formatCanvasDerivedRect(normalizedRectFromCanvasRect(group.bounds))}`,
  ].join("; ");
}

function serializeCanvasItem(
  item: CanvasItem,
  pageName: (pageId: string | null) => string,
  subPageLabelFor: (pageId: string | null, subPageId: string | null) => string | null,
  groupById: Map<string, CanvasGroup>,
) {
  const parts = [
    `- ${item.reference} ${item.kind} "${quotePromptValue(item.title, 80)}"`,
    `state=${item.state}`,
    `page=${quotePromptValue(pageName(item.pageId), 40)}`,
    ...(subPageLabelFor(item.pageId, item.subPageId)
      ? [
          `subPage=${quotePromptValue(
            subPageLabelFor(item.pageId, item.subPageId) ?? "",
            60,
          )}`,
        ]
      : []),
    `locked=${item.locked}`,
    `visible=${item.visible}`,
    `z=${item.zIndex}`,
    `xywh=${formatCanvasRect(item)}`,
    `bounds=${formatCanvasBounds(item.bounds)}`,
    `grid=${formatCanvasDerivedRect(gridRectFromCanvasRect(item))}`,
    `norm=${formatCanvasDerivedRect(normalizedRectFromCanvasRect(item))}`,
  ];
  if (item.groupId) {
    parts.push(`group=${groupById.get(item.groupId)?.reference ?? item.groupId}`);
  }
  if (hasOriginalGeometry(item)) {
    parts.push(
      `original=${formatCanvasRect({
        x: item.originalX ?? item.x,
        y: item.originalY ?? item.y,
        width: item.originalWidth ?? item.width,
        height: item.originalHeight ?? item.height,
      })}`,
      `originalGrid=${formatCanvasDerivedRect(
        gridRectFromCanvasRect({
          x: item.originalX ?? item.x,
          y: item.originalY ?? item.y,
          width: item.originalWidth ?? item.width,
          height: item.originalHeight ?? item.height,
        }),
      )}`,
      `originalNorm=${formatCanvasDerivedRect(
        normalizedRectFromCanvasRect({
          x: item.originalX ?? item.x,
          y: item.originalY ?? item.y,
          width: item.originalWidth ?? item.width,
          height: item.originalHeight ?? item.height,
        }),
      )}`,
    );
  }
  if (item.body.trim()) {
    parts.push(`label="${quotePromptValue(item.body, 140)}"`);
  }
  if (item.comment.trim()) {
    parts.push(`noteForCodex="${quotePromptValue(item.comment, 180)}"`);
  }
  return parts.join("; ");
}

function hasOriginalGeometry(item: CanvasItem) {
  return (
    item.originalX != null ||
    item.originalY != null ||
    item.originalWidth != null ||
    item.originalHeight != null
  );
}

function formatCanvasRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return `${formatCanvasNumber(rect.x)},${formatCanvasNumber(
    rect.y,
  )},${formatCanvasNumber(rect.width)},${formatCanvasNumber(rect.height)}`;
}

function formatCanvasBounds(bounds: CanvasBounds) {
  return `${formatCanvasNumber(bounds.left)},${formatCanvasNumber(
    bounds.top,
  )},${formatCanvasNumber(bounds.right)},${formatCanvasNumber(bounds.bottom)}`;
}

function formatCanvasDerivedRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return `${formatDerivedCanvasNumber(rect.x)},${formatDerivedCanvasNumber(
    rect.y,
  )},${formatDerivedCanvasNumber(rect.width)},${formatDerivedCanvasNumber(
    rect.height,
  )}`;
}

function formatCanvasNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatDerivedCanvasNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function quotePromptValue(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  const clipped =
    compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}...` : compact;
  return clipped.replace(/"/g, "'");
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
      return (
        right.type === "canvas" &&
        left.projectId === right.projectId &&
        left.focusReference === right.focusReference &&
        left.focusRequestId === right.focusRequestId
      );
    case "canvasProposal":
      return (
        right.type === "canvasProposal" &&
        left.projectId === right.projectId &&
        left.proposalTurnId === right.proposalTurnId &&
        left.focusReference === right.focusReference &&
        left.focusRequestId === right.focusRequestId
      );
    case "canvasSuggestion":
      return (
        right.type === "canvasSuggestion" &&
        left.projectId === right.projectId &&
        left.suggestionTurnId === right.suggestionTurnId &&
        left.focusReference === right.focusReference &&
        left.focusRequestId === right.focusRequestId
      );
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
