import { createFileRoute } from "@tanstack/react-router";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { ReportViewer } from "@/features/reports/viewer/ReportViewer";
import { ReportHeader } from "@/features/reports/viewer/ReportHeader";

export const Route = createFileRoute("/governance/reports/$reportId/")({
  head: () => ({ meta: [{ title: "Report — ORMO PMO" }] }),
  component: Page,
});

function Page() {
  const { reportId } = Route.useParams();
  return (
    <div className="space-y-4">
      <AutoBreadcrumbs />
      <ReportHeader reportId={reportId} />
      <ReportViewer reportId={reportId} />
    </div>
  );
}
