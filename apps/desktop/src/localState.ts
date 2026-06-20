import type {
  ComposerContextReference,
  CodeProposalFileChange,
  CodeProposalSet,
  CodeProposalStatus,
  DesktopState,
  PlanProposal,
  PlanProposalKind,
  PlanProposalStatus,
  PlanPreviewAreaMark,
  PlanPreviewCleanupStatus,
  PlanPreviewComponentKind,
  PlanPreviewSessionState,
  PlanPreviewSpec,
  PreviewArtifactKind,
  Project,
  ProjectSettings,
  ProposalHighlight,
  BackendMode,
  SandboxMode,
} from "./types";
import { normalizePreviewArtifactKind } from "./mockupArtifacts";
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
    planProposals: {},
    sentComposerContextsByTurnId: {},
    codeProposalSets: {},
    codeProposalActiveSetIdsByThreadId: {},
    codeProposalCompareSetIdsByThreadId: {},
    mockupActiveProposalSetIdsByThreadId: {},
    mockupHistoryProposalSetIds: {},
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
    const rawLayout =
      parsed.layout && typeof parsed.layout === "object" ? parsed.layout : {};
    return {
      version: 1,
      appServerUrl: runtimeInfo.appServerUrl,
      projects,
      activeProjectId: activeProject?.id ?? null,
      activeThreadId: activeProject?.lastActiveThreadId ?? null,
      pinnedThreadIds: stringArray(parsed.pinnedThreadIds),
      expandedProjectIds: stringArray(parsed.expandedProjectIds),
      planProposals: normalizePlanProposals(parsed.planProposals),
      sentComposerContextsByTurnId: normalizeSentComposerContextsByTurnId(
        parsed.sentComposerContextsByTurnId,
      ),
      codeProposalSets: normalizeCodeProposalSets(parsed.codeProposalSets),
      codeProposalActiveSetIdsByThreadId: stringRecord(
        parsed.codeProposalActiveSetIdsByThreadId,
      ),
      codeProposalCompareSetIdsByThreadId: stringRecord(
        parsed.codeProposalCompareSetIdsByThreadId,
      ),
      mockupActiveProposalSetIdsByThreadId: stringRecord(
        parsed.mockupActiveProposalSetIdsByThreadId,
      ),
      mockupHistoryProposalSetIds: booleanRecord(
        parsed.mockupHistoryProposalSetIds,
      ),
      layout: {
        inspectorWidth:
          positiveNumber((rawLayout as DesktopState["layout"]).inspectorWidth) ||
          fallback.layout.inspectorWidth,
        commandSurfaceHeight:
          positiveNumber(
            (rawLayout as DesktopState["layout"]).commandSurfaceHeight,
          ) || fallback.layout.commandSurfaceHeight,
        inspectorOpen:
          typeof (rawLayout as DesktopState["layout"]).inspectorOpen ===
          "boolean"
            ? (rawLayout as DesktopState["layout"]).inspectorOpen
            : fallback.layout.inspectorOpen,
        commandSurfaceOpen:
          typeof (rawLayout as DesktopState["layout"]).commandSurfaceOpen ===
          "boolean"
            ? (rawLayout as DesktopState["layout"]).commandSurfaceOpen
            : fallback.layout.commandSurfaceOpen,
      },
    };
  } catch {
    return fallback;
  }
}

function normalizeCodeProposalSets(
  value: unknown,
): Record<string, CodeProposalSet> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, CodeProposalSet> = {};
  for (const [proposalSetId, raw] of Object.entries(
    value as Record<string, Partial<CodeProposalSet>>,
  )) {
    if (!raw || typeof raw !== "object") continue;
    const projectId = stringValue(raw.projectId);
    const rootPath = stringValue(raw.rootPath);
    if (!projectId || !rootPath) continue;
    const options = Array.isArray(raw.options)
      ? raw.options
          .map((option) => {
            if (!option || typeof option !== "object") return null;
            const id = option.id === "A" || option.id === "B" || option.id === "C"
              ? option.id
              : null;
            const workspacePath = stringValue(option.workspacePath);
            if (!id || !workspacePath) return null;
            return {
              id,
              title: stringValue(option.title) || `Option ${id}`,
              summary: stringValue(option.summary),
              workspacePath,
              status: codeProposalStatus(option.status),
              changedFiles: normalizeCodeProposalChanges(option.changedFiles),
              appliedAt: positiveNumber(option.appliedAt) || undefined,
            };
          })
          .filter((option): option is NonNullable<typeof option> =>
            Boolean(option),
          )
      : [];
    if (options.length === 0) continue;
    const selectedOptionId =
      raw.selectedOptionId === "A" ||
      raw.selectedOptionId === "B" ||
      raw.selectedOptionId === "C"
        ? raw.selectedOptionId
        : options[0]?.id ?? null;
    normalized[proposalSetId] = {
      proposalSetId,
      projectId,
      threadId: stringValue(raw.threadId) || null,
      turnId: stringValue(raw.turnId) || null,
      rootPath,
      originalPrompt: stringValue(raw.originalPrompt),
      selectedOptionId,
      options,
      status: codeProposalStatus(raw.status),
      error: stringValue(raw.error) || undefined,
      createdAt: numberValue(raw.createdAt),
      updatedAt: numberValue(raw.updatedAt),
    };
  }
  return normalized;
}

function normalizeCodeProposalChanges(
  value: unknown,
): CodeProposalFileChange[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((change) => {
      if (!change || typeof change !== "object") return null;
      const kind =
        change.kind === "created" ||
        change.kind === "updated" ||
        change.kind === "deleted"
          ? change.kind
          : null;
      const path = stringValue(change.path);
      if (!kind || !path) return null;
      return {
        kind,
        path,
        hash: stringValue(change.hash),
        size: numberValue(change.size),
      };
    })
    .filter((change): change is CodeProposalFileChange => Boolean(change));
}

function codeProposalStatus(value: unknown): CodeProposalStatus {
  if (value === "applying") {
    return "ready";
  }
  if (
    value === "preparing" ||
    value === "generating" ||
    value === "ready" ||
    value === "applied" ||
    value === "failed" ||
    value === "history"
  ) {
    return value;
  }
  return "ready";
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

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0,
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
      previewSpec: normalizePlanPreviewSpec(rawProposal.previewSpec),
      previewSelectedVariantId:
        stringValue(rawProposal.previewSelectedVariantId) || null,
      previewAreaMark: normalizePlanPreviewAreaMark(rawProposal.previewAreaMark),
      previewSession: normalizePlanPreviewSession(rawProposal.previewSession),
      previewUserEditedAt:
        positiveNumber(rawProposal.previewUserEditedAt) || undefined,
      proposalKind: planProposalKind(rawProposal.proposalKind),
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
  if (raw.version != null && raw.version !== 1) return null;
  if (!Array.isArray(raw.variants)) return null;
  const topLevelRoute = stringValue(
    (value as Record<string, unknown>).route,
  );
  const topLevelViewState = stringValue(
    (value as Record<string, unknown>).viewState,
  );
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
        route: stringValue(variant.route) || topLevelRoute || undefined,
        viewState:
          stringValue(variant.viewState) || topLevelViewState || undefined,
        targetRegion: stringValue(variant.targetRegion) || undefined,
        highlights: normalizeProposalHighlights(variant.highlights, id),
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
    route: stringValue(raw.route) || undefined,
    note: stringValue(raw.note),
    createdAt: numberValue(raw.createdAt),
  };
}

function normalizeProposalHighlights(
  value: unknown,
  variantId: "A" | "B" | "C",
): ProposalHighlight[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const highlights = value
    .map((highlight, index) => {
      if (!highlight || typeof highlight !== "object") return null;
      const raw = highlight as Record<string, unknown>;
      const areaMark = normalizePlanPreviewAreaMark(raw.areaMark ?? raw);
      if (!areaMark) return null;
      const label =
        stringValue(raw.label) || `Change ${variantId}${index + 1}`;
      return {
        id:
          stringValue(raw.id) ||
          `${variantId.toLowerCase()}-change-${index + 1}`,
        label,
        note: stringValue(raw.note) || label,
        areaMark,
      };
    })
    .filter((highlight): highlight is ProposalHighlight => Boolean(highlight))
    .slice(0, 5);
  return highlights.length > 0 ? highlights : undefined;
}

function normalizePlanPreviewSession(value: unknown): PlanPreviewSessionState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PlanPreviewSessionState>;
  const previewUrl = stringValue(raw.previewUrl);
  const route = stringValue(raw.route) || previewUrl;
  if (!previewUrl && !route) return null;
  return {
    previewUrl,
    route,
    viewport: raw.viewport === "mobile" ? "mobile" : "desktop",
    interactionState: stringValue(raw.interactionState) || "No temporary interaction recorded.",
    cleanupStatus: planPreviewCleanupStatus(raw.cleanupStatus),
    updatedAt: numberValue(raw.updatedAt),
  };
}

function planPreviewCleanupStatus(value: unknown): PlanPreviewCleanupStatus {
  return value === "clean" ||
    value === "selected" ||
    value === "injected" ||
    value === "reset" ||
    value === "failed" ||
    value === "unavailable"
    ? value === "injected"
      ? "selected"
      : value
    : "idle";
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

function normalizeComposerContexts(value: unknown): ComposerContextReference[] {
  if (!Array.isArray(value)) return [];
  const contexts: ComposerContextReference[] = [];
  for (const context of value) {
    if (!context || typeof context !== "object") continue;
    const rawContext = context as Record<string, unknown>;
    const projectId = stringValue(rawContext.projectId);
    const projectName = stringValue(rawContext.projectName);
    if (!projectId || !projectName) continue;

    if (rawContext.type === "appPreview") {
      const areaMark = normalizePlanPreviewAreaMark(rawContext.areaMark);
      const previewUrl = stringValue(rawContext.previewUrl);
      if (!areaMark || !previewUrl) continue;
      const markNumber = positiveNumber(rawContext.markNumber) || 1;
      const source =
        rawContext.source === "proposalHighlight"
          ? "proposalHighlight"
          : rawContext.source === "userMark"
            ? "userMark"
            : undefined;
      contexts.push({
        type: "appPreview",
        id:
          stringValue(rawContext.id) ||
          `app-preview:${projectId}:${areaMark.createdAt}`,
        projectId,
        projectName,
        previewUrl,
        viewport: rawContext.viewport === "mobile" ? "mobile" : "desktop",
        markLabel: normalizeVisualContextLabel(
          stringValue(rawContext.markLabel),
          source,
          markNumber,
        ),
        markNumber,
        areaMark,
        thumbnailDataUrl:
          normalizedThumbnailDataUrl(rawContext.thumbnailDataUrl) || undefined,
        source,
        highlightId: stringValue(rawContext.highlightId) || undefined,
      });
      continue;
    }

    if (rawContext.type === "mockupPreview") {
      const areaMark = normalizePlanPreviewAreaMark(rawContext.areaMark);
      const mockupId = stringValue(rawContext.mockupId);
      const mockupLabel = stringValue(rawContext.mockupLabel);
      const mockupTitle = stringValue(rawContext.mockupTitle);
      const markNumber = positiveNumber(rawContext.markNumber) || 1;
      const filePath = stringValue(rawContext.filePath);
      const proposalSetId = stringValue(rawContext.proposalSetId);
      const artifactKind = normalizeArtifactKind(rawContext.artifactKind);
      if (!areaMark || !mockupId || !filePath) continue;
      const source =
        rawContext.source === "proposalHighlight"
          ? "proposalHighlight"
          : "userMark";
      contexts.push({
        type: "mockupPreview",
        id:
          stringValue(rawContext.id) ||
          `mockup-preview:${projectId}:${mockupId}:${areaMark.createdAt}`,
        projectId,
        projectName,
        proposalSetId: proposalSetId || `legacy:${projectId}:${mockupId}`,
        artifactKind,
        mockupId,
        mockupLabel: mockupLabel || mockupId,
        mockupTitle: mockupTitle || mockupLabel || mockupId,
        markLabel: normalizeVisualContextLabel(
          stringValue(rawContext.markLabel),
          source,
          markNumber,
        ),
        markNumber,
        filePath,
        viewport: rawContext.viewport === "mobile" ? "mobile" : "desktop",
        areaMark,
        thumbnailDataUrl:
          normalizedThumbnailDataUrl(rawContext.thumbnailDataUrl) || undefined,
        source,
        highlightId: stringValue(rawContext.highlightId) || undefined,
      });
    }
  }
  return contexts;
}

function normalizeVisualContextLabel(
  label: string,
  source: "userMark" | "proposalHighlight" | undefined,
  number: number,
) {
  const trimmed = label.trim();
  if (source === "proposalHighlight") {
    if (/^change\s+\d+$/i.test(trimmed)) return trimmed;
    return `Change ${number}`;
  }
  if (/^mark\s+\d+$/i.test(trimmed)) return trimmed;
  return `Mark ${number}`;
}

function normalizeSentComposerContextsByTurnId(
  value: unknown,
): Record<string, ComposerContextReference[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, ComposerContextReference[]> = {};
  for (const [turnId, rawContexts] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!turnId.trim()) continue;
    const contexts = normalizeComposerContexts(rawContexts);
    if (contexts.length > 0) normalized[turnId] = contexts;
  }
  return normalized;
}

function normalizedThumbnailDataUrl(value: unknown) {
  if (typeof value !== "string") return "";
  return value.startsWith("data:image/") ? value : "";
}

function normalizeArtifactKind(value: unknown): PreviewArtifactKind {
  return normalizePreviewArtifactKind(value, "mockup");
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

function planProposalStatus(value: unknown): PlanProposalStatus {
  return value === "accepted" ||
    value === "declined" ||
    value === "superseded"
    ? value
    : "pending";
}

function planProposalKind(value: unknown): PlanProposalKind {
  if (value === "safer_alternative") return "safer_alternative";
  if (value === "live_proposal") return "live_proposal";
  return "plan";
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
  if (level === "aggressive" || level === "emergency") {
    return {
      ...state,
      sentComposerContextsByTurnId:
        level === "emergency"
          ? {}
          : stripComposerContextThumbnails(state.sentComposerContextsByTurnId),
    };
  }
  return {
    ...state,
  };
}

function stripComposerContextThumbnails(
  contextsByTurnId: Record<string, ComposerContextReference[]>,
) {
  return Object.fromEntries(
    Object.entries(contextsByTurnId).map(([turnId, contexts]) => [
      turnId,
      contexts.map((context) => ({ ...context, thumbnailDataUrl: undefined })),
    ]),
  );
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
