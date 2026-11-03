// Report pack distribution (docs/report-builder-spec.md §12), shared by report-publish and
// report-distribute. Plain TypeScript (no Deno globals) so it is unit-tested with stubs:
// the database client and the email sender are passed in.
//   Recipients: report_distribution() (forum members except contributors, plus partner
//   organisation members for shared forums), deduplicated by email.
//   Idempotent: a 'distributed' event means it was sent; each email carries the key
//   report-<id>-publish/<n>, so a retry within Resend's window can't double-send either.

export interface Distribution {
  report: {
    id: string;
    title: string;
    status: string;
    as_at: string;
    overall_rating: string | null;
    organisation_id: string;
    forum: string | null;
    meeting_date: string | null;
    scheme: { levels: Array<{ key: string; label: string; rag: string | null }> } | null;
  };
  summary: string | null;
  counts: { exceptions: number; decisions: number };
  recipients: Array<{ email: string; name: string | null; partner: boolean }>;
  without_account: string[];
  already_distributed: boolean;
  pdf_path: string | null;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  attachments?: Array<{ filename: string; path: string }>;
}

export type Sender = (email: OutgoingEmail) => Promise<{ id: string | null; error: string | null }>;

export interface AdminLike {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  signedPdfUrl?: (path: string) => Promise<string | null>;
}

export interface DistributionResult {
  sent: number;
  failed: number;
  skipped?: string;
  recipients: number;
  without_account: string[];
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ukDate = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";

/** The rating's label in the forum's scheme (never colour alone). */
export function ratingLabel(dist: Distribution): string | null {
  const key = dist.report.overall_rating;
  if (!key) return null;
  const level = dist.report.scheme?.levels.find((l) => l.key === key || l.rag === key);
  return level?.label ?? key;
}

export function buildReportEmail(
  dist: Distribution,
  link: string,
): { subject: string; html: string; text: string } {
  const r = dist.report;
  const forum = r.forum ?? "Report";
  const meeting = r.meeting_date ? ` for ${ukDate(r.meeting_date)}` : "";
  const subject = `${forum}: pack published${meeting}`;
  const rating = ratingLabel(dist);
  const summary = (dist.summary ?? "")
    .replace(/[*_#`]/g, "")
    .replace(/^>\s?/gm, "")
    .trim();
  const counts = `${dist.counts.exceptions} ${dist.counts.exceptions === 1 ? "project" : "projects"} by exception, ${dist.counts.decisions} ${dist.counts.decisions === 1 ? "decision" : "decisions"} required`;
  const lines = [
    `${r.title}`,
    `${forum}${meeting} · as at ${ukDate(r.as_at)}`,
    rating ? `Overall rating: ${rating}` : "",
    summary ? `\n${summary}${(dist.summary ?? "").length >= 300 ? "…" : ""}` : "",
    `\n${counts}.`,
    `\nRead the pack: ${link}`,
  ].filter(Boolean);
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111;max-width:620px">
<p style="font-size:12px;color:#555;margin:0">${escapeHtml(forum)}${escapeHtml(meeting)} · as at ${ukDate(r.as_at)}</p>
<h1 style="font-size:20px;margin:6px 0 12px">${escapeHtml(r.title)}</h1>
${rating ? `<p style="margin:0 0 12px"><strong>Overall rating:</strong> ${escapeHtml(rating)}</p>` : ""}
${summary ? `<p style="margin:0 0 12px;line-height:1.5">${escapeHtml(summary)}${(dist.summary ?? "").length >= 300 ? "…" : ""}</p>` : ""}
<p style="margin:0 0 16px">${escapeHtml(counts)}.</p>
<p><a href="${escapeHtml(link)}" style="background:#0a2a6b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View the pack</a></p>
<p style="font-size:12px;color:#555">You get this because you are a member of ${escapeHtml(forum)}. The pack is a published snapshot; live data may have moved on.</p>
</body></html>`;
  return { subject, html, text: lines.join("\n") };
}

export const reportLink = (appUrl: string, reportId: string) =>
  `${appUrl.replace(/\/$/, "")}/governance/reports/${reportId}`;

/** Unique recipients in a stable order. */
export function recipientsOf(dist: Distribution): string[] {
  return [
    ...new Set(
      dist.recipients.map((r) => r.email.trim().toLowerCase()).filter((e) => /.+@.+\..+/.test(e)),
    ),
  ].sort();
}

export async function distributeReport(
  admin: AdminLike,
  reportId: string,
  appUrl: string,
  send: Sender | null,
): Promise<DistributionResult> {
  const { data, error } = await admin.rpc("report_distribution", { p_report_id: reportId });
  if (error || !data) throw new Error(error?.message ?? "Report not found.");
  const dist = data as Distribution;
  const to = recipientsOf(dist);
  const base = { recipients: to.length, without_account: dist.without_account };
  if (dist.report.status !== "published")
    return { sent: 0, failed: 0, skipped: "the report isn't published", ...base };
  if (dist.already_distributed) return { sent: 0, failed: 0, skipped: "already sent", ...base };
  if (!send) return { sent: 0, failed: 0, skipped: "RESEND_API_KEY is not set", ...base };
  if (!to.length)
    return { sent: 0, failed: 0, skipped: "the forum has no members with an account", ...base };
  const email = buildReportEmail(dist, reportLink(appUrl, reportId));
  const pdfUrl =
    dist.pdf_path && admin.signedPdfUrl ? await admin.signedPdfUrl(dist.pdf_path) : null;
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const [index, address] of to.entries()) {
    const result = await send({
      to: address,
      ...email,
      idempotencyKey: `report-${reportId}-publish/${index}`,
      ...(pdfUrl && {
        attachments: [
          { filename: `${dist.report.title.replace(/[^\w .-]+/g, "")}.pdf`, path: pdfUrl },
        ],
      }),
    });
    if (result.error) {
      failed += 1;
      errors.push(`${address}: ${result.error}`);
    } else sent += 1;
  }
  await admin.rpc("record_report_event", {
    p_report_id: reportId,
    p_event: "distributed",
    p_payload: {
      sent,
      failed,
      recipients: to.length,
      without_account: dist.without_account,
      errors: errors.slice(0, 10),
      pdf: !!pdfUrl,
    },
  });
  return { sent, failed, ...base };
}
