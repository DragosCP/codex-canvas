import { createFileRoute } from "@tanstack/react-router";
import { Workspace } from "@/components/workspace/Workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Atelier — Agentic Workspace" },
      { name: "description", content: "A chat-first agentic workspace where you shape intent visually and let the agent build." },
      { property: "og:title", content: "Atelier — Agentic Workspace" },
      { property: "og:description", content: "Canvas shows. Chat explains. Choices decide." },
    ],
  }),
  component: Index,
});

function Index() {
  return <Workspace />;
}
