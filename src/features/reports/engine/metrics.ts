// Metric registry (spec §7.1): labels, units and operators only. Values are computed in SQL
// (public.project_metrics); nothing here works a metric out.

export type MetricType = "enum" | "int" | "money" | "pct" | "bool" | "days";
export type RuleOp = ">" | ">=" | "<" | "<=" | "=" | "!=" | "in" | "worse_than";

export interface MetricDefinition {
  key: string;
  label: string;
  type: MetricType;
  /** Short unit text for chips ("days", "%"). */
  unit?: string;
  description: string;
  ops: RuleOp[];
  /** Uses the context forum (open_decisions_for_forum, escalations_for_forum). */
  forumDependent?: boolean;
}

const NUM: RuleOp[] = [">", ">=", "<", "<=", "=", "!="];
const ENUM: RuleOp[] = ["=", "!=", "in", "worse_than"];
const BOOL: RuleOp[] = ["=", "!="];

export const METRICS: MetricDefinition[] = [
  {
    key: "declared_rating",
    label: "Declared rating",
    type: "enum",
    description: "The PM's declared overall status for the period",
    ops: ENUM,
  },
  {
    key: "evidenced_rating",
    label: "Evidenced rating",
    type: "enum",
    description: "Overall status computed from the data",
    ops: ENUM,
  },
  {
    key: "rating_rank_delta",
    label: "Rating gap",
    type: "int",
    description: "Evidenced rank − declared rank (> 0: declared better than evidence)",
    ops: NUM,
  },
  {
    key: "divergence_days",
    label: "Divergence",
    type: "days",
    unit: "days",
    description: "Days the declared rating has been better than the evidence",
    ops: NUM,
  },
  {
    key: "rating_worsened",
    label: "Worsened",
    type: "bool",
    description: "Evidenced rating worse than at the previous published pack (or a month ago)",
    ops: BOOL,
  },
  {
    key: "dimension_red_count",
    label: "Red dimensions",
    type: "int",
    description: "Health dimensions at red",
    ops: NUM,
  },
  {
    key: "max_milestone_slip_days",
    label: "Slip",
    type: "days",
    unit: "days",
    description: "Largest forecast-vs-baseline slip among open milestones",
    ops: NUM,
  },
  {
    key: "slipped_milestones",
    label: "Slipped milestones",
    type: "int",
    description: "Open milestones forecast after baseline",
    ops: NUM,
  },
  {
    key: "budget_variance_abs",
    label: "Variance",
    type: "money",
    description: "Forecast at completion − budget",
    ops: NUM,
  },
  {
    key: "budget_variance_pct",
    label: "Variance",
    type: "pct",
    unit: "%",
    description: "(Forecast at completion − budget) / budget",
    ops: NUM,
  },
  {
    key: "budget_change_period",
    label: "Forecast movement",
    type: "money",
    description: "Change in forecast at completion since the last month-end",
    ops: NUM,
  },
  {
    key: "max_risk_score",
    label: "Top risk score",
    type: "int",
    description: "Highest open risk score on the configured matrix",
    ops: NUM,
  },
  {
    key: "risks_in_top_band",
    label: "Risks in top band",
    type: "int",
    description: "Open risks in the matrix's highest band",
    ops: NUM,
  },
  {
    key: "open_issues_high",
    label: "High issues",
    type: "int",
    description: "Open issues at high severity",
    ops: NUM,
  },
  {
    key: "open_decisions_for_forum",
    label: "Decisions for this forum",
    type: "int",
    description: "Pending decisions asked of this forum",
    ops: NUM,
    forumDependent: true,
  },
  {
    key: "escalations_for_forum",
    label: "Escalations",
    type: "int",
    description: "Risks, issues and decisions escalated to this forum",
    ops: NUM,
    forumDependent: true,
  },
  {
    key: "open_change_requests",
    label: "Open change requests",
    type: "int",
    description: "Change requests awaiting a decision",
    ops: NUM,
  },
  {
    key: "days_to_next_gate",
    label: "Next gate",
    type: "days",
    unit: "days",
    description: "Days until the next stage gate",
    ops: NUM,
  },
  {
    key: "at_risk_dependencies",
    label: "At-risk dependencies",
    type: "int",
    description: "Incoming dependencies at amber or red",
    ops: NUM,
  },
  {
    key: "benefits_rating",
    label: "Benefits rating",
    type: "enum",
    description: "Benefits dimension rating",
    ops: ENUM,
  },
  {
    key: "stale_update_days",
    label: "Days since update",
    type: "days",
    unit: "days",
    description: "Days since the last highlight report",
    ops: NUM,
  },
  {
    key: "percent_complete",
    label: "% complete",
    type: "pct",
    unit: "%",
    description: "Average task completion",
    ops: NUM,
  },
];

const byKey = new Map(METRICS.map((metric) => [metric.key, metric]));
export const getMetric = (key: string) => byKey.get(key);

export const OP_LABEL: Record<RuleOp, string> = {
  ">": ">",
  ">=": "≥",
  "<": "<",
  "<=": "≤",
  "=": "=",
  "!=": "≠",
  in: "is one of",
  worse_than: "worse than",
};

/** Short text for a metric value, e.g. "59 days", "+8%", "Red". */
export function metricValueText(
  key: string,
  value: unknown,
  formatMoney: (value: number) => string = (v) => String(v),
): string {
  if (value === null || value === undefined) return "—";
  const metric = getMetric(key);
  if (Array.isArray(value)) return value.join(", ");
  if (!metric) return String(value);
  switch (metric.type) {
    case "bool":
      return value === true || value === "true" ? "Yes" : "No";
    case "enum":
      return String(value)
        .replace("not_set", "not set")
        .replace(/^./, (c) => c.toUpperCase());
    case "money":
      return formatMoney(Number(value));
    case "pct": {
      const n = Number(value);
      return `${n > 0 && key.includes("variance") ? "+" : ""}${n}%`;
    }
    case "days": {
      const n = Number(value);
      return `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;
    }
    default:
      return String(value);
  }
}
