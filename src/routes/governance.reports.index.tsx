import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FilePlus2, LayoutTemplate } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReports } from "@/hooks/use-reports";
import { useFormat } from "@/lib/format";
import { NewReportDialog } from "@/features/reports/builder/NewReportDialog";
import { STATUS_LABEL } from "@/features/reports/viewer/ReportLifecycle";
import type { ReportListItem, ReportStatus } from "@/services/reports";
import { useOrgWritable } from "@/hooks/use-org-access";
import { ReadOnlyTip } from "@/components/org-access-banner";

const title = "Reports — ORMO PMO",
  description = "Board packs and ad hoc reports, built from blocks and templates.";

export const Route = createFileRoute("/governance/reports/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { forum?: string; meeting?: string; create?: boolean } => ({
    ...(typeof search["forum"] === "string" && { forum: search["forum"] }),
    ...(typeof search["meeting"] === "string" && { meeting: search["meeting"] }),
    ...((search["create"] === true || search["create"] === "true") && { create: true }),
  }),
  head: () => ({ meta: [{ title }, { name: "description", content: description }] }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const query = useReports();
  const writable = useOrgWritable();
  const [open, setOpen] = useState(!!search.create);
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Governance"
        title="Reports"
        description={description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/governance/reports/templates">
                <LayoutTemplate className="mr-1 size-4" /> Templates
              </Link>
            </Button>
            <ReadOnlyTip readOnly={!writable}>
              <Button disabled={!writable} onClick={() => setOpen(true)}>
                <FilePlus2 className="mr-1 size-4" /> New report
              </Button>
            </ReadOnlyTip>
          </div>
        }
      />
      <QueryState query={query}>
        {(reports) => <ReportList reports={reports} forumFilter={search.forum ?? null} />}
      </QueryState>
      <NewReportDialog
        open={open && writable}
        onOpenChange={setOpen}
        forumId={search.forum ?? null}
        meetingId={search.meeting ?? null}
      />
    </div>
  );
}

function ReportList({
  reports,
  forumFilter,
}: {
  reports: ReportListItem[];
  forumFilter: string | null;
}) {
  const format = useFormat();
  const [status, setStatus] = useState<ReportStatus | "">("");
  const [forum, setForum] = useState<string>(forumFilter ?? "");
  const forums = useMemo(
    () => [
      ...new Map(
        reports.filter((r) => r.forumId).map((r) => [r.forumId!, r.forumName ?? ""]),
      ).entries(),
    ],
    [reports],
  );
  const rows = reports.filter(
    (r) => (!status || r.status === status) && (!forum || r.forumId === forum),
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Filter by status"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as ReportStatus | "")}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by forum"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={forum}
          onChange={(e) => setForum(e.target.value)}
        >
          <option value="">All forums</option>
          {forums.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No reports yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Report</th>
                <th className="px-3 py-2 font-medium">Forum</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">As at</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" data-report-row={r.id}>
                  <td className="px-3 py-2">
                    <Link
                      to={
                        r.status === "draft" || r.status === "in_review"
                          ? "/governance/reports/$reportId/edit"
                          : "/governance/reports/$reportId"
                      }
                      params={{ reportId: r.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {r.templateName ?? "Ad hoc"} · {r.scopeType}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.forumName ?? "—"}
                    {r.meetingDate && (
                      <div className="text-xs text-muted-foreground">
                        Meeting {format.date(r.meetingDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={r.status === "published" ? "default" : "outline"}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">{format.date(r.asAt)}</td>
                  <td className="px-3 py-2">{format.date(r.updatedAt.slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
