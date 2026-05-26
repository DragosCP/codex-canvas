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
  Ungroup,
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
  createCanvasItem,
  defaultSubPageId,
} from "../canvasState";
import type {
  CanvasBounds,
  CanvasDevice,
  CanvasGroup,
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
  readOnly: boolean;
  onChange: (canvas: ProjectCanvas) => void;
  onRequestGenerateMockup: (project: Project) => void;
}) {
  const initialSelectedId = props.canvas.items[0]?.id ?? null;
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
  const [undoStack, setUndoStack] = useState<ProjectCanvas[]>([]);
  const [redoStack, setRedoStack] = useState<ProjectCanvas[]>([]);
  const stageRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const lastFocusRequestIdRef = useRef<number | null>(null);

  const pages = useMemo(
    () => [...props.canvas.pages].sort((left, right) => left.order - right.order),
    [props.canvas.pages],
  );
  const activePage = useMemo(
    () =>
      pages.find((page) => page.id === props.canvas.activePageId) ??
      pages[0] ??
      null,
    [pages, props.canvas.activePageId],
  );
  const activePageIndex = activePage
    ? pages.findIndex((page) => page.id === activePage.id)
    : -1;
  const activeSubPages = activePage
    ? [...activePage.subPages].sort((left, right) => left.order - right.order)
    : [];
  const activeSubPage =
    activeSubPages.find(
      (subPage) => subPage.id === props.canvas.activeSubPageId,
    ) ??
    activeSubPages[0] ??
    null;
  const selectedItem = useMemo(
    () => props.canvas.items.find((item) => item.id === selectedId) ?? null,
    [props.canvas.items, selectedId],
  );
  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((itemId) => props.canvas.items.find((item) => item.id === itemId))
        .filter((item): item is CanvasItem => item !== undefined),
    [props.canvas.items, selectedIds],
  );
  const scopedItems = useMemo(
    () => scopeItems(props.canvas),
    [props.canvas],
  );
  const scopedGroups = useMemo(
    () => scopeGroups(props.canvas, scopedItems),
    [props.canvas, scopedItems],
  );
  const stageItems = scopedItems
    .filter((item) => item.visible)
    .sort((left, right) => left.zIndex - right.zIndex);
  const layers = [...scopedItems].sort(compareLayerItems);
  const groupedLayerIds = new Set(
    scopedGroups.flatMap((group) => group.itemIds),
  );
  const layerGroups = [...scopedGroups].sort((left, right) =>
    compareLayerGroups(left, right, props.canvas.items),
  );
  const ungroupedLayers = layers.filter((item) => !groupedLayerIds.has(item.id));
  const contextMenuItem =
    contextMenu?.type === "item"
      ? props.canvas.items.find((item) => item.id === contextMenu.itemId) ?? null
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
      ? props.canvas.groups.find((group) => group.id === contextMenuItem.groupId) ??
        null
      : null;

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
  }, [selectedGroupId, selectedId]);

  useEffect(() => {
    if (!props.focusReference) return;
    const requestId = props.focusRequestId ?? 0;
    if (lastFocusRequestIdRef.current === requestId) return;
    const reference = props.focusReference.toUpperCase();
    const group =
      props.canvas.groups.find(
        (candidate) => candidate.reference.toUpperCase() === reference,
      ) ?? null;
    const item =
      props.canvas.items.find(
        (candidate) => candidate.reference.toUpperCase() === reference,
      ) ?? null;
    const target = group ?? item;
    if (!target) return;
    const targetPageId = target.pageId ?? props.canvas.activePageId;
    const targetSubPageId = target.subPageId ?? props.canvas.activeSubPageId;
    if (
      props.canvas.mode === "ui" &&
      targetPageId &&
      (targetPageId !== props.canvas.activePageId ||
        targetSubPageId !== props.canvas.activeSubPageId)
    ) {
      props.onChange({
        ...props.canvas,
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
      const itemGroup = groupForItem(item, props.canvas.groups);
      if (itemGroup) {
        selectGroup(itemGroup);
        focusCanvasBounds(expandBounds(itemGroup.bounds, 72));
        return;
      }
      selectOnly(item.id);
      focusCanvasBounds(expandBounds(itemBounds(item), 72));
    }
  }, [props.focusReference, props.focusRequestId, props.canvas]);

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
  }, [props.canvas, redoStack, selectedGroup, selectedItem, undoStack]);

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

  function selectOnly(itemId: string | null) {
    setSelectedId(itemId);
    setSelectedIds(itemId ? [itemId] : []);
    setSelectedGroupId(null);
  }

  function selectMany(itemIds: string[], primaryId?: string | null) {
    const uniqueIds = Array.from(new Set(itemIds));
    setSelectedIds(uniqueIds);
    setSelectedId(primaryId === undefined ? uniqueIds[0] ?? null : primaryId);
    setSelectedGroupId(null);
  }

  function selectGroup(group: CanvasGroup | null) {
    if (!group) {
      selectOnly(null);
      return;
    }
    setSelectedGroupId(group.id);
    setSelectedIds(group.itemIds);
    setSelectedId(group.itemIds[0] ?? null);
  }

  function toggleSelection(itemId: string) {
    const selected = selectedIds.includes(itemId);
    const next = selected
      ? selectedIds.filter((candidate) => candidate !== itemId)
      : [...selectedIds, itemId];
    selectMany(next, selected ? next[0] ?? null : itemId);
  }

  function selectCanvasItem(item: CanvasItem, additive: boolean) {
    const group = groupForItem(item, props.canvas.groups);
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
    const synced = syncCanvasItemsAndGroups(items, props.canvas.groups);
    commitCanvas(synced, options);
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

  function updateGroup(
    groupId: string,
    patch: Partial<CanvasGroup>,
    options: { recordHistory?: boolean } = {},
  ) {
    const now = Date.now();
    commitCanvas(
      {
        groups: props.canvas.groups.map((group) =>
          group.id === groupId ? { ...group, ...patch, updatedAt: now } : group,
        ),
      },
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
      selectOnly(previous.items[0]?.id ?? null);
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
      selectOnly(next.items[0]?.id ?? null);
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
      subPageId: scope.subPageId,
      device: scope.device,
      x: point?.x,
      y: point?.y,
    });
    commitItems([...props.canvas.items, item]);
    selectOnly(item.id);
  }

  function addPage() {
    if (props.readOnly) return;
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
      pages: [...props.canvas.pages, page],
      activePageId: page.id,
      activeSubPageId: subPage.id,
      mode: "ui",
    });
    selectOnly(null);
  }

  function switchPage(pageId: string) {
    if (props.canvas.activePageId === pageId) return;
    commitCanvas({
      activePageId: pageId,
      activeSubPageId: defaultSubPageId(props.canvas.pages, pageId),
      mode: "ui",
    });
    selectOnly(null);
  }

  function addSubPage() {
    if (props.readOnly || !activePage) return;
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
      pages: props.canvas.pages.map((page) =>
        page.id === activePage.id
          ? { ...page, subPages: [...page.subPages, subPage] }
          : page,
      ),
      activePageId: activePage.id,
      activeSubPageId: subPage.id,
      mode: "ui",
    });
    selectOnly(null);
  }

  function switchSubPage(subPageId: string) {
    if (props.canvas.activeSubPageId === subPageId) return;
    commitCanvas({ activeSubPageId: subPageId, mode: "ui" });
    selectOnly(null);
  }

  function deleteSubPage(subPage: CanvasSubPage) {
    if (props.readOnly || !activePage || activeSubPages.length <= 1) return;
    const scopedItemIds = new Set(
      props.canvas.items
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
    const items = props.canvas.items.filter((item) => !scopedItemIds.has(item.id));
    const groups = props.canvas.groups
      .map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => !scopedItemIds.has(itemId)),
      }))
      .filter((group) => group.subPageId !== subPage.id && group.itemIds.length > 1);
    const synced = syncCanvasItemsAndGroups(items, groups);
    commitCanvas({
      ...synced,
      pages: props.canvas.pages.map((page) =>
        page.id === activePage.id
          ? { ...page, subPages: remainingSubPages }
          : page,
      ),
      activeSubPageId: nextSubPage.id,
    });
    selectOnly(null);
  }

  function deleteItem(item: CanvasItem) {
    if (props.readOnly) return;
    if (item.state === "deleted") return;
    if (!CANVAS_ITEM_STATE_CONFIG[item.state].canDeleteDirectly) {
      updateItem(item.id, { state: "deleted", locked: true, visible: true });
      return;
    }
    commitItems(props.canvas.items.filter((candidate) => candidate.id !== item.id));
    if (selectedIds.includes(item.id)) {
      selectMany(selectedIds.filter((itemId) => itemId !== item.id));
    }
  }

  function duplicateItem(item: CanvasItem) {
    if (props.readOnly) return;
    const duplicate = createCanvasItem({
      canvas: props.canvas,
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
      zIndex: nextZIndex(props.canvas.items),
    };
    commitItems([...props.canvas.items, next]);
    selectOnly(next.id);
  }

  function bringItemToFront(item: CanvasItem) {
    if (props.readOnly) return;
    updateItem(item.id, { zIndex: nextZIndex(props.canvas.items) });
  }

  function sendItemToBack(item: CanvasItem) {
    if (props.readOnly) return;
    updateItem(item.id, { zIndex: previousZIndex(props.canvas.items) });
  }

  function groupSelectedItems() {
    if (props.readOnly) return;
    const scopedIds = new Set(scopedItems.map((item) => item.id));
    const itemIds = selectedIds.filter((itemId) => scopedIds.has(itemId));
    if (itemIds.length < 2) return;
    const selected = itemIds
      .map((itemId) => props.canvas.items.find((item) => item.id === itemId))
      .filter((item): item is CanvasItem => item !== undefined);
    if (!canGroupItems(selected)) return;

    const now = Date.now();
    const scope = itemScope(props.canvas);
    const numericId = nextGroupNumericId(props.canvas.groups);
    const groupId = crypto.randomUUID();
    const cleanedGroups = props.canvas.groups
      .map((group) => ({
        ...group,
        itemIds: group.itemIds.filter((itemId) => !itemIds.includes(itemId)),
      }))
      .filter((group) => group.itemIds.length > 1);
    const items = props.canvas.items.map((item) =>
      itemIds.includes(item.id)
        ? { ...item, groupId, updatedAt: now }
        : item,
    );
    const group: CanvasGroup = {
      id: groupId,
      numericId,
      reference: nextGroupReference(props.canvas.groups),
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
    if (props.readOnly) return;
    if (!item.groupId) {
      updateItem(item.id, statePatchForItem(item, state));
      return;
    }
    const group = props.canvas.groups.find((candidate) => candidate.id === item.groupId);
    if (!group) {
      updateItem(item.id, statePatchForItem(item, state));
      return;
    }
    const groupItemIds = new Set(group.itemIds);
    const now = Date.now();
    const items = props.canvas.items.map((candidate) =>
      groupItemIds.has(candidate.id)
        ? { ...candidate, ...statePatchForItem(candidate, state), updatedAt: now }
        : candidate,
    );
    const groups = props.canvas.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, state, locked: state !== "proposed", updatedAt: now }
        : candidate,
    );
    commitCanvas(syncCanvasItemsAndGroups(items, groups));
  }

  function changeGroupState(group: CanvasGroup, state: CanvasItemState) {
    const firstItem = groupItems(group, props.canvas.items)[0];
    if (!firstItem) return;
    changeItemOrGroupState(firstItem, state);
  }

  function toggleGroupLock(group: CanvasGroup) {
    if (props.readOnly) return;
    const now = Date.now();
    commitCanvas({
      groups: props.canvas.groups.map((candidate) =>
        candidate.id === group.id
          ? { ...candidate, locked: !candidate.locked, updatedAt: now }
          : candidate,
      ),
    });
  }

  function applyGroupPosition(group: CanvasGroup) {
    if (props.readOnly || !groupHasOriginalGeometry(group, props.canvas.items)) {
      return;
    }
    const now = Date.now();
    const groupItemIds = new Set(group.itemIds);
    const items = props.canvas.items.map((item) =>
      groupItemIds.has(item.id) && hasOriginalGeometry(item)
        ? { ...item, ...applyPlacementPatch(item), updatedAt: now }
        : item,
    );
    const groups = props.canvas.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, locked: true, updatedAt: now }
        : candidate,
    );
    commitCanvas(syncCanvasItemsAndGroups(items, groups));
  }

  function resetGroupPosition(group: CanvasGroup) {
    if (props.readOnly || !groupHasOriginalGeometry(group, props.canvas.items)) {
      return;
    }
    const now = Date.now();
    const groupItemIds = new Set(group.itemIds);
    const items = props.canvas.items.map((item) =>
      groupItemIds.has(item.id) && hasOriginalGeometry(item)
        ? { ...item, ...resetPlacementPatch(item), updatedAt: now }
        : item,
    );
    const groups = props.canvas.groups.map((candidate) =>
      candidate.id === group.id
        ? { ...candidate, locked: true, updatedAt: now }
        : candidate,
    );
    commitCanvas(syncCanvasItemsAndGroups(items, groups));
  }

  function ungroupItem(item: CanvasItem) {
    if (props.readOnly || !item.groupId) return;
    ungroupById(item.groupId);
  }

  function ungroupById(groupId: string) {
    if (props.readOnly) return;
    const now = Date.now();
    const group = props.canvas.groups.find((candidate) => candidate.id === groupId);
    const items = props.canvas.items.map((item) =>
      item.groupId === groupId ? { ...item, groupId: null, updatedAt: now } : item,
    );
    commitCanvas(
      syncCanvasItemsAndGroups(
        items,
        props.canvas.groups.filter((group) => group.id !== groupId),
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
    const group = groupForItem(item, props.canvas.groups);
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
    const group = groupForItem(item, props.canvas.groups);
    if (group) selectGroup(group);
    else selectOnly(item.id);
    if (props.readOnly) return;
    if (group) {
      if (group.locked || mode !== "move") return;
    } else if (item.locked) {
      return;
    }
    const dragItems = group && mode === "move" ? groupItems(group, props.canvas.items) : [item];
    pushUndoSnapshot();
    const focusedItems =
      mode === "move"
        ? itemsWithFocusedZIndexes(dragItems, props.canvas.items)
        : [itemWithFocusedZIndex(item, props.canvas.items)];
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
        props.canvas.items.map((item) => {
          const original = originalsById.get(item.id);
          if (!original) return item;
          return {
            ...item,
            x: Math.max(8, Math.round(original.x + dx)),
            y: Math.max(8, Math.round(original.y + dy)),
            ...movementPatch(original),
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
    const expandedHits = expandGroupedItemIds(hits, props.canvas);
    const selection = next.additive
      ? Array.from(new Set([...next.baseSelection, ...expandedHits]))
      : expandedHits;
    const selectedGroup = singleSelectedGroup(selection, props.canvas.groups);
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
          <div className="canvas-top-stack">
            {props.proposalMode && (
              <div className="canvas-proposal-context">
                <div className="canvas-proposal-copyline">
                  <strong>{props.proposalLabel ?? "Plan proposal"}</strong>
                  {props.proposalSummary && <span>{props.proposalSummary}</span>}
                </div>
              </div>
            )}
            {props.canvas.mode === "ui" && activePage && activeSubPage && (
              <div
                className={`canvas-subpage-strip ${
                  activeSubPages.length > 1 ? "expanded" : "single"
                }`}
                aria-label="Canvas sub-pages"
              >
                {activeSubPages.length > 1 &&
                  activeSubPages.map((subPage) => {
                    const active = subPage.id === activeSubPage.id;
                    return (
                      <div
                        className={`canvas-subpage-chip ${active ? "active" : ""}`}
                        key={subPage.id}
                      >
                        <button
                          onClick={() => switchSubPage(subPage.id)}
                          title={subPage.name}
                          type="button"
                        >
                          <strong>
                            {subPageLabel(activePageIndex, subPage, activeSubPages)}
                          </strong>
                          <span>{subPage.name}</span>
                        </button>
                        {active && activeSubPages.length > 1 && (
                          <button
                            aria-label={`Delete ${subPageLabel(
                              activePageIndex,
                              subPage,
                              activeSubPages,
                            )}`}
                            className="canvas-subpage-delete"
                            disabled={props.readOnly}
                            onClick={() => deleteSubPage(subPage)}
                            title="Delete sub-page"
                            type="button"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                <button
                  className="canvas-subpage-add"
                  disabled={props.readOnly}
                  onClick={addSubPage}
                  title={
                    activeSubPages.length > 1
                      ? "Add sub-page"
                      : "Add another state for this page"
                  }
                  type="button"
                >
                  <Plus size={14} />
                  {activeSubPages.length > 1 && <span>State</span>}
                </button>
              </div>
            )}
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
          </div>
          <section
            className={`canvas-stage ${props.canvas.mode} ${
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
                {props.canvas.mode === "ui" && !props.proposalMode && (
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
              {marquee?.moved && (
                <div
                  aria-hidden="true"
                  className="canvas-marquee"
                  style={rectStyle(marqueeBounds(marquee))}
                />
              )}
              {stageItems
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
                const itemGroup = groupForItem(item, props.canvas.groups);
                return (
                  <CanvasStageItem
                    grouped={Boolean(itemGroup)}
                    groupLocked={itemGroup?.locked ?? false}
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
                {layerGroups.map((group) => (
                  <LayerGroupRows
                    group={group}
                    items={layers.filter((item) => group.itemIds.includes(item.id))}
                    key={group.id}
                    onDeleteItem={deleteItem}
                    onSelectGroup={() => selectGroup(group)}
                    onToggleGroupLock={() => toggleGroupLock(group)}
                    onToggleItemVisible={(item) =>
                      updateItem(item.id, { visible: !item.visible })
                    }
                    onUngroup={() => ungroupById(group.id)}
                    readOnly={props.readOnly}
                    selectedIds={selectedIds}
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
                    readOnly={props.readOnly}
                    selected={selectedIds.includes(item.id)}
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
              <span>Details</span>
              {detailsSubject && (
                <span className="canvas-details-subject">{detailsSubject}</span>
              )}
            </button>
            {detailsOpen &&
              (selectedGroup ? (
                <CanvasGroupDetails
                  group={selectedGroup}
                  hasMovedItems={groupHasOriginalGeometry(
                    selectedGroup,
                    props.canvas.items,
                  )}
                  onApplyPosition={() => applyGroupPosition(selectedGroup)}
                  onChangeState={(state) => changeGroupState(selectedGroup, state)}
                  onResetPosition={() => resetGroupPosition(selectedGroup)}
                  onToggleLock={() => toggleGroupLock(selectedGroup)}
                  onUpdate={(patch) => updateGroup(selectedGroup.id, patch)}
                  readOnly={props.readOnly}
                />
              ) : selectedItem ? (
                <CanvasDetails
                  item={selectedItem}
                  onApplyPosition={() =>
                    updateItem(selectedItem.id, applyPlacementPatch(selectedItem))
                  }
                  onChangeState={(state) => changeItemOrGroupState(selectedItem, state)}
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
          canGroup={canGroupItems(selectedItems)}
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
          groupMoved={Boolean(
            contextMenuGroup &&
              groupHasOriginalGeometry(contextMenuGroup, props.canvas.items),
          )}
          onResetPosition={(item) =>
            runContextAction(() => updateItem(item.id, resetPlacementPatch(item)))
          }
          onSendToBack={(item) => runContextAction(() => sendItemToBack(item))}
          onToggleLock={(item) =>
            runContextAction(() => updateItem(item.id, { locked: !item.locked }))
          }
          onUngroup={(item) => runContextAction(() => ungroupItem(item))}
          readOnly={props.readOnly}
          ref={contextMenuRef}
        />
      )}
    </div>
  );
}

function CanvasStageItem(props: {
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
      {props.item.kind !== "divider" && (
        <p>{compact ? compactItemLabel(props.item) : props.item.body || props.item.title}</p>
      )}
      {!props.item.locked && !props.grouped && (
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
  onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  onToggleVisible: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}) {
  const moved = hasOriginalGeometry(props.item);
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

function CanvasDetails(props: {
  item: CanvasItem;
  readOnly: boolean;
  onChangeState: (state: CanvasItemState) => void;
  onApplyPosition: () => void;
  onUpdate: (patch: Partial<CanvasItem>) => void;
}) {
  const locked = props.item.locked || props.readOnly;
  return (
    <div className="canvas-detail-form">
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
          disabled={locked}
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
              disabled={props.readOnly}
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

function CanvasGroupDetails(props: {
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
          disabled={props.readOnly}
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
              disabled={props.readOnly}
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
        disabled={props.readOnly}
        onClick={props.onToggleLock}
        type="button"
      >
        <LockBadge locked={props.group.locked} compact />
        {props.group.locked ? "Unlock group" : "Lock group"}
      </button>
      {props.hasMovedItems && (
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
    onDelete: (item: CanvasItem) => void;
    onDuplicate: (item: CanvasItem) => void;
    groupMoved: boolean;
    onGroupApplyPosition: (group: CanvasGroup) => void;
    onGroupChangeState: (group: CanvasGroup, state: CanvasItemState) => void;
    onGroupResetPosition: (group: CanvasGroup) => void;
    onGroupSelection: () => void;
    onGroupToggleLock: (group: CanvasGroup) => void;
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
  if (canvas.mode === "backend") {
    return canvas.items.filter((item) => item.pageId === null);
  }
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
  if (canvas.mode === "backend") {
    return { pageId: null, subPageId: null, device: null };
  }
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

function displayKindLabel(kind: CanvasItemKind) {
  const label = kindLabel(kind);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
