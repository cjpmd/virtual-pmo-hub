import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/services/service-error";
import { ReportPrint, useReportView } from "@/features/reports/viewer/ReportViewer";

export const Route = createFileRoute("/governance/reports/$reportId/print")({
  validateSearch: (search: Record<string, unknown>): { auto?: boolean } => ({
    ...(search["auto"] === true || search["auto"] === "true" ? { auto: true } : {}),
  }),
  head: () => ({ meta: [{ title: "Print report — ORMO PMO" }] }),
  component: Page,
});

function Page() {
  const { reportId } = Route.useParams();
  const { auto } = Route.useSearch();
  const view = useReportView(reportId);
  if (view.error) return <p role="alert">{errorMessage(view.error)}</p>;
  if (!view.data) return <div aria-busy className="h-64 animate-pulse rounded-lg bg-muted/50" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 size-3.5" /> Print / save as PDF
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/governance/reports/$reportId" params={{ reportId }}>
            Back to the report
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">
          A4 landscape. Choose "Save as PDF" as the printer to download.
        </span>
      </div>
      <ReportPrint view={view.data} autoPrint={!!auto} />
    </div>
  );
}
