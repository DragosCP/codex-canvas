import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Info,
  Layers,
  LockKeyhole,
  LockKeyholeOpen,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  Plus,
  RectangleHorizontal,
  Redo2,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  Type as TypeIcon,
} from "lucide-react";
import {
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  type WheelEvent as ReactWheelEvent,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CANVAS_ITEM_STATE_CONFIG,
  CANVAS_ITEM_STATE_ORDER,
  createCanvasItem,
} from "../canvasState";
import type {
  CanvasDevice,
  CanvasItem,
  CanvasItemKind,
  CanvasItemState,
  CanvasPage,
  Project,
  ProjectCanvas,
} from "../types";

type DragState = {
  itemId: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  original: CanvasItem;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type ViewportState = {
  scale: number;
  panX: number;
  panY: number;
};

type ContextMenuState =
  | {
      type: "item";
      itemId: string;
      x: number;
      y: number;
    }
  | {
      type: "stage";
      canvasX: number;
      canvasY: number;
      x: number;
      y: number;
    };

const MAX_UNDO_STEPS = 40;
const TITLE_MAX_LENGTH = 36;
const BODY_MAX_LENGTH = 180;
const COMMENT_MAX_LENGTH = 280;
const CANVAS_GRID_SIZE = 28;
const FIT_VIEW_PADDING = 48;
const CANVAS_WORLD_WIDTH = 2400;
const CANVAS_WORLD_HEIGHT = 1600;
const MIN_CANVAS_SCALE = 0.35;
const MAX_CANVAS_SCALE = 2.4;
const WHEEL_ZOOM_SPEED = 0.0015;
const PINCH_ZOOM_SPEED = 1.5;
const TRACKPAD_SCROLL_DELTA_LIMIT = 64;
const HORIZONTAL_PAN_RATIO = 0.35;
const DEFAULT_VIEWPORT: ViewportState = {
  scale: 1,
  panX: 0,
  panY: 0,
};

const canvasTools: Array<{
  kind: CanvasItemKind;
  label: string;
  icon: typeof Square;
}> = [
  { kind: "container", label: "Container", icon: Square },
  { kind: "text", label: "Text", icon: TypeIcon },
  { kind: "modal", label: "Modal", icon: FileText },
  { kind: "divider", label: "Divider", icon: Minus },
  { kind: "button", label: "Button", icon: RectangleHorizontal },
];

export function CanvasInspector(props: {
  canvas: ProjectCanvas;
  project: Project;
  readOnly: boolean;
  onChange: (canvas: ProjectCanvas) => void;
  onRequestGenerateMockup: (project: Project) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    props.canvas.items[0]?.id ?? null,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [undoStack, setUndoStack] = useState<ProjectCanvas[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectCanvas[]>([]);
  const stageRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const pages = useMemo(
    () => [...props.canvas.pages].sort((left, right) => left.order - right.order),
    [props.canvas.pages],
  );
  const selectedItem = useMemo(
    () => props.canvas.items.find((item) => item.id === selectedId) ?? null,
    [props.canvas.items, selectedId],
  );
  const scopedItems = useMemo(
    () => scopeItems(props.canvas),
    [props.canvas],
  );
  const stageItems = scopedItems
    .filter((item) => item.visible)
    .sort((left, right) => left.zIndex - right.zIndex);
  const layers = [...scopedItems].sort(compareLayerItems);
  const contextMenuItem =
    contextMenu?.type === "item"
      ? props.canvas.items.find((item) => item.id === contextMenu.itemId) ?? null
      : null;

  useEffect(() => {
    if (!selectedId) return;
    if (!scopedItems.some((item) => item.id === selectedId)) {
      setSelectedId(scopedItems[0]?.id ?? null);
    }
  }, [scopedItems, selectedId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedId(null);
        setSpacePanActive(false);
      }
      if (event.code === "Space" && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        setSpacePanActive(true);
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !isTextEditingTarget(event.target) &&
        selectedItem
      ) {
        event.preventDefault();
        deleteItem(selectedItem);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas();
        else undoCanvas();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoCanvas();
      }
    }
    function handleKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") setSpacePanActive(false);
    }
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [props.canvas, redoStack, selectedItem, undoStack]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setViewport(DEFAULT_VIEWPORT);
    setPan(null);
    setContextMenu(null);
  }, [props.canvas.projectId]);

  useEffect(() => {
    if (!contextMenu) return;
    function handlePointerDown(event: globalThis.PointerEvent) {
      if (
        event.target instanceof Node &&
        contextMenuRef.current?.contains(event.target)
      ) {
        return;
      }
      setContextMenu(null);
    }
    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setContextMenu(null);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    function preventWebViewPageZoom(event: WheelEvent) {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    }

    window.addEventListener("wheel", preventWebViewPageZoom, {
      capture: true,
      passive: false,
    });
    return () => {
      window.removeEventListener("wheel", preventWebViewPageZoom, {
        capture: true,
      });
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let lastGestureScale = 1;

    function handleGestureStart(event: Event) {
      event.preventDefault();
      lastGestureScale = gestureScale(event);
    }

    function handleGestureChange(event: Event) {
      event.preventDefault();
      const rect = stage?.getBoundingClientRect();
      if (!rect) return;
      const nextScale = gestureScale(event);
      const rawFactor = nextScale / lastGestureScale;
      const factor = Math.pow(rawFactor, PINCH_ZOOM_SPEED);
      lastGestureScale = nextScale;
      const point = gesturePoint(event, rect);
      zoomAtPoint(point.x, point.y, factor);
    }

    function handleGestureEnd() {
      lastGestureScale = 1;
    }

    const options: AddEventListenerOptions = { passive: false };
    stage.addEventListener("gesturestart", handleGestureStart, options);
    stage.addEventListener("gesturechange", handleGestureChange, options);
    stage.addEventListener("gestureend", handleGestureEnd, options);
    return () => {
      stage.removeEventListener("gesturestart", handleGestureStart, options);
      stage.removeEventListener("gesturechange", handleGestureChange, options);
      stage.removeEventListener("gestureend", handleGestureEnd, options);
    };
  });

  function commitCanvas(
    patch: Partial<ProjectCanvas>,
    options: { recordHistory?: boolean } = {},
  ) {
    const recordHistory = options.recordHistory ?? true;
    if (recordHistory) pushUndoSnapshot();
    props.onChange({
      ...props.canvas,
      ...patch,
      updatedAt: Date.now(),
    });
  }

  function commitItems(
    items: CanvasItem[],
    options: { recordHistory?: boolean } = {},
  ) {
    commitCanvas({ items }, options);
  }

  function updateItem(
    itemId: string,
    patch: Partial<CanvasItem>,
    options: { recordHistory?: boolean } = {},
  ) {
    const now = Date.now();
    commitItems(
      props.canvas.items.map((item) =>
        item.id === itemId ? { ...item, ...patch, updatedAt: now } : item,
      ),
      options,
    );
  }

  function pushUndoSnapshot() {
    if (props.readOnly) return;
    setUndoStack((current) => [
      ...current.slice(Math.max(0, current.length - MAX_UNDO_STEPS + 1)),
      props.canvas,
    ]);
    setRedoStack([]);
  }

  function undoCanvas() {
    if (props.readOnly || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [
      ...current.slice(Math.max(0, current.length - MAX_UNDO_STEPS + 1)),
      props.canvas,
    ]);
    props.onChange({ ...previous, updatedAt: Date.now() });
    if (selectedId && !previous.items.some((item) => item.id === selectedId)) {
      setSelectedId(previous.items[0]?.id ?? null);
    }
  }

  function redoCanvas() {
    if (props.readOnly || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [
      ...current.slice(Math.max(0, current.length - MAX_UNDO_STEPS + 1)),
      props.canvas,
    ]);
    props.onChange({ ...next, updatedAt: Date.now() });
    if (selectedId && !next.items.some((item) => item.id === selectedId)) {
      setSelectedId(next.items[0]?.id ?? null);
    }
  }

  function addItem(kind: CanvasItemKind, point?: { x: number; y: number }) {
    if (props.readOnly) return;
    const scope = itemScope(props.canvas);
    const item = createCanvasItem({
      canvas: props.canvas,
      kind,
      state: "proposed",
      pageId: scope.pageId,
      device: scope.device,
      x: point?.x,
      y: point?.y,
    });
    commitItems([...props.canvas.items, item]);
    setSelectedId(item.id);
  }

  function addPage() {
    if (props.readOnly) return;
    const order = pages.length;
    const page: CanvasPage = {
      id: crypto.randomUUID(),
      name: `Page ${order + 1}`,
      order,
    };
    commitCanvas({
      pages: [...props.canvas.pages, page],
      activePageId: page.id,
      mode: "ui",
    });
    setSelectedId(null);
  }

  function switchPage(pageId: string) {
    if (props.canvas.activePageId === pageId) return;
    commitCanvas({ activePageId: pageId, mode: "ui" });
    setSelectedId(null);
  }

  function deleteItem(item: CanvasItem) {
    if (props.readOnly) return;
    if (item.state === "deleted") return;
    if (!CANVAS_ITEM_STATE_CONFIG[item.state].canDeleteDirectly) {
      updateItem(item.id, { state: "deleted", locked: true, visible: true });
      return;
    }
    commitItems(props.canvas.items.filter((candidate) => candidate.id !== item.id));
    if (selectedId === item.id) setSelectedId(null);
  }

  function duplicateItem(item: CanvasItem) {
    if (props.readOnly) return;
    const duplicate = createCanvasItem({
      canvas: props.canvas,
      kind: item.kind,
      state: "proposed",
      pageId: item.pageId,
      device: item.device,
      x: item.x + 28,
      y: item.y + 28,
    });
    const next = {
      ...duplicate,
      title: item.title,
      body: item.body,
      width: item.width,
      height: item.height,
      comment: item.comment,
      zIndex: nextZIndex(props.canvas.items),
    };
    commitItems([...props.canvas.items, next]);
    setSelectedId(next.id);
  }

  function bringItemToFront(item: CanvasItem) {
    if (props.readOnly) return;
    updateItem(item.id, { zIndex: nextZIndex(props.canvas.items) });
  }

  function sendItemToBack(item: CanvasItem) {
    if (props.readOnly) return;
    updateItem(item.id, { zIndex: previousZIndex(props.canvas.items) });
  }

  function openItemMenu(
    event: ReactMouseEvent<HTMLDivElement>,
    item: CanvasItem,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    setContextMenu({
      type: "item",
      itemId: item.id,
      ...contextMenuPosition(event.clientX, event.clientY),
    });
  }

  function openStageMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = stagePointToCanvas(
      event.clientX - rect.left,
      event.clientY - rect.top,
      viewport,
    );
    setContextMenu({
      type: "stage",
      canvasX: Math.max(8, Math.round(point.x)),
      canvasY: Math.max(8, Math.round(point.y)),
      ...contextMenuPosition(event.clientX, event.clientY),
    });
  }

  function runContextAction(action: () => void) {
    action();
    setContextMenu(null);
  }

  function beginDrag(
    event: PointerEvent<HTMLDivElement>,
    item: CanvasItem,
    mode: DragState["mode"],
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    if (props.readOnly || item.locked) return;
    pushUndoSnapshot();
    const focusedItem = itemWithFocusedZIndex(item, props.canvas.items);
    if (focusedItem.zIndex !== item.zIndex) {
      updateItem(item.id, { zIndex: focusedItem.zIndex }, { recordHistory: false });
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      itemId: item.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      original: focusedItem,
    });
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const dx = (event.clientX - drag.startX) / viewport.scale;
    const dy = (event.clientY - drag.startY) / viewport.scale;
    const next =
      drag.mode === "move"
        ? {
            x: Math.max(8, Math.round(drag.original.x + dx)),
            y: Math.max(8, Math.round(drag.original.y + dy)),
          }
        : resizePatch(drag.original, dx, dy);
    updateItem(drag.itemId, {
      ...next,
      ...movementPatch(drag.original),
      zIndex: drag.original.zIndex,
    }, { recordHistory: false });
  }

  function beginPan(event: PointerEvent<HTMLElement>, force = false) {
    if (!force && !shouldStartPan(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPan({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.panX,
      originY: viewport.panY,
    });
  }

  function continuePan(event: PointerEvent<HTMLElement>) {
    if (!pan || pan.pointerId !== event.pointerId) return;
    setViewport((current) => ({
      ...current,
      panX: pan.originX + event.clientX - pan.startX,
      panY: pan.originY + event.clientY - pan.startY,
    }));
  }

  function endPointer() {
    setDrag(null);
    setPan(null);
  }

  function continuePointer(event: PointerEvent<HTMLDivElement>) {
    continueDrag(event);
    continuePan(event);
  }

  function handleWheel(event: ReactWheelEvent<HTMLElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    if (shouldWheelPan(event)) {
      setViewport((current) => ({
        ...current,
        panX: current.panX - event.deltaX,
        panY: current.panY - event.deltaY,
      }));
      return;
    }
    const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);
    zoomAtPoint(event.clientX - rect.left, event.clientY - rect.top, factor);
  }

  function zoomAtPoint(stageX: number, stageY: number, factor: number) {
    setViewport((current) => {
      const scale = clamp(
        current.scale * factor,
        MIN_CANVAS_SCALE,
        MAX_CANVAS_SCALE,
      );
      const canvasX = (stageX - current.panX) / current.scale;
      const canvasY = (stageY - current.panY) / current.scale;
      return {
        scale,
        panX: stageX - canvasX * scale,
        panY: stageY - canvasY * scale,
      };
    });
  }

  function zoomFromCenter(factor: number) {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAtPoint(rect.width / 2, rect.height / 2, factor);
  }

  function resetViewport() {
    const rect = stageRef.current?.getBoundingClientRect();
    const bounds = visibleCanvasBounds(stageItems);
    if (!rect || !bounds) {
      setViewport(DEFAULT_VIEWPORT);
      setPan(null);
      return;
    }
    setViewport(fitBoundsToStage(bounds, rect));
    setPan(null);
  }

  function beginToolDrag(event: DragEvent<HTMLButtonElement>, kind: CanvasItemKind) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-codex-canvas-tool", kind);
  }

  function dropTool(event: DragEvent<HTMLDivElement>) {
    const kind = event.dataTransfer.getData(
      "application/x-codex-canvas-tool",
    ) as CanvasItemKind;
    if (!canvasTools.some((tool) => tool.kind === kind)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = stagePointToCanvas(
      event.clientX - rect.left,
      event.clientY - rect.top,
      viewport,
    );
    addItem(kind, {
      x: Math.max(8, Math.round(point.x - 24)),
      y: Math.max(8, Math.round(point.y - 18)),
    });
  }

  return (
    <div className="canvas-inspector phase-two">
      <div className={`canvas-workspace ${props.canvas.mode}`}>
        {props.canvas.mode === "ui" && (
          <nav className="canvas-page-rail" aria-label="Canvas pages">
            {pages.map((page, index) => (
              <button
                key={page.id}
                className={page.id === props.canvas.activePageId ? "active" : ""}
                onClick={() => switchPage(page.id)}
                title={page.name}
                type="button"
              >
                <span>P{index + 1}</span>
              </button>
            ))}
            <button
              className="canvas-page-add"
              disabled={props.readOnly}
              onClick={addPage}
              title="Add page"
              type="button"
            >
              <Plus size={15} />
            </button>
          </nav>
        )}

        <section className="canvas-main">
          <div className="canvas-tool-strip" aria-label="Canvas tools">
            {canvasTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.kind}
                  aria-label={tool.label}
                  disabled={props.readOnly}
                  draggable={!props.readOnly}
                  onClick={() => addItem(tool.kind)}
                  onDragStart={(event) => beginToolDrag(event, tool.kind)}
                  title={tool.label}
                  type="button"
                >
                  <Icon size={16} />
                </button>
              );
            })}
            <span className="canvas-tool-spacer" />
            <button
              aria-label="Zoom out"
              onClick={() => zoomFromCenter(0.85)}
              title="Zoom out"
              type="button"
            >
              <ZoomOut size={15} />
            </button>
            <button
              aria-label="Reset view"
              onClick={resetViewport}
              title="Reset view"
              type="button"
            >
              <Maximize2 size={15} />
            </button>
            <button
              aria-label="Zoom in"
              onClick={() => zoomFromCenter(1.18)}
              title="Zoom in"
              type="button"
            >
              <ZoomIn size={15} />
            </button>
            <button
              aria-label="Undo"
              disabled={props.readOnly || undoStack.length === 0}
              onClick={undoCanvas}
              title="Undo"
              type="button"
            >
              <Undo2 size={15} />
            </button>
            <button
              aria-label="Redo"
              disabled={props.readOnly || redoStack.length === 0}
              onClick={redoCanvas}
              title="Redo"
              type="button"
            >
              <Redo2 size={15} />
            </button>
          </div>
          <section
            className={`canvas-stage ${props.canvas.mode} ${
              pan ? "panning" : spacePanActive ? "pan-ready" : ""
            }`}
            ref={stageRef}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropTool}
            onPointerDown={beginPan}
            onPointerMove={continuePointer}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={handleWheel}
            onContextMenu={openStageMenu}
          >
            {scopedItems.length === 0 && (
              <div className="canvas-empty">
                <MousePointer2 size={18} />
                <strong>
                  {props.canvas.mode === "ui"
                    ? "Map this page"
                    : "Map project ownership"}
                </strong>
                <span>
                  {props.canvas.mode === "ui"
                    ? "Drop a container, text, modal, divider, or button onto the grid."
                    : "Backend mapping stays general, not per page."}
                </span>
                {props.canvas.mode === "ui" && (
                  <button
                    disabled={props.readOnly}
                    onClick={() => props.onRequestGenerateMockup(props.project)}
                    type="button"
                  >
                    <Sparkles size={15} /> Generate current UI mockup
                  </button>
                )}
              </div>
            )}
            <div
              className="canvas-viewport"
              style={{
                transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.scale})`,
                width: CANVAS_WORLD_WIDTH,
                height: CANVAS_WORLD_HEIGHT,
              }}
            >
              <div className="canvas-grid" />
              {stageItems
                .filter(hasOriginalGeometry)
                .map((item) => (
                  <CanvasOriginGhost item={item} key={`${item.id}-origin`} />
                ))}
              {stageItems.map((item) => {
                const selected = item.id === selectedId;
                return (
                  <CanvasStageItem
                    item={item}
                    key={item.id}
                    onBeginDrag={beginDrag}
                    onBeginPan={beginPan}
                    onOpenContextMenu={openItemMenu}
                    selected={selected}
                    spacePanActive={spacePanActive}
                  />
                );
              })}
            </div>
          </section>
        </section>

        <aside className="canvas-side-panel">
          <section className="canvas-layers">
            <div className="canvas-panel-heading">
              <span>
                <Layers size={14} />
                Layers
              </span>
              <button
                aria-expanded={legendOpen}
                className="canvas-info-button"
                onClick={() => setLegendOpen((open) => !open)}
                title="Layer color guide"
                type="button"
              >
                <Info size={13} />
              </button>
            </div>
            {legendOpen && <LayerLegend />}
            {layers.length === 0 ? (
              <p className="muted compact">No layers on this view.</p>
            ) : (
              <div className="canvas-layer-list">
                {layers.map((item) => (
                  <LayerRows
                    item={item}
                    key={item.id}
                    onDelete={() => deleteItem(item)}
                    onSelect={() => setSelectedId(item.id)}
                    onToggleLock={() =>
                      updateItem(item.id, { locked: !item.locked })
                    }
                    onToggleVisible={() =>
                      updateItem(item.id, { visible: !item.visible })
                    }
                    readOnly={props.readOnly}
                    selected={item.id === selectedId}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={`canvas-details ${detailsOpen ? "open" : ""}`}>
            <button
              aria-expanded={detailsOpen}
              className="canvas-details-toggle"
              onClick={() => setDetailsOpen((open) => !open)}
              type="button"
            >
              {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Details
            </button>
            {detailsOpen &&
              (selectedItem ? (
                <CanvasDetails
                  item={selectedItem}
                  onApplyPosition={() =>
                    updateItem(selectedItem.id, applyPlacementPatch(selectedItem))
                  }
                  onUpdate={(patch) => updateItem(selectedItem.id, patch)}
                  readOnly={props.readOnly}
                />
              ) : (
                <p className="muted compact">
                  Select a layer or item to edit the name, note, and position.
                </p>
              ))}
          </section>
        </aside>
      </div>
      {contextMenu && (
        <CanvasContextMenu
          item={contextMenuItem}
          menu={contextMenu}
          onAddItem={(kind, point) => runContextAction(() => addItem(kind, point))}
          onApplyPosition={(item) =>
            runContextAction(() =>
              updateItem(item.id, applyPlacementPatch(item)),
            )
          }
          onBringToFront={(item) =>
            runContextAction(() => bringItemToFront(item))
          }
          onChangeState={(item, state) =>
            runContextAction(() => updateItem(item.id, statePatchForItem(item, state)))
          }
          onClose={() => setContextMenu(null)}
          onDelete={(item) => runContextAction(() => deleteItem(item))}
          onDuplicate={(item) => runContextAction(() => duplicateItem(item))}
          onResetPosition={(item) =>
            runContextAction(() => updateItem(item.id, resetPlacementPatch(item)))
          }
          onSendToBack={(item) => runContextAction(() => sendItemToBack(item))}
          onToggleLock={(item) =>
            runContextAction(() => updateItem(item.id, { locked: !item.locked }))
          }
          readOnly={props.readOnly}
          ref={contextMenuRef}
        />
      )}
    </div>
  );
}

function CanvasStageItem(props: {
  item: CanvasItem;
  selected: boolean;
  spacePanActive: boolean;
  onBeginDrag: (
    event: PointerEvent<HTMLDivElement>,
    item: CanvasItem,
    mode: DragState["mode"],
  ) => void;
  onBeginPan: (event: PointerEvent<HTMLElement>, force?: boolean) => void;
  onOpenContextMenu: (
    event: ReactMouseEvent<HTMLDivElement>,
    item: CanvasItem,
  ) => void;
}) {
  const Icon = iconForKind(props.item.kind);
  const compact = isCompactItem(props.item);
  const dimensions = displayDimensions(props.item);
  return (
    <div
      className={`canvas-item ${props.item.kind} ${props.item.state} ${
        props.selected ? "selected" : ""
      } ${props.item.locked ? "locked" : ""} ${
        hasOriginalGeometry(props.item) ? "changed-position" : ""
      } ${compact ? "compact-label" : ""}`}
      role="button"
      style={{
        transform: `translate(${props.item.x}px, ${props.item.y}px)`,
        width: dimensions.width,
        height: dimensions.height,
        zIndex: props.item.zIndex,
      }}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button === 2) return;
        if (event.button === 1 || props.spacePanActive) {
          props.onBeginPan(event, props.spacePanActive);
          return;
        }
        props.onBeginDrag(event, props.item, "move");
      }}
      onContextMenu={(event) => props.onOpenContextMenu(event, props.item)}
    >
      <div className="canvas-item-header">
        <Icon size={13} />
        <strong>
          <span>{props.item.reference}</span>
          {props.item.title}
        </strong>
      </div>
      {props.item.kind !== "divider" && (
        <p>{compact ? compactItemLabel(props.item) : props.item.body || props.item.title}</p>
      )}
      {!props.item.locked && (
        <div
          className="canvas-resize-handle"
          onPointerDown={(event) => props.onBeginDrag(event, props.item, "resize")}
        />
      )}
    </div>
  );
}

function CanvasOriginGhost(props: {
  item: CanvasItem & { originalX: number; originalY: number };
}) {
  return (
    <div
      aria-hidden="true"
      className="canvas-origin-ghost"
      style={{
        transform: `translate(${props.item.originalX}px, ${props.item.originalY}px)`,
        width: props.item.originalWidth ?? props.item.width,
        height: props.item.originalHeight ?? props.item.height,
        zIndex: Math.max(0, props.item.zIndex - 1),
      }}
    >
      <span>{props.item.reference}</span>
    </div>
  );
}

function LayerRows(props: {
  item: CanvasItem;
  selected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const moved = hasOriginalGeometry(props.item);
  return (
    <div className={`canvas-layer-group ${moved ? "changed-position" : ""}`}>
      {moved && (
        <div className="canvas-layer-row origin">
          <button
            onClick={props.onSelect}
            title={`${props.item.reference} original position`}
            type="button"
          >
            <span className="canvas-layer-reference">{props.item.reference}</span>
            <span>Original position</span>
          </button>
        </div>
      )}
      <LayerRow {...props} shifted={moved} />
    </div>
  );
}

function LayerRow(props: {
  item: CanvasItem;
  selected: boolean;
  shifted?: boolean;
  readOnly: boolean;
  onSelect: () => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`canvas-layer-row ${props.item.state} ${
        props.selected ? "selected" : ""
      } ${props.shifted ? "shifted" : ""}`}
    >
      <button
        onClick={props.onSelect}
        title={`${props.item.reference} ${props.item.title}`}
        type="button"
      >
        <span className="canvas-layer-reference">{props.item.reference}</span>
        <span>{props.item.title}</span>
      </button>
      <button
        disabled={props.readOnly}
        onClick={props.onToggleVisible}
        title={props.item.visible ? "Hide layer" : "Show layer"}
        type="button"
      >
        {props.item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
      <button
        disabled={props.readOnly}
        onClick={props.onToggleLock}
        title={lockActionTitle(props.item)}
        type="button"
      >
        <LockBadge locked={props.item.locked} compact />
      </button>
      {props.item.state !== "deleted" && (
        <button
          className={props.item.state === "current" ? "danger" : ""}
          disabled={props.readOnly}
          onClick={props.onDelete}
          title={deleteActionTitle(props.item)}
          type="button"
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function LayerLegend() {
  return (
    <div className="canvas-layer-legend">
      {CANVAS_ITEM_STATE_ORDER.map((state) => (
        <span key={state}>
          <i className={`canvas-layer-swatch ${state}`} />
          {CANVAS_ITEM_STATE_CONFIG[state].description}
        </span>
      ))}
    </div>
  );
}

function LockBadge(props: { locked: boolean; compact?: boolean }) {
  const Icon = props.locked ? LockKeyhole : LockKeyholeOpen;
  return (
    <span
      className={`canvas-lock-badge ${props.locked ? "locked" : "unlocked"} ${
        props.compact ? "compact" : ""
      }`}
      title={props.locked ? "Unlock position" : "Lock position"}
    >
      <Icon size={props.compact ? 12 : 13} />
    </span>
  );
}

function CanvasDetails(props: {
  item: CanvasItem;
  readOnly: boolean;
  onApplyPosition: () => void;
  onUpdate: (patch: Partial<CanvasItem>) => void;
}) {
  const locked = props.item.locked || props.readOnly;
  return (
    <div className="canvas-detail-form">
      <div className="canvas-detail-reference">
        <span>{props.item.reference}</span>
        <strong>{kindLabel(props.item.kind)}</strong>
      </div>
      <label>
        <span>Name</span>
        <input
          disabled={locked}
          maxLength={TITLE_MAX_LENGTH}
          value={props.item.title}
          onChange={(event) =>
            props.onUpdate({ title: limitText(event.target.value, TITLE_MAX_LENGTH) })
          }
        />
      </label>
      <label>
        <span>{detailBodyLabel(props.item.kind)}</span>
        <textarea
          disabled={locked || props.item.kind === "divider"}
          maxLength={BODY_MAX_LENGTH}
          value={props.item.body}
          onChange={(event) =>
            props.onUpdate({ body: limitText(event.target.value, BODY_MAX_LENGTH) })
          }
        />
      </label>
      <label>
        <span>Note for Codex</span>
        <textarea
          disabled={locked}
          maxLength={COMMENT_MAX_LENGTH}
          value={props.item.comment}
          onChange={(event) =>
            props.onUpdate({
              comment: limitText(event.target.value, COMMENT_MAX_LENGTH),
            })
          }
        />
      </label>
      <div className="canvas-state-field">
        <span>State</span>
        <div className="canvas-state-picker" aria-label="Layer state">
          {CANVAS_ITEM_STATE_ORDER.map((state) => (
            <button
              aria-label={stateLabel(state)}
              className={props.item.state === state ? "active" : ""}
              disabled={props.readOnly}
              key={state}
              onClick={() => props.onUpdate(statePatchForItem(props.item, state))}
              title={stateHelp(state)}
              type="button"
            >
              <span className={`canvas-layer-swatch ${state}`} />
            </button>
          ))}
        </div>
      </div>
      <div className="canvas-detail-grid">
        <NumberField
          disabled={locked}
          label="X"
          value={props.item.x}
          onChange={(x) => props.onUpdate({ x })}
        />
        <NumberField
          disabled={locked}
          label="Y"
          value={props.item.y}
          onChange={(y) => props.onUpdate({ y })}
        />
        <NumberField
          disabled={locked}
          label="W"
          value={props.item.width}
          onChange={(width) =>
            props.onUpdate(sizePatch(props.item.kind, "width", width))
          }
        />
        <NumberField
          disabled={locked}
          label="H"
          value={props.item.height}
          onChange={(height) =>
            props.onUpdate(sizePatch(props.item.kind, "height", height))
          }
        />
      </div>
      {hasOriginalGeometry(props.item) && (
        <div className="canvas-placement-actions">
          <button
            disabled={props.readOnly}
            onClick={props.onApplyPosition}
            type="button"
          >
            Apply position
          </button>
          <button
            disabled={props.readOnly}
            onClick={() => props.onUpdate(resetPlacementPatch(props.item))}
            type="button"
          >
            Reset position
          </button>
        </div>
      )}
      <p className="canvas-detail-meta">
        {stateLabel(props.item.state)} - {props.item.width}x{props.item.height}
      </p>
    </div>
  );
}

function NumberField(props: {
  disabled: boolean;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <span>{props.label}</span>
      <input
        disabled={props.disabled}
        type="number"
        value={props.value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) props.onChange(Math.round(next));
        }}
      />
    </label>
  );
}

const CanvasContextMenu = forwardRef<
  HTMLDivElement,
  {
    item: CanvasItem | null;
    menu: ContextMenuState;
    readOnly: boolean;
    onAddItem: (kind: CanvasItemKind, point: { x: number; y: number }) => void;
    onApplyPosition: (item: CanvasItem) => void;
    onBringToFront: (item: CanvasItem) => void;
    onChangeState: (item: CanvasItem, state: CanvasItemState) => void;
    onClose: () => void;
    onDelete: (item: CanvasItem) => void;
    onDuplicate: (item: CanvasItem) => void;
    onResetPosition: (item: CanvasItem) => void;
    onSendToBack: (item: CanvasItem) => void;
    onToggleLock: (item: CanvasItem) => void;
  }
>(function CanvasContextMenu(props, ref) {
  const style = {
    left: props.menu.x,
    top: props.menu.y,
  };

  if (props.menu.type === "stage") {
    const point = { x: props.menu.canvasX, y: props.menu.canvasY };
    return (
      <div
        className="canvas-context-menu"
        ref={ref}
        role="menu"
        style={style}
      >
        <button
          disabled={props.readOnly}
          onClick={() => props.onAddItem("container", point)}
          role="menuitem"
          type="button"
        >
          Add container
        </button>
        <button
          disabled={props.readOnly}
          onClick={() => props.onAddItem("button", point)}
          role="menuitem"
          type="button"
        >
          Add button
        </button>
        <button
          disabled={props.readOnly}
          onClick={() => props.onAddItem("text", point)}
          role="menuitem"
          type="button"
        >
          Add text
        </button>
      </div>
    );
  }

  if (!props.item) return null;

  const item = props.item;
  const moved = hasOriginalGeometry(item);
  return (
    <div className="canvas-context-menu" ref={ref} role="menu" style={style}>
      <button
        disabled={props.readOnly}
        onClick={() => props.onBringToFront(item)}
        role="menuitem"
        type="button"
      >
        Bring to front
      </button>
      <button
        disabled={props.readOnly}
        onClick={() => props.onSendToBack(item)}
        role="menuitem"
        type="button"
      >
        Send to back
      </button>
      <button
        disabled={props.readOnly}
        onClick={() => props.onDuplicate(item)}
        role="menuitem"
        type="button"
      >
        Duplicate
      </button>
      <button
        disabled={props.readOnly}
        onClick={() => props.onToggleLock(item)}
        role="menuitem"
        type="button"
      >
        {item.locked ? "Unlock position" : "Lock position"}
      </button>
      {moved && (
        <>
          <hr />
          <button
            disabled={props.readOnly}
            onClick={() => props.onApplyPosition(item)}
            role="menuitem"
            type="button"
          >
            Apply position
          </button>
          <button
            disabled={props.readOnly}
            onClick={() => props.onResetPosition(item)}
            role="menuitem"
            type="button"
          >
            Reset position
          </button>
        </>
      )}
      <hr />
      {item.state !== "current" && (
        <button
          disabled={props.readOnly}
          onClick={() => props.onChangeState(item, "current")}
          role="menuitem"
          type="button"
        >
          Mark current
        </button>
      )}
      {item.state !== "proposed" && (
        <button
          disabled={props.readOnly}
          onClick={() => props.onChangeState(item, "proposed")}
          role="menuitem"
          type="button"
        >
          Mark temporary
        </button>
      )}
      {item.state !== "deleted" && (
        <button
          className={item.state === "current" ? "danger" : ""}
          disabled={props.readOnly}
          onClick={() => props.onDelete(item)}
          role="menuitem"
          type="button"
        >
          {deleteActionTitle(item)}
        </button>
      )}
    </div>
  );
});

function scopeItems(canvas: ProjectCanvas) {
  if (canvas.mode === "backend") {
    return canvas.items.filter((item) => item.pageId === null);
  }
  return canvas.items.filter(
    (item) =>
      item.pageId === canvas.activePageId && item.device === canvas.activeDevice,
  );
}

function itemScope(canvas: ProjectCanvas): {
  pageId: string | null;
  device: CanvasDevice | null;
} {
  if (canvas.mode === "backend") return { pageId: null, device: null };
  return {
    pageId: canvas.activePageId,
    device: canvas.activeDevice,
  };
}

function iconForKind(kind: CanvasItemKind) {
  switch (kind) {
    case "text":
      return TypeIcon;
    case "modal":
      return FileText;
    case "divider":
      return Minus;
    case "button":
      return RectangleHorizontal;
    case "container":
      return Move;
  }
}

function statePatch(state: CanvasItemState): Partial<CanvasItem> {
  return {
    state,
    locked: state === "proposed" ? false : true,
    visible: true,
    originalX: null,
    originalY: null,
    originalWidth: null,
    originalHeight: null,
  };
}

function statePatchForItem(
  item: CanvasItem,
  state: CanvasItemState,
): Partial<CanvasItem> {
  const title = nextGenericTitle(item, state);
  return {
    ...statePatch(state),
    ...(item.kind === "button" ? sizePatch("button", "width", item.width) : {}),
    ...(title ? { title } : {}),
  };
}

function stateHelp(state: CanvasItemState) {
  return CANVAS_ITEM_STATE_CONFIG[state].description;
}

function stateLabel(state: CanvasItemState) {
  return CANVAS_ITEM_STATE_CONFIG[state].label;
}

function movementPatch(item: CanvasItem): Partial<CanvasItem> {
  if (item.state !== "current") return {};
  return {
    originalX: item.originalX ?? item.x,
    originalY: item.originalY ?? item.y,
    originalWidth: item.originalWidth ?? item.width,
    originalHeight: item.originalHeight ?? item.height,
  };
}

function resizePatch(item: CanvasItem, dx: number, dy: number): Partial<CanvasItem> {
  if (item.kind === "button") {
    const size = buttonSize(item.width + dx, item.height + dy);
    return { width: size, height: size };
  }
  return {
    width: Math.max(minItemWidth(item.kind), Math.round(item.width + dx)),
    height: Math.max(minItemHeight(item.kind), Math.round(item.height + dy)),
  };
}

function sizePatch(
  kind: CanvasItemKind,
  dimension: "width" | "height",
  value: number,
): Partial<CanvasItem> {
  if (kind === "button") {
    const size = buttonSize(value, value);
    return { width: size, height: size };
  }
  return {
    [dimension]:
      dimension === "width"
        ? Math.max(minItemWidth(kind), Math.round(value))
        : Math.max(minItemHeight(kind), Math.round(value)),
  };
}

function displayDimensions(item: CanvasItem) {
  if (item.kind !== "button") {
    return { width: item.width, height: item.height };
  }
  const size = buttonSize(item.width, item.height);
  return { width: size, height: size };
}

function stagePointToCanvas(
  stageX: number,
  stageY: number,
  viewport: ViewportState,
) {
  return {
    x: (stageX - viewport.panX) / viewport.scale,
    y: (stageY - viewport.panY) / viewport.scale,
  };
}

function shouldStartPan(event: PointerEvent<HTMLElement>) {
  return event.button === 1 || event.currentTarget.classList.contains("pan-ready");
}

function shouldWheelPan(event: ReactWheelEvent<HTMLElement>) {
  if (event.ctrlKey || event.metaKey || Math.abs(event.deltaZ) > 0) {
    return false;
  }
  const absX = Math.abs(event.deltaX);
  const absY = Math.abs(event.deltaY);
  if (event.shiftKey || absX > absY * HORIZONTAL_PAN_RATIO) {
    return true;
  }
  if (event.deltaMode !== 0) {
    return false;
  }
  if (!Number.isInteger(event.deltaX) || !Number.isInteger(event.deltaY)) {
    return true;
  }
  return absY > 0 && absY < TRACKPAD_SCROLL_DELTA_LIMIT;
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function visibleCanvasBounds(items: CanvasItem[]) {
  if (items.length === 0) return null;
  const boxes = items.flatMap((item) => {
    const itemBox = {
      minX: item.x,
      minY: item.y,
      maxX: item.x + displayDimensions(item).width,
      maxY: item.y + displayDimensions(item).height,
    };
    if (!hasOriginalGeometry(item)) return [itemBox];
    return [
      itemBox,
      {
        minX: item.originalX,
        minY: item.originalY,
        maxX: item.originalX + (item.originalWidth ?? item.width),
        maxY: item.originalY + (item.originalHeight ?? item.height),
      },
    ];
  });
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
}

function itemWithFocusedZIndex(item: CanvasItem, items: CanvasItem[]) {
  const highestZIndex = Math.max(item.zIndex, ...items.map((candidate) => candidate.zIndex));
  if (item.zIndex >= highestZIndex) return item;
  return { ...item, zIndex: highestZIndex + 1 };
}

function nextZIndex(items: CanvasItem[]) {
  return items.reduce((highest, item) => Math.max(highest, item.zIndex), 0) + 1;
}

function previousZIndex(items: CanvasItem[]) {
  return items.reduce((lowest, item) => Math.min(lowest, item.zIndex), 0) - 1;
}

function contextMenuPosition(clientX: number, clientY: number) {
  const width = 190;
  const height = 310;
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - width)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - height)),
  };
}

function fitBoundsToStage(
  bounds: NonNullable<ReturnType<typeof visibleCanvasBounds>>,
  rect: DOMRect,
): ViewportState {
  const width = Math.max(CANVAS_GRID_SIZE, bounds.maxX - bounds.minX);
  const height = Math.max(CANVAS_GRID_SIZE, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(CANVAS_GRID_SIZE, rect.width - FIT_VIEW_PADDING * 2);
  const availableHeight = Math.max(CANVAS_GRID_SIZE, rect.height - FIT_VIEW_PADDING * 2);
  const scale = clamp(
    Math.min(1, availableWidth / width, availableHeight / height),
    MIN_CANVAS_SCALE,
    MAX_CANVAS_SCALE,
  );
  return {
    scale,
    panX: (rect.width - width * scale) / 2 - bounds.minX * scale,
    panY: (rect.height - height * scale) / 2 - bounds.minY * scale,
  };
}

function gestureScale(event: Event) {
  const candidate = event as Event & { scale?: number };
  return typeof candidate.scale === "number" && Number.isFinite(candidate.scale)
    ? candidate.scale
    : 1;
}

function gesturePoint(event: Event, rect: DOMRect) {
  const candidate = event as Event & { clientX?: number; clientY?: number };
  return {
    x:
      typeof candidate.clientX === "number"
        ? candidate.clientX - rect.left
        : rect.width / 2,
    y:
      typeof candidate.clientY === "number"
        ? candidate.clientY - rect.top
        : rect.height / 2,
  };
}

function buttonSize(width: number, height: number) {
  const uneven = Math.abs(width - height) > 8;
  const oversized = width > 64 || height > 64;
  if (uneven || oversized) return 42;
  return Math.max(34, Math.min(56, Math.round(Math.max(width, height))));
}

function resetPlacementPatch(item: CanvasItem): Partial<CanvasItem> {
  if (!hasOriginalGeometry(item)) return statePatch("current");
  return {
    x: item.originalX,
    y: item.originalY,
    width: item.originalWidth ?? item.width,
    height: item.originalHeight ?? item.height,
    ...statePatch("current"),
  };
}

function applyPlacementPatch(_item: CanvasItem): Partial<CanvasItem> {
  return {
    originalX: null,
    originalY: null,
    originalWidth: null,
    originalHeight: null,
    ...statePatch("current"),
  };
}

function hasOriginalGeometry(
  item: CanvasItem,
): item is CanvasItem & { originalX: number; originalY: number } {
  return (
    item.state === "current" &&
    typeof item.originalX === "number" &&
    typeof item.originalY === "number"
  );
}

function compareLayerItems(left: CanvasItem, right: CanvasItem) {
  return layerRank(left) - layerRank(right) || right.zIndex - left.zIndex;
}

function layerRank(item: CanvasItem) {
  if (item.state === "deleted") return 0;
  if (hasOriginalGeometry(item)) return 1;
  if (item.state === "proposed") return 2;
  return 3;
}

function isCompactItem(item: CanvasItem) {
  return item.kind === "button" || item.width < 120 || item.height < 56;
}

function compactItemLabel(item: CanvasItem) {
  if (item.kind === "button") return item.reference;
  return item.reference;
}

function minItemWidth(kind: CanvasItemKind) {
  return kind === "button" ? 34 : 80;
}

function minItemHeight(kind: CanvasItemKind) {
  return kind === "button" ? 34 : 24;
}

function lockActionTitle(item: CanvasItem) {
  return item.locked ? "Unlock position" : "Lock position";
}

function deleteActionTitle(item: CanvasItem) {
  return item.state === "current" ? "Mark as deleted" : "Delete permanently";
}

function limitText(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function detailBodyLabel(kind: CanvasItemKind) {
  switch (kind) {
    case "button":
      return "Label";
    case "text":
      return "Copy";
    case "divider":
      return "Text";
    case "modal":
    case "container":
      return "Note";
  }
}

function nextGenericTitle(item: CanvasItem, state: CanvasItemState) {
  if (!generatedTitlesForKind(item.kind).has(item.title)) return null;
  return `${CANVAS_ITEM_STATE_CONFIG[state].label} ${kindLabel(item.kind)}`;
}

function generatedTitlesForKind(kind: CanvasItemKind) {
  const label = kindLabel(kind);
  return new Set(
    CANVAS_ITEM_STATE_ORDER.map(
      (state) => `${CANVAS_ITEM_STATE_CONFIG[state].label} ${label}`,
    ),
  );
}

function kindLabel(kind: CanvasItemKind) {
  switch (kind) {
    case "text":
      return "text";
    case "modal":
      return "modal";
    case "divider":
      return "divider";
    case "button":
      return "button";
    case "container":
      return "container";
  }
}
