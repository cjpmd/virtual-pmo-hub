import { createFileRoute } from "@tanstack/react-router";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { TemplateBuilder } from "@/features/reports/builder/TemplateBuilder";

export const Route = createFileRoute("/governance/reports/templates/$templateId/edit")({
  head: () => ({ meta: [{ title: "Template builder — ORMO PMO" }] }),
  component: Page,
});

function Page() {
  const { templateId } = Route.useParams();
  return (
    <div className="space-y-4">
      <AutoBreadcrumbs />
      <TemplateBuilder templateId={templateId} />
    </div>
  );
}
