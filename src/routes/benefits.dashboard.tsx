import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { BenefitsNav } from "@/components/benefits-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { getBenefitPerformance, getBenefitsByObjective, getClassificationSplit, getForecastingAccuracy, getPortfolioReturn, getValueMetrics } from "@/services/benefits-value";
import { getBenefits } from "@/services/pmo";
import { cn } from "@/lib/utils";

const title = "Benefits Value Dashboard — Virtual PMO", description = "Portfolio benefit value, objective contribution, portfolio return and forecasting accuracy.";
export const Route = createFileRoute("/benefits/dashboard")({ head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Dashboard });

const money = (value: number) => (Math.abs(value) >= 1_000_000 ? `£${(value / 1_000_000).toFixed(2)}m` : `£${Math.round(value / 1000)}k`);

function Panel({ title: heading, note, children, className }: { title: string; note?: string; children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-lg border bg-card p-5 shadow-sm", className)}>
    <h2 className="font-display text-lg font-semibold">{heading}</h2>
    {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
    {children}
  </section>;
}

function Dashboard() {
  const items = getBenefits();
  const metrics = getValueMetrics(items);
  const objectives = getBenefitsByObjective(items);
  const split = getClassificationSplit(items);
  const portfolioReturn = getPortfolioReturn(items);
  const performance = getBenefitPerformance(items);
  const [accuracyBy, setAccuracyBy] = useState<"category" | "manager">("category");
  const accuracy = getForecastingAccuracy(accuracyBy, items);

  return <div className="space-y-7">
    <PageHeader eyebrow="Benefits management" title="Value Dashboard" description="What the portfolio is expected to deliver, what it has actually delivered, and how well we forecast." />
    <BenefitsNav />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Planned value (whole life)" value={money(metrics.planned)} detail={`${items.filter(item => item.type === "Benefit").length} benefits · ${money(metrics.disbenefitValue)} disbenefits`} icon="budget" />
      <KpiCard label="Realised to date" value={money(metrics.realised)} detail={`${metrics.percent}% of the planned profile`} icon="forecast" />
      <KpiCard label="Cash-releasing realised" value={money(metrics.cashReleasingRealised)} detail={`of ${money(metrics.cashReleasingPlanned)} planned`} icon="budget" />
      <KpiCard label="Benefits at risk" value={String(metrics.atRisk)} detail="Low confidence or behind profile" icon="health" />
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <KpiCard label="% realised" value={`${metrics.percent}%`} detail="Evidenced against whole-life value" icon="health" />
      <KpiCard label="Measurements overdue" value={String(metrics.measurementsOverdue)} detail="Past the agreed measurement date" icon="projects" />
      <KpiCard label="Benefits without an owner" value={String(metrics.withoutOwner)} detail="Cannot be validated until owned" icon="projects" />
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
      <Panel title="Benefits by strategic objective" note="Planned against realised, showing which objectives the portfolio is actually moving.">
        <div className="mt-5 h-[26rem]">
          <ResponsiveContainer>
            <BarChart data={objectives} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tickFormatter={value => money(Number(value))} tick={{ fontSize: 11 }} />
              <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number | string) => `£${Number(value).toLocaleString("en-GB")}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="planned" name="Planned" fill="var(--chart-2)" radius={[0, 3, 3, 0]} />
              <Bar dataKey="realised" name="Realised" fill="var(--primary)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
      <Panel title="Classification split" note="Where the planned value sits across the four benefit classifications.">
        <div className="mt-5 h-72">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={split} dataKey="value" nameKey="name" innerRadius={62} outerRadius={104} paddingAngle={2}>{split.map((_, index) => <Cell key={index} fill={`var(--chart-${index + 1})`} />)}</Pie>
              <Tooltip formatter={(value: number | string) => `£${Number(value).toLocaleString("en-GB")}`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 space-y-2">{split.map((row, index) => <div key={row.name} className="flex items-center gap-2 text-sm">
          <span className="size-2.5 rounded-full" style={{ background: `var(--chart-${index + 1})` }} />
          <span className="flex-1">{row.name}</span>
          <span className="text-xs text-muted-foreground">{row.count} · {money(row.value)}</span>
        </div>)}</div>
      </Panel>
    </div>

    <Panel title="Portfolio return" note="Whole-life cost against whole-life benefit for each programme, with the benefit-cost ratio.">
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-11 px-4 font-semibold">Programme</th><th className="px-4 font-semibold">Whole-life cost</th><th className="px-4 font-semibold">Whole-life benefit</th><th className="px-4 font-semibold">Realised</th><th className="px-4 font-semibold">Benefit-cost ratio</th></tr></thead>
          <tbody>
            {portfolioReturn.map(row => <tr key={row.id} className="border-t">
              <td className="px-4 py-3 font-medium">{row.name}</td>
              <td className="px-4 py-3">{money(row.cost)}</td>
              <td className="px-4 py-3">{money(row.benefit)}</td>
              <td className="px-4 py-3">{money(row.realised)}</td>
              <td className="px-4 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", row.ratio >= 1 ? "bg-health-good/20 text-health-good-foreground" : row.ratio >= 0.7 ? "bg-health-warn/25 text-health-warn-foreground" : "bg-health-bad/20 text-health-bad-foreground")}>{row.ratio.toFixed(2)} : 1</span></td>
            </tr>)}
            <tr className="border-t bg-muted/40 font-semibold">
              <td className="px-4 py-3">Portfolio</td>
              <td className="px-4 py-3">{money(portfolioReturn.reduce((sum, row) => sum + row.cost, 0))}</td>
              <td className="px-4 py-3">{money(portfolioReturn.reduce((sum, row) => sum + row.benefit, 0))}</td>
              <td className="px-4 py-3">{money(portfolioReturn.reduce((sum, row) => sum + row.realised, 0))}</td>
              <td className="px-4 py-3">{(portfolioReturn.reduce((sum, row) => sum + row.benefit, 0) / Math.max(1, portfolioReturn.reduce((sum, row) => sum + row.cost, 0))).toFixed(2)} : 1</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Panel>

    <Panel title="Forecasting accuracy">
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Info className="size-4 text-primary" />Use this to calibrate future business cases.</p>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant={accuracyBy === "category" ? "default" : "outline"} onClick={() => setAccuracyBy("category")}>By category</Button>
          <Button size="sm" variant={accuracyBy === "manager" ? "default" : "outline"} onClick={() => setAccuracyBy("manager")}>By project manager</Button>
        </div>
      </div>
      <div className="mt-5 h-72">
        <ResponsiveContainer>
          <BarChart data={accuracy} margin={{ left: 8, right: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} textAnchor="end" height={54} />
            <YAxis tickFormatter={value => `${value}%`} tick={{ fontSize: 11 }} width={46} />
            <Tooltip formatter={(value: number | string, name) => (name === "accuracy" ? `${value}% of planned realised` : `£${Number(value).toLocaleString("en-GB")}`)} />
            <Bar dataKey="accuracy" name="Realised as % of planned" radius={[3, 3, 0, 0]}>{accuracy.map(row => <Cell key={row.name} fill={row.accuracy >= 90 ? "var(--health-good)" : row.accuracy >= 70 ? "var(--health-warn)" : "var(--health-bad)"} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-4 font-semibold">{accuracyBy === "category" ? "Category" : "Project manager"}</th><th className="px-4 font-semibold">Closed projects</th><th className="px-4 font-semibold">Planned</th><th className="px-4 font-semibold">Realised</th><th className="px-4 font-semibold">Accuracy</th></tr></thead>
          <tbody>{accuracy.map(row => <tr key={row.name} className="border-t"><td className="px-4 py-2.5 font-medium">{row.name}</td><td className="px-4 py-2.5">{row.projects}</td><td className="px-4 py-2.5">{money(row.planned)}</td><td className="px-4 py-2.5">{money(row.realised)}</td><td className="px-4 py-2.5">{row.accuracy}%</td></tr>)}
            {!accuracy.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No closed projects with benefit profiles yet.</td></tr>}</tbody>
        </table>
      </div>
    </Panel>

    <div className="grid gap-5 lg:grid-cols-2">
      <Panel title="Top 5 benefits behind profile" note="Largest negative variance against the profile expected today.">
        <div className="mt-4 divide-y">{performance.behind.map(row => <Link key={row.benefit.id} to="/benefits/$benefitId" params={{ benefitId: row.benefit.id }} className="flex items-center gap-3 py-3 hover:bg-accent/30">
          <ArrowDownRight className="size-4 shrink-0 text-health-bad-foreground" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.benefit.reference} · {row.benefit.title}</p><p className="text-xs text-muted-foreground">{row.benefit.owner || "Unassigned"} · {row.benefit.confidence} confidence</p></div>
          <span className="shrink-0 text-sm font-semibold text-health-bad-foreground">{row.variance}%</span>
        </Link>)}</div>
      </Panel>
      <Panel title="Top 5 benefits on or ahead of profile" note="Largest positive variance against the profile expected today.">
        <div className="mt-4 divide-y">{performance.ahead.map(row => <Link key={row.benefit.id} to="/benefits/$benefitId" params={{ benefitId: row.benefit.id }} className="flex items-center gap-3 py-3 hover:bg-accent/30">
          <ArrowUpRight className="size-4 shrink-0 text-health-good-foreground" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{row.benefit.reference} · {row.benefit.title}</p><p className="text-xs text-muted-foreground">{row.benefit.owner || "Unassigned"} · {row.percent}% realised</p></div>
          <span className="shrink-0 text-sm font-semibold text-health-good-foreground">{row.variance > 0 ? "+" : ""}{row.variance}%</span>
        </Link>)}</div>
      </Panel>
    </div>
  </div>;
}
