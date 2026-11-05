// Report lifecycle actions (spec §10): submit, return (with a comment), approve, publish
// (snapshot, then email and server PDF through report-publish) and withdraw; and the history.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useReportEvents } from "@/hooks/use-reports";
import {
  approveReport,
  publishReport,
  returnReport,
  submitReport,
  withdrawReport,
  type ReportPermissions,
  type ReportRecord,
  type ReportStatus,
} from "@/services/reports";
import { errorMessage } from "@/services/service-error";
import type { BlockInstance, RatingScheme } from "../blocks/types";

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export function ReportLifecycleActions({
  report,
  permissions,
  scheme,
  draft,
  dirty,
  onDone,
}: {
  report: ReportRecord;
  permissions: ReportPermissions | null;
  scheme: RatingScheme;
  draft: { overallRating: string | null; blocks: BlockInstance[] };
  dirty: boolean;
  onDone: (event: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (!permissions) return null;
  const run = async (event: string, action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      const result = await action();
      if (event === "published" && result && typeof result === "object") {
        const r = result as Awaited<ReturnType<typeof publishReport>>;
        const dist = r.distribution;
        toast.success(
          dist
            ? `${success}. ${dist.skipped ? `Email not sent: ${dist.skipped}.` : `Emailed ${dist.sent} people.`}`
            : `${success}. Email is sent by the report-publish function, which isn't available here.`,
        );
      } else toast.success(success);
      await onDone(event);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const needsRating = scheme.isAssurance && !draft.overallRating;
  const s = report.status;
  return (
    <>
      {s === "draft" && report.forumId && permissions.can_edit && (
        <Button
          size="sm"
          disabled={busy || dirty || needsRating}
          title={needsRating ? "Set the overall rating first" : dirty ? "Saving…" : undefined}
          onClick={() =>
            void run("submitted", () => submitReport(report.id), "Submitted for review")
          }
        >
          Submit for review
        </Button>
      )}
      {(s === "in_review" || s === "approved") &&
        (permissions.can_approve || permissions.can_publish) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              const comment = window.prompt("What needs changing?");
              if (comment)
                void run("returned", () => returnReport(report.id, comment), "Returned to draft");
            }}
          >
            Return
          </Button>
        )}
      {s === "in_review" && permissions.can_approve && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => void run("approved", () => approveReport(report.id), "Approved")}
        >
          Approve
        </Button>
      )}
      {(s === "approved" || (s === "draft" && !report.forumId)) && permissions.can_publish && (
        <Button
          size="sm"
          disabled={busy || dirty}
          onClick={() => {
            if (
              window.confirm(
                "Publish? The pack is frozen as a snapshot and sent to the forum's members.",
              )
            )
              void run("published", () => publishReport(report.id), "Published");
          }}
        >
          Publish
        </Button>
      )}
      {s === "published" && permissions.can_withdraw && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            const reason = window.prompt("Why is it being withdrawn?");
            if (reason !== null)
              void run("withdrawn", () => withdrawReport(report.id, reason), "Withdrawn");
          }}
        >
          Withdraw
        </Button>
      )}
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: "Created",
  submitted: "Submitted for review",
  approved: "Approved",
  returned: "Returned to draft",
  published: "Published",
  distributed: "Emailed to members",
  withdrawn: "Withdrawn",
  selection_refreshed: "Selection refreshed",
  ai_draft: "AI draft added",
  ai_acknowledged: "AI draft reviewed",
  template_updated: "Updated to the latest template",
  pdf_generated: "PDF generated",
};

export function ReportHistory({ reportId }: { reportId: string }) {
  const events = useReportEvents(reportId);
  if (!events.data?.length) return null;
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">History</summary>
      <ol className="mt-2 space-y-1">
        {events.data.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-2">
            <span className="text-muted-foreground">{formatDate(e.createdAt.slice(0, 10))}</span>
            <span>{EVENT_LABEL[e.event] ?? e.event}</span>
            {typeof e.payload?.["comment"] === "string" && (
              <span className="text-muted-foreground">“{e.payload["comment"]}”</span>
            )}
            {typeof e.payload?.["sent"] === "number" && (
              <span className="text-muted-foreground">{String(e.payload["sent"])} recipients</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
