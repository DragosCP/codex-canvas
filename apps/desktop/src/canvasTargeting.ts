export type ElementRef = {
  canvasId: string;
  sourceFile?: string;
  componentName?: string;
};

export type CanvasTargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
};

export type TargetResolutionKind = "exact" | "inferred" | "visual_only";

export type TargetResolutionConfidence = "high" | "medium" | "low";

export type TargetResolution = {
  kind: TargetResolutionKind;
  confidence: TargetResolutionConfidence;
  elementRef?: ElementRef;
  bounds: CanvasTargetRect;
  screenshotRef: string;
};

export type CanvasTargetMetadata = {
  elementRef: ElementRef;
  resolution: TargetResolution;
  tagName: string;
  role?: string;
  text?: string;
};

export type CanvasTargetMetadataResult =
  | {
      ok: true;
      screenshotRef: string;
      route: string;
      viewportWidth: number;
      viewportHeight: number;
      targets: CanvasTargetMetadata[];
    }
  | {
      ok: false;
      status: "collection-failed";
      message: string;
    };

export type CanvasTargetMetadataScriptOptions = {
  screenshotRef?: string;
  maxTargets?: number;
};

export function exactTargetResolution(
  elementRef: ElementRef,
  bounds: CanvasTargetRect,
  screenshotRef: string,
): TargetResolution {
  return {
    kind: "exact",
    confidence: "high",
    elementRef,
    bounds,
    screenshotRef,
  };
}

export function inferredTargetResolution(
  bounds: CanvasTargetRect,
  screenshotRef: string,
  elementRef?: ElementRef,
): TargetResolution {
  return {
    kind: "inferred",
    confidence: elementRef ? "medium" : "low",
    elementRef,
    bounds,
    screenshotRef,
  };
}

export function visualOnlyTargetResolution(
  bounds: CanvasTargetRect,
  screenshotRef: string,
): TargetResolution {
  return {
    kind: "visual_only",
    confidence: "low",
    bounds,
    screenshotRef,
  };
}

export function buildCanvasTargetMetadataScript(
  options: CanvasTargetMetadataScriptOptions = {},
) {
  const config = {
    screenshotRef: options.screenshotRef?.trim() || "canvas-preview-current",
    maxTargets: Math.max(1, Math.min(200, Math.floor(options.maxTargets ?? 80))),
  };
  return `
(() => {
  const config = ${JSON.stringify(config)};
  try {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const textSummary = (element) =>
      (element.getAttribute("aria-label") || element.textContent || "")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 160);
    const sourceFile = (element) =>
      element.getAttribute("data-canvas-source-file") ||
      element.getAttribute("data-source-file") ||
      "";
    const componentName = (element) =>
      element.getAttribute("data-canvas-component") ||
      element.getAttribute("data-canvas-component-name") ||
      element.getAttribute("data-component-name") ||
      "";
    const roleFor = (element) =>
      element.getAttribute("role") ||
      (element.tagName ? element.tagName.toLowerCase() : "");
    const targets = Array.from(document.querySelectorAll("[data-canvas-id]"))
      .slice(0, config.maxTargets)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const canvasId = (element.getAttribute("data-canvas-id") || "").trim();
        const bounds = {
          x: Math.max(0, rect.x),
          y: Math.max(0, rect.y),
          width: Math.max(0, rect.width),
          height: Math.max(0, rect.height),
          viewportWidth,
          viewportHeight
        };
        const elementRef = {
          canvasId,
          sourceFile: sourceFile(element) || undefined,
          componentName: componentName(element) || undefined
        };
        return {
          elementRef,
          resolution: {
            kind: "exact",
            confidence: "high",
            elementRef,
            bounds,
            screenshotRef: config.screenshotRef
          },
          tagName: element.tagName ? element.tagName.toLowerCase() : "",
          role: roleFor(element) || undefined,
          text: textSummary(element) || undefined
        };
      })
      .filter((target) => target.elementRef.canvasId && target.resolution.bounds.width > 0 && target.resolution.bounds.height > 0);
    return {
      ok: true,
      screenshotRef: config.screenshotRef,
      route: window.location.href,
      viewportWidth,
      viewportHeight,
      targets
    };
  } catch (error) {
    return {
      ok: false,
      status: "collection-failed",
      message: error instanceof Error ? error.message : String(error)
    };
  }
})();
`;
}
