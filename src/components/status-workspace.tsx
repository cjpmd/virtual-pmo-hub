import { formatDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { Activity, CalendarDays, Check, Clock3, FilePenLine, Plus, Sparkles, X } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { HealthPill } from "@/components/health-pill";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import type { Health, HealthDimension, Task } from "@/data/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { QueryState } from "@/components/query-state";
import { useAssuranceProjects } from "@/hooks/use-assurance";
import { useBenefits } from "@/hooks/use-benefits";
import { useMilestones, useMyResourceId, useProjectPermissions, useRaid } from "@/hooks/use-hierarchy";
import { useStatusReports, useSubmitStatusReport } from "@/hooks/use-status-reports";
import { useProjectTasks } from "@/hooks/use-work-items";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { fromIsoDate } from "@/lib/format";
import { todayIso } from "@/lib/today";
import { getAssuranceRow } from "@/services/assurance";
import { benefitsForProject } from "@/services/benefits-value";
import { evidenceDraft, type DraftEvidence } from "@/services/highlight-draft";
import type { ProjectDetail } from "@/services/hierarchy";
import type { StatusReportInput, StatusReportView as StatusReport } from "@/services/status-reports";

const healthOptions: Health[] = ["On Track", "At Risk", "Off Track", "Not Set"];
const healthValues: Record<Health, number> = { "Not Set": 0, "On Track": 1, "At Risk": 2, "Off Track": 3 };
const valueHealth: Record<number, Health> = { 0: "Not Set", 1: "On Track", 2: "At Risk", 3: "Off Track" };
const dimensions: Array<{ key: HealthDimension; label: string }> = [
  { key: "overall", label: "Overall" },
  { key: "schedule", label: "Schedule" },
  { key: "financial", label: "Financial" },
  { key: "effort", label: "Effort" },
  { key: "issue", label: "Issues & risks" },
];
const chartConfig = {
  overall: { label: "Overall", color: "var(--viz-cat-1)" },
  schedule: { label: "Schedule", color: "var(--viz-cat-2)" },
  financial: { label: "Financial", color: "var(--viz-cat-3)" },
  effort: { label: "Effort", color: "var(--viz-cat-4)" },
  issue: { label: "Issues & risks", color: "var(--viz-cat-5)" },
} satisfies ChartConfig;

type HealthSet = Record<HealthDimension, Health>;
type Reasons = Partial<Record<HealthDimension, string>>;

function parseDate(value: string) {
  const [day = 1, month = 1, year = 1970] = value.split("/").map(Number);
  return new Date(year, month - 1, day).getTime();
}

function activityDraft(tasks: Task[]) {
  const completed = tasks.filter(task => task.percentComplete === 100).slice(-3);
  const upcoming = tasks.filter(task => task.percentComplete < 100).sort((a, b) => parseDate(a.finish) - parseDate(b.finish)).slice(0, 3);
  const completedText = completed.length
    ? `Completed ${completed.map(task => task.title.toLowerCase()).join(", ")}. The outputs have been reviewed and are feeding into the next delivery activities.`
    : "Progressed active work packages and reviewed delivery dependencies with the project team.";
  const upcomingText = upcoming.length
    ? `Next, the team will ${upcoming.map(task => task.title.toLowerCase()).join(", ")}. Focus will remain on resolving dependencies and maintaining the agreed delivery dates.`
    : "Next, the team will confirm closure actions and complete the final benefits handover.";
  return { accomplished: completedText, planned: upcomingText };
}

function HealthControl({ dimension, value, calculated, reason, onChange, onReasonChange }: {
  dimension: { key: HealthDimension; label: string };
  value: Health;
  calculated: Health;
  reason: string | undefined;
  onChange: (value: Health) => void;
  onReasonChange: (value: string) => void;
}) {
  const overridden = value !== calculated;
  return <fieldset className="space-y-2">
    <div className="flex items-center justify-between gap-3">
      <legend className="text-sm font-semibold">{dimension.label}</legend>
      <span className="text-xs text-muted-foreground">Calculated: {calculated}</span>
    </div>
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {healthOptions.map(option => <Button key={option} type="button" size="sm" variant={value === option ? "default" : "outline"} className="h-8 px-2 text-xs" onClick={() => onChange(option)}>{option}</Button>)}
    </div>
    {overridden && <div className="space-y-1.5">
      <Label htmlFor={`${dimension.key}-reason`} className="text-xs text-health-warn-foreground">Override reason required</Label>
      <Input id={`${dimension.key}-reason`} value={reason ?? ""} onChange={event => onReasonChange(event.target.value)} placeholder={`Why is ${dimension.label.toLowerCase()} being overridden?`} aria-required="true" />
    </div>}
  </fieldset>;
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return <div className="min-w-44 rounded-md border border-border bg-popover p-3 shadow-lg">
    <p className="mb-2 text-xs font-semibold text-popover-foreground">{label}</p>
    <div className="space-y-1.5">{payload.map(item => <div key={item.dataKey} className="flex items-center justify-between gap-4 text-xs"><span className="text-muted-foreground">{chartConfig[item.dataKey as keyof typeof chartConfig]?.label}</span><span className="font-medium text-foreground">{valueHealth[item.value ?? 0]}</span></div>)}</div>
  </div>;
}

function ReportPanel({ open, calculated, tasks, evidence, submitter, pending, onClose, onSubmit }: { open: boolean; calculated: HealthSet; tasks: Task[]; evidence: DraftEvidence | undefined; submitter: string; pending: boolean; onClose: () => void; onSubmit: (report: Omit<StatusReportInput, "projectId" | "submitterId">) => void }) {
  const [health, setHealth] = useState<HealthSet>(calculated);
  const [reasons, setReasons] = useState<Reasons>({});
  const [accomplished, setAccomplished] = useState("");
  const [planned, setPlanned] = useState("");
  const [comments, setComments] = useState("");
  const [attempted, setAttempted] = useState(false);
  const missingReasons = dimensions.filter(({ key }) => health[key] !== calculated[key] && !reasons[key]?.trim());

  const submit = () => {
    setAttempted(true);
    if (missingReasons.length || !accomplished.trim() || !planned.trim()) return;
    onSubmit({
      health, accomplished: accomplished.trim(), planned: planned.trim(), comments: comments.trim(), aiDraft,
      overrideReasons: Object.fromEntries(dimensions.filter(({ key }) => health[key] !== calculated[key]).map(({ key }) => [key, reasons[key]?.trim()])) as Reasons,
    });
  };
  const [aiDraft, setAiDraft] = useState<StatusReport["aiDraft"]>();
  const draftEvidence = () => { if (!evidence) return; const text = evidenceDraft(evidence); setAccomplished(text.accomplished); setPlanned(text.planned); setComments(text.comments); setAiDraft(text); };
  const draft = () => {
    const text = activityDraft(tasks);
    setAccomplished(text.accomplished);
    setPlanned(text.planned);
  };

  if (!open) return null;
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="new-report-title">
    <button aria-label="Close new status report" className="absolute inset-0 bg-overlay" onClick={onClose}/>
    <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-7">
        <div><h2 id="new-report-title" className="font-display text-xl font-semibold">New status report</h2><p className="mt-1 text-sm text-muted-foreground">Reporting date {formatDate(todayIso())} · {submitter}</p></div>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X className="size-4"/></Button>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
        <section className="space-y-5"><div><h3 className="text-sm font-semibold">Health assessment</h3><p className="mt-1 text-xs text-muted-foreground">Current calculated values are pre-filled. Explain any manual change.</p></div>
          {dimensions.map(dimension => <HealthControl key={dimension.key} dimension={dimension} value={health[dimension.key]} calculated={calculated[dimension.key]} reason={reasons[dimension.key]} onChange={value => setHealth(current => ({ ...current, [dimension.key]: value }))} onReasonChange={value => setReasons(current => ({ ...current, [dimension.key]: value }))}/>)}
        </section>
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Progress narrative</h3><p className="mt-1 text-xs text-muted-foreground">Use recent task activity as a starting point, then refine it.</p></div><Button type="button" variant="outline" size="sm" onClick={draft}><Sparkles className="size-4"/>Draft from activity</Button><Button type="button" size="sm" disabled={!evidence} onClick={draftEvidence}><Sparkles className="size-4"/>Draft highlight report</Button></div>
          <div className="space-y-2"><Label htmlFor="accomplished">Accomplished</Label><Textarea id="accomplished" rows={4} value={accomplished} onChange={event => setAccomplished(event.target.value)} placeholder="Summarise progress since the last report"/></div>
          <div className="space-y-2"><Label htmlFor="planned">Planned</Label><Textarea id="planned" rows={4} value={planned} onChange={event => setPlanned(event.target.value)} placeholder="Summarise the next reporting period"/></div>
          <div className="space-y-2"><Label htmlFor="comments">Comments</Label><Textarea id="comments" rows={3} value={comments} onChange={event => setComments(event.target.value)} placeholder="Add context, decisions or support required"/></div>
        </section>
        {attempted && (missingReasons.length > 0 || !accomplished.trim() || !planned.trim()) && <div role="alert" className="rounded-md border border-health-bad/30 bg-health-bad/10 p-3 text-sm text-health-bad-foreground">Add Accomplished and Planned summaries, plus a reason for every health override.</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-4 sm:px-7"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="button" disabled={pending} onClick={submit}><Check className="size-4"/>Submit report</Button></div>
    </aside>
  </div>;
}

export function StatusWorkspace({ project, calculated }: { project: ProjectDetail; calculated: HealthSet }) {
  const query = useStatusReports(project.id);
  return <QueryState query={query}>{reports => <Status project={project} reports={reports} calculated={calculated} />}</QueryState>;
}

function Status({ project, reports, calculated }: { project: ProjectDetail; reports: StatusReport[]; calculated: HealthSet }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const { canEdit } = useProjectPermissions(project.id);
  const { profile } = useOrganisation();
  const me = useMyResourceId();
  const submitReport = useSubmitStatusReport();
  const tasks = useProjectTasks(project.id);
  const assurance = useAssuranceProjects();
  const raid = useRaid(project.id);
  const milestones = useMilestones([project.id], project.id);
  const benefits = useBenefits();
  const evidence = useMemo((): DraftEvidence | undefined => {
    const target = assurance.data?.find(item => item.id === project.id);
    if (!target || !raid.data || !milestones.data || !benefits.data) return undefined;
    const linked = benefitsForProject(benefits.data, project.id);
    return {
      assurance: getAssuranceRow(target),
      openRisks: raid.data.risks.filter(risk => risk.status === "Open").map(risk => ({ title: risk.title, score: risk.score })),
      milestones: milestones.data.filter(item => !item.actualDate).sort((a, b) => a.forecastDate.localeCompare(b.forecastDate)).map(item => ({ title: item.title, forecastDate: item.forecastDate, status: item.status })),
      benefits: { total: linked.length, realising: linked.filter(item => item.status === "In realisation" || item.status === "Realised").length },
    };
  }, [assurance.data, raid.data, milestones.data, benefits.data, project.id]);
  const chartData = useMemo(() => [...reports].reverse().map(report => ({ reportingDate: fromIsoDate(report.reportingDate), ...Object.fromEntries(dimensions.map(({ key }) => [key, healthValues[report[key]]])) })), [reports]);
  const submit = (report: Omit<StatusReportInput, "projectId" | "submitterId">) => submitReport.mutate({ ...report, projectId: project.id, submitterId: me }, {
    onSuccess: () => { toast.success("Status report submitted"); setPanelOpen(false); },
    onError: error => toast.error(error.message),
  });

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-xl font-semibold">Project status</h2><p className="mt-1 text-sm text-muted-foreground">Health history and submitted reporting narrative.</p></div>{canEdit && <Button onClick={() => setPanelOpen(true)}><Plus className="size-4"/>New status report</Button>}</div>
    <ChartCard title="Health trend" subtitle="Movement across submitted reports" info="Each line follows one health dimension across submitted project status reports." legend={dimensions.map(({key,label})=><LegendItem key={key} colour={chartConfig[key].color} label={label} shape="line"/>)}>
      <ChartContainer config={chartConfig} className="mt-5 h-72 w-full aspect-auto">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false}/><XAxis dataKey="reportingDate" tickLine={false} axisLine={false}/><YAxis domain={[0,3]} ticks={[0,1,2,3]} tickFormatter={value => valueHealth[value] ?? ""} width={70} tickLine={false} axisLine={false}/><Tooltip content={<TrendTooltip/>}/><Legend/>
          {dimensions.map(({ key }) => <Line key={key} dataKey={key} name={chartConfig[key].label as string} type="monotone" stroke={`var(--color-${key})`} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }}/>) }
        </LineChart>
      </ChartContainer>
    </ChartCard>
    <section><div className="mb-4 flex items-center gap-2"><Clock3 className="size-4 text-primary"/><h3 className="font-display text-lg font-semibold">Report timeline</h3><span className="text-sm text-muted-foreground">{reports.length} submitted</span></div>
      <div className="relative space-y-4 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-border sm:before:left-5">
        {reports.map((report, index) => { const overallOverride=report.overrideReasons?.overall; return <article key={report.id} className="relative ml-9 rounded-lg border border-border/70 bg-card p-5 shadow-sm sm:ml-12">
          <span className={cn("absolute -left-[2.1rem] top-5 grid size-7 place-items-center rounded-full border border-primary bg-background text-primary sm:-left-[2.75rem]", index === 0 && "bg-primary text-primary-foreground")}><FilePenLine className="size-3.5"/></span>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground"/><h4 className="font-semibold">{formatDate(report.reportingDate)}</h4>{index === 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase text-accent-foreground">Latest</span>}</div><p className="mt-1 text-xs text-muted-foreground">{report.ref} · Submitted by {report.submitter}{report.evidencedOverall ? ` · Evidence at submission: ${report.evidencedOverall}` : ""}</p></div><div className="flex flex-wrap gap-1.5">{overallOverride ? <HealthPill health={report.overall} override={{ health: report.overall, reason: overallOverride }}/> : <HealthPill health={report.overall}/>}</div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{dimensions.map(({ key, label }) => { const reason=report.overrideReasons?.[key]; return <div key={key} className="rounded-md bg-muted/60 p-2.5"><p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>{reason ? <HealthPill health={report[key]} override={{ health: report[key], reason }}/> : <HealthPill health={report[key]}/>}</div>})}</div>
          <div className="mt-5 grid gap-5 md:grid-cols-2"><div><p className="text-xs font-semibold">Accomplished</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{report.accomplished}</p></div><div><p className="text-xs font-semibold">Planned next</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{report.planned}</p></div></div>{report.aiDraft && <details className="mt-4 text-xs text-muted-foreground"><summary className="cursor-pointer">{report.aiDraft.exception ? "Exception report draft kept for audit" : "Original draft kept for audit"}</summary><p className="mt-2 whitespace-pre-line">{report.aiDraft.accomplished}

{report.aiDraft.planned}

{report.aiDraft.comments}</p></details>}
          {report.comments && <div className="mt-4 border-t border-border pt-4"><p className="text-xs font-semibold">Comments</p><p className="mt-1 text-sm text-muted-foreground">{report.comments}</p></div>}
        </article>})}
      </div>
    </section>
    <ReportPanel key={panelOpen ? "open" : "closed"} open={panelOpen} calculated={calculated} tasks={tasks.data?.tasks ?? []} evidence={evidence} submitter={profile.displayName} pending={submitReport.isPending} onClose={() => setPanelOpen(false)} onSubmit={submit}/>
  </div>;
}