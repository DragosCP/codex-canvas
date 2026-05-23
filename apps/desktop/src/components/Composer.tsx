import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  ListChecks,
  Paperclip,
  Plus,
  RefreshCw,
  Shield,
  Square,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import { attachmentStatusLabel } from "../attachments";
import { contextDetails } from "../contextMeter";
import { permissionPresets } from "../localState";
import type {
  ComposerAttachment,
  Model,
  PendingApproval,
  ProjectSettings,
  SandboxMode,
  ThreadTokenUsage,
} from "../types";

type TauriWindow = Window & {
  __TAURI__?: {
    core?: {
      invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
      convertFileSrc?: (path: string, protocol?: string) => string;
    };
    webview?: {
      getCurrentWebview?: () => {
        onDragDropEvent?: (
          handler: (event: {
            payload:
              | { type: "over"; position?: { x: number; y: number } }
              | { type: "drop"; paths: string[]; position?: { x: number; y: number } }
              | { type: "cancel" | "leave" };
          }) => void,
        ) => Promise<() => void>;
      };
    };
  };
};

const effortOptions: Array<{
  value: ProjectSettings["effort"];
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
];

const imagePreviewCache = new Map<string, string>();

export function Composer(props: {
  attachments: ComposerAttachment[];
  canSend: boolean;
  canRetry: boolean;
  contextUsage: ThreadTokenUsage | null;
  currentSettings: ProjectSettings;
  modelDisplay: {
    label: string;
    title: string;
    tone: "ready" | "loading" | "error";
  };
  models: Model[];
  onAddAttachmentPaths: (paths: string[]) => void;
  onAttachmentError: (message: string) => void;
  onCancel: () => void;
  onRemoveAttachment: (id: string) => void;
  onRetry: () => void;
  onSend: (event?: FormEvent) => void;
  onSettingsChange: (patch: Partial<ProjectSettings>) => void;
  pendingApprovals: PendingApproval[];
  running: boolean;
  sendDisabledReason: string | null;
  sendError: string | null;
  text: string;
  onTextChange: (value: string) => void;
}) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachmentPathsRef = useRef(props.onAddAttachmentPaths);
  const selectedModel = props.models.find(
    (model) => model.model === props.currentSettings.model,
  );
  const imageAttachments = props.attachments.filter(
    (attachment) => attachment.kind === "image",
  );

  useEffect(() => {
    addAttachmentPathsRef.current = props.onAddAttachmentPaths;
  }, [props.onAddAttachmentPaths]);

  useEffect(() => {
    function closeMenus(event: MouseEvent) {
      if (!formRef.current?.contains(event.target as Node)) {
        closeComposerMenus();
      }
    }
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, []);

  useEffect(() => {
    if (previewIndex === null) return;
    if (imageAttachments.length === 0) {
      setPreviewIndex(null);
    } else if (previewIndex >= imageAttachments.length) {
      setPreviewIndex(imageAttachments.length - 1);
    }
  }, [imageAttachments.length, previewIndex]);

  useEffect(() => {
    if (previewIndex === null || imageAttachments.length === 0) return;

    function handlePreviewKeys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewIndex(null);
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      setPreviewIndex((current) => {
        if (current === null) return current;
        const direction = event.key === "ArrowRight" ? 1 : -1;
        return (current + direction + imageAttachments.length) % imageAttachments.length;
      });
    }

    window.addEventListener("keydown", handlePreviewKeys);
    return () => window.removeEventListener("keydown", handlePreviewKeys);
  }, [imageAttachments.length, previewIndex]);

  useEffect(() => {
    function togglePlanMode(event: KeyboardEvent) {
      if (event.key !== "Tab" || !event.shiftKey) return;
      if (!formRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      props.onSettingsChange({ planMode: !props.currentSettings.planMode });
    }
    window.addEventListener("keydown", togglePlanMode);
    return () => window.removeEventListener("keydown", togglePlanMode);
  }, [props.currentSettings.planMode, props.onSettingsChange]);

  useEffect(() => {
    const webview = (window as TauriWindow).__TAURI__?.webview?.getCurrentWebview?.();
    if (!webview?.onDragDropEvent) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void webview
      .onDragDropEvent((event) => {
        if (event.payload.type === "over") {
          setDragActive(true);
        } else if (event.payload.type === "drop") {
          setDragActive(false);
          if (event.payload.paths.length > 0) {
            addAttachmentPathsRef.current(event.payload.paths);
          }
        } else {
          setDragActive(false);
        }
      })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => {
        setDragActive(false);
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function openFilePicker() {
    setPlusOpen(false);
    const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
    if (invoke) {
      try {
        const paths = await invoke<string[]>("pick_files");
        if (paths.length > 0) props.onAddAttachmentPaths(paths);
        return;
      } catch {
        props.onAttachmentError("Could not open the file picker.");
        return;
      }
    }
    fileInputRef.current?.click();
  }

  function handleBrowserFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const paths = Array.from(files)
      .map((file) => (file as File & { path?: string }).path ?? "")
      .filter(Boolean);
    if (paths.length === 0) {
      props.onAttachmentError("Could not read those file paths.");
      return;
    }
    props.onAddAttachmentPaths(paths);
  }

  function handleDrop(event: DragEvent<HTMLFormElement>) {
    event.preventDefault();
    setDragActive(false);
    handleBrowserFiles(event.dataTransfer.files);
  }

  function openMenu(menu: "plus" | "permissions" | "model") {
    setPlusOpen(menu === "plus" ? (value) => !value : false);
    setPermissionsOpen(menu === "permissions" ? (value) => !value : false);
    setModelOpen(menu === "model" ? (value) => !value : false);
  }

  function closeComposerMenus() {
    setPlusOpen(false);
    setPermissionsOpen(false);
    setModelOpen(false);
  }

  return (
    <form
      ref={formRef}
      className={`composer ${dragActive ? "drag-active" : ""}`}
      onSubmit={props.onSend}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragActive(false);
        }
      }}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        className="native-file-input"
        type="file"
        multiple
        onChange={(event) => {
          handleBrowserFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {dragActive && <div className="composer-drop-hint">Drop files to add</div>}

      {props.attachments.length > 0 && (
        <div className="attachment-strip" aria-label="Added files">
          {props.attachments.map((attachment) => {
            const imageIndex = imageAttachments.findIndex(
              (image) => image.id === attachment.id,
            );
            return (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                onPreview={
                  imageIndex === -1 ? undefined : () => setPreviewIndex(imageIndex)
                }
                onRemove={() => props.onRemoveAttachment(attachment.id)}
              />
            );
          })}
        </div>
      )}

      {props.pendingApprovals.length > 0 && (
        <div className="approval-banner">
          <Shield size={16} />
          {props.pendingApprovals.length} approval waiting
        </div>
      )}

      <textarea
        value={props.text}
        onChange={(event) => props.onTextChange(event.target.value)}
        onFocus={closeComposerMenus}
        onPointerDown={closeComposerMenus}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          if (props.canSend) props.onSend();
        }}
        placeholder={
          props.attachments.length > 0
            ? "Ask for follow-up changes"
            : "Ask Codex anything. Add photos & files if needed."
        }
      />

      <div className="composer-footer">
        <div className="composer-controls composer-controls-left">
          <div className="composer-popover-wrap">
            <button
              type="button"
              className="composer-icon-button composer-plus-button"
              title="Add or change composer options"
              aria-label="Add or change composer options"
              aria-expanded={plusOpen}
              onClick={() => openMenu("plus")}
            >
              <Plus size={19} />
            </button>
            {plusOpen && (
              <div className="composer-popover composer-plus-menu">
                <button type="button" onClick={() => void openFilePicker()}>
                  <Paperclip size={15} />
                  <span>Add photos & files</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    props.onSettingsChange({
                      planMode: !props.currentSettings.planMode,
                    });
                    setPlusOpen(false);
                  }}
                >
                  <ListChecks size={15} />
                  <span>Plan mode</span>
                  <span className="menu-shortcut">Shift Tab</span>
                  <span
                    className={`menu-toggle ${
                      props.currentSettings.planMode ? "on" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            )}
          </div>

          <div className="composer-popover-wrap">
            <button
              type="button"
              className="composer-pill permission-button"
              title={
                permissionPresets.find(
                  (preset) => preset.id === props.currentSettings.sandbox,
                )?.description ?? "Permissions"
              }
              aria-label="Permissions"
              aria-expanded={permissionsOpen}
              onClick={() => openMenu("permissions")}
            >
              <Shield size={15} />
              <span className="permission-text">
                {permissionLabel(props.currentSettings.sandbox)}
              </span>
              <ChevronDown size={14} />
            </button>
            {permissionsOpen && (
              <div className="composer-popover permission-menu">
                {permissionPresets.map((preset) => {
                  const selected = preset.id === props.currentSettings.sandbox;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        props.onSettingsChange({
                          sandbox: preset.id,
                          approvalPolicy: preset.approvalPolicy,
                        });
                        setPermissionsOpen(false);
                      }}
                    >
                      <Shield size={15} />
                      <span>{permissionLabel(preset.id)}</span>
                      {selected && <Check size={15} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {props.currentSettings.planMode && (
            <button
              type="button"
              className="composer-pill active-plan-button"
              title="Plan mode is on. Shift+Tab toggles it."
              onClick={() => props.onSettingsChange({ planMode: false })}
            >
              <ListChecks size={14} />
              <span>Plan mode</span>
            </button>
          )}
        </div>

        <div className="composer-controls composer-controls-right">
          <ContextMeter usage={props.contextUsage} />
          <div className="composer-popover-wrap">
            <button
              type="button"
              className={`composer-pill composer-model-button ${props.modelDisplay.tone}`}
              title={selectedModel?.description ?? props.modelDisplay.title}
              aria-label="Model and reasoning"
              aria-expanded={modelOpen}
              onClick={() => openMenu("model")}
            >
              <span className="model-name">
                {shortModelLabel(
                  selectedModel?.displayName ?? props.modelDisplay.label,
                )}
              </span>
              <span className="effort-name">
                {effortLabel(props.currentSettings.effort)}
              </span>
              <ChevronDown size={14} />
            </button>
            {modelOpen && (
              <div className="composer-popover model-menu">
                <div className="menu-section-label">Intelligence</div>
                {effortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      props.onSettingsChange({ effort: option.value })
                    }
                  >
                    <span>{option.label}</span>
                    {props.currentSettings.effort === option.value && (
                      <Check size={15} />
                    )}
                  </button>
                ))}
                <div className="menu-divider" />
                <div className="menu-section-label">Model</div>
                {props.models.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    title={model.description}
                    onClick={() => {
                      props.onSettingsChange({ model: model.model });
                      setModelOpen(false);
                    }}
                  >
                    <span>{model.displayName}</span>
                    {props.currentSettings.model === model.model && (
                      <Check size={15} />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {props.canRetry && (
            <button
              type="button"
              className="retry-button"
              onClick={props.onRetry}
              title="Retry the last failed or stopped prompt"
            >
              <RefreshCw size={15} />
              <span>Retry</span>
            </button>
          )}
          {props.running ? (
            <button
              type="button"
              className="stop-button"
              onClick={props.onCancel}
              aria-label="Stop Codex"
              title="Stop Codex"
            >
              <Square size={16} />
              <span>Stop</span>
            </button>
          ) : (
            <button
              className="send-button"
              disabled={!props.canSend}
              aria-label="Send message"
              title={
                props.canSend
                  ? "Send message"
                  : (props.sendDisabledReason ?? "Send message")
              }
            >
              <ArrowUp size={18} />
              <span>Send</span>
            </button>
          )}
        </div>
      </div>

      {props.sendError && (
        <div className="composer-status error-line">{props.sendError}</div>
      )}

      {previewIndex !== null && imageAttachments[previewIndex] && (
        <ImageLightbox
          attachments={imageAttachments}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onSelect={setPreviewIndex}
        />
      )}
    </form>
  );
}

function AttachmentCard(props: {
  attachment: ComposerAttachment;
  onPreview?: () => void;
  onRemove: () => void;
}) {
  const status = attachmentStatusLabel(props.attachment);
  const previewUrl = useImagePreview(
    props.attachment.kind === "image" ? props.attachment.path : null,
  );
  return (
    <div
      className={`attachment-card ${props.attachment.kind} ${props.attachment.status}`}
      title={props.attachment.title}
    >
      <div className="attachment-preview">
        {previewUrl ? (
          <button
            type="button"
            className="attachment-preview-button"
            onClick={props.onPreview}
            aria-label={`Preview ${props.attachment.name}`}
          >
            <img src={previewUrl} alt="" />
          </button>
        ) : props.attachment.kind === "image" ? (
          <ImageIcon size={22} />
        ) : (
          <FileText size={22} />
        )}
      </div>
      {props.attachment.kind !== "image" && (
        <div className="attachment-card-label">
          <span>{props.attachment.name}</span>
          {status && <small>{status}</small>}
        </div>
      )}
      <button
        type="button"
        className="attachment-remove"
        onClick={(event) => {
          event.stopPropagation();
          props.onRemove();
        }}
        aria-label={`Remove ${props.attachment.name}`}
        title="Remove"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function ImageLightbox(props: {
  attachments: ComposerAttachment[];
  index: number;
  onClose: () => void;
  onSelect: (index: number) => void;
}) {
  const attachment = props.attachments[props.index];
  const previewUrl = useImagePreview(attachment.path);
  const multiple = props.attachments.length > 1;

  function move(direction: -1 | 1) {
    props.onSelect(
      (props.index + direction + props.attachments.length) %
        props.attachments.length,
    );
  }

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <button
        type="button"
        className="image-lightbox-close"
        onClick={props.onClose}
        aria-label="Close preview"
      >
        <X size={21} />
      </button>
      {multiple && (
        <button
          type="button"
          className="image-lightbox-nav previous"
          onClick={() => move(-1)}
          aria-label="Previous image"
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="image-lightbox-stage">
        {previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          <div className="image-lightbox-empty">
            <ImageIcon size={28} />
            <span>Preview unavailable</span>
          </div>
        )}
      </div>
      {multiple && (
        <button
          type="button"
          className="image-lightbox-nav next"
          onClick={() => move(1)}
          aria-label="Next image"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

function ContextMeter(props: { usage: ThreadTokenUsage | null }) {
  const details = contextDetails(props.usage);
  return (
    <button
      type="button"
      className={`context-meter ${details.available ? "available" : "unknown"}`}
      style={{
        "--context-meter-angle": `${details.percent * 3.6}deg`,
      } as CSSProperties}
      aria-label={details.ariaLabel}
    >
      <span className="context-meter-ring" aria-hidden="true" />
      <span className="context-meter-tooltip" role="tooltip">
        <span>Context window:</span>
        <strong>{details.percentLabel}</strong>
        <b>{details.tokenLabel}</b>
        <em>Codex automatically compacts its context</em>
      </span>
    </button>
  );
}

function useImagePreview(path: string | null) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    path ? (imagePreviewCache.get(path) ?? null) : null,
  );

  useEffect(() => {
    if (!path) {
      setPreviewUrl(null);
      return;
    }

    const cached = imagePreviewCache.get(path);
    if (cached) {
      setPreviewUrl(cached);
      return;
    }

    let cancelled = false;
    const fallbackUrl = imagePreviewUrl(path);
    const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
    if (!invoke) {
      setPreviewUrl(fallbackUrl);
      return;
    }

    invoke<string>("read_image_data_url", { path })
      .then((dataUrl) => {
        imagePreviewCache.set(path, dataUrl);
        if (!cancelled) setPreviewUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(fallbackUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return previewUrl;
}

function permissionLabel(id: SandboxMode) {
  switch (id) {
    case "read-only":
      return "Auto-review";
    case "workspace-write":
      return "Default permissions";
    case "danger-full-access":
      return "Full access";
  }
}

function effortLabel(effort: ProjectSettings["effort"]) {
  switch (effort) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "xhigh":
      return "Extra High";
    case null:
      return "Auto";
  }
}

function shortModelLabel(label: string) {
  const trimmed = label.trim();
  if (!trimmed) return "Model";
  return trimmed
    .replace(/^GPT-/i, "")
    .replace(/^gpt-/i, "")
    .replace(/^Codex /i, "");
}

function imagePreviewUrl(path: string) {
  if (!path) return null;
  const nativePath = nativeFilePath(path);
  const convertFileSrc = (window as TauriWindow).__TAURI__?.core?.convertFileSrc;
  if (convertFileSrc) return convertFileSrc(nativePath);
  if (/^[A-Za-z]:[\\/]/.test(nativePath)) {
    return encodeURI(`file:///${nativePath.replace(/\\/g, "/")}`);
  }
  if (nativePath.startsWith("/")) return encodeURI(`file://${nativePath}`);
  return null;
}

function nativeFilePath(path: string) {
  const wslMatch = path.match(/^\/mnt\/([A-Za-z])\/(.+)$/);
  if (wslMatch) {
    return `${wslMatch[1].toUpperCase()}:\\${wslMatch[2].replace(/\//g, "\\")}`;
  }
  return path;
}
