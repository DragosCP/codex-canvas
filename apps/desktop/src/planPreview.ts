import type {
  PlanPreviewAreaMark,
  PlanPreviewComponentKind,
  PlanPreviewPlacement,
  PlanPreviewSpec,
  PlanPreviewSessionState,
} from "./types";

const uiWords = /\b(ui|ux|screen|page|view|layout|button|menu|modal|drawer|panel|sidebar|form|input|card|table|list|filter|sort|tab|toolbar|header|footer|nav|navigation|preview|visual|workflow|interaction|click|hover|dropdown|popover|dialog|settings|dashboard)\b/i;
const nonUiWords = /\b(api|backend|server|database|schema|migration|cli|rust|go\s+package|unit\s+test|parser|protocol|auth\s+token|rate\s+limit)\b/i;
const PLAN_PREVIEW_BLOCK_PATTERN =
  /```codex-plan-preview\s*([\s\S]*?)```/gi;

export function shouldOfferPlanPreview(prompt: string, planText = "") {
  const text = `${prompt}\n${planText}`;
  if (/\b(no|without)\s+(ui|visual|preview)\b/i.test(text)) return false;
  if (uiWords.test(text)) return true;
  return !nonUiWords.test(text) && /\b(add|change|improve|make|build|create)\b/i.test(text);
}

export function selectedPlanPreviewVariant(spec: PlanPreviewSpec | null | undefined, id: string | null | undefined) {
  if (!spec) return null;
  return spec.variants.find((variant) => variant.id === id) ?? spec.variants[0] ?? null;
}

export function parsePlanPreviewSpec(text: string): PlanPreviewSpec | null {
  for (const match of text.matchAll(PLAN_PREVIEW_BLOCK_PATTERN)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as Partial<PlanPreviewSpec>;
      const normalized = normalizePlanPreviewSpec(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }
  return null;
}

export function stripPlanPreviewBlocks(text: string) {
  return text
    .replace(PLAN_PREVIEW_BLOCK_PATTERN, "")
    .replace(/```codex-plan-preview[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function planPreviewDecisionSummary(record: {
  previewSpec?: PlanPreviewSpec | null;
  previewSelectedVariantId?: string | null;
  previewAreaMark?: PlanPreviewAreaMark | null;
  previewSession?: PlanPreviewSessionState | null;
}) {
  const variant = selectedPlanPreviewVariant(
    record.previewSpec,
    record.previewSelectedVariantId,
  );
  const lines: string[] = [];
  if (variant) {
    lines.push(
      `Selected live app preview option ${variant.id}: ${variant.title}.`,
      `Placement intent: ${variant.placement}.`,
      `Preview behavior: ${variant.summary}`,
      `Tradeoff: ${variant.tradeoff}`,
    );
  }
  if (record.previewAreaMark) {
    const mark = record.previewAreaMark;
    lines.push(
      `User marked an area at ${Math.round(mark.x)},${Math.round(mark.y)} with size ${Math.round(mark.width)}x${Math.round(mark.height)} inside a ${Math.round(mark.viewportWidth)}x${Math.round(mark.viewportHeight)} preview.`,
    );
    if (mark.route?.trim()) lines.push(`Marked route: ${mark.route.trim()}`);
    if (mark.note.trim()) lines.push(`Marked-area note: ${mark.note.trim()}`);
  }
  if (record.previewSession) {
    const session = record.previewSession;
    lines.push(
      `Preview URL: ${session.previewUrl || session.route}.`,
      `Preview route at decision time: ${session.route}.`,
      `Viewport: ${session.viewport}.`,
      `Temporary interaction state: ${session.interactionState}.`,
      `Preview cleanup status: ${session.cleanupStatus}.`,
    );
  }
  return lines.join("\n");
}

function normalizePlanPreviewSpec(
  value: Partial<PlanPreviewSpec>,
): PlanPreviewSpec | null {
  if (value.version !== 1 || !Array.isArray(value.variants)) return null;
  const variants = value.variants
    .map((variant, index) => {
      if (!variant || typeof variant !== "object") return null;
      const id =
        variant.id === "A" || variant.id === "B" || variant.id === "C"
          ? variant.id
          : index === 0
            ? "A"
            : index === 1
              ? "B"
              : index === 2
                ? "C"
                : null;
      const placement = normalizePlacement(variant.placement);
      const title = cleanText(variant.title, 48);
      const summary = cleanText(variant.summary, 180);
      if (!id || !placement || !title || !summary) return null;
      return {
        id,
        title,
        tradeoff: cleanText(variant.tradeoff, 140),
        placement,
        summary,
        components: Array.isArray(variant.components)
          ? variant.components
              .map((component) => {
                if (!component || typeof component !== "object") return null;
                const kind = normalizeComponentKind(component.kind);
                const label = cleanText(component.label, 80);
                const body = cleanText(component.body, 180);
                if (!kind || !label || !body) return null;
                return {
                  kind,
                  label,
                  body,
                  actionLabel: cleanText(component.actionLabel, 48) || undefined,
                };
              })
              .filter((component): component is NonNullable<typeof component> =>
                Boolean(component),
              )
          : [],
      };
    })
    .filter((variant): variant is NonNullable<typeof variant> => Boolean(variant))
    .slice(0, 3);
  if (variants.length === 0) return null;
  const now = Date.now();
  return {
    version: 1,
    summary: cleanText(value.summary, 180) || "Live app preview options.",
    variants,
    createdAt: positiveNumber(value.createdAt) || now,
    updatedAt: positiveNumber(value.updatedAt) || now,
  };
}

function normalizePlacement(value: unknown): PlanPreviewPlacement | null {
  return value === "topbar" || value === "sidePanel" || value === "modal"
    ? value
    : null;
}

function normalizeComponentKind(value: unknown): PlanPreviewComponentKind | null {
  return value === "button" ||
    value === "panel" ||
    value === "menu" ||
    value === "modal" ||
    value === "input" ||
    value === "badge"
    ? value
    : null;
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1).trimEnd()}...`
    : normalized;
}

function positiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}
