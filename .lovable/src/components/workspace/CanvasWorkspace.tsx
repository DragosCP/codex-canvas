import { useState } from "react";
import {
  Layers,
  Monitor,
  Smartphone,
  PenLine,
  GitBranch,
  Hammer,
  Sparkles,
  MoreHorizontal,
  PanelRightOpen,
  PanelRightClose,
  Maximize2,
  Play,
  Circle,
} from "lucide-react";
import { ALL_LANES, type LaneId } from "./types";
import { GlassButton } from "./GlassButton";
import { LaneHeader } from "./LaneHeader";
import { PreviewSurface } from "./PreviewSurface";
import { cn } from "@/lib/utils";

interface Props {
  activeLanes: LaneId[];
  focusedLane: LaneId;
  onChangeLanes: (lanes: LaneId[]) => void;
  onFocusLane: (l: LaneId) => void;
  onToggleChat: () => void;
  chatOpen: boolean;
  onToggleNav: () => void;
}

export function CanvasWorkspace({
  activeLanes,
  focusedLane,
  onChangeLanes,
  onFocusLane,
  onToggleChat,
  chatOpen,
  onToggleNav,
}: Props) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [dragging, setDragging] = useState<LaneId | null>(null);
  const [dropTarget, setDropTarget] = useState<LaneId | null>(null);
  const [confirm, setConfirm] = useState<null | { from: LaneId; to: LaneId }>(null);
  const [markMode, setMarkMode] = useState(false);
  const [showChanges, setShowChanges] = useState(true);
  const [liveStopped, setLiveStopped] = useState(false);

  const presets: { label: string; lanes: LaneId[] }[] = [
    { label: "Live", lanes: ["live"] },
    { label: "A", lanes: ["A"] },
    { label: "Live + A", lanes: ["live", "A"] },
    { label: "A / B / C", lanes: ["A", "B", "C"] },
  ];

  const isPresetActive = (lanes: LaneId[]) =>
    lanes.length === activeLanes.length && lanes.every((l) => activeLanes.includes(l));

  const onDrop = (target: LaneId) => {
    if (dragging && dragging !== target) {
      setConfirm({ from: dragging, to: target });
    }
    setDragging(null);
    setDropTarget(null);
  };

  const visibleLanes = ALL_LANES.filter((l) => activeLanes.includes(l.id));

  const accent = focusedLane === "live" ? "#9DB1D1" : "#D1A66E";
  const accentSoft = focusedLane === "live" ? "rgba(157,177,209,0.28)" : "rgba(209,166,110,0.32)";
  const contextLine = (() => {
    if (activeLanes.length === 1) {
      return activeLanes[0] === "live" ? "Viewing Live" : `Viewing Proposal ${activeLanes[0]}`;
    }
    if (activeLanes.includes("live") && activeLanes.length === 2) {
      const other = activeLanes.find((l) => l !== "live");
      return `Comparing Live with Proposal ${other} · 7 changes`;
    }
    return `Comparing ${activeLanes.join(" · ")}`;
  })();

  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      {/* Top bar — editorial identity left, floating glass controls right */}
      <header className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-2 px-7 pt-4 pb-0">
        <div className="flex items-center gap-3">
          <Layers className="h-4 w-4" style={{ color: accent }} />
          <div className="leading-tight">
            <div className="font-serif text-[26px] tracking-tight text-warm">Atelier</div>
            <div className="-mt-1 text-[11.5px] tracking-wide text-[#B0A99E]">
              Northwind · Onboarding revamp
            </div>
          </div>
        </div>

        {/* Lane preset selector — fixed-width slots so labels never shift */}
        <div className="ml-3 hidden items-center gap-0.5 sm:flex">
          {presets.map((p, i) => {
            const active = isPresetActive(p.lanes);
            // Fixed min-widths per label so active/inactive states never reflow
            const widthClass =
              p.label === "Live + A" ? "min-w-[58px]"
              : p.label === "A / B / C" ? "min-w-[64px]"
              : "min-w-[28px]";
            return (
              <div key={p.label} className="flex items-center">
                {i > 0 && <span className="mx-0.5 text-[#3A3631]">/</span>}
                <button
                  onClick={() => {
                    onChangeLanes(p.lanes);
                    onFocusLane(p.lanes[0]);
                  }}
                  className={cn(
                    "relative inline-flex h-7 items-center justify-center px-2 text-[12.5px] font-medium tracking-tight tabular-nums transition-colors",
                    widthClass,
                    active ? "text-[#F4EFE8]" : "text-[#8A847A] hover:text-[#E8DFD2]",
                  )}
                >
                  {p.label}
                  {active && (
                    <span
                      className="absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full"
                      style={{ background: accent, opacity: 0.85 }}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>


        <div className="ml-auto flex items-center gap-1.5">
          {/* Floating glass island for canvas tools */}
          <div className="flex items-center gap-1 rounded-full bg-[rgba(36,36,41,0.55)] px-1 py-1 ring-1 ring-[rgba(255,245,230,0.06)] backdrop-blur-xl shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]">
            <GlassButton size="sm" variant="ghost" active={markMode} onClick={() => setMarkMode((v) => !v)}>
              <PenLine className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Mark</span>
            </GlassButton>
            <GlassButton size="sm" variant="ghost" active={showChanges} onClick={() => setShowChanges((v) => !v)}>
              <GitBranch className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Changes</span>
              <span className="ml-1 hidden rounded-full bg-white/[0.06] px-1.5 text-[10px] text-[#B0A99E] md:inline">7</span>
            </GlassButton>
          </div>

          {(() => {
            // Contextual primary action — reflects focused lane in Live + A
            const hasLive = activeLanes.includes("live");
            const otherLane = activeLanes.find((l) => l !== "live");
            let primary = `Build ${focusedLane === "live" ? "Live" : `Proposal ${focusedLane}`}`;
            if (hasLive && activeLanes.length === 2 && otherLane) {
              primary = focusedLane === "live"
                ? `Fork Live into ${otherLane}`
                : `Build ${focusedLane} into Live`;
            }
            return (
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium text-[#1C1C21] transition-all hover:brightness-110"
                style={{
                  background: `linear-gradient(180deg, ${accent}, color-mix(in oklab, ${accent} 80%, #1C1C21))`,
                  boxShadow: `0 10px 28px -10px ${accentSoft}, inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}
              >
                <Hammer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{primary}</span>
                <span className="sm:hidden">Build</span>
              </button>
            );
          })()}


          <div className="ml-0.5 hidden items-center gap-0.5 md:flex">
            <button
              onClick={() => onToggleChat()}
              className="grid h-8 w-8 place-items-center rounded-full text-[#B0A99E] hover:bg-white/[0.05] hover:text-[#F4EFE8]"
              title={chatOpen ? "Hide chat" : "Show chat"}
            >
              {chatOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
            <button
              onClick={onToggleNav}
              className="grid h-8 w-8 place-items-center rounded-full text-[#B0A99E] hover:bg-white/[0.05] hover:text-[#F4EFE8] lg:hidden"
              title="Projects & threads"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contextual state line */}
        <div className="w-full pl-7 -mt-1 flex items-center gap-2 text-[11px] tracking-wide text-[#8A847A]">
          <span className="h-1 w-1 rounded-full" style={{ background: accent }} />
          <span>{contextLine}</span>
        </div>
      </header>


      {/* Canvas area — lanes share a continuous stage; depth comes from light, not lines */}
      <div className="relative mt-1 flex min-h-0 flex-1 gap-4 px-6 pb-6">
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {/* Stage depth: warm radial light + faint grain behind previews */}
          <div className="pointer-events-none absolute inset-0 -z-0">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 50% at 50% 38%, rgba(255,235,210,0.045), transparent 70%), radial-gradient(80% 60% at 50% 100%, rgba(0,0,0,0.35), transparent 70%)",
              }}
            />
            <div
              className="absolute inset-0 opacity-[0.035] mix-blend-overlay"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
              }}
            />
          </div>

          {visibleLanes.map((lane, idx) => {
            const focused = focusedLane === lane.id;
            const isDrop = dropTarget === lane.id && dragging !== lane.id;
            const isValidTarget = !!dragging && dragging !== lane.id;
            const laneAccent = lane.id === "live" ? "rgba(157,177,209,0.45)" : "rgba(209,166,110,0.45)";
            return (
              <div
                key={lane.id}
                onDragOver={(e) => {
                  if (!dragging || dragging === lane.id) return;
                  e.preventDefault();
                  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                  setDropTarget(lane.id);
                }}
                onDragLeave={() => setDropTarget((t) => (t === lane.id ? null : t))}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(lane.id);
                }}
                onClick={() => onFocusLane(lane.id)}
                className={cn(
                  "group relative flex min-h-0 min-w-0 flex-col justify-start transition-[flex-grow,opacity] duration-300 animate-lane-in",
                  // tighter gutters for A/B/C, generous for 2-up, none for single
                  idx > 0 && (visibleLanes.length === 3 ? "pl-3" : "pl-6"),
                  // 55/45 split when exactly two lanes are visible
                  visibleLanes.length === 2 ? (focused ? "flex-[55]" : "flex-[45]") : "flex-1",
                  dragging === lane.id && "opacity-60",
                )}
              >
                {/* Focused glow — a warm wash above, no boxing ring */}
                {focused && (
                  <div
                    className="pointer-events-none absolute -inset-x-2 -top-2 h-10"
                    style={{
                      background: `radial-gradient(60% 100% at 50% 0%, ${laneAccent}, transparent 70%)`,
                    }}
                  />
                )}

                <LaneHeader
                  lane={lane}
                  focused={focused}
                  device={device}
                  onDeviceChange={setDevice}
                  stopped={lane.id === "live" && liveStopped}
                  onToggleStopped={() => lane.id === "live" && setLiveStopped((v) => !v)}
                  onDragStart={(e) => {
                    setDragging(lane.id);
                    if (e.dataTransfer) {
                      e.dataTransfer.effectAllowed = "copy";
                      e.dataTransfer.setData("text/plain", lane.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropTarget(null);
                  }}
                  isDragging={dragging === lane.id}
                />

                <div
                  className={cn(
                    "relative flex min-h-0 flex-1 overflow-hidden rounded-[10px] transition-all duration-300",
                    focused
                      ? "shadow-[0_60px_120px_-40px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,245,230,0.05)]"
                      : "shadow-[0_30px_60px_-30px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,245,230,0.04)]",
                  )}
                  style={
                    focused
                      ? { boxShadow: `0 60px 120px -40px rgba(0,0,0,0.75), 0 0 0 1px ${laneAccent}, 0 0 40px -8px ${laneAccent}` }
                      : undefined
                  }
                >
                  <PreviewSurface
                    laneId={lane.id}
                    device={device}
                    markMode={markMode && focused}
                    showChanges={showChanges}
                    stopped={lane.id === "live" && liveStopped}
                    compact={visibleLanes.length === 3}
                  />

                  {/* Valid drop-target affordance: subtle amber ring + soft wash while dragging */}
                  {isValidTarget && (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-0 rounded-[10px] transition-all duration-200",
                        isDrop
                          ? "shadow-[inset_0_0_0_2px_rgba(209,166,110,0.7),0_0_60px_-10px_rgba(209,166,110,0.45)]"
                          : "shadow-[inset_0_0_0_1px_rgba(209,166,110,0.30)]",
                      )}
                      style={{
                        background: isDrop
                          ? "radial-gradient(60% 50% at 50% 50%, rgba(209,166,110,0.10), transparent 75%)"
                          : "radial-gradient(60% 50% at 50% 50%, rgba(209,166,110,0.04), transparent 75%)",
                      }}
                    />
                  )}
                </div>

                {/* Hover hint while dragging over this lane */}
                {isDrop && <DropHint from={dragging!} to={lane.id} />}

                {/* Anchored confirmation popover after drop */}
                {confirm && confirm.to === lane.id && (
                  <DropPopover
                    from={confirm.from}
                    to={confirm.to}
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => setConfirm(null)}
                  />
                )}
              </div>
            );
          })}

          {/* Ghost Live drop slot — appears only while dragging when Live isn't visible */}
          {dragging && !activeLanes.includes("live") && (
            <GhostLiveDrop
              isOver={dropTarget === "live"}
              onDragOver={(e) => {
                if (dragging === "live") return;
                e.preventDefault();
                if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
                setDropTarget("live");
              }}
              onDragLeave={() => setDropTarget((t) => (t === "live" ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop("live");
              }}
            />
          )}




          {/* Floating device toggle — premium glass */}
          <div className="pointer-events-none absolute bottom-[20px] left-1/2 z-20 -translate-x-1/2">
            <div
              className="pointer-events-auto flex items-center gap-px rounded-full p-[3px]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(58,48,38,0.72), rgba(36,30,24,0.62))",
                boxShadow:
                  "0 1px 0 rgba(255,245,230,0.08) inset, 0 -1px 0 rgba(0,0,0,0.35) inset, 0 12px 30px -14px rgba(0,0,0,0.7), 0 0 0 1px rgba(209,166,110,0.12)",
                backdropFilter: "blur(20px) saturate(140%)",
              }}
            >
              <button
                onClick={() => setDevice("desktop")}
                className={cn(
                  "grid h-[22px] w-[30px] place-items-center rounded-full transition-all",
                  device === "desktop"
                    ? "bg-[rgba(209,166,110,0.18)] text-[#F4EFE8] shadow-[inset_0_1px_0_rgba(255,245,230,0.10)]"
                    : "text-[#9F988D] hover:text-[#F4EFE8]",
                )}
                aria-label="Desktop preview"
              >
                <Monitor className="h-[11px] w-[11px]" />
              </button>
              <button
                onClick={() => setDevice("mobile")}
                className={cn(
                  "grid h-[22px] w-[30px] place-items-center rounded-full transition-all",
                  device === "mobile"
                    ? "bg-[rgba(209,166,110,0.18)] text-[#F4EFE8] shadow-[inset_0_1px_0_rgba(255,245,230,0.10)]"
                    : "text-[#9F988D] hover:text-[#F4EFE8]",
                )}
                aria-label="Mobile preview"
              >
                <Smartphone className="h-[11px] w-[11px]" />
              </button>
              <span className="mx-1 h-3 w-px bg-[rgba(255,245,230,0.08)]" />
              <button
                className="grid h-[22px] w-[30px] place-items-center rounded-full text-[#9F988D] transition-all hover:text-[#F4EFE8]"
                aria-label="Fullscreen"
              >
                <Maximize2 className="h-[11px] w-[11px]" />
              </button>
            </div>
          </div>


          {/* (Confirmation popovers are rendered anchored inside each lane) */}

        </div>
      </div>

      {/* Ambient warmth */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[rgba(194,153,96,0.04)] to-transparent" />
    </section>
  );
}
function DropHint({ from, to }: { from: LaneId; to: LaneId }) {
  let label = "";
  if (from === "live" && to !== "live") label = `Fork Live into ${to}`;
  else if (from !== "live" && to === "live") label = `Build ${from} into Live`;
  else label = `Copy ${from} into ${to}`;
  return (
    <div className="pointer-events-none absolute left-1/2 top-12 z-30 -translate-x-1/2">
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-medium text-[#F4EFE8]"
        style={{
          background: "linear-gradient(180deg, rgba(58,48,38,0.78), rgba(36,30,24,0.7))",
          boxShadow:
            "0 1px 0 rgba(255,245,230,0.08) inset, 0 10px 26px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(209,166,110,0.28)",
          backdropFilter: "blur(20px) saturate(140%)",
        }}
      >
        <Sparkles className="h-3 w-3 text-[#D1A66E]" />
        {label}
      </div>
    </div>
  );
}

function DropPopover({
  from,
  to,
  onCancel,
  onConfirm,
}: {
  from: LaneId;
  to: LaneId;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  let title = `Copy ${from} into ${to}`;
  let desc = `Derive a new draft in ${to} from ${from}.`;
  let cta = "Copy";
  if (from === "live" && to !== "live") {
    title = `Fork Live into ${to}`;
    desc = `Create a proposal from the current Live app.`;
    cta = "Create proposal";
  } else if (from !== "live" && to === "live") {
    title = `Build ${from} into Live`;
    desc = `Promote Proposal ${from} to the Live app. This replaces the current source of truth.`;
    cta = "Build into Live";
  }
  return (
    <div className="absolute left-2 top-8 z-40 w-[280px] animate-fade-up">
      <div
        className="relative rounded-[12px] p-3.5"
        style={{
          background: "linear-gradient(180deg, rgba(28,26,22,0.98), rgba(18,16,14,0.96))",
          boxShadow:
            "0 1px 0 rgba(255,245,230,0.06) inset, 0 18px 44px -16px rgba(0,0,0,0.85), 0 0 0 1px rgba(209,166,110,0.45), 0 0 48px -10px rgba(209,166,110,0.40)",
          backdropFilter: "blur(28px) saturate(160%)",
        }}
      >
        {/* anchor notch toward the lane label */}
        <span
          className="absolute -top-1.5 left-5 h-3 w-3 rotate-45 rounded-[3px]"
          style={{
            background: "linear-gradient(135deg, rgba(28,26,22,0.98), rgba(18,16,14,0.96))",
            boxShadow: "-1px -1px 0 rgba(209,166,110,0.45)",
          }}
        />

        <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-[#D1A66E]">
          <Sparkles className="h-3 w-3" />
          Confirm action
        </div>
        <div className="mt-1.5 font-serif text-[17px] leading-tight text-[#F4EFE8]">{title}</div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#C8C2B8]">{desc}</p>
        <div className="mt-3.5 flex justify-end gap-1.5">
          <GlassButton size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </GlassButton>
          <GlassButton size="sm" variant="primary" onClick={onConfirm}>
            <Play className="h-3 w-3" />
            {cta}
          </GlassButton>
        </div>
      </div>
    </div>
  );
}

function GhostLiveDrop({
  isOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  isOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative flex w-[120px] shrink-0 animate-fade-up flex-col items-stretch justify-start pl-3 transition-all duration-200",
      )}
    >
      <div className="flex items-center gap-1.5 px-1 pb-4 pt-1 text-[#D1A66E]">
        <Circle className="h-2 w-2 fill-[#B0A99E] text-[#B0A99E]" />
        <span className="font-serif text-[17px] leading-none">Live</span>
      </div>
      <div
        className={cn(
          "flex min-h-0 flex-1 items-center justify-center rounded-[10px] border border-dashed text-[11px] tracking-wide text-[#9F988D] transition-all",
          isOver
            ? "border-[rgba(209,166,110,0.7)] bg-[rgba(209,166,110,0.06)] text-[#F4EFE8] shadow-[inset_0_0_0_1px_rgba(209,166,110,0.4),0_0_40px_-10px_rgba(209,166,110,0.5)]"
            : "border-[rgba(209,166,110,0.25)] bg-[rgba(209,166,110,0.02)]",
        )}
      >
        <div className="px-3 text-center leading-snug">
          Drop here to
          <br />
          build into Live
        </div>
      </div>
    </div>
  );
}
