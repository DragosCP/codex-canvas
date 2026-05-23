import { TerminalSquare } from "lucide-react";
import { commandStatusText } from "../itemUtils";
import type { ThreadItem } from "../types";

export function CommandOutputSurface(props: {
  commands: Extract<ThreadItem, { type: "commandExecution" }>[];
  onSelect: (item: Extract<ThreadItem, { type: "commandExecution" }>) => void;
}) {
  return (
    <section className="command-surface">
      <header>
        <div>
          <p className="eyebrow">Read-only</p>
          <h2>Commands</h2>
        </div>
        <small>{props.commands.length}</small>
      </header>
      <div className="command-grid">
        {props.commands.length === 0 && (
          <p className="muted">No commands yet.</p>
        )}
        {props.commands.slice(-4).map((command) => (
          <button
            key={command.id}
            className={command.status}
            onClick={() => props.onSelect(command)}
          >
            <TerminalSquare size={16} />
            <span>{command.command}</span>
            <small>{commandStatusText(command)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
