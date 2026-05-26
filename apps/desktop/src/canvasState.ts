import type {
  CanvasBounds,
  CanvasDevice,
  CanvasGroup,
  CanvasItem,
  CanvasItemKind,
  CanvasItemState,
  CanvasMode,
  CanvasPage,
  CanvasSubPage,
  Project,
  ProjectCanvas,
} from "./types";

const DEFAULT_PAGE_COUNT = 3;
const CANVAS_VERSION = 2;
export const CANVAS_GRID_UNIT = 28;
export const CANVAS_WORLD_WIDTH = 2400;
export const CANVAS_WORLD_HEIGHT = 1600;
export const CANVAS_NORMALIZED_UNITS = 1000;

type CanvasRectLike = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const CANVAS_ITEM_STATE_CONFIG: Record<
  CanvasItemState,
  {
    label: string;
    description: string;
    swatch: "blue-solid" | "gold-dashed" | "red-solid";
    canDeleteDirectly: boolean;
  }
> = {
  current: {
    label: "Current",
    description: "Blue solid: existing UI, protected by default.",
    swatch: "blue-solid",
    canDeleteDirectly: false,
  },
  proposed: {
    label: "Proposed",
    description: "Gold dashed: temporary planned UI, editable and removable.",
    swatch: "gold-dashed",
    canDeleteDirectly: true,
  },
  deleted: {
    label: "Deleted",
    description: "Red: existing UI marked for removal.",
    swatch: "red-solid",
    canDeleteDirectly: false,
  },
};

export const CANVAS_ITEM_STATE_ORDER: CanvasItemState[] = [
  "proposed",
  "current",
  "deleted",
];

export function createProjectCanvas(project: Project): ProjectCanvas {
  const now = Date.now();
  const pages = createDefaultPages();
  return {
    projectId: project.id,
    version: CANVAS_VERSION,
    mode: "ui",
    activePageId: pages[0].id,
    activeSubPageId: pages[0].subPages[0].id,
    activeDevice: "desktop",
    pages,
    items: [],
    groups: [],
    updatedAt: now,
  };
}

export function cloneProjectCanvas(canvas: ProjectCanvas): ProjectCanvas {
  return normalizeProjectCanvas(
    canvas.projectId,
    JSON.parse(JSON.stringify(canvas)) as object,
  );
}

export function normalizeProjectCanvasSnapshot(
  value: unknown,
  projectId: string,
): ProjectCanvas | null {
  return value && typeof value === "object"
    ? normalizeProjectCanvas(projectId, value)
    : null;
}

export function createCanvasItem(args: {
  canvas: ProjectCanvas;
  kind: CanvasItemKind;
  state: CanvasItemState;
  pageId: string | null;
  subPageId?: string | null;
  device: CanvasDevice | null;
  x?: number;
  y?: number;
}): CanvasItem {
  const now = Date.now();
  const defaults = itemDefaults(args.kind, args.state);
  const nextNumber = nextNumericId(args.canvas.items);
  const offset = (nextNumber - 1) % 8;
  const x = args.x ?? 48 + offset * 24;
  const y = args.y ?? 56 + offset * 22;
  return {
    id: crypto.randomUUID(),
    numericId: nextNumber,
    reference: nextReference(args.canvas.items, args.kind),
    kind: args.kind,
    title: defaults.title,
    body: defaults.body,
    x,
    y,
    width: defaults.width,
    height: defaults.height,
    bounds: boundsFromRect(x, y, defaults.width, defaults.height),
    originalX: null,
    originalY: null,
    originalWidth: null,
    originalHeight: null,
    state: args.state,
    locked: args.state === "current",
    visible: true,
    zIndex: nextZIndex(args.canvas.items),
    pageId: args.pageId,
    subPageId: args.pageId === null ? null : args.subPageId ?? defaultSubPageId(args.canvas.pages, args.pageId),
    device: args.device,
    groupId: null,
    comment: "",
    createdAt: now,
    updatedAt: now,
  };
}

export function gridRectFromCanvasRect(rect: CanvasRectLike) {
  return {
    x: rect.x / CANVAS_GRID_UNIT,
    y: rect.y / CANVAS_GRID_UNIT,
    width: rect.width / CANVAS_GRID_UNIT,
    height: rect.height / CANVAS_GRID_UNIT,
  };
}

export function normalizedRectFromCanvasRect(rect: CanvasRectLike) {
  return {
    x: (rect.x / CANVAS_WORLD_WIDTH) * CANVAS_NORMALIZED_UNITS,
    y: (rect.y / CANVAS_WORLD_HEIGHT) * CANVAS_NORMALIZED_UNITS,
    width: (rect.width / CANVAS_WORLD_WIDTH) * CANVAS_NORMALIZED_UNITS,
    height: (rect.height / CANVAS_WORLD_HEIGHT) * CANVAS_NORMALIZED_UNITS,
  };
}

export function canvasRectFromGridRect(rect: CanvasRectLike) {
  return {
    x: Math.round(rect.x * CANVAS_GRID_UNIT),
    y: Math.round(rect.y * CANVAS_GRID_UNIT),
    width: Math.round(rect.width * CANVAS_GRID_UNIT),
    height: Math.round(rect.height * CANVAS_GRID_UNIT),
  };
}

export function canvasRectFromNormalizedRect(rect: CanvasRectLike) {
  return {
    x: Math.round((rect.x / CANVAS_NORMALIZED_UNITS) * CANVAS_WORLD_WIDTH),
    y: Math.round((rect.y / CANVAS_NORMALIZED_UNITS) * CANVAS_WORLD_HEIGHT),
    width: Math.round((rect.width / CANVAS_NORMALIZED_UNITS) * CANVAS_WORLD_WIDTH),
    height: Math.round((rect.height / CANVAS_NORMALIZED_UNITS) * CANVAS_WORLD_HEIGHT),
  };
}

export function normalizeCanvasMap(
  value: unknown,
  projects: Project[],
): Record<string, ProjectCanvas> {
  if (!value || typeof value !== "object") return {};
  const projectIds = new Set(projects.map((project) => project.id));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.reduce<Record<string, ProjectCanvas>>((result, [projectId, canvas]) => {
    if (!projectIds.has(projectId) || !canvas || typeof canvas !== "object") {
      return result;
    }
    result[projectId] = normalizeProjectCanvas(projectId, canvas);
    return result;
  }, {});
}

function normalizeProjectCanvas(projectId: string, value: object): ProjectCanvas {
  const candidate = value as Partial<ProjectCanvas>;
  const pages = normalizePages(candidate.pages);
  const activePageId =
    typeof candidate.activePageId === "string" &&
    pages.some((page) => page.id === candidate.activePageId)
      ? candidate.activePageId
      : pages[0].id;
  const activeSubPageId =
    typeof candidate.activeSubPageId === "string" &&
    subPageBelongsToPage(pages, activePageId, candidate.activeSubPageId)
      ? candidate.activeSubPageId
      : defaultSubPageId(pages, activePageId);
  const activeDevice = normalizeDevice(candidate.activeDevice, "desktop");
  const updatedAt = finiteNumber(candidate.updatedAt, Date.now());
  const items = normalizeItems(
    candidate.items,
    pages,
    activePageId,
    activeSubPageId,
    activeDevice,
    updatedAt,
  );
  return {
    projectId,
    version: CANVAS_VERSION,
    mode: normalizeMode(candidate.mode),
    activePageId,
    activeSubPageId,
    activeDevice,
    pages,
    items,
    groups: normalizeGroups(
      candidate.groups,
      items,
      pages,
      activePageId,
      activeDevice,
      updatedAt,
    ),
    updatedAt,
  };
}

function createDefaultPages(): CanvasPage[] {
  return Array.from({ length: DEFAULT_PAGE_COUNT }, (_, index) => ({
    id: `page-${index + 1}`,
    name: `Page ${index + 1}`,
    order: index,
    subPages: createDefaultSubPages(`page-${index + 1}`),
  }));
}

function createDefaultSubPages(pageId: string): CanvasSubPage[] {
  return [
    {
      id: `${pageId}-subpage-1`,
      pageId,
      name: "State 1",
      order: 0,
    },
  ];
}

function normalizePages(value: unknown): CanvasPage[] {
  if (!Array.isArray(value)) return createDefaultPages();
  const pages = value
    .map((page, index): CanvasPage | null => {
      if (!page || typeof page !== "object") return null;
      const candidate = page as Partial<CanvasPage>;
      const id =
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id
          : `page-${index + 1}`;
      const name =
        typeof candidate.name === "string" && candidate.name.trim()
          ? candidate.name
          : `Page ${index + 1}`;
      return {
        id,
        name,
        order: finiteNumber(candidate.order, index),
        subPages: normalizeSubPages(candidate.subPages, id),
      };
    })
    .filter((page): page is CanvasPage => page !== null)
    .sort((left, right) => left.order - right.order);
  return pages.length > 0 ? pages : createDefaultPages();
}

function normalizeSubPages(value: unknown, pageId: string): CanvasSubPage[] {
  if (!Array.isArray(value)) return createDefaultSubPages(pageId);
  const subPages = value
    .map((subPage, index): CanvasSubPage | null => {
      if (!subPage || typeof subPage !== "object") return null;
      const candidate = subPage as Partial<CanvasSubPage>;
      const id =
        typeof candidate.id === "string" && candidate.id.trim()
          ? candidate.id
          : `${pageId}-subpage-${index + 1}`;
      const name =
        typeof candidate.name === "string" && candidate.name.trim()
          ? candidate.name
          : `State ${index + 1}`;
      return {
        id,
        pageId,
        name,
        order: finiteNumber(candidate.order, index),
      };
    })
    .filter((subPage): subPage is CanvasSubPage => subPage !== null)
    .sort((left, right) => left.order - right.order);
  return subPages.length > 0 ? subPages : createDefaultSubPages(pageId);
}

export function defaultSubPageId(pages: CanvasPage[], pageId: string): string {
  const page = pages.find((candidate) => candidate.id === pageId) ?? pages[0];
  return page.subPages[0]?.id ?? `${page.id}-subpage-1`;
}

export function subPagesForPage(
  pages: CanvasPage[],
  pageId: string,
): CanvasSubPage[] {
  return pages.find((page) => page.id === pageId)?.subPages ?? [];
}

function subPageBelongsToPage(
  pages: CanvasPage[],
  pageId: string,
  subPageId: string,
): boolean {
  return subPagesForPage(pages, pageId).some((subPage) => subPage.id === subPageId);
}

function normalizeItems(
  value: unknown,
  pages: CanvasPage[],
  activePageId: string,
  activeSubPageId: string,
  activeDevice: CanvasDevice,
  fallbackTime: number,
): CanvasItem[] {
  if (!Array.isArray(value)) return [];
  const pageIds = new Set(pages.map((page) => page.id));
  const usedReferences = new Set<string>();
  return value
    .map((item, index): CanvasItem | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<CanvasItem>;
      const kind = normalizeKind(candidate.kind);
      const state = normalizeState(candidate.state);
      const defaults = itemDefaults(kind, state);
      const pageId =
        typeof candidate.pageId === "string" && pageIds.has(candidate.pageId)
          ? candidate.pageId
          : activePageId;
      const subPageId =
        typeof candidate.subPageId === "string" &&
        subPageBelongsToPage(pages, pageId, candidate.subPageId)
          ? candidate.subPageId
          : pageId === activePageId
            ? activeSubPageId
            : defaultSubPageId(pages, pageId);
      const backendItem = candidate.pageId === null || candidate.device === null;
      const createdAt = finiteNumber(candidate.createdAt, fallbackTime);
      const originalX = nullableFiniteNumber(candidate.originalX);
      const originalY = nullableFiniteNumber(candidate.originalY);
      const originalWidth = nullableFiniteNumber(candidate.originalWidth);
      const originalHeight = nullableFiniteNumber(candidate.originalHeight);
      const reference =
        typeof candidate.reference === "string" &&
        isValidReference(candidate.reference) &&
        !usedReferences.has(candidate.reference)
          ? candidate.reference
          : nextReferenceFromSet(usedReferences, kind);
      usedReferences.add(reference);
      const dimensions = normalizeDimensions(
        kind,
        finiteNumber(candidate.width, defaults.width),
        finiteNumber(candidate.height, defaults.height),
      );
      const x = finiteNumber(candidate.x, 40);
      const y = finiteNumber(candidate.y, 40);
      return {
        id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
        numericId: positiveInteger(candidate.numericId, index + 1),
        reference,
        kind,
        title:
          typeof candidate.title === "string" && candidate.title.trim()
            ? candidate.title
            : defaults.title,
        body: typeof candidate.body === "string" ? candidate.body : defaults.body,
        x,
        y,
        width: dimensions.width,
        height: dimensions.height,
        bounds: boundsFromRect(x, y, dimensions.width, dimensions.height),
        originalX,
        originalY,
        originalWidth,
        originalHeight,
        state,
        locked:
          typeof candidate.locked === "boolean"
            ? candidate.locked
            : state === "current",
        visible:
          typeof candidate.visible === "boolean" ? candidate.visible : true,
        zIndex: positiveInteger(candidate.zIndex, index + 1),
        pageId: backendItem ? null : pageId,
        subPageId: backendItem ? null : subPageId,
        device: backendItem ? null : normalizeDevice(candidate.device, activeDevice),
        groupId:
          typeof candidate.groupId === "string" && candidate.groupId.trim()
            ? candidate.groupId
            : null,
        comment: typeof candidate.comment === "string" ? candidate.comment : "",
        createdAt,
        updatedAt: finiteNumber(candidate.updatedAt, createdAt),
      };
    })
    .filter((item): item is CanvasItem => item !== null);
}

function normalizeGroups(
  value: unknown,
  items: CanvasItem[],
  pages: CanvasPage[],
  activePageId: string,
  activeDevice: CanvasDevice,
  fallbackTime: number,
): CanvasGroup[] {
  if (!Array.isArray(value)) return [];
  const itemIds = new Set(items.map((item) => item.id));
  const usedReferences = new Set<string>();
  const groups = value
    .map((group, index): CanvasGroup | null => {
      if (!group || typeof group !== "object") return null;
      const candidate = group as Partial<CanvasGroup>;
      const children = Array.isArray(candidate.itemIds)
        ? candidate.itemIds.filter((id): id is string => typeof id === "string" && itemIds.has(id))
        : [];
      if (children.length < 2) return null;
      const firstChild = items.find((item) => item.id === children[0]);
      const childItems = children
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is CanvasItem => item !== undefined);
      const state = childItems[0]?.state ?? "proposed";
      if (!childItems.every((item) => item.state === state)) return null;
      if (
        firstChild &&
        !childItems.every(
          (item) =>
            item.pageId === firstChild.pageId &&
            item.subPageId === firstChild.subPageId &&
            item.device === firstChild.device,
        )
      ) {
        return null;
      }
      const backendGroup = firstChild?.pageId === null || firstChild?.device === null;
      const pageId = backendGroup ? null : firstChild?.pageId ?? activePageId;
      const subPageId =
        backendGroup || !pageId
          ? null
          : typeof candidate.subPageId === "string" &&
              subPageBelongsToPage(pages, pageId, candidate.subPageId)
            ? candidate.subPageId
            : firstChild?.subPageId ?? defaultSubPageId(pages, pageId);
      const createdAt = finiteNumber(candidate.createdAt, fallbackTime);
      const reference =
        typeof candidate.reference === "string" &&
        /^G[1-9]\d*$/.test(candidate.reference) &&
        !usedReferences.has(candidate.reference)
          ? candidate.reference
          : nextGroupReferenceFromSet(usedReferences);
      usedReferences.add(reference);
      return {
        id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
        numericId: positiveInteger(candidate.numericId, index + 1),
        reference,
        title:
          typeof candidate.title === "string" && candidate.title.trim()
            ? candidate.title
            : `Group ${reference.replace(/^G/, "")}`,
        state,
        itemIds: children,
        bounds:
          normalizeBounds(candidate.bounds) ??
          groupBoundsFromItems(children, items) ??
          zeroBounds(),
        locked:
          typeof candidate.locked === "boolean"
            ? candidate.locked
            : state !== "proposed",
        pageId,
        subPageId,
        device: backendGroup
          ? null
          : firstChild?.device ?? activeDevice,
        createdAt,
        updatedAt: finiteNumber(candidate.updatedAt, createdAt),
      };
    })
    .filter((group): group is CanvasGroup => group !== null);

  const validGroupIds = new Set(groups.map((group) => group.id));
  for (const item of items) {
    if (item.groupId && !validGroupIds.has(item.groupId)) {
      item.groupId = null;
    }
  }
  return groups;
}

function itemDefaults(kind: CanvasItemKind, state: CanvasItemState) {
  const proposed = state === "proposed";
  switch (kind) {
    case "text":
      return {
        title: proposed ? "Proposed text" : "Current text",
        body: proposed ? "New copy or label." : "Existing copy or label.",
        width: 180,
        height: 84,
      };
    case "modal":
      return {
        title: proposed ? "Proposed modal" : "Current modal",
        body: proposed ? "Dialog content and action." : "Existing dialog.",
        width: 260,
        height: 170,
      };
    case "divider":
      return {
        title: proposed ? "Proposed divider" : "Current divider",
        body: "",
        width: 240,
        height: 28,
      };
    case "button":
      return {
        title: "Button",
        body: "Button",
        width: 42,
        height: 42,
      };
    case "container":
      return {
        title: proposed ? "Proposed container" : "Current container",
        body: proposed
          ? "Describe what should change here."
          : "Describe what exists in the project today.",
        width: 220,
        height: 132,
      };
  }
}

function nextNumericId(items: CanvasItem[]) {
  return items.reduce((max, item) => Math.max(max, item.numericId), 0) + 1;
}

function nextReference(items: CanvasItem[], kind: CanvasItemKind) {
  return nextReferenceFromSet(new Set(items.map((item) => item.reference)), kind);
}

function nextReferenceFromSet(references: Set<string>, kind: CanvasItemKind) {
  const prefix = referencePrefix(kind);
  let next = 1;
  while (references.has(`${prefix}${next}`)) next += 1;
  return `${prefix}${next}`;
}

function nextGroupReferenceFromSet(references: Set<string>) {
  let next = 1;
  while (references.has(`G${next}`)) next += 1;
  return `G${next}`;
}

function referencePrefix(kind: CanvasItemKind) {
  switch (kind) {
    case "button":
      return "B";
    case "text":
      return "T";
    case "modal":
      return "M";
    case "divider":
      return "D";
    case "container":
      return "C";
  }
}

function isValidReference(value: string) {
  return /^[BCDTM][1-9]\d*$/.test(value);
}

function nextZIndex(items: CanvasItem[]) {
  return items.reduce((max, item) => Math.max(max, item.zIndex), 0) + 1;
}

function normalizeMode(value: unknown): CanvasMode {
  return value === "backend" ? "backend" : "ui";
}

function normalizeDevice(value: unknown, fallback: CanvasDevice): CanvasDevice {
  return value === "mobile" || value === "desktop" ? value : fallback;
}

function normalizeKind(value: unknown): CanvasItemKind {
  return value === "text" ||
    value === "modal" ||
    value === "divider" ||
    value === "button"
    ? value
    : "container";
}

function normalizeDimensions(
  kind: CanvasItemKind,
  width: number,
  height: number,
) {
  if (kind !== "button") return { width, height };
  const uneven = Math.abs(width - height) > 8;
  const oversized = width > 64 || height > 64;
  const size = oversized || uneven ? 42 : clamp(Math.max(width, height), 34, 56);
  return { width: size, height: size };
}

function normalizeState(value: unknown): CanvasItemState {
  return value === "current" || value === "deleted" || value === "moved"
    ? value === "moved"
      ? "current"
      : value
    : "proposed";
}

function positiveInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nullableFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBounds(value: unknown): CanvasBounds | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CanvasBounds>;
  const x = finiteNumber(candidate.x, Number.NaN);
  const y = finiteNumber(candidate.y, Number.NaN);
  const width = finiteNumber(candidate.width, Number.NaN);
  const height = finiteNumber(candidate.height, Number.NaN);
  const left = finiteNumber(candidate.left, x);
  const top = finiteNumber(candidate.top, y);
  const right = finiteNumber(candidate.right, x + width);
  const bottom = finiteNumber(candidate.bottom, y + height);
  if (![x, y, width, height, left, top, right, bottom].every(Number.isFinite)) {
    return null;
  }
  return { x, y, width, height, left, top, right, bottom };
}

function groupBoundsFromItems(itemIds: string[], items: CanvasItem[]): CanvasBounds | null {
  const children = itemIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is CanvasItem => item !== undefined);
  if (children.length === 0) return null;
  const primary = children.reduce((largest, item) =>
    item.width * item.height > largest.width * largest.height ? item : largest,
  );
  return {
    x: primary.x,
    y: primary.y,
    width: primary.width,
    height: primary.height,
    left: primary.x,
    top: primary.y,
    right: primary.x + primary.width,
    bottom: primary.y + primary.height,
  };
}

function boundsFromRect(
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasBounds {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
  };
}

function zeroBounds(): CanvasBounds {
  return { x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, right: 0, bottom: 0 };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
