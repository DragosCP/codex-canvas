import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  ListChecks,
  MousePointer2,
  Paperclip,
  Plus,
  RefreshCw,
  Shield,
  Square,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import { attachmentStatusLabel } from "../attachments";
import { contextDetails } from "../contextMeter";
import {
  desktopInvoke,
  desktopPathForFile,
} from "../desktopBridge";
import { permissionPresets } from "../localState";
import { previewArtifactDisplayName } from "../mockupArtifacts";
import {
  composerContextPreviewImage,
  composerContextVisualLabel,
  composerContextVisualTitle,
} from "../previewContextImages";
import type {
  ComposerAttachment,
  ComposerContextReference,
  Model,
  PendingApproval,
  ProjectSettings,
  SandboxMode,
  ThreadTokenUsage,
} from "../types";
import {
  ImagePreviewLightbox,
  usePreviewImageSource,
  type PreviewImageItem,
} from "./ImagePreviewLightbox";

const effortOptions: Array<{
  value: ProjectSettings["effort"];
  label: string;
}> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
];

const COMPOSER_MAX_ROWS = 7;

export function Composer(props: {
  attachments: ComposerAttachment[];
  canSend: boolean;
  canRetry: boolean;
  contextUsage: ThreadTokenUsage | null;
  contexts: ComposerContextReference[];
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
  onShowApprovals: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveContext: (context: ComposerContextReference) => void;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAttachmentPathsRef = useRef(props.onAddAttachmentPaths);
  const selectedModel = props.models.find(
    (model) => model.model === props.currentSettings.model,
  );
  const imageAttachments = props.attachments.filter(
    (attachment) => attachment.kind === "image",
  );
  const attachmentPreviewImages: PreviewImageItem[] = imageAttachments.map(
    (attachment) => ({
      id: attachmentPreviewImageId(attachment.id),
      title: attachment.name,
      alt: attachment.name,
      path: attachment.path,
    }),
  );
  const contextPreviewImages = props.contexts.map(composerContextPreviewImage);
  const previewImages = [...attachmentPreviewImages, ...contextPreviewImages];

  useLayoutEffect(() => {
    resizeComposerTextarea(textareaRef.current);
  }, [props.text]);

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
    if (previewImages.length === 0) {
      setPreviewIndex(null);
    } else if (previewIndex >= previewImages.length) {
      setPreviewIndex(previewImages.length - 1);
    }
  }, [previewImages.length, previewIndex]);

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

  async function openFilePicker() {
    setPlusOpen(false);
    const selectedPaths = desktopInvoke<string[]>("pick_files");
    if (selectedPaths) {
      try {
        const paths = await selectedPaths;
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
      .map((file) => desktopPathForFile(file))
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

  function handleTextChange(value: string) {
    props.onTextChange(value);
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
            const previewImageIndex = previewImages.findIndex(
              (image) => image.id === attachmentPreviewImageId(attachment.id),
            );
            return (
              <AttachmentCard
                key={attachment.id}
                attachment={attachment}
                onPreview={
                  previewImageIndex === -1
                    ? undefined
                    : () => setPreviewIndex(previewImageIndex)
                }
                onRemove={() => props.onRemoveAttachment(attachment.id)}
              />
            );
          })}
        </div>
      )}

      {props.pendingApprovals.length > 0 && (
        <button
          className="approval-banner"
          onClick={props.onShowApprovals}
          type="button"
        >
          <Shield size={16} />
          {props.pendingApprovals.length} approval waiting
        </button>
      )}

      {props.contexts.length > 0 && (
        <div className="composer-context-strip" aria-label="Added context">
          {props.contexts.map((context) => {
            const previewImageIndex = previewImages.findIndex(
              (image) => image.id === `context:${context.id}`,
            );
            return (
              <ComposerContextChip
                key={composerContextKey(context)}
                context={context}
                onPreview={() => setPreviewIndex(previewImageIndex)}
                onRemove={() => props.onRemoveContext(context)}
                previewDisabled={previewImageIndex === -1}
              />
            );
          })}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={props.text}
        onChange={(event) => handleTextChange(event.target.value)}
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

      {previewIndex !== null && previewImages[previewIndex] && (
        <ImagePreviewLightbox
          images={previewImages}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onSelect={setPreviewIndex}
        />
      )}
    </form>
  );
}

function resizeComposerTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea || typeof window === "undefined") return;
  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 24;
  const minHeight = Number.parseFloat(styles.minHeight) || lineHeight * 3;
  const borderHeight =
    (Number.parseFloat(styles.borderTopWidth) || 0) +
    (Number.parseFloat(styles.borderBottomWidth) || 0);
  const paddingHeight =
    (Number.parseFloat(styles.paddingTop) || 0) +
    (Number.parseFloat(styles.paddingBottom) || 0);
  const maxHeight = lineHeight * COMPOSER_MAX_ROWS + borderHeight + paddingHeight;
  textarea.style.height = "auto";
  if (textarea.value.trim().length === 0) {
    textarea.style.height = `${Math.ceil(minHeight)}px`;
    textarea.style.overflowY = "hidden";
    return;
  }
  const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = `${Math.ceil(nextHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
}

function composerContextKey(context: ComposerContextReference) {
  if (context.type === "appPreview") return context.id;
  return context.id;
}

function attachmentPreviewImageId(attachmentId: string) {
  return `attachment:${attachmentId}`;
}

function composerContextChipTitle(context: ComposerContextReference) {
  return composerContextVisualTitle(context);
}

function composerContextChipLabel(context: ComposerContextReference) {
  if (context.type === "appPreview") {
    return "";
  }
  if (context.type === "mockupPreview") {
    return `${context.projectName} - ${previewArtifactDisplayName(
      context.artifactKind,
      1,
      "title",
    )} ${context.mockupLabel}`;
  }
  return "";
}

function composerContextMentionLabel(context: ComposerContextReference) {
  return composerContextVisualLabel(context);
}

function ComposerContextChip(props: {
  context: ComposerContextReference;
  onPreview: () => void;
  onRemove: () => void;
  previewDisabled: boolean;
}) {
  const image = composerContextPreviewImage(props.context);
  const previewUrl = usePreviewImageSource(image);
  const label = composerContextMentionLabel(props.context);
  const detail = composerContextChipLabel(props.context);
  return (
    <div className="composer-context-chip visual" title={composerContextChipTitle(props.context)}>
      <button
        type="button"
        className="composer-context-preview"
        onClick={props.onPreview}
        disabled={props.previewDisabled}
        aria-label={`Preview ${label}`}
      >
        <span className="composer-context-thumb" aria-hidden="true">
          {previewUrl ? (
            <img src={previewUrl} alt="" />
          ) : (
            <MousePointer2 size={18} />
          )}
        </span>
        <span>{label}</span>
        <small hidden={!detail}>{detail}</small>
      </button>
      <button
        type="button"
        className="composer-context-remove"
        onClick={props.onRemove}
        aria-label={`Remove ${label}`}
        title="Remove"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function AttachmentCard(props: {
  attachment: ComposerAttachment;
  onPreview?: () => void;
  onRemove: () => void;
}) {
  const status = attachmentStatusLabel(props.attachment);
  const previewUrl = usePreviewImageSource(
    props.attachment.kind === "image"
      ? {
          id: attachmentPreviewImageId(props.attachment.id),
          title: props.attachment.name,
          alt: props.attachment.name,
          path: props.attachment.path,
        }
      : null,
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
