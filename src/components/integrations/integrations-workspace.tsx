import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toProjectCode } from "@/services/legacy-bridge";
import { AlertTriangle, CheckCircle2, Clock, LoaderCircle, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard, MetricRow } from "@/components/charts/kpi-card";
import { SettingsCard } from "@/components/settings/settings-shell";
import { disconnect, resolveConflict, retryOutbox, startConsent, syncNow, unlinkPlan, useIntegrations } from "@/services/integrations";
import { getProjects } from "@/services/pmo";
import type { SyncLogEntry } from "@/data/integrations";
import { cn } from "@/lib/utils";

const tone = { Healthy: "text-health-good-foreground bg-health-good/15", Warning: "text-health-warn-foreground bg-health-warn/20", Failing: "text-health-bad-foreground bg-health-bad/15" } as const;
const th = "h-10 px-3 font-semibold";

export function IntegrationsWorkspace() {
  const s = useIntegrations();
  const names = Object.fromEntries(getProjects().map(p => [p.id, p.name]));
  const [kind, setKind] = useState<SyncLogEntry["kind"] | "All">("All");
  const c = s.connection;
  const open = s.conflicts.filter(x => !x.resolved);

  return <>
    <MetricRow>
      <MetricCard label="Connection" value={c.status} context={c.tenantDomain} icon={<CheckCircle2 className="size-4" />} />
      <MetricCard label="Linked plans" value={String(s.links.length)} context={`${s.links.filter(l => l.health !== "Healthy").length} need attention`} icon={<RefreshCw className="size-4" />} />
      <MetricCard label="Pending changes" value={String(s.outbox.length)} context={`${s.outbox.filter(o => o.status === "Failed").length} failed`} icon={<Clock className="size-4" />} />
      <MetricCard label="Open conflicts" value={String(open.length)} context="Planner wins by default" icon={<AlertTriangle className="size-4" />} />
    </MetricRow>

    <SettingsCard title="Microsoft 365" description="Connection used for Planner sync and the people directory." actions={c.status === "Connected" ? <Button size="sm" variant="outline" onClick={disconnect}>Simulate expired access</Button> : <Button size="sm" onClick={startConsent}>Reconnect Microsoft 365</Button>}>
      {c.status === "Needs reconnect" && <div className="mb-4 flex items-center gap-2 rounded-md border border-health-bad/40 bg-health-bad/10 p-3 text-sm"><AlertTriangle className="size-4" />Access has expired. Sync is paused until someone reconnects Microsoft 365.</div>}
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Organisation</dt><dd className="font-medium">{c.tenantName}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Connected by</dt><dd className="font-medium">{c.connectedBy ?? "—"} {c.connectedOn && `on ${c.connectedOn}`}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Environments</dt><dd className="break-all font-medium">{c.environments.join(", ")}</dd></div>
        <div><dt className="text-xs text-muted-foreground"><Users className="mr-1 inline size-3" />People directory</dt><dd className="font-medium">{c.directoryPeople} people · {c.directorySyncedAt}</dd></div>
      </dl>
      <div className="mt-4"><Button size="sm" variant="outline" asChild><Link to="/connect-microsoft">Find and link more plans</Link></Button></div>
    </SettingsCard>

    <SettingsCard title="Linked plans" description="Projects whose tasks sync with Microsoft Planner.">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className={th}>Project</th><th className={th}>Plan type</th><th className={th}>Last sync</th><th className={th}>How changes arrive</th><th className={th}>Health</th><th className={th} /></tr></thead>
        <tbody>{s.links.map(l => { const busy = s.syncing.includes(l.projectId); return <tr key={l.projectId} className="border-t">
          <td className="px-3 py-2.5 font-medium"><Link to="/projects/$projectCode" params={{ projectCode: toProjectCode(l.projectId) }} className="hover:underline">{names[l.projectId] ?? l.projectId}</Link></td>
          <td className="px-3">Planner {l.kind}</td><td className="px-3 tabular-nums text-muted-foreground">{l.lastSync}</td><td className="px-3">{l.mode}</td>
          <td className="px-3"><span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", tone[l.health])}>{l.health}</span></td>
          <td className="space-x-1 whitespace-nowrap px-3 text-right"><Button size="sm" variant="outline" disabled={busy} onClick={() => syncNow(l.projectId)}>{busy ? <><LoaderCircle className="animate-spin" />Syncing…</> : "Sync now"}</Button><Button size="sm" variant="ghost" onClick={() => unlinkPlan(l.projectId)}>Unlink</Button></td>
        </tr>; })}</tbody>
      </table></div>
    </SettingsCard>

    <SettingsCard title="Pending changes" description="Edits waiting to be sent to Planner. Failed changes retry automatically.">
      {s.outbox.length === 0 ? <p className="text-sm text-muted-foreground">Nothing waiting. All changes have reached Planner.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className={th}>Change</th><th className={th}>Project</th><th className={th}>By</th><th className={th}>Status</th><th className={th}>Attempts</th><th className={th} /></tr></thead>
        <tbody>{s.outbox.map(o => <tr key={o.id} className="border-t align-top">
          <td className="px-3 py-2.5">{o.change}{o.lastError && <p className="text-xs text-health-bad-foreground">{o.lastError}</p>}</td>
          <td className="px-3 py-2.5">{names[o.projectId]}</td><td className="px-3 py-2.5">{o.by}</td>
          <td className="px-3 py-2.5"><Badge variant={o.status === "Failed" ? "destructive" : "secondary"}>{o.status}</Badge></td><td className="px-3 py-2.5 tabular-nums">{o.attempts}</td>
          <td className="px-3 py-2.5 text-right">{o.status !== "Sending" && <Button size="sm" variant="outline" onClick={() => retryOutbox(o.id)}>Retry now</Button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </SettingsCard>

    <SettingsCard title="Conflicts" description="When a task changes in both places, Planner's version is kept and the difference is shown here.">
      <div className="space-y-3">{s.conflicts.map(x => <div key={x.id} className="flex flex-wrap items-center gap-3 rounded-md border p-4 text-sm">
        <div className="min-w-0 flex-1"><p className="font-semibold">{x.task} · {x.field}</p><p className="text-xs text-muted-foreground">{names[x.projectId]} · changed in Planner by {x.changedInPlannerBy} at {x.at}</p>
          <p className="mt-1">Planner: <strong>{x.plannerValue}</strong> · Virtual PMO: <strong>{x.ourValue}</strong></p></div>
        {x.resolved ? <span className="text-xs font-semibold text-muted-foreground">{x.resolved}</span> : <><Button size="sm" variant="outline" onClick={() => resolveConflict(x.id, "Kept Planner")}>Keep Planner</Button><Button size="sm" onClick={() => resolveConflict(x.id, "Reapplied")}>Reapply mine</Button></>}
      </div>)}</div>
    </SettingsCard>

    <SettingsCard title="Sync log" description="Recent activity between Virtual PMO and Microsoft." actions={<select className="h-8 rounded-md border bg-background px-2 text-xs" value={kind} onChange={e => setKind(e.target.value as typeof kind)} aria-label="Filter log">{["All", "Read", "Write", "Throttled", "Failed", "Deleted", "Directory"].map(k => <option key={k}>{k}</option>)}</select>}>
      <ul className="divide-y text-sm">{s.log.filter(l => kind === "All" || l.kind === kind).slice(0, 25).map(l => <li key={l.id} className="flex flex-wrap gap-3 py-2">
        <span className="w-32 tabular-nums text-muted-foreground">{l.at}</span><Badge variant={l.kind === "Failed" ? "destructive" : "outline"}>{l.kind}</Badge><span className="flex-1">{l.message}{l.projectId && <span className="text-muted-foreground"> · {names[l.projectId]}</span>}</span>
      </li>)}</ul>
    </SettingsCard>

    <SettingsCard title="Going live" description="Steps needed before this prototype talks to real Microsoft 365.">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Get a test Dataverse environment with Planner Premium, plus a few test Basic plans.</li>
        <li>Register "Virtual PMO" in Microsoft Entra as a multi-tenant app.</li>
        <li>Add the Microsoft Graph and Dataverse permissions and get admin consent.</li>
        <li>Add the app as a Dataverse application user with a read role.</li>
        <li>Turn on the backend, store the app credentials securely and build the sync.</li>
        <li>Pilot with two or three live projects, including Ebbot, alongside the Accelerator.</li>
      </ol>
    </SettingsCard>
  </>;
}
