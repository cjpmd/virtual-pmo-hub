// Report builder Phase 4: drafts a pack's executive summary with Claude. The evidence is read
// as the caller (their RLS applies): the pack's context, every project's metrics, the
// deep-dive reasons and the changes since the last pack — no people beyond what the pack shows.
// The draft is stored through record_ai_draft as an 'ai_draft' narrative (badged; submit and
// publish wait until someone edits it or marks it reviewed) and audited with the model used.
// Secrets: ANTHROPIC_API_KEY (missing: 503, nothing is drafted), ANTHROPIC_MODEL (set it to
// the current model, e.g. claude-opus-5-5; no default in code), REPORT_AI_DAILY_LIMIT
// (per organisation, default 50).
import Anthropic from "npm:@anthropic-ai/sdk";
import { UUID, dbErrorResponse, json, serve, signedIn } from "../_shared/http.ts";
import {
  FALLBACK_MODELS,
  OUTPUT_SCHEMA,
  SYSTEM_PROMPT,
  draftToMarkdown,
  evidenceFrom,
  userPrompt,
} from "../_shared/report-ai.ts";

serve("report-ai-summary", async (req) => {
  const caller = await signedIn(req);
  if (!caller) return json({ error: "Sign in again." }, 401);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL");
  if (!apiKey || !model)
    return json(
      {
        error: "AI drafting isn't set up (ANTHROPIC_API_KEY / ANTHROPIC_MODEL).",
        code: "ai_not_configured",
      },
      503,
    );

  const body = await req.json().catch(() => ({}));
  const reportId =
    typeof body?.report_id === "string" && UUID.test(body.report_id) ? body.report_id : null;
  const blockId =
    typeof body?.block_instance_id === "string" ? body.block_instance_id.slice(0, 64) : "exec";
  if (!reportId) return json({ error: "report_id is required" }, 400);

  const db = caller.client;
  const { data: permissions } = await db.rpc("report_permissions", { p_report_id: reportId });
  if (!permissions?.can_edit) return json({ error: "You can't change this report." }, 403);
  const { data: used } = await db.rpc("ai_drafts_today", { p_report_id: reportId });
  const limit = Number(Deno.env.get("REPORT_AI_DAILY_LIMIT") ?? 50);
  if ((used ?? 0) >= limit)
    return json(
      { error: `Your organisation has used today's ${limit} AI drafts.`, code: "ai_daily_limit" },
      429,
    );

  const input = { report_id: reportId };
  const [context, metrics, inclusions, changes] = await Promise.all([
    db.rpc("report_context", { p_input: input }),
    db.rpc("report_scope_metrics", { p_input: input }),
    db.from("report_inclusions").select("entity_id, mode, reasons").eq("report_id", reportId),
    db.rpc("report_block_data", {
      p_input: input,
      p_block: { id: "__changes", blockKey: "changes_since_last", config: {} },
    }),
  ]);
  if (context.error) return dbErrorResponse(context.error, "The report couldn't be read.");
  const codes = new Map(
    (metrics.data ?? []).map((m: { project_id: string; code: string }) => [m.project_id, m.code]),
  );
  const evidence = evidenceFrom({
    context: context.data,
    metrics: metrics.data ?? [],
    inclusions: (inclusions.data ?? [])
      .filter((i: { mode: string }) => i.mode !== "excluded")
      .map((i: { entity_id: string; reasons: Array<{ label: string }> }) => ({
        code: codes.get(i.entity_id) ?? "",
        reasons: i.reasons ?? [],
      })),
    changes: changes.data,
  });

  const client = new Anthropic({ apiKey });
  const withFallback = FALLBACK_MODELS.has(model);
  let message;
  try {
    message = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...(withFallback && { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(evidence) }],
    } as never);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError)
      return json({ error: "The AI service is busy. Try again in a minute." }, 429);
    if (err instanceof Anthropic.APIError) {
      console.error("report-ai-summary", err.status, err.message);
      return json({ error: "The AI draft couldn't be written.", code: "ai_failed" }, 502);
    }
    throw err;
  }
  if (message.stop_reason === "refusal")
    return json({ error: "The AI declined to draft this summary.", code: "ai_refused" }, 422);
  const text = message.content.find((b: { type: string }) => b.type === "text") as
    { text: string } | undefined;
  let markdown: string;
  try {
    markdown = draftToMarkdown(text?.text ?? "");
  } catch {
    return json(
      { error: "The AI draft came back incomplete. Try again.", code: "ai_incomplete" },
      502,
    );
  }
  const { data: narrativeId, error } = await db.rpc("record_ai_draft", {
    p_report_id: reportId,
    p_block_instance_id: blockId,
    p_text: markdown,
    p_model: message.model ?? model,
  });
  if (error) return dbErrorResponse(error, "The draft couldn't be saved.");
  return json({ narrative_id: narrativeId, model: message.model ?? model });
});
