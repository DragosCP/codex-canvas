import {
  canvasRectFromGridRect,
  canvasRectFromNormalizedRect,
  cloneProjectCanvas,
  createCanvasItem,
  defaultSubPageId,
  applyCanvasInteractionFrame,
  upsertCanvasInteractionFrame,
} from "./canvasState";
import type {
  CanvasBounds,
  CanvasDevice,
  CanvasGroup,
  CanvasInteractionFrameNumber,
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

type ParsedInteractionLine = {
  triggerReference: string;
  targetReference: string;
  frameNumber: CanvasInteractionFrameNumber;
  fields: Record<string, string>;
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

export const CANVAS_PROPOSAL_PARSER_VERSION = 8;

export function applyCanvasProposalText(
  baseCanvas: ProjectCanvas,
  text: string,
): CanvasProposalParseResult {
  let canvas = cloneProjectCanvas(baseCanvas);
  const lines = proposalLines(text);
  const errors: string[] = [];
  const changes: string[] = [];

  for (const line of lines) {
    const parsedInteraction = parseInteractionProposalLine(line);
    if (parsedInteraction) {
      const result = applyInteractionProposalLine(canvas, parsedInteraction);
      if (!result.changed) {
        if (result.error) errors.push(result.error);
        continue;
      }
      canvas = result.canvas;
      changes.push(result.label);
      continue;
    }
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
  canvas = focusFirstPopulatedUiView(canvas);

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

function focusFirstPopulatedUiView(canvas: ProjectCanvas): ProjectCanvas {
  const currentViewHasChangedItems = canvas.items.some(
    (item) =>
      item.pageId === canvas.activePageId &&
      item.subPageId === canvas.activeSubPageId &&
      item.visible &&
      isProposalChangedItem(item),
  );
  if (currentViewHasChangedItems) return canvas;

  const sortedPages = [...canvas.pages].sort((left, right) => left.order - right.order);
  for (const page of sortedPages) {
    const sortedSubPages = [...page.subPages].sort(
      (left, right) => left.order - right.order,
    );
    const changedSubPage = sortedSubPages.find((subPage) =>
      canvas.items.some(
        (item) =>
          item.pageId === page.id &&
          item.subPageId === subPage.id &&
          item.visible &&
          isProposalChangedItem(item),
      ),
    );
    if (!changedSubPage) continue;
    return {
      ...canvas,
      activePageId: page.id,
      activeSubPageId: changedSubPage.id,
    };
  }

  const currentViewHasItems = canvas.items.some(
    (item) =>
      item.pageId === canvas.activePageId &&
      item.subPageId === canvas.activeSubPageId &&
      item.visible,
  );
  if (currentViewHasItems) return canvas;

  for (const page of sortedPages) {
    const sortedSubPages = [...page.subPages].sort(
      (left, right) => left.order - right.order,
    );
    const populatedSubPage = sortedSubPages.find((subPage) =>
      canvas.items.some(
        (item) =>
          item.pageId === page.id && item.subPageId === subPage.id && item.visible,
      ),
    );
    if (!populatedSubPage) continue;
    return {
      ...canvas,
      activePageId: page.id,
      activeSubPageId: populatedSubPage.id,
    };
  }

  return canvas;
}

function isProposalChangedItem(item: CanvasItem) {
  return item.state !== "current" || hasOriginalGeometry(item);
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
  const removedItemIds = new Set<string>();
  const items = proposalCanvas.items.flatMap((item) => {
    const baseItem =
      baseById.get(item.id) ?? baseByReference.get(item.reference.toUpperCase()) ?? null;
    if (item.state === "deleted") {
      removedItemIds.add(item.id);
      changed = true;
      return [];
    }
    let nextItem = item;
    if (item.state === "proposed") {
      changed = true;
      nextItem = {
        ...nextItem,
        state: "current",
        locked: true,
      };
    }
    if (shouldClearProposalOriginalGeometry(nextItem, baseItem)) {
      changed = true;
      nextItem = {
        ...nextItem,
        originalX: null,
        originalY: null,
        originalWidth: null,
        originalHeight: null,
      };
    }
    return [nextItem];
  });
  const groups = proposalCanvas.groups.flatMap((group) => {
    if (group.state === "deleted") {
      changed = true;
      return [];
    }
    const itemIds = group.itemIds.filter((itemId) => !removedItemIds.has(itemId));
    if (itemIds.length === 0) {
      changed = true;
      return [];
    }
    if (group.state !== "proposed" && itemIds.length === group.itemIds.length) {
      return [group];
    }
    changed = true;
    return [
      {
        ...group,
        itemIds,
        state: group.state === "proposed" ? "current" : group.state,
        locked: group.state === "proposed" ? true : group.locked,
      },
    ];
  });
  const interactionPreviews =
    removedItemIds.size === 0
      ? proposalCanvas.interactionPreviews
      : proposalCanvas.interactionPreviews
          .filter((preview) => !removedItemIds.has(preview.triggerId))
          .map((preview) => ({
            ...preview,
            frames: preview.frames.map((frame) => ({
              ...frame,
              affected: frame.affected.filter(
                (delta) => !removedItemIds.has(delta.itemId),
              ),
            })),
          }));
  return changed
    ? {
        ...proposalCanvas,
        items,
        groups,
        interactionPreviews,
        updatedAt: Date.now(),
      }
    : proposalCanvas;
}

export function mergeAcceptedCanvasProposal(
  currentCanvas: ProjectCanvas,
  proposalCanvas: ProjectCanvas,
  baseCanvas: ProjectCanvas | null,
): ProjectCanvas {
  const baseById = new Map(baseCanvas?.items.map((item) => [item.id, item]));
  const baseByReference = new Map(
    baseCanvas?.items.map((item) => [item.reference.toUpperCase(), item]),
  );
  const currentById = new Map(currentCanvas.items.map((item) => [item.id, item]));
  const currentByReference = new Map(
    currentCanvas.items.map((item) => [item.reference.toUpperCase(), item]),
  );
  const pageMap = buildPageMergeMap(currentCanvas, proposalCanvas);
  const changedProposalItems = proposalCanvas.items.filter((item) =>
    shouldMergeProposalItem(
      item,
      baseById.get(item.id) ??
        baseByReference.get(item.reference.toUpperCase()) ??
        null,
    ),
  );
  if (changedProposalItems.length === 0) return currentCanvas;

  const now = Date.now();
  const changedProposalItemIds = new Set(changedProposalItems.map((item) => item.id));
  const removedCurrentItemIds = new Set<string>();
  const proposalToCurrentItemId = new Map<string, string>();
  const usedItemIds = new Set(currentCanvas.items.map((item) => item.id));
  const usedItemReferences = new Set(
    currentCanvas.items.map((item) => item.reference.toUpperCase()),
  );
  let items = [...currentCanvas.items];

  for (const proposalItem of changedProposalItems) {
    const existing =
      currentById.get(proposalItem.id) ??
      currentByReference.get(proposalItem.reference.toUpperCase()) ??
      null;

    if (proposalItem.state === "deleted") {
      if (existing) {
        removedCurrentItemIds.add(existing.id);
        proposalToCurrentItemId.set(proposalItem.id, existing.id);
        items = items.filter((item) => item.id !== existing.id);
      }
      continue;
    }

    const pageScope = mapProposalScope(proposalItem, pageMap, currentCanvas);
    if (existing) {
      proposalToCurrentItemId.set(proposalItem.id, existing.id);
      items = items.map((item) =>
        item.id === existing.id
          ? withMergedItemBounds({
              ...item,
              kind: proposalItem.kind,
              title: proposalItem.title,
              body: proposalItem.body,
              x: proposalItem.x,
              y: proposalItem.y,
              width: proposalItem.width,
              height: proposalItem.height,
              state: "current",
              locked: true,
              visible: proposalItem.visible,
              zIndex: proposalItem.zIndex,
              pageId: pageScope.pageId,
              subPageId: pageScope.subPageId,
              device: proposalItem.device,
              comment: proposalItem.comment,
              originalX: null,
              originalY: null,
              originalWidth: null,
              originalHeight: null,
              updatedAt: now,
            })
          : item,
      );
      continue;
    }

    const itemId = uniqueMergeId(proposalItem.id, usedItemIds);
    usedItemIds.add(itemId);
    const reference = uniqueMergeReference(
      proposalItem.reference,
      proposalItem.kind,
      usedItemReferences,
    );
    usedItemReferences.add(reference.toUpperCase());
    proposalToCurrentItemId.set(proposalItem.id, itemId);
    items.push(
      withMergedItemBounds({
        ...proposalItem,
        id: itemId,
        numericId: numericReferenceValue(reference) ?? nextMergeItemNumericId(items),
        reference,
        state: "current",
        locked: true,
        pageId: pageScope.pageId,
        subPageId: pageScope.subPageId,
        originalX: null,
        originalY: null,
        originalWidth: null,
        originalHeight: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  const baseGroupsById = new Map(baseCanvas?.groups.map((group) => [group.id, group]));
  const baseGroupsByReference = new Map(
    baseCanvas?.groups.map((group) => [group.reference.toUpperCase(), group]),
  );
  const currentGroupsById = new Map(
    currentCanvas.groups.map((group) => [group.id, group]),
  );
  const currentGroupsByReference = new Map(
    currentCanvas.groups.map((group) => [group.reference.toUpperCase(), group]),
  );
  const usedGroupIds = new Set(currentCanvas.groups.map((group) => group.id));
  const usedGroupReferences = new Set(
    currentCanvas.groups.map((group) => group.reference.toUpperCase()),
  );
  let groups = currentCanvas.groups
    .map((group) => ({
      ...group,
      itemIds: group.itemIds.filter((itemId) => !removedCurrentItemIds.has(itemId)),
    }))
    .filter((group) => group.itemIds.length > 1);

  for (const proposalGroup of proposalCanvas.groups) {
    const baseGroup =
      baseGroupsById.get(proposalGroup.id) ??
      baseGroupsByReference.get(proposalGroup.reference.toUpperCase()) ??
      null;
    const groupChanged =
      proposalGroup.state !== "current" ||
      proposalGroup.itemIds.some((itemId) => changedProposalItemIds.has(itemId)) ||
      !baseGroup ||
      !sameCanvasGroup(proposalGroup, baseGroup);
    if (!groupChanged) continue;

    const existing =
      currentGroupsById.get(proposalGroup.id) ??
      currentGroupsByReference.get(proposalGroup.reference.toUpperCase()) ??
      null;
    if (proposalGroup.state === "deleted") {
      groups = groups.filter((group) => group.id !== existing?.id);
      continue;
    }

    const itemIds = proposalGroup.itemIds
      .map((itemId) => proposalToCurrentItemId.get(itemId) ?? itemId)
      .filter((itemId) => items.some((item) => item.id === itemId));
    if (itemIds.length < 2) continue;
    const pageScope = mapProposalScope(proposalGroup, pageMap, currentCanvas);
    if (existing) {
      groups = groups.map((group) =>
        group.id === existing.id
          ? {
              ...group,
              title: proposalGroup.title,
              state: "current",
              itemIds,
              locked: true,
              pageId: pageScope.pageId,
              subPageId: pageScope.subPageId,
              device: proposalGroup.device,
              updatedAt: now,
            }
          : group,
      );
      continue;
    }

    const groupId = uniqueMergeId(proposalGroup.id, usedGroupIds);
    usedGroupIds.add(groupId);
    const reference = uniqueGroupMergeReference(
      proposalGroup.reference,
      usedGroupReferences,
    );
    usedGroupReferences.add(reference.toUpperCase());
    groups.push({
      ...proposalGroup,
      id: groupId,
      numericId: numericReferenceValue(reference) ?? nextMergeGroupNumericId(groups),
      reference,
      state: "current",
      itemIds,
      locked: true,
      pageId: pageScope.pageId,
      subPageId: pageScope.subPageId,
      createdAt: now,
      updatedAt: now,
    });
  }

  items = items.map((item) =>
    item.groupId && !groups.some((group) => group.id === item.groupId)
      ? { ...item, groupId: null, updatedAt: now }
      : item,
  );
  groups = refreshMergedGroups(groups, items);

  return focusFirstPopulatedUiView({
    ...currentCanvas,
    pages: pageMap.pages,
    activePageId: pageMap.activePageId,
    activeSubPageId: pageMap.activeSubPageId,
    items,
    groups,
    updatedAt: now,
  });
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
  if (/^(interaction|frame|preview)\b/i.test(line)) return true;
  const first = line.split(/\s|;/, 1)[0]?.replace(/:$/, "");
  if (first && (REFERENCE_RE.test(first) || GROUP_RE.test(first))) return true;
  return /\b(state|xywh|rect|bounds|x|y|w|h|width|height|grid|gxywh|gridxywh|gx|gy|gw|gh|norm|normalized|nxywh|nx|ny|nw|nh)=/i.test(line);
}

function parseInteractionProposalLine(line: string): ParsedInteractionLine | null {
  const first = line.split(/\s+/, 1)[0]?.toLowerCase().replace(/:$/, "");
  if (!first || !["interaction", "frame", "preview"].includes(first)) return null;
  const fields = parseFields(line);
  const frameNumber = interactionFrameNumber(fields.frame ?? fields.frameNumber);
  if (!frameNumber) return null;
  const words = line.split(/\s+/).filter(Boolean);
  const references = referencesFromWords(words);
  const triggerReference =
    referenceField(fields.trigger ?? fields.triggerRef ?? fields.from) ??
    references[0] ??
    null;
  const targetReference =
    referenceField(fields.target ?? fields.targetRef ?? fields.affects ?? fields.to) ??
    references.find((reference) => reference !== triggerReference) ??
    null;
  if (!triggerReference || !targetReference) return null;
  return {
    triggerReference,
    targetReference,
    frameNumber,
    fields,
    raw: line,
  };
}

function applyInteractionProposalLine(
  canvas: ProjectCanvas,
  parsed: ParsedInteractionLine,
) {
  const trigger = canvasReferenceTarget(canvas, parsed.triggerReference);
  if (!trigger) {
    return {
      canvas,
      changed: false,
      label: parsed.triggerReference,
      error: `Could not find interaction trigger: ${parsed.raw}`,
    };
  }
  const target = canvasReferenceTarget(canvas, parsed.targetReference);
  if (!target) {
    return {
      canvas,
      changed: false,
      label: parsed.targetReference,
      error: `Could not find interaction target: ${parsed.raw}`,
    };
  }

  const existingPreview = canvas.interactionPreviews.find(
    (preview) =>
      preview.triggerKind === trigger.kind && preview.triggerId === trigger.value.id,
  );
  let draftCanvas =
    existingPreview?.frames.some((frame) => frame.frame === parsed.frameNumber)
      ? applyCanvasInteractionFrame(canvas, existingPreview.id, parsed.frameNumber)
      : canvas;
  const rect = rectFromFields(parsed.fields);
  const visible = booleanField(parsed.fields.visible);
  draftCanvas = applyInteractionTargetPatch(draftCanvas, target, rect, visible);
  const nextCanvas = upsertCanvasInteractionFrame({
    canvas,
    baseCanvas: canvas,
    draftCanvas,
    triggerKind: trigger.kind,
    triggerId: trigger.value.id,
    frameNumber: parsed.frameNumber,
  });
  const nextPreview = nextCanvas.interactionPreviews.find(
    (preview) =>
      preview.triggerKind === trigger.kind && preview.triggerId === trigger.value.id,
  );
  const nextFrame = nextPreview?.frames.find(
    (frame) => frame.frame === parsed.frameNumber,
  );
  if (!nextPreview || !nextFrame || nextFrame.affected.length === 0) {
    return {
      canvas,
      changed: false,
      label: `${parsed.triggerReference} frame ${parsed.frameNumber}`,
      error: `Interaction frame had no target changes: ${parsed.raw}`,
    };
  }
  const sticky = booleanField(parsed.fields.sticky);
  const holdMs = numberField(
    parsed.fields.holdMs ?? parsed.fields.hold ?? parsed.fields.duration,
  );
  const timedCanvas =
    sticky != null || holdMs != null
      ? {
          ...nextCanvas,
          interactionPreviews: nextCanvas.interactionPreviews.map((preview) =>
            preview.id !== nextPreview.id
              ? preview
              : {
                  ...preview,
                  frames: preview.frames.map((frame) =>
                    frame.frame === parsed.frameNumber
                      ? {
                          ...frame,
                          sticky: sticky ?? frame.sticky,
                          holdMs: holdMs != null ? Math.max(150, Math.round(holdMs)) : frame.holdMs,
                          updatedAt: Date.now(),
                        }
                      : frame,
                  ),
                  updatedAt: Date.now(),
                },
          ),
          updatedAt: Date.now(),
        }
      : nextCanvas;
  return {
    canvas: timedCanvas,
    changed: true,
    label: `${trigger.value.reference} frame ${parsed.frameNumber}`,
    error: null,
  };
}

function canvasReferenceTarget(
  canvas: ProjectCanvas,
  reference: string,
): { kind: "group"; value: CanvasGroup } | { kind: "item"; value: CanvasItem } | null {
  const upper = reference.toUpperCase();
  if (GROUP_RE.test(upper)) {
    const group = canvas.groups.find(
      (candidate) => candidate.reference.toUpperCase() === upper,
    );
    return group ? { kind: "group", value: group } : null;
  }
  const item = canvas.items.find(
    (candidate) => candidate.reference.toUpperCase() === upper,
  );
  return item ? { kind: "item", value: item } : null;
}

function applyInteractionTargetPatch(
  canvas: ProjectCanvas,
  target: NonNullable<ReturnType<typeof canvasReferenceTarget>>,
  rect: ReturnType<typeof rectFromFields>,
  visible: boolean | null,
) {
  if (target.kind === "item") {
    return updateCanvasItem(canvas, target.value.id, {
      ...(rect ? rect : {}),
      ...(visible != null ? { visible } : {}),
    });
  }
  const dx = rect ? rect.x - target.value.bounds.x : 0;
  const dy = rect ? rect.y - target.value.bounds.y : 0;
  const memberIds = new Set(target.value.itemIds);
  return {
    ...canvas,
    items: canvas.items.map((item) => {
      if (!memberIds.has(item.id)) return item;
      return withItemBounds({
        ...item,
        ...(rect ? { x: item.x + dx, y: item.y + dy } : {}),
        ...(visible != null ? { visible } : {}),
        updatedAt: Date.now(),
      });
    }),
  };
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
      body:
        parsed.fields.description ??
        parsed.fields.label ??
        parsed.fields.body ??
        parsed.fields.text ??
        item.body,
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
  if (
    parsed.fields.description ||
    parsed.fields.label ||
    parsed.fields.body ||
    parsed.fields.text
  ) {
    patch.body =
      parsed.fields.description ??
      parsed.fields.label ??
      parsed.fields.body ??
      parsed.fields.text;
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

function referencesFromWords(words: string[]) {
  const references: string[] = [];
  for (const word of words) {
    const cleaned = word.replace(/[;:,()[\]]/g, "").toUpperCase();
    if ((REFERENCE_RE.test(cleaned) || GROUP_RE.test(cleaned)) && !references.includes(cleaned)) {
      references.push(cleaned);
    }
  }
  return references;
}

function referenceField(value: string | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[;:,()[\]]/g, "").toUpperCase();
  return REFERENCE_RE.test(cleaned) || GROUP_RE.test(cleaned) ? cleaned : null;
}

function interactionFrameNumber(
  value: string | undefined,
): CanvasInteractionFrameNumber | null {
  const number = Number(value);
  if (number === 2 || number === 3) return number;
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
  const pageIndex = pages
    .slice()
    .sort((left, right) => left.order - right.order)
    .findIndex((candidate) => candidate.id === pageId);
  const normalized = normalizePageLookupValue(value);
  return page.subPages.find((subPage, index) => {
    const aliases = [
      subPage.id,
      subPage.name,
      `${index + 1}`,
      `S${index + 1}`,
      `State ${index + 1}`,
      pageIndex >= 0 ? `P${pageIndex + 1}.${index + 1}` : "",
      pageIndex >= 0 ? `P${pageIndex + 1}.${index + 1} ${subPage.name}` : "",
      pageIndex >= 0 ? `Page ${pageIndex + 1}.${index + 1}` : "",
      pageIndex >= 0
        ? `Page ${pageIndex + 1}.${index + 1} ${subPage.name}`
        : "",
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
  const name = displaySubPageName(value, order + 1);
  const subPage = {
    id: uniqueSubPageId(page.subPages, page.id, name),
    pageId: page.id,
    name,
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
  const prefixed = trimmed.match(/^(?:P|Page\s*)?\d+\.\d+\s+(.+)$/i);
  if (prefixed) return prefixed[1]?.trim() || `State ${fallbackNumber}`;
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

function shouldMergeProposalItem(item: CanvasItem, baseItem: CanvasItem | null) {
  return (
    item.state !== "current" ||
    hasOriginalGeometry(item) ||
    !baseItem ||
    !sameCanvasItem(item, baseItem)
  );
}

function sameCanvasItem(left: CanvasItem, right: CanvasItem) {
  return (
    left.kind === right.kind &&
    left.title === right.title &&
    left.body === right.body &&
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height &&
    left.state === right.state &&
    left.visible === right.visible &&
    left.pageId === right.pageId &&
    left.subPageId === right.subPageId &&
    left.device === right.device &&
    left.comment === right.comment
  );
}

function sameCanvasGroup(left: CanvasGroup, right: CanvasGroup) {
  return (
    left.title === right.title &&
    left.state === right.state &&
    left.pageId === right.pageId &&
    left.subPageId === right.subPageId &&
    left.device === right.device &&
    left.itemIds.length === right.itemIds.length &&
    left.itemIds.every((itemId, index) => itemId === right.itemIds[index])
  );
}

type PageMergeMap = {
  pages: CanvasPage[];
  activePageId: string;
  activeSubPageId: string;
  pageIds: Map<string, string>;
  subPageIds: Map<string, string>;
};

function buildPageMergeMap(
  currentCanvas: ProjectCanvas,
  proposalCanvas: ProjectCanvas,
): PageMergeMap {
  let pages = [...currentCanvas.pages];
  const pageIds = new Map<string, string>();
  const subPageIds = new Map<string, string>();
  let activePageId = currentCanvas.activePageId;
  let activeSubPageId = currentCanvas.activeSubPageId;

  for (const proposalPage of proposalCanvas.pages) {
    const currentPage =
      pages.find((page) => page.id === proposalPage.id) ??
      pages.find(
        (page) => page.name.toLowerCase() === proposalPage.name.toLowerCase(),
      ) ??
      null;
    const pageId = currentPage?.id ?? proposalPage.id;
    pageIds.set(proposalPage.id, pageId);
    if (!currentPage) {
      pages = [
        ...pages,
        {
          ...proposalPage,
          id: pageId,
          order:
            pages.reduce((max, page) => Math.max(max, page.order), -1) + 1,
          subPages: [],
        },
      ];
    }

    const latestPage = pages.find((page) => page.id === pageId);
    const existingSubPages = latestPage?.subPages ?? [];
    for (const proposalSubPage of proposalPage.subPages) {
      const currentSubPage =
        existingSubPages.find((subPage) => subPage.id === proposalSubPage.id) ??
        existingSubPages.find(
          (subPage) =>
            subPage.name.toLowerCase() === proposalSubPage.name.toLowerCase(),
        ) ??
        null;
      const subPageId = currentSubPage?.id ?? proposalSubPage.id;
      subPageIds.set(proposalSubPage.id, subPageId);
      if (currentSubPage) continue;
      pages = pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              subPages: [
                ...page.subPages,
                {
                  ...proposalSubPage,
                  id: subPageId,
                  pageId,
                  order:
                    page.subPages.reduce(
                      (max, subPage) => Math.max(max, subPage.order),
                      -1,
                    ) + 1,
                },
              ],
            }
          : page,
      );
    }
  }

  if (!pages.some((page) => page.id === activePageId)) {
    activePageId = pages[0]?.id ?? currentCanvas.activePageId;
  }
  const activePage = pages.find((page) => page.id === activePageId);
  if (
    activePage &&
    !activePage.subPages.some((subPage) => subPage.id === activeSubPageId)
  ) {
    activeSubPageId = activePage.subPages[0]?.id ?? activeSubPageId;
  }

  return { pages, activePageId, activeSubPageId, pageIds, subPageIds };
}

function mapProposalScope(
  target: Pick<CanvasItem | CanvasGroup, "pageId" | "subPageId">,
  pageMap: PageMergeMap,
  currentCanvas: ProjectCanvas,
) {
  const pageId = target.pageId
    ? pageMap.pageIds.get(target.pageId) ?? target.pageId
    : null;
  return {
    pageId,
    subPageId:
      pageId === null
        ? null
        : target.subPageId
          ? pageMap.subPageIds.get(target.subPageId) ?? target.subPageId
          : defaultSubPageId(pageMap.pages, pageId) ??
            defaultSubPageId(currentCanvas.pages, pageId),
  };
}

function uniqueMergeId(id: string, usedIds: Set<string>) {
  if (!usedIds.has(id)) return id;
  let next = crypto.randomUUID();
  while (usedIds.has(next)) next = crypto.randomUUID();
  return next;
}

function uniqueMergeReference(
  reference: string,
  kind: CanvasItemKind,
  usedReferences: Set<string>,
) {
  if (!usedReferences.has(reference.toUpperCase())) return reference;
  const prefix = referencePrefix(kind);
  let next = 1;
  while (usedReferences.has(`${prefix}${next}`)) next += 1;
  return `${prefix}${next}`;
}

function uniqueGroupMergeReference(reference: string, usedReferences: Set<string>) {
  if (!usedReferences.has(reference.toUpperCase())) return reference;
  let next = 1;
  while (usedReferences.has(`G${next}`)) next += 1;
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

function numericReferenceValue(reference: string) {
  const value = Number(reference.replace(/^[A-Za-z]+/, ""));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function nextMergeItemNumericId(items: CanvasItem[]) {
  return items.reduce((max, item) => Math.max(max, item.numericId), 0) + 1;
}

function nextMergeGroupNumericId(groups: CanvasGroup[]) {
  return groups.reduce((max, group) => Math.max(max, group.numericId), 0) + 1;
}

function withMergedItemBounds(item: CanvasItem): CanvasItem {
  return {
    ...item,
    bounds: boundsFromRect(item.x, item.y, item.width, item.height),
  };
}

function refreshMergedGroups(groups: CanvasGroup[], items: CanvasItem[]) {
  return resolveCanvasGroups(groups, items).map((group) => ({
    ...group,
    locked: group.state === "current" ? true : group.locked,
  }));
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
