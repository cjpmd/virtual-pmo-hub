import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute } from "@tanstack/react-router";
import { DependencyWorkspace } from "@/components/dependency-workspace";
import { PageHeader } from "@/components/pmo-ui";
import { DependencyViewTabs } from "@/components/dependency-view-tabs";
const title = "Dependency Register — Virtual PMO",
  description = "Cross-programme and cross-PM dependencies, ownership, confirmation and health.";
export const Route = createFileRoute("/delivery/dependencies/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});
function Page() {
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Portfolio assurance"
        title="Dependencies"
        description="Who needs what from whom, by when, and whether both sides have agreed. Boundaries are calculated from the project managers assigned to each programme."
      />
      <DependencyViewTabs />
      <DependencyWorkspace />
    </div>
  );
}
