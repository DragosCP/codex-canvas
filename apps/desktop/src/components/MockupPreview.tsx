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
  appPreviewAreaMark: ComposerAppPreviewContext["areaMark"] | null;
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
  const showViewportSelect = toolbarWidth < 950;
  const showViewportIconOnly = toolbarWidth < 790;
  const useCompactActionLabels = toolbarWidth < 860;
  const overflowBuildAction = toolbarWidth < 670;
  const overflowResetAction = toolbarWidth < 620;
  const overflowChangesAction = toolbarWidth < 620;
  const showTabSelect = toolbarWidth < 440;
  const overflowMarkAction = toolbarWidth < 500;
  const selectedHighlights = selected?.highlights ?? [];
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
    selectedHighlights.length > 0 &&
    !overflowChangesAction;
  const showResetInline =
    hasAdjustedHighlights && !overflowResetAction;
  const showChangesInMenu =
    selectedHighlights.length > 0 && !showChangesInline;
  const showResetInMenu = hasAdjustedHighlights && !showResetInline;
  const showBuildInline = !historyMode && !overflowBuildAction;
  const showBuildInMenu = !historyMode && overflowBuildAction;
  const showMarkInline = !overflowMarkAction;
  const showMarkInMenu = overflowMarkAction;
  const markActionLabel =
    useCompactActionLabels && toolbarWidth < 760 ? "Mark" : "Mark area";
  const changesActionLabel = showHighlights ? "Hide" : "Changes";
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

  function finishMark(event: PointerEvent<HTMLDivElement>) {
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
    props.onMarkArea(props.previewSet, selected, areaMark, { viewport });
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

  function finishHighlightAdjust(
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
    setHighlightDrag(null);
    if (!moved) return;
    props.onMarkArea(props.previewSet, selected, adjusted, {
      label: highlightDrag.label,
      source: "proposalHighlight",
      viewport,
      highlightId: highlightDrag.highlightId,
    });
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
  const tabOptions: PreviewToolbarSelectOption[] = [
    ...(canShowLive
      ? [
          {
            id: "live",
            label: "Live",
            title: "Current running app",
            active: liveSelected,
            onSelect: () => switchTab("live"),
          },
        ]
      : []),
    ...previewSet.mockups.map((mockup, index) => ({
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
    })),
  ];
  const tabs = showTabSelect ? (
    <PreviewToolbarSelect
      ariaLabel="Preview options"
      className="preview-toolbar-tab-select"
      options={tabOptions}
    />
  ) : (
    <div className="preview-segmented" aria-label="Preview options">
      {canShowLive && (
        <button
          className={liveSelected ? "active" : ""}
          onClick={() => switchTab("live")}
          title="Current running app"
          type="button"
        >
          Live
        </button>
      )}
      {previewSet.mockups.map((mockup, index) => (
        <button
          className={!liveSelected && mockup.id === selected.id ? "active" : ""}
          key={mockup.id}
          onClick={() => {
            switchTab("mockup");
            props.onSelect(mockup.id);
          }}
          title={mockup.title}
          type="button"
        >
          {previewArtifactTabLabel(
            previewSet.artifactKind,
            mockup.label || String.fromCharCode(65 + index),
            mockupCount,
          )}
        </button>
      ))}
    </div>
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
  const viewportControls = showViewportSelect ? (
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

  if (liveSelected && props.project) {
    return (
      <div className="mockup-preview-surface">
        <LiveAppPreview
          compareTabOptions={tabOptions}
          project={props.project}
          areaMark={props.appPreviewAreaMark}
          compareTabs={tabs}
          statusLabel={historyMode ? "History reference" : "Live app"}
          titleLabel="Compare"
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
        className="preview-toolbar mockup-preview-toolbar"
        data-density={toolbarDensity}
        ref={toolbarRef}
      >
        <div className="preview-toolbar-left">
          <div className="preview-title-row">
            <strong>{canShowLive ? "Compare" : `${artifactTitle} preview`}</strong>
            <span>{historyMode ? "History" : "Proposal"}</span>
          </div>
          <div className="preview-chip-row">
            {showTitleChip && <span title={selected.title}>{selected.title}</span>}
            {showSummaryChip && (selected.summary || selected.filePath) && (
              <span title={selected.summary || selected.filePath}>
                {selected.summary || selected.filePath}
              </span>
            )}
          </div>
        </div>
        <div className="preview-toolbar-tabs">{tabs}</div>
        {!liveSelected && (
          <div className="preview-actions mockup-preview-actions">
            {viewportControls}
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
            {showChangesInline && (
              <button
                className="ghost-button"
                onClick={() => setShowHighlights((current) => !current)}
                title={showHighlights ? "Hide change areas" : "Show change areas"}
                type="button"
              >
                {showHighlights ? <EyeOff size={15} /> : <Eye size={15} />}
                {changesActionLabel}
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
                  {showChangesInMenu && (
                    <button
                      onClick={() => {
                        setShowHighlights((current) => !current);
                        setMoreMenuOpen(false);
                      }}
                      type="button"
                    >
                      {showHighlights ? <EyeOff size={15} /> : <Eye size={15} />}
                      {showHighlights ? "Hide changes" : "Show changes"}
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
        )}
      </header>
      <div
        className={`mockup-preview-stage ${viewport} ${marking ? "marking" : ""}`}
        ref={stageRef}
      >
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
            onPointerUp={finishMark}
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
              onPointerUp={finishHighlightAdjust}
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
                onPointerUp={finishHighlightAdjust}
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
