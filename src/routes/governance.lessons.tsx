import { AutoBreadcrumbs } from "@/components/section-nav";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CircleAlert, Download, Plus, Repeat2, Upload } from "lucide-react";
import { BoardWorkspace } from "@/components/board-workspace";
import { LessonsImport } from "@/components/lessons-import";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { lessonColumns, lessonsToRows, lessonViews } from "@/lib/lesson-board-data";
import { getLessonCoverage, getLessonMetrics, getLessons, getRecurringThemes, groupLessons, lessonsToCsv, type RecurringTheme } from "@/services/lessons";
import { cn } from "@/lib/utils";

const title = "Lessons Overview — Virtual PMO", description = "Portfolio lessons learned, recurring themes, coverage and improvement actions.";
export const Route = createFileRoute("/governance/lessons")({ head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }), component: Page });

function Page() {
  const lessons = useMemo(() => getLessons(), []);
  const metrics = getLessonMetrics(lessons);
  const themes = getRecurringThemes(lessons);
  const coverage = getLessonCoverage();
  const byCategory = groupLessons(lessons, "category");
  const byPhase = groupLessons(lessons, "phaseName");
  const byProject = groupLessons(lessons, "projectName");
  const [importOpen, setImportOpen] = useState(false);
  const [raised, setRaised] = useState<string[]>([]);

  const exportCsv = () => {
    const blob = new Blob([lessonsToCsv(lessons)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "lessons-learned.csv"; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="space-y-6">
    <AutoBreadcrumbs/><PageHeader eyebrow="Continuous improvement" title="Lessons" description="Turning lessons identified into lessons learned: what keeps happening, what we changed because of it, and which projects are not looking back at all."
      actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setImportOpen(true)}><Upload />Import lessons</Button><Button variant="outline" onClick={exportCsv}><Download />Export CSV</Button></div>} />
    

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard label="Lessons logged" value={String(metrics.total)} detail={`Across ${metrics.projectsWithLessons} projects`} icon="projects" />
      <KpiCard label="Problems vs successes" value={`${metrics.problems} / ${metrics.successes}`} detail="Problem lessons against successes" icon="health" />
      <KpiCard label="Open improvement actions" value={String(metrics.openActions)} detail="Not yet done" icon="forecast" />
      <KpiCard label="Lessons embedded" value={String(metrics.embedded)} detail="In a template, gate or standard" icon="budget" />
      <KpiCard label="Projects with no recent lessons" value={String(metrics.staleProjects)} detail="Nothing logged in 90 days" icon="health" />
    </div>

    <section className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2"><Repeat2 className="size-5 text-primary" /><div><h2 className="font-display text-lg font-semibold">Recurring themes</h2><p className="text-sm text-muted-foreground">Categories where the same kind of problem has appeared in three or more projects.</p></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {themes.map(theme => <ThemeCard key={theme.category} theme={theme} raised={raised.includes(theme.category)} onRaise={() => setRaised(current => [...current, theme.category])} />)}
        {!themes.length && <p className="text-sm text-muted-foreground">No category has problem lessons across three or more projects.</p>}
      </div>
    </section>

    <div className="grid gap-5 xl:grid-cols-2">
      <Chart title="Lessons by category" note="Success against problem for each category." data={byCategory} height={420} vertical />
      <div className="space-y-5">
        <Chart title="Lessons by phase" note="Where in the lifecycle lessons are captured." data={byPhase} height={190} />
        <Chart title="Lessons by project" note="Which projects are contributing." data={byProject} height={190} />
      </div>
    </div>

    <section className="rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-2 border-b p-5"><CircleAlert className="size-5 text-primary" /><div><h2 className="font-display text-lg font-semibold">Coverage</h2><p className="text-sm text-muted-foreground">Active projects and their last lessons review. Red where a phase gate passed without one.</p></div></header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-11 px-4 font-semibold">Project</th><th className="px-4 font-semibold">Stage</th><th className="px-4 font-semibold">Gates passed</th><th className="px-4 font-semibold">Reviews held</th><th className="px-4 font-semibold">Last review</th><th className="px-4 font-semibold">Lessons</th></tr></thead>
          <tbody>
            {coverage.map(row => <tr key={row.projectId} className={cn("border-t", row.overdue && "bg-health-bad/5")}>
              <td className="px-4 py-3"><Link to="/portfolio/projects/$projectId" params={{ projectId: row.projectId }} className="font-medium text-primary hover:underline">{row.projectName}</Link></td>
              <td className="px-4 py-3 text-muted-foreground">{row.stage}</td>
              <td className="px-4 py-3">{row.gatesPassed}</td>
              <td className="px-4 py-3">{row.reviewsHeld}</td>
              <td className={cn("px-4 py-3", row.overdue && "font-semibold text-health-bad-foreground")}>{row.lastReviewDate ?? "Never"}</td>
              <td className="px-4 py-3">{row.lessonCount}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>

    <BoardWorkspace title="Lessons log" rows={lessonsToRows(lessons)} columns={lessonColumns} groupOptions={["group", "project", "phase", "lessonStatus"]} seededViews={lessonViews} />

    {importOpen && <LessonsImport lessons={lessons} close={() => setImportOpen(false)} />}
  </div>;
}

function ThemeCard({ theme, raised, onRaise }: { theme: RecurringTheme; raised: boolean; onRaise: () => void }) {
  const [open, setOpen] = useState(false);
  return <div className="rounded-md border border-health-warn/40 bg-health-warn/5 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <p className="font-semibold">{theme.category}</p>
        <p className="mt-1 text-xs text-muted-foreground">{theme.lessons.length} problem lessons across {theme.projectCount} projects: {theme.projects.join(", ")}</p>
      </div>
      {raised ? <span className="rounded-full bg-health-good/20 px-2.5 py-1 text-xs font-semibold text-health-good-foreground">Improvement action raised</span>
        : <Button size="sm" variant="outline" onClick={onRaise}><Plus />Raise improvement action</Button>}
    </div>
    <button onClick={() => setOpen(value => !value)} className="mt-3 text-xs font-semibold text-primary hover:underline">{open ? "Hide" : "Show"} the {theme.lessons.length} linked lessons</button>
    {open && <div className="mt-2 space-y-2">{theme.lessons.map(lesson => <div key={lesson.id} className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium">{lesson.reference} · {lesson.summary}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{lesson.projectName} · {lesson.phaseName} · {lesson.status}</p>
      <p className="mt-1 text-[11px] text-muted-foreground"><strong>Recommendation:</strong> {lesson.recommendation}</p>
    </div>)}</div>}
  </div>;
}

function Chart({ title: heading, note, data, height, vertical = false }: { title: string; note: string; data: Array<{ name: string; problems: number; successes: number }>; height: number; vertical?: boolean }) {
  return <section className="rounded-lg border bg-card p-5 shadow-sm">
    <h2 className="font-display text-lg font-semibold">{heading}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{note}</p>
    <div style={{ height }} className="mt-4">
      <ResponsiveContainer>
        <BarChart data={data} layout={vertical ? "vertical" : "horizontal"} margin={{ left: 8, right: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          {vertical ? <><XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} /><YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 11 }} /></>
            : <><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={52} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={30} /></>}
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="problems" name="Problem" stackId="a" fill="var(--health-bad)" radius={vertical ? [0, 0, 0, 0] : [0, 0, 0, 0]} />
          <Bar dataKey="successes" name="Success" stackId="a" fill="var(--health-good)" radius={vertical ? [0, 3, 3, 0] : [3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </section>;
}
