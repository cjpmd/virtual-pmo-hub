import { formatCurrency, formatDate, displayUnit } from "@/lib/format";
import { formatCompactCurrency } from "@/lib/format";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BellRing, CalendarClock, CheckCircle2, FileText, MessageCircleQuestion, ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/pmo-ui";
import { HealthPill } from "@/components/health-pill";
import type { BenefitClassification } from "@/data/types";
import { filterBenefits, getBenefitsInRealisation, getMeasurementSchedule, getPortfolioCurve, getValidationQueue, type BenefitFilter, type ValidationQueueItem } from "@/services/benefits-value";
import { getBenefitHealth, getBenefits, getProgrammes, getStrategicObjectives } from "@/services/pmo";
import { cn } from "@/lib/utils";

const money = formatCompactCurrency;
const classifications: BenefitClassification[] = ["Cash-releasing", "Non-cash-releasing", "Qualitative", "Societal"];

export function RealisationWorkspace() {
  const [filter, setFilter] = useState<BenefitFilter>({});
  const [reminded, setReminded] = useState<string[]>([]);
  const [decided, setDecided] = useState<Record<string, "Validated" | "Queried">>({});
  const [preview, setPreview] = useState<ValidationQueueItem | null>(null);

  const setKey = (key: keyof BenefitFilter, value: string) => setFilter(current => { const next = { ...current }; if (value) (next[key] as string) = value; else delete next[key]; return next; });
  const scoped = useMemo(() => filterBenefits(filter), [filter]);
  const curve = useMemo(() => getPortfolioCurve(scoped), [scoped]);
  const schedule = useMemo(() => getMeasurementSchedule(scoped).filter(item => item.state !== "Upcoming"), [scoped]);
  const queue = useMemo(() => getValidationQueue(scoped), [scoped]);
  const inRealisation = useMemo(() => getBenefitsInRealisation(scoped), [scoped]);
  const outstanding = queue.filter(item => !decided[item.record.id]);

  const latest = curve.reduce<{ planned: number; actual: number; forecast: number }>((carry, point) => ({ planned: point.planned, actual: point.actual ?? carry.actual, forecast: point.forecast }), { planned: 0, actual: 0, forecast: 0 });

  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Planned to date" value={money(latest.planned)} detail="Whole-life profile" icon="budget" />
      <KpiCard label="Evidenced to date" value={money(latest.actual)} detail={`${latest.planned ? Math.round((latest.actual / latest.planned) * 100) : 0}% of the profile`} icon="forecast" />
      <KpiCard label="Overdue measurements" value={String(schedule.filter(item => item.state === "Overdue").length)} detail={`${schedule.filter(item => item.state === "Due this month").length} more due this month`} icon="health" />
      <KpiCard label="Awaiting validation" value={String(outstanding.length)} detail="Submitted records in the PMO queue" icon="projects" />
    </div>

    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Cumulative benefit value</h2>
          <p className="mt-1 text-sm text-muted-foreground">Planned profile against evidenced actuals and the confidence-adjusted forecast.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Filter label="Programme" value={filter.programmeId ?? ""} onChange={value => setKey("programmeId", value)} options={getProgrammes().map(item => ({ value: item.id, label: item.name }))} />
          <Filter label="Objective" value={filter.objectiveId ?? ""} onChange={value => setKey("objectiveId", value)} options={getStrategicObjectives().map(item => ({ value: item.id, label: item.title }))} />
          <Filter label="Classification" value={filter.classification ?? ""} onChange={value => setKey("classification", value)} options={classifications.map(item => ({ value: item, label: item }))} />
          <Filter label="Benefit" value={filter.benefitId ?? ""} onChange={value => setKey("benefitId", value)} options={getBenefits().map(item => ({ value: item.id, label: `${item.reference} · ${item.title}` }))} />
        </div>
      </div>
      <div className="mt-6 h-80">
        <ResponsiveContainer>
          <AreaChart data={curve} margin={{ left: 8, right: 8 }}>
            <defs><linearGradient id="plannedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.35} /><stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={value => money(Number(value))} tick={{ fontSize: 11 }} width={62} />
            <Tooltip formatter={(value: number | string) => formatCurrency(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="planned" name="Planned" stroke="var(--chart-2)" fill="url(#plannedFill)" strokeWidth={2} />
            <Line type="monotone" dataKey="forecast" name="Forecast" stroke="var(--chart-5)" strokeWidth={2} strokeDasharray="6 4" dot={false} />
            <Line type="monotone" dataKey="actual" name="Actual" stroke="var(--primary)" strokeWidth={2.5} connectNulls={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{scoped.length} benefits in scope. Forecast applies a confidence factor of 100% for High, 85% for Medium and 60% for Low.</p>
    </section>

    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b p-5">
        <CalendarClock className="size-5 text-primary" />
        <div className="mr-auto"><h2 className="font-display text-lg font-semibold">Measurements due and overdue</h2><p className="mt-0.5 text-sm text-muted-foreground">Due this month or already past the agreed date.</p></div>
        <Button variant="outline" size="sm" onClick={() => setReminded(schedule.map(item => item.measure.id))}><BellRing />Remind everyone</Button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-11 px-4 font-semibold">Benefit</th><th className="px-4 font-semibold">Measure</th><th className="px-4 font-semibold">Owner</th><th className="px-4 font-semibold">Frequency</th><th className="px-4 font-semibold">Due</th><th className="px-4 font-semibold">State</th><th className="px-4 font-semibold">Action</th></tr></thead>
          <tbody>
            {schedule.map(item => <tr key={item.measure.id} className="border-t">
              <td className="px-4 py-3"><Link to="/benefits/$benefitId" params={{ benefitId: item.benefit.id }} className="font-medium text-primary hover:underline">{item.benefit.reference} · {item.benefit.title}</Link></td>
              <td className="px-4 py-3">{item.measure.name}</td>
              <td className="px-4 py-3">{item.benefit.owner || <span className="text-health-warn-foreground">Unassigned</span>}</td>
              <td className="px-4 py-3">{item.measure.frequency}</td>
              <td className="px-4 py-3">{formatDate(item.dueDate)}</td>
              <td className="px-4 py-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", item.state === "Overdue" ? "bg-health-bad/20 text-health-bad-foreground" : "bg-health-warn/25 text-health-warn-foreground")}>{item.state}{item.daysOverdue > 0 && ` · ${item.daysOverdue}d`}</span></td>
              <td className="px-4 py-3">{reminded.includes(item.measure.id)
                ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4" />Reminder sent</span>
                : <Button size="sm" variant="outline" onClick={() => setReminded(current => [...current, item.measure.id])}><BellRing />Send reminder</Button>}</td>
            </tr>)}
            {!schedule.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing due or overdue in this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b p-5"><ShieldCheck className="size-5 text-primary" /><div><h2 className="font-display text-lg font-semibold">PMO validation queue</h2><p className="mt-0.5 text-sm text-muted-foreground">Submitted measurement records awaiting validation.</p></div></header>
      <div className="divide-y">
        {queue.map(item => {
          const outcome = decided[item.record.id];
          return <div key={item.record.id} className="grid gap-3 p-5 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-semibold"><Link to="/benefits/$benefitId" params={{ benefitId: item.benefit.id }} className="text-primary hover:underline">{item.benefit.reference}</Link> · {item.measure.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.record.period} · submitted by {item.record.submittedBy}{item.record.submittedDate ? ` on ${formatDate(item.record.submittedDate)}` : ""}</p>
              <p className="mt-2 text-sm">Reported <strong>{item.record.actualValue.toLocaleString("en-GB")} {displayUnit(item.measure.unit)}</strong> against a profile of {(item.measure.targetProfile.find(target => target.period === item.record.period)?.value ?? 0).toLocaleString("en-GB")} {displayUnit(item.measure.unit)}.</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.record.notes}</p>
              {item.record.queryNote && <p className="mt-1 text-xs font-medium text-health-warn-foreground">Query: {item.record.queryNote}</p>}
              <button onClick={() => setPreview(item)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><FileText className="size-3.5" />{item.record.evidence}</button>
            </div>
            <div className="flex items-start gap-2">
              {outcome ? <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", outcome === "Validated" ? "bg-health-good/20 text-health-good-foreground" : "bg-health-warn/25 text-health-warn-foreground")}>{outcome === "Validated" ? <CheckCircle2 className="size-4" /> : <MessageCircleQuestion className="size-4" />}{outcome}</span>
                : <><Button size="sm" onClick={() => setDecided(current => ({ ...current, [item.record.id]: "Validated" }))}><CheckCircle2 />Validate</Button>
                  <Button size="sm" variant="outline" onClick={() => setDecided(current => ({ ...current, [item.record.id]: "Queried" }))}><MessageCircleQuestion />Query</Button></>}
            </div>
          </div>;
        })}
        {!queue.length && <p className="p-10 text-center text-sm text-muted-foreground">No records are waiting for validation.</p>}
      </div>
    </section>

    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-3 border-b p-5"><TriangleAlert className="size-5 text-primary" /><div><h2 className="font-display text-lg font-semibold">Benefits in realisation</h2><p className="mt-0.5 text-sm text-muted-foreground">Still tracked after their enabling projects closed.</p></div></header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-11 px-4 font-semibold">Benefit</th><th className="px-4 font-semibold">Closed project</th><th className="px-4 font-semibold">BAU owner</th><th className="px-4 font-semibold">Service</th><th className="px-4 font-semibold">Next review</th><th className="px-4 font-semibold">PIR</th><th className="px-4 font-semibold">Health</th></tr></thead>
          <tbody>
            {inRealisation.map(row => <tr key={row.benefit.id} className="border-t">
              <td className="px-4 py-3"><Link to="/benefits/$benefitId" params={{ benefitId: row.benefit.id }} className="font-medium text-primary hover:underline">{row.benefit.reference} · {row.benefit.title}</Link></td>
              <td className="px-4 py-3 text-muted-foreground">{row.projectNames}</td>
              <td className="px-4 py-3">{row.bauOwner === "Not agreed" ? <span className="text-health-bad-foreground">Not agreed</span> : row.bauOwner}</td>
              <td className="px-4 py-3 text-muted-foreground">{row.bauService}</td>
              <td className="px-4 py-3">{formatDate(row.nextReviewDate)}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(row.postImplementationReviewDate)}</td>
              <td className="px-4 py-3"><HealthPill health={getBenefitHealth(row.benefit)} /></td>
            </tr>)}
            {!inRealisation.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No benefits are being tracked beyond project closure in this selection.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {preview && <>
      <button aria-label="Close evidence preview" className="fixed inset-0 z-40 bg-overlay" onClick={() => setPreview(null)} />
      <aside role="dialog" aria-label="Evidence preview" className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-y-auto border-l bg-background p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase text-primary">Evidence preview</p>
        <h2 className="mt-2 font-display text-xl font-semibold">{preview.record.evidence}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{preview.benefit.reference} · {preview.measure.name} · {preview.record.period}</p>
        <div className="mt-5 rounded-md border bg-muted/40 p-5">
          <div className="grid grid-cols-3 gap-3 border-b pb-3 text-[11px] font-semibold uppercase text-muted-foreground"><span>Period</span><span>Reported</span><span>Profile</span></div>
          {preview.measure.targetProfile.map(target => <div key={target.period} className="grid grid-cols-3 gap-3 border-b py-2.5 text-sm last:border-0">
            <span className="text-muted-foreground">{target.period}</span>
            <span className="font-medium">{preview.measure.records.find(record => record.period === target.period)?.actualValue.toLocaleString("en-GB") ?? "—"}</span>
            <span>{target.value.toLocaleString("en-GB")}</span>
          </div>)}
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{preview.measure.measurementMethod}</p>
        <p className="mt-2 text-xs text-muted-foreground">Data source: {preview.measure.dataSource} · Provider: {preview.measure.dataProvider}</p>
        <Button className="mt-5" variant="outline" onClick={() => setPreview(null)}>Close preview</Button>
      </aside>
    </>}
  </div>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">{label}
    <select value={value} onChange={event => onChange(event.target.value)} className="h-9 w-44 rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground">
      <option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
