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
  ComposerAppPreviewContext,
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

export type LiveAppPreviewMarkMeta = {
  previewUrl: string;
  route: string;
  viewport: "desktop" | "mobile";
  thumbnailDataUrl?: string;
};

export function LiveAppPreview(props: {
  project: Project;
  proposal?: PlanProposal | null;
  areaMark?: PlanPreviewAreaMark | null;
  appPreviewContexts?: ComposerAppPreviewContext[];
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
  proposalControls?: {
    autoStart?: boolean;
    buildDisabled?: boolean;
    buildLabel: string;
    onBuild: () => void;
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
  const [proposalVisible, setProposalVisible] = useState(true);
  const [showProposalHighlights, setShowProposalHighlights] = useState(false);
  const [proposalSelectionStatus, setProposalSelectionStatus] =
    useState<ProposalSelectionStatus>("idle");
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
  const selectedHighlights = selectedVariant?.highlights ?? [];
  const singleMark = props.areaMark ?? props.proposal?.previewAreaMark ?? null;
  const renderedMarks =
    props.appPreviewContexts && props.appPreviewContexts.length > 0
      ? props.appPreviewContexts.map((context) => ({
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
  const viewport = props.viewport ?? uncontrolledViewport;
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
  }, [props.proposal?.turnId, spec?.updatedAt]);

  useEffect(() => {
    if (selectedHighlights.length === 0) setShowProposalHighlights(false);
  }, [selectedHighlights.length]);

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
    try {
      const result = await target.executeJavaScript<{
        ok: boolean;
        route: string;
      }>(proposalMetadataScript(variant), false);
      if (generation !== proposalSelectionGenerationRef.current) return;
      setCurrentRoute(result.route || currentRoute || previewUrl);
      setProposalSelectionStatus(result.ok ? "selected" : "failed");
      setInteractionState("Proposal selected. Use Show changes to inspect agent marks.");
    } catch {
      if (generation !== proposalSelectionGenerationRef.current) return;
      setProposalSelectionStatus("failed");
      setInteractionState("Proposal preview metadata was unavailable.");
    }
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
  const showViewportSelect = proposalToolbar
    ? toolbarWidth < 720
    : toolbarWidth < 720;
  const showViewportIconOnly = proposalToolbar
    ? toolbarWidth < 610
    : toolbarWidth < 790;
  const overflowOpenAction = proposalToolbar
    ? toolbarWidth < 850
    : toolbarWidth < 1000;
  const overflowStopAction = toolbarWidth < 680;
  const overflowReloadAction = toolbarWidth < 620;
  const showTabSelect = toolbarWidth < (proposalToolbar ? 430 : 440);
  const overflowMarkAction = proposalToolbar
    ? toolbarWidth < 700
    : toolbarWidth < 500;
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
  const markActionLabel =
    proposalToolbar || toolbarWidth >= 760 ? "Mark area" : "Mark";
  const showChangesIconOnly = proposalToolbar && toolbarWidth < 820;
  const showMarkIconOnly = proposalToolbar && toolbarWidth < 760;
  const showBuildIconOnly = proposalToolbar && toolbarWidth < 620;
  const overflowBuildAction = proposalToolbar && toolbarWidth < 450;
  const overflowChangesAction = proposalToolbar
    ? toolbarWidth < 760
    : toolbarWidth < 680;
  const showChangesInline =
    runningPreview && selectedHighlights.length > 0 && !overflowChangesAction;
  const showChangesInMenu =
    runningPreview && selectedHighlights.length > 0 && overflowChangesAction;
  const showReloadInline =
    runningPreview && !proposalToolbar && !overflowReloadAction;
  const showReloadInMenu =
    runningPreview && !proposalToolbar && overflowReloadAction;
  const showStopInline =
    runningPreview && !proposalToolbar && !overflowStopAction;
  const showStopInMenu =
    runningPreview && !proposalToolbar && overflowStopAction;
  const showOpenInline =
    runningPreview && !proposalToolbar && !overflowOpenAction;
  const showOpenInMenu =
    runningPreview && !proposalToolbar && !showOpenInline;
  const showDetectInline = stoppedPreview && !proposalToolbar;
  const showUseUrlInline = stoppedPreview && !proposalToolbar;
  const showRunInline = stoppedPreview && !proposalToolbar;
  const showStartingInline = chromeState === "starting";
  const showViewportInline = runningPreview;
  const showMarkInline = runningPreview && !overflowMarkAction;
  const showMarkInMenu = runningPreview && overflowMarkAction;
  const showBuildInline = Boolean(proposalControls) && !overflowBuildAction;
  const showBuildInMenu = Boolean(proposalControls) && overflowBuildAction;
  const showChangeUrlInMenu =
    runningPreview &&
    !proposalToolbar &&
    (showMarkInMenu ||
      showReloadInMenu ||
      showStopInMenu ||
      showOpenInMenu);
  const showMoreMenu =
    showChangesInMenu ||
    showMarkInMenu ||
    showBuildInMenu ||
    showReloadInMenu ||
    showStopInMenu ||
    showOpenInMenu ||
    showChangeUrlInMenu;
  const showOriginChip =
    runningPreview &&
    !proposalToolbar &&
    Boolean(originLabel) &&
    (toolbarDensity === "full" || toolbarDensity === "balanced");
  const showRouteChip =
    runningPreview &&
    !proposalToolbar &&
    Boolean(showRouteLabel) &&
    toolbarDensity === "full";
  const showStateChip = runningPreview && !proposalToolbar;
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
      <div
        className="preview-segmented live-preview-options preview-compare-options"
        aria-label="Preview options"
      >
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
      <div
        className="preview-segmented live-preview-options preview-compare-options"
        aria-label="Preview options"
      >
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
        data-proposal-toolbar={proposalToolbar ? "true" : undefined}
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
            {showChangesInline && (
              <button
                className={
                  [
                    "ghost-button",
                    showProposalHighlights ? "active" : "",
                    showChangesIconOnly ? "icon-only" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
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
                  (proposalToolbar
                    ? "Changes"
                    : showProposalHighlights
                      ? "Hide changes"
                      : "Show changes")}
              </button>
            )}
            {showMarkInline && (
              <button
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
                className={`ghost-button primary ${
                  showBuildIconOnly ? "icon-only" : ""
                }`.trim()}
                aria-label={proposalControls.buildLabel}
                disabled={proposalControls.buildDisabled}
                onClick={proposalControls.onBuild}
                title="Build the selected proposal into Live"
                type="button"
              >
                <Hammer size={15} />
                {!showBuildIconOnly && proposalControls.buildLabel}
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
                      {showProposalHighlights ? <EyeOff size={15} /> : <Eye size={15} />}
                      {showProposalHighlights ? "Hide changes" : "Show changes"}
                    </button>
                  )}
                  {proposalControls && showBuildInMenu && (
                    <button
                      disabled={proposalControls.buildDisabled}
                      onClick={() => {
                        if (proposalControls.buildDisabled) return;
                        setMoreMenuOpen(false);
                        proposalControls.onBuild();
                      }}
                      type="button"
                    >
                      <Hammer size={15} /> {proposalControls.buildLabel}
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
              style={markStyle(highlight.areaMark)}
              title={highlight.note || highlight.label}
            >
              <span>{highlight.label}</span>
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
