import { createFileRoute } from "@tanstack/react-router";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { ReportBuilder } from "@/features/reports/builder/ReportBuilder";

export const Route = createFileRoute("/governance/reports/$reportId/edit")({
  head: () => ({ meta: [{ title: "Report builder — ORMO PMO" }] }),
  component: Page,
});

function Page() {
  const { reportId } = Route.useParams();
  return (
    <div className="space-y-4">
      <AutoBreadcrumbs />
      <ReportBuilder reportId={reportId} />
    </div>
  );
}
