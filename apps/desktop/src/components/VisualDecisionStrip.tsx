import { Check, Layers3, X } from "lucide-react";
import type { VisualDecisionOption, VisualDecisionStrip } from "../visualDecision";

export function VisualDecisionStripView(props: {
  decision: VisualDecisionStrip;
  onDismiss: () => void;
  onSelect: (option: VisualDecisionOption) => void;
}) {
  return (
    <section className="visual-decision-strip" aria-label="Choose next step">
      <div className="visual-decision-header">
        <div className="visual-decision-copy">
          <span className="visual-decision-icon">
            <Layers3 size={15} />
          </span>
          <div>
            <strong>{props.decision.title}</strong>
            {props.decision.summary && <p>{props.decision.summary}</p>}
          </div>
        </div>
        <button
          className="visual-decision-dismiss"
          onClick={props.onDismiss}
          title="Dismiss choices"
          type="button"
        >
          <X size={15} />
        </button>
      </div>
      <div className="visual-decision-options">
        {props.decision.options.map((option) => (
          <button
            className="visual-decision-option"
            key={option.id}
            onClick={() => props.onSelect(option)}
            title={option.description || option.label}
            type="button"
          >
            <Check size={14} />
            <span className="visual-decision-option-copy">
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
