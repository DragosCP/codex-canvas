import { sameRuntimePath } from "./runtime";
import type { BackendMode, ThreadMap } from "./types";

export function sendFailureMessage(error: unknown) {
  const message = errorMessage(error);
  if (message.includes("AbsolutePathBuf")) {
    return "Codex could not use that project path with the current WSL runtime. Re-add the folder with a /mnt/c/... path or restart so the saved path can be normalized.";
  }
  if (message.includes("thread not found")) {
    return "That saved chat is no longer available. Send again to start a fresh chat.";
  }
  if (message.includes("Not connected")) {
    return "Codex is not connected to app-server yet. Retry after it reconnects.";
  }
  return `Send failed: ${message}`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isDraftWorkspaceNotRegisteredError(error: unknown) {
  return /draft workspace is not registered/i.test(errorMessage(error));
}

export function isUnsupportedAttachmentError(error: string | null) {
  if (!error) return false;
  const message = error.toLowerCase();
  return message.includes("unsupported") || message.includes("not supported");
}

export function isKnownThreadForCwd(
  threads: ThreadMap,
  threadId: string,
  cwd: string | null,
  backendMode: BackendMode,
) {
  const thread = threads[threadId];
  return Boolean(
    thread && cwd && sameRuntimePath(thread.cwd, cwd, backendMode),
  );
}

export function isThreadNotFound(error: unknown) {
  return errorMessage(error).includes("thread not found");
}

export function isStaleThreadError(error: unknown) {
  return isThreadNotFound(error) || isThreadNotMaterialized(error);
}

export function isThreadNotMaterialized(error: unknown) {
  const message = errorMessage(error);
  return (
    message.includes("no rollout found") ||
    message.includes("not materialized yet") ||
    message.includes("includeTurns is unavailable")
  );
}

export function withRequestTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
