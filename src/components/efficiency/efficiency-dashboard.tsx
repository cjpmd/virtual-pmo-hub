// Efficiency / savings programme dashboard (NHS-4 part 4, docs/nhs-module-plan.md § NHS-4 item 8):
// target against plan, risk-adjusted value, forecast outturn and actuals for a financial year; the
// cumulative position by month; by organisational unit and by category; recurrent share; pipeline
// value by stage; and the schemes off track. Every figure comes from the database
// (public.efficiency_summary and the "schemes at risk" report block's function); this only lays
// them out.
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { CumulativeArea } from "@/components/charts/plots";
import { QueryState } from "@/components/query-state";
import { SampleChip } from "@/components/sample-badge";
import { Button } from "@/components/ui/button";
import {
  STAGE_LABELS,
  cumulativePoints,
  financialYearLabel,
  gapToTarget,
  isStage,
  recurrentShare,
  type EfficiencySummary,
} from "@/data/efficiency";
import { useEfficiencySummary, useSchemesAtRisk } from "@/hooks/use-efficiency";
import { useFormat } from "@/lib/format";
import { useModuleTerm } from "@/lib/modules";
import { monthLabel, reasonText } from "@/features/reports/blocks/catalogue/efficiency";

export function EfficiencyDashboard({
  year,
  onYearChange,
  workspaceId,
  categoryLabel,
}: {
  year: number;
  onYearChange: (year: number) => void;
  workspaceId: string | null;
  categoryLabel: (value: string | null) => string;
}) {
  const fmt = useFormat();
  const startMonth = fmt.settings.regional.financialYearStartMonth || 4;
  const summary = useEfficiencySummary(year, workspaceId);
  return (
    <section className="space-y-4" aria-label="Dashboard">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous financial year"
          onClick={() => onYearChange(year - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-24 text-center text-sm font-semibold">
          {financialYearLabel(year, startMonth)}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next financial year"
          onClick={() => onYearChange(year + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <QueryState query={summary}>
        {(data) =>
          data ? (
            <DashboardBody summary={data} categoryLabel={categoryLabel} />
          ) : (
            <p className="text-sm text-muted-foreground">No figures for this year.</p>
          )
        }
      </QueryState>
      <AtRisk />
    </section>
  );
}

/** "£12k short of target", "£3k ahead of target", or nothing without a target. */
function gapNote(target: number | null, value: number, money: (n: number) => string) {
  const gap = gapToTarget(target, value);
  if (gap === null) return undefined;
  if (gap === 0) return "On target";
  return gap > 0 ? `${money(gap)} short of target` : `${money(-gap)} ahead of target`;
}

function DashboardBody({
  summary,
  categoryLabel,
}: {
  summary: EfficiencySummary;
  categoryLabel: (value: string | null) => string;
}) {
  const fmt = useFormat();
  const term = useModuleTerm();
  const money = (n: number) => fmt.compact(n);
  const t = summary.totals;
  const share = recurrentShare(t);
  const points = cumulativePoints(summary, monthLabel);
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const today = summary.months.some((m) => m.month === thisMonth)
    ? monthLabel(thisMonth)
    : undefined;

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile label="Target" value={t.target === null ? "Not set" : money(t.target)} />
        <Tile label="Planned" value={money(t.plan)} note={gapNote(t.target, t.plan, money)} />
        <Tile
          label="Risk-adjusted"
          value={money(t.riskAdjusted)}
          note={gapNote(t.target, t.riskAdjusted, money)}
        />
        <Tile
          label="Forecast outturn"
          value={money(t.forecastOutturn)}
          note={gapNote(t.target, t.forecastOutturn, money)}
        />
        <Tile label="Actual" value={money(t.actual)} />
        <Tile
          label="Recurrent share of plan"
          value={share === null ? "—" : `${share}%`}
          note={`${money(t.planRecurrent)} recurrent`}
        />
        <Tile label="Full-year effect" value={money(t.fullYearEffect)} />
        <Tile
          label="Carry-forward to next year"
          value={money(t.carryForward)}
          note="Recurrent exit run rate × 12"
        />
      </dl>

      <ChartCard
        title="Cumulative savings"
        subtitle={`${financialYearLabel(summary.year, summary.startMonth)}, by month`}
        legend={
          <>
            <LegendItem colour="var(--viz-ink-muted)" label="Planned" shape="dashed" />
            <LegendItem colour="var(--viz-cat-1)" label="Actual" shape="line" />
            <LegendItem colour="var(--viz-cat-1)" label="Risk-adjusted to forecast outturn" />
          </>
        }
        csv={{
          name: "efficiency-cumulative",
          columns: ["Month", "Planned", "Risk-adjusted", "Forecast outturn", "Actual"],
          rows: summary.months.map((m) => [
            m.month,
            m.cumPlan,
            m.cumRiskAdjusted,
            m.cumForecastOutturn,
            m.hasActual ? m.cumActual : undefined,
          ]),
        }}
        footer="Forecast outturn uses actuals where recorded, else the forecast, else the plan. Risk-adjusted weights the plan by planning confidence."
      >
        <CumulativeArea
          data={points}
          format={money}
          {...(today ? { todayPeriod: today } : {})}
          {...(t.target !== null ? { target: t.target, targetLabel: "Target" } : {})}
          valueLabel="Actual"
          plannedLabel="Planned"
          bandLabel="Risk-adjusted to forecast outturn"
          height={260}
        />
      </ChartCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <MeasureTable
          caption={`By ${term("orgUnit").toLowerCase()}`}
          firstHeader={term("orgUnit")}
          rows={summary.byUnit.map((u) => ({
            key: u.key ?? "",
            name: u.key ?? `No ${term("orgUnit").toLowerCase()}`,
            schemes: u.schemes,
            target: u.target,
            plan: u.plan,
            riskAdjusted: u.riskAdjusted,
            forecastOutturn: u.forecastOutturn,
          }))}
          showTarget
        />
        <MeasureTable
          caption="By category"
          firstHeader="Category"
          rows={summary.byCategory.map((c) => ({
            key: c.key ?? "",
            name: c.key ? categoryLabel(c.key) : "No category",
            schemes: c.schemes,
            target: null,
            plan: c.plan,
            riskAdjusted: c.riskAdjusted,
            forecastOutturn: c.forecastOutturn,
          }))}
        />
      </div>

      <section aria-labelledby="eff-stage-heading" className="rounded-lg border p-4">
        <h3 id="eff-stage-heading" className="text-sm font-semibold">
          Pipeline value by stage
        </h3>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {summary.byStage.map((s) => (
            <li key={s.stage} className="rounded-md bg-muted/40 p-2 text-sm">
              <span className="block text-xs text-muted-foreground">
                {isStage(s.stage) ? STAGE_LABELS[s.stage] : s.stage} ({s.schemes})
              </span>
              <span className="font-semibold tabular-nums">{money(s.plan)}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">
                risk-adjusted {money(s.riskAdjusted)}
              </span>
            </li>
          ))}
          {!summary.byStage.length && (
            <li className="text-sm text-muted-foreground">
              No {term("efficiency.schemePlural").toLowerCase()} yet.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string | undefined }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

interface MeasureRow {
  key: string;
  name: string;
  schemes: number;
  target: number | null;
  plan: number;
  riskAdjusted: number;
  forecastOutturn: number;
}

function MeasureTable({
  caption,
  firstHeader,
  rows,
  showTarget = false,
}: {
  caption: string;
  firstHeader: string;
  rows: MeasureRow[];
  showTarget?: boolean;
}) {
  const fmt = useFormat();
  const money = (n: number | null) => (n === null ? "—" : fmt.compact(n));
  const th = "px-2 py-1.5 font-medium";
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-sm">
        <caption className="px-3 py-2 text-left text-sm font-semibold">{caption}</caption>
        <thead className="bg-muted/50 text-xs">
          <tr>
            <th scope="col" className={`${th} text-left`}>
              {firstHeader}
            </th>
            <th scope="col" className={`${th} text-right`}>
              Schemes
            </th>
            {showTarget && (
              <th scope="col" className={`${th} text-right`}>
                Target
              </th>
            )}
            <th scope="col" className={`${th} text-right`}>
              Planned
            </th>
            <th scope="col" className={`${th} text-right`}>
              Risk-adjusted
            </th>
            <th scope="col" className={`${th} text-right`}>
              Forecast outturn
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t">
              <th scope="row" className="px-2 py-1.5 text-left font-normal">
                {r.name}
              </th>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.schemes}</td>
              {showTarget && (
                <td className="px-2 py-1.5 text-right tabular-nums">{money(r.target)}</td>
              )}
              <td className="px-2 py-1.5 text-right tabular-nums">{money(r.plan)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(r.riskAdjusted)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{money(r.forecastOutturn)}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={showTarget ? 6 : 5} className="px-2 py-3 text-muted-foreground">
                Nothing this year.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AtRisk() {
  const fmt = useFormat();
  const term = useModuleTerm();
  const atRisk = useSchemesAtRisk();
  return (
    <section aria-labelledby="eff-at-risk-heading" className="rounded-lg border p-4">
      <h3 id="eff-at-risk-heading" className="text-sm font-semibold">
        {term("efficiency.schemePlural")} off track this year
      </h3>
      <p className="text-xs text-muted-foreground">
        Across the organisation: more than 10% below plan, on hold with planned savings, or in
        delivery without an approved impact assessment.
      </p>
      <QueryState query={atRisk}>
        {(data) =>
          data.rows.length ? (
            <ul className="mt-2 divide-y text-sm">
              {data.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                  <Link
                    to="/portfolio/efficiency/$schemeId"
                    params={{ schemeId: r.id }}
                    className="font-medium hover:underline"
                  >
                    <span className="text-muted-foreground">{r.ref} · </span>
                    {r.title}
                  </Link>
                  {r.isSample && <SampleChip />}
                  <span className="tabular-nums text-muted-foreground">
                    {fmt.compact(r.forecastOutturn)} forecast of {fmt.compact(r.plan)} planned
                  </span>
                  <span className="basis-full text-xs">{r.reasons.map(reasonText).join("; ")}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Nothing off track.</p>
          )
        }
      </QueryState>
    </section>
  );
}
