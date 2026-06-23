import {
  ExternalLink,
  Eye,
  EyeOff,
  Hammer,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  Play,
  RefreshCw,
  Search,
  Smartphone,
  Square,
  X,
} from "lucide-react";
import {
  type DragEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { desktopInvoke, hasDesktopBridge } from "../desktopBridge";
import { usePreviewToolbarDensity } from "../hooks/usePreviewToolbarDensity";
import { selectedPlanPreviewVariant } from "../planPreview";
import {
  buildCanvasTargetMetadataScript,
  type CanvasTargetMetadataResult,
} from "../canvasTargeting";
import {
  mergeProposalHighlightsWithVisualPatchTargets,
  proposalHighlightsForVisualPatchTargets,
} from "../canvasVisualReferences";
import {
  evaluateLiveDomPatchStaleness,
  freshCanvasProposalStaleness,
  liveDomPatchRequiresBacking,
  staleProposalBuildMessage,
  type CanvasProposalStalenessStatus,
} from "../canvasProposalStaleness";
import {
  buildVisualPatchApplyScript,
  buildVisualPatchClearScript,
  type VisualPatchBundle,
} from "../visualPatchRuntime";
import type {
  CanvasVisualReferenceMeta,
  ComposerAppPreviewContext,
  PlanPreviewAreaMark,
  PlanPreviewCleanupStatus,
  PlanPreviewSessionState,
  PlanPreviewVariant,
  PlanProposal,
  Project,
  ProposalHighlight,
} from "../types";
import {
  PreviewToolbarSelect,
  type PreviewToolbarSelectOption,
} from "./PreviewToolbarSelect";

type DraftMark = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type HighlightDrag = {
  highlightId: string;
  label: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  startMark: PlanPreviewAreaMark;
};

type ElectronWebviewElement = HTMLElement & {
  executeJavaScript: <T = unknown>(
    code: string,
    userGesture?: boolean,
  ) => Promise<T>;
  capturePage?: () => Promise<{
    toDataURL?: () => string;
  }>;
  getURL: () => string;
  reload: () => void;
  reloadIgnoringCache?: () => void;
};

type PreviewProbeResult = {
  status: "available" | "unavailable" | "multiple";
  url: string;
  finalUrl: string;
  title: string;
  reason: string;
  choices?: PreviewProbeResult[];
};

type ManagedPreviewResult = {
  status: "running" | "starting" | "stopped" | "unavailable";
  url: string;
  finalUrl: string;
  title: string;
  reason: string;
  command?: string;
  managed?: boolean;
  needsBaseline?: boolean;
};

type PreviewAvailability = "idle" | "probing" | "available" | "unavailable";
type ManagedPreviewState = "stopped" | "starting" | "running" | "failed";
type FrameStatus = "idle" | "loading" | "loaded" | "failed";
type ProposalSelectionStatus =
  | "idle"
  | "clean"
  | "cleaning"
  | "selecting"
  | "selected"
  | "reset"
  | "failed"
  | "unavailable";

const suggestedPreviewUrls = [
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:8080",
];

export type LiveAppPreviewMarkMeta = CanvasVisualReferenceMeta & {
  previewUrl: string;
  route: string;
  viewport: "desktop" | "mobile";
  thumbnailDataUrl?: string;
  label?: string;
  source?: "userMark" | "proposalHighlight";
  highlightId?: string;
};

export function LiveAppPreview(props: {
  project: Project;
  proposal?: PlanProposal | null;
  areaMark?: PlanPreviewAreaMark | null;
  appPreviewContexts?: ComposerAppPreviewContext[];
  compareTabOptions?: PreviewToolbarSelectOption[];
  statusLabel?: string;
  viewport?: "desktop" | "mobile";
  onAreaMarkChange: (
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onViewportChange?: (viewport: "desktop" | "mobile") => void;
  onSessionChange?: (session: PlanPreviewSessionState | null) => void;
  onVariantChange?: (variantId: string) => void;
  onBuildBaselineRequest?: (project: Project) => void;
  onLaneTransfer?: (from: string, to: string) => void;
  proposalLaneTitle?: string;
  proposalLaneStatus?: string;
  proposalControls?: {
    autoStart?: boolean;
    buildDisabled?: boolean;
    buildLabel: string;
    buildTitle?: string;
    onBuild: () => void;
    secondaryDanger?: boolean;
    secondaryLabel?: string;
    secondaryTitle?: string;
    onSecondary?: () => void;
  };
}) {
  const storageKey = `codex.preview.url.${props.project.id}`;
  const [draftUrl, setDraftUrl] = useState(
    () => window.localStorage.getItem(storageKey) ?? "",
  );
  const [previewUrl, setPreviewUrl] = useState("");
  const [frameKey, setFrameKey] = useState(0);
  const [frameStatus, setFrameStatus] = useState<FrameStatus>("idle");
  const [availability, setAvailability] = useState<PreviewAvailability>("idle");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [managedState, setManagedState] =
    useState<ManagedPreviewState>("stopped");
  const [managedCommand, setManagedCommand] = useState("");
  const [needsBaseline, setNeedsBaseline] = useState(false);
  const [showUrlEntry, setShowUrlEntry] = useState(false);
  const [previewChoices, setPreviewChoices] = useState<PreviewProbeResult[]>([]);
  const [uncontrolledViewport, setUncontrolledViewport] = useState<
    "desktop" | "mobile"
  >(props.viewport ?? "desktop");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [draftMark, setDraftMark] = useState<DraftMark | null>(null);
  const [highlightDrag, setHighlightDrag] = useState<HighlightDrag | null>(null);
  const [pendingLaneTransfer, setPendingLaneTransfer] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [highlightAdjustments, setHighlightAdjustments] = useState<
    Record<string, PlanPreviewAreaMark>
  >({});
  const highlightAdjustmentsRef = useRef<Record<string, PlanPreviewAreaMark>>({});
  const [proposalVisible, setProposalVisible] = useState(true);
  const [showProposalHighlights, setShowProposalHighlights] = useState(false);
  const [visualPatchHighlights, setVisualPatchHighlights] = useState<
    ProposalHighlight[]
  >([]);
  const [proposalSelectionStatus, setProposalSelectionStatus] =
    useState<ProposalSelectionStatus>("idle");
  const [proposalStaleness, setProposalStaleness] =
    useState<CanvasProposalStalenessStatus>(freshCanvasProposalStaleness);
  const [hasRenderedPreview, setHasRenderedPreview] = useState(false);
  const [heldPreviewSnapshot, setHeldPreviewSnapshot] = useState("");
  const [interactionState, setInteractionState] = useState(
    "No temporary interaction recorded.",
  );
  const [currentRoute, setCurrentRoute] = useState("");
  const [markNote, setMarkNote] = useState(
    () => props.areaMark?.note ?? props.proposal?.previewAreaMark?.note ?? "",
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
  const draftMarkRef = useRef<DraftMark | null>(null);
  const [webview, setWebview] = useState<ElectronWebviewElement | null>(null);
  const probeRequestRef = useRef(0);
  const proposalSelectionGenerationRef = useRef(0);
  const previewSnapshotRequestRef = useRef(0);
  const mountedRef = useRef(true);
  const supportsElectronPreview = hasDesktopBridge();
  const proposalControls = props.proposalControls ?? null;
  const proposalToolbar = Boolean(proposalControls);
  const spec = props.proposal?.previewSpec ?? null;
  const selectedVariant = selectedPlanPreviewVariant(
    spec,
    props.proposal?.previewSelectedVariantId,
  );
  const variants = spec?.variants.slice(0, 3) ?? [];
  const authoredHighlights = selectedVariant?.highlights ?? [];
  const selectedHighlights = useMemo(
    () =>
      mergeProposalHighlightsWithVisualPatchTargets(
        authoredHighlights,
        visualPatchHighlights,
      ),
    [authoredHighlights, visualPatchHighlights],
  );
  const singleMark = props.areaMark ?? props.proposal?.previewAreaMark ?? null;
  const viewport = props.viewport ?? uncontrolledViewport;
  const adjustedHighlightContexts =
    props.appPreviewContexts?.filter(
      (context) =>
        context.source === "proposalHighlight" &&
        context.projectId === props.project.id &&
        context.viewport === viewport,
    ) ?? [];
  const renderedMarks =
    props.appPreviewContexts && props.appPreviewContexts.length > 0
      ? props.appPreviewContexts
          .filter((context) => context.source !== "proposalHighlight")
          .map((context) => ({
            id: context.id,
            label: context.markLabel || "Mark 1",
            areaMark: context.areaMark,
          }))
      : singleMark
        ? [
            {
              id: "live-preview-mark",
              label: "Mark 1",
              areaMark: singleMark,
            },
          ]
        : [];
  const activeRenderedMark = renderedMarks[renderedMarks.length - 1] ?? null;
  const mark = activeRenderedMark?.areaMark ?? null;
  const safeDraftUrl = useMemo(() => normalizePreviewUrl(draftUrl), [draftUrl]);
  const routeForContext = currentRoute || previewUrl || safeDraftUrl;
  const captureWebview = useCallback((node: HTMLElement | null) => {
    setWebview(node as ElectronWebviewElement | null);
  }, []);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearRenderedPreview = useCallback(() => {
    previewSnapshotRequestRef.current += 1;
    setHasRenderedPreview(false);
    setHeldPreviewSnapshot("");
  }, []);

  const rememberRenderedPreview = useCallback((target: ElectronWebviewElement) => {
    setHasRenderedPreview(true);
    if (typeof target.capturePage !== "function") return;
    const requestId = previewSnapshotRequestRef.current + 1;
    previewSnapshotRequestRef.current = requestId;
    window.setTimeout(() => {
      if (!mountedRef.current || previewSnapshotRequestRef.current !== requestId) {
        return;
      }
      void target.capturePage?.()
        .then((image) => {
          if (
            !mountedRef.current ||
            previewSnapshotRequestRef.current !== requestId
          ) {
            return;
          }
          const dataUrl = image?.toDataURL?.();
          if (dataUrl) setHeldPreviewSnapshot(dataUrl);
        })
        .catch(() => {
          // Snapshot hold is a visual polish layer; loading still works without it.
        });
    }, 80);
  }, []);

  useEffect(() => {
    probeRequestRef.current += 1;
    proposalSelectionGenerationRef.current += 1;
    const storedUrl = props.proposalControls?.autoStart
      ? ""
      : window.localStorage.getItem(storageKey) ?? "";
    setDraftUrl(storedUrl);
    setCurrentRoute("");
    setInteractionState("No temporary interaction recorded.");
    setProposalSelectionStatus("idle");
    setProposalStaleness(freshCanvasProposalStaleness);
    setManagedState("stopped");
    setManagedCommand("");
    setNeedsBaseline(false);
    setShowUrlEntry(false);
    setPreviewChoices([]);
    setMarking(false);
    setDraftMarkState(null);
    if (!props.proposal && props.areaMark) {
      props.onAreaMarkChange(null, {
        previewUrl: storedUrl,
        route: storedUrl,
        viewport,
      });
    }
    if (storedUrl) {
      void restoreRememberedPreview(storedUrl);
      return;
    }
    if (!props.proposalControls?.autoStart) {
      clearRenderedPreview();
    }
    setPreviewUrl("");
    setFrameStatus("idle");
    setAvailability("unavailable");
    setAvailabilityMessage("No preview running.");
    if (props.proposalControls?.autoStart && supportsElectronPreview) {
      void runPreview();
      return;
    }
    void refreshManagedPreviewStatus(storedUrl);
    // Reset only when the project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (!props.viewport) return;
    setUncontrolledViewport(props.viewport);
  }, [props.viewport]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && moreMenuRef.current?.contains(target)) return;
      setMoreMenuOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!props.onVariantChange || selectedVariant || !variants[0]) return;
    props.onVariantChange(variants[0].id);
  }, [props.onVariantChange, selectedVariant, variants]);

  useEffect(() => {
    setProposalVisible(true);
    setShowProposalHighlights(false);
    setHighlightDrag(null);
    highlightAdjustmentsRef.current = {};
    setHighlightAdjustments({});
    setVisualPatchHighlights([]);
    setProposalStaleness(freshCanvasProposalStaleness);
  }, [props.proposal?.turnId, spec?.updatedAt]);

  useEffect(() => {
    setVisualPatchHighlights([]);
    setProposalStaleness(freshCanvasProposalStaleness);
  }, [selectedVariant?.id]);

  useEffect(() => {
    if (selectedHighlights.length === 0) setShowProposalHighlights(false);
  }, [selectedHighlights.length]);

  useEffect(() => {
    if (
      !webview ||
      frameStatus !== "loaded" ||
      !showProposalHighlights ||
      selectedHighlights.length === 0
    ) {
      return;
    }
    let cancelled = false;
    const variantId = selectedVariant?.id ?? "preview";
    void Promise.all(
      selectedHighlights.map(async (highlight) => {
        const key = highlightKey(variantId, highlight.id, viewport);
        if (highlightAdjustmentsRef.current[key]) return null;
        if (
          adjustedHighlightContexts.some(
            (context) => context.highlightId === highlight.id,
          )
        ) {
          return null;
        }
        const area = await detectHighlightAreaInWebview(webview, highlight.label);
        if (!area) return null;
        return { key, area: { ...area, note: highlight.note, createdAt: Date.now() } };
      }),
    ).then((matches) => {
      if (cancelled) return;
      const nextEntries = matches.filter(
        (match): match is { key: string; area: PlanPreviewAreaMark } =>
          Boolean(match),
      );
      if (nextEntries.length === 0) return;
      highlightAdjustmentsRef.current = {
        ...highlightAdjustmentsRef.current,
        ...Object.fromEntries(nextEntries.map((match) => [match.key, match.area])),
      };
      setHighlightAdjustments(highlightAdjustmentsRef.current);
    });
    return () => {
      cancelled = true;
    };
  }, [
    adjustedHighlightContexts,
    frameStatus,
    selectedHighlights,
    selectedVariant?.id,
    showProposalHighlights,
    viewport,
    webview,
  ]);

  useEffect(() => {
    setMarkNote(mark?.note ?? "");
  }, [mark?.createdAt, mark?.note]);

  useEffect(() => {
    if (!webview) return;
    const handleFinishLoad = () => {
      setFrameStatus("loaded");
      setAvailability("available");
      rememberRenderedPreview(webview);
      void refreshRoute(webview);
    };
    const handleFailLoad = () => {
      setFrameStatus("failed");
      setProposalSelectionStatus("unavailable");
      setAvailability("unavailable");
      setAvailabilityMessage("The preview failed to load.");
    };
    const handleNavigate = () => {
      void refreshRoute(webview);
    };
    webview.addEventListener("did-finish-load", handleFinishLoad);
    webview.addEventListener("did-fail-load", handleFailLoad);
    webview.addEventListener("did-navigate", handleNavigate);
    webview.addEventListener("did-navigate-in-page", handleNavigate);
    return () => {
      webview.removeEventListener("did-finish-load", handleFinishLoad);
      webview.removeEventListener("did-fail-load", handleFailLoad);
      webview.removeEventListener("did-navigate", handleNavigate);
      webview.removeEventListener("did-navigate-in-page", handleNavigate);
    };
  }, [rememberRenderedPreview, webview]);

  useEffect(() => {
    if (!webview || frameStatus !== "loaded") return;
    if (!selectedVariant || !proposalVisible) {
      void cleanupSelectedProposal("clean");
      return;
    }
    void selectProposalVariant(selectedVariant);
    // Cleanup is part of selectProposalVariant, so variant switches replace old metadata.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    webview,
    frameStatus,
    selectedVariant?.id,
    proposalVisible,
    previewUrl,
    currentRoute,
    viewport,
    frameKey,
  ]);

  useEffect(() => {
    if (!webview || proposalSelectionStatus !== "selected") return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const state = await webview.executeJavaScript<GuestPreviewState | null>(
          "window.__codexPlanPreview?.interactionState ?? null",
          false,
        );
        if (!cancelled) {
          setInteractionState(describeGuestInteractionState(state));
        }
        void refreshRoute(webview);
      } catch {
        if (!cancelled) setInteractionState("Preview interaction state unavailable.");
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [webview, proposalSelectionStatus, selectedVariant?.id]);

  useEffect(() => {
    return () => {
      if (!webview) return;
      try {
        void webview.executeJavaScript(cleanupScript(), false).catch(() => {});
      } catch {
        // The webview can be detached before Electron allows script execution.
      }
    };
  }, [webview]);

  useEffect(() => {
    if (!props.proposal) return;
    const url = previewUrl || safeDraftUrl;
    if (!url && availability !== "unavailable") {
      props.onSessionChange?.(null);
      return;
    }
    props.onSessionChange?.({
      previewUrl: url,
      route: routeForContext || url,
      viewport,
      interactionState,
      cleanupStatus: cleanupStatusForSession(proposalSelectionStatus, availability),
      updatedAt: Date.now(),
    });
    // onSessionChange intentionally omitted; App bails out when values match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.proposal?.turnId,
    previewUrl,
    safeDraftUrl,
    routeForContext,
    viewport,
    interactionState,
    proposalSelectionStatus,
    availability,
  ]);

  async function discoverPreviewUrl() {
    if (!supportsElectronPreview) {
      setAvailability("unavailable");
      setAvailabilityMessage(
        "Run Codex Local in Electron to use live app preview.",
      );
      return;
    }
    const requestId = probeRequestRef.current + 1;
    probeRequestRef.current = requestId;
    setAvailability("probing");
    setManagedState("starting");
    setAvailabilityMessage("Looking for a running local app preview.");
    setPreviewChoices([]);
    const result = await desktopInvoke<PreviewProbeResult>("app_preview_discover", {
      urls: suggestedPreviewUrls,
      projectPath: props.project.path,
      excludeUrls: rememberedPreviewUrlsForOtherProjects(storageKey),
    })?.catch((error) => unavailableFromError(error));
    if (requestId !== probeRequestRef.current) return;
    setManagedState("stopped");
    if (result?.status === "multiple" && result.choices?.length) {
      setAvailability("unavailable");
      setAvailabilityMessage("Choose a running local preview.");
      setPreviewChoices(result.choices);
      return;
    }
    if (result?.status === "available") {
      activatePreview(result.finalUrl || result.url);
      return;
    }
    setAvailability("unavailable");
    setAvailabilityMessage(
      result?.reason || "Start the app and choose its local URL.",
    );
    setPreviewUrl("");
    setFrameStatus("idle");
    clearRenderedPreview();
    setProposalSelectionStatus("unavailable");
  }

  async function runPreview() {
    if (!supportsElectronPreview) {
      setAvailability("unavailable");
      setAvailabilityMessage(
        "Run Codex Local in Electron to use live app preview.",
      );
      return;
    }
    const requestId = probeRequestRef.current + 1;
    probeRequestRef.current = requestId;
    setManagedState("starting");
    setAvailability("probing");
    setAvailabilityMessage("Starting this project's preview.");
    setManagedCommand("");
    setNeedsBaseline(false);
    setPreviewChoices([]);
    const result = await desktopInvoke<ManagedPreviewResult>("app_preview_start", {
      projectPath: props.project.path,
    })?.catch((error) => unavailableManagedPreview(error));
    if (requestId !== probeRequestRef.current) return;
    setManagedCommand(result?.command ?? "");
    if (result?.status === "running") {
      setManagedState("running");
      activatePreview(result.finalUrl || result.url);
      return;
    }
    setManagedState("failed");
    setAvailability("unavailable");
    setAvailabilityMessage(result?.reason || "Preview did not start.");
    setNeedsBaseline(Boolean(result?.needsBaseline));
    setPreviewUrl("");
    setFrameStatus("idle");
    clearRenderedPreview();
    setProposalSelectionStatus("unavailable");
  }

  async function stopPreview() {
    probeRequestRef.current += 1;
    setManagedState("stopped");
    setAvailability("unavailable");
    setAvailabilityMessage("No preview running.");
    setFrameStatus("idle");
    setPreviewUrl("");
    setCurrentRoute("");
    clearRenderedPreview();
    setMarking(false);
    setDraftMarkState(null);
    setPreviewChoices([]);
    await cleanupSelectedProposal("reset");
    await desktopInvoke<ManagedPreviewResult>("app_preview_stop", {
      projectPath: props.project.path,
    })?.catch(() => null);
  }

  async function refreshManagedPreviewStatus(storedUrl: string) {
    if (!supportsElectronPreview || storedUrl) return;
    const result = await desktopInvoke<ManagedPreviewResult>("app_preview_status", {
      projectPath: props.project.path,
    })?.catch(() => null);
    if (result?.status === "running") {
      setManagedState("running");
      setManagedCommand(result.command ?? "");
      activatePreview(result.finalUrl || result.url);
    }
  }

  async function restoreRememberedPreview(storedUrl: string) {
    const normalized = normalizePreviewUrl(storedUrl);
    if (!normalized) {
      setDraftUrl("");
      setPreviewUrl("");
      setFrameStatus("idle");
      clearRenderedPreview();
      setAvailability("unavailable");
      setAvailabilityMessage("No preview running.");
      void refreshManagedPreviewStatus("");
      return;
    }

    if (supportsElectronPreview) {
      const status = await desktopInvoke<ManagedPreviewResult>("app_preview_status", {
        projectPath: props.project.path,
      })?.catch(() => null);
      if (status?.status === "running" && status.url) {
        setManagedCommand(status.command ?? "");
        activatePreview(status.finalUrl || status.url);
        return;
      }
    }

    if (previewUrlRememberedByOtherProject(storageKey, normalized)) {
      window.localStorage.removeItem(storageKey);
      setDraftUrl("");
      setPreviewUrl("");
      setCurrentRoute("");
      setFrameStatus("idle");
      clearRenderedPreview();
      setAvailability("unavailable");
      setAvailabilityMessage(
        "That remembered preview URL is also saved for another project. Run this project or use URL.",
      );
      setManagedState("stopped");
      setProposalSelectionStatus("unavailable");
      return;
    }

    void openPreview(normalized);
  }

  async function openPreview(url = draftUrl) {
    const normalized = normalizePreviewUrl(url);
    setDraftUrl(normalized);
    setMarking(false);
    setDraftMarkState(null);
    setPreviewChoices([]);
    if (!normalized) {
      window.localStorage.removeItem(storageKey);
      setPreviewUrl("");
      setCurrentRoute("");
      setFrameStatus("idle");
      clearRenderedPreview();
      setAvailability("idle");
      setAvailabilityMessage("Choose or enter a local preview URL.");
      setManagedState("stopped");
      await cleanupSelectedProposal("reset");
      return;
    }
    if (!supportsElectronPreview) {
      setAvailability("unavailable");
      setAvailabilityMessage(
        "Run Codex Local in Electron to use live app preview.",
      );
      return;
    }
    const requestId = probeRequestRef.current + 1;
    probeRequestRef.current = requestId;
    setAvailability("probing");
    setManagedState("starting");
    setAvailabilityMessage("Checking preview URL.");
    const result = await desktopInvoke<PreviewProbeResult>("app_preview_probe_url", {
      url: normalized,
      projectPath: props.project.path,
      excludeUrls: rememberedPreviewUrlsForOtherProjects(storageKey),
    })?.catch((error) => unavailableFromError(error));
    if (requestId !== probeRequestRef.current) return;
    if (result?.status === "available") {
      window.localStorage.setItem(storageKey, result.finalUrl || normalized);
      activatePreview(result.finalUrl || normalized);
      setShowUrlEntry(false);
      return;
    }
    setManagedState("failed");
    setAvailability("unavailable");
    setAvailabilityMessage(result?.reason || "The preview is not available.");
    setPreviewUrl("");
    setFrameStatus("idle");
    clearRenderedPreview();
    setProposalSelectionStatus("unavailable");
  }

  function activatePreview(url: string) {
    window.localStorage.setItem(storageKey, url);
    setPreviewUrl(url);
    setDraftUrl(url);
    setCurrentRoute(url);
    setFrameStatus("loading");
    setAvailability("available");
    setAvailabilityMessage("");
    setManagedState("running");
    setNeedsBaseline(false);
    setPreviewChoices([]);
    setProposalSelectionStatus("clean");
    setInteractionState("No temporary interaction recorded.");
    setFrameKey((current) => current + 1);
  }

  function reloadPreview() {
    setMarking(false);
    setDraftMarkState(null);
    setFrameStatus("loading");
    if (webview) {
      if (typeof webview.reloadIgnoringCache === "function") {
        webview.reloadIgnoringCache();
      } else {
        webview.reload();
      }
      return;
    }
    void openPreview(previewUrl || draftUrl);
  }

  async function openExternalPreview() {
    const url = previewUrl || safeDraftUrl;
    if (!url) return;
    await desktopInvoke("open_external_url", { url })?.catch(() => null);
  }

  function beginMark(event: PointerEvent<HTMLDivElement>) {
    if (!marking || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    setDraftMarkState({ startX, startY, currentX: startX, currentY: startY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateMark(event: PointerEvent<HTMLDivElement>) {
    const mark = draftMarkRef.current;
    if (!mark || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setDraftMarkState({
      ...mark,
      currentX: event.clientX - rect.left,
      currentY: event.clientY - rect.top,
    });
  }

  async function finishMark() {
    const mark = draftMarkRef.current;
    if (!mark || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const area = markFromDraft(mark, rect, markNote, routeForContext);
    if (area.width > 8 && area.height > 8) {
      const thumbnailDataUrl = await captureMarkThumbnail(area);
      props.onAreaMarkChange(area, {
        previewUrl,
        route: routeForContext,
        viewport,
        thumbnailDataUrl,
      });
    }
    setDraftMarkState(null);
    setMarking(false);
  }

  function beginHighlightAdjust(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
    highlight: ProposalHighlight,
    mode: HighlightDrag["mode"],
  ) {
    if (!stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPoint(event);
    if (!point) return;
    const stage = stageRef.current;
    setHighlightDrag({
      highlightId: highlight.id,
      label: highlight.label,
      mode,
      startX: point.x,
      startY: point.y,
      startMark: highlightAreaForStage(
        adjustedHighlightArea(highlight),
        stage.clientWidth,
        stage.clientHeight,
      ),
    });
  }

  function updateHighlightAdjust(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
  ) {
    if (!highlightDrag || !stageRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointerPoint(event);
    if (!point) return;
    const stage = stageRef.current;
    const deltaX = point.x - highlightDrag.startX;
    const deltaY = point.y - highlightDrag.startY;
    const next =
      highlightDrag.mode === "resize"
        ? {
            ...highlightDrag.startMark,
            width: clamp(
              highlightDrag.startMark.width + deltaX,
              24,
              Math.max(24, stage.clientWidth - highlightDrag.startMark.x),
            ),
            height: clamp(
              highlightDrag.startMark.height + deltaY,
              24,
              Math.max(24, stage.clientHeight - highlightDrag.startMark.y),
            ),
            createdAt: Date.now(),
          }
        : {
            ...highlightDrag.startMark,
            x: clamp(
              highlightDrag.startMark.x + deltaX,
              0,
              Math.max(0, stage.clientWidth - highlightDrag.startMark.width),
            ),
            y: clamp(
              highlightDrag.startMark.y + deltaY,
              0,
              Math.max(0, stage.clientHeight - highlightDrag.startMark.height),
            ),
            createdAt: Date.now(),
          };
    const key = highlightKey(
      selectedVariant?.id ?? "preview",
      highlightDrag.highlightId,
      viewport,
    );
    highlightAdjustmentsRef.current = {
      ...highlightAdjustmentsRef.current,
      [key]: next,
    };
    setHighlightAdjustments(highlightAdjustmentsRef.current);
  }

  async function finishHighlightAdjust(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
  ) {
    if (!highlightDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const adjusted =
      highlightAdjustmentsRef.current[
        highlightKey(selectedVariant?.id ?? "preview", highlightDrag.highlightId, viewport)
      ] ?? highlightDrag.startMark;
    const moved = !sameAreaMark(adjusted, highlightDrag.startMark);
    const label = highlightDrag.label;
    const highlightId = highlightDrag.highlightId;
    const highlight = selectedHighlights.find(
      (candidate) => candidate.id === highlightId,
    );
    setHighlightDrag(null);
    if (!moved) return;
    const areaMark = {
      ...adjusted,
      route: adjusted.route ?? routeForContext,
      note: adjusted.note || label,
    };
    props.onAreaMarkChange(areaMark, {
      previewUrl,
      route: routeForContext,
      viewport,
      label,
      source: "proposalHighlight",
      highlightId,
      threadId: highlight?.threadId ?? props.proposal?.threadId ?? null,
      proposalTurnId: highlight?.proposalTurnId ?? props.proposal?.turnId,
      proposalOptionId: highlight?.proposalOptionId ?? selectedVariant?.id,
      canvasLane: highlight?.canvasLane ?? selectedVariant?.id,
      canvasId: highlight?.canvasId,
      sourceFile: highlight?.sourceFile,
      componentName: highlight?.componentName,
      screenshotRef: highlight?.screenshotRef,
      targetResolutionKind: highlight?.targetResolutionKind,
      targetResolutionConfidence: highlight?.targetResolutionConfidence,
    });
    const thumbnailDataUrl = await captureMarkThumbnail(areaMark);
    if (thumbnailDataUrl) {
      props.onAreaMarkChange(areaMark, {
        previewUrl,
        route: routeForContext,
        viewport,
        label,
        source: "proposalHighlight",
        highlightId,
        thumbnailDataUrl,
        threadId: highlight?.threadId ?? props.proposal?.threadId ?? null,
        proposalTurnId: highlight?.proposalTurnId ?? props.proposal?.turnId,
        proposalOptionId: highlight?.proposalOptionId ?? selectedVariant?.id,
        canvasLane: highlight?.canvasLane ?? selectedVariant?.id,
        canvasId: highlight?.canvasId,
        sourceFile: highlight?.sourceFile,
        componentName: highlight?.componentName,
        screenshotRef: highlight?.screenshotRef,
        targetResolutionKind: highlight?.targetResolutionKind,
        targetResolutionConfidence: highlight?.targetResolutionConfidence,
      });
    }
  }

  function pointerPoint(event: PointerEvent<HTMLElement>) {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
    };
  }

  function beginLaneDrag(
    event: DragEvent<HTMLButtonElement>,
    laneId: string,
  ) {
    if (!props.onLaneTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-codex-canvas-lane", laneId);
    event.dataTransfer.setData("text/plain", laneId);
  }

  function allowLaneDrop(event: DragEvent<HTMLButtonElement>) {
    if (!props.onLaneTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function finishLaneDrop(
    event: DragEvent<HTMLButtonElement>,
    laneId: string,
  ) {
    if (!props.onLaneTransfer) return;
    const source =
      event.dataTransfer.getData("application/x-codex-canvas-lane") ||
      event.dataTransfer.getData("text/plain");
    if (!source || source === laneId) return;
    event.preventDefault();
    setPendingLaneTransfer({ from: source, to: laneId });
  }

  function confirmLaneTransfer() {
    if (!pendingLaneTransfer) return;
    props.onLaneTransfer?.(pendingLaneTransfer.from, pendingLaneTransfer.to);
    setPendingLaneTransfer(null);
  }

  function adjustedHighlightArea(highlight: ProposalHighlight) {
    const adjustedContext = adjustedHighlightContexts.find(
      (context) => context.highlightId === highlight.id,
    );
    if (adjustedContext) return adjustedContext.areaMark;
    return (
      highlightAdjustments[
        highlightKey(selectedVariant?.id ?? "preview", highlight.id, viewport)
      ] ?? highlight.areaMark
    );
  }

  function setDraftMarkState(value: DraftMark | null) {
    draftMarkRef.current = value;
    setDraftMark(value);
  }

  async function captureMarkThumbnail(area: PlanPreviewAreaMark) {
    if (!webview || typeof webview.capturePage !== "function") return undefined;
    try {
      const image = await webview.capturePage();
      const dataUrl = image?.toDataURL?.();
      if (!dataUrl) return undefined;
      return await cropMarkThumbnail(dataUrl, area);
    } catch {
      return undefined;
    }
  }

  function setViewport(nextViewport: "desktop" | "mobile") {
    if (!props.viewport) {
      setUncontrolledViewport(nextViewport);
    }
    props.onViewportChange?.(nextViewport);
  }

  function saveMarkNote(value: string) {
    setMarkNote(value);
    if (!mark) return;
    props.onAreaMarkChange(
      { ...mark, note: value, route: mark.route ?? routeForContext },
      { previewUrl, route: routeForContext, viewport },
    );
  }

  async function refreshRoute(target = webview) {
    if (!target) return;
    try {
      const route =
        (await target.executeJavaScript<string>("window.location.href", false)) ||
        target.getURL();
      if (route) setCurrentRoute(route);
    } catch {
      const route = target.getURL();
      if (route) setCurrentRoute(route);
    }
  }

  async function cleanupSelectedProposal(status: "clean" | "reset") {
    if (!webview) {
      setProposalSelectionStatus(status);
      return;
    }
    const target = webview;
    const generation = proposalSelectionGenerationRef.current + 1;
    proposalSelectionGenerationRef.current = generation;
    setProposalSelectionStatus("cleaning");
    setVisualPatchHighlights([]);
    setProposalStaleness(freshCanvasProposalStaleness);
    try {
      await target.executeJavaScript(cleanupScript(), false);
      if (generation !== proposalSelectionGenerationRef.current) return;
      setProposalSelectionStatus(status);
    } catch {
      if (generation !== proposalSelectionGenerationRef.current) return;
      setProposalSelectionStatus("failed");
    }
  }

  async function selectProposalVariant(variant: PlanPreviewVariant) {
    if (!webview) return;
    const target = webview;
    const generation = proposalSelectionGenerationRef.current + 1;
    proposalSelectionGenerationRef.current = generation;
    setProposalSelectionStatus("cleaning");
    try {
      await target.executeJavaScript(cleanupScript(), false);
    } catch {
      if (generation !== proposalSelectionGenerationRef.current) return;
      setProposalSelectionStatus("failed");
      setInteractionState("Temporary proposal cleanup failed.");
      return;
    }
    if (generation !== proposalSelectionGenerationRef.current) return;
    setProposalSelectionStatus("selecting");
    setInteractionState("Selecting proposal.");
    const visualPatchBundle = visualPatchBundleForVariant(variant);
    try {
      const result = await target.executeJavaScript<{
        ok: boolean;
        route: string;
      }>(proposalMetadataScript(variant), false);
      if (generation !== proposalSelectionGenerationRef.current) return;
      const livePatchNeedsBacking = liveDomPatchRequiresBacking(
        props.proposal?.proposalBacking,
        props.proposal?.buildStrategy,
      );
      let targetMetadata: CanvasTargetMetadataResult | null = null;
      if (visualPatchBundle) {
        targetMetadata = await collectCanvasTargetMetadata(target, variant);
        if (generation !== proposalSelectionGenerationRef.current) return;
      }
      const staleness = evaluateLiveDomPatchStaleness({
        proposalProjectId: props.proposal?.projectId,
        currentProjectId: props.project.id,
        proposalBacking: props.proposal?.proposalBacking,
        buildStrategy: props.proposal?.buildStrategy,
        variant,
        bundle: visualPatchBundle,
        baselineSession: props.proposal?.previewBaselineSession ?? null,
        currentSession: props.proposal?.previewSession ?? null,
        currentPreviewUrl: previewUrl || safeDraftUrl,
        currentRoute: result.route || currentRoute || previewUrl || safeDraftUrl,
        currentViewport: viewport,
        targetMetadata,
      });
      if (staleness.stale) {
        setProposalStaleness(staleness);
        setVisualPatchHighlights([]);
        setProposalSelectionStatus("failed");
        setInteractionState(staleness.message);
        return;
      }
      if (livePatchNeedsBacking) {
        setProposalStaleness(freshCanvasProposalStaleness);
      }
      if (visualPatchBundle) {
        try {
          const patchResult = await target.executeJavaScript<{
            ok: boolean;
            status: string;
            results?: Array<{ status: string; canvasId?: string }>;
            activeCount: number;
          }>(buildVisualPatchApplyScript(visualPatchBundle), false);
          if (generation !== proposalSelectionGenerationRef.current) return;
          if (!patchResult.ok) {
            try {
              await target.executeJavaScript(
                buildVisualPatchClearScript(visualPatchBundle.id),
                false,
              );
            } catch {
              // Best-effort cleanup before reporting the selection failure.
          }
          if (generation !== proposalSelectionGenerationRef.current) return;
          reloadPreviewAfterFailedHotSwap(target);
          setFrameStatus("loading");
          setProposalSelectionStatus("failed");
            setInteractionState("Proposal targets were unavailable.");
            return;
          }
          const patchHighlights = await collectVisualPatchHighlights(
            target,
            variant,
            visualPatchBundle,
            result.route || currentRoute || previewUrl,
            targetMetadata,
          );
          if (generation !== proposalSelectionGenerationRef.current) return;
          setVisualPatchHighlights(patchHighlights);
        } catch {
          if (generation !== proposalSelectionGenerationRef.current) return;
          reloadPreviewAfterFailedHotSwap(target);
          setFrameStatus("loading");
          setProposalSelectionStatus("failed");
        setInteractionState("Proposal runtime was unavailable.");
          return;
        }
      } else {
        setVisualPatchHighlights([]);
      }
      setCurrentRoute(result.route || currentRoute || previewUrl);
      setProposalSelectionStatus(result.ok ? "selected" : "failed");
      setInteractionState("Proposal selected. Use Show changes to inspect agent marks.");
    } catch {
      if (generation !== proposalSelectionGenerationRef.current) return;
      setProposalSelectionStatus("failed");
      setInteractionState("Proposal preview metadata was unavailable.");
    }
  }

  async function collectVisualPatchHighlights(
    target: ElectronWebviewElement,
    variant: PlanPreviewVariant,
    bundle: VisualPatchBundle,
    route: string,
    targetMetadata?: CanvasTargetMetadataResult | null,
  ) {
    const metadata =
      targetMetadata ?? (await collectCanvasTargetMetadata(target, variant));
    if (!metadata.ok) return [];
    return proposalHighlightsForVisualPatchTargets({
      bundle,
      targetMetadata: metadata,
      variantId: variant.id,
      route,
      createdAt: Date.now(),
      referenceMeta: {
        threadId: props.proposal?.threadId ?? null,
        proposalTurnId: props.proposal?.turnId,
        proposalOptionId: variant.id,
        canvasLane: variant.id,
      },
    });
  }

  async function collectCanvasTargetMetadata(
    target: ElectronWebviewElement,
    variant: PlanPreviewVariant,
  ) {
    const screenshotRef = [
      "app-preview",
      props.project.id,
      props.proposal?.turnId ?? "proposal",
      variant.id,
      "targets",
    ].join(":");
    return target.executeJavaScript<CanvasTargetMetadataResult>(
      buildCanvasTargetMetadataScript({ screenshotRef, maxTargets: 200 }),
      false,
    );
  }

  const canShowWebview =
    supportsElectronPreview && availability === "available" && previewUrl;
  const holdPreviewDuringLoad = Boolean(
    canShowWebview && frameStatus === "loading" && heldPreviewSnapshot,
  );
  const showPreviewLoadingOverlay = Boolean(
    canShowWebview &&
      frameStatus !== "loaded" &&
      (frameStatus === "failed" || !hasRenderedPreview),
  );
  const previewLoadingTitle =
    frameStatus === "failed" ? "Preview failed to load" : "Loading preview";
  const routeLabel = routeForContext
    ? routeForContext.replace(/^https?:\/\//i, "")
    : "No route";
  const showRouteLabel =
    Boolean(routeForContext) && !samePreviewLocation(routeForContext, previewUrl);
  const chromeState = canShowWebview
    ? "running"
    : managedState === "starting" || availability === "probing"
      ? "starting"
      : needsBaseline
        ? "blank"
        : managedState === "failed"
          ? "failed"
          : "stopped";
  const originLabel = previewUrl
    ? previewOriginLabel(previewUrl)
    : safeDraftUrl
      ? previewOriginLabel(safeDraftUrl)
      : "";
  const liveTitle = "Live";
  const liveStatus =
    props.statusLabel ??
    (chromeState === "running" ? "Live app" : "Preview controls");

  useEffect(() => {
    if (chromeState !== "running") {
      setMoreMenuOpen(false);
    }
  }, [chromeState]);

  const {
    density: toolbarDensity,
    toolbarRef,
    toolbarWidth,
  } = usePreviewToolbarDensity({
    collapsedMax: 740,
    compactMax: 1080,
    balancedMax: 1360,
  });
  const proposalLaneActive = Boolean(proposalControls) && proposalVisible;
  const liveLaneActive = !proposalLaneActive;
  const overflowOpenAction = proposalLaneActive
    ? toolbarWidth < 850
    : toolbarWidth < 460;
  const overflowStopAction = liveLaneActive
    ? toolbarWidth < 420
    : toolbarWidth < 680;
  const overflowReloadAction = liveLaneActive
    ? toolbarWidth < 380
    : toolbarWidth < 620;
  const showTabSelect = toolbarWidth < (proposalLaneActive ? 430 : 440);
  const overflowMarkAction = proposalLaneActive
    ? false
    : toolbarWidth < 340;
  const compressedLabels =
    toolbarDensity === "compact" || toolbarDensity === "collapsed";
  const runningPreview = chromeState === "running";
  const canMarkArea = runningPreview || proposalLaneActive;
  const stoppedPreview =
    chromeState === "stopped" ||
    chromeState === "failed" ||
    chromeState === "blank";
  const startPreviewLabel =
    chromeState === "failed"
      ? compressedLabels
        ? "Retry"
        : "Retry preview"
      : compressedLabels
        ? "Preview"
        : "Live Preview";
  const detectPreviewLabel = compressedLabels ? "Detect" : "Detect existing";
  const useUrlLabel = compressedLabels ? "URL" : "Use URL";
  const reloadLabel = "Reload";
  const markActionLabel = "Mark area";
  const showLiveActionIconOnly = liveLaneActive && toolbarWidth < 640;
  const showChangesIconOnly = proposalLaneActive && toolbarWidth < 820;
  const showMarkIconOnly =
    (proposalLaneActive && toolbarWidth < 760) || showLiveActionIconOnly;
  const showReloadIconOnly = showLiveActionIconOnly;
  const showStopIconOnly = showLiveActionIconOnly;
  const showOpenIconOnly = showLiveActionIconOnly;
  const showBuildIconOnly = proposalLaneActive && toolbarWidth < 620;
  const overflowBuildAction = proposalLaneActive && toolbarWidth < 450;
  const hasSecondaryAction = Boolean(proposalControls?.onSecondary);
  const showSecondaryIconOnly = proposalLaneActive && toolbarWidth < 720;
  const overflowSecondaryAction =
    proposalLaneActive && hasSecondaryAction && toolbarWidth < 540;
  const overflowChangesAction = proposalLaneActive
    ? false
    : toolbarWidth < 680;
  const showChangesInline =
    proposalLaneActive &&
    selectedHighlights.length > 0 &&
    !overflowChangesAction;
  const showChangesInMenu =
    proposalLaneActive &&
    selectedHighlights.length > 0 &&
    overflowChangesAction;
  const showReloadInline =
    runningPreview && liveLaneActive && !overflowReloadAction;
  const showReloadInMenu =
    runningPreview && liveLaneActive && overflowReloadAction;
  const showStopInline =
    runningPreview && liveLaneActive && !overflowStopAction;
  const showStopInMenu =
    runningPreview && liveLaneActive && overflowStopAction;
  const showOpenInline =
    runningPreview && liveLaneActive && !overflowOpenAction;
  const showOpenInMenu =
    runningPreview && liveLaneActive && !showOpenInline;
  const showDetectInline = stoppedPreview && liveLaneActive;
  const showUseUrlInline = stoppedPreview && liveLaneActive;
  const showRunInline = stoppedPreview && liveLaneActive;
  const showStartingInline = chromeState === "starting";
  const showMarkInline = canMarkArea && !overflowMarkAction;
  const showMarkInMenu = canMarkArea && overflowMarkAction;
  const showBuildInline = proposalLaneActive && !overflowBuildAction;
  const showBuildInMenu = proposalLaneActive && overflowBuildAction;
  const showSecondaryInline =
    proposalLaneActive && hasSecondaryAction && !overflowSecondaryAction;
  const showSecondaryInMenu =
    proposalLaneActive && hasSecondaryAction && overflowSecondaryAction;
  const proposalBuildDisabled = Boolean(
    proposalControls?.buildDisabled || proposalStaleness.stale,
  );
  const proposalBuildTitle = proposalStaleness.stale
    ? staleProposalBuildMessage(proposalStaleness)
    : proposalControls?.buildTitle || "Build the selected proposal into Live";
  const showChangeUrlInMenu =
    runningPreview &&
    liveLaneActive &&
    (showMarkInMenu ||
      showReloadInMenu ||
      showStopInMenu ||
      showOpenInMenu);
  const showMoreMenu =
    showChangesInMenu ||
    showMarkInMenu ||
    showBuildInMenu ||
    showSecondaryInMenu ||
    showReloadInMenu ||
    showStopInMenu ||
    showOpenInMenu ||
    showChangeUrlInMenu;
  const showOriginChip =
    runningPreview &&
    liveLaneActive &&
    Boolean(originLabel) &&
    (toolbarDensity === "full" || toolbarDensity === "balanced");
  const showRouteChip =
    runningPreview &&
    liveLaneActive &&
    Boolean(showRouteLabel) &&
    toolbarDensity === "full";
  const showStateChip = runningPreview && liveLaneActive;
  const compareTabOptions =
    props.compareTabOptions ??
    (variants.length > 0
      ? [
          {
            id: "live",
            label: "Live",
            title: "Current live app",
            active: !proposalVisible,
            onSelect: () => {
              setInteractionState("Viewing the current live app.");
              setProposalVisible(false);
            },
          },
          ...variants.map((variant) => ({
            id: variant.id,
            label: variantTabLabel(variant.id, variants.length),
            title: `${variant.title}: ${variant.tradeoff}`,
            active:
              proposalVisible && variant.id === selectedVariant?.id,
            onSelect: () => {
              setInteractionState("Switching temporary preview option.");
              setProposalVisible(true);
              props.onVariantChange?.(variant.id);
            },
          })),
        ]
      : []);

  useEffect(() => {
    if (!showMoreMenu) {
      setMoreMenuOpen(false);
    }
  }, [showMoreMenu]);
  const liveLaneOption =
    compareTabOptions.find((option) => option.id === "live") ??
    (compareTabOptions.length === 0
      ? {
          id: "live",
          label: "Live",
          title: "Current live app",
          active: true,
          onSelect: () => undefined,
        }
      : null);
  const proposalLaneOptions = compareTabOptions.filter(
    (option) => option.id !== "live",
  );
  const hasProposalLanes = proposalLaneOptions.length > 0;
  const laneIsUpdating = frameStatus === "loading" || chromeState === "starting";
  const liveLaneTabs = liveLaneOption
    ? renderLaneTabs([liveLaneOption], "Live lane")
    : null;
  const proposalLaneTabs =
    hasProposalLanes
      ? showTabSelect ? (
          <PreviewToolbarSelect
            ariaLabel="Proposal lanes"
            className="preview-toolbar-tab-select canvas-lane-select"
            options={proposalLaneOptions}
          />
        ) : (
          renderLaneTabs(proposalLaneOptions, "Proposal lanes")
        )
      : null;
  const viewportControl = runningPreview ? (
    <div
      className="preview-segmented preview-viewport canvas-floating-viewport"
      aria-label="Viewport"
    >
      <button
        aria-label="Desktop viewport"
        className={viewport === "desktop" ? "active" : ""}
        onClick={() => setViewport("desktop")}
        title="Desktop viewport"
        type="button"
      >
        <Monitor size={14} />
      </button>
      <button
        aria-label="Mobile viewport"
        className={viewport === "mobile" ? "active" : ""}
        onClick={() => setViewport("mobile")}
        title="Mobile viewport"
        type="button"
      >
        <Smartphone size={14} />
      </button>
    </div>
  ) : null;

  function renderLaneTabs(
    options: PreviewToolbarSelectOption[],
    ariaLabel: string,
  ) {
    return (
      <div
        className="preview-segmented live-preview-options canvas-lane-tabs"
        aria-label={ariaLabel}
      >
        {options.map((option) => (
          <button
            aria-current={option.active ? "true" : undefined}
            className={option.active ? "active" : ""}
            draggable={Boolean(props.onLaneTransfer)}
            key={option.id}
            onClick={option.onSelect}
            onDragOver={allowLaneDrop}
            onDragStart={(event) => beginLaneDrag(event, option.id)}
            onDrop={(event) => finishLaneDrop(event, option.id)}
            title={option.title || option.label}
            type="button"
          >
            {option.label}
            <span
              aria-hidden="true"
              className={`canvas-lane-dot ${
                option.active && laneIsUpdating ? "updating" : ""
              }`}
            />
          </button>
        ))}
      </div>
    );
  }

  function renderToolbarActions() {
    if (showUrlEntry) {
      return (
        <>
          <input
            aria-label="Preview URL"
            autoFocus
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void openPreview();
              if (event.key === "Escape") setShowUrlEntry(false);
            }}
            placeholder="Local preview URL"
            value={draftUrl}
          />
          <button
            className="ghost-button primary"
            onClick={() => void openPreview()}
            type="button"
          >
            <ExternalLink size={15} /> Open
          </button>
          <button
            className="ghost-button"
            onClick={() => setShowUrlEntry(false)}
            type="button"
          >
            Cancel
          </button>
        </>
      );
    }

    return (
      <>
        {showChangesInline && (
          <button
            className={[
              "ghost-button",
              showProposalHighlights ? "active" : "",
              showChangesIconOnly ? "icon-only" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setShowProposalHighlights((current) => !current)}
            title={
              showProposalHighlights
                ? "Hide proposed changes"
                : "Show proposed changes"
            }
            type="button"
          >
            {showProposalHighlights ? <EyeOff size={15} /> : <Eye size={15} />}
            {!showChangesIconOnly &&
              (proposalLaneActive
                ? "Changes"
                : showProposalHighlights
                  ? "Hide changes"
                  : "Show changes")}
          </button>
        )}
        {showMarkInline && (
          <button
            aria-label={markActionLabel}
            className={[
              "ghost-button",
              marking ? "active" : "",
              showMarkIconOnly ? "icon-only" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              if (!canMarkArea) return;
              setMarking((current) => {
                const next = !current;
                if (next) setMarkNote("");
                return next;
              });
              setDraftMarkState(null);
            }}
            title="Mark an area in this preview"
            type="button"
          >
            <MousePointer2 size={15} />
            {!showMarkIconOnly && markActionLabel}
          </button>
        )}
        {proposalControls && showBuildInline && (
          <button
            aria-label={proposalControls.buildLabel}
            className={`ghost-button primary ${
              showBuildIconOnly ? "icon-only" : ""
            }`.trim()}
            disabled={proposalBuildDisabled}
            onClick={proposalControls.onBuild}
            title={proposalBuildTitle}
            type="button"
          >
            <Hammer size={15} />
            {!showBuildIconOnly && proposalControls.buildLabel}
          </button>
        )}
        {proposalControls?.onSecondary && showSecondaryInline && (
          <button
            aria-label={proposalControls.secondaryLabel ?? "Discard"}
            className={[
              "ghost-button",
              proposalControls.secondaryDanger ? "danger" : "",
              showSecondaryIconOnly ? "icon-only" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={proposalControls.onSecondary}
            title={proposalControls.secondaryTitle ?? "Discard"}
            type="button"
          >
            <X size={15} />
            {!showSecondaryIconOnly &&
              (proposalControls.secondaryLabel ?? "Discard")}
          </button>
        )}
        {runningPreview && showReloadInline && (
          <button
            aria-label={reloadLabel}
            className={`ghost-button ${showReloadIconOnly ? "icon-only" : ""}`.trim()}
            onClick={reloadPreview}
            title="Reload preview"
            type="button"
          >
            <RefreshCw size={15} />
            {!showReloadIconOnly && reloadLabel}
          </button>
        )}
        {runningPreview && showStopInline && (
          <button
            aria-label="Stop"
            className={`ghost-button danger ${
              showStopIconOnly ? "icon-only" : ""
            }`.trim()}
            onClick={() => void stopPreview()}
            title="Stop preview"
            type="button"
          >
            <Square size={14} />
            {!showStopIconOnly && "Stop"}
          </button>
        )}
        {runningPreview && showOpenInline && (
          <button
            aria-label="Open"
            className={`ghost-button ${showOpenIconOnly ? "icon-only" : ""}`.trim()}
            onClick={() => void openExternalPreview()}
            title="Open preview"
            type="button"
          >
            <ExternalLink size={15} />
            {!showOpenIconOnly && "Open"}
          </button>
        )}
        {showStartingInline && (
          <>
            <button className="ghost-button primary" disabled type="button">
              <RefreshCw className="spin" size={15} /> Starting
            </button>
            <button
              className="ghost-button"
              onClick={() => void stopPreview()}
              type="button"
            >
              Cancel
            </button>
          </>
        )}
        {stoppedPreview && showRunInline && (
          <>
            <button
              className="ghost-button primary"
              onClick={() => void runPreview()}
              type="button"
            >
              <Play size={15} /> {startPreviewLabel}
            </button>
            {showDetectInline && (
              <button
                className="ghost-button"
                onClick={() => void discoverPreviewUrl()}
                type="button"
              >
                <Search size={15} /> {detectPreviewLabel}
              </button>
            )}
            {showUseUrlInline && (
              <button
                className="ghost-button"
                onClick={() => setShowUrlEntry(true)}
                type="button"
              >
                {useUrlLabel}
              </button>
            )}
          </>
        )}
        {showMoreMenu && (
          <div className="live-preview-more" ref={moreMenuRef}>
            <button
              aria-expanded={moreMenuOpen}
              aria-label="Preview options"
              className="more-actions-button"
              onClick={() => setMoreMenuOpen((current) => !current)}
              title="Preview options"
              type="button"
            >
              <MoreHorizontal size={16} />
            </button>
            {moreMenuOpen && (
              <div className="more-actions-menu">
                {showMarkInMenu && (
                  <button
                    onClick={() => {
                      if (!canMarkArea) return;
                      setMarking((current) => {
                        const next = !current;
                        if (next) setMarkNote("");
                        return next;
                      });
                      setDraftMarkState(null);
                      setMoreMenuOpen(false);
                    }}
                    type="button"
                  >
                    <MousePointer2 size={15} />
                    {marking ? "Stop marking" : "Mark area"}
                  </button>
                )}
                {showChangesInMenu && (
                  <button
                    onClick={() => {
                      setShowProposalHighlights((current) => !current);
                      setMoreMenuOpen(false);
                    }}
                    type="button"
                  >
                    {showProposalHighlights ? (
                      <EyeOff size={15} />
                    ) : (
                      <Eye size={15} />
                    )}
                    {showProposalHighlights ? "Hide changes" : "Show changes"}
                  </button>
                )}
                {proposalControls && showBuildInMenu && (
                  <button
                    disabled={proposalBuildDisabled}
                    onClick={() => {
                      if (proposalBuildDisabled) return;
                      setMoreMenuOpen(false);
                      proposalControls.onBuild();
                    }}
                    title={proposalBuildTitle}
                    type="button"
                  >
                    <Hammer size={15} />
                    {proposalControls.buildLabel}
                  </button>
                )}
                {proposalControls?.onSecondary && showSecondaryInMenu && (
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      proposalControls.onSecondary?.();
                    }}
                    title={proposalControls.secondaryTitle ?? "Discard"}
                    type="button"
                  >
                    <X size={15} />
                    {proposalControls.secondaryLabel ?? "Discard"}
                  </button>
                )}
                {showReloadInMenu && (
                  <button
                    onClick={() => {
                      reloadPreview();
                      setMoreMenuOpen(false);
                    }}
                    type="button"
                  >
                    <RefreshCw size={15} /> Reload
                  </button>
                )}
                {showStopInMenu && (
                  <button
                    onClick={() => {
                      void stopPreview();
                      setMoreMenuOpen(false);
                    }}
                    type="button"
                  >
                    <Square size={14} /> Stop
                  </button>
                )}
                {showOpenInMenu && (
                  <button
                    onClick={() => {
                      void openExternalPreview();
                      setMoreMenuOpen(false);
                    }}
                    type="button"
                  >
                    <ExternalLink size={15} /> Open
                  </button>
                )}
                {showChangeUrlInMenu && (
                  <button
                    onClick={() => {
                      setShowUrlEntry(true);
                      setMoreMenuOpen(false);
                    }}
                    type="button"
                  >
                    <ExternalLink size={15} /> Change URL
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="live-preview-panel">
      <header
        className={`preview-toolbar live-preview-toolbar canvas-lane-toolbar ${chromeState}`}
        data-density={toolbarDensity}
        data-proposal-toolbar={proposalToolbar ? "true" : undefined}
        ref={toolbarRef}
      >
        {liveLaneTabs && (
          <div
            className={`canvas-lane-row live ${liveLaneActive ? "active" : ""}`}
          >
            <div className="preview-toolbar-left">
              <div className="preview-title-row">
                <strong>{liveTitle}</strong>
                <span>{liveStatus}</span>
              </div>
              <div className={`preview-chip-row ${chromeState}`}>
                {runningPreview ? (
                  <>
                    {showOriginChip && (
                      <span className="live-preview-route" title={previewUrl}>
                        {originLabel}
                      </span>
                    )}
                    {showRouteChip && (
                      <span className="live-preview-route" title={routeForContext}>
                        {routeLabel}
                      </span>
                    )}
                    {showStateChip && (
                      <span
                        className={`live-preview-state ${cleanupStatusForSession(
                          proposalSelectionStatus,
                          availability,
                        )}`}
                      >
                        {statusLabel(
                          availability,
                          frameStatus,
                          proposalSelectionStatus,
                        )}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="live-preview-state-message">
                    {chromeState === "starting"
                      ? `Starting ${managedCommand || "preview"}`
                      : chromeState === "blank"
                        ? "No app to preview yet"
                        : chromeState === "failed"
                          ? `Preview did not start: ${availabilityMessage}`
                          : "No preview running"}
                  </span>
                )}
              </div>
            </div>
            <div className="preview-toolbar-tabs">{liveLaneTabs}</div>
            {liveLaneActive && (
              <div className={`preview-actions live-preview-controls ${chromeState}`}>
                {renderToolbarActions()}
              </div>
            )}
          </div>
        )}
        {proposalLaneTabs && (
          <div
            className={`canvas-lane-row proposals ${
              proposalLaneActive ? "active" : ""
            }`}
          >
            <div className="preview-toolbar-left">
              <div className="preview-title-row">
                <strong>{props.proposalLaneTitle ?? "Proposals"}</strong>
                <span>
                  {props.proposalLaneStatus ??
                    (proposalLaneActive ? "Selected" : "Available")}
                </span>
              </div>
              <div className="preview-chip-row">
                {selectedVariant?.title && (
                  <span title={selectedVariant.title}>{selectedVariant.title}</span>
                )}
                {proposalStaleness.stale && (
                  <span
                    className="live-preview-state failed"
                    title={proposalStaleness.message}
                  >
                    {proposalStaleness.label}
                  </span>
                )}
              </div>
            </div>
            <div className="preview-toolbar-tabs">{proposalLaneTabs}</div>
            {proposalLaneActive && (
              <div className={`preview-actions live-preview-controls ${chromeState}`}>
                {renderToolbarActions()}
              </div>
            )}
          </div>
        )}
        {pendingLaneTransfer && (
          <div className="canvas-lane-transfer-popover" role="dialog">
            <span>
              {laneTransferPrompt(
                pendingLaneTransfer.from,
                pendingLaneTransfer.to,
              )}
            </span>
            <button className="ghost-button primary" onClick={confirmLaneTransfer} type="button">
              Confirm
            </button>
            <button
              className="ghost-button"
              onClick={() => setPendingLaneTransfer(null)}
              type="button"
            >
              Cancel
            </button>
          </div>
        )}
      </header>

      {previewChoices.length > 0 && !canShowWebview && (
        <div className="live-preview-choices" aria-label="Found previews">
          {previewChoices.map((choice) => (
            <button
              key={choice.finalUrl || choice.url}
              onClick={() => {
                activatePreview(choice.finalUrl || choice.url);
                setPreviewChoices([]);
              }}
              type="button"
            >
              <strong>{choice.title || previewOriginLabel(choice.finalUrl || choice.url)}</strong>
              <span>{previewOriginLabel(choice.finalUrl || choice.url)}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className={[
          "live-preview-stage",
          viewport,
          marking ? "marking" : "",
          holdPreviewDuringLoad ? "holding-preview" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={stageRef}
      >
        {viewportControl}
        {canShowWebview ? (
          <webview
            data-testid="electron-app-preview-webview"
            key={`${props.project.id}:${frameKey}`}
            partition={`persist:codex-app-preview-${props.project.id}`}
            ref={captureWebview}
            src={previewUrl}
          />
        ) : (
          <PreviewUnavailable
            message={availabilityMessage}
            probing={availability === "probing"}
            supportsElectronPreview={supportsElectronPreview}
            title={
              chromeState === "blank"
                ? "No app to preview yet"
                : chromeState === "stopped"
                  ? "No preview running"
                  : chromeState === "starting"
                    ? "Starting preview"
                    : undefined
            }
          />
        )}
        {holdPreviewDuringLoad && (
          <img
            alt=""
            aria-hidden="true"
            className="live-preview-snapshot"
            src={heldPreviewSnapshot}
          />
        )}
        {showPreviewLoadingOverlay && (
          <div className="live-preview-loading">
            <strong>{previewLoadingTitle}</strong>
            <span>{previewUrl}</span>
          </div>
        )}
        {marking && canShowWebview && (
          <div
            className="live-preview-mark-capture"
            onPointerDown={beginMark}
            onPointerMove={updateMark}
            onPointerUp={() => {
              void finishMark();
            }}
          />
        )}
        {showProposalHighlights &&
          selectedHighlights.map((highlight) => (
            <div
              className="live-preview-mark proposal-highlight"
              key={`${selectedVariant?.id ?? "preview"}:${highlight.id}`}
              onPointerDown={(event) =>
                beginHighlightAdjust(event, highlight, "move")
              }
              onPointerMove={updateHighlightAdjust}
              onPointerUp={(event) => {
                void finishHighlightAdjust(event);
              }}
              style={markStyle(adjustedHighlightArea(highlight))}
              title={highlight.note || highlight.label}
            >
              <span>{highlight.label}</span>
              <button
                aria-label={`Resize ${highlight.label}`}
                className="live-preview-highlight-handle"
                onPointerDown={(event) =>
                  beginHighlightAdjust(event, highlight, "resize")
                }
                onPointerMove={updateHighlightAdjust}
                onPointerUp={(event) => {
                  void finishHighlightAdjust(event);
                }}
                type="button"
              />
            </div>
          ))}
        {renderedMarks.map((renderedMark) => (
          <div
            className="live-preview-mark"
            key={renderedMark.id}
            style={markStyle(renderedMark.areaMark)}
          >
            <span>{renderedMark.label}</span>
          </div>
        ))}
        {draftMark && (
          <div className="live-preview-mark draft" style={draftMarkStyle(draftMark)} />
        )}
      </div>

      {(mark || marking) && (
        <label className="live-preview-mark-note">
          <span>
            {activeRenderedMark
              ? `${activeRenderedMark.label} note`
              : "Draw an area, then add a note"}
          </span>
          <textarea
            onChange={(event) => saveMarkNote(event.target.value)}
            placeholder="Example: put the action closer to the message composer"
            rows={2}
            value={markNote}
          />
        </label>
      )}
    </div>
  );
}

function PreviewUnavailable(props: {
  message: string;
  probing: boolean;
  supportsElectronPreview: boolean;
  title?: string;
}) {
  const title =
    props.title ??
    (props.probing
      ? "Finding preview"
      : props.supportsElectronPreview
        ? "Preview unavailable"
        : "Electron preview unavailable");
  return (
    <div className="live-preview-empty">
      <strong>{title}</strong>
      <span>
        {props.message ||
          (props.supportsElectronPreview
            ? "Start the app and choose its local URL."
            : "Open this workspace in the Electron desktop app.")}
      </span>
    </div>
  );
}

function normalizePreviewUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function rememberedPreviewUrlsForOtherProjects(activeStorageKey: string) {
  const urls = new Set<string>();
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("codex.preview.url.") || key === activeStorageKey) {
      continue;
    }
    const value = window.localStorage.getItem(key);
    const normalized = normalizePreviewUrl(value ?? "");
    if (normalized) urls.add(normalized);
  }
  return Array.from(urls);
}

function previewUrlRememberedByOtherProject(
  activeStorageKey: string,
  previewUrl: string,
) {
  return rememberedPreviewUrlsForOtherProjects(activeStorageKey).some((url) =>
    samePreviewLocation(url, previewUrl),
  );
}

function previewOriginLabel(value: string) {
  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }
}

function unavailableManagedPreview(error: unknown): ManagedPreviewResult {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    status: "unavailable",
    url: "",
    finalUrl: "",
    title: "",
    reason,
  };
}

function markFromDraft(
  mark: DraftMark,
  rect: DOMRect,
  note: string,
  route: string,
): PlanPreviewAreaMark {
  const left = Math.min(mark.startX, mark.currentX);
  const top = Math.min(mark.startY, mark.currentY);
  const right = Math.max(mark.startX, mark.currentX);
  const bottom = Math.max(mark.startY, mark.currentY);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    viewportWidth: rect.width,
    viewportHeight: rect.height,
    route,
    note,
    createdAt: Date.now(),
  };
}

function markStyle(mark: PlanPreviewAreaMark) {
  return {
    left: `${(mark.x / mark.viewportWidth) * 100}%`,
    top: `${(mark.y / mark.viewportHeight) * 100}%`,
    width: `${(mark.width / mark.viewportWidth) * 100}%`,
    height: `${(mark.height / mark.viewportHeight) * 100}%`,
  };
}

function highlightAreaForStage(
  mark: PlanPreviewAreaMark,
  viewportWidth: number,
  viewportHeight: number,
): PlanPreviewAreaMark {
  return {
    ...mark,
    x: (mark.x / mark.viewportWidth) * viewportWidth,
    y: (mark.y / mark.viewportHeight) * viewportHeight,
    width: (mark.width / mark.viewportWidth) * viewportWidth,
    height: (mark.height / mark.viewportHeight) * viewportHeight,
    viewportWidth,
    viewportHeight,
    createdAt: Date.now(),
  };
}

function highlightKey(
  variantId: string,
  highlightId: string,
  viewport: "desktop" | "mobile",
) {
  return `${variantId}:${viewport}:${highlightId}`;
}

function sameAreaMark(left: PlanPreviewAreaMark, right: PlanPreviewAreaMark) {
  return (
    Math.round(left.x) === Math.round(right.x) &&
    Math.round(left.y) === Math.round(right.y) &&
    Math.round(left.width) === Math.round(right.width) &&
    Math.round(left.height) === Math.round(right.height)
  );
}

async function detectHighlightAreaInWebview(
  webview: ElectronWebviewElement,
  label: string,
): Promise<PlanPreviewAreaMark | null> {
  const needle = highlightSearchNeedle(label);
  if (!needle) return null;
  try {
    const result = await webview.executeJavaScript<{
      x: number;
      y: number;
      width: number;
      height: number;
      viewportWidth: number;
      viewportHeight: number;
    } | null>(
      `
        (() => {
          const needle = ${JSON.stringify(needle)}.toLowerCase();
          const candidates = Array.from(document.querySelectorAll(
            'button, a, [role="button"], input, select, textarea, [aria-label]'
          ));
          const visible = candidates
            .map((element) => {
              const rect = element.getBoundingClientRect();
              const style = window.getComputedStyle(element);
              const text = [
                element.textContent || '',
                element.getAttribute('aria-label') || '',
                element.getAttribute('title') || '',
                element.getAttribute('placeholder') || '',
                element.getAttribute('value') || '',
              ].join(' ').trim().toLowerCase();
              return { element, rect, style, text };
            })
            .filter(({ rect, style, text }) =>
              text.includes(needle) &&
              rect.width >= 8 &&
              rect.height >= 8 &&
              style.visibility !== 'hidden' &&
              style.display !== 'none'
            );
          const match = visible[0];
          if (!match) return null;
          const pad = 8;
          const x = Math.max(0, match.rect.left - pad);
          const y = Math.max(0, match.rect.top - pad);
          const right = Math.min(window.innerWidth, match.rect.right + pad);
          const bottom = Math.min(window.innerHeight, match.rect.bottom + pad);
          return {
            x,
            y,
            width: Math.max(24, right - x),
            height: Math.max(24, bottom - y),
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          };
        })()
      `,
      false,
    );
    if (!result) return null;
    return {
      ...result,
      note: label,
      createdAt: Date.now(),
    };
  } catch {
    return null;
  }
}

function highlightSearchNeedle(label: string) {
  const normalized = label.trim().toLowerCase();
  if (
    !normalized ||
    normalized === "proposed change" ||
    normalized === "changed area" ||
    normalized === "change"
  ) {
    return "";
  }
  return normalized.replace(/\s+button$/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function draftMarkStyle(mark: DraftMark) {
  const left = Math.min(mark.startX, mark.currentX);
  const top = Math.min(mark.startY, mark.currentY);
  return {
    left,
    top,
    width: Math.abs(mark.currentX - mark.startX),
    height: Math.abs(mark.currentY - mark.startY),
  };
}

function cropMarkThumbnail(dataUrl: string, mark: PlanPreviewAreaMark) {
  return new Promise<string | undefined>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (!sourceWidth || !sourceHeight) {
        resolve(undefined);
        return;
      }
      const scaleX = sourceWidth / Math.max(1, mark.viewportWidth);
      const scaleY = sourceHeight / Math.max(1, mark.viewportHeight);
      const sourceX = Math.max(0, Math.round(mark.x * scaleX));
      const sourceY = Math.max(0, Math.round(mark.y * scaleY));
      const cropWidth = Math.max(1, Math.round(mark.width * scaleX));
      const cropHeight = Math.max(1, Math.round(mark.height * scaleY));
      const targetWidth = 220;
      const targetHeight = Math.max(
        96,
        Math.min(160, Math.round((cropHeight / cropWidth) * targetWidth)),
      );
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(undefined);
        return;
      }
      context.drawImage(
        image,
        sourceX,
        sourceY,
        Math.min(cropWidth, sourceWidth - sourceX),
        Math.min(cropHeight, sourceHeight - sourceY),
        0,
        0,
        targetWidth,
        targetHeight,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.76));
    };
    image.onerror = () => resolve(undefined);
    image.src = dataUrl;
  });
}

function cleanupStatusForSession(
  proposalSelectionStatus: ProposalSelectionStatus,
  availability: PreviewAvailability,
): PlanPreviewCleanupStatus {
  if (availability === "unavailable") return "unavailable";
  if (proposalSelectionStatus === "selected") return "selected";
  if (proposalSelectionStatus === "failed") return "failed";
  if (proposalSelectionStatus === "reset") return "reset";
  if (proposalSelectionStatus === "clean") return "clean";
  return "idle";
}

function statusLabel(
  availability: PreviewAvailability,
  frameStatus: FrameStatus,
  proposalSelectionStatus: ProposalSelectionStatus,
) {
  if (availability === "probing") return "Checking URL";
  if (availability === "unavailable") return "Unavailable";
  if (frameStatus === "loading") return "Loading";
  if (frameStatus === "failed") return "Load failed";
  if (proposalSelectionStatus === "selecting") return "Selecting proposal";
  if (proposalSelectionStatus === "selected") return "Proposal selected";
  if (proposalSelectionStatus === "failed") return "Proposal unavailable";
  if (proposalSelectionStatus === "reset") return "Reset";
  return "Ready";
}

function samePreviewLocation(left: string, right: string) {
  try {
    const leftUrl = new URL(normalizePreviewUrl(left));
    const rightUrl = new URL(normalizePreviewUrl(right));
    return (
      localPreviewHostKey(leftUrl.hostname) ===
        localPreviewHostKey(rightUrl.hostname) &&
      previewPort(leftUrl) === previewPort(rightUrl) &&
      normalizePreviewPath(leftUrl.pathname) === normalizePreviewPath(rightUrl.pathname) &&
      leftUrl.search === rightUrl.search
    );
  } catch {
    return left.replace(/\/+$/, "") === right.replace(/\/+$/, "");
  }
}

function localPreviewHostKey(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
    ? "localhost"
    : host;
}

function previewPort(url: URL) {
  if (url.port) return url.port;
  if (url.protocol === "https:") return "443";
  return "80";
}

function normalizePreviewPath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}

function unavailableFromError(error: unknown): PreviewProbeResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: "unavailable",
    url: "",
    finalUrl: "",
    title: "",
    reason: message,
  };
}

type GuestPreviewState = {
  variantId: string;
  expanded: boolean;
  activeState: string;
  clicks: string[];
};

function variantTabLabel(id: string, total: number) {
  return total === 1 ? "A" : id;
}

function laneTransferPrompt(from: string, to: string) {
  if (to === "live") return `Update Live with ${from.toUpperCase()}?`;
  if (from === "live") return `Update ${to.toUpperCase()} with Live?`;
  return `Update ${to.toUpperCase()} with ${from.toUpperCase()}?`;
}

function visualPatchBundleForVariant(
  variant: PlanPreviewVariant,
): VisualPatchBundle | null {
  const bundle = variant.visualPatchBundle;
  if (!bundle?.patches.length) return null;
  const id = bundle.id?.trim() || `plan-preview-${variant.id}`;
  return { id, patches: bundle.patches };
}

function reloadPreviewAfterFailedHotSwap(target: ElectronWebviewElement) {
  try {
    if (target.reloadIgnoringCache) {
      target.reloadIgnoringCache();
      return;
    }
    target.reload();
  } catch {
    // The existing failed selection state is the user-visible recovery surface.
  }
}

function describeGuestInteractionState(state: GuestPreviewState | null) {
  if (!state) return "No temporary interaction recorded.";
  const clicked = state.clicks.length > 0 ? `; clicked ${state.clicks.join(", ")}` : "";
  return `Option ${state.variantId}: ${state.activeState}${clicked}`;
}

function cleanupScript() {
  return `
(() => {
  try {
    ${buildVisualPatchClearScript()}
  } catch {
    // Preview-only visual patches are best-effort cleanup state.
  }
  const existing = document.getElementById("codex-live-plan-preview-root");
  if (existing) existing.remove();
  delete window.__codexPlanPreview;
  return true;
})();
`;
}

function proposalMetadataScript(variant: PlanPreviewVariant) {
  return `
(() => {
  ${cleanupScript()}
  const variant = ${JSON.stringify(variant)};
  const root = document.createElement("div");
  root.id = "codex-live-plan-preview-root";
  root.setAttribute("data-codex-temporary-preview", variant.id);
  root.hidden = true;
  root.setAttribute("aria-hidden", "true");
  document.documentElement.append(root);
  const state = {
    variantId: variant.id,
    expanded: false,
    activeState: "proposal selected",
    clicks: []
  };
  window.__codexPlanPreview = { variantId: variant.id, interactionState: state };
  const syncState = (next) => {
    Object.assign(state, next);
    window.__codexPlanPreview.interactionState = { ...state };
  };
  syncState(state);
  return { ok: true, route: window.location.href };
})();
`;
}
