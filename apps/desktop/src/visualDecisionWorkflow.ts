import { previewArtifactKindFromText } from "./mockupArtifacts";
import {
  parseVisualDecisionStrip,
  type VisualDecisionOption,
  type VisualDecisionStrip,
} from "./visualDecision";
import type {
  MockupPreviewSet,
  PreviewArtifactKind,
  Thread,
  ThreadItem,
} from "./types";

export type VisualDecisionComposerAction = {
  decisionId: string;
  option: VisualDecisionOption;
};

export type ActiveVisualDecision = {
  id: string;
  turnId: string;
  decision: VisualDecisionStrip;
};

type VisualDecisionValidityContext = {
  hasActiveCanvasProposal: boolean;
  projectEmptyStatus: { empty: boolean } | null;
  hasSavedMockups: boolean;
  ignoredSentinels?: string[];
};

export function finalAgentText(turn: Thread["turns"][number]) {
  return turn.items
    .filter(
      (item): item is Extract<ThreadItem, { type: "agentMessage" }> =>
        item.type === "agentMessage" &&
        (item.phase === "final_answer" || item.phase === null),
    )
    .map((item) => item.text)
    .join("\n\n");
}

export function latestVisualDecision(
  thread: Thread | null,
  dismissed: Record<string, true>,
  context: VisualDecisionValidityContext,
): ActiveVisualDecision | null {
  if (!thread) return null;
  for (const turn of [...thread.turns].reverse()) {
    if (turn.status === "inProgress") continue;
    if (
      context.ignoredSentinels?.some((sentinel) =>
        turnContainsText(turn, sentinel),
      )
    ) {
      continue;
    }
    const decision = parseVisualDecisionStrip(finalAgentText(turn));
    if (!decision) continue;
    const id = `${thread.id}:${turn.id}`;
    if (dismissed[id]) return null;
    if (!visualDecisionStillValid(decision, context)) continue;
    return { id, turnId: turn.id, decision };
  }
  return null;
}

const DISMISSED_VISUAL_DECISIONS_STORAGE_KEY =
  "codex.visualDecision.dismissed.v1";

export function loadDismissedVisualDecisionIds(): Record<string, true> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(DISMISSED_VISUAL_DECISIONS_STORAGE_KEY) ||
        "{}",
    );
    if (!parsed || typeof parsed !== "object") return {};
    const record: Record<string, true> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) record[key] = true;
    }
    return record;
  } catch {
    return {};
  }
}

export function saveDismissedVisualDecisionIds(
  dismissed: Record<string, true>,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DISMISSED_VISUAL_DECISIONS_STORAGE_KEY,
      JSON.stringify(dismissed),
    );
  } catch {
    // Ignore storage failures; state validity still prevents stale decisions.
  }
}

export function isAcceptedPlanImplementationTurn(turn: Thread["turns"][number]) {
  return turn.items.some((item) => {
    if (item.type !== "userMessage") return false;
    return item.content.some(
      (part) =>
        part.type === "text" && isAcceptedPlanImplementationPrompt(part.text),
    );
  });
}

export function isAcceptedPlanImplementationPrompt(prompt: string) {
  return prompt.trim().startsWith("I accept this plan. Implement it now");
}

export function turnTouchesSavedMockups(turn: Thread["turns"][number]) {
  return turn.items.some((item) => {
    if (item.type !== "fileChange") return false;
    return item.changes.some((change) => {
      const path = change.path.replace(/\\/g, "/").toLowerCase();
      return path.includes("/.codex/mockups/");
    });
  });
}

export function visualDecisionComposerText(option: VisualDecisionOption) {
  return option.description
    ? `${option.label}: ${option.description}`
    : option.label;
}

export function visualDecisionOptionCreatesMockups(
  option: VisualDecisionOption,
) {
  void option;
  return false;
}

export function visualDecisionOptionCreatesFeatureDraft(
  option: VisualDecisionOption,
) {
  if (option.canvasAction === "show_draft") return true;
  const text = [option.id, option.label, option.description, option.prompt]
    .join(" ")
    .toLowerCase();
  return /\b(?:feature\s+)?draft\b/.test(text);
}

export function visualDecisionFeatureDraftRequest(
  option: VisualDecisionOption,
  visiblePrompt: string,
) {
  return option.prompt.trim() || visiblePrompt.trim() || visualDecisionComposerText(option);
}

export function visualDecisionOptionCreatesCodeProposal(
  option: VisualDecisionOption,
) {
  void option;
  return false;
}

export function visualDecisionOptionCreatesLiveOverlay(
  option: VisualDecisionOption,
) {
  void option;
  return false;
}

export function visualDecisionArtifactKind(option: VisualDecisionOption) {
  return previewArtifactKindFromText(
    [option.id, option.label, option.description, option.prompt].join(" "),
    "mockup",
  );
}

export function explicitPreviewArtifactKind(
  prompt: string,
  fallback: PreviewArtifactKind,
) {
  return previewArtifactKindFromText(prompt, fallback);
}

export function selectedMockupIdForLoadedSet(
  previewSet: MockupPreviewSet,
  preferredId: string | null | undefined,
) {
  if (
    preferredId &&
    previewSet.mockups.some((mockup) => mockup.id === preferredId)
  ) {
    return preferredId;
  }
  if (
    previewSet.selectedMockupId &&
    previewSet.mockups.some(
      (mockup) => mockup.id === previewSet.selectedMockupId,
    )
  ) {
    return previewSet.selectedMockupId;
  }
  return previewSet.mockups[0]?.id ?? null;
}

function turnContainsText(turn: Thread["turns"][number], needle: string) {
  return turn.items.some((item) => threadItemContainsText(item, needle));
}

function threadItemContainsText(item: ThreadItem, needle: string): boolean {
  if (item.type === "userMessage") {
    return item.content.some(
      (part) =>
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.includes(needle),
    );
  }
  if (
    (item.type === "agentMessage" || item.type === "reasoning") &&
    "text" in item &&
    typeof item.text === "string"
  ) {
    return item.text.includes(needle);
  }
  return false;
}

function visualDecisionStillValid(
  decision: VisualDecisionStrip,
  context: VisualDecisionValidityContext,
) {
  if (visualDecisionLooksProposalReplacement(decision)) {
    return context.hasActiveCanvasProposal;
  }
  if (!visualDecisionLooksEmptyProjectOnly(decision)) return true;
  if (!context.projectEmptyStatus) return false;
  return context.projectEmptyStatus.empty && !context.hasSavedMockups;
}

function visualDecisionLooksProposalReplacement(decision: VisualDecisionStrip) {
  return decision.options.some((option) =>
    option.canvasAction === "start_fresh",
  );
}

function visualDecisionLooksEmptyProjectOnly(decision: VisualDecisionStrip) {
  const text = [
    decision.title,
    decision.summary,
    ...decision.options.flatMap((option) => [
      option.id,
      option.label,
      option.description,
      option.prompt,
    ]),
  ]
    .join(" ")
    .toLowerCase();
  return (
    text.includes("project is empty") ||
    text.includes("empty project") ||
    text.includes("empty-project") ||
    text.includes("no app structure")
  );
}
