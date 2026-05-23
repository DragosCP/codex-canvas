import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AppServerClient,
  type JsonRpcMessage,
  type ServerRequest,
} from "../appServerClient";
import type { AppServerSnapshot, ConnectionStatus, Model } from "../types";
import type { AccountRateLimitsUpdatedNotification } from "../../../../codex-rs/app-server-protocol/schema/typescript/v2/AccountRateLimitsUpdatedNotification";
import type { GetAccountRateLimitsResponse } from "../../../../codex-rs/app-server-protocol/schema/typescript/v2/GetAccountRateLimitsResponse";
import type { GetAccountResponse } from "../../../../codex-rs/app-server-protocol/schema/typescript/v2/GetAccountResponse";

type UseAppServerConnectionArgs = {
  appServerUrl: string;
  activeProjectPath: string | null;
  autoConnect: boolean;
  onNotification: (message: JsonRpcMessage) => void;
  onServerRequest: (message: ServerRequest) => void;
};

const startupDelayMs = 350;

export function useAppServerConnection({
  appServerUrl,
  activeProjectPath,
  autoConnect,
  onNotification,
  onServerRequest,
}: UseAppServerConnectionArgs) {
  const clientRef = useRef(new AppServerClient());
  const notificationRef = useRef(onNotification);
  const serverRequestRef = useRef(onServerRequest);
  const autoConnectStarted = useRef(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AppServerSnapshot>({
    config: null,
    configError: null,
    account: null,
    accountError: null,
    rateLimits: null,
    rateLimitsError: null,
    models: [],
    modelsError: null,
  });

  useEffect(() => {
    notificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    serverRequestRef.current = onServerRequest;
  }, [onServerRequest]);

  const refreshSettings = useCallback(
    async (cwd: string | null = activeProjectPath) => {
      if (!clientRef.current.connected) return;
      const [config, models, account, rateLimits] = await Promise.allSettled([
        clientRef.current.request("config/read", { includeLayers: false, cwd }),
        clientRef.current.request<{ data: Model[] }>("model/list", {
          includeHidden: false,
        }),
        clientRef.current.request<GetAccountResponse>("account/read", {
          refreshToken: false,
        }),
        clientRef.current.request<GetAccountRateLimitsResponse>(
          "account/rateLimits/read",
        ),
      ]);
      setSnapshot({
        config: config.status === "fulfilled" ? config.value : null,
        configError:
          config.status === "rejected" ? errorMessage(config.reason) : null,
        models: models.status === "fulfilled" ? models.value.data : [],
        modelsError:
          models.status === "rejected" ? errorMessage(models.reason) : null,
        account: account.status === "fulfilled" ? account.value : null,
        accountError:
          account.status === "rejected" ? errorMessage(account.reason) : null,
        rateLimits:
          rateLimits.status === "fulfilled" ? rateLimits.value : null,
        rateLimitsError:
          rateLimits.status === "rejected"
            ? errorMessage(rateLimits.reason)
            : null,
      });
    },
    [activeProjectPath],
  );

  const connect = useCallback(async () => {
    if (connectionStatus === "starting" || connectionStatus === "connecting") {
      return;
    }
    setConnectionStatus("starting");
    setConnectionError(null);
    try {
      await wait(startupDelayMs);
      setConnectionStatus("connecting");
      await clientRef.current.connect(appServerUrl);
      setConnectionStatus("connected");
      await refreshSettings(activeProjectPath);
    } catch (error) {
      setConnectionStatus("failed");
      setConnectionError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [activeProjectPath, appServerUrl, connectionStatus, refreshSettings]);

  useEffect(() => {
    const client = clientRef.current;
    const offNotification = client.onNotification((message) => {
      if (message.method === "account/rateLimits/updated") {
        updateRateLimitsSnapshot(
          message.params as AccountRateLimitsUpdatedNotification | undefined,
          setSnapshot,
        );
      }
      notificationRef.current(message);
    });
    const offServerRequest = client.onServerRequest((message) => {
      serverRequestRef.current(message);
    });
    return () => {
      offNotification();
      offServerRequest();
      client.close();
    };
  }, []);

  useEffect(() => {
    if (!autoConnect || autoConnectStarted.current) return;
    autoConnectStarted.current = true;
    void connect();
  }, [autoConnect, connect]);

  useEffect(() => {
    if (connectionStatus === "connected") {
      void refreshSettings(activeProjectPath);
    }
  }, [activeProjectPath, connectionStatus, refreshSettings]);

  return {
    client: clientRef.current,
    connectionStatus,
    connectionError,
    snapshot,
    connect,
    refreshSettings,
  };
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function updateRateLimitsSnapshot(
  params: AccountRateLimitsUpdatedNotification | undefined,
  setSnapshot: Dispatch<SetStateAction<AppServerSnapshot>>,
) {
  const rateLimits = params?.rateLimits;
  if (!rateLimits) return;
  const limitId = rateLimits.limitId ?? "codex";
  setSnapshot((current) => ({
    ...current,
    rateLimits: {
      rateLimits:
        limitId === "codex" || !current.rateLimits
          ? rateLimits
          : current.rateLimits.rateLimits,
      rateLimitsByLimitId: {
        ...(current.rateLimits?.rateLimitsByLimitId ?? {}),
        [limitId]: rateLimits,
      },
    },
    rateLimitsError: null,
  }));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
