import type { ReactNode } from "react";

type RichBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullet"; text: string; marker?: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string };

export function RichText(props: { text: string; className?: string }) {
  const blocks = parseBlocks(props.text);
  if (blocks.length === 0) return null;

  return (
    <div className={`rich-text ${props.className ?? ""}`.trim()}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h3 className="rich-heading" key={index}>
                {renderInline(block.text)}
              </h3>
            );
          }
          if (block.level === 2) {
            return (
              <h4 className="rich-heading" key={index}>
                {renderInline(block.text)}
              </h4>
            );
          }
          return (
            <h5 className="rich-heading" key={index}>
              {renderInline(block.text)}
            </h5>
          );
        }
        if (block.type === "bullet") {
          return (
            <div
              className={`rich-bullet ${block.marker ? "ordered" : ""}`.trim()}
              key={index}
            >
              <span aria-hidden="true">{block.marker}</span>
              <p>{renderInline(block.text)}</p>
            </div>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote className="rich-quote" key={index}>
              {renderInline(block.text)}
            </blockquote>
          );
        }
        if (block.type === "code") {
          return (
            <pre className="rich-code" key={index}>
              <code>{block.text}</code>
            </pre>
          );
        }
        return <p key={index}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

function parseBlocks(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  const lines = text.replace(/\r\n/g, "\n").trimEnd().split("\n");
  let paragraph: string[] = [];
  let code: string[] | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.trim().startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        flushParagraph();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(rawLine);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      blocks.push({ type: "bullet", text: bullet[1] });
      continue;
    }

    const ordered = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      blocks.push({
        type: "bullet",
        marker: `${ordered[1]}.`,
        text: ordered[2],
      });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  if (code) blocks.push({ type: "code", text: code.join("\n") });
  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const token =
    /(\*\*[^*\n][\s\S]*?[^*\n]\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)]+\)|(?:[A-Za-z]:[\\/]|\/mnt\/|\.{0,2}[\\/]|(?:docs|plans|apps|codex-rs|codex-cli|sdk|scripts|tools)[\\/])[\w./\\\-()[\]#@]+)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = token.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    nodes.push(renderToken(match[0], nodes.length));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderToken(value: string, key: number): ReactNode {
  if (value.startsWith("**") && value.endsWith("**")) {
    return (
      <strong className="rich-strong" key={key}>
        {renderInline(value.slice(2, -2))}
      </strong>
    );
  }

  if (value.startsWith("`") && value.endsWith("`")) {
    return (
      <code className="rich-inline-code" key={key}>
        {value.slice(1, -1)}
      </code>
    );
  }

  const link = value.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (link) {
    const [, label, href] = link;
    if (/^https?:\/\//i.test(href)) {
      return (
        <a className="rich-link" href={href} key={key} rel="noreferrer" target="_blank">
          {label}
        </a>
      );
    }
    return (
      <span className="rich-path" key={key} title={href}>
        {label}
      </span>
    );
  }

  const trimmed = value.replace(/[.,;:]+$/, "");
  const suffix = value.slice(trimmed.length);
  return (
    <span key={key}>
      <span className="rich-path" title={trimmed}>
        {trimmed}
      </span>
      {suffix}
    </span>
  );
}
