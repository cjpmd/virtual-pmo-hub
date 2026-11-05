// Status blocks: overall_status, health_by_dimension, project_status_grid.
import { z } from "zod";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { registerBlock } from "../registry";
import {
  BlockNote,
  Empty,
  RatingChip,
  RatingMove,
  StackedBar,
  Table,
  days,
  levelFor,
  useReportFormat,
} from "../primitives";
import type { RenderContext } from "../types";

// ---------------------------------------------------------------- overall_status
interface OverallProject {
  mode: "project";
  declared: string;
  evidenced: string;
  divergence_days: number;
  rating_rank_delta: number | null;
  divergence_alert: boolean | null;
  justified: boolean | null;
  justification: string | null;
  last_report_date: string | null;
  report_overdue: boolean | null;
  trend: Array<{ month: string; rating: string }>;
}
interface OverallScope {
  mode: "scope";
  declared: string | null;
  evidenced: string | null;
  rationale: string | null;
  counts: { green: number; amber: number; red: number; not_set: number };
  divergent: number;
}
type OverallData = OverallProject | OverallScope;

const overallSchema = z.object({
  show_evidence: z.boolean().default(true),
  show_trend: z.boolean().default(true),
  months: z.number().int().min(3).max(12).default(6),
});
type OverallConfig = z.infer<typeof overallSchema>;

function Trend({
  ctx,
  points,
}: {
  ctx: RenderContext;
  points: Array<{ month: string; rating: string }>;
}) {
  if (!points.length) return null;
  const w = 18;
  return (
    <svg
      role="img"
      aria-label={`Evidenced rating by month: ${points.map((p) => `${p.month} ${levelFor(ctx.scheme, p.rating)?.label ?? p.rating}`).join(", ")}`}
      viewBox={`0 0 ${points.length * w} 22`}
      className="h-6"
      style={{ width: points.length * w }}
    >
      <title>Evidenced rating trend</title>
      {points.map((point, i) => (
        <g key={point.month}>
          <rect
            x={i * w + 2}
            y={2}
            width={w - 4}
            height={12}
            rx={2}
            fill={levelFor(ctx.scheme, point.rating)?.colour ?? "#d1d5db"}
          />
          <text x={i * w + w / 2} y={21} fontSize={5} textAnchor="middle" fill="currentColor">
            {point.month.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Overall({
  data,
  config,
  ctx,
}: {
  data: OverallData;
  config: OverallConfig;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const move = ctx.entityId ? ctx.movement?.[ctx.entityId] : undefined;
  if (data.mode === "scope") {
    const parts = (["green", "amber", "red", "not_set"] as const).map((rag) => ({
      key: rag,
      value: data.counts[rag],
      colour: levelFor(ctx.scheme, rag)?.colour ?? "#d1d5db",
      label: levelFor(ctx.scheme, rag)?.label ?? rag,
    }));
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <RatingChip scheme={ctx.scheme} value={data.declared} prefix="Declared" size="lg" />
          {config.show_evidence && data.evidenced && (
            <RatingChip scheme={ctx.scheme} value={data.evidenced} prefix="Evidenced" size="lg" />
          )}
        </div>
        {data.rationale && <p className="text-sm leading-6">{data.rationale}</p>}
        <div>
          <StackedBar parts={parts} label="Projects by evidenced rating" />
          <p className="mt-1 text-xs text-muted-foreground">
            {parts.map((p) => `${p.label} ${p.value}`).join(" · ")}
            {data.divergent > 0 && ` · ${data.divergent} reporting better than the evidence`}
          </p>
        </div>
      </div>
    );
  }
  const better = (data.rating_rank_delta ?? 0) > 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <RatingChip scheme={ctx.scheme} value={data.declared} prefix="Declared" size="lg" />
        <RatingMove scheme={ctx.scheme} from={move?.declared?.from} to={move?.declared?.to} />
        {config.show_evidence && (
          <>
            <RatingChip scheme={ctx.scheme} value={data.evidenced} prefix="Evidenced" size="lg" />
            <RatingMove scheme={ctx.scheme} from={move?.evidenced?.from} to={move?.evidenced?.to} />
          </>
        )}
      </div>
      {config.show_evidence && better && (
        <p
          role="note"
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            data.divergence_alert
              ? "border-health-bad/40 bg-health-bad/10 text-health-bad-foreground"
              : "border-health-warn/40 bg-health-warn/10 text-health-warn-foreground",
          )}
        >
          Declared better than the evidence for {days(data.divergence_days)}.
          {data.justified && data.justification && ` Justification: ${data.justification}`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Last highlight report {f.date(data.last_report_date)}
        {data.report_overdue && " · next report overdue"}
      </p>
      {config.show_trend && <Trend ctx={ctx} points={data.trend} />}
    </div>
  );
}

export const _overall_status = registerBlock<OverallConfig, OverallData>({
  key: "overall_status",
  version: 1,
  name: "Overall status",
  category: "status",
  description: "Declared vs evidenced rating with a divergence alert and trend.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: overallSchema,
  defaultConfig: { show_evidence: true, show_trend: true, months: 6 },
  exposedMetrics: ["declared_rating", "evidenced_rating", "divergence_days"],
  Renderer: Overall,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- health_by_dimension
const DIMENSIONS = ["schedule", "financial", "effort", "issue", "benefit", "overall"] as const;
const DIM_LABEL: Record<(typeof DIMENSIONS)[number], string> = {
  schedule: "Schedule",
  financial: "Financial",
  effort: "Effort",
  issue: "RAID",
  benefit: "Benefits",
  overall: "Overall",
};

interface HealthProject {
  mode: "project";
  months: Array<{
    month: string;
    evidenced: Record<string, string>;
    declared: Record<string, string> | null;
  }>;
  current: Record<string, string> | null;
}
interface HealthScope {
  mode: "scope";
  dimensions: Array<{
    dimension: string;
    green: number;
    amber: number;
    red: number;
    not_set: number;
  }>;
}

const healthSchema = z.object({ months: z.number().int().min(3).max(12).default(6) });

function Cell({
  ctx,
  value,
  label,
}: {
  ctx: RenderContext;
  value: string | undefined;
  label: string;
}) {
  const level = levelFor(ctx.scheme, value);
  return (
    <td className="px-0.5 py-0.5">
      <span
        className="flex h-6 min-w-8 items-center justify-center rounded text-[10px] font-semibold"
        style={{ backgroundColor: level ? `${level.colour}33` : undefined, color: "inherit" }}
        title={`${label}: ${level?.label ?? "Not set"}`}
      >
        {level ? level.label.slice(0, 1) : "–"}
        <span className="sr-only">{level?.label ?? "Not set"}</span>
      </span>
    </td>
  );
}

function Health({
  data,
  ctx,
}: {
  data: HealthProject | HealthScope;
  config: { months: number };
  ctx: RenderContext;
}) {
  if (data.mode === "scope")
    return (
      <div className="space-y-2">
        {data.dimensions.map((row) => {
          const parts = (["green", "amber", "red", "not_set"] as const).map((rag) => ({
            key: rag,
            value: row[rag],
            colour: levelFor(ctx.scheme, rag)?.colour ?? "#d1d5db",
            label: levelFor(ctx.scheme, rag)?.label ?? rag,
          }));
          const name = DIM_LABEL[row.dimension as keyof typeof DIM_LABEL] ?? row.dimension;
          return (
            <div
              key={row.dimension}
              className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm"
            >
              <span>{name}</span>
              <StackedBar parts={parts} label={`${name} health across projects`} />
              <span className="text-xs text-muted-foreground pmo-num">
                {parts
                  .filter((p) => p.value)
                  .map((p) => `${p.value} ${p.label}`)
                  .join(", ")}
              </span>
            </div>
          );
        })}
      </div>
    );
  if (!data.months.length && !data.current) return <Empty>No health history yet.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm">
        <caption className="sr-only">Evidenced health by dimension and month</caption>
        <thead>
          <tr className="text-[11px] text-muted-foreground">
            <th className="pr-3 text-left font-medium">Dimension</th>
            {data.months.map((m) => (
              <th key={m.month} className="px-0.5 font-medium">
                {m.month.slice(2).replace("-", "/")}
              </th>
            ))}
            <th className="px-0.5 font-medium">Now</th>
          </tr>
        </thead>
        <tbody>
          {DIMENSIONS.map((dim) => (
            <tr key={dim}>
              <th scope="row" className="pr-3 text-left font-normal">
                {DIM_LABEL[dim]}
              </th>
              {data.months.map((m) => (
                <Cell
                  key={m.month}
                  ctx={ctx}
                  value={m.evidenced[dim]}
                  label={`${DIM_LABEL[dim]} ${m.month}`}
                />
              ))}
              <Cell ctx={ctx} value={data.current?.[dim]} label={`${DIM_LABEL[dim]} now`} />
            </tr>
          ))}
        </tbody>
      </table>
      <BlockNote>
        Evidenced from the data at each month-end; letters are the first letter of the rating.
      </BlockNote>
    </div>
  );
}

export const _health_by_dimension = registerBlock<{ months: number }, HealthProject | HealthScope>({
  key: "health_by_dimension",
  version: 1,
  name: "Health by dimension",
  category: "status",
  description:
    "Schedule, financial, effort, RAID, benefits and overall by month (one project) or across projects.",
  supportedScopes: ["project", "programme", "portfolio", "custom"],
  perEntity: true,
  configSchema: healthSchema,
  defaultConfig: { months: 6 },
  exposedMetrics: ["dimension_red_count"],
  Renderer: Health,
  partnerSafe: true,
  phase: 1,
});

// ---------------------------------------------------------------- project_status_grid
interface GridRow {
  id: string;
  code: string;
  name: string;
  programme_name: string;
  manager: string | null;
  phase: string | null;
  state: string;
  declared: string;
  evidenced: string;
  schedule: string | null;
  financial: string | null;
  effort: string | null;
  issue: string | null;
  benefit: string | null;
  divergence_days: number | null;
  forecast_finish_date: string | null;
  finish_vs_baseline_days: number | null;
  budget_variance_pct: number | null;
  percent_complete: number | null;
  inclusion: "rule" | "pinned" | "excluded" | null;
  reasons: Array<{ label: string }>;
}
interface GridData {
  group_by: string;
  rows: GridRow[];
  total: number;
}

const gridSchema = z.object({
  only_exceptions: z.boolean().default(false),
  group_by: z.enum(["programme", "none"]).default("programme"),
  sort: z.enum(["name", "rating", "code"]).default("name"),
  columns: z
    .array(z.enum(["manager", "phase", "dimensions", "finish", "budget", "divergence", "complete"]))
    .default(["manager", "dimensions", "finish", "budget"]),
});
type GridConfig = z.infer<typeof gridSchema>;

function Grid({ data, config, ctx }: { data: GridData; config: GridConfig; ctx: RenderContext }) {
  const f = useReportFormat();
  const show = (col: GridConfig["columns"][number]) => config.columns.includes(col);
  const dim = (value: string | null, label: string) => {
    const level = levelFor(ctx.scheme, value);
    return (
      <span
        title={`${label}: ${level?.label ?? "Not set"}`}
        className="inline-block size-3 rounded-full border"
        style={{ backgroundColor: level?.colour ?? "transparent" }}
      >
        <span className="sr-only">
          {label} {level?.label ?? "Not set"}
        </span>
      </span>
    );
  };
  return (
    <div className="space-y-2">
      <Table
        rows={data.rows}
        rowKey={(row) => row.id}
        caption="Projects in scope"
        empty={
          config.only_exceptions
            ? "No projects are reported by exception."
            : "No projects in scope."
        }
        {...(config.group_by === "programme" && { group: (row: GridRow) => row.programme_name })}
        cols={[
          {
            key: "project",
            header: "Project",
            cell: (row) => (
              <div>
                <span className="font-medium">{row.name}</span>{" "}
                <span className="text-xs text-muted-foreground">{row.code}</span>
                {row.inclusion && row.inclusion !== "excluded" && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {row.reasons.slice(0, 3).map((reason) => (
                      <span key={reason.label} className="rounded bg-muted px-1.5 text-[10px]">
                        {reason.label}
                      </span>
                    ))}
                    {row.inclusion === "pinned" && (
                      <span className="rounded bg-primary/10 px-1.5 text-[10px] text-primary">
                        Pinned
                      </span>
                    )}
                  </div>
                )}
              </div>
            ),
          },
          ...(show("manager")
            ? [{ key: "manager", header: "Manager", cell: (row: GridRow) => row.manager ?? "—" }]
            : []),
          ...(show("phase")
            ? [{ key: "phase", header: "Phase", cell: (row: GridRow) => row.phase ?? "—" }]
            : []),
          {
            key: "declared",
            header: "Declared",
            cell: (row) => (
              <>
                <RatingChip scheme={ctx.scheme} value={row.declared} size="sm" />
                <RatingMove
                  scheme={ctx.scheme}
                  from={ctx.movement?.[row.id]?.declared?.from}
                  to={ctx.movement?.[row.id]?.declared?.to}
                />
              </>
            ),
          },
          {
            key: "evidenced",
            header: "Evidenced",
            cell: (row) => (
              <>
                <RatingChip scheme={ctx.scheme} value={row.evidenced} size="sm" />
                <RatingMove
                  scheme={ctx.scheme}
                  from={ctx.movement?.[row.id]?.evidenced?.from}
                  to={ctx.movement?.[row.id]?.evidenced?.to}
                />
              </>
            ),
          },
          ...(show("dimensions")
            ? [
                {
                  key: "dims",
                  header: "S F E R B",
                  cell: (row: GridRow) => (
                    <span className="inline-flex gap-1">
                      {dim(row.schedule, "Schedule")}
                      {dim(row.financial, "Financial")}
                      {dim(row.effort, "Effort")}
                      {dim(row.issue, "RAID")}
                      {dim(row.benefit, "Benefits")}
                    </span>
                  ),
                },
              ]
            : []),
          ...(show("divergence")
            ? [
                {
                  key: "div",
                  header: "Divergence",
                  align: "right" as const,
                  cell: (row: GridRow) => (row.divergence_days ? days(row.divergence_days) : "—"),
                },
              ]
            : []),
          ...(show("finish")
            ? [
                {
                  key: "finish",
                  header: "Forecast finish",
                  cell: (row: GridRow) => (
                    <span>
                      {f.date(row.forecast_finish_date)}
                      {row.finish_vs_baseline_days ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({row.finish_vs_baseline_days > 0 ? "+" : ""}
                          {row.finish_vs_baseline_days}d)
                        </span>
                      ) : null}
                    </span>
                  ),
                },
              ]
            : []),
          ...(show("budget")
            ? [
                {
                  key: "budget",
                  header: "Variance",
                  align: "right" as const,
                  cell: (row: GridRow) => f.pct(row.budget_variance_pct),
                },
              ]
            : []),
          ...(show("complete")
            ? [
                {
                  key: "pc",
                  header: "% done",
                  align: "right" as const,
                  cell: (row: GridRow) => `${row.percent_complete ?? 0}%`,
                },
              ]
            : []),
          ...(ctx.onPinProject
            ? [
                {
                  key: "dd",
                  header: "Deep dive",
                  cell: (row: GridRow) => {
                    const isIn = row.inclusion === "pinned" || row.inclusion === "rule";
                    return (
                      <Checkbox
                        checked={isIn}
                        aria-label={`${isIn ? "Remove" : "Add"} ${row.code} from deep dives`}
                        onCheckedChange={() => ctx.onPinProject!(row.id, !isIn)}
                      />
                    );
                  },
                },
              ]
            : []),
        ]}
      />
      {config.only_exceptions && (
        <BlockNote>
          Showing {data.rows.length} of {data.total} projects: those reported by exception or
          pinned.
        </BlockNote>
      )}
    </div>
  );
}

export const _project_status_grid = registerBlock<GridConfig, GridData>({
  key: "project_status_grid",
  version: 1,
  name: "Project status grid",
  category: "status",
  description:
    "Every project in scope grouped by programme: declared vs evidenced, dimensions, finish, variance.",
  supportedScopes: ["programme", "portfolio", "custom"],
  perEntity: false,
  configSchema: gridSchema,
  defaultConfig: {
    only_exceptions: false,
    group_by: "programme",
    sort: "name",
    columns: ["manager", "dimensions", "finish", "budget"],
  },
  Renderer: Grid,
  partnerSafe: true,
  phase: 1,
});
