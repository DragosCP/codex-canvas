import type { CodeProposalFileChange, ThreadItem } from "./types";

type FileUpdateChange = Extract<
  ThreadItem,
  { type: "fileChange" }
>["changes"][number];

export type FeatureDraftValidationResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "blocked_command_before_placement"
        | "blocked_preview_server_command"
        | "missing_fake_state_boundary"
        | "missing_placement_preflight"
        | "missing_real_integration"
        | "missing_product_entry_point"
        | "router_bypass"
        | "standalone_draft_page"
        | "standalone_final_response"
        | "stale_draft_artifact";
      message: string;
      details?: string[];
    };

export const FEATURE_DRAFT_PLACEMENT_PREFLIGHT_CONTRACT = `Draft placement preflight:
- Before editing, identify the existing screen/component to modify.
- Name the existing product entry point where the user starts the workflow.
- Name the temporary feature boundary for the requested feature only: adapter, fixture module, component state, prop wiring, local event handler, or visual-only UI rendering/styling boundary.
- Name the selected state the user can reach.
- Name the review/approval state when relevant.
- Name the result state that returns to the normal app workflow.
- Name the real backend/API/auth/storage/connector/billing integration that Build this should later replace. For visual-only UI changes, say no backend replacement is needed and Build this should apply the UI change to Live.
- Do not fabricate unrelated app-wide auth, onboarding, workspace, bootstrap, profile, or chat-list state just to make the preview visible.
- If you cannot name the existing product surface and temporary feature boundary, stop and inspect more or ask instead of coding.`;

const STANDALONE_DRAFT_PATH_PATTERNS = [
  /(?:^|\/)(?:Draft[A-Za-z0-9]*Page|[A-Za-z0-9]*Draft[A-Za-z0-9]*Page)\.(?:[cm]?[jt]sx?|vue|svelte)$/i,
  /(?:^|\/)(?:WorkflowPreview|[A-Za-z0-9]*WorkflowPreview[A-Za-z0-9]*)\.(?:[cm]?[jt]sx?|vue|svelte)$/i,
  /(?:^|\/)(?:FeaturePreviewPage|[A-Za-z0-9]*FeaturePreviewPage[A-Za-z0-9]*)\.(?:[cm]?[jt]sx?|vue|svelte)$/i,
  /(?:^|\/)(?:PreviewRoute|[A-Za-z0-9]*PreviewRoute[A-Za-z0-9]*)\.(?:[cm]?[jt]sx?|vue|svelte)$/i,
  /(?:^|\/)(?:DemoPage|[A-Za-z0-9]*DemoPage[A-Za-z0-9]*)\.(?:[cm]?[jt]sx?|vue|svelte)$/i,
];

const ROUTER_FILE_PATTERN =
  /(?:^|\/)(?:src\/)?(?:App|main|router|routes|routeTree\.gen|RouteTree|Router|RootRoute)\.(?:[cm]?[jt]sx?)$/i;

const BLOCKED_PRE_VALIDATION_COMMAND_PATTERN =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|ci|run\s+(?:build|dev|preview|start)|build|dev|preview|start)\b|\b(?:vite|next|react-scripts)\s+(?:build|dev|preview|start)\b/i;

const BLOCKED_DRAFT_PREVIEW_SERVER_COMMAND_PATTERN =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|preview|start)\b|\b(?:vite|next|react-scripts)\s+(?:dev|preview|start)\b|\b(?:serve|http-server|npx\s+(?:vite|serve|http-server))\b/i;

const FINAL_STANDALONE_LANGUAGE_PATTERN =
  /\b(?:workflow preview|demo page|preview route|standalone (?:demo|page|prototype)|temporary page)\b/i;

export function validateFeatureDraftPlacementPreflight(
  text: string,
): FeatureDraftValidationResult {
  const normalized = normalizeText(text);
  if (!hasProductEntryPoint(normalized)) {
    return invalid(
      "missing_product_entry_point",
      "Draft placement is missing the existing product entry point.",
    );
  }
  if (!hasFakeStateBoundary(normalized)) {
    return invalid(
      "missing_fake_state_boundary",
      "Draft placement is missing the temporary feature adapter/local behavior or visual UI boundary.",
    );
  }
  if (!hasRealIntegrationReplacement(normalized) && !hasVisualOnlyBoundary(normalized)) {
    return invalid(
      "missing_real_integration",
      "Draft placement is missing the real integration that Build this should replace.",
    );
  }
  return { ok: true };
}

export function validateFeatureDraftFirstDiff(
  changes: FileUpdateChange[],
): FeatureDraftValidationResult {
  for (const change of changes) {
    const path = normalizePath(change.path);
    const standaloneMatch = STANDALONE_DRAFT_PATH_PATTERNS.find((pattern) =>
      pattern.test(path),
    );
    if (standaloneMatch) {
      return invalid(
        "standalone_draft_page",
        "Draft is creating a standalone draft/preview page instead of placing the feature in the existing app.",
        [change.path],
      );
    }

    if (ROUTER_FILE_PATTERN.test(path)) {
      const routerResult = validateRouterDiff(change.diff, change.path);
      if (!routerResult.ok) return routerResult;
    }
  }
  return { ok: true };
}

export function validateFeatureDraftFirstEdit(args: {
  changes: FileUpdateChange[];
  placementPreflightValidated: boolean;
}): FeatureDraftValidationResult {
  const diffResult = validateFeatureDraftFirstDiff(args.changes);
  if (!diffResult.ok) return diffResult;
  if (args.changes.length > 0 && !args.placementPreflightValidated) {
    return invalid(
      "missing_placement_preflight",
      "Draft edited before naming the existing product entry point and temporary feature adapter boundary.",
    );
  }
  return { ok: true };
}

export function validateFeatureDraftPreValidationCommand(
  commandOrArgs:
    | string
    | {
        command: string;
        firstDiffValidated?: boolean;
      },
): FeatureDraftValidationResult {
  const command =
    typeof commandOrArgs === "string" ? commandOrArgs : commandOrArgs.command;
  if (BLOCKED_DRAFT_PREVIEW_SERVER_COMMAND_PATTERN.test(command)) {
    return invalid(
      "blocked_preview_server_command",
      "Draft tried to start a local preview server; the desktop Draft preview owns serving and refresh.",
      [command],
    );
  }
  if (!BLOCKED_PRE_VALIDATION_COMMAND_PATTERN.test(command)) {
    return { ok: true };
  }
  if (
    typeof commandOrArgs !== "string" &&
    commandOrArgs.firstDiffValidated
  ) {
    return { ok: true };
  }
  return invalid(
    "blocked_command_before_placement",
    "Draft tried to install, build, or start preview before product placement was validated.",
    [command],
  );
}

export function validateFeatureDraftCompletion(args: {
  changedFiles: CodeProposalFileChange[];
  finalText: string;
}): FeatureDraftValidationResult {
  const pathOnlyResult = validateFeatureDraftChangedPaths(args.changedFiles);
  if (!pathOnlyResult.ok) return pathOnlyResult;
  return validateFeatureDraftFinalResponse(args.finalText);
}

export function validateFeatureDraftChangedPaths(
  changedFiles: CodeProposalFileChange[],
): FeatureDraftValidationResult {
  for (const change of changedFiles) {
    const path = normalizePath(change.path);
    if (
      STANDALONE_DRAFT_PATH_PATTERNS.some((pattern) => pattern.test(path))
    ) {
      return invalid(
        "standalone_draft_page",
        "Draft changed a standalone draft/preview page instead of an in-place product surface.",
        [change.path],
      );
    }
    if (isDraftArtifactPath(path)) {
      return invalid(
        "stale_draft_artifact",
        "Draft changed prior draft/mockup artifact files instead of the requested in-app product surface.",
        [change.path],
      );
    }
  }
  return { ok: true };
}

export function validateFeatureDraftFinalResponse(
  finalText: string,
): FeatureDraftValidationResult {
  const normalized = normalizeText(finalText);
  if (FINAL_STANDALONE_LANGUAGE_PATTERN.test(normalized)) {
    return invalid(
      "standalone_final_response",
      "Draft final response describes a standalone demo/preview route instead of a feature inside the existing app.",
    );
  }
  if (!hasProductEntryPoint(normalized)) {
    return invalid(
      "missing_product_entry_point",
      "Draft final response must name the existing product entry point.",
    );
  }
  if (!hasFakeStateBoundary(normalized)) {
    return invalid(
      "missing_fake_state_boundary",
      "Draft final response must name the temporary feature adapter, local behavior, or visual UI boundary.",
    );
  }
  if (
    !hasRealIntegrationReplacement(normalized) &&
    !hasVisualOnlyBuildApplication(normalized)
  ) {
    return invalid(
      "missing_real_integration",
      "Draft final response must name the real integration Build this should replace, or say the visual-only UI change has no backend replacement.",
    );
  }
  return { ok: true };
}

export function featureDraftValidationMessage(
  result: FeatureDraftValidationResult,
) {
  if (result.ok) return "";
  return result.details?.length
    ? `${result.message} (${result.details.join(", ")})`
    : result.message;
}

export function isBlockingFeatureDraftValidationResult(
  result: FeatureDraftValidationResult,
) {
  if (result.ok) return false;
  return (
    result.code !== "blocked_command_before_placement" &&
    result.code !== "missing_placement_preflight"
  );
}

function validateRouterDiff(
  diff: string,
  path: string,
): FeatureDraftValidationResult {
  const addedLines = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .join("\n");
  const removedLines = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith("-") && !line.startsWith("---"))
    .join("\n");

  if (
    /\b(?:Draft[A-Za-z0-9]*Page|WorkflowPreview|FeaturePreviewPage|PreviewRoute|DemoPage)\b/i.test(
      addedLines,
    ) &&
    /(?:path\s*[:=]\s*["'`]\*|path\s*=\s*["'`]\*|createBrowserRouter|RouterProvider|<Routes|<Route|Navigate|redirect)/i.test(
      addedLines,
    )
  ) {
    return invalid(
      "router_bypass",
      "Draft is routing directly to a draft-only page instead of preserving the existing app flow.",
      [path],
    );
  }

  if (
    /(?:AuthProvider|RouterProvider|QueryClientProvider|SupabaseProvider|WorkspaceProvider|OnboardingProvider|Provider)/i.test(
      removedLines,
    ) &&
    /\b(?:Draft[A-Za-z0-9]*Page|WorkflowPreview|FeaturePreviewPage|PreviewRoute|DemoPage)\b/i.test(
      addedLines,
    )
  ) {
    return invalid(
      "router_bypass",
      "Draft appears to remove app shell/providers and render a separate draft surface.",
      [path],
    );
  }

  if (
    /(?:path\s*[:=]\s*["'`]\*|path\s*=\s*["'`]\*|redirect|Navigate)/i.test(
      addedLines,
    ) &&
    /\b(?:mcp-draft|draft-[a-z0-9-]*workflow|workflow-preview|feature-preview|demo)\b/i.test(
      addedLines,
    )
  ) {
    return invalid(
      "router_bypass",
      "Draft is adding a wildcard or direct preview route instead of entering through the product UI.",
      [path],
    );
  }

  return { ok: true };
}

function hasProductEntryPoint(text: string) {
  return (
    /\bentry point\b/i.test(text) ||
    /\b(?:composer|settings|toolbar|navigation|nav|menu|chat|sidebar|inspector|profile|workspace|existing screen|existing component)\b/i.test(
      text,
    )
  );
}

function hasFakeStateBoundary(text: string) {
  return (
    /\b(?:temporary|local|fake|fixture|stubbed|draft-only)\s+(?:feature\s+)?(?:adapter|adapters|behavior|fixture|fixtures|local state|state|data|boundary)\b/i.test(
      text,
    ) ||
    /\b(?:adapter|adapters|fixture|fixtures|local state|component state|prop wiring|local event handler)\b/i.test(
      text,
    ) ||
    hasVisualOnlyBoundary(text)
  );
}

function hasRealIntegrationReplacement(text: string) {
  return (
    /\bbuild this\b.{0,120}\b(?:replace|wire|connect|integrat)/i.test(text) ||
    /\b(?:replace|wire|connect|integrat)\b.{0,120}\b(?:real|backend|api|auth|storage|connector|billing|database|mcp|server|network)/i.test(
      text,
    ) ||
    /\breal\b.{0,80}\b(?:integration|backend|api|auth|storage|connector|billing|database|mcp|server|network)/i.test(
      text,
    )
  );
}

function hasVisualOnlyBoundary(text: string) {
  return (
    /\b(?:visual-only|ui-only|visual|ui)\s+(?:change|draft|boundary|rendering|styling)\b/i.test(
      text,
    ) ||
    /\bboundary\b.{0,140}\b(?:rendering|styling|component|prop wiring|sidebar|nav|navigation|menu|button|panel|toolbar|route redirect)\b/i.test(
      text,
    ) ||
    /\b(?:sidebar|nav|navigation|menu|button|panel|toolbar)\b.{0,140}\b(?:rendering|rendered|prop wiring|boundary|entry|remove|hide|show|visible|visibility|styling|layout)\b/i.test(
      text,
    ) ||
    /\b(?:only needs to|just needs to|draft only needs to)\b.{0,160}\b(?:remove|hide|show|render|change)\b.{0,80}\b(?:button|nav|navigation|sidebar|menu|panel|toolbar)\b/i.test(
      text,
    )
  );
}

function hasVisualOnlyBuildApplication(text: string) {
  return (
    hasVisualOnlyBoundary(text) &&
    (/\bbuild this\b.{0,160}\b(?:apply|commit|change|update|remove|hide|show|render|source|live)\b/i.test(
      text,
    ) ||
      /\b(?:no backend|no real backend|no api|no auth|no storage|no connector|no integration)\b.{0,120}\b(?:replace|needed|required|wire|integration)?\b/i.test(
        text,
      ) ||
      /\b(?:visual-only|ui-only)\b.{0,120}\b(?:source|live|change|apply|build)\b/i.test(
        text,
      ))
  );
}

function invalid(
  code: Exclude<FeatureDraftValidationResult, { ok: true }>["code"],
  message: string,
  details?: string[],
): FeatureDraftValidationResult {
  return { ok: false, code, message, details };
}

function normalizePath(path: string) {
  return path.replace(/\\/g, "/");
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isDraftArtifactPath(path: string) {
  return /(?:^|\/)\.codex\/(?:drafts|mockups)\//i.test(path);
}
