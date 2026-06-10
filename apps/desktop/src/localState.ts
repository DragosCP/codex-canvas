import type {
  ComposerContextReference,
  DesktopState,
  CanvasProposalParseStatus,
  CanvasSuggestion,
  CanvasSuggestionStatus,
  ComposerCanvasContextTarget,
  PlanCanvasStatus,
  PlanProposal,
  PlanProposalKind,
  PlanProposalStatus,
  PlanPreviewAreaMark,
  PlanPreviewComponentKind,
  PlanPreviewSpec,
  ProjectCanvas,
  Project,
  ProjectSettings,
  BackendMode,
  SandboxMode,
} from "./types";
import {
  normalizeCanvasMap,
  normalizeProjectCanvasSnapshot,
} from "./canvasState";
import { normalizeProjectPathForRuntime, runtimeInfo } from "./runtime";

const STORAGE_KEY = "codex.desktop.v1";
const STORAGE_SOFT_LIMIT_BYTES = 4_000_000;

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
      canvasLayersOpenByProject: {},
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
      layout: {
        ...fallback.layout,
        ...parsed.layout,
        canvasLayersOpenByProject: booleanRecord(
          parsed.layout?.canvasLayersOpenByProject,
        ),
      },
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

function booleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
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
      canvasDraftBaseSnapshot: normalizeProposalCanvasSnapshot(
        rawProposal.canvasDraftBaseSnapshot,
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
      canvasUserEditedAt:
        positiveNumber(rawProposal.canvasUserEditedAt) || undefined,
      previewSpec: normalizePlanPreviewSpec(rawProposal.previewSpec),
      previewSelectedVariantId:
        stringValue(rawProposal.previewSelectedVariantId) || null,
      previewAreaMark: normalizePlanPreviewAreaMark(rawProposal.previewAreaMark),
      previewUserEditedAt:
        positiveNumber(rawProposal.previewUserEditedAt) || undefined,
      proposalKind: planProposalKind(rawProposal.proposalKind),
      canvasUpdatedAt: positiveNumber(rawProposal.canvasUpdatedAt) || undefined,
      status,
      createdAt: numberValue(rawProposal.createdAt),
      updatedAt: numberValue(rawProposal.updatedAt),
    };
  }
  return normalized;
}

function normalizePlanPreviewSpec(value: unknown): PlanPreviewSpec | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PlanPreviewSpec>;
  if (raw.version !== 1 || !Array.isArray(raw.variants)) return null;
  const variants = raw.variants
    .map((variant) => {
      if (!variant || typeof variant !== "object") return null;
      const id =
        variant.id === "A" || variant.id === "B" || variant.id === "C"
          ? variant.id
          : null;
      const placement =
        variant.placement === "topbar" ||
        variant.placement === "sidePanel" ||
        variant.placement === "modal"
          ? variant.placement
          : null;
      if (!id || !placement) return null;
      return {
        id,
        title: stringValue(variant.title) || `Option ${id}`,
        tradeoff: stringValue(variant.tradeoff),
        placement,
        summary: stringValue(variant.summary),
        components: Array.isArray(variant.components)
          ? variant.components
              .map((component) => {
                if (!component || typeof component !== "object") return null;
                const kind = planPreviewComponentKind(component.kind);
                if (!kind) return null;
                return {
                  kind,
                  label: stringValue(component.label),
                  body: stringValue(component.body),
                  actionLabel: stringValue(component.actionLabel) || undefined,
                };
              })
              .filter((component): component is NonNullable<typeof component> =>
                Boolean(component),
              )
          : [],
      };
    })
    .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));
  if (variants.length === 0) return null;
  return {
    version: 1,
    summary: stringValue(raw.summary) || "Live app preview options.",
    variants,
    createdAt: numberValue(raw.createdAt),
    updatedAt: numberValue(raw.updatedAt),
  };
}

function normalizePlanPreviewAreaMark(value: unknown): PlanPreviewAreaMark | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PlanPreviewAreaMark>;
  const width = positiveNumber(raw.width);
  const height = positiveNumber(raw.height);
  const viewportWidth = positiveNumber(raw.viewportWidth);
  const viewportHeight = positiveNumber(raw.viewportHeight);
  if (!width || !height || !viewportWidth || !viewportHeight) return null;
  return {
    x: positiveNumber(raw.x),
    y: positiveNumber(raw.y),
    width,
    height,
    viewportWidth,
    viewportHeight,
    note: stringValue(raw.note),
    createdAt: numberValue(raw.createdAt),
  };
}

function planPreviewComponentKind(value: unknown): PlanPreviewComponentKind | null {
  return value === "button" ||
    value === "panel" ||
    value === "menu" ||
    value === "modal" ||
    value === "input" ||
    value === "badge"
    ? value
    : null;
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
      canvasDraftBaseSnapshot: normalizeProposalCanvasSnapshot(
        rawSuggestion.canvasDraftBaseSnapshot,
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
      canvasUserEditedAt:
        positiveNumber(rawSuggestion.canvasUserEditedAt) || undefined,
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
    if (!context || typeof context !== "object") continue;
    const rawContext = context as Record<string, unknown>;
    const projectId = stringValue(rawContext.projectId);
    const projectName = stringValue(rawContext.projectName);
    if (!projectId || !projectName) continue;

    if (rawContext.type === "canvas") {
      const target = normalizeCanvasContextTarget(rawContext.target);
      contexts.push({
        type: "canvas",
        projectId,
        projectName,
        ...(target ? { target } : {}),
      });
      continue;
    }

    if (rawContext.type === "appPreview") {
      const areaMark = normalizePlanPreviewAreaMark(rawContext.areaMark);
      const previewUrl = stringValue(rawContext.previewUrl);
      if (!areaMark || !previewUrl) continue;
      contexts.push({
        type: "appPreview",
        id:
          stringValue(rawContext.id) ||
          `app-preview:${projectId}:${areaMark.createdAt}`,
        projectId,
        projectName,
        previewUrl,
        viewport: rawContext.viewport === "mobile" ? "mobile" : "desktop",
        areaMark,
      });
    }
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

function planProposalKind(value: unknown): PlanProposalKind {
  return value === "safer_alternative" ? "safer_alternative" : "plan";
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
  const candidates = [
    state,
    compactDesktopStateForStorage(state),
    compactDesktopStateForStorage(state, "aggressive"),
    compactDesktopStateForStorage(state, "emergency"),
  ];
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const serialized = JSON.stringify(candidate);
    if (
      candidate === state &&
      serialized.length > STORAGE_SOFT_LIMIT_BYTES
    ) {
      continue;
    }
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn("Could not save desktop state after compaction.", lastError);
}

type StorageCompactionLevel = "normal" | "aggressive" | "emergency";

function compactDesktopStateForStorage(
  state: DesktopState,
  level: StorageCompactionLevel = "normal",
): DesktopState {
  const canvases = Object.fromEntries(
    Object.entries(state.canvases).map(([projectId, canvas]) => [
      projectId,
      compactProjectCanvasForStorage(
        canvas,
        projectId === state.activeProjectId,
        level,
      ),
    ]),
  );
  const planProposals = Object.fromEntries(
    Object.entries(state.planProposals).map(([turnId, proposal]) => [
      turnId,
      {
        ...proposal,
        canvasBaseSnapshot: proposal.canvasBaseSnapshot
          ? compactProjectCanvasForStorage(
              proposal.canvasBaseSnapshot,
              proposal.projectId === state.activeProjectId,
              level,
            )
          : null,
        canvasDraftBaseSnapshot: proposal.canvasDraftBaseSnapshot
          ? compactProjectCanvasForStorage(
              proposal.canvasDraftBaseSnapshot,
              proposal.projectId === state.activeProjectId,
              level,
            )
          : null,
        canvasProposalSnapshot: proposal.canvasProposalSnapshot
          ? compactProjectCanvasForStorage(
              proposal.canvasProposalSnapshot,
              proposal.projectId === state.activeProjectId,
              level,
            )
          : null,
      },
    ]),
  );
  const canvasSuggestions = Object.fromEntries(
    Object.entries(state.canvasSuggestions).map(([turnId, suggestion]) => [
      turnId,
      {
        ...suggestion,
        canvasBaseSnapshot: suggestion.canvasBaseSnapshot
          ? compactProjectCanvasForStorage(
              suggestion.canvasBaseSnapshot,
              suggestion.projectId === state.activeProjectId,
              level,
            )
          : null,
        canvasDraftBaseSnapshot: suggestion.canvasDraftBaseSnapshot
          ? compactProjectCanvasForStorage(
              suggestion.canvasDraftBaseSnapshot,
              suggestion.projectId === state.activeProjectId,
              level,
            )
          : null,
        canvasProposalSnapshot: suggestion.canvasProposalSnapshot
          ? compactProjectCanvasForStorage(
              suggestion.canvasProposalSnapshot,
              suggestion.projectId === state.activeProjectId,
              level,
            )
          : null,
      },
    ]),
  );
  return {
    ...state,
    canvases,
    planProposals,
    canvasSuggestions,
  };
}

function compactProjectCanvasForStorage(
  canvas: ProjectCanvas,
  activeProject: boolean,
  level: StorageCompactionLevel,
): ProjectCanvas {
  return canvas;
}

export function createProject(
  path: string,
  order: number,
  backendMode: BackendMode = runtimeInfo.backendMode,
): Project {
  const normalized = normalizeProjectPathForRuntime(path, backendMode);
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
  const normalizedPath = normalizeStoredProjectPath(project.path);
  return {
    ...project,
    path: normalizedPath,
    name:
      project.name
        ? project.name
        : (normalizedPath.split(/[\\/]/).filter(Boolean).pop() ??
          normalizedPath),
    pinned: Boolean(project.pinned),
    hidden: Boolean(project.hidden),
    archived: Boolean(project.archived),
    lastActiveThreadId: project.lastActiveThreadId ?? null,
    settings: { ...defaultSettings, ...project.settings },
  };
}

function normalizeStoredProjectPath(path: string) {
  return path.trim().replace(/[\\/]+$/, "");
}
