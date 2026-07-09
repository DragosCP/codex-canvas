import type { FeatureDraft } from "./types";
import type { CanvasWorkflowSurface } from "./canvasActions";

export type CanvasWorkflowKind =
  | "direct_live"
  | "draft"
  | "verification"
  | "plain_chat";

export type CanvasSurfaceLifecycle =
  | "active"
  | "ready"
  | "failed"
  | "interrupted"
  | "built"
  | "stale"
  | "history"
  | "discarded";

export type CanvasRecoveryAction =
  | "reload_live"
  | "continue_draft"
  | "repair_draft"
  | "ask_target"
  | "build_draft"
  | "open_live"
  | "discard_draft";

export type CanvasWorkflowLedger = {
  authoritativeSurface: CanvasWorkflowSurface;
  selectedSurface: CanvasWorkflowSurface;
  activeWorkKind: CanvasWorkflowKind;
  draftLifecycle?: CanvasSurfaceLifecycle;
  draftBuildable: boolean;
  draftNeedsAttention: boolean;
  lastBuild?: {
    source: CanvasWorkflowSurface;
    target: "Live";
  };
  recoveryActions: CanvasRecoveryAction[];
  dataScope: "live_data" | "copied_data" | "fabricated_data" | "unknown";
};

export function deriveCanvasWorkflowLedger(input: {
  liveExists: boolean;
  selectedSurface: CanvasWorkflowSurface;
  activeDraft?: FeatureDraft | null;
  selectedDraft?: FeatureDraft | null;
}): CanvasWorkflowLedger {
  const selectedDraft = input.selectedDraft ?? input.activeDraft ?? null;
  const draftLifecycle = selectedDraft
    ? featureDraftLedgerLifecycle(selectedDraft)
    : undefined;
  const draftNeedsAttention =
    Boolean(selectedDraft) && draftLifecycle === "failed";
  const draftBuildable = Boolean(
    selectedDraft &&
      selectedDraft.lifecycle === "active" &&
      selectedDraft.status === "ready" &&
      selectedDraft.changedFiles.length > 0,
  );

  if (draftNeedsAttention) {
    return {
      authoritativeSurface: input.liveExists ? "Live" : "none",
      selectedSurface: "Draft",
      activeWorkKind: "draft",
      draftLifecycle,
      draftBuildable: false,
      draftNeedsAttention: true,
      recoveryActions: input.liveExists
        ? ["continue_draft", "discard_draft", "open_live"]
        : ["continue_draft", "discard_draft"],
      dataScope: "copied_data",
    };
  }

  if (
    selectedDraft &&
    selectedDraft.lifecycle === "active" &&
    selectedDraft.status !== "failed"
  ) {
    return {
      authoritativeSurface: "Draft",
      selectedSurface: "Draft",
      activeWorkKind: "draft",
      draftLifecycle,
      draftBuildable,
      draftNeedsAttention: false,
      recoveryActions: draftBuildable
        ? ["build_draft", "discard_draft"]
        : ["discard_draft"],
      dataScope: "copied_data",
    };
  }

  return {
    authoritativeSurface: input.liveExists ? "Live" : "none",
    selectedSurface: input.selectedSurface,
    activeWorkKind: input.liveExists ? "direct_live" : "plain_chat",
    draftBuildable: false,
    draftNeedsAttention: false,
    recoveryActions: input.liveExists ? ["reload_live"] : [],
    dataScope: input.liveExists ? "live_data" : "unknown",
  };
}

export function canvasWorkflowLedgerSummary(ledger: CanvasWorkflowLedger) {
  const lines = [
    `- Authoritative surface: ${ledger.authoritativeSurface}`,
    `- Selected surface: ${ledger.selectedSurface}`,
    `- Active work kind: ${ledger.activeWorkKind}`,
    ledger.draftLifecycle ? `- Draft lifecycle: ${ledger.draftLifecycle}` : null,
    ledger.lastBuild
      ? `- Last build: ${ledger.lastBuild.source} -> ${ledger.lastBuild.target}`
      : null,
    `- Draft buildable: ${ledger.draftBuildable ? "yes" : "no"}`,
    `- Data scope: ${ledger.dataScope}`,
    ledger.recoveryActions.length > 0
      ? `- Recovery actions: ${ledger.recoveryActions.join(", ")}`
      : null,
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function featureDraftLedgerLifecycle(draft: FeatureDraft): CanvasSurfaceLifecycle {
  if (draft.lifecycle === "built") return "built";
  if (draft.lifecycle === "discarded") return "discarded";
  if (draft.status === "failed") return "failed";
  if (draft.status === "generating" || draft.status === "preparing") {
    return "interrupted";
  }
  if (draft.lifecycle === "parked") return "history";
  return "ready";
}
