import { useState } from "react";
import { CanvasWorkspace } from "./CanvasWorkspace";
import { ChatPanel } from "./ChatPanel";
import { ProjectThreadNav } from "./ProjectThreadNav";
import type { LaneId } from "./types";

export function Workspace() {
  const [activeLanes, setActiveLanes] = useState<LaneId[]>(["live", "A"]);
  const [focusedLane, setFocusedLane] = useState<LaneId>("A");
  const [navOpen, setNavOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  return (
    <div className="relative flex h-screen w-full overflow-hidden text-warm">
      <main className="relative flex min-w-0 flex-1">
        <CanvasWorkspace
          activeLanes={activeLanes}
          focusedLane={focusedLane}
          onChangeLanes={setActiveLanes}
          onFocusLane={setFocusedLane}
          onToggleChat={() => setChatOpen((v) => !v)}
          chatOpen={chatOpen}
          onToggleNav={() => setNavOpen((v) => !v)}
        />

        {/* Chat panel — desktop side, mobile slide-over */}
        <aside
          className={[
            "z-30 shrink-0 transition-[width,transform] duration-300 ease-out",
            "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:w-[min(420px,92vw)]",
            chatOpen
              ? "lg:w-[420px] xl:w-[460px] max-lg:translate-x-0"
              : "lg:w-0 max-lg:translate-x-full",
            "overflow-hidden",
          ].join(" ")}
        >
          <ChatPanel onClose={() => setChatOpen(false)} />
        </aside>
      </main>

      <ProjectThreadNav open={navOpen} onOpenChange={setNavOpen} />
    </div>
  );
}
