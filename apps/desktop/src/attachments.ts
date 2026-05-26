import { normalizeProjectPathForRuntime, runtimePathKey } from "./runtime";
import type {
  ComposerAttachment,
  ComposerContextReference,
  Project,
} from "./types";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const inspectableExtensions = new Set([
  ".bash",
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".cxx",
  ".env",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".kt",
  ".kts",
  ".log",
  ".md",
  ".mdx",
  ".mjs",
  ".ps1",
  ".py",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const deferredDocumentExtensions = new Set([
  ".doc",
  ".docx",
  ".pdf",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
]);

export function classifyAttachment(path: string, project: Project): ComposerAttachment {
  const normalizedPath = normalizeAttachmentPath(path, project);
  const name = basename(normalizedPath);
  const extension = fileExtension(name);
  const id = runtimePathKey(normalizedPath);

  if (imageExtensions.has(extension)) {
    return {
      id,
      path: normalizedPath,
      name,
      kind: "image",
      status: "attached",
      title: "Image will be attached.",
    };
  }

  if (inspectableExtensions.has(extension) && isInsideProject(normalizedPath, project.path)) {
    return {
      id,
      path: normalizedPath,
      name,
      kind: "inspectable",
      status: "ready",
      title: "Codex can inspect this file with tools if needed.",
    };
  }

  return {
    id,
    path: normalizedPath,
    name,
    kind: "unsupported",
    status: "unsupported",
    title: deferredDocumentExtensions.has(extension)
      ? "Document ingestion is not supported yet."
      : "This file type is not supported yet.",
  };
}

export function attachmentStatusLabel(attachment: ComposerAttachment) {
  if (attachment.status === "ready") return "Ready";
  if (attachment.status === "unsupported") return "Unsupported";
  return "";
}

export function unsupportedAttachments(attachments: ComposerAttachment[]) {
  return attachments.filter((attachment) => attachment.status === "unsupported");
}

export function hasDraftContent(draft: {
  text: string;
  attachments: ComposerAttachment[];
  contexts?: ComposerContextReference[];
}) {
  return (
    draft.text.trim().length > 0 ||
    draft.attachments.length > 0 ||
    (draft.contexts?.length ?? 0) > 0
  );
}

export function promptWithInspectableFiles(
  prompt: string,
  attachments: ComposerAttachment[],
) {
  const inspectablePaths = attachments
    .filter((attachment) => attachment.kind === "inspectable")
    .map((attachment) => attachment.path);
  if (inspectablePaths.length === 0) return prompt;
  return `${prompt}\n\nFiles to inspect if needed:\n${inspectablePaths
    .map((path) => `- ${path}`)
    .join("\n")}\n\nThese file contents are not preloaded; use tools to read them if needed.`;
}

function normalizeAttachmentPath(path: string, project: Project) {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (isAbsoluteLike(trimmed)) return normalizeProjectPathForRuntime(trimmed);
  const relative = trimmed.replace(/^[.\\/]+/, "");
  return `${project.path.replace(/[\\/]+$/, "")}/${relative.replace(/\\/g, "/")}`;
}

function isInsideProject(path: string, projectPath: string) {
  const fileKey = runtimePathKey(path);
  const projectKey = runtimePathKey(projectPath).replace(/\/+$/, "");
  return fileKey === projectKey || fileKey.startsWith(`${projectKey}/`);
}

function isAbsoluteLike(path: string) {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\");
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function fileExtension(name: string) {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}
