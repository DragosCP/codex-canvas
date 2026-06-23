import { useState } from "react";
import {
  ChevronLeft,
  FolderKanban,
  MessagesSquare,
  Settings,
  Search,
  Plus,
  Circle,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Section = "projects" | "threads" | "settings";

const projects = [
  { name: "Northwind", sub: "Onboarding revamp", active: true, dot: "live", updated: "12s", members: 4 },
  { name: "Helios", sub: "Pricing page", dot: "idle", updated: "2h", members: 3 },
  { name: "Marlow & Co.", sub: "Brand site refresh", dot: "live", updated: "Yesterday", members: 6 },
  { name: "Quiet Studio", sub: "Portfolio v3", dot: "idle", updated: "Mon", members: 2 },
];

const threads = [
  { title: "Hero rewrite — calm vs editorial", preview: "Three proposals ready · 5 marks", when: "Now", active: true, group: "Today" },
  { title: "Pricing table simplification", preview: "Draft saved · awaiting review", when: "2h", group: "Today" },
  { title: "Onboarding checklist polish", preview: "8 changes accepted", when: "Yesterday", group: "Earlier" },
  { title: "Mobile nav redesign", preview: "Archived · merged into Live", when: "Mon", group: "Earlier" },
  { title: "Footer logos refresh", preview: "Closed", when: "Last week", group: "Earlier" },
];

const settingsItems = [
  { label: "Workspace", desc: "Name, domain, defaults" },
  { label: "Members & access", desc: "12 people · 2 invites pending" },
  { label: "Models", desc: "Sonnet 4.5 · GPT-5 · local" },
  { label: "Appearance", desc: "Warm charcoal · serif accents" },
  { label: "Keyboard", desc: "Shortcuts and command palette" },
  { label: "Billing", desc: "Atelier plan · renews Jul 12" },
];

export function ProjectThreadNav({ open, onOpenChange }: Props) {
  const [section, setSection] = useState<Section>("threads");

  return (
    <>
      {/* Slim far-right rail (desktop) */}
      <div className="z-20 hidden h-full w-14 shrink-0 flex-col items-center gap-1 border-l border-[var(--edge)] bg-[#1A1A1F] py-3 lg:flex">
        <RailButton
          icon={<FolderKanban className="h-4 w-4" />}
          active={open && section === "projects"}
          onClick={() => {
            setSection("projects");
            onOpenChange(true);
          }}
        />
        <RailButton
          icon={<MessagesSquare className="h-4 w-4" />}
          active={open && section === "threads"}
          onClick={() => {
            setSection("threads");
            onOpenChange(true);
          }}
        />
        <RailButton
          icon={<Settings className="h-4 w-4" />}
          active={open && section === "settings"}
          onClick={() => {
            setSection("settings");
            onOpenChange(true);
          }}
        />
        <div className="mt-auto flex flex-col items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#C29960] pulse-dot" />
          <div className="h-7 w-7 rounded-full bg-[linear-gradient(135deg,#D1A66E,#506E9B)] ring-1 ring-[var(--edge)]" />
        </div>
      </div>

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 z-40 h-full transition-transform duration-300 ease-out",
          "right-0 lg:right-14",
          "w-[320px] max-w-[92vw]",
          open ? "translate-x-0" : "translate-x-full lg:translate-x-[calc(100%+3.5rem)] pointer-events-none",
        )}
      >

        <div className="flex h-full flex-col border-l border-[var(--edge)] bg-[rgba(36,36,41,0.92)] backdrop-blur-2xl">
          <div className="flex items-center gap-2 px-4 py-3.5">
            <button
              className="grid h-7 w-7 place-items-center rounded-[8px] text-muted hover:bg-white/[0.04] hover:text-warm"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="font-serif text-[19px] tracking-tight text-warm">
              {section === "projects" ? "Projects" : section === "threads" ? "Threads" : "Settings"}
            </div>
            <button className="ml-auto grid h-7 w-7 place-items-center rounded-[8px] text-muted hover:bg-white/[0.04] hover:text-warm">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4">
            <div className="flex items-center gap-2 rounded-[10px] glass px-2.5 py-1.5 text-[12.5px] text-muted">
              <Search className="h-3.5 w-3.5" />
              <input
                placeholder={section === "settings" ? "Search settings" : `Search ${section}`}
                className="w-full bg-transparent text-warm placeholder:text-[color:var(--color-muted-foreground)]/70 focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
            {section === "projects" && (
              <>
                <SectionLabel>Active</SectionLabel>
                <ul className="space-y-0.5">
                  {projects.map((p) => (
                    <li key={p.name}>
                      <button
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors",
                          p.active ? "bg-white/[0.045] ring-1 ring-[rgba(209,166,110,0.18)]" : "hover:bg-white/[0.03]",
                        )}
                      >
                        <div
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-[9px] font-serif text-[15px] text-[#F4EFE8]",
                            p.active
                              ? "bg-[linear-gradient(135deg,rgba(209,166,110,0.25),rgba(80,110,155,0.20))] ring-1 ring-[rgba(209,166,110,0.30)]"
                              : "bg-[var(--surface-2)] hairline",
                          )}
                        >
                          {p.name[0]}
                        </div>
                        <div className="min-w-0 flex-1 leading-tight">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-medium text-[#F4EFE8]">{p.name}</span>
                            <Circle
                              className={cn(
                                "h-1.5 w-1.5 shrink-0",
                                p.dot === "live"
                                  ? "fill-[#C29960] text-[#C29960] pulse-dot"
                                  : "fill-white/15 text-white/15",
                              )}
                            />
                          </div>
                          <div className="mt-0.5 truncate text-[11.5px] text-[#9F988D]">{p.sub}</div>
                        </div>
                        <div className="shrink-0 text-right text-[10px] uppercase tracking-wider text-[#7A746A]">
                          <div>{p.updated}</div>
                          <div className="mt-0.5 text-[10px] normal-case tracking-normal text-[#5F594F]">{p.members} ppl</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {section === "threads" && (
              <div className="space-y-4">
                {["Today", "Earlier"].map((grp) => (
                  <div key={grp}>
                    <SectionLabel>{grp}</SectionLabel>
                    <ul className="space-y-0.5">
                      {threads.filter((t) => t.group === grp).map((t) => (
                        <li key={t.title}>
                          <button
                            className={cn(
                              "flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left transition-colors",
                              t.active
                                ? "bg-white/[0.045] ring-1 ring-[rgba(209,166,110,0.18)]"
                                : "hover:bg-white/[0.03]",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                t.active
                                  ? "bg-[#D1A66E] shadow-[0_0_0_3px_rgba(209,166,110,0.18)]"
                                  : "bg-white/15",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12.5px] font-medium text-[#F4EFE8]">{t.title}</div>
                              <div className="mt-0.5 truncate text-[11px] text-[#8A847A]">{t.preview}</div>
                            </div>
                            <div className="shrink-0 text-[10.5px] uppercase tracking-wider text-[#7A746A]">{t.when}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {section === "settings" && (
              <ul className="space-y-0.5">
                {settingsItems.map((s) => (
                  <li key={s.label}>
                    <button className="flex w-full items-start gap-3 rounded-[10px] px-2.5 py-2.5 text-left hover:bg-white/[0.03]">
                      <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9F988D]" />
                      <div className="min-w-0 flex-1 leading-tight">
                        <div className="text-[13px] text-[#F4EFE8]">{s.label}</div>
                        <div className="mt-0.5 truncate text-[11.5px] text-[#8A847A]">{s.desc}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--edge)] px-4 py-3">
            <div className="flex items-center gap-2 text-[11.5px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C29960] pulse-dot" />
              All systems calm · synced 12s ago
            </div>
          </div>
        </div>
      </div>

      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => onOpenChange(false)}
          aria-label="Close drawer"
        />
      )}
    </>
  );
}

function RailButton({ icon, active, onClick }: { icon: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-[10px] transition-all",
        active
          ? "bg-white/[0.08] text-[#F4EFE8] ring-1 ring-[var(--edge)]"
          : "text-[#B0A99E] hover:bg-white/[0.05] hover:text-[#F4EFE8]",
      )}
    >
      {icon}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 px-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#7A746A]">
      {children}
    </div>
  );
}
