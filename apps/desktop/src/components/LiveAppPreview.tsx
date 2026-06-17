import {
  ExternalLink,
  Eye,
  EyeOff,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  Play,
  RefreshCw,
  Search,
  Smartphone,
  Square,
} from "lucide-react";
import {
  type ReactNode,
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
import type {
  PlanPreviewAreaMark,
  PlanPreviewCleanupStatus,
  PlanPreviewSessionState,
  PlanPreviewVariant,
  PlanProposal,
  Project,
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

type ElectronWebviewElement = HTMLElement & {
  executeJavaScript: <T = unknown>(
    code: string,
    userGesture?: boolean,
  ) => Promise<T>;
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
type InjectionStatus =
  | "idle"
  | "clean"
  | "cleaning"
  | "injecting"
  | "injected"
  | "reset"
  | "failed"
  | "unavailable";

const suggestedPreviewUrls = [
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:8080",
];

export type LiveAppPreviewMarkMeta = {
  previewUrl: string;
  route: string;
  viewport: "desktop" | "mobile";
};

export function LiveAppPreview(props: {
  project: Project;
  proposal?: PlanProposal | null;
  areaMark?: PlanPreviewAreaMark | null;
  compareTabs?: ReactNode;
  compareTabOptions?: PreviewToolbarSelectOption[];
  statusLabel?: string;
  titleLabel?: string;
  viewport?: "desktop" | "mobile";
  onAreaMarkChange: (
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onViewportChange?: (viewport: "desktop" | "mobile") => void;
  onSessionChange?: (session: PlanPreviewSessionState | null) => void;
  onVariantChange?: (variantId: string) => void;
  onBuildBaselineRequest?: (project: Project) => void;
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
  const [proposalVisible, setProposalVisible] = useState(true);
  const [injectionStatus, setInjectionStatus] =
    useState<InjectionStatus>("idle");
  const [interactionState, setInteractionState] = useState(
    "No temporary interaction recorded.",
  );
  const [currentRoute, setCurrentRoute] = useState("");
  const initialMark = props.areaMark ?? props.proposal?.previewAreaMark ?? null;
  const [markNote, setMarkNote] = useState(initialMark?.note ?? "");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const draftMarkRef = useRef<DraftMark | null>(null);
  const [webview, setWebview] = useState<ElectronWebviewElement | null>(null);
  const probeRequestRef = useRef(0);
  const injectionGenerationRef = useRef(0);
  const supportsElectronPreview = hasDesktopBridge();
  const spec = props.proposal?.previewSpec ?? null;
  const selectedVariant = selectedPlanPreviewVariant(
    spec,
    props.proposal?.previewSelectedVariantId,
  );
  const variants = spec?.variants.slice(0, 3) ?? [];
  const mark = props.areaMark ?? props.proposal?.previewAreaMark ?? null;
  const viewport = props.viewport ?? uncontrolledViewport;
  const safeDraftUrl = useMemo(() => normalizePreviewUrl(draftUrl), [draftUrl]);
  const routeForContext = currentRoute || previewUrl || safeDraftUrl;
  const captureWebview = useCallback((node: HTMLElement | null) => {
    setWebview(node as ElectronWebviewElement | null);
  }, []);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    probeRequestRef.current += 1;
    injectionGenerationRef.current += 1;
    const storedUrl = window.localStorage.getItem(storageKey) ?? "";
    setDraftUrl(storedUrl);
    setCurrentRoute("");
    setInteractionState("No temporary interaction recorded.");
    setInjectionStatus("idle");
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
    setPreviewUrl("");
    setFrameStatus("idle");
    setAvailability("unavailable");
    setAvailabilityMessage("No preview running.");
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
  }, [props.proposal?.turnId, spec?.updatedAt]);

  useEffect(() => {
    setMarkNote(mark?.note ?? "");
  }, [mark?.createdAt, mark?.note]);

  useEffect(() => {
    if (!webview) return;
    const handleFinishLoad = () => {
      setFrameStatus("loaded");
      setAvailability("available");
      void refreshRoute(webview);
    };
    const handleFailLoad = () => {
      setFrameStatus("failed");
      setInjectionStatus("unavailable");
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
  }, [webview]);

  useEffect(() => {
    if (!webview || frameStatus !== "loaded") return;
    if (!selectedVariant || !proposalVisible) {
      void cleanupInjectedVariant("clean");
      return;
    }
    void injectVariant(selectedVariant);
    // Cleanup is part of injectVariant, so variant switches replace the old UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    webview,
    frameStatus,
    selectedVariant?.id,
    proposalVisible,
    previewUrl,
    frameKey,
  ]);

  useEffect(() => {
    if (!webview || injectionStatus !== "injected") return;
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
  }, [webview, injectionStatus, selectedVariant?.id]);

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
      cleanupStatus: cleanupStatusForSession(injectionStatus, availability),
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
    injectionStatus,
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
    setInjectionStatus("unavailable");
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
    setInjectionStatus("unavailable");
  }

  async function stopPreview() {
    probeRequestRef.current += 1;
    setManagedState("stopped");
    setAvailability("unavailable");
    setAvailabilityMessage("No preview running.");
    setFrameStatus("idle");
    setPreviewUrl("");
    setCurrentRoute("");
    setMarking(false);
    setDraftMarkState(null);
    setPreviewChoices([]);
    await cleanupInjectedVariant("reset");
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
      setAvailability("unavailable");
      setAvailabilityMessage(
        "That remembered preview URL is also saved for another project. Run this project or use URL.",
      );
      setManagedState("stopped");
      setInjectionStatus("unavailable");
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
      setAvailability("idle");
      setAvailabilityMessage("Choose or enter a local preview URL.");
      setManagedState("stopped");
      await cleanupInjectedVariant("reset");
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
    setInjectionStatus("unavailable");
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
    setInjectionStatus("clean");
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

  function finishMark() {
    const mark = draftMarkRef.current;
    if (!mark || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const area = markFromDraft(mark, rect, markNote, routeForContext);
    if (area.width > 8 && area.height > 8) {
      props.onAreaMarkChange(area, {
        previewUrl,
        route: routeForContext,
        viewport,
      });
    }
    setDraftMarkState(null);
    setMarking(false);
  }

  function setDraftMarkState(value: DraftMark | null) {
    draftMarkRef.current = value;
    setDraftMark(value);
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

  async function cleanupInjectedVariant(status: "clean" | "reset") {
    if (!webview) {
      setInjectionStatus(status);
      return;
    }
    const target = webview;
    const generation = injectionGenerationRef.current + 1;
    injectionGenerationRef.current = generation;
    setInjectionStatus("cleaning");
    try {
      await target.executeJavaScript(cleanupScript(), false);
      if (generation !== injectionGenerationRef.current) return;
      setInjectionStatus(status);
    } catch {
      if (generation !== injectionGenerationRef.current) return;
      setInjectionStatus("failed");
    }
  }

  async function injectVariant(variant: PlanPreviewVariant) {
    if (!webview) return;
    const target = webview;
    const generation = injectionGenerationRef.current + 1;
    injectionGenerationRef.current = generation;
    setInjectionStatus("cleaning");
    try {
      await target.executeJavaScript(cleanupScript(), false);
    } catch {
      if (generation !== injectionGenerationRef.current) return;
      setInjectionStatus("failed");
      setInteractionState("Temporary preview cleanup failed.");
      return;
    }
    if (generation !== injectionGenerationRef.current) return;
    setInjectionStatus("injecting");
    setInteractionState("Injecting selected temporary preview.");
    try {
      const result = await target.executeJavaScript<{
        ok: boolean;
        route: string;
      }>(injectionScript(variant), false);
      if (generation !== injectionGenerationRef.current) return;
      setCurrentRoute(result.route || currentRoute || previewUrl);
      setInjectionStatus(result.ok ? "injected" : "failed");
      setInteractionState("Temporary preview ready; no preview control clicked yet.");
    } catch {
      if (generation !== injectionGenerationRef.current) return;
      setInjectionStatus("failed");
      setInteractionState("Temporary preview injection failed.");
    }
  }

  const canShowWebview =
    supportsElectronPreview && availability === "available" && previewUrl;
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
  const liveTitle = props.titleLabel ?? "Live preview";
  const liveStatus =
    props.statusLabel ??
    (selectedVariant && proposalVisible
      ? "Proposal"
      : chromeState === "running"
        ? "Live app"
        : "Preview controls");

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
  const showViewportSelect = toolbarWidth < 950;
  const showViewportIconOnly = toolbarWidth < 790;
  const overflowOpenAction = toolbarWidth < 850;
  const overflowStopAction = toolbarWidth < 680;
  const overflowReloadAction = toolbarWidth < 620;
  const showTabSelect = toolbarWidth < 440;
  const overflowMarkAction = toolbarWidth < 500;
  const overflowPreviewToggleAction = toolbarWidth < 620;
  const compressedLabels =
    toolbarDensity === "compact" || toolbarDensity === "collapsed";
  const canMarkArea = chromeState === "running";
  const runningPreview = chromeState === "running";
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
  const markActionLabel = toolbarWidth < 760 ? "Mark" : "Mark area";
  const showPreviewToggleInline =
    runningPreview &&
    Boolean(selectedVariant) &&
    !overflowPreviewToggleAction;
  const showPreviewToggleInCollapsedMenu =
    runningPreview && Boolean(selectedVariant) && overflowPreviewToggleAction;
  const showPreviewToggleInMenu = false;
  const showReloadInline = runningPreview && !overflowReloadAction;
  const showReloadInMenu = runningPreview && overflowReloadAction;
  const showStopInline = runningPreview && !overflowStopAction;
  const showStopInMenu = runningPreview && overflowStopAction;
  const showOpenInline = runningPreview && !overflowOpenAction;
  const showOpenInMenu = runningPreview && !showOpenInline;
  const showDetectInline = stoppedPreview;
  const showUseUrlInline = stoppedPreview;
  const showRunInline = stoppedPreview;
  const showStartingInline = chromeState === "starting";
  const showViewportInline = runningPreview;
  const showMarkInline = runningPreview && !overflowMarkAction;
  const showMarkInMenu = runningPreview && overflowMarkAction;
  const showChangeUrlInMenu =
    runningPreview &&
    (showPreviewToggleInCollapsedMenu ||
      showMarkInMenu ||
      showReloadInMenu ||
      showStopInMenu ||
      showOpenInMenu);
  const showMoreMenu =
    showPreviewToggleInCollapsedMenu ||
    showPreviewToggleInMenu ||
    showMarkInMenu ||
    showReloadInMenu ||
    showStopInMenu ||
    showOpenInMenu ||
    showChangeUrlInMenu;
  const showOriginChip =
    runningPreview &&
    Boolean(originLabel) &&
    (toolbarDensity === "full" || toolbarDensity === "balanced");
  const showRouteChip = runningPreview && Boolean(showRouteLabel) && toolbarDensity === "full";
  const showStateChip = runningPreview;
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
  const optionPreviewTabs =
    compareTabOptions.length > 0 ? (
      <div className="preview-segmented live-preview-options" aria-label="Preview options">
        {compareTabOptions.map((option) => (
          <button
            className={option.active ? "active" : ""}
            key={option.id}
            onClick={option.onSelect}
            title={option.title || option.label}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    ) : null;
  const defaultPreviewTabs =
    !optionPreviewTabs && variants.length > 0 ? (
      <div className="preview-segmented live-preview-options" aria-label="Preview options">
        <button
          className={!proposalVisible ? "active" : ""}
          onClick={() => {
            setInteractionState("Viewing the current live app.");
            setProposalVisible(false);
          }}
          title="Current live app"
          type="button"
        >
          Live
        </button>
        {variants.map((variant) => (
          <button
            className={
              proposalVisible && variant.id === selectedVariant?.id
                ? "active"
                : ""
            }
            key={variant.id}
            onClick={() => {
              setInteractionState("Switching temporary preview option.");
              setProposalVisible(true);
              props.onVariantChange?.(variant.id);
            }}
            title={`${variant.title}: ${variant.tradeoff}`}
            type="button"
          >
            {variantTabLabel(variant.id, variants.length)}
          </button>
        ))}
      </div>
    ) : null;
  const previewTabs =
    compareTabOptions.length === 0 && !props.compareTabs ? null : showTabSelect ? (
      <PreviewToolbarSelect
        ariaLabel="Preview options"
        className="preview-toolbar-tab-select"
        options={compareTabOptions}
      />
    ) : (
      optionPreviewTabs ?? props.compareTabs ?? defaultPreviewTabs
    );
  const viewportOptions: PreviewToolbarSelectOption[] = [
    {
      id: "desktop",
      label: "Desktop",
      title: "Desktop viewport",
      icon: <Monitor size={14} />,
      active: viewport === "desktop",
      onSelect: () => setViewport("desktop"),
    },
    {
      id: "mobile",
      label: "Mobile",
      title: "Mobile viewport",
      icon: <Smartphone size={14} />,
      active: viewport === "mobile",
      onSelect: () => setViewport("mobile"),
    },
  ];
  const viewportControl = showViewportSelect ? (
    <PreviewToolbarSelect
      ariaLabel="Viewport"
      className="preview-toolbar-viewport-select"
      hideCurrentLabel={showViewportIconOnly}
      options={viewportOptions}
    />
  ) : (
    <div className="preview-segmented preview-viewport" aria-label="Viewport">
      <button
        className={viewport === "desktop" ? "active" : ""}
        onClick={() => setViewport("desktop")}
        type="button"
      >
        <Monitor size={14} /> Desktop
      </button>
      <button
        className={viewport === "mobile" ? "active" : ""}
        onClick={() => setViewport("mobile")}
        type="button"
      >
        <Smartphone size={14} /> Mobile
      </button>
    </div>
  );

  return (
    <div className="live-preview-panel">
      <header
        className={`preview-toolbar live-preview-toolbar ${chromeState}`}
        data-density={toolbarDensity}
        ref={toolbarRef}
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
                      injectionStatus,
                      availability,
                    )}`}
                  >
                    {statusLabel(availability, frameStatus, injectionStatus)}
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
        <div className="preview-toolbar-tabs">{previewTabs}</div>
        <div className={`preview-actions live-preview-controls ${chromeState}`}>
        {showUrlEntry ? (
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
            <button className="ghost-button primary" onClick={() => void openPreview()} type="button">
              <ExternalLink size={15} /> Open
            </button>
            <button className="ghost-button" onClick={() => setShowUrlEntry(false)} type="button">
              Cancel
            </button>
          </>
        ) : (
          <>
            {showViewportInline && (
              viewportControl
            )}
            {showMarkInline && (
              <button
                className={marking ? "ghost-button active" : "ghost-button"}
                onClick={() => {
                  if (!canMarkArea) return;
                  setMarking((current) => !current);
                  setDraftMarkState(null);
                }}
                title="Mark an area in this preview"
                type="button"
              >
                <MousePointer2 size={15} /> {markActionLabel}
              </button>
            )}
            {runningPreview && showPreviewToggleInline && selectedVariant && (
              <button
                className="ghost-button"
                onClick={() => setProposalVisible((current) => !current)}
                title={proposalVisible ? "Hide proposed UI" : "Show proposed UI"}
                type="button"
              >
                {proposalVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                {proposalVisible ? "Hide preview" : "Show preview"}
              </button>
            )}
            {runningPreview && showReloadInline && (
              <button className="ghost-button" onClick={reloadPreview} title="Reload preview" type="button">
                <RefreshCw size={15} /> {reloadLabel}
              </button>
            )}
            {runningPreview && showStopInline && (
              <button className="ghost-button danger" onClick={() => void stopPreview()} type="button">
                <Square size={14} /> Stop
              </button>
            )}
            {runningPreview && showOpenInline && (
              <button className="ghost-button" onClick={() => void openExternalPreview()} type="button">
                <ExternalLink size={15} /> Open
              </button>
            )}
            {showStartingInline && (
              <>
                <button className="ghost-button primary" disabled type="button">
                  <RefreshCw className="spin" size={15} /> Starting
                </button>
                <button className="ghost-button" onClick={() => void stopPreview()} type="button">
                  Cancel
                </button>
              </>
            )}
            {stoppedPreview && showRunInline && (
              <>
                <button className="ghost-button primary" onClick={() => void runPreview()} type="button">
                  <Play size={15} /> {startPreviewLabel}
                </button>
                {showDetectInline && (
                  <button className="ghost-button" onClick={() => void discoverPreviewUrl()} type="button">
                    <Search size={15} /> {detectPreviewLabel}
                  </button>
                )}
                {showUseUrlInline && (
                  <button className="ghost-button" onClick={() => setShowUrlEntry(true)} type="button">
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
                        setMarking((current) => !current);
                        setDraftMarkState(null);
                        setMoreMenuOpen(false);
                      }}
                      type="button"
                    >
                      <MousePointer2 size={15} />
                      {marking ? "Stop marking" : "Mark area"}
                    </button>
                  )}
                  {showPreviewToggleInCollapsedMenu && selectedVariant && (
                    <button
                      onClick={() => {
                        setProposalVisible((current) => !current);
                        setMoreMenuOpen(false);
                      }}
                      type="button"
                    >
                      {proposalVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      {proposalVisible ? "Hide preview" : "Show preview"}
                    </button>
                  )}
                  {showPreviewToggleInMenu && selectedVariant && (
                    <button
                      onClick={() => {
                        setProposalVisible((current) => !current);
                        setMoreMenuOpen(false);
                      }}
                      type="button"
                    >
                      {proposalVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                      {proposalVisible ? "Hide preview" : "Show preview"}
                    </button>
                  )}
                  {showOpenInMenu && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void openExternalPreview();
                      }}
                      type="button"
                    >
                      <ExternalLink size={15} /> Open
                    </button>
                  )}
                  {showReloadInMenu && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        reloadPreview();
                      }}
                      type="button"
                    >
                      <RefreshCw size={15} /> Reload
                    </button>
                  )}
                  {showStopInMenu && (
                    <button
                      onClick={() => {
                        setMoreMenuOpen(false);
                        void stopPreview();
                      }}
                      type="button"
                    >
                      <Square size={14} /> Stop
                    </button>
                  )}
                  {showChangeUrlInMenu && (
                    <>
                      <button
                        onClick={() => {
                          setMoreMenuOpen(false);
                          setShowUrlEntry(true);
                        }}
                        type="button"
                      >
                        Use another URL
                      </button>
                    </>
                  )}
                </div>
                )}
              </div>
            )}
          </>
        )}
        </div>
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
        className={`live-preview-stage ${viewport} ${marking ? "marking" : ""}`}
        ref={stageRef}
      >
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
        {canShowWebview && frameStatus !== "loaded" && (
          <div className="live-preview-loading">
            <strong>Loading preview</strong>
            <span>{previewUrl}</span>
          </div>
        )}
        {marking && canShowWebview && (
          <div
            className="live-preview-mark-capture"
            onPointerDown={beginMark}
            onPointerMove={updateMark}
            onPointerUp={finishMark}
          />
        )}
        {mark && <div className="live-preview-mark" style={markStyle(mark)} />}
        {draftMark && (
          <div className="live-preview-mark draft" style={draftMarkStyle(draftMark)} />
        )}
      </div>

      {(mark || marking) && (
        <label className="live-preview-mark-note">
          <span>{mark ? "Marked area note" : "Draw an area, then add a note"}</span>
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

function cleanupStatusForSession(
  injectionStatus: InjectionStatus,
  availability: PreviewAvailability,
): PlanPreviewCleanupStatus {
  if (availability === "unavailable") return "unavailable";
  if (injectionStatus === "injected") return "injected";
  if (injectionStatus === "failed") return "failed";
  if (injectionStatus === "reset") return "reset";
  if (injectionStatus === "clean") return "clean";
  return "idle";
}

function statusLabel(
  availability: PreviewAvailability,
  frameStatus: FrameStatus,
  injectionStatus: InjectionStatus,
) {
  if (availability === "probing") return "Checking URL";
  if (availability === "unavailable") return "Unavailable";
  if (frameStatus === "loading") return "Loading";
  if (frameStatus === "failed") return "Load failed";
  if (injectionStatus === "injecting") return "Injecting proposed UI";
  if (injectionStatus === "injected") return "Proposed UI active";
  if (injectionStatus === "failed") return "Injection unavailable";
  if (injectionStatus === "reset") return "Reset";
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
  return total === 1 ? "Preview" : id;
}

function describeGuestInteractionState(state: GuestPreviewState | null) {
  if (!state) return "No temporary interaction recorded.";
  const clicked = state.clicks.length > 0 ? `; clicked ${state.clicks.join(", ")}` : "";
  return `Option ${state.variantId}: ${state.activeState}${clicked}`;
}

function cleanupScript() {
  return `
(() => {
  const existing = document.getElementById("codex-live-plan-preview-root");
  if (existing) existing.remove();
  delete window.__codexPlanPreview;
  return true;
})();
`;
}

function injectionScript(variant: PlanPreviewVariant) {
  return `
(() => {
  ${cleanupScript()}
  const variant = ${JSON.stringify(variant)};
  const root = document.createElement("div");
  root.id = "codex-live-plan-preview-root";
  root.setAttribute("data-codex-temporary-preview", variant.id);
  root.style.position = "relative";
  root.style.zIndex = "2147483647";
  const shadow = root.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = ${JSON.stringify(guestPreviewCss())};
  const host = document.createElement("div");
  host.className = "codex-preview-host " + variant.placement;
  host.innerHTML = renderCodexPreview(variant);
  shadow.append(style, host);
  document.documentElement.append(root);
  const state = {
    variantId: variant.id,
    expanded: false,
    activeState: "ready",
    clicks: []
  };
  window.__codexPlanPreview = { variantId: variant.id, interactionState: state };
  const syncState = (next) => {
    Object.assign(state, next);
    window.__codexPlanPreview.interactionState = { ...state };
    host.setAttribute("data-expanded", state.expanded ? "true" : "false");
    host.setAttribute("data-active-state", state.activeState);
  };
  host.addEventListener("click", (event) => {
    const action = event.target && event.target.closest
      ? event.target.closest("[data-codex-action]")
      : null;
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    const label = action.getAttribute("data-codex-action") || "preview control";
    const expanded = !state.expanded;
    const activeState = expanded ? label + " state visible" : "primary state";
    syncState({
      expanded,
      activeState,
      clicks: [...state.clicks, label].slice(-6)
    });
  }, true);
  syncState(state);
  return { ok: true, route: window.location.href };

  function renderCodexPreview(activeVariant) {
    const primary = activeVariant.components[0] || {};
    const label = escapeHtml(primary.label || activeVariant.title);
    const body = escapeHtml(primary.body || activeVariant.summary);
    const actionLabel = escapeHtml(primary.actionLabel || "Open");
    const title = escapeHtml(activeVariant.title);
    const detailList = renderComponentDetails(activeVariant.components || []);
    const secondaryText = escapeHtml(activeVariant.tradeoff || activeVariant.summary || activeVariant.title);
    if (activeVariant.placement === "sidePanel") {
      return [
        '<aside class="codex-preview-panel" role="complementary" aria-label="Proposed preview">',
        '<span>Proposed</span>',
        '<strong>' + title + '</strong>',
        '<p>' + body + '</p>',
        detailList,
        '<button data-codex-action="' + actionLabel + '" type="button">' + actionLabel + '</button>',
        '<small class="codex-secondary">' + secondaryText + '</small>',
        '</aside>'
      ].join("");
    }
    if (activeVariant.placement === "modal") {
      return [
        '<div class="codex-preview-scrim" role="presentation">',
        '<section class="codex-preview-modal" role="dialog" aria-label="Proposed preview">',
        '<span>Proposed</span>',
        '<strong>' + title + '</strong>',
        '<p>' + body + '</p>',
        detailList,
        '<div class="codex-preview-actions">',
        '<button data-codex-action="dismiss proposal" type="button">Not now</button>',
        '<button data-codex-action="' + actionLabel + '" type="button">' + actionLabel + '</button>',
        '</div>',
        '<small class="codex-secondary">' + secondaryText + '</small>',
        '</section>',
        '</div>'
      ].join("");
    }
    return [
      '<div class="codex-preview-bar" role="region" aria-label="Proposed preview">',
      '<span>Proposed</span>',
      '<strong>' + label + '</strong>',
      '<button data-codex-action="' + actionLabel + '" type="button">' + actionLabel + '</button>',
      '<section class="codex-preview-popover">',
      '<strong>' + title + '</strong>',
      '<p>' + body + '</p>',
      detailList,
      '<button data-codex-action="' + actionLabel + '" type="button">' + actionLabel + '</button>',
      '</section>',
      '</div>'
    ].join("");
  }

  function renderComponentDetails(components) {
    const details = components.slice(1, 4).filter(Boolean);
    if (!details.length) return "";
    return '<ul class="codex-preview-details">' + details.map((component) => {
      const itemLabel = escapeHtml(component.label || component.kind || "Detail");
      const itemBody = escapeHtml(component.body || "");
      return '<li><strong>' + itemLabel + '</strong><span>' + itemBody + '</span></li>';
    }).join("") + '</ul>';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
`;
}

function guestPreviewCss() {
  return `
:host {
  all: initial;
  color-scheme: dark;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* {
  box-sizing: border-box;
}
.codex-preview-host {
  position: fixed;
  inset: auto;
  z-index: 2147483647;
  color: #f2f0e7;
  pointer-events: none;
}
.codex-preview-host button,
.codex-preview-host input {
  font: inherit;
}
.codex-preview-host button {
  pointer-events: auto;
  min-height: 30px;
  border: 1px solid rgba(247, 219, 117, 0.42);
  border-radius: 7px;
  padding: 0 10px;
  background: #d8b672;
  color: #171715;
  cursor: pointer;
  font-weight: 750;
}
.codex-preview-host span {
  color: #f7db75;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}
.codex-preview-host p {
  margin: 8px 0 12px;
  color: #ddd8cb;
  line-height: 1.45;
}
.codex-preview-details {
  display: grid;
  gap: 8px;
  margin: 0 0 12px;
  padding: 0;
  list-style: none;
}
.codex-preview-details li {
  display: grid;
  gap: 3px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
}
.codex-preview-details strong {
  color: #f2f0e7;
}
.codex-preview-details span {
  color: #ddd8cb;
  font-size: 12px;
  font-weight: 500;
  text-transform: none;
}
.codex-preview-host.topbar {
  top: 18px;
  left: 18px;
  right: 18px;
}
.codex-preview-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 8px 10px;
  border: 1px solid rgba(247, 219, 117, 0.58);
  border-radius: 8px;
  background: rgba(31, 32, 30, 0.9);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}
.codex-preview-bar strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.codex-preview-popover {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: min(320px, 94%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 12px;
  background: #202321;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.4);
}
.codex-preview-host[data-expanded="true"] .codex-preview-popover {
  display: block;
}
.codex-preview-host.sidePanel {
  top: 18px;
  right: 18px;
  bottom: 18px;
  width: min(340px, calc(100vw - 36px));
}
.codex-preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 14px;
  border: 1px solid rgba(247, 219, 117, 0.58);
  border-radius: 8px;
  background: rgba(31, 32, 30, 0.92);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}
.codex-preview-panel input {
  min-height: 34px;
  margin-bottom: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: #171918;
  color: #ddd8cb;
  padding: 0 9px;
}
.codex-secondary {
  display: none;
  color: #98d79e;
  margin-top: 10px;
}
.codex-preview-host[data-expanded="true"] .codex-secondary {
  display: inline-flex;
}
.codex-preview-host.modal {
  inset: 0;
}
.codex-preview-scrim {
  display: grid;
  place-items: center;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.24);
  pointer-events: auto;
}
.codex-preview-modal {
  width: min(410px, calc(100vw - 36px));
  border: 1px solid rgba(247, 219, 117, 0.58);
  border-radius: 8px;
  padding: 16px;
  background: rgba(31, 32, 30, 0.94);
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.48);
}
.codex-preview-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.codex-preview-actions button:first-child {
  background: transparent;
  color: #ddd8cb;
  border-color: rgba(255, 255, 255, 0.16);
}
`;
}
