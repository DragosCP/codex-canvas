import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "ghost" | "glass" | "solid" | "primary" | "outline";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

const sizeMap: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-2",
  lg: "h-11 px-5 text-sm gap-2",
  icon: "h-9 w-9",
  "icon-sm": "h-8 w-8",
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, variant = "glass", size = "md", active, children, ...rest }, ref) => {
    const base =
      "relative inline-flex items-center justify-center rounded-[10px] font-medium tracking-tight transition-all duration-200 select-none outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)] disabled:opacity-40 disabled:pointer-events-none";

    const variants: Record<Variant, string> = {
      ghost:
        "text-[color:var(--color-muted-foreground)] hover:text-warm hover:bg-white/[0.04]",
      glass:
        "glass text-warm hover:bg-white/[0.06] hover:-translate-y-[0.5px] active:translate-y-0",
      solid:
        "bg-[color:var(--surface-2)] text-warm hover:bg-white/[0.06] hairline",
      primary:
        "text-[color:var(--primary-foreground)] bg-[linear-gradient(180deg,#D1A66E,#B5894E)] shadow-[inset_0_1px_0_0_rgba(255,235,210,0.35),0_8px_22px_-10px_rgba(194,153,96,0.55)] hover:brightness-[1.05]",
      outline:
        "hairline text-warm hover:bg-white/[0.04]",
    };

    const activeRing = active
      ? "ring-1 ring-inset ring-[rgba(244,239,232,0.18)] bg-white/[0.05] text-warm"
      : "";

    return (
      <button
        ref={ref}
        className={cn(base, sizeMap[size], variants[variant], activeRing, className)}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
GlassButton.displayName = "GlassButton";
