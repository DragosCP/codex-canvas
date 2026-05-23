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
  Type as TypeIcon,
} from "lucide-react";
import {
  type DragEvent,
  type PointerEvent,
  useEffect,
  useMemo,
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

const MAX_UNDO_STEPS = 40;
const TITLE_MAX_LENGTH = 36;
const BODY_MAX_LENGTH = 180;
const COMMENT_MAX_LENGTH = 280;

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
  const [legendOpen, setLegendOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [undoStack, setUndoStack] = useState<ProjectCanvas[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectCanvas[]>([]);

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

  useEffect(() => {
    if (!selectedId) return;
    if (!scopedItems.some((item) => item.id === selectedId)) {
      setSelectedId(scopedItems[0]?.id ?? null);
    }
  }, [scopedItems, selectedId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedId(null);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas();
        else undoCanvas();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [props.canvas, redoStack, undoStack]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [props.canvas.projectId]);

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
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      itemId: item.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      original: item,
    });
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
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
    }, { recordHistory: false });
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
    addItem(kind, {
      x: Math.max(8, Math.round(event.clientX - rect.left - 24)),
      y: Math.max(8, Math.round(event.clientY - rect.top - 18)),
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
            className={`canvas-stage ${props.canvas.mode}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropTool}
            onPointerMove={continueDrag}
            onPointerUp={() => setDrag(null)}
            onPointerCancel={() => setDrag(null)}
          >
            <div className="canvas-grid" />
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
                  selected={selected}
                />
              );
            })}
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
    </div>
  );
}

function CanvasStageItem(props: {
  item: CanvasItem;
  selected: boolean;
  onBeginDrag: (
    event: PointerEvent<HTMLDivElement>,
    item: CanvasItem,
    mode: DragState["mode"],
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
      onPointerDown={(event) => props.onBeginDrag(event, props.item, "move")}
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
        <button
          className="canvas-reset-placement"
          disabled={props.readOnly}
          onClick={() => props.onUpdate(resetPlacementPatch(props.item))}
          type="button"
        >
          Reset position
        </button>
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
