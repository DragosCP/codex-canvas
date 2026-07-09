import { Check, ChevronDown } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

export type PreviewToolbarSelectOption = {
  id: string;
  label: string;
  title?: string;
  icon?: ReactNode;
  active?: boolean;
  onSelect: () => void;
};

export function PreviewToolbarSelect(props: {
  ariaLabel: string;
  className?: string;
  hideCurrentLabel?: boolean;
  options: PreviewToolbarSelectOption[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = useMemo(
    () => props.options.find((option) => option.active) ?? props.options[0] ?? null,
    [props.options],
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div
      className={`preview-toolbar-select ${props.className ?? ""} ${
        props.hideCurrentLabel ? "label-hidden" : ""
      }`.trim()}
      ref={rootRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${props.ariaLabel}: ${current.label}`}
        className="preview-toolbar-select-button"
        onClick={() => setOpen((value) => !value)}
        title={current.title || current.label}
        type="button"
      >
        {current.icon}
        {!props.hideCurrentLabel && <span>{current.label}</span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="more-actions-menu preview-toolbar-select-menu" role="menu">
          {props.options.map((option) => (
            <button
              className={option.active ? "active" : ""}
              key={option.id}
              onClick={() => {
                option.onSelect();
                setOpen(false);
              }}
              role="menuitemradio"
              title={option.title || option.label}
              type="button"
            >
              {option.icon}
              <span>{option.label}</span>
              {option.active && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
