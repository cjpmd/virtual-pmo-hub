// Report builder Phase 4: the AI executive summary's prompt and response handling. Plain
// TypeScript (no Deno globals) so it is unit-tested. The evidence is the pack's own metrics,
// selection reasons and changes: project codes and names, ratings and figures, and no people.

export interface AiEvidence {
  title: string;
  forum: string | null;
  as_at: string;
  scope_type: string;
  scheme: Array<{ key: string; label: string; rag: string | null }>;
  projects: Array<{
    code: string;
    name: string;
    programme: string | null;
    metrics: Record<string, unknown>;
  }>;
  deep_dives: Array<{ code: string; reasons: string[] }>;
  changes: unknown;
}

export interface AiDraft {
  summary: string;
  key_points: string[];
  decisions_or_asks: string[];
}

/** Metrics sent to the model (no free text, no people). */
export const AI_METRICS = [
  "declared_rating",
  "evidenced_rating",
  "divergence_days",
  "rating_worsened",
  "max_milestone_slip_days",
  "budget_variance_pct",
  "budget_change_period",
  "risks_in_top_band",
  "open_issues_high",
  "open_decisions_for_forum",
  "escalations_for_forum",
  "days_to_next_gate",
  "stale_update_days",
  "percent_complete",
];

export function evidenceFrom(input: {
  context: {
    title: string;
    as_at: string;
    scope_type: string;
    forum: { name: string } | null;
    scheme: { levels: AiEvidence["scheme"] } | null;
  };
  metrics: Array<{
    code: string;
    name: string;
    programme: string | null;
    metrics: Record<string, unknown>;
  }>;
  inclusions: Array<{ code: string; reasons: Array<{ label: string }> }>;
  changes?: unknown;
}): AiEvidence {
  return {
    title: input.context.title,
    forum: input.context.forum?.name ?? null,
    as_at: input.context.as_at,
    scope_type: input.context.scope_type,
    scheme: (input.context.scheme?.levels ?? []).map((l) => ({
      key: l.key,
      label: l.label,
      rag: l.rag,
    })),
    projects: input.metrics.map((m) => ({
      code: m.code,
      name: m.name,
      programme: m.programme,
      metrics: Object.fromEntries(
        AI_METRICS.filter((k) => k in m.metrics).map((k) => [k, m.metrics[k]]),
      ),
    })),
    deep_dives: input.inclusions.map((i) => ({
      code: i.code,
      reasons: i.reasons.map((r) => r.label),
    })),
    changes: input.changes ?? null,
  };
}

export const SYSTEM_PROMPT = `You draft the executive summary of a governance board pack for a PMO.
Write for busy board members in plain UK English. Use only the evidence supplied: never invent
figures, dates, causes or people. Refer to projects by code and name. Express ratings with the
scheme labels supplied (each label lists the evidenced RAG value it maps from). Lead with the
overall position and the projects the board must look at (the deep-dives and their reasons),
then what changed since the last pack, then what the board is asked to decide. If the evidence
is thin, say so rather than filling gaps. A person reviews and edits this draft before it goes
anywhere.`;

export function userPrompt(evidence: AiEvidence): string {
  return `Evidence for "${evidence.title}" (${evidence.forum ?? "ad hoc report"}, as at ${evidence.as_at}):\n\n${JSON.stringify(evidence)}\n\nDraft the summary (about 150–250 words), up to five key points and the decisions or asks for the board.`;
}

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    decisions_or_asks: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "key_points", "decisions_or_asks"],
  additionalProperties: false,
} as const;

/** The model's JSON as Markdown for the narrative. */
export function draftToMarkdown(raw: string): string {
  const draft = JSON.parse(raw) as Partial<AiDraft>;
  if (typeof draft.summary !== "string" || !draft.summary.trim())
    throw new Error("The draft had no summary.");
  const list = (items: unknown) =>
    Array.isArray(items)
      ? items
          .filter((i): i is string => typeof i === "string" && !!i.trim())
          .map((i) => `- ${i.trim()}`)
      : [];
  const points = list(draft.key_points);
  const asks = list(draft.decisions_or_asks);
  return [
    draft.summary.trim(),
    points.length ? `**Key points**\n\n${points.join("\n")}` : "",
    asks.length ? `**For the board**\n\n${asks.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Models that accept server-side refusal fallbacks ("default" form). */
export const FALLBACK_MODELS = new Set([
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);
