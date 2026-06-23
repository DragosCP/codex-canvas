import { MoreHorizontal, Circle, Pause, Play, GripVertical } from "lucide-react";
import type { Lane } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  lane: Lane;
  focused: boolean;
  device: "desktop" | "mobile";
  onDeviceChange: (d: "desktop" | "mobile") => void;
  stopped?: boolean;
  onToggleStopped?: () => void;
  /** Drag handle wiring */
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  isDragging?: boolean;
}

export function LaneHeader({
  lane,
  focused,
  stopped,
  onToggleStopped,
  onDragStart,
  onDragEnd,
  isDragging,
}: Props) {
  const isLive = lane.id === "live";

  return (
    <div className="relative flex items-end gap-2.5 px-0.5 pb-4 pt-1">
      {/* Tag — also the drag handle. Fixed font-size so focus/drag never shifts layout. */}
      <div
        draggable
        onDragStart={(e) => {
          // Custom floating drag ghost — small chip under cursor, not a duplicated tab.
          if (e.dataTransfer) {
            const ghost = document.createElement("div");
            ghost.textContent = isLive ? "Live" : `Proposal ${lane.id}`;
            ghost.style.cssText = [
              "position:absolute",
              "top:-1000px",
              "left:-1000px",
              "padding:6px 12px",
              "border-radius:9999px",
              "font-family:'Source Serif 4', Georgia, serif",
              "font-size:13px",
              "color:#F4EFE8",
              "background:linear-gradient(180deg, rgba(58,48,38,0.95), rgba(36,30,24,0.92))",
              "box-shadow:0 12px 28px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(209,166,110,0.45), inset 0 1px 0 rgba(255,245,230,0.10)",
              "backdrop-filter:blur(20px)",
              "pointer-events:none",
              "white-space:nowrap",
            ].join(";");
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 30, 16);
            setTimeout(() => ghost.remove(), 0);
          }
          onDragStart?.(e);
        }}
        onDragEnd={onDragEnd}
        title={isLive ? "Drag Live onto a proposal to fork it" : `Drag Proposal ${lane.id} onto another lane to copy or build`}
        className={cn(
          "group/handle inline-flex cursor-grab items-center gap-1.5 rounded-md px-1 -mx-1 py-0.5 select-none transition-colors active:cursor-grabbing",
          isLive ? "text-[#D1A66E]" : "text-[#9DB1D1]",
          isDragging && "opacity-40",
          "hover:bg-[rgba(255,245,230,0.04)]",
        )}
      >
        <GripVertical className="h-3 w-3 text-[#5A554F] opacity-0 transition-opacity group-hover/handle:opacity-100" />
        {isLive ? (
          <>
            <Circle
              className={cn(
                "h-2 w-2",
                stopped
                  ? "fill-[#B0A99E] text-[#B0A99E]"
                  : "fill-[#C29960] text-[#C29960] pulse-dot",
              )}
            />
            <span className="font-serif leading-none text-[18px]">Live</span>
          </>
        ) : (
          <span className="font-serif leading-none text-[18px] text-[#F4EFE8]">
            Proposal <span className="text-[#9DB1D1]">{lane.id}</span>
          </span>
        )}
      </div>


      {focused && (
        <div className="ml-1 flex min-w-0 items-center gap-2">
          <span className="h-px w-5 bg-[rgba(255,245,230,0.12)]" />
          <div className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-[#8A847A]">
            {isLive
              ? "northwind.app · v2.41"
              : lane.id === "A"
                ? "Calmer hero"
                : lane.id === "B"
                  ? "Editorial grid"
                  : "Dense data layout"}
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        {isLive && (
          <button
            onClick={onToggleStopped}
            className="grid h-7 w-7 place-items-center rounded-full text-[#B0A99E] hover:bg-white/[0.05] hover:text-[#F4EFE8]"
            title={stopped ? "Resume Live" : "Pause Live"}
          >
            {stopped ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
        )}
        <button className="grid h-7 w-7 place-items-center rounded-full text-[#B0A99E] hover:bg-white/[0.05] hover:text-[#F4EFE8]">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
