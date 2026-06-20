export type VisualPatchTargetV0 = {
  canvasId: string;
};

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

export type VisualPatchValidationResult =
  | { ok: true; patch: VisualPatchV0 }
  | {
      ok: false;
      status: "invalid-patch" | "unsupported-op";
      message: string;
    };

export const VISUAL_PATCH_RUNTIME_GLOBAL = "__codexVisualPatchRuntime";

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
  if (!isRecord(candidate.target)) {
    return invalidPatch("Patch target must be an object.");
  }
  if (
    typeof candidate.target.canvasId !== "string" ||
    candidate.target.canvasId.trim().length === 0
  ) {
    return invalidPatch("Patch target requires a non-empty canvasId.");
  }
  if (candidate.op === "style") {
    if (!isRecord(candidate.css)) {
      return invalidPatch("Style patch requires a css object.");
    }
    const css: Record<string, string> = {};
    for (const [property, value] of Object.entries(candidate.css)) {
      if (!property.trim() || typeof value !== "string") {
        return invalidPatch("Style patch css values must be strings.");
      }
      css[property] = value;
    }
    if (Object.keys(css).length === 0) {
      return invalidPatch("Style patch requires at least one css property.");
    }
    return {
      ok: true,
      patch: {
        op: "style",
        target: { canvasId: candidate.target.canvasId },
        css,
      },
    };
  }
  if (typeof candidate.value !== "string") {
    return invalidPatch("Text patch requires a string value.");
  }
  return {
    ok: true,
    patch: {
      op: "text",
      target: { canvasId: candidate.target.canvasId },
      value: candidate.value,
    },
  };
}

export function buildVisualPatchInstallScript() {
  return `
(() => {
${VISUAL_PATCH_RUNTIME_SOURCE}
  return window.${VISUAL_PATCH_RUNTIME_GLOBAL}.state();
})();
`;
}

export function buildVisualPatchApplyScript(
  patchOrPatches: VisualPatchV0 | VisualPatchV0[],
) {
  return `
(() => {
${VISUAL_PATCH_RUNTIME_SOURCE}
  return window.${VISUAL_PATCH_RUNTIME_GLOBAL}.apply(${JSON.stringify(
    patchOrPatches,
  )});
})();
`;
}

export function buildVisualPatchClearScript() {
  return `
(() => {
${VISUAL_PATCH_RUNTIME_SOURCE}
  return window.${VISUAL_PATCH_RUNTIME_GLOBAL}.clear();
})();
`;
}

function invalidPatch(message: string): VisualPatchValidationResult {
  return { ok: false, status: "invalid-patch", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const VISUAL_PATCH_RUNTIME_SOURCE = String.raw`
  const globalName = "__codexVisualPatchRuntime";
  if (!window[globalName] || window[globalName].version !== 1) {
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
      if (patch.op !== "style" && patch.op !== "text") {
        return {
          ok: false,
          status: "unsupported-op",
          message: "VisualPatchV0 only supports style and text patches."
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

    const patchKey = (patch) => patch.op + ":" + patch.target.canvasId;

    const captureOriginal = (element, patch) => {
      if (patch.op === "text") {
        return { textContent: element.textContent || "" };
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
        element.textContent = patch.value;
        return;
      }
      for (const [property, rawValue] of Object.entries(patch.css)) {
        const cssProperty = toKebabCase(property);
        const value = normalizeCssValue(rawValue);
        element.style.setProperty(cssProperty, value.value, value.priority);
      }
    };

    const restoreOriginal = (element, record) => {
      if (record.patch.op === "text") {
        element.textContent = record.original.textContent;
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

    const applyOne = (patch, options = {}) => {
      const validation = validatePatch(patch);
      if (!validation.ok) return validation;
      const element = findTarget(patch.target.canvasId);
      if (!element) {
        return {
          ok: false,
          status: "missing-target",
          message: "No element found for data-canvas-id '" + patch.target.canvasId + "'.",
          canvasId: patch.target.canvasId
        };
      }
      const key = patchKey(patch);
      const existing = active.get(key);
      const record = existing || {
        patch,
        original: captureOriginal(element, patch),
        appliedCount: 0
      };
      if (existing && patch.op === "style") {
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
      }
      record.patch = patch;
      active.set(key, record);
      applyPatchToElement(element, patch);
      record.appliedCount += 1;
      if (options.ensureObserver !== false) ensureObserver();
      return {
        ok: true,
        status: options.reapply ? "reapplied" : "applied",
        canvasId: patch.target.canvasId,
        op: patch.op,
        appliedCount: record.appliedCount
      };
    };

    const reapplyActive = () => {
      for (const record of active.values()) {
        applyOne(record.patch, { reapply: true, ensureObserver: false });
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
      version: 1,
      apply(patchOrPatches) {
        const patches = Array.isArray(patchOrPatches) ? patchOrPatches : [patchOrPatches];
        const results = patches.map((patch) => applyOne(patch));
        return {
          ok: results.every((result) => result.ok),
          status: results.every((result) => result.ok) ? "applied" : "partial",
          results,
          activeCount: active.size
        };
      },
      clear() {
        const results = [];
        for (const [key, record] of active.entries()) {
          const element = findTarget(record.patch.target.canvasId);
          if (element) {
            restoreOriginal(element, record);
            results.push({
              ok: true,
              status: "cleared",
              canvasId: record.patch.target.canvasId,
              op: record.patch.op
            });
          } else {
            results.push({
              ok: true,
              status: "cleared-missing-target",
              canvasId: record.patch.target.canvasId,
              op: record.patch.op
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
          version: 1,
          activeCount: active.size,
          active: Array.from(active.values()).map((record) => ({
            canvasId: record.patch.target.canvasId,
            op: record.patch.op,
            appliedCount: record.appliedCount
          }))
        };
      }
    };
  }
`;
