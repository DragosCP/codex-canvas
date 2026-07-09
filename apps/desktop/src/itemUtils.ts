import type {
  SandboxMode,
  SandboxPolicy,
  Thread,
  ThreadItem,
  Turn,
} from "./types";
import {
  previewArtifactActionName,
  previewArtifactDisplayName,
  previewArtifactKindFromText,
} from "./mockupArtifacts";

export function sandboxPolicyFor(
  mode: SandboxMode,
  cwd: string | null,
): SandboxPolicy {
  if (mode === "danger-full-access") return { type: "dangerFullAccess" };
  if (mode === "read-only") return { type: "readOnly", networkAccess: false };
  return {
    type: "workspaceWrite",
    writableRoots: cwd ? [cwd] : [],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

export function activeTurn(thread: Thread | null): Turn | null {
  if (!thread || thread.turns.length === 0) return null;
  return thread.turns[thread.turns.length - 1] ?? null;
}

export function allItems(thread: Thread | null): ThreadItem[] {
  return thread?.turns.flatMap((turn) => turn.items) ?? [];
}

export function threadTitle(thread: Thread): string {
  const title = thread.name || thread.preview || "New chat";
  const canvasQuestionTitle = friendlyCanvasQuestionTitle(title);
  if (canvasQuestionTitle) return canvasQuestionTitle;
  const codeProposalTitle = friendlyCodeProposalWorkspaceTitle(title);
  if (codeProposalTitle) return codeProposalTitle;
  const liveOverlayProposalTitle = friendlyLiveOverlayProposalTitle(title);
  if (liveOverlayProposalTitle) return liveOverlayProposalTitle;
  const featureDraftTitle = friendlyFeatureDraftWorkspaceTitle(title);
  if (featureDraftTitle) return featureDraftTitle;
  const mockupReviewTitle = friendlySavedMockupReviewTitle(title);
  if (mockupReviewTitle) return mockupReviewTitle;
  const visualDecisionTitle = friendlyVisualDecisionSelectionTitle(title);
  if (visualDecisionTitle) return visualDecisionTitle;
  const buildSelectedTitle = friendlyBuildSelectedMockupTitle(title);
  if (buildSelectedTitle) return buildSelectedTitle;
  const codexContextTitle = friendlyCodexContextTitle(title);
  if (codexContextTitle) return codexContextTitle;
  const mockupTitle = friendlyMockupPromptTitle(title);
  if (mockupTitle) return mockupTitle;
  return scrubInternalThreadTitle(
    trimInternalContextTail(unwrapPlanModeUserRequest(title)),
  ) || "New chat";
}

function friendlySavedMockupReviewTitle(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  const sentinel = "[Codex Saved Mockup Review Context]";
  const sentinelIndex = visible.indexOf(sentinel);
  if (sentinelIndex === -1) {
    return null;
  }
  const payload = visible.slice(sentinelIndex);
  const marker = "\n\nUser request:\n";
  const markerIndex = payload.indexOf(marker);
  if (markerIndex === -1) return `Review saved ${savedArtifactLabel(payload, 2)}`;
  const request = trimInternalContextTail(
    payload.slice(markerIndex + marker.length),
  ).trim();
  return request ? compactTitle(request) : `Review saved ${savedArtifactLabel(payload, 2)}`;
}

function friendlyCanvasQuestionTitle(text: string) {
  const request = extractOriginalRequestForSentinel(
    text,
    "[Codex Canvas Question Context]",
  );
  if (request == null) return null;
  return request ? compactTitle(request) : "Choose Canvas path";
}

function friendlyCodeProposalWorkspaceTitle(text: string) {
  const request = extractOriginalRequestForSentinel(
    text,
    "[Codex Code Proposal Workspace Context]",
  );
  if (request == null) return null;
  return request ? compactTitle(request) : "Create runnable proposal";
}

function friendlyLiveOverlayProposalTitle(text: string) {
  const request = extractOriginalRequestForSentinel(
    text,
    "[Codex Live Overlay Proposal Context]",
  );
  if (request == null) return null;
  return request ? compactTitle(request) : "Review Live proposal";
}

function friendlyFeatureDraftWorkspaceTitle(text: string) {
  const request = extractFeatureDraftWorkspaceRequest(text);
  if (request == null) return null;
  return request ? compactTitle(request) : "Draft";
}

function friendlyCodexContextTitle(text: string) {
  const request = extractCodexContextUserRequest(text);
  if (request == null) return null;
  return request ? compactTitle(request) : "New chat";
}

function scrubInternalThreadTitle(title: string) {
  if (title.includes("[Codex Saved Mockup Review Context]")) {
    return `Review saved ${savedArtifactLabel(title, 2)}`;
  }
  if (title.includes("[Codex Canvas Question Context]")) {
    return "Choose Canvas path";
  }
  if (title.includes("[Codex Code Proposal Workspace Context]")) {
    return "Create runnable proposal";
  }
  if (title.includes("[Codex Live Overlay Proposal Context]")) {
    return "Review Live proposal";
  }
  if (title.includes("[Codex Feature Draft Context]")) {
    return "Draft";
  }
  if (isCodexContextWrapper(title)) {
    return "New chat";
  }
  if (title.includes("[Codex Visual Decision Selection]")) {
    return "Use selected Draft action";
  }
  if (title.includes("[Codex Mockup Artifact Task]")) {
    return `Update saved ${savedArtifactLabel(title, 2)}`;
  }
  if (title.includes("[Codex Build Selected Mockup]")) {
    return `Build this ${savedArtifactLabel(title, 1)}`;
  }
  return title;
}

function friendlyVisualDecisionSelectionTitle(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith("[Codex Visual Decision Selection]")) {
    return null;
  }
  const marker = "\n\nUser-visible composer text:\n";
  const markerIndex = visible.indexOf(marker);
  if (markerIndex === -1) return "Use selected Draft action";
  const request = trimInternalContextTail(
    visible.slice(markerIndex + marker.length),
  ).trim();
  return request ? compactTitle(request) : "Use selected Draft action";
}

function friendlyBuildSelectedMockupTitle(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith("[Codex Build Selected Mockup]")) {
    return null;
  }
  const marker = "\n\nUser-visible request:\n";
  const markerIndex = visible.indexOf(marker);
  if (markerIndex === -1) return null;
  const request = trimInternalContextTail(
    visible.slice(markerIndex + marker.length),
  ).trim();
  return request ? compactTitle(request) : `Build this ${savedArtifactLabel(visible, 1)}`;
}

function unwrapPlanModeUserRequest(text: string) {
  const visible = text.trimStart();
  const marker = "\n\nUser request:\n";
  if (!visible.startsWith("Plan Mode:") || !visible.includes(marker)) {
    return visible;
  }
  return visible.slice(visible.indexOf(marker) + marker.length);
}

export function extractFeatureDraftWorkspaceRequest(text: string) {
  return extractMarkedCodexContextRequest(text, "[Codex Feature Draft Context]");
}

export function extractCodexContextUserRequest(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!isCodexContextWrapper(visible)) return null;
  return extractMarkedUserRequest(visible) ?? "";
}

function extractOriginalRequestForSentinel(text: string, sentinel: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith(sentinel)) return null;
  const marker = "\n\nOriginal user request:\n";
  const markerIndex = visible.indexOf(marker);
  if (markerIndex === -1) return "";
  return trimInternalContextTail(
    visible.slice(markerIndex + marker.length),
  ).trim();
}

function extractMarkedCodexContextRequest(text: string, sentinel: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith(sentinel)) return null;
  return extractMarkedUserRequest(visible) ?? "";
}

function extractMarkedUserRequest(text: string) {
  for (const marker of [
    "\n\nUser request:\n",
    "\n\nOriginal user request:\n",
    "User request:\n",
    "Original user request:\n",
  ]) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex !== -1) {
      return trimInternalContextTail(
        text.slice(markerIndex + marker.length),
      ).trim();
    }
  }
  return null;
}

function isCodexContextWrapper(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  return /^\[Codex [^\]]*Context\]/.test(visible);
}

function trimInternalContextTail(text: string) {
  const endMarkers = [
    "Project context explicitly attached by the user:\n",
    "\n\nProject context explicitly attached by the user:\n",
    "Files to inspect if needed:\n",
    "\n\nFiles to inspect if needed:\n",
    "Supporting selected mockup context:\n",
    "\n\nSupporting selected mockup context:\n",
    "Build rules:\n",
    "\n\nBuild rules:\n",
    "Selected preview context:\n",
    "\n\nSelected preview context:\n",
  ];
  const end = endMarkers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return end == null ? text : text.slice(0, end);
}

function compactTitle(text: string) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const normalized = firstLine.replace(/\s+/g, " ").trim();
  return normalized.length > 72
    ? `${normalized.slice(0, 69).trimEnd()}...`
    : normalized;
}

export function friendlyMockupPromptTitle(text: string): string | null {
  const visible = text.trimStart();
  if (visible.startsWith("[Codex Mockup Artifact Task]")) {
    const artifactKind = previewArtifactKindFromText(visible, "mockup");
    const createMatch = visible.match(
      /Create\s+(\d+)\s+saved local (?:mockup|wireframe|preview)/i,
    );
    if (createMatch) {
      const depth = visible.match(/depth\s+"(quick|full)"/i)?.[1] ?? "";
      const depthLabel = depth === "full" ? "full demo " : depth === "quick" ? "quick " : "";
      return `Create ${createMatch[1]} ${depthLabel}${previewArtifactDisplayName(
        artifactKind,
        2,
        "lower",
      )} first`;
    }
    return `Update saved ${previewArtifactDisplayName(artifactKind, 2, "lower")}`;
  }
  if (visible.startsWith("[Codex Build Selected Mockup]")) {
    const artifactLabel = savedArtifactLabel(visible, 1);
    const titleMatch = visible.match(/- Title:\s*(.+)/);
    return titleMatch?.[1]?.trim()
      ? `Build this ${artifactLabel}: ${titleMatch[1].trim()}`
      : `Build this ${artifactLabel}`;
  }
  return null;
}

function savedArtifactLabel(text: string, count: number) {
  return previewArtifactDisplayName(
    previewArtifactKindFromText(text, "mockup"),
    count,
    "lower",
  );
}

export function appendDelta(
  items: ThreadItem[],
  itemId: string,
  delta: string,
): ThreadItem[] {
  return items.map((item) => {
    if (item.id !== itemId) return item;
    if (item.type === "agentMessage")
      return { ...item, text: `${item.text}${delta}` };
    if (item.type === "commandExecution") {
      return {
        ...item,
        aggregatedOutput: `${item.aggregatedOutput ?? ""}${delta}`,
      };
    }
    return item;
  });
}

export function appendPlanDelta(
  items: ThreadItem[],
  itemId: string,
  delta: string,
): ThreadItem[] {
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId || item.type !== "plan") return item;
    found = true;
    return { ...item, text: `${item.text}${delta}` };
  });
  return found ? next : [...next, { type: "plan", id: itemId, text: delta }];
}

export function appendReasoningSummaryDelta(
  items: ThreadItem[],
  itemId: string,
  summaryIndex: number,
  delta: string,
): ThreadItem[] {
  return updateReasoningDelta(items, itemId, "summary", summaryIndex, delta);
}

export function appendReasoningTextDelta(
  items: ThreadItem[],
  itemId: string,
  contentIndex: number,
  delta: string,
): ThreadItem[] {
  return updateReasoningDelta(items, itemId, "content", contentIndex, delta);
}

export function ensureReasoningSummaryPart(
  items: ThreadItem[],
  itemId: string,
  summaryIndex: number,
): ThreadItem[] {
  return updateReasoningDelta(items, itemId, "summary", summaryIndex, "");
}

function updateReasoningDelta(
  items: ThreadItem[],
  itemId: string,
  field: "summary" | "content",
  index: number,
  delta: string,
): ThreadItem[] {
  const safeIndex = Math.max(0, Math.trunc(index));
  let found = false;
  const next = items.map((item) => {
    if (item.id !== itemId || item.type !== "reasoning") return item;
    found = true;
    const values = appendIndexedDelta(item[field], safeIndex, delta);
    return { ...item, [field]: values };
  });
  if (found) return next;
  const values = appendIndexedDelta([], safeIndex, delta);
  return [
    ...next,
    {
      type: "reasoning",
      id: itemId,
      summary: field === "summary" ? values : [],
      content: field === "content" ? values : [],
    },
  ];
}

function appendIndexedDelta(values: string[], index: number, delta: string) {
  const next = [...values];
  while (next.length <= index) next.push("");
  next[index] = `${next[index] ?? ""}${delta}`;
  return next;
}

export function upsertItem(
  items: ThreadItem[],
  next: ThreadItem,
): ThreadItem[] {
  const baseItems =
    next.type === "userMessage" && !isOptimisticUserMessage(next)
      ? items.filter((item) => !isOptimisticUserMessage(item))
      : items;
  const existing = baseItems.findIndex((item) => item.id === next.id);
  if (existing === -1) return [...baseItems, next];
  return baseItems.map((item, index) => (index === existing ? next : item));
}

export function updateTurnItems(
  turns: Turn[],
  turnId: string,
  updater: (items: ThreadItem[]) => ThreadItem[],
): Turn[] {
  return turns.map((turn) =>
    turn.id === turnId ? { ...turn, items: updater(turn.items) } : turn,
  );
}

export function ensureTurn(turns: Turn[], turn: Turn): Turn[] {
  if (turns.some((existing) => existing.id === turn.id)) return turns;
  return [...turns, turn];
}

export function replaceTurn(turns: Turn[], turn: Turn): Turn[] {
  if (!turns.some((existing) => existing.id === turn.id))
    return [...turns, turn];
  return turns.map((existing) =>
    existing.id === turn.id
      ? { ...turn, items: mergeThreadItems(turn.items, existing.items) }
      : existing,
  );
}

export function mergeThreadWithLocalState(
  incoming: Thread,
  local: Thread | undefined,
) {
  if (!local) return incoming;
  if (incoming.turns.length === 0) {
    return {
      ...incoming,
      status: shouldPreserveLocalThreadStatus(incoming, local)
        ? local.status
        : incoming.status,
      turns: local.turns,
    };
  }
  const localTurns = new Map(local.turns.map((turn) => [turn.id, turn]));
  const incomingTurnIds = new Set(incoming.turns.map((turn) => turn.id));
  const localOnlyTurns = local.turns.filter(
    (turn) => !incomingTurnIds.has(turn.id) && shouldPreserveLocalTurn(turn),
  );
  return {
    ...incoming,
    status: shouldPreserveLocalThreadStatus(incoming, local)
      ? local.status
      : incoming.status,
    turns: [
      ...incoming.turns.map((turn) =>
        mergeTurnWithLocalState(turn, localTurns.get(turn.id)),
      ),
      ...localOnlyTurns,
    ],
  };
}

function mergeTurnWithLocalState(incoming: Turn, local: Turn | undefined) {
  if (!local) return incoming;

  if (shouldPreserveLocalProgress(incoming, local)) {
    return {
      ...incoming,
      status: local.status === "inProgress" ? local.status : incoming.status,
      items: mergeThreadItems(incoming.items, local.items),
    };
  }

  if (local.error && !incoming.error && !hasAgentOutput(incoming)) {
    return {
      ...incoming,
      status: local.status === "failed" ? "failed" : incoming.status,
      error: local.error,
      items:
        local.items.length > incoming.items.length ? local.items : incoming.items,
    };
  }

  return {
    ...incoming,
    items: mergeThreadItems(incoming.items, local.items),
  };
}

function shouldPreserveLocalThreadStatus(incoming: Thread, local: Thread) {
  if (local.status.type !== "active") return false;
  const incomingTurns = new Map(incoming.turns.map((turn) => [turn.id, turn]));
  return local.turns.some((turn) => {
    if (turn.status !== "inProgress") return false;
    const incomingTurn = incomingTurns.get(turn.id);
    return !incomingTurn || incomingTurn.status === "inProgress";
  });
}

function shouldPreserveLocalTurn(turn: Turn) {
  return turn.status === "inProgress" || Boolean(turn.error);
}

function shouldPreserveLocalProgress(incoming: Turn, local: Turn) {
  return local.status === "inProgress" && incoming.status === "inProgress";
}

function mergeThreadItems(
  incomingItems: ThreadItem[],
  localItems: ThreadItem[],
) {
  const localById = new Map(localItems.map((item) => [item.id, item]));
  const incomingIds = new Set(incomingItems.map((item) => item.id));
  const incomingHasRealUserMessage = incomingItems.some(
    (item) => item.type === "userMessage" && !isOptimisticUserMessage(item),
  );
  const incomingHasContextCompaction = incomingItems.some(
    (item) => item.type === "contextCompaction",
  );
  return [
    ...incomingItems.map((item) =>
      mergeThreadItemWithLocalState(item, localById.get(item.id)),
    ),
    ...localItems.filter(
      (item) =>
        !incomingIds.has(item.id) &&
        !(incomingHasContextCompaction && item.type === "contextCompaction") &&
        !(incomingHasRealUserMessage && isOptimisticUserMessage(item)),
    ),
  ];
}

function isOptimisticUserMessage(item: ThreadItem) {
  return item.type === "userMessage" && item.id.startsWith("optimistic-user:");
}

function mergeThreadItemWithLocalState(
  incoming: ThreadItem,
  local: ThreadItem | undefined,
): ThreadItem {
  if (!local || incoming.type !== local.type) return incoming;
  if (incoming.type === "agentMessage" && local.type === "agentMessage") {
    return local.text.length > incoming.text.length
      ? { ...incoming, text: local.text }
      : incoming;
  }
  if (incoming.type === "plan" && local.type === "plan") {
    return local.text.length > incoming.text.length
      ? { ...incoming, text: local.text }
      : incoming;
  }
  if (incoming.type === "reasoning" && local.type === "reasoning") {
    const incomingLength = reasoningTextLength(incoming);
    const localLength = reasoningTextLength(local);
    return localLength > incomingLength
      ? {
          ...incoming,
          summary: mergeIndexedText(incoming.summary, local.summary),
          content: mergeIndexedText(incoming.content, local.content),
        }
      : incoming;
  }
  if (
    incoming.type === "commandExecution" &&
    local.type === "commandExecution"
  ) {
    const incomingOutput = incoming.aggregatedOutput ?? "";
    const localOutput = local.aggregatedOutput ?? "";
    return localOutput.length > incomingOutput.length
      ? { ...incoming, aggregatedOutput: localOutput }
      : incoming;
  }
  if (incoming.type === "fileChange" && local.type === "fileChange") {
    const incomingLength = fileChangeTextLength(incoming);
    const localLength = fileChangeTextLength(local);
    return localLength > incomingLength ? local : incoming;
  }
  return incoming;
}

function mergeIndexedText(incoming: string[], local: string[]) {
  const maxLength = Math.max(incoming.length, local.length);
  const next: string[] = [];
  for (let index = 0; index < maxLength; index += 1) {
    const incomingText = incoming[index] ?? "";
    const localText = local[index] ?? "";
    next.push(
      localText.length > incomingText.length ? localText : incomingText,
    );
  }
  return next;
}

function reasoningTextLength(item: Extract<ThreadItem, { type: "reasoning" }>) {
  return [...item.summary, ...item.content].join("").length;
}

function fileChangeTextLength(
  item: Extract<ThreadItem, { type: "fileChange" }>,
) {
  return item.changes.reduce(
    (total, change) => total + change.path.length + change.diff.length,
    0,
  );
}

function hasAgentOutput(turn: Turn) {
  return turn.items.some(
    (item) =>
      item.type === "agentMessage" ||
      item.type === "commandExecution" ||
      item.type === "fileChange",
  );
}

export function itemLabel(item: ThreadItem): string {
  switch (item.type) {
    case "userMessage":
      return "You";
    case "agentMessage":
      return "Codex";
    case "commandExecution":
      return "Command";
    case "fileChange":
      return "Edited files";
    case "plan":
      return "Plan";
    case "reasoning":
      return "Reasoning";
    case "mcpToolCall":
      return `${item.server}:${item.tool}`;
    case "webSearch":
      return "Web search";
    case "contextCompaction":
      return "Context compacted";
    default:
      return item.type;
  }
}

export function commandStatusText(
  item: Extract<ThreadItem, { type: "commandExecution" }>,
): string {
  const issue = commandIssueText(item);
  if (issue) return issue;
  switch (item.status) {
    case "inProgress":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Command failed";
    case "declined":
      return "Declined";
  }
}

export function commandIssueText(
  item: Extract<ThreadItem, { type: "commandExecution" }>,
): string | null {
  if (item.status !== "failed") return null;
  const output = (item.aggregatedOutput ?? "").toLowerCase();
  if (output.includes("bubblewrap") || output.includes("sandbox runner")) {
    return "Sandbox failed";
  }
  return null;
}
