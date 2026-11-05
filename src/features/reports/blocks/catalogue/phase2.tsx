// Phase 2 blocks: rating_distribution, divergence_list, milestone_timeline, roadmap,
// burnup_forecast, stage_gates, spend_profile, budget_movers, resource_summary,
// decisions_taken, risk_heatmap, escalations, dependencies, benefits_summary,
// requests_pipeline, actions_log, data_quality, approvals_status. Charts are SVG (§20).
import { z } from "zod";
import { registerBlock } from "../registry";
import {
  BlockNote,
  Empty,
  RatingChip,
  Stat,
  StackedBar,
  Table,
  days,
  levelFor,
  useReportFormat,
} from "../primitives";
import type { RenderContext, RiskBand } from "../types";

const ALL_SCOPES = ["project", "programme", "portfolio", "custom"] as const;
const MULTI = ["programme", "portfolio", "custom"] as const;
const noConfig = z.object({}).passthrough() as unknown as z.ZodType<
  Record<string, never>,
  z.ZodTypeDef,
  unknown
>;
const cap = (v: string | null | undefined) =>
  v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "—";
const monthLabel = (ym: string) =>
  `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(ym.slice(5, 7)) - 1]} ${ym.slice(2, 4)}`;

// ---------------------------------------------------------------- rating_distribution
type Counts = Partial<Record<"green" | "amber" | "red" | "not_set", number>>;
function Distribution({
  data,
  ctx,
}: {
  data: { total: number; declared: Counts | null; evidenced: Counts | null };
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const bar = (label: string, counts: Counts | null) => {
    const parts = (["green", "amber", "red", "not_set"] as const).map((rag) => ({
      key: rag,
      value: counts?.[rag] ?? 0,
      colour: levelFor(ctx.scheme, rag)?.colour ?? "#d1d5db",
      label: levelFor(ctx.scheme, rag)?.label ?? rag,
    }));
    return (
      <div className="grid grid-cols-[6rem_1fr] items-center gap-2 text-sm">
        <span>{label}</span>
        <div>
          <StackedBar parts={parts} label={`${label} ratings`} height={18} />
          <p className="mt-0.5 text-xs text-muted-foreground">
            {parts
              .filter((p) => p.value)
              .map((p) => `${p.label} ${p.value}`)
              .join(" · ") || "None"}
          </p>
        </div>
      </div>
    );
  };
  return (
    <div className="space-y-3">
      {bar("Declared", data.declared)}
      {bar("Evidenced", data.evidenced)}
      <BlockNote>{data.total} projects in scope.</BlockNote>
    </div>
  );
}
registerBlock({
  key: "rating_distribution",
  version: 1,
  name: "Rating distribution",
  category: "status",
  description: "Count of projects by rating, declared vs evidenced.",
  supportedScopes: [...MULTI],
  perEntity: false,
  configSchema: noConfig,
  defaultConfig: {},
  Renderer: Distribution,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- divergence_list
interface DivRow {
  id: string;
  code: string;
  name: string;
  declared: string;
  evidenced: string;
  divergence_days: number;
  justified: boolean | null;
  justification: string | null;
}
const divSchema = z.object({ min_days: z.number().int().min(0).max(365).default(0) });
function Divergence({
  data,
  ctx,
}: {
  data: { rows: DivRow[] };
  config: z.infer<typeof divSchema>;
  ctx: RenderContext;
}) {
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => r.id}
      caption="Projects reporting better than the evidence"
      empty="No project reports better than its evidence."
      cols={[
        { key: "p", header: "Project", cell: (r) => `${r.code} ${r.name}` },
        {
          key: "d",
          header: "Declared",
          cell: (r) => <RatingChip scheme={ctx.scheme} value={r.declared} size="sm" />,
        },
        {
          key: "e",
          header: "Evidenced",
          cell: (r) => <RatingChip scheme={ctx.scheme} value={r.evidenced} size="sm" />,
        },
        { key: "n", header: "For", align: "right", cell: (r) => days(r.divergence_days) },
        {
          key: "j",
          header: "Justification",
          cell: (r) =>
            r.justified ? r.justification : <span className="text-muted-foreground">None</span>,
        },
      ]}
    />
  );
}
registerBlock({
  key: "divergence_list",
  version: 1,
  name: "Divergence list",
  category: "assurance",
  description: "Projects whose declared rating is better than the evidence, with days diverged.",
  supportedScopes: [...MULTI],
  perEntity: false,
  configSchema: divSchema,
  defaultConfig: { min_days: 0 },
  exposedMetrics: ["divergence_days", "rating_rank_delta"],
  Renderer: Divergence,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- timelines (SVG)
const toTime = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
function Axis({
  from,
  to,
  width,
  x,
}: {
  from: string;
  to: string;
  width: number;
  x: (iso: string) => number;
}) {
  const ticks: string[] = [];
  const start = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  for (
    let d = start;
    toTime(d.toISOString().slice(0, 10)) <= toTime(to);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
  )
    ticks.push(d.toISOString().slice(0, 10));
  return (
    <g>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={14} y2="100%" stroke="currentColor" strokeOpacity={0.12} />
          <text x={x(t) + 2} y={10} fontSize={9} fill="currentColor" fillOpacity={0.7}>
            {monthLabel(t.slice(0, 7))}
          </text>
        </g>
      ))}
      <line x1={0} x2={width} y1={14} y2={14} stroke="currentColor" strokeOpacity={0.3} />
    </g>
  );
}

interface TimelineRow {
  id: string;
  title: string;
  type: string;
  project_code: string;
  baseline_date: string | null;
  forecast_date: string | null;
  actual_date: string | null;
  slip_days: number | null;
}
const timelineSchema = z.object({
  window_months: z.number().int().min(1).max(24).default(6),
  types: z
    .array(z.enum(["delivery", "gate", "key_date", "external_dependency", "approval"]))
    .default([]),
});
function Timeline({
  data,
}: {
  data: { from: string; to: string; as_at: string; multi: boolean; rows: TimelineRow[] };
  config: z.infer<typeof timelineSchema>;
  ctx: RenderContext;
}) {
  if (!data.rows.length) return <Empty>No milestones in the window.</Empty>;
  const W = 720,
    label = 210,
    rowH = 20;
  const span = toTime(data.to) - toTime(data.from);
  const x = (iso: string) => label + ((toTime(iso) - toTime(data.from)) / span) * (W - label - 10);
  const H = 22 + data.rows.length * rowH;
  return (
    <svg
      role="img"
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      aria-label={`Milestone timeline, ${data.rows.length} milestones`}
    >
      <title>
        Milestone timeline: diamonds show forecast (filled when done), circles the baseline
      </title>
      <Axis from={data.from} to={data.to} width={W} x={x} />
      <line
        x1={x(data.as_at)}
        x2={x(data.as_at)}
        y1={14}
        y2={H}
        stroke="#2563eb"
        strokeDasharray="3 3"
      />
      {data.rows.map((r, i) => {
        const y = 22 + i * rowH + rowH / 2;
        const when = r.actual_date ?? r.forecast_date;
        const slipped = (r.slip_days ?? 0) > 0;
        return (
          <g key={r.id}>
            <text x={0} y={y + 3} fontSize={10} fill="currentColor">
              {(data.multi ? `${r.project_code} · ` : "") + r.title.slice(0, 34)}
            </text>
            {r.baseline_date && (
              <circle
                cx={x(r.baseline_date)}
                cy={y}
                r={3.5}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.6}
              />
            )}
            {r.baseline_date && when && slipped && (
              <line
                x1={x(r.baseline_date)}
                x2={x(when)}
                y1={y}
                y2={y}
                stroke="#b3261e"
                strokeWidth={1.5}
              />
            )}
            {when && (
              <path
                d={`M${x(when)},${y - 5} l5,5 l-5,5 l-5,-5 z`}
                fill={r.actual_date ? "#2e7d52" : slipped ? "#b3261e" : "#64748b"}
              >
                <title>{`${r.title}: ${r.actual_date ? "done" : "forecast"} ${when}${slipped ? `, ${r.slip_days} days late` : ""}`}</title>
              </path>
            )}
          </g>
        );
      })}
    </svg>
  );
}
registerBlock({
  key: "milestone_timeline",
  version: 1,
  name: "Milestone timeline",
  category: "roadmap",
  description: "Gantt-lite of milestones over a window: baseline, forecast, done.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: timelineSchema,
  defaultConfig: { window_months: 6, types: [] },
  Renderer: Timeline,
  partnerSafe: true,
  phase: 2,
});

interface RoadRow {
  id: string;
  code: string;
  name: string;
  programme: string;
  start_date: string | null;
  finish_date: string | null;
  baseline_finish_date: string | null;
  rating: string | null;
  phase: string | null;
  key_dates: Array<{ title: string; date: string; type: string; done: boolean }>;
}
const roadmapSchema = z.object({
  window_months: z.number().int().min(3).max(36).default(12),
  swimlane_by_programme: z.boolean().default(true),
});
function Roadmap({
  data,
  config,
  ctx,
}: {
  data: { from: string; to: string; as_at: string; rows: RoadRow[] };
  config: z.infer<typeof roadmapSchema>;
  ctx: RenderContext;
}) {
  if (!data.rows.length) return <Empty>No projects in scope.</Empty>;
  const W = 760,
    label = 200,
    rowH = 22;
  const span = toTime(data.to) - toTime(data.from);
  const clamp = (iso: string) =>
    Math.min(Math.max(toTime(iso), toTime(data.from)), toTime(data.to));
  const x = (iso: string) => label + ((clamp(iso) - toTime(data.from)) / span) * (W - label - 10);
  const lines: Array<{ kind: "lane"; name: string } | { kind: "row"; row: RoadRow }> = [];
  let lane = "";
  for (const row of data.rows) {
    if (config.swimlane_by_programme && row.programme !== lane) {
      lane = row.programme;
      lines.push({ kind: "lane", name: lane });
    }
    lines.push({ kind: "row", row });
  }
  const H = 22 + lines.length * rowH;
  return (
    <svg
      role="img"
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      aria-label={`Roadmap of ${data.rows.length} projects`}
    >
      <title>
        Roadmap: bars from start to forecast finish, coloured by rating; ticks mark the baseline
        finish; diamonds are gates and key dates
      </title>
      <Axis from={data.from} to={data.to} width={W} x={x} />
      <line
        x1={x(data.as_at)}
        x2={x(data.as_at)}
        y1={14}
        y2={H}
        stroke="#2563eb"
        strokeDasharray="3 3"
      />
      {lines.map((line, i) => {
        const y = 22 + i * rowH;
        if (line.kind === "lane")
          return (
            <text
              key={`l-${line.name}`}
              x={0}
              y={y + 14}
              fontSize={10}
              fontWeight={700}
              fill="currentColor"
            >
              {line.name}
            </text>
          );
        const r = line.row;
        const colour = levelFor(ctx.scheme, r.rating)?.colour ?? "#94a3b8";
        return (
          <g key={r.id}>
            <text x={8} y={y + 14} fontSize={10} fill="currentColor">
              {`${r.code} ${r.name}`.slice(0, 32)}
            </text>
            {r.start_date && r.finish_date && (
              <rect
                x={x(r.start_date)}
                y={y + 5}
                width={Math.max(2, x(r.finish_date) - x(r.start_date))}
                height={12}
                rx={3}
                fill={colour}
                fillOpacity={0.7}
              >
                <title>{`${r.name}: ${r.start_date} → ${r.finish_date} (${levelFor(ctx.scheme, r.rating)?.label ?? "not rated"})`}</title>
              </rect>
            )}
            {r.baseline_finish_date && (
              <line
                x1={x(r.baseline_finish_date)}
                x2={x(r.baseline_finish_date)}
                y1={y + 3}
                y2={y + 19}
                stroke="currentColor"
                strokeWidth={2}
              />
            )}
            {r.key_dates.map((k) => (
              <path
                key={k.title + k.date}
                d={`M${x(k.date)},${y + 6} l5,5 l-5,5 l-5,-5 z`}
                fill={k.done ? "#2e7d52" : "#0f172a"}
                fillOpacity={0.85}
              >
                <title>{`${k.title} ${k.date}`}</title>
              </path>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
registerBlock({
  key: "roadmap",
  version: 1,
  name: "Roadmap",
  category: "roadmap",
  description: "Cross-project timeline with phases, gates and key milestones, by programme.",
  supportedScopes: [...MULTI],
  perEntity: false,
  configSchema: roadmapSchema,
  defaultConfig: { window_months: 12, swimlane_by_programme: true },
  Renderer: Roadmap,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- burnup_forecast
interface Burnup {
  unit: "items" | "points";
  series: Array<{ month: string; scope: number; done: number }>;
  rate_per_month: number | null;
  remaining: number | null;
  forecast_month: string | null;
}
const burnSchema = z.object({ months: z.number().int().min(3).max(12).default(6) });
function BurnupChart({
  data,
}: {
  data: Burnup | null;
  config: z.infer<typeof burnSchema>;
  ctx: RenderContext;
}) {
  if (!data || !data.series.length || data.series.every((s) => s.scope === 0))
    return <Empty>No work items to chart.</Empty>;
  const W = 480,
    H = 160,
    pad = 28;
  const max = Math.max(...data.series.map((s) => s.scope), 1);
  const x = (i: number) => pad + (i / Math.max(data.series.length - 1, 1)) * (W - pad - 10);
  const y = (v: number) => H - 20 - (v / max) * (H - 40);
  const path = (key: "scope" | "done") =>
    data.series.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s[key])}`).join(" ");
  return (
    <div className="space-y-2">
      <svg
        role="img"
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-xl"
        aria-label={`Burn-up: ${data.series.map((s) => `${s.month} ${s.done} of ${s.scope}`).join(", ")}`}
      >
        <title>Burn-up: total scope (dashed) and completed {data.unit}</title>
        <path
          d={path("scope")}
          fill="none"
          stroke="#64748b"
          strokeDasharray="5 4"
          strokeWidth={2}
        />
        <path d={path("done")} fill="none" stroke="#2563eb" strokeWidth={2.5} />
        {data.series.map((s, i) => (
          <text
            key={s.month}
            x={x(i)}
            y={H - 4}
            fontSize={9}
            textAnchor="middle"
            fill="currentColor"
          >
            {monthLabel(s.month)}
          </text>
        ))}
        <text x={2} y={y(max) + 3} fontSize={9} fill="currentColor">
          {max}
        </text>
      </svg>
      <p className="text-sm">
        {data.rate_per_month
          ? `${data.rate_per_month} ${data.unit} a month; ${data.remaining} left. `
          : "No completions in the last three months. "}
        {data.forecast_month ? `At this rate, done in ${monthLabel(data.forecast_month)}.` : ""}
      </p>
      <BlockNote>
        From work-item completion (RB-22), not sprints. Dashed: total scope; solid: done.
      </BlockNote>
    </div>
  );
}
registerBlock({
  key: "burnup_forecast",
  version: 1,
  name: "Burn-up and forecast",
  category: "progress",
  description: "Completed vs total work by month, with a straight-line completion forecast.",
  supportedScopes: ["project"],
  perEntity: true,
  configSchema: burnSchema,
  defaultConfig: { months: 6 },
  Renderer: BurnupChart,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- stage_gates
interface GateRow {
  id: string;
  source: string;
  project_code: string;
  name: string;
  phase: string | null;
  due: string | null;
  days_to: number | null;
  status: string;
  ticked: number;
  criteria: number;
}
const gatesSchema = z.object({ window_days: z.number().int().min(7).max(365).default(90) });
function Gates({
  data,
}: {
  data: { rows: GateRow[] };
  config: z.infer<typeof gatesSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => r.id}
      caption="Upcoming stage gates"
      empty="No stage gates due in the window."
      cols={[
        { key: "p", header: "Project", cell: (r) => r.project_code },
        { key: "g", header: "Gate", cell: (r) => r.name },
        {
          key: "d",
          header: "Due",
          cell: (r) =>
            `${f.date(r.due)}${r.days_to !== null ? ` (${r.days_to < 0 ? `${-r.days_to} days late` : `in ${days(r.days_to)}`})` : ""}`,
        },
        {
          key: "r",
          header: "Readiness",
          cell: (r) =>
            r.criteria
              ? `${r.ticked} of ${r.criteria} ${r.source === "approval_gate" ? "approvals" : "criteria"}`
              : "—",
        },
        {
          key: "s",
          header: "Status",
          cell: (r) => (
            <span
              className={r.status === "overdue" ? "font-semibold text-health-bad-foreground" : ""}
            >
              {cap(r.status)}
            </span>
          ),
        },
      ]}
    />
  );
}
registerBlock({
  key: "stage_gates",
  version: 1,
  name: "Stage gates",
  category: "progress",
  description: "Upcoming and overdue stage gates with readiness (checklists and approval gates).",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: gatesSchema,
  defaultConfig: { window_days: 90 },
  exposedMetrics: ["days_to_next_gate"],
  Renderer: Gates,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- spend_profile
interface SpendRow {
  month: string;
  budget: number;
  actual: number | null;
  forecast: number;
}
const spendSchema = z.object({
  months_back: z.number().int().min(0).max(24).default(6),
  months_ahead: z.number().int().min(0).max(24).default(6),
  cumulative: z.boolean().default(false),
});
function Spend({
  data,
  config,
}: {
  data: { rows: SpendRow[]; actuals_through: string | null };
  config: z.infer<typeof spendSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.rows.some((r) => r.budget || r.actual || r.forecast))
    return <Empty>No phased budget, actuals or forecast in the window.</Empty>;
  let cb = 0,
    cs = 0;
  const rows = data.rows.map((r) => {
    const spend = r.actual ?? r.forecast;
    cb += r.budget;
    cs += spend;
    return { ...r, spend, cb, cs };
  });
  const W = 720,
    H = 170,
    pad = 40;
  const val = (r: (typeof rows)[number], k: "budget" | "spend") =>
    config.cumulative ? (k === "budget" ? r.cb : r.cs) : r[k];
  const max = Math.max(...rows.map((r) => Math.max(val(r, "budget"), val(r, "spend"))), 1);
  const bw = (W - pad) / rows.length;
  const y = (v: number) => H - 20 - (v / max) * (H - 36);
  const line = rows
    .map((r, i) => `${i ? "L" : "M"}${pad + i * bw + bw / 2},${y(val(r, "budget"))}`)
    .join(" ");
  return (
    <div className="space-y-1">
      <svg
        role="img"
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        aria-label={`Monthly spend: ${rows.map((r) => `${monthLabel(r.month)} ${f.money(r.spend)}`).join(", ")}`}
      >
        <title>
          Spend by month: solid bars are actuals, hatched bars forecast, the line is the phased
          budget
        </title>
        <defs>
          <pattern
            id="spend-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="#93c5fd" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#2563eb" strokeWidth="2" />
          </pattern>
        </defs>
        {rows.map((r, i) => (
          <g key={r.month}>
            <rect
              x={pad + i * bw + 3}
              y={y(val(r, "spend"))}
              width={bw - 6}
              height={H - 20 - y(val(r, "spend"))}
              fill={r.actual !== null ? "#2563eb" : "url(#spend-hatch)"}
            >
              <title>{`${monthLabel(r.month)}: ${r.actual !== null ? "actual" : "forecast"} ${f.money(r.spend)}, budget ${f.money(r.budget)}`}</title>
            </rect>
            <text
              x={pad + i * bw + bw / 2}
              y={H - 6}
              fontSize={9}
              textAnchor="middle"
              fill="currentColor"
            >
              {monthLabel(r.month)}
            </text>
          </g>
        ))}
        <path d={line} fill="none" stroke="#b7791f" strokeWidth={2} />
        <text x={2} y={y(max) + 3} fontSize={9} fill="currentColor">
          {f.money(max)}
        </text>
      </svg>
      <BlockNote>
        Actuals through {f.date(data.actuals_through)}; later months are forecast.{" "}
        {config.cumulative ? "Cumulative." : "Monthly."}
      </BlockNote>
    </div>
  );
}
registerBlock({
  key: "spend_profile",
  version: 1,
  name: "Spend profile",
  category: "budget",
  description: "Monthly phased budget vs actual vs forecast.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: spendSchema,
  defaultConfig: { months_back: 6, months_ahead: 6, cumulative: false },
  Renderer: Spend,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- budget_movers
interface MoverRow {
  id: string;
  code: string;
  name: string;
  budget: number | null;
  eac: number | null;
  variance: number | null;
  variance_pct: number | null;
  change_period: number | null;
}
const moversSchema = z.object({ limit: z.number().int().min(1).max(20).default(5) });
function Movers({
  data,
}: {
  data: { overspend: MoverRow[]; movers: MoverRow[] };
  config: z.infer<typeof moversSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Biggest overspend
        </h4>
        <Table
          rows={data.overspend}
          rowKey={(r) => r.id}
          empty="No project forecasts an overspend."
          cols={[
            { key: "p", header: "Project", cell: (r) => `${r.code} ${r.name}` },
            {
              key: "v",
              header: "Over",
              align: "right",
              cell: (r) => `${f.signedMoney(r.variance)} (${f.pct(r.variance_pct)})`,
            },
          ]}
        />
      </div>
      <div>
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Biggest movers this period
        </h4>
        <Table
          rows={data.movers}
          rowKey={(r) => r.id}
          empty="No forecast moved since the last month-end."
          cols={[
            { key: "p", header: "Project", cell: (r) => `${r.code} ${r.name}` },
            {
              key: "m",
              header: "Moved",
              align: "right",
              cell: (r) => f.signedMoney(r.change_period),
            },
          ]}
        />
      </div>
    </div>
  );
}
registerBlock({
  key: "budget_movers",
  version: 1,
  name: "Budget movers",
  category: "budget",
  description: "Biggest overspends and biggest forecast movements.",
  supportedScopes: [...MULTI],
  perEntity: false,
  configSchema: moversSchema,
  defaultConfig: { limit: 5 },
  exposedMetrics: ["budget_variance_abs", "budget_change_period"],
  Renderer: Movers,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- resource_summary
interface Person {
  id: string;
  name: string;
  role: string | null;
  projects: string | null;
  booked_here: number | null;
  booked_all: number | null;
  capacity: number;
  over: boolean;
  unfilled: boolean;
}
function Resources({
  data,
}: {
  data: { people: Person[]; over_allocated: number; unfilled: number; team_size: number };
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="People booked" value={data.people.filter((p) => !p.unfilled).length} />
        <Stat
          label="Over-allocated"
          value={data.over_allocated}
          tone={data.over_allocated ? "bad" : "good"}
        />
        <Stat label="Unfilled roles" value={data.unfilled} tone={data.unfilled ? "warn" : "good"} />
      </div>
      <Table
        rows={data.people}
        rowKey={(r) => r.id}
        caption="Bookings over the next four weeks"
        empty="No one is booked."
        cols={[
          {
            key: "n",
            header: "Person / role",
            cell: (r) => (
              <span>
                {r.name}
                {r.unfilled && (
                  <span className="ml-1 text-xs text-health-warn-foreground">unfilled</span>
                )}
              </span>
            ),
          },
          { key: "p", header: "Projects", cell: (r) => r.projects ?? "—" },
          { key: "h", header: "Here h/wk", align: "right", cell: (r) => r.booked_here ?? 0 },
          {
            key: "a",
            header: "All h/wk",
            align: "right",
            cell: (r) => (
              <span className={r.over ? "font-semibold text-health-bad-foreground" : ""}>
                {r.booked_all ?? 0} / {r.capacity}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
registerBlock({
  key: "resource_summary",
  version: 1,
  name: "Resource summary",
  category: "resources",
  description:
    "Bookings vs capacity, over-allocated people and unfilled roles. Names people, so hidden from partners.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: noConfig,
  defaultConfig: {},
  Renderer: Resources,
  partnerSafe: false,
  phase: 2,
});

// ---------------------------------------------------------------- decisions_taken
interface TakenRow {
  id: string;
  ref: string;
  title: string;
  decision_date: string;
  rationale: string | null;
  chosen_option: string | null;
  project_code: string | null;
}
function Taken({
  data,
}: {
  data: { since: string; rows: TakenRow[] };
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <div className="space-y-1">
      <Table
        rows={data.rows}
        rowKey={(r) => r.id}
        caption="Decisions made since the last meeting"
        empty="No decisions recorded since the last meeting."
        cols={[
          {
            key: "r",
            header: "Decision",
            cell: (r) => (
              <span>
                <span className="text-muted-foreground">{r.ref}</span> {r.title}
              </span>
            ),
          },
          {
            key: "o",
            header: "Outcome",
            cell: (r) => (
              <span>
                <strong>{r.chosen_option ?? "—"}</strong>
                {r.rationale && (
                  <span className="block text-xs text-muted-foreground">{r.rationale}</span>
                )}
              </span>
            ),
          },
          { key: "d", header: "Date", cell: (r) => f.date(r.decision_date) },
        ]}
      />
      <BlockNote>Since {f.date(data.since)}.</BlockNote>
    </div>
  );
}
registerBlock({
  key: "decisions_taken",
  version: 1,
  name: "Decisions taken",
  category: "decisions",
  description: "Decisions made since the forum's previous meeting.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: noConfig,
  defaultConfig: {},
  Renderer: Taken,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- risk_heatmap
interface HeatData {
  matrix: {
    name: string;
    bands: RiskBand[];
    likelihood: Array<{ value: number; label: string }> | null;
    consequence: Array<{ value: number; label: string }> | null;
  };
  cells: Array<{
    l: number;
    c: number;
    score: number;
    band: string;
    colour: string;
    count: number;
  }>;
  total: number;
}
function Heatmap({ data }: { data: HeatData; config: Record<string, never>; ctx: RenderContext }) {
  const label = (list: Array<{ value: number; label: string }> | null, v: number) =>
    list?.find((x) => x.value === v)?.label ?? String(v);
  return (
    <div className="space-y-2">
      <table
        className="border-collapse text-xs"
        aria-label={`${data.matrix.name} risk heatmap, ${data.total} open risks`}
      >
        <tbody>
          {[5, 4, 3, 2, 1].map((l) => (
            <tr key={l}>
              <th scope="row" className="pr-2 text-right font-normal text-muted-foreground">
                {label(data.matrix.likelihood, l)}
              </th>
              {[1, 2, 3, 4, 5].map((c) => {
                const cell = data.cells.find((x) => x.l === l && x.c === c);
                return (
                  <td
                    key={c}
                    className="size-12 border border-background text-center font-semibold"
                    style={{
                      backgroundColor: `${cell?.colour ?? "#e5e7eb"}${cell?.count ? "cc" : "33"}`,
                    }}
                    title={`Likelihood ${l} × consequence ${c} = ${cell?.score}: ${cell?.count ?? 0} risks`}
                  >
                    {cell?.count ? cell.count : ""}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td />
            {[1, 2, 3, 4, 5].map((c) => (
              <th key={c} scope="col" className="px-1 pt-1 font-normal text-muted-foreground">
                {label(data.matrix.consequence, c)}
              </th>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Likelihood (rows) × consequence (columns) on the {data.matrix.name} matrix. Bands:{" "}
        {data.matrix.bands.map((b) => `${b.label} ${b.min}–${b.max}`).join(", ")}.
      </p>
    </div>
  );
}
registerBlock({
  key: "risk_heatmap",
  version: 1,
  name: "Risk heatmap",
  category: "raid",
  description: "Open risks on the organisation's risk matrix.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: noConfig,
  defaultConfig: {},
  Renderer: Heatmap,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- escalations
interface EscRow {
  kind: string;
  id: string;
  ref: string | null;
  title: string;
  project_code: string | null;
  escalated_at: string | null;
  rating: string | null;
}
const escSchema = z.object({ include_decisions: z.boolean().default(true) });
function Escalations({
  data,
}: {
  data: { rows: EscRow[] };
  config: z.infer<typeof escSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => r.id}
      caption="Escalated to this forum"
      empty="Nothing is escalated to this forum."
      cols={[
        {
          key: "k",
          header: "",
          cell: (r) => <span className="text-xs uppercase text-muted-foreground">{r.kind}</span>,
        },
        {
          key: "t",
          header: "Item",
          cell: (r) => (
            <span>
              <span className="text-muted-foreground">{r.ref}</span> {r.title}{" "}
              <span className="text-xs text-muted-foreground">{r.project_code}</span>
            </span>
          ),
        },
        { key: "r", header: "Rating", cell: (r) => r.rating ?? "—" },
        { key: "d", header: "Escalated", cell: (r) => f.date(r.escalated_at?.slice(0, 10)) },
      ]}
    />
  );
}
registerBlock({
  key: "escalations",
  version: 1,
  name: "Escalations",
  category: "raid",
  description: "Risks, issues and decisions escalated to this forum.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: false,
  configSchema: escSchema,
  defaultConfig: { include_decisions: true },
  exposedMetrics: ["escalations_for_forum"],
  Renderer: Escalations,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- dependencies
interface DepRow {
  id: string;
  ref: string;
  description: string;
  type: string;
  criticality: string;
  need_by: string;
  forecast: string | null;
  health: string | null;
  at_risk: boolean;
  direction: string;
  giver: string | null;
  receiver: string | null;
  external: boolean;
}
const depSchema = z.object({
  external_only: z.boolean().default(false),
  at_risk_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(25),
});
function Dependencies({
  data,
  ctx,
}: {
  data: { rows: DepRow[] };
  config: z.infer<typeof depSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => r.id}
      caption="Dependencies in and out of scope"
      empty="No open dependencies."
      cols={[
        {
          key: "d",
          header: "Direction",
          cell: (r) =>
            r.direction === "in" ? "Incoming" : r.direction === "out" ? "Outgoing" : "Internal",
        },
        {
          key: "w",
          header: "Dependency",
          cell: (r) => (
            <span>
              <span className="text-muted-foreground">{r.ref}</span> {r.giver} → {r.receiver}
              <span className="block text-xs text-muted-foreground">{r.description}</span>
            </span>
          ),
        },
        { key: "n", header: "Need by", cell: (r) => f.date(r.need_by) },
        {
          key: "f",
          header: "Forecast",
          cell: (r) => (
            <span
              className={
                r.forecast && r.forecast > r.need_by
                  ? "font-semibold text-health-bad-foreground"
                  : ""
              }
            >
              {f.date(r.forecast)}
            </span>
          ),
        },
        {
          key: "h",
          header: "Health",
          cell: (r) => <RatingChip scheme={ctx.scheme} value={r.health} size="sm" />,
        },
      ]}
    />
  );
}
registerBlock({
  key: "dependencies",
  version: 1,
  name: "Dependencies",
  category: "dependencies",
  description: "Dependencies in and out of scope: at-risk flag, need-by vs forecast.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: depSchema,
  defaultConfig: { external_only: false, at_risk_only: false, limit: 25 },
  exposedMetrics: ["at_risk_dependencies"],
  Renderer: Dependencies,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- benefits_summary
interface BenefitRow {
  id: string;
  ref: string;
  title: string;
  category: string | null;
  planned_total_value: number | null;
  realised_value: number | null;
  realised_percent: number | null;
  behind_profile: boolean | null;
  health: string | null;
  status: string;
}
const benefitsSchema = z.object({ categories: z.array(z.string()).default([]) });
function Benefits({
  data,
  ctx,
}: {
  data: {
    rows: BenefitRow[];
    planned: number | null;
    realised: number | null;
    capabilities: Counts | null;
    outcomes: Counts | null;
  };
  config: z.infer<typeof benefitsSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const ragLine = (label: string, counts: Counts | null) =>
    counts ? (
      <p className="text-xs">
        {label}:{" "}
        {(["green", "amber", "red", "not_set"] as const)
          .filter((k) => counts[k])
          .map((k) => `${counts[k]} ${levelFor(ctx.scheme, k)?.label ?? k}`)
          .join(", ")}
      </p>
    ) : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Planned value" value={f.money(data.planned)} />
        <Stat label="Realised to date" value={f.money(data.realised)} />
      </div>
      <Table
        rows={data.rows}
        rowKey={(r) => r.id}
        caption="Benefits"
        empty="No benefits linked to these projects."
        cols={[
          {
            key: "t",
            header: "Benefit",
            cell: (r) => (
              <span>
                <span className="text-muted-foreground">{r.ref}</span> {r.title}
                <span className="block text-xs text-muted-foreground">
                  {r.category ?? ""} · {cap(r.status)}
                </span>
              </span>
            ),
          },
          {
            key: "p",
            header: "Planned",
            align: "right",
            cell: (r) => f.money(r.planned_total_value),
          },
          {
            key: "r",
            header: "Realised",
            align: "right",
            cell: (r) =>
              `${f.money(r.realised_value)}${r.realised_percent !== null ? ` (${Math.round(Number(r.realised_percent))}%)` : ""}`,
          },
          {
            key: "h",
            header: "Health",
            cell: (r) => <RatingChip scheme={ctx.scheme} value={r.health} size="sm" />,
          },
        ]}
      />
      {ragLine("Capabilities", data.capabilities)}
      {ragLine("Outcomes", data.outcomes)}
    </div>
  );
}
registerBlock({
  key: "benefits_summary",
  version: 1,
  name: "Benefits summary",
  category: "benefits",
  description: "Benefits planned vs realised with health; capability and outcome ratings.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: benefitsSchema,
  defaultConfig: { categories: [] },
  exposedMetrics: ["benefits_rating"],
  Renderer: Benefits,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- requests_pipeline
interface ReqRow {
  id: string;
  ref: string;
  title: string;
  status: string;
  estimated_cost: number | null;
  priority: string | null;
  sponsor: string | null;
}
const reqSchema = z.object({ limit: z.number().int().min(1).max(50).default(20) });
function Requests({
  data,
}: {
  data: { rows: ReqRow[] };
  config: z.infer<typeof reqSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <Table
      rows={data.rows}
      rowKey={(r) => r.id}
      caption="Requests awaiting this forum"
      empty="No requests in the pipeline."
      cols={[
        {
          key: "t",
          header: "Request",
          cell: (r) => (
            <span>
              <span className="text-muted-foreground">{r.ref}</span> {r.title}
            </span>
          ),
        },
        { key: "s", header: "Status", cell: (r) => cap(r.status) },
        { key: "p", header: "Priority", cell: (r) => cap(r.priority) },
        {
          key: "c",
          header: "Estimated cost",
          align: "right",
          cell: (r) => f.money(r.estimated_cost),
        },
        { key: "o", header: "Sponsor", cell: (r) => r.sponsor ?? "—" },
      ]}
    />
  );
}
registerBlock({
  key: "requests_pipeline",
  version: 1,
  name: "Requests pipeline",
  category: "requests",
  description: "New project, funding and resource requests awaiting a decision.",
  supportedScopes: ["portfolio", "custom"],
  perEntity: false,
  configSchema: reqSchema,
  defaultConfig: { limit: 20 },
  Renderer: Requests,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- actions_log
interface ActionRow {
  source: string;
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  closed_at: string | null;
  owner: string | null;
  project_code: string | null;
  overdue?: boolean;
}
function Actions({
  data,
}: {
  data: { since: string; open: ActionRow[]; closed: ActionRow[]; overdue_count: number };
  config: Record<string, never>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const cols = [
    {
      key: "t",
      header: "Action",
      cell: (r: ActionRow) => (
        <span>
          {r.title}
          {r.project_code && (
            <span className="ml-1 text-xs text-muted-foreground">{r.project_code}</span>
          )}
        </span>
      ),
    },
    { key: "o", header: "Owner", cell: (r: ActionRow) => r.owner ?? "—" },
    {
      key: "d",
      header: "Due",
      cell: (r: ActionRow) => (
        <span className={r.overdue ? "font-semibold text-health-bad-foreground" : ""}>
          {f.date(r.due_date)}
          {r.overdue && " (overdue)"}
        </span>
      ),
    },
  ];
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {data.open.length} open, {data.overdue_count} overdue, {data.closed.length} closed since{" "}
        {f.date(data.since)}.
      </p>
      <Table
        rows={data.open}
        rowKey={(r) => r.id}
        caption="Open actions"
        empty="No open actions."
        cols={cols}
      />
      {data.closed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Closed since the last meeting
          </summary>
          <Table rows={data.closed} rowKey={(r) => r.id} cols={cols} />
        </details>
      )}
    </div>
  );
}
registerBlock({
  key: "actions_log",
  version: 1,
  name: "Actions log",
  category: "governance",
  description: "Actions from previous meetings and decisions: open, overdue, closed since last.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: false,
  configSchema: noConfig,
  defaultConfig: {},
  Renderer: Actions,
  partnerSafe: true,
  phase: 2,
});

// ---------------------------------------------------------------- data_quality
interface DqRow {
  id: string;
  code: string;
  name: string;
  last_report: string | null;
  missing_report: boolean;
  stale_risks: number;
  missing_forecast: boolean;
  missing_baseline: boolean;
}
const dqSchema = z.object({ stale_days: z.number().int().min(7).max(180).default(30) });
function DataQuality({
  data,
}: {
  data: { since: string; stale_days: number; rows: DqRow[]; clean: number };
  config: z.infer<typeof dqSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  return (
    <div className="space-y-1">
      <Table
        rows={data.rows}
        rowKey={(r) => r.id}
        caption="Data quality"
        empty="Every project has a current highlight report, forecast and fresh risks."
        cols={[
          { key: "p", header: "Project", cell: (r) => `${r.code} ${r.name}` },
          {
            key: "h",
            header: "Highlight report",
            cell: (r) =>
              r.missing_report ? (
                <span className="text-health-bad-foreground">
                  Missing this cycle (last {f.date(r.last_report)})
                </span>
              ) : (
                "Submitted"
              ),
          },
          {
            key: "r",
            header: `Risks not updated ${data.stale_days}+ days`,
            align: "right",
            cell: (r) => r.stale_risks || "—",
          },
          { key: "f", header: "Forecast", cell: (r) => (r.missing_forecast ? "Missing" : "OK") },
          { key: "b", header: "Baseline", cell: (r) => (r.missing_baseline ? "Missing" : "OK") },
        ]}
      />
      <BlockNote>
        Cycle since {f.date(data.since)} (the previous meeting's papers deadline). {data.clean}{" "}
        projects have no gaps.
      </BlockNote>
    </div>
  );
}
registerBlock({
  key: "data_quality",
  version: 1,
  name: "Data quality",
  category: "assurance",
  description:
    "Missing highlight reports this cycle, stale risks, missing forecasts and baselines. Hidden from partners.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: dqSchema,
  defaultConfig: { stale_days: 30 },
  exposedMetrics: ["stale_update_days"],
  Renderer: DataQuality,
  partnerSafe: false,
  phase: 2,
});

// ---------------------------------------------------------------- approvals_status
interface ApprovalRow {
  id: string;
  name: string;
  gate_type: string;
  status: string;
  due_date: string | null;
  project_code: string;
  steps: Array<{
    order: number;
    role: string;
    decision: string | null;
    approver: string | null;
    comment: string | null;
  }> | null;
}
const approvalsSchema = z.object({ gate_types: z.array(z.string()).default([]) });
function Approvals({
  data,
}: {
  data: { rows: ApprovalRow[] };
  config: z.infer<typeof approvalsSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.rows.length) return <Empty>No approval gates in progress.</Empty>;
  return (
    <ul className="space-y-2">
      {data.rows.map((g) => (
        <li key={g.id} className="report-avoid-break rounded-md border p-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="font-medium">
              {g.project_code} · {g.name}{" "}
              <span className="text-xs text-muted-foreground">
                ({g.gate_type.replace(/_/g, " ").toUpperCase()})
              </span>
            </span>
            <span>
              {cap(g.status)}
              {g.due_date && ` · due ${f.date(g.due_date)}`}
            </span>
          </div>
          <ol className="mt-1 flex flex-wrap gap-2 text-xs">
            {(g.steps ?? []).map((s) => (
              <li key={s.order} className="rounded bg-muted px-2 py-0.5">
                {s.order}. {s.role}:{" "}
                {s.decision
                  ? `${cap(s.decision)}${s.approver ? ` by ${s.approver}` : ""}`
                  : "waiting"}
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
registerBlock({
  key: "approvals_status",
  version: 1,
  name: "Approvals status",
  category: "governance",
  description:
    "Approval gates of any type (QIA, clinical safety, business case stages) and their steps.",
  supportedScopes: [...ALL_SCOPES],
  perEntity: true,
  configSchema: approvalsSchema,
  defaultConfig: { gate_types: [] },
  Renderer: Approvals,
  partnerSafe: true,
  phase: 2,
});
