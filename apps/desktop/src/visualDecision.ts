export type VisualDecisionOption = {
  id: string;
  label: string;
  description: string;
  prompt: string;
};

export type VisualDecisionStrip = {
  title: string;
  summary: string;
  options: VisualDecisionOption[];
};

const DECISION_BLOCK_PATTERN =
  /```codex-decision-strip\s*([\s\S]*?)```/gi;

export function parseVisualDecisionStrip(
  text: string,
): VisualDecisionStrip | null {
  for (const raw of decisionJsonCandidates(text)) {
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<VisualDecisionStrip>;
      const title = cleanText(parsed.title, 80) || "Choose next step";
      const summary = cleanText(parsed.summary, 180);
      const options = Array.isArray(parsed.options)
        ? parsed.options
            .map((option, index) => normalizeOption(option, index))
            .filter((option): option is VisualDecisionOption => Boolean(option))
            .slice(0, 4)
        : [];
      if (options.length === 0) continue;
      return { title, summary, options };
    } catch {
      continue;
    }
  }
  return null;
}

export function stripVisualDecisionBlocks(text: string) {
  return stripLooseDecisionJson(
    text
      .replace(DECISION_BLOCK_PATTERN, "")
      .replace(/```codex-decision-strip[\s\S]*$/i, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeOption(
  value: unknown,
  index: number,
): VisualDecisionOption | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = cleanText(record.label, 48);
  const prompt = cleanText(record.prompt, 2000);
  if (!label || !prompt) return null;
  return {
    id: cleanText(record.id, 40) || `option-${index + 1}`,
    label,
    description: cleanText(record.description, 140),
    prompt,
  };
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}...`
    : normalized;
}

function stripLooseDecisionJson(text: string) {
  const start = firstLooseDecisionJsonStart(text);
  if (start === -1) return text;
  const json = text.slice(start).trim();
  if (!looksLikeDecisionJson(json) && !looksLikePartialDecisionJson(json)) {
    return text;
  }
  return text.slice(0, start).trimEnd();
}

function decisionJsonCandidates(text: string) {
  const candidates: string[] = [];
  for (const match of text.matchAll(DECISION_BLOCK_PATTERN)) {
    const raw = match[1]?.trim();
    if (raw) candidates.push(raw);
  }
  const loose = looseDecisionJsonCandidate(text);
  if (loose) candidates.push(loose);
  return candidates;
}

function looseDecisionJsonCandidate(text: string) {
  const start = firstLooseDecisionJsonStart(text);
  if (start === -1) return "";
  const tail = text.slice(start);
  const end = tail.lastIndexOf("}");
  if (end === -1) return "";
  const candidate = tail.slice(0, end + 1).trim();
  return looksLikeDecisionJson(candidate) ? candidate : "";
}

function firstLooseDecisionJsonStart(text: string) {
  const titleIndex = text.search(/\{\s*["']title["']\s*:/);
  const optionsIndex = text.search(/\{\s*["']options["']\s*:/);
  if (titleIndex === -1) return optionsIndex;
  if (optionsIndex === -1) return titleIndex;
  return Math.min(titleIndex, optionsIndex);
}

function looksLikeDecisionJson(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('"options"') &&
    normalized.includes('"prompt"') &&
    normalized.includes('"label"') &&
    /\b(build-direct|wireframe|mockup|show wireframes|show mockups|build directly)\b/i.test(
      value,
    )
  );
}

function looksLikePartialDecisionJson(value: string) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('"title"') &&
    (normalized.includes('"options"') || normalized.includes('"summary"'))
  );
}
