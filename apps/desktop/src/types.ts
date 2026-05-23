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

export type DesktopState = {
  version: 1;
  appServerUrl: string;
  projects: Project[];
  activeProjectId: string | null;
  activeThreadId: string | null;
  pinnedThreadIds: string[];
  expandedProjectIds: string[];
  canvases: Record<string, ProjectCanvas>;
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
  | { type: "canvas"; projectId: string }
  | { type: "document"; path: string; title?: string }
  | { type: "command"; item: Extract<ThreadItem, { type: "commandExecution" }> }
  | { type: "fileChange"; item: Extract<ThreadItem, { type: "fileChange" }> }
  | { type: "approval"; approval: PendingApproval };

export type ThreadMap = Record<string, Thread>;

export type ThreadTokenUsageMap = Record<string, ThreadTokenUsage>;

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

export type LocalChatDraft = {
  id: string;
  projectId: string;
  projectPath: string;
  text: string;
  attachments: ComposerAttachment[];
  createdAt: number;
  updatedAt: number;
};

export type CanvasItemState = "current" | "proposed" | "deleted";

export type CanvasItem = {
  id: string;
  kind: "container" | "text";
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
  state: CanvasItemState;
  locked: boolean;
};

export type ProjectCanvas = {
  projectId: string;
  items: CanvasItem[];
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
