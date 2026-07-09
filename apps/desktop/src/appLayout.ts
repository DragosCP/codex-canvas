export const SIDEBAR_DRAWER_WIDTH = 700;
export const INSPECTOR_AUTO_COLLAPSE_WIDTH = 660;
export const INSPECTOR_MIN_WIDTH = 320;
export const CHAT_COMFORT_WIDTH = 520;
export const PREVIEW_CHAT_MIN_WIDTH = 320;
export const CHAT_PHONE_LAYOUT_WIDTH = 460;
export const INSPECTOR_AUTO_COLLAPSE_QUERY = `(max-width: ${INSPECTOR_AUTO_COLLAPSE_WIDTH}px)`;

export function preferredPreviewInspectorWidth() {
  if (typeof window === "undefined") return 760;
  const sidebarWidth = sidebarWidthForShell(window.innerWidth);
  return clamp(
    window.innerWidth - sidebarWidth - CHAT_COMFORT_WIDTH,
    720,
    maxInspectorWidthForShell(window.innerWidth, true),
  );
}

export function maxInspectorWidthForShell(
  shellWidth: number,
  previewFocused = false,
) {
  const reservedChatWidth = previewFocused
    ? PREVIEW_CHAT_MIN_WIDTH
    : CHAT_COMFORT_WIDTH;
  return Math.max(INSPECTOR_MIN_WIDTH, shellWidth - reservedChatWidth);
}

export function sidebarWidthForShell(shellWidth: number) {
  if (shellWidth <= 1240) {
    return clamp(shellWidth * 0.22, 236, 280);
  }
  return clamp(shellWidth * 0.17, 248, 304);
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
