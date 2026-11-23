// NHS-4 efficiency / savings programme (CIP) blocks (docs/nhs-module-plan.md § NHS-4 item 9):
// efficiency_summary (delivery against target, to date and cumulative by month),
// efficiency_breakdown (by organisational unit, category or stage, with unit targets and gaps),
// efficiency_schemes_at_risk (schemes off track, with the reasons in words) and
// efficiency_recurrent (recurrent and non-recurrent savings). Shaping is in SQL
// (private.rb_efficiency_*, migration 20261123220000_nhs_4c_efficiency_blocks); these only render.
// Owned by the 'efficiency' module (lib/modules.ts reportBlocks) and partner-unsafe
// (private.partner_unsafe_blocks). Labels follow the organisation's terminology (CIP / Savings
// scheme, Directorate / Organisational unit).
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Stat, Table, useReportFormat } from "../primitives";
import type { RenderContext, ScopeLevel } from "../types";
import { STAGE_LABELS, financialYearLabel, isStage } from "@/data/efficiency";
import { useModuleTerm } from "@/lib/modules";

const SCOPES: ScopeLevel[] = ["project", "programme", "portfolio", "custom", "collection"];
type Money = number | string | null;
const num = (value: Money | undefined) =>
  value === null || value === undefined || value === "" ? null : Number(value);

/** "£12k short" / "£3k ahead" / "On target" for a gap (target − value; positive = short). */
export function gapText(gap: Money | undefined, money: (value: number) => string): string {
  const n = num(gap);
  if (n === null) return "No target";
  if (n === 0) return "On target";
  return n > 0 ? `${money(n)} short` : `${money(-n)} ahead`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Apr 26" for "2026-04-01". */
export function monthLabel(iso: string): string {
  const [year, month] = iso.split("-");
  return `${MONTHS[Number(month) - 1] ?? month} ${(year ?? "").slice(2)}`;
}

export const REASON_TEXT: Record<string, string> = {
  forecast_below_plan: "Forecast below plan",
  actual_below_plan: "Actual to date below plan",
  assessment_not_approved: "In delivery without an approved impact assessment",
  on_hold: "On hold with planned savings",
};
export const reasonText = (reason: string) => REASON_TEXT[reason] ?? reason;

export const stageText = (stage: string | null | undefined) =>
  isStage(stage) ? STAGE_LABELS[stage] : (stage ?? "—");

const yearText = (data: { year?: number; start_month?: number }) =>
  data.year ? `financial year ${financialYearLabel(data.year, data.start_month ?? 4)}` : "";

const commonConfig = { whole_organisation: z.boolean().default(true) };

// ---------------------------------------------------------------- efficiency_summary

export interface SummaryMonth {
  month: string;
  plan: Money;
  actual: Money;
  has_actual: boolean;
  cum_plan: Money;
  cum_risk_adjusted: Money;
  cum_forecast_outturn: Money;
  cum_actual: Money;
}
export interface SummaryData {
  year: number;
  start_month: number;
  whole_organisation: boolean;
  schemes: number;
  target: Money;
  plan: Money;
  plan_recurrent: Money;
  risk_adjusted: Money;
  forecast_outturn: Money;
  actual: Money;
  full_year_effect: Money;
  carry_forward: Money;
  gap: { plan: Money; risk_adjusted: Money; forecast_outturn: Money } | null;
  to_date: { months: number; months_reported: number; plan: Money; actual: Money; variance: Money };
  months: SummaryMonth[];
}

const summarySchema = z.object({ ...commonConfig, show_months: z.boolean().default(true) });

function SummaryBlock({
  data,
}: {
  data: SummaryData;
  config: z.infer<typeof summarySchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const term = useModuleTerm();
  const money = (n: number) => f.money(n);
  if (!data?.year) return <Empty>No efficiency programme figures for this organisation.</Empty>;
  if (!data.schemes)
    return <Empty>No {term("efficiency.schemePlural").toLowerCase()} this year.</Empty>;
  const gap = data.gap;
  const forecastShort = (num(gap?.forecast_outturn) ?? 0) > 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {term("efficiency.programme")}, {yearText(data)}: {data.schemes}{" "}
        {data.schemes === 1
          ? term("efficiency.scheme").toLowerCase()
          : term("efficiency.schemePlural").toLowerCase()}
        {data.whole_organisation ? " across the organisation" : " in this workspace"}.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Target" value={f.money(data.target)} />
        <Stat label="Planned" value={f.money(data.plan)} note={gapText(gap?.plan, money)} />
        <Stat
          label="Risk-adjusted"
          value={f.money(data.risk_adjusted)}
          note={gapText(gap?.risk_adjusted, money)}
        />
        <Stat
          label="Forecast outturn"
          value={f.money(data.forecast_outturn)}
          note={gapText(gap?.forecast_outturn, money)}
          tone={gap ? (forecastShort ? "warn" : "good") : undefined}
        />
        <Stat
          label="Actual to date"
          value={f.money(data.to_date.actual)}
          note={`against ${f.money(data.to_date.plan)} planned to date`}
          tone={(num(data.to_date.variance) ?? 0) < 0 ? "warn" : undefined}
        />
      </div>
      {data.months.length > 0 && (
        <Table
          caption="Cumulative savings by month"
          rows={data.months}
          rowKey={(row) => row.month}
          cols={[
            { key: "month", header: "Month", cell: (row) => monthLabel(row.month) },
            {
              key: "plan",
              header: "Planned",
              align: "right",
              cell: (row) => f.money(row.cum_plan),
            },
            {
              key: "ra",
              header: "Risk-adjusted",
              align: "right",
              cell: (row) => f.money(row.cum_risk_adjusted),
            },
            {
              key: "fo",
              header: "Forecast outturn",
              align: "right",
              cell: (row) => f.money(row.cum_forecast_outturn),
            },
            {
              key: "actual",
              header: "Actual",
              align: "right",
              cell: (row) => (row.has_actual ? f.money(row.cum_actual) : "—"),
            },
          ]}
        />
      )}
      <BlockNote>
        Full-year effect {f.money(data.full_year_effect)}; recurrent carry-forward into next year{" "}
        {f.money(data.carry_forward)}. Forecast outturn is actuals where recorded, else the
        forecast, else the plan. Risk-adjusted is the plan weighted by planning confidence.
      </BlockNote>
    </div>
  );
}

export const _efficiency_summary = registerBlock({
  key: "efficiency_summary",
  version: 1,
  name: "Efficiency programme summary",
  category: "budget",
  description:
    "Savings target, plan, risk-adjusted value, forecast outturn and actuals for the financial year, with the gap to target and the cumulative position by month.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: summarySchema,
  defaultConfig: { whole_organisation: true, show_months: true },
  Renderer: SummaryBlock,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- efficiency_breakdown

export interface BreakdownRow {
  key: string | null;
  label: string | null;
  schemes: number;
  target: Money;
  plan: Money;
  risk_adjusted: Money;
  forecast_outturn: Money;
  actual: Money;
  gap_plan: Money;
  gap_forecast: Money;
}
export interface BreakdownData {
  year: number;
  start_month: number;
  group_by: "unit" | "category" | "stage";
  whole_organisation: boolean;
  target: Money;
  rows: BreakdownRow[];
}

const breakdownSchema = z.object({
  ...commonConfig,
  group_by: z.enum(["unit", "category", "stage"]).default("unit"),
});

function BreakdownBlock({
  data,
}: {
  data: BreakdownData;
  config: z.infer<typeof breakdownSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const term = useModuleTerm();
  const money = (n: number) => f.money(n);
  if (!data?.rows?.length)
    return <Empty>No {term("efficiency.schemePlural").toLowerCase()} this year.</Empty>;
  const byUnit = data.group_by === "unit";
  const groupHeader = byUnit
    ? term("orgUnit")
    : data.group_by === "category"
      ? "Category"
      : "Stage";
  const name = (row: BreakdownRow) =>
    data.group_by === "stage"
      ? stageText(row.key)
      : (row.label ?? (byUnit ? `No ${term("orgUnit").toLowerCase()}` : "No category"));
  return (
    <div className="space-y-2">
      <Table
        caption={`${term("efficiency.programme")} by ${groupHeader.toLowerCase()}, ${yearText(data)}`}
        rows={data.rows}
        rowKey={(row) => `${row.key ?? "none"}`}
        cols={[
          { key: "name", header: groupHeader, cell: name },
          { key: "schemes", header: "Schemes", align: "right", cell: (row) => row.schemes },
          ...(byUnit
            ? [
                {
                  key: "target",
                  header: "Target",
                  align: "right" as const,
                  cell: (row: BreakdownRow) => f.money(row.target),
                },
              ]
            : []),
          { key: "plan", header: "Planned", align: "right", cell: (row) => f.money(row.plan) },
          {
            key: "ra",
            header: "Risk-adjusted",
            align: "right",
            cell: (row) => f.money(row.risk_adjusted),
          },
          ...(data.group_by === "stage"
            ? []
            : [
                {
                  key: "fo",
                  header: "Forecast outturn",
                  align: "right" as const,
                  cell: (row: BreakdownRow) => f.money(row.forecast_outturn),
                },
                {
                  key: "actual",
                  header: "Actual",
                  align: "right" as const,
                  cell: (row: BreakdownRow) => f.money(row.actual),
                },
              ]),
          ...(byUnit
            ? [
                {
                  key: "gap",
                  header: "Forecast against target",
                  cell: (row: BreakdownRow) => gapText(row.gap_forecast, money),
                },
              ]
            : []),
        ]}
      />
      {byUnit && (
        <BlockNote>
          Targets are set per {term("orgUnit").toLowerCase()}; the organisation&apos;s target is{" "}
          {f.money(data.target)}.
        </BlockNote>
      )}
    </div>
  );
}

export const _efficiency_breakdown = registerBlock({
  key: "efficiency_breakdown",
  version: 1,
  name: "Efficiency by unit, category or stage",
  category: "budget",
  description:
    "Planned, risk-adjusted, forecast and actual savings by organisational unit (with targets and the gap), by category or by pipeline stage.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: breakdownSchema,
  defaultConfig: { whole_organisation: true, group_by: "unit" },
  Renderer: BreakdownBlock,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- efficiency_schemes_at_risk

export interface AtRiskRow {
  id: string;
  ref: string;
  title: string;
  stage: string;
  lead: string | null;
  unit: string | null;
  category: string | null;
  plan: Money;
  forecast_outturn: Money;
  shortfall: Money;
  plan_to_date: Money;
  actual_to_date: Money;
  assessment_status: string | null;
  reasons: string[];
  is_sample: boolean;
}
export interface AtRiskData {
  year: number;
  start_month: number;
  tolerance_pct: number;
  count: number;
  shortfall: Money;
  rows: AtRiskRow[];
}

const atRiskSchema = z.object({
  ...commonConfig,
  limit: z.number().int().min(1).max(50).default(15),
  tolerance_pct: z.number().min(0).max(100).default(10),
});

function AtRiskBlock({
  data,
}: {
  data: AtRiskData;
  config: z.infer<typeof atRiskSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const term = useModuleTerm();
  if (!data?.year) return <Empty>No efficiency programme figures for this organisation.</Empty>;
  if (!data.rows.length)
    return <Empty>No {term("efficiency.schemePlural").toLowerCase()} off track this year.</Empty>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {data.count} off track, forecast {f.money(data.shortfall)} short of plan ({yearText(data)}).
      </p>
      <Table
        caption={`${term("efficiency.schemePlural")} off track, largest shortfall first`}
        rows={data.rows}
        rowKey={(row) => row.id}
        cols={[
          {
            key: "scheme",
            header: term("efficiency.scheme"),
            cell: (row) => (
              <span>
                {row.ref} {row.title}
                {row.is_sample && (
                  <span className="ml-1 text-xs text-muted-foreground">(sample)</span>
                )}
                <span className="block text-xs text-muted-foreground">
                  {[stageText(row.stage), row.unit, row.lead].filter(Boolean).join(" · ")}
                </span>
              </span>
            ),
          },
          { key: "plan", header: "Planned", align: "right", cell: (row) => f.money(row.plan) },
          {
            key: "fo",
            header: "Forecast outturn",
            align: "right",
            cell: (row) => f.money(row.forecast_outturn),
          },
          {
            key: "td",
            header: "Actual / plan to date",
            align: "right",
            cell: (row) => `${f.money(row.actual_to_date)} / ${f.money(row.plan_to_date)}`,
          },
          {
            key: "why",
            header: "Why",
            cell: (row) => row.reasons.map(reasonText).join("; "),
          },
        ]}
      />
      {data.count > data.rows.length && (
        <BlockNote>and {data.count - data.rows.length} more</BlockNote>
      )}
      <BlockNote>Off track means more than {data.tolerance_pct}% below plan.</BlockNote>
    </div>
  );
}

export const _efficiency_schemes_at_risk = registerBlock({
  key: "efficiency_schemes_at_risk",
  version: 1,
  name: "Efficiency schemes at risk",
  category: "budget",
  description:
    "Savings schemes forecast or delivering below plan, on hold, or in delivery without an approved impact assessment, largest shortfall first.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: atRiskSchema,
  defaultConfig: { whole_organisation: true, limit: 15, tolerance_pct: 10 },
  Renderer: AtRiskBlock,
  partnerSafe: false,
  phase: 4,
});

// ---------------------------------------------------------------- efficiency_recurrent

interface Split {
  recurrent: Money;
  non_recurrent: Money;
}
export interface RecurrentRow {
  key: string | null;
  label: string | null;
  plan_recurrent: Money;
  plan_non_recurrent: Money;
  forecast_recurrent: Money;
  forecast_non_recurrent: Money;
  recurrent_pct: Money;
}
export interface RecurrentData {
  year: number;
  start_month: number;
  plan: Split;
  forecast_outturn: Split;
  actual: Split;
  recurrent_pct: Money;
  forecast_recurrent_pct: Money;
  full_year_effect: Money;
  carry_forward: Money;
  rows: RecurrentRow[];
}

const recurrentSchema = z.object({ ...commonConfig });

/** "95.2%" or "—". */
export const shareText = (value: Money | undefined) => {
  const n = num(value);
  return n === null ? "—" : `${n.toFixed(1).replace(/\.0$/, "")}%`;
};

function RecurrentBlock({
  data,
}: {
  data: RecurrentData;
  config: z.infer<typeof recurrentSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const term = useModuleTerm();
  if (!data?.year || !data.rows?.length)
    return <Empty>No {term("efficiency.schemePlural").toLowerCase()} this year.</Empty>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Recurrent (planned)"
          value={f.money(data.plan.recurrent)}
          note={`${shareText(data.recurrent_pct)} of the plan`}
        />
        <Stat label="Non-recurrent (planned)" value={f.money(data.plan.non_recurrent)} />
        <Stat
          label="Recurrent (forecast)"
          value={f.money(data.forecast_outturn.recurrent)}
          note={`${shareText(data.forecast_recurrent_pct)} of the forecast`}
        />
        <Stat
          label="Full-year effect"
          value={f.money(data.full_year_effect)}
          note={`carry-forward ${f.money(data.carry_forward)}`}
        />
      </div>
      <Table
        caption={`Recurrent and non-recurrent savings by category, ${yearText(data)}`}
        rows={data.rows}
        rowKey={(row) => `${row.key ?? "none"}`}
        cols={[
          { key: "cat", header: "Category", cell: (row) => row.label ?? "No category" },
          {
            key: "pr",
            header: "Recurrent (planned)",
            align: "right",
            cell: (row) => f.money(row.plan_recurrent),
          },
          {
            key: "pn",
            header: "Non-recurrent (planned)",
            align: "right",
            cell: (row) => f.money(row.plan_non_recurrent),
          },
          {
            key: "fr",
            header: "Recurrent (forecast)",
            align: "right",
            cell: (row) => f.money(row.forecast_recurrent),
          },
          {
            key: "pct",
            header: "Recurrent share",
            align: "right",
            cell: (row) => shareText(row.recurrent_pct),
          },
        ]}
      />
      <BlockNote>
        Actuals so far: {f.money(data.actual.recurrent)} recurrent,{" "}
        {f.money(data.actual.non_recurrent)} non-recurrent. Non-recurrent savings don&apos;t carry
        into next year.
      </BlockNote>
    </div>
  );
}

export const _efficiency_recurrent = registerBlock({
  key: "efficiency_recurrent",
  version: 1,
  name: "Recurrent and non-recurrent savings",
  category: "budget",
  description:
    "Recurrent and non-recurrent savings planned, forecast and achieved, with the full-year effect and the carry-forward into next year, by category.",
  supportedScopes: SCOPES,
  perEntity: false,
  configSchema: recurrentSchema,
  defaultConfig: { whole_organisation: true },
  Renderer: RecurrentBlock,
  partnerSafe: false,
  phase: 4,
});
