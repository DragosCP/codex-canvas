export type DesktopCommandArgs = Record<string, unknown>;

export type CodexDesktopBridge = {
  invoke?: <T>(
    command: string,
    args?: DesktopCommandArgs,
  ) => Promise<T>;
  fileUrl?: (path: string) => string | null;
  getPathForFile?: (file: File) => string;
};

declare global {
  interface Window {
    codexDesktop?: CodexDesktopBridge;
  }
}

export function hasDesktopBridge() {
  return (
    typeof window !== "undefined" &&
    typeof window.codexDesktop?.invoke === "function"
  );
}

export function desktopInvoke<T>(
  command: string,
  args?: DesktopCommandArgs,
) {
  const invoke = window.codexDesktop?.invoke;
  if (!invoke) return null;
  return invoke<T>(command, args);
}

export function desktopFileUrl(path: string) {
  return window.codexDesktop?.fileUrl?.(path) ?? null;
}

export function desktopPathForFile(file: File) {
  const bridgedPath = window.codexDesktop?.getPathForFile?.(file);
  return bridgedPath ?? (file as File & { path?: string }).path ?? "";
}
