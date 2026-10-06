import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BellRing, CheckCheck } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/today";
import { useBenefits } from "@/hooks/use-benefits";
import { useDependencies } from "@/hooks/use-dependencies";
import { useGovernance } from "@/hooks/use-governance";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { useIssuedTasks } from "@/hooks/use-issued-tasks";
import { usePortfolioTasks } from "@/hooks/use-work-items";
import { getMeasurementSchedule } from "@/services/benefits-value";
const title="Notifications — Virtual PMO",description="Everything the workspace has told you, and how you are told.";
export const Route=createFileRoute("/home/notifications")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});

interface FeedItem { id: string; date: string; kind: string; text: string; channel: "In-app" }
const READ_KEY = "virtual-pmo-notifications-read";
const readIds = (): string[] => { try { return JSON.parse(localStorage.getItem(READ_KEY) ?? "[]") as string[] } catch { return [] } };

/**
 * The feed is worked out from live data the user can see, newest first: their overdue tasks,
 * work issued to them awaiting a response, decisions past their needed-by date, overdue
 * benefit measurements they own and dependencies that are off track. Read state is kept per
 * browser (there is no notifications table yet).
 */
function useFeed(): FeedItem[] {
 const me = useMyResourceId();
 const tasks = usePortfolioTasks().data?.tasks ?? [];
 const issued = useIssuedTasks().data?.items ?? [];
 const decisions = useGovernance().data?.decisions ?? [];
 const benefits = useBenefits().data?.benefits ?? [];
 const dependencies = useDependencies().data?.dependencies ?? [];
 return useMemo(() => {
  const today = todayIso();
  const items: FeedItem[] = [];
  const mine = tasks.filter(task => me && task.assigneeIds.includes(me) && task.deliveryStatus === "Overdue");
  const byProject = new Map<string, number>();
  for (const task of mine) byProject.set(task.projectName, (byProject.get(task.projectName) ?? 0) + 1);
  for (const [project, count] of byProject) items.push({ id: `overdue:${project}`, date: today, kind: "Overdue alert", text: `${count} of your ${project} task${count === 1 ? " is" : "s are"} overdue.`, channel: "In-app" });
  for (const item of issued.filter(entry => entry.assigneeId === me && entry.status === "Issued")) items.push({ id: `issued:${item.offerId}`, date: item.issuedAt.slice(0, 10), kind: "Approval request", text: `${item.issuer} issued you “${item.title}” (${item.projectName}). Accept, decline or propose a date.`, channel: "In-app" });
  for (const decision of decisions.filter(entry => entry.status === "Pending" && entry.overdue)) items.push({ id: `decision:${decision.id}`, date: decision.neededBy, kind: "Decision", text: `${decision.reference} passed its needed-by date and is still pending at ${decision.forum}.`, channel: "In-app" });
  for (const due of getMeasurementSchedule(benefits.filter(benefit => me && benefit.ownerId === me)).filter(entry => entry.state === "Overdue")) items.push({ id: `measure:${due.measure.id}:${due.dueDate}`, date: due.dueDate, kind: "Measurement", text: `${due.benefit.reference} measurement “${due.measure.name}” is ${due.daysOverdue} day${due.daysOverdue === 1 ? "" : "s"} overdue.`, channel: "In-app" });
  for (const dependency of dependencies.filter(entry => entry.health === "Off Track")) items.push({ id: `dependency:${dependency.id}`, date: dependency.requiredBy, kind: "Dependency", text: `${dependency.reference} is off track: ${dependency.healthReason}`, channel: "In-app" });
  return items.sort((a, b) => b.date.localeCompare(a.date));
 }, [me, tasks, issued, decisions, benefits, dependencies]);
}

function Page(){
 const settings=useSettings();
 const feed=useFeed();
 const [read,setReadState]=useState<string[]>(readIds);
 const setRead=(update:(current:string[])=>string[])=>setReadState(current=>{const next=update(current);try{localStorage.setItem(READ_KEY,JSON.stringify(next))}catch{/* storage unavailable */}return next});
 const [filter,setFilter]=useState("All");
 const kinds=["All",...Array.from(new Set(feed.map(item=>item.kind)))];
 const shown=feed.filter(item=>filter==="All"||item.kind===filter);
 return <div className="space-y-6">
  <AutoBreadcrumbs/>
  <PageHeader eyebrow="Personal workspace" title="Notifications" description="Everything the workspace has raised with you. Channels and per-event toggles are configured in Settings → Notifications."
   actions={<Button variant="outline" onClick={()=>setRead(current=>Array.from(new Set([...current,...feed.map(item=>item.id)])))}><CheckCheck/>Mark all read</Button>}/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Unread" value={String(feed.filter(item=>!read.includes(item.id)).length)} detail={`${feed.length} needing attention`} icon="projects"/>
   <KpiCard label="Digest" value={settings.notifications.digest} detail="Delivery cadence" icon="forecast"/>
   <KpiCard label="Channels on" value={String(Object.values(settings.notifications.channels).filter(Boolean).length)} detail={Object.entries(settings.notifications.channels).filter(([,on])=>on).map(([name])=>name==="inApp"?"In-app":name==="email"?"Email":"Teams").join(", ")||"None"} icon="health"/>
   <KpiCard label="Events enabled" value={String(Object.values(settings.notifications.events).filter(Boolean).length)} detail={`of ${Object.keys(settings.notifications.events).length} event types`} icon="budget"/>
  </div>
  <div className="flex flex-wrap gap-2">{kinds.map(kind=><Button key={kind} size="sm" variant={filter===kind?"default":"outline"} onClick={()=>setFilter(kind)}>{kind}</Button>)}</div>
  <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm"><div className="divide-y">
   {shown.map(item=><button key={item.id} onClick={()=>setRead(current=>current.includes(item.id)?current:[...current,item.id])} className={cn("flex w-full items-start gap-3 p-4 text-left hover:bg-accent/30",!read.includes(item.id)&&"bg-primary/[0.03]")}>
    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><BellRing className="size-4"/></span>
    <div className="min-w-0 flex-1">
     <p className={cn("text-sm",!read.includes(item.id)&&"font-semibold")}>{item.text}</p>
     <p className="mt-1 text-xs text-muted-foreground">{item.kind} · {item.channel} · {formatDate(item.date)}</p>
    </div>
    {!read.includes(item.id)&&<span className="mt-2 size-2 shrink-0 rounded-full bg-primary"/>}
   </button>)}
   {!shown.length&&<p className="p-8 text-center text-sm text-muted-foreground">Nothing needs your attention.</p>}
  </div></div>
 </div>;
}
