// Page header for a report: title, forum and status.
import { PageHeader } from "@/components/pmo-ui";
import { useReport } from "@/hooks/use-reports";
import { STATUS_LABEL } from "./ReportLifecycle";

export function ReportHeader({ reportId }: { reportId: string }) {
  const report = useReport(reportId);
  const r = report.data;
  return (
    <PageHeader
      eyebrow="Governance · Reports"
      title={r?.title ?? "Report"}
      description={r ? `${STATUS_LABEL[r.status]} · ${r.scopeType} report` : "Loading…"}
    />
  );
}
