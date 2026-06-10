import type {
  PlanPreviewAreaMark,
  PlanPreviewComponent,
  PlanPreviewSpec,
  PlanPreviewVariant,
} from "./types";

const uiWords = /\b(ui|ux|screen|page|view|layout|button|menu|modal|drawer|panel|sidebar|form|input|card|table|list|filter|sort|tab|toolbar|header|footer|nav|navigation|preview|canvas|visual|workflow|interaction|click|hover|dropdown|popover|dialog|settings|dashboard)\b/i;
const nonUiWords = /\b(api|backend|server|database|schema|migration|cli|rust|go\s+package|unit\s+test|parser|protocol|auth\s+token|rate\s+limit)\b/i;

export function shouldOfferPlanPreview(prompt: string, planText = "") {
  const text = `${prompt}\n${planText}`;
  if (/\b(no|without)\s+(ui|visual|preview|canvas)\b/i.test(text)) return false;
  if (uiWords.test(text)) return true;
  return !nonUiWords.test(text) && /\b(add|change|improve|make|build|create)\b/i.test(text);
}

export function createPlanPreviewSpec(
  prompt: string,
  planText = "",
  previous?: PlanPreviewSpec | null,
): PlanPreviewSpec {
  const now = Date.now();
  const feature = featureLabel(prompt, planText);
  const primary = actionLabel(prompt, feature);
  const body = previewBody(prompt, planText);
  return {
    version: 1,
    summary: `Preview options for ${feature}.`,
    variants: [
      previewVariant("A", "Inline action", "Fastest path; keeps the change close to the current workflow.", "topbar", primary, body),
      previewVariant("B", "Focused panel", "Best when the feature needs context, settings, or multiple fields.", "sidePanel", primary, body),
      previewVariant("C", "Guided dialog", "Best for a deliberate multi-step action or confirmation moment.", "modal", primary, body),
    ],
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function selectedPlanPreviewVariant(spec: PlanPreviewSpec | null | undefined, id: string | null | undefined) {
  if (!spec) return null;
  return spec.variants.find((variant) => variant.id === id) ?? spec.variants[0] ?? null;
}

export function planPreviewDecisionSummary(record: {
  previewSpec?: PlanPreviewSpec | null;
  previewSelectedVariantId?: string | null;
  previewAreaMark?: PlanPreviewAreaMark | null;
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
    if (mark.note.trim()) lines.push(`Marked-area note: ${mark.note.trim()}`);
  }
  return lines.join("\n");
}

function previewVariant(
  id: PlanPreviewVariant["id"],
  title: string,
  tradeoff: string,
  placement: PlanPreviewVariant["placement"],
  action: string,
  body: string,
): PlanPreviewVariant {
  return {
    id,
    title,
    tradeoff,
    placement,
    summary:
      placement === "topbar"
        ? "Adds a compact action where the user is already working."
        : placement === "sidePanel"
          ? "Opens a contextual panel without replacing the current screen."
          : "Shows a focused dialog for a clear decision point.",
    components: componentsForPlacement(placement, action, body),
  };
}

function componentsForPlacement(
  placement: PlanPreviewVariant["placement"],
  action: string,
  body: string,
): PlanPreviewComponent[] {
  if (placement === "topbar") {
    return [
      { kind: "button", label: action, body, actionLabel: "Open" },
      { kind: "menu", label: "Quick choices", body: "Primary, secondary, and recovery states are previewed here." },
    ];
  }
  if (placement === "sidePanel") {
    return [
      { kind: "panel", label: action, body },
      { kind: "input", label: "Details", body: "A lightweight field shows where user input or options would live." },
      { kind: "button", label: "Apply", body: "Commits the temporary flow in the preview only." },
    ];
  }
  return [
    { kind: "modal", label: action, body },
    { kind: "button", label: "Continue", body: "Moves to the next temporary state." },
    { kind: "button", label: "Cancel", body: "Returns to the app unchanged." },
  ];
}

function featureLabel(prompt: string, planText: string) {
  const source = prompt.trim() || planText.trim() || "this feature";
  const compact = source
    .replace(/\s+/g, " ")
    .replace(/^please\s+/i, "")
    .replace(/^(add|build|create|make|change|improve)\s+/i, "")
    .slice(0, 42)
    .trim();
  return compact || "this feature";
}

function actionLabel(prompt: string, feature: string) {
  const text = prompt.toLowerCase();
  if (text.includes("settings")) return "Open settings";
  if (text.includes("filter")) return "Filter";
  if (text.includes("sort")) return "Sort";
  if (text.includes("search")) return "Search";
  if (text.includes("export")) return "Export";
  if (text.includes("invite")) return "Invite";
  if (text.includes("create") || text.includes("add")) return "Add";
  const words = feature.split(/\s+/).slice(0, 3).join(" ");
  return words.length > 18 ? "Open" : words || "Open";
}

function previewBody(prompt: string, planText: string) {
  const source = planText.trim() || prompt.trim();
  if (!source) return "Temporary UI preview for the proposed workflow.";
  return source.replace(/\s+/g, " ").slice(0, 150);
}
