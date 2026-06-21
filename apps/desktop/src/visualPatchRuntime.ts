import type { ElementRef } from "./canvasTargeting";

export type VisualPatchTargetV0 = {
  canvasId: string;
};

export type VisualPatchStyle = {
  op: "style";
  target: ElementRef;
  css: Record<string, string>;
};

export type VisualPatchText = {
  op: "text";
  target: ElementRef;
  value: string;
};

export type VisualPatchHide = {
  op: "hide";
  target: ElementRef;
};

export type VisualPatchShow = {
  op: "show";
  target: ElementRef;
};

export type VisualPatch = VisualPatchStyle | VisualPatchText | VisualPatchHide | VisualPatchShow;

export type VisualPatchStyleV0 = {
  op: "style";
  target: VisualPatchTargetV0;
  css: Record<string, string>;
};

export type VisualPatchTextV0 = {
  op: "text";
  target: VisualPatchTargetV0;
  value: string;
};

export type VisualPatchV0 = VisualPatchStyleV0 | VisualPatchTextV0;

export type VisualPatchBundle = {
  id?: string;
  patches: VisualPatch[];
};

export type VisualPatchInput = VisualPatch | VisualPatch[] | VisualPatchBundle;

type VisualPatchInvalidResult = {
  ok: false;
  status: "invalid-patch";
  message: string;
};

export type VisualPatchValidationResult =
  | { ok: true; patch: VisualPatch }
  | VisualPatchInvalidResult
  | {
      ok: false;
      status: "unsupported-op";
      message: string;
    };

export const VISUAL_PATCH_RUNTIME_GLOBAL = "__codexVisualPatchRuntime";

export function validateVisualPatch(candidate: unknown): VisualPatchValidationResult {
  if (!isRecord(candidate)) {
    return invalidPatch("Patch must be an object.");
  }
  if (
    candidate.op !== "style" &&
    candidate.op !== "text" &&
    candidate.op !== "hide" &&
    candidate.op !== "show"
  ) {
    return {
      ok: false,
      status: "unsupported-op",
      message: "VisualPatch only supports style, text, hide, and show patches.",
    };
  }
  const target = validateTarget(candidate.target);
  if (!target.ok) {
    return target;
  }
  if (candidate.op === "style") {
    const css = validateCss(candidate.css);
    if (!css.ok) {
      return css;
    }
    return {
      ok: true,
      patch: {
        op: "style",
        target: target.target,
        css: css.css,
      },
    };
  }
  if (candidate.op === "text") {
    if (typeof candidate.value !== "string") {
      return invalidPatch("Text patch requires a string value.");
    }
    return {
      ok: true,
      patch: {
        op: "text",
        target: target.target,
        value: candidate.value,
      },
    };
  }
  return {
    ok: true,
    patch: {
      op: candidate.op,
      target: target.target,
    },
  };
}

export function validateVisualPatchV0(
  candidate: unknown,
): VisualPatchValidationResult {
  if (!isRecord(candidate)) {
    return invalidPatch("Patch must be an object.");
  }
  if (candidate.op !== "style" && candidate.op !== "text") {
    return {
      ok: false,
      status: "unsupported-op",
      message: "VisualPatchV0 only supports style and text patches.",
    };
  }
  return validateVisualPatch(candidate);
}

export function normalizeVisualPatchBundle(
  candidate: unknown,
  fallbackId?: string,
): VisualPatchBundle | null {
  if (!isRecord(candidate) || !Array.isArray(candidate.patches)) {
    return null;
  }
  const patches: VisualPatch[] = [];
  for (const patch of candidate.patches.slice(0, 20)) {
    const result = validateVisualPatch(patch);
    if (!result.ok) return null;
    patches.push(result.patch);
  }
  if (patches.length === 0) {
    return null;
  }
  const id =
    typeof candidate.id === "string" && candidate.id.trim()
      ? candidate.id.trim()
      : fallbackId?.trim() || undefined;
  return id ? { id, patches } : { patches };
}

export function buildVisualPatchInstallScript() {
  return `
(() => {
${VISUAL_PATCH_RUNTIME_SOURCE}
  return window.${VISUAL_PATCH_RUNTIME_GLOBAL}.state();
})();
`;
}

export function buildVisualPatchApplyScript(patchInput: VisualPatchInput) {
  return `
(() => {
${VISUAL_PATCH_RUNTIME_SOURCE}
  return window.${VISUAL_PATCH_RUNTIME_GLOBAL}.apply(${JSON.stringify(
    patchInput,
  )});
})();
`;
}

export function buildVisualPatchClearScript(bundleId?: string) {
  return `
(() => {
${VISUAL_PATCH_RUNTIME_SOURCE}
  return window.${VISUAL_PATCH_RUNTIME_GLOBAL}.clear(${JSON.stringify(
    bundleId,
  )});
})();
`;
}

function validateTarget(value: unknown):
  | { ok: true; target: ElementRef }
  | {
      ok: false;
      status: "invalid-patch";
      message: string;
    } {
  if (!isRecord(value)) {
    return invalidPatch("Patch target must be an object.");
  }
  if (
    typeof value.canvasId !== "string" ||
    value.canvasId.trim().length === 0
  ) {
    return invalidPatch("Patch target requires a non-empty canvasId.");
  }
  const target: ElementRef = { canvasId: value.canvasId };
  if (typeof value.sourceFile === "string" && value.sourceFile.trim()) {
    target.sourceFile = value.sourceFile;
  }
  if (
    typeof value.componentName === "string" &&
    value.componentName.trim()
  ) {
    target.componentName = value.componentName;
  }
  return { ok: true, target };
}

function validateCss(value: unknown):
  | { ok: true; css: Record<string, string> }
  | {
      ok: false;
      status: "invalid-patch";
      message: string;
    } {
  if (!isRecord(value)) {
    return invalidPatch("Style patch requires a css object.");
  }
  const css: Record<string, string> = {};
  for (const [property, cssValue] of Object.entries(value)) {
    if (!property.trim() || typeof cssValue !== "string") {
      return invalidPatch("Style patch css values must be strings.");
    }
    css[property] = cssValue;
  }
  if (Object.keys(css).length === 0) {
    return invalidPatch("Style patch requires at least one css property.");
  }
  return { ok: true, css };
}

function invalidPatch(message: string): VisualPatchInvalidResult {
  return { ok: false, status: "invalid-patch", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const VISUAL_PATCH_RUNTIME_SOURCE = String.raw`
  const globalName = "__codexVisualPatchRuntime";
  const runtimeVersion = 2;
  if (!window[globalName] || window[globalName].version !== runtimeVersion) {
    const active = new Map();
    let observer = null;
    let scheduled = false;

    const isObject = (value) =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value);

    const toKebabCase = (property) =>
      String(property)
        .trim()
        .replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());

    const normalizeCssValue = (value) => {
      const text = String(value);
      const important = /\s*!important\s*$/i.test(text);
      return {
        value: important ? text.replace(/\s*!important\s*$/i, "") : text,
        priority: important ? "important" : "",
      };
    };

    const normalizeBundleId = (bundleId) => {
      if (typeof bundleId !== "string" || !bundleId.trim()) {
        return "default";
      }
      return bundleId.trim();
    };

    const normalizePatchInput = (input) => {
      if (isObject(input) && Array.isArray(input.patches)) {
        const bundleId = normalizeBundleId(input.id);
        return input.patches.map((patch) => ({ patch, bundleId }));
      }
      const patches = Array.isArray(input) ? input : [input];
      return patches.map((patch) => ({ patch, bundleId: "default" }));
    };

    const findTarget = (canvasId) => {
      const targets = document.querySelectorAll("[data-canvas-id]");
      for (const element of targets) {
        if (element.getAttribute("data-canvas-id") === canvasId) {
          return element;
        }
      }
      return null;
    };

    const validatePatch = (patch) => {
      if (!isObject(patch)) {
        return { ok: false, status: "invalid-patch", message: "Patch must be an object." };
      }
      if (patch.op !== "style" && patch.op !== "text" && patch.op !== "hide" && patch.op !== "show") {
        return {
          ok: false,
          status: "unsupported-op",
          message: "VisualPatch only supports style, text, hide, and show patches."
        };
      }
      if (!isObject(patch.target) || typeof patch.target.canvasId !== "string" || !patch.target.canvasId.trim()) {
        return {
          ok: false,
          status: "invalid-patch",
          message: "Patch target requires a non-empty canvasId."
        };
      }
      if (patch.op === "style") {
        if (!isObject(patch.css) || Object.keys(patch.css).length === 0) {
          return {
            ok: false,
            status: "invalid-patch",
            message: "Style patch requires a non-empty css object."
          };
        }
        for (const [property, value] of Object.entries(patch.css)) {
          if (!String(property).trim() || typeof value !== "string") {
            return {
              ok: false,
              status: "invalid-patch",
              message: "Style patch css values must be strings."
            };
          }
        }
      }
      if (patch.op === "text" && typeof patch.value !== "string") {
        return {
          ok: false,
          status: "invalid-patch",
          message: "Text patch requires a string value."
        };
      }
      return { ok: true };
    };

    const patchKey = (bundleId, patch) =>
      bundleId + ":" + patch.op + ":" + patch.target.canvasId;

    const captureVisibility = (element) => ({
      hidden: Boolean(element.hidden),
      ariaHidden: element.getAttribute("aria-hidden"),
      display: {
        value: element.style.getPropertyValue("display"),
        priority: element.style.getPropertyPriority("display")
      }
    });

    const captureOriginal = (element, patch) => {
      if (patch.op === "text") {
        return { textContent: element.textContent || "" };
      }
      if (patch.op === "hide" || patch.op === "show") {
        return { visibility: captureVisibility(element) };
      }
      const style = {};
      for (const property of Object.keys(patch.css)) {
        const cssProperty = toKebabCase(property);
        style[cssProperty] = {
          value: element.style.getPropertyValue(cssProperty),
          priority: element.style.getPropertyPriority(cssProperty)
        };
      }
      return { style };
    };

    const applyPatchToElement = (element, patch) => {
      if (patch.op === "text") {
        if (element.textContent !== patch.value) {
          element.textContent = patch.value;
        }
        return;
      }
      if (patch.op === "hide") {
        if (!element.hidden) {
          element.hidden = true;
        }
        if (element.getAttribute("aria-hidden") !== "true") {
          element.setAttribute("aria-hidden", "true");
        }
        return;
      }
      if (patch.op === "show") {
        if (element.hidden) {
          element.hidden = false;
        }
        if (element.hasAttribute("aria-hidden")) {
          element.removeAttribute("aria-hidden");
        }
        if (element.style.getPropertyValue("display") === "none") {
          element.style.removeProperty("display");
        }
        return;
      }
      for (const [property, rawValue] of Object.entries(patch.css)) {
        const cssProperty = toKebabCase(property);
        const value = normalizeCssValue(rawValue);
        if (
          element.style.getPropertyValue(cssProperty) === value.value &&
          element.style.getPropertyPriority(cssProperty) === value.priority
        ) {
          continue;
        }
        element.style.setProperty(cssProperty, value.value, value.priority);
      }
    };

    const restoreOriginal = (element, record) => {
      if (record.patch.op === "text") {
        element.textContent = record.original.textContent;
        return;
      }
      if (record.patch.op === "hide" || record.patch.op === "show") {
        const visibility = record.original.visibility || {};
        element.hidden = Boolean(visibility.hidden);
        if (visibility.ariaHidden === null || typeof visibility.ariaHidden === "undefined") {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", visibility.ariaHidden);
        }
        const display = visibility.display || {};
        if (display.value) {
          element.style.setProperty("display", display.value, display.priority || "");
        } else {
          element.style.removeProperty("display");
        }
        return;
      }
      for (const [property, original] of Object.entries(record.original.style || {})) {
        if (original.value) {
          element.style.setProperty(property, original.value, original.priority || "");
        } else {
          element.style.removeProperty(property);
        }
      }
    };

    const extendOriginalForStyle = (record, element, patch) => {
      record.original.style = record.original.style || {};
      for (const property of Object.keys(patch.css)) {
        const cssProperty = toKebabCase(property);
        if (Object.prototype.hasOwnProperty.call(record.original.style, cssProperty)) {
          continue;
        }
        record.original.style[cssProperty] = {
          value: element.style.getPropertyValue(cssProperty),
          priority: element.style.getPropertyPriority(cssProperty)
        };
      }
    };

    const applyOne = (patch, bundleId, options = {}) => {
      const validation = validatePatch(patch);
      if (!validation.ok) return validation;
      const normalizedBundleId = normalizeBundleId(bundleId);
      const element = findTarget(patch.target.canvasId);
      if (!element) {
        return {
          ok: false,
          status: "missing-target",
          message: "No element found for data-canvas-id '" + patch.target.canvasId + "'.",
          canvasId: patch.target.canvasId,
          bundleId: normalizedBundleId
        };
      }
      const key = patchKey(normalizedBundleId, patch);
      const existing = active.get(key);
      const record = existing || {
        bundleId: normalizedBundleId,
        patch,
        original: captureOriginal(element, patch),
        appliedCount: 0
      };
      if (existing && patch.op === "style") {
        extendOriginalForStyle(record, element, patch);
      }
      record.patch = patch;
      record.bundleId = normalizedBundleId;
      active.set(key, record);
      applyPatchToElement(element, patch);
      record.appliedCount += 1;
      if (options.ensureObserver !== false) ensureObserver();
      return {
        ok: true,
        status: options.reapply ? "reapplied" : "applied",
        canvasId: patch.target.canvasId,
        op: patch.op,
        bundleId: normalizedBundleId,
        appliedCount: record.appliedCount
      };
    };

    const reapplyActive = () => {
      for (const record of active.values()) {
        applyOne(record.patch, record.bundleId, { reapply: true, ensureObserver: false });
      }
    };

    const scheduleReapply = () => {
      if (scheduled || active.size === 0) return;
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        reapplyActive();
      });
    };

    function ensureObserver() {
      if (observer || typeof MutationObserver !== "function" || !document.documentElement) {
        return;
      }
      observer = new MutationObserver(scheduleReapply);
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    const disconnectObserverIfIdle = () => {
      if (active.size !== 0 || !observer) return;
      observer.disconnect();
      observer = null;
      scheduled = false;
    };

    window[globalName] = {
      version: runtimeVersion,
      apply(patchInput) {
        const entries = normalizePatchInput(patchInput);
        const results = entries.map((entry) => applyOne(entry.patch, entry.bundleId));
        return {
          ok: results.every((result) => result.ok),
          status: results.every((result) => result.ok) ? "applied" : "partial",
          results,
          activeCount: active.size
        };
      },
      clear(bundleId) {
        const normalizedBundleId =
          typeof bundleId === "string" && bundleId.trim() ? bundleId.trim() : null;
        const results = [];
        for (const [key, record] of Array.from(active.entries())) {
          if (normalizedBundleId && record.bundleId !== normalizedBundleId) {
            continue;
          }
          const element = findTarget(record.patch.target.canvasId);
          if (element) {
            restoreOriginal(element, record);
            results.push({
              ok: true,
              status: "cleared",
              canvasId: record.patch.target.canvasId,
              op: record.patch.op,
              bundleId: record.bundleId
            });
          } else {
            results.push({
              ok: true,
              status: "cleared-missing-target",
              canvasId: record.patch.target.canvasId,
              op: record.patch.op,
              bundleId: record.bundleId
            });
          }
          active.delete(key);
        }
        disconnectObserverIfIdle();
        return {
          ok: true,
          status: "cleared",
          results,
          activeCount: active.size
        };
      },
      state() {
        return {
          ok: true,
          version: runtimeVersion,
          activeCount: active.size,
          active: Array.from(active.values()).map((record) => ({
            canvasId: record.patch.target.canvasId,
            op: record.patch.op,
            bundleId: record.bundleId,
            appliedCount: record.appliedCount
          }))
        };
      }
    };
  }
`;
