import { type Dispatch, type SetStateAction, useCallback } from "react";
import type { JsonRpcMessage, ServerRequest } from "../appServerClient";
import {
  appendDelta,
  ensureTurn,
  replaceTurn,
  updateTurnItems,
  upsertItem,
} from "../itemUtils";
import type {
  InspectorSelection,
  PendingApproval,
  Thread,
  ThreadItem,
  ThreadTokenUsage,
  Turn,
} from "../types";

type SetState<T> = Dispatch<SetStateAction<T>>;

export function useAppServerEvents(args: {
  activeProjectPath: string | null;
  patchThread: (threadId: string, updater: (thread: Thread) => Thread) => void;
  refreshThreads: (cwd: string | null) => Promise<unknown>;
  syncThread: (threadId: string) => Promise<Thread | null>;
  onThreadArchived: (threadId: string) => void;
  onThreadNameUpdated: (threadId: string, name: string | null) => void;
  onTokenUsageUpdated: (threadId: string, tokenUsage: ThreadTokenUsage) => void;
  onTurnCompleted: (threadId: string, turn: Turn) => void;
  setInspector: SetState<InspectorSelection>;
  setPendingApprovals: SetState<PendingApproval[]>;
  setRunningTurnId: SetState<string | null>;
}) {
  const handleNotification = useCallback(
    (message: JsonRpcMessage) => {
      if (!message.method) return;
      const params = message.params as Record<string, unknown> | undefined;
      const threadId = params?.threadId as string | undefined;
      const turnId = params?.turnId as string | undefined;

      if (message.method === "turn/started" && threadId && params?.turn) {
        const turn = params.turn as Turn;
        args.setRunningTurnId(turn.id);
        args.patchThread(threadId, (thread) => ({
          ...thread,
          turns: ensureTurn(thread.turns, turn),
        }));
        return;
      }

      if (message.method === "turn/completed" && threadId && params?.turn) {
        const turn = params.turn as Turn;
        args.setRunningTurnId((current) =>
          current === turn.id ? null : current,
        );
        args.patchThread(threadId, (thread) => ({
          ...thread,
          turns: replaceTurn(thread.turns, turn),
        }));
        args.onTurnCompleted(threadId, turn);
        void args.syncThread(threadId);
        void args.refreshThreads(args.activeProjectPath);
        return;
      }

      if (
        (message.method === "item/started" ||
          message.method === "item/completed") &&
        threadId &&
        turnId &&
        params?.item
      ) {
        const item = params.item as ThreadItem;
        args.patchThread(threadId, (thread) => ({
          ...thread,
          turns: updateTurnItems(thread.turns, turnId, (items) =>
            upsertItem(items, item),
          ),
        }));
        return;
      }

      if (message.method === "item/agentMessage/delta" && threadId && turnId) {
        appendItemDelta(args.patchThread, threadId, turnId, params);
        return;
      }

      if (
        message.method === "item/commandExecution/outputDelta" &&
        threadId &&
        turnId
      ) {
        appendItemDelta(args.patchThread, threadId, turnId, params);
        return;
      }

      if (
        message.method === "item/fileChange/patchUpdated" &&
        threadId &&
        turnId
      ) {
        const itemId = params?.itemId as string;
        const changes = (params?.changes ?? []) as Extract<
          ThreadItem,
          { type: "fileChange" }
        >["changes"];
        args.patchThread(threadId, (thread) => ({
          ...thread,
          turns: updateTurnItems(thread.turns, turnId, (items) =>
            upsertItem(items, {
              type: "fileChange",
              id: itemId,
              changes,
              status: "inProgress",
            }),
          ),
        }));
        return;
      }

      if (message.method === "thread/status/changed" && threadId) {
        args.patchThread(threadId, (thread) => ({
          ...thread,
          status: params?.status as Thread["status"],
        }));
        return;
      }

      if (
        message.method === "thread/tokenUsage/updated" &&
        threadId &&
        params?.tokenUsage
      ) {
        args.onTokenUsageUpdated(
          threadId,
          params.tokenUsage as ThreadTokenUsage,
        );
        return;
      }

      if (message.method === "thread/name/updated" && threadId) {
        args.onThreadNameUpdated(
          threadId,
          (params?.threadName as string | undefined) ?? null,
        );
        return;
      }

      if (message.method === "thread/archived" && threadId) {
        args.onThreadArchived(threadId);
        return;
      }

      if (message.method === "thread/compacted" && threadId) {
        void args.syncThread(threadId);
      }
    },
    [args],
  );

  const handleServerRequest = useCallback(
    (message: ServerRequest) => {
      const approval: PendingApproval = {
        id: message.id,
        method: message.method,
        params: (message.params ?? {}) as Record<string, unknown>,
        receivedAt: Date.now(),
      };
      args.setPendingApprovals((current) => [approval, ...current]);
      args.setInspector({ type: "approval", approval });
    },
    [args],
  );

  return { handleNotification, handleServerRequest };
}

function appendItemDelta(
  patchThread: (threadId: string, updater: (thread: Thread) => Thread) => void,
  threadId: string,
  turnId: string,
  params?: Record<string, unknown>,
) {
  const itemId = params?.itemId as string;
  const delta = (params?.delta ?? "") as string;
  patchThread(threadId, (thread) => ({
    ...thread,
    turns: updateTurnItems(thread.turns, turnId, (items) =>
      appendDelta(items, itemId, delta),
    ),
  }));
}
