// Shared Resend sender for edge functions (D2: app emails use the Resend HTTP API; Supabase Auth
// keeps its own SMTP). Server-side only: the Resend API has no CORS and the key must stay secret.
// Secrets: RESEND_API_KEY, RESEND_FROM (e.g. "ORMO PMO <invites@ormo-pmo.originoverthrow.com>").
// The sender always comes from RESEND_FROM: Resend refuses (403) any domain but the verified one.
// Returns { data, error } like the Resend SDK, and never throws for an API failure.

const RESEND_URL = "https://api.resend.com/emails";
// Resend's default limit is 2 requests a second; keep sends at least this far apart.
const MIN_INTERVAL_MS = 550;
const MAX_ATTEMPTS = 4;

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** <email-type>/<entity-id>/<per-send part>: a retry never sends twice; a new send gets a new key. */
  idempotencyKey: string;
  tags?: Array<{ name: string; value: string }>;
};

export type EmailError = { status: number; name: string; message: string };
export type EmailResult = { data: { id: string } | null; error: EmailError | null };

let lastSentAt = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pace() {
  const wait = lastSentAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastSentAt = Date.now();
}

/** Seconds from retry-after, else exponential backoff from 600 ms, capped at 5 s. */
function backoffMs(response: Response, attempt: number) {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 5000);
  return Math.min(600 * 2 ** (attempt - 1), 5000);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!apiKey || !from) {
    return { data: null, error: { status: 500, name: "missing_configuration", message: "RESEND_API_KEY or RESEND_FROM is not set" } };
  }
  const body = JSON.stringify({
    from,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    ...(message.tags ? { tags: message.tags } : {}),
  });

  for (let attempt = 1; ; attempt += 1) {
    await pace();
    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body,
      });
    } catch (err) {
      // Network failure: safe to retry with the same idempotency key.
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(600 * 2 ** (attempt - 1), 5000));
        continue;
      }
      return { data: null, error: { status: 0, name: "network_error", message: String((err as Error)?.message ?? err) } };
    }

    const payload = await response.json().catch(() => ({}));
    if (response.ok && typeof payload?.id === "string") return { data: { id: payload.id }, error: null };

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(backoffMs(response, attempt));
      continue;
    }
    const error: EmailError = {
      status: response.status,
      name: String(payload?.name ?? "resend_error"),
      message: String(payload?.message ?? response.statusText ?? "Resend refused the email"),
    };
    console.error("resend", { status: error.status, name: error.name, message: error.message, key: message.idempotencyKey });
    return { data: null, error };
  }
}

/** Minimal HTML escaping for values placed into email templates. */
export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
