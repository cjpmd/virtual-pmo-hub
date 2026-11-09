import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/pmo-ui";
import { ConnectFlow } from "@/components/integrations/connect-flow";
import { plannerSync } from "@/lib/features";

export const Route = createFileRoute("/connect-microsoft")({
  // Planner sync isn't live yet (VITE_PLANNER_SYNC); Settings says it is coming later.
  beforeLoad: () => {
    if (!plannerSync) throw redirect({ to: "/settings", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Connect Microsoft 365 — ORMO PMO" },
      {
        name: "description",
        content: "Approve access, discover Planner plans and link them to your projects.",
      },
      { property: "og:title", content: "Connect Microsoft 365 — ORMO PMO" },
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
        description="Sync tasks with Microsoft Planner and bring in your people directory."
      />
      <ConnectFlow />
    </div>
  ),
});
