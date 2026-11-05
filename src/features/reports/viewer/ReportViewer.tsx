// Report viewer (spec §9.2): banner (draft live / published snapshot), sticky contents, the
// document, and the print layout (§11: A4 landscape, page breaks, header and footer).
import { useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { Pencil, Presentation, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useInclusions,
  useReport,
  useReportContext,
  useReportPermissions,
  useScopeMetrics,
} from "@/hooks/use-reports";
import { useReportSnapshot } from "@/hooks/use-report-snapshots";
import { useBlockData } from "@/hooks/use-reports";
import { toMovement, type ChangesData } from "../engine/diff";
import {
  toScheme,
  type ReportInput,
  type ReportPermissions,
  type ReportRecord,
} from "@/services/reports";
import { errorMessage } from "@/services/service-error";
import { useReportFormat } from "../blocks/primitives";
import type { RatingScheme } from "../blocks/types";
import {
  ReportDocument,
  ReportToc,
  sectionsOf,
  type DeepDiveProject,
  type DocumentProps,
} from "./ReportDocument";
import { STATUS_LABEL } from "./ReportLifecycle";

export interface ViewModel {
  report: ReportRecord;
  scheme: RatingScheme;
  deepDives: DeepDiveProject[];
  doc: Omit<DocumentProps, "mode">;
  forumName: string | null;
  meetingDate: string | null;
  isSnapshot: boolean;
  canEdit: boolean;
  isPartner: boolean;
  permissions: ReportPermissions;
  /** What the figures are as at (live: from the context; published: as stored). */
  dataBasis: string | null;
}

/** The comparison with the previous pack, resolved for drafts (published packs store it). */
const CHANGES_BLOCK = {
  id: "__changes",
  blockKey: "changes_since_last",
  blockVersion: 1,
  config: {},
  placement: "report" as const,
};

/** Everything a view of a report needs: live for drafts, snapshot for published packs. */
export function useReportView(reportId: string): {
  data: ViewModel | null;
  error: unknown;
  loading: boolean;
} {
  const report = useReport(reportId);
  const published = report.data?.status === "published" || report.data?.status === "withdrawn";
  const input: ReportInput | null = useMemo(
    () => (report.data && !published ? { report_id: reportId } : null),
    [report.data, published, reportId],
  );
  const context = useReportContext(input);
  const permissions = useReportPermissions(reportId);
  // Scope metrics and changes wait for the context so they join the blocks' batch: one
  // context and one metrics run per page (RB-50).
  const live = context.data ? input : null;
  const metrics = useScopeMetrics(live);
  const inclusions = useInclusions(report.data && !published ? reportId : null);
  const snapshot = useReportSnapshot(published ? reportId : null);
  const changes = useBlockData(
    live,
    CHANGES_BLOCK,
    null,
    !!live && !!report.data?.previousReportId,
  );
  const error = report.error ?? context.error ?? snapshot.error ?? null;
  if (!report.data || !permissions.data) return { data: null, error, loading: !error };
  const isPartner = permissions.data.is_partner;
  if (published) {
    if (!snapshot.data) return { data: null, error, loading: !error };
    const s = snapshot.data;
    const scheme = toScheme(s.meta.scheme);
    return {
      error: null,
      loading: false,
      data: {
        report: report.data,
        scheme,
        deepDives: s.meta.deep_dives,
        forumName: s.meta.forum?.name ?? null,
        meetingDate: s.meta.meeting?.meeting_date ?? null,
        isSnapshot: true,
        canEdit: false,
        isPartner,
        permissions: permissions.data,
        dataBasis: s.dataBasis,
        doc: {
          blocks: report.data.blocks,
          deepDives: s.meta.deep_dives,
          scheme,
          asAt: report.data.asAt,
          audience: isPartner ? "partner" : "internal",
          reportId,
          editable: false,
          snapshot: s.lookup,
          movement: s.movement,
          hiddenBlockKeys: permissions.data.hidden_block_keys,
          showPartnerPlaceholders: !isPartner,
        },
      },
    };
  }
  if (!context.data) return { data: null, error, loading: !error };
  const byId = new Map((metrics.data ?? []).map((row) => [row.project_id, row]));
  const deepDives: DeepDiveProject[] = (inclusions.data ?? [])
    .filter((row) => row.mode !== "excluded")
    .map((row) => ({
      id: row.entityId,
      code: byId.get(row.entityId)?.code ?? "",
      name: byId.get(row.entityId)?.name ?? "",
      reasons: row.reasons,
      mode: row.mode as "rule" | "pinned",
    }));
  const scheme = toScheme(context.data.scheme);
  return {
    error: null,
    loading: false,
    data: {
      report: report.data,
      scheme,
      deepDives,
      forumName: context.data.forum?.name ?? null,
      meetingDate: context.data.meeting?.meeting_date ?? null,
      isSnapshot: false,
      canEdit: permissions.data.can_edit,
      isPartner,
      permissions: permissions.data,
      dataBasis: context.data.data_basis?.text ?? null,
      doc: {
        blocks: report.data.blocks,
        deepDives,
        scheme,
        asAt: report.data.asAt,
        audience: "internal",
        reportId,
        editable: false,
        live: input,
        showPartnerPlaceholders: true,
        movement: toMovement(changes.data as ChangesData | undefined),
      },
    },
  };
}

export function Banner({ view }: { view: ViewModel }) {
  const f = useReportFormat();
  const r = view.report;
  return (
    <p
      className={
        view.isSnapshot
          ? "rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
          : "rounded-md border border-health-warn/40 bg-health-warn/10 px-3 py-2 text-sm"
      }
      data-banner={view.isSnapshot ? "snapshot" : "live"}
    >
      {view.isSnapshot
        ? `${STATUS_LABEL[r.status]} ${f.date(r.publishedAt?.slice(0, 10))} · as at ${f.date(r.asAt)} · Snapshot`
        : `${STATUS_LABEL[r.status]} · live data · as at ${f.date(r.asAt)}`}
      {r.status === "withdrawn" && " · withdrawn: kept for the record, not for decisions"}
      {view.dataBasis && (
        <span className="block text-xs text-muted-foreground">Data basis: {view.dataBasis}</span>
      )}
    </p>
  );
}

export function ReportViewer({
  reportId,
  actions,
}: {
  reportId: string;
  actions?: (view: ViewModel) => ReactNode;
}) {
  const view = useReportView(reportId);
  if (view.error) return <p role="alert">{errorMessage(view.error)}</p>;
  if (!view.data) return <div aria-busy className="h-64 animate-pulse rounded-lg bg-muted/50" />;
  const v = view.data;
  const sections = sectionsOf(v.report.blocks, v.deepDives);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Banner view={v} />
        <div className="flex flex-wrap gap-2">
          {v.canEdit && (
            <Button size="sm" variant="outline" asChild>
              <Link to="/governance/reports/$reportId/edit" params={{ reportId }}>
                <Pencil className="mr-1 size-3.5" /> Edit
              </Link>
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link to="/governance/reports/$reportId/present" params={{ reportId }}>
              <Presentation className="mr-1 size-3.5" /> Present
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link
              to="/governance/reports/$reportId/print"
              params={{ reportId }}
              search={{ auto: true }}
            >
              <Printer className="mr-1 size-3.5" /> Download PDF
            </Link>
          </Button>
          {actions?.(v)}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <ReportToc sections={sections} />
          </div>
        </aside>
        <ReportDocument {...v.doc} mode="screen" />
      </div>
    </div>
  );
}

/** Light theme and the pack title while printing (as committee packs do). */
function usePrintTheme(title: string) {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    let previousTitle = document.title;
    const before = () => {
      wasDark = root.classList.contains("dark");
      root.classList.remove("dark");
      previousTitle = document.title;
      document.title = title;
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
      document.title = previousTitle;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [title]);
}

/**
 * Running header and footer in the page margins (@page margin boxes, with the page number).
 * Generated per report because margin boxes only take literal strings.
 */
export function PrintPageStyle({ header, footer }: { header: string; footer: string }) {
  const css = (text: string) => JSON.stringify(text.replace(/[\n\r]/g, " "));
  return (
    <style>{`@media print { @page { size: A4 landscape; margin: 14mm 10mm 12mm;
      @top-left { content: ${css(header)}; font-size: 8pt; color: #555; }
      @bottom-left { content: ${css(footer)}; font-size: 8pt; color: #555; }
      @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #555; } } }`}</style>
  );
}

/** Print layout. The portal is what prints; the page shows the same layout as a preview. */
export function ReportPrint({ view, autoPrint }: { view: ViewModel; autoPrint: boolean }) {
  const f = useReportFormat();
  usePrintTheme(view.report.title);
  const blocksReady = typeof document !== "undefined";
  useEffect(() => {
    if (!autoPrint) return;
    // Give live blocks a moment to resolve before the dialog opens.
    const timer = window.setTimeout(() => window.print(), 2500);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);
  const header = `${view.forumName ?? "Ad hoc report"} · ${view.report.title} · as at ${f.date(view.report.asAt)}`;
  const footer = `${view.isSnapshot ? "Published snapshot" : "Draft · live data"}${view.dataBasis ? ` · ${view.dataBasis}` : ""}`;
  const body = (
    <div className="report-print light bg-white text-black">
      <PrintPageStyle header={header} footer={footer} />
      <ReportDocument {...view.doc} mode="print" />
    </div>
  );
  return (
    <>
      <div className="mx-auto max-w-[297mm] rounded-lg border bg-white p-6 text-black shadow-sm">
        {body}
      </div>
      {blocksReady && createPortal(<div className="report-print-root">{body}</div>, document.body)}
    </>
  );
}
