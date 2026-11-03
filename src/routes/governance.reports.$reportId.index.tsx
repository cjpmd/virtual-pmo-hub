import { createFileRoute } from "@tanstack/react-router";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { ReportViewer } from "@/features/reports/viewer/ReportViewer";
import { ReportHeader } from "@/features/reports/viewer/ReportHeader";
import { ReportHistory, ReportLifecycleActions } from "@/features/reports/viewer/ReportLifecycle";
import { useReportMutations } from "@/hooks/use-reports";

export const Route = createFileRoute("/governance/reports/$reportId/")({
  head: () => ({ meta: [{ title: "Report — ORMO PMO" }] }),
  component: Page,
});

function Page() {
  const { reportId } = Route.useParams();
  const { invalidateReport } = useReportMutations();
  return (
    <div className="space-y-4">
      <AutoBreadcrumbs />
      <ReportHeader reportId={reportId} />
      <ReportViewer
        reportId={reportId}
        actions={(view) => (
          <ReportLifecycleActions
            report={view.report}
            permissions={view.permissions}
            scheme={view.scheme}
            draft={{ overallRating: view.report.overallRating, blocks: view.report.blocks }}
            dirty={false}
            onDone={async () => {
              await invalidateReport(reportId);
            }}
          />
        )}
      />
      <ReportHistory reportId={reportId} />
    </div>
  );
}
