import { Layers3 } from "lucide-react";
import { previewArtifactDisplayName } from "../mockupArtifacts";
import type { MockupPreviewSet } from "../types";

export function MockupOptionStrip(props: {
  previewSet: MockupPreviewSet;
  onOpen: () => void;
  onSelect: (mockupId: string) => void;
}) {
  const selected =
    props.previewSet.mockups.find(
      (mockup) => mockup.id === props.previewSet.selectedMockupId,
    ) ??
    props.previewSet.mockups[0] ??
    null;
  if (!selected) return null;
  return (
    <section
      className="mockup-option-strip"
      aria-label={`Saved ${previewArtifactDisplayName(
        props.previewSet.artifactKind,
        props.previewSet.mockups.length,
        "lower",
      )}`}
    >
      <div className="mockup-option-copy">
        <Layers3 size={15} />
        <div>
          <strong>
            {props.previewSet.mockups.length}{" "}
            {previewArtifactDisplayName(
              props.previewSet.artifactKind,
              props.previewSet.mockups.length,
              "lower",
            )}{" "}
            ready
          </strong>
          <p>{selected.label || selected.id}: {selected.title}</p>
        </div>
      </div>
      <div className="mockup-option-actions">
        <div className="mockup-option-tabs" aria-label="Mockup options">
          {props.previewSet.mockups.map((mockup, index) => (
            <button
              className={mockup.id === selected.id ? "active" : ""}
              key={mockup.id}
              onClick={() => {
                props.onSelect(mockup.id);
                props.onOpen();
              }}
              title={mockup.title}
              type="button"
            >
              {mockup.label || String.fromCharCode(65 + index)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
