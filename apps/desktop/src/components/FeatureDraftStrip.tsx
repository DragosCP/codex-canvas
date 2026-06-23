import { GitBranch, Pause, Play, Trash2 } from "lucide-react";
import type { FeatureDraft } from "../types";

export function FeatureDraftStrip(props: {
  activeDraftId: string | null;
  drafts: FeatureDraft[];
  onDiscard: (draft: FeatureDraft) => void;
  onOpen: (draft: FeatureDraft) => void;
  onPark: (draft: FeatureDraft) => void;
  onResume: (draft: FeatureDraft) => void;
}) {
  const drafts = props.drafts.filter(
    (draft) =>
      draft.lifecycle === "active" ||
      draft.lifecycle === "parked" ||
      draft.status === "generating",
  );
  if (drafts.length === 0) return null;
  const selected =
    drafts.find((draft) => draft.draftId === props.activeDraftId) ??
    drafts.find((draft) => draft.lifecycle === "active") ??
    drafts[0];
  const active = selected.lifecycle === "active";
  const parked = selected.lifecycle === "parked";

  return (
    <section className="mockup-option-strip" aria-label="Feature drafts">
      <div className="mockup-option-copy">
        <GitBranch size={15} />
        <div>
          <strong>
            {drafts.length === 1 ? "Draft" : `${drafts.length} drafts`}{" "}
            {draftStatusLabel(selected)}
          </strong>
          <p>{selected.name || "Draft"}</p>
        </div>
      </div>
      <div className="mockup-option-actions">
        <div className="mockup-option-tabs" aria-label="Drafts">
          {drafts.map((draft) => (
            <button
              className={draft.draftId === selected.draftId ? "active" : ""}
              key={draft.draftId}
              onClick={() => props.onOpen(draft)}
              title={draft.name || "Draft"}
              type="button"
            >
              {draft.lifecycle === "parked" ? "Parked" : "Draft"}
            </button>
          ))}
        </div>
        {active && (
          <button
            className="ghost-button"
            onClick={() => props.onPark(selected)}
            title="Park this draft"
            type="button"
          >
            <Pause size={15} /> Park
          </button>
        )}
        {parked && (
          <button
            className="ghost-button primary"
            onClick={() => props.onResume(selected)}
            title="Resume this draft"
            type="button"
          >
            <Play size={15} /> Resume
          </button>
        )}
        <button
          className="ghost-button danger"
          onClick={() => props.onDiscard(selected)}
          title="Discard this draft"
          type="button"
        >
          <Trash2 size={15} /> Discard
        </button>
      </div>
    </section>
  );
}

function draftStatusLabel(draft: FeatureDraft) {
  if (draft.lifecycle === "parked") return "parked";
  if (draft.status === "generating" || draft.status === "preparing") {
    return "building";
  }
  if (draft.status === "failed") return "needs attention";
  return "ready";
}
