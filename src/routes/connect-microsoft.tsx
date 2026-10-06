import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/pmo-ui";
import { ConnectFlow } from "@/components/integrations/connect-flow";

export const Route = createFileRoute("/connect-microsoft")({
  head: () => ({
    meta: [
      { title: "Connect Microsoft 365 — Virtual PMO" },
      {
        name: "description",
        content: "Approve access, discover Planner plans and link them to your projects.",
      },
      { property: "og:title", content: "Connect Microsoft 365 — Virtual PMO" },
      {
        property: "og:description",
        content: "Approve access, discover Planner plans and link them to your projects.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integrations"
        title="Connect Microsoft 365"
        description="Sync tasks with Microsoft Planner and bring in your people directory. This is a prototype, so no real Microsoft data is used."
      />
      <ConnectFlow />
    </div>
  ),
});
