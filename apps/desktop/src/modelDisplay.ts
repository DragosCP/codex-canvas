import type { AppServerSnapshot, ProjectSettings } from "./types";

export type ModelDisplay = {
  label: string;
  title: string;
  tone: "ready" | "loading" | "error";
};

export function resolveModelDisplay(
  snapshot: AppServerSnapshot,
  settings: ProjectSettings,
): ModelDisplay {
  if (settings.model) {
    return {
      label: modelDisplayName(snapshot, settings.model),
      title: "Selected for this project",
      tone: "ready",
    };
  }

  if (snapshot.modelsError || snapshot.configError) {
    return {
      label: "Model unavailable",
      title:
        snapshot.modelsError ?? snapshot.configError ?? "Model unavailable",
      tone: "error",
    };
  }

  if (!snapshot.config) {
    return {
      label: "Loading model...",
      title: "Reading model settings",
      tone: "loading",
    };
  }

  const configuredModel = configModel(snapshot.config);
  if (configuredModel) {
    return {
      label: modelDisplayName(snapshot, configuredModel),
      title: "Using the model from Codex settings",
      tone: "ready",
    };
  }

  return {
    label: "Auto model",
    title: "Codex will choose the configured default model",
    tone: "ready",
  };
}

function modelDisplayName(snapshot: AppServerSnapshot, modelId: string) {
  return (
    snapshot.models.find((model) => model.model === modelId)?.displayName ??
    modelId
  );
}

function configModel(config: unknown) {
  if (!config || typeof config !== "object") return null;
  const maybeConfig = "config" in config ? config.config : null;
  if (!maybeConfig || typeof maybeConfig !== "object") return null;
  const model = "model" in maybeConfig ? maybeConfig.model : null;
  return typeof model === "string" && model.length > 0 ? model : null;
}
