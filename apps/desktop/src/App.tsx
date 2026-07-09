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
import { Composer } from "./components/Composer";
import {
  composerContextIdentity,
  composerContextSearchLabel,
  composerContextsForProject,
  dedupeComposerContexts,
  promptWithComposerContexts,
  pruneSentComposerContextsByTurnId,
  quotePromptValue,
  sameComposerContextList,
  visibleDraftForProject,
} from "./composerContexts";
import { Inspector } from "./components/Inspector";
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
  CHAT_COMFORT_WIDTH,
  CHAT_PHONE_LAYOUT_WIDTH,
  INSPECTOR_AUTO_COLLAPSE_QUERY,
  INSPECTOR_AUTO_COLLAPSE_WIDTH,
  INSPECTOR_MIN_WIDTH,
  PREVIEW_CHAT_MIN_WIDTH,
  SIDEBAR_DRAWER_WIDTH,
  clamp,
  maxInspectorWidthForShell,
  preferredPreviewInspectorWidth,
  sidebarWidthForShell,
} from "./appLayout";
import {
  errorMessage,
  isDraftWorkspaceNotRegisteredError,
  isKnownThreadForCwd,
  isStaleThreadError,
  isThreadNotMaterialized,
  isUnsupportedAttachmentError,
  sendFailureMessage,
  wait,
  withRequestTimeout,
} from "./appErrors";
import {
  sendBlockReason,
  shouldPreserveLocalThreadDuringRefresh,
  turnWithOptimisticUserMessage,
} from "./appSendGuards";
import {
  firstMarkdownChangeSelection,
  sameInspectorSelection,
} from "./appInspector";
import {
  removeComposerContextByIdentity,
  upsertAppPreviewMarkContext,
} from "./composerMarkWorkflow";
import {
  CANVAS_OPERATING_PROMPT,
  canvasActionSummary,
  resolveCanvasAction,
  type CanvasActionResolution,
  type CanvasQuestion,
  type CanvasSurface,
} from "./canvasActions";
import {
  buildStrategyForProposalBacking,
  proposalBackingForPreviewArtifactKind,
  type ProposalBacking,
} from "./canvasProposalModel";
import {
  deriveCanvasWorkflowLedger,
} from "./canvasWorkflowLedger";
import {
  evaluateLiveDomPatchStaleness,
  staleProposalBuildMessage,
} from "./canvasProposalStaleness";
import { useAppServerConnection } from "./hooks/useAppServerConnection";
import { useAppServerEvents } from "./hooks/useAppServerEvents";
import { useDocumentPreview } from "./hooks/useDocumentPreview";
import {
  FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT,
  featureDraftValidationMessage,
  isBlockingFeatureDraftValidationResult,
  validateFeatureDraftChangedPaths,
  validateFeatureDraftCompletion,
  validateFeatureDraftFirstEdit,
  validateFeatureDraftPlacementPreflight,
  validateFeatureDraftPreValidationCommand,
} from "./featureDraftValidation";
import {
  codeProposalChangeSummary,
  createFeatureDraftId,
  featureDraftFromRegisteredWorkspace,
  featureDraftIsActiveForRouting,
  featureDraftName,
  featureDraftNeedsAttention,
  isFeatureDraftBuildRequest,
  isFeatureDraftContinueRequest,
  isFeatureDraftDiscardRequest,
  isFeatureDraftParkRequest,
  isFeatureDraftResumeRequest,
  markFeatureDraftBuilt,
  mergeHydratedFeatureDraft,
  parkFeatureDraftInState,
  removeRecordKey,
  resumeFeatureDraftInState,
  shouldCreateFeatureDraftFromCanvasPrompt,
  shouldRouteToFeatureDraftPrompt,
  shouldRouteToFeatureDraftRecoveryPrompt,
  type DraftWorkspaceApplyResult,
  type DraftWorkspaceDiffResult,
  type PreparedDraftWorkspace,
  type RegisteredDraftWorkspace,
} from "./featureDraftWorkflow";
import {
  FEATURE_DRAFT_WORKSPACE_SENTINEL,
  featureDraftRevisionPrompt,
  featureDraftWorkspacePrompt,
} from "./featureDraftPrompts";
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
import { resolveModelDisplay } from "./modelDisplay";
import { preferredLivePreviewSelection } from "./previewSelection";
import {
  planPreviewDecisionSummary,
  selectedPlanPreviewVariant,
  selectedPlanPreviewVariantHasVisualPatchBundle,
} from "./planPreview";
import {
  createProposalSetId,
  previewArtifactActionName,
  previewArtifactDisplayName,
  previewArtifactFilePrefix,
} from "./mockupArtifacts";
import {
  type VisualDecisionOption,
} from "./visualDecision";
import {
  finalAgentText,
  latestVisualDecision,
  loadDismissedVisualDecisionIds,
  saveDismissedVisualDecisionIds,
  selectedMockupIdForLoadedSet,
  turnTouchesSavedMockups,
  visualDecisionComposerText,
  visualDecisionFeatureDraftRequest,
  visualDecisionOptionCreatesCodeProposal,
  visualDecisionOptionCreatesFeatureDraft,
  visualDecisionOptionCreatesLiveOverlay,
  visualDecisionOptionCreatesMockups,
  type ActiveVisualDecision,
  type VisualDecisionComposerAction,
} from "./visualDecisionWorkflow";
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
  CanvasVisualReferenceMeta,
  CodeProposalFileChange,
  ComposerAttachment,
  ComposerAppPreviewContext,
  ComposerContextReference,
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
  featureDraftOnComplete?: boolean;
  featureDraftId?: string | null;
  mockupHistoryOnComplete?: boolean;
  proposalSetId?: string | null;
  artifactKind?: PreviewArtifactKind | null;
  deferredFeatureDraft?: DeferredFeatureDraftPreparation | null;
};

type DeferredFeatureDraftPreparation = {
  draftId: string;
  originalPrompt: string;
  status: ProjectEmptyStatus | null;
  planModeWasOn: boolean;
  liveContext: string;
};

type PendingComposerSend = {
  projectId: string;
  prompt: string;
  attachments: ComposerAttachment[];
  contexts: ComposerContextReference[];
  createdAt: number;
};

type ProjectThreadGroup = {
  project: Project;
  threads: Thread[];
  draft: LocalChatDraft | null;
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

export {
  isFeatureDraftBuildRequest,
  isFeatureDraftContinueRequest,
  isFeatureDraftDiscardRequest,
  isFeatureDraftParkRequest,
  isFeatureDraftResumeRequest,
  shouldCreateFeatureDraftFromCanvasPrompt,
  shouldRouteToFeatureDraftPrompt,
  shouldRouteToFeatureDraftRecoveryPrompt,
} from "./featureDraftWorkflow";
export {
  EXPERIENTIAL_DRAFT_PROMPT_CONTRACT,
  FEATURE_DRAFT_FINAL_RESPONSE_CONTRACT,
  FEATURE_DRAFT_OPERATING_PROMPT,
  FEATURE_IN_PLACE_DRAFT_PROMPT_CONTRACT,
  featureDraftRevisionPrompt,
  featureDraftWorkspacePrompt,
} from "./featureDraftPrompts";
export {
  visualDecisionOptionCreatesCodeProposal,
  visualDecisionOptionCreatesFeatureDraft,
  visualDecisionOptionCreatesLiveOverlay,
  visualDecisionOptionCreatesMockups,
} from "./visualDecisionWorkflow";

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
  const [pendingComposerSend, setPendingComposerSend] =
    useState<PendingComposerSend | null>(null);
  const [visualDecisionComposerAction, setVisualDecisionComposerAction] =
    useState<VisualDecisionComposerAction | null>(null);
  const [savedMockupReviewSets, setSavedMockupReviewSets] = useState<
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
  const [livePreviewAutoStartNonces, setLivePreviewAutoStartNonces] = useState<
    Record<string, number>
  >({});
  const [draftPreviewRefreshNonces, setDraftPreviewRefreshNonces] = useState<
    Record<string, number>
  >({});
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
  const draftValidationBlockedTurnsRef = useRef<Set<string>>(new Set());
  const draftPlacementPreflightPassedTurnsRef = useRef<Set<string>>(new Set());
  const draftFirstDiffPassedTurnsRef = useRef<Set<string>>(new Set());
  const draftPlacementPreflightTextByTurnRef = useRef<
    Map<string, Map<string, string>>
  >(new Map());
  const hydratingFeatureDraftProjectIdsRef = useRef<Set<string>>(new Set());
  const interruptTurnRef = useRef<
    (threadId: string, turnId: string) => Promise<unknown>
  >(async () => null);
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
  const activeFeatureDraftThreadId =
    desktop.activeThreadId ?? activeProject?.lastActiveThreadId ?? null;
  const fallbackProjectFeatureDraftId =
    activeProject && activeFeatureDraftThreadId == null
      ? Object.values(desktop.featureDrafts)
          .filter(
            (draft) =>
              draft.projectId === activeProject.id &&
              draft.lifecycle === "active",
          )
          .sort((left, right) => right.updatedAt - left.updatedAt)[0]?.draftId ??
        null
      : null;
  const activeThreadFeatureDraftCandidateId =
    activeFeatureDraftThreadId != null
      ? desktop.featureDraftActiveIdsByThreadId[activeFeatureDraftThreadId] ??
        null
      : fallbackProjectFeatureDraftId;
  const activeThreadFeatureDraftCandidate =
    activeThreadFeatureDraftCandidateId && activeProject
      ? (desktop.featureDrafts[activeThreadFeatureDraftCandidateId] ?? null)
      : null;
  const activeThreadFeatureDraftId =
    activeThreadFeatureDraftCandidate && activeProject
      ? activeThreadFeatureDraftCandidate.projectId === activeProject.id &&
        activeThreadFeatureDraftCandidate.lifecycle === "active"
        ? activeThreadFeatureDraftCandidateId
        : fallbackProjectFeatureDraftId
      : fallbackProjectFeatureDraftId;

  useEffect(() => {
    if (!activeProject) return;
    void refreshProjectEmptyStatus(activeProject);
    // These helpers intentionally run only when the selected project identity
    // changes. Their internal state writes should not retrigger discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, activeProject?.path]);

  const activePreviewProjectId =
    inspector.type === "appPreview" ||
    inspector.type === "draftPreview"
      ? inspector.projectId
      : null;
  const previewFocused =
    desktop.layout.inspectorOpen &&
    (inspector.type === "appPreview" ||
      inspector.type === "draftPreview");
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
  const activeProjectHasSavedMockups = false;
  const activeVisualDecision = useMemo(
    () =>
      latestVisualDecision(activeThread, dismissedVisualDecisionIds, {
        hasActiveCanvasProposal: Boolean(
          activeThreadFeatureDraftId ||
            (activeThreadProposalSetId && !activeThreadProposalSetIsHistory),
        ),
        hasSavedMockups: activeProjectHasSavedMockups,
        ignoredSentinels: [
          SAVED_MOCKUP_REVIEW_SENTINEL,
          FEATURE_DRAFT_WORKSPACE_SENTINEL,
        ],
        projectEmptyStatus: activeProjectEmptyStatus,
      }),
    [
      activeProjectEmptyStatus,
      activeProjectHasSavedMockups,
      activeThreadFeatureDraftId,
      activeThreadProposalSetId,
      activeThreadProposalSetIsHistory,
      activeThread,
      dismissedVisualDecisionIds,
    ],
  );

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

  const blockFeatureDraftTurn = useCallback(
    (threadId: string, turnId: string, message: string) => {
      if (draftValidationBlockedTurnsRef.current.has(turnId)) return;
      const draft = inFlightDraftsRef.current.get(turnId);
      if (!draft?.featureDraftOnComplete || !draft.featureDraftId) return;
      draftValidationBlockedTurnsRef.current.add(turnId);
      draftPlacementPreflightPassedTurnsRef.current.delete(turnId);
      draftFirstDiffPassedTurnsRef.current.delete(turnId);
      draftPlacementPreflightTextByTurnRef.current.delete(turnId);
      setSendError(message);
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
              error: message,
              updatedAt: Date.now(),
            },
          },
        };
      });
      void interruptTurnRef.current(threadId, turnId).catch((error) => {
        console.warn("Could not interrupt invalid draft turn", error);
      });
    },
    [],
  );

  const handleDraftCommandStarted = useCallback(
    (event: { threadId: string; turnId: string; command: string }) => {
      const draft = inFlightDraftsRef.current.get(event.turnId);
      if (!draft?.featureDraftOnComplete || !draft.featureDraftId) return;
      if (draftValidationBlockedTurnsRef.current.has(event.turnId)) return;
      const validation = validateFeatureDraftPreValidationCommand({
        command: event.command,
        firstDiffValidated: draftFirstDiffPassedTurnsRef.current.has(
          event.turnId,
        ),
      });
      if (validation.ok) return;
      if (!isBlockingFeatureDraftValidationResult(validation)) {
        console.warn("Continuing Draft despite soft validation warning", {
          code: validation.code,
          message: featureDraftValidationMessage(validation),
        });
        return;
      }
      blockFeatureDraftTurn(
        event.threadId,
        event.turnId,
        featureDraftValidationMessage(validation),
      );
    },
    [blockFeatureDraftTurn],
  );

  const handleDraftAgentMessageUpdated = useCallback(
    (event: {
      threadId: string;
      turnId: string;
      itemId: string;
      text: string;
    }) => {
      const draft = inFlightDraftsRef.current.get(event.turnId);
      if (!draft?.featureDraftOnComplete || !draft.featureDraftId) return;
      if (draftValidationBlockedTurnsRef.current.has(event.turnId)) return;
      if (draftPlacementPreflightPassedTurnsRef.current.has(event.turnId)) {
        return;
      }
      let preflightTextByItem =
        draftPlacementPreflightTextByTurnRef.current.get(event.turnId);
      if (!preflightTextByItem) {
        preflightTextByItem = new Map();
        draftPlacementPreflightTextByTurnRef.current.set(
          event.turnId,
          preflightTextByItem,
        );
      }
      preflightTextByItem.set(event.itemId, event.text);
      const combinedText = [...preflightTextByItem.values()].join("\n\n");
      const validation =
        validateFeatureDraftPlacementPreflight(event.text).ok
          ? { ok: true as const }
          : validateFeatureDraftPlacementPreflight(combinedText);
      if (validation.ok) {
        draftPlacementPreflightPassedTurnsRef.current.add(event.turnId);
      }
    },
    [],
  );

  const handleDraftFileChangePatchUpdated = useCallback(
    (event: {
      threadId: string;
      turnId: string;
      changes: Extract<ThreadItem, { type: "fileChange" }>["changes"];
    }) => {
      const draft = inFlightDraftsRef.current.get(event.turnId);
      if (!draft?.featureDraftOnComplete || !draft.featureDraftId) return;
      if (draftValidationBlockedTurnsRef.current.has(event.turnId)) return;
      const preflightTextByItem =
        draftPlacementPreflightTextByTurnRef.current.get(event.turnId);
      const preflightText = preflightTextByItem
        ? [...preflightTextByItem.values()].join("\n\n")
        : "";
      const preflightValidated =
        draftPlacementPreflightPassedTurnsRef.current.has(event.turnId) ||
        (preflightText
          ? validateFeatureDraftPlacementPreflight(preflightText).ok
          : false);
      if (preflightValidated) {
        draftPlacementPreflightPassedTurnsRef.current.add(event.turnId);
      }
      const validation = validateFeatureDraftFirstEdit({
        changes: event.changes,
        placementPreflightValidated: preflightValidated,
      });
      if (validation.ok) {
        if (event.changes.length > 0) {
          draftFirstDiffPassedTurnsRef.current.add(event.turnId);
        }
        return;
      }
      if (!isBlockingFeatureDraftValidationResult(validation)) {
        if (event.changes.length > 0) {
          draftFirstDiffPassedTurnsRef.current.add(event.turnId);
        }
        console.warn("Continuing Draft despite soft validation warning", {
          code: validation.code,
          message: featureDraftValidationMessage(validation),
        });
        return;
      }
      blockFeatureDraftTurn(
        event.threadId,
        event.turnId,
        featureDraftValidationMessage(validation),
      );
    },
    [blockFeatureDraftTurn],
  );

  const { handleNotification, handleServerRequest } = useAppServerEvents({
    activeProjectPath: activeProject?.path ?? null,
    patchThread,
    refreshThreads: (cwd) => refreshThreadsRef.current(cwd),
    syncThread: (threadId) => syncThreadRef.current(threadId),
    onAgentMessageUpdated: handleDraftAgentMessageUpdated,
    onCommandExecutionStarted: handleDraftCommandStarted,
    onFileChangePatchUpdated: handleDraftFileChangePatchUpdated,
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
    interruptTurnRef.current = (threadId, turnId) =>
      client.request("turn/interrupt", { threadId, turnId });
  }, [client]);

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
                !shouldPreserveLocalThreadDuringRefresh(
                  thread,
                  desktopRef.current.featureDrafts,
                )
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
    if (!activeProject || !runtimeReady) return;
    const hydrationKey = `${activeProject.id}:${activeProject.path}`;
    if (hydratingFeatureDraftProjectIdsRef.current.has(hydrationKey)) return;
    hydratingFeatureDraftProjectIdsRef.current.add(hydrationKey);

    void (async () => {
      try {
        const records =
          (await desktopInvoke<RegisteredDraftWorkspace[]>(
            "draft_workspace_list",
            {
              projectPath: activeProject.path,
            },
          )) ?? [];
        const restorableRecords = records.filter(
          (record) =>
            record.projectPath &&
            record.workspacePath &&
            (record.status === "active" || record.status === "parked"),
        );
        const drafts = await Promise.all(
          restorableRecords.map(async (record) => {
            const diffRequest = desktopInvoke<DraftWorkspaceDiffResult>(
              "draft_workspace_diff",
              {
                projectPath: activeProject.path,
                draftId: record.draftId,
              },
            );
            const diff = diffRequest ? await diffRequest.catch(() => null) : null;
            if (record.threadId && client.connected) {
              void syncThread(record.threadId, false).catch((error) => {
                console.warn("Could not hydrate draft chat thread", error);
              });
            }
            return featureDraftFromRegisteredWorkspace(
              activeProject.id,
              record,
              diff,
            );
          }),
        );
        if (drafts.length === 0) return;
        setDesktop((current) => {
          const projectStillExists = current.projects.some(
            (project) =>
              project.id === activeProject.id &&
              sameRuntimePath(
                project.path,
                activeProject.path,
                runtime.backendMode,
              ),
          );
          if (!projectStillExists) return current;
          const featureDrafts = { ...current.featureDrafts };
          const activeIdsByThread = {
            ...current.featureDraftActiveIdsByThreadId,
          };
          let changed = false;
          for (const draft of drafts) {
            const existing = featureDrafts[draft.draftId];
            const merged = existing
              ? mergeHydratedFeatureDraft(existing, draft)
              : draft;
            if (
              !existing ||
              JSON.stringify(existing) !== JSON.stringify(merged)
            ) {
              featureDrafts[draft.draftId] = merged;
              changed = true;
            }
            if (
              merged.threadId &&
              merged.lifecycle === "active"
            ) {
              if (activeIdsByThread[merged.threadId] !== merged.draftId) {
                activeIdsByThread[merged.threadId] = merged.draftId;
                changed = true;
              }
            }
          }
          if (!changed) return current;
          return {
            ...current,
            featureDrafts,
            featureDraftActiveIdsByThreadId: activeIdsByThread,
          };
        });
      } catch (error) {
        console.warn("Could not hydrate saved feature drafts", error);
      } finally {
        hydratingFeatureDraftProjectIdsRef.current.delete(hydrationKey);
      }
    })();
  }, [
    activeProject?.id,
    activeProject?.path,
    client.connected,
    runtime.backendMode,
    runtimeReady,
    syncThread,
  ]);

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
    setInspector((current) => {
      if (current.type !== "draftPreview") {
        return current;
      }
      const nextSelection = preferredLivePreviewSelection({
        projects: desktop.projects,
        featureDrafts: desktop.featureDrafts,
        featureDraftActiveIdsByThreadId:
          desktop.featureDraftActiveIdsByThreadId,
        projectId,
        threadId: desktop.activeThreadId,
      });
      return nextSelection;
    });
  }, [desktop.activeProjectId, desktop.activeThreadId]);

  useEffect(() => {
    activeDraftProjectIdRef.current = activeDraftProjectId;
  }, [activeDraftProjectId]);

  useEffect(() => {
    setInspector((current) => {
      if (
        current.type !== "appPreview" &&
        current.type !== "draftPreview"
      ) {
        return current;
      }
      if (!desktop.activeProjectId) return { type: "empty" };
      if (current.projectId === desktop.activeProjectId) return current;
      if (current.type === "draftPreview") {
        return { type: "empty" };
      }
      return { type: "appPreview", projectId: desktop.activeProjectId };
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
      if (
        current.type === "appPreview" ||
        current.type === "draftPreview"
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
    const turnHadDraftFileChanges = draftFirstDiffPassedTurnsRef.current.has(
      turn.id,
    );
    inFlightDraftsRef.current.delete(turn.id);
    const validationBlocked = draftValidationBlockedTurnsRef.current.delete(
      turn.id,
    );
    draftPlacementPreflightPassedTurnsRef.current.delete(turn.id);
    draftFirstDiffPassedTurnsRef.current.delete(turn.id);
    draftPlacementPreflightTextByTurnRef.current.delete(turn.id);
    if (validationBlocked) return;
    const project = desktopRef.current.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    const targetFeatureDraftId = draft.featureDraftId?.trim() || "";
    if (
      (turn.status === "failed" || turn.status === "interrupted") &&
      draft.featureDraftOnComplete &&
      targetFeatureDraftId &&
      project &&
      turnHadDraftFileChanges
    ) {
      setSendError(null);
      setRetryDraft((current) => (current === draft ? null : current));
      void finalizeFeatureDraftTurn(
        project.id,
        targetFeatureDraftId,
        threadId,
        turn.id,
        draft.visiblePrompt?.trim() || draft.prompt,
        finalAgentText(turn),
        { allowIncompleteFinalResponse: true },
      );
      return;
    }
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
    if (project) {
      void refreshProjectEmptyStatus(project);
    }
    const targetProposalSetId = draft.proposalSetId?.trim() || "";
    if (draft.featureDraftOnComplete && targetFeatureDraftId && project) {
      void finalizeFeatureDraftTurn(
        project.id,
        targetFeatureDraftId,
        threadId,
        turn.id,
        draft.visiblePrompt?.trim() || draft.prompt,
        finalAgentText(turn),
      );
      return;
    }
    if (draft.settings.planMode || draft.liveOverlayProposalOnComplete) {
      const finalText = finalAgentText(turn);
      const previewSpec = null;
      const visiblePrompt = draft.visiblePrompt?.trim() || draft.prompt;
      setDesktop((current) => {
        const proposal = current.planProposals[turn.id];
        if (!proposal) return current;
        const liveProposalBacking = proposal.proposalBacking;
        return {
          ...current,
          planProposals: {
            ...current.planProposals,
            [turn.id]: {
              ...proposal,
              prompt: visiblePrompt,
              previewSpec,
              previewSelectedVariantId: null,
              proposalKind: draft.liveOverlayProposalOnComplete
                ? "live_proposal"
                : classifyPlanProposalKind(
                    visiblePrompt,
                    finalText,
                  ),
              proposalBacking: draft.liveOverlayProposalOnComplete
                ? liveProposalBacking
                : proposal.proposalBacking,
              buildStrategy: proposal.buildStrategy,
              updatedAt: Date.now(),
            },
          },
        };
      });
      if (draft.liveOverlayProposalOnComplete && previewSpec && project) {
        setInspector({
          type: "appPreview",
          projectId: project.id,
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
    threadId: string | null = activeThread?.id ?? null,
  ) {
    const prepared = await desktopInvoke<PreparedDraftWorkspace>(
      "draft_workspace_prepare",
      {
        projectPath: project.path,
        draftId,
        threadId,
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
      threadId: threadId ?? prepared.threadId ?? null,
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
    finalText = "",
    options: { allowIncompleteFinalResponse?: boolean } = {},
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
      const validation =
        options.allowIncompleteFinalResponse && changedFiles.length > 0
          ? validateFeatureDraftChangedPaths(changedFiles)
          : validateFeatureDraftCompletion({
              changedFiles,
              finalText,
            });
      if (!validation.ok) {
        const message = featureDraftValidationMessage(validation);
        void desktopInvoke("draft_workspace_update_brief", {
          projectPath: project?.path,
          draftId,
          goal: latestPrompt?.trim() || stored.originalPrompt,
          currentSummary: `Draft blocked by feature-in-place validation: ${message}`,
          affectedRoutes: stored.affectedRoutes,
          mockAssumptions: stored.mockAssumptions,
          buildPlan: [
            "Revise the Draft so the feature appears in the existing app flow.",
            "Name the fake adapters/state and the real integration Build this should replace.",
          ],
        })?.catch(() => null);
        setSendError(message);
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
                status: "failed",
                error: message,
                previewOwnerId:
                  diff.previewOwnerId || currentDraft.previewOwnerId,
                originalPrompt:
                  latestPrompt?.trim() || currentDraft.originalPrompt,
                summary,
                changedFiles,
                updatedAt: Date.now(),
              },
            },
          };
        });
        return;
      }
      void desktopInvoke("draft_workspace_update_brief", {
        projectPath: project?.path,
        draftId,
        goal: latestPrompt?.trim() || stored.originalPrompt,
        currentSummary: options.allowIncompleteFinalResponse
          ? `${summary}; final verification was interrupted, but Draft source changes were preserved.`
          : summary,
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
      return false;
    }
    if (draft.lifecycle !== "active") {
      setSendError("Resume the draft before building it.");
      return false;
    }
    if (draft.status !== "ready" || draft.changedFiles.length === 0) {
      setSendError("Wait for the draft to finish before building it.");
      return false;
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
    try {
      await desktopInvoke("app_preview_stop", {
        cancelPendingStart: true,
        projectPath: draft.workspacePath,
      })?.catch(() => null);
      const result = await desktopInvoke<DraftWorkspaceApplyResult>(
        "draft_workspace_apply",
        {
          projectPath: project.path,
          draftId: draft.draftId,
        },
      );
      if (!result?.ok) {
        throw new Error(
          result?.conflicts?.length
            ? "Live changed since this draft started. Refresh or create a new draft before building."
            : "The draft could not be built.",
        );
      }
      setDesktop((current) => {
        const stored = current.featureDrafts[draft.draftId];
        if (!stored) return current;
        return markFeatureDraftBuilt(
          {
            ...current,
            featureDrafts: {
              ...current.featureDrafts,
              [draft.draftId]: {
                ...stored,
                changedFiles: result.changedFiles,
                summary: codeProposalChangeSummary(result.changedFiles),
                error: undefined,
                updatedAt: Date.now(),
              },
            },
          },
          draft.draftId,
        );
      });
      void desktopInvoke("draft_workspace_update_brief", {
        projectPath: project.path,
        draftId: draft.draftId,
        goal: draft.originalPrompt,
        currentSummary: "Built into Live.",
        affectedRoutes: draft.affectedRoutes,
        mockAssumptions: draft.mockAssumptions,
        approvedDecisions: ["Built into Live after explicit Build this."],
        buildPlan: ["Built into Live."],
      })?.catch(() => null);
      openPreviewInspector(project.id);
      setLivePreviewAutoStartNonces((current) => ({
        ...current,
        [project.id]: (current[project.id] ?? 0) + 1,
      }));
      return true;
    } catch (error) {
      const message = `Could not build draft: ${errorMessage(error)}`;
      setSendError(message);
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
              error: message,
              updatedAt: Date.now(),
            },
          },
        };
      });
      return false;
    }
  }

  function inFlightTurnIdForFeatureDraft(draftId: string) {
    for (const [turnId, draft] of inFlightDraftsRef.current.entries()) {
      if (draft.featureDraftOnComplete && draft.featureDraftId === draftId) {
        return turnId;
      }
    }
    return null;
  }

  function refreshFeatureDraftPreview(draft: FeatureDraft) {
    setSendError(null);
    setDraftPreviewRefreshNonces((current) => ({
      ...current,
      [draft.draftId]: (current[draft.draftId] ?? 0) + 1,
    }));
    openFeatureDraftInspector(draft.projectId, draft.draftId);
  }

  async function continueFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (!project) {
      setSendError("That draft belongs to a project that is no longer available.");
      return false;
    }
    const threadId = draft.threadId ?? desktop.activeThreadId;
    if (!threadId) {
      setSendError("Open the draft's chat before continuing it.");
      return false;
    }
    const inFlightTurnId = inFlightTurnIdForFeatureDraft(draft.draftId);
    if (inFlightTurnId) {
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
              status: "generating",
              turnId: inFlightTurnId,
              updatedAt: Date.now(),
            },
          },
        };
      });
      openFeatureDraftInspector(project.id, draft.draftId);
      return true;
    }
    const repairPrompt =
      "Continue this Draft and repair it until it is ready for review. Keep Live source unchanged.";
    const liveContext = liveAppReviewContext(project, activeComposerContexts);
    return sendDraft(
      {
        prompt: featureDraftRevisionPrompt(draft, repairPrompt, liveContext),
        visiblePrompt: "Continue Draft",
        projectId: project.id,
        settings: { ...project.settings, planMode: false },
        attachments: [],
        contexts: [],
        createdAt: Date.now(),
        localDraftProjectId: null,
        targetThreadId: threadId,
        cwdOverride: draft.workspacePath,
        featureDraftOnComplete: true,
        featureDraftId: draft.draftId,
      },
      { clearComposer: false },
    );
  }

  async function parkFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (!project) {
      setSendError("That draft belongs to a project that is no longer available.");
      return false;
    }
    setSendError(null);
    try {
      void desktopInvoke("app_preview_stop", {
        cancelPendingStart: true,
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
      return false;
    }
    setDesktop((current) => parkFeatureDraftInState(current, draft.draftId));
    if (inspector.type === "draftPreview" && inspector.draftId === draft.draftId) {
      openPreviewInspector(project.id);
    }
    return true;
  }

  async function resumeFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    if (!project) {
      setSendError("That draft belongs to a project that is no longer available.");
      return false;
    }
    const threadId = draft.threadId ?? desktop.activeThreadId;
    if (!threadId) {
      setSendError("Open the draft's chat before resuming it.");
      return false;
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
      return false;
    }
    setDesktop((current) =>
      resumeFeatureDraftInState(current, draft.draftId, threadId),
    );
    openFeatureDraftInspector(project.id, draft.draftId);
    return true;
  }

  async function discardFeatureDraft(draft: FeatureDraft) {
    const project = desktop.projects.find(
      (candidate) => candidate.id === draft.projectId,
    );
    setSendError(null);
    try {
      void desktopInvoke("app_preview_stop", {
        cancelPendingStart: true,
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
      if (!isDraftWorkspaceNotRegisteredError(error)) {
        setSendError(`Could not discard draft: ${errorMessage(error)}`);
        return false;
      }
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
    return true;
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
        setSavedMockupReviewSets((current) => {
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
      setSavedMockupReviewSets((current) => ({
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
    setSavedMockupReviewSets((current) => {
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
    const nextSelection = preferredLivePreviewSelection({
      projects: desktop.projects,
      featureDrafts: desktop.featureDrafts,
      featureDraftActiveIdsByThreadId:
        desktop.featureDraftActiveIdsByThreadId,
      projectId: project.id,
      threadId: desktop.activeThreadId,
    });
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
    const project = desktop.projects.find(
      (candidate) => candidate.id === proposal.projectId,
    );
    if (project) selectAppPreview(project);
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
    setActionError(null);
    setSendError(null);
    setRetryDraft(null);
    setInspector({ type: "appPreview", projectId: project.id });
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
      route?: string;
      viewport: "desktop" | "mobile";
      thumbnailDataUrl?: string;
      label?: string;
      surface?: ComposerAppPreviewContext["surface"];
      draftId?: string;
      threadId?: string | null;
    } & CanvasVisualReferenceMeta,
  ) {
    setComposerContexts((current) =>
      upsertAppPreviewMarkContext({
        contexts: current,
        project,
        areaMark,
        meta,
        activeThreadId: desktop.activeThreadId,
      }),
    );
    if (!desktop.activeThreadId) {
      setActiveDraftProjectId(project.id);
    }
    setSendError(null);
  }

  function removeComposerContext(context: ComposerContextReference) {
    setComposerContexts((current) =>
      removeComposerContextByIdentity(current, context),
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
        : current.type === "draftPreview"
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
      current.type === "appPreview" &&
      projectForThread
        ? preferredLivePreviewSelection({
            projects: desktop.projects,
            featureDrafts: desktop.featureDrafts,
            featureDraftActiveIdsByThreadId:
              desktop.featureDraftActiveIdsByThreadId,
            projectId: projectForThread.id,
            threadId,
          })
        : current.type === "appPreview"
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

  function clearComposerAfterLocalAction() {
    clearSentComposerPayload([]);
    setVisualDecisionComposerAction(null);
    setPendingComposerSend(null);
  }

  function clearSentComposerPayload(sentContexts: ComposerContextReference[]) {
    const sentContextIds = new Set(sentContexts.map(composerContextIdentity));
    setComposerText("");
    setAttachments([]);
    setComposerContexts((current) =>
      sentContextIds.size > 0
        ? current.filter(
            (context) => !sentContextIds.has(composerContextIdentity(context)),
          )
        : [],
    );
    setVisualDecisionComposerAction(null);
  }

  function showPendingComposerSend(
    project: Project,
    prompt: string,
    pendingAttachments = attachments,
    pendingContexts = activeComposerContexts,
  ) {
    setPendingComposerSend({
      projectId: project.id,
      prompt: prompt.trim() || "Use the attached project context.",
      attachments: [...pendingAttachments],
      contexts: [...pendingContexts],
      createdAt: Date.now(),
    });
  }

  async function sendPrompt(event?: FormEvent) {
    event?.preventDefault();
    const visiblePrompt = composerText.trim();
    const initialBlocked = sendBlockReason({
      activeProject,
      connectionStatus,
      missingOpenAiAuth,
      hasUnsupportedAttachments:
        unsupportedAttachments(attachments).length > 0,
      pendingApprovals,
      promptReady: hasDraftContent({
        text: visiblePrompt,
        attachments,
        contexts: activeComposerContexts,
      }),
      sendStarting: sendStartingRef.current || sendStarting,
      runningTurnId: runningTurnIdRef.current ?? runningTurnId,
    });
    if (initialBlocked) {
      setSendError(initialBlocked);
      return;
    }
    if (!activeProject) return;
    sendStartingRef.current = true;
    setSendStarting(true);
    let sentToTurn = false;
    try {
    const planModeWasOn = activeProject.settings.planMode;
    const status = activeProjectEmptyStatus;
    const liveContext = liveAppReviewContext(
      activeProject,
      activeComposerContexts,
    );
    const featureDraftThreadIdForRouting =
      desktop.activeThreadId ?? activeProject.lastActiveThreadId ?? null;
    const activeThreadFeatureDraftId =
      featureDraftThreadIdForRouting != null
        ? desktop.featureDraftActiveIdsByThreadId[
            featureDraftThreadIdForRouting
          ]?.trim() || ""
        : "";
    const fallbackActiveProjectFeatureDraftId =
      (activeThreadFeatureDraftId || inspector.type === "draftPreview")
        ? ""
        : Object.values(desktop.featureDrafts)
            .filter(
              (draft) =>
                draft.projectId === activeProject.id &&
                draft.lifecycle === "active" &&
                draft.status !== "failed",
            )
            .sort((left, right) => right.updatedAt - left.updatedAt)[0]
            ?.draftId ?? "";
    const selectedFeatureDraft =
      inspector.type === "draftPreview"
        ? (desktop.featureDrafts[inspector.draftId] ?? null)
        : activeThreadFeatureDraftId
          ? (desktop.featureDrafts[activeThreadFeatureDraftId] ?? null)
          : fallbackActiveProjectFeatureDraftId
            ? (desktop.featureDrafts[fallbackActiveProjectFeatureDraftId] ?? null)
          : null;
    const selectedFeatureDraftOwnsActiveThread =
      Boolean(selectedFeatureDraft) &&
      (Boolean(
        selectedFeatureDraft?.threadId &&
          featureDraftThreadIdForRouting &&
          selectedFeatureDraft.threadId === featureDraftThreadIdForRouting,
      ) ||
        (inspector.type === "draftPreview" &&
          inspector.draftId === selectedFeatureDraft?.draftId));
    const selectedFeatureDraftCommandTarget = selectedFeatureDraftOwnsActiveThread
      ? selectedFeatureDraft
      : null;
	    const selectedFeatureDraftRouting = featureDraftIsActiveForRouting(
	      selectedFeatureDraftOwnsActiveThread ? selectedFeatureDraft : null,
	      activeProject.id,
	    )
	      ? selectedFeatureDraft
	      : null;
	    const selectedFeatureDraftRecovery =
	      selectedFeatureDraftCommandTarget &&
	      featureDraftNeedsAttention(selectedFeatureDraftCommandTarget)
	        ? selectedFeatureDraftCommandTarget
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
	              selectedFeatureDraft,
	              status,
	            }, visiblePrompt),
	          )
        : null;
    const canvasResolution = rawCanvasResolution;
    const decisionCanvasAction =
      visualDecisionComposerAction?.option.canvasAction ?? null;
    let prompt = visiblePrompt;
    let settings = { ...activeProject.settings };
    let contexts = [...activeComposerContexts];
    let openMockupsOnComplete = false;
    let liveOverlayProposalOnComplete = false;
    let liveProposalAcceptedForBuildTurnId: string | null = null;
    let featureDraftOnComplete = false;
    let featureDraftId: string | null = null;
    let deferredFeatureDraft: DeferredFeatureDraftPreparation | null = null;
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
      selectedFeatureDraftCommandTarget &&
      isFeatureDraftParkRequest(visiblePrompt)
    ) {
      if (await parkFeatureDraft(selectedFeatureDraftCommandTarget)) {
        clearComposerAfterLocalAction();
      }
      return;
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraftCommandTarget &&
      isFeatureDraftResumeRequest(visiblePrompt)
    ) {
      if (await resumeFeatureDraft(selectedFeatureDraftCommandTarget)) {
        clearComposerAfterLocalAction();
      }
      return;
    } else if (
      !visualDecisionComposerAction &&
      selectedFeatureDraftCommandTarget &&
      isFeatureDraftDiscardRequest(visiblePrompt)
    ) {
      if (await discardFeatureDraft(selectedFeatureDraftCommandTarget)) {
        clearComposerAfterLocalAction();
      }
      return;
	    } else if (
	      !visualDecisionComposerAction &&
	      selectedFeatureDraftCommandTarget &&
	      isFeatureDraftContinueRequest(visiblePrompt)
	    ) {
	      sentToTurn = await continueFeatureDraft(selectedFeatureDraftCommandTarget);
	      return;
	    } else if (
	      !visualDecisionComposerAction &&
	      selectedFeatureDraftCommandTarget &&
	      isFeatureDraftBuildRequest(visiblePrompt)
	    ) {
	      if (await buildFeatureDraft(selectedFeatureDraftCommandTarget)) {
	        clearComposerAfterLocalAction();
	      }
	      return;
	    } else if (
	      !visualDecisionComposerAction &&
	      selectedFeatureDraftRecovery &&
	      shouldRouteToFeatureDraftRecoveryPrompt({
	        inspectorIsDraft: inspector.type === "draftPreview",
	        inspectorDraftOwnsActiveThread: selectedFeatureDraftOwnsActiveThread,
	        prompt: visiblePrompt,
	      })
	    ) {
	      featureDraftId = selectedFeatureDraftRecovery.draftId;
	      cwdOverride = selectedFeatureDraftRecovery.workspacePath;
	      prompt = featureDraftRevisionPrompt(
	        selectedFeatureDraftRecovery,
	        visiblePrompt,
	        liveContext,
	      );
	      settings = { ...settings, planMode: false };
	      featureDraftOnComplete = true;
	    } else if (
	      !visualDecisionComposerAction &&
	      selectedFeatureDraftRouting &&
	      shouldRouteToFeatureDraftPrompt({
        inspectorIsDraft: inspector.type === "draftPreview",
        inspectorDraftOwnsActiveThread: selectedFeatureDraftOwnsActiveThread,
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
    } else if (visualDecisionComposerAction) {
      if (decisionCanvasAction === "start_fresh") {
        setDesktop((current) =>
          archiveCanvasProposalsForThread(current, desktop.activeThreadId),
        );
      }
      const createsFeatureDraft = visualDecisionOptionCreatesFeatureDraft(
        visualDecisionComposerAction.option,
      );
      const createsMockups = false;
      const decisionDraftRequest = visualDecisionFeatureDraftRequest(
        visualDecisionComposerAction.option,
        visiblePrompt,
      );
      if (createsFeatureDraft) {
        featureDraftId = createFeatureDraftId(
          activeThread?.id ?? activeProject.id,
        );
        deferredFeatureDraft = {
          draftId: featureDraftId,
          originalPrompt: decisionDraftRequest,
          status,
          planModeWasOn,
          liveContext: liveContextWithVisualDecisionGuidance(
            liveContext,
            visualDecisionComposerAction,
          ),
        };
      }
      prompt = createsFeatureDraft
        ? decisionDraftRequest
        : visualDecisionSelectionPrompt(
            visualDecisionComposerAction,
            visiblePrompt,
            null,
            null,
            activeThread?.id ?? null,
            liveContext,
          );
      settings = { ...settings, planMode: false };
      openMockupsOnComplete = false;
      liveOverlayProposalOnComplete = false;
      featureDraftOnComplete = createsFeatureDraft;
    } else if (
      shouldCreateFeatureDraftFromCanvasPrompt({
        backingPreference: canvasResolution?.backingPreference,
        hasActiveProposal: Boolean(activeLiveProposal),
        hasSelectedPreview: false,
        isExistingProject: status?.empty === false,
        planMode: planModeWasOn,
        prompt: visiblePrompt,
        resolutionAction: canvasResolution?.action,
        wantsOptions: canvasResolution?.wantsOptions,
      })
    ) {
      featureDraftId = createFeatureDraftId(activeThread?.id ?? activeProject.id);
      deferredFeatureDraft = {
        draftId: featureDraftId,
        originalPrompt: visiblePrompt,
        status,
        planModeWasOn,
        liveContext,
      };
      prompt = visiblePrompt;
      settings = { ...settings, planMode: false };
      featureDraftOnComplete = true;
    } else if (canvasResolution?.action === "CREATE_DRAFT") {
      featureDraftId = createFeatureDraftId(activeThread?.id ?? activeProject.id);
      deferredFeatureDraft = {
        draftId: featureDraftId,
        originalPrompt: visiblePrompt,
        status,
        planModeWasOn,
        liveContext,
      };
      prompt = visiblePrompt;
      settings = { ...settings, planMode: false };
      featureDraftOnComplete = true;
    }

    showPendingComposerSend(activeProject, visiblePrompt, attachments, contexts);

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
      featureDraftOnComplete,
      featureDraftId,
      mockupHistoryOnComplete,
      proposalSetId,
      artifactKind,
      deferredFeatureDraft,
    };
    sentToTurn = await sendDraft(draft, {
      clearComposer: true,
      sendStartingClaimed: true,
    });
    } catch (error) {
      setSendError(sendFailureMessage(error));
      setPendingComposerSend(null);
    } finally {
      if (!sentToTurn && sendStartingRef.current) {
        sendStartingRef.current = false;
        setSendStarting(false);
      }
    }
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
      sendStartingClaimed?: boolean;
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
      sendStarting: options.sendStartingClaimed
        ? false
        : sendStartingRef.current || sendStarting,
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
    const shouldClearComposer = options.clearComposer || sendingLocalDraft;
    sendStartingRef.current = true;
    setSendStarting(true);
    try {
      setSendError(null);
      if (!options.retry) setRetryDraft(null);
      if (shouldClearComposer) {
        clearSentComposerPayload(draft.contexts);
      }
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
      if (draft.deferredFeatureDraft) {
        const optimisticThread = targetThread;
        activeThreadIdRef.current = optimisticThread.id;
        threadsRef.current = {
          ...threadsRef.current,
          [optimisticThread.id]: optimisticThread,
        };
        setThreads((current) => ({
          ...current,
          [optimisticThread.id]: optimisticThread,
        }));
        setDesktop((current) => ({
          ...current,
          activeProjectId: project.id,
          activeThreadId: optimisticThread.id,
          projects: current.projects.map((stored) =>
            stored.id === project.id
              ? { ...stored, lastActiveThreadId: optimisticThread.id }
              : stored,
          ),
        }));
        showPendingComposerSend(
          project,
          draft.visiblePrompt?.trim() ||
            draft.deferredFeatureDraft.originalPrompt ||
            draft.prompt,
          draft.attachments,
          draft.contexts,
        );
        const preparedDraft = await prepareFeatureDraft(
          project,
          draft.deferredFeatureDraft.draftId,
          draft.deferredFeatureDraft.originalPrompt,
          targetThread.id,
        );
        draft = {
          ...draft,
          prompt: featureDraftWorkspacePrompt(
            draft.deferredFeatureDraft.originalPrompt,
            project,
            draft.deferredFeatureDraft.status ?? {
              empty: false,
              reason: "",
              meaningfulEntries: [],
              ignoredEntries: [],
            },
            draft.deferredFeatureDraft.planModeWasOn,
            draft.deferredFeatureDraft.liveContext,
            preparedDraft,
          ),
          cwdOverride: preparedDraft.workspacePath,
          featureDraftId: preparedDraft.draftId,
          deferredFeatureDraft: null,
        };
      }
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
      setPendingComposerSend(null);
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
          featureDraftActiveIdsByThreadId:
            draft.featureDraftOnComplete && targetFeatureDraftId
              ? {
                  ...current.featureDraftActiveIdsByThreadId,
                  [targetThread.id]: targetFeatureDraftId,
                }
              : current.featureDraftActiveIdsByThreadId,
          featureDrafts:
            draft.featureDraftOnComplete &&
            targetFeatureDraftId &&
            targetFeatureDraft
              ? {
                  ...current.featureDrafts,
                  [targetFeatureDraftId]: {
                    ...targetFeatureDraft,
                    threadId: targetThread.id,
                    turnId: response.turn.id,
                    status: "generating" as const,
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
      setPendingComposerSend(null);
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
          ? "Build this."
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
    setDesktop((current) => ({
      ...current,
      planProposals: updatePlanProposalStatus(
        current.planProposals,
        latestProposal.turnId,
        "declined",
      ),
      layout: current.layout,
    }));
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
    setSavedMockupReviewSets((current) => {
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
              !Object.values(savedMockupReviewSets).some(
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
  const activeThreadFeatureDraft =
    activeThreadFeatureDraftId
      ? (desktop.featureDrafts[activeThreadFeatureDraftId] ?? null)
      : null;
  const previewProject = activePreviewProjectId
    ? (desktop.projects.find(
        (project) => project.id === activePreviewProjectId,
      ) ?? null)
    : null;
  const selectedAppPreviewContexts =
    inspector.type === "appPreview" ||
    inspector.type === "draftPreview"
      ? activeComposerContexts.filter(
          (context): context is ComposerAppPreviewContext =>
            context.type === "appPreview" &&
            context.projectId === inspector.projectId,
        )
      : [];
  const selectedFeatureDraft =
    inspector.type === "draftPreview"
      ? (desktop.featureDrafts[inspector.draftId] ?? null)
      : activeThreadFeatureDraft;
  const selectedFeatureDraftCanShowLive = Boolean(
    selectedFeatureDraft &&
      projectEmptyStatusById[selectedFeatureDraft.projectId] &&
      !projectEmptyStatusById[selectedFeatureDraft.projectId].empty,
  );

  const activeAppPreviewSelected = Boolean(
    desktop.layout.inspectorOpen &&
      activeProject &&
      ((inspector.type === "appPreview" &&
        inspector.projectId === activeProject.id) ||
        (inspector.type === "draftPreview" &&
          inspector.projectId === activeProject.id &&
          inspector.draftId === activeThreadFeatureDraftId)),
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
            pendingComposerSend={pendingComposerSend}
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
          appPreviewContexts={selectedAppPreviewContexts}
          featureDraft={selectedFeatureDraft}
          featureDraftCanShowLive={selectedFeatureDraftCanShowLive}
          featureDraftRefreshNonce={
            selectedFeatureDraft
              ? (draftPreviewRefreshNonces[selectedFeatureDraft.draftId] ?? 0)
              : 0
          }
          livePreviewAutoStartNonce={
            previewProject ? (livePreviewAutoStartNonces[previewProject.id] ?? 0) : 0
          }
          onAnswerApproval={answerApproval}
          onOpenDocument={(path) => selectInspector({ type: "document", path })}
          onResizePointerDown={beginInspectorResize}

          onReviewChanges={() => void reviewChanges()}
          onRollback={() => void rollbackChat()}
          onSelect={selectInspector}
          onAttachAppPreviewMark={attachAppPreviewMark}
          onBuildBaselineApp={requestBaselineApp}
          onBuildFeatureDraft={(draft) => void buildFeatureDraft(draft)}
          onContinueFeatureDraft={(draft) => void continueFeatureDraft(draft)}
          onDiscardFeatureDraft={(draft) => void discardFeatureDraft(draft)}
          onParkFeatureDraft={(draft) => void parkFeatureDraft(draft)}
          onRefreshFeatureDraft={(draft) => refreshFeatureDraftPreview(draft)}
          onResumeFeatureDraft={(draft) => void resumeFeatureDraft(draft)}

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

const MOCKUP_TASK_SENTINEL = "[Codex Mockup Artifact Task]";
const LIVE_OVERLAY_PROPOSAL_SENTINEL = "[Codex Live Overlay Proposal Context]";
const CODE_PROPOSAL_WORKSPACE_SENTINEL =
  "[Codex Code Proposal Workspace Context]";
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
    `- Use product-facing labels such as "Draft" or a short direction name; do not use lettered labels.`,
    `- Use file names such as ${filePrefix}-draft.html or ${filePrefix}-<short-direction>.html inside ${baseDir}.`,
    "- Keep every updated artifact for this turn inside the same proposalSetId folder instead of writing to the root .codex/mockups folder.",
  ].join("\n");
}

function isMockupGenerationPrompt(prompt: string) {
  return prompt.trimStart().startsWith(MOCKUP_TASK_SENTINEL);
}

function isLiveOverlayProposalPrompt(prompt: string) {
  return prompt.trimStart().startsWith(LIVE_OVERLAY_PROPOSAL_SENTINEL);
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

function visualDecisionSelectionPrompt(
  action: VisualDecisionComposerAction,
  visiblePrompt: string,
  proposalSetId: string | null,
  artifactKind: PreviewArtifactKind | null,
  threadId: string | null,
  liveContext = "",
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
    ? `\n\n${liveOverlayProposalOutputRules()}\n${liveContext}`
    : "";
  return `${VISUAL_DECISION_SELECTION_SENTINEL}

Selected desktop Draft action:
- Decision id: ${action.decisionId}
- Option id: ${action.option.id}
- Label: ${action.option.label}
- Description: ${action.option.description || "none"}

Selected Draft action prompt for supporting context:
${action.option.prompt}

The selected Draft action is supporting context. The user-visible composer text below is authoritative if it differs from that context.
${storageRules}
${liveOverlayRules}

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
        mark.surface === "draft" && mark.draftId
          ? `draft=${quotePromptValue(mark.draftId, 80)}`
          : "",
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
        )} surface=${mark.surface} viewport=${mark.viewport} rect=${Math.round(area.x)},${Math.round(
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

function liveContextWithSelectedProposalGuidance(
  liveContext: string,
  proposal: PlanProposal,
) {
  const proposalGuidance = planPreviewDecisionSummary(proposal).trim();
  if (!proposalGuidance) return liveContext;
  return `${liveContext}

Selected proposal guidance:
${proposalGuidance}

Use the selected proposal only as Draft guidance. Build the actual visible change in the isolated Draft workspace.`;
}

function liveContextWithVisualDecisionGuidance(
  liveContext: string,
  action: VisualDecisionComposerAction,
) {
  return `${liveContext}

Selected decision guidance:
- Label: ${action.option.label}
- Description: ${action.option.description || "none"}
- Prompt: ${action.option.prompt}

Use the selected decision only as Draft guidance. Build the actual visible change in the isolated Draft workspace.`;
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
    selectedFeatureDraft: FeatureDraft | null;
    status: ProjectEmptyStatus | null;
  },
  message: string,
) {
  void state.activeLiveProposal;
  void state.activeThreadId;
  void state.liveContext;
  const selectedSurface: CanvasSurface =
    state.inspector.type === "draftPreview" ? "Draft" : "Live";
  const liveExists = !state.status?.empty;
  const workflowLedger = deriveCanvasWorkflowLedger({
    liveExists,
    selectedSurface,
    activeDraft: state.selectedFeatureDraft,
    selectedDraft: state.selectedFeatureDraft,
  });
	  return {
	    message,
	    live: {
	      exists: liveExists,
	      running: Boolean(rememberedPreviewUrlForProject(state.activeProject.id)),
	      previewUrl: rememberedPreviewUrlForProject(state.activeProject.id),
	    },
	    selectedSurface,
	    workflowLedger,
    activeProposalSet: null,
    historicalProposalSets: [],
    marks: state.contexts.map(canvasMarkState),
    attachmentCount: state.attachmentsCount,
    planMode: state.activeProject.settings.planMode,
  };
}

function canvasMarkState(context: ComposerContextReference) {
  return {
    id: context.id,
    source: "user_mark" as const,
    surface: context.surface === "draft" ? ("Draft" as const) : ("Live" as const),
  };
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
  const mockupProposalSetId =
    desktop.mockupActiveProposalSetIdsByThreadId[threadId] ?? null;
  let next = desktop;
  if (mockupProposalSetId) {
    next = markMockupProposalSetAsHistory(next, mockupProposalSetId);
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
- This turn is decision-only. Do not run commands, edit files, create mockup artifacts, or create temporary workspaces in this turn.
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
- show_draft: create one reviewable Draft in the real app context before implementation.
- start_fresh: park the current Draft context and begin a fresh Draft direction.

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
      "canvasAction": "build_directly | show_draft | start_fresh"
    }
  ]
}

Routing guidance for authored choices:
- For existing apps, a one-feature "show me first" or "preview first" path should use canvasAction "show_draft". The label can be "Show Draft" or a short feature-specific phrase. The option prompt must describe the actual feature/change to try in the Draft.
- For multiple current-app directions, ask the agent to create one named Draft direction first or to name the Draft direction it recommends. Do not use letter labels or compare lanes.
- If a current Draft exists and the target is unclear, offer "Revise Draft", "New Draft", and when appropriate "Build now".
- Avoid asking a questionnaire if the user's wording already clearly chooses direct build or Draft preview; in that case the resolver should not have selected this decision-only turn.

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
- Create one saved HTML review preview under .codex/mockups for the requested current-app change. If the request contains multiple directions, name them in the summary and choose the single most useful Draft-style preview to create first.
- Do not change real app implementation files in this turn.
- Stop after the review artifact is ready; the desktop will open it automatically.

Rules:
${previewArtifactStorageRules(proposalSetId, artifactKind, threadId)}
- Name the review preview after a user-facing workflow concept from the request, not after placement or component buckets.
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

${liveOverlayProposalOutputRules()}

Original user request:
${originalPrompt.trim()}`;
}

function liveOverlayProposalOutputRules() {
  return `Live review metadata rules:
- This is review-only context. You may inspect the project, but do not edit app implementation files and do not create saved .codex/mockups artifacts.
- Return a concise product-facing response that explains the single Draft direction to try next.
- Do not return visual preview payloads, proposal options, or lettered variants.
- Use the Live app as the base. If visual marks are useful, describe them in product language for the Draft follow-up; do not add fake Codex UI inside the app surface.
- Do not describe or request visible Codex proposal chrome inside the app surface: no Proposed banners, fake CTA buttons, generic proposal cards, DOM tags, CSS boxes, or placeholder controls such as Open settings.
- If the request is too broad for one honest Draft direction, say that briefly and ask one product-facing question.
- Avoid debug text, internal logs, DOM tag editing UI, CSS property panels, and fake backend routes.`;
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
- Saved review folder: ${previewSet.baseDir}
- Selected saved preview: ${selected ? `${selected.label || selected.id} - ${selected.title}` : "none"}
- Original request: ${previewSet.originalPrompt || "Not saved; use the saved manifest and chat context only as supporting context."}

Saved previews:
${optionLines.join("\n")}

Decision policy:
- Do not return a codex-decision-strip block, fixed questionnaire, or generic action choices for this saved mockup review path. Do the relevant saved preview work directly, then summarize what changed.
- Let the user's request drive the next step; do not show or ask a fixed questionnaire.
- The selected saved preview is supporting context only. If the user-visible request conflicts with it, follow the user-visible request.
- Treat exploratory implementation wording as Draft/review intent when placement or workflow is still vague. Phrases like "looking to implement", "thinking of adding", "somewhere", "where should", "show it first", or "where it should be" should update or create one saved review preview first, not change real app files.
- If the user asks for another/new direction, create a product-named saved preview in the same review folder only when it is necessary for the request. Do not use letter labels.
- If the user asks for many simultaneous directions, ask which single Draft direction to create first instead of generating lettered choices.
- If they ask to combine, change, improve, explore, place, preview, show, or decide where something should go, update or create saved ${previewArtifactDisplayName(
    previewSet.artifactKind,
    2,
    "lower",
  )} inside ${previewSet.baseDir} and stop before real implementation.
- When updating or creating saved ${previewArtifactDisplayName(
    previewSet.artifactKind,
    2,
    "lower",
  )}, update the manifest entry summaries and add or refresh a highlights array for each changed visual area whenever practical. Each highlight should name the changed area and include x, y, width, height, viewportWidth, viewportHeight, and a short note. These highlights are legacy artifact metadata and must not appear inside accepted app UI.
- If a changed area cannot be bounded confidently, say that plainly in the response instead of inventing a fake highlight.
- Only implement the real app when the user explicitly commits with wording such as "implement now", "build this", "apply this", or "make this real". In that case, build from the selected or described ${previewArtifactActionName(
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
  return (mockup.title || mockup.label || "").trim() || "selected preview";
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
    /\bbuild\s+(?:this|that|it|the\s+selected)\b/.test(
      text,
    ) ||
    /\bapply\s+(?:this|that|it|the\s+selected)\b/.test(text) ||
    /\bmake\s+(?:this|that|it|the\s+selected)\s+real\b/.test(
      text,
    ) ||
    /\bimplement\s+(?:now|this|that|it|the\s+selected|selected)\b/.test(
      text,
    ) ||
    /\bi\s+like\s+(?:this|that|it)\b.*\bimplement\b/.test(text) ||
    /\bplease\s+implement\s+(?:this|that|it)\b/.test(text)
  );
}

function isCodeProposalImplementationCommitment(prompt: string) {
  return isSavedMockupImplementationCommitment(prompt);
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
    "Live review revision rules:",
    "- Treat the previous temporary Live proposal as legacy review context; do not edit implementation files yet.",
    "- Return a concise product-facing response that names the single Draft direction to try next.",
    "- Do not return visual preview JSON, proposal options, or lettered variants.",
    "- Keep the review based on the current Live app, not copied static HTML.",
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
    "Build this accepted preview.",
    "",
    "Project context explicitly attached by the user:",
    "Selected live app review guidance. This supports the accepted change; if any user-visible instruction conflicts with this context, the user-visible instruction wins.",
    "",
    `Build strategy: ${buildStrategy}.`,
    ...buildGuidance,
    "Do not add Codex proposal chrome, banners, fake controls, or temporary preview metadata to the accepted app UI.",
    "Do not start or stop local preview servers from this implementation turn; the App Preview toolbar owns that.",
    "After editing, summarize the source changes and mention any mismatch or uncertainty versus the accepted preview.",
    "",
    `Original proposal request: ${proposal.prompt}`,
    selectedVariant
      ? `Selected review: ${selectedVariant.title}`
      : "Selected review: accepted preview",
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
    "When visual review is the plan itself, describe the Draft direction to create next instead of generating lettered variants.",
    "For an existing running app, prefer a single Draft direction when visual review is useful. Do not create proposal metadata or saved lettered review artifacts from Plan Mode.",
    "If the user later accepts the plan, implementation can proceed in a separate turn.",
    "Return a clear product-facing plan. Keep source-level details only where they make the plan accurate.",
    "If the request creates hidden prompt/message state, parallel recovery paths, duplicated ownership, or estimate-vs-observed confusion, challenge the risky literal request and offer a safer plan in product language before implementation steps.",
    "Do not create .codex/mockups artifacts from Plan Mode unless the user explicitly asks for a saved standalone mockup.",
    "Do not include visual preview JSON blocks or lettered variant IDs. If a visual review is needed, propose the single Draft to create next.",
  ];
  return `${rules.join("\n")}\n\nUser request:\n${prompt}`;
}
