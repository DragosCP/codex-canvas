import { cn } from "@/lib/utils";

interface VisualChipProps {
  kind?: "mark" | "change" | "image" | "ref";
  label: string;
  onClick?: () => void;
  className?: string;
}

const palette: Record<NonNullable<VisualChipProps["kind"]>, string> = {
  mark:   "text-[#D1A66E] border-[rgba(194,153,96,0.30)] bg-[rgba(194,153,96,0.07)]",
  change: "text-[#8BA4CC] border-[rgba(80,110,155,0.35)] bg-[rgba(80,110,155,0.08)]",
  image:  "text-[#E8DFD2] border-[rgba(244,239,232,0.12)] bg-white/[0.03]",
  ref:    "text-[color:var(--color-muted-foreground)] border-[rgba(244,239,232,0.08)] bg-white/[0.02]",
};

const dotColor: Record<string, string> = {
  mark: "bg-[#C29960]",
  change: "bg-[#506E9B]",
  image: "bg-white/55",
  ref: "bg-white/35",
};

export function VisualChip({ kind = "ref", label, onClick, className }: VisualChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px] font-medium tracking-tight transition-colors hover:brightness-110",
        palette[kind],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotColor[kind])} />
      {label}
    </button>
  );
}
