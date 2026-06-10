import type {
  SandboxMode,
  SandboxPolicy,
  Thread,
  ThreadItem,
  Turn,
} from "./types";

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
  return isGeneratedCurrentUiMockupTitle(title)
    ? "Generate current interface mockup"
    : title;
}

function isGeneratedCurrentUiMockupTitle(title: string) {
  return title
    .trimStart()
    .startsWith(
      "Inspect this local project and generate a low-fidelity current interface Canvas mockup.",
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
    if (item.type === "reasoning")
      return { ...item, summary: [...item.summary, delta] };
    return item;
  });
}

export function upsertItem(
  items: ThreadItem[],
  next: ThreadItem,
): ThreadItem[] {
  const existing = items.findIndex((item) => item.id === next.id);
  if (existing === -1) return [...items, next];
  return items.map((item, index) => (index === existing ? next : item));
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
  return turns.map((existing) => (existing.id === turn.id ? turn : existing));
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
