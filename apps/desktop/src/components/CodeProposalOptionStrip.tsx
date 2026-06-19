import { GitBranch } from "lucide-react";
import type { CodeProposalSet } from "../types";

export function CodeProposalOptionStrip(props: {
  previewSet: CodeProposalSet;
  onOpen: () => void;
  onSelect: (optionId: "A" | "B" | "C") => void;
}) {
  if (props.previewSet.status !== "ready") return null;
  const selected =
    props.previewSet.options.find(
      (option) => option.id === props.previewSet.selectedOptionId,
    ) ??
    props.previewSet.options[0] ??
    null;
  if (!selected) return null;
  const statusLabel =
    props.previewSet.status === "ready"
      ? "ready"
      : props.previewSet.status === "applied"
        ? "applied"
        : props.previewSet.status === "failed"
          ? "needs attention"
          : "generating";
  return (
    <section className="mockup-option-strip" aria-label="Runnable proposals">
      <div className="mockup-option-copy">
        <GitBranch size={15} />
        <div>
          <strong>
            {props.previewSet.options.length} runnable{" "}
            {props.previewSet.options.length === 1 ? "proposal" : "proposals"}{" "}
            {statusLabel}
          </strong>
          <p>
            {selected.id}: {selected.title}
          </p>
        </div>
      </div>
      <div className="mockup-option-actions">
        <div className="mockup-option-tabs" aria-label="Proposal options">
          {props.previewSet.options.map((option) => (
            <button
              className={option.id === selected.id ? "active" : ""}
              key={option.id}
              onClick={() => {
                props.onSelect(option.id);
                props.onOpen();
              }}
              title={option.summary || option.title}
              type="button"
            >
              {option.id}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
