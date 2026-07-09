import type {
  CodeProposalFileChange,
  DesktopState,
  FeatureDraft,
} from "./types";

export type PreparedDraftWorkspace = {
  draftId: string;
  registryId: string;
  projectPath: string;
  threadId: string | null;
  name: string;
  slug: string;
  status: FeatureDraft["lifecycle"];
  rootPath: string;
  workspacePath: string;
  previewOwnerId: string;
  affectedRoutes: string[];
  mockAssumptions: string[];
  briefPath: string;
  createdAt: number;
  updatedAt: number;
};

export type RegisteredDraftWorkspace = PreparedDraftWorkspace;

export type DraftWorkspaceDiffResult = {
  draftId: string;
  registryId: string;
  projectPath: string;
  rootPath: string;
  workspacePath: string;
  previewOwnerId: string;
  status: FeatureDraft["lifecycle"];
  changedFiles: CodeProposalFileChange[];
};

export type DraftWorkspaceApplyResult = {
  ok: boolean;
  changedFiles: CodeProposalFileChange[];
  conflicts: Array<{ path: string; reason: string }>;
};

export function shouldCreateFeatureDraftFromCanvasPrompt(args: {
  backingPreference?: string | null;
  hasActiveProposal: boolean;
  hasSelectedPreview: boolean;
  isExistingProject: boolean;
  planMode: boolean;
  prompt: string;
  resolutionAction?: string | null;
  wantsOptions?: boolean | null;
}) {
  const text = normalizedPromptText(args.prompt);
  if (!text) return false;
  if (!args.isExistingProject || args.planMode) return false;
  if (args.resolutionAction !== "CREATE_DRAFT") return false;
  if (args.hasSelectedPreview) {
    return false;
  }
  if (isFeatureDraftBuildRequest(text) || isFeatureDraftDiscardRequest(text)) {
    return false;
  }
  if (isFeatureDraftParkRequest(text) || isFeatureDraftResumeRequest(text)) {
    return false;
  }
  if (isExplicitMultiOptionProposalRequest(text)) return true;
  if (isExplicitCodeBackedProposalRequest(text)) return false;
  if (/\b(?:mockup|mockups|wireframe|wireframes|a\/b|options?)\b/.test(text)) {
    return false;
  }
  if (
    /\b(?:implement|apply|build)\b/.test(text) &&
    !/\b(?:show|preview|draft|try|explore|could|would|where|before)\b/.test(text)
  ) {
    return false;
  }
  return isFeatureDraftPreviewIntent(text) || isSingleVisualChangeDraftIntent(text);
}

export function shouldRouteToFeatureDraftPrompt(args: {
  inspectorIsDraft: boolean;
  inspectorDraftOwnsActiveThread?: boolean;
  prompt: string;
}) {
  const text = normalizedPromptText(args.prompt);
  if (!text) return false;
  if (isFeatureDraftBuildRequest(text) || isFeatureDraftDiscardRequest(text)) {
    return false;
  }
  if (isFeatureDraftParkRequest(text) || isFeatureDraftResumeRequest(text)) {
    return false;
  }
  if (args.inspectorIsDraft) return args.inspectorDraftOwnsActiveThread === true;
  return (
    isSingleVisualChangeDraftIntent(text) ||
    /\b(?:draft|this)\b.*\b(?:revise|change|tweak|adjust|update|make|add|remove|try)\b/.test(
      text,
    ) ||
    /\b(?:revise|change|tweak|adjust|update|make|add|remove|try)\b.*\bdraft\b/.test(
      text,
    )
  );
}

export function isFeatureDraftBuildRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bbuild\s+this\b/.test(text) ||
    /\bbuild\s+(?:the\s+)?draft\b/.test(text) ||
    /\bmake\s+this\s+real\b/.test(text) ||
    /\bimplement\s+(?:this|the\s+draft)\b/.test(text) ||
    /\bapply\s+(?:this|the\s+draft)\b/.test(text)
  );
}

export function isFeatureDraftDiscardRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bdiscard\s+(?:this\s+)?draft\b/.test(text) ||
    /\bdiscard\s+this\b/.test(text) ||
    /\bdrop\s+(?:this\s+)?draft\b/.test(text) ||
    /\bcancel\s+(?:this\s+)?draft\b/.test(text)
  );
}

export function isFeatureDraftParkRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bpark\s+(?:this\s+)?draft\b/.test(text) ||
    /\bpark\s+this\b/.test(text) ||
    /\bsave\s+(?:this\s+)?draft\s+for\s+later\b/.test(text)
  );
}

export function isFeatureDraftResumeRequest(prompt: string) {
  const text = normalizedPromptText(prompt);
  return (
    /\bresume\s+(?:this\s+)?draft\b/.test(text) ||
    /\bresume\s+this\b/.test(text) ||
    /\breopen\s+(?:this\s+)?draft\b/.test(text) ||
    /\bcontinue\s+(?:this\s+)?draft\b/.test(text)
  );
}

export function isFeatureDraftContinueRequest(prompt: string) {
  const text = prompt.toLowerCase();
  return /\b(?:continue|repair|recover|resume|try\s+again|fix\s+(?:the\s+)?draft|continue\s+(?:the\s+)?draft)\b/.test(
    text,
  );
}

export function shouldRouteToFeatureDraftRecoveryPrompt(input: {
  inspectorIsDraft: boolean;
  inspectorDraftOwnsActiveThread: boolean;
  prompt: string;
}) {
  if (!input.inspectorDraftOwnsActiveThread) return false;
  if (isFeatureDraftBuildRequest(input.prompt)) return false;
  if (isFeatureDraftParkRequest(input.prompt)) return false;
  if (isFeatureDraftDiscardRequest(input.prompt)) return false;
  if (isFeatureDraftContinueRequest(input.prompt)) return true;
  return input.inspectorIsDraft && /(?:again|same|this|draft|repair|fix)/i.test(input.prompt);
}

export function removeRecordKey<T>(
  record: Record<string, T>,
  key: string | null | undefined,
) {
  if (!key || !(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

export function codeProposalChangeSummary(changes: CodeProposalFileChange[]) {
  if (changes.length === 0) return "No file changes detected yet.";
  const created = changes.filter((change) => change.kind === "created").length;
  const updated = changes.filter((change) => change.kind === "updated").length;
  const deleted = changes.filter((change) => change.kind === "deleted").length;
  return [
    created ? `${created} created` : "",
    updated ? `${updated} updated` : "",
    deleted ? `${deleted} deleted` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function featureDraftFromRegisteredWorkspace(
  projectId: string,
  record: RegisteredDraftWorkspace,
  diff: DraftWorkspaceDiffResult | null,
): FeatureDraft {
  const changedFiles = diff?.changedFiles ?? [];
  return {
    draftId: record.draftId,
    registryId: record.registryId,
    projectId,
    threadId: record.threadId,
    turnId: null,
    name: record.name || "Draft",
    slug: record.slug,
    lifecycle: diff?.status ?? record.status,
    status: "ready",
    rootPath: record.rootPath,
    workspacePath: record.workspacePath,
    previewOwnerId: diff?.previewOwnerId || record.previewOwnerId,
    affectedRoutes: record.affectedRoutes ?? [],
    mockAssumptions: record.mockAssumptions ?? [],
    briefPath: record.briefPath,
    originalPrompt: record.name || "Draft",
    summary: codeProposalChangeSummary(changedFiles),
    changedFiles,
    createdAt: record.createdAt,
    updatedAt: Math.max(record.updatedAt, diff ? Date.now() : record.updatedAt),
  };
}

export function mergeHydratedFeatureDraft(
  existing: FeatureDraft,
  hydrated: FeatureDraft,
): FeatureDraft {
  const changedFiles =
    hydrated.changedFiles.length > 0 || existing.changedFiles.length === 0
      ? hydrated.changedFiles
      : existing.changedFiles;
  const canReplaceStatus =
    existing.status !== "preparing" &&
    existing.status !== "generating" &&
    existing.status !== "failed";
  return {
    ...existing,
    registryId: hydrated.registryId,
    projectId: hydrated.projectId,
    threadId: existing.threadId ?? hydrated.threadId,
    lifecycle: hydrated.lifecycle,
    rootPath: hydrated.rootPath,
    workspacePath: hydrated.workspacePath,
    previewOwnerId: hydrated.previewOwnerId,
    affectedRoutes: hydrated.affectedRoutes,
    mockAssumptions: hydrated.mockAssumptions,
    briefPath: hydrated.briefPath,
    changedFiles,
    status: canReplaceStatus ? hydrated.status : existing.status,
    summary:
      changedFiles === existing.changedFiles
        ? existing.summary
        : codeProposalChangeSummary(changedFiles),
    updatedAt: Math.max(existing.updatedAt, hydrated.updatedAt),
  };
}

export function createFeatureDraftId(seed: string) {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `draft-${seed.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 24)}-${random}`;
}

export function featureDraftName(prompt: string) {
  const cleaned = prompt
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim();
  if (!cleaned) return "Feature draft";
  const words = cleaned.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 60 ? `${words.slice(0, 57).trim()}...` : words;
}

export function featureDraftIsActiveForRouting(
  draft: FeatureDraft | null,
  activeProjectId: string,
) {
  return (
    Boolean(draft) &&
    draft?.projectId === activeProjectId &&
    draft.lifecycle === "active" &&
      draft.status !== "failed"
  );
}

export function featureDraftNeedsAttention(draft: FeatureDraft | null) {
  return Boolean(
    draft &&
      draft.lifecycle === "active" &&
      draft.status === "failed",
  );
}

export function markFeatureDraftBuilt(
  desktop: DesktopState,
  draftId: string,
): DesktopState {
  const stored = desktop.featureDrafts[draftId];
  if (!stored) return desktop;
  return {
    ...desktop,
    featureDrafts: {
      ...desktop.featureDrafts,
      [draftId]: {
        ...stored,
        lifecycle: "built",
        status: "ready",
        updatedAt: Date.now(),
      },
    },
    featureDraftActiveIdsByThreadId: Object.fromEntries(
      Object.entries(desktop.featureDraftActiveIdsByThreadId).filter(
        ([, activeDraftId]) => activeDraftId !== draftId,
      ),
    ),
  };
}

export function parkFeatureDraftInState(
  desktop: DesktopState,
  draftId: string,
): DesktopState {
  const stored = desktop.featureDrafts[draftId];
  if (!stored) return desktop;
  return {
    ...desktop,
    featureDrafts: {
      ...desktop.featureDrafts,
      [draftId]: {
        ...stored,
        lifecycle: "parked",
        updatedAt: Date.now(),
      },
    },
    featureDraftActiveIdsByThreadId: Object.fromEntries(
      Object.entries(desktop.featureDraftActiveIdsByThreadId).filter(
        ([, activeDraftId]) => activeDraftId !== draftId,
      ),
    ),
  };
}

export function resumeFeatureDraftInState(
  desktop: DesktopState,
  draftId: string,
  threadId: string,
): DesktopState {
  const stored = desktop.featureDrafts[draftId];
  if (!stored) return desktop;
  return {
    ...desktop,
    featureDrafts: {
      ...desktop.featureDrafts,
      [draftId]: {
        ...stored,
        lifecycle: "active",
        threadId,
        updatedAt: Date.now(),
      },
    },
    featureDraftActiveIdsByThreadId: {
      ...desktop.featureDraftActiveIdsByThreadId,
      [threadId]: draftId,
    },
  };
}

function isExplicitCodeBackedProposalRequest(prompt: string) {
  const text = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /\bproposal workspaces?\b/.test(text) ||
    /\brunnable\s+(?:option|options|proposal|proposals|candidate|candidates|app|apps)\b/.test(
      text,
    ) ||
    /\bcode[-\s]?backed\s+(?:option|options|proposal|proposals)\b/.test(text)
  );
}

function isExplicitMultiOptionProposalRequest(prompt: string) {
  const text = prompt.toLowerCase().replace(/\s+/g, " ").trim();
  return (
    /\b(?:two|three|2|3)\s+(?:(?:different|runnable|reviewable|visual|separate)\s+){0,4}(?:options|directions|variants|proposals|candidates|layouts|previews|mockups|wireframes)\b/.test(
      text,
    ) ||
    /\b(?:a\/b|a\/b\/c|abc|a,\s*b,?\s*(?:and\s+)?c)\b/.test(text)
  );
}

function isFeatureDraftPreviewIntent(text: string) {
  return (
    /\bshow\s+me\b.*\b(?:feature|flow|workflow|screen|page|experience|mode|panel|drawer|dashboard|onboarding|checkout|settings|search|filter|upload|import|export|notification)\b/.test(
      text,
    ) ||
    /\b(?:show|preview|draft|try|explore|prototype|sketch)\b.*\b(?:feature|flow|workflow|screen|page|experience|mode|panel|drawer|dashboard|onboarding|checkout|settings|search|filter|upload|import|export|notification)\b/.test(
      text,
    ) ||
    /\b(?:how|what)\b.*\b(?:would|could|should)\b.*\b(?:work|look|feel)\b/.test(
      text,
    ) ||
    /\b(?:show|preview|draft|try|explore)\b.*\b(?:before|first)\b/.test(text)
  );
}

function isSingleVisualChangeDraftIntent(text: string) {
  return (
    /\b(?:show|preview|draft|try|change|revise|tweak|adjust|update|make|edit|expand|resize|remove|hide|open|close)\b/.test(
      text,
    ) &&
    /\b(?:container|card|panel|message|response|answer|chat|thread|screen|page|view|layout|sidebar|header|footer|button|modal|drawer|form|table|list|row|column|section|area)\b/.test(
      text,
    )
  );
}

function normalizedPromptText(prompt: string) {
  return prompt.toLowerCase().replace(/\s+/g, " ").trim();
}
