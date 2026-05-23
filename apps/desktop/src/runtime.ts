import type { BackendMode, ConnectionStatus } from "./types";

export type RuntimeInfo = {
  appServerUrl: string;
  backendLabel: string;
  backendMode: BackendMode;
  autoConnect: boolean;
  projectPathHint: string;
};

const tauriRuntime =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const runtimeInfo: RuntimeInfo = {
  appServerUrl:
    import.meta.env.VITE_CODEX_APP_SERVER_URL ??
    (tauriRuntime ? "ws://127.0.0.1:48890" : "ws://127.0.0.1:48888"),
  backendLabel:
    import.meta.env.VITE_CODEX_BACKEND_LABEL ??
    (tauriRuntime
      ? "Built desktop + real WSL app-server"
      : "Mock app-server dev backend"),
  backendMode: (import.meta.env.VITE_CODEX_BACKEND_MODE ??
    (tauriRuntime ? "real-wsl" : "mock-dev")) as BackendMode,
  autoConnect: import.meta.env.VITE_CODEX_AUTO_CONNECT !== "false",
  projectPathHint:
    import.meta.env.VITE_CODEX_PROJECT_PATH_HINT ??
    (tauriRuntime
      ? "/mnt/c/Users/drago/Desktop/harnesses/codex-main"
      : "/mnt/c/Users/drago/Desktop/harnesses/codex-main/.cache/p03-desktop-demo-workspace"),
};

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
  return backendMode === "real-wsl" ? normalized.toLowerCase() : normalized;
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
