import type {
  CanvasDevice,
  CanvasItem,
  CanvasItemKind,
  CanvasItemState,
  CanvasMode,
  CanvasPage,
  Project,
  ProjectCanvas,
} from "./types";

const DEFAULT_PAGE_COUNT = 3;
const CANVAS_VERSION = 2;

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
    activeDevice: "desktop",
    pages,
    items: [],
    updatedAt: now,
  };
}

export function createCanvasItem(args: {
  canvas: ProjectCanvas;
  kind: CanvasItemKind;
  state: CanvasItemState;
  pageId: string | null;
  device: CanvasDevice | null;
  x?: number;
  y?: number;
}): CanvasItem {
  const now = Date.now();
  const defaults = itemDefaults(args.kind, args.state);
  const nextNumber = nextNumericId(args.canvas.items);
  const offset = (nextNumber - 1) % 8;
  return {
    id: crypto.randomUUID(),
    numericId: nextNumber,
    reference: nextReference(args.canvas.items, args.kind),
    kind: args.kind,
    title: defaults.title,
    body: defaults.body,
    x: args.x ?? 48 + offset * 24,
    y: args.y ?? 56 + offset * 22,
    width: defaults.width,
    height: defaults.height,
    originalX: null,
    originalY: null,
    originalWidth: null,
    originalHeight: null,
    state: args.state,
    locked: args.state === "current",
    visible: true,
    zIndex: nextZIndex(args.canvas.items),
    pageId: args.pageId,
    device: args.device,
    comment: "",
    createdAt: now,
    updatedAt: now,
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
  const activeDevice = normalizeDevice(candidate.activeDevice, "desktop");
  const updatedAt = finiteNumber(candidate.updatedAt, Date.now());
  return {
    projectId,
    version: CANVAS_VERSION,
    mode: normalizeMode(candidate.mode),
    activePageId,
    activeDevice,
    pages,
    items: normalizeItems(candidate.items, pages, activePageId, activeDevice, updatedAt),
    updatedAt,
  };
}

function createDefaultPages(): CanvasPage[] {
  return Array.from({ length: DEFAULT_PAGE_COUNT }, (_, index) => ({
    id: `page-${index + 1}`,
    name: `Page ${index + 1}`,
    order: index,
  }));
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
      };
    })
    .filter((page): page is CanvasPage => page !== null)
    .sort((left, right) => left.order - right.order);
  return pages.length > 0 ? pages : createDefaultPages();
}

function normalizeItems(
  value: unknown,
  pages: CanvasPage[],
  activePageId: string,
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
        x: finiteNumber(candidate.x, 40),
        y: finiteNumber(candidate.y, 40),
        width: dimensions.width,
        height: dimensions.height,
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
        device: backendItem ? null : normalizeDevice(candidate.device, activeDevice),
        comment: typeof candidate.comment === "string" ? candidate.comment : "",
        createdAt,
        updatedAt: finiteNumber(candidate.updatedAt, createdAt),
      };
    })
    .filter((item): item is CanvasItem => item !== null);
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}
