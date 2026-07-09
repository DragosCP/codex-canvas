import type {
  ComposerAttachment,
  FeatureDraft,
  PendingApproval,
  Project,
  Thread,
  ThreadItem,
  Turn,
} from "./types";

export function turnWithOptimisticUserMessage(
  turn: Turn,
  visibleUserPrompt: string,
  attachments: ComposerAttachment[],
): Turn {
  const text = visibleUserPrompt.trim() || "Use the attached project context.";
  const content: Extract<ThreadItem, { type: "userMessage" }>["content"] = [
    { type: "text", text, text_elements: [] },
    ...attachments
      .filter((attachment) => attachment.kind === "image")
      .map((attachment) => ({
        type: "localImage" as const,
        path: attachment.path,
      })),
  ];
  if (turn.items.some((item) => item.type === "userMessage")) {
    return {
      ...turn,
      items: turn.items.map((item) =>
        item.type === "userMessage" ? { ...item, content } : item,
      ),
    };
  }
  return {
    ...turn,
    items: [
      {
        type: "userMessage",
        id: `optimistic-user:${turn.id}`,
        content,
      },
      ...turn.items,
    ],
  };
}

export function shouldPreserveLocalThreadDuringRefresh(
  thread: Thread,
  featureDrafts: Record<string, FeatureDraft> = {},
) {
  return (
    thread.turns.some(
      (turn) => turn.status === "inProgress" || Boolean(turn.error),
    ) ||
    Object.values(featureDrafts).some(
      (draft) =>
        draft.threadId === thread.id &&
        (draft.lifecycle === "active" || draft.lifecycle === "parked"),
    )
  );
}

export function sendBlockReason(args: {
  activeProject: Project | null;
  connectionStatus: string;
  missingOpenAiAuth: boolean;
  hasUnsupportedAttachments: boolean;
  pendingApprovals: PendingApproval[];
  promptReady: boolean;
  sendStarting: boolean;
  runningTurnId: string | null;
}) {
  if (args.connectionStatus !== "connected") {
    return "Codex is still connecting. Try again when the status says Connected.";
  }
  if (!args.activeProject)
    return "Add or select a local project before sending.";
  if (args.missingOpenAiAuth) {
    return "Sign in before sending prompts to OpenAI-hosted models.";
  }
  if (args.sendStarting) {
    return "Codex is starting your message. Wait for it to begin before sending again.";
  }
  if (args.runningTurnId) {
    return "Codex is already working on another turn. Wait for it to finish before sending again.";
  }
  if (args.pendingApprovals.length > 0) {
    return "Answer the pending approval before sending another message.";
  }
  if (args.hasUnsupportedAttachments)
    return "Remove unsupported files before sending.";
  if (!args.promptReady) return "Type a message to send.";
  return null;
}
