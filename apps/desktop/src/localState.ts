import type {
  DesktopState,
  Project,
  ProjectSettings,
  SandboxMode,
} from "./types";
import { normalizeCanvasMap } from "./canvasState";
import { normalizeProjectPathForRuntime, runtimeInfo } from "./runtime";

const STORAGE_KEY = "codex.desktop.v1";

export const defaultSettings: ProjectSettings = {
  sandbox: "workspace-write",
  approvalPolicy: "on-request",
  model: null,
  effort: "medium",
  serviceTier: null,
  planMode: false,
};

export const permissionPresets = [
  {
    id: "read-only" as SandboxMode,
    label: "Auto-review",
    description: "Read files and ask before changes or commands.",
    approvalPolicy: "on-request" as const,
  },
  {
    id: "workspace-write" as SandboxMode,
    label: "Default permissions",
    description: "Work inside the selected folder with approvals.",
    approvalPolicy: "untrusted" as const,
  },
  {
    id: "danger-full-access" as SandboxMode,
    label: "Full access",
    description: "Let Codex run with full local access.",
    approvalPolicy: "never" as const,
  },
];

export function createDefaultState(): DesktopState {
  return {
    version: 1,
    appServerUrl: runtimeInfo.appServerUrl,
    projects: [],
    activeProjectId: null,
    activeThreadId: null,
    pinnedThreadIds: [],
    expandedProjectIds: [],
    canvases: {},
    layout: {
      inspectorWidth: 420,
      commandSurfaceHeight: 220,
      inspectorOpen: true,
      commandSurfaceOpen: true,
    },
  };
}

export function loadDesktopState(): DesktopState {
  const fallback = createDefaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<DesktopState>;
    const projects = Array.isArray(parsed.projects)
      ? parsed.projects.map(normalizeProject)
      : [];
    const activeProject = projects.find(
      (project) => project.id === parsed.activeProjectId,
    );
    return {
      ...fallback,
      ...parsed,
      appServerUrl: runtimeInfo.appServerUrl,
      projects,
      activeThreadId: activeProject?.lastActiveThreadId ?? null,
      pinnedThreadIds: stringArray(parsed.pinnedThreadIds),
      expandedProjectIds: stringArray(parsed.expandedProjectIds),
      canvases: normalizeCanvasMap(parsed.canvases, projects),
      layout: { ...fallback.layout, ...parsed.layout },
    };
  } catch {
    return fallback;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function saveDesktopState(state: DesktopState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createProject(path: string, order: number): Project {
  const normalized = normalizeProjectPathForRuntime(path);
  const name = normalized.split(/[\\/]/).filter(Boolean).pop() ?? normalized;
  return {
    id: crypto.randomUUID(),
    path: normalized,
    name,
    pinned: false,
    hidden: false,
    archived: false,
    order,
    lastActiveThreadId: null,
    settings: { ...defaultSettings },
  };
}

function normalizeProject(project: Project): Project {
  const normalizedPath = normalizeProjectPathForRuntime(project.path);
  const pathChanged = normalizedPath !== project.path;
  return {
    ...project,
    path: normalizedPath,
    name:
      project.name && !pathChanged
        ? project.name
        : (normalizedPath.split(/[\\/]/).filter(Boolean).pop() ??
          normalizedPath),
    pinned: Boolean(project.pinned),
    hidden: Boolean(project.hidden),
    archived: Boolean(project.archived),
    lastActiveThreadId: pathChanged ? null : (project.lastActiveThreadId ?? null),
    settings: { ...defaultSettings, ...project.settings },
  };
}
