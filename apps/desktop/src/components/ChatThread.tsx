import {
  ChevronDown,
  FileText,
  FolderOpen,
  PencilLine,
  RefreshCw,
  TerminalSquare,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { commandStatusText, itemLabel } from "../itemUtils";
import type {
  InspectorSelection,
  LocalChatDraft,
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
  onSelect: (selection: InspectorSelection) => void;
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

  return (
    <div className="turn-list" ref={scrollerRef} onScroll={handleScroll}>
      {props.activeThread.turns.length === 0 && (
        <div className="empty-chat">
          <h2>New chat</h2>
          <p>Ask Codex to inspect, plan, run commands, or edit this project.</p>
        </div>
      )}
      {props.activeThread.turns.map((turn) => (
        <TurnView
          activeProject={activeProject}
          key={turn.id}
          onSelect={props.onSelect}
          turn={turn}
        />
      ))}
    </div>
  );
}

function TurnView(props: {
  activeProject: Project;
  turn: Turn;
  onSelect: (selection: InspectorSelection) => void;
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
        <UserMessageView key={item.id} item={item} />
      ))}
      {props.turn.error && (
        <div className="error-line">{props.turn.error.message}</div>
      )}
      {activityItems.length > 0 && (
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
          key={item.id}
          item={item}
        />
      ))}
      {fileChangeItems.map((item) => (
        <FileChangeView
          activeProject={props.activeProject}
          key={item.id}
          item={item}
          onSelect={props.onSelect}
        />
      ))}
      {props.turn.items.length === 0 && <p className="muted">No output yet</p>}
    </article>
  );
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
  item: Extract<ThreadItem, { type: "userMessage" }>;
}) {
  return (
    <div className="message user-message">
      {props.item.content.map((part, index) =>
        part.type === "text" ? (
          <RichText key={index} text={part.text} />
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
  item: Extract<ThreadItem, { type: "agentMessage" }>;
}) {
  const text = friendlyText(props.item.text, props.activeProject);
  return (
    <div className="message assistant-message">
      {text ? <RichText text={text} /> : <span className="muted">Streaming...</span>}
    </div>
  );
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
    <details className="turn-activity">
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

function activitySummaryLabel(durationMs: number | null, status: Turn["status"]) {
  if (durationMs && status !== "inProgress") return `Worked for ${formatDuration(durationMs)}`;
  if (status === "inProgress") return "Thought process";
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
