import type { ThreadTokenUsage } from "./types";

export type ContextMeterDetails = {
  available: boolean;
  percent: number;
  percentLabel: string;
  tokenLabel: string;
  ariaLabel: string;
};

export function contextDetails(
  usage: ThreadTokenUsage | null,
): ContextMeterDetails {
  const activeTokens = usage?.last.totalTokens ?? null;
  const contextWindow = usage?.modelContextWindow ?? null;
  if (
    activeTokens === null ||
    contextWindow === null ||
    activeTokens < 0 ||
    contextWindow <= 0 ||
    activeTokens > contextWindow
  ) {
    return unknownContextDetails();
  }

  const percent = Math.max(0, (activeTokens / contextWindow) * 100);
  const percentLabel = `${Math.round(percent)}% full`;
  const tokenLabel = `${formatTokenCount(activeTokens)} / ${formatTokenCount(
    contextWindow,
  )} tokens used`;
  return {
    available: true,
    percent,
    percentLabel,
    tokenLabel,
    ariaLabel: `Context window: ${percentLabel}, ${tokenLabel}. Codex automatically compacts its context.`,
  };
}

function unknownContextDetails(): ContextMeterDetails {
  return {
    available: false,
    percent: 0,
    percentLabel: "Usage unavailable",
    tokenLabel: "Token usage unknown",
    ariaLabel: "Context window usage unavailable",
  };
}

function formatTokenCount(value: number) {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString();
}
