import type { CanvasTargetMetadataResult, ElementRef } from "./canvasTargeting";
import type {
  BuildSelectedStrategy,
  ProposalBacking,
} from "./canvasProposalModel";
import type { PlanPreviewSessionState, PlanPreviewVariant } from "./types";
import type { VisualPatchBundle } from "./visualPatchRuntime";

export type CanvasProposalStalenessReason =
  | "project_changed"
  | "missing_backing_artifact"
  | "preview_url_changed"
  | "route_changed"
  | "viewport_changed"
  | "canvas_target_missing"
  | "source_file_missing"
  | "source_file_changed"
  | "workspace_outside_registry"
  | "preview_owner_changed"
  | "target_metadata_unavailable";

export type CanvasProposalRecoveryAction =
  | "refresh"
  | "rebase"
  | "archive"
  | "open_live";

export type CanvasProposalStalenessStatus =
  | { stale: false }
  | {
      stale: true;
      reason: CanvasProposalStalenessReason;
      label: string;
      message: string;
      recoveryActions: CanvasProposalRecoveryAction[];
      details?: string;
    };

export const freshCanvasProposalStaleness: CanvasProposalStalenessStatus = {
  stale: false,
};

export function evaluateLiveDomPatchStaleness(args: {
  proposalProjectId?: string | null;
  currentProjectId?: string | null;
  proposalBacking?: ProposalBacking;
  buildStrategy?: BuildSelectedStrategy;
  variant?: PlanPreviewVariant | null;
  bundle?: VisualPatchBundle | null;
  baselineSession?: PlanPreviewSessionState | null;
  currentSession?: PlanPreviewSessionState | null;
  currentPreviewUrl?: string | null;
  currentRoute?: string | null;
  currentViewport?: "desktop" | "mobile" | null;
  targetMetadata?: CanvasTargetMetadataResult | null;
}): CanvasProposalStalenessStatus {
  if (!isLiveDomPatchProposal(args.proposalBacking, args.buildStrategy)) {
    return freshCanvasProposalStaleness;
  }
  if (
    args.proposalProjectId &&
    args.currentProjectId &&
    args.proposalProjectId !== args.currentProjectId
  ) {
    return staleStatus({
      reason: "project_changed",
      label: "Open original project",
      message:
        "This proposal belongs to another project. Open the original project or refresh the proposal before building.",
      recoveryActions: ["open_live", "refresh"],
    });
  }
  const bundle = args.bundle;
  if (!bundle?.patches.length) {
    return staleStatus({
      reason: "missing_backing_artifact",
      label: "Refresh needed",
      message:
        "This proposal no longer has its preview patch. Refresh or archive it before building.",
      recoveryActions: ["refresh", "archive"],
    });
  }

  const baseline = args.baselineSession ?? args.currentSession ?? null;
  const currentPreviewUrl = clean(args.currentPreviewUrl);
  if (
    baseline?.previewUrl &&
    currentPreviewUrl &&
    !samePreviewLocation(baseline.previewUrl, currentPreviewUrl)
  ) {
    return staleStatus({
      reason: "preview_url_changed",
      label: "Refresh needed",
      message:
        "The Live preview URL has changed. Refresh this proposal from the current Live preview before building.",
      recoveryActions: ["refresh", "rebase"],
      details: `${baseline.previewUrl} -> ${currentPreviewUrl}`,
    });
  }

  const currentRoute =
    targetMetadataRoute(args.targetMetadata) ||
    clean(args.currentRoute) ||
    currentPreviewUrl;
  const expectedRoute =
    clean(args.variant?.route) ||
    clean(baseline?.route) ||
    clean(baseline?.previewUrl);
  if (
    expectedRoute &&
    currentRoute &&
    !sameRouteLocation(expectedRoute, currentRoute)
  ) {
    return staleStatus({
      reason: "route_changed",
      label: "Refresh route",
      message:
        "This proposal was made for a different route. Refresh it on the current route before building.",
      recoveryActions: ["refresh", "rebase"],
      details: `${expectedRoute} -> ${currentRoute}`,
    });
  }

  if (
    baseline?.viewport &&
    args.currentViewport &&
    baseline.viewport !== args.currentViewport
  ) {
    return staleStatus({
      reason: "viewport_changed",
      label: "Switch viewport",
      message: `This proposal was made for ${baseline.viewport}. Switch back or refresh it for ${args.currentViewport} before building.`,
      recoveryActions: ["refresh", "rebase"],
    });
  }

  if (args.targetMetadata) {
    const targetStatus = evaluateTargetMetadataStaleness(
      bundle,
      args.targetMetadata,
    );
    if (targetStatus.stale) return targetStatus;
  }

  return freshCanvasProposalStaleness;
}

export function evaluateCodeWorkspaceStaleness(args: {
  proposalProjectId?: string | null;
  currentProjectId?: string | null;
  rootPath?: string | null;
  workspacePath?: string | null;
  previewOwnerId?: string | null;
  currentPreviewOwnerId?: string | null;
}): CanvasProposalStalenessStatus {
  if (
    args.proposalProjectId &&
    args.currentProjectId &&
    args.proposalProjectId !== args.currentProjectId
  ) {
    return staleStatus({
      reason: "project_changed",
      label: "Open original project",
      message:
        "This runnable proposal belongs to another project. Open that project before building it.",
      recoveryActions: ["open_live"],
    });
  }
  if (!clean(args.workspacePath)) {
    return staleStatus({
      reason: "missing_backing_artifact",
      label: "Refresh needed",
      message:
        "This runnable proposal no longer has a workspace. Refresh or archive it before building.",
      recoveryActions: ["refresh", "archive"],
    });
  }
  if (
    clean(args.rootPath) &&
    clean(args.workspacePath) &&
    !pathInsideOrEqual(clean(args.workspacePath), clean(args.rootPath))
  ) {
    return staleStatus({
      reason: "workspace_outside_registry",
      label: "Refresh needed",
      message:
        "This runnable proposal is outside its registered workspace. Refresh or archive it before building.",
      recoveryActions: ["refresh", "archive"],
    });
  }
  if (
    clean(args.previewOwnerId) &&
    clean(args.currentPreviewOwnerId) &&
    clean(args.previewOwnerId) !== clean(args.currentPreviewOwnerId)
  ) {
    return staleStatus({
      reason: "preview_owner_changed",
      label: "Reopen proposal",
      message:
        "This preview is attached to another proposal workspace. Reopen the selected proposal before building.",
      recoveryActions: ["refresh", "open_live"],
    });
  }
  return freshCanvasProposalStaleness;
}

export function staleProposalBuildMessage(
  status: CanvasProposalStalenessStatus,
) {
  return status.stale
    ? status.message
    : "Build the selected proposal into Live";
}

export function liveDomPatchRequiresBacking(
  proposalBacking?: ProposalBacking,
  buildStrategy?: BuildSelectedStrategy,
) {
  return isLiveDomPatchProposal(proposalBacking, buildStrategy);
}

function evaluateTargetMetadataStaleness(
  bundle: VisualPatchBundle,
  targetMetadata: CanvasTargetMetadataResult,
): CanvasProposalStalenessStatus {
  if (!targetMetadata.ok) {
    return staleStatus({
      reason: "target_metadata_unavailable",
      label: "Refresh needed",
      message:
        "Canvas target metadata could not be read. Refresh this proposal before building.",
      recoveryActions: ["refresh", "rebase"],
      details: targetMetadata.message,
    });
  }
  const targetsById = new Map(
    targetMetadata.targets.map((target) => [
      normalizeRefValue(target.elementRef.canvasId),
      target.elementRef,
    ]),
  );
  for (const target of uniquePatchTargets(bundle)) {
    const current = targetsById.get(normalizeRefValue(target.canvasId));
    if (!current) {
      return staleStatus({
        reason: "canvas_target_missing",
        label: "Refresh target",
        message:
          "One of this proposal's target areas is no longer present. Refresh the proposal before building.",
        recoveryActions: ["refresh", "rebase"],
        details: target.canvasId,
      });
    }
    const expectedSource = clean(target.sourceFile);
    if (expectedSource) {
      const currentSource = clean(current.sourceFile);
      if (!currentSource) {
        return staleStatus({
          reason: "source_file_missing",
          label: "Refresh source",
          message:
            "This proposal's source hint is no longer available on the target. Refresh it before building.",
          recoveryActions: ["refresh", "rebase"],
          details: target.canvasId,
        });
      }
      if (!sameSourceFile(expectedSource, currentSource)) {
        return staleStatus({
          reason: "source_file_changed",
          label: "Refresh source",
          message:
            "This proposal's source hint no longer matches the current target. Refresh it before building.",
          recoveryActions: ["refresh", "rebase"],
          details: `${expectedSource} -> ${currentSource}`,
        });
      }
    }
  }
  return freshCanvasProposalStaleness;
}

function staleStatus(
  status: Omit<Extract<CanvasProposalStalenessStatus, { stale: true }>, "stale">,
): CanvasProposalStalenessStatus {
  return { stale: true, ...status };
}

function isLiveDomPatchProposal(
  proposalBacking?: ProposalBacking,
  buildStrategy?: BuildSelectedStrategy,
) {
  return (
    proposalBacking === "live_dom_patch" ||
    buildStrategy === "convert_dom_patch_to_code"
  );
}

function uniquePatchTargets(bundle: VisualPatchBundle): ElementRef[] {
  const seen = new Set<string>();
  const refs: ElementRef[] = [];
  for (const patch of bundle.patches) {
    const canvasId = clean(patch.target.canvasId);
    if (!canvasId || seen.has(normalizeRefValue(canvasId))) continue;
    seen.add(normalizeRefValue(canvasId));
    refs.push({
      canvasId,
      sourceFile: clean(patch.target.sourceFile) || undefined,
      componentName: clean(patch.target.componentName) || undefined,
    });
  }
  return refs;
}

function targetMetadataRoute(metadata?: CanvasTargetMetadataResult | null) {
  return metadata?.ok ? clean(metadata.route) : "";
}

function samePreviewLocation(left: string, right: string) {
  try {
    const leftUrl = new URL(normalizeComparableUrl(left));
    const rightUrl = new URL(normalizeComparableUrl(right));
    return (
      localPreviewHostKey(leftUrl.hostname) ===
        localPreviewHostKey(rightUrl.hostname) &&
      previewPort(leftUrl) === previewPort(rightUrl) &&
      normalizePreviewPath(leftUrl.pathname) ===
        normalizePreviewPath(rightUrl.pathname) &&
      leftUrl.search === rightUrl.search
    );
  } catch {
    return clean(left).replace(/\/+$/, "") === clean(right).replace(/\/+$/, "");
  }
}

function sameRouteLocation(expected: string, current: string) {
  const cleanExpected = clean(expected);
  const cleanCurrent = clean(current);
  if (cleanExpected.startsWith("/")) {
    const expectedPath = pathAndSearch(cleanExpected);
    const currentPath = pathAndSearch(cleanCurrent);
    return expectedPath === currentPath;
  }
  return samePreviewLocation(cleanExpected, cleanCurrent);
}

function pathAndSearch(value: string) {
  try {
    const url = value.startsWith("/")
      ? new URL(value, "http://canvas.local")
      : new URL(normalizeComparableUrl(value));
    return `${normalizePreviewPath(url.pathname)}${url.search}`;
  } catch {
    const [path = "", query = ""] = value.split("?", 2);
    return `${normalizePreviewPath(path)}${query ? `?${query}` : ""}`;
  }
}

function normalizeComparableUrl(value: string) {
  const trimmed = clean(value);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function localPreviewHostKey(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1"
    ? "localhost"
    : host;
}

function previewPort(url: URL) {
  if (url.port) return url.port;
  if (url.protocol === "https:") return "443";
  return "80";
}

function normalizePreviewPath(path: string) {
  return path.replace(/\/+$/, "") || "/";
}

function sameSourceFile(left: string, right: string) {
  return normalizeRefValue(left).replace(/\\/g, "/") ===
    normalizeRefValue(right).replace(/\\/g, "/");
}

function normalizeRefValue(value: string) {
  return value.trim().toLowerCase();
}

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function pathInsideOrEqual(candidate: string, parent: string) {
  const left = normalizePath(candidate);
  const right = normalizePath(parent).replace(/\/+$/, "");
  return left === right || left.startsWith(`${right}/`);
}

function normalizePath(value: string) {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
