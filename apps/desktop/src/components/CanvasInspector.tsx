import {
  AlertCircle,
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
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Move,
  Pencil,
  Play,
  Plus,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  StopCircle,
  Trash2,
  Undo2,
  Ungroup,
  X,
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
  CANVAS_GRID_UNIT,
  CANVAS_ITEM_STATE_CONFIG,
  CANVAS_ITEM_STATE_ORDER,
  CANVAS_WORLD_HEIGHT,
  CANVAS_WORLD_WIDTH,
  applyCanvasInteractionFrame,
  cloneProjectCanvas,
  createCanvasItem,
  defaultSubPageId,
  deleteCanvasInteractionFrame,
  updateCanvasInteractionFrame,
  upsertCanvasInteractionFrame,
} from "../canvasState";
import type {
  CanvasBounds,
  CanvasDevice,
  CanvasGroup,
  CanvasInteractionFrameNumber,
  CanvasInteractionPreview,
  CanvasItem,
  CanvasItemKind,
  CanvasItemState,
  CanvasPage,
  CanvasSubPage,
  Project,
  ProjectCanvas,
} from "../types";

type DragState = {
  itemId: string;
  itemIds: string[];
  mode: "move" | "resize";
  startX: number;
  startY: number;
  original: CanvasItem;
  originals: CanvasItem[];
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type MarqueeState = {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseSelection: string[];
  additive: boolean;
  moved: boolean;
};

type InteractionFrameEditState = {
  triggerKind: "item" | "group";
  triggerId: string;
  previewId: string | null;
  frameNumber: CanvasInteractionFrameNumber;
  baseCanvas: ProjectCanvas;
  draftCanvas: ProjectCanvas;
};

type InteractionPlaybackState = {
  previewId: string;
  frameNumber: CanvasInteractionFrameNumber;
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

type CanvasClipboard = {
  operation: "copy" | "cut";
  items: CanvasItem[];
  groups: CanvasGroup[];
  createdAt: number;
};

const MAX_UNDO_STEPS = 40;
const TITLE_MAX_LENGTH = 36;
const BODY_MAX_LENGTH = 180;
const COMMENT_MAX_LENGTH = 280;
const CANVAS_GRID_SIZE = CANVAS_GRID_UNIT;
const FIT_VIEW_PADDING = 48;
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
  focusReference?: string | null;
  focusRequestId?: number;
  proposalMode?: boolean;
  proposalLabel?: string;
  proposalSummary?: string | null;
  layersOpen: boolean;
  statusKind: "draft" | "saved" | "saving";
  statusLabel: string;
  readOnly: boolean;
  onChange: (canvas: ProjectCanvas) => void;
  onLayersOpenChange: (open: boolean) => void;
  onRequestGenerateMockup: (project: Project) => void;
  onEditProposalDraft?: () => void;
  proposalEdited?: boolean;
}) {
  const baseCanvas = props.canvas;
  const [frameEdit, setFrameEdit] = useState<InteractionFrameEditState | null>(
    null,
  );
  const [playback, setPlayback] = useState<InteractionPlaybackState | null>(null);
  const playbackCanvas = useMemo(
    () =>
      playback
        ? applyCanvasInteractionFrame(
            baseCanvas,
            playback.previewId,
            playback.frameNumber,
          )
        : null,
    [baseCanvas, playback],
  );
  const canvas = frameEdit?.draftCanvas ?? playbackCanvas ?? baseCanvas;
  const readOnly = props.readOnly || Boolean(playback && !frameEdit);
  const initialSelectedId = null;
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialSelectedId ? [initialSelectedId] : [],
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pan, setPan] = useState<PanState | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEWPORT);
  const [spacePanActive, setSpacePanActive] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [clipboard, setClipboard] = useState<CanvasClipboard | null>(null);
  const [undoStack, setUndoStack] = useState<ProjectCanvas[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectCanvas[]>([]);
  const stageRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRequestIdRef = useRef<number | null>(null);

  const pages = useMemo(
    () => [...canvas.pages].sort((left, right) => left.order - right.order),
    [canvas.pages],
  );
  const activePage = useMemo(
    () =>
      pages.find((page) => page.id === canvas.activePageId) ??
      pages[0] ??
      null,
    [pages, canvas.activePageId],
  );
  const activePageIndex = activePage
    ? pages.findIndex((page) => page.id === activePage.id)
    : -1;
  const activeSubPages = activePage
    ? [...activePage.subPages].sort((left, right) => left.order - right.order)
    : [];
  const activeSubPage =
    activeSubPages.find(
      (subPage) => subPage.id === canvas.activeSubPageId,
    ) ??
    activeSubPages[0] ??
    null;
  const selectedItem = useMemo(
    () => canvas.items.find((item) => item.id === selectedId) ?? null,
    [canvas.items, selectedId],
  );
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((itemId) => canvas.items.find((item) => item.id === itemId))
        .filter((item): item is CanvasItem => item !== undefined),
    [canvas.items, selectedIds],
  );
  const scopedItems = useMemo(
    () => scopeItems(canvas),
    [canvas],
  );
  const scopedGroups = useMemo(
    () => scopeGroups(canvas, scopedItems),
    [canvas, scopedItems],
  );
  const stageItems = scopedItems
    .filter((item) => item.visible)
    .sort((left, right) => left.zIndex - right.zIndex);
  const layers = [...scopedItems].sort(compareLayerItems);
  const groupedLayerIds = new Set(
    scopedGroups.flatMap((group) => group.itemIds),
  );
  const layerGroups = [...scopedGroups].sort((left, right) =>
    compareLayerGroups(left, right, canvas.items),
  );
  const ungroupedLayers = layers.filter((item) => !groupedLayerIds.has(item.id));
  const contextMenuItem =
    contextMenu?.type === "item"
      ? canvas.items.find((item) => item.id === contextMenu.itemId) ?? null
      : null;
  const selectedGroup = selectedGroupId
    ? scopedGroups.find((group) => group.id === selectedGroupId) ?? null
    : null;
  const detailsSubject = selectedGroup
    ? `${selectedGroup.reference} Group`
    : selectedItem
      ? `${selectedItem.reference} ${displayKindLabel(selectedItem.kind)}`
      : null;
  const contextMenuGroup =
    contextMenuItem?.groupId
      ? canvas.groups.find((group) => group.id === contextMenuItem.groupId) ??
        null
      : null;
  const selectedInteractionSubject = selectedGroup
    ? ({
        kind: "group" as const,
        id: selectedGroup.id,
        reference: selectedGroup.reference,
        label: selectedGroup.title,
      })
    : selectedItem
      ? ({
          kind: "item" as const,
          id: selectedItem.id,
          reference: selectedItem.reference,
          label: selectedItem.title,
        })
      : null;
  const selectedInteractionPreview = selectedInteractionSubject
    ? canvas.interactionPreviews.find(
        (preview) =>
          preview.triggerKind === selectedInteractionSubject.kind &&
          preview.triggerId === selectedInteractionSubject.id,
      ) ?? null
    : null;
  const activePlaybackFrame =
    playback && selectedInteractionPreview?.id === playback.previewId
      ? playback.frameNumber
      : null;
  const hasDetailsSelection = Boolean(selectedGroup || selectedItem);
  const sidePanelOpen = props.layersOpen || hasDetailsSelection;

  useEffect(() => {
    if (!playback) return;
    const preview = baseCanvas.interactionPreviews.find(
      (candidate) => candidate.id === playback.previewId,
    );
    const frame = preview?.frames.find(
      (candidate) => candidate.frame === playback.frameNumber,
    );
    if (!frame || frame.sticky || !frame.holdMs) return;
    const timeout = window.setTimeout(() => setPlayback(null), frame.holdMs);
    return () => window.clearTimeout(timeout);
  }, [baseCanvas.interactionPreviews, playback]);

  useEffect(() => {
    const scopedIds = new Set(scopedItems.map((item) => item.id));
    const scopedGroupIds = new Set(scopedGroups.map((group) => group.id));
    const nextSelectedIds = selectedIds.filter((itemId) => scopedIds.has(itemId));
    if (nextSelectedIds.length !== selectedIds.length) {
      setSelectedIds(nextSelectedIds);
    }
    if (selectedGroupId && !scopedGroupIds.has(selectedGroupId)) {
      setSelectedGroupId(null);
    }
    if (selectedId && !scopedIds.has(selectedId)) {
      setSelectedId(nextSelectedIds[0] ?? null);
    } else if (!selectedId && nextSelectedIds.length > 0) {
      setSelectedId(nextSelectedIds[0]);
    }
  }, [scopedGroups, scopedItems, selectedGroupId, selectedId, selectedIds]);

  useEffect(() => {
    if (!sidePanelOpen) return;
    if (selectedGroupId) {
      document
        .querySelector(`[data-canvas-group-id="${selectedGroupId}"]`)
        ?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (!selectedId) return;
    document
      .querySelector(`[data-canvas-layer-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [sidePanelOpen, selectedGroupId, selectedId]);

  useEffect(() => {
    if (hasDetailsSelection) setDetailsOpen(true);
  }, [hasDetailsSelection]);

  useEffect(() => {
    if (!props.focusReference) return;
    const requestId = props.focusRequestId ?? 0;
    if (lastFocusRequestIdRef.current === requestId) return;
    const reference = props.focusReference.toUpperCase();
    const group =
      canvas.groups.find(
        (candidate) => candidate.reference.toUpperCase() === reference,
      ) ?? null;
    const item =
      canvas.items.find(
        (candidate) => candidate.reference.toUpperCase() === reference,
      ) ?? null;
    const target = group ?? item;
    if (!target) return;
    const targetPageId = target.pageId ?? canvas.activePageId;
    const targetSubPageId = target.subPageId ?? canvas.activeSubPageId;
    if (
      targetPageId &&
      (targetPageId !== canvas.activePageId ||
        targetSubPageId !== canvas.activeSubPageId)
    ) {
      props.onChange({
        ...canvas,
        activePageId: targetPageId,
        activeSubPageId: targetSubPageId,
        updatedAt: Date.now(),
      });
      return;
    }
    lastFocusRequestIdRef.current = requestId;
    if (group) {
      selectGroup(group);
      focusCanvasBounds(expandBounds(group.bounds, 72));
      return;
    }
    if (item) {
      const itemGroup = groupForItem(item, canvas.groups);
      if (itemGroup) {
        selectGroup(itemGroup);
        focusCanvasBounds(expandBounds(itemGroup.bounds, 72));
        return;
      }
      selectOnly(item.id);
      focusCanvasBounds(expandBounds(itemBounds(item), 72));
    }
  }, [
    props.focusReference,
    props.focusRequestId,
    canvas,
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        selectOnly(null);
        setSpacePanActive(false);
      }
      if (event.code === "Space" && !isTextEditingTarget(event.target)) {
        event.preventDefault();
        setSpacePanActive(true);
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        !isTextEditingTarget(event.target) &&
        selectedItem &&
        !selectedGroup
      ) {
        event.preventDefault();
        deleteItem(selectedItem);
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c" &&
        !isTextEditingTarget(event.target)
      ) {
        event.preventDefault();
        copySelected("copy");
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "x" &&
        !isTextEditingTarget(event.target)
      ) {
        event.preventDefault();
        copySelected("cut");
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v" &&
        !isTextEditingTarget(event.target)
      ) {
        event.preventDefault();
        pasteClipboard();
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
  }, [canvas, clipboard, redoStack, selectedGroup, selectedIds, selectedItem, undoStack]);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setViewport(DEFAULT_VIEWPORT);
    setPan(null);
    setContextMenu(null);
    setClipboard(null);
  }, [canvas.projectId]);

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

  function selectOnly(itemId: string | null) {
    setSelectedId(itemId);
    setSelectedIds(itemId ? [itemId] : []);
    setSelectedGroupId(null);
    props.onLayersOpenChange(Boolean(itemId));
  }

  function selectMany(itemIds: string[], primaryId?: string | null) {
    const uniqueIds = Array.from(new Set(itemIds));
    setSelectedIds(uniqueIds);
    setSelectedId(primaryId === undefined ? uniqueIds[0] ?? null : primaryId);
    setSelectedGroupId(null);
    props.onLayersOpenChange(uniqueIds.length > 0);
  }

  function selectGroup(group: CanvasGroup | null) {
    if (!group) {
      selectOnly(null);
      return;
    }
    setSelectedGroupId(group.id);
    setSelectedIds(group.itemIds);
    setSelectedId(group.itemIds[0] ?? null);
    props.onLayersOpenChange(true);
  }

  function toggleSelection(itemId: string) {
    const selected = selectedIds.includes(itemId);
    const next = selected
      ? selectedIds.filter((candidate) => candidate !== itemId)
      : [...selectedIds, itemId];
    selectMany(next, selected ? next[0] ?? null : itemId);
  }

  function selectCanvasItem(item: CanvasItem, additive: boolean) {
    const group = groupForItem(item, canvas.groups);
    if (group) {
      if (!additive) {
        selectGroup(group);
        return;
      }
      const fullySelected = group.itemIds.every((itemId) =>
        selectedIds.includes(itemId),
      );
      const next = fullySelected
        ? selectedIds.filter((itemId) => !group.itemIds.includes(itemId))
        : Array.from(new Set([...selectedIds, ...group.itemIds]));
      selectMany(next, fullySelected ? next[0] ?? null : group.itemIds[0]);
      return;
    }

    if (additive) {
      toggleSelection(item.id);
      return;
    }
    selectOnly(item.id);
  }

  function commitCanvas(
    patch: Partial<ProjectCanvas>,
    options: { recordHistory?: boolean } = {},
  ) {
    const recordHistory = options.recordHistory ?? true;
    if (recordHistory) pushUndoSnapshot();
    const nextCanvas = {
      ...canvas,
      ...patch,
      updatedAt: Date.now(),
    };
    if (frameEdit) {
      setFrameEdit({ ...frameEdit, draftCanvas: nextCanvas });
      return;
    }
    props.onChange(nextCanvas);
  }

  function commitItems(
    items: CanvasItem[],
    options: { recordHistory?: boolean } = {},
  ) {
    const synced = syncCanvasItemsAndGroups(items, canvas.groups);
    commitCanvas(synced, options);
  }

  function updateItem(
    itemId: string,
    patch: Partial<CanvasItem>,
    options: { recordHistory?: boolean } = {},
  ) {
    const now = Date.now();
    commitItems(
      canvas.items.map((item) =>
        item.id === itemId ? { ...item, ...patch, updatedAt: now } : item,
      ),
      options,
    );
  }

  function updateGroup(
    groupId: string,
    patch: Partial<CanvasGroup>,
    options: { recordHistory?: boolean } = {},
  ) {
    const now = Date.now();
    commitCanvas(
      {
        groups: canvas.groups.map((group) =>
          group.id === groupId ? { ...group, ...patch, updatedAt: now } : group,
        ),
      },
      options,
    );
  }

  function addOrEditInteractionFrame(frameNumber?: CanvasInteractionFrameNumber) {
    if (props.readOnly || !selectedInteractionSubject || frameEdit) return;
    const preview = selectedInteractionPreview;
    const nextFrame =
      frameNumber ??
      (preview?.frames.some((frame) => frame.frame === 2) ? 3 : 2);
    if (nextFrame !== 2 && nextFrame !== 3) return;
    const frameBaseCanvas = cloneProjectCanvas(baseCanvas);
    const draftCanvas =
      preview?.frames.some((frame) => frame.frame === nextFrame)
        ? applyCanvasInteractionFrame(frameBaseCanvas, preview.id, nextFrame)
        : cloneProjectCanvas(frameBaseCanvas);
    setPlayback(null);
    setUndoStack([]);
    setRedoStack([]);
    setFrameEdit({
      triggerKind: selectedInteractionSubject.kind,
      triggerId: selectedInteractionSubject.id,
      previewId: preview?.id ?? null,
      frameNumber: nextFrame,
      baseCanvas: frameBaseCanvas,
      draftCanvas,
    });
  }

  function saveInteractionFrame() {
    if (!frameEdit) return;
    const nextCanvas = upsertCanvasInteractionFrame({
      canvas: baseCanvas,
      baseCanvas: frameEdit.baseCanvas,
      draftCanvas: frameEdit.draftCanvas,
      triggerKind: frameEdit.triggerKind,
      triggerId: frameEdit.triggerId,
      frameNumber: frameEdit.frameNumber,
    });
    setFrameEdit(null);
    setUndoStack([]);
    setRedoStack([]);
    props.onChange(nextCanvas);
  }

  function cancelInteractionFrameEdit() {
    setFrameEdit(null);
    setUndoStack([]);
    setRedoStack([]);
  }

  function returnInteractionFrameToBase() {
    if (!frameEdit) return;
    setFrameEdit({
      ...frameEdit,
      draftCanvas: cloneProjectCanvas(frameEdit.baseCanvas),
    });
    selectOnly(frameEdit.triggerKind === "item" ? frameEdit.triggerId : null);
    if (frameEdit.triggerKind === "group") {
      const group = frameEdit.baseCanvas.groups.find(
        (candidate) => candidate.id === frameEdit.triggerId,
      );
      if (group) selectGroup(group);
    }
  }

  function deleteInteractionFrame(
    preview: CanvasInteractionPreview,
    frameNumber: CanvasInteractionFrameNumber,
  ) {
    if (props.readOnly || frameEdit) return;
    const nextCanvas = deleteCanvasInteractionFrame(
      baseCanvas,
      preview.id,
      frameNumber,
    );
    if (playback?.previewId === preview.id && playback.frameNumber === frameNumber) {
      setPlayback(null);
    }
    props.onChange(nextCanvas);
  }

  function playInteractionFrame(
    preview: CanvasInteractionPreview,
    frameNumber: CanvasInteractionFrameNumber,
  ) {
    if (frameEdit) return;
    setPlayback({ previewId: preview.id, frameNumber });
  }

  function stopInteractionFrame() {
    setPlayback(null);
  }

  function updateInteractionFrameTiming(
    preview: CanvasInteractionPreview,
    frameNumber: CanvasInteractionFrameNumber,
    patch: Parameters<typeof updateCanvasInteractionFrame>[3],
  ) {
    if (props.readOnly || frameEdit) return;
    props.onChange(
      updateCanvasInteractionFrame(baseCanvas, preview.id, frameNumber, patch),
    );
  }

  function pushUndoSnapshot() {
    if (readOnly) return;
    setUndoStack((current) => [
      ...current.slice(Math.max(0, current.length - MAX_UNDO_STEPS + 1)),
      canvas,
    ]);
    setRedoStack([]);
  }

  function undoCanvas() {
    if (readOnly || undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [
      ...current.slice(Math.max(0, current.length - MAX_UNDO_STEPS + 1)),
      canvas,
    ]);
    const nextCanvas = { ...previous, updatedAt: Date.now() };
    if (frameEdit) {
      setFrameEdit({ ...frameEdit, draftCanvas: nextCanvas });
    } else {
      props.onChange(nextCanvas);
    }
    if (selectedId && !previous.items.some((item) => item.id === selectedId)) {
      selectOnly(previous.items[0]?.id ?? null);
    }
  }

  function redoCanvas() {
    if (readOnly || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [
      ...current.slice(Math.max(0, current.length - MAX_UNDO_STEPS + 1)),
      canvas,
    ]);
    const nextCanvas = { ...next, updatedAt: Date.now() };
    if (frameEdit) {
      setFrameEdit({ ...frameEdit, draftCanvas: nextCanvas });
    } else {
      props.onChange(nextCanvas);
    }
    if (selectedId && !next.items.some((item) => item.id === selectedId)) {
      selectOnly(next.items[0]?.id ?? null);
    }
  }

  function addItem(kind: CanvasItemKind, point?: { x: number; y: number }) {
    if (readOnly) return;
    const scope = itemScope(canvas);
    const item = createCanvasItem({
      canvas: canvas,
      kind,
      state: "proposed",
      pageId: scope.pageId,
      subPageId: scope.subPageId,
      device: scope.device,
      x: point?.x,
      y: point?.y,
    });
    commitItems([...canvas.items, item]);
    selectOnly(item.id);
  }

  function addPage() {
    if (readOnly || frameEdit) return;
    const order = pages.length;
    const pageId = crypto.randomUUID();
    const subPage: CanvasSubPage = {
      id: crypto.randomUUID(),
      pageId,
      name: "State 1",
      order: 0,
    };
    const page: CanvasPage = {
      id: pageId,
      name: `Page ${order + 1}`,
      order,
      subPages: [subPage],
    };
    commitCanvas({
      pages: [...canvas.pages, page],
      activePageId: page.id,
      activeSubPageId: subPage.id,
    });
    selectOnly(null);
  }

  function switchPage(pageId: string) {
    if (frameEdit) return;
    if (canvas.activePageId === pageId) return;
    commitCanvas({
      activePageId: pageId,
      activeSubPageId: defaultSubPageId(canvas.pages, pageId),
    });
    selectOnly(null);
  }

  function addSubPage() {
    if (readOnly || frameEdit || !activePage) return;
    const subPages = [...activePage.subPages].sort(
      (left, right) => left.order - right.order,
    );
    const order =
      subPages.reduce((max, subPage) => Math.max(max, subPage.order), -1) + 1;
    const subPage: CanvasSubPage = {
      id: crypto.randomUUID(),
      pageId: activePage.id,
      name: `State ${order + 1}`,
      order,
    };
    commitCanvas({
      pages: canvas.pages.map((page) =>
        page.id === activePage.id
          ? { ...page, subPages: [...page.subPages, subPage] }
          : page,
      ),
      activePageId: activePage.id,
      activeSubPageId: subPage.id,
    });
    selectOnly(null);
  }

  function switchSubPage(subPageId: string) {
    if (frameEdit) return;
    if (canvas.activeSubPageId === subPageId) return;
    commitCanvas({ activeSubPageId: subPageId });
    selectOnly(null);
  }

  function deleteSubPage(subPage: CanvasSubPage) {
    if (readOnly || frameEdit || !activePage || activeSubPages.length <= 1) return;
    const scopedItemIds = new Set(
      canvas.items
        .filter(
          (item) =>
            item.pageId === activePage.id && item.subPageId === subPage.id,
        )
        .map((item) => item.id),
    );
    if (
      scopedItemIds.size > 0 &&
      !window.confirm(
        `Delete ${subPageLabel(activePageIndex, subPage, activeSubPages)} and ${
          scopedItemIds.size
        } item${scopedItemIds.size === 1 ? "" : "s"}?`,
      )
    ) {
      return;
    }
    const remainingSubPages = activeSubPages.filter(
      (candidate) => candidate.id !== subPage.id,
    );
    const nextSubPage =
      remainingSubPages.find((candidate) => candidate.order > subPage.order) ??
      remainingSubPages[remainingSubPages.length - 1];
    const items = canvas.items.filter((item) => !scopedItemIds.has(item.id));
    const groups = canvas.groups
      .map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => !scopedItemIds.has(itemId)),
      }))
      .filter((group) => group.subPageId !== subPage.id && group.itemIds.length > 1);
    const synced = syncCanvasItemsAndGroups(items, groups);
    commitCanvas({
      ...synced,
      pages: canvas.pages.map((page) =>
        page.id === activePage.id
          ? { ...page, subPages: remainingSubPages }
          : page,
      ),
      activeSubPageId: nextSubPage.id,
    });
    selectOnly(null);
  }

  function deleteItem(item: CanvasItem) {
    if (readOnly) return;
    if (frameEdit) {
      const existsInBase = frameEdit.baseCanvas.items.some(
        (candidate) => candidate.id === item.id,
      );
      if (existsInBase) {
        updateItem(item.id, { visible: false });
      } else {
        commitItems(canvas.items.filter((candidate) => candidate.id !== item.id));
      }
      return;
    }
    if (item.state === "deleted") return;
    if (!CANVAS_ITEM_STATE_CONFIG[item.state].canDeleteDirectly) {
      updateItem(item.id, { state: "deleted", locked: true, visible: true });
      return;
    }
    commitItems(canvas.items.filter((candidate) => candidate.id !== item.id));
    if (selectedIds.includes(item.id)) {
      selectMany(selectedIds.filter((itemId) => itemId !== item.id));
    }
  }

  function duplicateItem(item: CanvasItem) {
    if (readOnly) return;
    const duplicate = createCanvasItem({
      canvas: canvas,
      kind: item.kind,
      state: "proposed",
      pageId: item.pageId,
      subPageId: item.subPageId,
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
      zIndex: nextZIndex(canvas.items),
    };
    commitItems([...canvas.items, next]);
    selectOnly(next.id);
  }

  function copySelected(operation: CanvasClipboard["operation"]) {
    if (operation === "cut" && readOnly) return;
    const sourceIds = selectedGroup
      ? selectedGroup.itemIds
      : selectedIds.length > 0
        ? selectedIds
        : selectedItem
          ? [selectedItem.id]
          : [];
    copyItemIds(sourceIds, operation);
  }

  function copyItemIds(
    itemIds: string[],
    operation: CanvasClipboard["operation"],
  ) {
    if (operation === "cut" && readOnly) return;
    const expandedIds = expandGroupedItemIds(itemIds, canvas);
    const expandedSet = new Set(expandedIds);
    const items = canvas.items.filter(
      (item) => expandedSet.has(item.id) && item.state !== "deleted",
    );
    if (items.length === 0) return;
    const groups = canvas.groups.filter((group) =>
      group.itemIds.every((itemId) => expandedSet.has(itemId)),
    );
    setClipboard({
      operation,
      items: items.map((item) => ({ ...item })),
      groups: groups.map((group) => ({ ...group, itemIds: [...group.itemIds] })),
      createdAt: Date.now(),
    });
    if (operation !== "cut") return;
    const cutIds = new Set(items.map((item) => item.id));
    const nextItems = canvas.items.filter((item) => !cutIds.has(item.id));
    const nextGroups = canvas.groups
      .map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => !cutIds.has(itemId)),
      }))
      .filter((group) => group.itemIds.length > 1);
    commitCanvas(syncCanvasItemsAndGroups(nextItems, nextGroups));
    selectOnly(null);
  }

  function pasteClipboard() {
    if (readOnly || frameEdit || !clipboard || clipboard.items.length === 0) return;
    const scope = itemScope(canvas);
    const now = Date.now();
    const itemIdMap = new Map<string, string>();
    let nextItems = [...canvas.items];
    let nextGroups = [...canvas.groups];

    for (const sourceItem of clipboard.items) {
      const workingCanvas = { ...canvas, items: nextItems, groups: nextGroups };
      const state =
        clipboard.operation === "copy" && sourceItem.state === "current"
          ? "proposed"
          : sourceItem.state;
      const created = createCanvasItem({
        canvas: workingCanvas,
        kind: sourceItem.kind,
        state,
        pageId: scope.pageId,
        subPageId: scope.subPageId,
        device: scope.device,
        x: sourceItem.x,
        y: sourceItem.y,
      });
      const pasted = {
        ...created,
        title: sourceItem.title,
        body: sourceItem.body,
        width: sourceItem.width,
        height: sourceItem.height,
        bounds: itemBounds({
          ...created,
          width: sourceItem.width,
          height: sourceItem.height,
        }),
        visible: sourceItem.visible,
        locked: state === "current" ? sourceItem.locked : false,
        zIndex: nextZIndex(nextItems),
        comment: sourceItem.comment,
        originalX: null,
        originalY: null,
        originalWidth: null,
        originalHeight: null,
        createdAt: now,
        updatedAt: now,
      };
      itemIdMap.set(sourceItem.id, pasted.id);
      nextItems = [...nextItems, pasted];
    }

    for (const sourceGroup of clipboard.groups) {
      const itemIds = sourceGroup.itemIds
        .map((itemId) => itemIdMap.get(itemId))
        .filter((itemId): itemId is string => Boolean(itemId));
      if (itemIds.length < 2) continue;
      const state =
        clipboard.operation === "copy" && sourceGroup.state === "current"
          ? "proposed"
          : sourceGroup.state;
      const groupId = crypto.randomUUID();
      nextItems = nextItems.map((item) =>
        itemIds.includes(item.id)
          ? { ...item, groupId, state, updatedAt: now }
          : item,
      );
      nextGroups = [
        ...nextGroups,
        {
          ...sourceGroup,
          id: groupId,
          numericId: nextGroupNumericId(nextGroups),
          reference: nextGroupReference(nextGroups),
          state,
          itemIds,
          locked: state === "current" ? sourceGroup.locked : false,
          pageId: scope.pageId,
          subPageId: scope.subPageId,
          device: scope.device,
          createdAt: now,
          updatedAt: now,
          bounds:
            groupBoundsFromCanvasItems(itemIds, nextItems) ?? zeroCanvasBounds(),
        },
      ];
    }

    commitCanvas(syncCanvasItemsAndGroups(nextItems, nextGroups));
    const pastedIds = Array.from(itemIdMap.values());
    selectMany(pastedIds, pastedIds[0] ?? null);
    if (clipboard.operation === "cut") setClipboard(null);
  }

  function bringItemToFront(item: CanvasItem) {
    if (readOnly) return;
    updateItem(item.id, { zIndex: nextZIndex(canvas.items) });
  }

  function sendItemToBack(item: CanvasItem) {
    if (readOnly) return;
    updateItem(item.id, { zIndex: previousZIndex(canvas.items) });
  }

  function groupSelectedItems() {
    if (readOnly || frameEdit) return;
    const scopedIds = new Set(scopedItems.map((item) => item.id));
    const itemIds = selectedIds.filter((itemId) => scopedIds.has(itemId));
    if (itemIds.length < 2) return;
    const selected = itemIds
      .map((itemId) => canvas.items.find((item) => item.id === itemId))
      .filter((item): item is CanvasItem => item !== undefined);
    if (!canGroupItems(selected)) return;

    const now = Date.now();
    const scope = itemScope(canvas);
    const numericId = nextGroupNumericId(canvas.groups);
    const groupId = crypto.randomUUID();
    const cleanedGroups = canvas.groups
      .map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => !itemIds.includes(itemId)),
      }))
      .filter((group) => group.itemIds.length > 1);
    const items = canvas.items.map((item) =>
      itemIds.includes(item.id)
        ? { ...item, groupId, updatedAt: now }
        : item,
    );
    const group: CanvasGroup = {
      id: groupId,
      numericId,
      reference: nextGroupReference(canvas.groups),
      title: `Group ${numericId}`,
      state: selected[0].state,
      itemIds,
      bounds: groupBoundsFromCanvasItems(itemIds, items) ?? zeroCanvasBounds(),
      locked: selected[0].state !== "proposed",
      pageId: scope.pageId,
      subPageId: scope.subPageId,
      device: scope.device,
      createdAt: now,
      updatedAt: now,
    };
    commitCanvas(syncCanvasItemsAndGroups(items, [...cleanedGroups, group]));
    selectGroup(group);
  }

  function changeItemOrGroupState(item: CanvasItem, state: CanvasItemState) {
    if (readOnly || frameEdit) return;
    if (!item.groupId) {
      updateItem(item.id, statePatchForItem(item, state));
      return;
    }
    const group = canvas.groups.find((candidate) => candidate.id === item.groupId);
    if (!group) {
      updateItem(item.id, statePatchForItem(item, state));
      return;
    }
    const groupItemIds = new Set(group.itemIds);
    const now = Date.now();
    const items = canvas.items.map((candidate) =>
      groupItemIds.has(candidate.id)
        ? { ...candidate, ...statePatchForItem(candidate, state), updatedAt: now }
        : candidate,
    );
    const groups = canvas.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, state, locked: state !== "proposed", updatedAt: now }
        : candidate,
    );
    commitCanvas(syncCanvasItemsAndGroups(items, groups));
  }

  function changeGroupState(group: CanvasGroup, state: CanvasItemState) {
    const firstItem = groupItems(group, canvas.items)[0];
    if (!firstItem) return;
    changeItemOrGroupState(firstItem, state);
  }

  function toggleGroupLock(group: CanvasGroup) {
    if (readOnly || frameEdit) return;
    const now = Date.now();
    commitCanvas({
      groups: canvas.groups.map((candidate) =>
        candidate.id === group.id
          ? { ...candidate, locked: !candidate.locked, updatedAt: now }
          : candidate,
      ),
    });
  }

  function applyGroupPosition(group: CanvasGroup) {
    if (readOnly || !groupHasOriginalGeometry(group, canvas.items)) {
      return;
    }
    const now = Date.now();
    const groupItemIds = new Set(group.itemIds);
    const items = canvas.items.map((item) =>
      groupItemIds.has(item.id) && hasOriginalGeometry(item)
        ? { ...item, ...applyPlacementPatch(item), updatedAt: now }
        : item,
    );
    const groups = canvas.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, locked: true, updatedAt: now }
        : candidate,
    );
    commitCanvas(syncCanvasItemsAndGroups(items, groups));
  }

  function resetGroupPosition(group: CanvasGroup) {
    if (readOnly || !groupHasOriginalGeometry(group, canvas.items)) {
      return;
    }
    const now = Date.now();
    const groupItemIds = new Set(group.itemIds);
    const items = canvas.items.map((item) =>
      groupItemIds.has(item.id) && hasOriginalGeometry(item)
        ? { ...item, ...resetPlacementPatch(item), updatedAt: now }
        : item,
    );
    const groups = canvas.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, locked: true, updatedAt: now }
        : candidate,
    );
    commitCanvas(syncCanvasItemsAndGroups(items, groups));
  }

  function ungroupItem(item: CanvasItem) {
    if (readOnly || frameEdit || !item.groupId) return;
    ungroupById(item.groupId);
  }

  function ungroupById(groupId: string) {
    if (readOnly || frameEdit) return;
    const now = Date.now();
    const group = canvas.groups.find((candidate) => candidate.id === groupId);
    const items = canvas.items.map((item) =>
      item.groupId === groupId ? { ...item, groupId: null, updatedAt: now } : item,
    );
    commitCanvas(
      syncCanvasItemsAndGroups(
        items,
        canvas.groups.filter((group) => group.id !== groupId),
      ),
    );
    if (selectedGroupId === groupId) {
      selectMany(group?.itemIds ?? [], group?.itemIds[0] ?? null);
    }
  }

  function openItemMenu(
    event: ReactMouseEvent<HTMLDivElement>,
    item: CanvasItem,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const group = groupForItem(item, canvas.groups);
    if (group) {
      selectGroup(group);
    } else if (selectedIds.includes(item.id)) {
      setSelectedId(item.id);
      setSelectedGroupId(null);
    } else {
      selectOnly(item.id);
    }
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
    const additive = event.ctrlKey || event.metaKey;
    if (additive && mode === "move") {
      selectCanvasItem(item, true);
      return;
    }
    const group = groupForItem(item, canvas.groups);
    if (group) selectGroup(group);
    else selectOnly(item.id);
    if (readOnly) return;
    if (group) {
      if ((!frameEdit && group.locked) || mode !== "move") return;
    } else if (item.locked) {
      if (!frameEdit) return;
    }
    const dragItems = group && mode === "move" ? groupItems(group, canvas.items) : [item];
    pushUndoSnapshot();
    const focusedItems =
      mode === "move"
        ? itemsWithFocusedZIndexes(dragItems, canvas.items)
        : [itemWithFocusedZIndex(item, canvas.items)];
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      itemId: item.id,
      itemIds: focusedItems.map((candidate) => candidate.id),
      mode,
      startX: event.clientX,
      startY: event.clientY,
      original:
        focusedItems.find((candidate) => candidate.id === item.id) ??
        focusedItems[0],
      originals: focusedItems,
    });
  }

  function continueDrag(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const rawDx = (event.clientX - drag.startX) / viewport.scale;
    const rawDy = (event.clientY - drag.startY) / viewport.scale;
    const { dx, dy } =
      drag.mode === "move" ? constrainedDragDelta(rawDx, rawDy, event.shiftKey) : {
        dx: rawDx,
        dy: rawDy,
      };
    const now = Date.now();
    if (drag.mode === "move") {
      const originalsById = new Map(
        drag.originals.map((original) => [original.id, original]),
      );
      commitItems(
        canvas.items.map((item) => {
          const original = originalsById.get(item.id);
          if (!original) return item;
          return {
            ...item,
            x: Math.max(8, Math.round(original.x + dx)),
            y: Math.max(8, Math.round(original.y + dy)),
            ...(frameEdit ? {} : movementPatch(original)),
            zIndex: original.zIndex,
            updatedAt: now,
          };
        }),
        { recordHistory: false },
      );
      return;
    }

    updateItem(drag.itemId, {
      ...resizePatch(drag.original, dx, dy),
      ...(frameEdit ? {} : movementPatch(drag.original)),
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

  function beginStagePointer(event: PointerEvent<HTMLElement>) {
    if (event.button === 2) return;
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }
    if (event.button === 1 || spacePanActive) {
      beginPan(event, spacePanActive);
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    const point = stagePointToCanvas(
      event.clientX - rect.left,
      event.clientY - rect.top,
      viewport,
    );
    setContextMenu(null);
    const additive = event.ctrlKey || event.metaKey;
    setMarquee({
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      currentX: point.x,
      currentY: point.y,
      baseSelection: additive ? selectedIds : [],
      additive,
      moved: false,
    });
  }

  function continueMarquee(event: PointerEvent<HTMLElement>) {
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = stagePointToCanvas(
      event.clientX - rect.left,
      event.clientY - rect.top,
      viewport,
    );
    const next = {
      ...marquee,
      currentX: point.x,
      currentY: point.y,
      moved:
        marquee.moved ||
        Math.abs(point.x - marquee.startX) > 4 ||
        Math.abs(point.y - marquee.startY) > 4,
    };
    setMarquee(next);
    if (!next.moved) return;

    const hits = stageItems
      .filter((item) => item.visible && boundsIntersect(itemBounds(item), marqueeBounds(next)))
      .map((item) => item.id);
    const expandedHits = expandGroupedItemIds(hits, canvas);
    const selection = next.additive
      ? Array.from(new Set([...next.baseSelection, ...expandedHits]))
      : expandedHits;
    const selectedGroup = singleSelectedGroup(selection, canvas.groups);
    if (selectedGroup) selectGroup(selectedGroup);
    else selectMany(selection, selection[selection.length - 1] ?? null);
  }

  function endPointer(event?: PointerEvent<HTMLElement>) {
    if (event && marquee && marquee.pointerId === event.pointerId && !marquee.moved) {
      selectMany(marquee.baseSelection, marquee.baseSelection[0] ?? null);
    }
    setDrag(null);
    setPan(null);
    setMarquee(null);
  }

  function continuePointer(event: PointerEvent<HTMLElement>) {
    continueDrag(event);
    continuePan(event);
    continueMarquee(event);
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

  function focusCanvasBounds(bounds: CanvasBounds) {
    window.requestAnimationFrame(() => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      setViewport(fitBoundsToStage(canvasBoundsToViewBounds(bounds), rect));
      setPan(null);
    });
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

  function toggleLayerPanel() {
    if (hasDetailsSelection) {
      props.onLayersOpenChange(true);
      return;
    }
    props.onLayersOpenChange(!props.layersOpen);
  }

  function renderLayerPanelButton() {
    return (
      <button
        aria-label={
          hasDetailsSelection
            ? "Layers visible"
            : sidePanelOpen
              ? "Hide layers"
              : "Show layers"
        }
        aria-pressed={sidePanelOpen}
        className={`canvas-layer-toggle ${sidePanelOpen ? "active" : ""}`}
        onClick={toggleLayerPanel}
        title={
          hasDetailsSelection
            ? "Layers stay visible while an item is selected"
            : sidePanelOpen
              ? "Hide layers"
              : "Show layers"
        }
        type="button"
      >
        <Layers size={14} />
        <span>Layers</span>
      </button>
    );
  }

  return (
    <div
      className={`canvas-inspector phase-two ${
        props.proposalMode ? "proposal-mode" : ""
      }`.trim()}
    >
      <header className="canvas-header-row">
        <h2>Canvas</h2>
        <nav className="canvas-page-state-nav" aria-label="Canvas pages and states">
          {pages.map((page, index) => {
            const active = page.id === canvas.activePageId;
            return (
              <div
                className={`canvas-page-cluster ${active ? "active" : ""}`}
                key={page.id}
              >
                <button
                  className="canvas-page-button"
                  disabled={Boolean(frameEdit)}
                  onClick={() => switchPage(page.id)}
                  title={page.name}
                  type="button"
                >
                  <span>P{index + 1}</span>
                </button>
                {active && (
                  <div className="canvas-state-pills">
                    {activeSubPages.map((subPage, subPageIndex) => {
                      const subPageActive = subPage.id === activeSubPage?.id;
                      const label = subPage.name || `State ${subPageIndex + 1}`;
                      return (
                        <span
                          className={`canvas-state-pill ${
                            subPageActive ? "active" : ""
                          }`}
                          key={subPage.id}
                        >
                          <button
                            disabled={Boolean(frameEdit)}
                            onClick={() => switchSubPage(subPage.id)}
                            title={label}
                            type="button"
                          >
                            {label}
                          </button>
                          {subPageActive && activeSubPages.length > 1 && (
                            <button
                              aria-label={`Delete ${label}`}
                              className="canvas-state-delete"
                              disabled={readOnly || Boolean(frameEdit)}
                              onClick={() => deleteSubPage(subPage)}
                              title="Delete state"
                              type="button"
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </span>
                      );
                    })}
                    <button
                      className="canvas-state-add"
                      disabled={readOnly || Boolean(frameEdit)}
                      onClick={addSubPage}
                      title="Add state"
                      type="button"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button
            className="canvas-page-add"
            disabled={readOnly || Boolean(frameEdit)}
            onClick={addPage}
            title="Add page"
            type="button"
          >
            <Plus size={13} />
          </button>
        </nav>
        <div className="canvas-header-actions">
          {renderLayerPanelButton()}
          <span className={`canvas-save-status ${props.statusKind}`}>
            {props.statusLabel}
          </span>
        </div>
      </header>
      <div
        className={`canvas-workspace ${
          sidePanelOpen ? "side-panel-open" : "side-panel-closed"
        } ${props.layersOpen ? "layers-open" : "layers-closed"}`}
      >
        <section className="canvas-main">
          <div className="canvas-top-stack">
            {frameEdit && (
              <div className="canvas-frame-edit-banner">
                <div>
                  <strong>Editing interaction frame {frameEdit.frameNumber}</strong>
                  <span>Changes stay in this preview until you save.</span>
                </div>
                <div className="canvas-frame-edit-actions">
                  <button
                    data-testid="canvas-frame-save"
                    type="button"
                    onClick={saveInteractionFrame}
                  >
                    <Save size={14} />
                    Save frame
                  </button>
                  <button
                    data-testid="canvas-frame-return-base"
                    type="button"
                    onClick={returnInteractionFrameToBase}
                  >
                    <RotateCcw size={14} />
                    Return to base
                  </button>
                  <button
                    data-testid="canvas-frame-cancel"
                    type="button"
                    onClick={cancelInteractionFrameEdit}
                  >
                    <X size={14} />
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {playback && !frameEdit && (
              <div className="canvas-frame-play-banner">
                <span>Playing interaction frame {playback.frameNumber}</span>
                <button
                  data-testid="canvas-frame-stop"
                  type="button"
                  onClick={stopInteractionFrame}
                >
                  <StopCircle size={14} />
                  Stop
                </button>
              </div>
            )}
            {props.proposalMode && (
              <div className="canvas-proposal-context">
                <div className="canvas-proposal-copyline">
                  <strong>{props.proposalLabel ?? "Draft"}</strong>
                  {props.proposalSummary && <span>{props.proposalSummary}</span>}
                </div>
                <div className="canvas-proposal-actions">
                  {props.readOnly && props.onEditProposalDraft && (
                    <button
                      className="canvas-proposal-reply"
                      data-testid="plan-edit-draft"
                      onClick={props.onEditProposalDraft}
                      type="button"
                    >
                      Edit draft
                    </button>
                  )}
                  {props.proposalEdited && (
                    <span
                      className="canvas-proposal-attached"
                      data-testid="canvas-edits-attached"
                    >
                      Canvas edits attached
                    </span>
                  )}
                </div>
              </div>
            )}
            <div className="canvas-tool-strip" aria-label="Canvas tools">
              {canvasTools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.kind}
                    aria-label={tool.label}
                    disabled={readOnly}
                    draggable={!readOnly}
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
              {!props.proposalMode && (
                <button
                  aria-label="Generate current interface mockup"
                  disabled={readOnly}
                  onClick={() => props.onRequestGenerateMockup(props.project)}
                  title="Generate current interface mockup"
                  type="button"
                >
                  <Sparkles size={15} />
                </button>
              )}
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
                disabled={readOnly || undoStack.length === 0}
                onClick={undoCanvas}
                title="Undo"
                type="button"
              >
                <Undo2 size={15} />
              </button>
              <button
                aria-label="Redo"
                disabled={readOnly || redoStack.length === 0}
                onClick={redoCanvas}
                title="Redo"
                type="button"
              >
                <Redo2 size={15} />
              </button>
            </div>
          </div>
          <section
            className={`canvas-stage ${
              pan ? "panning" : spacePanActive ? "pan-ready" : ""
            }`}
            ref={stageRef}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropTool}
            onPointerDown={beginStagePointer}
            onPointerMove={continuePointer}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={handleWheel}
            onContextMenu={openStageMenu}
          >
            {scopedItems.length === 0 && (
              <div className="canvas-empty">
                <MousePointer2 size={18} />
                <strong>Map this page</strong>
                <span>
                  Drop a container, text, modal, divider, or button onto the grid.
                </span>
                {!props.proposalMode && (
                  <button
                    disabled={readOnly}
                    onClick={() => props.onRequestGenerateMockup(props.project)}
                    type="button"
                  >
                    <Sparkles size={15} /> Generate current interface mockup
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
              {marquee?.moved && (
                <div
                  aria-hidden="true"
                  className="canvas-marquee"
                  style={rectStyle(marqueeBounds(marquee))}
                />
              )}
              {!frameEdit && stageItems
                .filter(hasOriginalGeometry)
                .map((item) => (
                  <CanvasOriginGhost item={item} key={`${item.id}-origin`} />
                ))}
              {scopedGroups.map((group) => (
                <CanvasGroupFrame
                  group={group}
                  key={group.id}
                  selected={selectedGroupId === group.id}
                />
              ))}
              {stageItems.map((item) => {
                const selected = selectedIds.includes(item.id);
                const itemGroup = groupForItem(item, canvas.groups);
                return (
                  <CanvasStageItem
                    grouped={Boolean(itemGroup)}
                    groupLocked={itemGroup?.locked ?? false}
                    frameEditing={Boolean(frameEdit)}
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

        {sidePanelOpen && (
          <aside
            className={`canvas-side-panel ${
              hasDetailsSelection ? "with-details" : "layers-only"
            }`}
          >
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
                  {layerGroups.map((group) => (
                    <LayerGroupRows
                      group={group}
                      items={layers.filter((item) =>
                        group.itemIds.includes(item.id),
                      )}
                      key={group.id}
                      onDeleteItem={deleteItem}
                      onSelectGroup={() => selectGroup(group)}
                      onToggleGroupLock={() => toggleGroupLock(group)}
                      onToggleItemVisible={(item) =>
                        updateItem(item.id, { visible: !item.visible })
                      }
                      onUngroup={() => ungroupById(group.id)}
                      readOnly={readOnly}
                      selectedIds={selectedIds}
                      showOriginalGeometry={!frameEdit}
                    />
                  ))}
                  {ungroupedLayers.map((item) => (
                    <LayerRows
                      item={item}
                      key={item.id}
                      onDelete={() => deleteItem(item)}
                      onSelect={(event) =>
                        event.ctrlKey || event.metaKey
                          ? selectCanvasItem(item, true)
                          : selectCanvasItem(item, false)
                      }
                      onToggleLock={() =>
                        updateItem(item.id, { locked: !item.locked })
                      }
                      onToggleVisible={() =>
                        updateItem(item.id, { visible: !item.visible })
                      }
                      readOnly={readOnly}
                      selected={selectedIds.includes(item.id)}
                      showOriginalGeometry={!frameEdit}
                    />
                  ))}
                </div>
              )}
            </section>

            {hasDetailsSelection && (
              <section className={`canvas-details ${detailsOpen ? "open" : ""}`}>
                <button
                  aria-expanded={detailsOpen}
                  className="canvas-details-toggle"
                  onClick={() => setDetailsOpen((open) => !open)}
                  type="button"
                >
                  {detailsOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <span>Details</span>
                  {detailsSubject && (
                    <span className="canvas-details-subject">
                      {detailsSubject}
                    </span>
                  )}
                </button>
                {detailsOpen && selectedInteractionSubject && (
                  <div className="canvas-detail-stack">
                    <InteractionPreviewPanel
                      activeFrame={activePlaybackFrame}
                      editingFrame={frameEdit?.frameNumber ?? null}
                      onAddFrame={() => addOrEditInteractionFrame()}
                      onDeleteFrame={deleteInteractionFrame}
                      onEditFrame={(frameNumber) =>
                        addOrEditInteractionFrame(frameNumber)
                      }
                      onPlayFrame={playInteractionFrame}
                      onStopFrame={stopInteractionFrame}
                      onUpdateFrame={updateInteractionFrameTiming}
                      preview={selectedInteractionPreview}
                      readOnly={props.readOnly}
                      subject={selectedInteractionSubject}
                    />
                    {selectedGroup ? (
                      <CanvasGroupDetails
                        frameEditing={Boolean(frameEdit)}
                        group={selectedGroup}
                        hasMovedItems={groupHasOriginalGeometry(
                          selectedGroup,
                          canvas.items,
                        )}
                        onApplyPosition={() => applyGroupPosition(selectedGroup)}
                        onChangeState={(state) =>
                          changeGroupState(selectedGroup, state)
                        }
                        onResetPosition={() => resetGroupPosition(selectedGroup)}
                        onToggleLock={() => toggleGroupLock(selectedGroup)}
                        onUpdate={(patch) => updateGroup(selectedGroup.id, patch)}
                        readOnly={readOnly}
                      />
                    ) : selectedItem ? (
                      <CanvasDetails
                        frameEditing={Boolean(frameEdit)}
                        item={selectedItem}
                        onApplyPosition={() =>
                          updateItem(
                            selectedItem.id,
                            applyPlacementPatch(selectedItem),
                          )
                        }
                        onChangeState={(state) =>
                          changeItemOrGroupState(selectedItem, state)
                        }
                        onUpdate={(patch) => updateItem(selectedItem.id, patch)}
                        readOnly={readOnly}
                      />
                    ) : null}
                  </div>
                )}
              </section>
            )}
          </aside>
        )}
      </div>
      {contextMenu && (
        <CanvasContextMenu
          canGroup={canGroupItems(selectedItems)}
          canPaste={Boolean(clipboard)}
          groupBlockLabel={groupBlockLabel(selectedItems)}
          canUngroup={Boolean(contextMenuItem?.groupId)}
          group={contextMenuGroup}
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
            runContextAction(() => changeItemOrGroupState(item, state))
          }
          onClose={() => setContextMenu(null)}
          onCopy={(item) =>
            runContextAction(() => copyItemIds([item.id], "copy"))
          }
          onCut={(item) => runContextAction(() => copyItemIds([item.id], "cut"))}
          onDelete={(item) => runContextAction(() => deleteItem(item))}
          onDuplicate={(item) => runContextAction(() => duplicateItem(item))}
          onGroupSelection={() => runContextAction(groupSelectedItems)}
          onGroupChangeState={(group, state) =>
            runContextAction(() => changeGroupState(group, state))
          }
          onGroupApplyPosition={(group) =>
            runContextAction(() => applyGroupPosition(group))
          }
          onGroupResetPosition={(group) =>
            runContextAction(() => resetGroupPosition(group))
          }
          onGroupToggleLock={(group) =>
            runContextAction(() => toggleGroupLock(group))
          }
          onPaste={() => runContextAction(pasteClipboard)}
          groupMoved={Boolean(
            contextMenuGroup &&
              groupHasOriginalGeometry(contextMenuGroup, canvas.items),
          )}
          onResetPosition={(item) =>
            runContextAction(() => updateItem(item.id, resetPlacementPatch(item)))
          }
          onSendToBack={(item) => runContextAction(() => sendItemToBack(item))}
          onToggleLock={(item) =>
            runContextAction(() => updateItem(item.id, { locked: !item.locked }))
          }
          onUngroup={(item) => runContextAction(() => ungroupItem(item))}
          readOnly={readOnly}
          ref={contextMenuRef}
        />
      )}
    </div>
  );
}

function CanvasStageItem(props: {
  frameEditing: boolean;
  grouped: boolean;
  groupLocked: boolean;
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
  const bodyText = compact ? compactItemLabel(props.item) : props.item.body.trim();
  const showBody = props.item.kind !== "divider" && props.item.kind !== "container" && bodyText;
  return (
    <div
      className={`canvas-item ${props.item.kind} ${props.item.state} ${
        props.selected ? "selected" : ""
      } ${
        props.grouped
          ? props.groupLocked
            ? "locked"
            : ""
          : props.item.locked
            ? "locked"
            : ""
      } ${
        hasOriginalGeometry(props.item) ? "changed-position" : ""
      } ${props.grouped ? "grouped" : ""} ${compact ? "compact-label" : ""}`}
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
      {showBody ? <p>{bodyText}</p> : null}
      {(!props.item.locked || props.frameEditing) && !props.grouped && (
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

function CanvasGroupFrame(props: { group: CanvasGroup; selected: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`canvas-group-frame ${props.group.state} ${
        props.selected ? "selected" : ""
      } ${props.group.locked ? "locked" : ""}`}
      style={{
        ...rectStyle(expandBounds(props.group.bounds, 10)),
        zIndex: 0,
      }}
    >
      <span>{props.group.reference}</span>
    </div>
  );
}

function LayerRows(props: {
  item: CanvasItem;
  selected: boolean;
  grouped?: boolean;
  readOnly: boolean;
  showOriginalGeometry: boolean;
  onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const moved = props.showOriginalGeometry && hasOriginalGeometry(props.item);
  return (
    <div
      className={`canvas-layer-group ${moved ? "changed-position" : ""} ${
        props.grouped ? "grouped" : ""
      }`}
    >
      {moved && (
        <div className={`canvas-layer-row origin ${props.grouped ? "grouped" : ""}`}>
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

function LayerGroupRows(props: {
  group: CanvasGroup;
  items: CanvasItem[];
  selectedIds: string[];
  readOnly: boolean;
  showOriginalGeometry: boolean;
  onDeleteItem: (item: CanvasItem) => void;
  onSelectGroup: () => void;
  onToggleGroupLock: () => void;
  onToggleItemVisible: (item: CanvasItem) => void;
  onUngroup: () => void;
}) {
  const selected = props.group.itemIds.every((itemId) =>
    props.selectedIds.includes(itemId),
  );
  return (
    <div className="canvas-layer-group-set">
      <div
        className={`canvas-layer-row group ${props.group.state} ${selected ? "selected" : ""}`}
        data-canvas-group-id={props.group.id}
      >
        <button
          onClick={props.onSelectGroup}
          title={`${props.group.reference} ${props.group.title}`}
          type="button"
        >
          <span className="canvas-layer-reference">{props.group.reference}</span>
          <span>{props.group.title}</span>
        </button>
        <button
          disabled={props.readOnly}
          onClick={props.onToggleGroupLock}
          title={props.group.locked ? "Unlock group" : "Lock group"}
          type="button"
        >
          <LockBadge locked={props.group.locked} compact />
        </button>
        <button
          disabled={props.readOnly}
          onClick={props.onUngroup}
          title="Ungroup"
          type="button"
        >
          <Ungroup size={13} />
        </button>
      </div>
      <div className="canvas-layer-children">
        {props.items.map((item) => (
          <LayerRows
            grouped
            item={item}
            key={item.id}
            onDelete={() => props.onDeleteItem(item)}
            onSelect={props.onSelectGroup}
            onToggleLock={() => {}}
            onToggleVisible={() => props.onToggleItemVisible(item)}
            readOnly={props.readOnly}
            selected={props.selectedIds.includes(item.id)}
            showOriginalGeometry={props.showOriginalGeometry}
          />
        ))}
      </div>
    </div>
  );
}

function LayerRow(props: {
  item: CanvasItem;
  selected: boolean;
  shifted?: boolean;
  grouped?: boolean;
  readOnly: boolean;
  onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`canvas-layer-row ${props.item.state} ${
        props.selected ? "selected" : ""
      } ${props.shifted ? "shifted" : ""} ${props.grouped ? "grouped" : ""}`}
      data-canvas-layer-id={props.item.id}
    >
      <button
        onClick={props.onSelect}
        title={`${props.item.reference} ${props.item.title}`}
        type="button"
      >
        <span className="canvas-layer-reference">{props.item.reference}</span>
        <span>{props.item.title}</span>
      </button>
      {!props.grouped && (
        <button
          disabled={props.readOnly}
          onClick={props.onToggleVisible}
          title={props.item.visible ? "Hide layer" : "Show layer"}
          type="button"
        >
          {props.item.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      )}
      {!props.grouped && (
        <button
          disabled={props.readOnly}
          onClick={props.onToggleLock}
          title={lockActionTitle(props.item)}
          type="button"
        >
          <LockBadge locked={props.item.locked} compact />
        </button>
      )}
      {!props.grouped && props.item.state !== "deleted" && (
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

function InteractionPreviewPanel(props: {
  activeFrame: CanvasInteractionFrameNumber | null;
  editingFrame: CanvasInteractionFrameNumber | null;
  preview: CanvasInteractionPreview | null;
  readOnly: boolean;
  subject: {
    kind: "item" | "group";
    id: string;
    reference: string;
    label: string;
  };
  onAddFrame: () => void;
  onDeleteFrame: (
    preview: CanvasInteractionPreview,
    frameNumber: CanvasInteractionFrameNumber,
  ) => void;
  onEditFrame: (frameNumber: CanvasInteractionFrameNumber) => void;
  onPlayFrame: (
    preview: CanvasInteractionPreview,
    frameNumber: CanvasInteractionFrameNumber,
  ) => void;
  onStopFrame: () => void;
  onUpdateFrame: (
    preview: CanvasInteractionPreview,
    frameNumber: CanvasInteractionFrameNumber,
    patch: Parameters<typeof updateCanvasInteractionFrame>[3],
  ) => void;
}) {
  const frames = props.preview
    ? [...props.preview.frames].sort((left, right) => left.frame - right.frame)
    : [];
  const canAddFrame =
    !props.readOnly && !props.editingFrame && (!props.preview || frames.length < 2);
  const nextFrameNumber: CanvasInteractionFrameNumber = frames.some(
    (frame) => frame.frame === 2,
  )
    ? 3
    : 2;

  return (
    <section className="canvas-interaction-panel">
      <div className="canvas-panel-heading">
        <span>
          <Play size={14} />
          Interaction Preview
        </span>
      </div>
      <div className="canvas-interaction-trigger">
        <span>Trigger</span>
        <strong>
          {props.subject.reference} {props.subject.kind === "group" ? "Group" : ""}
        </strong>
      </div>
      {frames.length === 0 ? (
        <p className="muted compact">
          Preview a local click, expansion, panel, or menu without changing the base
          layout.
        </p>
      ) : (
        <div className="canvas-interaction-frame-list">
          {frames.map((frame) => {
            const active = props.activeFrame === frame.frame;
            const editing = props.editingFrame === frame.frame;
            const holdMs = frame.holdMs ?? 900;
            return (
              <article
                className={`canvas-interaction-frame-row ${
                  active || editing ? "active" : ""
                }`}
                key={frame.id}
              >
                <div className="canvas-interaction-frame-title">
                  <strong>Frame {frame.frame}</strong>
                  <span>
                    {frame.affected.length} affected item
                    {frame.affected.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="canvas-interaction-frame-actions">
                  {active ? (
                    <button
                      data-testid="canvas-frame-stop"
                      onClick={props.onStopFrame}
                      type="button"
                    >
                      <StopCircle size={13} />
                      Stop
                    </button>
                  ) : (
                    <button
                      disabled={props.readOnly || Boolean(props.editingFrame)}
                      data-testid="canvas-frame-play"
                      onClick={() =>
                        props.preview &&
                        props.onPlayFrame(props.preview, frame.frame)
                      }
                      type="button"
                    >
                      <Play size={13} />
                      Play
                    </button>
                  )}
                  <button
                    disabled={props.readOnly || Boolean(props.editingFrame)}
                    data-testid="canvas-frame-edit"
                    onClick={() => props.onEditFrame(frame.frame)}
                    type="button"
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                  <button
                    disabled={props.readOnly || Boolean(props.editingFrame)}
                    onClick={() =>
                      props.preview &&
                      props.onDeleteFrame(props.preview, frame.frame)
                    }
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <label className="canvas-interaction-toggle">
                  <input
                    checked={frame.sticky}
                    disabled={props.readOnly || Boolean(props.editingFrame)}
                    onChange={(event) =>
                      props.preview &&
                      props.onUpdateFrame(props.preview, frame.frame, {
                        sticky: event.target.checked,
                        holdMs: event.target.checked ? null : holdMs,
                      })
                    }
                    type="checkbox"
                  />
                  <span>Sticky until Stop</span>
                </label>
                {!frame.sticky && (
                  <label className="canvas-interaction-hold">
                    <span>Hold ms</span>
                    <input
                      disabled={props.readOnly || Boolean(props.editingFrame)}
                      min={150}
                      step={50}
                      type="number"
                      value={holdMs}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (!Number.isFinite(value) || !props.preview) return;
                        props.onUpdateFrame(props.preview, frame.frame, {
                          holdMs: Math.max(150, Math.round(value)),
                        });
                      }}
                    />
                  </label>
                )}
              </article>
            );
          })}
        </div>
      )}
      {canAddFrame && (
        <button
          className="canvas-interaction-add"
          data-testid="canvas-frame-add"
          onClick={props.onAddFrame}
          type="button"
        >
          <Plus size={13} />
          Add frame {nextFrameNumber}
        </button>
      )}
    </section>
  );
}

function CanvasDetails(props: {
  frameEditing: boolean;
  item: CanvasItem;
  readOnly: boolean;
  onChangeState: (state: CanvasItemState) => void;
  onApplyPosition: () => void;
  onUpdate: (patch: Partial<CanvasItem>) => void;
}) {
  const locked = (props.item.locked && !props.frameEditing) || props.readOnly;
  const metadataLocked = locked || props.frameEditing;
  return (
    <div className="canvas-detail-form">
      <label>
        <span>Name</span>
        <input
          disabled={metadataLocked}
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
          disabled={metadataLocked || props.item.kind === "divider"}
          maxLength={BODY_MAX_LENGTH}
          rows={1}
          value={props.item.body}
          onChange={(event) =>
            props.onUpdate({ body: limitText(event.target.value, BODY_MAX_LENGTH) })
          }
        />
      </label>
      <label>
        <span>Note for Codex</span>
        <textarea
          disabled={metadataLocked}
          maxLength={COMMENT_MAX_LENGTH}
          rows={1}
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
              disabled={props.readOnly || props.frameEditing}
              key={state}
              onClick={() => props.onChangeState(state)}
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
      {props.frameEditing && (
        <p className="canvas-detail-meta">
          Frame draft - position and visibility edits save to this interaction only.
        </p>
      )}
      {hasOriginalGeometry(props.item) && !props.frameEditing && (
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

function CanvasGroupDetails(props: {
  frameEditing: boolean;
  group: CanvasGroup;
  hasMovedItems: boolean;
  readOnly: boolean;
  onApplyPosition: () => void;
  onChangeState: (state: CanvasItemState) => void;
  onResetPosition: () => void;
  onToggleLock: () => void;
  onUpdate: (patch: Partial<CanvasGroup>) => void;
}) {
  return (
    <div className="canvas-detail-form">
      <label>
        <span>Name</span>
        <input
          disabled={props.readOnly || props.frameEditing}
          maxLength={TITLE_MAX_LENGTH}
          value={props.group.title}
          onChange={(event) =>
            props.onUpdate({ title: limitText(event.target.value, TITLE_MAX_LENGTH) })
          }
        />
      </label>
      <div className="canvas-state-field">
        <span>State</span>
        <div className="canvas-state-picker" aria-label="Group state">
          {CANVAS_ITEM_STATE_ORDER.map((state) => (
            <button
              aria-label={stateLabel(state)}
              className={props.group.state === state ? "active" : ""}
              disabled={props.readOnly || props.frameEditing}
              key={state}
              onClick={() => props.onChangeState(state)}
              title={stateHelp(state)}
              type="button"
            >
              <span className={`canvas-layer-swatch ${state}`} />
            </button>
          ))}
        </div>
      </div>
      <button
        className="canvas-group-lock"
        disabled={props.readOnly || props.frameEditing}
        onClick={props.onToggleLock}
        type="button"
      >
        <LockBadge locked={props.group.locked} compact />
        {props.group.locked ? "Unlock group" : "Lock group"}
      </button>
      {props.frameEditing && (
        <p className="canvas-detail-meta">
          Frame draft - group moves are saved as child item deltas.
        </p>
      )}
      {props.hasMovedItems && !props.frameEditing && (
        <div className="canvas-placement-actions">
          <button
            disabled={props.readOnly}
            onClick={props.onApplyPosition}
            type="button"
          >
            Apply group position
          </button>
          <button
            disabled={props.readOnly}
            onClick={props.onResetPosition}
            type="button"
          >
            Reset group position
          </button>
        </div>
      )}
      <div className="canvas-detail-grid">
        <NumberField disabled label="X" value={props.group.bounds.x} onChange={() => {}} />
        <NumberField disabled label="Y" value={props.group.bounds.y} onChange={() => {}} />
        <NumberField
          disabled
          label="W"
          value={props.group.bounds.width}
          onChange={() => {}}
        />
        <NumberField
          disabled
          label="H"
          value={props.group.bounds.height}
          onChange={() => {}}
        />
      </div>
      <p className="canvas-detail-meta">
        {stateLabel(props.group.state)} group - {props.group.itemIds.length} items
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
    canGroup: boolean;
    canPaste: boolean;
    groupBlockLabel: string | null;
    canUngroup: boolean;
    group: CanvasGroup | null;
    item: CanvasItem | null;
    menu: ContextMenuState;
    readOnly: boolean;
    onAddItem: (kind: CanvasItemKind, point: { x: number; y: number }) => void;
    onApplyPosition: (item: CanvasItem) => void;
    onBringToFront: (item: CanvasItem) => void;
    onChangeState: (item: CanvasItem, state: CanvasItemState) => void;
    onClose: () => void;
    onCopy: (item: CanvasItem) => void;
    onCut: (item: CanvasItem) => void;
    onDelete: (item: CanvasItem) => void;
    onDuplicate: (item: CanvasItem) => void;
    groupMoved: boolean;
    onGroupApplyPosition: (group: CanvasGroup) => void;
    onGroupChangeState: (group: CanvasGroup, state: CanvasItemState) => void;
    onGroupResetPosition: (group: CanvasGroup) => void;
    onGroupSelection: () => void;
    onGroupToggleLock: (group: CanvasGroup) => void;
    onPaste: () => void;
    onResetPosition: (item: CanvasItem) => void;
    onSendToBack: (item: CanvasItem) => void;
    onToggleLock: (item: CanvasItem) => void;
    onUngroup: (item: CanvasItem) => void;
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
        {props.canPaste && (
          <>
            <hr />
            <button
              disabled={props.readOnly}
              onClick={props.onPaste}
              role="menuitem"
              type="button"
            >
              Paste
            </button>
          </>
        )}
      </div>
    );
  }

  if (!props.item) return null;

  const item = props.item;
  if (props.group) {
    const group = props.group;
    return (
      <div className="canvas-context-menu" ref={ref} role="menu" style={style}>
        <button
          onClick={() => props.onCopy(item)}
          role="menuitem"
          type="button"
        >
          Copy
        </button>
        <button
          disabled={props.readOnly}
          onClick={() => props.onCut(item)}
          role="menuitem"
          type="button"
        >
          Cut
        </button>
        <hr />
        <button
          disabled={props.readOnly}
          onClick={() => props.onGroupToggleLock(group)}
          role="menuitem"
          type="button"
        >
          {group.locked ? "Unlock group" : "Lock group"}
        </button>
        {props.groupMoved && (
          <>
            <button
              disabled={props.readOnly}
              onClick={() => props.onGroupApplyPosition(group)}
              role="menuitem"
              type="button"
            >
              Apply group position
            </button>
            <button
              disabled={props.readOnly}
              onClick={() => props.onGroupResetPosition(group)}
              role="menuitem"
              type="button"
            >
              Reset group position
            </button>
          </>
        )}
        <button
          disabled={props.readOnly}
          onClick={() => props.onUngroup(item)}
          role="menuitem"
          type="button"
        >
          Ungroup
        </button>
        <hr />
        {group.state !== "current" && (
          <button
            disabled={props.readOnly}
            onClick={() => props.onGroupChangeState(group, "current")}
            role="menuitem"
            type="button"
          >
            Mark current
          </button>
        )}
        {group.state !== "proposed" && (
          <button
            disabled={props.readOnly}
            onClick={() => props.onGroupChangeState(group, "proposed")}
            role="menuitem"
            type="button"
          >
            Mark temporary
          </button>
        )}
        {group.state !== "deleted" && (
          <button
            className={group.state === "current" ? "danger" : ""}
            disabled={props.readOnly}
            onClick={() => props.onGroupChangeState(group, "deleted")}
            role="menuitem"
            type="button"
          >
            Mark as deleted
          </button>
        )}
      </div>
    );
  }

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
        onClick={() => props.onCopy(item)}
        role="menuitem"
        type="button"
      >
        Copy
      </button>
      <button
        disabled={props.readOnly}
        onClick={() => props.onCut(item)}
        role="menuitem"
        type="button"
      >
        Cut
      </button>
      {props.canGroup && (
        <button
          disabled={props.readOnly}
          onClick={props.onGroupSelection}
          role="menuitem"
          type="button"
        >
          Group selection
        </button>
      )}
      {props.groupBlockLabel && (
        <button disabled role="menuitem" type="button">
          {props.groupBlockLabel}
        </button>
      )}
      {props.canUngroup && (
        <button
          disabled={props.readOnly}
          onClick={() => props.onUngroup(item)}
          role="menuitem"
          type="button"
        >
          Ungroup
        </button>
      )}
      {!item.groupId && (
        <button
          disabled={props.readOnly}
          onClick={() => props.onToggleLock(item)}
          role="menuitem"
          type="button"
        >
          {item.locked ? "Unlock position" : "Lock position"}
        </button>
      )}
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
      {!item.groupId && item.state !== "deleted" && (
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
  return canvas.items.filter(
    (item) =>
      item.pageId === canvas.activePageId &&
      item.subPageId === canvas.activeSubPageId &&
      item.device === canvas.activeDevice,
  );
}

function itemScope(canvas: ProjectCanvas): {
  pageId: string | null;
  subPageId: string | null;
  device: CanvasDevice | null;
} {
  return {
    pageId: canvas.activePageId,
    subPageId: canvas.activeSubPageId,
    device: canvas.activeDevice,
  };
}

function scopeGroups(canvas: ProjectCanvas, scopedItems: CanvasItem[]) {
  const scopedItemIds = new Set(scopedItems.map((item) => item.id));
  return canvas.groups
    .map((group) => ({
      ...group,
      itemIds: group.itemIds.filter((itemId) => scopedItemIds.has(itemId)),
    }))
    .filter((group) => group.itemIds.length > 1);
}

function syncCanvasItemsAndGroups(
  items: CanvasItem[],
  groups: CanvasGroup[],
): Pick<ProjectCanvas, "items" | "groups"> {
  const boundedItems = items.map((item) => ({ ...item, bounds: itemBounds(item) }));
  const syncedGroups = refreshCanvasGroups(groups, boundedItems);
  const groupIds = new Set(syncedGroups.map((group) => group.id));
  return {
    items: boundedItems.map((item) =>
      item.groupId && !groupIds.has(item.groupId)
        ? { ...item, groupId: null }
        : item,
    ),
    groups: syncedGroups,
  };
}

function refreshCanvasGroups(groups: CanvasGroup[], items: CanvasItem[]) {
  return groups
    .map((group) => {
      const groupItems = group.itemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is CanvasItem => item !== undefined);
      const itemIds = groupItems.map((item) => item.id);
      if (itemIds.length < 2) return null;
      const state = groupItems[0].state;
      if (!groupItems.every((item) => item.state === state)) return null;
      const first = groupItems[0];
      if (
        !groupItems.every(
          (item) =>
            item.pageId === first.pageId &&
            item.subPageId === first.subPageId &&
            item.device === first.device,
        )
      ) {
        return null;
      }
      return {
        ...group,
        state,
        itemIds,
        bounds: groupBoundsFromCanvasItems(itemIds, items) ?? zeroCanvasBounds(),
      };
    })
    .filter((group): group is CanvasGroup => group !== null);
}

function nextGroupNumericId(groups: CanvasGroup[]) {
  return groups.reduce((max, group) => Math.max(max, group.numericId), 0) + 1;
}

function nextGroupReference(groups: CanvasGroup[]) {
  const references = new Set(groups.map((group) => group.reference));
  let next = 1;
  while (references.has(`G${next}`)) next += 1;
  return `G${next}`;
}

function compareLayerGroups(
  left: CanvasGroup,
  right: CanvasGroup,
  items: CanvasItem[],
) {
  const leftItems = groupItems(left, items);
  const rightItems = groupItems(right, items);
  const leftRank = Math.min(...leftItems.map(layerRank));
  const rightRank = Math.min(...rightItems.map(layerRank));
  const leftZ = Math.max(...leftItems.map((item) => item.zIndex));
  const rightZ = Math.max(...rightItems.map((item) => item.zIndex));
  return leftRank - rightRank || rightZ - leftZ;
}

function groupItems(group: CanvasGroup, items: CanvasItem[]) {
  return group.itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is CanvasItem => item !== undefined);
}

function groupHasOriginalGeometry(group: CanvasGroup, items: CanvasItem[]) {
  return groupItems(group, items).some(hasOriginalGeometry);
}

function canGroupItems(items: CanvasItem[]) {
  if (items.length < 2) return false;
  if (items.some((item) => item.groupId)) return false;
  const state = items[0].state;
  return items.every((item) => item.state === state);
}

function groupBlockLabel(items: CanvasItem[]) {
  if (items.length < 2 || canGroupItems(items)) return null;
  if (items.some((item) => item.groupId)) return "Ungroup first";
  return "Group same-state items";
}

function subPageLabel(
  pageIndex: number,
  subPage: CanvasSubPage,
  subPages: CanvasSubPage[],
) {
  const subPageIndex = subPages.findIndex((candidate) => candidate.id === subPage.id);
  return `P${Math.max(0, pageIndex) + 1}.${Math.max(0, subPageIndex) + 1}`;
}

function groupForItem(item: CanvasItem, groups: CanvasGroup[]) {
  return item.groupId
    ? groups.find((group) => group.id === item.groupId) ?? null
    : null;
}

function expandGroupedItemIds(itemIds: string[], canvas: ProjectCanvas) {
  const expanded = new Set(itemIds);
  for (const itemId of itemIds) {
    const item = canvas.items.find((candidate) => candidate.id === itemId);
    const group = item ? groupForItem(item, canvas.groups) : null;
    if (!group) continue;
    for (const groupItemId of group.itemIds) expanded.add(groupItemId);
  }
  return Array.from(expanded);
}

function singleSelectedGroup(itemIds: string[], groups: CanvasGroup[]) {
  if (itemIds.length === 0) return null;
  return (
    groups.find(
      (group) =>
        group.itemIds.length === itemIds.length &&
        group.itemIds.every((itemId) => itemIds.includes(itemId)),
    ) ?? null
  );
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

function itemBounds(item: CanvasItem): CanvasBounds {
  const dimensions = displayDimensions(item);
  return {
    x: item.x,
    y: item.y,
    width: dimensions.width,
    height: dimensions.height,
    left: item.x,
    top: item.y,
    right: item.x + dimensions.width,
    bottom: item.y + dimensions.height,
  };
}

function marqueeBounds(marquee: MarqueeState): CanvasBounds {
  const left = Math.min(marquee.startX, marquee.currentX);
  const top = Math.min(marquee.startY, marquee.currentY);
  const right = Math.max(marquee.startX, marquee.currentX);
  const bottom = Math.max(marquee.startY, marquee.currentY);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    left,
    top,
    right,
    bottom,
  };
}

function rectStyle(bounds: CanvasBounds) {
  return {
    transform: `translate(${bounds.left}px, ${bounds.top}px)`,
    width: bounds.width,
    height: bounds.height,
  };
}

function expandBounds(bounds: CanvasBounds, padding: number): CanvasBounds {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  };
}

function canvasBoundsToViewBounds(bounds: CanvasBounds) {
  return {
    minX: bounds.left,
    minY: bounds.top,
    maxX: bounds.right,
    maxY: bounds.bottom,
  };
}

function boundsIntersect(left: CanvasBounds, right: CanvasBounds) {
  return (
    left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top
  );
}

function groupBoundsFromCanvasItems(
  itemIds: string[],
  items: CanvasItem[],
): CanvasBounds | null {
  const bounds = itemIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is CanvasItem => item !== undefined)
    .map(itemBounds);
  if (bounds.length === 0) return null;
  const containingPrimary = [...bounds]
    .sort((left, right) => right.width * right.height - left.width * left.height)
    .find((candidate) =>
      bounds.every((boundsCandidate) => containsBounds(candidate, boundsCandidate)),
    );
  if (containingPrimary) return containingPrimary;
  const left = Math.min(...bounds.map((box) => box.left));
  const top = Math.min(...bounds.map((box) => box.top));
  const right = Math.max(...bounds.map((box) => box.right));
  const bottom = Math.max(...bounds.map((box) => box.bottom));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    left,
    top,
    right,
    bottom,
  };
}

function containsBounds(outer: CanvasBounds, inner: CanvasBounds) {
  return (
    outer.left <= inner.left &&
    outer.top <= inner.top &&
    outer.right >= inner.right &&
    outer.bottom >= inner.bottom
  );
}

function zeroCanvasBounds(): CanvasBounds {
  return { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 };
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

function itemsWithFocusedZIndexes(items: CanvasItem[], allItems: CanvasItem[]) {
  const sortedItems = [...items].sort((left, right) => left.zIndex - right.zIndex);
  let nextZ = Math.max(0, ...allItems.map((candidate) => candidate.zIndex));
  return sortedItems.map((item) => ({ ...item, zIndex: ++nextZ }));
}

function nextZIndex(items: CanvasItem[]) {
  return items.reduce((highest, item) => Math.max(highest, item.zIndex), 0) + 1;
}

function previousZIndex(items: CanvasItem[]) {
  return items.reduce((lowest, item) => Math.min(lowest, item.zIndex), 0) - 1;
}

function contextMenuPosition(clientX: number, clientY: number) {
  const width = 190;
  const height = 350;
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

function constrainedDragDelta(dx: number, dy: number, constrained: boolean) {
  if (!constrained) return { dx, dy };
  return Math.abs(dx) >= Math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
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
  return (
    item.kind === "button" ||
    (item.kind !== "container" && (item.width < 120 || item.height < 56))
  );
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

function displayKindLabel(kind: CanvasItemKind) {
  const label = kindLabel(kind);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
