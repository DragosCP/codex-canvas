import {
  Check,
  ChevronDown,
  FileText,
  FolderOpen,
  PanelRightOpen,
  PencilLine,
  RefreshCw,
  TerminalSquare,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  commandStatusText,
  friendlyMockupPromptTitle,
  itemLabel,
} from "../itemUtils";
import {
  previewArtifactDisplayName,
  previewArtifactKindFromText,
} from "../mockupArtifacts";
import type {
  InspectorSelection,
  LocalChatDraft,
  PlanProposal,
  Project,
  Thread,
  ThreadItem,
  Turn,
} from "../types";
import { stripPlanPreviewBlocks } from "../planPreview";
import {
  compactCommand,
  diffLineCounts,
  formatFileProgressDelta,
  formatShortLineDelta,
  liveProgressDetail,
  liveProgressHeadline,
  mergeTurnFileChanges,
  summarizeTurnProgress,
  WORKSPACE_PROGRESS_POLL_MS,
  type TurnProgressSummary,
  type WorkspaceProgressSnapshot,
} from "../turnProgress";
import {
  parseVisualDecisionStrip,
  stripVisualDecisionBlocks,
} from "../visualDecision";
import { RichText } from "./RichText";

export function ChatThread(props: {
  activeProject: Project | null;
  activeDraft: LocalChatDraft | null;
  activeThread: Thread | null;
  activeWorkspaceProgress: WorkspaceProgressSnapshot | null;
  onAcceptPlanProposal: (proposal: PlanProposal) => void;
  onDeclinePlanProposal: (proposal: PlanProposal) => void;
  onModifyPlanProposal: (proposal: PlanProposal, feedback?: string) => void;
  onPlanProposalFeedbackChange: (turnId: string, value: string) => void;
  onShowPlanUiImpact: (proposal: PlanProposal) => void;
  onSelect: (selection: InspectorSelection) => void;
  planProposalFeedbackDrafts?: Record<string, string>;
  planProposals?: Record<string, PlanProposal>;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const planProposalFeedbackDrafts = props.planProposalFeedbackDrafts ?? {};
  const planProposals = props.planProposals ?? {};

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !stickToBottomRef.current) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [props.activeThread]);

  function handleScroll() {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distanceFromBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 120;
  }

  if (!props.activeProject) {
    return (
      <div className="turn-list" ref={scrollerRef} onScroll={handleScroll}>
        <EmptyState />
      </div>
    );
  }

  if (!props.activeThread) {
    return (
      <div className="turn-list" ref={scrollerRef} onScroll={handleScroll}>
        <div className="empty-chat">
          {props.activeDraft ? (
            <>
              <h2>New chat</h2>
              <p>Write the first message, then Codex will create the chat.</p>
            </>
          ) : (
            <>
              <h2>Ready in {props.activeProject.name}</h2>
              <p>Start a chat or send a prompt from the composer.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const activeProject = props.activeProject;
  const activeThread = props.activeThread;

  return (
    <div className="turn-list" ref={scrollerRef} onScroll={handleScroll}>
      {activeThread.turns.length === 0 && (
        <div className="empty-chat">
          <h2>New chat</h2>
          <p>Ask Codex to inspect, plan, run commands, or edit this project.</p>
        </div>
      )}
      {activeThread.turns.map((turn) => (
        <TurnView
          activeProject={activeProject}
          key={turn.id}
          onAcceptPlanProposal={props.onAcceptPlanProposal}
          onDeclinePlanProposal={props.onDeclinePlanProposal}
          onModifyPlanProposal={props.onModifyPlanProposal}
          onPlanProposalFeedbackChange={props.onPlanProposalFeedbackChange}
          onShowPlanUiImpact={props.onShowPlanUiImpact}
          onSelect={props.onSelect}
          planProposalFeedbackDraft={planProposalFeedbackDrafts[turn.id]}
          planProposal={planProposals[turn.id] ?? null}
          turn={turn}
          workspaceProgress={
            props.activeWorkspaceProgress?.turnId === turn.id
              ? props.activeWorkspaceProgress
              : null
          }
        />
      ))}
    </div>
  );
}

function TurnView(props: {
  activeProject: Project;
  turn: Turn;
  onAcceptPlanProposal: (proposal: PlanProposal) => void;
  onDeclinePlanProposal: (proposal: PlanProposal) => void;
  onModifyPlanProposal: (proposal: PlanProposal, feedback?: string) => void;
  onPlanProposalFeedbackChange: (turnId: string, value: string) => void;
  onShowPlanUiImpact: (proposal: PlanProposal) => void;
  onSelect: (selection: InspectorSelection) => void;
  planProposalFeedbackDraft?: string;
  planProposal: PlanProposal | null;
  workspaceProgress: WorkspaceProgressSnapshot | null;
}) {
  const userItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "userMessage" }> =>
      item.type === "userMessage",
  );
  const visibleUserItems = dedupeUserMessageItems(userItems, props.activeProject);
  const finalItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "agentMessage" }> =>
      item.type === "agentMessage" &&
      (item.phase === "final_answer" || item.phase === null),
  );
  const hasVisualDecision = finalItems.some((item) =>
    Boolean(parseVisualDecisionStrip(item.text)),
  );
  const isQuietEmptyProjectDecisionTurn =
    isEmptyProjectVisualPlanningDecisionTurn(props.turn);
  const activityItems = props.turn.items.filter((item) =>
    isActivityItem(item, props.turn.status),
  );
  const compactionItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "contextCompaction" }> =>
      item.type === "contextCompaction",
  );
  const mergedFileChangeItem =
    props.turn.status === "inProgress" ? null : mergeTurnFileChanges(props.turn);

  return (
    <article className={`turn-card ${props.turn.status}`}>
      {visibleUserItems.map((item) => (
        <UserMessageView
          activeProject={props.activeProject}
          key={item.id}
          item={item}
        />
      ))}
      {props.turn.error && (
        <div className="error-line">{turnErrorMessage(props.turn.error)}</div>
      )}
      {isQuietEmptyProjectDecisionTurn &&
        props.turn.status === "inProgress" && (
          <p className="turn-quiet-status">Preparing choices...</p>
        )}
      {!isQuietEmptyProjectDecisionTurn &&
        (activityItems.length > 0 || props.turn.status === "inProgress") && (
          <TurnActivity
            activeProject={props.activeProject}
            durationMs={props.turn.durationMs}
            items={activityItems}
            status={props.turn.status}
            startedAt={props.turn.startedAt}
            turn={props.turn}
            turnId={props.turn.id}
            workspaceProgress={props.workspaceProgress}
          />
        )}
      {compactionItems.map((item) => (
        <ContextCompactionDivider key={item.id} />
      ))}
      {finalItems.map((item) => (
        <AssistantMessageView
          activeProject={props.activeProject}
          key={item.id}
          item={item}
        />
      ))}
      {props.planProposal &&
        finalItems.length > 0 &&
        !hasVisualDecision &&
        shouldShowPlanProposalReview(props.planProposal) && (
          <PlanProposalReview
            proposal={props.planProposal}
            onAccept={props.onAcceptPlanProposal}
            onDecline={props.onDeclinePlanProposal}
            onModify={props.onModifyPlanProposal}
            onOpenPreview={props.onShowPlanUiImpact}
            feedbackDraft={props.planProposalFeedbackDraft ?? ""}
            onFeedbackChange={(value) =>
              props.onPlanProposalFeedbackChange(
                props.planProposal?.turnId ?? "",
                value,
              )
            }
          />
        )}
      {mergedFileChangeItem && (
        <FileChangeView
          activeProject={props.activeProject}
          key={mergedFileChangeItem.id}
          item={mergedFileChangeItem}
          onSelect={props.onSelect}
        />
      )}
      {props.turn.items.length === 0 && <p className="muted">No output yet</p>}
    </article>
  );
}

function isEmptyProjectVisualPlanningDecisionTurn(turn: Turn) {
  return turn.items.some(
    (item) =>
      item.type === "userMessage" &&
      item.content.some(
        (part) =>
          part.type === "text" &&
          Boolean(extractEmptyProjectVisualPlanningRequest(part.text)),
      ),
  );
}

function dedupeUserMessageItems(
  items: Array<Extract<ThreadItem, { type: "userMessage" }>>,
  activeProject: Project,
) {
  const seen = new Set<string>();
  const result: Array<Extract<ThreadItem, { type: "userMessage" }>> = [];
  for (const item of items) {
    const signature = userMessageDisplaySignature(item, activeProject);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(item);
  }
  return result;
}

function userMessageDisplaySignature(
  item: Extract<ThreadItem, { type: "userMessage" }>,
  activeProject: Project,
) {
  return item.content
    .map((part) => {
      if (part.type === "text") {
        const display = friendlyUserDisplay(part.text, activeProject);
        return `text:${display.actionLabel ?? ""}:${display.text.trim()}`;
      }
      if ("path" in part) return `path:${part.path}`;
      if ("url" in part) return `url:${part.url}`;
      return JSON.stringify(part);
    })
    .join("|");
}

function ContextCompactionDivider() {
  return (
    <div className="context-compaction-divider">
      <span />
      <strong>
        <RefreshCw size={14} />
        Context automatically compacted
      </strong>
      <span />
    </div>
  );
}

type ActivityItem =
  | Extract<ThreadItem, { type: "agentMessage" }>
  | Extract<ThreadItem, { type: "commandExecution" }>
  | Extract<ThreadItem, { type: "fileChange" }>
  | Extract<ThreadItem, { type: "plan" }>
  | Extract<ThreadItem, { type: "reasoning" }>;

function UserMessageView(props: {
  activeProject: Project;
  item: Extract<ThreadItem, { type: "userMessage" }>;
}) {
  return (
    <div className="message user-message">
      {props.item.content.map((part, index) => {
        if (part.type === "text") {
          const display = friendlyUserDisplay(part.text, props.activeProject);
          return (
            <div className="user-message-plain" key={index}>
              {display.actionLabel && (
                <span className="user-message-action">
                  {display.actionLabel}
                </span>
              )}
              {display.text && <p>{display.text}</p>}
            </div>
          );
        }
        return (
          <p className="attachment-note" key={index}>
            {attachmentLabel(part)}
          </p>
        );
      })}
    </div>
  );
}

function attachmentLabel(
  part: Extract<ThreadItem, { type: "userMessage" }>["content"][number],
) {
  if ("path" in part) return `Added ${basename(part.path)}`;
  if ("url" in part) return "Added image";
  return "Added file";
}

function AssistantMessageView(props: {
  activeProject: Project;
  item: Extract<ThreadItem, { type: "agentMessage" }>;
}) {
  const visibleText = friendlyText(props.item.text, props.activeProject).trim();
  return (
    <div className="message assistant-message">
      {visibleText ? (
        <RichText text={visibleText} />
      ) : (
        <span className="muted">Streaming...</span>
      )}
    </div>
  );
}

function PlanProposalReview(props: {
  proposal: PlanProposal;
  feedbackDraft: string;
  onAccept: (proposal: PlanProposal) => void;
  onDecline: (proposal: PlanProposal) => void;
  onFeedbackChange: (value: string) => void;
  onModify: (proposal: PlanProposal, feedback?: string) => void;
  onOpenPreview: (proposal: PlanProposal) => void;
}) {
  const pending = props.proposal.status === "pending";
  const title = planProposalTitle(props.proposal);
  const [decision, setDecision] = useState<"accept" | "revise">("accept");
  const feedbackText = props.feedbackDraft.trim();
  const selectedPreviewVariant = selectedPlanPreviewVariant(props.proposal);
  const hasAttachedPreviewContext = Boolean(
    selectedPreviewVariant || props.proposal.previewAreaMark,
  );
  useEffect(() => {
    if (props.feedbackDraft.trim()) setDecision("revise");
  }, [props.feedbackDraft]);
  useEffect(() => {
    if (props.proposal.previewAreaMark) setDecision("revise");
  }, [props.proposal.previewAreaMark]);
  const acceptLabel = planAcceptLabel(props.proposal, selectedPreviewVariant);
  const canShowPendingPreview = pending && hasPlanUiImpact(props.proposal);
  function submitDecision() {
    if (decision === "accept") {
      props.onAccept(props.proposal);
      return;
    }
    if (!feedbackText && !hasAttachedPreviewContext) return;
    props.onModify(props.proposal, feedbackText);
  }
  return (
    <div className={`plan-proposal-review ${props.proposal.status}`}>
      <div className="plan-proposal-copy">
        <strong>{title}</strong>
        <span>{planReviewText(props.proposal)}</span>
      </div>
      {pending ? (
        <div
          className="plan-decision"
          aria-label="Implement this plan?"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              props.onDecline(props.proposal);
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              submitDecision();
            }
          }}
        >
          <strong>Implement this plan?</strong>
          <div className="plan-decision-options">
            <button
              className={decision === "accept" ? "selected" : ""}
              data-testid="plan-decision-accept-option"
              type="button"
              onClick={() => setDecision("accept")}
            >
              <span>1.</span>
              <strong>{acceptLabel}</strong>
            </button>
            <label
              className={`plan-decision-feedback ${
                decision === "revise" ? "selected" : ""
              }`}
            >
              <span>2.</span>
              <textarea
                data-testid="plan-decision-feedback"
                onChange={(event) => {
                  setDecision("revise");
                  props.onFeedbackChange(event.target.value);
                }}
                onFocus={() => setDecision("revise")}
                placeholder="No, and tell Codex what to do differently"
                rows={props.feedbackDraft ? 3 : 1}
                value={props.feedbackDraft}
              />
              {hasAttachedPreviewContext && (
                <small className="plan-decision-chip">
                  {props.proposal.previewAreaMark
                    ? "Includes preview mark"
                    : selectedPreviewVariant
                      ? `Option ${selectedPreviewVariant.id} selected`
                      : "Preview selected"}
                </small>
              )}
            </label>
          </div>
          {canShowPendingPreview && (
            <div className="plan-decision-inspect">
              <button
                data-testid="plan-show-preview"
                type="button"
                onClick={() => props.onOpenPreview(props.proposal)}
              >
                <PanelRightOpen size={14} />
                <span>
                  {props.proposal.previewSpec?.variants.length &&
                  props.proposal.previewSpec.variants.length > 1
                    ? "Compare options"
                    : "Show app preview"}
                </span>
              </button>
            </div>
          )}
          <div className="plan-decision-actions">
            <button
              data-testid="plan-decline"
              type="button"
              onClick={() => props.onDecline(props.proposal)}
            >
              <span>Dismiss</span>
              <kbd>Esc</kbd>
            </button>
            <button
              className="plan-proposal-accept"
              data-testid="plan-accept"
              disabled={
                decision === "revise" &&
                !feedbackText &&
                !hasAttachedPreviewContext
              }
              type="button"
              onClick={submitDecision}
            >
              <span>Submit</span>
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function shouldShowPlanProposalReview(proposal: PlanProposal) {
  if (isNoPlanProposalRequest(proposal.prompt)) return false;
  if (isReadOnlyPlanningNoteRequest(proposal.prompt)) return false;
  return proposal.status === "pending" || proposal.status === "accepted" || proposal.status === "declined";
}

function hasPlanUiImpact(proposal: PlanProposal) {
  return Boolean(proposal.previewSpec?.variants.length || proposal.previewAreaMark);
}

function selectedPlanPreviewVariant(proposal: PlanProposal) {
  const variants = proposal.previewSpec?.variants ?? [];
  if (variants.length === 0) return null;
  return (
    variants.find((variant) => variant.id === proposal.previewSelectedVariantId) ??
    variants[0] ??
    null
  );
}

function planAcceptLabel(
  proposal: PlanProposal,
  selectedVariant: ReturnType<typeof selectedPlanPreviewVariant>,
) {
  if (proposal.proposalKind === "safer_alternative") {
    return "Yes, implement safer plan";
  }
  if (selectedVariant && (proposal.previewSpec?.variants.length ?? 0) > 1) {
    return `Implement option ${selectedVariant.id}`;
  }
  if (selectedVariant) return "Implement selected preview";
  return "Yes, implement this plan";
}

function planProposalTitle(proposal: PlanProposal) {
  return proposal.proposalKind === "safer_alternative" ? "Safer plan" : "Plan";
}

function planReviewText(proposal: PlanProposal) {
  if (proposal.previewSpec?.variants.length) {
    return proposal.previewSpec.variants.length > 1
      ? "Live app preview options ready."
      : "Live app preview ready.";
  }
  return "Plan ready.";
}

function isNoPlanProposalRequest(prompt: string) {
  const text = prompt.toLowerCase();
  return (
    /\bno\s+(?:plan\s+)?proposal\b/.test(text) ||
    /\bwithout\s+(?:a\s+)?(?:plan\s+)?proposal\b/.test(text) ||
    /\bdo\s+not\s+(?:create|show|return|make)\s+(?:a\s+)?(?:plan\s+)?proposal\b/.test(
      text,
    ) ||
    /\bdon't\s+(?:create|show|return|make)\s+(?:a\s+)?(?:plan\s+)?proposal\b/.test(
      text,
    )
  );
}

function isReadOnlyPlanningNoteRequest(prompt: string) {
  const text = prompt
    .toLowerCase()
    .replace(/\bplan\s+mode\s+only\b/g, "")
    .replace(/\bplan\s+only\b/g, "");
  const asksForSummary =
    /\b(read|inspect|explain|summari[sz]e|tell\s+me\s+what|what\s+(?:this|the)\s+.*does)\b/.test(
      text,
    );
  if (!asksForSummary) return false;
  if (/\bdo\s+not\s+edit\s+files\b/.test(text)) return true;
  const asksForChange =
    /\b(add|build|create|implement|change|move|update|wire|design|propose|proposal|feature|route|page|button|panel|menu|workflow)\b/.test(
      text,
    );
  return !asksForChange;
}

function FileChangeView(props: {
  activeProject: Project;
  item: Extract<ThreadItem, { type: "fileChange" }>;
  onSelect: (selection: InspectorSelection) => void;
}) {
  const [visibleChanges, hiddenChanges] = splitVisibleChanges(props.item);
  return (
    <div className="file-change-block">
      <div className="file-change-heading">
        <PencilLine size={15} />
        <strong>
          Edited {props.item.changes.length} file
          {props.item.changes.length === 1 ? "" : "s"}
        </strong>
      </div>
      <FileChangeRows
        activeProject={props.activeProject}
        changes={visibleChanges}
        onSelect={props.onSelect}
      />
      {hiddenChanges.length > 0 && (
        <details className="file-change-more">
          <summary>
            Show {hiddenChanges.length} more file
            {hiddenChanges.length === 1 ? "" : "s"}
            <ChevronDown className="details-chevron" size={14} />
          </summary>
          <FileChangeRows
            activeProject={props.activeProject}
            changes={hiddenChanges}
            onSelect={props.onSelect}
          />
        </details>
      )}
    </div>
  );
}

function TurnActivity(props: {
  activeProject: Project;
  durationMs: number | null;
  items: ActivityItem[];
  startedAt: number | null;
  status: Turn["status"];
  turn: Turn;
  turnId: string;
  workspaceProgress: WorkspaceProgressSnapshot | null;
}) {
  const [open, setOpen] = useState(props.status === "inProgress");
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    if (props.status === "inProgress") {
      setOpen(true);
      setProgressTick(0);
    }
  }, [props.status, props.turnId]);

  useEffect(() => {
    if (props.status !== "inProgress") return;
    const timer = window.setInterval(
      () => setProgressTick((value) => value + 1),
      WORKSPACE_PROGRESS_POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, [props.status, props.turnId]);

  const elapsedMs =
    props.status === "inProgress" && props.startedAt
      ? Math.max(0, Date.now() - props.startedAt * 1000)
      : props.durationMs;
  const progress = summarizeTurnProgress(
    props.turn,
    props.activeProject,
    props.workspaceProgress,
  );

  return (
    <details
      className={`turn-activity ${props.status}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span>
          {activitySummaryLabel(props.durationMs, props.status, elapsedMs)}
        </span>
        <ChevronDown className="details-chevron" size={14} />
      </summary>
      <div className="turn-activity-body">
        {props.status === "inProgress" && progress.fileCount === 0 && (
          <LiveTurnProgress
            elapsedMs={elapsedMs}
            progress={progress}
            tick={progressTick}
          />
        )}
        {props.status === "inProgress" && progress.fileCount > 0 && (
          <TurnProgressInline progress={progress} status={props.status} />
        )}
        {activityNodes(
          props.items.filter((item) => item.type !== "fileChange"),
          props.activeProject,
        )}
      </div>
    </details>
  );
}

function activityNodes(items: ActivityItem[], activeProject: Project) {
  const nodes = [];
  let commandGroup: Extract<ThreadItem, { type: "commandExecution" }>[] = [];
  const seenText = new Set<string>();
  for (const item of items) {
    if (item.type === "commandExecution") {
      commandGroup.push(item);
      continue;
    }
    if (commandGroup.length > 0) {
      nodes.push(
        <CommandActivity
          key={`commands-${commandGroup[0].id}`}
          commands={commandGroup}
        />,
      );
      commandGroup = [];
    }
    const signature = activityItemTextSignature(item, activeProject);
    if (signature) {
      if (seenText.has(signature)) continue;
      seenText.add(signature);
    }
    nodes.push(
      <ActivityLine activeProject={activeProject} key={item.id} item={item} />,
    );
  }
  if (commandGroup.length > 0) {
    nodes.push(
      <CommandActivity
        key={`commands-${commandGroup[0].id}`}
        commands={commandGroup}
      />,
    );
  }
  return nodes;
}

function LiveTurnProgress(props: {
  elapsedMs: number | null;
  progress: TurnProgressSummary;
  tick: number;
}) {
  const elapsed =
    props.elapsedMs != null
      ? formatDuration(Math.max(props.elapsedMs, props.tick * WORKSPACE_PROGRESS_POLL_MS))
      : formatDuration(props.tick * WORKSPACE_PROGRESS_POLL_MS);
  const headline = liveProgressHeadline(props.progress);
  const detail = liveProgressDetail(props.progress, elapsed, props.elapsedMs);

  return (
    <div
      className="live-turn-progress"
      data-progress-tick={props.tick}
      data-testid="live-turn-progress"
    >
      <div className="live-turn-progress-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="live-turn-progress-copy">
        <strong>{headline}</strong>
        <small
          key={`${props.progress.additions}:${props.progress.deletions}:${props.tick}`}
        >
          {detail}
        </small>
      </div>
      {props.progress.fileCount === 0 && (
        <LiveTurnProgressTimeline
          elapsedMs={props.elapsedMs}
          progress={props.progress}
          tick={props.tick}
        />
      )}
      {props.progress.files.length > 0 && (
        <div className="live-turn-progress-files" aria-label="Live file progress">
          {props.progress.files.slice(0, 3).map((file) => (
            <span
              className="live-turn-progress-file-chip"
              key={`${file.path}:${file.additions}:${file.deletions}`}
            >
              <span>{file.label}</span>
              <strong>{formatFileProgressDelta(file)}</strong>
            </span>
          ))}
          {props.progress.extraFileCount > 0 && (
            <span className="live-turn-progress-file-chip muted">
              +{props.progress.extraFileCount} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LiveTurnProgressTimeline(props: {
  elapsedMs: number | null;
  progress: TurnProgressSummary;
  tick: number;
}) {
  const elapsedMs =
    props.elapsedMs ?? props.tick * WORKSPACE_PROGRESS_POLL_MS;
  const entries = liveProgressTimelineEntries(props.progress, elapsedMs);
  if (entries.length === 0) return null;
  return (
    <div
      className="live-turn-progress-timeline"
      aria-label="Observable progress"
    >
      {entries.map((entry) => (
        <div className="live-turn-progress-step" key={entry.key}>
          <span>{entry.time}</span>
          <strong>{entry.label}</strong>
          <small>{entry.detail}</small>
        </div>
      ))}
    </div>
  );
}

function liveProgressTimelineEntries(
  progress: TurnProgressSummary,
  elapsedMs: number,
) {
  const elapsedSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const latestBucket = Math.floor(elapsedSeconds / 10) * 10;
  if (latestBucket < 10) return [];
  const buckets: number[] = [];
  for (
    let bucket = Math.max(10, latestBucket - 70);
    bucket <= latestBucket;
    bucket += 10
  ) {
    buckets.push(bucket);
  }
  return buckets.map((bucket) => ({
    key: `observable-${bucket}`,
    time: formatDuration(bucket * 1000),
    ...liveProgressTimelineCopy(progress, bucket),
  }));
}

function liveProgressTimelineCopy(
  progress: TurnProgressSummary,
  elapsedSeconds: number,
) {
  if (progress.activeCommandCount > 0) {
    return {
      label: "Command running",
      detail: progress.latestCommand
        ? compactCommand(progress.latestCommand)
        : "Waiting for command output",
    };
  }
  if (progress.commandCount > 0) {
    return {
      label:
        elapsedSeconds >= 50
          ? "No file writes observed yet"
          : "Watching workspace",
      detail: `${progress.commandCount} command${
        progress.commandCount === 1 ? "" : "s"
      } observed`,
    };
  }
  return {
    label: elapsedSeconds >= 30 ? "Still working" : "Waiting",
    detail: "No command or file writes observed yet",
  };
}

function TurnProgressInline(props: {
  progress: TurnProgressSummary;
  status: Turn["status"];
}) {
  const active = props.status === "inProgress";
  const firstFile = props.progress.files[0];
  if (props.progress.fileCount === 1 && firstFile) {
    return (
      <p className={`activity-edit-line live ${active ? "editing" : "edited"}`}>
        <PencilLine size={14} />
        <span>
          {active ? "Editing" : "Edited"} {firstFile.label}
        </span>
        <small>{formatShortLineDelta(firstFile.additions, firstFile.deletions)}</small>
      </p>
    );
  }

  return (
    <details className="turn-progress-detail" open={active}>
      <summary>
        <PencilLine size={14} />
        <span>{turnProgressDetailSummary(props.progress, active)}</span>
        <small>
          {formatShortLineDelta(
            props.progress.additions,
            props.progress.deletions,
          )}
        </small>
        <ChevronDown className="details-chevron" size={14} />
      </summary>
      <div className="turn-progress-detail-list">
        {props.progress.files.slice(0, 6).map((file) => (
          <div className="turn-progress-detail-row" key={file.path}>
            <span>
              {active ? "Editing" : "Edited"} {file.label}
            </span>
            <small>{formatShortLineDelta(file.additions, file.deletions)}</small>
          </div>
        ))}
        {props.progress.extraFileCount > 0 && (
          <div className="turn-progress-detail-row muted">
            <span>{props.progress.extraFileCount} more files changed</span>
          </div>
        )}
        {props.progress.commands.slice(-4).map((command) => (
          <div className="turn-progress-detail-row command" key={command.id}>
            <span>Ran {compactCommand(command.command)}</span>
            <small>{command.durationMs == null ? command.status : formatDuration(command.durationMs)}</small>
          </div>
        ))}
      </div>
    </details>
  );
}

function turnProgressDetailSummary(
  progress: TurnProgressSummary,
  active: boolean,
) {
  const verb = active ? "Editing" : "Edited";
  const fileLabel = `${progress.fileCount} file${
    progress.fileCount === 1 ? "" : "s"
  }`;
  const commandLabel =
    progress.commandCount > 0
      ? `, ran ${progress.commandCount} command${
          progress.commandCount === 1 ? "" : "s"
        }`
      : "";
  return `${verb} ${fileLabel}${commandLabel}`;
}

function ActivityLine(props: {
  activeProject: Project;
  item: Exclude<
    ActivityItem,
    Extract<ThreadItem, { type: "commandExecution" }>
  >;
}) {
  const item = props.item;
  if (item.type === "agentMessage") {
    return item.text ? (
      <RichText text={friendlyText(item.text, props.activeProject)} />
    ) : (
      <p className="muted">Working...</p>
    );
  }
  if (item.type === "fileChange") {
    return (
      <p className="activity-edit-line">
        <PencilLine size={14} />
        <span>
          Edited {item.changes.length} file
          {item.changes.length === 1 ? "" : "s"}
        </span>
      </p>
    );
  }
  if (item.type === "plan") {
    return <RichText text={friendlyText(item.text, props.activeProject)} />;
  }
  if (item.type === "reasoning") {
    return uniqueActivityLines(item.summary.concat(item.content)).map(
      (line, index) => <RichText key={index} text={line} />,
    );
  }
  return <p>{itemLabel(item)}</p>;
}

function CommandActivity(props: {
  commands: Extract<ThreadItem, { type: "commandExecution" }>[];
}) {
  return (
    <details className="command-activity">
      <summary>
        <TerminalSquare size={14} />
        <span>
          Ran {props.commands.length} command
          {props.commands.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className="details-chevron" size={14} />
      </summary>
      <div className="command-activity-list">
        {props.commands.map((command) => (
          <div
            key={command.id}
            className={`command-activity-line ${command.status}`}
          >
            <span>Ran {compactCommand(command.command)}</span>
            {command.status !== "completed" && (
              <small>{commandStatusText(command)}</small>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

function activityItemTextSignature(
  item: Exclude<
    ActivityItem,
    Extract<ThreadItem, { type: "commandExecution" }>
  >,
  activeProject: Project,
) {
  if (item.type === "fileChange") return "";
  if (item.type === "agentMessage") {
    return normalizeActivityText(friendlyText(item.text, activeProject));
  }
  if (item.type === "plan") {
    return normalizeActivityText(friendlyText(item.text, activeProject));
  }
  if (item.type === "reasoning") {
    return normalizeActivityText(
      uniqueActivityLines(item.summary.concat(item.content)).join("\n"),
    );
  }
  return "";
}

function uniqueActivityLines(lines: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const line of lines) {
    const signature = normalizeActivityText(line);
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    unique.push(line);
  }
  return unique;
}

function normalizeActivityText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isActivityItem(
  item: ThreadItem,
  turnStatus: Turn["status"],
): item is ActivityItem {
  if (item.type === "agentMessage") return item.phase === "commentary";
  if (item.type === "fileChange") return turnStatus === "inProgress";
  return (
    item.type === "commandExecution" ||
    item.type === "plan" ||
    item.type === "reasoning"
  );
}

function EmptyState() {
  return (
    <div className="empty-chat">
      <FolderOpen size={36} />
      <h2>Add a local project to start</h2>
      <p>
        Add a folder, start a chat, and Codex can inspect local project work.
      </p>
    </div>
  );
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function splitVisibleChanges(
  item: Extract<ThreadItem, { type: "fileChange" }>,
) {
  return [item.changes.slice(0, 3), item.changes.slice(3)] as const;
}

function FileChangeRows(props: {
  activeProject: Project;
  changes: Extract<ThreadItem, { type: "fileChange" }>["changes"];
  onSelect: (selection: InspectorSelection) => void;
}) {
  return (
    <div className="file-change-list">
      {props.changes.map((change) => {
        const counts = diffLineCounts(change.diff);
        const markdown = isMarkdownPath(change.path);
        const content = (
          <>
            <FileText size={14} />
            <span>{friendlyPath(change.path, props.activeProject)}</span>
            <small>
              <span className="addition">+{counts.additions}</span>{" "}
              <span className="deletion">-{counts.deletions}</span>
            </small>
          </>
        );
        if (!markdown) {
          return (
            <div className="file-change-row inert" key={change.path}>
              {content}
            </div>
          );
        }
        return (
          <button
            className="file-change-row"
            key={change.path}
            onClick={() =>
              props.onSelect({
                type: "document",
                path: documentPath(change.path, props.activeProject),
                title: friendlyPath(change.path, props.activeProject),
              })
            }
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

function isMarkdownPath(path: string) {
  return /\.(md|mdx|markdown)$/i.test(path);
}

function documentPath(path: string, activeProject: Project) {
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return path;
  return `${activeProject.path.replace(/[\\/]$/, "")}/${path}`;
}

function friendlyPath(path: string, activeProject: Project) {
  return friendlyText(path, activeProject).replace(/^\.\//, "");
}

function friendlyText(text: string, activeProject: Project) {
  if (!text) return text;
  const projectPath = activeProject.path.replace(/\\/g, "/").replace(/\/$/, "");
  const escapedProjectPath = escapeRegExp(projectPath);
  return stripInternalEvidenceSurface(
    stripPlanPreviewBlocks(stripVisualDecisionBlocks(trimInternalContextTail(text))),
  ).replace(new RegExp(escapedProjectPath, "g"), ".");
}

type FriendlyUserDisplay = {
  actionLabel?: string;
  text: string;
};

function friendlyUserDisplay(
  text: string,
  activeProject: Project,
): FriendlyUserDisplay {
  return mapUserDisplayText(text, activeProject);
}

function mapUserDisplayText(
  text: string,
  activeProject: Project,
): FriendlyUserDisplay {
  let visible = text.trim();
  const userRequestMarker = "\n\nUser request:\n";
  if (visible.startsWith("Plan Mode:") && visible.includes(userRequestMarker)) {
    visible = visible.slice(
      visible.indexOf(userRequestMarker) + userRequestMarker.length,
    );
  }
  const visualPlanningRequest =
    extractEmptyProjectVisualPlanningRequest(visible);
  if (visualPlanningRequest) {
    return { text: friendlyText(visualPlanningRequest, activeProject) };
  }
  const existingDecisionRequest =
    extractExistingAppVisualDecisionRequest(visible);
  if (existingDecisionRequest) {
    return { text: friendlyText(existingDecisionRequest, activeProject) };
  }
  const existingPreviewRequest = extractExistingAppPreviewFirstRequest(visible);
  if (existingPreviewRequest) {
    return { text: friendlyText(existingPreviewRequest, activeProject) };
  }
  const mockupReviewRequest = extractSavedMockupReviewRequest(visible);
  if (mockupReviewRequest) {
    return { text: friendlyText(mockupReviewRequest, activeProject) };
  }
  const visualDecisionRequest = extractVisualDecisionSelectionRequest(visible);
  if (visualDecisionRequest) {
    return { text: friendlyText(visualDecisionRequest, activeProject) };
  }
  const buildSelectedRequest = extractBuildSelectedMockupRequest(visible);
  if (buildSelectedRequest) {
    return { text: friendlyText(buildSelectedRequest, activeProject) };
  }
  const mockupTitle = friendlyMockupPromptTitle(visible);
  if (mockupTitle) {
    const original = extractOriginalMockupRequest(visible);
    const requestedChange = extractRequestedMockupChange(visible);
    return {
      actionLabel: mockupActionLabel(mockupTitle),
      text: friendlyText(requestedChange || original, activeProject),
    };
  }
  for (const marker of [
    "\n\nProject context explicitly attached by the user:\n",
    "\n\nFiles to inspect if needed:\n",
  ]) {
    const index = visible.indexOf(marker);
    if (index !== -1) visible = visible.slice(0, index);
  }
  return { text: friendlyText(visible.trim(), activeProject) };
}

function mockupActionLabel(title: string) {
  const create = title.match(
    /^Create\s+(\d+)\s*(.*?)\b(mockups|wireframes|previews)\b first$/i,
  );
  if (create) {
    const depth = create[2].trim();
    const artifactKind = previewArtifactKindFromText(create[3], "mockup");
    return `${previewArtifactDisplayName(
      artifactKind,
      1,
      "title",
    )} first: ${create[1]} ${depth ? `${depth} ` : ""}${previewArtifactDisplayName(
      artifactKind,
      2,
      "lower",
    )}`;
  }
  return title;
}

function extractEmptyProjectVisualPlanningRequest(text: string) {
  return extractOriginalRequestForSentinel(
    text,
    "[Codex Empty Project Visual Planning Context]",
  );
}

function extractExistingAppVisualDecisionRequest(text: string) {
  return extractOriginalRequestForSentinel(
    text,
    "[Codex Existing App Visual Decision Context]",
  );
}

function extractExistingAppPreviewFirstRequest(text: string) {
  return extractOriginalRequestForSentinel(
    text,
    "[Codex Existing App Preview First Context]",
  );
}

function extractSavedMockupReviewRequest(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  const sentinel = "[Codex Saved Mockup Review Context]";
  const sentinelIndex = visible.indexOf(sentinel);
  if (sentinelIndex === -1) {
    return "";
  }
  const payload = visible.slice(sentinelIndex);
  const marker = "\n\nUser request:\n";
  const markerIndex = payload.indexOf(marker);
  if (markerIndex === -1) {
    return `Review saved ${previewArtifactDisplayName(
      previewArtifactKindFromText(payload, "mockup"),
      2,
      "lower",
    )}.`;
  }
  return trimInternalContextTail(
    payload.slice(markerIndex + marker.length),
  ).trim();
}

function extractVisualDecisionSelectionRequest(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith("[Codex Visual Decision Selection]")) {
    return "";
  }
  const marker = "\n\nUser-visible composer text:\n";
  const markerIndex = visible.indexOf(marker);
  if (markerIndex === -1) return "Use selected option.";
  return trimInternalContextTail(
    visible.slice(markerIndex + marker.length),
  ).trim();
}

function extractBuildSelectedMockupRequest(text: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith("[Codex Build Selected Mockup]")) {
    return "";
  }
  const marker = "\n\nUser-visible request:\n";
  const markerIndex = visible.indexOf(marker);
  if (markerIndex === -1) return "";
  return trimInternalContextTail(
    visible.slice(markerIndex + marker.length),
  ).trim();
}

function unwrapPlanModeUserRequest(text: string) {
  const visible = text.trimStart();
  const marker = "\n\nUser request:\n";
  if (!visible.startsWith("Plan Mode:") || !visible.includes(marker)) {
    return visible;
  }
  return visible.slice(visible.indexOf(marker) + marker.length);
}

function extractOriginalRequestForSentinel(text: string, sentinel: string) {
  const visible = unwrapPlanModeUserRequest(text).trimStart();
  if (!visible.startsWith(sentinel)) return "";
  const marker = "\n\nOriginal user request:\n";
  const markerIndex = visible.indexOf(marker);
  if (markerIndex === -1) return "";
  return trimInternalContextTail(
    visible.slice(markerIndex + marker.length),
  ).trim();
}

function trimInternalContextTail(text: string) {
  const endMarkers = [
    "Project context explicitly attached by the user:\n",
    "\n\nProject context explicitly attached by the user:\n",
    "Files to inspect if needed:\n",
    "\n\nFiles to inspect if needed:\n",
    "Supporting selected mockup context:\n",
    "\n\nSupporting selected mockup context:\n",
    "Build rules:\n",
    "\n\nBuild rules:\n",
    "Selected preview context:\n",
    "\n\nSelected preview context:\n",
  ];
  const end = endMarkers
    .map((marker) => text.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return end == null ? text : text.slice(0, end);
}

function extractOriginalMockupRequest(text: string) {
  const marker = "Original user request:\n";
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return "";
  const afterMarker = text.slice(markerIndex + marker.length);
  const endMarkers = ["\n\nRules:", "\n\nBuild rules:", "\n\nSelected mockup:"];
  const end = endMarkers
    .map((candidate) => afterMarker.indexOf(candidate))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  return (end == null ? afterMarker : afterMarker.slice(0, end)).trim();
}

function extractRequestedMockupChange(text: string) {
  const marker = "Requested change:\n";
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return "";
  return text.slice(markerIndex + marker.length).trim();
}

function stripInternalEvidenceSurface(text: string) {
  return text
    .replace(
      /(?:^|\n{2,})Evidence surfaces include [\s\S]*?(?=\n{2,}\S|$)/g,
      (match) => (match.startsWith("\n\n") ? "\n\n" : ""),
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function turnErrorMessage(error: { message: string }) {
  try {
    const parsed = JSON.parse(error.message) as {
      error?: { message?: unknown };
      message?: unknown;
    };
    const parsedMessage = parsed.error?.message ?? parsed.message;
    if (typeof parsedMessage === "string" && parsedMessage.trim()) {
      return parsedMessage;
    }
  } catch {
    // Fall back to the raw backend message below.
  }
  return error.message;
}

function activitySummaryLabel(
  durationMs: number | null,
  status: Turn["status"],
  elapsedMs?: number | null,
) {
  if (durationMs && status !== "inProgress")
    return `Worked for ${formatDuration(durationMs)}`;
  if (status === "inProgress") {
    return elapsedMs != null
      ? `Working for ${formatDuration(elapsedMs)}`
      : "Working";
  }
  if (status === "failed") return "Thought process";
  if (status === "interrupted") return "Thought process";
  return "Thought process";
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
