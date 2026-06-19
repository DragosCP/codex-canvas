import { previewArtifactDisplayName } from "./mockupArtifacts";
import type { ComposerContextReference, PlanPreviewAreaMark } from "./types";
import type { PreviewImageItem } from "./components/ImagePreviewLightbox";

const THUMBNAIL_WIDTH = 180;
const THUMBNAIL_HEIGHT = 112;

export function composerContextPreviewImage(
  context: ComposerContextReference,
): PreviewImageItem {
  const label = composerContextVisualLabel(context);
  return {
    id: `context:${context.id}`,
    title: composerContextVisualTitle(context),
    alt: label,
    src:
      context.thumbnailDataUrl ||
      fallbackContextThumbnailDataUrl(label, context.areaMark),
  };
}

export function composerContextVisualLabel(context: ComposerContextReference) {
  if (context.type === "appPreview") return context.markLabel || "Mark 1";
  if (context.source === "proposalHighlight") {
    return context.markLabel.replace(/^Adjusted change area:\s*/i, "Change: ");
  }
  return context.markLabel;
}

export function composerContextVisualTitle(context: ComposerContextReference) {
  if (context.type === "appPreview") {
    return `${composerContextVisualLabel(context)} - App preview`;
  }
  const artifact = previewArtifactDisplayName(context.artifactKind, 1, "title");
  return `${composerContextVisualLabel(context)} - ${artifact} ${context.mockupLabel}`;
}

export function fallbackContextThumbnailDataUrl(
  label: string,
  mark: PlanPreviewAreaMark,
) {
  const rect = scaledMarkRect(mark);
  const safeLabel = escapeSvg(label);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" viewBox="0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#242722"/>
      <stop offset="0.58" stop-color="#34352f"/>
      <stop offset="1" stop-color="#1f2528"/>
    </linearGradient>
    <pattern id="grid" width="14" height="14" patternUnits="userSpaceOnUse">
      <path d="M 14 0 L 0 0 0 14" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" rx="13" fill="url(#bg)"/>
  <rect width="100%" height="100%" rx="13" fill="url(#grid)" opacity="0.65"/>
  <rect x="14" y="16" width="152" height="78" rx="10" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.14)"/>
  <rect x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" rx="6" fill="rgba(143,199,255,0.22)" stroke="#8fc7ff" stroke-width="2"/>
  <rect x="10" y="9" width="${Math.min(148, Math.max(58, safeLabel.length * 7 + 18))}" height="22" rx="11" fill="rgba(10,14,18,0.72)" stroke="rgba(143,199,255,0.46)"/>
  <text x="20" y="24" fill="#e6f2ff" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" font-weight="700">${safeLabel}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function scaledMarkRect(mark: PlanPreviewAreaMark) {
  const viewportWidth = Math.max(1, mark.viewportWidth);
  const viewportHeight = Math.max(1, mark.viewportHeight);
  const stageX = 14;
  const stageY = 16;
  const stageWidth = 152;
  const stageHeight = 78;
  return {
    x: stageX + (mark.x / viewportWidth) * stageWidth,
    y: stageY + (mark.y / viewportHeight) * stageHeight,
    width: Math.max(10, (mark.width / viewportWidth) * stageWidth),
    height: Math.max(10, (mark.height / viewportHeight) * stageHeight),
  };
}

function escapeSvg(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
