import type { CanvasItem, CanvasItemState, Project, ProjectCanvas } from "./types";

export function createProjectCanvas(project: Project): ProjectCanvas {
  return {
    projectId: project.id,
    items: [],
    updatedAt: Date.now(),
  };
}

export function createCanvasItem(
  state: CanvasItemState,
  index: number,
): CanvasItem {
  const proposed = state === "proposed";
  return {
    id: crypto.randomUUID(),
    kind: "container",
    title: proposed ? "Proposed change" : "Current area",
    body: proposed
      ? "Describe what should change here."
      : "Describe what exists in the project today.",
    x: 48 + index * 28,
    y: 52 + index * 24,
    width: 220,
    height: 132,
    state,
    locked: state === "current",
  };
}

export function normalizeCanvasMap(
  value: unknown,
  projects: Project[],
): Record<string, ProjectCanvas> {
  if (!value || typeof value !== "object") return {};
  const projectIds = new Set(projects.map((project) => project.id));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.reduce<Record<string, ProjectCanvas>>((result, [projectId, canvas]) => {
    if (!projectIds.has(projectId) || !canvas || typeof canvas !== "object") {
      return result;
    }
    const candidate = canvas as Partial<ProjectCanvas>;
    result[projectId] = {
      projectId,
      items: normalizeItems(candidate.items),
      updatedAt:
        typeof candidate.updatedAt === "number"
          ? candidate.updatedAt
          : Date.now(),
    };
    return result;
  }, {});
}

function normalizeItems(value: unknown): CanvasItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CanvasItem | null => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as Partial<CanvasItem>;
      const state = normalizeState(candidate.state);
      return {
        id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
        kind: candidate.kind === "text" ? "text" : "container",
        title:
          typeof candidate.title === "string" && candidate.title.trim()
            ? candidate.title
            : "Canvas item",
        body: typeof candidate.body === "string" ? candidate.body : "",
        x: finiteNumber(candidate.x, 40),
        y: finiteNumber(candidate.y, 40),
        width: finiteNumber(candidate.width, 220),
        height: finiteNumber(candidate.height, 130),
        state,
        locked: Boolean(candidate.locked),
      };
    })
    .filter((item): item is CanvasItem => item !== null);
}

function normalizeState(value: unknown): CanvasItemState {
  return value === "current" || value === "deleted" ? value : "proposed";
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
