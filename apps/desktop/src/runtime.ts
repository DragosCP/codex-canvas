import type { BackendMode, ConnectionStatus } from "./types";
import { desktopInvoke, hasDesktopBridge } from "./desktopBridge";

export type RuntimeInfo = {
  appServerUrl: string;
  backendLabel: string;
  backendMode: BackendMode;
  autoConnect: boolean;
  projectPathHint: string;
  startupError?: string | null;
};

const desktopRuntime = hasDesktopBridge();

export const runtimeInfo: RuntimeInfo = {
  appServerUrl:
    import.meta.env.VITE_CODEX_APP_SERVER_URL ??
    (desktopRuntime ? "ws://127.0.0.1:48890" : "ws://127.0.0.1:48888"),
  backendLabel:
    import.meta.env.VITE_CODEX_BACKEND_LABEL ??
    (desktopRuntime
      ? "Electron desktop + native Codex app-server"
      : "Mock app-server dev backend"),
  backendMode: (import.meta.env.VITE_CODEX_BACKEND_MODE ??
    (desktopRuntime ? "real-native" : "mock-dev")) as BackendMode,
  autoConnect: import.meta.env.VITE_CODEX_AUTO_CONNECT !== "false",
  projectPathHint:
    import.meta.env.VITE_CODEX_PROJECT_PATH_HINT ??
    (desktopRuntime
      ? "C:\\Users\\drago\\Desktop\\harnesses\\codex-main"
      : "/mnt/c/Users/drago/Desktop/harnesses/codex-main/.cache/p03-desktop-demo-workspace"),
};

export async function loadRuntimeInfo() {
  const resolved = desktopInvoke<Omit<RuntimeInfo, "autoConnect">>(
    "desktop_runtime_info",
  );
  if (!resolved) return runtimeInfo;
  try {
    return {
      ...runtimeInfo,
      ...(await resolved),
      autoConnect: runtimeInfo.autoConnect,
    };
  } catch {
    return runtimeInfo;
  }
}

export function normalizeProjectPathForRuntime(
  path: string,
  backendMode: BackendMode = runtimeInfo.backendMode,
) {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (
    backendMode === "real-wsl" &&
    /^[A-Za-z]:[\\/]/.test(trimmed)
  ) {
    const drive = trimmed[0].toLowerCase();
    const rest = trimmed.slice(2).replace(/\\/g, "/").replace(/^\/+/, "");
    return `/mnt/${drive}/${rest}`;
  }
  if (
    backendMode === "real-native" &&
    /^\/mnt\/[A-Za-z](?:\/|$)/.test(trimmed)
  ) {
    const drive = trimmed[5].toUpperCase();
    const rest = trimmed.slice(7).replace(/\//g, "\\");
    return rest ? `${drive}:\\${rest}` : `${drive}:\\`;
  }
  return trimmed;
}

export function runtimePathKey(
  path: string | null | undefined,
  backendMode: BackendMode = runtimeInfo.backendMode,
) {
  if (!path) return "";
  const normalized = normalizeProjectPathForRuntime(path, backendMode).replace(
    /\\/g,
    "/",
  );
  return backendMode === "real-wsl" || backendMode === "real-native"
    ? normalized.toLowerCase()
    : normalized;
}

export function sameRuntimePath(
  left: string | null | undefined,
  right: string | null | undefined,
  backendMode: BackendMode = runtimeInfo.backendMode,
) {
  return runtimePathKey(left, backendMode) === runtimePathKey(right, backendMode);
}

export function connectionVerb(status: ConnectionStatus) {
  switch (status) {
    case "starting":
      return "Starting";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "failed":
      return "Failed";
    default:
      return "Disconnected";
  }
}
