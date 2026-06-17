import { useEffect, useState } from "react";
import { desktopInvoke } from "./desktopBridge";
import type { Project, Thread, ThreadItem, Turn } from "./types";
import { lineCount } from "./utils/format";

export const WORKSPACE_PROGRESS_POLL_MS = 5000;

export type WorkspaceProgressFile = {
  lineCount: number;
  lineDelta: number;
  path: string;
  sizeBytes: number;
  status: "created" | "modified";
  updatedAtMs: number;
};

export type WorkspaceProgressSnapshot = {
  additions: number;
  deletions: number;
  elapsedMs: number;
  fileCount: number;
  files: WorkspaceProgressFile[];
  limited: boolean;
  reason?: string;
  scannedAtMs: number;
  startedAtMs: number;
  status: "available" | "unavailable";
  turnId: string;
};

export type TurnProgressFile = {
  additions: number;
  currentLines?: number;
  deletions: number;
  kind?: "created" | "modified";
  label: string;
  order: number;
  path: string;
  updatedAtMs?: number;
};

export type TurnProgressCommand = {
  command: string;
  durationMs: number | null;
  id: string;
  status: Extract<ThreadItem, { type: "commandExecution" }>["status"];
};

export type TurnProgressSummary = {
  activeCommandCount: number;
  additions: number;
  commandCount: number;
  commands: TurnProgressCommand[];
  deletions: number;
  extraFileCount: number;
  fileCount: number;
  files: TurnProgressFile[];
  latestCommand: string | null;
  limited: boolean;
  reviewItem: Extract<ThreadItem, { type: "fileChange" }> | null;
};

type FileChangeItem = Extract<ThreadItem, { type: "fileChange" }>;

export function useWorkspaceProgress(
  activeProject: Project | null,
  turn: Turn | null,
): WorkspaceProgressSnapshot | null {
  const [snapshot, setSnapshot] = useState<WorkspaceProgressSnapshot | null>(
    null,
  );

  useEffect(() => {
    if (!activeProject || !turn || turn.status !== "inProgress") {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    const startedAtMs = turn.startedAt
      ? Math.max(0, turn.startedAt * 1000)
      : Date.now();
    const args = {
      projectPath: activeProject.path,
      turnId: turn.id,
      startedAtMs,
    };

    async function poll() {
      try {
        const response = await desktopInvoke<WorkspaceProgressSnapshot>(
          "workspace_progress_snapshot",
          args,
        );
        if (cancelled) return;
        setSnapshot(response?.status === "available" ? response : null);
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    }

    void poll();
    const timer = window.setInterval(poll, WORKSPACE_PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      void desktopInvoke("workspace_progress_stop", args);
    };
  }, [activeProject?.path, turn?.id, turn?.startedAt, turn?.status]);

  return snapshot;
}

export function summarizeTurnProgress(
  turn: Turn | null,
  activeProject: Project | null,
  workspaceProgress: WorkspaceProgressSnapshot | null,
): TurnProgressSummary {
  const filesByPath = new Map<string, TurnProgressFile>();
  const commands: TurnProgressCommand[] = [];
  let activeCommandCount = 0;
  let latestCommand: string | null = null;
  let order = 0;
  const reviewItem = mergeTurnFileChanges(turn, { includeInProgress: true });

  if (turn) {
    for (const item of turn.items) {
      if (item.type === "commandExecution") {
        const command = {
          id: item.id,
          command: item.command,
          durationMs: item.durationMs,
          status: item.status,
        };
        commands.push(command);
        if (item.status === "inProgress") {
          activeCommandCount += 1;
          latestCommand = item.command;
        }
        continue;
      }
      if (item.type !== "fileChange") continue;
      for (const change of item.changes) {
        const counts = diffLineCounts(change.diff);
        order += 1;
        const key = progressPathKey(change.path, activeProject);
        const existing = filesByPath.get(key);
        filesByPath.set(key, {
          path: existing?.path ?? change.path,
          label: progressPathLabel(change.path, activeProject),
          additions: (existing?.additions ?? 0) + counts.additions,
          deletions: (existing?.deletions ?? 0) + counts.deletions,
          currentLines: existing?.currentLines,
          kind:
            existing?.kind === "created" || change.kind.type === "add"
              ? "created"
              : "modified",
          order,
          updatedAtMs: existing?.updatedAtMs,
        });
      }
    }
  }

  if (workspaceProgress?.status === "available") {
    for (const file of workspaceProgress.files) {
      const key = progressPathKey(file.path, activeProject);
      const existing = filesByPath.get(key);
      filesByPath.set(key, {
        path: existing?.path ?? file.path,
        label: existing?.label ?? progressPathLabel(file.path, activeProject),
        additions: existing?.additions ?? Math.max(0, file.lineDelta),
        deletions: existing?.deletions ?? Math.max(0, -file.lineDelta),
        currentLines: file.lineCount,
        kind: existing?.kind ?? file.status,
        order: existing?.order ?? 0,
        updatedAtMs: file.updatedAtMs,
      });
    }
  }

  const files = [...filesByPath.values()].sort(
    (left, right) =>
      (right.updatedAtMs ?? 0) - (left.updatedAtMs ?? 0) ||
      right.order - left.order ||
      right.additions + right.deletions - (left.additions + left.deletions) ||
      left.label.localeCompare(right.label),
  );
  const observedFileCount =
    workspaceProgress?.status === "available"
      ? Math.max(files.length, workspaceProgress.fileCount)
      : files.length;
  const aggregateFromWorkspace =
    workspaceProgress?.status === "available" &&
    !turn?.items.some((item) => item.type === "fileChange");

  return {
    files,
    fileCount: observedFileCount,
    extraFileCount: Math.max(0, observedFileCount - Math.min(files.length, 3)),
    commandCount: commands.length,
    activeCommandCount,
    commands,
    latestCommand,
    limited: workspaceProgress?.limited ?? false,
    additions: aggregateFromWorkspace
      ? workspaceProgress.additions
      : files.reduce((total, file) => total + file.additions, 0),
    deletions: aggregateFromWorkspace
      ? workspaceProgress.deletions
      : files.reduce((total, file) => total + file.deletions, 0),
    reviewItem,
  };
}

export function mergeThreadFileChanges(thread: Thread | null): FileChangeItem[] {
  if (!thread) return [];
  return thread.turns
    .map((turn) => mergeTurnFileChanges(turn, { includeInProgress: true }))
    .filter((item): item is FileChangeItem => Boolean(item));
}

export function mergeTurnFileChanges(
  turn: Turn | null,
  options: { includeInProgress?: boolean } = {},
): FileChangeItem | null {
  if (!turn) return null;
  const includeInProgress = options.includeInProgress ?? false;
  const items = turn.items.filter(
    (item): item is FileChangeItem =>
      item.type === "fileChange" &&
      (includeInProgress || item.status !== "inProgress"),
  );
  return mergeFileChangeItems(items, turn.id);
}

export function mergeFileChangeItems(
  items: FileChangeItem[],
  turnId = "turn",
): FileChangeItem | null {
  if (items.length === 0) return null;
  const changesByPath = new Map<
    string,
    {
      diff: string[];
      kind: FileChangeItem["changes"][number]["kind"];
      path: string;
    }
  >();

  for (const item of items) {
    for (const change of item.changes) {
      const existing = changesByPath.get(change.path);
      if (!existing) {
        changesByPath.set(change.path, {
          path: change.path,
          kind: change.kind,
          diff: [change.diff],
        });
        continue;
      }
      existing.diff.push(change.diff);
      existing.kind = preferChangeKind(existing.kind, change.kind);
    }
  }

  if (changesByPath.size === 0) return null;
  const status = mergeFileChangeStatus(items);
  return {
    type: "fileChange",
    id: `merged-file-change:${turnId}:${items.map((item) => item.id).join(":")}`,
    status,
    changes: [...changesByPath.values()].map((change) => ({
      path: change.path,
      kind: change.kind,
      diff: change.diff.join("\n"),
    })),
  };
}

export function diffLineCounts(diff: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  if (additions === 0 && deletions === 0) {
    return { additions: Math.max(0, lineCount(diff)), deletions: 0 };
  }
  return { additions, deletions };
}

export function formatDuration(durationMs: number) {
  const safe = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatLineDelta(additions: number, deletions: number) {
  if (additions === 0 && deletions === 0) return "+0 lines";
  if (deletions === 0) return `+${additions.toLocaleString()} lines`;
  return `+${additions.toLocaleString()} / -${deletions.toLocaleString()} lines`;
}

export function formatShortLineDelta(additions: number, deletions: number) {
  return `+${additions.toLocaleString()} -${deletions.toLocaleString()}`;
}

export function formatFileProgressDelta(file: TurnProgressFile) {
  if (file.additions === 0 && file.deletions === 0) {
    return file.currentLines == null
      ? "updated"
      : `${file.currentLines.toLocaleString()} lines`;
  }
  return formatLineDelta(file.additions, file.deletions);
}

export function compactCommand(command: string) {
  return command.length > 96 ? `${command.slice(0, 93)}...` : command;
}

export function liveProgressHeadline(progress: TurnProgressSummary) {
  if (progress.fileCount > 0) {
    const firstFile = progress.files[0];
    if (progress.fileCount === 1 && firstFile) {
      return `${firstFile.kind === "created" ? "Creating" : "Editing"} ${
        firstFile.label
      }`;
    }
    return "Writing files";
  }
  if (progress.activeCommandCount > 0) return "Running command";
  return "Working";
}

export function liveProgressDetail(
  progress: TurnProgressSummary,
  elapsed: string,
  elapsedMs?: number | null,
) {
  if (progress.fileCount > 0) {
    const delta = formatLineDelta(progress.additions, progress.deletions);
    const limited = progress.limited ? " - more changes may be hidden" : "";
    return `${progress.fileCount} file${
      progress.fileCount === 1 ? "" : "s"
    } changed - ${delta} - ${elapsed}${limited}`;
  }
  if (progress.activeCommandCount > 0) {
    const command = progress.latestCommand
      ? ` - ${compactCommand(progress.latestCommand)}`
      : "";
    return `${progress.activeCommandCount} command${
      progress.activeCommandCount === 1 ? "" : "s"
    } running${command} - ${elapsed}`;
  }
  if (progress.commandCount > 0) {
    const waiting =
      elapsedMs != null && elapsedMs >= 45000
        ? " - no file writes observed yet"
        : "";
    return `${progress.commandCount} command${
      progress.commandCount === 1 ? "" : "s"
    } observed${waiting} - watching for file changes - ${elapsed}`;
  }
  if (elapsedMs != null && elapsedMs >= 30000) {
    return `Still working - no command or file writes observed yet - ${elapsed}`;
  }
  return `Waiting for the next visible update - ${elapsed}`;
}

export function progressPathLabel(path: string, activeProject: Project | null) {
  const normalized = path.replace(/\\/g, "/");
  if (!activeProject) return normalized.replace(/^\.\//, "");
  const projectPath = activeProject.path.replace(/\\/g, "/").replace(/\/$/, "");
  if (!projectPath) return normalized.replace(/^\.\//, "");
  const escapedProjectPath = escapeRegExp(projectPath);
  return normalized
    .replace(new RegExp(escapedProjectPath, "g"), ".")
    .replace(/^\.\//, "");
}

function progressPathKey(path: string, activeProject: Project | null) {
  return progressPathLabel(path, activeProject)
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .toLocaleLowerCase();
}

function mergeFileChangeStatus(items: FileChangeItem[]): FileChangeItem["status"] {
  if (items.some((item) => item.status === "inProgress")) return "inProgress";
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.some((item) => item.status === "declined")) return "declined";
  return "completed";
}

function preferChangeKind(
  current: FileChangeItem["changes"][number]["kind"],
  next: FileChangeItem["changes"][number]["kind"],
) {
  if (current.type === "add") return current;
  if (next.type === "add") return next;
  if (next.type === "delete") return next;
  return next;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
