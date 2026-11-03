import { describe, expect, it, vi } from "vitest";
import {
  buildReportEmail,
  distributeReport,
  recipientsOf,
  type AdminLike,
  type Distribution,
  type Sender,
} from "./report-distribution";

const dist = (overrides: Partial<Distribution> = {}): Distribution => ({
  report: {
    id: "r1",
    title: "Digital Care Programme Board — 12 Nov",
    status: "published",
    as_at: "2026-11-05",
    overall_rating: "amber",
    organisation_id: "o1",
    forum: "Digital Care Programme Board",
    meeting_date: "2026-11-12",
    scheme: { levels: [{ key: "reasonable", label: "Reasonable assurance", rag: "amber" }] },
  },
  summary: "**Broadly** on track. <script>",
  counts: { exceptions: 3, decisions: 2 },
  recipients: [
    { email: "Chair@Example.org", name: "Chair", partner: false },
    { email: "chair@example.org", name: "Chair", partner: false },
    { email: "viewer@example.org", name: "Viewer", partner: false },
  ],
  without_account: ["No Login"],
  already_distributed: false,
  pdf_path: null,
  ...overrides,
});

const admin = (d: Distribution) => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  const client: AdminLike = {
    rpc: (fn, args) => {
      calls.push([fn, args]);
      return Promise.resolve({ data: fn === "report_distribution" ? d : null, error: null });
    },
    signedPdfUrl: async (path) => `https://storage.example/${path}?sig=1`,
  };
  return { client, calls };
};

describe("buildReportEmail", () => {
  const email = buildReportEmail(dist(), "https://app/governance/reports/r1");
  it("names the forum, meeting and the scheme's rating label", () => {
    expect(email.subject).toBe("Digital Care Programme Board: pack published for 12/11/2026");
    expect(email.text).toContain("Overall rating: Reasonable assurance");
    expect(email.text).toContain("3 projects by exception, 2 decisions required.");
  });
  it("escapes HTML and strips Markdown", () => {
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Broadly on track. &lt;script&gt;");
  });
});

describe("recipientsOf", () => {
  it("deduplicates case-insensitively", () => {
    expect(recipientsOf(dist())).toEqual(["chair@example.org", "viewer@example.org"]);
  });
});

describe("distributeReport", () => {
  it("sends one email per recipient with stable idempotency keys and records the event", async () => {
    const { client, calls } = admin(dist());
    const send = vi.fn<Sender>().mockResolvedValue({ id: "e1", error: null });
    const result = await distributeReport(client, "r1", "https://app", send);
    expect(result).toMatchObject({ sent: 2, failed: 0, recipients: 2 });
    expect(send.mock.calls.map((c) => c[0].idempotencyKey)).toEqual([
      "report-r1-publish/0",
      "report-r1-publish/1",
    ]);
    expect(calls.at(-1)?.[0]).toBe("record_report_event");
    expect(calls.at(-1)?.[1]).toMatchObject({ p_event: "distributed" });
  });
  it("never sends twice", async () => {
    const { client, calls } = admin(dist({ already_distributed: true }));
    const send = vi.fn<Sender>();
    expect(await distributeReport(client, "r1", "https://app", send)).toMatchObject({
      sent: 0,
      skipped: "already sent",
    });
    expect(send).not.toHaveBeenCalled();
    expect(calls.some(([fn]) => fn === "record_report_event")).toBe(false);
  });
  it("skips without a Resend key, and for unpublished reports", async () => {
    expect((await distributeReport(admin(dist()).client, "r1", "https://app", null)).skipped).toBe(
      "RESEND_API_KEY is not set",
    );
    const draft = dist();
    draft.report.status = "approved";
    expect(
      (await distributeReport(admin(draft).client, "r1", "https://app", vi.fn<Sender>())).skipped,
    ).toBe("the report isn't published");
  });
  it("attaches the PDF when one was generated", async () => {
    const { client } = admin(dist({ pdf_path: "o1/r1.pdf" }));
    const send = vi.fn<Sender>().mockResolvedValue({ id: "e1", error: null });
    await distributeReport(client, "r1", "https://app", send);
    expect(send.mock.calls[0]?.[0].attachments?.[0]?.path).toBe(
      "https://storage.example/o1/r1.pdf?sig=1",
    );
  });
  it("counts failures without stopping", async () => {
    const { client } = admin(dist());
    const send = vi
      .fn<Sender>()
      .mockResolvedValueOnce({ id: null, error: "422 invalid" })
      .mockResolvedValue({ id: "e2", error: null });
    expect(await distributeReport(client, "r1", "https://app", send)).toMatchObject({
      sent: 1,
      failed: 1,
    });
  });
});
