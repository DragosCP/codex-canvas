import { useState } from "react";
import {
  Paperclip,
  ArrowUp,
  Sparkles,
  X,
  Check,
  Brain,
  ChevronDown,
  FileText,
  GitCommit,
} from "lucide-react";
import { GlassButton } from "./GlassButton";
import { VisualChip } from "./VisualChip";
import { cn } from "@/lib/utils";
import agentMark from "@/assets/agent-mark.png";

interface ChatMessage {
  id: number;
  role: "user" | "agent";
  text?: string;
  chips?: { kind: "mark" | "change" | "image" | "ref"; label: string }[];
  files?: { name: string; lines: string }[];
  working?: { status: string; steps: string[] };
}

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "user",
    text: "The onboarding hero feels heavy. Can we try a calmer take — and maybe an editorial version for the brand crowd?",
  },
  {
    id: 2,
    role: "agent",
    text: "Got it. I'll keep the IA the same and explore two directions: a quieter, more conversational hero, and an editorial layout with a serif headline.",
  },
  {
    id: 3,
    role: "user",
    text: "Use the screenshot for context, and keep the CTA on the right edge.",
    chips: [
      { kind: "image", label: "Image 1" },
      { kind: "ref", label: "Hero · CTA" },
    ],
  },
  {
    id: 4,
    role: "agent",
    text: "I've sketched three proposals into A, B, and C. A is the calm rewrite, B is the editorial spread, C is a dense data-first variant in case you want to compare extremes.",
    chips: [
      { kind: "change", label: "Change 1" },
      { kind: "change", label: "Change 2" },
      { kind: "mark", label: "Mark 1" },
    ],
  },
  {
    id: 5,
    role: "agent",
    working: {
      status: "Refining proposal A from your mark",
      steps: [
        "Reading Mark 1 on the canvas",
        "Adjusting CTA stack and copy tone",
        "Updating hero spacing tokens",
      ],
    },
  },
];

interface Props {
  onClose: () => void;
}

export function ChatPanel({ onClose }: Props) {
  const [messages] = useState(initialMessages);
  const [decision, setDecision] = useState<"open" | "decided">("open");
  const [composer, setComposer] = useState("");

  return (
    <div className="relative flex h-full flex-col">
      {/* Subtle hairline separator instead of a heavy border + filled panel */}
      <div className="pointer-events-none absolute inset-y-6 left-0 w-px bg-gradient-to-b from-transparent via-[rgba(255,245,230,0.08)] to-transparent" />

      {/* Warm ambient halo behind the agent identity */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-44 w-full"
        style={{
          background:
            "radial-gradient(60% 80% at 80% 0%, rgba(209,166,110,0.10), transparent 70%)",
        }}
      />

      {/* Header */}
      <div className="relative flex items-center gap-3 px-6 pt-6 pb-5">
        <div className="relative grid h-9 w-9 shrink-0 place-items-center">
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(209,166,110,0.35),transparent_70%)] blur-md" />
          <img
            src={agentMark}
            alt=""
            width={36}
            height={36}
            loading="lazy"
            className="relative h-9 w-9 object-contain drop-shadow-[0_6px_14px_rgba(194,153,96,0.35)]"
          />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate font-serif text-[20px] text-warm">Atelier agent</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-[#B0A99E]">
            <span className="relative grid h-2 w-2 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#C29960]/35" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#D1A66E]" />
            </span>
            Thinking with you · <span className="text-[#D6CFC3]">Sonnet 4.5</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-auto grid h-7 w-7 place-items-center rounded-full text-[#B0A99E] hover:bg-white/[0.05] hover:text-[#F4EFE8] lg:hidden"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>



      {/* Thread — editorial, less boxed */}
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-4">
        {messages.map((m, i) => (
          <Message key={m.id} m={m} delayMs={i * 70} />
        ))}
      </div>

      {/* Decision strip */}
      {decision === "open" && <DecisionStrip onPick={() => setDecision("decided")} />}

      {/* Composer — bare, no nested glass panel */}
      <div className="px-6 pb-6 pt-2">
        <div className="group rounded-[14px] bg-[rgba(255,245,230,0.025)] px-3 py-2.5 ring-1 ring-[rgba(255,245,230,0.07)] transition-all duration-200 focus-within:bg-[rgba(255,245,230,0.045)] focus-within:ring-[rgba(209,166,110,0.45)] focus-within:shadow-[0_0_0_4px_rgba(209,166,110,0.08),0_18px_40px_-20px_rgba(0,0,0,0.6)]">
          <div className="flex flex-wrap items-center gap-1.5 px-0.5 pb-1.5">
            <VisualChip kind="mark" label="Mark 1" />
            <VisualChip kind="change" label="Change 2" />
            <VisualChip kind="image" label="Image 1" />
          </div>
          <textarea
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            placeholder="Tell the agent what to try next…"
            rows={2}
            className="block w-full resize-none bg-transparent px-0.5 text-[13.5px] leading-relaxed text-warm placeholder:text-[color:var(--color-muted-foreground)]/70 focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-1">
            <GlassButton size="icon-sm" variant="ghost" aria-label="Attach">
              <Paperclip className="h-4 w-4" />
            </GlassButton>
            <GlassButton size="sm" variant="ghost" className="!gap-1">
              <Brain className="h-3.5 w-3.5" />
              Sonnet 4.5
              <ChevronDown className="h-3 w-3 opacity-60" />
            </GlassButton>
            <GlassButton size="sm" variant="ghost" className="!gap-1 hidden sm:inline-flex">
              Full access
              <ChevronDown className="h-3 w-3 opacity-60" />
            </GlassButton>
            <div className="ml-auto flex items-center gap-1.5">
              <GlassButton size="icon-sm" variant="primary" aria-label="Send">
                <ArrowUp className="h-4 w-4" />
              </GlassButton>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
function Message({ m, delayMs }: { m: ChatMessage; delayMs: number }) {
  if (m.working) {
    return (
      <div className="animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
        <RoleHead role="agent" />
        <div className="ml-7 mt-1.5">
          <div className="flex items-center gap-2 text-[12.5px]">
            <span className="relative grid h-3 w-3 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#C29960]/35" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#D1A66E]" />
            </span>
            <span className="shimmer-text font-medium">{m.working.status}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {m.working.steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2 text-[12px] text-[#B0A99E]">
                <GitCommit className="h-3 w-3 opacity-60" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div className="flex justify-end animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
        <div className="max-w-[88%]">
          <div className="text-right text-[10px] font-medium uppercase tracking-[0.16em] text-[#B0A99E]">You</div>
          <div className="mt-1.5 rounded-[12px] bg-[linear-gradient(180deg,rgba(209,166,110,0.08),rgba(209,166,110,0.03))] px-3.5 py-2.5 text-[14px] leading-[1.55] text-[#F4EFE8] ring-1 ring-[rgba(209,166,110,0.14)] shadow-[inset_0_1px_0_rgba(255,245,230,0.04)]">
            {m.text}
          </div>
          {m.chips && (
            <div className="mt-2 flex flex-wrap justify-end gap-1.5">
              {m.chips.map((c, i) => (
                <VisualChip key={i} kind={c.kind} label={c.label} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="animate-fade-up" style={{ animationDelay: `${delayMs}ms` }}>
      <RoleHead role="agent" />
      <div className="ml-7 mt-2 text-[14px] leading-[1.65] text-[#F4EFE8]">{m.text}</div>
      {m.chips && (
        <div className="ml-7 mt-2 flex flex-wrap gap-1.5">
          {m.chips.map((c, i) => (
            <VisualChip key={i} kind={c.kind} label={c.label} />
          ))}
        </div>
      )}
      {m.files && (
        <div className="ml-7 mt-2 space-y-1">
          {m.files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 rounded-[8px] bg-white/[0.025] px-2.5 py-1.5 text-[12px] text-muted hairline">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-warm">{f.name}</span>
              <span className="ml-auto text-[11px]">{f.lines}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoleHead({ role }: { role: "user" | "agent" }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "grid h-5 w-5 place-items-center rounded-[5px]",
          role === "agent" ? "bg-[rgba(194,153,96,0.14)]" : "bg-white/[0.05]",
        )}
      >
        <Sparkles className={cn("h-3 w-3", role === "agent" ? "text-[#D1A66E]" : "text-warm/80")} />
      </div>
      <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-[#B0A99E]">
        {role === "agent" ? "Agent" : "You"}
      </div>
    </div>
  );
}

function DecisionStrip({ onPick }: { onPick: () => void }) {
  return (
    <div className="px-6 pb-2 pt-1">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#9F988D]">
        <span className="h-px flex-1 bg-[rgba(255,245,230,0.07)]" />
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-[#D1A66E]" />
          How should I approach this?
        </span>
        <span className="h-px flex-1 bg-[rgba(255,245,230,0.07)]" />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <GlassButton size="sm" variant="ghost" onClick={onPick}>
          <Check className="h-3.5 w-3.5 opacity-70" /> Build directly
        </GlassButton>
        <GlassButton size="sm" variant="ghost" onClick={onPick}>
          Show 1 option
        </GlassButton>
        <GlassButton size="sm" variant="primary" onClick={onPick}>
          Show 2–3
        </GlassButton>
      </div>
    </div>
  );
}
