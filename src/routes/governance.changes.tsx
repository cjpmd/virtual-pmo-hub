import { createFileRoute, Link } from "@tanstack/react-router";
import { toProjectCode } from "@/services/legacy-bridge";
import { useMemo } from "react";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { BoardWorkspace, type BoardColumn } from "@/components/board-workspace";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { formatCompactCurrency } from "@/lib/format";
import { getPortfolioChanges } from "@/services/pmo";
import { useSettings } from "@/services/settings";
const title="Change Control — Virtual PMO",description="Change requests across the portfolio with cost and schedule impact.";
export const Route=createFileRoute("/governance/changes")({head:()=>({meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:Page});

function Page(){
 const settings=useSettings();
 const changes=useMemo(()=>getPortfolioChanges(),[]);
 const columns:BoardColumn[]=[
  {key:"title",label:"Change request",type:"text",summary:"count",width:300},
  {key:"project",label:"Project",type:"text",width:240},
  {key:"changeType",label:"Type",type:"status",editable:true,options:settings.lists.changeTypes},
  {key:"people",label:"Requested by",type:"people"},
  {key:"number",label:"Cost impact",type:"number",unit:"currency",summary:"sum"},
  {key:"days",label:"Schedule impact",type:"number",unit:" days",summary:"sum"},
  {key:"status",label:"Status",type:"status",editable:true,options:["Proposed","Approved","Rejected"]},
 ];
 const rows=changes.map(change=>({id:`${change.projectId}-${change.id}`,title:change.title,project:change.projectName,changeType:change.type,people:[change.requestedBy],number:change.costImpact,days:change.scheduleImpactDays,status:change.status,group:change.programmeName}));
 const approved=changes.filter(item=>item.status==="Approved");
 return <div className="space-y-6">
  <AutoBreadcrumbs/>
  <PageHeader eyebrow="Governance" title="Changes" description="Every change request raised against a project, with its approved cost and schedule impact. Change types are configured in Settings → Risk & RAIDD."/>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <KpiCard label="Change requests" value={String(changes.length)} detail={`Across ${new Set(changes.map(item=>item.projectId)).size} projects`} icon="projects"/>
   <KpiCard label="Awaiting decision" value={String(changes.filter(item=>item.status==="Proposed").length)} detail="Proposed and not yet decided" icon="health"/>
   <KpiCard label="Approved cost impact" value={formatCompactCurrency(approved.reduce((sum,item)=>sum+item.costImpact,0))} detail={`${approved.length} approved changes`} icon="budget"/>
   <KpiCard label="Approved schedule impact" value={`${approved.reduce((sum,item)=>sum+item.scheduleImpactDays,0)} days`} detail="Added across the portfolio" icon="forecast"/>
  </div>
  <BoardWorkspace title="Change register" itemLabel="change request" rows={rows} columns={columns} groupOptions={["group","status","changeType"]}
   renderTitle={row=><Link to="/portfolio/projects/$projectCode" params={{ projectCode: toProjectCode(String(row.id).split("-cr")[0]??"") }} className="text-primary hover:underline">{row.title}</Link>}/>
  {!changes.length&&<p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No change requests have been raised.</p>}
 </div>;
}
