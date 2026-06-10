import {
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  X,
} from "lucide-react";
import type { FormEvent } from "react";
import type { AppServerSnapshot, ConnectionStatus } from "../types";

export type AuthDialogPhase =
  | "choose"
  | "starting"
  | "browser"
  | "deviceCode"
  | "apiKey"
  | "savingApiKey"
  | "success";

export type AuthDialogState = {
  open: boolean;
  phase: AuthDialogPhase;
  loginId: string | null;
  authUrl: string | null;
  verificationUrl: string | null;
  userCode: string | null;
  apiKey: string;
  error: string | null;
};

export function closedAuthDialogState(): AuthDialogState {
  return {
    open: false,
    phase: "choose",
    loginId: null,
    authUrl: null,
    verificationUrl: null,
    userCode: null,
    apiKey: "",
    error: null,
  };
}

export function AuthDialog(props: {
  state: AuthDialogState;
  snapshot: AppServerSnapshot;
  connectionStatus: ConnectionStatus;
  onApiKeyChange: (value: string) => void;
  onClose: () => void;
  onCopyText: (value: string) => void;
  onOpenUrl: (url: string) => void;
  onStartApiKey: () => void;
  onStartChatgpt: () => void;
  onStartDeviceCode: () => void;
  onSubmitApiKey: () => void;
}) {
  if (!props.state.open) return null;

  const connected = props.connectionStatus === "connected";
  const signedIn = props.snapshot.account?.account;
  const busy =
    props.state.phase === "starting" || props.state.phase === "savingApiKey";
  const primaryDisabled = !connected || busy;

  function submitApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    props.onSubmitApiKey();
  }

  return (
    <div
      className="auth-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <header className="auth-dialog-header">
          <div>
            <p className="eyebrow">Account</p>
            <h2 id="auth-dialog-title">Connect Codex</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close account dialog"
            onClick={props.onClose}
          >
            <X size={17} />
          </button>
        </header>

        <div className="auth-state-strip">
          {signedIn ? (
            <>
              <CheckCircle2 size={18} />
              <span>{accountLabel(props.snapshot)}</span>
            </>
          ) : props.state.error ? (
            <>
              <CircleAlert size={18} />
              <span>{props.state.error}</span>
            </>
          ) : (
            <>
              <ShieldCheck size={18} />
              <span>{authStatusLabel(props.connectionStatus)}</span>
            </>
          )}
        </div>

        {(props.state.phase === "choose" ||
          props.state.phase === "starting" ||
          props.state.phase === "success") && (
          <div className="auth-option-list">
            <button
              type="button"
              className="auth-option primary"
              disabled={primaryDisabled}
              onClick={props.onStartChatgpt}
            >
              <MessageCircle size={18} />
              <span>
                <strong>Continue with ChatGPT</strong>
                <small>Use the browser account already signed in.</small>
              </span>
              {props.state.phase === "starting" ? (
                <Loader2 className="spin" size={16} />
              ) : (
                <ExternalLink size={16} />
              )}
            </button>

            <button
              type="button"
              className="auth-option"
              disabled={primaryDisabled}
              onClick={props.onStartDeviceCode}
            >
              <MonitorSmartphone size={18} />
              <span>
                <strong>Use device code</strong>
                <small>Enter a one-time code in the browser.</small>
              </span>
              <ExternalLink size={16} />
            </button>

            <button
              type="button"
              className="auth-option"
              disabled={primaryDisabled}
              onClick={props.onStartApiKey}
            >
              <KeyRound size={18} />
              <span>
                <strong>Use API key</strong>
                <small>Store a local OpenAI Platform credential.</small>
              </span>
            </button>
          </div>
        )}

        {props.state.phase === "browser" && (
          <div className="auth-wait-panel">
            <Loader2 className="spin" size={24} />
            <h3>Finish in browser</h3>
            <p>
              After ChatGPT confirms the account, Codex will update this window.
            </p>
            <div className="auth-dialog-actions">
              <button
                type="button"
                onClick={() =>
                  props.state.authUrl && props.onOpenUrl(props.state.authUrl)
                }
                disabled={!props.state.authUrl}
              >
                <ExternalLink size={15} /> Open again
              </button>
              <button type="button" onClick={props.onStartDeviceCode}>
                <MonitorSmartphone size={15} /> Device code
              </button>
            </div>
          </div>
        )}

        {props.state.phase === "deviceCode" && (
          <div className="auth-device-panel">
            <p className="eyebrow">Device code</p>
            <button
              type="button"
              className="auth-code"
              onClick={() =>
                props.state.userCode && props.onCopyText(props.state.userCode)
              }
              title="Copy code"
            >
              {props.state.userCode}
              <Copy size={16} />
            </button>
            <div className="auth-dialog-actions">
              <button
                type="button"
                onClick={() =>
                  props.state.verificationUrl &&
                  props.onOpenUrl(props.state.verificationUrl)
                }
                disabled={!props.state.verificationUrl}
              >
                <ExternalLink size={15} /> Open page
              </button>
              <button
                type="button"
                onClick={() =>
                  props.state.verificationUrl &&
                  props.onCopyText(props.state.verificationUrl)
                }
                disabled={!props.state.verificationUrl}
              >
                <Copy size={15} /> Copy link
              </button>
            </div>
            <p className="muted compact">
              Keep this dialog open until Codex reports the account is connected.
            </p>
          </div>
        )}

        {(props.state.phase === "apiKey" ||
          props.state.phase === "savingApiKey") && (
          <form className="auth-api-form" onSubmit={submitApiKey}>
            <label htmlFor="auth-api-key">API key</label>
            <input
              id="auth-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={props.state.apiKey}
              onChange={(event) => props.onApiKeyChange(event.target.value)}
              placeholder="sk-..."
              disabled={props.state.phase === "savingApiKey"}
            />
            <div className="auth-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  props.onApiKeyChange("");
                  props.onStartChatgpt();
                }}
                disabled={props.state.phase === "savingApiKey"}
              >
                <MessageCircle size={15} /> ChatGPT
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={
                  props.state.phase === "savingApiKey" ||
                  props.state.apiKey.trim().length === 0
                }
              >
                {props.state.phase === "savingApiKey" ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <KeyRound size={15} />
                )}
                Save key
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function authStatusLabel(status: ConnectionStatus) {
  switch (status) {
    case "connected":
      return "Ready to sign in.";
    case "starting":
    case "connecting":
      return "Waiting for Codex runtime.";
    case "failed":
      return "Codex runtime is not connected.";
    case "disconnected":
      return "Codex runtime is disconnected.";
  }
}

function accountLabel(snapshot: AppServerSnapshot) {
  const account = snapshot.account?.account;
  if (account?.type === "chatgpt") {
    return `Signed in as ${account.email}.`;
  }
  if (account?.type === "apiKey") {
    return "Signed in with API key.";
  }
  if (account?.type === "amazonBedrock") {
    return "Using Amazon Bedrock.";
  }
  return "Connected.";
}
