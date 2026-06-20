import {
  Eye,
  EyeOff,
  Hammer,
  Monitor,
  MoreHorizontal,
  MousePointer2,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { previewArtifactDisplayName, previewArtifactTabLabel } from "../mockupArtifacts";
import { usePreviewToolbarDensity } from "../hooks/usePreviewToolbarDensity";
import type {
  ComposerAppPreviewContext,
  ComposerMockupPreviewContext,
  MockupPreviewSet,
  PlanPreviewAreaMark,
  ProposalHighlight,
  Project,
  SavedMockup,
} from "../types";
import {
  LiveAppPreview,
  type LiveAppPreviewMarkMeta,
} from "./LiveAppPreview";
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

export function MockupPreview(props: {
  mode: "active" | "history";
  appPreviewContexts: ComposerAppPreviewContext[];
  canShowLive: boolean;
  forceLiveToken?: number;
  markContexts: ComposerMockupPreviewContext[];
  project: Project | null;
  previewSet: MockupPreviewSet | null;
  onBuild: (previewSet: MockupPreviewSet, mockup: SavedMockup) => void;
  onLiveMarkArea: (
    project: Project,
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onMarkArea: (
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
  ) => void;
  onResetHighlightContexts: (
    previewSet: MockupPreviewSet,
    mockup: SavedMockup,
    viewport: ComposerMockupPreviewContext["viewport"],
  ) => void;
  onSelect: (mockupId: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [marking, setMarking] = useState(false);
  const [draftMark, setDraftMark] = useState<DraftMark | null>(null);
  const [highlightDrag, setHighlightDrag] = useState<HighlightDrag | null>(null);
  const [highlightAdjustments, setHighlightAdjustments] = useState<
    Record<string, PlanPreviewAreaMark>
  >({});
  const [selectedTab, setSelectedTab] = useState<"mockup" | "live">("mockup");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [showHighlights, setShowHighlights] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const selected = useMemo(() => {
    if (!props.previewSet) return null;
    return (
      props.previewSet.mockups.find(
        (mockup) => mockup.id === props.previewSet?.selectedMockupId,
      ) ??
      props.previewSet.mockups[0] ??
      null
    );
  }, [props.previewSet]);
  const historyMode = props.mode === "history";
  const canShowLive = props.canShowLive && Boolean(props.project);
  const liveSelected = canShowLive && selectedTab === "live";
  const {
    density: toolbarDensity,
    toolbarRef,
    toolbarWidth,
  } = usePreviewToolbarDensity({
    collapsedMax: 740,
    compactMax: 1080,
    balancedMax: 1360,
  });
  const useCompactActionLabels = toolbarWidth < 860;
  const overflowBuildAction = toolbarWidth < 760;
  const overflowResetAction = toolbarWidth < 640;
  const overflowChangesAction = toolbarWidth < 440;
  const showTabSelect = toolbarWidth < 440;
  const overflowMarkAction = toolbarWidth < 620;
  const showChangesIconOnly = toolbarWidth < 620;
  const selectedHighlights = selected?.highlights ?? [];
  const hasSelectedHighlights = selectedHighlights.length > 0;
  const shouldExposeChangesControl = canShowLive || hasSelectedHighlights;
  const selectedMarks = props.markContexts.filter(
    (mark) =>
      mark.projectId === props.previewSet?.projectId &&
      mark.proposalSetId === props.previewSet?.proposalSetId &&
      mark.mockupId === selected?.id &&
      mark.source !== "proposalHighlight" &&
      mark.viewport === viewport,
  );
  const adjustedHighlightContexts = props.markContexts.filter(
    (mark) =>
      mark.projectId === props.previewSet?.projectId &&
      mark.proposalSetId === props.previewSet?.proposalSetId &&
      mark.mockupId === selected?.id &&
      mark.source === "proposalHighlight" &&
      mark.viewport === viewport,
  );
  const hasAdjustedHighlights = adjustedHighlightContexts.length > 0;
  const showTitleChip = false;
  const showSummaryChip = false;
  const showChangesInline =
    shouldExposeChangesControl &&
    !overflowChangesAction;
  const showResetInline =
    hasAdjustedHighlights && !overflowResetAction;
  const showChangesInMenu =
    shouldExposeChangesControl && !showChangesInline;
  const showResetInMenu = hasAdjustedHighlights && !showResetInline;
  const showBuildInline = !historyMode && !overflowBuildAction;
  const showBuildInMenu = !historyMode && overflowBuildAction;
  const showMarkInline = !overflowMarkAction;
  const showMarkInMenu = overflowMarkAction;
  const markActionLabel = "Mark area";
  const changesActionLabel = !hasSelectedHighlights
    ? "No changes"
    : showHighlights
      ? "Hide"
      : "Changes";
  const resetActionLabel = useCompactActionLabels ? "Reset" : "Reset changes";
  const buildActionLabel = useCompactActionLabels ? "Build" : "Build selected";
  const showMoreMenu =
    showMarkInMenu || showChangesInMenu || showResetInMenu || showBuildInMenu;

  useEffect(() => {
    if (!showMoreMenu) {
      setMoreMenuOpen(false);
    }
  }, [showMoreMenu]);

  useEffect(() => {
    setMoreMenuOpen(false);
    setMarking(false);
    setDraftMark(null);
    setShowHighlights(false);
    setSelectedTab(canShowLive ? "live" : "mockup");
  }, [canShowLive, props.forceLiveToken, props.previewSet?.proposalSetId]);

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
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  function switchTab(tab: "mockup" | "live") {
    setSelectedTab(tab);
    setMarking(false);
    setDraftMark(null);
  }

  function beginMark(event: PointerEvent<HTMLDivElement>) {
    if (!marking) return;
    const point = pointerPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftMark({
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
    });
  }

  function updateMark(event: PointerEvent<HTMLDivElement>) {
    if (!marking || !draftMark) return;
    const point = pointerPoint(event);
    if (!point) return;
    setDraftMark((current) =>
      current
        ? {
            ...current,
            currentX: point.x,
            currentY: point.y,
          }
        : null,
    );
  }

  async function finishMark(event: PointerEvent<HTMLDivElement>) {
    if (!marking || !draftMark || !props.previewSet || !selected) return;
    const point = pointerPoint(event) ?? {
      x: draftMark.currentX,
      y: draftMark.currentY,
    };
    const stage = stageRef.current;
    const width = Math.abs(point.x - draftMark.startX);
    const height = Math.abs(point.y - draftMark.startY);
    setDraftMark(null);
    setMarking(false);
    if (!stage || width < 8 || height < 8) return;
    const areaMark: PlanPreviewAreaMark = {
      x: Math.min(draftMark.startX, point.x),
      y: Math.min(draftMark.startY, point.y),
      width,
      height,
      viewportWidth: stage.clientWidth,
      viewportHeight: stage.clientHeight,
      route: selected.filePath,
      note: "",
      createdAt: Date.now(),
    };
    const thumbnailDataUrl = await captureMockupThumbnail(areaMark);
    props.onMarkArea(props.previewSet, selected, areaMark, {
      viewport,
      thumbnailDataUrl,
    });
  }

  function beginHighlightAdjust(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
    highlight: ProposalHighlight,
    mode: HighlightDrag["mode"],
  ) {
    if (!stageRef.current || !props.previewSet || !selected) return;
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
              stage.clientWidth - highlightDrag.startMark.x,
            ),
            height: clamp(
              highlightDrag.startMark.height + deltaY,
              24,
              stage.clientHeight - highlightDrag.startMark.y,
            ),
            createdAt: Date.now(),
          }
        : {
            ...highlightDrag.startMark,
            x: clamp(
              highlightDrag.startMark.x + deltaX,
              0,
              stage.clientWidth - highlightDrag.startMark.width,
            ),
            y: clamp(
              highlightDrag.startMark.y + deltaY,
              0,
              stage.clientHeight - highlightDrag.startMark.height,
            ),
            createdAt: Date.now(),
          };
    setHighlightAdjustments((current) => ({
      ...current,
      [highlightKey(selected?.id ?? "", highlightDrag.highlightId, viewport)]: next,
    }));
  }

  async function finishHighlightAdjust(
    event: PointerEvent<HTMLDivElement | HTMLButtonElement>,
  ) {
    if (!highlightDrag || !props.previewSet || !selected) return;
    event.preventDefault();
    event.stopPropagation();
    const adjusted =
      highlightAdjustments[
        highlightKey(selected.id, highlightDrag.highlightId, viewport)
      ] ?? highlightDrag.startMark;
    const moved = !sameAreaMark(adjusted, highlightDrag.startMark);
    const label = highlightDrag.label;
    const highlightId = highlightDrag.highlightId;
    setHighlightDrag(null);
    if (!moved) return;
    const thumbnailDataUrl = await captureMockupThumbnail(adjusted);
    props.onMarkArea(props.previewSet, selected, adjusted, {
      label,
      source: "proposalHighlight",
      viewport,
      highlightId,
      thumbnailDataUrl,
    });
  }

  async function captureMockupThumbnail(areaMark: PlanPreviewAreaMark) {
    const stage = stageRef.current;
    if (!stage || !selected) return undefined;
    const frame = stage.querySelector<HTMLIFrameElement>(".mockup-preview-frame");
    if (!frame) return undefined;
    const stageRect = stage.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const frameLeft = frameRect.left - stageRect.left;
    const frameTop = frameRect.top - stageRect.top;
    const rawX = areaMark.x - frameLeft;
    const rawY = areaMark.y - frameTop;
    const cropX = clamp(rawX, 0, frameRect.width);
    const cropY = clamp(rawY, 0, frameRect.height);
    const cropRight = clamp(rawX + areaMark.width, 0, frameRect.width);
    const cropBottom = clamp(rawY + areaMark.height, 0, frameRect.height);
    const crop = {
      x: cropX,
      y: cropY,
      width: cropRight - cropX,
      height: cropBottom - cropY,
    };
    if (crop.width < 4 || crop.height < 4) return undefined;
    return renderMockupHtmlThumbnail(
      selected.html,
      crop,
      Math.max(1, Math.round(frameRect.width)),
      Math.max(1, Math.round(frameRect.height)),
    );
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

  function adjustedHighlightArea(highlight: ProposalHighlight) {
    const adjustedContext = adjustedHighlightContexts.find(
      (context) => context.highlightId === highlight.id,
    );
    if (adjustedContext) return adjustedContext.areaMark;
    return (
      highlightAdjustments[highlightKey(selected?.id ?? "", highlight.id, viewport)] ??
      highlight.areaMark
    );
  }

  function resetAdjustedHighlights() {
    if (!props.previewSet || !selected) return;
    setHighlightAdjustments((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) => !key.startsWith(`${selected.id}:${viewport}:`),
        ),
      ),
    );
    props.onResetHighlightContexts(props.previewSet, selected, viewport);
  }

  if (!props.previewSet || !selected) {
    const artifactLabel = previewArtifactDisplayName(
      props.previewSet?.artifactKind ?? "mockup",
      2,
      "lower",
    );
    return (
      <div className="mockup-preview-surface empty">
        <strong>No saved {artifactLabel} yet</strong>
        <span>Describe the app first, then choose a proposal-first flow.</span>
      </div>
    );
  }

  const previewSet = props.previewSet;
  const mockupCount = previewSet.mockups.length;
  const artifactTitle = previewArtifactDisplayName(
    previewSet.artifactKind,
    mockupCount,
    "title",
  );
  const liveTabOption: PreviewToolbarSelectOption | null = canShowLive
    ? {
        id: "live",
        label: "Live",
        title: "Current running app",
        active: liveSelected,
        onSelect: () => switchTab("live"),
      }
    : null;
  const proposalTabOptions: PreviewToolbarSelectOption[] =
    previewSet.mockups.map((mockup, index) => ({
      id: mockup.id,
      label: previewArtifactTabLabel(
        previewSet.artifactKind,
        mockup.label || String.fromCharCode(65 + index),
        mockupCount,
      ),
      title: mockup.title,
      active: !liveSelected && mockup.id === selected.id,
      onSelect: () => {
        switchTab("mockup");
        props.onSelect(mockup.id);
      },
    }));
  const tabOptions: PreviewToolbarSelectOption[] = [
    ...(canShowLive
      ? [liveTabOption as PreviewToolbarSelectOption]
      : []),
    ...proposalTabOptions,
  ];
  const liveLaneTabs = liveTabOption ? (
    <MockupLaneTabs ariaLabel="Live lane" options={[liveTabOption]} />
  ) : null;
  const proposalLaneTabs = showTabSelect ? (
    <PreviewToolbarSelect
      ariaLabel="Proposal lanes"
      className="preview-toolbar-tab-select canvas-lane-select"
      options={proposalTabOptions}
    />
  ) : (
    <MockupLaneTabs ariaLabel="Proposal lanes" options={proposalTabOptions} />
  );

  const viewportControls = (
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
  );

  if (liveSelected && props.project) {
    return (
      <div className="mockup-preview-surface">
        <LiveAppPreview
          compareTabOptions={tabOptions}
          project={props.project}
          appPreviewContexts={props.appPreviewContexts}
          statusLabel={historyMode ? "History reference" : "Live app"}
          viewport={viewport}
          onViewportChange={setViewport}
          onAreaMarkChange={(areaMark, meta) =>
            props.project &&
            props.onLiveMarkArea(props.project, areaMark, meta)
          }
        />
      </div>
    );
  }

  return (
    <div className="mockup-preview-surface">
      <header
        className="preview-toolbar mockup-preview-toolbar canvas-lane-toolbar"
        data-density={toolbarDensity}
        ref={toolbarRef}
      >
        {liveLaneTabs && (
          <div className="canvas-lane-row live">
            <div className="preview-toolbar-left">
              <div className="preview-title-row">
                <strong>Live</strong>
                <span>{historyMode ? "History reference" : "Current app"}</span>
              </div>
              <div className="preview-chip-row">
                <span>Open Live to use app controls</span>
              </div>
            </div>
            <div className="preview-toolbar-tabs">{liveLaneTabs}</div>
          </div>
        )}
        <div className="canvas-lane-row proposals active">
          <div className="preview-toolbar-left">
            <div className="preview-title-row">
              <strong>Proposals</strong>
              <span>{historyMode ? "History" : "Selected"}</span>
            </div>
            <div className="preview-chip-row">
              {showTitleChip && <span title={selected.title}>{selected.title}</span>}
              {showSummaryChip && (selected.summary || selected.filePath) && (
                <span title={selected.summary || selected.filePath}>
                  {selected.summary || selected.filePath}
                </span>
              )}
              {!showTitleChip && !showSummaryChip && (
                <span>{canShowLive ? selected.title : `${artifactTitle} preview`}</span>
              )}
            </div>
          </div>
          <div className="preview-toolbar-tabs">{proposalLaneTabs}</div>
          <div className="preview-actions mockup-preview-actions">
            {showChangesInline && (
              <button
                aria-label={
                  hasSelectedHighlights
                    ? showHighlights
                      ? "Hide change areas"
                      : "Show change areas"
                    : "No saved change highlights for this option"
                }
                className={`ghost-button ${
                  showChangesIconOnly ? "icon-only" : ""
                }`}
                disabled={!hasSelectedHighlights}
                onClick={() => {
                  if (!hasSelectedHighlights) return;
                  setShowHighlights((current) => !current);
                }}
                title={
                  hasSelectedHighlights
                    ? showHighlights
                      ? "Hide change areas"
                      : "Show change areas"
                    : "No saved change highlights for this option"
                }
                type="button"
              >
                {showHighlights ? <EyeOff size={15} /> : <Eye size={15} />}
                {!showChangesIconOnly && changesActionLabel}
              </button>
            )}
            {showMarkInline && (
              <button
                className={marking ? "ghost-button active" : "ghost-button"}
                onClick={() => {
                  setMarking((current) => !current);
                  setDraftMark(null);
                }}
                title={`Mark an area in this ${previewArtifactDisplayName(
                  previewSet.artifactKind,
                  1,
                  "lower",
                )}`}
                type="button"
              >
                <MousePointer2 size={15} /> {markActionLabel}
              </button>
            )}
            {showResetInline && (
              <button
                className="ghost-button"
                onClick={resetAdjustedHighlights}
                type="button"
              >
                <RotateCcw size={15} /> {resetActionLabel}
              </button>
            )}
            {showBuildInline && (
              <button
                className="ghost-button"
                onClick={() =>
                  props.onBuild(props.previewSet as MockupPreviewSet, selected)
                }
                type="button"
              >
                <Hammer size={15} /> {buildActionLabel}
              </button>
            )}
            {showMoreMenu && (
            <div className="mockup-preview-more" ref={moreMenuRef}>
              <button
                aria-expanded={moreMenuOpen}
                aria-label="More actions"
                className="more-actions-button"
                onClick={() => setMoreMenuOpen((current) => !current)}
                title="More actions"
                type="button"
              >
                <MoreHorizontal size={16} />
              </button>
              {moreMenuOpen && (
                <div className="more-actions-menu">
                  {showChangesInMenu && (
                    <button
                      onClick={() => {
                        if (!hasSelectedHighlights) return;
                        setShowHighlights((current) => !current);
                        setMoreMenuOpen(false);
                      }}
                      disabled={!hasSelectedHighlights}
                      type="button"
                    >
                      {showHighlights ? <EyeOff size={15} /> : <Eye size={15} />}
                      {!hasSelectedHighlights
                        ? "No changes"
                        : showHighlights
                          ? "Hide changes"
                          : "Show changes"}
                    </button>
                  )}
                  {showMarkInMenu && (
                    <button
                      onClick={() => {
                        setMarking((current) => !current);
                        setDraftMark(null);
                        setMoreMenuOpen(false);
                      }}
                      type="button"
                    >
                      <MousePointer2 size={15} />
                      {marking ? "Stop marking" : "Mark area"}
                    </button>
                  )}
                  {showResetInMenu && (
                    <button
                      onClick={() => {
                        resetAdjustedHighlights();
                        setMoreMenuOpen(false);
                      }}
                      type="button"
                    >
                      <RotateCcw size={15} /> Reset changes
                    </button>
                  )}
                  {showBuildInMenu && (
                  <button
                    onClick={() => {
                      setMoreMenuOpen(false);
                      props.onBuild(props.previewSet as MockupPreviewSet, selected);
                    }}
                    type="button"
                  >
                    <Hammer size={15} /> Build selected
                  </button>
                  )}
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      </header>
      <div
        className={`mockup-preview-stage ${viewport} ${marking ? "marking" : ""}`}
        ref={stageRef}
      >
        {viewportControls}
        <div className={`mockup-preview-frame-wrap ${viewport}`}>
          <iframe
            className="mockup-preview-frame"
            sandbox="allow-forms allow-scripts"
            srcDoc={selected.html}
            title={selected.title}
          />
        </div>
        {marking && (
          <div
            className="mockup-preview-mark-capture"
            onPointerDown={beginMark}
            onPointerMove={updateMark}
            onPointerUp={(event) => {
              void finishMark(event);
            }}
          />
        )}
        {showHighlights &&
          selectedHighlights.map((highlight) => (
            <div
              className="mockup-preview-highlight"
              key={`${highlight.id}:${viewport}`}
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
                className="mockup-preview-highlight-handle"
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
        {selectedMarks.map((mark) => (
          <div
            className="mockup-preview-mark"
            key={mark.id}
            style={markStyle(mark.areaMark)}
          >
            <span>{mark.markLabel}</span>
          </div>
        ))}
        {draftMark && (
          <div
            className="mockup-preview-mark draft"
            style={draftMarkStyle(draftMark)}
          />
        )}
      </div>
    </div>
  );
}

function MockupLaneTabs(props: {
  ariaLabel: string;
  options: PreviewToolbarSelectOption[];
}) {
  return (
    <div
      className="preview-segmented live-preview-options canvas-lane-tabs"
      aria-label={props.ariaLabel}
    >
      {props.options.map((option) => (
        <button
          aria-current={option.active ? "true" : undefined}
          className={option.active ? "active" : ""}
          key={option.id}
          onClick={option.onSelect}
          title={option.title || option.label}
          type="button"
        >
          {option.label}
          <span aria-hidden="true" className="canvas-lane-dot" />
        </button>
      ))}
    </div>
  );
}

function draftMarkStyle(mark: DraftMark) {
  const x = Math.min(mark.startX, mark.currentX);
  const y = Math.min(mark.startY, mark.currentY);
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${Math.abs(mark.currentX - mark.startX)}px`,
    height: `${Math.abs(mark.currentY - mark.startY)}px`,
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
  mockupId: string,
  highlightId: string,
  viewport: "desktop" | "mobile",
) {
  return `${mockupId}:${viewport}:${highlightId}`;
}

function sameAreaMark(left: PlanPreviewAreaMark, right: PlanPreviewAreaMark) {
  return (
    Math.round(left.x) === Math.round(right.x) &&
    Math.round(left.y) === Math.round(right.y) &&
    Math.round(left.width) === Math.round(right.width) &&
    Math.round(left.height) === Math.round(right.height)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function renderMockupHtmlThumbnail(
  html: string,
  crop: { x: number; y: number; width: number; height: number },
  sourceWidth: number,
  sourceHeight: number,
) {
  try {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const serializer = new XMLSerializer();
    const styleMarkup = Array.from(parsed.head.querySelectorAll("style"))
      .map((style) => serializer.serializeToString(style))
      .join("");
    const bodyMarkup = Array.from(parsed.body.childNodes)
      .map((node) => serializer.serializeToString(node))
      .join("");
    const bodyClass = escapeXmlAttribute(parsed.body.className || "");
    const bodyStyle = escapeXmlAttribute(parsed.body.getAttribute("style") || "");
    const documentMarkup = `
      <body xmlns="http://www.w3.org/1999/xhtml"
        class="${bodyClass}"
        style="margin:0;width:${sourceWidth}px;min-height:${sourceHeight}px;overflow:hidden;${bodyStyle}">
        <style>
          html, body { margin: 0; width: ${sourceWidth}px; min-height: ${sourceHeight}px; overflow: hidden; }
          * { box-sizing: border-box; }
        </style>
        ${styleMarkup}
        ${bodyMarkup}
      </body>
    `;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${sourceWidth}" height="${sourceHeight}" viewBox="0 0 ${sourceWidth} ${sourceHeight}">
        <foreignObject width="100%" height="100%">${documentMarkup}</foreignObject>
      </svg>
    `;
    const image = await loadThumbnailImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
    const targetWidth = 220;
    const targetHeight = clamp(
      Math.round(targetWidth * (crop.height / crop.width)),
      96,
      160,
    );
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    context.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      targetWidth,
      targetHeight,
    );
    return canvas.toDataURL("image/jpeg", 0.76);
  } catch {
    return undefined;
  }
}

function loadThumbnailImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to render mockup thumbnail"));
    image.src = src;
  });
}

function escapeXmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
