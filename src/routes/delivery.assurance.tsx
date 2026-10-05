import { createFileRoute, Link } from "@tanstack/react-router";
import { toProjectCode } from "@/services/legacy-bridge";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { ChartCard } from "@/components/charts/chart-card";
import { DeclaredVsEvidenced, DeliveryChip, HowCalculated, RagPill } from "@/components/evidence-ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deliveryStatusLabels } from "@/services/forecast";
import { forecastAccuracy, getAssuranceRows, rollUp, slipTrend } from "@/services/assurance";
import { addJustification, toIso, useDeliveryVersion } from "@/services/sprints";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/delivery/assurance")({
  head: () => ({ meta: [{ title: "Assurance — Virtual PMO" }, { name: "description", content: "Declared versus evidenced RAG, forecast slippage and stale evidence across the portfolio." }, { property: "og:title", content: "Assurance — Virtual PMO" }, { property: "og:description", content: "Declared versus evidenced RAG, forecast slippage and stale evidence across the portfolio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: AssurancePage,
});

const fmt = (d: Date | null) => (d ? formatDate(toIso(d).split("-").reverse().join("/")) : "—");

function AssurancePage() {
  const version = useDeliveryVersion();
  const rows = useMemo(() => getAssuranceRows(), [version]);
  const live = rows.filter(r => r.state !== "Closed");
  const roll = rollUp(live); const trend = useMemo(() => slipTrend(rows), [rows]); const accuracy = useMemo(() => forecastAccuracy(), [version]);
  const alerts = live.filter(r => r.divergenceAlert);
  const [justifying, setJustifying] = useState<string | null>(null); const [note, setNote] = useState("");
  const programmes = Array.from(new Set(live.map(r => r.programme)));
  return <div className="space-y-6"><AutoBreadcrumbs />
    <PageHeader eyebrow="Assurance from evidence" title="Portfolio assurance" description="What project managers declare, next to what the delivery data shows." />
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Evidenced portfolio RAG" value={roll.worst === "Grey" ? "No evidence" : roll.worst} detail={`Worst of ${live.length - roll.excluded} projects · ${roll.excluded} excluded (no or stale evidence)`} icon="health" />
      <KpiCard label="Divergence alerts" value={String(alerts.length)} detail="Declared better than evidence for 2+ cycles or 14+ days" icon="health" />
      <KpiCard label="Latest forecast finish" value={fmt(roll.latestFinish)} detail="Latest forecast finish among projects" icon="forecast" />
      <KpiCard label="Not converging" value={String(roll.notConverging)} detail="Scope growing faster than delivery" icon="projects" />
    </section>
    {alerts.length > 0 && <section className="space-y-3 rounded-lg border border-health-bad/30 bg-health-bad/5 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-health-bad" />Divergence alerts</h2>
      {alerts.map(r => <div key={r.projectId} className="rounded-md border border-border/70 bg-card p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Link to="/portfolio/projects/$projectCode" params={{ projectCode: toProjectCode(r.projectId) }} className="font-medium text-primary hover:underline">{r.name}</Link><DeclaredVsEvidenced declared={r.declared} evidenced={r.evidenced} /><span className="text-xs text-muted-foreground">for {r.divergenceDays} days</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setJustifying(r.projectId); setNote(""); }}>{r.justification ? "Update justification" : "Add justification"}</Button></div>
        {r.justification && <p className="mt-2 text-muted-foreground">PM justification: “{r.justification}”</p>}
        {justifying === r.projectId && <div className="mt-2 space-y-2"><Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Why is the declared RAG better than the evidence?" /><div className="flex gap-2"><Button size="sm" onClick={() => { if (note.trim()) { addJustification(r.projectId, note.trim()); setJustifying(null); } }}>Save</Button><Button size="sm" variant="ghost" onClick={() => setJustifying(null)}>Cancel</Button></div></div>}
      </div>)}
    </section>}
    <ChartCard title="Assurance register" subtitle="Sorted by assurance risk: divergence, slippage and stale data" info="Evidenced RAG comes from the forecast engine. Stale evidence means no work item changes in 14 days."
      csv={{ name: "assurance", columns: ["Project", "Programme", "Declared", "Evidenced", "Delivery status", "Days vs baseline", "Gap", "Converging", "Last update (days)", "Risk score"], rows: live.map(r => [r.name, r.programme, r.declared, r.stale ? "Stale" : r.evidenced, deliveryStatusLabels[r.status], r.daysVsBaseline ?? "", r.gap, r.converging ? "Yes" : "No", r.lastUpdateDays, r.riskScore]) }}>
      <div className="overflow-x-auto"><table className="w-full min-w-[960px] text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">Project</th><th>Declared vs evidenced</th><th>Delivery status</th><th className="text-right">Finish vs baseline</th><th className="text-right">Gap</th><th>Converging</th><th className="text-right">Last update</th><th className="text-right">Risk <HowCalculated title="assurance risk">Up to 40 for a divergence alert (15 if declared and evidence simply differ), up to 30 for forecast slippage, 20 for stale evidence and 15 if not converging.</HowCalculated></th></tr></thead>
        <tbody>{live.map(r => <tr key={r.projectId} className="border-t border-border/50"><td className="py-2"><Link to="/portfolio/projects/$projectCode" params={{ projectCode: toProjectCode(r.projectId) }} className="font-medium text-primary hover:underline">{r.name}</Link><p className="text-xs text-muted-foreground">{r.programme}</p></td>
          <td><DeclaredVsEvidenced declared={r.declared} evidenced={r.evidenced} stale={r.stale} /></td><td><DeliveryChip status={r.status} /></td>
          <td className="text-right">{r.daysVsBaseline === null ? (r.status === "insufficient_evidence" ? "—" : "Never") : r.daysVsBaseline > 0 ? `+${r.daysVsBaseline} days` : `${r.daysVsBaseline} days`}</td><td className="text-right">{r.gap > 0 ? r.gap : 0}</td><td>{r.status === "insufficient_evidence" ? "—" : r.converging ? "Yes" : "No"}</td>
          <td className="text-right">{r.lastUpdateDays} days</td><td className="text-right font-semibold">{r.riskScore}</td></tr>)}</tbody></table></div>
    </ChartCard>
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard title="Delivery status by programme" subtitle="Counts of projects; velocities are never added across projects">
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th className="py-2">Programme</th><th>Evidenced</th><th>Statuses</th></tr></thead><tbody>{programmes.map(p => { const sub = live.filter(r => r.programme === p); const ru = rollUp(sub);
          return <tr key={p} className="border-t border-border/50"><td className="py-2 font-medium">{p}</td><td><RagPill rag={ru.worst} /></td><td className="text-xs text-muted-foreground">{Object.entries(ru.counts).map(([k, v]) => `${v} ${k === "stale" ? "stale" : deliveryStatusLabels[k as keyof typeof deliveryStatusLabels].toLowerCase()}`).join(" · ")}</td></tr>; })}</tbody></table>
      </ChartCard>
      <ChartCard title="Forecast slip trend" subtitle="Average forecast finish vs baseline over the last 90 days" info="Taken from the stored forecast history for each active project." csv={{ name: "slip-trend", columns: ["Date", "Average slip (days)"], rows: trend.map(t => [t.label, t.avgSlip]) }}
        table={<table className="w-full text-sm"><tbody>{trend.map(t => <tr key={t.label}><td>{t.label}</td><td>{t.avgSlip} days</td></tr>)}</tbody></table>}>
        <div className="h-56"><ResponsiveContainer><LineChart data={trend}><CartesianGrid vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis width={40} tick={{ fontSize: 11 }} /><Tooltip /><Line dataKey="avgSlip" name="Average slip (days)" stroke="var(--viz-cat-2)" strokeWidth={2} dot isAnimationActive={false} /></LineChart></ResponsiveContainer></div>
      </ChartCard>
      <ChartCard className="xl:col-span-2" title="Forecast accuracy" subtitle={`How far forecasts were from the actual finish on ${accuracy.projects} closed projects`} info="Median absolute error between the forecast made at that point in the project and the date it actually finished.">
        <div className="grid gap-4 sm:grid-cols-3">{accuracy.rows.map(r => <div key={r.pct} className="rounded-md border border-border/70 p-4"><p className="text-xs text-muted-foreground">At {r.pct}% of elapsed duration</p><p className="mt-1 text-2xl font-semibold">{r.median === null ? "—" : `${r.median} days`}</p><p className="text-xs text-muted-foreground">median error · {r.samples} projects</p></div>)}</div>
      </ChartCard>
    </div>
  </div>;
}
