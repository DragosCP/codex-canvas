import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LaneId } from "./types";
import {
  ArrowUpRight,
  CircleDot,
  PlayCircle,
  Search,
  Bell,
  Star,
  ChevronRight,
} from "lucide-react";

interface Props {
  laneId: LaneId;
  device: "desktop" | "mobile";
  markMode: boolean;
  showChanges: boolean;
  stopped?: boolean;
  compact?: boolean;
}

interface Mark {
  id: number;
  xPct: number;
  yPct: number;
  label: string;
}

export function PreviewSurface({ laneId, device, markMode, showChanges, stopped, compact }: Props) {
  const [marks, setMarks] = useState<Mark[]>(
    laneId === "A" ? [{ id: 1, xPct: 78, yPct: 22, label: "Mark 1" }] : [],
  );
  const [dragId, setDragId] = useState<number | null>(null);


  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!markMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMarks((m) => [...m, { id: Date.now(), xPct: x, yPct: y, label: `Mark ${m.length + 1}` }]);
  };

  return (
    <div
      className={cn(
        "relative mx-auto min-h-0 flex-1 overflow-hidden bg-[#FBF8F2] text-[#1F1E1B]",
        device === "mobile" ? "w-full max-w-[300px] my-3 rounded-[10px] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]" : "w-full",
        markMode && "cursor-crosshair",
      )}
      onClick={onSurfaceClick}
    >
      {stopped && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[rgba(28,28,33,0.55)] backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full glass-strong px-3.5 py-2 text-[12.5px] text-warm">
            <CircleDot className="h-3.5 w-3.5 text-[#C29960]" />
            Live is paused
            <button className="ml-2 inline-flex items-center gap-1 text-[#D1A66E] hover:underline">
              <PlayCircle className="h-3.5 w-3.5" /> Resume
            </button>
          </div>
        </div>
      )}

      <FakeApp laneId={laneId} compact={!!compact} />

      {showChanges && laneId !== "live" && (
        <>
          {/* Anchor + label pairs sit at the edges so they never overlap content */}
          <ChangeBadge anchorTop="14%" anchorLeft="22%" labelSide="right" labelTop="6%" labelLeft="98%" label="Change 1" note="Headline copy" />
          <ChangeBadge anchorTop="54%" anchorLeft="32%" labelSide="left" labelTop="62%" labelLeft="2%" label="Change 2" note="CTA placement" />
          <ChangeBadge anchorTop="86%" anchorLeft="50%" labelSide="right" labelTop="92%" labelLeft="98%" label="Change 3" note="Footer logos" />
        </>
      )}

      {marks.map((m) => (
        <div
          key={m.id}
          onMouseDown={(e) => {
            e.stopPropagation();
            setDragId(m.id);
          }}
          onMouseUp={() => setDragId(null)}
          onMouseMove={(e) => {
            if (dragId !== m.id) return;
            const parent = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
            const x = ((e.clientX - parent.left) / parent.width) * 100;
            const y = ((e.clientY - parent.top) / parent.height) * 100;
            setMarks((arr) => arr.map((mm) => (mm.id === m.id ? { ...mm, xPct: x, yPct: y } : mm)));
          }}
          className="absolute z-20 cursor-grab active:cursor-grabbing"
          style={{ left: `${m.xPct}%`, top: `${m.yPct}%` }}
        >
          {/* Precise anchor dot + leader to a small label */}
          <div className="relative -translate-x-1/2 -translate-y-1/2">
            <span className="block h-2.5 w-2.5 rounded-full bg-[#C29960] ring-2 ring-[rgba(194,153,96,0.25)] shadow-[0_4px_10px_-2px_rgba(194,153,96,0.55)]" />
            <span className="absolute left-1/2 top-1/2 h-px w-7 origin-left -translate-y-1/2 bg-[rgba(194,153,96,0.55)]" />
            <span className="absolute left-1/2 top-1/2 ml-8 -translate-y-1/2 whitespace-nowrap rounded-[5px] bg-[#C29960] px-1.5 py-[2px] text-[10px] font-semibold tracking-tight text-[#1C1C21] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.45)]">
              {m.label}
            </span>
          </div>
        </div>
      ))}

    </div>
  );
}

function ChangeBadge({
  anchorTop,
  anchorLeft,
  labelTop,
  labelLeft,
  labelSide,
  label,
  note,
}: {
  anchorTop: string;
  anchorLeft: string;
  labelTop: string;
  labelLeft: string;
  labelSide: "left" | "right";
  label: string;
  note: string;
}) {
  const num = label.split(" ")[1];
  return (
    <>
      {/* Precise anchor dot on the target */}
      <span
        className="pointer-events-none absolute z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#506E9B] ring-2 ring-[rgba(80,110,155,0.22)] shadow-[0_3px_8px_-2px_rgba(80,110,155,0.55)]"
        style={{ top: anchorTop, left: anchorLeft }}
      />
      {/* Label parked at the edge, with a soft leader implied by alignment */}
      <div
        className="group absolute z-10"
        style={{
          top: labelTop,
          left: labelLeft,
          transform: labelSide === "right" ? "translate(-100%, -50%)" : "translate(0, -50%)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#506E9B] text-[10px] font-semibold text-white shadow-[0_6px_14px_-4px_rgba(80,110,155,0.55)]">
            {num}
          </span>
          <span className="rounded-[5px] bg-[#1C1C21]/90 px-1.5 py-[2px] text-[10px] font-medium tracking-tight text-[#F4EFE8] opacity-0 transition-opacity group-hover:opacity-100">
            {label} · {note}
          </span>
        </div>
      </div>
    </>
  );
}

function FakeApp({ laneId, compact }: { laneId: LaneId; compact: boolean }) {
  const isLive = laneId === "live";
  const accent = isLive ? "#506E9B" : "#C29960";
  return (
    <div className="flex h-full flex-col bg-[#FBF8F2]">
      <div className="flex items-center gap-4 border-b border-black/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-[6px]" style={{ background: accent }} />
          <div className="text-[12.5px] font-semibold tracking-tight">Northwind</div>
        </div>
        <div className="hidden items-center gap-4 text-[11.5px] text-black/55 md:flex">
          <span>Product</span><span>Customers</span><span>Pricing</span><span>Docs</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[11px] text-black/50 md:flex">
            <Search className="h-3 w-3" />
            Search
          </div>
          <Bell className="h-3.5 w-3.5 text-black/50" />
          <div className="h-6 w-6 rounded-full bg-[#E6D4B4]" />
        </div>
      </div>

      <div className={cn("flex flex-1 flex-col", compact ? "px-5 pt-8 pb-6" : "px-8 pt-10 pb-8 md:pt-12")}>
        <div className="w-full">
          {laneId === "B" ? (
            <EditorialHero accent={accent} />
          ) : laneId === "C" ? (
            <DenseHero accent={accent} />
          ) : (
            <DefaultHero accent={accent} variant={isLive ? "live" : "calm"} />
          )}
        </div>
      </div>
    </div>
  );
}

function DefaultHero({ accent, variant }: { accent: string; variant: "live" | "calm" }) {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
        <div className="flex flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-black/[0.04] px-2.5 py-1 text-[10.5px] font-medium text-black/55">
            <Star className="h-3 w-3" /> {variant === "live" ? "New · Q3 release" : "Now in beta"}
          </div>
          <h1
            className="mt-3 text-[40px] leading-[1.02] tracking-tight"
            style={{ fontFamily: variant === "calm" ? "Instrument Serif, Georgia, serif" : undefined, fontWeight: variant === "calm" ? 400 : 600 }}
          >
            {variant === "live" ? "Operations, finally on one canvas." : "Run your operations on one quiet canvas."}
          </h1>
          <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-black/55">
            {variant === "live"
              ? "Northwind brings billing, fulfillment, and support into a single view for fast-growing teams."
              : "A calmer interface for the rituals that move your business — billing, fulfillment, support."}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-[8px] px-3.5 text-[12px] font-medium text-white"
              style={{ background: accent }}
            >
              Start free <ArrowUpRight className="h-3 w-3" />
            </button>
            <button className="inline-flex h-9 items-center rounded-[8px] border border-black/10 px-3.5 text-[12px] font-medium text-black/65">
              Book a demo
            </button>
          </div>
          <div className="mt-7 flex items-center gap-4 text-[10.5px] text-black/40">
            <span>Trusted by</span>
            <div className="flex items-center gap-3 opacity-70">
              <Logo /> <Logo /> <Logo /> <Logo />
            </div>
          </div>
        </div>
        <div className="relative">
          <div className="aspect-[5/4] w-full overflow-hidden rounded-[12px] border border-black/[0.06] bg-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.15)]">
            <FakeChart accent={accent} />
          </div>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { k: "Billing", v: "Auto-reconciled invoices", d: "98% match rate" },
          { k: "Fulfillment", v: "Single queue, every channel", d: "12 integrations" },
          { k: "Support", v: "Threaded with the order", d: "No context loss" },
        ].map((s) => (
          <div key={s.k} className="rounded-[10px] border border-black/[0.06] bg-white/70 p-3.5">
            <div className="text-[10px] uppercase tracking-wider text-black/45">{s.k}</div>
            <div className="mt-1 text-[13px] font-medium tracking-tight text-black/80">{s.v}</div>
            <div className="mt-0.5 text-[10.5px] text-black/45">{s.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorialHero({ accent }: { accent: string }) {
  return (
    <div className="grid h-full grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-7">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-black/45">Issue 41 · Operations</div>
        <h1 className="mt-2 text-[36px] leading-[1.02]" style={{ fontFamily: "Instrument Serif, Georgia, serif" }}>
          A quieter way to run the company.
        </h1>
        <p className="mt-3 max-w-md text-[12.5px] leading-relaxed text-black/55">
          A new editorial take on the dashboard — long-form, intentional, and arranged like a magazine spread.
        </p>
        <div className="mt-5 flex items-center gap-2">
          <button className="h-8 rounded-full px-4 text-[11.5px] font-medium text-white" style={{ background: accent }}>
            Read the manifesto
          </button>
          <button className="h-8 rounded-full border border-black/15 px-4 text-[11.5px] font-medium text-black/70">
            Subscribe
          </button>
        </div>
      </div>
      <div className="col-span-12 grid gap-3 lg:col-span-5">
        <div className="aspect-[4/3] rounded-[10px] bg-[#E8D9BE]" />
        <div className="grid grid-cols-2 gap-3">
          <div className="aspect-square rounded-[10px] bg-[#C8D3E2]" />
          <div className="aspect-square rounded-[10px] bg-[#EDE4D0]" />
        </div>
      </div>
    </div>
  );
}

function DenseHero({ accent }: { accent: string }) {
  return (
    <div className="grid h-full gap-3 md:grid-cols-3">
      {[
        { k: "MRR", v: "$284,210", d: "+4.2%" },
        { k: "Active customers", v: "12,408", d: "+128" },
        { k: "Open tickets", v: "37", d: "-12" },
      ].map((s) => (
        <div key={s.k} className="rounded-[10px] border border-black/[0.06] bg-white p-3.5">
          <div className="text-[10.5px] uppercase tracking-wider text-black/45">{s.k}</div>
          <div className="mt-1 text-[20px] font-semibold tracking-tight">{s.v}</div>
          <div className="text-[10.5px]" style={{ color: accent }}>{s.d} this week</div>
        </div>
      ))}
      <div className="md:col-span-3 rounded-[10px] border border-black/[0.06] bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="text-[11.5px] font-semibold">Revenue · last 30 days</div>
          <button className="inline-flex items-center gap-0.5 text-[11px] text-black/55">View report <ChevronRight className="h-3 w-3" /></button>
        </div>
        <div className="mt-2 h-40">
          <FakeChart accent={accent} />
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return <div className="h-3 w-12 rounded-sm bg-black/15" />;
}

function FakeChart({ accent }: { accent: string }) {
  const pts = [10, 22, 18, 30, 26, 38, 32, 44, 40, 52, 48, 60, 56, 70];
  const max = Math.max(...pts);
  const w = 100;
  const h = 100;
  const step = w / (pts.length - 1);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * 80 - 5}`).join(" ");
  const area = d + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.30" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#g)" />
      <path d={d} stroke={accent} strokeWidth="1.2" fill="none" />
    </svg>
  );
}
