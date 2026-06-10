import {
  Check,
  ExternalLink,
  MousePointer2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { selectedPlanPreviewVariant } from "../planPreview";
import type {
  PlanPreviewAreaMark,
  PlanPreviewVariant,
  PlanProposal,
  Project,
} from "../types";

type DraftMark = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

const suggestedPreviewUrls = [
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:8080",
];

export type LiveAppPreviewMarkMeta = {
  previewUrl: string;
  viewport: "desktop" | "mobile";
};

export function LiveAppPreview(props: {
  project: Project;
  proposal?: PlanProposal | null;
  areaMark?: PlanPreviewAreaMark | null;
  onAreaMarkChange: (
    areaMark: PlanPreviewAreaMark | null,
    meta: LiveAppPreviewMarkMeta,
  ) => void;
  onVariantChange?: (variantId: string) => void;
}) {
  const storageKey = `codex.preview.url.${props.project.id}`;
  const [draftUrl, setDraftUrl] = useState(
    () => window.localStorage.getItem(storageKey) ?? "",
  );
  const [previewUrl, setPreviewUrl] = useState(draftUrl);
  const [frameKey, setFrameKey] = useState(0);
  const [frameStatus, setFrameStatus] = useState<"idle" | "loading" | "loaded">(
    "idle",
  );
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [expanded, setExpanded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [draftMark, setDraftMark] = useState<DraftMark | null>(null);
  const initialMark = props.areaMark ?? props.proposal?.previewAreaMark ?? null;
  const [markNote, setMarkNote] = useState(initialMark?.note ?? "");
  const stageRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const spec = props.proposal?.previewSpec ?? null;
  const selectedVariant = selectedPlanPreviewVariant(
    spec,
    props.proposal?.previewSelectedVariantId,
  );
  const variants = spec?.variants ?? [];
  const mark = props.areaMark ?? props.proposal?.previewAreaMark ?? null;
  const safePreviewUrl = useMemo(() => normalizePreviewUrl(previewUrl), [previewUrl]);

  useEffect(() => {
    const storedUrl = window.localStorage.getItem(storageKey) ?? "";
    setDraftUrl(storedUrl);
    setPreviewUrl(storedUrl);
    setFrameStatus(storedUrl ? "loading" : "idle");
    setFrameKey((current) => current + 1);
  }, [storageKey]);

  useEffect(() => {
    if (!props.onVariantChange || selectedVariant || !variants[0]) return;
    props.onVariantChange(variants[0].id);
  }, [props.onVariantChange, selectedVariant, variants]);

  useEffect(() => {
    setMarkNote(mark?.note ?? "");
  }, [mark?.createdAt, mark?.note]);

  function openPreview(url = draftUrl) {
    const normalized = normalizePreviewUrl(url);
    setDraftUrl(normalized);
    setPreviewUrl(normalized);
    if (normalized) {
      window.localStorage.setItem(storageKey, normalized);
    } else {
      window.localStorage.removeItem(storageKey);
    }
    setFrameStatus(normalized ? "loading" : "idle");
    setFrameKey((current) => current + 1);
  }

  function resetPreview() {
    setExpanded(false);
    setMarking(false);
    setDraftMark(null);
    props.onAreaMarkChange(null, { previewUrl: safePreviewUrl, viewport });
    setMarkNote("");
    setFrameStatus("loading");
    setFrameKey((current) => current + 1);
  }

  function beginMark(event: PointerEvent<HTMLDivElement>) {
    if (!marking || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const startX = event.clientX - rect.left;
    const startY = event.clientY - rect.top;
    setDraftMark({ startX, startY, currentX: startX, currentY: startY });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateMark(event: PointerEvent<HTMLDivElement>) {
    if (!draftMark || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setDraftMark({
      ...draftMark,
      currentX: event.clientX - rect.left,
      currentY: event.clientY - rect.top,
    });
  }

  function finishMark() {
    if (!draftMark || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const area = markFromDraft(draftMark, rect, markNote);
    if (area.width > 8 && area.height > 8) {
      props.onAreaMarkChange(area, { previewUrl: safePreviewUrl, viewport });
    }
    setDraftMark(null);
    setMarking(false);
  }

  function saveMarkNote(value: string) {
    setMarkNote(value);
    if (!mark) return;
    props.onAreaMarkChange(
      { ...mark, note: value },
      { previewUrl: safePreviewUrl, viewport },
    );
  }

  return (
    <div className="live-preview-panel">
      <PreviewHeader project={props.project} />

      {variants.length > 0 && (
        <div className="live-preview-options" aria-label="Preview options">
          {variants.map((variant) => (
            <button
              className={variant.id === selectedVariant?.id ? "active" : ""}
              key={variant.id}
              onClick={() => {
                setExpanded(false);
                props.onVariantChange?.(variant.id);
              }}
              type="button"
            >
              <span>{variant.id}</span>
              <strong>{variant.title}</strong>
              <small>{variant.tradeoff}</small>
            </button>
          ))}
        </div>
      )}

      <div className="live-preview-controls">
        <label>
          <span>Preview URL</span>
          <input
            onChange={(event) => setDraftUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") openPreview();
            }}
            value={draftUrl}
          />
        </label>
        <button className="ghost-button" onClick={() => openPreview()} type="button">
          <ExternalLink size={15} /> Open
        </button>
        <button
          className="icon-button"
          onClick={() => openPreview(previewUrl)}
          title="Reload preview"
          type="button"
        >
          <RefreshCw size={15} />
        </button>
        <select
          aria-label="Preview viewport"
          onChange={(event) => setViewport(event.target.value as "desktop" | "mobile")}
          value={viewport}
        >
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </select>
        <button
          className={marking ? "ghost-button active" : "ghost-button"}
          disabled={!safePreviewUrl}
          onClick={() => {
            setMarking((current) => !current);
            setDraftMark(null);
          }}
          title={
            safePreviewUrl
              ? "Mark an area in this preview"
              : "Choose a preview URL before marking an area"
          }
          type="button"
        >
          <MousePointer2 size={15} /> Mark area
        </button>
        <button className="icon-button" onClick={resetPreview} title="Reset preview" type="button">
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="live-preview-url-picks">
        {suggestedPreviewUrls.map((url) => (
          <button key={url} onClick={() => openPreview(url)} type="button">
            {url.replace("http://", "")}
          </button>
        ))}
      </div>

      <div
        className={`live-preview-stage ${viewport} ${marking ? "marking" : ""}`}
        onPointerDown={beginMark}
        onPointerMove={updateMark}
        onPointerUp={finishMark}
        ref={stageRef}
      >
        {safePreviewUrl ? (
          <iframe
            key={frameKey}
            onLoad={() => setFrameStatus("loaded")}
            ref={iframeRef}
            src={safePreviewUrl}
            title={`${props.project.name} live preview`}
          />
        ) : (
          <div className="live-preview-empty">
            <strong>Choose a local preview URL</strong>
            <span>Start the app and paste or pick its local URL.</span>
          </div>
        )}
        {safePreviewUrl && frameStatus !== "loaded" && (
          <div className="live-preview-loading">
            <strong>Loading preview</strong>
            <span>{safePreviewUrl}</span>
          </div>
        )}
        {safePreviewUrl && selectedVariant && (
          <PreviewVariantOverlay
            expanded={expanded}
            onToggle={() => setExpanded((current) => !current)}
            variant={selectedVariant}
          />
        )}
        {mark && <div className="live-preview-mark" style={markStyle(mark)} />}
        {draftMark && (
          <div className="live-preview-mark draft" style={draftMarkStyle(draftMark)} />
        )}
      </div>

      {(mark || marking) && (
        <label className="live-preview-mark-note">
          <span>{mark ? "Marked area note" : "Draw an area, then add a note"}</span>
          <textarea
            onChange={(event) => saveMarkNote(event.target.value)}
            placeholder="Example: put the action closer to the message composer"
            rows={2}
            value={markNote}
          />
        </label>
      )}
    </div>
  );
}

function PreviewHeader(props: { project: Project }) {
  return (
    <header className="live-preview-header">
      <div>
        <p className="eyebrow">Live app preview</p>
        <h2>{props.project.name}</h2>
      </div>
      <span>Temporary</span>
    </header>
  );
}

function PreviewVariantOverlay(props: {
  expanded: boolean;
  onToggle: () => void;
  variant: PlanPreviewVariant;
}) {
  const primary = props.variant.components[0];
  return (
    <div className={`preview-variant-overlay ${props.variant.placement}`}>
      {props.variant.placement === "topbar" && (
        <div className="preview-proposal-bar">
          <span>Proposed</span>
          <strong>{primary?.label ?? props.variant.title}</strong>
          <button onClick={props.onToggle} type="button">
            {props.expanded ? "Close" : (primary?.actionLabel ?? "Open")}
          </button>
          {props.expanded && (
            <div className="preview-popover">
              <strong>{props.variant.title}</strong>
              <p>{primary?.body}</p>
              <button type="button">Use this path</button>
            </div>
          )}
        </div>
      )}
      {props.variant.placement === "sidePanel" && (
        <div className="preview-side-panel">
          <span>Proposed</span>
          <strong>{primary?.label ?? props.variant.title}</strong>
          <p>{primary?.body}</p>
          <input readOnly value="Temporary option" />
          <button onClick={props.onToggle} type="button">
            {props.expanded ? "Hide details" : "Show details"}
          </button>
          {props.expanded && <small>Secondary state previewed in place.</small>}
        </div>
      )}
      {props.variant.placement === "modal" && (
        <div className="preview-modal">
          <span>Proposed</span>
          <strong>{primary?.label ?? props.variant.title}</strong>
          <p>{primary?.body}</p>
          <div>
            <button type="button">Cancel</button>
            <button onClick={props.onToggle} type="button">
              {props.expanded ? "Done" : "Continue"}
            </button>
          </div>
          {props.expanded && (
            <small>
              <Check size={13} /> Next temporary state
            </small>
          )}
        </div>
      )}
    </div>
  );
}

function normalizePreviewUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
}

function markFromDraft(
  mark: DraftMark,
  rect: DOMRect,
  note: string,
): PlanPreviewAreaMark {
  const left = Math.min(mark.startX, mark.currentX);
  const top = Math.min(mark.startY, mark.currentY);
  const right = Math.max(mark.startX, mark.currentX);
  const bottom = Math.max(mark.startY, mark.currentY);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    viewportWidth: rect.width,
    viewportHeight: rect.height,
    note,
    createdAt: Date.now(),
  };
}

function markStyle(mark: PlanPreviewAreaMark) {
  return {
    left: `${(mark.x / mark.viewportWidth) * 100}%`,
    top: `${(mark.y / mark.viewportHeight) * 100}%`,
    width: `${(mark.width / mark.viewportWidth) * 100}%`,
    height: `${(mark.height / mark.viewportHeight) * 100}%`,
  };
}

function draftMarkStyle(mark: DraftMark) {
  const left = Math.min(mark.startX, mark.currentX);
  const top = Math.min(mark.startY, mark.currentY);
  return {
    left,
    top,
    width: Math.abs(mark.currentX - mark.startX),
    height: Math.abs(mark.currentY - mark.startY),
  };
}
