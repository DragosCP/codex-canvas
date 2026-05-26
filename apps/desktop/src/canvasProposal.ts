import {
  canvasRectFromGridRect,
  canvasRectFromNormalizedRect,
  cloneProjectCanvas,
  createCanvasItem,
  defaultSubPageId,
} from "./canvasState";
import type {
  CanvasBounds,
  CanvasDevice,
  CanvasGroup,
  CanvasItem,
  CanvasItemKind,
  CanvasPage,
  CanvasItemState,
  ProjectCanvas,
} from "./types";

type ParsedLine = {
  action: "create" | "update" | "delete";
  reference: string | null;
  kind: CanvasItemKind | null;
  fields: Record<string, string>;
  title: string | null;
  raw: string;
};

export type CanvasProposalParseResult = {
  canvas: ProjectCanvas;
  changeCount: number;
  summary: string;
  errors: string[];
};

const PROPOSAL_BLOCK_RE = /```canvas-proposal\s*([\s\S]*?)```/gi;
const REFERENCE_RE = /^[BCDTM][1-9]\d*$/i;
const GROUP_RE = /^G[1-9]\d*$/i;

export const CANVAS_PROPOSAL_PARSER_VERSION = 6;

export function applyCanvasProposalText(
  baseCanvas: ProjectCanvas,
  text: string,
): CanvasProposalParseResult {
  let canvas = cloneProjectCanvas(baseCanvas);
  const lines = proposalLines(text);
  const errors: string[] = [];
  const changes: string[] = [];

  for (const line of lines) {
    const parsed = parseProposalLine(line);
    if (!parsed) continue;
    const result = applyProposalLine(canvas, parsed);
    if (!result.changed) {
      if (result.error) errors.push(result.error);
      continue;
    }
    canvas = result.canvas;
    changes.push(result.label);
  }

  canvas = {
    ...canvas,
    groups: resolveCanvasGroups(canvas.groups, canvas.items),
    items: canvas.items.map((item) => ({
      ...item,
      groupId: canvas.groups.some((group) => group.id === item.groupId)
        ? item.groupId
        : null,
    })),
    updatedAt: changes.length > 0 ? Date.now() : canvas.updatedAt,
  };

  return {
    canvas,
    changeCount: changes.length,
    summary:
      changes.length > 0
        ? `Parsed ${changes.length} canvas change${
            changes.length === 1 ? "" : "s"
          }: ${changes.slice(0, 4).join(", ")}${
            changes.length > 4 ? `, +${changes.length - 4} more` : ""
          }`
        : "No parseable canvas proposal changes found.",
    errors,
  };
}

export function finalizeAcceptedCanvasProposal(
  proposalCanvas: ProjectCanvas,
  baseCanvas: ProjectCanvas | null,
): ProjectCanvas {
  let changed = false;
  const baseById = new Map(baseCanvas?.items.map((item) => [item.id, item]));
  const baseByReference = new Map(
    baseCanvas?.items.map((item) => [item.reference.toUpperCase(), item]),
  );
  const items = proposalCanvas.items.map((item) => {
    const baseItem =
      baseById.get(item.id) ?? baseByReference.get(item.reference.toUpperCase()) ?? null;
    if (!shouldClearProposalOriginalGeometry(item, baseItem)) return item;
    changed = true;
    return {
      ...item,
      originalX: null,
      originalY: null,
      originalWidth: null,
      originalHeight: null,
    };
  });
  return changed
    ? {
        ...proposalCanvas,
        items,
        updatedAt: Date.now(),
      }
    : proposalCanvas;
}

function proposalLines(text: string) {
  const blocks = [...text.matchAll(PROPOSAL_BLOCK_RE)].map((match) => match[1]);
  const source = blocks.length > 0 ? blocks.join("\n") : text;
  return source
    .split(/\r?\n/)
    .map(cleanProposalLine)
    .filter((line) => likelyProposalLine(line));
}

function cleanProposalLine(line: string) {
  return line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function likelyProposalLine(line: string) {
  if (!line || line.startsWith("#")) return false;
  if (/^(create|new|add|delete|remove|mark\s+deleted)\b/i.test(line)) {
    return true;
  }
  const first = line.split(/\s|;/, 1)[0]?.replace(/:$/, "");
  if (first && (REFERENCE_RE.test(first) || GROUP_RE.test(first))) return true;
  return /\b(state|xywh|rect|bounds|x|y|w|h|width|height|grid|gxywh|gridxywh|gx|gy|gw|gh|norm|normalized|nxywh|nx|ny|nw|nh)=/i.test(line);
}

function parseProposalLine(line: string): ParsedLine | null {
  const fields = parseFields(line);
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0].toLowerCase();
  const quotedTitle = quotedValue(line);

  if (/^(delete|remove)$/.test(first)) {
    return {
      action: "delete",
      reference: referenceFromWords(words.slice(1)),
      kind: kindFromWords(words) ?? null,
      fields,
      title: fields.title ?? quotedTitle,
      raw: line,
    };
  }

  if (first === "mark" && words[1]?.toLowerCase() === "deleted") {
    return {
      action: "delete",
      reference: referenceFromWords(words.slice(2)),
      kind: kindFromWords(words) ?? null,
      fields,
      title: fields.title ?? quotedTitle,
      raw: line,
    };
  }

  if (/^(create|new|add)$/.test(first)) {
    return {
      action: "create",
      reference: referenceFromWords(words.slice(1)),
      kind: kindFromWords(words) ?? kindFromReference(referenceFromWords(words)),
      fields,
      title: fields.title ?? quotedTitle,
      raw: line,
    };
  }

  const reference = referenceFromWords(words);
  if (!reference) return null;
  return {
    action: stateFromFields(fields) === "deleted" ? "delete" : "update",
    reference,
    kind: kindFromWords(words) ?? kindFromReference(reference),
    fields,
    title: fields.title ?? quotedTitle,
    raw: line,
  };
}

function applyProposalLine(canvas: ProjectCanvas, parsed: ParsedLine) {
  if (parsed.reference && GROUP_RE.test(parsed.reference)) {
    return {
      canvas,
      changed: false,
      label: parsed.reference,
      error: `Group proposal parsing is not supported yet: ${parsed.raw}`,
    };
  }

  const reference = parsed.reference?.toUpperCase() ?? null;
  const existing = reference
    ? canvas.items.find((item) => item.reference.toUpperCase() === reference)
    : undefined;

  if (parsed.action === "delete") {
    if (!existing) {
      return {
        canvas,
        changed: false,
        label: reference ?? "delete",
        error: `Could not find canvas item to delete: ${parsed.raw}`,
      };
    }
    return {
      canvas: updateCanvasItem(canvas, existing.id, {
        state: "deleted",
        locked: true,
        visible: true,
      }),
      changed: true,
      label: `${existing.reference} deleted`,
      error: null,
    };
  }

  if (parsed.action === "create" || !existing) {
    const created = createProposalItem(canvas, parsed);
    if (!created) {
      return {
        canvas,
        changed: false,
        label: reference ?? "create",
        error: `Could not create canvas item from: ${parsed.raw}`,
      };
    }
    return {
      canvas: {
        ...created.canvas,
        items: [...created.canvas.items, created.item],
      },
      changed: true,
      label: `${created.item.reference} created`,
      error: null,
    };
  }

  const patch = itemPatch(existing, parsed);
  if (Object.keys(patch).length === 0) {
    return {
      canvas,
      changed: false,
      label: existing.reference,
      error: null,
    };
  }
  return {
    canvas: updateCanvasItem(canvas, existing.id, patch),
    changed: true,
    label: `${existing.reference} updated`,
    error: null,
  };
}

function createProposalItem(canvas: ProjectCanvas, parsed: ParsedLine) {
  const kind = parsed.kind ?? kindFromReference(parsed.reference) ?? "container";
  const state = stateFromFields(parsed.fields) ?? "proposed";
  const rect = rectFromFields(parsed.fields);
  const page = pageFromFields(canvas, parsed.fields);
  const item = createCanvasItem({
    canvas: page.canvas,
    kind,
    state,
    pageId: page.pageId,
    subPageId: page.subPageId,
    device: page.device,
    x: rect?.x,
    y: rect?.y,
  });
  const reference = parsed.reference?.toUpperCase();
  const safeReference =
    reference &&
    !page.canvas.items.some((candidate) => candidate.reference === reference)
      ? reference
      : item.reference;
  const locked = booleanField(parsed.fields.locked ?? parsed.fields.lock);
  const visible = booleanField(parsed.fields.visible);
  const now = Date.now();
  return {
    canvas: page.canvas,
    item: withItemBounds({
      ...item,
      numericId: referenceNumber(safeReference) ?? item.numericId,
      reference: safeReference,
      title: parsed.title ?? parsed.fields.name ?? item.title,
      body: parsed.fields.label ?? parsed.fields.body ?? parsed.fields.text ?? item.body,
      comment:
        parsed.fields.noteForCodex ??
        parsed.fields.comment ??
        parsed.fields.note ??
        item.comment,
      x: rect?.x ?? item.x,
      y: rect?.y ?? item.y,
      width: rect?.width ?? item.width,
      height: rect?.height ?? item.height,
      state,
      locked: locked ?? state === "current",
      visible: visible ?? item.visible,
      updatedAt: now,
    }),
  };
}

function itemPatch(
  item: CanvasItem,
  parsed: ParsedLine,
): Partial<CanvasItem> {
  const patch: Partial<CanvasItem> = {};
  const rect = rectFromFields(parsed.fields);
  const state = stateFromFields(parsed.fields);
  if (parsed.title || parsed.fields.name) {
    patch.title = parsed.title ?? parsed.fields.name;
  }
  if (parsed.fields.label || parsed.fields.body || parsed.fields.text) {
    patch.body = parsed.fields.label ?? parsed.fields.body ?? parsed.fields.text;
  }
  if (parsed.fields.noteForCodex || parsed.fields.comment || parsed.fields.note) {
    patch.comment =
      parsed.fields.noteForCodex ?? parsed.fields.comment ?? parsed.fields.note;
  }
  if (state) {
    patch.state = state;
    patch.locked = state === "current" || state === "deleted";
    patch.visible = true;
  }
  const locked = booleanField(parsed.fields.locked ?? parsed.fields.lock);
  if (locked != null) patch.locked = locked;
  const visible = booleanField(parsed.fields.visible);
  if (visible != null) patch.visible = visible;
  if (rect) {
    const moved =
      rect.x !== item.x ||
      rect.y !== item.y ||
      rect.width !== item.width ||
      rect.height !== item.height;
    if (moved && !hasOriginalGeometry(item)) {
      patch.originalX = item.x;
      patch.originalY = item.y;
      patch.originalWidth = item.width;
      patch.originalHeight = item.height;
    }
    patch.x = rect.x;
    patch.y = rect.y;
    patch.width = rect.width;
    patch.height = rect.height;
    patch.bounds = boundsFromRect(rect.x, rect.y, rect.width, rect.height);
  }
  if (Object.keys(patch).length > 0) patch.updatedAt = Date.now();
  return patch;
}

function updateCanvasItem(
  canvas: ProjectCanvas,
  itemId: string,
  patch: Partial<CanvasItem>,
): ProjectCanvas {
  return {
    ...canvas,
    items: canvas.items.map((item) =>
      item.id === itemId ? withItemBounds({ ...item, ...patch }) : item,
    ),
  };
}

function parseFields(line: string) {
  const fields: Record<string, string> = {};
  const fieldRe = /([A-Za-z][A-Za-z0-9_-]*)=("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s;]+)/g;
  for (const match of line.matchAll(fieldRe)) {
    fields[match[1]] = unquote(match[2]);
  }
  return fields;
}

function quotedValue(line: string) {
  const match = line.match(/"([^"]+)"/) ?? line.match(/'([^']+)'/);
  return match?.[1] ?? null;
}

function referenceFromWords(words: string[]) {
  for (const word of words) {
    const cleaned = word.replace(/[;:,()[\]]/g, "").toUpperCase();
    if (REFERENCE_RE.test(cleaned) || GROUP_RE.test(cleaned)) return cleaned;
  }
  return null;
}

function kindFromWords(words: string[]): CanvasItemKind | null {
  const lower = words.map((word) => word.toLowerCase().replace(/[;:,()[\]]/g, ""));
  if (lower.includes("button")) return "button";
  if (lower.includes("text")) return "text";
  if (lower.includes("modal")) return "modal";
  if (lower.includes("divider")) return "divider";
  if (lower.includes("container") || lower.includes("panel")) return "container";
  return null;
}

function kindFromReference(reference: string | null): CanvasItemKind | null {
  if (!reference) return null;
  const prefix = reference[0]?.toUpperCase();
  if (prefix === "B") return "button";
  if (prefix === "T") return "text";
  if (prefix === "M") return "modal";
  if (prefix === "D") return "divider";
  if (prefix === "C") return "container";
  return null;
}

function stateFromFields(fields: Record<string, string>): CanvasItemState | null {
  const raw = (fields.state ?? fields.status ?? "").toLowerCase();
  if (raw === "current" || raw === "blue") return "current";
  if (raw === "deleted" || raw === "delete" || raw === "red") return "deleted";
  if (raw === "proposed" || raw === "temporary" || raw === "gold") {
    return "proposed";
  }
  return null;
}

function rectFromFields(fields: Record<string, string>) {
  const rect = parseNumberList(fields.xywh ?? fields.rect);
  if (rect && rect.length >= 4) {
    return {
      x: rect[0],
      y: rect[1],
      width: rect[2],
      height: rect[3],
    };
  }
  const gridRect = rectListFromFields(fields, [
    "grid",
    "gxywh",
    "gridxywh",
  ]);
  if (gridRect) {
    return canvasRectFromGridRect(gridRect);
  }
  const fieldGridRect = rectFromIndividualFields(fields, "gx", "gy", "gw", "gh");
  if (fieldGridRect) {
    return canvasRectFromGridRect(fieldGridRect);
  }
  const normalizedRect = rectListFromFields(fields, [
    "norm",
    "normalized",
    "nxywh",
  ]);
  if (normalizedRect) {
    return canvasRectFromNormalizedRect(normalizedRect);
  }
  const fieldNormalizedRect = rectFromIndividualFields(
    fields,
    "nx",
    "ny",
    "nw",
    "nh",
  );
  if (fieldNormalizedRect) {
    return canvasRectFromNormalizedRect(fieldNormalizedRect);
  }
  const x = numberField(fields.x);
  const y = numberField(fields.y);
  const width = numberField(fields.w ?? fields.width);
  const height = numberField(fields.h ?? fields.height);
  if ([x, y, width, height].every((value) => value != null)) {
    return {
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
    };
  }
  return null;
}

function rectListFromFields(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const rect = parseNumberList(fields[key]);
    if (rect && rect.length >= 4) {
      return {
        x: rect[0],
        y: rect[1],
        width: rect[2],
        height: rect[3],
      };
    }
  }
  return null;
}

function rectFromIndividualFields(
  fields: Record<string, string>,
  xKey: string,
  yKey: string,
  widthKey: string,
  heightKey: string,
) {
  const x = numberField(fields[xKey]);
  const y = numberField(fields[yKey]);
  const width = numberField(fields[widthKey]);
  const height = numberField(fields[heightKey]);
  if ([x, y, width, height].every((value) => value != null)) {
    return {
      x: x as number,
      y: y as number,
      width: width as number,
      height: height as number,
    };
  }
  return null;
}

function pageFromFields(
  canvas: ProjectCanvas,
  fields: Record<string, string>,
): {
  canvas: ProjectCanvas;
  pageId: string | null;
  subPageId: string | null;
  device: CanvasDevice | null;
} {
  const rawPageValue = (fields.page ?? fields.screen ?? fields.route ?? "").trim();
  const rawSubPageValue = (
    fields.subPage ??
    fields.subpage ??
    fields.view ??
    fields.variant ??
    ""
  ).trim();
  const pageValue = rawPageValue.toLowerCase();
  if (pageValue === "backend") {
    return { canvas, pageId: null, subPageId: null, device: null };
  }
  if (!pageValue) {
    const subPage = findOrCreateSubPage(
      canvas,
      canvas.activePageId,
      rawSubPageValue,
    );
    return {
      canvas: subPage.canvas,
      pageId: canvas.activePageId,
      subPageId: subPage.subPageId,
      device: canvas.activeDevice,
    };
  }
  const pageReference = parsePageReference(rawPageValue);
  const page = findCanvasPage(canvas.pages, pageReference.page);
  if (page) {
    const subPageValue = rawSubPageValue || pageReference.subPage || "";
    const subPage = findOrCreateSubPage(canvas, page.id, subPageValue);
    return {
      canvas: subPage.canvas,
      pageId: page.id,
      subPageId: subPage.subPageId,
      device: canvas.activeDevice,
    };
  }
  const createdPage = createCanvasPage(canvas.pages, pageReference.page);
  const subPageValue = rawSubPageValue || pageReference.subPage || "";
  const createdPageWithSubPage = subPageValue
    ? {
        ...createdPage,
        subPages: [
          {
            id: uniqueSubPageId(createdPage.subPages, createdPage.id, subPageValue),
            pageId: createdPage.id,
            name: displaySubPageName(subPageValue, 1),
            order: 0,
          },
        ],
      }
    : createdPage;
  const nextCanvas = {
    ...canvas,
    pages: [...canvas.pages, createdPageWithSubPage],
  };
  return {
    canvas: nextCanvas,
    pageId: createdPageWithSubPage.id,
    subPageId: defaultSubPageId([createdPageWithSubPage], createdPageWithSubPage.id),
    device: canvas.activeDevice,
  };
}

function findCanvasPage(pages: CanvasPage[], value: string) {
  const normalized = normalizePageLookupValue(value);
  return pages.find((page, index) => {
    const aliases = [
      page.id,
      page.name,
      `P${index + 1}`,
      `Page ${index + 1}`,
      String(index + 1),
    ].map(normalizePageLookupValue);
    return aliases.includes(normalized);
  });
}

function findCanvasSubPage(
  pages: CanvasPage[],
  pageId: string,
  value: string,
) {
  if (!value) {
    return pages.find((page) => page.id === pageId)?.subPages[0] ?? null;
  }
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) return null;
  const normalized = normalizePageLookupValue(value);
  return page.subPages.find((subPage, index) => {
    const aliases = [
      subPage.id,
      subPage.name,
      `${index + 1}`,
      `S${index + 1}`,
      `State ${index + 1}`,
    ].map(normalizePageLookupValue);
    return aliases.includes(normalized);
  }) ?? null;
}

function findOrCreateSubPage(
  canvas: ProjectCanvas,
  pageId: string,
  value: string,
) {
  const page = canvas.pages.find((candidate) => candidate.id === pageId);
  if (!page || !value) {
    return { canvas, subPageId: defaultSubPageId(canvas.pages, pageId) };
  }
  const existing = findCanvasSubPage(canvas.pages, pageId, value);
  if (existing) return { canvas, subPageId: existing.id };
  const order =
    page.subPages.reduce((max, subPage) => Math.max(max, subPage.order), -1) + 1;
  const subPage = {
    id: uniqueSubPageId(page.subPages, page.id, value),
    pageId: page.id,
    name: displaySubPageName(value, order + 1),
    order,
  };
  return {
    canvas: {
      ...canvas,
      pages: canvas.pages.map((candidate) =>
        candidate.id === page.id
          ? { ...candidate, subPages: [...candidate.subPages, subPage] }
          : candidate,
      ),
    },
    subPageId: subPage.id,
  };
}

function createCanvasPage(pages: CanvasPage[], value: string): CanvasPage {
  const order = pages.reduce((max, page) => Math.max(max, page.order), -1) + 1;
  const name = displayPageName(value, order + 1);
  const id = uniquePageId(pages, name);
  return {
    id,
    name,
    order,
    subPages: [
      {
        id: `${id}-subpage-1`,
        pageId: id,
        name: "State 1",
        order: 0,
      },
    ],
  };
}

function parsePageReference(value: string) {
  const trimmed = value.replace(/^["']|["']$/g, "").trim();
  const match = trimmed.match(/^(P?\d+|Page\s+\d+)\.(\d+)(?:\s+(.+))?$/i);
  if (!match) return { page: trimmed, subPage: "" };
  return {
    page: match[1],
    subPage: match[3]?.trim() || `State ${match[2]}`,
  };
}

function displayPageName(value: string, fallbackNumber: number) {
  const trimmed = value.replace(/^["']|["']$/g, "").trim();
  const numeric = trimmed.match(/^(?:p|page|page-)?\s*(\d+)$/i)?.[1];
  if (numeric) return `Page ${numeric}`;
  return trimmed || `Page ${fallbackNumber}`;
}

function displaySubPageName(value: string, fallbackNumber: number) {
  const trimmed = value.replace(/^["']|["']$/g, "").trim();
  const numeric = trimmed.match(/^(?:s|state)?\s*(\d+)$/i)?.[1];
  if (numeric) return `State ${numeric}`;
  return trimmed || `State ${fallbackNumber}`;
}

function uniquePageId(pages: CanvasPage[], name: string) {
  const used = new Set(pages.map((page) => page.id.toLowerCase()));
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueSubPageId(
  subPages: CanvasPage["subPages"],
  pageId: string,
  name: string,
) {
  const used = new Set(subPages.map((subPage) => subPage.id.toLowerCase()));
  const base =
    `${pageId}-${name}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `${pageId}-subpage`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function normalizePageLookupValue(value: string) {
  return value.toLowerCase().replace(/["']/g, "").replace(/[\s_-]+/g, "");
}

function parseNumberList(value: string | undefined) {
  if (!value) return null;
  const numbers = value
    .split(/[,/]/)
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite);
  return numbers.length > 0 ? numbers : null;
}

function numberField(value: string | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanField(value: string | undefined) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (["true", "yes", "1", "locked"].includes(normalized)) return true;
  if (["false", "no", "0", "unlocked"].includes(normalized)) return false;
  return null;
}

function withItemBounds(item: CanvasItem): CanvasItem {
  return {
    ...item,
    bounds: boundsFromRect(item.x, item.y, item.width, item.height),
  };
}

function boundsFromRect(
  x: number,
  y: number,
  width: number,
  height: number,
): CanvasBounds {
  return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height };
}

function resolveCanvasGroups(
  groups: CanvasGroup[],
  items: CanvasItem[],
): CanvasGroup[] {
  return groups
    .map((group) => {
      const children = group.itemIds
        .map((itemId) => items.find((item) => item.id === itemId))
        .filter((item): item is CanvasItem => item !== undefined);
      if (children.length < 2) return null;
      const state = children[0].state;
      if (!children.every((item) => item.state === state)) return null;
      return {
        ...group,
        state,
        bounds: groupBoundsFromItems(children),
        updatedAt: Date.now(),
      };
    })
    .filter((group): group is CanvasGroup => group !== null);
}

function groupBoundsFromItems(items: CanvasItem[]) {
  const primary = items.reduce((largest, item) =>
    item.width * item.height > largest.width * largest.height ? item : largest,
  );
  return boundsFromRect(primary.x, primary.y, primary.width, primary.height);
}

function hasOriginalGeometry(item: CanvasItem) {
  return (
    item.originalX != null ||
    item.originalY != null ||
    item.originalWidth != null ||
    item.originalHeight != null
  );
}

function shouldClearProposalOriginalGeometry(
  item: CanvasItem,
  baseItem: CanvasItem | null,
) {
  if (!hasOriginalGeometry(item)) return false;
  if (!baseItem) return true;
  const geometryChanged =
    item.x !== baseItem.x ||
    item.y !== baseItem.y ||
    item.width !== baseItem.width ||
    item.height !== baseItem.height;
  if (geometryChanged) return true;
  return !hasOriginalGeometry(baseItem);
}

function referenceNumber(reference: string) {
  const value = Number(reference.slice(1));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return trimmed;
}
