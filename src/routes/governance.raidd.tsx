import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Gavel, Lightbulb, ShieldAlert } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { AssumptionsWorkspace } from "@/components/assumptions-workspace";
import { DecisionsWorkspace } from "@/components/decisions-workspace";
import { BoardWorkspace } from "@/components/board-workspace";
import { RaidWorkspace } from "@/components/raid-workspace";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { issueColumns, issuesToRows } from "@/lib/board-data";
import { getAssumptionMetrics, getDecisionMetrics } from "@/services/decisions";
import { toIssue, toRisk } from "@/components/project-raid";
import { usePeople, useOrgRaid } from "@/hooks/use-hierarchy";
import { useGovernance } from "@/hooks/use-governance";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";
import { QueryError } from "@/components/query-state";

const tabs = [
  { id: "risks", label: "Risks", icon: ShieldAlert },
  { id: "assumptions", label: "Assumptions", icon: Lightbulb },
  { id: "issues", label: "Issues", icon: CircleAlert },
  { id: "decisions", label: "Decisions", icon: Gavel },
] as const;
type TabId = (typeof tabs)[number]["id"];

const title = "RAIDD — Virtual PMO", description = "Risks, assumptions, issues and decisions across the portfolio.";
export const Route = createFileRoute("/governance/raidd")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId } => {
    const tab = String(search["tab"] ?? "");
    return tabs.some(item => item.id === tab) ? { tab: tab as TabId } : {};
  },
  head: () => ({ meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Page,
});

function Page() {
  const settings = useSettings();
  const search = useSearch({ from: "/governance/raidd" });
  const navigate = useNavigate();
  const active: TabId = search.tab ?? "risks";
  const setActive = (tab: TabId) => navigate({ to: "/governance/raidd", search: { tab }, replace: true });

  const raid = useOrgRaid();
  const governance = useGovernance();
  const people = usePeople();
  const names = useMemo(() => new Map((people.data ?? []).map(person => [person.id, person.name])), [people.data]);
  const risks = useMemo(() => (raid.data?.risks ?? []).map(item => ({ ...toRisk(item, names), projectCode: item.projectCode, projectName: item.projectName, programmeName: item.programmeName })), [raid.data, names]);
  const issues = useMemo(() => (raid.data?.issues ?? []).map(item => ({ ...toIssue(item, names), projectName: item.projectName, programmeName: item.programmeName })), [raid.data, names]);
  const assumptions = governance.data?.assumptions ?? [];
  const decisions = governance.data?.decisions ?? [];
  const assumptionMetrics = getAssumptionMetrics(assumptions);
  const decisionMetrics = getDecisionMetrics(decisions);
  const bands = settings.risk.bands;
  const bandFor = (score: number) => [...bands].sort((a, b) => b.minScore - a.minScore).find(band => score >= band.minScore);

  return <div className="space-y-6">
    <AutoBreadcrumbs />
    {(raid.isError || governance.isError) && <QueryError error={raid.error ?? governance.error} retry={() => { void raid.refetch(); void governance.refetch(); }} />}
    <PageHeader eyebrow="Governance" title="RAIDD" description="One register for risks, assumptions, issues and decisions. Matrix size, score bands and option lists are configured in Settings → Risk & RAIDD." />

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Open risks" value={String(risks.filter(item => item.status === "Open").length)} detail={`${risks.filter(item => item.score >= settings.risk.appetiteThreshold).length} above risk appetite`} icon="health" />
      <KpiCard label="Open assumptions" value={String(assumptionMetrics.open)} detail={`${assumptionMetrics.invalidated} invalidated`} icon="projects" />
      <KpiCard label="Open issues" value={String(issues.filter(item => item.status === "Open").length)} detail={`${issues.filter(item => item.severity === "High" && item.status === "Open").length} high severity`} icon="health" />
      <KpiCard label="Pending decisions" value={String(decisionMetrics.pending)} detail={`${decisionMetrics.overdue} overdue`} icon="forecast" />
    </div>

    <nav aria-label="RAIDD registers" className="flex overflow-x-auto rounded-lg border border-border/70 bg-card p-1 shadow-sm">
      {tabs.map(tab => {
        const Icon = tab.icon;
        return <button key={tab.id} onClick={() => setActive(tab.id)} className={cn("flex h-9 flex-1 min-w-32 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
          active === tab.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
          <Icon className="size-4" />{tab.label}
        </button>;
      })}
    </nav>

    {active === "risks" && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-xs">
        <span className="font-semibold">Score bands</span>
        {bands.map(band => <span key={band.id} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: band.colour }} />{band.label} ({band.minScore}+)</span>)}
        <span className="ml-auto text-muted-foreground">Risk appetite threshold: {settings.risk.appetiteThreshold} · {risks.filter(item => item.score >= settings.risk.appetiteThreshold).length} risks above it</span>
      </div>
      <p className="text-xs text-muted-foreground">Edit a risk or issue on its project's RAID tab, where changes are checked against your project permissions.</p>
      <RaidWorkspace risks={risks} issues={[]} editable={false} />
      <section>
        <h2 className="font-display text-lg font-semibold">Risks above appetite</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {risks.filter(item => item.status === "Open" && item.score >= settings.risk.appetiteThreshold).slice(0, 12).map(risk => <Link key={risk.id} to={risk.projectCode ? "/portfolio/projects/$projectCode" : "/governance/raidd"} params={{ projectCode: risk.projectCode ?? "" }} className="rounded-lg border border-border/70 bg-card p-3 hover:bg-accent/40">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{risk.title}</p>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold text-primary-foreground" style={{ background: bandFor(risk.score)?.colour }}>{risk.score}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{risk.projectName} · {risk.owner}</p>
          </Link>)}
        </div>
      </section>
    </div>}

    {active === "assumptions" && <AssumptionsWorkspace />}

    {active === "issues" && <div className="space-y-5">
      <BoardWorkspace title="Issue register" itemLabel="issue" rows={issuesToRows(issues).map((row, index) => ({ ...row, project: issues[index]?.projectName ?? "", group: issues[index]?.programmeName ?? "Unassigned" }))} manage={false} columns={[...issueColumns, { key: "project", label: "Project", type: "text" as const, width: 240 }].map(column => ({ ...column, editable: false }))} groupOptions={["group", "status", "priority"]} />
      {!issues.length && <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No issues are open across the portfolio.</p>}
    </div>}

    {active === "decisions" && <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
        <span className="text-muted-foreground">Running a board? The forum view builds the agenda and records outcomes as you go.</span>
        <Button size="sm" variant="outline" asChild className="ml-auto"><Link to="/governance/forum">Open the decision forum</Link></Button>
      </div>
      <DecisionsWorkspace />
    </div>}
  </div>;
}
