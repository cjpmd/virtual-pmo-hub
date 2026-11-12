// GL-14 Phase A blocks for funding packs: programme_coverage (projects and money per programme,
// with the pot against what is requested and awarded for a collection) and benefits_value
// (value metrics, by strategic objective, behind profile and overdue measurements). Shaping is
// in SQL (private.rb_programme_coverage, private.rb_benefits_value); these only render.
import { z } from "zod";
import { registerBlock } from "../registry";
import { BlockNote, Empty, Stat, Table, useReportFormat } from "../primitives";
import type { RenderContext } from "../types";

type Money = number | string | null;
const num = (value: Money) => (value === null || value === "" ? 0 : Number(value));

// ---------------------------------------------------------------- programme_coverage
export interface CoverageRow {
  programme_id: string | null;
  name: string;
  projects: number;
  budget: Money;
  forecast: Money;
}
/** Where a project's "requested" amount comes from (first that exists, in this order). */
export type RequestedSource = "business_case" | "request" | "budget";
export const REQUESTED_SOURCE_LABEL: Record<RequestedSource, string> = {
  business_case: "Business case",
  request: "Project request",
  budget: "Project budget",
};
const SOURCES: RequestedSource[] = ["business_case", "request", "budget"];
export interface RequestedRow {
  project_id: string;
  code: string;
  name: string;
  requested: Money;
  source: RequestedSource;
}
export interface CoverageData {
  currency: string;
  rows: CoverageRow[];
  totals: { projects: number; budget: Money; forecast: Money };
  collection: {
    name: string;
    pot: Money;
    requested: Money;
    /** Packs published before GL-14A's follow-up don't have these (requested = budgets). */
    requested_by_source?: Partial<Record<RequestedSource, { projects: number; amount: Money }>>;
    requested_rows?: RequestedRow[];
    awarded: Money;
    remaining: Money;
  } | null;
}

/** "From 1 business case, 1 project request and 2 project budgets", in source order. */
export function requestedNote(collection: NonNullable<CoverageData["collection"]>) {
  const by = collection.requested_by_source;
  if (!by) return "Budgets of the projects in the collection";
  const parts = SOURCES.filter((s) => by[s]?.projects).map((s) => {
    const n = by[s]!.projects;
    const label = REQUESTED_SOURCE_LABEL[s].toLowerCase();
    return `${n} ${n === 1 ? label : `${label}s`}`;
  });
  if (!parts.length) return "No projects in the collection";
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `From ${list}`;
}

/** "Over the pot by …" / "… left in the pot" for the requested total against the pot. */
export function potPosition(collection: NonNullable<CoverageData["collection"]>) {
  if (collection.pot === null || collection.pot === "") return null;
  const gap = num(collection.pot) - num(collection.requested);
  return { over: gap < 0, amount: Math.abs(gap) };
}

const coverageSchema = z.object({ show_forecast: z.boolean().default(true) });
function Coverage({
  data,
  config,
}: {
  data: CoverageData;
  config: z.infer<typeof coverageSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  const position = data.collection ? potPosition(data.collection) : null;
  const variance = num(data.totals.forecast) - num(data.totals.budget);
  return (
    <div className="space-y-3">
      {data.collection && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-pot>
          <Stat label="Pot" value={f.money(data.collection.pot)} />
          <Stat
            label="Requested"
            value={f.money(data.collection.requested)}
            note={requestedNote(data.collection)}
            tone={position?.over ? "bad" : undefined}
          />
          <Stat label="Awarded" value={f.money(data.collection.awarded ?? 0)} />
          <Stat
            label={position?.over ? "Over the pot" : "Left in the pot"}
            value={position ? f.money(position.amount) : "—"}
            note={
              data.collection.pot !== null && data.collection.pot !== ""
                ? `${f.money(data.collection.remaining)} after awards`
                : "No pot set for this collection"
            }
            tone={position?.over ? "bad" : position ? "good" : undefined}
          />
        </div>
      )}
      <Table
        rows={data.rows}
        rowKey={(r) => r.programme_id ?? "none"}
        caption="Programme coverage"
        empty="No projects in scope."
        cols={[
          { key: "n", header: "Programme", cell: (r) => r.name },
          { key: "p", header: "Projects", align: "right", cell: (r) => r.projects },
          { key: "b", header: "Budget", align: "right", cell: (r) => f.money(r.budget) },
          ...(config.show_forecast
            ? [
                {
                  key: "f",
                  header: "Forecast",
                  align: "right" as const,
                  cell: (r: CoverageRow) => f.money(r.forecast),
                },
              ]
            : []),
        ]}
      />
      {data.collection?.requested_rows && data.collection.requested_rows.length > 0 && (
        <Table
          rows={data.collection.requested_rows}
          rowKey={(r) => r.project_id}
          caption="Requested by project"
          cols={[
            {
              key: "n",
              header: "Project",
              cell: (r) => (
                <span>
                  <span className="text-muted-foreground">{r.code}</span> {r.name}
                </span>
              ),
            },
            { key: "r", header: "Requested", align: "right", cell: (r) => f.money(r.requested) },
            { key: "s", header: "From", cell: (r) => REQUESTED_SOURCE_LABEL[r.source] ?? r.source },
          ]}
        />
      )}
      {data.rows.length > 0 && (
        <BlockNote>
          {data.totals.projects} {data.totals.projects === 1 ? "project" : "projects"} ·{" "}
          {f.money(data.totals.budget)} budget
          {config.show_forecast &&
            ` · forecast ${f.money(Math.abs(variance))} ${variance > 0 ? "above" : "below"} budget`}
        </BlockNote>
      )}
    </div>
  );
}
export const _programme_coverage = registerBlock({
  key: "programme_coverage",
  version: 1,
  name: "Programme coverage",
  category: "budget",
  description:
    "Projects, budget and forecast per programme; for a collection, the pot against what is requested and awarded.",
  supportedScopes: ["programme", "portfolio", "custom", "collection"],
  perEntity: false,
  configSchema: coverageSchema,
  defaultConfig: { show_forecast: true },
  Renderer: Coverage,
  partnerSafe: true,
  phase: 4,
});

// ---------------------------------------------------------------- benefits_value
export interface BenefitsValueData {
  currency: string;
  benefits: number;
  planned: Money;
  realised: Money;
  percent: number;
  cash_releasing_realised: Money;
  cash_releasing_planned: Money;
  at_risk: number;
  disbenefit_value: Money;
  objectives: Array<{ id: string; name: string; planned: Money; realised: Money; count: number }>;
  behind_count: number;
  behind: Array<{
    id: string;
    ref: string;
    title: string;
    realised: Money;
    realised_percent: number | null;
  }>;
  overdue_count: number;
  overdue: Array<{
    id: string;
    ref: string;
    benefit: string;
    measure: string;
    next_due_date: string;
    days_overdue: number;
    owner: string | null;
  }>;
}

/** Width of an objective's realised bar, 0–100. */
export const realisedWidth = (planned: Money, realised: Money) =>
  Math.min(100, Math.round((num(realised) / Math.max(1, num(planned))) * 100));

const valueSchema = z.object({
  limit: z.number().int().min(1).max(20).default(5),
  objectives_limit: z.number().int().min(1).max(20).default(6),
});
function BenefitsValue({
  data,
}: {
  data: BenefitsValueData;
  config: z.infer<typeof valueSchema>;
  ctx: RenderContext;
}) {
  const f = useReportFormat();
  if (!data.benefits) return <Empty>No benefits linked to these projects.</Empty>;
  const more = (shown: number, total: number) =>
    total > shown ? <BlockNote>and {total - shown} more</BlockNote> : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Planned value" value={f.money(data.planned)} />
        <Stat label="Realised" value={f.money(data.realised)} tone="good" />
        <Stat label="% realised" value={`${data.percent}%`} />
        <Stat
          label="Cash-releasing realised"
          value={f.money(data.cash_releasing_realised)}
          note={`of ${f.money(data.cash_releasing_planned)} planned`}
        />
        <Stat
          label="Benefits at risk"
          value={data.at_risk}
          tone={data.at_risk ? "warn" : "good"}
          note="Low confidence or behind profile"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section aria-label="Benefits by strategic objective" className="space-y-2">
          <h4 className="text-sm font-semibold">By strategic objective</h4>
          {data.objectives.length ? (
            data.objectives.map((row) => (
              <div key={row.id} className="report-avoid-break">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="line-clamp-1">{row.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {f.money(row.realised)} of {f.money(row.planned)}
                  </span>
                </div>
                <div
                  className="mt-1 h-2 rounded-full bg-muted"
                  role="img"
                  aria-label={`${realisedWidth(row.planned, row.realised)}% realised`}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${realisedWidth(row.planned, row.realised)}%` }}
                  />
                </div>
              </div>
            ))
          ) : (
            <Empty>No quantified benefits linked to an objective.</Empty>
          )}
        </section>
        <section aria-label="Benefit exceptions" className="space-y-2">
          <h4 className="text-sm font-semibold">Behind profile</h4>
          {data.behind.length ? (
            <ul className="space-y-1 text-sm">
              {data.behind.map((b) => (
                <li key={b.id}>
                  <span className="text-muted-foreground">{b.ref}</span> {b.title}{" "}
                  <span className="text-muted-foreground">
                    ({b.realised_percent ?? 0}% realised, {f.money(b.realised)})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>None behind profile.</Empty>
          )}
          {more(data.behind.length, data.behind_count)}
          <h4 className="pt-2 text-sm font-semibold">Measurements overdue</h4>
          {data.overdue.length ? (
            <ul className="space-y-1 text-sm">
              {data.overdue.map((m) => (
                <li key={m.id}>
                  <span className="text-muted-foreground">{m.ref}</span> {m.measure}{" "}
                  <span className="text-muted-foreground">
                    ({m.days_overdue} {m.days_overdue === 1 ? "day" : "days"} overdue,{" "}
                    {m.owner || "unowned"})
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>All measurements are up to date.</Empty>
          )}
          {more(data.overdue.length, data.overdue_count)}
        </section>
      </div>
      {num(data.disbenefit_value) > 0 && (
        <BlockNote>
          Disbenefits planned: {f.money(data.disbenefit_value)} (not netted off).
        </BlockNote>
      )}
    </div>
  );
}
export const _benefits_value = registerBlock({
  key: "benefits_value",
  version: 1,
  name: "Benefits value",
  category: "benefits",
  description:
    "Planned and realised value, cash-releasing, at risk, by strategic objective, benefits behind profile and overdue measurements.",
  supportedScopes: ["project", "programme", "portfolio", "custom", "collection"],
  perEntity: true,
  configSchema: valueSchema,
  defaultConfig: { limit: 5, objectives_limit: 6 },
  Renderer: BenefitsValue,
  partnerSafe: true,
  phase: 4,
});
