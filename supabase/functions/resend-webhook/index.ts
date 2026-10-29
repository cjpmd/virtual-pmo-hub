// Work package 2.1. Resend delivery events for invitation emails. verify_jwt is off; every request
// is checked against the Resend (Svix) signature instead. Idempotent on svix-id
// (public.resend_webhook_events). email.delivered / delivery_delayed / bounced / suppressed /
// complained update the matching invitation (record_invite_email_event, service role): a bounce or
// suppression voids the link and the Members page shows "Not delivered — Resend invite".
// Events for other emails (older invitation emails, join-request emails) change nothing.
// Secrets: RESEND_WEBHOOK_SECRET (the endpoint's whsec_ signing secret). SUPABASE_* are provided.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { verifySvix } from "../_shared/svix.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const HANDLED = ["email.delivered", "email.delivery_delayed", "email.bounced", "email.suppressed", "email.complained"];

type ResendEvent = { type?: string; data?: Record<string, unknown> & { email_id?: string } };

/** A short, human-readable reason from the event data (bounce message or type), if there is one. */
function noteFrom(data: Record<string, unknown> | undefined): string | null {
  for (const key of ["bounce", "suppressed", "failed"]) {
    const value = data?.[key];
    if (value && typeof value === "object") {
      const { message, type, subType } = value as Record<string, unknown>;
      const parts = [type, subType, message].filter((part) => typeof part === "string" && part) as string[];
      if (parts.length) return parts.join(": ").slice(0, 300);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const payload = await req.text();
  const headers = {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  };
  if (!(await verifySvix(Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "", headers, payload))) {
    console.warn("resend-webhook: bad signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }
  const type = String(event.type ?? "");
  const emailId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
  const svixId = headers.id!;

  const { error: insertError } = await admin.from("resend_webhook_events").insert({ id: svixId, type, email_id: emailId });
  if (insertError) {
    if (insertError.code !== "23505") {
      console.error("resend-webhook: log insert", insertError);
      return new Response("Storage error", { status: 500 });
    }
    const { data: seen } = await admin.from("resend_webhook_events").select("processed_at").eq("id", svixId).maybeSingle();
    if (seen?.processed_at) return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    let matched = false;
    if (HANDLED.includes(type) && emailId) {
      const { data, error } = await admin.rpc("record_invite_email_event", {
        p_email_id: emailId,
        p_event: type,
        p_note: noteFrom(event.data),
      });
      if (error) throw error;
      matched = data === true;
    }
    await admin.from("resend_webhook_events").update({ processed_at: new Date().toISOString(), error: null }).eq("id", svixId);
    return new Response(JSON.stringify({ received: true, matched }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("resend-webhook: handling", type, err);
    await admin
      .from("resend_webhook_events")
      .update({ error: String((err as Error)?.message ?? err).slice(0, 500) })
      .eq("id", svixId);
    return new Response("Handler error", { status: 500 }); // Resend retries
  }
});
