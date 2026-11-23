// NHS-3 impact assessment blocks (docs/nhs-module-plan.md § NHS-3 item 9):
// impact_assessment_status (counts and register, plus projects past the delivery gate without an
// approved assessment), impact_assessments_awaiting (sign-off still to come, longest waiting
// first) and impact_negative_impacts (negative quality and equality impacts with their
// mitigations). Shaping is in SQL (private.rb_impact_*, migration
// 20261123160000_nhs_3b_assessment_notifications_blocks); these only render. Owned by the
// 'impact_assessment' module (lib/modules.ts reportBlocks) and partner-unsafe
// (private.partner_unsafe_blocks). Statuses and scores are always in words, never colour alone.
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Stat, Table, days, useReportFormat } from "../primitives";
import type { RenderContext, ScopeLevel } from "../types";

const SCOPES: ScopeLevel[] = ["project", "programme", "portfolio", "custom", "collection"];

export type AssessmentStatus =
  "draft" | "in_review" | "approved" | "rejected" | "reassessment_required";
export const ASSESSMENT_STATUS_TEXT: Record<AssessmentStatus, string> = {
  draft: "Draft",
  in_review: "Awaiting sign-off",
  approved: "Approved",
  rejected: "Rejected",
  reassessment_required: "Re-assessment required",
};
export const assessmentStatusText = (status: string | null | undefined) =>
  ASSESSMENT_STATUS_TEXT[(status ?? "") as AssessmentStatus] ?? status ?? "—";

/** "1 of 2 signed off", or "—" before submission. */
export const signoffText = (approved: number, total: number) =>
  total > 0 ? `${approved} of ${total} signed off` : "—";

/** "2 × 3 = 6", or the score alone when the levels are missing. */
export const scoreText = (
  score: number | null | undefined,
  consequence?: number | null,
  likelihood?: number | null,
) => {
  if (score === null || score === undefined) return "Not scored";
  return consequence && likelihood ? `${consequence} × ${likelihood} = ${score}` : String(score);
};

// ---------------------------------------------------------------- impact_assessment_status

export interface StatusRow {
  id: string;
  entity_type: string;
  target: string;
  title: string;
  status: string;
  version: number;
  full_required: boolean;
  max_score: number;
  steps_total: number;
  steps_approved: number;
  has_conditions: boolean;
  review_date: string | null;
  review_overdue: boolean;
  is_sample: boolean;
}
export interface StatusData {
  total: number;
  counts: Record<AssessmentStatus, number>;
  review_overdue: number;
  with_conditions: number;
  full_required: number;
  gate_on: boolean;
  rows: StatusRow[];
  gaps: { id: string; code: string; name: string; phase: string }[];
}

const statusSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  include_gaps: z.boolean().default(true),
});

function AssessmentStatusBlock({
  data,
}: {
  data: StatusData;
  config: z.infer<typeof statusSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.total && !data.gaps.length)
    return <Empty>No impact assessments for these projects or programmes.</Empty>;
  const counts = data.counts;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Approved"
          value={counts.approved}
          note={`of ${data.total} assessments`}
          tone="good"
        />
        <Stat label="Awaiting sign-off" value={counts.in_review} />
        <Stat
          label="Need work"
          value={counts.draft + counts.rejected + counts.reassessment_required}
          note={`${counts.reassessment_required} re-assessment required`}
          tone={counts.rejected + counts.reassessment_required > 0 ? "warn" : undefined}
        />
        <Stat
          label="Review overdue"
          value={data.review_overdue}
          tone={data.review_overdue > 0 ? "bad" : undefined}
        />
      </div>
      {data.rows.length > 0 && (
        <Table
          caption="Impact assessments, most urgent first"
          rows={data.rows}
          rowKey={(row) => row.id}
          cols={[
            {
              key: "target",
              header: "Project or programme",
              cell: (row) => (
                <span>
                  {row.target}
                  {row.is_sample && (
                    <span className="ml-1 text-xs text-muted-foreground">(sample)</span>
                  )}
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              cell: (row) =>
                `${assessmentStatusText(row.status)}${row.status === "approved" && row.has_conditions ? " with conditions" : ""}`,
            },
            {
              key: "type",
              header: "Assessment",
              cell: (row) => (row.full_required ? "Full" : "Screening"),
            },
            {
              key: "signoff",
              header: "Sign-off",
              cell: (row) => signoffText(row.steps_approved, row.steps_total),
            },
            {
              key: "review",
              header: "Review",
              cell: (row) => `${f.date(row.review_date)}${row.review_overdue ? " (overdue)" : ""}`,
            },
          ]}
        />
      )}
      {data.gaps.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">
            Past the delivery gate without an approved assessment ({data.gaps.length})
          </h4>
          <ul className="list-disc pl-5 text-sm">
            {data.gaps.map((gap) => (
              <li key={gap.id}>
                {gap.code} {gap.name} <span className="text-muted-foreground">({gap.phase})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.total > data.rows.length && (
        <BlockNote>and {data.total - data.rows.length} more assessments</BlockNote>
      )}
      {!data.gate_on && (
        <BlockNote>
          The delivery gate is off, so no project is required to have an assessment.
        </BlockNote>
      )}
    </div>
  );
}

export const _impact_assessment_status = registerBlock({
  key: "impact_assessment_status",
  version: 1,
  name: "Impact assessment status",
  category: "assurance",
  description:
    "Quality and equality impact assessments by status, with sign-off progress, overdue reviews and projects past the delivery gate without an approved assessment.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: statusSchema,
  defaultConfig: { limit: 20, include_gaps: true },
  Renderer: AssessmentStatusBlock,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- impact_assessments_awaiting

export interface AwaitingRow {
  id: string;
  target: string;
  title: string;
  version: number;
  full_required: boolean;
  submitted_on: string | null;
  days_waiting: number | null;
  steps_total: number;
  steps_approved: number;
  pending_roles: string[];
  is_sample: boolean;
}
export interface AwaitingData {
  count: number;
  rows: AwaitingRow[];
}

const awaitingSchema = z.object({ limit: z.number().int().min(1).max(50).default(15) });

function AwaitingBlock({
  data,
}: {
  data: AwaitingData;
  config: z.infer<typeof awaitingSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.count) return <Empty>No impact assessments are awaiting sign-off.</Empty>;
  return (
    <div className="space-y-3">
      <Table
        caption="Impact assessments awaiting sign-off, longest waiting first"
        rows={data.rows}
        rowKey={(row) => row.id}
        cols={[
          { key: "target", header: "Project or programme", cell: (row) => row.target },
          {
            key: "submitted",
            header: "Submitted",
            cell: (row) => `${f.date(row.submitted_on)} (${days(row.days_waiting)})`,
          },
          {
            key: "progress",
            header: "Sign-off",
            cell: (row) => signoffText(row.steps_approved, row.steps_total),
          },
          {
            key: "waiting",
            header: "Waiting for",
            cell: (row) => (row.pending_roles.length ? row.pending_roles.join(", ") : "—"),
          },
        ]}
      />
      {data.count > data.rows.length && (
        <BlockNote>and {data.count - data.rows.length} more awaiting sign-off</BlockNote>
      )}
    </div>
  );
}

export const _impact_assessments_awaiting = registerBlock({
  key: "impact_assessments_awaiting",
  version: 1,
  name: "Impact assessments awaiting sign-off",
  category: "assurance",
  description:
    "Assessments submitted for sign-off, longest waiting first, with the approver roles still to decide.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: awaitingSchema,
  defaultConfig: { limit: 15 },
  Renderer: AwaitingBlock,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- impact_negative_impacts

export interface QualityImpact {
  id: string;
  target: string;
  title: string;
  status: string;
  domain: string;
  score: number | null;
  consequence: number | null;
  likelihood: number | null;
  description: string | null;
  mitigations: string | null;
  indicators: string | null;
}
export interface EqualityImpact {
  id: string;
  target: string;
  title: string;
  status: string;
  characteristic: string;
  evidence: string | null;
  mitigation: string | null;
}
export interface NegativeData {
  assessments: number;
  quality_count: number;
  equality_count: number;
  unmitigated: number;
  quality: QualityImpact[];
  equality: EqualityImpact[];
}

const negativeSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  min_score: z.number().int().min(0).max(25).default(0),
  include_equality: z.boolean().default(true),
  include_drafts: z.boolean().default(false),
});

const orNone = (text: string | null | undefined) => (text && text.trim() ? text : "None recorded");

function NegativeImpactsBlock({
  data,
}: {
  data: NegativeData;
  config: z.infer<typeof negativeSchema>;
  ctx: RenderContext;
}) {
  if (!data.quality_count && !data.equality_count)
    return <Empty>No negative impacts recorded in these assessments.</Empty>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Quality impacts" value={data.quality_count} />
        <Stat label="Equality impacts" value={data.equality_count} />
        <Stat
          label="Without mitigation"
          value={data.unmitigated}
          tone={data.unmitigated > 0 ? "bad" : "good"}
        />
      </div>
      {data.quality.length > 0 && (
        <Table
          caption="Negative quality impacts, highest score first"
          rows={data.quality}
          rowKey={(row) => `${row.id}-${row.domain}`}
          cols={[
            {
              key: "target",
              header: "Project or programme",
              cell: (row) => (
                <span>
                  {row.target}
                  <span className="block text-xs text-muted-foreground">
                    {assessmentStatusText(row.status)}
                  </span>
                </span>
              ),
            },
            { key: "domain", header: "Domain", cell: (row) => row.domain },
            {
              key: "score",
              header: "Score (C × L)",
              cell: (row) => scoreText(row.score, row.consequence, row.likelihood),
            },
            { key: "impact", header: "Impact", cell: (row) => row.description ?? "—" },
            { key: "mitigation", header: "Mitigations", cell: (row) => orNone(row.mitigations) },
          ]}
        />
      )}
      {data.equality.length > 0 && (
        <Table
          caption="Negative equality impacts"
          rows={data.equality}
          rowKey={(row) => `${row.id}-${row.characteristic}`}
          cols={[
            { key: "target", header: "Project or programme", cell: (row) => row.target },
            { key: "characteristic", header: "Characteristic", cell: (row) => row.characteristic },
            { key: "evidence", header: "Evidence", cell: (row) => row.evidence ?? "—" },
            { key: "mitigation", header: "Mitigation", cell: (row) => orNone(row.mitigation) },
          ]}
        />
      )}
      {(data.quality_count > data.quality.length || data.equality_count > data.equality.length) && (
        <BlockNote>
          Showing the first {Math.max(data.quality.length, data.equality.length)} of each.
        </BlockNote>
      )}
    </div>
  );
}

export const _impact_negative_impacts = registerBlock({
  key: "impact_negative_impacts",
  version: 1,
  name: "Negative impacts and mitigations",
  category: "assurance",
  description:
    "Negative quality impacts (consequence × likelihood) and equality impacts from impact assessments, with their mitigations.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: negativeSchema,
  defaultConfig: { limit: 20, min_score: 0, include_equality: true, include_drafts: false },
  Renderer: NegativeImpactsBlock,
  partnerSafe: false,
  phase: 4,
});
