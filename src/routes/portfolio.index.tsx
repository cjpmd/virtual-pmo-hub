import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { BoardWorkspace, type BoardColumn, type BoardRow } from "@/components/board-workspace";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { CumulativeArea, SmallMultiples } from "@/components/charts/plots";
import {
  AxisStrip,
  BulletChart,
  Dumbbell,
  SegmentedBar,
  SortedBars,
  StatStrip,
  type DumbbellDatum,
} from "@/components/charts/primitives";
import { ManagePortfoliosButton, StateBadge } from "@/components/entity-management";
import { StatusBar } from "@/components/overview/status-bar";
import { SummaryStrip } from "@/components/overview/summary-strip";
import { StatusBarSlot, TopBand } from "@/components/shell-slots";
import { HealthPill } from "@/components/health-pill";
import { PageSkeleton, QueryState } from "@/components/query-state";
import { useCurrentPortfolio } from "@/hooks/use-current-portfolio";
import { RollupFinancials } from "@/components/rollup-financials";
import { Switch } from "@/components/ui/switch";
import { usePortfolioOverview } from "@/hooks/use-hierarchy";
import { useAssuranceProjects } from "@/hooks/use-assurance";
import { useFinancialPeriods } from "@/hooks/use-financials";
import { useFormat } from "@/lib/format";
import { todayIso } from "@/lib/today";
import {
  activeOnly,
  openOnly,
  dayNumber,
  getDeliveryCurve,
  getDimensionScores,
  getMilestoneMetrics,
  getPortfolioHeadlines,
  getProgrammeFinancials,
  getProgrammeRollups,
  getRag,
  getSlippedMilestones,
  ragSegments,
  scoreColour,
  slipColour,
  slipSeverity,
  type FinancialRow,
  type PortfolioOverview,
} from "@/services/analytics";
import { reportGapCounts } from "@/services/assurance";
import { dataAsOf, getSummaryMetrics, periodStatus } from "@/services/overview";
import { useDeliveryVersion } from "@/services/sprints";
export const Route = createFileRoute("/portfolio/")({
  head: () => ({
    meta: [
      { title: "Portfolio Overview — Virtual PMO" },
      { name: "description", content: "DTS portfolio health, delivery and financial overview." },
      { property: "og:title", content: "Portfolio Overview — Virtual PMO" },
      {
        property: "og:description",
        content: "DTS portfolio health, delivery and financial overview.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioPage,
});

const columns: BoardColumn[] = [
  { key: "title", label: "Programme", type: "text", summary: "count", width: 300 },
  { key: "status", label: "Health", type: "status", summary: "rag" },
  { key: "people", label: "Manager", type: "people" },
  { key: "number", label: "Projects", type: "number", summary: "sum" },
  { key: "budget", label: "Budget", type: "number", summary: "sum" },
  { key: "forecast", label: "Forecast", type: "number", summary: "sum" },
  { key: "formula", label: "RAG mix", type: "formula" },
];
const horizons = [
  { value: "90", label: "90d" },
  { value: "180", label: "6m" },
  { value: "all", label: "All" },
];

function PortfolioPage() {
  const { portfolio, portfolios, select } = useCurrentPortfolio();
  const overview = usePortfolioOverview(portfolio?.id);
  if (!portfolio)
    return (
      <div className="space-y-6">
        <AutoBreadcrumbs />
        <QueryState query={portfolios}>
          {(items) =>
            items.length ? (
              <PageSkeleton />
            ) : (
              <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
                <p>No portfolios yet. A portfolio holds your programmes and projects.</p>
                <div className="mt-4 flex justify-center">
                  <ManagePortfoliosButton />
                </div>
              </div>
            )
          }
        </QueryState>
      </div>
    );
  return (
    <div className="space-y-6">
      <QueryState query={overview}>
        {(data) => (
          <PortfolioBody
            data={data}
            switcher={
              (portfolios.data?.length ?? 0) > 1 ? (
                <select
                  aria-label="Portfolio"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  value={portfolio.id}
                  onChange={(event) => select(event.target.value)}
                >
                  {portfolios.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              ) : null
            }
          />
        )}
      </QueryState>
    </div>
  );
}

function PortfolioBody({ data, switcher }: { data: PortfolioOverview; switcher: React.ReactNode }) {
  const format = useFormat();
  const money = format.compact;
  const { portfolio, programmes, projects, milestones: allMilestones } = data;
  const active = useMemo(() => activeOnly(projects), [projects]);
  const headlines = useMemo(
    () => getPortfolioHeadlines(active, data.history),
    [active, data.history],
  );
  const financials = useMemo(
    () => getProgrammeFinancials(programmes, active),
    [programmes, active],
  );
  const rollups = useMemo(
    () => getProgrammeRollups(programmes, projects, allMilestones),
    [programmes, projects, allMilestones],
  );
  const {
    periods: dimensionPeriods,
    scores: dimensions,
    overall: overallTrend,
  } = useMemo(() => getDimensionScores(active, data.projectHistory), [active, data.projectHistory]);
  const delivery = useMemo(() => getDeliveryCurve(allMilestones), [allMilestones]);
  const [horizon, setHorizon] = useState("180");
  const [includeInactiveFinancials, setIncludeInactiveFinancials] = useState(false);

  const milestoneMetrics = getMilestoneMetrics(allMilestones);
  const slipped = useMemo(() => {
    const limit = horizon === "all" ? Infinity : dayNumber(todayIso()) + Number(horizon);
    return getSlippedMilestones(
      allMilestones.filter((item) => dayNumber(item.forecastDate) <= limit),
      8,
    );
  }, [allMilestones, horizon]);
  const slipRows: DumbbellDatum[] = slipped.map((item) => {
    const severity = slipSeverity(item.slipDays);
    return {
      key: item.id,
      label: item.title,
      sublabel: `${item.projectName} · ${item.ownerName}`,
      from: dayNumber(item.baselineDate),
      to: dayNumber(item.forecastDate),
      colour: slipColour[severity],
      fromLabel: format.date(item.baselineDate),
      toLabel: format.date(item.forecastDate),
      valueLabel: `+${item.slipDays}d`,
      note: `${severity} slip · reforecast from ${format.date(item.baselineDate)}`,
    };
  });
  const slipTicks = slipRows.length
    ? [Math.min(...slipRows.map((row) => row.from)), Math.max(...slipRows.map((row) => row.to))]
    : [];

  const rows: BoardRow[] = programmes.map((programme) => {
    const items = openOnly(projects).filter((project) => project.programmeId === programme.id);
    const rag = getRag(items);
    return {
      id: programme.id,
      title: programme.name,
      status: programme.health,
      people: [programme.managerName],
      number: items.length,
      budget: items.reduce((sum, item) => sum + item.budget, 0),
      forecast: items.reduce((sum, item) => sum + item.forecast, 0),
      formula: `${rag.green} green · ${rag.amber} amber · ${rag.red} red`,
      group: programme.health,
    };
  });

  const variance = headlines.forecast - headlines.budget;
  return (
    <div className="space-y-6">
      <OverviewBand data={data} switcher={switcher} active={active} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Financial summary</h2>
            <p className="text-sm text-muted-foreground">
              {includeInactiveFinancials
                ? "Includes active, proposed, on-hold and closed projects."
                : "Active projects only, matching the summary strip above."}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={includeInactiveFinancials}
              onCheckedChange={setIncludeInactiveFinancials}
              aria-label="Include proposed and closed projects"
            />
            Include proposed and closed
          </label>
        </div>
        <RollupFinancials
          scope={{ portfolioId: portfolio.id }}
          breakdown={false}
          projectIds={
            includeInactiveFinancials
              ? projects.map((project) => project.id)
              : active.map((project) => project.id)
          }
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="Budget, spend and forecast by programme"
          subtitle="Ordered by forecast overspend"
          info="The bar is spend to date, the coloured marker is the current forecast and the dark rule is the approved budget. A marker to the right of the rule is an overspend."
          legend={
            <>
              <LegendItem colour="var(--viz-cat-1)" label="Spend to date" />
              <LegendItem colour="var(--viz-cat-3)" label="Forecast" shape="line" />
              <LegendItem colour="var(--viz-ink)" label="Approved budget" shape="line" />
              <LegendItem colour="var(--viz-critical)" label="Forecast over budget" shape="line" />
            </>
          }
          csv={{
            name: "portfolio-financials",
            columns: ["Programme", "Spend to date", "Forecast", "Budget", "Variance"],
            rows: financials.map((row) => [
              row.label,
              row.actual,
              row.forecast,
              row.target,
              row.forecast - row.target,
            ]),
          }}
          footer={
            <StatStrip
              items={[
                { label: "Approved budget", value: money(headlines.budget) },
                { label: "Forecast at completion", value: money(headlines.forecast) },
                { label: "Spent to date", value: money(headlines.spend) },
                {
                  label: variance >= 0 ? "Forecast overspend" : "Forecast underspend",
                  value: money(Math.abs(variance)),
                  tone: variance >= 0 ? "var(--viz-negative)" : "var(--viz-positive)",
                },
              ]}
            />
          }
          table={<FinancialTable rows={financials} money={money} />}
          empty={
            financials.length
              ? undefined
              : {
                  title: "No programme budgets",
                  detail: "Budgets appear here once projects are approved into a programme.",
                }
          }
        >
          <BulletChart rows={financials} format={money} labelWidth={180} rowGap={28} />
        </ChartCard>

        <ChartCard
          className="xl:col-span-4"
          title="Delivery health"
          subtitle={`${headlines.rag.total} active projects`}
          info="Overall project health, worst-of across schedule, financial, effort, issues and benefits. Counts are projects, not budget."
          aside={
            <span className="tabular text-xs font-semibold text-muted-foreground">
              {headlines.rag.percentOnTrack}% green
            </span>
          }
          csv={{
            name: "portfolio-health",
            columns: ["Programme", "On track", "At risk", "Off track", "Not set"],
            rows: rollups.map((row) => [
              row.programme.name,
              row.rag.green,
              row.rag.amber,
              row.rag.red,
              row.rag.unset,
            ]),
          }}
        >
          <SegmentedBar segments={ragSegments(headlines.rag)} />
          <div className="mt-5 space-y-3 border-t border-border/60 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              By programme
            </p>
            {rollups.map((rollup) => (
              <div key={rollup.programme.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <Link
                    to="/portfolio/programmes/$programmeId"
                    params={{ programmeId: rollup.programme.id }}
                    className="truncate text-xs text-foreground hover:underline"
                  >
                    {rollup.programme.name}
                  </Link>
                  <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                    {rollup.rag.green}/{rollup.rag.total}
                  </span>
                </div>
                <SegmentedBar
                  segments={ragSegments(rollup.rag)}
                  height={8}
                  showInlineLabels={false}
                  className="[&>div:last-of-type]:hidden"
                />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-7"
          title="Milestone slippage"
          subtitle="Largest reforecasts against baseline"
          info="The hollow dot is the baselined date and the filled dot is the current forecast. The length of the connector is the slip; its colour is the severity."
          timeRange={{ value: horizon, options: horizons, onChange: setHorizon }}
          aside={
            <Link
              to="/delivery/milestones"
              className="text-xs font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          }
          legend={
            <>
              <LegendItem colour="var(--viz-ink-muted)" label="Baseline" shape="dot" />
              <LegendItem colour="var(--viz-warning)" label="Up to 14 days" shape="dot" />
              <LegendItem colour="var(--viz-serious)" label="15–30 days" shape="dot" />
              <LegendItem colour="var(--viz-critical)" label="Over 30 days" shape="dot" />
            </>
          }
          csv={{
            name: "milestone-slippage",
            columns: ["Milestone", "Project", "Owner", "Baseline", "Forecast", "Slip days"],
            rows: slipped.map((item) => [
              item.title,
              item.projectName,
              item.ownerName,
              format.date(item.baselineDate),
              format.date(item.forecastDate),
              item.slipDays,
            ]),
          }}
          footer={
            <StatStrip
              items={[
                { label: "Due next 30 days", value: String(milestoneMetrics.upcoming) },
                {
                  label: "Overdue",
                  value: String(milestoneMetrics.overdue),
                  tone: milestoneMetrics.overdue ? "var(--viz-critical)" : undefined,
                },
                {
                  label: "Reforecast",
                  value: String(milestoneMetrics.slipped),
                  tone: "var(--viz-serious)",
                },
                {
                  label: "Hit baseline (90d)",
                  value: `${milestoneMetrics.percentOnTime}%`,
                  tone: scoreColour(milestoneMetrics.percentOnTime),
                },
              ]}
            />
          }
          empty={
            slipRows.length
              ? undefined
              : {
                  title: "Nothing has slipped",
                  detail:
                    "No incomplete milestone in this window is forecast later than its baseline.",
                }
          }
        >
          <Dumbbell rows={slipRows} />
          {slipTicks.length === 2 ? (
            <AxisStrip
              labelWidth={190}
              ticks={slipTicks.map((day) => format.shortDate(new Date(day * 86400000)))}
            />
          ) : null}
        </ChartCard>

        <div className="flex flex-col gap-4 xl:col-span-5">
          <ChartCard
            className="flex-1"
            title="Investment by programme"
            subtitle="Approved budget"
            info="Approved delivery budget for active projects, largest first."
            csv={{
              name: "investment-by-programme",
              columns: ["Programme", "Budget", "Projects"],
              rows: rollups.map((row) => [row.programme.name, row.budget, row.rag.total]),
            }}
          >
            <SortedBars
              format={money}
              labelWidth={150}
              rows={[...rollups]
                .sort((a, b) => b.budget - a.budget)
                .map((rollup, index) => ({
                  key: rollup.programme.id,
                  label: rollup.programme.name,
                  value: rollup.budget,
                  colour: `var(--viz-cat-${Math.min(index, 7) + 1})`,
                  tooltip: {
                    title: rollup.programme.name,
                    rows: [
                      { label: "Budget", value: money(rollup.budget) },
                      { label: "Forecast", value: money(rollup.forecast) },
                      { label: "Spend to date", value: money(rollup.actual) },
                      { label: "Active projects", value: String(rollup.rag.total), muted: true },
                    ],
                  },
                }))}
            />
          </ChartCard>
          <ChartCard
            className="flex-1"
            title="Where the risk sits"
            subtitle="Projects amber or red, by programme"
            info="Counts active projects whose overall health is amber or red, so you can see which programme board needs the deep dive."
            csv={{
              name: "risk-by-programme",
              columns: ["Programme", "At risk", "Off track", "Slipped milestones"],
              rows: rollups.map((row) => [
                row.programme.name,
                row.rag.amber,
                row.rag.red,
                row.slipped,
              ]),
            }}
          >
            <SortedBars
              format={(value) => String(value)}
              labelWidth={150}
              rows={[...rollups]
                .sort((a, b) => b.rag.amber + b.rag.red - (a.rag.amber + a.rag.red))
                .map((rollup) => ({
                  key: rollup.programme.id,
                  label: rollup.programme.name,
                  value: rollup.rag.amber + rollup.rag.red,
                  colour: rollup.rag.red
                    ? "var(--viz-critical)"
                    : rollup.rag.amber
                      ? "var(--viz-warning)"
                      : "var(--viz-good)",
                  tooltip: {
                    title: rollup.programme.name,
                    rows: [
                      {
                        label: "Off track",
                        value: String(rollup.rag.red),
                        colour: "var(--viz-critical)",
                      },
                      {
                        label: "At risk",
                        value: String(rollup.rag.amber),
                        colour: "var(--viz-warning)",
                      },
                      {
                        label: "On track",
                        value: String(rollup.rag.green),
                        colour: "var(--viz-good)",
                      },
                      { label: "Slipped milestones", value: String(rollup.slipped), muted: true },
                    ],
                  },
                }))}
            />
          </ChartCard>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-8"
          title="Milestone delivery profile"
          subtitle="Cumulative milestones signed off against the baselined plan"
          info="The dashed line is what the baselined plans said would be complete by now. The filled area is what has actually been signed off. The shaded band ahead of today is the current forecast, allowing for reforecasting."
          legend={
            <>
              <LegendItem colour="var(--viz-ink-muted)" label="Baselined plan" shape="dashed" />
              <LegendItem colour="var(--viz-cat-1)" label="Signed off" shape="line" />
              <LegendItem colour="var(--viz-cat-1)" label="Forecast range" />
            </>
          }
          csv={{
            name: "delivery-profile",
            columns: ["Month", "Planned", "Signed off", "Forecast low", "Forecast high"],
            rows: delivery.points.map((point) => [
              point.period,
              point.planned,
              point.actual,
              point.band?.[0],
              point.band?.[1],
            ]),
          }}
          footer={`${delivery.delivered} of ${delivery.plannedToDate} milestones baselined for delivery by now have been signed off, from ${delivery.total} across the portfolio.`}
        >
          <CumulativeArea
            data={delivery.points}
            format={(value) => String(Math.round(value))}
            todayPeriod={delivery.todayPeriod}
            valueLabel="Signed off"
            plannedLabel="Baselined plan"
            bandLabel="Forecast range"
            height={248}
          />
        </ChartCard>
        <ChartCard
          className="xl:col-span-4"
          title="Health by dimension"
          subtitle="Share of active projects reporting green"
          info="Each dimension is scored independently, so a portfolio that is amber overall can still be green on cost. One plot per dimension keeps the scales comparable."
          csv={{
            name: "health-dimensions",
            columns: ["Dimension", ...dimensionPeriods],
            rows: dimensions.map((dimension) => [dimension.label, ...dimension.trend.points]),
          }}
          footer={`Worst-of across these five dimensions sets each project's overall health. ${
            dimensions
              .filter((dimension) => dimension.scored < dimension.total)
              .map(
                (dimension) =>
                  `${dimension.label} is scored on ${dimension.scored} of ${dimension.total}`,
              )
              .join("; ") || "Every dimension is scored on all active projects"
          }.`}
        >
          <SmallMultiples
            className="xl:grid-cols-2"
            domain={[0, 100]}
            series={[
              ...dimensions.map((dimension) => ({
                key: dimension.key,
                label: dimension.label,
                caption: `${dimension.percent}%`,
                captionTone: scoreColour(dimension.percent),
                valueLabel: "Projects green",
                format: (value: number) => `${value}%`,
                points: dimension.trend.points.map((value, index) => ({
                  label: dimensionPeriods[index] ?? "",
                  value,
                  colour: scoreColour(value),
                })),
              })),
              {
                key: "overall",
                label: "Overall",
                caption: `${headlines.rag.percentOnTrack}%`,
                captionTone: scoreColour(headlines.rag.percentOnTrack),
                valueLabel: "Projects green",
                format: (value: number) => `${value}%`,
                points: overallTrend.points.map((value, index) => ({
                  label: dimensionPeriods[index] ?? "",
                  value,
                  colour: scoreColour(value),
                })),
              },
            ]}
          />
        </ChartCard>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Programmes</h2>
        <BoardWorkspace
          title="Programmes"
          manage={false}
          rows={rows}
          columns={columns}
          groupOptions={["group", "status"]}
          renderTitle={(row) => (
            <Link
              to="/portfolio/programmes/$programmeId"
              params={{ programmeId: row.id }}
              className="text-primary hover:underline"
            >
              {row.title}
            </Link>
          )}
        />
      </section>
    </div>
  );
}

function FinancialTable({
  rows,
  money,
}: {
  rows: FinancialRow[];
  money: (value: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {["Programme", "Spend to date", "Forecast", "Budget", "Variance"].map((head) => (
              <th key={head} className="py-2 pr-4 font-medium">
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-4">{row.label}</td>
              <td className="tabular py-2 pr-4">{money(row.actual)}</td>
              <td className="tabular py-2 pr-4">{money(row.forecast)}</td>
              <td className="tabular py-2 pr-4">{money(row.target)}</td>
              <td
                className="tabular py-2 pr-4"
                style={{
                  color: row.forecast > row.target ? "var(--viz-negative)" : "var(--viz-positive)",
                }}
              >
                {money(row.forecast - row.target)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The dark top band (title, summary strip) and the status bar. Stage 1 of the overview redesign;
 * the progress chart and signals join the band in stages 2 and 3. Closed projects never count.
 */
function OverviewBand({
  data,
  switcher,
  active,
}: {
  data: PortfolioOverview;
  switcher: React.ReactNode;
  active: PortfolioOverview["projects"];
}) {
  const { portfolio, projects, milestones, history, projectHistory } = data;
  const assurance = useAssuranceProjects();
  const periods = useFinancialPeriods();
  const version = useDeliveryVersion();
  const gaps = useMemo(() => {
    if (!assurance.data) return null;
    const ids = new Set(projects.map((project) => project.id));
    return reportGapCounts(assurance.data.filter((project) => ids.has(project.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version tracks the browser-local sprint store
  }, [assurance.data, projects, version]);
  const today = todayIso();
  const metrics = useMemo(
    () => gaps && getSummaryMetrics({ projects, milestones, history, projectHistory, gaps, today }),
    [projects, milestones, history, projectHistory, gaps, today],
  );
  const months = periodStatus(
    (periods.data ?? []).filter((period) => period.closed).map((period) => period.periodMonth),
    today,
  );
  const asOf = dataAsOf([
    ...projects.flatMap((project) => [project.updatedAt, project.lastReportDate]),
    ...milestones.map((milestone) => milestone.updatedAt),
  ]);
  return (
    <>
      <TopBand>
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.05em] text-pmo-muted">Portfolio</p>
            <h1 className="truncate text-xl font-semibold text-pmo-text">{portfolio.name}</h1>
            {portfolio.description && (
              <p className="mt-0.5 truncate text-[13px] text-pmo-muted">{portfolio.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {switcher}
            <ManagePortfoliosButton />
            <StateBadge state={portfolio.state} />
            <HealthPill health={portfolio.health} />
          </div>
        </div>
        {metrics ? (
          <SummaryStrip metrics={metrics} />
        ) : (
          <div
            aria-busy
            aria-label="Loading the summary"
            className="h-[78px] animate-pulse border-y border-pmo-line bg-pmo-panel/40"
          />
        )}
      </TopBand>
      <StatusBarSlot>
        <StatusBar
          asOf={asOf}
          closedMonth={months.closed}
          openMonth={months.open}
          activeProjects={active.length}
        />
      </StatusBarSlot>
    </>
  );
}
