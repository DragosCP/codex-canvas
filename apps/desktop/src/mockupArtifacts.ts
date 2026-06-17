import type { PreviewArtifactKind } from "./types";

export function normalizePreviewArtifactKind(
  value: unknown,
  fallback: PreviewArtifactKind = "mockup",
): PreviewArtifactKind {
  return value === "wireframe" || value === "preview" || value === "mockup"
    ? value
    : fallback;
}

export function previewArtifactKindFromText(
  text: string,
  fallback: PreviewArtifactKind = "mockup",
): PreviewArtifactKind {
  const normalized = text.toLowerCase();
  if (/\bwireframe\b|\bwireframes\b/.test(normalized)) return "wireframe";
  if (/\bquick preview\b|\breview preview\b|\bpreview\b|\bpreviews\b/.test(normalized)) {
    return fallback === "wireframe" ? "wireframe" : "preview";
  }
  if (/\bmockup\b|\bmockups\b/.test(normalized)) return "mockup";
  return fallback;
}

export function previewArtifactDisplayName(
  kind: PreviewArtifactKind,
  count = 1,
  capitalization: "title" | "lower" = "lower",
) {
  const singular =
    kind === "wireframe" ? "wireframe" : kind === "preview" ? "preview" : "mockup";
  const plural = `${singular}s`;
  const text = count === 1 ? singular : plural;
  return capitalization === "title"
    ? `${text.charAt(0).toUpperCase()}${text.slice(1)}`
    : text;
}

export function previewArtifactActionName(kind: PreviewArtifactKind) {
  return kind === "wireframe"
    ? "wireframe"
    : kind === "preview"
      ? "preview"
      : "mockup";
}

export function previewArtifactTabLabel(
  kind: PreviewArtifactKind,
  fallbackLabel: string,
  total: number,
) {
  if (total !== 1) return fallbackLabel;
  return kind === "wireframe" ? "Wireframe" : "Preview";
}

export function previewArtifactFilePrefix(kind: PreviewArtifactKind) {
  return kind === "wireframe" ? "wireframe" : "mockup";
}

export function createProposalSetId(seed?: string | null) {
  const compactSeed = String(seed ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return compactSeed ? `${compactSeed}-${suffix}` : `proposal-${suffix}`;
}
