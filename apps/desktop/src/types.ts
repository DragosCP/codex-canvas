import type { ReasoningEffort } from "../../../codex-rs/app-server-protocol/schema/typescript/ReasoningEffort";
import type { AskForApproval } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/AskForApproval";
import type { GetAccountRateLimitsResponse } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/GetAccountRateLimitsResponse";
import type { GetAccountResponse } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/GetAccountResponse";
import type { Model } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/Model";
import type { SandboxMode } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/SandboxMode";
import type { SandboxPolicy } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/SandboxPolicy";
import type { Thread } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/Thread";
import type { ThreadItem } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/ThreadItem";
import type { ThreadTokenUsage } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/ThreadTokenUsage";
import type { Turn } from "../../../codex-rs/app-server-protocol/schema/typescript/v2/Turn";

export type {
  AskForApproval,
  Model,
  ReasoningEffort,
  SandboxMode,
  SandboxPolicy,
  Thread,
  ThreadItem,
  ThreadTokenUsage,
  Turn,
};

export type ConnectionStatus =
  | "disconnected"
  | "starting"
  | "connecting"
  | "connected"
  | "failed";

export type BackendMode = "mock-dev" | "real-wsl" | "real-native" | "external";

export type PermissionPreset = {
  id: SandboxMode;
  label: string;
  description: string;
  approvalPolicy: AskForApproval;
};

export type ProjectSettings = {
  sandbox: SandboxMode;
  approvalPolicy: AskForApproval;
  model: string | null;
  effort: ReasoningEffort | null;
  serviceTier: string | null;
  planMode: boolean;
};

export type Project = {
  id: string;
  path: string;
  name: string;
  pinned: boolean;
  hidden: boolean;
  archived: boolean;
  order: number;
  lastActiveThreadId: string | null;
  settings: ProjectSettings;
};

export type LayoutState = {
  inspectorWidth: number;
  commandSurfaceHeight: number;
  inspectorOpen: boolean;
  commandSurfaceOpen: boolean;
};

export type PreviewArtifactKind = "mockup" | "wireframe" | "preview";

export type DesktopState = {
  version: 1;
  appServerUrl: string;
  projects: Project[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  pinnedThreadIds: string[];
  expandedProjectIds: string[];
  planProposals: Record<string, PlanProposal>;
  sentComposerContextsByTurnId: Record<string, ComposerContextReference[]>;
  codeProposalSets: Record<string, CodeProposalSet>;
  codeProposalActiveSetIdsByThreadId: Record<string, string>;
  mockupActiveProposalSetIdsByThreadId: Record<string, string>;
  mockupHistoryProposalSetIds: Record<string, boolean>;
  layout: LayoutState;
};

export type PendingApproval = {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
  receivedAt: number;
};

export type InspectorSelection =
  | { type: "empty" }
  | {
      type: "appPreview";
      projectId: string;
    }
  | {
      type: "mockupPreview";
      projectId: string;
      proposalSetId: string;
    }
  | {
      type: "codeProposalPreview";
      projectId: string;
      proposalSetId: string;
    }
  | {
      type: "planPreview";
      projectId: string;
      proposalTurnId: string;
    }
  | { type: "document"; path: string; title?: string }
  | { type: "command"; item: Extract<ThreadItem, { type: "commandExecution" }> }
  | { type: "fileChange"; item: Extract<ThreadItem, { type: "fileChange" }> }
  | { type: "approval"; approval: PendingApproval };

export type ThreadMap = Record<string, Thread>;

export type ThreadTokenUsageMap = Record<string, ThreadTokenUsage>;

export type MockupDepth = "quick" | "full";

export type SavedMockup = {
  id: string;
  label: string;
  title: string;
  summary: string;
  filePath: string;
  html: string;
  highlights?: ProposalHighlight[];
};

export type MockupPreviewSet = {
  proposalSetId: string;
  projectId: string;
  threadId: string | null;
  artifactKind: PreviewArtifactKind;
  baseDir: string;
  originalPrompt: string;
  depth: MockupDepth;
  selectedMockupId: string | null;
  mockups: SavedMockup[];
};

export type CodeProposalStatus =
  | "preparing"
  | "generating"
  | "ready"
  | "applying"
  | "applied"
  | "failed"
  | "history";

export type CodeProposalFileChange = {
  kind: "created" | "updated" | "deleted";
  path: string;
  hash: string;
  size: number;
};

export type CodeProposalOption = {
  id: "A" | "B" | "C";
  title: string;
  summary: string;
  workspacePath: string;
  status: CodeProposalStatus;
  changedFiles: CodeProposalFileChange[];
  appliedAt?: number;
};

export type CodeProposalSet = {
  proposalSetId: string;
  projectId: string;
  threadId: string | null;
  turnId: string | null;
  rootPath: string;
  originalPrompt: string;
  selectedOptionId: "A" | "B" | "C" | null;
  options: CodeProposalOption[];
  status: CodeProposalStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type ProposalHighlight = {
  id: string;
  label: string;
  note: string;
  areaMark: PlanPreviewAreaMark;
};

export type ComposerAttachmentStatus = "attached" | "ready" | "unsupported";

export type ComposerAttachmentKind = "image" | "inspectable" | "unsupported";

export type ComposerAttachment = {
  id: string;
  path: string;
  name: string;
  kind: ComposerAttachmentKind;
  status: ComposerAttachmentStatus;
  title: string;
};

export type ComposerAppPreviewContext = {
  type: "appPreview";
  id: string;
  projectId: string;
  projectName: string;
  previewUrl: string;
  viewport: "desktop" | "mobile";
  markLabel?: string;
  markNumber?: number;
  areaMark: PlanPreviewAreaMark;
  thumbnailDataUrl?: string;
};

export type ComposerMockupPreviewContext = {
  type: "mockupPreview";
  id: string;
  projectId: string;
  projectName: string;
  proposalSetId: string;
  artifactKind: PreviewArtifactKind;
  mockupId: string;
  mockupLabel: string;
  mockupTitle: string;
  markLabel: string;
  markNumber: number;
  filePath: string;
  viewport: "desktop" | "mobile";
  areaMark: PlanPreviewAreaMark;
  thumbnailDataUrl?: string;
  source?: "userMark" | "proposalHighlight";
  highlightId?: string;
};

export type ComposerContextReference =
  | ComposerAppPreviewContext
  | ComposerMockupPreviewContext;

export type PlanProposalStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "superseded";

export type PlanProposalKind = "plan" | "safer_alternative" | "live_proposal";

export type PlanProposal = {
  id: string;
  projectId: string;
  threadId: string;
  turnId: string;
  prompt: string;
  contexts: ComposerContextReference[];
  previewSpec?: PlanPreviewSpec | null;
  previewSelectedVariantId?: string | null;
  previewAreaMark?: PlanPreviewAreaMark | null;
  previewSession?: PlanPreviewSessionState | null;
  previewUserEditedAt?: number;
  proposalKind: PlanProposalKind;
  status: PlanProposalStatus;
  createdAt: number;
  updatedAt: number;
};

export type PlanPreviewComponentKind =
  | "button"
  | "panel"
  | "menu"
  | "modal"
  | "input"
  | "badge";

export type PlanPreviewPlacement = "topbar" | "sidePanel" | "modal";

export type PlanPreviewComponent = {
  kind: PlanPreviewComponentKind;
  label: string;
  body: string;
  actionLabel?: string;
};

export type PlanPreviewVariant = {
  id: "A" | "B" | "C";
  title: string;
  tradeoff: string;
  placement: PlanPreviewPlacement;
  summary: string;
  route?: string;
  viewState?: string;
  targetRegion?: string;
  highlights?: ProposalHighlight[];
  components: PlanPreviewComponent[];
};

export type PlanPreviewSpec = {
  version: 1;
  summary: string;
  variants: PlanPreviewVariant[];
  createdAt: number;
  updatedAt: number;
};

export type PlanPreviewAreaMark = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  route?: string;
  note: string;
  createdAt: number;
};

export type PlanPreviewCleanupStatus =
  | "idle"
  | "clean"
  | "selected"
  | "reset"
  | "failed"
  | "unavailable";

export type PlanPreviewSessionState = {
  previewUrl: string;
  route: string;
  viewport: "desktop" | "mobile";
  interactionState: string;
  cleanupStatus: PlanPreviewCleanupStatus;
  updatedAt: number;
};

export type LocalChatDraft = {
  id: string;
  projectId: string;
  projectPath: string;
  text: string;
  attachments: ComposerAttachment[];
  contexts: ComposerContextReference[];
  createdAt: number;
  updatedAt: number;
};

export type AppServerSnapshot = {
  config: unknown | null;
  configError: string | null;
  account: GetAccountResponse | null;
  accountError: string | null;
  rateLimits: GetAccountRateLimitsResponse | null;
  rateLimitsError: string | null;
  models: Model[];
  modelsError: string | null;
};
