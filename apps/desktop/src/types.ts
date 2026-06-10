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
  canvasLayersOpenByProject: Record<string, boolean>;
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
  planProposals: Record<string, PlanProposal>;
  canvasSuggestions: Record<string, CanvasSuggestion>;
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
      type: "canvas";
      projectId: string;
      focusReference?: string | null;
      focusRequestId?: number;
    }
  | {
      type: "canvasProposal";
      projectId: string;
      proposalTurnId: string;
      focusReference?: string | null;
      focusRequestId?: number;
      readOnly?: boolean;
    }
  | {
      type: "appPreview";
      projectId: string;
    }
  | {
      type: "planPreview";
      projectId: string;
      proposalTurnId: string;
    }
  | {
      type: "canvasSuggestion";
      projectId: string;
      suggestionTurnId: string;
      focusReference?: string | null;
      focusRequestId?: number;
    }
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

export type ComposerCanvasContext = {
  type: "canvas";
  projectId: string;
  projectName: string;
  target?: ComposerCanvasContextTarget;
};

export type ComposerAppPreviewContext = {
  type: "appPreview";
  id: string;
  projectId: string;
  projectName: string;
  previewUrl: string;
  viewport: "desktop" | "mobile";
  areaMark: PlanPreviewAreaMark;
};

export type ComposerContextReference =
  | ComposerCanvasContext
  | ComposerAppPreviewContext;

export type ComposerCanvasContextTarget =
  | {
      kind: "project";
    }
  | {
      kind: "page";
      pageId: string | null;
      pageName: string;
      subPageId?: string | null;
      subPageName?: string | null;
    }
  | {
      kind: "item";
      pageId: string | null;
      pageName: string;
      subPageId?: string | null;
      subPageName?: string | null;
      itemId: string;
      reference: string;
      label: string;
    }
  | {
      kind: "group";
      pageId: string | null;
      pageName: string;
      subPageId?: string | null;
      subPageName?: string | null;
      groupId: string;
      reference: string;
      label: string;
    };

export type ComposerCanvasContextOption = {
  id: string;
  context: ComposerCanvasContext;
  label: string;
  detail: string;
};

export type PlanCanvasStatus =
  | "not_attached"
  | "empty"
  | "sparse"
  | "usable";

export type PlanProposalStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "superseded";

export type PlanProposalKind = "plan" | "safer_alternative";

export type CanvasProposalParseStatus =
  | "none"
  | "pending"
  | "parsed"
  | "empty"
  | "failed";

export type PlanProposal = {
  id: string;
  projectId: string;
  threadId: string;
  turnId: string;
  prompt: string;
  contexts: ComposerContextReference[];
  canvasStatus: PlanCanvasStatus;
  canvasSummary: string;
  canvasBaseSnapshot: ProjectCanvas | null;
  canvasDraftBaseSnapshot?: ProjectCanvas | null;
  canvasProposalSnapshot: ProjectCanvas | null;
  canvasProposalParseStatus: CanvasProposalParseStatus;
  canvasProposalParserVersion?: number;
  canvasProposalChangeCount: number;
  canvasProposalSummary: string;
  canvasProposalErrors: string[];
  canvasUserEditedAt?: number;
  previewSpec?: PlanPreviewSpec | null;
  previewSelectedVariantId?: string | null;
  previewAreaMark?: PlanPreviewAreaMark | null;
  previewUserEditedAt?: number;
  proposalKind: PlanProposalKind;
  canvasUpdatedAt?: number;
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
  note: string;
  createdAt: number;
};

export type CanvasSuggestionStatus = "pending" | "applied" | "dismissed";

export type CanvasSuggestion = {
  id: string;
  projectId: string;
  threadId: string;
  turnId: string;
  prompt: string;
  contexts: ComposerContextReference[];
  canvasStatus: PlanCanvasStatus;
  canvasSummary: string;
  canvasBaseSnapshot: ProjectCanvas | null;
  canvasDraftBaseSnapshot?: ProjectCanvas | null;
  canvasProposalSnapshot: ProjectCanvas | null;
  canvasProposalParseStatus: CanvasProposalParseStatus;
  canvasProposalParserVersion?: number;
  canvasProposalChangeCount: number;
  canvasProposalSummary: string;
  canvasProposalErrors: string[];
  canvasUserEditedAt?: number;
  status: CanvasSuggestionStatus;
  createdAt: number;
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

export type CanvasDevice = "desktop" | "mobile";

export type CanvasItemState = "current" | "proposed" | "deleted";

export type CanvasItemKind =
  | "container"
  | "text"
  | "modal"
  | "divider"
  | "button";

export type CanvasPage = {
  id: string;
  name: string;
  order: number;
  subPages: CanvasSubPage[];
};

export type CanvasSubPage = {
  id: string;
  pageId: string;
  name: string;
  order: number;
};

export type CanvasBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type CanvasItem = {
  id: string;
  numericId: number;
  reference: string;
  kind: CanvasItemKind;
  title: string;
  body: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: CanvasBounds;
  originalX?: number | null;
  originalY?: number | null;
  originalWidth?: number | null;
  originalHeight?: number | null;
  state: CanvasItemState;
  locked: boolean;
  visible: boolean;
  zIndex: number;
  pageId: string | null;
  subPageId: string | null;
  device: CanvasDevice | null;
  groupId: string | null;
  comment: string;
  createdAt: number;
  updatedAt: number;
};

export type CanvasGroup = {
  id: string;
  numericId: number;
  reference: string;
  title: string;
  state: CanvasItemState;
  itemIds: string[];
  bounds: CanvasBounds;
  locked: boolean;
  pageId: string | null;
  subPageId: string | null;
  device: CanvasDevice | null;
  createdAt: number;
  updatedAt: number;
};

export type CanvasInteractionTriggerKind = "item" | "group";

export type CanvasInteractionFrameNumber = 2 | 3;

export type CanvasInteractionItemDelta = {
  itemId: string;
  reference: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  createdItem?: CanvasItem | null;
  sourceGroupId?: string | null;
  sourceGroupReference?: string | null;
};

export type CanvasInteractionFrame = {
  id: string;
  frame: CanvasInteractionFrameNumber;
  label: string;
  affected: CanvasInteractionItemDelta[];
  holdMs: number | null;
  sticky: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CanvasInteractionPreview = {
  id: string;
  triggerKind: CanvasInteractionTriggerKind;
  triggerId: string;
  triggerReference: string;
  title: string;
  pageId: string | null;
  subPageId: string | null;
  device: CanvasDevice | null;
  frames: CanvasInteractionFrame[];
  createdAt: number;
  updatedAt: number;
};

export type ProjectCanvas = {
  projectId: string;
  version: 2;
  activePageId: string;
  activeSubPageId: string;
  activeDevice: CanvasDevice;
  pages: CanvasPage[];
  items: CanvasItem[];
  groups: CanvasGroup[];
  interactionPreviews: CanvasInteractionPreview[];
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
