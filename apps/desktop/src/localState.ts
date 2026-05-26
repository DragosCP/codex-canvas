import type {
  ComposerContextReference,
  DesktopState,
  CanvasProposalParseStatus,
  CanvasSuggestion,
  CanvasSuggestionStatus,
  ComposerCanvasContextTarget,
  PlanCanvasStatus,
  PlanProposal,
  PlanProposalStatus,
  ProjectCanvas,
  Project,
  ProjectSettings,
  SandboxMode,
} from "./types";
import { normalizeCanvasMap, normalizeProjectCanvasSnapshot } from "./canvasState";
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
    planProposals: {},
    canvasSuggestions: {},
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
      planProposals: normalizePlanProposals(parsed.planProposals),
      canvasSuggestions: normalizeCanvasSuggestions(parsed.canvasSuggestions),
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

function normalizePlanProposals(value: unknown): Record<string, PlanProposal> {
  if (!value || typeof value !== "object") return {};
  const normalized: Record<string, PlanProposal> = {};
  for (const [turnId, rawProposal] of Object.entries(
    value as Record<string, Partial<PlanProposal>>,
  )) {
    if (!rawProposal || typeof rawProposal !== "object") continue;
    const projectId = stringValue(rawProposal.projectId);
    const threadId = stringValue(rawProposal.threadId);
    const prompt = stringValue(rawProposal.prompt);
    if (!projectId || !threadId) continue;
    const status = planProposalStatus(rawProposal.status);
    normalized[turnId] = {
      id: stringValue(rawProposal.id) || `plan:${turnId}`,
      projectId,
      threadId,
      turnId: stringValue(rawProposal.turnId) || turnId,
      prompt,
      contexts: normalizeComposerContexts(rawProposal.contexts),
      canvasStatus: planCanvasStatus(rawProposal.canvasStatus),
      canvasSummary:
        stringValue(rawProposal.canvasSummary) || "Canvas status unknown",
      canvasBaseSnapshot: normalizeProposalCanvasSnapshot(
        rawProposal.canvasBaseSnapshot,
        projectId,
      ),
      canvasProposalSnapshot: normalizeProposalCanvasSnapshot(
        rawProposal.canvasProposalSnapshot,
        projectId,
      ),
      canvasProposalParseStatus: canvasProposalParseStatus(
        rawProposal.canvasProposalParseStatus,
      ),
      canvasProposalParserVersion: positiveNumber(
        rawProposal.canvasProposalParserVersion,
      ),
      canvasProposalChangeCount: positiveNumber(
        rawProposal.canvasProposalChangeCount,
      ),
      canvasProposalSummary:
        stringValue(rawProposal.canvasProposalSummary) ||
        "No canvas proposal snapshot.",
      canvasProposalErrors: stringArray(rawProposal.canvasProposalErrors),
      status,
      createdAt: numberValue(rawProposal.createdAt),
      updatedAt: numberValue(rawProposal.updatedAt),
    };
  }
  return normalized;
}

function normalizeCanvasSuggestions(
  value: unknown,
): Record<string, CanvasSuggestion> {
  if (!value || typeof value !== "object") return {};
  const normalized: Record<string, CanvasSuggestion> = {};
  for (const [turnId, rawSuggestion] of Object.entries(
    value as Record<string, Partial<CanvasSuggestion>>,
  )) {
    if (!rawSuggestion || typeof rawSuggestion !== "object") continue;
    const projectId = stringValue(rawSuggestion.projectId);
    const threadId = stringValue(rawSuggestion.threadId);
    const prompt = stringValue(rawSuggestion.prompt);
    if (!projectId || !threadId) continue;
    normalized[turnId] = {
      id: stringValue(rawSuggestion.id) || `canvas-suggestion:${turnId}`,
      projectId,
      threadId,
      turnId: stringValue(rawSuggestion.turnId) || turnId,
      prompt,
      contexts: normalizeComposerContexts(rawSuggestion.contexts),
      canvasStatus: planCanvasStatus(rawSuggestion.canvasStatus),
      canvasSummary:
        stringValue(rawSuggestion.canvasSummary) || "Canvas status unknown",
      canvasBaseSnapshot: normalizeProposalCanvasSnapshot(
        rawSuggestion.canvasBaseSnapshot,
        projectId,
      ),
      canvasProposalSnapshot: normalizeProposalCanvasSnapshot(
        rawSuggestion.canvasProposalSnapshot,
        projectId,
      ),
      canvasProposalParseStatus: canvasProposalParseStatus(
        rawSuggestion.canvasProposalParseStatus,
      ),
      canvasProposalParserVersion: positiveNumber(
        rawSuggestion.canvasProposalParserVersion,
      ),
      canvasProposalChangeCount: positiveNumber(
        rawSuggestion.canvasProposalChangeCount,
      ),
      canvasProposalSummary:
        stringValue(rawSuggestion.canvasProposalSummary) ||
        "No canvas suggestion snapshot.",
      canvasProposalErrors: stringArray(rawSuggestion.canvasProposalErrors),
      status: canvasSuggestionStatus(rawSuggestion.status),
      createdAt: numberValue(rawSuggestion.createdAt),
      updatedAt: numberValue(rawSuggestion.updatedAt),
    };
  }
  return normalized;
}

function normalizeProposalCanvasSnapshot(
  value: unknown,
  projectId: string,
): ProjectCanvas | null {
  return normalizeProjectCanvasSnapshot(value, projectId);
}

function normalizeComposerContexts(value: unknown): ComposerContextReference[] {
  if (!Array.isArray(value)) return [];
  const contexts: ComposerContextReference[] = [];
  for (const context of value) {
    if (
      !context ||
      typeof context !== "object" ||
      (context as Partial<ComposerContextReference>).type !== "canvas"
    ) {
      continue;
    }
    const rawContext = context as Partial<ComposerContextReference>;
    const projectId = stringValue(rawContext.projectId);
    const projectName = stringValue(rawContext.projectName);
    if (!projectId || !projectName) continue;
    const target = normalizeCanvasContextTarget(rawContext.target);
    contexts.push({
      type: "canvas",
      projectId,
      projectName,
      ...(target ? { target } : {}),
    });
  }
  return contexts;
}

function normalizeCanvasContextTarget(
  value: unknown,
): ComposerCanvasContextTarget | null {
  if (!value || typeof value !== "object") return null;
  const target = value as Partial<ComposerCanvasContextTarget>;
  if (target.kind === "project") {
    return { kind: "project" };
  }
  if (target.kind === "page") {
    return {
      kind: "page",
      mode: target.mode === "backend" ? "backend" : "ui",
      pageId: typeof target.pageId === "string" ? target.pageId : null,
      pageName: stringValue(target.pageName) || "Canvas",
      subPageId: typeof target.subPageId === "string" ? target.subPageId : null,
      subPageName: stringValue(target.subPageName) || null,
    };
  }
  if (target.kind === "item") {
    const itemId = stringValue(target.itemId);
    const reference = stringValue(target.reference);
    if (!itemId || !reference) return null;
    return {
      kind: "item",
      mode: target.mode === "backend" ? "backend" : "ui",
      pageId: typeof target.pageId === "string" ? target.pageId : null,
      pageName: stringValue(target.pageName) || "Canvas",
      subPageId: typeof target.subPageId === "string" ? target.subPageId : null,
      subPageName: stringValue(target.subPageName) || null,
      itemId,
      reference,
      label: stringValue(target.label) || reference,
    };
  }
  if (target.kind === "group") {
    const groupId = stringValue(target.groupId);
    const reference = stringValue(target.reference);
    if (!groupId || !reference) return null;
    return {
      kind: "group",
      mode: target.mode === "backend" ? "backend" : "ui",
      pageId: typeof target.pageId === "string" ? target.pageId : null,
      pageName: stringValue(target.pageName) || "Canvas",
      subPageId: typeof target.subPageId === "string" ? target.subPageId : null,
      subPageName: stringValue(target.subPageName) || null,
      groupId,
      reference,
      label: stringValue(target.label) || reference,
    };
  }
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Date.now();
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function planCanvasStatus(value: unknown): PlanCanvasStatus {
  return value === "empty" || value === "sparse" || value === "usable"
    ? value
    : "not_attached";
}

function planProposalStatus(value: unknown): PlanProposalStatus {
  return value === "accepted" ||
    value === "declined" ||
    value === "superseded"
    ? value
    : "pending";
}

function canvasSuggestionStatus(value: unknown): CanvasSuggestionStatus {
  return value === "applied" || value === "dismissed" ? value : "pending";
}

function canvasProposalParseStatus(value: unknown): CanvasProposalParseStatus {
  return value === "pending" ||
    value === "parsed" ||
    value === "empty" ||
    value === "failed"
    ? value
    : "none";
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
