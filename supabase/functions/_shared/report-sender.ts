// Resend sender for report packs: one recipient per email, optional PDF attachment by URL.
// Secrets: RESEND_API_KEY; REPORTS_FROM (e.g. "ORMO PMO <reports@ormo-pmo.originoverthrow.com>"),
// falling back to RESEND_FROM. Returns null when RESEND_API_KEY is missing (nothing is sent).
import type { Sender } from "./report-distribution.ts";

const RESEND_URL = "https://api.resend.com/emails";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function reportSender(): Sender | null {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("REPORTS_FROM") ?? Deno.env.get("RESEND_FROM");
  if (!apiKey || !from) return null;
  return async (email) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await sleep(550); // Resend's default limit is 2 requests a second
      const response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [email.to],
          subject: email.subject,
          html: email.html,
          text: email.text,
          tags: [{ name: "type", value: "report_pack" }],
          ...(email.attachments && { attachments: email.attachments }),
        }),
      }).catch(
        (err) =>
          ({
            ok: false,
            status: 0,
            json: async () => ({ message: String(err) }),
          }) as unknown as Response,
      );
      const payload = await response.json().catch(() => ({}));
      if (response.ok && typeof payload?.id === "string") return { id: payload.id, error: null };
      if (response.status !== 429 && response.status < 500 && response.status !== 0)
        return {
          id: null,
          error: `${response.status} ${payload?.name ?? ""} ${payload?.message ?? ""}`.trim(),
        };
      await sleep(600 * 2 ** (attempt - 1));
    }
    return { id: null, error: "Resend did not accept the email after 3 attempts" };
  };
}
