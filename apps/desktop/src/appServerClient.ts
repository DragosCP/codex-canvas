type JsonRpcId = string | number;

export type JsonRpcMessage = {
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type ServerRequest = Required<Pick<JsonRpcMessage, "id" | "method">> & {
  params?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const connectTimeoutMs = 8000;
const initializeTimeoutMs = 8000;

export class AppServerClient {
  private socket: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<JsonRpcId, PendingRequest>();
  private notificationListeners = new Set<(message: JsonRpcMessage) => void>();
  private serverRequestListeners = new Set<(message: ServerRequest) => void>();

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async connect(url: string) {
    this.close();
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) =>
      this.handleMessage(event.data),
    );
    this.socket.addEventListener("close", () => {
      this.rejectPending(new Error("Connection closed"));
    });
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        if (!this.socket) {
          reject(new Error("socket not created"));
          return;
        }
        let opened = false;
        this.socket.addEventListener(
          "open",
          () => {
            opened = true;
            resolve();
          },
          { once: true },
        );
        this.socket.addEventListener(
          "error",
          () => reject(new Error(`Unable to connect to ${url}`)),
          {
            once: true,
          },
        );
        this.socket.addEventListener(
          "close",
          () => {
            if (!opened) reject(new Error(`Connection closed by ${url}`));
          },
          { once: true },
        );
      }),
      connectTimeoutMs,
      `Timed out connecting to ${url}`,
    );
    await withTimeout(
      this.request("initialize", {
        clientInfo: {
          name: "codex_desktop_v1",
          title: "Codex Desktop V1",
          version: "0.1.0",
        },
        capabilities: { experimentalApi: true, requestAttestation: false },
      }),
      initializeTimeoutMs,
      `Timed out initializing ${url}`,
    );
    this.notify("initialized");
  }

  close() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.rejectPending(new Error("Connection closed"));
  }

  onNotification(listener: (message: JsonRpcMessage) => void) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onServerRequest(listener: (message: ServerRequest) => void) {
    this.serverRequestListeners.add(listener);
    return () => this.serverRequestListeners.delete(listener);
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Not connected to app-server"));
    }
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
  }

  notify(method: string, params?: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(
      JSON.stringify(params === undefined ? { method } : { method, params }),
    );
  }

  respond(id: JsonRpcId, result: unknown) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ id, result }));
  }

  reject(id: JsonRpcId, code: number, message: string) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ id, error: { code, message } }));
  }

  private handleMessage(raw: string) {
    const message = JSON.parse(raw) as JsonRpcMessage;
    if (message.id !== undefined && message.method) {
      for (const listener of this.serverRequestListeners) {
        listener(message as ServerRequest);
      }
      return;
    }
    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (!pending) return;
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    for (const listener of this.notificationListeners) {
      listener(message);
    }
  }

  private rejectPending(error: Error) {
    for (const request of this.pending.values()) {
      request.reject(error);
    }
    this.pending.clear();
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
