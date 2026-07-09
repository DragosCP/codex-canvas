import { useCallback, useEffect, useState } from "react";

export type PreviewToolbarDensity =
  | "full"
  | "balanced"
  | "compact"
  | "collapsed";

export function usePreviewToolbarDensity(options?: {
  balancedMax?: number;
  collapsedMax?: number;
  compactMax?: number;
  fallbackWidth?: number;
}) {
  const fallbackWidth = options?.fallbackWidth ?? 1280;
  const collapsedMax = options?.collapsedMax ?? 820;
  const compactMax = options?.compactMax ?? 1020;
  const balancedMax = options?.balancedMax ?? 1280;
  const [toolbarElement, setToolbarElement] = useState<HTMLElement | null>(null);
  const [toolbarWidth, setToolbarWidth] = useState(fallbackWidth);
  const toolbarRef = useCallback((node: HTMLElement | null) => {
    setToolbarElement(node);
  }, []);

  useEffect(() => {
    if (!toolbarElement) return;
    const updateWidth = () => {
      setToolbarWidth(toolbarElement.clientWidth || fallbackWidth);
    };
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateWidth);
    observer.observe(toolbarElement);
    return () => observer.disconnect();
  }, [fallbackWidth, toolbarElement]);

  const density =
    toolbarWidth < collapsedMax
      ? "collapsed"
      : toolbarWidth < compactMax
      ? "compact"
      : toolbarWidth < balancedMax
        ? "balanced"
        : "full";

  return { density, toolbarRef, toolbarWidth };
}
