import {
  Lock,
  MousePointer2,
  Move,
  Plus,
  Square,
  Trash2,
  Unlock,
} from "lucide-react";
import { type PointerEvent, useEffect, useMemo, useState } from "react";
import { createCanvasItem } from "../canvasState";
import type { CanvasItem, CanvasItemState, Project, ProjectCanvas } from "../types";

type DragState = {
  itemId: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  original: CanvasItem;
};

export function CanvasInspector(props: {
  canvas: ProjectCanvas;
  project: Project;
  readOnly: boolean;
  onChange: (canvas: ProjectCanvas) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    props.canvas.items[0]?.id ?? null,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const selectedItem = useMemo(
    () => props.canvas.items.find((item) => item.id === selectedId) ?? null,
    [props.canvas.items, selectedId],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!props.canvas.items.some((item) => item.id === selectedId)) {
      setSelectedId(props.canvas.items[0]?.id ?? null);
    }
  }, [props.canvas.items, selectedId]);

  function commitItems(items: CanvasItem[]) {
    props.onChange({
      ...props.canvas,
      items,
      updatedAt: Date.now(),
    });
  }

  function addItem(state: CanvasItemState) {
    const item = createCanvasItem(state, props.canvas.items.length);
    commitItems([...props.canvas.items, item]);
    setSelectedId(item.id);
  }

  function updateItem(itemId: string, patch: Partial<CanvasItem>) {
    commitItems(
      props.canvas.items.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    );
  }

  function deleteSelected() {
    if (!selectedItem || props.readOnly) return;
    if (selectedItem.state === "current") {
      updateItem(selectedItem.id, { state: "deleted", locked: true });
      return;
    }
    commitItems(props.canvas.items.filter((item) => item.id !== selectedItem.id));
    setSelectedId(null);
  }

  function beginDrag(
    event: PointerEvent<HTMLDivElement>,
    item: CanvasItem,
    mode: DragState["mode"],
  ) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    if (props.readOnly || item.locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      itemId: item.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      original: item,
    });
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const next =
      drag.mode === "move"
        ? {
            x: Math.max(8, drag.original.x + dx),
            y: Math.max(8, drag.original.y + dy),
          }
        : {
            width: Math.max(120, drag.original.width + dx),
            height: Math.max(80, drag.original.height + dy),
          };
    updateItem(drag.itemId, next);
  }

  return (
    <div className="canvas-inspector">
      <section className="canvas-toolbar">
        <div>
          <p className="eyebrow">Project canvas</p>
          <strong>{props.project.name}</strong>
        </div>
        <div className="canvas-toolbar-actions">
          <button disabled={props.readOnly} onClick={() => addItem("current")}>
            <Square size={15} /> Current
          </button>
          <button disabled={props.readOnly} onClick={() => addItem("proposed")}>
            <Plus size={15} /> Proposed
          </button>
        </div>
      </section>

      {props.readOnly && (
        <p className="canvas-lock-note">
          Canvas editing is locked while Codex is working in this project.
        </p>
      )}

      <section
        className="canvas-stage"
        onPointerMove={continueDrag}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onPointerDown={() => setSelectedId(null)}
      >
        <div className="canvas-grid" />
        {props.canvas.items.length === 0 && (
          <div className="canvas-empty">
            <MousePointer2 size={18} />
            <strong>Start mapping this project</strong>
            <span>Add a current area or proposed change.</span>
          </div>
        )}
        {props.canvas.items.map((item) => {
          const selected = item.id === selectedId;
          return (
            <div
              key={item.id}
              className={`canvas-item ${item.state} ${selected ? "selected" : ""} ${
                item.locked ? "locked" : ""
              }`}
              style={{
                transform: `translate(${item.x}px, ${item.y}px)`,
                width: item.width,
                height: item.height,
              }}
              onPointerDown={(event) => beginDrag(event, item, "move")}
              role="button"
              tabIndex={0}
            >
              <div className="canvas-item-header">
                <Move size={13} />
                <strong>{item.title}</strong>
                {item.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </div>
              <p>{item.body}</p>
              <span>{stateLabel(item.state)}</span>
              {!props.readOnly && !item.locked && (
                <div
                  className="canvas-resize-handle"
                  onPointerDown={(event) => beginDrag(event, item, "resize")}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="canvas-properties">
        {selectedItem ? (
          <>
            <div className="canvas-property-header">
              <strong>Selected item</strong>
              <button
                disabled={props.readOnly}
                onClick={deleteSelected}
                title={
                  selectedItem.state === "current"
                    ? "Mark current item as deleted"
                    : "Remove proposed item"
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
            <label>
              <span>Name</span>
              <input
                disabled={props.readOnly || selectedItem.locked}
                value={selectedItem.title}
                onChange={(event) =>
                  updateItem(selectedItem.id, { title: event.target.value })
                }
              />
            </label>
            <label>
              <span>Notes</span>
              <textarea
                disabled={props.readOnly || selectedItem.locked}
                value={selectedItem.body}
                onChange={(event) =>
                  updateItem(selectedItem.id, { body: event.target.value })
                }
              />
            </label>
            <div className="canvas-property-row">
              <label>
                <span>State</span>
                <select
                  disabled={props.readOnly}
                  value={selectedItem.state}
                  onChange={(event) =>
                    updateItem(selectedItem.id, {
                      state: event.target.value as CanvasItemState,
                    })
                  }
                >
                  <option value="current">Current</option>
                  <option value="proposed">Proposed</option>
                  <option value="deleted">Deleted</option>
                </select>
              </label>
              <button
                disabled={props.readOnly}
                onClick={() =>
                  updateItem(selectedItem.id, { locked: !selectedItem.locked })
                }
              >
                {selectedItem.locked ? <Lock size={14} /> : <Unlock size={14} />}
                {selectedItem.locked ? "Locked" : "Unlocked"}
              </button>
            </div>
          </>
        ) : (
          <p className="muted compact">Select a canvas item to edit its label, notes, state, or lock.</p>
        )}
      </section>
    </div>
  );
}

function stateLabel(state: CanvasItemState) {
  switch (state) {
    case "current":
      return "Current";
    case "deleted":
      return "Deleted";
    case "proposed":
      return "Proposed";
  }
}
