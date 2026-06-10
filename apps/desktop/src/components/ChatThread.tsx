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
import { type ReactNode, useEffect, useRef, useState } from "react";
import { commandStatusText, itemLabel } from "../itemUtils";
import type {
  CanvasSuggestion,
  InspectorSelection,
  LocalChatDraft,
  PlanProposal,
  Project,
  Thread,
  ThreadItem,
  Turn,
} from "../types";
import { lineCount } from "../utils/format";
import { RichText } from "./RichText";

export function ChatThread(props: {
  activeProject: Project | null;
  activeDraft: LocalChatDraft | null;
  activeThread: Thread | null;
  onAcceptPlanProposal: (proposal: PlanProposal) => void;
  onApplyCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onAskCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onDeclinePlanProposal: (proposal: PlanProposal) => void;
  onDismissCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onModifyPlanProposal: (proposal: PlanProposal, feedback?: string) => void;
  onOpenCanvasSuggestion: (
    suggestion: CanvasSuggestion,
    focusReference?: string | null,
  ) => void;
  onOpenPlanProposalCanvas: (
    proposal: PlanProposal,
    focusReference?: string | null,
  ) => void;
  onPlanProposalFeedbackChange: (turnId: string, value: string) => void;
  onResetCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onShowPlanUiImpact: (proposal: PlanProposal) => void;
  onUpdateCanvasFromPlanProposal: (proposal: PlanProposal) => void;
  onSelect: (selection: InspectorSelection) => void;
  canvasSuggestions: Record<string, CanvasSuggestion>;
  planProposalFeedbackDrafts: Record<string, string>;
  planProposals: Record<string, PlanProposal>;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

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
  const implementationPlanProposals = implementationPlanProposalsByTurn(
    activeThread.turns,
    props.planProposals,
  );

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
          onApplyCanvasSuggestion={props.onApplyCanvasSuggestion}
          onAskCanvasSuggestion={props.onAskCanvasSuggestion}
          onDeclinePlanProposal={props.onDeclinePlanProposal}
          onDismissCanvasSuggestion={props.onDismissCanvasSuggestion}
          onModifyPlanProposal={props.onModifyPlanProposal}
          onOpenCanvasSuggestion={props.onOpenCanvasSuggestion}
          onOpenPlanProposalCanvas={props.onOpenPlanProposalCanvas}
          onPlanProposalFeedbackChange={props.onPlanProposalFeedbackChange}
          onResetCanvasSuggestion={props.onResetCanvasSuggestion}
          onShowPlanUiImpact={props.onShowPlanUiImpact}
          onUpdateCanvasFromPlanProposal={props.onUpdateCanvasFromPlanProposal}
          onSelect={props.onSelect}
          canvasSuggestion={props.canvasSuggestions[turn.id] ?? null}
          planProposalFeedbackDraft={props.planProposalFeedbackDrafts[turn.id]}
          planProposal={props.planProposals[turn.id] ?? null}
          implementationPlanProposal={
            implementationPlanProposals.get(turn.id) ?? null
          }
          threadActive={activeThread.status.type === "active"}
          turn={turn}
        />
      ))}
    </div>
  );
}

function TurnView(props: {
  activeProject: Project;
  turn: Turn;
  onAcceptPlanProposal: (proposal: PlanProposal) => void;
  onApplyCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onAskCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onDeclinePlanProposal: (proposal: PlanProposal) => void;
  onDismissCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onModifyPlanProposal: (proposal: PlanProposal, feedback?: string) => void;
  onOpenCanvasSuggestion: (
    suggestion: CanvasSuggestion,
    focusReference?: string | null,
  ) => void;
  onOpenPlanProposalCanvas: (
    proposal: PlanProposal,
    focusReference?: string | null,
  ) => void;
  onPlanProposalFeedbackChange: (turnId: string, value: string) => void;
  onResetCanvasSuggestion: (suggestion: CanvasSuggestion) => void;
  onShowPlanUiImpact: (proposal: PlanProposal) => void;
  onUpdateCanvasFromPlanProposal: (proposal: PlanProposal) => void;
  onSelect: (selection: InspectorSelection) => void;
  canvasSuggestion: CanvasSuggestion | null;
  implementationPlanProposal: PlanProposal | null;
  planProposalFeedbackDraft?: string;
  planProposal: PlanProposal | null;
  threadActive: boolean;
}) {
  const userItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "userMessage" }> =>
      item.type === "userMessage",
  );
  const finalItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "agentMessage" }> =>
      item.type === "agentMessage" &&
      (item.phase === "final_answer" || item.phase === null),
  );
  const activityItems = props.turn.items.filter(isActivityItem);
  const compactionItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "contextCompaction" }> =>
      item.type === "contextCompaction",
  );
  const fileChangeItems = props.turn.items.filter(
    (item): item is Extract<ThreadItem, { type: "fileChange" }> =>
      item.type === "fileChange",
  );

  return (
    <article className={`turn-card ${props.turn.status}`}>
      {userItems.map((item) => (
        <UserMessageView
          activeProject={props.activeProject}
          key={item.id}
          item={item}
        />
      ))}
      {props.turn.error && (
        <div className="error-line">{turnErrorMessage(props.turn.error)}</div>
      )}
      {(activityItems.length > 0 || props.turn.status === "inProgress") && (
        <TurnActivity
          activeProject={props.activeProject}
          durationMs={props.turn.durationMs}
          items={activityItems}
          status={props.turn.status}
        />
      )}
      {compactionItems.map((item) => (
        <ContextCompactionDivider key={item.id} />
      ))}
      {finalItems.map((item) => (
        <AssistantMessageView
          activeProject={props.activeProject}
          canvasSuggestion={props.canvasSuggestion}
          key={item.id}
          item={item}
          planProposal={props.planProposal}
        />
      ))}
      {props.planProposal &&
        finalItems.length > 0 &&
        shouldShowPlanProposalReview(props.planProposal) && (
          <PlanProposalReview
            proposal={props.planProposal}
            onAccept={props.onAcceptPlanProposal}
            onDecline={props.onDeclinePlanProposal}
            onModify={props.onModifyPlanProposal}
            onOpenCanvas={props.onOpenPlanProposalCanvas}
            onOpenPreview={props.onShowPlanUiImpact}
            onUpdateCanvas={props.onUpdateCanvasFromPlanProposal}
            canUpdateCanvas={!props.threadActive}
            threadActive={props.threadActive}
            feedbackDraft={props.planProposalFeedbackDraft ?? ""}
            onFeedbackChange={(value) =>
              props.onPlanProposalFeedbackChange(
                props.planProposal?.turnId ?? "",
                value,
              )
            }
          />
        )}
      {props.canvasSuggestion &&
        props.canvasSuggestion.status !== "pending" &&
        finalItems.length > 0 && (
          <CanvasSuggestionReview
            suggestion={props.canvasSuggestion}
            onApply={props.onApplyCanvasSuggestion}
            onAskCodex={props.onAskCanvasSuggestion}
            onDismiss={props.onDismissCanvasSuggestion}
            onOpenCanvas={props.onOpenCanvasSuggestion}
            onReset={props.onResetCanvasSuggestion}
          />
        )}
      {fileChangeItems.map((item) => (
        <FileChangeView
          activeProject={props.activeProject}
          key={item.id}
          item={item}
          onSelect={props.onSelect}
        />
      ))}
      {props.implementationPlanProposal && finalItems.length > 0 && (
        <PlanImplementationActions
          proposal={props.implementationPlanProposal}
          onOpenCanvas={props.onOpenPlanProposalCanvas}
          onUpdateCanvas={props.onUpdateCanvasFromPlanProposal}
          canUpdateCanvas={!props.threadActive}
          threadActive={props.threadActive}
        />
      )}
      {props.turn.items.length === 0 && <p className="muted">No output yet</p>}
    </article>
  );
}

function implementationPlanProposalsByTurn(
  turns: Turn[],
  proposals: Record<string, PlanProposal>,
) {
  const result = new Map<string, PlanProposal>();
  let latestAcceptedPlan: PlanProposal | null = null;
  for (const turn of turns) {
    const proposal = proposals[turn.id];
    if (proposal?.status === "accepted") {
      latestAcceptedPlan = proposal;
    }
    if (
      latestAcceptedPlan &&
      turn.id !== latestAcceptedPlan.turnId &&
      isAcceptedPlanImplementationTurn(turn)
    ) {
      result.set(turn.id, latestAcceptedPlan);
    }
  }
  return result;
}

function isAcceptedPlanImplementationTurn(turn: Turn) {
  return turn.items.some((item) => {
    if (item.type !== "userMessage") return false;
    return item.content.some(
      (part) =>
        part.type === "text" &&
        part.text.trim().startsWith("I accept this plan. Implement it now"),
    );
  });
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
      {props.item.content.map((part, index) =>
        part.type === "text" ? (
          <RichText
            key={index}
            text={friendlyUserText(part.text, props.activeProject)}
          />
        ) : (
          <p className="attachment-note" key={index}>
            {attachmentLabel(part)}
          </p>
        ),
      )}
    </div>
  );
}

function attachmentLabel(part: Extract<ThreadItem, { type: "userMessage" }>["content"][number]) {
  if ("path" in part) return `Added ${basename(part.path)}`;
  if ("url" in part) return "Added image";
  return "Added file";
}

function AssistantMessageView(props: {
  activeProject: Project;
  canvasSuggestion: CanvasSuggestion | null;
  item: Extract<ThreadItem, { type: "agentMessage" }>;
  planProposal: PlanProposal | null;
}) {
  const text = friendlyText(props.item.text, props.activeProject);
  const visibleText = friendlyCanvasProposalText(
    text,
    props.canvasSuggestion,
    props.planProposal,
  );
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
  canUpdateCanvas: boolean;
  onAccept: (proposal: PlanProposal) => void;
  onDecline: (proposal: PlanProposal) => void;
  onFeedbackChange: (value: string) => void;
  onModify: (proposal: PlanProposal, feedback?: string) => void;
  onOpenCanvas: (proposal: PlanProposal) => void;
  onOpenPreview: (proposal: PlanProposal) => void;
  threadActive: boolean;
  onUpdateCanvas: (proposal: PlanProposal) => void;
}) {
  const pending = props.proposal.status === "pending";
  const title = planProposalTitle(props.proposal);
  const [decision, setDecision] = useState<"accept" | "revise">("accept");
  const feedbackText = props.feedbackDraft.trim();
  const hasAttachedCanvasEdits = Boolean(props.proposal.canvasUserEditedAt);
  useEffect(() => {
    if (props.feedbackDraft.trim()) setDecision("revise");
  }, [props.feedbackDraft]);
  const acceptLabel =
    props.proposal.proposalKind === "safer_alternative"
      ? "Yes, implement safer plan"
      : "Yes, implement this plan";
  const canShowPendingCanvasImpact =
    pending && hasPlanUiImpact(props.proposal);
  function submitDecision() {
    if (decision === "accept") {
      props.onAccept(props.proposal);
      return;
    }
    if (!feedbackText && !hasAttachedCanvasEdits) return;
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
              {hasAttachedCanvasEdits && (
                <small className="plan-decision-chip">Includes Canvas edits</small>
              )}
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
            </label>
          </div>
          {canShowPendingCanvasImpact && (
            <div className="plan-decision-inspect">
              <button
                data-testid="plan-show-canvas-impact"
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
          {hasAttachedCanvasEdits && (
            <div className="plan-decision-inspect">
              <span className="plan-decision-note">Canvas edits attached</span>
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
                decision === "revise" && !feedbackText && !hasAttachedCanvasEdits
              }
              type="button"
              onClick={submitDecision}
            >
              <span>Submit</span>
              <Check size={14} />
            </button>
          </div>
        </div>
      ) : (
        <PlanProposalCompleteActions
          proposal={props.proposal}
          onOpenCanvas={props.onOpenCanvas}
          onUpdateCanvas={props.onUpdateCanvas}
          canUpdateCanvas={props.canUpdateCanvas}
          showActions={false}
          threadActive={props.threadActive}
        />
      )}
    </div>
  );
}

function PlanImplementationActions(props: {
  proposal: PlanProposal;
  canUpdateCanvas: boolean;
  onOpenCanvas: (proposal: PlanProposal) => void;
  onUpdateCanvas: (proposal: PlanProposal) => void;
  threadActive: boolean;
}) {
  const canOfferCanvasUpdate =
    props.proposal.status === "accepted" &&
    hasPlanUiImpact(props.proposal) &&
    !props.proposal.canvasUpdatedAt &&
    props.canUpdateCanvas;
  const canOpenSavedDraft =
    props.proposal.status !== "pending" && hasPlanUiImpact(props.proposal);
  if (!canOfferCanvasUpdate && !canOpenSavedDraft) return null;
  return (
    <div className="plan-proposal-review implementation-actions">
      <PlanProposalCompleteActions {...props} showActions />
    </div>
  );
}

function PlanProposalCompleteActions(props: {
  proposal: PlanProposal;
  canUpdateCanvas: boolean;
  onOpenCanvas: (proposal: PlanProposal) => void;
  onUpdateCanvas: (proposal: PlanProposal) => void;
  showActions: boolean;
  threadActive: boolean;
}) {
  const canOfferCanvasUpdate =
    props.proposal.status === "accepted" &&
    hasPlanUiImpact(props.proposal) &&
    !props.proposal.canvasUpdatedAt &&
    props.canUpdateCanvas;
  const canOpenSavedDraft =
    props.proposal.status !== "pending" && hasPlanUiImpact(props.proposal);
  if (!props.showActions) return null;
  return (
    <div className="plan-proposal-complete">
      {canOpenSavedDraft && (
        <button
          className="plan-proposal-update-canvas"
          data-testid="plan-open-saved-draft"
          onClick={() => props.onOpenCanvas(props.proposal)}
          type="button"
        >
          View Canvas
        </button>
      )}
      {canOfferCanvasUpdate && (
        <button
          className="plan-proposal-update-canvas"
          data-testid="plan-update-canvas"
          onClick={() => props.onUpdateCanvas(props.proposal)}
          type="button"
        >
          Update Canvas
        </button>
      )}
    </div>
  );
}

export function CanvasSuggestionReview(props: {
  suggestion: CanvasSuggestion;
  onApply: (suggestion: CanvasSuggestion) => void;
  onAskCodex: (suggestion: CanvasSuggestion) => void;
  onDismiss: (suggestion: CanvasSuggestion) => void;
  onOpenCanvas: (
    suggestion: CanvasSuggestion,
    focusReference?: string | null,
  ) => void;
  onReset: (suggestion: CanvasSuggestion) => void;
  surface?: "inline" | "strip";
}) {
  const pending = props.suggestion.status === "pending";
  const canOpenCanvas = Boolean(props.suggestion.canvasProposalSnapshot);
  const edited = Boolean(props.suggestion.canvasUserEditedAt);
  const canReset = edited && Boolean(props.suggestion.canvasDraftBaseSnapshot);
  return (
    <div
      className={`plan-proposal-review canvas-suggestion-review ${
        props.surface === "strip" ? "review-strip" : "inline"
      } ${props.suggestion.status}`}
    >
      <div className="plan-proposal-copy">
        <strong>{canvasSuggestionTitle(props.suggestion)}</strong>
        <span>
          {renderCanvasReviewText(
            props.suggestion,
            (reference) => props.onOpenCanvas(props.suggestion, reference),
            isGeneratedCurrentUiMockupPrompt(props.suggestion.prompt)
              ? generatedCanvasSuggestionText(props.suggestion)
              : null,
          )}
        </span>
      </div>
      {pending ? (
        <div className="plan-proposal-actions" aria-label="Canvas draft">
          {canOpenCanvas && (
            <button
              type="button"
              onClick={() => props.onOpenCanvas(props.suggestion)}
              title="Open draft"
            >
              <PanelRightOpen size={14} />
              <span>UI</span>
            </button>
          )}
          {canReset && (
            <button
              type="button"
              onClick={() => props.onReset(props.suggestion)}
              title="Reset draft edits"
            >
              <RefreshCw size={14} />
              <span>Reset</span>
            </button>
          )}
          {edited && (
            <button
              type="button"
              onClick={() => props.onAskCodex(props.suggestion)}
              title="Ask Codex about these draft edits"
            >
              <PencilLine size={14} />
              <span>Ask</span>
            </button>
          )}
          <button
            className="plan-proposal-accept"
            type="button"
            onClick={() => props.onApply(props.suggestion)}
            disabled={props.suggestion.canvasProposalParseStatus !== "parsed"}
          >
            <Check size={14} />
            <span>{edited ? "Apply edits" : "Apply"}</span>
          </button>
          <button type="button" onClick={() => props.onDismiss(props.suggestion)}>
            <X size={14} />
            <span>Dismiss</span>
          </button>
        </div>
      ) : (
        <span className="plan-proposal-status">
          {canvasSuggestionStatusText(props.suggestion.status)}
        </span>
      )}
    </div>
  );
}

function shouldShowPlanProposalReview(proposal: PlanProposal) {
  if (isNoPlanProposalRequest(proposal.prompt)) return false;
  if (isReadOnlyPlanningNoteRequest(proposal.prompt)) return false;
  if (proposal.status !== "pending") {
    return hasPlanUiImpact(proposal) || proposal.status !== "superseded";
  }
  return (
    proposal.canvasProposalParseStatus === "pending" ||
    proposal.canvasProposalParseStatus === "parsed" ||
    proposal.canvasProposalParseStatus === "empty"
  );
}

function hasPlanUiImpact(proposal: PlanProposal) {
  if (isNoUiCanvasRequest(proposal.prompt)) return false;
  if (proposal.previewSpec?.variants.length) return true;
  return Boolean(
    proposal.canvasProposalSnapshot &&
      (proposal.canvasProposalChangeCount > 0 || proposal.canvasUserEditedAt),
  );
}

function planProposalTitle(proposal: PlanProposal) {
  return proposal.proposalKind === "safer_alternative"
    ? "Safer plan"
    : "Plan";
}

function planReviewText(proposal: PlanProposal) {
  if (proposal.previewSpec?.variants.length) {
    return proposal.previewSpec.variants.length > 1
      ? "Live app preview options ready."
      : "Live app preview ready.";
  }
  if (hasPlanUiImpact(proposal)) return canvasReviewText(proposal);
  if (isNoUiCanvasRequest(proposal.prompt)) return "Text-only plan. No Canvas draft attached.";
  if (proposal.canvasProposalParseStatus === "pending") {
    return "Looking for any useful Canvas draft.";
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
  if (
    /\bdo\s+not\s+edit\s+files\b/.test(text) &&
    /\bdo\s+not\s+propose\s+canvas\s+changes\b/.test(text)
  ) {
    return true;
  }
  const asksForChange =
    /\b(add|build|create|implement|change|move|update|wire|design|propose|proposal|feature|route|page|button|panel|menu|workflow)\b/.test(
      text,
    );
  return !asksForChange;
}

function isNoUiCanvasRequest(prompt: string) {
  const text = prompt.toLowerCase();
  return (
    /\bno\s+(?:ui|visual|layout|canvas)\s+changes?\b/.test(text) ||
    /\bwith\s+no\s+(?:ui|visual|layout|canvas)\s+changes?\b/.test(text) ||
    /\bdo\s+not\s+propose\s+canvas\s+changes?\b/.test(text) ||
    /\bdo\s+not\s+create\s+(?:a\s+)?(?:ui|visual|canvas)\s+draft\b/.test(text)
  );
}

function canvasSuggestionStatusText(status: CanvasSuggestion["status"]) {
  if (status === "applied") return "Applied";
  return "Dismissed";
}

function canvasSuggestionTitle(suggestion: CanvasSuggestion) {
  if (suggestion.canvasUserEditedAt) return "Edited draft";
  return isGeneratedCurrentUiMockupPrompt(suggestion.prompt)
    ? "Generated draft"
    : "Draft";
}

function generatedCanvasSuggestionText(suggestion: CanvasSuggestion) {
  if (suggestion.canvasProposalParseStatus === "parsed") {
    return generatedCanvasDraftSummary(suggestion.canvasProposalSnapshot);
  }
  if (suggestion.canvasProposalParseStatus === "pending") {
    return "Waiting for generated Canvas draft.";
  }
  if (suggestion.canvasProposalParseStatus === "failed") {
    return "Generated Canvas draft could not be parsed cleanly.";
  }
  if (suggestion.canvasProposalParseStatus === "empty") {
    return "No generated Canvas draft was returned.";
  }
  return "Review the generated Canvas draft before applying it.";
}

function generatedCanvasDraftSummary(snapshot: CanvasSuggestion["canvasProposalSnapshot"]) {
  if (!snapshot) return "Generated Canvas draft captured.";
  const visibleItems = snapshot.items.filter((item) => item.visible !== false);
  const pageIds = new Set(
    visibleItems
      .map((item) => item.pageId)
      .filter((pageId): pageId is string => Boolean(pageId)),
  );
  const pages = pageIds.size > 0 ? pageIds.size : snapshot.pages.length;
  const pageText = `${pages} page${pages === 1 ? "" : "s"}`;
  const itemText = `${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}`;
  return `Draft ready: ${itemText} across ${pageText}.`;
}

type CanvasReviewRecord = Pick<
  PlanProposal | CanvasSuggestion,
  | "canvasStatus"
  | "canvasProposalParseStatus"
  | "canvasSummary"
  | "canvasProposalSummary"
  | "canvasProposalSnapshot"
>;

function canvasReviewText(record: CanvasReviewRecord) {
  if (record.canvasStatus === "not_attached") {
    return "Canvas had no usable data for this response.";
  }
  if (record.canvasProposalParseStatus === "parsed") {
    return `${record.canvasSummary}. ${record.canvasProposalSummary}`;
  }
  if (record.canvasProposalParseStatus === "pending") {
    return `${record.canvasSummary}. Looking for visual changes.`;
  }
  if (record.canvasProposalParseStatus === "empty") {
    return `${record.canvasSummary}. No parseable canvas changes returned.`;
  }
  if (record.canvasProposalParseStatus === "failed") {
    return `${record.canvasSummary}. Canvas draft could not be parsed cleanly.`;
  }
  return record.canvasSummary;
}

const CANVAS_REFERENCE_PATTERN = /\b[BCDTMG][1-9]\d*\b/g;

function renderCanvasReviewText(
  record: CanvasReviewRecord,
  onOpenReference: (reference: string) => void,
  textOverride: string | null = null,
) {
  const text = textOverride ?? canvasReviewText(record);
  const references = canvasReviewReferences(record);
  if (references.size === 0) return text;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CANVAS_REFERENCE_PATTERN)) {
    const rawReference = match[0];
    const index = match.index ?? 0;
    const reference = rawReference.toUpperCase();
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }
    if (references.has(reference)) {
      parts.push(
        <button
          className="plan-reference-button"
          key={`${reference}-${index}`}
          onClick={() => onOpenReference(reference)}
          title={`Open ${reference} in Canvas`}
          type="button"
        >
          {rawReference}
        </button>,
      );
    } else {
      parts.push(rawReference);
    }
    lastIndex = index + rawReference.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

function canvasReviewReferences(record: CanvasReviewRecord) {
  const references = new Set<string>();
  record.canvasProposalSnapshot?.items.forEach((item) => {
    references.add(item.reference.toUpperCase());
  });
  record.canvasProposalSnapshot?.groups.forEach((group) => {
    references.add(group.reference.toUpperCase());
  });
  return references;
}

function friendlyCanvasProposalText(
  text: string,
  suggestion: CanvasSuggestion | null,
  proposal: PlanProposal | null,
) {
  const withoutProposal = stripCanvasProposalBlocks(text);
  const compact = withoutProposal.trim();
  const record = suggestion ?? proposal;
  if (record?.canvasProposalParseStatus === "parsed") {
    if (!compact || isGenericGeneratedCanvasCapture(compact)) {
      return suggestion && isGeneratedCurrentUiMockupPrompt(suggestion.prompt)
        ? "Generated a current interface draft. Review it above the composer."
        : "Captured a Canvas proposal. Review it below.";
    }
  }
  return compact;
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
  status: Turn["status"];
}) {
  return (
    <details className={`turn-activity ${props.status}`}>
      <summary>
        <span>{activitySummaryLabel(props.durationMs, props.status)}</span>
        <ChevronDown className="details-chevron" size={14} />
      </summary>
      <div className="turn-activity-body">
        {activityNodes(props.items, props.activeProject)}
      </div>
    </details>
  );
}

function activityNodes(items: ActivityItem[], activeProject: Project) {
  const nodes = [];
  let commandGroup: Extract<ThreadItem, { type: "commandExecution" }>[] = [];
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
    nodes.push(
      <ActivityLine
        activeProject={activeProject}
        key={item.id}
        item={item}
      />,
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

function ActivityLine(props: {
  activeProject: Project;
  item: Exclude<ActivityItem, Extract<ThreadItem, { type: "commandExecution" }>>;
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
    return <RichText text={item.text} />;
  }
  if (item.type === "reasoning") {
    return item.summary.concat(item.content).map((line, index) => (
      <RichText key={index} text={line} />
    ));
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
          <div key={command.id} className={`command-activity-line ${command.status}`}>
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

function isActivityItem(item: ThreadItem): item is ActivityItem {
  if (item.type === "agentMessage") return item.phase === "commentary";
  return (
    item.type === "commandExecution" ||
    item.type === "fileChange" ||
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

function compactCommand(command: string) {
  return command.length > 96 ? `${command.slice(0, 93)}...` : command;
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function splitVisibleChanges(item: Extract<ThreadItem, { type: "fileChange" }>) {
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

function diffLineCounts(diff: string) {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) additions += 1;
    if (line.startsWith("-")) deletions += 1;
  }
  if (additions === 0 && deletions === 0) {
    return { additions: Math.max(0, lineCount(diff)), deletions: 0 };
  }
  return { additions, deletions };
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
  return stripInternalEvidenceSurface(text).replace(
    new RegExp(escapedProjectPath, "g"),
    ".",
  );
}

function friendlyUserText(text: string, activeProject: Project) {
  return friendlyText(stripHiddenPromptContext(text), activeProject);
}

function stripHiddenPromptContext(text: string) {
  let visible = text.trim();
  if (isGeneratedCurrentUiMockupPrompt(visible)) {
    return GENERATED_MOCKUP_USER_TEXT;
  }
  const userRequestMarker = "\n\nUser request:\n";
  if (visible.startsWith("Plan Mode:") && visible.includes(userRequestMarker)) {
    visible = visible.slice(
      visible.indexOf(userRequestMarker) + userRequestMarker.length,
    );
  }
  for (const marker of [
    "\n\nProject Canvas for this plan:\n",
    "\n\nProject Canvas attached by the user:\n",
    "\n\nProject context explicitly attached by the user:\n",
    "\n\nFiles to inspect if needed:\n",
  ]) {
    const index = visible.indexOf(marker);
    if (index !== -1) visible = visible.slice(0, index);
  }
  return visible.trim();
}

const GENERATED_MOCKUP_USER_TEXT = "Generate current interface mockup.";

function isGeneratedCurrentUiMockupPrompt(text: string) {
  return text
    .trimStart()
    .startsWith(
      "Inspect this local project and generate a low-fidelity current interface Canvas mockup.",
    );
}

function stripCanvasProposalBlocks(text: string) {
  const stripped = text
    .replace(/```canvas-proposal[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, (block) => {
      const body = block
        .replace(/^```[^\n]*\n?/, "")
        .replace(/```$/, "")
        .trim();
      return isCanvasProposalPayload(body) ? "" : block;
    });
  return stripLooseCanvasProposalLines(stripped)
    .replace(/^\s*(?:#{1,6}\s*)?(?:\*\*)?Canvas proposal(?:\*\*)?\s*:?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripLooseCanvasProposalLines(text: string) {
  const lines = text.split(/\r?\n/);
  const proposalLineCount = lines.filter(isLikelyCanvasProposalLine).length;
  if (proposalLineCount < 3) return text;
  return lines.filter((line) => !isLikelyCanvasProposalLine(line)).join("\n");
}

function isCanvasProposalPayload(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const proposalLineCount = lines.filter(isLikelyCanvasProposalLine).length;
  if (proposalLineCount >= 2) return true;
  return (
    proposalLineCount === 1 &&
    /\b(state|grid|xywh|norm|bounds)=/i.test(text) &&
    /\b(create|current|proposed|deleted)\b/i.test(text)
  );
}

function isLikelyCanvasProposalLine(line: string) {
  const cleaned = line
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
  if (!cleaned) return false;
  if (/^(create|new|add)\s+(container|button|text|modal|divider|card|input|header|toolbar|row|dropdown|icon)\b/i.test(cleaned)) {
    return /\b(state|page|grid|xywh|norm|label|title)=/i.test(cleaned);
  }
  if (/^(delete|remove|mark\s+deleted)\b/i.test(cleaned)) {
    return /\b[BCDTMG][1-9]\d*\b/i.test(cleaned);
  }
  if (/^[BCDTMG][1-9]\d*\b/i.test(cleaned)) {
    return /\b(state|xywh|grid|norm|bounds|x|y|w|h|width|height)=/i.test(cleaned);
  }
  return false;
}

function isGenericGeneratedCanvasCapture(text: string) {
  return /^Generated (?:Canvas|a current (?:interface|UI)) draft captured\.?$/i.test(
    text.trim(),
  );
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

function activitySummaryLabel(durationMs: number | null, status: Turn["status"]) {
  if (durationMs && status !== "inProgress") return `Worked for ${formatDuration(durationMs)}`;
  if (status === "inProgress") return "Thinking";
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
