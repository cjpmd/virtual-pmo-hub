// Server-side PDF source (spec §11, Phase 3): headless Chromium (the report-pdf Netlify
// function) opens /report-print/<id>?token=… and prints it. No session: the short-lived print
// token reads the published snapshot (report_snapshot_by_token). Renders the print layout
// directly (A4 landscape) and sets data-ready when the pack is on the page.
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { snapshotFrom } from "@/hooks/use-report-snapshots";
import { snapshotByToken, toReport, toScheme } from "@/services/reports";
import { ReportDocument } from "@/features/reports/viewer/ReportDocument";
import { PrintPageStyle } from "@/features/reports/viewer/ReportViewer";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/report-print/$reportId")({
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    ...(typeof search["token"] === "string" && { token: search["token"] }),
  }),
  head: () => ({ meta: [{ title: "Report — ORMO PMO" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type Loaded = Awaited<ReturnType<typeof snapshotByToken>>;

function Page() {
  const { reportId } = Route.useParams();
  const { token } = Route.useSearch();
  const [state, setState] = useState<{ data: Loaded; error: string | null } | null>(null);
  useEffect(() => {
    document.documentElement.classList.remove("dark");
    snapshotByToken(reportId, token ?? "")
      .then((data) => setState({ data, error: data ? null : "This link has expired." }))
      .catch((e: Error) => setState({ data: null, error: e.message }));
  }, [reportId, token]);
  if (!state) return <p className="p-8">Loading…</p>;
  if (state.error || !state.data)
    return (
      <p className="p-8" role="alert">
        {state.error}
      </p>
    );
  const report = toReport(state.data.report as never);
  const snapshot = snapshotFrom(
    state.data.snapshots.map((s) => ({
      blockInstanceId: s.block_instance_id,
      blockKey: "",
      entityId: s.entity_id,
      data: s.data,
    })),
  );
  const scheme = toScheme(snapshot.meta.scheme);
  return (
    <div
      className="report-print-root report-print-server bg-white p-0 text-black"
      data-ready="true"
    >
      <PrintPageStyle
        header={`${snapshot.meta.forum?.name ?? "Ad hoc report"} · ${report.title} · as at ${formatDate(report.asAt)}`}
        footer={`Published snapshot${snapshot.dataBasis ? ` · ${snapshot.dataBasis}` : ""}`}
      />
      <ReportDocument
        blocks={report.blocks}
        deepDives={snapshot.meta.deep_dives}
        scheme={scheme}
        asAt={report.asAt}
        mode="print"
        audience="internal"
        reportId={report.id}
        editable={false}
        snapshot={snapshot.lookup}
        movement={snapshot.movement}
      />
    </div>
  );
}
