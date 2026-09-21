import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BellRing, CheckCheck, Mail, MessageSquare } from "lucide-react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useSettings } from "@/services/settings";
import { cn } from "@/lib/utils";
const title="Notifications — Virtual PMO",description="Everything the workspace has told you, and how you are told.";
export const Route=createFileRoute("/home/notifications")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});

const feed=[
 {id:"nf-1",date:"21/09/2026",kind:"Mention",text:"Maya Harrison mentioned you on Ebbot (chatbot): “can you confirm the pilot data owners?”",channel:"In-app"},
 {id:"nf-2",date:"21/09/2026",kind:"Overdue alert",text:"3 Ebbot (chatbot) tasks are overdue.",channel:"Email"},
 {id:"nf-3",date:"20/09/2026",kind:"Dependency",text:"DEP-008 went off track: Network stable is forecast after the VDI required-by date.",channel:"In-app"},
 {id:"nf-4",date:"19/09/2026",kind:"Measurement",text:"BEN-003 measurement is 6 days overdue. The benefit owner has been reminded.",channel:"Email"},
 {id:"nf-5",date:"18/09/2026",kind:"Decision",text:"DEC-004 passed its needed-by date and is still pending at Project Board.",channel:"In-app"},
 {id:"nf-6",date:"18/09/2026",kind:"Reminder",text:"Status report due Friday for 4 projects you manage.",channel:"Teams"},
 {id:"nf-7",date:"17/09/2026",kind:"Approval request",text:"Digital assessment pilot awaits your approval.",channel:"In-app"},
 {id:"nf-8",date:"16/09/2026",kind:"Lessons",text:"Windows 11 Rollout passed a phase gate without a lessons review.",channel:"In-app"},
];

function Page(){
 const settings=useSettings();
 const [read,setRead]=useState<string[]>(["nf-7","nf-8"]);
 const [filter,setFilter]=useState("All");
 const kinds=["All",...Array.from(new Set(feed.map(item=>item.kind)))];
 const shown=feed.filter(item=>filter==="All"||item.kind===filter);
 return <div className="space-y-7">
  <AutoBreadcrumbs/>
  <PageHeader eyebrow="Personal workspace" title="Notifications" description="Everything the workspace has raised with you. Channels and per-event toggles are configured in Settings → Notifications."
   actions={<Button variant="outline" onClick={()=>setRead(feed.map(item=>item.id))}><CheckCheck/>Mark all read</Button>}/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Unread" value={String(feed.length-read.length)} detail={`${feed.length} in the last 7 days`} icon="projects"/>
   <KpiCard label="Digest" value={settings.notifications.digest} detail="Delivery cadence" icon="forecast"/>
   <KpiCard label="Channels on" value={String(Object.values(settings.notifications.channels).filter(Boolean).length)} detail={Object.entries(settings.notifications.channels).filter(([,on])=>on).map(([name])=>name==="inApp"?"In-app":name==="email"?"Email":"Teams").join(", ")||"None"} icon="health"/>
   <KpiCard label="Events enabled" value={String(Object.values(settings.notifications.events).filter(Boolean).length)} detail={`of ${Object.keys(settings.notifications.events).length} event types`} icon="budget"/>
  </div>
  <div className="flex flex-wrap gap-2">{kinds.map(kind=><Button key={kind} size="sm" variant={filter===kind?"default":"outline"} onClick={()=>setFilter(kind)}>{kind}</Button>)}</div>
  <div className="overflow-hidden rounded-lg border bg-card shadow-sm"><div className="divide-y">
   {shown.map(item=><button key={item.id} onClick={()=>setRead(current=>current.includes(item.id)?current:[...current,item.id])} className={cn("flex w-full items-start gap-3 p-4 text-left hover:bg-accent/30",!read.includes(item.id)&&"bg-primary/[0.03]")}>
    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">{item.channel==="Email"?<Mail className="size-4"/>:item.channel==="Teams"?<MessageSquare className="size-4"/>:<BellRing className="size-4"/>}</span>
    <div className="min-w-0 flex-1">
     <p className={cn("text-sm",!read.includes(item.id)&&"font-semibold")}>{item.text}</p>
     <p className="mt-1 text-xs text-muted-foreground">{item.kind} · {item.channel} · {formatDate(item.date)}</p>
    </div>
    {!read.includes(item.id)&&<span className="mt-2 size-2 shrink-0 rounded-full bg-primary"/>}
   </button>)}
  </div></div>
 </div>;
}
