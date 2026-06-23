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
import {
  AuthDialog,
  closedAuthDialogState,
  type AuthDialogState,
} from "./components/AuthDialog";
import { ChatThread } from "./components/ChatThread";
import { CodeProposalOptionStrip } from "./components/CodeProposalOptionStrip";
import { Composer } from "./components/Composer";
import { FeatureDraftStrip } from "./components/FeatureDraftStrip";
import {
  nextAppPreviewChangeNumber,
  nextAppPreviewMarkNumber,
} from "./composerContexts";
import { Inspector } from "./components/Inspector";
import { MockupOptionStrip } from "./components/MockupOptionStrip";
import { ProjectSidebar } from "./components/ProjectSidebar";
import { VisualDecisionStripView } from "./components/VisualDecisionStrip";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import {
  classifyAttachment,
  hasDraftContent,
  promptWithInspectableFiles,
  unsupportedAttachments,
} from "./attachments";
import {
  CANVAS_OPERATING_PROMPT,
  canvasActionSummary,
  resolveCanvasAction,
  type CanvasActionResolution,
  type CanvasProposalState,
  type CanvasQuestion,
  type CanvasSurface,
} from "./canvasActions";
import {
  buildStrategyForProposalBacking,
  proposalBackingForPreviewArtifactKind,
  type ProposalBacking,
} from "./canvasProposalModel";
import {
  evaluateLiveDomPatchStaleness,
  staleProposalBuildMessage,
} from "./canvasProposalStaleness";
import { useAppServerConnection } from "./hooks/useAppServerConnection";
import { useAppServerEvents } from "./hooks/useAppServerEvents";
import { useDocumentPreview } from "./hooks/useDocumentPreview";
import {
  activeTurn,
  ensureTurn,
  mergeThreadWithLocalState,
  sandboxPolicyFor,
  threadTitle,
} from "./itemUtils";
import {
  createProject,
  defaultSettings,
  loadDesktopState,
  saveDesktopState,
} from "./localState";
import {
  loadRuntimeInfo,
  normalizeProjectPathForRuntime,
  runtimeInfo,
  sameRuntimePath,
} from "./runtime";
import { desktopInvoke } from "./desktopBridge";
import {
  parsePlanPreviewSpec,
  planPreviewDecisionSummary,
  selectedPlanPreviewVariant,
  selectedPlanPreviewVariantHasVisualPatchBundle,
  shouldOfferPlanPreview,
} from "./planPreview";
import {
  createProposalSetId,
  previewArtifactActionName,
  previewArtifactDisplayName,
  previewArtifactFilePrefix,
  previewArtifactKindFromText,
} from "./mockupArtifacts";
import {
  parseVisualDecisionStrip,
  type VisualDecisionOption,
  type VisualDecisionStrip,
} from "./visualDecision";
import {
  WORKSPACE_PROGRESS_POLL_MS,
  formatDuration,
  formatShortLineDelta,
  liveProgressDetail,
  liveProgressHeadline,
  mergeThreadFileChanges,
  summarizeTurnProgress,
  useWorkspaceProgress,
  type TurnProgressSummary,
} from "./turnProgress";
import type {
  AppServerSnapshot,
  BackendMode,
  CanvasVisualReferenceMeta,
  CodeProposalFileChange,
  CodeProposalOption,
  CodeProposalSet,
  ComposerAttachment,
  ComposerAppPreviewContext,
  ComposerContextReference,
  ComposerMockupPreviewContext,
  DesktopState,
  FeatureDraft,
  InspectorSelection,
  LocalChatDraft,
  MockupPreviewSet,
  PendingApproval,
  PlanPreviewAreaMark,
  PlanPreviewSessionState,
  PlanProposal,
  PreviewArtifactKind,
  Project,
  ProjectSettings,
  SavedMockup,
  Thread,
  ThreadItem,
  ThreadMap,
  ThreadTokenUsage,
  ThreadTokenUsageMap,
  Turn,
} from "./types";
import type { AccountLoginCompletedNotification } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/AccountLoginCompletedNotification";
import type { LoginAccountResponse } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/LoginAccountResponse";

type SubmissionDraft = {
  prompt: string;
  visiblePrompt?: string;
  projectId: string;
  settings: ProjectSettings;
  attachments: ComposerAttachment[];
  contexts: ComposerContextReference[];
  createdAt: number;
  localDraftProjectId?: string | null;
  targetThreadId?: string | null;
  cwdOverride?: string | null;
  openMockupsOnComplete?: boolean;
  liveOverlayProposalOnComplete?: boolean;
  liveProposalAcceptedForBuildTurnId?: string | null;
  codeProposalOnComplete?: boolean;
  codeProposalHistoryOnComplete?: boolean;
  featureDraftOnComplete?: boolean;
  featureDraftBuildOnComplete?: boolean;
  featureDraftId?: string | null;
  mockupHistoryOnComplete?: boolean;
  proposalSetId?: string | null;
  artifactKind?: PreviewArtifactKind | null;
};

type ProjectThreadGroup = {
  project: Project;
  threads: Thread[];
  draft: LocalChatDraft | null;
};

type VisualDecisionComposerAction = {
  decisionId: string;
  option: VisualDecisionOption;
};

type ProjectEmptyStatus = {
  empty: boolean;
  reason: string;
  meaningfulEntries: string[];
  ignoredEntries: string[];
};

type MockupsListResult = Omit<
  MockupPreviewSet,
  "projectId" | "proposalBacking" | "buildStrategy"
> & {
  projectPath: string;
};

type PreparedProposalWorkspaces = {
  proposalSetId: string;
  registryId: string;
  rootPath: string;
  options: Array<{
    id: "A" | "B" | "C";
    workspacePath: string;
    previewOwnerId: string;
  }>;
};

type PreparedDraftWorkspace = {
  draftId: string;
  registryId: string;
  projectPath: string;
  threadId: string | null;
  name: string;
  slug: string;
  status: FeatureDraft["lifecycle"];
  rootPath: string;
  workspacePath: string;
  previewOwnerId: string;
  affectedRoutes: string[];
  mockAssumptions: string[];
  briefPath: string;
  createdAt: number;
  updatedAt: number;
};

type CodeProposalAddOptionRequest = {
  optionId: "A" | "B" | "C";
  sourceOptionId: "A" | "B" | "C" | null;
};

type ProposalWorkspaceDiffResult = {
  proposalSetId: string;
  registryId: string;
  optionId: "A" | "B" | "C";
  workspacePath: string;
  previewOwnerId: string;
  changedFiles: CodeProposalFileChange[];
};

type DraftWorkspaceDiffResult = {
  draftId: string;
  registryId: string;
  projectPath: string;
  rootPath: string;
  workspacePath: string;
  previewOwnerId: string;
  status: FeatureDraft["lifecycle"];
  changedFiles: CodeProposalFileChange[];
};

type ProposalWorkspaceApplyResult = {
  ok: boolean;
  changedFiles: CodeProposalFileChange[];
  conflicts: Array<{ path: string; reason: string }>;
};

type ActiveVisualDecision = {
  id: string;
  turnId: string;
  decision: VisualDecisionStrip;
};

const SIDEBAR_DRAWER_WIDTH = 700;
const INSPECTOR_AUTO_COLLAPSE_WIDTH = 660;
const INSPECTOR_MIN_WIDTH = 320;
const CHAT_COMFORT_WIDTH = 520;
const PREVIEW_CHAT_MIN_WIDTH = 320;
const CHAT_PHONE_LAYOUT_WIDTH = 460;
const INSPECTOR_AUTO_COLLAPSE_QUERY = `(max-width: ${INSPECTOR_AUTO_COLLAPSE_WIDTH}px)`;
const TURN_SETTLE_POLL_INTERVAL_MS = 1500;
const TURN_SETTLE_POLL_TIMEOUT_MS = 30 * 60 * 1000;

export function App() {
  const [desktop, setDesktop] = useState<DesktopState>(() =>
    loadDesktopState(),
  );
  const [runtime, setRuntime] = useState(runtimeInfo);
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [threads, setThreads] = useState<ThreadMap>({});
  const [tokenUsageByThread, setTokenUsageByThread] =
    useState<ThreadTokenUsageMap>({});
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    [],
  );
  const [authDialog, setAuthDialog] = useState<AuthDialogState>(() =>
    closedAuthDialogState(),
  );
  const [inspector, setInspector] = useState<InspectorSelection>({
    type: "empty",
  });
  const [chatDrafts, setChatDrafts] = useState<Record<string, LocalChatDraft>>(
    {},
  );
  const [activeDraftProjectId, setActiveDraftProjectId] = useState<
    string | null
  >(null);
  const [composerText, setComposerText] = useState("");
  const [planProposalFeedbackDrafts, setPlanProposalFeedbackDrafts] = useState<
    Record<string, string>
  >({});
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [composerContexts, setComposerContexts] = useState<
    ComposerContextReference[]
  >([]);
  const [visualDecisionComposerAction, setVisualDecisionComposerAction] =
    useState<VisualDecisionComposerAction | null>(null);
  const [mockupPreviewSets, setMockupPreviewSets] = useState<
    Record<string, MockupPreviewSet>
  >({});
  const [projectEmptyStatusById, setProjectEmptyStatusById] = useState<
    Record<string, ProjectEmptyStatus>
  >({});
  const [dismissedVisualDecisionIds, setDismissedVisualDecisionIds] = useState<
    Record<string, true>
  >(() => loadDismissedVisualDecisionIds());
  const [projectPath, setProjectPath] = useState("");
  const [threadSearch, setThreadSearch] = useState("");
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [sendStarting, setSendStarting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retryDraft, setRetryDraft] = useState<SubmissionDraft | null>(null);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [mockupPreviewLiveResetToken, setMockupPreviewLiveResetToken] =
    useState(0);
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
  const sendStartingRef = useRef(false);
  const activeThreadIdRef = useRef<string | null>(null);
  const previousActiveThreadIdRef = useRef<string | null>(
    desktop.activeThreadId,
  );
  const activeDraftProjectIdRef = useRef<string | null>(null);
  const pendingSendProjectIdRef = useRef<string | null>(null);
  const threadSelectionVersionRef = useRef(0);
  const justStartedThreadIdRef = useRef<string | null>(null);
  const turnPollsRef = useRef<Set<string>>(new Set());
  const inFlightDraftsRef = useRef<Map<string, SubmissionDraft>>(new Map());
  const inspectorRetargetThreadIdRef = useRef<string | null>(null);
  const desktopRef = useRef(desktop);

  useEffect(() => {
    let cancelled = false;
    void loadRuntimeInfo()
      .then((resolved) => {
        if (cancelled) return;
        setRuntime(resolved);
        setDesktop((current) => {
          let changed = current.appServerUrl !== resolved.appServerUrl;
          const projects = current.projects.map((project) => {
            const path = normalizeProjectPathForRuntime(
              project.path,
              resolved.backendMode,
            );
            if (path === project.path) return project;
            changed = true;
            return { ...project, path };
          });
          if (!changed) return current;
          return {
            ...current,
            appServerUrl: resolved.appServerUrl,
            projects,
            activeThreadId: null,
          };
        });
      })
      .finally(() => {
        if (!cancelled) setRuntimeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProject = useMemo(
    () =>
      desktop.projects.find(
        (project) => project.id === desktop.activeProjectId,
      ) ?? null,
    [desktop.activeProjectId, desktop.projects],
  );
  const activeComposerContexts = useMemo(
    () =>
      activeProject
        ? composerContextsForProject(composerContexts, activeProject.id)
        : [],
    [activeProject, composerContexts],
  );
  const activeThreadProposalSetId =
    desktop.activeThreadId != null
      ? desktop.mockupActiveProposalSetIdsByThreadId[desktop.activeThreadId] ??
        null
      : null;
  const activeThreadProposalSetIsHistory = Boolean(
    activeThreadProposalSetId &&
      desktop.mockupHistoryProposalSetIds[activeThreadProposalSetId],
  );
  const activeThreadCodeProposalSetId =
    desktop.activeThreadId != null
      ? desktop.codeProposalActiveSetIdsByThreadId[desktop.activeThreadId] ??
        null
      : null;
  const activeThreadCodeProposalCompareSetId =
    desktop.activeThreadId != null
      ? desktop.codeProposalCompareSetIdsByThreadId[desktop.activeThreadId] ??
        null
      : null;
  const activeThreadFeatureDraftId =
    desktop.activeThreadId != null
      ? desktop.featureDraftActiveIdsByThreadId[desktop.activeThreadId] ?? null
      : null;

  useEffect(() => {
    if (!activeProject) return;
    void refreshProjectEmptyStatus(activeProject);
    if (activeThreadProposalSetId) {
      void loadMockupsForProject(
        activeProject.id,
        activeThreadProposalSetId,
        false,
        false,
      );
    }
    // These helpers intentionally run only when the selected project identity
    // changes. Their internal state writes should not retrigger discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, activeProject?.path, activeThreadProposalSetId]);

  const activePreviewProjectId =
    inspector.type === "appPreview" ||
    inspector.type === "mockupPreview" ||
    inspector.type === "draftPreview" ||
    inspector.type === "codeProposalPreview" ||
    inspector.type === "planPreview"
      ? inspector.projectId
      : null;
  const previewFocused =
    desktop.layout.inspectorOpen &&
    (inspector.type === "appPreview" ||
      inspector.type === "planPreview" ||
      inspector.type === "draftPreview" ||
      inspector.type === "codeProposalPreview" ||
      inspector.type === "mockupPreview");
  const sidebarDockedWidth = sidebarWidthForShell(shellWidth);
  const inspectorWidth = desktop.layout.inspectorOpen
    ? desktop.layout.inspectorWidth
    : 0;
  const dockedChatWidth = Math.max(
    0,
    shellWidth - sidebarDockedWidth - inspectorWidth,
  );
  const sidebarDrawerMode =
    shellWidth <= SIDEBAR_DRAWER_WIDTH || dockedChatWidth <= CHAT_COMFORT_WIDTH;
  const availableChatWidth = Math.max(
    0,
    shellWidth - (sidebarDrawerMode ? 0 : sidebarDockedWidth) - inspectorWidth,
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
  const activeProjectEmptyStatus = activeProject
    ? (projectEmptyStatusById[activeProject.id] ?? null)
    : null;
  const activeProjectHasSavedMockups = activeProject
    ? Boolean(
        activeThreadProposalSetId &&
          !activeThreadProposalSetIsHistory &&
          mockupPreviewSets[activeThreadProposalSetId]?.mockups.length,
      )
    : false;
  const activeVisualDecision = useMemo(
    () =>
      latestVisualDecision(activeThread, dismissedVisualDecisionIds, {
        hasActiveCanvasProposal: Boolean(
          activeThreadCodeProposalSetId ||
            activeThreadFeatureDraftId ||
            (activeThreadProposalSetId && !activeThreadProposalSetIsHistory),
        ),
        hasSavedMockups: activeProjectHasSavedMockups,
        projectEmptyStatus: activeProjectEmptyStatus,
      }),
    [
      activeProjectEmptyStatus,
      activeProjectHasSavedMockups,
      activeThreadCodeProposalSetId,
      activeThreadFeatureDraftId,
      activeThreadProposalSetId,
      activeThreadProposalSetIsHistory,
      activeThread,
      dismissedVisualDecisionIds,
    ],
  );

  function preferredLivePreviewSelection(
    projectId: string,
    threadId: string | null,
  ): InspectorSelection {
    const activeLiveProposal =
      threadId != null ? latestActiveLiveProposalForThread(desktop, threadId) : null;
    if (activeLiveProposal && activeLiveProposal.projectId === projectId) {
      return {
        type: "planPreview",
        projectId,
        proposalTurnId: activeLiveProposal.turnId,
      };
    }
    const featureDraftId =
      threadId != null
        ? desktop.featureDraftActiveIdsByThreadId[threadId]?.trim() || ""
        : "";
    const featureDraft = featureDraftId
      ? desktop.featureDrafts[featureDraftId]
      : null;
    if (featureDraftIsActiveForRouting(featureDraft ?? null, projectId)) {
      return {
        type: "draftPreview",
        projectId,
        draftId: featureDraftId,
      };
    }
    const codeProposalSetId =
      threadId != null
        ? desktop.codeProposalActiveSetIdsByThreadId[threadId]?.trim() || ""
        : "";
    if (codeProposalSetId) {
      return {
        type: "codeProposalPreview",
        projectId,
        proposalSetId: codeProposalSetId,
      };
    }
    const compareCodeProposalSetId =
      threadId != null
        ? desktop.codeProposalCompareSetIdsByThreadId[threadId]?.trim() || ""
        : "";
    if (compareCodeProposalSetId) {
      return {
        type: "codeProposalPreview",
        projectId,
        proposalSetId: compareCodeProposalSetId,
      };
    }
    const proposalSetId =
      threadId != null
        ? desktop.mockupActiveProposalSetIdsByThreadId[threadId]?.trim() || ""
        : "";
    if (
      proposalSetId &&
      !desktop.mockupHistoryProposalSetIds[proposalSetId]
    ) {
      return {
        type: "mockupPreview",
        projectId,
        proposalSetId,
      };
    }
    return {
      type: "appPreview",
      projectId,
    };
  }
  const activeDraft = activeDraftProjectId
    ? (chatDrafts[activeDraftProjectId] ?? null)
    : null;
  const activeTurnState = activeTurn(activeThread);
  const activeWorkspaceProgress = useWorkspaceProgress(
    activeProject,
    activeTurnState,
  );
  const fileChangeItems = mergeThreadFileChanges(activeThread);
  const currentSettings = activeProject?.settings ?? defaultSettings;
  const promptReady = hasDraftContent({
    text: composerText,
    attachments,
    contexts: activeComposerContexts,
  });
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
      .filter((thread) =>
        sameRuntimePath(thread.cwd, project.path, runtime.backendMode),
      )
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
    autoConnect: runtime.autoConnect && runtimeReady,
    onNotification: handleNotification,
    onServerRequest: handleServerRequest,
  });

  useEffect(() => {
    const offNotification = client.onNotification((message) => {
      if (message.method === "account/updated") {
        void refreshSettings(activeProject?.path ?? null);
        return;
      }

      if (message.method !== "account/login/completed") return;
      const params = message.params as
        | AccountLoginCompletedNotification
        | undefined;
      if (!params) return;
      void refreshSettings(activeProject?.path ?? null);
      setAuthDialog((current) => {
        if (!current.open) return current;
        if (params.loginId && current.loginId !== params.loginId) {
          return current;
        }
        if (params.success) {
          return {
            ...current,
            phase: "success",
            loginId: null,
            authUrl: null,
            verificationUrl: null,
            userCode: null,
            apiKey: "",
            error: null,
          };
        }
        return {
          ...current,
          phase: "choose",
          loginId: null,
          authUrl: null,
          verificationUrl: null,
          userCode: null,
          apiKey: "",
          error: params.error ?? "Codex login did not complete.",
        };
      });
    });
    return () => {
      offNotification();
    };
  }, [activeProject?.path, client, refreshSettings]);

  useEffect(() => {
    if (!activeProject || !activeThreadProposalSetId) return;
    if (mockupPreviewSets[activeThreadProposalSetId]) return;
    void loadMockupsForProject(
      activeProject.id,
      activeThreadProposalSetId,
      false,
      false,
    );
  }, [
    activeProject?.id,
    activeProject?.path,
    activeThreadProposalSetId,
    mockupPreviewSets,
  ]);

  const { documentText, documentError } = useDocumentPreview(client, inspector);
  const missingOpenAiAuth = Boolean(
    snapshot.account?.requiresOpenaiAuth && !snapshot.account.account,
  );
  const sendDisabledReason = sendBlockReason({
    activeProject,
    connectionStatus,
    missingOpenAiAuth,
    hasUnsupportedAttachments: unsupportedAttachments(attachments).length > 0,
    pendingApprovals,
    promptReady,
    sendStarting,
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
        [response.thread.id]: mergeThreadWithLocalState(
          response.thread,
          current[response.thread.id],
        ),
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
                sameRuntimePath(thread.cwd, cwd, runtime.backendMode) &&
                !listedIds.has(threadId) &&
                !shouldPreserveLocalThreadDuringRefresh(thread)
              ) {
                delete next[threadId];
              }
            }
          }
          for (const thread of response.data) {
            const existing = next[thread.id];
            next[thread.id] = mergeThreadWithLocalState(thread, existing);
          }
          return next;
        });
        setDesktop((current) => {
          if (!cwd) return current;
          const project = current.projects.find(
            (item) =>
              item.id === current.activeProjectId &&
              sameRuntimePath(item.path, cwd, runtime.backendMode),
          );
          if (!project) return current;
          if (
            activeDraftProjectIdRef.current === project.id ||
            pendingSendProjectIdRef.current === project.id
          ) {
            return current;
          }
          const preferredActiveThreadId =
            justStartedThreadIdRef.current &&
            isKnownThreadForCwd(
              threadsRef.current,
              justStartedThreadIdRef.current,
              cwd,
              runtime.backendMode,
            )
              ? justStartedThreadIdRef.current
              : activeThreadIdRef.current &&
                  isKnownThreadForCwd(
                    threadsRef.current,
                    activeThreadIdRef.current,
                    cwd,
                    runtime.backendMode,
                  )
                ? activeThreadIdRef.current
                : null;
          const activeStillExists =
            current.activeThreadId !== null &&
            (listedIds.has(current.activeThreadId) ||
              isKnownThreadForCwd(
                threadsRef.current,
                current.activeThreadId,
                cwd,
                runtime.backendMode,
              ));
          const lastStillExists =
            project.lastActiveThreadId !== null &&
            (listedIds.has(project.lastActiveThreadId) ||
              isKnownThreadForCwd(
                threadsRef.current,
                project.lastActiveThreadId,
                cwd,
                runtime.backendMode,
              ));
          const nextThreadId =
            (runningTurnIdRef.current &&
            current.activeThreadId &&
            isKnownThreadForCwd(
              threadsRef.current,
              current.activeThreadId,
              cwd,
              runtime.backendMode,
            )
              ? current.activeThreadId
              : null) ??
            preferredActiveThreadId ??
            (activeStillExists
              ? current.activeThreadId
              : lastStillExists
                ? project.lastActiveThreadId
                : null);
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
    [client, runtime.backendMode],
  );

  useEffect(() => {
    refreshThreadsRef.current = refreshThreads;
  }, [refreshThreads]);

  useEffect(() => {
    syncThreadRef.current = syncThread;
  }, [syncThread]);

  useEffect(() => {
    desktopRef.current = desktop;
    const timer = window.setTimeout(() => {
      saveDesktopState(desktop);
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
    saveDismissedVisualDecisionIds(dismissedVisualDecisionIds);
  }, [dismissedVisualDecisionIds]);

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

    const maxWidth = maxInspectorWidthForShell(shellWidth, previewFocused);
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
  }, [desktop.layout.inspectorOpen, previewFocused, shellWidth]);

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
    const previousThreadId = previousActiveThreadIdRef.current;
    previousActiveThreadIdRef.current = desktop.activeThreadId;
    if (previousThreadId === desktop.activeThreadId) return;
    if (!desktop.activeProjectId) return;
    const projectId = desktop.activeProjectId;
    let shouldResetToLive = false;
    setInspector((current) => {
      if (
        current.type !== "mockupPreview" &&
        current.type !== "draftPreview" &&
        current.type !== "codeProposalPreview"
      ) {
        return current;
      }
      const nextSelection = preferredLivePreviewSelection(
        projectId,
        desktop.activeThreadId,
      );
      shouldResetToLive = nextSelection.type === "mockupPreview";
      return nextSelection;
    });
    if (shouldResetToLive) {
      setMockupPreviewLiveResetToken((value) => value + 1);
    }
  }, [desktop.activeProjectId, desktop.activeThreadId]);

  useEffect(() => {
    activeDraftProjectIdRef.current = activeDraftProjectId;
  }, [activeDraftProjectId]);

  useEffect(() => {
    setInspector((current) => {
      if (
        current.type !== "appPreview" &&
        current.type !== "mockupPreview" &&
        current.type !== "draftPreview" &&
        current.type !== "codeProposalPreview"
      ) {
        return current;
      }
      if (!desktop.activeProjectId) return { type: "empty" };
      if (current.projectId === desktop.activeProjectId) return current;
      if (
        current.type === "mockupPreview" ||
        current.type === "draftPreview" ||
        current.type === "codeProposalPreview"
      ) {
        return { type: "empty" };
      }
      return { type: "appPreview", projectId: desktop.activeProjectId };
    });
  }, [desktop.activeProjectId]);

  useEffect(() => {
    if (inspector.type !== "planPreview") return;
    const proposal = desktop.planProposals[inspector.proposalTurnId];
    if (proposal?.status === "pending" && proposal.previewSpec) return;
    if (
      proposal?.proposalKind === "live_proposal" &&
      proposal.status === "accepted" &&
      proposal.previewSpec
    ) {
      return;
    }
    const projectId =
      proposal?.projectId && desktop.projects.some((project) => project.id === proposal.projectId)
        ? proposal.projectId
        : desktop.activeProjectId;
    if (!projectId) {
      setInspector({ type: "empty" });
      return;
    }
    const nextSelection = preferredLivePreviewSelection(
      projectId,
      proposal?.threadId ?? desktop.activeThreadId,
    );
    if (nextSelection.type === "mockupPreview") {
      setMockupPreviewLiveResetToken((value) => value + 1);
    }
    setInspector(nextSelection);
  }, [
    desktop.activeProjectId,
    desktop.activeThreadId,
    desktop.planProposals,
    desktop.projects,
    inspector,
  ]);

  useEffect(() => {
    if (inspector.type !== "mockupPreview") return;
    const activeLiveProposal =
      desktop.activeThreadId != null
        ? latestActiveLiveProposalForThread(desktop, desktop.activeThreadId)
        : null;
    if (
      !activeLiveProposal?.previewSpec ||
      activeLiveProposal.projectId !== inspector.projectId
    ) {
      return;
    }
    setInspector({
      type: "planPreview",
      projectId: activeLiveProposal.projectId,
      proposalTurnId: activeLiveProposal.turnId,
    });
  }, [desktop, inspector]);

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
      if (
        current.type === "appPreview" ||
        current.type === "mockupPreview" ||
        current.type === "draftPreview" ||
        current.type === "codeProposalPreview" ||
        current.type === "planPreview"
      ) {
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
    if (!activeDraftProjectId) return;
    setChatDrafts((current) => {
      const existing = current[activeDraftProjectId];
      const project = desktop.projects.find(
        (candidate) => candidate.id === activeDraftProjectId,
      );
      if (!existing && !project) return current;
      const base = existing ?? createChatDraft(project as Project);
      const draftContexts = composerContextsForProject(
        composerContexts,
        activeDraftProjectId,
      );
      if (
        base.text === composerText &&
        base.attachments === attachments &&
        sameComposerContextList(base.contexts, draftContexts)
      ) {
        return current;
      }
      return {
        ...current,
        [activeDraftProjectId]: {
          ...base,
          text: composerText,
          attachments,
          contexts: draftContexts,
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
        if (
          activeDraftProjectIdRef.current === activeProject.id ||
          pendingSendProjectIdRef.current === activeProject.id
        ) {
          return;
        }
        const activeProjectIndex = projectsToRefresh.findIndex(
          (project) => project.id === activeProject.id,
        );
        const listedThreads =
          activeProjectIndex === -1
            ? []
            : listedThreadGroups[activeProjectIndex];
        const listedThreadIds = new Set(
          listedThreads.map((thread) => thread.id),
        );
        const activeThreadStillExists =
          activeThreadIdAtRefreshStart !== null &&
          (listedThreadIds.has(activeThreadIdAtRefreshStart) ||
            isKnownThreadForCwd(
              threadsRef.current,
              activeThreadIdAtRefreshStart,
              activeProject.path,
              runtime.backendMode,
            ));
        const lastThreadStillExists =
          activeProject.lastActiveThreadId !== null &&
          listedThreadIds.has(activeProject.lastActiveThreadId);
        const threadId = activeThreadStillExists
          ? activeThreadIdAtRefreshStart
          : lastThreadStillExists
            ? activeProject.lastActiveThreadId
            : null;
        if (
          activeDraftProjectIdRef.current === activeProject.id ||
          pendingSendProjectIdRef.current === activeProject.id
        ) {
          return;
        }
        if (
          justStartedThreadIdRef.current &&
          isKnownThreadForCwd(
            threadsRef.current,
            justStartedThreadIdRef.current,
            activeProject.path,
            runtime.backendMode,
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
  }, [
    activeDraftProjectId,
    activeProject?.id,
    activeProject?.path,
    connectionStatus,
    refreshThreads,
    visibleProjects,
  ]);

  function handleTurnCompleted(threadId: string, turn: Turn) {
    const draft = inFlightDraftsRef.current.get(turn.id);
    if (!draft) return;
    inFlightDraftsRef.current.delete(turn.id);
    if (turn.status === "failed" || turn.status === "interrupted") {
      setRetryDraft(draft);
      if (draft.featureDraftId) {
        setDesktop((current) => {
          const stored = current.featureDrafts[draft.featureDraftId ?? ""];
          if (!stored) return current;
          return {
            ...current,
            featureDrafts: {
              ...current.featureDrafts,
              [stored.draftId]: {
                ...stored,
                status: "failed",
                updatedAt: Date.now(),
              },
            },
          };
        });
      }
      return;
    }
    setSendError(null);
    setRetryDraft((current) => (current === draft ? null : current));
    const project = desktopRef.current.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (project) {
      void refreshProjectEmptyStatus(project);
    }
    const targetProposalSetId = draft.proposalSetId?.trim() || "";
    const targetFeatureDraftId = draft.featureDraftId?.trim() || "";
    if (draft.featureDraftOnComplete && targetFeatureDraftId && project) {
      void finalizeFeatureDraftTurn(
        project.id,
        targetFeatureDraftId,
        threadId,
        turn.id,
        draft.visiblePrompt?.trim() || draft.prompt,
      );
      return;
    }
    if (draft.featureDraftBuildOnComplete && targetFeatureDraftId) {
      setDesktop((current) =>
        markFeatureDraftBuilt(current, targetFeatureDraftId),
      );
      if (project) {
        void desktopInvoke("draft_workspace_update_lifecycle", {
          projectPath: project.path,
          draftId: targetFeatureDraftId,
          status: "built",
          goal:
            desktopRef.current.featureDrafts[targetFeatureDraftId]
              ?.originalPrompt ?? "Draft",
          currentSummary: "Built into Live.",
          buildPlan: ["Built into Live."],
        })?.catch(() => null);
        void refreshProjectEmptyStatus(project);
        openPreviewInspector(project.id);
      }
    }
    if (draft.codeProposalOnComplete && targetProposalSetId && project) {
      void finalizeCodeProposalTurn(
        project.id,
        targetProposalSetId,
        turn.id,
        draft.visiblePrompt?.trim() || draft.prompt,
      );
      return;
    }
    if (draft.codeProposalHistoryOnComplete && targetProposalSetId) {
      setDesktop((current) =>
        markCodeProposalSetAsApplied(current, targetProposalSetId),
      );
      if (project) {
        void refreshProjectEmptyStatus(project);
        openCodeProposalInspector(project.id, targetProposalSetId);
      }
    }
    if (draft.settings.planMode || draft.liveOverlayProposalOnComplete) {
      const finalText = finalAgentText(turn);
      const previewSpec = parsePlanPreviewSpec(finalText);
      const visiblePrompt = draft.visiblePrompt?.trim() || draft.prompt;
      setDesktop((current) => {
        const proposal = current.planProposals[turn.id];
        if (!proposal) return current;
        const liveProposalBacking = draft.liveOverlayProposalOnComplete
          ? liveProposalBackingForPreviewSpec(
              previewSpec,
              previewSpec?.variants[0]?.id ??
                proposal.previewSelectedVariantId ??
                null,
            )
          : proposal.proposalBacking;
        return {
          ...current,
          planProposals: {
            ...current.planProposals,
            [turn.id]: {
              ...proposal,
              prompt: visiblePrompt,
              previewSpec,
              previewSelectedVariantId:
                previewSpec?.variants[0]?.id ??
                proposal.previewSelectedVariantId ??
                null,
              proposalKind: draft.liveOverlayProposalOnComplete
                ? "live_proposal"
                : classifyPlanProposalKind(
                    visiblePrompt,
                    finalText,
                  ),
              proposalBacking: draft.liveOverlayProposalOnComplete
                ? liveProposalBacking
                : proposal.proposalBacking,
              buildStrategy:
                draft.liveOverlayProposalOnComplete && liveProposalBacking
                  ? buildStrategyForProposalBacking(liveProposalBacking)
                  : proposal.buildStrategy,
              updatedAt: Date.now(),
            },
          },
        };
      });
      if (draft.liveOverlayProposalOnComplete && previewSpec && project) {
        setInspector({
          type: "planPreview",
          projectId: project.id,
          proposalTurnId: turn.id,
        });
        setDesktop((current) => ({
          ...current,
          layout: { ...current.layout, inspectorOpen: true },
        }));
      }
    }
    if (draft.mockupHistoryOnComplete && targetProposalSetId) {
      setDesktop((current) =>
        markMockupProposalSetAsHistory(current, targetProposalSetId),
      );
      if (project) {
        openPreviewInspector(project.id);
      }
    }
    const changedSavedMockups = turnTouchesSavedMockups(turn);
    const completedMockupBuildTurn = Boolean(
      draft.mockupHistoryOnComplete && targetProposalSetId,
    );
    const savedMockupArtifactTurn =
      !isLiveOverlayProposalPrompt(draft.prompt) &&
      isSavedMockupArtifactRequest(draft.prompt);
    const activatesSavedMockupDecision =
      !completedMockupBuildTurn &&
      (draft.openMockupsOnComplete ||
        isMockupGenerationPrompt(draft.prompt) ||
        isMockupReviewPrompt(draft.prompt) ||
        savedMockupArtifactTurn);
    if (
      !completedMockupBuildTurn &&
      (activatesSavedMockupDecision ||
        isMockupGenerationPrompt(draft.prompt) ||
        isMockupReviewPrompt(draft.prompt) ||
        savedMockupArtifactTurn ||
        changedSavedMockups)
    ) {
      if (activatesSavedMockupDecision && targetProposalSetId) {
        setDesktop((current) => ({
          ...current,
          mockupActiveProposalSetIdsByThreadId: {
            ...current.mockupActiveProposalSetIdsByThreadId,
            [threadId]: targetProposalSetId,
          },
          mockupHistoryProposalSetIds: {
            ...current.mockupHistoryProposalSetIds,
            [targetProposalSetId]: false,
          },
        }));
      }
      void loadMockupsForProject(
        draft.projectId,
        targetProposalSetId,
        activatesSavedMockupDecision,
        activatesSavedMockupDecision ||
          isMockupGenerationPrompt(draft.prompt) ||
          isSavedMockupArtifactRequest(draft.prompt),
      );
      return;
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

  function openPreviewInspector(projectId: string) {
    setInspector({ type: "appPreview", projectId });
    setDesktop((current) => ({
      ...current,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(
          current.layout.inspectorWidth,
          preferredPreviewInspectorWidth(),
        ),
      },
    }));
  }

  function openMockupInspector(projectId: string, proposalSetId: string) {
    setInspector({ type: "mockupPreview", projectId, proposalSetId });
    setDesktop((current) => ({
      ...current,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(
          current.layout.inspectorWidth,
          preferredPreviewInspectorWidth(),
        ),
      },
    }));
  }

  function openCodeProposalInspector(projectId: string, proposalSetId: string) {
    setInspector({ type: "codeProposalPreview", projectId, proposalSetId });
    setDesktop((current) => ({
      ...current,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(
          current.layout.inspectorWidth,
          preferredPreviewInspectorWidth(),
        ),
      },
    }));
  }

  function openFeatureDraftInspector(projectId: string, draftId: string) {
    setInspector({ type: "draftPreview", projectId, draftId });
    setDesktop((current) => ({
      ...current,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(
          current.layout.inspectorWidth,
          preferredPreviewInspectorWidth(),
        ),
      },
    }));
  }

  async function prepareFeatureDraft(
    project: Project,
    draftId: string,
    originalPrompt: string,
  ) {
    const prepared = await desktopInvoke<PreparedDraftWorkspace>(
      "draft_workspace_prepare",
      {
        projectPath: project.path,
        draftId,
        threadId: activeThread?.id ?? null,
        name: featureDraftName(originalPrompt),
        goal: originalPrompt,
        currentSummary:
          "Draft workspace prepared; Live source remains unchanged until Build this.",
        buildPlan: [
          "Review the draft in context.",
          "Build this only after the draft is accepted.",
        ],
      },
    );
    if (!prepared) {
      throw new Error("Could not prepare a draft workspace.");
    }
    const now = Date.now();
    const draft: FeatureDraft = {
      draftId: prepared.draftId,
      registryId: prepared.registryId,
      projectId: project.id,
      threadId: activeThread?.id ?? prepared.threadId ?? null,
      turnId: null,
      name: prepared.name || "Draft",
      slug: prepared.slug,
      lifecycle: prepared.status,
      status: "generating",
      rootPath: prepared.rootPath,
      workspacePath: prepared.workspacePath,
      previewOwnerId: prepared.previewOwnerId,
      affectedRoutes: prepared.affectedRoutes ?? [],
      mockAssumptions: prepared.mockAssumptions ?? [],
      briefPath: prepared.briefPath,
      originalPrompt,
      summary: "Generating draft.",
      changedFiles: [],
      createdAt: prepared.createdAt || now,
      updatedAt: prepared.updatedAt || now,
    };
    setDesktop((current) => ({
      ...current,
      featureDrafts: {
        ...current.featureDrafts,
        [draft.draftId]: draft,
      },
    }));
    return draft;
  }

  async function finalizeFeatureDraftTurn(
    projectId: string,
    draftId: string,
    threadId: string,
    turnId: string,
    latestPrompt?: string,
  ) {
    const stored = desktopRef.current.featureDrafts[draftId];
    if (!stored) return;
    const project = desktopRef.current.projects.find(
      (candidate) => candidate.id === projectId,
    );
    try {
      const diff = await desktopInvoke<DraftWorkspaceDiffResult>(
        "draft_workspace_diff",
        {
          projectPath: project?.path,
          draftId,
        },
      );
      if (!diff) throw new Error("Draft diff was unavailable.");
      const changedFiles = diff.changedFiles ?? [];
      const summary = codeProposalChangeSummary(changedFiles);
      void desktopInvoke("draft_workspace_update_brief", {
        projectPath: project?.path,
        draftId,
        goal: latestPrompt?.trim() || stored.originalPrompt,
        currentSummary: summary,
        affectedRoutes: stored.affectedRoutes,
        mockAssumptions: stored.mockAssumptions,
        buildPlan: [
          "Review the draft in the real app context.",
          "Use Build this to update Live when ready.",
        ],
      })?.catch(() => null);
      setDesktop((current) => {
        const currentDraft = current.featureDrafts[draftId];
        if (!currentDraft) return current;
        return {
          ...current,
          featureDrafts: {
            ...current.featureDrafts,
            [draftId]: {
              ...currentDraft,
              threadId,
              turnId,
              lifecycle: diff.status ?? currentDraft.lifecycle,
              status: "ready",
              previewOwnerId: diff.previewOwnerId || currentDraft.previewOwnerId,
              originalPrompt:
                latestPrompt?.trim() || currentDraft.originalPrompt,
              summary,
              changedFiles,
              updatedAt: Date.now(),
            },
          },
          featureDraftActiveIdsByThreadId: {
            ...current.featureDraftActiveIdsByThreadId,
            [threadId]: draftId,
          },
        };
      });
      openFeatureDraftInspector(projectId, draftId);
    } catch (error) {
      setSendError(`Could not finalize draft: ${errorMessage(error)}`);
      setDesktop((current) => {
        const currentDraft = current.featureDrafts[draftId];
        if (!currentDraft) return current;
        return {
          ...current,
          featureDrafts: {
            ...current.featureDrafts,
            [draftId]: {
              ...currentDraft,
              status: "failed",
              error: errorMessage(error),
              updatedAt: Date.now(),
            },
          },
        };
      });
    }
  }

  async function buildFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (!project) {
      setSendError("That draft belongs to a project that is no longer available.");
      return;
    }
    if (draft.lifecycle !== "active") {
      setSendError("Resume the draft before building it.");
      return;
    }
    if (draft.status !== "ready" || draft.changedFiles.length === 0) {
      setSendError("Wait for the draft to finish before building it.");
      return;
    }
    setSendError(null);
    setDesktop((current) => {
      const stored = current.featureDrafts[draft.draftId];
      if (!stored) return current;
      return {
        ...current,
        featureDrafts: {
          ...current.featureDrafts,
          [draft.draftId]: {
            ...stored,
            status: "building",
            updatedAt: Date.now(),
          },
        },
      };
    });
    const sent = await sendDraft(
      {
        prompt: featureDraftBuildPrompt(draft, project),
        visiblePrompt: "Build this.",
        projectId: project.id,
        settings: { ...project.settings, planMode: false },
        attachments: [],
        contexts: [],
        createdAt: Date.now(),
        localDraftProjectId: null,
        targetThreadId: draft.threadId,
        featureDraftBuildOnComplete: true,
        featureDraftId: draft.draftId,
      },
      { clearComposer: false, desktopOverride: desktop },
    );
    if (!sent) {
      setDesktop((current) => {
        const stored = current.featureDrafts[draft.draftId];
        if (!stored) return current;
        return {
          ...current,
          featureDrafts: {
            ...current.featureDrafts,
            [draft.draftId]: {
              ...stored,
              status: stored.changedFiles.length > 0 ? "ready" : "failed",
              updatedAt: Date.now(),
            },
          },
        };
      });
    }
  }

  async function parkFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (!project) {
      setSendError("That draft belongs to a project that is no longer available.");
      return;
    }
    setSendError(null);
    try {
      void desktopInvoke("app_preview_stop", {
        projectPath: draft.workspacePath,
      })?.catch(() => null);
      await desktopInvoke<PreparedDraftWorkspace>(
        "draft_workspace_update_lifecycle",
        {
          projectPath: project.path,
          draftId: draft.draftId,
          status: "parked",
          goal: draft.originalPrompt,
          currentSummary: draft.summary,
          buildPlan: [
            "Draft parked for later review.",
            "Resume before revising or building.",
          ],
        },
      );
    } catch (error) {
      setSendError(`Could not park draft: ${errorMessage(error)}`);
      return;
    }
    setDesktop((current) => parkFeatureDraftInState(current, draft.draftId));
    if (inspector.type === "draftPreview" && inspector.draftId === draft.draftId) {
      openPreviewInspector(project.id);
    }
  }

  async function resumeFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (!project) {
      setSendError("That draft belongs to a project that is no longer available.");
      return;
    }
    const threadId = draft.threadId ?? desktop.activeThreadId;
    if (!threadId) {
      setSendError("Open the draft's chat before resuming it.");
      return;
    }
    setSendError(null);
    try {
      await desktopInvoke<PreparedDraftWorkspace>(
        "draft_workspace_update_lifecycle",
        {
          projectPath: project.path,
          draftId: draft.draftId,
          status: "active",
          goal: draft.originalPrompt,
          currentSummary: draft.summary,
          buildPlan: [
            "Draft resumed for review.",
            "Use Build this to update Live when ready.",
          ],
        },
      );
    } catch (error) {
      setSendError(`Could not resume draft: ${errorMessage(error)}`);
      return;
    }
    setDesktop((current) =>
      resumeFeatureDraftInState(current, draft.draftId, threadId),
    );
    openFeatureDraftInspector(project.id, draft.draftId);
  }

  async function discardFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    setSendError(null);
    try {
      void desktopInvoke("app_preview_stop", {
        projectPath: draft.workspacePath,
      })?.catch(() => null);
      await desktopInvoke<PreparedDraftWorkspace>(
        "draft_workspace_update_lifecycle",
        {
          projectPath: project?.path,
          draftId: draft.draftId,
          status: "discarded",
          goal: draft.originalPrompt,
          currentSummary: draft.summary,
          buildPlan: ["Draft discarded."],
        },
      );
    } catch (error) {
      setSendError(`Could not discard draft: ${errorMessage(error)}`);
      return;
    }
    setDesktop((current) => ({
      ...current,
      featureDrafts: {
        ...current.featureDrafts,
        [draft.draftId]: {
          ...draft,
          lifecycle: "discarded",
          updatedAt: Date.now(),
        },
      },
      featureDraftActiveIdsByThreadId: Object.fromEntries(
        Object.entries(current.featureDraftActiveIdsByThreadId).filter(
          ([, activeDraftId]) => activeDraftId !== draft.draftId,
        ),
      ),
    }));
    if (project) {
      openPreviewInspector(project.id);
    } else {
      setInspector({ type: "empty" });
    }
  }

  function selectCodeProposal(proposalSetId: string, optionId: "A" | "B" | "C") {
    setDesktop((current) => {
      const previewSet = current.codeProposalSets[proposalSetId];
      if (!previewSet) return current;
      return {
        ...current,
        codeProposalSets: {
          ...current.codeProposalSets,
          [proposalSetId]: {
            ...previewSet,
            selectedOptionId: optionId,
            updatedAt: Date.now(),
          },
        },
      };
    });
  }

  async function prepareCodeProposalSet(
    project: Project,
    proposalSetId: string,
    optionIds: Array<"A" | "B" | "C">,
    originalPrompt: string,
  ) {
    const prepared = await desktopInvoke<PreparedProposalWorkspaces>(
      "proposal_workspaces_prepare",
      {
        projectPath: project.path,
        proposalSetId,
        optionIds,
      },
    );
    if (!prepared) {
      throw new Error("Could not prepare proposal workspaces.");
    }
    const now = Date.now();
    const previewSet: CodeProposalSet = {
      proposalSetId: prepared.proposalSetId,
      registryId: prepared.registryId,
      projectId: project.id,
      threadId: activeThread?.id ?? null,
      turnId: null,
      proposalBacking: "code_backed_workspace",
      buildStrategy: "promote_code_workspace",
      rootPath: prepared.rootPath,
      originalPrompt,
      selectedOptionId: prepared.options[0]?.id ?? null,
      options: prepared.options.map((option) => ({
        id: option.id,
        title: `Option ${option.id}`,
        summary: "Generating runnable proposal.",
        workspacePath: option.workspacePath,
        previewOwnerId: option.previewOwnerId,
        status: "generating",
        changedFiles: [],
      })),
      status: "generating",
      createdAt: now,
      updatedAt: now,
    };
    setDesktop((current) => ({
      ...current,
      codeProposalSets: {
        ...current.codeProposalSets,
        [previewSet.proposalSetId]: previewSet,
      },
    }));
    return prepared;
  }

  async function prepareAdditionalCodeProposalOption(
    project: Project,
    previewSet: CodeProposalSet,
    request: CodeProposalAddOptionRequest,
  ) {
    const sourceOption = request.sourceOptionId
      ? previewSet.options.find(
          (candidate) => candidate.id === request.sourceOptionId,
        )
      : null;
    const prepared = await desktopInvoke<PreparedProposalWorkspaces>(
      "proposal_workspace_add_option",
      {
        projectPath: project.path,
        proposalSetId: previewSet.proposalSetId,
        optionId: request.optionId,
        sourceWorkspacePath: sourceOption?.workspacePath ?? "",
      },
    );
    const preparedOption = prepared?.options[0] ?? null;
    if (!prepared || !preparedOption) {
      throw new Error("Could not prepare the requested proposal option.");
    }
    const now = Date.now();
    setDesktop((current) => {
      const stored =
        current.codeProposalSets[previewSet.proposalSetId] ?? previewSet;
      const nextOption: CodeProposalOption = {
        id: preparedOption.id,
        title: `Option ${preparedOption.id}`,
        summary: "Generating runnable proposal.",
        workspacePath: preparedOption.workspacePath,
        previewOwnerId: preparedOption.previewOwnerId,
        status: "generating",
        changedFiles: [],
      };
      return {
        ...current,
        codeProposalSets: {
          ...current.codeProposalSets,
          [stored.proposalSetId]: {
            ...stored,
            registryId: prepared.registryId || stored.registryId,
            rootPath: prepared.rootPath || stored.rootPath,
            selectedOptionId: preparedOption.id,
            options: sortCodeProposalOptions([
              ...stored.options.filter(
                (option) => option.id !== preparedOption.id,
              ),
              nextOption,
            ]),
            status: "generating",
            updatedAt: now,
          },
        },
      };
    });
    return prepared;
  }

  async function applyCodeProposal(
    previewSet: CodeProposalSet,
    option: CodeProposalOption,
  ) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === previewSet.projectId,
    );
    if (!project) {
      setSendError(
        "That proposal belongs to a project that is no longer available.",
      );
      return;
    }
    setSendError(null);
    setDesktop((current) => {
      const stored = current.codeProposalSets[previewSet.proposalSetId];
      if (!stored) return current;
      return {
        ...current,
        codeProposalSets: {
          ...current.codeProposalSets,
          [stored.proposalSetId]: updateCodeProposalOption(stored, option.id, {
            status: "applying",
          }),
        },
      };
    });
    try {
      void desktopInvoke("app_preview_stop", {
        projectPath: option.workspacePath,
      })?.catch(() => null);
      const result = await desktopInvoke<ProposalWorkspaceApplyResult>(
        "proposal_workspace_apply",
        {
          projectPath: project.path,
          workspacePath: option.workspacePath,
        },
      );
      if (!result?.ok) {
        const firstConflict = result?.conflicts?.[0];
        throw new Error(
          firstConflict
            ? `Cannot apply ${firstConflict.path}: ${firstConflict.reason}`
            : "The proposal could not be applied.",
        );
      }
      setDesktop((current) => {
        const stored = current.codeProposalSets[previewSet.proposalSetId];
        if (!stored) return current;
        const updated = updateCodeProposalOption(stored, option.id, {
          status: "applied",
          changedFiles: result.changedFiles,
          appliedAt: Date.now(),
        });
        return {
          ...current,
          codeProposalSets: {
            ...current.codeProposalSets,
            [stored.proposalSetId]: {
              ...updated,
              selectedOptionId: option.id,
              status: "applied",
              updatedAt: Date.now(),
            },
          },
          codeProposalActiveSetIdsByThreadId: removeRecordKey(
            current.codeProposalActiveSetIdsByThreadId,
            stored.threadId,
          ),
          codeProposalCompareSetIdsByThreadId: stored.threadId
            ? {
                ...current.codeProposalCompareSetIdsByThreadId,
                [stored.threadId]: stored.proposalSetId,
              }
            : current.codeProposalCompareSetIdsByThreadId,
        };
      });
      await refreshProjectEmptyStatus(project);
      void desktopInvoke("app_preview_start", {
        projectPath: project.path,
      })?.catch(() => null);
      openCodeProposalInspector(project.id, previewSet.proposalSetId);
    } catch (error) {
      const message = `Could not apply proposal: ${errorMessage(error)}`;
      setSendError(message);
      setDesktop((current) => {
        const stored = current.codeProposalSets[previewSet.proposalSetId];
        if (!stored) return current;
        return {
          ...current,
          codeProposalSets: {
            ...current.codeProposalSets,
            [stored.proposalSetId]: {
              ...updateCodeProposalOption(stored, option.id, {
                status: "ready",
              }),
              status: "failed",
              error: message,
              updatedAt: Date.now(),
            },
          },
        };
      });
    }
  }

  async function finalizeCodeProposalTurn(
    projectId: string,
    proposalSetId: string,
    turnId: string,
    latestPrompt?: string,
  ) {
    const previewSet = desktopRef.current.codeProposalSets[proposalSetId];
    if (!previewSet) return;
    try {
      const diffs = (
        await Promise.all(
        previewSet.options.map((option) =>
          desktopInvoke<ProposalWorkspaceDiffResult>(
            "proposal_workspace_diff",
            { workspacePath: option.workspacePath },
          ),
        ),
        )
      ).filter((diff): diff is ProposalWorkspaceDiffResult => Boolean(diff));
      setDesktop((current) => {
        const stored = current.codeProposalSets[proposalSetId];
        if (!stored) return current;
        const updatedOptions = stored.options.map((option) => {
          const diff = diffs.find((candidate) => candidate.optionId === option.id);
          return {
            ...option,
            previewOwnerId: diff?.previewOwnerId || option.previewOwnerId,
            status: "ready" as const,
            changedFiles: diff?.changedFiles ?? [],
            summary: codeProposalChangeSummary(diff?.changedFiles ?? []),
          };
        });
        return {
          ...current,
          codeProposalSets: {
            ...current.codeProposalSets,
            [proposalSetId]: {
              ...stored,
              turnId,
              originalPrompt: latestPrompt?.trim() || stored.originalPrompt,
              options: updatedOptions,
              selectedOptionId:
                stored.selectedOptionId ?? updatedOptions[0]?.id ?? null,
              status: "ready",
              updatedAt: Date.now(),
            },
          },
          codeProposalActiveSetIdsByThreadId: stored.threadId
            ? {
                ...current.codeProposalActiveSetIdsByThreadId,
                [stored.threadId]: proposalSetId,
              }
            : current.codeProposalActiveSetIdsByThreadId,
          codeProposalCompareSetIdsByThreadId: stored.threadId
            ? {
                ...current.codeProposalCompareSetIdsByThreadId,
                [stored.threadId]: proposalSetId,
              }
            : current.codeProposalCompareSetIdsByThreadId,
        };
      });
      openCodeProposalInspector(projectId, proposalSetId);
    } catch (error) {
      setSendError(`Could not finalize proposal workspaces: ${errorMessage(error)}`);
      setDesktop((current) => {
        const stored = current.codeProposalSets[proposalSetId];
        if (!stored) return current;
        return {
          ...current,
          codeProposalSets: {
            ...current.codeProposalSets,
            [proposalSetId]: {
              ...stored,
              status: "failed",
              error: errorMessage(error),
              updatedAt: Date.now(),
            },
          },
        };
      });
    }
  }

  async function refreshProjectEmptyStatus(
    project: Project,
  ): Promise<ProjectEmptyStatus | null> {
    try {
      const status = await desktopInvoke<ProjectEmptyStatus>(
        "project_empty_status",
        { projectPath: project.path },
      );
      if (!status) return null;
      setProjectEmptyStatusById((current) => ({
        ...current,
        [project.id]: status,
      }));
      return status;
    } catch {
      return null;
    }
  }

  async function loadMockupsForProject(
    projectId: string,
    proposalSetId: string,
    openAfterLoad = false,
    showMissingError = true,
  ) {
    const project =
      desktop.projects.find((candidate) => candidate.id === projectId) ??
      activeProject;
    if (!project || project.id !== projectId) return;
    try {
      const result = await desktopInvoke<MockupsListResult>("mockups_list", {
        projectPath: project.path,
        proposalSetId,
      });
      if (!result) {
        if (showMissingError) {
          setSendError(
            "Codex finished, but saved mockups could not be loaded.",
          );
        }
        return;
      }
      const proposalBacking = proposalBackingForPreviewArtifactKind(
        result.artifactKind,
      );
      const previewSet: MockupPreviewSet = {
        proposalSetId: result.proposalSetId || proposalSetId,
        projectId,
        threadId: result.threadId,
        artifactKind: result.artifactKind,
        proposalBacking,
        buildStrategy:
          proposalBacking === "wireframe_artifact"
            ? "implement_from_wireframe"
            : "implement_from_mockup",
        baseDir: result.baseDir,
        originalPrompt: result.originalPrompt,
        depth: result.depth,
        selectedMockupId: result.selectedMockupId,
        mockups: result.mockups,
      };
      if (previewSet.mockups.length === 0) {
        setMockupPreviewSets((current) => {
          if (!current[proposalSetId]) return current;
          const next = { ...current };
          delete next[proposalSetId];
          return next;
        });
        if (showMissingError) {
          setSendError("Codex finished, but no saved mockups were found.");
        }
        return;
      }
      setMockupPreviewSets((current) => ({
        ...current,
        [previewSet.proposalSetId]: {
          ...previewSet,
          selectedMockupId: selectedMockupIdForLoadedSet(
            previewSet,
            openAfterLoad
              ? null
              : current[previewSet.proposalSetId]?.selectedMockupId,
          ),
        },
      }));
      if (openAfterLoad) {
        openMockupInspector(projectId, previewSet.proposalSetId);
      }
    } catch (error) {
      if (showMissingError) {
        setSendError(`Could not load saved mockups: ${errorMessage(error)}`);
      }
    }
  }

  function selectMockup(proposalSetId: string, mockupId: string) {
    setMockupPreviewSets((current) => {
      const previewSet = current[proposalSetId];
      if (!previewSet) return current;
      return {
        ...current,
        [proposalSetId]: {
          ...previewSet,
          selectedMockupId: mockupId,
        },
      };
    });
  }

  function stageBuildMockup(previewSet: MockupPreviewSet, mockup: SavedMockup) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === previewSet.projectId,
    );
    if (!project) {
      setSendError(
        "That mockup belongs to a project that is no longer available.",
      );
      return;
    }
    setVisualDecisionComposerAction(null);
    setComposerText(`Implement ${mockupVisibleOptionName(mockup)}`);
    setAttachments([]);
    updateProject(project.id, (candidate) => ({
      ...candidate,
        settings: { ...candidate.settings, planMode: false },
      }));
    openMockupInspector(previewSet.projectId, previewSet.proposalSetId);
    if (!desktop.activeThreadId) {
      setActiveDraftProjectId(project.id);
    }
  }

  function stageBuildCodeProposal(
    previewSet: CodeProposalSet,
    option: CodeProposalOption,
  ) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === previewSet.projectId,
    );
    if (!project) {
      setSendError(
        "That proposal belongs to a project that is no longer available.",
      );
      return;
    }
    setVisualDecisionComposerAction(null);
    setComposerText(`Implement option ${option.id}`);
    setAttachments([]);
    selectCodeProposal(previewSet.proposalSetId, option.id);
    updateProject(project.id, (candidate) => ({
      ...candidate,
      settings: { ...candidate.settings, planMode: false },
    }));
    openCodeProposalInspector(previewSet.projectId, previewSet.proposalSetId);
    if (!desktop.activeThreadId) {
      setActiveDraftProjectId(project.id);
    }
    setSendError(null);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus();
    });
  }

  function transferCodeProposalLane(
    previewSet: CodeProposalSet,
    from: "live" | "A" | "B" | "C",
    to: "live" | "A" | "B" | "C",
  ) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === previewSet.projectId,
    );
    if (!project) {
      setSendError(
        "That proposal belongs to a project that is no longer available.",
      );
      return;
    }
    const visiblePrompt =
      to === "live"
        ? `Update Live with option ${from.toUpperCase()}`
        : from === "live"
          ? `Update option ${to.toUpperCase()} from Live`
          : `Update option ${to.toUpperCase()} from option ${from.toUpperCase()}`;
    void sendDraft(
      {
        prompt: visiblePrompt,
        visiblePrompt,
        projectId: project.id,
        settings: project.settings,
        attachments: [],
        contexts: [],
        createdAt: Date.now(),
        targetThreadId: desktop.activeThreadId,
        proposalSetId: previewSet.proposalSetId,
        codeProposalHistoryOnComplete: to === "live",
        codeProposalOnComplete: to !== "live",
      },
      { clearComposer: true },
    );
  }

  function chooseVisualDecisionOption(
    decision: ActiveVisualDecision,
    option: VisualDecisionOption,
  ) {
    const decisionContexts = activeProject
      ? (desktop.sentComposerContextsByTurnId[decision.turnId] ?? []).filter(
          (context) => context.projectId === activeProject.id,
        )
      : [];
    setDismissedVisualDecisionIds((current) => ({
      ...current,
      [decision.id]: true,
    }));
    setVisualDecisionComposerAction({
      decisionId: decision.id,
      option,
    });
    setComposerText(visualDecisionComposerText(option));
    setAttachments([]);
    if (activeProject) {
      setComposerContexts((current) =>
        dedupeComposerContexts([
          ...composerContextsForProject(current, activeProject.id),
          ...decisionContexts,
        ]),
      );
    }
    if (activeProject && !desktop.activeThreadId) {
      setActiveDraftProjectId(activeProject.id);
    }
  }

  function dismissVisualDecision(decision: ActiveVisualDecision) {
    setDismissedVisualDecisionIds((current) => ({
      ...current,
      [decision.id]: true,
    }));
  }

  function showApprovals() {
    inspectorRetargetThreadIdRef.current = null;
    setInspector({ type: "empty" });
    setDesktop((current) => ({
      ...current,
      layout: {
        ...current.layout,
        inspectorOpen: true,
      },
    }));
  }

  function selectAppPreview(project = activeProject) {
    if (!project) {
      setActionError(
        "Add or select a local project before opening App Preview.",
      );
      return;
    }
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    const nextSelection = preferredLivePreviewSelection(
      project.id,
      desktop.activeThreadId,
    );
    if (nextSelection.type === "mockupPreview") {
      setMockupPreviewLiveResetToken((value) => value + 1);
    }
    setInspector(nextSelection);
    inspectorRetargetThreadIdRef.current = null;
    const preferredWidth = preferredPreviewInspectorWidth();
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(current.layout.inspectorWidth, preferredWidth),
      },
    }));
  }

  function toggleAppPreview(project = activeProject) {
    selectAppPreview(project);
  }

  function showPlanUiImpact(proposal: PlanProposal) {
    selectPlanProposalPreview(proposal);
  }

  function selectPlanProposalPreview(proposal: PlanProposal) {
    const latestProposal = desktop.planProposals[proposal.turnId] ?? proposal;
    const project = desktop.projects.find(
      (candidate) => candidate.id === latestProposal.projectId,
    );
    if (!project) {
      setSendError(
        "That plan belongs to a project that is no longer available.",
      );
      return;
    }
    if (!latestProposal.previewSpec) {
      setSendError("That plan does not have a live app preview.");
      return;
    }
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector({
      type: "planPreview",
      projectId: project.id,
      proposalTurnId: latestProposal.turnId,
    });
    inspectorRetargetThreadIdRef.current = null;
    const preferredWidth = preferredPreviewInspectorWidth();
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      activeThreadId: latestProposal.threadId,
      layout: {
        ...current.layout,
        inspectorOpen: true,
        inspectorWidth: Math.max(current.layout.inspectorWidth, preferredWidth),
      },
    }));
  }

  function updatePlanPreviewVariant(proposalTurnId: string, variantId: string) {
    setDesktop((current) => {
      const proposal = current.planProposals[proposalTurnId];
      if (!proposal?.previewSpec) return current;
      if (
        !proposal.previewSpec.variants.some(
          (variant) => variant.id === variantId,
        )
      ) {
        return current;
      }
      const liveProposalBacking =
        proposal.proposalKind === "live_proposal"
          ? liveProposalBackingForPreviewSpec(proposal.previewSpec, variantId)
          : proposal.proposalBacking;
      return {
        ...current,
        planProposals: {
          ...current.planProposals,
          [proposalTurnId]: {
            ...proposal,
            previewSelectedVariantId: variantId,
            proposalBacking:
              proposal.proposalKind === "live_proposal"
                ? liveProposalBacking
                : proposal.proposalBacking,
            buildStrategy:
              proposal.proposalKind === "live_proposal" && liveProposalBacking
                ? buildStrategyForProposalBacking(liveProposalBacking)
                : proposal.buildStrategy,
            previewUserEditedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      };
    });
  }

  function updatePlanPreviewAreaMark(
    proposalTurnId: string,
    areaMark: PlanPreviewAreaMark | null,
  ) {
    setDesktop((current) => {
      const proposal = current.planProposals[proposalTurnId];
      if (!proposal) return current;
      return {
        ...current,
        planProposals: {
          ...current.planProposals,
          [proposalTurnId]: {
            ...proposal,
            previewAreaMark: areaMark,
            previewUserEditedAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      };
    });
  }

  function updatePlanPreviewSession(
    proposalTurnId: string,
    session: PlanPreviewSessionState | null,
  ) {
    setDesktop((current) => {
      const proposal = current.planProposals[proposalTurnId];
      if (!proposal) return current;
      if (samePlanPreviewSession(proposal.previewSession ?? null, session)) {
        return current;
      }
      return {
        ...current,
        planProposals: {
          ...current.planProposals,
          [proposalTurnId]: {
            ...proposal,
            previewSession: session,
            previewBaselineSession:
              proposal.previewBaselineSession ??
              (session?.cleanupStatus === "selected" ? session : null),
            updatedAt: Date.now(),
          },
        },
      };
    });
  }

  function attachAppPreviewMark(
    project: Project,
    areaMark: PlanPreviewAreaMark | null,
    meta: {
      previewUrl: string;
      viewport: "desktop" | "mobile";
      thumbnailDataUrl?: string;
      label?: string;
      source?: ComposerAppPreviewContext["source"];
      highlightId?: string;
    } & CanvasVisualReferenceMeta,
  ) {
    setComposerContexts((current) => {
      if (!areaMark) {
        return current.filter(
          (context) =>
            context.type !== "appPreview" || context.projectId !== project.id,
        );
      }
      const source = meta.source ?? "userMark";
      const existingContext = current.find(
        (context): context is ComposerAppPreviewContext =>
          context.type === "appPreview" &&
          context.projectId === project.id &&
          (source === "proposalHighlight"
            ? context.source === "proposalHighlight" &&
              context.highlightId === meta.highlightId
            : context.areaMark.createdAt === areaMark.createdAt),
      );
      const markNumber =
        existingContext?.markNumber ??
        (source === "proposalHighlight"
          ? nextAppPreviewChangeNumber(current, project.id)
          : nextAppPreviewMarkNumber(current, project.id));
      const highlightLabel =
        source === "proposalHighlight" ? `Change ${markNumber}` : null;
      const nextContext: ComposerAppPreviewContext = {
        type: "appPreview",
        id:
          existingContext?.id ??
          (source === "proposalHighlight"
            ? `app-preview:${project.id}:proposal-highlight:${meta.highlightId ?? areaMark.createdAt}`
            : `app-preview:${project.id}:${areaMark.createdAt}`),
        projectId: project.id,
        projectName: project.name,
        previewUrl: meta.previewUrl,
        viewport: meta.viewport,
        markLabel: highlightLabel ?? existingContext?.markLabel ?? `Mark ${markNumber}`,
        markNumber,
        areaMark,
        thumbnailDataUrl:
          meta.thumbnailDataUrl ?? existingContext?.thumbnailDataUrl,
        source,
        highlightId: meta.highlightId,
        threadId: meta.threadId ?? existingContext?.threadId,
        proposalTurnId:
          meta.proposalTurnId ?? existingContext?.proposalTurnId,
        proposalOptionId:
          meta.proposalOptionId ?? existingContext?.proposalOptionId,
        canvasLane: meta.canvasLane ?? existingContext?.canvasLane,
        canvasId: meta.canvasId ?? existingContext?.canvasId,
        sourceFile: meta.sourceFile ?? existingContext?.sourceFile,
        componentName: meta.componentName ?? existingContext?.componentName,
        screenshotRef: meta.screenshotRef ?? existingContext?.screenshotRef,
        targetResolutionKind:
          meta.targetResolutionKind ?? existingContext?.targetResolutionKind,
        targetResolutionConfidence:
          meta.targetResolutionConfidence ??
          existingContext?.targetResolutionConfidence,
      };
      const withoutCurrentMark = current.filter(
        (context) =>
          context.type !== "appPreview" ||
          context.projectId !== project.id ||
          (source === "proposalHighlight"
            ? context.source !== "proposalHighlight" ||
              context.highlightId !== nextContext.highlightId
            : context.areaMark.createdAt !== areaMark.createdAt),
      );
      return [...withoutCurrentMark, nextContext];
    });
    if (!desktop.activeThreadId) {
      setActiveDraftProjectId(project.id);
    }
    setSendError(null);
  }

  function attachMockupPreviewMark(
    previewSet: MockupPreviewSet,
    mockup: SavedMockup,
    areaMark: PlanPreviewAreaMark,
    meta?: {
      label?: string;
      source?: ComposerMockupPreviewContext["source"];
      viewport?: ComposerMockupPreviewContext["viewport"];
      highlightId?: string;
      thumbnailDataUrl?: string;
    },
  ) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === previewSet.projectId,
    );
    if (!project) {
      setSendError(
        "That mockup belongs to a project that is no longer available.",
      );
      return;
    }
    setComposerContexts((current) => {
      const source = meta?.source ?? "userMark";
      const markNumber =
        source === "proposalHighlight"
          ? nextMockupChangeNumber(
              current,
              previewSet.projectId,
              previewSet.proposalSetId,
              mockup.id,
            )
          : nextMockupMarkNumber(
              current,
              previewSet.projectId,
              previewSet.proposalSetId,
              mockup.id,
            );
      const nextContext: ComposerMockupPreviewContext = {
        type: "mockupPreview",
        id: `mockup-preview:${previewSet.projectId}:${mockup.id}:${meta?.source ?? "userMark"}:${areaMark.createdAt}`,
        projectId: previewSet.projectId,
        projectName: project.name,
        proposalSetId: previewSet.proposalSetId,
        artifactKind: previewSet.artifactKind,
        mockupId: mockup.id,
        mockupLabel: mockup.label || mockup.id,
        mockupTitle: mockup.title,
        markLabel:
          source === "proposalHighlight"
            ? `Change ${markNumber}`
            : `Mark ${markNumber}`,
        markNumber,
        filePath: mockup.filePath,
        viewport: meta?.viewport === "mobile" ? "mobile" : "desktop",
        areaMark,
        thumbnailDataUrl: meta?.thumbnailDataUrl,
        source,
        highlightId: meta?.highlightId,
      };
      const withoutPreviousProposalHighlight =
        meta?.source === "proposalHighlight"
          ? current.filter(
              (context) =>
                context.type !== "mockupPreview" ||
                context.projectId !== previewSet.projectId ||
                context.proposalSetId !== previewSet.proposalSetId ||
                context.mockupId !== mockup.id ||
                context.source !== "proposalHighlight" ||
                context.highlightId !== nextContext.highlightId,
            )
          : current;
      return [...withoutPreviousProposalHighlight, nextContext];
    });
    if (!desktop.activeThreadId) {
      setActiveDraftProjectId(project.id);
    }
    setSendError(null);
  }

  function removeComposerContext(context: ComposerContextReference) {
    setComposerContexts((current) =>
      current.filter(
        (candidate) =>
          candidate.type !== context.type ||
          composerContextIdentity(candidate) !==
            composerContextIdentity(context),
      ),
    );
  }

  function resetMockupProposalHighlights(
    previewSet: MockupPreviewSet,
    mockup: SavedMockup,
    viewport: ComposerMockupPreviewContext["viewport"],
  ) {
    setComposerContexts((current) =>
      current.filter(
        (context) =>
          context.type !== "mockupPreview" ||
          context.projectId !== previewSet.projectId ||
          context.proposalSetId !== previewSet.proposalSetId ||
          context.mockupId !== mockup.id ||
          context.source !== "proposalHighlight" ||
          context.viewport !== viewport,
      ),
    );
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
      current.type === "appPreview"
        ? { type: "appPreview", projectId: project.id }
        : current.type === "mockupPreview" ||
            current.type === "draftPreview" ||
            current.type === "codeProposalPreview"
          ? { type: "empty" }
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
        return (
          loadedThread &&
          sameRuntimePath(loadedThread.cwd, candidate.path, runtime.backendMode)
        );
      }) ??
      activeProject;
    clearActiveDraftSelection();
    setInspector((current) =>
      (current.type === "appPreview" ||
        current.type === "mockupPreview" ||
        current.type === "codeProposalPreview") &&
      projectForThread
        ? preferredLivePreviewSelection(projectForThread.id, threadId)
        : current.type === "appPreview" ||
            current.type === "mockupPreview" ||
            current.type === "codeProposalPreview"
          ? current
          : { type: "empty" },
    );
    setRetryDraft(null);
    setActionError(null);
    setSendError(null);
    activeThreadIdRef.current = threadId;
    setDesktop((current) => {
      const projectId = projectForThread?.id ?? current.activeProjectId;
      if (
        current.activeProjectId === projectId &&
        current.activeThreadId === threadId
      ) {
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
        ? await resumeThread(
            threadId,
            projectForThread,
            projectForThread.settings,
            { select: false },
          )
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
        (stored) =>
          stored.id === projectId && stored.lastActiveThreadId === thread.id,
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
        projects: current.projects.map((stored) =>
          stored.id === projectId
            ? { ...stored, lastActiveThreadId: thread.id }
            : stored,
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
      approvalPolicy:
        settings?.approvalPolicy ?? project.settings.approvalPolicy,
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
    if (!activeProject) {
      setSendError("Add or select a local project before sending.");
      return;
    }
    const visiblePrompt = composerText.trim();
    const planModeWasOn = activeProject.settings.planMode;
    const status = activeProjectEmptyStatus;
    const liveContext = liveAppReviewContext(
      activeProject,
      activeComposerContexts,
    );
    const selectedMockupIsHistory = Boolean(
      selectedMockupPreviewSet &&
        desktop.mockupHistoryProposalSetIds[
          selectedMockupPreviewSet.proposalSetId
        ],
    );
    const selectedCodeProposalSet =
      inspector.type === "codeProposalPreview"
        ? (desktop.codeProposalSets[inspector.proposalSetId] ?? null)
        : activeThreadCodeProposalSetId
          ? (desktop.codeProposalSets[activeThreadCodeProposalSetId] ?? null)
        : null;
    const selectedCodeProposalRoutingSet = codeProposalSetIsActiveForRouting(
      selectedCodeProposalSet,
      activeProject.id,
    )
      ? selectedCodeProposalSet
      : null;
    const activeThreadFeatureDraftId =
      desktop.activeThreadId != null
        ? desktop.featureDraftActiveIdsByThreadId[desktop.activeThreadId]?.trim() ||
          ""
        : "";
    const selectedFeatureDraft =
      inspector.type === "draftPreview"
        ? (desktop.featureDrafts[inspector.draftId] ?? null)
        : activeThreadFeatureDraftId
          ? (desktop.featureDrafts[activeThreadFeatureDraftId] ?? null)
          : null;
    const selectedFeatureDraftRouting = featureDraftIsActiveForRouting(
      selectedFeatureDraft,
      activeProject.id,
    )
      ? selectedFeatureDraft
      : null;
    const activeLiveProposal =
      desktop.activeThreadId != null
        ? latestActiveLiveProposalForThread(desktop, desktop.activeThreadId)
        : null;
    const rawCanvasResolution =
      !planModeWasOn && visiblePrompt
        ? resolveCanvasAction(
            canvasResolverInput({
              activeLiveProposal,
              activeProject,
              activeThreadId: desktop.activeThreadId,
              attachmentsCount: attachments.length,
              contexts: activeComposerContexts,
              desktop,
              inspector,
              liveContext,
              selectedCodeProposalSet,
              selectedMockupIsHistory,
              selectedMockupPreviewSet,
              status,
            }, visiblePrompt),
          )
        : null;
    const forceCodeBackedProposal =
      !visualDecisionComposerAction &&
      !selectedCodeProposalRoutingSet &&
      visiblePrompt &&
      isExplicitCodeBackedProposalRequest(visiblePrompt);
    const canvasResolution =
      forceCodeBackedProposal && rawCanvasResolution
        ? {
            ...rawCanvasResolution,
            action: "CREATE_PROPOSAL" as const,
            wantsOptions:
              rawCanvasResolution.wantsOptions ||
              isExplicitMultiOptionProposalRequest(visiblePrompt),
            backingPreference: "code_backed_workspace" as const,
            buildStrategy: "promote_code_workspace" as const,
            reason:
              "The user explicitly requested runnable proposal workspaces, so Canvas must use isolated code-backed proposals.",
          }
        : rawCanvasResolution;
    const decisionCanvasAction =
      visualDecisionComposerAction?.option.canvasAction ?? null;
    const addCodeProposalOptionRequest =
      selectedCodeProposalRoutingSet &&
      (!visualDecisionComposerAction ||
        decisionCanvasAction === "add_option" ||
        decisionCanvasAction === "replace_option") &&
      canvasResolution?.action === "ADD_OPTION"
        ? {
            optionId:
              canvasResolution.targetOptionId ??
              nextMissingCodeProposalOptionId(selectedCodeProposalRoutingSet) ??
              selectedCodeProposalRoutingSet.selectedOptionId ??
              selectedCodeProposalRoutingSet.options[0]?.id ??
              "A",
            sourceOptionId:
              canvasResolution.sourceOptionId ??
              selectedCodeProposalRoutingSet.selectedOptionId ??
              selectedCodeProposalRoutingSet.options[0]?.id ??
              null,
          }
        : selectedCodeProposalRoutingSet
          ? codeProposalAddOptionRequest(visiblePrompt, selectedCodeProposalRoutingSet)
          : null;
    let prompt = visiblePrompt;
    let settings = { ...activeProject.settings };
    let contexts = [...activeComposerContexts];
    let openMockupsOnComplete = false;
    let liveOverlayProposalOnComplete = false;
    let liveProposalAcceptedForBuildTurnId: string | null = null;
    let codeProposalOnComplete = false;
    let codeProposalHistoryOnComplete = false;
    let featureDraftOnComplete = false;
    let featureDraftBuildOnComplete = false;
    let featureDraftId: string | null = null;
    let mockupHistoryOnComplete = false;
    let proposalSetId: string | null = null;
    let artifactKind: PreviewArtifactKind | null = null;
    let cwdOverride: string | null = null;

    if (
      !visualDecisionComposerAction &&
      !selectedFeatureDraftRouting &&
      canvasResolution?.action === "ASK_USER" &&
      canvasResolution.question
    ) {
      prompt = canvasQuestionPrompt(
        visiblePrompt,
        activeProject,
        status,
        planModeWasOn,
        liveContext,
        canvasResolution,
      );
      settings = { ...settings, planMode: false };
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraft &&
      isFeatureDraftParkRequest(visiblePrompt)
    ) {
      await parkFeatureDraft(selectedFeatureDraft);
      return;
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraft &&
      isFeatureDraftResumeRequest(visiblePrompt)
    ) {
      await resumeFeatureDraft(selectedFeatureDraft);
      return;
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraft &&
      isFeatureDraftDiscardRequest(visiblePrompt)
    ) {
      await discardFeatureDraft(selectedFeatureDraft);
      return;
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraft &&
      isFeatureDraftBuildRequest(visiblePrompt)
    ) {
      await buildFeatureDraft(selectedFeatureDraft);
      return;
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraftRouting &&
      shouldRouteToFeatureDraftPrompt({
        inspectorIsDraft: inspector.type === "draftPreview",
        prompt: visiblePrompt,
      })
    ) {
      featureDraftId = selectedFeatureDraftRouting.draftId;
      cwdOverride = selectedFeatureDraftRouting.workspacePath;
      prompt = featureDraftRevisionPrompt(
        selectedFeatureDraftRouting,
        visiblePrompt,
        liveContext,
      );
      settings = { ...settings, planMode: false };
      featureDraftOnComplete = true;
    } else if (
      !visualDecisionComposerAction &&
      selectedCodeProposalRoutingSet &&
      canvasResolution?.action === "BUILD_SELECTED"
    ) {
      const requestedOptionId =
        canvasResolution.targetOptionId ??
        optionIdFromText(visiblePrompt) ??
        selectedCodeProposalRoutingSet.selectedOptionId ??
        selectedCodeProposalRoutingSet.options[0]?.id ??
        null;
      const option = requestedOptionId
        ? selectedCodeProposalRoutingSet.options.find(
            (candidate) => candidate.id === requestedOptionId,
          )
        : null;
      if (!option) {
        setSendError("Choose a proposal option before applying it.");
        return;
      }
      proposalSetId = selectedCodeProposalRoutingSet.proposalSetId;
      prompt = codeProposalReviewPrompt(
        visiblePrompt,
        activeProject,
        status,
        planModeWasOn,
        liveContext,
        selectedCodeProposalRoutingSet,
        requestedOptionId,
      );
      settings = { ...settings, planMode: false };
      codeProposalHistoryOnComplete = true;
    } else if (
      !visualDecisionComposerAction &&
      selectedCodeProposalRoutingSet &&
      canvasResolution?.action === "REVISE_PROPOSAL"
    ) {
      const requestedOptionId =
        canvasResolution.targetOptionId ??
        optionIdFromText(visiblePrompt) ??
        selectedCodeProposalRoutingSet.selectedOptionId ??
        selectedCodeProposalRoutingSet.options[0]?.id ??
        null;
      proposalSetId = selectedCodeProposalRoutingSet.proposalSetId;
      prompt = codeProposalReviewPrompt(
        visiblePrompt,
        activeProject,
        status,
        planModeWasOn,
        liveContext,
        selectedCodeProposalRoutingSet,
        requestedOptionId,
      );
      settings = { ...settings, planMode: false };
      codeProposalOnComplete = true;
    } else if (selectedCodeProposalRoutingSet && addCodeProposalOptionRequest) {
      proposalSetId = selectedCodeProposalRoutingSet.proposalSetId;
      const codeProposal = await prepareAdditionalCodeProposalOption(
        activeProject,
        selectedCodeProposalRoutingSet,
        addCodeProposalOptionRequest,
      );
      cwdOverride = codeProposal.rootPath;
      prompt = codeProposalAddOptionPrompt(
        visiblePrompt,
        activeProject,
        status,
        planModeWasOn,
        liveContext,
        selectedCodeProposalRoutingSet,
        codeProposal,
        addCodeProposalOptionRequest,
      );
      settings = { ...settings, planMode: false };
      codeProposalOnComplete = true;
    } else if (
      !visualDecisionComposerAction &&
      activeLiveProposal &&
      canvasResolution?.action === "BUILD_SELECTED"
    ) {
      const proposalStaleness = liveProposalBuildStaleness(
        activeLiveProposal,
        activeProject,
      );
      if (proposalStaleness.stale) {
        setSendError(staleProposalBuildMessage(proposalStaleness));
        return;
      }
      liveProposalAcceptedForBuildTurnId = activeLiveProposal.turnId;
      prompt = liveOverlayProposalAcceptPrompt(
        activeLiveProposal,
        planPreviewDecisionSummary(activeLiveProposal),
      );
      settings = { ...settings, planMode: false };
    } else if (
      !visualDecisionComposerAction &&
      activeLiveProposal &&
      canvasResolution?.action === "REVISE_PROPOSAL"
    ) {
      prompt = liveOverlayProposalRevisionPrompt(
        activeLiveProposal,
        visiblePrompt,
        planPreviewDecisionSummary(activeLiveProposal),
      );
      settings = { ...settings, planMode: false };
      liveOverlayProposalOnComplete = true;
    } else if (
      !visualDecisionComposerAction &&
      canvasResolution?.action === "ARCHIVE_PROPOSALS"
    ) {
      setDesktop((current) =>
        archiveCanvasProposalsForThread(current, desktop.activeThreadId),
      );
      prompt = canvasArchivePrompt(visiblePrompt, canvasResolution);
      settings = { ...settings, planMode: false };
    } else if (visualDecisionComposerAction) {
      if (decisionCanvasAction === "start_fresh") {
        setDesktop((current) =>
          archiveCanvasProposalsForThread(current, desktop.activeThreadId),
        );
      }
      const createsCodeProposal =
        visualDecisionOptionCreatesCodeProposal(
          visualDecisionComposerAction.option,
        ) &&
        shouldUseCodeProposalWorkspace(
          [
            visiblePrompt,
            visualDecisionComposerText(visualDecisionComposerAction.option),
            visualDecisionComposerAction.option.prompt,
          ].join(" "),
        );
      const createsLiveOverlay = visualDecisionOptionCreatesLiveOverlay(
        visualDecisionComposerAction.option,
      );
      const createsMockups =
        !createsCodeProposal &&
        !createsLiveOverlay &&
        visualDecisionOptionCreatesMockups(visualDecisionComposerAction.option);
      let codeProposal: PreparedProposalWorkspaces | null = null;
      if (createsCodeProposal) {
        proposalSetId = createProposalSetId(
          activeThread?.id ?? activeProject.id,
        );
        codeProposal = await prepareCodeProposalSet(
          activeProject,
          proposalSetId,
          codeProposalOptionIds(visualDecisionComposerAction.option),
          visiblePrompt || visualDecisionComposerText(visualDecisionComposerAction.option),
        );
        cwdOverride = codeProposal.rootPath;
      }
      if (createsMockups) {
        proposalSetId = createProposalSetId(activeThread?.id ?? activeProject.id);
        artifactKind = visualDecisionArtifactKind(
          visualDecisionComposerAction.option,
        );
      }
      prompt = visualDecisionSelectionPrompt(
        visualDecisionComposerAction,
        visiblePrompt,
        proposalSetId,
        artifactKind,
        activeThread?.id ?? null,
        liveContext,
        codeProposal,
      );
      settings = { ...settings, planMode: false };
      openMockupsOnComplete = createsMockups;
      liveOverlayProposalOnComplete = createsLiveOverlay;
      codeProposalOnComplete = createsCodeProposal;
    } else if (
      selectedMockupPreviewSet &&
      inspector.type === "mockupPreview" &&
      !selectedMockupIsHistory &&
      visiblePrompt
    ) {
      const commitsToLive = isSavedMockupImplementationCommitment(
        visiblePrompt,
      );
      proposalSetId = selectedMockupPreviewSet.proposalSetId;
      artifactKind = selectedMockupPreviewSet.artifactKind;
      prompt = savedMockupReviewPrompt(visiblePrompt, selectedMockupPreviewSet);
      settings = { ...settings, planMode: false };
      openMockupsOnComplete = !commitsToLive;
      mockupHistoryOnComplete = commitsToLive;
    } else if (
      shouldCreateFeatureDraftFromCanvasPrompt({
        backingPreference: canvasResolution?.backingPreference,
        hasActiveProposal: Boolean(
          activeLiveProposal ||
            selectedCodeProposalRoutingSet ||
            (selectedMockupPreviewSet && !selectedMockupIsHistory),
        ),
        hasSelectedPreview:
          inspector.type === "mockupPreview" ||
          inspector.type === "codeProposalPreview" ||
          inspector.type === "planPreview",
        isExistingProject: status?.empty === false,
        planMode: planModeWasOn,
        prompt: visiblePrompt,
        resolutionAction: canvasResolution?.action,
        wantsOptions: canvasResolution?.wantsOptions,
      })
    ) {
      featureDraftId = createFeatureDraftId(activeThread?.id ?? activeProject.id);
      const draftWorkspace = await prepareFeatureDraft(
        activeProject,
        featureDraftId,
        visiblePrompt,
      );
      cwdOverride = draftWorkspace.workspacePath;
      prompt = featureDraftWorkspacePrompt(
        visiblePrompt,
        activeProject,
        status ?? {
          empty: false,
          reason: "",
          meaningfulEntries: [],
          ignoredEntries: [],
        },
        planModeWasOn,
        liveContext,
        draftWorkspace,
      );
      settings = { ...settings, planMode: false };
      featureDraftOnComplete = true;
    } else if (canvasResolution?.action === "CREATE_PROPOSAL") {
      const wantsOptions = canvasResolution.wantsOptions;
      const backing = canvasResolution.backingPreference ?? "live_dom_patch";
      if (backing === "code_backed_workspace") {
        proposalSetId = createProposalSetId(activeThread?.id ?? activeProject.id);
        const codeProposal = await prepareCodeProposalSet(
          activeProject,
          proposalSetId,
          canvasProposalOptionIds(visiblePrompt, wantsOptions),
          visiblePrompt,
        );
        cwdOverride = codeProposal.rootPath;
        prompt = codeProposalWorkspacePrompt(
          visiblePrompt,
          activeProject,
          status ?? {
            empty: false,
            reason: "",
            meaningfulEntries: [],
            ignoredEntries: [],
          },
          wantsOptions,
          planModeWasOn,
          liveContext,
          codeProposal,
          canvasResolution,
        );
        codeProposalOnComplete = true;
      } else if (
        backing === "mockup_artifact" ||
        backing === "wireframe_artifact"
      ) {
        proposalSetId = createProposalSetId(activeThread?.id ?? activeProject.id);
        artifactKind =
          backing === "wireframe_artifact"
            ? "wireframe"
            : explicitPreviewArtifactKind(
                visiblePrompt,
                wantsOptions ? "mockup" : "preview",
              );
        prompt = savedPreviewArtifactPrompt(
          visiblePrompt,
          activeProject,
          status ?? {
            empty: true,
            reason: "",
            meaningfulEntries: [],
            ignoredEntries: [],
          },
          wantsOptions,
          planModeWasOn,
          liveContext,
          proposalSetId,
          artifactKind,
          activeThread?.id ?? null,
          canvasResolution,
        );
        openMockupsOnComplete = true;
      } else {
        prompt = liveOverlayProposalPrompt(
          visiblePrompt,
          activeProject,
          status ?? {
            empty: false,
            reason: "",
            meaningfulEntries: [],
            ignoredEntries: [],
          },
          wantsOptions,
          planModeWasOn,
          liveContext,
          canvasResolution,
        );
        liveOverlayProposalOnComplete = true;
      }
      settings = { ...settings, planMode: false };
    }

    const draft: SubmissionDraft = {
      prompt,
      visiblePrompt,
      projectId: activeProject.id,
      settings,
      attachments: [...attachments],
      contexts,
      createdAt: Date.now(),
      localDraftProjectId:
        activeDraftProjectId === activeProject.id ? activeDraftProjectId : null,
      cwdOverride,
      openMockupsOnComplete,
      liveOverlayProposalOnComplete,
      liveProposalAcceptedForBuildTurnId,
      codeProposalOnComplete,
      codeProposalHistoryOnComplete,
      featureDraftOnComplete,
      featureDraftBuildOnComplete,
      featureDraftId,
      mockupHistoryOnComplete,
      proposalSetId,
      artifactKind,
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
      promptDesktop.projects.find(
        (candidate) => candidate.id === draft.projectId,
      ) ?? activeProject;
    const blocked = sendBlockReason({
      activeProject: project,
      connectionStatus,
      missingOpenAiAuth,
      hasUnsupportedAttachments:
        unsupportedAttachments(draft.attachments).length > 0,
      pendingApprovals,
      promptReady: hasDraftContent({
        text: draft.prompt,
        attachments: draft.attachments,
        contexts: draft.contexts,
      }),
      sendStarting: sendStartingRef.current || sendStarting,
      runningTurnId: runningTurnIdRef.current ?? runningTurnId,
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
      draft.localDraftProjectId === project.id &&
      activeDraftProjectId === project.id;
    sendStartingRef.current = true;
    setSendStarting(true);
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
      const visibleUserPrompt = draft.visiblePrompt?.trim() || userPrompt;
      const promptedWithContext = draft.settings.planMode
        ? promptWithPlanModeContext(userPrompt)
        : promptWithComposerContexts(userPrompt, draft.contexts);
      const promptText = promptWithInspectableFiles(
        promptedWithContext,
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
        response = await startTurn(
          targetThread,
          project,
          draft.settings,
          input,
          draft.cwdOverride,
        );
      } catch (error) {
        if (!isStaleThreadError(error)) throw error;
        forgetThread(targetThread.id);
        const replacementThread = await startThread(project, draft.settings);
        if (!replacementThread) {
          throw new Error("Could not create a replacement chat thread.");
        }
        targetThread = replacementThread;
        response = await startTurn(
          targetThread,
          project,
          draft.settings,
          input,
          draft.cwdOverride,
        );
      }

      const visibleTurn = turnWithOptimisticUserMessage(
        response.turn,
        visibleUserPrompt,
        draft.attachments,
      );
      const now = Date.now();
      const planProposal: PlanProposal | null =
        draft.settings.planMode || draft.liveOverlayProposalOnComplete
        ? {
            id: `${
              draft.liveOverlayProposalOnComplete ? "live-proposal" : "plan"
            }:${response.turn.id}`,
            projectId: project.id,
            threadId: targetThread.id,
            turnId: response.turn.id,
            prompt: visibleUserPrompt,
            contexts: draft.contexts,
            previewSpec: null,
            previewSelectedVariantId: null,
            previewAreaMark: null,
            previewSession: null,
            previewBaselineSession: null,
            previewUserEditedAt: undefined,
            proposalBacking: draft.liveOverlayProposalOnComplete
              ? "mockup_artifact"
              : undefined,
            proposalLifecycle: draft.liveOverlayProposalOnComplete
              ? "shown"
              : undefined,
            buildStrategy: draft.liveOverlayProposalOnComplete
              ? "implement_from_mockup"
              : undefined,
            proposalKind: draft.liveOverlayProposalOnComplete
              ? "live_proposal"
              : "plan",
            status: "pending",
            createdAt: now,
            updatedAt: now,
          }
        : null;

      inFlightDraftsRef.current.set(response.turn.id, {
        ...draft,
        localDraftProjectId: null,
      });
      runningTurnIdRef.current = response.turn.id;
      setRunningTurnId(response.turn.id);
      sendStartingRef.current = false;
      setSendStarting(false);
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
        const sentContextIds = new Set(
          draft.contexts.map(composerContextIdentity),
        );
        setComposerText("");
        setAttachments([]);
        setComposerContexts((current) =>
          sentContextIds.size > 0
            ? current.filter(
                (context) =>
                  !sentContextIds.has(composerContextIdentity(context)),
              )
            : [],
        );
        setVisualDecisionComposerAction(null);
      }
      const targetThreadWithTurn = {
        ...targetThread,
        turns: ensureTurn(targetThread.turns, visibleTurn),
      };
      threadsRef.current = {
        ...threadsRef.current,
        [targetThread.id]: targetThreadWithTurn,
      };
      setThreads((current) => ({
        ...current,
        [targetThread.id]: targetThreadWithTurn,
      }));
      setDesktop((current) => {
        const targetProposalSetId = draft.proposalSetId?.trim() || "";
        const targetFeatureDraftId = draft.featureDraftId?.trim() || "";
        const targetFeatureDraft = targetFeatureDraftId
          ? current.featureDrafts[targetFeatureDraftId]
          : null;
        const next = {
          ...current,
          activeProjectId: project.id,
          activeThreadId: targetThread.id,
          sentComposerContextsByTurnId:
            draft.contexts.length > 0
              ? pruneSentComposerContextsByTurnId({
                  ...current.sentComposerContextsByTurnId,
                  [response.turn.id]: draft.contexts,
                })
              : current.sentComposerContextsByTurnId,
          codeProposalActiveSetIdsByThreadId:
            draft.codeProposalOnComplete && targetProposalSetId
              ? {
                  ...current.codeProposalActiveSetIdsByThreadId,
                  [targetThread.id]: targetProposalSetId,
                }
              : current.codeProposalActiveSetIdsByThreadId,
          codeProposalCompareSetIdsByThreadId:
            draft.codeProposalOnComplete && targetProposalSetId
              ? {
                  ...current.codeProposalCompareSetIdsByThreadId,
                  [targetThread.id]: targetProposalSetId,
                }
              : current.codeProposalCompareSetIdsByThreadId,
          codeProposalSets:
            draft.codeProposalOnComplete && targetProposalSetId
              ? {
                  ...current.codeProposalSets,
                  [targetProposalSetId]: {
                    ...current.codeProposalSets[targetProposalSetId],
                    threadId: targetThread.id,
                    turnId: response.turn.id,
                    updatedAt: Date.now(),
                  },
                }
              : current.codeProposalSets,
          featureDraftActiveIdsByThreadId:
            draft.featureDraftOnComplete && targetFeatureDraftId
              ? {
                  ...current.featureDraftActiveIdsByThreadId,
                  [targetThread.id]: targetFeatureDraftId,
                }
              : current.featureDraftActiveIdsByThreadId,
          featureDrafts:
            (draft.featureDraftOnComplete ||
              draft.featureDraftBuildOnComplete) &&
            targetFeatureDraftId &&
            targetFeatureDraft
              ? {
                  ...current.featureDrafts,
                  [targetFeatureDraftId]: {
                    ...targetFeatureDraft,
                    threadId: targetThread.id,
                    turnId: response.turn.id,
                    status: draft.featureDraftBuildOnComplete
                      ? ("building" as const)
                      : ("generating" as const),
                    updatedAt: Date.now(),
                  },
                }
              : current.featureDrafts,
          mockupActiveProposalSetIdsByThreadId:
            draft.openMockupsOnComplete && targetProposalSetId
              ? {
                  ...current.mockupActiveProposalSetIdsByThreadId,
                  [targetThread.id]: targetProposalSetId,
                }
              : current.mockupActiveProposalSetIdsByThreadId,
          planProposals: planProposal
            ? {
                ...supersedePendingPlanProposals(
                  current.planProposals,
                  targetThread.id,
                  response.turn.id,
                ),
                [response.turn.id]: planProposal,
              }
            : draft.liveProposalAcceptedForBuildTurnId
              ? markLiveProposalAcceptedForBuild(
                  supersedePendingPlanProposals(
                    current.planProposals,
                    targetThread.id,
                    draft.liveProposalAcceptedForBuildTurnId,
                  ),
                  draft.liveProposalAcceptedForBuildTurnId,
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
        };
        return draft.mockupHistoryOnComplete && targetProposalSetId
          ? markMockupProposalSetAsHistory(next, targetProposalSetId)
          : next;
      });
      void pollTurnUntilSettled(
        targetThread.id,
        response.turn.id,
        draft.cwdOverride || project.path,
      );
      return true;
    } catch (error) {
      setRetryDraft(draft);
      setSendError(sendFailureMessage(error));
      sendStartingRef.current = false;
      setSendStarting(false);
      runningTurnIdRef.current = null;
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
      ) ?? activeProject;
    if (!project) {
      setSendError("That plan belongs to a project that is no longer available.");
      return;
    }
    const isLiveProposal = latestProposal.proposalKind === "live_proposal";
    if (isLiveProposal) {
      const proposalStaleness = liveProposalBuildStaleness(
        latestProposal,
        project,
      );
      if (proposalStaleness.stale) {
        setSendError(staleProposalBuildMessage(proposalStaleness));
        return;
      }
    }
    const acceptedPreviewContext = planPreviewDecisionSummary(latestProposal);
    const contexts = isLiveProposal
      ? dedupeComposerContexts([
          ...latestProposal.contexts,
          ...composerContextsForProject(composerContexts, project.id),
        ])
      : latestProposal.contexts;
    const accepted = await sendDraft(
      {
        prompt: isLiveProposal
          ? liveOverlayProposalAcceptPrompt(
              latestProposal,
              acceptedPreviewContext,
            )
          : planProposalAcceptPrompt(acceptedPreviewContext),
        visiblePrompt: isLiveProposal
          ? "Build selected."
          : "I accept this plan. Implement it now.",
        projectId: project.id,
        settings: {
          ...project.settings,
          planMode: false,
        },
        attachments: [],
        contexts,
        createdAt: Date.now(),
        localDraftProjectId: null,
        targetThreadId: latestProposal.threadId,
        liveProposalAcceptedForBuildTurnId: isLiveProposal
          ? latestProposal.turnId
          : null,
      },
      { clearComposer: false, desktopOverride: desktop },
    );
    if (!accepted) return;
    setPlanProposalFeedbackDrafts((current) => {
      const next = { ...current };
      delete next[latestProposal.turnId];
      return next;
    });
    setDesktop((current) => ({
      ...current,
      planProposals: isLiveProposal
        ? markLiveProposalAcceptedForBuild(
            current.planProposals,
            latestProposal.turnId,
          )
        : updatePlanProposalStatus(
            current.planProposals,
            latestProposal.turnId,
            "accepted",
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
  }

  async function modifyPlanProposal(proposal: PlanProposal, feedback = "") {
    const latestProposal = desktop.planProposals[proposal.turnId] ?? proposal;
    const project = desktop.projects.find(
      (candidate) => candidate.id === latestProposal.projectId,
    );
    if (!project) {
      setSendError("That plan belongs to a project that is no longer available.");
      return;
    }
    const revisionFeedback = feedback.trim();
    const revisionPreviewContext = planPreviewDecisionSummary(latestProposal);
    if (revisionFeedback || revisionPreviewContext) {
      const sent = await sendDraft(
        {
          prompt: planProposalRevisionPrompt(
            latestProposal,
            revisionFeedback,
            revisionPreviewContext,
          ),
          visiblePrompt: feedback.trim() || "Please revise the plan.",
          projectId: project.id,
          settings: {
            ...project.settings,
            planMode: true,
          },
          attachments: [],
          contexts: latestProposal.contexts,
          createdAt: Date.now(),
          localDraftProjectId: null,
          targetThreadId: latestProposal.threadId,
        },
        { clearComposer: true },
      );
      if (!sent) return;
      setPlanProposalFeedbackDrafts((current) => {
        const next = { ...current };
        delete next[latestProposal.turnId];
        return next;
      });
      setDesktop((current) => ({
        ...current,
        planProposals: updatePlanProposalStatus(
          current.planProposals,
          latestProposal.turnId,
          "superseded",
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
    setComposerText(planProposalRevisionPrompt(latestProposal));
    setAttachments([]);
    setComposerContexts(latestProposal.contexts);
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
      inspector.type === "planPreview" &&
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
    setPlanProposalFeedbackDrafts((current) => {
      const next = { ...current };
      delete next[latestProposal.turnId];
      return next;
    });
  }

  function requestBaselineApp(project: Project) {
    void sendDraft(
      {
        prompt: [
          "Create the smallest runnable app baseline for this project so App Preview can start.",
          "Use the existing project conventions if any are present.",
          "Keep the result minimal, maintainable, and ready for the desktop App Preview controls.",
        ].join("\n"),
        projectId: project.id,
        settings: {
          ...project.settings,
          planMode: false,
        },
        attachments: [],
        contexts: [],
        createdAt: Date.now(),
        localDraftProjectId: null,
      },
      { clearComposer: true },
    );
  }

  async function startTurn(
    targetThread: Thread,
    project: Project,
    settings: ProjectSettings,
    input: Array<Record<string, unknown>>,
    cwdOverride?: string | null,
  ) {
    const cwd = cwdOverride || project.path;
    return withRequestTimeout(
      client.request<{ turn: Turn }>("turn/start", {
        threadId: targetThread.id,
        cwd,
        input,
        approvalPolicy: settings.approvalPolicy,
        sandboxPolicy: sandboxPolicyFor(settings.sandbox, cwd),
        ...(settings.planMode ? { planningOnly: true } : {}),
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
    if (
      !activeThread.turns.some(
        (turn) => turn.id === runningTurnId && turn.status === "inProgress",
      )
    ) {
      return;
    }
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
      sameRuntimePath(project.path, path, runtime.backendMode),
    );
    const project =
      existing ??
      createProject(path, desktop.projects.length, runtime.backendMode);
    setInspector((current) =>
      current.type === "appPreview"
        ? { type: "appPreview", projectId: project.id }
        : { type: "empty" },
    );
    setActiveDraftProjectId(null);
    setComposerText("");
    setAttachments([]);
    setVisualDecisionComposerAction(null);
    activeThreadIdRef.current = existing?.lastActiveThreadId ?? null;
    inspectorRetargetThreadIdRef.current = existing?.lastActiveThreadId ?? null;
    setDesktop((current) => ({
      ...current,
      activeProjectId: project.id,
      projects: existing ? current.projects : [...current.projects, project],
      activeThreadId: existing?.lastActiveThreadId ?? null,
    }));
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setProjectPath("");
    return true;
  }

  function addProject() {
    addProjectFromPath(projectPath);
  }

  async function pickProjectFolder() {
    const selectedPath = desktopInvoke<string | null>("pick_folder");
    if (!selectedPath) {
      setActionError("Use the folder path field in this browser build.");
      return false;
    }
    try {
      const path = await selectedPath;
      if (!path) return false;
      return Boolean(addProjectFromPath(path));
    } catch (error) {
      setActionError(
        `Could not open the folder picker: ${errorMessage(error)}`,
      );
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
            .filter((thread) =>
              sameRuntimePath(thread.cwd, project.path, runtime.backendMode),
            )
            .map((thread) => thread.id)
        : [],
    );
    setChatDrafts((current) => {
      if (!(projectId in current)) return current;
      const next = { ...current };
      delete next[projectId];
      return next;
    });
    setActiveDraftProjectId((current) =>
      current === projectId ? null : current,
    );
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
    setMockupPreviewSets((current) => {
      const nextEntries = Object.entries(current).filter(
        ([, previewSet]) => previewSet.projectId !== projectId,
      );
      return nextEntries.length === Object.keys(current).length
        ? current
        : Object.fromEntries(nextEntries);
    });
    setDesktop((current) => {
      const remainingProjects = current.projects.filter(
        (item) => item.id !== projectId,
      );
      const nextActiveProject =
        current.activeProjectId === projectId
          ? (remainingProjects
              .filter((item) => !item.hidden && !item.archived)
              .sort(
                (a, b) =>
                  Number(b.pinned) - Number(a.pinned) || a.order - b.order,
              )[0] ?? null)
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
        mockupActiveProposalSetIdsByThreadId: Object.fromEntries(
          Object.entries(current.mockupActiveProposalSetIdsByThreadId).filter(
            ([threadId]) => !removedThreadIds.has(threadId),
          ),
        ),
        mockupHistoryProposalSetIds: Object.fromEntries(
          Object.entries(current.mockupHistoryProposalSetIds).filter(
            ([proposalSetId]) =>
              !Object.values(mockupPreviewSets).some(
                (previewSet) =>
                  previewSet.projectId === projectId &&
                  previewSet.proposalSetId === proposalSetId,
              ),
          ),
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
          item.id === project.id ||
          archivedIds.has(item.lastActiveThreadId ?? "")
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
    const resizeTarget = event.currentTarget;
    const pointerId = event.pointerId;
    try {
      resizeTarget.setPointerCapture(pointerId);
    } catch {
      // The resize shield below still keeps embedded previews from stealing drags.
    }
    const startX = event.clientX;
    const startWidth = desktop.layout.inspectorWidth;
    const shellBounds = shellRef.current?.getBoundingClientRect();
    const maxWidth = maxInspectorWidthForShell(
      Math.round(shellBounds?.width ?? window.innerWidth),
      previewFocused,
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
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handlePointerUp);
      try {
        if (resizeTarget.hasPointerCapture(pointerId)) {
          resizeTarget.releasePointerCapture(pointerId);
        }
      } catch {
        // The pointer can already be released when the window loses focus.
      }
      document.body.classList.remove("resizing-inspector");
    }

    document.body.classList.add("resizing-inspector");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });
    window.addEventListener("blur", handlePointerUp, { once: true });
  }

  function updateActiveSettings(patch: Partial<ProjectSettings>) {
    if (!activeProject) return;
    updateProject(activeProject.id, (project) => ({
      ...project,
      settings: { ...project.settings, ...patch },
    }));
  }

  function openAuthDialog() {
    setAuthDialog({
      ...closedAuthDialogState(),
      open: true,
      phase: snapshot.account?.account ? "success" : "choose",
    });
  }

  async function closeAuthDialog() {
    const loginId = authDialog.loginId;
    const shouldCancel =
      authDialog.open &&
      Boolean(loginId) &&
      (authDialog.phase === "browser" ||
        authDialog.phase === "deviceCode" ||
        authDialog.phase === "starting");
    setAuthDialog(closedAuthDialogState());
    if (shouldCancel) {
      await cancelAuthLogin(loginId);
    }
  }

  async function startChatgptLogin() {
    if (!client.connected) {
      setAuthDialog((current) => ({
        ...current,
        open: true,
        phase: "choose",
        error: "Codex is not connected. Try again after it reconnects.",
      }));
      return;
    }

    await cancelAuthLogin(authDialog.loginId);
    setAuthDialog((current) => ({
      ...current,
      open: true,
      phase: "starting",
      loginId: null,
      authUrl: null,
      verificationUrl: null,
      userCode: null,
      apiKey: "",
      error: null,
    }));

    try {
      const response = await client.request<LoginAccountResponse>(
        "account/login/start",
        { type: "chatgpt", codexStreamlinedLogin: true },
      );
      await handleLoginResponse(response);
    } catch (error) {
      setAuthDialog((current) => ({
        ...current,
        phase: "choose",
        loginId: null,
        error: errorMessage(error),
      }));
    }
  }

  async function startDeviceCodeLogin() {
    if (!client.connected) {
      setAuthDialog((current) => ({
        ...current,
        open: true,
        phase: "choose",
        error: "Codex is not connected. Try again after it reconnects.",
      }));
      return;
    }

    await cancelAuthLogin(authDialog.loginId);
    setAuthDialog((current) => ({
      ...current,
      open: true,
      phase: "starting",
      loginId: null,
      authUrl: null,
      verificationUrl: null,
      userCode: null,
      apiKey: "",
      error: null,
    }));

    try {
      const response = await client.request<LoginAccountResponse>(
        "account/login/start",
        { type: "chatgptDeviceCode" },
      );
      await handleLoginResponse(response);
    } catch (error) {
      setAuthDialog((current) => ({
        ...current,
        phase: "choose",
        loginId: null,
        error: errorMessage(error),
      }));
    }
  }

  function startApiKeyLogin() {
    setAuthDialog((current) => ({
      ...current,
      open: true,
      phase: "apiKey",
      loginId: null,
      authUrl: null,
      verificationUrl: null,
      userCode: null,
      error: null,
    }));
  }

  async function submitApiKeyLogin() {
    const apiKey = authDialog.apiKey.trim();
    if (!apiKey) return;
    if (!client.connected) {
      setAuthDialog((current) => ({
        ...current,
        error: "Codex is not connected. Try again after it reconnects.",
      }));
      return;
    }

    setAuthDialog((current) => ({
      ...current,
      phase: "savingApiKey",
      error: null,
    }));
    try {
      const response = await client.request<LoginAccountResponse>(
        "account/login/start",
        { type: "apiKey", apiKey },
      );
      await handleLoginResponse(response);
    } catch (error) {
      setAuthDialog((current) => ({
        ...current,
        phase: "apiKey",
        error: errorMessage(error),
      }));
    }
  }

  async function handleLoginResponse(response: LoginAccountResponse) {
    if (response.type === "chatgpt") {
      setAuthDialog((current) => ({
        ...current,
        open: true,
        phase: "browser",
        loginId: response.loginId,
        authUrl: response.authUrl,
        verificationUrl: null,
        userCode: null,
        apiKey: "",
        error: null,
      }));
      await openExternalAuthUrl(response.authUrl);
      return;
    }

    if (response.type === "chatgptDeviceCode") {
      setAuthDialog((current) => ({
        ...current,
        open: true,
        phase: "deviceCode",
        loginId: response.loginId,
        authUrl: null,
        verificationUrl: response.verificationUrl,
        userCode: response.userCode,
        apiKey: "",
        error: null,
      }));
      await openExternalAuthUrl(response.verificationUrl);
      return;
    }

    if (response.type === "apiKey" || response.type === "chatgptAuthTokens") {
      setAuthDialog((current) => ({
        ...current,
        phase: "success",
        loginId: null,
        authUrl: null,
        verificationUrl: null,
        userCode: null,
        apiKey: "",
        error: null,
      }));
      await refreshSettings(activeProject?.path ?? null);
    }
  }

  async function openExternalAuthUrl(url: string) {
    try {
      const opened = desktopInvoke("open_external_url", { url });
      if (opened) {
        await opened;
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setAuthDialog((current) =>
        current.open ? { ...current, error: errorMessage(error) } : current,
      );
    }
  }

  async function cancelAuthLogin(loginId: string | null) {
    if (!loginId || !client.connected) return;
    try {
      await client.request("account/login/cancel", { loginId });
    } catch (error) {
      console.warn("Failed to cancel Codex login", error);
    }
  }

  function copyAuthText(value: string) {
    void navigator.clipboard?.writeText(value).catch((error) => {
      console.warn("Failed to copy auth text", error);
    });
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
      const maxAttempts = Math.ceil(
        TURN_SETTLE_POLL_TIMEOUT_MS / TURN_SETTLE_POLL_INTERVAL_MS,
      );
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await wait(TURN_SETTLE_POLL_INTERVAL_MS);
        let thread: Thread | null = null;
        try {
          thread = await syncThread(threadId);
        } catch (error) {
          console.warn("Turn status refresh failed; waiting for events", error);
          continue;
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
        console.warn(
          "Codex turn did not settle before the local poll timeout.",
          { threadId, turnId },
        );
      }
    } catch (error) {
      console.error("Failed to reconcile Codex turn", error);
      if (justStartedThreadIdRef.current === threadId) {
        justStartedThreadIdRef.current = null;
      }
      if (inFlightDraftsRef.current.has(turnId)) {
        console.warn(
          "Codex turn reconciliation failed while still in flight.",
          {
            threadId,
            turnId,
            error,
          },
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
        const draft = visibleDraftForProject(
          chatDrafts[project.id],
          activeDraftProjectId,
        );
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
              composerContextSearchLabel(context).toLowerCase().includes(query),
            ));
        if (!projectMatches && matchingThreads.length === 0 && !draftMatches)
          return null;
        return {
          project,
          threads: projectMatches ? projectThreads : matchingThreads,
          draft: projectMatches || draftMatches ? draft : null,
        };
      })
      .filter((group): group is ProjectThreadGroup => group !== null);
  }, [
    activeDraftProjectId,
    chatDrafts,
    threadSearch,
    threadsByProject,
    visibleProjects,
  ]);

  const projectThreads = activeProject
    ? (threadsByProject.get(activeProject.id) ?? [])
    : [];
  const activeThreadMockupPreviewSet =
    activeThreadProposalSetId
      ? (mockupPreviewSets[activeThreadProposalSetId] ?? null)
      : null;
  const activeThreadCodeProposalSet =
    activeThreadCodeProposalSetId
      ? (desktop.codeProposalSets[activeThreadCodeProposalSetId] ?? null)
      : null;
  const activeThreadCodeProposalCompareSet =
    activeThreadCodeProposalCompareSetId
      ? (desktop.codeProposalSets[activeThreadCodeProposalCompareSetId] ?? null)
      : null;
  const activeThreadFeatureDraft =
    activeThreadFeatureDraftId
      ? (desktop.featureDrafts[activeThreadFeatureDraftId] ?? null)
      : null;
  const activeThreadFeatureDrafts = activeProject
    ? Object.values(desktop.featureDrafts)
        .filter(
          (draft) =>
            draft.projectId === activeProject.id &&
            draft.threadId === desktop.activeThreadId &&
            (draft.lifecycle === "active" || draft.lifecycle === "parked"),
        )
        .sort((left, right) => right.updatedAt - left.updatedAt)
    : [];
  const previewProject = activePreviewProjectId
    ? (desktop.projects.find(
        (project) => project.id === activePreviewProjectId,
      ) ?? null)
    : null;
  const selectedPlanPreviewProposal =
    inspector.type === "planPreview"
      ? (desktop.planProposals[inspector.proposalTurnId] ?? null)
      : null;
  const selectedAppPreviewContexts =
    inspector.type === "appPreview" ||
    inspector.type === "mockupPreview" ||
    inspector.type === "draftPreview" ||
    inspector.type === "codeProposalPreview"
      ? activeComposerContexts.filter(
          (context): context is ComposerAppPreviewContext =>
            context.type === "appPreview" &&
            context.projectId === inspector.projectId,
        )
      : [];
  const selectedCodeProposalSet =
    inspector.type === "codeProposalPreview"
      ? (desktop.codeProposalSets[inspector.proposalSetId] ?? null)
      : (activeThreadCodeProposalSet ?? activeThreadCodeProposalCompareSet);
  const selectedFeatureDraft =
    inspector.type === "draftPreview"
      ? (desktop.featureDrafts[inspector.draftId] ?? null)
      : activeThreadFeatureDraft;
  const selectedMockupPreviewSet =
    inspector.type === "mockupPreview"
      ? (mockupPreviewSets[inspector.proposalSetId] ?? null)
      : activeThreadMockupPreviewSet;
  const composerMockupPreviewSet = activeThreadMockupPreviewSet;
  const selectedMockupHistoryMode = Boolean(
    selectedMockupPreviewSet &&
      desktop.mockupHistoryProposalSetIds[
        selectedMockupPreviewSet.proposalSetId
      ],
  );
  const selectedMockupCanShowLive = Boolean(
    selectedMockupPreviewSet &&
      !selectedMockupHistoryMode,
  );
  const selectedCodeProposalCanShowLive = Boolean(
    selectedCodeProposalSet &&
      projectEmptyStatusById[selectedCodeProposalSet.projectId] &&
      !projectEmptyStatusById[selectedCodeProposalSet.projectId].empty,
  );
  const selectedFeatureDraftCanShowLive = Boolean(
    selectedFeatureDraft &&
      projectEmptyStatusById[selectedFeatureDraft.projectId] &&
      !projectEmptyStatusById[selectedFeatureDraft.projectId].empty,
  );

  useEffect(() => {
    if (!activeProject || !activeThread || !activeThreadCodeProposalSet) return;
    if (
      !codeProposalSetIsActiveForRouting(
        activeThreadCodeProposalSet,
        activeProject.id,
      )
    ) {
      return;
    }
    if (
      !shouldRecoverAppliedCodeProposalFromThread(
        activeThreadCodeProposalSet,
        activeThread,
      )
    ) {
      return;
    }
    setDesktop((current) => {
      const stored =
        current.codeProposalSets[activeThreadCodeProposalSet.proposalSetId];
      if (!codeProposalSetIsActiveForRouting(stored ?? null, activeProject.id)) {
        return current;
      }
      return markCodeProposalSetAsApplied(
        current,
        activeThreadCodeProposalSet.proposalSetId,
      );
    });
  }, [
    activeProject,
    activeThread,
    activeThreadCodeProposalSet,
  ]);

  const mockupPreviewMarks = composerContexts.filter(
    (context): context is ComposerMockupPreviewContext =>
      context.type === "mockupPreview" &&
      Boolean(
        selectedMockupPreviewSet &&
          context.projectId === selectedMockupPreviewSet.projectId &&
          context.proposalSetId === selectedMockupPreviewSet.proposalSetId,
      ),
  );
  const activeAppPreviewSelected = Boolean(
    desktop.layout.inspectorOpen &&
      activeProject &&
      ((inspector.type === "appPreview" &&
        inspector.projectId === activeProject.id) ||
        (inspector.type === "mockupPreview" &&
          inspector.projectId === activeProject.id &&
          inspector.proposalSetId === activeThreadProposalSetId) ||
        (inspector.type === "draftPreview" &&
          inspector.projectId === activeProject.id &&
          inspector.draftId === activeThreadFeatureDraftId) ||
        (inspector.type === "codeProposalPreview" &&
          inspector.projectId === activeProject.id &&
          inspector.proposalSetId === activeThreadCodeProposalSetId)),
  );
  const activeThreadRunning = Boolean(
    runningTurnId &&
      activeThread?.turns.some(
        (turn) => turn.id === runningTurnId && turn.status === "inProgress",
      ),
  );

  return (
    <div
      ref={shellRef}
      className={`app-shell ${
        desktop.layout.inspectorOpen ? "inspector-open" : "inspector-closed"
      } ${previewFocused ? "preview-focused" : ""} ${
        sidebarDrawerMode ? "sidebar-drawer-mode" : ""
      } ${
        sidebarDrawerOpen ? "sidebar-drawer-open" : ""
      } ${chatPhoneLayout ? "chat-phone-layout" : ""}`}
      style={
        {
          "--inspector-width": `${desktop.layout.inspectorWidth}px`,
          "--inspector-min-width": `${INSPECTOR_MIN_WIDTH}px`,
          "--preview-chat-min-width": `${PREVIEW_CHAT_MIN_WIDTH}px`,
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
        onOpenAuth={openAuthDialog}
        onProjectPathChange={setProjectPath}
        onArchiveProjectChats={(project) => void archiveProjectChats(project)}
        onArchiveThread={(threadId, project) =>
          void archiveThread(threadId, project)
        }
        onRenameThread={(threadId, name) => void renameThread(threadId, name)}
        onRemoveProject={removeProject}
        onRenameProject={renameProject}
        onSelectProject={(project) => {
          setSidebarDrawerOpen(false);
          setActionError(null);
          setRetryDraft(null);
          setActiveDraftProjectId(null);
          setVisualDecisionComposerAction(null);
          setInspector((current) =>
            current.type === "appPreview"
              ? { type: "appPreview", projectId: project.id }
              : { type: "empty" },
          );
          inspectorRetargetThreadIdRef.current = project.lastActiveThreadId;
          setComposerText("");
          setAttachments([]);
          setSendError(null);
          setDesktop((current) => ({
            ...current,
            activeProjectId: project.id,
            activeThreadId: project.lastActiveThreadId,
          }));
        }}
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
        runtime={runtime}
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
          activeAppPreviewSelected={activeAppPreviewSelected}
          activeThread={activeThread}
          hasActiveProject={Boolean(activeProject)}
          connectionStatus={connectionStatus}
          connectionError={connectionError}
          backendLabel={runtime.backendLabel}
          inspectorOpen={desktop.layout.inspectorOpen}
          onOpenAppPreview={() => toggleAppPreview()}
          onOpenSidebar={() => setSidebarDrawerOpen(true)}
          onToggleInspector={toggleInspectorPanel}
        />

        <section className="chat-pane">
          <ChatThread
            activeProject={activeProject}
            activeDraft={activeDraft}
            activeThread={activeThread}
            activeWorkspaceProgress={activeWorkspaceProgress}
            onAcceptPlanProposal={(proposal) =>
              void acceptPlanProposal(proposal)
            }
            onDeclinePlanProposal={declinePlanProposal}
            onModifyPlanProposal={modifyPlanProposal}
            onPlanProposalFeedbackChange={(turnId, value) =>
              setPlanProposalFeedbackDrafts((current) => ({
                ...current,
                [turnId]: value,
              }))
            }
            onShowPlanUiImpact={showPlanUiImpact}
            onSelect={selectInspector}
            planProposalFeedbackDrafts={planProposalFeedbackDrafts}
            planProposals={desktop.planProposals}
            sentComposerContextsByTurnId={desktop.sentComposerContextsByTurnId}
          />
        </section>

        {activeVisualDecision && (
          <VisualDecisionStripView
            decision={activeVisualDecision.decision}
            onDismiss={() => dismissVisualDecision(activeVisualDecision)}
            onSelect={(option) =>
              chooseVisualDecisionOption(activeVisualDecision, option)
            }
          />
        )}

        {activeThreadFeatureDrafts.length > 0 && !activeVisualDecision && (
          <FeatureDraftStrip
            activeDraftId={activeThreadFeatureDraftId}
            drafts={activeThreadFeatureDrafts}
            onDiscard={(draft) => void discardFeatureDraft(draft)}
            onOpen={(draft) =>
              openFeatureDraftInspector(draft.projectId, draft.draftId)
            }
            onPark={(draft) => void parkFeatureDraft(draft)}
            onResume={(draft) => void resumeFeatureDraft(draft)}
          />
        )}

        {activeThreadCodeProposalSet?.status === "ready" &&
          activeThreadCodeProposalSet.options.length > 0 &&
          !activeVisualDecision && (
            <CodeProposalOptionStrip
              previewSet={activeThreadCodeProposalSet}
              onOpen={() =>
                openCodeProposalInspector(
                  activeThreadCodeProposalSet.projectId,
                  activeThreadCodeProposalSet.proposalSetId,
                )
              }
              onSelect={(optionId) =>
                selectCodeProposal(
                  activeThreadCodeProposalSet.proposalSetId,
                  optionId,
                )
              }
            />
          )}

        {composerMockupPreviewSet &&
          composerMockupPreviewSet.mockups.length > 0 &&
          !selectedMockupHistoryMode &&
          !activeVisualDecision && (
            <MockupOptionStrip
              previewSet={composerMockupPreviewSet}
              onOpen={() =>
                openMockupInspector(
                  composerMockupPreviewSet.projectId,
                  composerMockupPreviewSet.proposalSetId,
                )
              }
              onSelect={(mockupId) =>
                selectMockup(composerMockupPreviewSet.proposalSetId, mockupId)
              }
            />
          )}

        <Composer
          attachments={attachments}
          contexts={activeComposerContexts}
          canSend={
            connectionStatus === "connected" &&
            Boolean(activeProject) &&
            !missingOpenAiAuth &&
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
          onShowApprovals={showApprovals}
          onRemoveAttachment={removeAttachment}
          onRemoveContext={removeComposerContext}
          onRetry={() => void retryPrompt()}
          onSend={sendPrompt}
          onSettingsChange={updateActiveSettings}
          pendingApprovals={pendingApprovals}
          running={activeThreadRunning}
          sendDisabledReason={sendDisabledReason}
          sendError={sendError}
          text={composerText}
          onTextChange={(value) => {
            setComposerText(value);
            if (!value.trim()) {
              setVisualDecisionComposerAction(null);
            }
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
          previewProject={previewProject}
          planPreviewProposal={selectedPlanPreviewProposal}
          appPreviewContexts={selectedAppPreviewContexts}
          codeProposalCanShowLive={selectedCodeProposalCanShowLive}
          codeProposalSet={selectedCodeProposalSet}
          featureDraft={selectedFeatureDraft}
          featureDraftCanShowLive={selectedFeatureDraftCanShowLive}
          mockupPreviewSet={selectedMockupPreviewSet}
          mockupCanShowLive={selectedMockupCanShowLive}
          mockupPreviewLiveResetToken={mockupPreviewLiveResetToken}
          mockupPreviewMarks={mockupPreviewMarks}
          mockupPreviewMode={selectedMockupHistoryMode ? "history" : "active"}
          onAnswerApproval={answerApproval}
          onOpenDocument={(path) => selectInspector({ type: "document", path })}
          onResizePointerDown={beginInspectorResize}

          onReviewChanges={() => void reviewChanges()}
          onRollback={() => void rollbackChat()}
          onSelect={selectInspector}
          onUpdatePlanPreviewAreaMark={updatePlanPreviewAreaMark}
          onUpdatePlanPreviewSession={updatePlanPreviewSession}
          onAttachAppPreviewMark={attachAppPreviewMark}
          onAttachMockupPreviewMark={attachMockupPreviewMark}
          onBuildBaselineApp={requestBaselineApp}
          onBuildPlanProposal={(proposal) => void acceptPlanProposal(proposal)}
          onBuildCodeProposal={(previewSet, option) =>
            stageBuildCodeProposal(previewSet, option)
          }
          onBuildFeatureDraft={(draft) => void buildFeatureDraft(draft)}
          onDiscardFeatureDraft={(draft) => void discardFeatureDraft(draft)}
          onParkFeatureDraft={(draft) => void parkFeatureDraft(draft)}
          onResumeFeatureDraft={(draft) => void resumeFeatureDraft(draft)}
          onTransferCodeProposalLane={transferCodeProposalLane}
          onSelectCodeProposal={selectCodeProposal}
          onBuildMockup={(previewSet, mockup) =>
            stageBuildMockup(previewSet, mockup)
          }
          onResetMockupProposalHighlights={resetMockupProposalHighlights}
          onSelectMockup={selectMockup}
          onUpdatePlanPreviewVariant={updatePlanPreviewVariant}

          selection={inspector}
          activeTurn={activeTurnState}
        />
      )}

      <AuthDialog
        state={authDialog}
        snapshot={snapshot}
        connectionStatus={connectionStatus}
        onApiKeyChange={(apiKey) =>
          setAuthDialog((current) => ({ ...current, apiKey }))
        }
        onClose={() => void closeAuthDialog()}
        onCopyText={copyAuthText}
        onOpenUrl={(url) => void openExternalAuthUrl(url)}
        onStartApiKey={startApiKeyLogin}
        onStartChatgpt={() => void startChatgptLogin()}
        onStartDeviceCode={() => void startDeviceCodeLogin()}
        onSubmitApiKey={() => void submitApiKeyLogin()}
      />
    </div>
  );
}

function ActiveTurnProgressPill(props: {
  active: boolean;
  progress: TurnProgressSummary;
  startedAt: number | null;
  onReview: (item: Extract<ThreadItem, { type: "fileChange" }>) => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!props.active) {
      setTick(0);
      return;
    }
    setTick(0);
    const timer = window.setInterval(
      () => setTick((value) => value + 1),
      WORKSPACE_PROGRESS_POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, [props.active, props.startedAt]);

  if (!props.active) return null;
  const elapsedMs = props.startedAt
    ? Math.max(0, Date.now() - props.startedAt * 1000)
    : tick * WORKSPACE_PROGRESS_POLL_MS;
  const elapsed = formatDuration(
    Math.max(elapsedMs, tick * WORKSPACE_PROGRESS_POLL_MS),
  );
  const reviewItem = props.progress.reviewItem;
  const hasFiles = props.progress.fileCount > 0;

  return (
    <div
      className={`active-turn-progress-pill ${
        hasFiles ? "has-files" : "is-working"
      }`}
      data-testid="active-turn-progress-pill"
    >
      <span className="active-turn-progress-pulse" aria-hidden="true" />
      <span className="active-turn-progress-copy">
        <strong>
          {hasFiles
            ? `${props.progress.fileCount} file${
                props.progress.fileCount === 1 ? "" : "s"
              } changed`
            : liveProgressHeadline(props.progress)}
        </strong>
        <small>
          {hasFiles ? (
            <>
              <span className="addition">
                +{props.progress.additions.toLocaleString()}
              </span>{" "}
              <span className="deletion">
                -{props.progress.deletions.toLocaleString()}
              </span>
            </>
          ) : (
            liveProgressDetail(props.progress, elapsed, elapsedMs)
          )}
        </small>
      </span>
      {hasFiles && props.progress.files[0] && (
        <span className="active-turn-progress-file">
          {props.progress.files[0].label}{" "}
          {formatShortLineDelta(
            props.progress.files[0].additions,
            props.progress.files[0].deletions,
          )}
        </span>
      )}
      {hasFiles && reviewItem && (
        <button type="button" onClick={() => props.onReview(reviewItem)}>
          Review
        </button>
      )}
    </div>
  );
}

function turnWithOptimisticUserMessage(
  turn: Turn,
  visibleUserPrompt: string,
  attachments: ComposerAttachment[],
): Turn {
  if (turn.items.some((item) => item.type === "userMessage")) return turn;
  const text = visibleUserPrompt.trim() || "Use the attached project context.";
  const content: Extract<ThreadItem, { type: "userMessage" }>["content"] = [
    { type: "text", text, text_elements: [] },
    ...attachments
      .filter((attachment) => attachment.kind === "image")
      .map((attachment) => ({
        type: "localImage" as const,
        path: attachment.path,
      })),
  ];
  return {
    ...turn,
    items: [
      {
        type: "userMessage",
        id: `optimistic-user:${turn.id}`,
        content,
      },
      ...turn.items,
    ],
  };
}

function shouldPreserveLocalThreadDuringRefresh(thread: Thread) {
  return thread.turns.some(
    (turn) => turn.status === "inProgress" || Boolean(turn.error),
  );
}

function sendBlockReason(args: {
  activeProject: Project | null;
  connectionStatus: string;
  missingOpenAiAuth: boolean;
  hasUnsupportedAttachments: boolean;
  pendingApprovals: PendingApproval[];
  promptReady: boolean;
  sendStarting: boolean;
  runningTurnId: string | null;
}) {
  if (args.connectionStatus !== "connected") {
    return "Codex is still connecting. Try again when the status says Connected.";
  }
  if (!args.activeProject)
    return "Add or select a local project before sending.";
  if (args.missingOpenAiAuth) {
    return "Sign in before sending prompts to OpenAI-hosted models.";
  }
  if (args.sendStarting) {
    return "Codex is starting your message. Wait for it to begin before sending again.";
  }
  if (args.runningTurnId) {
    return "Codex is already working on another turn. Wait for it to finish before sending again.";
  }
  if (args.pendingApprovals.length > 0) {
    return "Answer the pending approval before sending another message.";
  }
  if (args.hasUnsupportedAttachments)
    return "Remove unsupported files before sending.";
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

type VisualDecisionValidityContext = {
  hasActiveCanvasProposal: boolean;
  projectEmptyStatus: ProjectEmptyStatus | null;
  hasSavedMockups: boolean;
};

function latestVisualDecision(
  thread: Thread | null,
  dismissed: Record<string, true>,
  context: VisualDecisionValidityContext,
): ActiveVisualDecision | null {
  if (!thread) return null;
  for (const turn of [...thread.turns].reverse()) {
    if (turn.status === "inProgress") continue;
    if (turnContainsText(turn, SAVED_MOCKUP_REVIEW_SENTINEL)) continue;
    if (turnContainsText(turn, FEATURE_DRAFT_WORKSPACE_SENTINEL)) continue;
    const decision = parseVisualDecisionStrip(finalAgentText(turn));
    if (!decision) continue;
    const id = `${thread.id}:${turn.id}`;
    if (dismissed[id]) return null;
    if (!visualDecisionStillValid(decision, context)) continue;
    return { id, turnId: turn.id, decision };
  }
  return null;
}

function turnContainsText(turn: Turn, needle: string) {
  return turn.items.some((item) => threadItemContainsText(item, needle));
}

function threadItemContainsText(item: ThreadItem, needle: string): boolean {
  if (item.type === "userMessage") {
    return item.content.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.includes(needle),
    );
  }
  if (
    (item.type === "agentMessage" || item.type === "reasoning") &&
    "text" in item &&
    typeof item.text === "string"
  ) {
    return item.text.includes(needle);
  }
  return false;
}

function visualDecisionStillValid(
  decision: VisualDecisionStrip,
  context: VisualDecisionValidityContext,
) {
  if (visualDecisionLooksProposalReplacement(decision)) {
    return context.hasActiveCanvasProposal;
  }
  if (!visualDecisionLooksEmptyProjectOnly(decision)) return true;
  if (!context.projectEmptyStatus) return false;
  return context.projectEmptyStatus.empty && !context.hasSavedMockups;
}

function visualDecisionLooksProposalReplacement(decision: VisualDecisionStrip) {
  return decision.options.some((option) =>
    ["replace_option", "add_option", "start_fresh"].includes(
      option.canvasAction ?? "",
    ),
  );
}

function visualDecisionLooksEmptyProjectOnly(decision: VisualDecisionStrip) {
  const text = [
    decision.title,
    decision.summary,
    ...decision.options.flatMap((option) => [
      option.id,
      option.label,
      option.description,
      option.prompt,
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return (
    text.includes("project is empty") ||
    text.includes("empty project") ||
    text.includes("empty-project") ||
    text.includes("no app structure")
  );
}

const DISMISSED_VISUAL_DECISIONS_STORAGE_KEY =
  "codex.visualDecision.dismissed.v1";

function loadDismissedVisualDecisionIds(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(DISMISSED_VISUAL_DECISIONS_STORAGE_KEY) ||
        "{}",
    );
    if (!parsed || typeof parsed !== "object") return {};
    const record: Record<string, true> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) record[key] = true;
    }
    return record;
  } catch {
    return {};
  }
}

function saveDismissedVisualDecisionIds(dismissed: Record<string, true>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISMISSED_VISUAL_DECISIONS_STORAGE_KEY,
      JSON.stringify(dismissed),
    );
  } catch {
    // Ignore storage failures; state validity still prevents stale decisions.
  }
}

function isAcceptedPlanImplementationTurn(turn: Turn) {
  return turn.items.some((item) => {
    if (item.type !== "userMessage") return false;
    return item.content.some(
      (part) =>
        part.type === "text" && isAcceptedPlanImplementationPrompt(part.text),
    );
  });
}

function isAcceptedPlanImplementationPrompt(prompt: string) {
  return prompt.trim().startsWith("I accept this plan. Implement it now");
}

const MOCKUP_TASK_SENTINEL = "[Codex Mockup Artifact Task]";
const LIVE_OVERLAY_PROPOSAL_SENTINEL = "[Codex Live Overlay Proposal Context]";
const CODE_PROPOSAL_WORKSPACE_SENTINEL =
  "[Codex Code Proposal Workspace Context]";
const FEATURE_DRAFT_WORKSPACE_SENTINEL = "[Codex Feature Draft Context]";
const SAVED_MOCKUP_REVIEW_SENTINEL = "[Codex Saved Mockup Review Context]";
const VISUAL_DECISION_SELECTION_SENTINEL = "[Codex Visual Decision Selection]";
const CANVAS_QUESTION_SENTINEL = "[Codex Canvas Question Context]";

function proposalSetRelativeDir(proposalSetId: string) {
  return `.codex/mockups/${proposalSetId}`;
}

function previewArtifactStorageRules(
  proposalSetId: string,
  artifactKind: PreviewArtifactKind,
  threadId: string | null,
) {
  const baseDir = proposalSetRelativeDir(proposalSetId);
  const filePrefix = previewArtifactFilePrefix(artifactKind);
  const artifactName = previewArtifactDisplayName(artifactKind, 2, "lower");
  return [
    `- Save standalone HTML files under ${baseDir}.`,
    `- Save ${baseDir}/manifest.json with version 1, proposalSetId "${proposalSetId}", threadId "${threadId ?? "unknown"}", artifactKind "${artifactKind}", originalPrompt, depth "quick" or "full", selectedMockupId, and one mockups entry per file: id, label, title, summary, file.`,
    `- Use labels A, B, and C. A single generated proposal must be labeled "A", not "Preview".`,
    `- Use file names such as ${filePrefix}-a.html, ${filePrefix}-b.html, and ${filePrefix}-c.html inside ${baseDir}.`,
    "- Keep every updated artifact for this turn inside the same proposalSetId folder instead of writing to the root .codex/mockups folder.",
  ].join("\n");
}

function isMockupGenerationPrompt(prompt: string) {
  return prompt.trimStart().startsWith(MOCKUP_TASK_SENTINEL);
}

function isLiveOverlayProposalPrompt(prompt: string) {
  return prompt.trimStart().startsWith(LIVE_OVERLAY_PROPOSAL_SENTINEL);
}

function isExplicitCodeBackedProposalRequest(prompt: string) {
  const text = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /\bproposal workspaces?\b/.test(text) ||
    /\brunnable\s+(?:option|options|proposal|proposals|candidate|candidates|app|apps)\b/.test(
      text,
    ) ||
    /\bcode[-\s]?backed\s+(?:option|options|proposal|proposals)\b/.test(text)
  );
}

function isExplicitMultiOptionProposalRequest(prompt: string) {
  const text = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /\b(?:two|three|2|3)\s+(?:(?:different|runnable|reviewable|visual|separate)\s+){0,4}(?:options|directions|variants|proposals|candidates|layouts|previews|mockups|wireframes)\b/.test(
      text,
    ) ||
    /\b(?:a\/b|a\/b\/c|abc|a,\s*b,?\s*(?:and\s+)?c)\b/.test(text)
  );
}

export function shouldCreateFeatureDraftFromCanvasPrompt(args: {
  backingPreference?: string | null;
  hasActiveProposal: boolean;
  hasSelectedPreview: boolean;
  isExistingProject: boolean;
  planMode: boolean;
  prompt: string;
  resolutionAction?: string | null;
  wantsOptions?: boolean | null;
}) {
  const text = normalizedPromptText(args.prompt);
  if (!text) return false;
  if (!args.isExistingProject || args.planMode) return false;
  if (args.resolutionAction !== "CREATE_PROPOSAL") return false;
  if (args.wantsOptions || args.hasActiveProposal || args.hasSelectedPreview) {
    return false;
  }
  if (isFeatureDraftBuildRequest(text) || isFeatureDraftDiscardRequest(text)) {
    return false;
  }
  if (isFeatureDraftParkRequest(text) || isFeatureDraftResumeRequest(text)) {
    return false;
  }
  if (isExplicitMultiOptionProposalRequest(text)) return false;
  if (isExplicitCodeBackedProposalRequest(text)) return false;
  if (/\b(?:mockup|mockups|wireframe|wireframes|a\/b|options?)\b/.test(text)) {
    return false;
  }
  if (
    /\b(?:implement|apply|build)\b/.test(text) &&
    !/\b(?:show|preview|draft|try|explore|could|would|where|before)\b/.test(text)
  ) {
    return false;
  }
  return (
    /\bshow\s+me\b.*\b(?:feature|flow|workflow|screen|page|experience|mode|panel|drawer|dashboard|onboarding|checkout|settings|search|filter|upload|import|export|notification)\b/.test(
      text,
    ) ||
    /\b(?:show|preview|draft|try|explore|prototype|sketch)\b.*\b(?:feature|flow|workflow|screen|page|experience|mode|panel|drawer|dashboard|onboarding|checkout|settings|search|filter|upload|import|export|notification)\b/.test(
      text,
    ) ||
    /\b(?:how|what)\b.*\b(?:would|could|should)\b.*\b(?:work|look|feel)\b/.test(
      text,
    ) ||
    /\b(?:show|preview|draft|try|explore)\b.*\b(?:before|first)\b/.test(text)
  );
}

export function shouldRouteToFeatureDraftPrompt(args: {
  inspectorIsDraft: boolean;
  prompt: string;
}) {
  const text = normalizedPromptText(args.prompt);
  if (!text) return false;
  if (isFeatureDraftBuildRequest(text) || isFeatureDraftDiscardRequest(text)) {
    return false;
  }
  if (isFeatureDraftParkRequest(text) || isFeatureDraftResumeRequest(text)) {
    return false;
  }
  if (args.inspectorIsDraft) return true;
  return (
    /\b(?:draft|this)\b.*\b(?:revise|change|tweak|adjust|update|make|add|remove|try)\b/.test(
      text,
    ) ||
    /\b(?:revise|change|tweak|adjust|update|make|add|remove|try)\b.*\bdraft\b/.test(
      text,
    )
  );
}

export function isFeatureDraftBuildRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bbuild\s+this\b/.test(text) ||
    /\bbuild\s+(?:the\s+)?draft\b/.test(text) ||
    /\bmake\s+this\s+real\b/.test(text) ||
    /\bimplement\s+(?:this|the\s+draft)\b/.test(text) ||
    /\bapply\s+(?:this|the\s+draft)\b/.test(text)
  );
}

export function isFeatureDraftDiscardRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bdiscard\s+(?:this\s+)?draft\b/.test(text) ||
    /\bdiscard\s+this\b/.test(text) ||
    /\bdrop\s+(?:this\s+)?draft\b/.test(text) ||
    /\bcancel\s+(?:this\s+)?draft\b/.test(text)
  );
}

export function isFeatureDraftParkRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bpark\s+(?:this\s+)?draft\b/.test(text) ||
    /\bpark\s+this\b/.test(text) ||
    /\bsave\s+(?:this\s+)?draft\s+for\s+later\b/.test(text)
  );
}

export function isFeatureDraftResumeRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bresume\s+(?:this\s+)?draft\b/.test(text) ||
    /\bresume\s+this\b/.test(text) ||
    /\breopen\s+(?:this\s+)?draft\b/.test(text) ||
    /\bcontinue\s+(?:this\s+)?draft\b/.test(text)
  );
}

function normalizedPromptText(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}

function isMockupReviewPrompt(prompt: string) {
  return prompt.trimStart().startsWith(SAVED_MOCKUP_REVIEW_SENTINEL);
}

function isVisualDecisionSelectionPrompt(prompt: string) {
  return prompt.trimStart().startsWith(VISUAL_DECISION_SELECTION_SENTINEL);
}

function isCanvasQuestionPrompt(prompt: string) {
  return prompt.trimStart().startsWith(CANVAS_QUESTION_SENTINEL);
}

function isSavedMockupArtifactRequest(prompt: string) {
  const text = prompt.toLowerCase();
  if (!text.includes(".codex/mockups")) return false;
  return /\b(mockup|mockups|wireframe|wireframes|preview|previews|concept|concepts|visual direction|visual directions)\b/.test(
    text,
  );
}

function turnTouchesSavedMockups(turn: Turn) {
  return turn.items.some((item) => {
    if (item.type !== "fileChange") return false;
    return item.changes.some((change) => {
      const path = change.path.replace(/\\/g, "/").toLowerCase();
      return path.includes("/.codex/mockups/");
    });
  });
}

function visualDecisionComposerText(option: VisualDecisionOption) {
  return option.description
    ? `${option.label}: ${option.description}`
    : option.label;
}

export function visualDecisionOptionCreatesMockups(option: VisualDecisionOption) {
  const text = [option.id, option.label, option.description, option.prompt]
    .join(" ")
    .toLowerCase();
  if (visualDecisionOptionCreatesCodeProposal(option)) return false;
  if (visualDecisionOptionCreatesLiveOverlay(option)) return false;
  if (/\bbuild\s+direct(?:ly)?\b/.test(text)) return false;
  return /\b(mockup|mockups|wireframe|wireframes|preview|previews|layout option|layout options|visual option|visual options|visual direction|visual directions|direction|directions|concept|concepts)\b/.test(
    text,
  );
}

export function visualDecisionOptionCreatesCodeProposal(option: VisualDecisionOption) {
  const text = [option.id, option.label, option.description, option.prompt]
    .join(" ")
    .toLowerCase();
  if (/\bbuild\s+direct(?:ly)?\b/.test(text)) return false;
  return /\b(runnable\s+proposal|proposal\s+workspace|code[-\s]?backed|temporary\s+workspace|candidate\s+app|candidate\s+apps)\b/.test(
    text,
  );
}

function codeProposalOptionIds(
  option: VisualDecisionOption,
): Array<"A" | "B" | "C"> {
  const text = [option.id, option.label, option.description, option.prompt]
    .join(" ")
    .toLowerCase();
  if (/\b(3|three)\b/.test(text)) return ["A", "B", "C"];
  if (/\b(2|two)\b/.test(text)) return ["A", "B"];
  if (/\b(options|directions|variants|candidates|concepts)\b/.test(text)) {
    return ["A", "B", "C"];
  }
  return ["A"];
}

function codeProposalOptionIdsForPrompt(
  prompt: string,
  wantsOptions: boolean,
): Array<"A" | "B" | "C"> {
  const text = prompt.toLowerCase();
  if (/\b(3|three)\b/.test(text)) return ["A", "B", "C"];
  if (/\b(2|two)\b/.test(text)) {
    return ["A", "B"];
  }
  if (wantsOptions || /\b(options|directions|variants|candidates|concepts)\b/.test(text)) {
    return ["A", "B", "C"];
  }
  return ["A"];
}

function codeProposalAddOptionRequest(
  prompt: string,
  previewSet: CodeProposalSet,
): CodeProposalAddOptionRequest | null {
  const text = prompt.toLowerCase();
  if (isCodeProposalImplementationCommitment(prompt)) return null;
  const requestedOptionId = requestedCodeProposalTargetOptionId(prompt);
  const hasAddIntent =
    /\b(add|create|new|another|additional|one more|replace|refresh)\b/.test(text) ||
    Boolean(requestedOptionId);
  if (!hasAddIntent) return null;
  const optionId = requestedOptionId ?? nextMissingCodeProposalOptionId(previewSet);
  if (!optionId) return null;
  const sourceOptionId =
    sourceCodeProposalOptionId(prompt, previewSet) ??
    previewSet.selectedOptionId ??
    previewSet.options[0]?.id ??
    null;
  return { optionId, sourceOptionId };
}

function requestedCodeProposalTargetOptionId(
  prompt: string,
): "A" | "B" | "C" | null {
  const value = requestedCodeProposalTargetLabel(prompt);
  return isCodeProposalOptionId(value) ? value : null;
}

function requestedCodeProposalTargetLabel(prompt: string): string | null {
  const matches = [
    ...prompt.matchAll(
      /\b(?:add|create|new|another|additional|one\s+more|make|as|called|label(?:ed)?|replace|refresh|put(?:\s+it)?\s+in)\s+(?:it\s+)?(?:an?\s+)?(?:option\s+)?([a-z])\b/gi,
    ),
  ];
  const last = matches[matches.length - 1]?.[1]?.toUpperCase();
  if (last) return last;
  const addMatch = prompt.match(/\badd\s+option\s+([a-z])\b/i);
  return addMatch?.[1]?.toUpperCase() ?? null;
}

function sourceCodeProposalOptionId(
  prompt: string,
  previewSet: CodeProposalSet,
): "A" | "B" | "C" | null {
  const value = sourceCodeProposalOptionLabel(prompt);
  if (!isCodeProposalOptionId(value)) return null;
  return previewSet.options.some((option) => option.id === value)
    ? value
    : null;
}

function sourceCodeProposalOptionLabel(prompt: string): string | null {
  const match = prompt.match(
    /\b(?:based\s+on|from|like|derive(?:d)?\s+from|using)\s+(?:option\s+)?([a-z])\b/i,
  );
  return match?.[1]?.toUpperCase() ?? null;
}

function isCodeProposalOptionId(
  value: string | null | undefined,
): value is "A" | "B" | "C" {
  return value === "A" || value === "B" || value === "C";
}

function nextMissingCodeProposalOptionId(
  previewSet: CodeProposalSet,
): "A" | "B" | "C" | null {
  const existing = new Set(previewSet.options.map((option) => option.id));
  return (["A", "B", "C"] as const).find((id) => !existing.has(id)) ?? null;
}

export function visualDecisionOptionCreatesLiveOverlay(option: VisualDecisionOption) {
  const text = [option.id, option.label, option.description, option.prompt]
    .join(" ")
    .toLowerCase();
  if (/\bbuild\s+direct(?:ly)?\b/.test(text)) return false;
  if (
    option.canvasAction === "show_preview" ||
    option.canvasAction === "show_options"
  ) {
    if (visualDecisionOptionCreatesCodeProposal(option)) return false;
    if (
      /\b(mockup|mockups|wireframe|wireframes|standalone\s+html|static\s+html)\b/.test(
        text,
      )
    ) {
      return false;
    }
    return shouldUseLiveOverlayProposal(text);
  }
  return (
    text.includes("codex-plan-preview") ||
    /\blive\s+(?:overlay|proposal|preview\s+proposal|preview\s+option)/.test(
      text,
    ) ||
    /\btemporary\s+(?:live\s+)?(?:overlay|proposal|preview)\b/.test(text)
  );
}

function shouldUseLiveOverlayProposal(prompt: string) {
  const text = prompt.toLowerCase();
  if (
    /\b(mockup|mockups|wireframe|wireframes|standalone\s+html|static\s+html)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /\b(new\s+(?:page|route)|multi[-\s]?page|whole\s+app|entire\s+app|redesign\s+(?:the\s+)?(?:whole|entire)|navigation\s+structure|full\s+dashboard)\b/.test(
      text,
    )
  ) {
    return false;
  }
  if (
    /\b(settings|button|filter|menu|modal|drawer|panel|sheet|popover|toolbar|header|footer|nav|tab|placement|somewhere|where|option|options|direction|directions|variant|variants|preview)\b/.test(
      text,
    )
  ) {
    return true;
  }
  return text.length <= 220 && shouldOfferPlanPreview(prompt);
}

function shouldUseCodeProposalWorkspace(prompt: string) {
  const text = prompt.toLowerCase();
  if (/\b(runnable\s+proposal|proposal\s+workspace|candidate\s+app)\b/.test(text)) {
    return true;
  }
  if (
    /\b(mockup|mockups|wireframe|wireframes|standalone\s+html|static\s+html)\b/.test(
      text,
    )
  ) {
    return false;
  }
  return /\b(runnable\s+proposal|proposal\s+workspace|candidate\s+app|new\s+(?:page|route|view)|multi[-\s]?page|whole\s+app|entire\s+app|redesign\s+(?:the\s+)?(?:whole|entire)|navigation\s+structure|full\s+dashboard|multi[-\s]?step\s+workflow|real\s+routing|route\s+and\s+state)\b/.test(
    text,
  );
}

function visualDecisionArtifactKind(option: VisualDecisionOption) {
  return previewArtifactKindFromText(
    [option.id, option.label, option.description, option.prompt].join(" "),
    "mockup",
  );
}

function explicitPreviewArtifactKind(
  prompt: string,
  fallback: PreviewArtifactKind,
) {
  return previewArtifactKindFromText(prompt, fallback);
}

function selectedMockupIdForLoadedSet(
  previewSet: MockupPreviewSet,
  preferredId: string | null | undefined,
) {
  if (
    preferredId &&
    previewSet.mockups.some((mockup) => mockup.id === preferredId)
  ) {
    return preferredId;
  }
  if (
    previewSet.selectedMockupId &&
    previewSet.mockups.some(
      (mockup) => mockup.id === previewSet.selectedMockupId,
    )
  ) {
    return previewSet.selectedMockupId;
  }
  return previewSet.mockups[0]?.id ?? null;
}

function visualDecisionSelectionPrompt(
  action: VisualDecisionComposerAction,
  visiblePrompt: string,
  proposalSetId: string | null,
  artifactKind: PreviewArtifactKind | null,
  threadId: string | null,
  liveContext = "",
  codeProposal: PreparedProposalWorkspaces | null = null,
) {
  const storageRules =
    proposalSetId && artifactKind
      ? `\n\nPreview artifact target:\n${previewArtifactStorageRules(
          proposalSetId,
          artifactKind,
          threadId,
        )}`
      : "";
  const liveOverlayRules = visualDecisionOptionCreatesLiveOverlay(action.option)
    ? `\n\n${liveOverlayProposalOutputRules(
        /\b(2|3|two|three|options|directions|variants)\b/i.test(
          action.option.prompt,
        ),
      )}\n${liveContext}`
    : "";
  const codeProposalRules = codeProposal
    ? `\n\n${codeProposalWorkspaceRules(codeProposal)}`
    : "";
  return `${VISUAL_DECISION_SELECTION_SENTINEL}

Selected desktop decision option:
- Decision id: ${action.decisionId}
- Option id: ${action.option.id}
- Label: ${action.option.label}
- Description: ${action.option.description || "none"}

Selected option prompt for supporting context:
${action.option.prompt}

The selected option is supporting context. The user-visible composer text below is authoritative if it differs from that context.
${storageRules}
${liveOverlayRules}
${codeProposalRules}

User-visible composer text:
${visiblePrompt.trim() || visualDecisionComposerText(action.option)}`;
}

function liveAppReviewContext(
  project: Project,
  contexts: ComposerContextReference[],
) {
  const rememberedPreviewUrl = rememberedPreviewUrlForProject(project.id);
  const appMarks = contexts.filter(
    (context): context is ComposerAppPreviewContext =>
      context.type === "appPreview" && context.projectId === project.id,
  );
  const lines = [
    "",
    "Current Live app context:",
    `- Remembered Live preview URL: ${
      rememberedPreviewUrl || "not remembered in this desktop session"
    }`,
  ];
  if (appMarks.length === 0) {
    lines.push("- Attached marks: none");
  } else {
    lines.push("- Attached marks:");
    for (const mark of appMarks) {
      const area = mark.areaMark;
      const target = [
        mark.proposalTurnId ? `proposal=${quotePromptValue(mark.proposalTurnId, 80)}` : "",
        mark.proposalOptionId ? `option=${mark.proposalOptionId}` : "",
        mark.canvasLane ? `lane=${mark.canvasLane}` : "",
        mark.canvasId ? `canvasId=${quotePromptValue(mark.canvasId, 80)}` : "",
        mark.sourceFile ? `sourceFile=${quotePromptValue(mark.sourceFile, 120)}` : "",
        mark.componentName ? `component=${quotePromptValue(mark.componentName, 80)}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      lines.push(
        `  - ${mark.markLabel || "Mark"} route=${quotePromptValue(
          area.route ?? mark.previewUrl,
          180,
        )} source=${
          mark.source === "proposalHighlight" ? "proposal-highlight" : "user-mark"
        } viewport=${mark.viewport} rect=${Math.round(area.x)},${Math.round(
          area.y,
        )},${Math.round(area.width)},${Math.round(
          area.height,
        )} size=${Math.round(area.viewportWidth)}x${Math.round(
          area.viewportHeight,
        )}${target ? ` ${target}` : ""}`,
      );
    }
  }
  return lines.join("\n");
}

function rememberedPreviewUrlForProject(projectId: string) {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(`codex.preview.url.${projectId}`) ?? "";
  } catch {
    return "";
  }
}

function canvasResolverInput(
  state: {
    activeLiveProposal: PlanProposal | null;
    activeProject: Project;
    activeThreadId: string | null;
    attachmentsCount: number;
    contexts: ComposerContextReference[];
    desktop: DesktopState;
    inspector: InspectorSelection;
    liveContext: string;
    selectedCodeProposalSet: CodeProposalSet | null;
    selectedMockupIsHistory: boolean;
    selectedMockupPreviewSet: MockupPreviewSet | null;
    status: ProjectEmptyStatus | null;
  },
  message: string,
) {
  const activeProposalSet =
    canvasActiveProposalSet({
      activeLiveProposal: state.activeLiveProposal,
      activeProjectId: state.activeProject.id,
      selectedCodeProposalSet: state.selectedCodeProposalSet,
      selectedMockupIsHistory: state.selectedMockupIsHistory,
      selectedMockupPreviewSet: state.selectedMockupPreviewSet,
    }) ?? null;
  return {
    message,
    live: {
      exists: !state.status?.empty,
      running: Boolean(rememberedPreviewUrlForProject(state.activeProject.id)),
      previewUrl: rememberedPreviewUrlForProject(state.activeProject.id),
    },
    selectedSurface: selectedCanvasSurface({
      activeProposalSet,
      activeLiveProposal: state.activeLiveProposal,
      inspector: state.inspector,
      selectedCodeProposalSet: state.selectedCodeProposalSet,
      selectedMockupPreviewSet: state.selectedMockupPreviewSet,
    }),
    activeProposalSet,
    historicalProposalSets: canvasHistoricalProposalSets({
      activeProjectId: state.activeProject.id,
      desktop: state.desktop,
      selectedMockupPreviewSet: state.selectedMockupPreviewSet,
    }),
    marks: state.contexts.map(canvasMarkState),
    attachmentCount: state.attachmentsCount,
    planMode: state.activeProject.settings.planMode,
  };
}

function canvasActiveProposalSet(state: {
  activeLiveProposal: PlanProposal | null;
  activeProjectId: string;
  selectedCodeProposalSet: CodeProposalSet | null;
  selectedMockupIsHistory: boolean;
  selectedMockupPreviewSet: MockupPreviewSet | null;
}): CanvasProposalState | null {
  if (
    state.selectedCodeProposalSet &&
    state.selectedCodeProposalSet.projectId === state.activeProjectId &&
    state.selectedCodeProposalSet.status !== "history" &&
    state.selectedCodeProposalSet.status !== "applied"
  ) {
    return {
      id: state.selectedCodeProposalSet.proposalSetId,
      backing: state.selectedCodeProposalSet.proposalBacking,
      buildStrategy: state.selectedCodeProposalSet.buildStrategy,
      lifecycle: "active",
      proposalLifecycle: "shown",
      selectedOptionId: state.selectedCodeProposalSet.selectedOptionId,
      options: state.selectedCodeProposalSet.options.map((option) => ({
        id: option.id,
        title: option.title,
        hasAgentMarks: option.changedFiles.length > 0,
      })),
    };
  }
  if (
    state.selectedMockupPreviewSet &&
    state.selectedMockupPreviewSet.projectId === state.activeProjectId &&
    !state.selectedMockupIsHistory
  ) {
    const total = state.selectedMockupPreviewSet.mockups.length;
    return {
      id: state.selectedMockupPreviewSet.proposalSetId,
      backing: state.selectedMockupPreviewSet.proposalBacking,
      buildStrategy: state.selectedMockupPreviewSet.buildStrategy,
      lifecycle: "active",
      proposalLifecycle: "shown",
      selectedOptionId: mockupCanvasOptionId(
        state.selectedMockupPreviewSet,
        state.selectedMockupPreviewSet.selectedMockupId,
      ),
      options: state.selectedMockupPreviewSet.mockups.map((mockup, index) => ({
        id: savedMockupCanvasSurface(mockup, index, total),
        title: mockup.title,
        hasAgentMarks: Boolean(mockup.highlights?.length),
      })),
    };
  }
  if (
    state.activeLiveProposal &&
    state.activeLiveProposal.projectId === state.activeProjectId &&
    state.activeLiveProposal.status === "pending"
  ) {
    const variants = state.activeLiveProposal.previewSpec?.variants ?? [];
    return {
      id: state.activeLiveProposal.turnId,
      backing: state.activeLiveProposal.proposalBacking ?? "live_dom_patch",
      buildStrategy:
        state.activeLiveProposal.buildStrategy ?? "convert_dom_patch_to_code",
      lifecycle: "active",
      proposalLifecycle: state.activeLiveProposal.proposalLifecycle ?? "shown",
      selectedOptionId:
        variants.length <= 1
          ? "A"
          : planVariantCanvasSurface(
              state.activeLiveProposal.previewSelectedVariantId,
            ),
      options:
        variants.length > 0
          ? variants.map((variant) => ({
              id: (variants.length <= 1 ? "A" : variant.id) as CanvasSurface,
              title: variant.title,
              hasAgentMarks: Boolean(variant.highlights?.length),
            }))
          : [{ id: "A" }],
    };
  }
  return null;
}

function canvasHistoricalProposalSets(state: {
  activeProjectId: string;
  desktop: DesktopState;
  selectedMockupPreviewSet: MockupPreviewSet | null;
}): CanvasProposalState[] {
  const codeHistory = Object.values(state.desktop.codeProposalSets)
    .filter(
      (proposal) =>
        proposal.projectId === state.activeProjectId &&
        (proposal.status === "applied" || proposal.status === "history"),
    )
    .map((proposal): CanvasProposalState => ({
      id: proposal.proposalSetId,
      backing: proposal.proposalBacking,
      buildStrategy: proposal.buildStrategy,
      lifecycle: proposal.status === "applied" ? "accepted" : "history",
      proposalLifecycle:
        proposal.status === "applied" ? "promoted_to_live" : "archived",
      selectedOptionId: proposal.selectedOptionId,
      options: proposal.options.map((option) => ({
        id: option.id,
        title: option.title,
        hasAgentMarks: option.changedFiles.length > 0,
      })),
    }));
  const mockupHistory =
    state.selectedMockupPreviewSet &&
    state.desktop.mockupHistoryProposalSetIds[
      state.selectedMockupPreviewSet.proposalSetId
    ]
      ? [
          {
            id: state.selectedMockupPreviewSet.proposalSetId,
            backing: state.selectedMockupPreviewSet.proposalBacking,
            buildStrategy: state.selectedMockupPreviewSet.buildStrategy,
            lifecycle: "history" as const,
            proposalLifecycle: "archived" as const,
            selectedOptionId: mockupCanvasOptionId(
              state.selectedMockupPreviewSet,
              state.selectedMockupPreviewSet.selectedMockupId,
            ),
            options: state.selectedMockupPreviewSet.mockups.map(
              (mockup, index) => ({
                id: savedMockupCanvasSurface(
                  mockup,
                  index,
                  state.selectedMockupPreviewSet?.mockups.length ?? 1,
                ),
                title: mockup.title,
                hasAgentMarks: Boolean(mockup.highlights?.length),
              }),
            ),
          },
        ]
      : [];
  const liveProposalHistory = Object.values(state.desktop.planProposals)
    .filter(
      (proposal) =>
        proposal.projectId === state.activeProjectId &&
        proposal.proposalKind === "live_proposal" &&
        proposal.status === "accepted" &&
        Boolean(proposal.previewSpec),
    )
    .map((proposal): CanvasProposalState => {
      const variants = proposal.previewSpec?.variants ?? [];
      return {
        id: proposal.turnId,
        backing: proposal.proposalBacking ?? "live_dom_patch",
        buildStrategy: proposal.buildStrategy ?? "convert_dom_patch_to_code",
        lifecycle: "accepted",
        proposalLifecycle:
          proposal.proposalLifecycle ?? "accepted_for_build",
        selectedOptionId:
          variants.length <= 1
            ? "A"
            : planVariantCanvasSurface(proposal.previewSelectedVariantId),
        options:
          variants.length > 0
            ? variants.map((variant) => ({
                id: (variants.length <= 1 ? "A" : variant.id) as CanvasSurface,
                title: variant.title,
                hasAgentMarks: Boolean(variant.highlights?.length),
              }))
            : [{ id: "A" }],
      };
    });
  return [...codeHistory, ...mockupHistory, ...liveProposalHistory];
}

function selectedCanvasSurface(state: {
  activeProposalSet: CanvasProposalState | null;
  activeLiveProposal: PlanProposal | null;
  inspector: InspectorSelection;
  selectedCodeProposalSet: CodeProposalSet | null;
  selectedMockupPreviewSet: MockupPreviewSet | null;
}): CanvasSurface {
  if (state.inspector.type === "codeProposalPreview") {
    return state.selectedCodeProposalSet?.selectedOptionId ?? "A";
  }
  if (state.inspector.type === "mockupPreview" && state.selectedMockupPreviewSet) {
    return (
      mockupCanvasOptionId(
        state.selectedMockupPreviewSet,
        state.selectedMockupPreviewSet.selectedMockupId,
      ) ?? "A"
    );
  }
  if (state.inspector.type === "planPreview" && state.activeLiveProposal) {
    const variants = state.activeLiveProposal.previewSpec?.variants ?? [];
    return variants.length <= 1
      ? "A"
      : planVariantCanvasSurface(state.activeLiveProposal.previewSelectedVariantId);
  }
  return state.activeProposalSet?.selectedOptionId ?? "Live";
}

function planVariantCanvasSurface(
  value: string | null | undefined,
): CanvasSurface {
  return value === "A" || value === "B" || value === "C" ? value : "A";
}

function canvasMarkState(context: ComposerContextReference) {
  if (context.type === "appPreview") {
    return {
      id: context.id,
      source:
        context.source === "proposalHighlight"
          ? ("agent_change_mark" as const)
          : ("user_mark" as const),
      surface: "Live" as const,
    };
  }
  return {
    id: context.id,
    source:
      context.source === "proposalHighlight"
        ? ("agent_change_mark" as const)
        : ("user_mark" as const),
    surface: mockupCanvasSurfaceFromLabel(context.mockupLabel) ?? "A",
    proposalSetId: context.proposalSetId,
    optionId: mockupCanvasSurfaceFromLabel(context.mockupLabel) ?? "A",
  };
}

function mockupCanvasOptionId(
  previewSet: MockupPreviewSet,
  selectedMockupId: string | null | undefined,
): CanvasSurface | null {
  const total = previewSet.mockups.length;
  const selectedIndex = previewSet.mockups.findIndex(
    (mockup) => mockup.id === selectedMockupId,
  );
  const index = selectedIndex >= 0 ? selectedIndex : 0;
  const mockup = previewSet.mockups[index];
  return mockup ? savedMockupCanvasSurface(mockup, index, total) : null;
}

function savedMockupCanvasSurface(
  mockup: SavedMockup,
  index: number,
  total: number,
): CanvasSurface {
  if (total <= 1) return "A";
  return mockupCanvasSurfaceFromLabel(mockup.label || mockup.id) ??
    (index === 0 ? "A" : index === 1 ? "B" : "C");
}

function mockupCanvasSurfaceFromLabel(
  label: string | null | undefined,
): CanvasSurface | null {
  const normalized = (label || "").trim().toUpperCase();
  return normalized === "A" ||
    normalized === "B" ||
    normalized === "C" ||
    normalized === "PREVIEW"
    ? normalized === "PREVIEW"
      ? "A"
      : normalized
    : null;
}

function latestActiveLiveProposalForThread(
  desktop: DesktopState,
  threadId: string,
) {
  return (
    Object.values(desktop.planProposals)
      .filter(
        (proposal) =>
          proposal.threadId === threadId &&
          proposal.proposalKind === "live_proposal" &&
          proposal.status === "pending" &&
          Boolean(proposal.previewSpec),
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

function archiveCanvasProposalsForThread(
  desktop: DesktopState,
  threadId: string | null,
): DesktopState {
  if (!threadId) return desktop;
  const codeProposalSetId =
    desktop.codeProposalActiveSetIdsByThreadId[threadId] ?? null;
  const codeProposalCompareSetId =
    desktop.codeProposalCompareSetIdsByThreadId[threadId] ?? null;
  const mockupProposalSetId =
    desktop.mockupActiveProposalSetIdsByThreadId[threadId] ?? null;
  let next = desktop;
  if (mockupProposalSetId) {
    next = markMockupProposalSetAsHistory(next, mockupProposalSetId);
  }
  if (codeProposalSetId && next.codeProposalSets[codeProposalSetId]) {
    next = {
      ...next,
      codeProposalActiveSetIdsByThreadId: removeRecordKey(
        next.codeProposalActiveSetIdsByThreadId,
        threadId,
      ),
      codeProposalSets: {
        ...next.codeProposalSets,
        [codeProposalSetId]: {
          ...next.codeProposalSets[codeProposalSetId],
          status: "history",
          updatedAt: Date.now(),
        },
      },
    };
  }
  if (codeProposalCompareSetId) {
    next = {
      ...next,
      codeProposalCompareSetIdsByThreadId: removeRecordKey(
        next.codeProposalCompareSetIdsByThreadId,
        threadId,
      ),
    };
  }
  const planProposals = Object.fromEntries(
    Object.entries(next.planProposals).map(([turnId, proposal]) => [
      turnId,
      proposal.threadId === threadId &&
      proposal.proposalKind === "live_proposal" &&
      proposal.status === "pending"
        ? { ...proposal, status: "superseded" as const, updatedAt: Date.now() }
        : proposal,
    ]),
  );
  return { ...next, planProposals };
}

function markCodeProposalSetAsApplied(
  desktop: DesktopState,
  proposalSetId: string,
): DesktopState {
  const stored = desktop.codeProposalSets[proposalSetId];
  if (!stored) return desktop;
  const now = Date.now();
  const selectedOptionId =
    stored.selectedOptionId ?? stored.options[0]?.id ?? null;
  const activeThreadId = stored.threadId ?? "";
  return {
    ...desktop,
    codeProposalActiveSetIdsByThreadId: activeThreadId
      ? removeRecordKey(desktop.codeProposalActiveSetIdsByThreadId, activeThreadId)
      : desktop.codeProposalActiveSetIdsByThreadId,
    codeProposalCompareSetIdsByThreadId: activeThreadId
      ? {
          ...desktop.codeProposalCompareSetIdsByThreadId,
          [activeThreadId]: proposalSetId,
        }
      : desktop.codeProposalCompareSetIdsByThreadId,
    codeProposalSets: {
      ...desktop.codeProposalSets,
      [proposalSetId]: {
        ...stored,
        selectedOptionId,
        status: "applied",
        options: stored.options.map((option) =>
          option.id === selectedOptionId
            ? {
                ...option,
                status: "applied",
                appliedAt: option.appliedAt ?? now,
              }
            : option,
        ),
        updatedAt: now,
      },
    },
  };
}

function codeProposalSetIsActiveForRouting(
  previewSet: CodeProposalSet | null,
  activeProjectId: string,
) {
  return Boolean(
    previewSet &&
      previewSet.projectId === activeProjectId &&
      previewSet.status !== "applied" &&
      previewSet.status !== "history",
  );
}

export function shouldRecoverAppliedCodeProposalFromThread(
  previewSet: CodeProposalSet,
  thread: Thread,
) {
  if (!previewSet.turnId) return false;
  const proposalTurnIndex = thread.turns.findIndex(
    (turn) => turn.id === previewSet.turnId,
  );
  if (proposalTurnIndex < 0) return false;
  const selectedOptionId = previewSet.selectedOptionId ?? previewSet.options[0]?.id ?? null;
  const candidateTurns = thread.turns
    .slice(proposalTurnIndex + 1)
    .filter((turn): turn is Turn => Boolean(turn));
  return candidateTurns.some((turn) => {
    if (turn.status !== "completed") return false;
    const userText = turn.items
      .filter((item): item is Extract<ThreadItem, { type: "userMessage" }> =>
        item.type === "userMessage",
      )
      .flatMap((item) =>
        item.content.flatMap((input) =>
          input.type === "text" ? [input.text] : [],
        ),
      )
      .join("\n");
    const agentText = finalAgentText(turn);
    if (
      !isCodeProposalImplementationCommitment(userText) &&
      !agentTextLooksLikeCodeProposalBuiltLive(agentText, selectedOptionId)
    ) {
      return false;
    }
    const requestedOptionId = optionIdFromText(userText);
    if (
      selectedOptionId &&
      requestedOptionId &&
      requestedOptionId !== selectedOptionId
    ) {
      return false;
    }
    return turn.items.some(
      (item) =>
        item.type === "fileChange" &&
        Array.isArray(item.changes) &&
        item.changes.length > 0,
    );
  });
}

function agentTextLooksLikeCodeProposalBuiltLive(
  text: string,
  selectedOptionId: "A" | "B" | "C" | null,
) {
  const normalized = text.toLowerCase();
  if (!normalized) return false;
  const optionPattern = selectedOptionId
    ? `(?:option\\s+${selectedOptionId.toLowerCase()}|${selectedOptionId.toLowerCase()})`
    : "(?:option\\s+[abc]|[abc])";
  return (
    new RegExp(`\\b(?:built|implemented|applied)\\s+${optionPattern}\\s+into\\s+live\\b`).test(
      normalized,
    ) ||
    /\b(?:built|implemented|applied)\b[\s\S]{0,80}\binto\s+live\b/.test(
      normalized,
    ) ||
    /\blive project now contains\b/.test(normalized)
  );
}

function canvasProposalOptionIds(
  prompt: string,
  wantsOptions: boolean,
): Array<"A" | "B" | "C"> {
  return codeProposalOptionIdsForPrompt(prompt, wantsOptions);
}

function canvasOperatingPromptSection(resolution?: CanvasActionResolution) {
  const action = resolution
    ? `\n\nResolved Canvas action:\n${canvasActionSummary(resolution)}`
    : "";
  return `Canvas operating prompt:
${CANVAS_OPERATING_PROMPT}${action}`;
}

function canvasQuestionPrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus | null,
  planModeWasOn: boolean,
  liveContext: string,
  resolution: CanvasActionResolution,
) {
  const question =
    resolution.question ??
    ({
      title: "How should I use Canvas?",
      reason: resolution.reason,
    } satisfies CanvasQuestion);
  const entries = status?.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : status?.empty
      ? "none"
      : "app files detected";
  return `${CANVAS_QUESTION_SENTINEL}

${canvasOperatingPromptSection(resolution)}

Desktop state:
- Project: ${project.name}
- Project already has app files: ${status?.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
${liveContext}

Agent Question Placeholder:
- Decision focus: ${question.title}
- Why Canvas is asking: ${question.reason}
- This turn is decision-only. Do not run commands, edit files, create mockup artifacts, or create proposal workspaces in this turn.
- Reason about the user's request and author the questionnaire yourself.
- Return one short product-facing sentence plus exactly one fenced \`\`\`codex-decision-strip JSON block.
- Do not copy fixed default wording unless it genuinely fits the user's intent.
- Use 2 or 3 choices; labels must be product-facing and 15 characters or fewer.
- Each choice prompt must be self-contained and describe the next agent turn clearly.
- Each choice must include one canvasAction value from the allowed list below so the desktop can route the user's click.
- Do not include Markdown code fences or triple backticks inside decision-strip JSON string values.
- Do not expose Canvas resolver internals, hidden payloads, workspace paths, or storage details.

Allowed canvasAction values:
- build_directly: implement in the real Live app.
- show_preview: create one reviewable proposal lane before implementation.
- show_options: create two or three proposal lanes before implementation.
- add_option: add or refresh one option in an active proposal set.
- replace_option: replace one option in an active proposal set.
- start_fresh: archive the current proposal context and begin a fresh proposal set.

Decision strip JSON shape:
{
  "title": "A short question tailored to this request",
  "summary": "Why this choice helps the user decide",
  "options": [
    {
      "id": "stable-short-id",
      "label": "15 chars max",
      "description": "One concise sentence.",
      "prompt": "Self-contained instruction for the next Codex turn.",
      "canvasAction": "build_directly | show_preview | show_options | add_option | replace_option | start_fresh"
    }
  ]
}

Routing guidance for authored choices:
- For small current-app visual ideas, a one-option preview should ask for a temporary live proposal with codex-plan-preview metadata and no real app file changes.
- For multiple current-app directions, ask for two or three proposal variants; choose live proposal metadata for small placement/control work and runnable proposal workspaces for serious page/workflow/redesign work.
- For blank-project or serious runnable proposal choices, mention runnable proposal workspaces in the option prompt so the desktop prepares isolated A/B/C folders.
- Avoid asking a questionnaire if the user's wording already clearly chooses direct build, one proposal, or multiple options; in that case the resolver should not have selected this decision-only turn.

Original user request:
${originalPrompt.trim()}`;
}

function canvasArchivePrompt(
  originalPrompt: string,
  resolution: CanvasActionResolution,
) {
  return `${CANVAS_QUESTION_SENTINEL}

${canvasOperatingPromptSection(resolution)}

Canvas action:
- Archive the active Canvas proposals for this thread.
- Keep the response short and product-facing.
- Do not expose hidden state, storage paths, or resolver details.

Original user request:
${originalPrompt.trim()}`;
}

function savedPreviewArtifactPrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus,
  wantsOptions: boolean,
  planModeWasOn: boolean,
  liveContext: string,
  proposalSetId: string,
  artifactKind: PreviewArtifactKind,
  threadId: string | null,
  resolution?: CanvasActionResolution,
) {
  const entries = status.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  return `${SAVED_MOCKUP_REVIEW_SENTINEL}

${canvasOperatingPromptSection(resolution)}

Desktop state:
- The user is asking for a saved local ${previewArtifactDisplayName(
    artifactKind,
    wantsOptions ? 2 : 1,
    "lower",
  )} before implementation.
- Project: ${project.name}
- Project already has app files: ${status.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user asked to review visual direction before implementation.
${liveContext}

Task:
- Create ${wantsOptions ? "2 or 3" : "one"} saved HTML review preview${wantsOptions ? " directions" : ""} under .codex/mockups for the requested current-app change.
- Do not change real app implementation files in this turn.
- Stop after the review artifact is ready; the desktop will open it automatically.

Rules:
${previewArtifactStorageRules(proposalSetId, artifactKind, threadId)}
- Name proposed options after user-facing workflow concepts from the plan, not after placement or component buckets.
- Read the current project enough to reflect existing UI, brand, layout, route shape, palette, typography, and density. Do not overbuild platform logic or fake backend routes.
- If a Live/App mark is attached below, scope the review preview to that area unless the user text says otherwise.
- Add a highlights array to each manifest mockup entry when useful. Each highlight should name a visual area added or changed and include x, y, width, height, viewportWidth, viewportHeight, and a short note. These are review overlays only; they must not appear in accepted app UI.
- Include small local interactions where useful: toggles, filters, dialogs, selected rows/cards, or simple edit states.
- Avoid debug text, internal logs, DOM tag editing UI, CSS property panels, and CSS-property inspectors.

User request:
${originalPrompt.trim()}`;
}

function liveOverlayProposalPrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus,
  wantsOptions: boolean,
  planModeWasOn: boolean,
  liveContext: string,
  resolution?: CanvasActionResolution,
) {
  const entries = status.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  return `${LIVE_OVERLAY_PROPOSAL_SENTINEL}

${canvasOperatingPromptSection(resolution)}

Desktop state:
- Project: ${project.name}
- Project already has app files: yes
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user asked to review a visual direction before implementation.
${liveContext}

${liveOverlayProposalOutputRules(wantsOptions)}

Original user request:
${originalPrompt.trim()}`;
}

function codeProposalWorkspacePrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus,
  wantsOptions: boolean,
  planModeWasOn: boolean,
  liveContext: string,
  prepared: PreparedProposalWorkspaces,
  resolution?: CanvasActionResolution,
) {
  const entries = status.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  return `${CODE_PROPOSAL_WORKSPACE_SENTINEL}

${canvasOperatingPromptSection(resolution)}

Desktop state:
- Project: ${project.name}
- Project already has app files: ${status.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user asked to review ${wantsOptions ? "runnable options" : "a runnable proposal"} before implementation.
${liveContext}

${codeProposalWorkspaceRules(prepared)}

Original user request:
${originalPrompt.trim()}`;
}

function codeProposalAddOptionPrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus | null,
  planModeWasOn: boolean,
  liveContext: string,
  previewSet: CodeProposalSet,
  prepared: PreparedProposalWorkspaces,
  request: CodeProposalAddOptionRequest,
) {
  const entries = status?.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  const existingOptions = previewSet.options.map((option) => {
    const source = option.id === request.sourceOptionId ? " [source]" : "";
    return `- Option ${option.id}: ${option.workspacePath}${source}`;
  });
  return `${CODE_PROPOSAL_WORKSPACE_SENTINEL}

${canvasOperatingPromptSection()}

Desktop state:
- Project: ${project.name}
- Project already has app files: ${status?.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user is adding or revising Option ${request.optionId} inside an existing runnable proposal set.
- Keep the existing proposal set active so the user can compare ${previewSet.options.map((option) => option.id).join("/")} with Option ${request.optionId}.
${liveContext}

Existing proposal options:
${existingOptions.join("\n")}

${codeProposalWorkspaceRules(prepared)}

Additional proposal rules:
- Work only inside the prepared Option ${request.optionId} folder. Do not edit the live project and do not edit existing option folders such as A or B.
- Keep the option label as Option ${request.optionId}; do not rename it to Option A just because this turn has one prepared folder.
- The desktop supports at most three active comparison options at once: A, B, and C. If the user asks for Option D or more simultaneous options in follow-up, say that honestly and ask whether to revise/replace A, B, or C or start a fresh proposal set.
${request.sourceOptionId ? `- Use Option ${request.sourceOptionId} as the visual/code starting point when useful, then apply the user's requested differences in Option ${request.optionId}.` : "- Use the current live project and existing options as visual context, then create the requested option."}
- Stop when Option ${request.optionId} is ready. The desktop will keep it beside the existing options for comparison.

Original user request:
${originalPrompt.trim()}`;
}

function codeProposalReviewPrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus | null,
  planModeWasOn: boolean,
  liveContext: string,
  previewSet: CodeProposalSet,
  requestedOptionId: "A" | "B" | "C" | null,
) {
  const entries = status?.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  const selected =
    previewSet.options.find((option) => option.id === requestedOptionId) ??
    previewSet.options.find(
      (option) => option.id === previewSet.selectedOptionId,
    ) ??
    previewSet.options[0] ??
    null;
  const existingOptions = previewSet.options.map(
    (option) =>
      `- Option ${option.id}: ${option.title}; ${option.summary || "No summary saved."}; workspace=${option.workspacePath}${option.id === selected?.id ? " [selected]" : ""}`,
  );
  return `${CODE_PROPOSAL_WORKSPACE_SENTINEL}

${canvasOperatingPromptSection()}

Desktop state:
- Project: ${project.name}
- Project path: ${project.path}
- Project already has app files: ${status?.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user is responding to an existing runnable proposal set.
- Selected option: ${selected ? `Option ${selected.id} (${selected.workspacePath})` : "none"}
- This request was sent to the agent instead of being desktop-fast-applied. The composer is the decision surface; the agent must decide whether to revise the proposal or build Live.
${liveContext}

Existing proposal options:
${existingOptions.join("\n")}

Decision policy:
- The visible user request is authoritative. Do not silently promote a proposal to Live if the user is really asking to revise the proposal first.
- If the user explicitly asks to build/implement/apply the selected option into Live, edit the real project at ${project.path}. Use the selected option workspace as source/reference and incorporate any attached marks or extra typed changes.
- If the user asks to tweak, revise, compare, or show changes before implementation, edit only the relevant proposal option workspace and stop before changing Live.
- If the intent is ambiguous between revising the proposal and implementing Live, ask one concise product-facing question instead of applying.
- Do not rename Option ${selected?.id ?? "A"} or create a fresh A-only proposal when the user is referring to an existing option.
- Canvas v2 supports at most three active comparison options: A, B, and C. If the user asks for more, say that plainly.
- Keep the final response product-facing and summarize whether you changed Live, changed a proposal option, or need a decision.

Original user request:
${originalPrompt.trim()}`;
}

function featureDraftWorkspacePrompt(
  originalPrompt: string,
  project: Project,
  status: ProjectEmptyStatus | null,
  planModeWasOn: boolean,
  liveContext: string,
  draft: FeatureDraft,
) {
  const entries = status?.meaningfulEntries.length
    ? status.meaningfulEntries.slice(0, 12).join(", ")
    : "app files detected";
  return `${FEATURE_DRAFT_WORKSPACE_SENTINEL}

${canvasOperatingPromptSection()}

Desktop state:
- Project: ${project.name}
- Project already has app files: ${status?.empty ? "no" : "yes"}
- Meaningful entries: ${entries}
- Original composer Plan Mode was: ${planModeWasOn ? "on" : "off"}
- The user asked for one reviewable Draft in the real app context.
- Draft name: ${draft.name}
${liveContext}

Draft rules:
- This is a review-only Draft turn. The current working directory is an isolated Draft copy of Live.
- Work only in the current Draft workspace. Do not edit the real Live project source in this turn.
- Create one coherent Draft, not A/B/C options, mockup files, wireframe artifacts, or a decision strip.
- Preserve the existing project conventions and make the Draft runnable in App Preview.
- Use product-facing language in the visible response. Do not mention internal paths, workspace IDs, registry IDs, selectors, source paths, hidden JSON, or coordinates.
- Stop after the Draft is ready. The desktop will show it as Draft and will only update Live if the user chooses Build this.

User request:
${originalPrompt.trim()}`;
}

function featureDraftRevisionPrompt(
  draft: FeatureDraft,
  userPrompt: string,
  liveContext: string,
) {
  return `${FEATURE_DRAFT_WORKSPACE_SENTINEL}

${canvasOperatingPromptSection()}

Desktop state:
- The user is revising an active Draft.
- Draft name: ${draft.name}
- Current Draft summary: ${draft.summary || "Draft ready for review."}
${liveContext}

Draft revision rules:
- The current working directory is the isolated Draft copy. Revise only this Draft.
- Do not edit the real Live project source unless the user explicitly says Build this.
- Keep this as one Draft. Do not create A/B/C options, mockup files, wireframe artifacts, or a decision strip.
- Use product-facing language in the visible response. Do not mention internal paths, workspace IDs, registry IDs, selectors, source paths, hidden JSON, or coordinates.
- Stop after the Draft is revised.

User request:
${userPrompt.trim() || "Revise the draft."}`;
}

function featureDraftBuildPrompt(draft: FeatureDraft, project: Project) {
  const changes =
    draft.changedFiles.length > 0
      ? draft.changedFiles
          .map((change) => `- ${change.kind}: ${change.path}`)
          .join("\n")
      : "- No changed file summary recorded; inspect the Draft workspace.";
  return [
    "Build this.",
    "",
    "Project context explicitly attached by the user:",
    "The user accepted the active Draft and asked to build it into Live.",
    "Inspect the current Live project and use the Draft workspace as reference.",
    "Update the real project source using existing conventions. Do not replace the project wholesale unless that is the smallest safe implementation.",
    "Do not add Codex proposal chrome, Draft banners, fake controls, or temporary preview metadata to the accepted app UI.",
    "Do not start or stop local preview servers from this implementation turn; the App Preview toolbar owns that.",
    "After editing, summarize user-facing source changes and mention any mismatch or uncertainty versus the Draft.",
    "In visible progress and the final response, do not mention internal paths, workspace IDs, registry IDs, selectors, source paths, hidden JSON, or coordinates.",
    "",
    `Live project path: ${project.path}`,
    `Draft workspace path: ${draft.workspacePath}`,
    `Draft brief path: ${draft.briefPath}`,
    `Original Draft request: ${draft.originalPrompt}`,
    `Draft summary: ${draft.summary}`,
    "Draft file change summary:",
    changes,
  ].join("\n");
}

function liveOverlayProposalOutputRules(wantsOptions: boolean) {
  return `Live proposal metadata rules:
- This is a review-only proposal turn. You may inspect the project, but do not edit app implementation files and do not create saved .codex/mockups artifacts.
- Return a concise product-facing response plus exactly one fenced \`\`\`codex-plan-preview JSON block.
- The JSON block must be a single object shaped like: {"version":1,"summary":"...","variants":[{"id":"A","title":"...","tradeoff":"...","placement":"topbar","summary":"...","route":"...","viewState":"...","targetRegion":"...","highlights":[],"components":[]}]}.
- Use the Live app as the base. The desktop will select the proposal in Live Preview and use highlights for \`Show changes\`; it will not render fake Codex UI inside the user's app, so do not duplicate the full app into static HTML.
- Do not describe or request visible Codex proposal chrome inside the app surface: no \`Proposed\` banners, fake CTA buttons, generic proposal cards, DOM tags, CSS boxes, or placeholder controls such as \`Open settings\`.
- Return ${wantsOptions ? "two or three variants with ids A/B/C" : "one variant with id A"}.
- Each variant must have version-compatible fields: id, title, tradeoff, placement, summary, and components.
- placement must be one of: topbar, sidePanel, modal.
- Components may use kind button, panel, menu, modal, input, or badge, with label, body, and optional actionLabel as metadata for implementation context, not as fake controls to render in the app.
- Add route, viewState, or targetRegion on each variant when it helps the user understand where the proposal applies.
- Add a highlights array for each variant when practical. Each highlight needs id, label, note, and areaMark with x, y, width, height, viewportWidth, viewportHeight, optional route, note, and createdAt. Use the current visible app viewport as the coordinate basis when known; otherwise use a reasonable 1440x900 desktop basis.
- Highlights power the "Show changes" overlay and must not appear in accepted app UI.
- If the request is too broad for honest Live proposal metadata, say that briefly and return the smallest useful proposal rather than editing files.
- Avoid debug text, internal logs, DOM tag editing UI, CSS property panels, and fake backend routes.`;
}

function codeProposalWorkspaceRules(prepared: PreparedProposalWorkspaces) {
  const optionLines = prepared.options.map(
    (option) => `- Option ${option.id}: ${option.workspacePath}`,
  );
  return `Runnable proposal workspace rules:
- This is a review-only proposal turn. The desktop already copied the live project into isolated option folders under the current working directory.
- Work only inside the listed option folders. Do not edit the original live project path and do not write .codex/mockups artifacts for this turn.
- Build each requested option as a runnable candidate app in its own folder. Preserve the existing project conventions in that folder when present.
- If the folder is empty, create the smallest complete runnable web app needed for that option, including index.html/CSS/JS or package files only when useful.
- Keep options meaningfully distinct and label final answer sections by Option A/B/C.
- In visible progress and final responses, use product-facing option names only. Do not mention prepared folders, workspace paths, proposal metadata files, temp paths, or storage locations.
- The desktop supports at most three active comparison options at once: A, B, and C. If the user asks for Option D or more simultaneous options, say that plainly and ask whether to revise/replace A, B, or C or start a fresh proposal set instead.
- Stop after the proposal workspaces are ready. The desktop will diff the selected option and apply it to Live if the user accepts it.

Prepared proposal folders:
${optionLines.join("\n")}`;
}

function savedMockupReviewPrompt(
  userPrompt: string,
  previewSet: MockupPreviewSet,
) {
  const selected =
    previewSet.mockups.find(
      (mockup) => mockup.id === previewSet.selectedMockupId,
    ) ?? previewSet.mockups[0];
  const optionLines = previewSet.mockups.map(
    (mockup) =>
      `- ${mockup.label || mockup.id}: ${mockup.title} — ${
        mockup.summary || "No summary saved."
      } (${mockup.filePath})${mockup.id === selected?.id ? " [selected]" : ""}`,
  );
  return `${SAVED_MOCKUP_REVIEW_SENTINEL}

${canvasOperatingPromptSection()}

Desktop state:
- The user is reviewing saved local ${previewArtifactDisplayName(
    previewSet.artifactKind,
    previewSet.mockups.length,
    "lower",
  )} for this project.
- Proposal set folder: ${previewSet.baseDir}
- Selected option: ${selected ? `${selected.label || selected.id} — ${selected.title}` : "none"}
- Original request: ${previewSet.originalPrompt || "Not saved; use the saved manifest and chat context only as supporting context."}

Saved options:
${optionLines.join("\n")}

Decision policy:
- Do not return a codex-decision-strip block, fixed questionnaire, or generic action choices for this saved mockup review path. Do the relevant saved preview work directly, then summarize what changed.
- Let the user's request drive the next step; do not show or ask a fixed questionnaire.
- The selected saved option is supporting context only. If the user-visible request conflicts with it, follow the user-visible request.
- Treat exploratory implementation wording as review/proposal intent when placement or workflow is still vague. Phrases like "looking to implement", "thinking of adding", "somewhere", "where should", "show it first", or "where it should be" should update or create a proposal preview first, not change real app files.
- If the user asks for another/new option and names a label such as "Option C", create or update that labeled saved option in the same proposal set folder. For example, "create another wireframe based on B, but make it C" means keep B untouched, derive a new C file from B, add C to manifest.json, and set selectedMockupId to C.
- If the user asks for another option without a label, use the next available A/B/C label in the same proposal set.
- Canvas v2 supports at most three active saved preview options at once: A, B, and C. If the user asks for Option D or more simultaneous options, do not silently relabel it as A/B/C; say the limit plainly and ask whether to revise/replace A, B, or C or start a fresh proposal set.
- If they ask to combine, change, improve, explore, place, preview, show, or decide where something should go, update or create saved ${previewArtifactDisplayName(
    previewSet.artifactKind,
    2,
    "lower",
  )} inside ${previewSet.baseDir} and stop before real implementation.
- When updating or creating saved ${previewArtifactDisplayName(
    previewSet.artifactKind,
    2,
    "lower",
  )}, update the manifest entry summaries and add or refresh a highlights array for each changed visual area whenever practical. Each highlight should name the changed area and include x, y, width, height, viewportWidth, viewportHeight, and a short note. These highlights power the preview "Show changes" overlay and must not appear inside accepted app UI.
- If a changed area cannot be bounded confidently, say that plainly in the response instead of inventing a fake highlight.
- Only implement the real app when the user explicitly commits with wording such as "implement option A", "implement now", "build selected", "apply this", "make this real", or "use option A and implement". In that case, build from the selected or described ${previewArtifactActionName(
    previewSet.artifactKind,
  )} direction.
- If their intent is ambiguous between revising the ${previewArtifactActionName(
    previewSet.artifactKind,
  )} and implementing, ask one concise product-facing question in the response.
- Avoid debug text, DOM tag editing UI, CSS property panels, fake backend routes, and platform-specific hardcoded user-app logic.

User request:
${userPrompt.trim()}`;
}

function mockupVisibleOptionName(mockup: SavedMockup) {
  const label = (mockup.label || "").trim();
  if (/^[A-Z]$/i.test(label)) return `option ${label.toUpperCase()}`;
  return "selected preview";
}

function isSavedMockupImplementationCommitment(prompt: string) {
  const text = prompt.trim().toLowerCase();
  if (!text) return false;
  if (
    /\b(?:looking|thinking|considering|planning)\s+to\s+implement\b/.test(
      text,
    )
  ) {
    return false;
  }
  return (
    /\bbuild\s+(?:selected|this|that|it|[abc]|option\s+[abc]|the\s+selected)\b/.test(
      text,
    ) ||
    /\bapply\s+(?:this|that|it|[abc]|option\s+[abc]|the\s+selected)\b/.test(text) ||
    /\bmake\s+(?:this|that|it|option\s+[abc]|the\s+selected)\s+real\b/.test(
      text,
    ) ||
    /\bimplement\s+(?:now|this|that|it|[abc]|option\s+[abc]|the\s+selected|selected)\b/.test(
      text,
    ) ||
    /\buse\s+option\s+[abc]\b.*\bimplement\b/.test(text) ||
    /\bi\s+like\s+(?:this|that|it)\b.*\bimplement\b/.test(text) ||
    /\bplease\s+implement\s+(?:this|that|it|option\s+[abc])\b/.test(text)
  );
}

function isCodeProposalImplementationCommitment(prompt: string) {
  return isSavedMockupImplementationCommitment(prompt);
}

function optionIdFromText(prompt: string): "A" | "B" | "C" | null {
  const match = prompt.match(/\boption\s+([abc])\b|\b([abc])\b/i);
  const value = (match?.[1] || match?.[2] || "").toUpperCase();
  return value === "A" || value === "B" || value === "C" ? value : null;
}

function updateCodeProposalOption(
  previewSet: CodeProposalSet,
  optionId: "A" | "B" | "C",
  patch: Partial<CodeProposalOption>,
): CodeProposalSet {
  return {
    ...previewSet,
    options: previewSet.options.map((option) =>
      option.id === optionId ? { ...option, ...patch } : option,
    ),
    updatedAt: Date.now(),
  };
}

function sortCodeProposalOptions(options: CodeProposalOption[]) {
  const order = new Map<"A" | "B" | "C", number>([
    ["A", 0],
    ["B", 1],
    ["C", 2],
  ]);
  return [...options].sort(
    (left, right) => (order.get(left.id) ?? 99) - (order.get(right.id) ?? 99),
  );
}

function removeRecordKey<T>(
  record: Record<string, T>,
  key: string | null | undefined,
) {
  if (!key || !(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function codeProposalChangeSummary(changes: CodeProposalFileChange[]) {
  if (changes.length === 0) return "No file changes detected yet.";
  const created = changes.filter((change) => change.kind === "created").length;
  const updated = changes.filter((change) => change.kind === "updated").length;
  const deleted = changes.filter((change) => change.kind === "deleted").length;
  return [
    created ? `${created} created` : "",
    updated ? `${updated} updated` : "",
    deleted ? `${deleted} deleted` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function createFeatureDraftId(seed: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `draft-${seed.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 24)}-${random}`;
}

function featureDraftName(prompt: string) {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();
  if (!cleaned) return "Feature draft";
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 60 ? `${words.slice(0, 57).trim()}...` : words;
}

function featureDraftIsActiveForRouting(
  draft: FeatureDraft | null,
  activeProjectId: string,
) {
  return (
    Boolean(draft) &&
    draft?.projectId === activeProjectId &&
    draft.lifecycle === "active" &&
    draft.status !== "failed"
  );
}

function markFeatureDraftBuilt(
  desktop: DesktopState,
  draftId: string,
): DesktopState {
  const stored = desktop.featureDrafts[draftId];
  if (!stored) return desktop;
  return {
    ...desktop,
    featureDrafts: {
      ...desktop.featureDrafts,
      [draftId]: {
        ...stored,
        lifecycle: "built",
        status: "ready",
        updatedAt: Date.now(),
      },
    },
    featureDraftActiveIdsByThreadId: Object.fromEntries(
      Object.entries(desktop.featureDraftActiveIdsByThreadId).filter(
        ([, activeDraftId]) => activeDraftId !== draftId,
      ),
    ),
  };
}

function parkFeatureDraftInState(
  desktop: DesktopState,
  draftId: string,
): DesktopState {
  const stored = desktop.featureDrafts[draftId];
  if (!stored) return desktop;
  return {
    ...desktop,
    featureDrafts: {
      ...desktop.featureDrafts,
      [draftId]: {
        ...stored,
        lifecycle: "parked",
        updatedAt: Date.now(),
      },
    },
    featureDraftActiveIdsByThreadId: Object.fromEntries(
      Object.entries(desktop.featureDraftActiveIdsByThreadId).filter(
        ([, activeDraftId]) => activeDraftId !== draftId,
      ),
    ),
  };
}

function resumeFeatureDraftInState(
  desktop: DesktopState,
  draftId: string,
  threadId: string,
): DesktopState {
  const stored = desktop.featureDrafts[draftId];
  if (!stored) return desktop;
  return {
    ...desktop,
    featureDrafts: {
      ...desktop.featureDrafts,
      [draftId]: {
        ...stored,
        lifecycle: "active",
        threadId,
        updatedAt: Date.now(),
      },
    },
    featureDraftActiveIdsByThreadId: {
      ...desktop.featureDraftActiveIdsByThreadId,
      [threadId]: draftId,
    },
  };
}

function markMockupProposalSetAsHistory(
  desktop: DesktopState,
  proposalSetId: string,
): DesktopState {
  if (!proposalSetId) return desktop;
  return {
    ...desktop,
    mockupActiveProposalSetIdsByThreadId: Object.fromEntries(
      Object.entries(desktop.mockupActiveProposalSetIdsByThreadId).filter(
        ([, activeProposalSetId]) => activeProposalSetId !== proposalSetId,
      ),
    ),
    mockupHistoryProposalSetIds: {
      ...desktop.mockupHistoryProposalSetIds,
      [proposalSetId]: true,
    },
  };
}

function latestAcceptedPlanProposalForThread(
  desktop: DesktopState,
  threadId: string,
) {
  return (
    Object.values(desktop.planProposals)
      .filter(
        (proposal) =>
          proposal.threadId === threadId && proposal.status === "accepted",
      )
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null
  );
}

function updatePlanProposalStatus(
  proposals: Record<string, PlanProposal>,
  turnId: string,
  status: PlanProposal["status"],
) {
  const proposal = proposals[turnId];
  if (!proposal) return proposals;
  return {
    ...proposals,
    [turnId]: {
      ...proposal,
      status,
      updatedAt: Date.now(),
    },
  };
}

function markLiveProposalAcceptedForBuild(
  proposals: Record<string, PlanProposal>,
  turnId: string,
) {
  const proposal = proposals[turnId];
  if (!proposal) return proposals;
  return {
    ...proposals,
    [turnId]: {
      ...proposal,
      status: "accepted" as const,
      proposalLifecycle: "accepted_for_build" as const,
      proposalBacking:
        proposal.proposalBacking ?? liveProposalBackingForPreview(proposal),
      buildStrategy:
        proposal.buildStrategy ??
        buildStrategyForProposalBacking(liveProposalBackingForPreview(proposal)),
      updatedAt: Date.now(),
    },
  };
}

function liveProposalBuildStaleness(
  proposal: PlanProposal,
  project: Project,
) {
  const selectedVariant = selectedPlanPreviewVariant(
    proposal.previewSpec,
    proposal.previewSelectedVariantId,
  );
  return evaluateLiveDomPatchStaleness({
    proposalProjectId: proposal.projectId,
    currentProjectId: project.id,
    proposalBacking: proposal.proposalBacking,
    buildStrategy: proposal.buildStrategy,
    variant: selectedVariant,
    bundle: selectedVariant?.visualPatchBundle ?? null,
    baselineSession: proposal.previewBaselineSession ?? null,
    currentSession: proposal.previewSession ?? null,
    currentPreviewUrl:
      rememberedPreviewUrlForProject(project.id) ||
      proposal.previewSession?.previewUrl ||
      null,
    currentRoute: proposal.previewSession?.route ?? null,
    currentViewport: proposal.previewSession?.viewport ?? null,
  });
}

function liveProposalBackingForPreview(proposal: PlanProposal): ProposalBacking {
  return liveProposalBackingForPreviewSpec(
    proposal.previewSpec,
    proposal.previewSelectedVariantId ?? null,
  );
}

function liveProposalBackingForPreviewSpec(
  previewSpec: PlanProposal["previewSpec"],
  selectedVariantId: string | null,
): Extract<ProposalBacking, "live_dom_patch" | "mockup_artifact"> {
  return selectedPlanPreviewVariantHasVisualPatchBundle(
    previewSpec,
    selectedVariantId,
  )
    ? "live_dom_patch"
    : "mockup_artifact";
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

function classifyPlanProposalKind(
  prompt: string,
  finalText: string,
): PlanProposal["proposalKind"] {
  if (isNoPlanProposalRequest(prompt)) return "plan";
  const text = finalText.toLowerCase();
  if (/\bsafer\s+(alternative|plan|path|shape)\b/.test(text)) {
    return "safer_alternative";
  }
  if (/\bchallenge[sd]?\b|\bchallenging\b/.test(text)) {
    return "safer_alternative";
  }
  if (
    /\b(?:would|should)\s+not\s+(?:build|implement|create|accept|recommend)\b/.test(
      text,
    ) ||
    /\bnot\s+(?:recommend|build|implement|create|accept)\b/.test(text) ||
    /\b(?:reject|decline)\s+(?:the\s+)?(?:requested|request|literal)\b/.test(
      text,
    )
  ) {
    return "safer_alternative";
  }
  const warnsAboutDuplicate =
    /\b(duplicate|duplicat(?:e|es|ing|ed)|collision|parallel|separate\s+(?:store|api|service|system|subsystem|job|table))\b/.test(
      text,
    );
  const offersAlternative =
    /\b(instead|rather than|keep(?:ing)?\s+it|recommend(?:ed)?|safer|simpler|reuse)\b/.test(
      text,
    );
  return warnsAboutDuplicate && offersAlternative
    ? "safer_alternative"
    : "plan";
}

function isNoPlanProposalRequest(prompt: string) {
  const text = prompt.toLowerCase();
  return (
    /\bno\s+(?:plan\s+)?proposal\b/.test(text) ||
    /\bwithout\s+(?:a\s+)?(?:plan\s+)?proposal\b/.test(text) ||
    /\bdo\s+not\s+(?:create|show|return|make)\s+(?:a\s+)?(?:plan\s+)?proposal\b/.test(
      text,
    ) ||
    /\bdon't\s+(?:create|show|return|make)\s+(?:a\s+)?(?:plan\s+)?proposal\b/.test(
      text,
    )
  );
}

function planProposalRevisionPrompt(
  proposal: PlanProposal,
  feedback = "",
  attachedPreview = "",
) {
  void proposal;
  const feedbackText = feedback.trim();
  const visibleRequest = feedbackText || "Please revise the plan.";
  const contextLines = [
    "Plan revision rules:",
    "- Revise the previous plan; do not edit files yet.",
    "- Return a revised product-facing plan.",
    "- If visual changes still matter, keep the written plan and proposed visual option names aligned.",
    "- For menus, filters, drawers, hover states, and similar click consequences, describe the same-screen state clearly instead of inventing separate pages.",
  ];
  const previewText = attachedPreview.trim();
  if (previewText) {
    contextLines.push("", "Selected preview context:", previewText);
  }
  return [
    visibleRequest,
    "",
    "Project context explicitly attached by the user:",
    ...contextLines,
  ].join("\n");
}

function liveOverlayProposalRevisionPrompt(
  proposal: PlanProposal,
  feedback = "",
  attachedPreview = "",
) {
  const feedbackText = feedback.trim();
  const visibleRequest = feedbackText || "Please revise the proposal.";
  const contextLines = [
    "Live overlay proposal revision rules:",
    "- Revise the previous temporary Live proposal; do not edit implementation files yet.",
    "- Return a concise product-facing response plus exactly one fenced ```codex-plan-preview JSON block.",
    "- Keep the proposal based on the current Live app, not copied static HTML.",
    "- Keep option titles, tradeoffs, components, and highlights aligned.",
    "- For menus, filters, drawers, hover states, and similar click consequences, describe the same-screen state clearly instead of inventing separate pages.",
  ];
  const previewText = attachedPreview.trim();
  if (previewText) {
    contextLines.push("", "Selected preview context:", previewText);
  }
  return [
    visibleRequest,
    "",
    "Project context explicitly attached by the user:",
    ...contextLines,
    "",
    `Original proposal request: ${proposal.prompt}`,
  ].join("\n");
}

function planProposalAcceptPrompt(attachedPreview = "") {
  const previewText = attachedPreview.trim();
  if (!previewText) {
    return "I accept this plan. Implement it now.";
  }
  return [
    "I accept this plan. Implement it now.",
    "",
    "Project context explicitly attached by the user:",
    "Selected live app preview guidance. This supports the accepted plan; if any user-visible instruction conflicts with this context, the user-visible instruction wins.",
    "",
    previewText,
  ].join("\n");
}

function liveOverlayProposalAcceptPrompt(
  proposal: PlanProposal,
  attachedPreview = "",
) {
  const previewText = attachedPreview.trim();
  const selectedVariant = selectedPlanPreviewVariant(
    proposal.previewSpec,
    proposal.previewSelectedVariantId,
  );
  const patchBundle = selectedVariant?.visualPatchBundle ?? null;
  const patchText = patchBundle
    ? JSON.stringify(patchBundle, null, 2)
    : "";
  const backing = proposal.proposalBacking ?? liveProposalBackingForPreview(proposal);
  const buildStrategy =
    proposal.buildStrategy ?? buildStrategyForProposalBacking(backing);
  const buildGuidance =
    buildStrategy === "convert_dom_patch_to_code"
      ? [
          "The accepted proposal is a preview-only visual patch. Convert it into real source edits in the current project using existing component, styling, and state-management conventions.",
          "Treat style/text/hide/show patch operations as the desired visual outcome, not as instructions to paste inline styles or mutate the DOM directly.",
          "Do not introduce inline-style sludge unless the existing local code already uses that convention for the touched component.",
          "Use canvasId, sourceFile, componentName, screenshot, bounds, route, and viewport metadata as hints. Inspect the project before making source-level claims or edits.",
        ]
      : [
          "The accepted proposal is visual guidance, not a recorded DOM patch. Implement the selected outcome in real source edits using the proposal summary, highlights, route, viewport, and attached preview context as guidance.",
          "Inspect the current project before making source-level claims or edits.",
        ];
  const highlights =
    selectedVariant?.highlights
      ?.map((highlight) => {
        const source = [
          highlight.canvasId ? `canvasId=${highlight.canvasId}` : "",
          highlight.sourceFile ? `sourceFile=${highlight.sourceFile}` : "",
          highlight.componentName ? `component=${highlight.componentName}` : "",
          highlight.screenshotRef ? `screenshotRef=${highlight.screenshotRef}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `- ${highlight.label}: ${highlight.note}${source ? ` (${source})` : ""}`;
      })
      .join("\n") ?? "";
  return [
    "Build selected.",
    "",
    "Project context explicitly attached by the user:",
    "Selected live app proposal guidance. This supports the accepted change; if any user-visible instruction conflicts with this context, the user-visible instruction wins.",
    "",
    `Build selected strategy: ${buildStrategy}.`,
    ...buildGuidance,
    "Do not add Codex proposal chrome, banners, fake controls, or temporary preview metadata to the accepted app UI.",
    "Do not start or stop local preview servers from this implementation turn; the App Preview toolbar owns that.",
    "After editing, summarize the source changes and mention any mismatch or uncertainty versus the accepted preview.",
    "",
    `Original proposal request: ${proposal.prompt}`,
    selectedVariant
      ? `Selected option: ${selectedVariant.id} - ${selectedVariant.title}`
      : "Selected option: A",
    patchText
      ? `Accepted VisualPatch bundle:\n${patchText}`
      : "Accepted VisualPatch bundle: none recorded; use the selected proposal summary and attached visual references.",
    highlights ? `Proposal change highlights:\n${highlights}` : "",
    previewText ? `Selected preview context:\n${previewText}` : "",
  ].join("\n");
}

function samePlanPreviewSession(
  left: PlanPreviewSessionState | null,
  right: PlanPreviewSessionState | null,
) {
  if (!left || !right) return left === right;
  return (
    left.previewUrl === right.previewUrl &&
    left.route === right.route &&
    left.viewport === right.viewport &&
    left.interactionState === right.interactionState &&
    left.cleanupStatus === right.cleanupStatus
  );
}

function promptWithPlanModeContext(prompt: string) {
  const rules = [
    "Canvas operating prompt:",
    CANVAS_OPERATING_PROMPT,
    "Plan Mode: investigate and propose the plan first.",
    "Do not edit app implementation files or run implementation commands unless the user accepts the plan.",
    "When visual review is the plan itself, you may create review-only artifacts under .codex/mockups; these are preview records, not app implementation.",
    "For an existing running app, prefer temporary live preview variants when enough context exists. The desktop uses proposal metadata and Show changes highlights, not visible Codex-authored UI inside the app. Use .codex/mockups for blank projects, missing surfaces, or when a saved review artifact is clearer.",
    "If the user later accepts the plan, implementation can proceed in a separate turn.",
    "Return a clear product-facing plan. Keep source-level details only where they make the plan accurate.",
    "If the request creates hidden prompt/message state, parallel recovery paths, duplicated ownership, or estimate-vs-observed confusion, challenge the risky literal request and offer a safer plan in product language before implementation steps.",
    "If you create .codex/mockups artifacts in Plan Mode, summarize them as review previews and stop before app implementation. The user can mark, revise, or accept from the preview surface.",
    "When you create .codex/mockups review artifacts, include manifest highlights for important added or changed areas when useful. Highlights are review overlays only and must not become accepted app UI chrome.",
    "When visual review of an existing running app would make the plan clearer, include one fenced ```codex-plan-preview JSON block after the written plan. The desktop strips this block from chat and uses it only for Live preview comparison.",
    "The plan-preview JSON must have version 1, summary, and one to three variants with ids A/B/C, title, tradeoff, placement (topbar, sidePanel, or modal), summary, and components. Components need kind, label, body, and optional actionLabel.",
    "Use option titles that name user-facing workflow concepts from the written plan, not placement buckets. The written plan and visual variants must use the same option names and tradeoffs.",
    "Do not include a plan-preview block for backend-only or direct non-visual plans.",
  ];
  return `${rules.join("\n")}\n\nUser request:\n${prompt}`;
}

function promptWithComposerContexts(
  prompt: string,
  contexts: ComposerContextReference[],
) {
  if (contexts.length === 0) return prompt;
  const blocks = contexts
    .map((context) => {
      if (context.type === "appPreview") {
        return serializeAppPreviewContext(context);
      }
      if (context.type === "mockupPreview") {
        return serializeMockupPreviewContext(context);
      }
      return null;
    })
    .filter((block): block is string => Boolean(block));
  if (blocks.length === 0) return prompt;
  const hasAppPreview = contexts.some(
    (context) => context.type === "appPreview",
  );
  const hasMockupPreview = contexts.some(
    (context) => context.type === "mockupPreview",
  );
  const guidance = [
    "The user-visible request remains authoritative. Use the attached context only as supporting visual guidance.",
    "Use only the attached context unless the user asks you to inspect more.",
    hasAppPreview
      ? "For @AppMark context, treat the rectangle as visual intent in the live app preview. When target metadata such as canvasId, sourceFile, or component is present, use it as supporting evidence for the visual reference; still inspect the project before making source-level claims."
      : null,
    hasMockupPreview
      ? "For @MockupMark context, treat each named rectangle as user feedback on a saved mockup option. Proposal highlights are adjustable suggested areas, while user marks are explicit user-drawn areas. Use mark names, option labels, selected files, and rectangles to revise, combine, or build the desired direction; do not claim exact DOM nodes unless you inspect the saved mockup file."
      : null,
    "Do not assume this context is attached to future prompts unless the user attaches it again.",
  ].filter((line): line is string => Boolean(line));
  return `${prompt}\n\nProject context explicitly attached by the user:\n${blocks.join(
    "\n\n",
  )}\n\n${guidance.join("\n")}`;
}

function serializeAppPreviewContext(context: ComposerAppPreviewContext) {
  const mark = context.areaMark;
  const lines = [
    `@AppMark project="${quotePromptValue(context.projectName, 80)}"`,
    `mark=${quotePromptValue(context.markLabel || "Mark 1", 80)}`,
    `source=${context.source === "proposalHighlight" ? "proposal-highlight" : "user-mark"}`,
    `previewUrl=${quotePromptValue(context.previewUrl, 160)}`,
    `route=${quotePromptValue(mark.route ?? context.previewUrl, 180)}`,
    `viewport=${context.viewport}`,
    `areaRect=${Math.round(mark.x)},${Math.round(mark.y)},${Math.round(
      mark.width,
    )},${Math.round(mark.height)}`,
    `previewSize=${Math.round(mark.viewportWidth)}x${Math.round(
      mark.viewportHeight,
    )}`,
    `createdAt=${mark.createdAt}`,
  ];
  if (context.highlightId) {
    lines.push(`highlightId=${quotePromptValue(context.highlightId, 80)}`);
  }
  if (context.threadId) {
    lines.push(`threadId=${quotePromptValue(context.threadId, 120)}`);
  }
  if (context.proposalTurnId) {
    lines.push(
      `proposalTurnId=${quotePromptValue(context.proposalTurnId, 120)}`,
    );
  }
  if (context.proposalOptionId) {
    lines.push(`option=${quotePromptValue(context.proposalOptionId, 20)}`);
  }
  if (context.canvasLane) {
    lines.push(`lane=${quotePromptValue(context.canvasLane, 20)}`);
  }
  if (context.canvasId) {
    lines.push(`canvasId=${quotePromptValue(context.canvasId, 120)}`);
  }
  if (context.sourceFile) {
    lines.push(`sourceFile=${quotePromptValue(context.sourceFile, 180)}`);
  }
  if (context.componentName) {
    lines.push(`component=${quotePromptValue(context.componentName, 120)}`);
  }
  if (context.screenshotRef) {
    lines.push(`screenshotRef=${quotePromptValue(context.screenshotRef, 160)}`);
  }
  if (context.targetResolutionKind || context.targetResolutionConfidence) {
    lines.push(
      `targetResolution=${context.targetResolutionKind ?? "unknown"}/${
        context.targetResolutionConfidence ?? "unknown"
      }`,
    );
  }
  if (mark.note.trim()) {
    lines.push(`note="${quotePromptValue(mark.note.trim(), 180)}"`);
  }
  return lines.join("\n");
}

function serializeMockupPreviewContext(context: ComposerMockupPreviewContext) {
  const mark = context.areaMark;
  const lines = [
    `@MockupMark project="${quotePromptValue(context.projectName, 80)}"`,
    `mark=${quotePromptValue(context.markLabel, 80)}`,
    `source=${context.source === "proposalHighlight" ? "proposal-highlight" : "user-mark"}`,
    `proposalSetId=${quotePromptValue(context.proposalSetId, 120)}`,
    `artifactKind=${context.artifactKind}`,
    `option=${quotePromptValue(context.mockupLabel, 40)}`,
    `mockupId=${quotePromptValue(context.mockupId, 80)}`,
    `title="${quotePromptValue(context.mockupTitle, 120)}"`,
    `file=${quotePromptValue(context.filePath, 180)}`,
    `viewport=${context.viewport}`,
    `areaRect=${Math.round(mark.x)},${Math.round(mark.y)},${Math.round(
      mark.width,
    )},${Math.round(mark.height)}`,
    `previewSize=${Math.round(mark.viewportWidth)}x${Math.round(
      mark.viewportHeight,
    )}`,
    `createdAt=${mark.createdAt}`,
  ];
  if (context.highlightId) {
    lines.push(`highlightId=${quotePromptValue(context.highlightId, 80)}`);
  }
  if (mark.note.trim()) {
    lines.push(`note="${quotePromptValue(mark.note.trim(), 180)}"`);
  }
  return lines.join("\n");
}

function quotePromptValue(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, " ").trim();
  const clipped =
    compact.length > maxLength
      ? `${compact.slice(0, maxLength - 1)}...`
      : compact;
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

function composerContextsForProject(
  contexts: ComposerContextReference[],
  projectId: string,
) {
  return contexts.filter((context) => context.projectId === projectId);
}

function dedupeComposerContexts(contexts: ComposerContextReference[]) {
  const seen = new Set<string>();
  const deduped: ComposerContextReference[] = [];
  for (const context of contexts) {
    const key = composerContextIdentity(context);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(context);
  }
  return deduped;
}

function pruneSentComposerContextsByTurnId(
  contextsByTurnId: Record<string, ComposerContextReference[]>,
) {
  const entries = Object.entries(contextsByTurnId).filter(
    ([, contexts]) => contexts.length > 0,
  );
  return Object.fromEntries(entries.slice(-80));
}

function nextMockupMarkNumber(
  contexts: ComposerContextReference[],
  projectId: string,
  proposalSetId: string,
  mockupId: string,
) {
  return (
    contexts.reduce((max, context) => {
      if (
        context.type !== "mockupPreview" ||
        context.projectId !== projectId ||
        context.proposalSetId !== proposalSetId ||
        context.mockupId !== mockupId ||
        context.source === "proposalHighlight"
      ) {
        return max;
      }
      return Math.max(max, context.markNumber || 0);
    }, 0) + 1
  );
}

function nextMockupChangeNumber(
  contexts: ComposerContextReference[],
  projectId: string,
  proposalSetId: string,
  mockupId: string,
) {
  return (
    contexts.reduce((max, context) => {
      if (
        context.type !== "mockupPreview" ||
        context.projectId !== projectId ||
        context.proposalSetId !== proposalSetId ||
        context.mockupId !== mockupId ||
        context.source !== "proposalHighlight"
      ) {
        return max;
      }
      return Math.max(max, context.markNumber || 0);
    }, 0) + 1
  );
}

function composerContextIdentity(context: ComposerContextReference) {
  if (context.type === "appPreview") {
    return `${context.projectId}:app-preview:${context.id}`;
  }
  return `${context.projectId}:mockup-preview:${context.id}`;
}

function composerContextSearchLabel(context: ComposerContextReference) {
  if (context.type === "appPreview") {
    return `${context.projectName} App Preview ${
      context.markLabel || "Mark 1"
    } ${context.previewUrl}`;
  }
  return `${context.projectName} ${context.markLabel} ${previewArtifactDisplayName(
    context.artifactKind,
    1,
    "title",
  )} ${context.mockupLabel} ${context.mockupTitle} ${context.filePath}`;
}

function sameComposerContextList(
  left: ComposerContextReference[],
  right: ComposerContextReference[],
) {
  if (left.length !== right.length) return false;
  return left.every((context, index) => {
    const other = right[index];
    return other
      ? other.type === context.type &&
          composerContextIdentity(other) === composerContextIdentity(context)
      : false;
  });
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
      return (
        right.type === "approval" && left.approval.id === right.approval.id
      );
    case "appPreview":
      return right.type === "appPreview" && left.projectId === right.projectId;
    case "mockupPreview":
      return (
        right.type === "mockupPreview" &&
        left.projectId === right.projectId &&
        left.proposalSetId === right.proposalSetId
      );
    case "codeProposalPreview":
      return (
        right.type === "codeProposalPreview" &&
        left.projectId === right.projectId &&
        left.proposalSetId === right.proposalSetId
      );
    case "draftPreview":
      return (
        right.type === "draftPreview" &&
        left.projectId === right.projectId &&
        left.draftId === right.draftId
      );
    case "planPreview":
      return (
        right.type === "planPreview" &&
        left.projectId === right.projectId &&
        left.proposalTurnId === right.proposalTurnId
      );
    case "empty":
      return true;
  }
}

function preferredPreviewInspectorWidth() {
  if (typeof window === "undefined") return 760;
  const sidebarWidth = sidebarWidthForShell(window.innerWidth);
  return clamp(
    window.innerWidth - sidebarWidth - CHAT_COMFORT_WIDTH,
    720,
    maxInspectorWidthForShell(window.innerWidth, true),
  );
}

function maxInspectorWidthForShell(shellWidth: number, previewFocused = false) {
  const reservedChatWidth = previewFocused
    ? PREVIEW_CHAT_MIN_WIDTH
    : CHAT_COMFORT_WIDTH;
  return Math.max(INSPECTOR_MIN_WIDTH, shellWidth - reservedChatWidth);
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
      title:
        snapshot.modelsError ?? snapshot.configError ?? "Model unavailable",
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
  backendMode: BackendMode,
) {
  const thread = threads[threadId];
  return Boolean(
    thread && cwd && sameRuntimePath(thread.cwd, cwd, backendMode),
  );
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
