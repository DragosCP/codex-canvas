import { CheckCircle2, CircleAlert, CircleHelp } from "lucide-react";
import type { RuntimeInfo } from "../runtime";
import type { AppServerSnapshot } from "../types";

export function SettingsPanel(props: {
  runtime: RuntimeInfo;
  snapshot: AppServerSnapshot;
}) {
  const auth = describeAuth(props.snapshot);
  return (
    <div className="settings-surface">
      <section className={`status-card ${auth.tone}`}>
        <div>
          <p className="eyebrow">Account</p>
          <h3>{auth.title}</h3>
          <p>{auth.detail}</p>
        </div>
        <StatusIcon tone={auth.tone} />
      </section>

      <section className="settings-section">
        <h3>Runtime</h3>
        <dl>
          <dt>Local runner</dt>
          <dd>{runtimeModeLabel(props.runtime.backendMode)}</dd>
          <dt>Status</dt>
          <dd>{props.runtime.backendLabel}</dd>
          <dt>Folder format</dt>
          <dd>{props.runtime.projectPathHint}</dd>
        </dl>
      </section>

      <section className="settings-section">
        <h3>Model Access</h3>
        {props.snapshot.modelsError ? (
          <p className="error-line">{props.snapshot.modelsError}</p>
        ) : (
          <p>
            {props.snapshot.models.length > 0
              ? `${props.snapshot.models.length} model options loaded.`
              : "No model list loaded yet."}
          </p>
        )}
        {props.snapshot.rateLimitsError && (
          <p className="muted">{props.snapshot.rateLimitsError}</p>
        )}
        {props.snapshot.rateLimits?.rateLimits && (
          <RateLimitSummary snapshot={props.snapshot.rateLimits.rateLimits} />
        )}
      </section>

      <section className="settings-section">
        <h3>Config Read</h3>
        {props.snapshot.configError ? (
          <p className="error-line">{props.snapshot.configError}</p>
        ) : (
          <p>
            {props.snapshot.config
              ? "Config loaded from the active app-server runtime."
              : "Config has not loaded yet."}
          </p>
        )}
      </section>
    </div>
  );
}

function StatusIcon(props: { tone: "ok" | "warn" | "unknown" }) {
  if (props.tone === "ok") return <CheckCircle2 size={24} />;
  if (props.tone === "warn") return <CircleAlert size={24} />;
  return <CircleHelp size={24} />;
}

function describeAuth(snapshot: AppServerSnapshot): {
  title: string;
  detail: string;
  tone: "ok" | "warn" | "unknown";
} {
  if (snapshot.accountError) {
    return {
      title: "Account state unavailable",
      detail: snapshot.accountError,
      tone: "warn",
    };
  }

  if (!snapshot.account) {
    return {
      title: "Checking account",
      detail: "Waiting for account/read from app-server.",
      tone: "unknown",
    };
  }

  const { account, requiresOpenaiAuth } = snapshot.account;
  if (account?.type === "chatgpt") {
    return {
      title: "Signed in with ChatGPT",
      detail: `${account.email} - ${account.planType}`,
      tone: "ok",
    };
  }

  if (account?.type === "apiKey") {
    return {
      title: "Signed in with API key",
      detail: "The app-server has an API key credential. The key is not shown.",
      tone: "ok",
    };
  }

  if (account?.type === "amazonBedrock") {
    return {
      title: "Using Amazon Bedrock",
      detail: "OpenAI account auth is not the active credential path.",
      tone: "ok",
    };
  }

  if (requiresOpenaiAuth) {
    return {
      title: "Not signed in",
      detail:
        "OpenAI-hosted models require Codex login before live prompts can run.",
      tone: "warn",
    };
  }

  return {
    title: "No OpenAI auth required",
    detail: "The active model provider can run without OpenAI credentials.",
    tone: "ok",
  };
}

function runtimeModeLabel(mode: RuntimeInfo["backendMode"]) {
  switch (mode) {
    case "mock-dev":
      return "Mock demo backend";
    case "real-wsl":
      return "WSL project runner";
    case "real-native":
      return "Native project runner";
    case "external":
      return "External project runner";
  }
}

function RateLimitSummary(props: {
  snapshot: NonNullable<AppServerSnapshot["rateLimits"]>["rateLimits"];
}) {
  return (
    <div className="quota-grid">
      <QuotaCell label="Primary" used={props.snapshot.primary?.usedPercent} />
      <QuotaCell
        label="Weekly"
        used={props.snapshot.secondary?.usedPercent}
      />
      <div>
        <span>Credits</span>
        <strong>
          {props.snapshot.credits?.unlimited
            ? "Unlimited"
            : props.snapshot.credits?.hasCredits
              ? "Available"
              : "None"}
        </strong>
      </div>
      <div>
        <span>Limit</span>
        <strong>{props.snapshot.rateLimitReachedType ?? "OK"}</strong>
      </div>
    </div>
  );
}

function QuotaCell(props: { label: string; used?: number }) {
  return (
    <div>
      <span>{props.label}</span>
      <strong>{props.used === undefined ? "Unknown" : `${props.used}%`}</strong>
    </div>
  );
}
