import {
  projectRelativeDisplayPath,
  proposalWorkspaceDisplayPath,
} from "./proposalWorkspaceDisplay";
import type { InspectorSelection, Project, Thread } from "./types";

export function firstMarkdownChangeSelection(
  thread: Thread | null,
  project: Project | null,
): InspectorSelection {
  if (!thread || !project) return { type: "empty" };
  for (const turn of thread.turns) {
    for (const item of turn.items) {
      if (item.type !== "fileChange") continue;
      for (const change of item.changes) {
        if (!isMarkdownPath(change.path)) continue;
        return {
          type: "document",
          path: documentPath(change.path, project),
          title: friendlyPath(change.path, project),
        };
      }
    }
  }
  return { type: "empty" };
}

export function sameInspectorSelection(
  left: InspectorSelection,
  right: InspectorSelection,
) {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case "document":
      return (
        right.type === "document" &&
        left.path === right.path &&
        left.title === right.title
      );
    case "fileChange":
      return right.type === "fileChange" && left.item.id === right.item.id;
    case "command":
      return right.type === "command" && left.item.id === right.item.id;
    case "approval":
      return (
        right.type === "approval" && left.approval.id === right.approval.id
      );
    case "appPreview":
      return right.type === "appPreview" && left.projectId === right.projectId;
    case "draftPreview":
      return (
        right.type === "draftPreview" &&
        left.projectId === right.projectId &&
        left.draftId === right.draftId
      );
    case "empty":
      return true;
  }
}

function isMarkdownPath(path: string) {
  return /\.(md|mdx|markdown)$/i.test(path);
}

function documentPath(path: string, activeProject: Project) {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
  return `${activeProject.path.replace(/[\\/]$/, "")}/${path}`;
}

function friendlyPath(path: string, activeProject: Project) {
  const workspacePath = proposalWorkspaceDisplayPath(path);
  if (workspacePath) return workspacePath;
  const relativePath = projectRelativeDisplayPath(path, activeProject.path);
  if (relativePath) return relativePath;
  const projectPath = activeProject.path.replace(/\\/g, "/").replace(/\/$/, "");
  return path
    .replace(new RegExp(escapeRegExp(projectPath), "g"), ".")
    .replace(/^\.\//, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
