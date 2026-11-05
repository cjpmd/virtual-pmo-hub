// Progress, budget, decisions, RAID and requests blocks (Phase 1): project_summary,
// milestone_slippage, budget_summary, decisions_required, top_raid, change_requests.
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Stat, Table, days, useReportFormat } from "../primitives";
import type { RenderContext, RiskBand } from "../types";

// ---------------------------------------------------------------- project_summary
interface SummaryData {
  code: string;
  name: string;
  tier: string | null;
  priority: string | null;
  state: string;
  phase: string | null;
  phase_index: number | null;
  phase_count: number | null;
  start_date: string | null;
  finish_date: string | null;
  baseline_finish_date: string | null;
  forecast_finish_date: string | null;
  finish_vs_baseline_days: number | null;
  programme: string | null;
  manager: string | null;
  sponsor: string | null;
  project_officer: string | null;
  percent_complete: number | null;
}

const cap = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : "—";

function Summary({
  data,
}: {
  data: SummaryData | null;
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data) return <Empty>This block needs one project.</Empty>;
  const facts: Array<[string, string]> = [
    ["Programme", data.programme ?? "—"],
    ["Tier", cap(data.tier)],
    ["Priority", cap(data.priority)],
    [
      "Phase",
      data.phase
        ? `${data.phase}${data.phase_index && data.phase_count ? ` (${data.phase_index} of ${data.phase_count})` : ""}`
        : "—",
    ],
    ["Manager", data.manager ?? "—"],
    ["Sponsor", data.sponsor ?? "—"],
    ["Start", f.date(data.start_date)],
    ["Baseline finish", f.date(data.baseline_finish_date)],
    [
      "Forecast finish",
      `${f.date(data.forecast_finish_date ?? data.finish_date)}${data.finish_vs_baseline_days ? ` (${data.finish_vs_baseline_days > 0 ? "+" : ""}${data.finish_vs_baseline_days} days)` : ""}`,
    ],
    ["Complete", `${data.percent_complete ?? 0}%`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-5">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const _project_summary = registerBlock<Record<string, never>, SummaryData | null>({
  key: "project_summary",
  version: 1,
  name: "Project summary",
  category: "progress",
  description: "Tier, priority, lifecycle phase, people and dates for one project.",
  supportedScopes: ["project"],
  perEntity: true,
  configSchema: z.object({}).passthrough() as never,
  defaultConfig: {},
  exposedMetrics: ["percent_complete"],
  Renderer: Summary,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- milestone_slippage
interface MilestoneRow {
  id: string;
  ref: string | null;
  title: string;
  type: string;
  project_code: string;
  baseline_date: string | null;
  forecast_date: string | null;
  slip_days: number | null;
  slip_band: string | null;
  status: string;
}

const milestoneSchema = z.object({
  limit: z.number().int().min(1).max(30).default(8),
  slipped_only: z.boolean().default(false),
  slip_amber_days: z.number().int().min(1).max(90).default(7),
  slip_red_days: z.number().int().min(1).max(180).default(30),
});
type MilestoneConfig = z.infer<typeof milestoneSchema>;

function Milestones({
  data,
  config,
}: {
  data: { multi: boolean; rows: MilestoneRow[] };
  config: MilestoneConfig;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const band = (slip: number | null) =>
    !slip || slip <= 0
      ? { text: "On time", cls: "text-health-good-foreground" }
      : slip >= config.slip_red_days
        ? { text: `+${days(slip)}`, cls: "text-health-bad-foreground font-semibold" }
        : slip >= config.slip_amber_days
          ? { text: `+${days(slip)}`, cls: "text-health-warn-foreground font-semibold" }
          : { text: `+${days(slip)}`, cls: "" };
  return (
    <Table
      rows={data.rows}
      rowKey={(row) => row.id}
      caption="Open milestones, slipped first"
      empty="No open milestones."
      cols={[
        ...(data.multi
          ? [{ key: "p", header: "Project", cell: (row: MilestoneRow) => row.project_code }]
          : []),
        {
          key: "t",
          header: "Milestone",
          cell: (row) => (
            <span>
              {row.title}
              {row.type === "gate" && (
                <span className="ml-1 text-xs text-muted-foreground">(gate)</span>
              )}
            </span>
          ),
        },
        { key: "b", header: "Baseline", cell: (row) => f.date(row.baseline_date) },
        { key: "fc", header: "Forecast", cell: (row) => f.date(row.forecast_date) },
        {
          key: "s",
          header: "Slip",
          align: "right",
          cell: (row) => {
            const b = band(row.slip_days);
            return <span className={b.cls}>{b.text}</span>;
          },
        },
      ]}
    />
  );
}

export const _milestone_slippage = registerBlock<
  MilestoneConfig,
  { multi: boolean; rows: MilestoneRow[] }
>({
  key: "milestone_slippage",
  version: 1,
  name: "Milestone slippage",
  category: "progress",
  description: "Next open milestones and slipped ones vs baseline.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: milestoneSchema,
  defaultConfig: { limit: 8, slipped_only: false, slip_amber_days: 7, slip_red_days: 30 },
  exposedMetrics: ["max_milestone_slip_days", "slipped_milestones"],
  Renderer: Milestones,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- budget_summary
interface BudgetRow {
  id: string;
  code: string;
  name: string;
  budget: number;
  actual_to_date: number;
  eac: number;
  variance: number;
  variance_percent: number | null;
  change_period: number | null;
}
interface BudgetData {
  currency: string;
  rows: BudgetRow[];
  totals: {
    budget: number | null;
    actual_to_date: number | null;
    eac: number | null;
    variance: number | null;
    variance_percent: number | null;
    change_period: number | null;
  };
}

const budgetSchema = z.object({
  show_projects: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(10),
});

function Budget({
  data,
  config,
  ctx,
}: {
  data: BudgetData;
  config: z.infer<typeof budgetSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const t = data.totals;
  const tone = (pct: number | null | undefined) =>
    pct === null || pct === undefined
      ? undefined
      : pct > 5
        ? ("bad" as const)
        : pct > 0
          ? ("warn" as const)
          : ("good" as const);
  const multi = data.rows.length > 1;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Budget" value={f.money(t.budget)} />
        <Stat label="Actual to date" value={f.money(t.actual_to_date)} />
        <Stat
          label="Forecast at completion"
          value={f.money(t.eac)}
          note={t.change_period ? `${f.signedMoney(t.change_period)} this period` : undefined}
        />
        <Stat
          label="Variance"
          value={f.signedMoney(t.variance)}
          note={f.pct(t.variance_percent)}
          tone={tone(t.variance_percent)}
        />
      </div>
      {multi && config.show_projects && (
        <Table
          rows={data.rows.slice(0, config.limit)}
          rowKey={(row) => row.id}
          caption="Budget by project, largest variance first"
          cols={[
            { key: "p", header: "Project", cell: (row) => `${row.code} ${row.name}` },
            { key: "b", header: "Budget", align: "right", cell: (row) => f.money(row.budget) },
            { key: "e", header: "Forecast", align: "right", cell: (row) => f.money(row.eac) },
            {
              key: "v",
              header: "Variance",
              align: "right",
              cell: (row) => `${f.signedMoney(row.variance)} (${f.pct(row.variance_percent)})`,
            },
            {
              key: "c",
              header: "Moved",
              align: "right",
              cell: (row) => f.signedMoney(row.change_period),
            },
          ]}
        />
      )}
      <BlockNote>
        Variance = forecast at completion − budget (
        {ctx.source === "snapshot" ? "as published" : "live"}); positive is an overspend.
      </BlockNote>
    </div>
  );
}

export const _budget_summary = registerBlock<z.infer<typeof budgetSchema>, BudgetData>({
  key: "budget_summary",
  version: 1,
  name: "Budget summary",
  category: "budget",
  description: "Budget, actual, forecast at completion and variance, with this period's movement.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: budgetSchema,
  defaultConfig: { show_projects: true, limit: 10 },
  exposedMetrics: ["budget_variance_abs", "budget_variance_pct", "budget_change_period"],
  Renderer: Budget,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- decisions_required
interface DecisionRow {
  id: string;
  ref: string;
  title: string;
  context: string | null;
  needed_by_date: string | null;
  overdue: boolean | null;
  project_code: string | null;
  forum_name: string | null;
  options: Array<{
    id: string;
    title: string;
    pros: string[] | null;
    cons: string[] | null;
  }> | null;
  impact_cost: boolean | null;
  impact_time: boolean | null;
  impact_scope: boolean | null;
  impact_benefits: boolean | null;
}

const decisionsSchema = z.object({
  source: z.enum(["forum", "scope"]).default("forum"),
  limit: z.number().int().min(1).max(50).default(20),
});

function Decisions({
  data,
}: {
  data: { rows: DecisionRow[] };
  config: z.infer<typeof decisionsSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.rows.length) return <Empty>No decisions are waiting for this forum.</Empty>;
  return (
    <ol className="space-y-3">
      {data.rows.map((d) => {
        const impacts = [
          d.impact_cost && "cost",
          d.impact_time && "time",
          d.impact_scope && "scope",
          d.impact_benefits && "benefits",
        ].filter(Boolean);
        return (
          <li
            key={d.id}
            className="report-avoid-break rounded-md border p-3"
            data-decision-id={d.id}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-semibold">
                <span className="text-muted-foreground">{d.ref}</span> {d.title}
              </h4>
              <span
                className={
                  d.overdue
                    ? "text-sm font-semibold text-health-bad-foreground"
                    : "text-sm text-muted-foreground"
                }
              >
                Needed by {f.date(d.needed_by_date)}
                {d.overdue && " (overdue)"}
              </span>
            </div>
            {d.context && <p className="mt-1 text-sm leading-6">{d.context}</p>}
            {d.options?.length ? (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {d.options.map((o) => (
                  <li key={o.id} className="rounded bg-muted/40 p-2 text-sm">
                    <div className="font-medium">{o.title}</div>
                    {o.pros?.length ? (
                      <div className="text-xs">For: {o.pros.join("; ")}</div>
                    ) : null}
                    {o.cons?.length ? (
                      <div className="text-xs">Against: {o.cons.join("; ")}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              {d.project_code && `${d.project_code} · `}
              {impacts.length ? `Affects ${impacts.join(", ")}` : "No impacts recorded"}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export const _decisions_required = registerBlock<
  z.infer<typeof decisionsSchema>,
  { rows: DecisionRow[] }
>({
  key: "decisions_required",
  version: 1,
  name: "Decisions required",
  category: "decisions",
  description: "Pending decisions asked of this forum (or in scope), with options and due dates.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: decisionsSchema,
  defaultConfig: { source: "forum", limit: 20 },
  exposedMetrics: ["open_decisions_for_forum"],
  Renderer: Decisions,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- top_raid
interface RaidRow {
  kind: "risk" | "issue";
  id: string;
  ref: string | null;
  title: string;
  project_code: string;
  likelihood: number | null;
  consequence: number | null;
  score: number | null;
  band: (RiskBand & { rank: number }) | null;
  severity: string | null;
  owner: string | null;
  updated_at: string;
}
interface RaidData {
  matrix: { name: string; bands: RiskBand[] };
  rows: RaidRow[];
  open_total: number;
}

const raidSchema = z.object({
  limit: z.number().int().min(1).max(25).default(5),
  types: z.array(z.enum(["risk", "issue"])).default(["risk", "issue"]),
  min_band: z.string().optional(),
});

function Raid({
  data,
  ctx,
}: {
  data: RaidData;
  config: z.infer<typeof raidSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <div className="space-y-2">
      <Table
        rows={data.rows}
        rowKey={(row) => row.id}
        caption="Top risks and issues"
        empty="No open risks or issues."
        cols={[
          {
            key: "k",
            header: "",
            cell: (row) => (
              <span className="text-xs uppercase text-muted-foreground">{row.kind}</span>
            ),
          },
          {
            key: "t",
            header: "Title",
            cell: (row) => (
              <span>
                <span className="text-muted-foreground">{row.ref}</span> {row.title}
                {ctx.entityId === null && (
                  <span className="ml-1 text-xs text-muted-foreground">{row.project_code}</span>
                )}
              </span>
            ),
          },
          {
            key: "r",
            header: "Rating",
            cell: (row) =>
              row.kind === "risk" && row.band ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: row.band.colour }}
                  />
                  {row.band.label} ({row.score})
                </span>
              ) : (
                <span>{cap(row.severity)} severity</span>
              ),
          },
          { key: "o", header: "Owner", cell: (row) => row.owner ?? "—" },
          { key: "u", header: "Updated", cell: (row) => f.date(row.updated_at) },
        ]}
      />
      <BlockNote>
        {data.rows.length} of {data.open_total} open, by {data.matrix.name} band then score, then
        longest since update.
      </BlockNote>
    </div>
  );
}

export const _top_raid = registerBlock<z.infer<typeof raidSchema>, RaidData>({
  key: "top_raid",
  version: 1,
  name: "Top risks and issues",
  category: "raid",
  description: "Top N open risks and issues by the organisation's risk matrix, then staleness.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: raidSchema,
  defaultConfig: { limit: 5, types: ["risk", "issue"] },
  exposedMetrics: ["max_risk_score", "risks_in_top_band", "open_issues_high"],
  Renderer: Raid,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- change_requests
interface ChangeRow {
  id: string;
  ref: string | null;
  title: string;
  status: string;
  cost_impact: number | null;
  schedule_impact_days: number | null;
  project_code: string;
  change_type: string | null;
}

const changeSchema = z.object({
  statuses: z
    .array(z.enum(["proposed", "approved", "rejected"]))
    .default(["proposed", "approved", "rejected"]),
  since_days: z.number().int().min(7).max(365).default(90),
  limit: z.number().int().min(1).max(50).default(15),
});

function Changes({
  data,
}: {
  data: { rows: ChangeRow[] };
  config: z.infer<typeof changeSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <Table
      rows={data.rows}
      rowKey={(row) => row.id}
      caption="Change requests"
      empty="No change requests in the period."
      cols={[
        { key: "r", header: "Ref", cell: (row) => row.ref ?? "—" },
        {
          key: "t",
          header: "Change",
          cell: (row) => (
            <span>
              {row.title} <span className="text-xs text-muted-foreground">{row.project_code}</span>
            </span>
          ),
        },
        {
          key: "s",
          header: "Status",
          cell: (row) => (row.status === "proposed" ? "Awaiting decision" : cap(row.status)),
        },
        { key: "c", header: "Cost", align: "right", cell: (row) => f.signedMoney(row.cost_impact) },
        {
          key: "d",
          header: "Time",
          align: "right",
          cell: (row) =>
            row.schedule_impact_days
              ? `${row.schedule_impact_days > 0 ? "+" : ""}${days(row.schedule_impact_days)}`
              : "—",
        },
      ]}
    />
  );
}

export const _change_requests = registerBlock<z.infer<typeof changeSchema>, { rows: ChangeRow[] }>({
  key: "change_requests",
  version: 1,
  name: "Change requests",
  category: "requests",
  description: "Open and recently decided change requests with time and cost impact.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: changeSchema,
  defaultConfig: { statuses: ["proposed", "approved", "rejected"], since_days: 90, limit: 15 },
  exposedMetrics: ["open_change_requests"],
  Renderer: Changes,
  partnerSafe: true,
  phase: 1,
});
