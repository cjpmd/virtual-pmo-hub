import { AutoBreadcrumbs } from "@/components/section-nav";
import { formatDate } from "@/lib/format";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Diamond, History } from "lucide-react";
import { BoardWorkspace, DeliveryStatusIcon, type SavedView } from "@/components/board-workspace";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { milestoneColumns, milestonesToRows } from "@/lib/board-data";
import { getMilestoneMetrics, getPortfolioMilestones, getProgrammes, getProjects } from "@/services/pmo";
import { dependencyStrokeDash, getDependencies, healthStroke } from "@/services/dependencies";
import { formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/button";

export const Route=createFileRoute("/delivery/milestones")({head:()=>({meta:[{title:"Portfolio Milestones — Virtual PMO"},{name:"description",content:"Track portfolio milestones, stage gates, slippage and forecast trends."},{property:"og:title",content:"Portfolio Milestones — Virtual PMO"},{property:"og:description",content:"Track portfolio milestones, stage gates, slippage and forecast trends."},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}),component:MilestonesPage});

const parse=(value:string)=>{const [d=1,m=1,y=1970]=value.split("/").map(Number);return new Date(y,m-1,d)};
const day=(value:string)=>Math.round((parse(value).getTime()-parse("21/09/2026").getTime())/86400000);
const serial=(value:string)=>Math.round(parse(value).getTime()/86400000);
const shortDate=(value:number)=>formatShortDate(new Date(value*86400000));
const views:SavedView[]=[
 {id:"committee",name:"Committee milestones",type:"table",groupBy:"programme",sortKey:"finish",filter:"",filters:[{key:"reportToCommittee",operator:"truthy"}],visible:milestoneColumns.map(c=>c.key),isDefault:true},
 {id:"gates",name:"Gates",type:"table",groupBy:"programme",sortKey:"finish",filter:"",filters:[{key:"isGate",operator:"truthy"}],visible:milestoneColumns.map(c=>c.key),isDefault:false},
 {id:"overdue",name:"Overdue",type:"table",groupBy:"programme",sortKey:"finish",filter:"",filters:[{key:"overdue",operator:"truthy"}],visible:milestoneColumns.map(c=>c.key),isDefault:false},
 {id:"quarter",name:"This quarter",type:"table",groupBy:"programme",sortKey:"finish",filter:"",filters:[{key:"thisQuarter",operator:"truthy"}],visible:milestoneColumns.map(c=>c.key),isDefault:false},
];

function MilestoneList({title,items}:{title:string;items:ReturnType<typeof getPortfolioMilestones>}){return <section className="rounded-md border bg-card p-5 shadow-sm"><h2 className="font-display text-lg font-semibold">{title}</h2><div className="mt-4 divide-y">{items.slice(0,6).map(item=><Link key={`${item.projectId}-${item.id}`} to="/portfolio/projects/$projectId" params={{projectId:item.projectId}} className="flex items-start gap-3 py-3 hover:bg-accent/30"><DeliveryStatusIcon status={item.status}/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.projectName}</p></div><span className="shrink-0 text-xs text-muted-foreground">{item.actualDate??item.forecastDate}</span></Link>)}</div></section>}

const ROW_HEIGHT=56;
function PortfolioTimeline(){
 const programmes=getProgrammes(),items=getPortfolioMilestones();
 const [showLinks,setShowLinks]=useState(true);
 const start=parse("01/08/2026").getTime(),end=parse("31/01/2027").getTime();
 const position=(date:string)=>Math.max(0,Math.min(100,(parse(date).getTime()-start)/(end-start)*100));
 const rowIndex=(programmeId?:string)=>programmes.findIndex(programme=>programme.id===programmeId);
 // Dependency connectors between the giving milestone and the receiving side's required-by date.
 const connectors=getDependencies().flatMap(dependency=>{
  const fromRow=rowIndex(dependency.giverProgrammeId),toRow=rowIndex(dependency.receiverProgrammeId);
  if(fromRow<0||toRow<0)return [];
  const fromDate=dependency.giverMilestone?.forecastDate;
  if(!fromDate)return [];
  return [{dependency,x1:position(fromDate),y1:fromRow*ROW_HEIGHT+ROW_HEIGHT/2,x2:position(dependency.requiredBy),y2:toRow*ROW_HEIGHT+ROW_HEIGHT/2}];
 });
 return <section className="rounded-md border bg-card p-5 shadow-sm">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="font-display text-lg font-semibold">Portfolio milestone timeline</h2><p className="mt-1 text-xs text-muted-foreground">Forecast diamonds, slipped baseline positions and dependency connectors by programme</p></div>
   <div className="flex items-center gap-4 text-xs text-muted-foreground"><span>◇ Baseline</span><span className="text-primary">◆ Forecast</span><Button size="sm" variant={showLinks?"secondary":"outline"} onClick={()=>setShowLinks(value=>!value)} aria-pressed={showLinks}>{showLinks?"Hide":"Show"} dependencies</Button></div>
  </div>
  <div className="mt-5 overflow-x-auto"><div className="min-w-[820px]">
   <div className="ml-64 flex justify-between border-b pb-2 text-[10px] text-muted-foreground"><span>Aug</span><span>Sep</span><span>Oct</span><span>Nov</span><span>Dec</span><span>Jan</span></div>
   <div className="relative">
    {showLinks&&connectors.length>0&&<svg className="pointer-events-none absolute inset-y-0 right-0 z-20" style={{left:250}} width="100%" height={programmes.length*ROW_HEIGHT} aria-hidden>
     <defs>{["good","warn","bad"].map(tone=><marker key={tone} id={`ms-dep-${tone}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={`var(--health-${tone})`}/></marker>)}</defs>
     {connectors.map(({dependency,x1,y1,x2,y2})=>{const tone=dependency.health==="Off Track"?"bad":dependency.health==="At Risk"?"warn":"good";return <line key={dependency.id} x1={`${x1}%`} y1={y1} x2={`${x2}%`} y2={y2} stroke={healthStroke(dependency.health)} strokeWidth={1.8} strokeDasharray={dependencyStrokeDash(dependency.type)} markerEnd={`url(#ms-dep-${tone})`}><title>{`${dependency.reference}: ${dependency.giverLabel} → ${dependency.receiverLabel} (${dependency.type}, ${dependency.health})`}</title></line>})}
    </svg>}
    {programmes.map(programme=><div key={programme.id} className="grid grid-cols-[250px_1fr] border-b last:border-0" style={{height:ROW_HEIGHT}}>
     <p className="truncate self-center pr-4 text-xs font-medium">{programme.name}</p>
     <div className="relative my-2 bg-muted/30" style={{backgroundImage:"linear-gradient(to right,var(--border) 1px,transparent 1px)",backgroundSize:"20% 100%"}}>
      <span className="absolute inset-y-0 z-10 w-px bg-health-bad" style={{left:`${position("21/09/2026")}%`}}/>
      {items.filter(item=>item.programmeId===programme.id).flatMap(item=>[...(item.slipDays>0?[<Diamond key={`${item.projectId}-${item.id}-baseline`} className="absolute top-1/2 size-3 -translate-y-1/2 text-muted-foreground" style={{left:`${position(item.baselineDate)}%`}}/>]:[]),<span key={`${item.projectId}-${item.id}-forecast`} title={`${item.title} · ${formatDate(item.forecastDate)}`} className="absolute top-1/2 -translate-y-1/2" style={{left:`${position(item.forecastDate)}%`}}><Diamond className="size-3.5 fill-primary text-primary"/></span>])}
     </div>
    </div>)}
   </div>
  </div></div>
 </section>;
}

function MilestonesPage(){const items=getPortfolioMilestones(),metrics=getMilestoneMetrics(items),projects=getProjects();const [projectId,setProjectId]=useState("ebbot-chatbot");const recent=items.filter(item=>item.actualDate&&day(item.actualDate)>=-30&&day(item.actualDate)<=0).sort((a,b)=>day(b.actualDate??"")-day(a.actualDate??""));const upcoming=items.filter(item=>item.status!=="Completed"&&day(item.forecastDate)>=0&&day(item.forecastDate)<=30);const slipped=items.filter(item=>item.slipDays>0).sort((a,b)=>b.slipDays-a.slipDays).slice(0,12).map(item=>({name:item.title.length>24?`${item.title.slice(0,22)}…`:item.title,days:item.slipDays}));const selected=projects.find(project=>project.id===projectId)??projects[0];const trend=useMemo(()=>{if(!selected)return[];const dates=selected.milestones[0]?.forecastHistory.map(point=>point.reportingDate)??[];return dates.map((date,index)=>({date,...Object.fromEntries(selected.milestones.map(item=>[item.id,serial(item.forecastHistory[index]?.forecastDate??item.forecastDate)]))}))},[selected]);return <div className="space-y-8"><AutoBreadcrumbs/><PageHeader eyebrow="Portfolio controls" title="Milestones" description="Track critical dates, stage gates and movement against baseline across the portfolio."/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><KpiCard label="Completed" value={String(metrics.completed)} detail="Last 30 days" icon="health"/><KpiCard label="Due next" value={String(metrics.upcoming)} detail="Next 30 days" icon="projects"/><KpiCard label="Overdue" value={String(metrics.overdue)} detail="Needs recovery action" icon="health"/><KpiCard label="Slipped" value={String(metrics.slipped)} detail="Against baseline" icon="forecast"/><KpiCard label="Hit on time" value={`${metrics.percentOnTime}%`} detail="Last 90 days" icon="health"/></div><div className="grid gap-5 lg:grid-cols-2"><MilestoneList title="Recent milestones" items={recent}/><MilestoneList title="Upcoming milestones" items={upcoming}/></div><PortfolioTimeline/><div className="grid gap-5 xl:grid-cols-2"><section className="rounded-md border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><History className="size-4 text-primary"/><h2 className="font-display text-lg font-semibold">Milestone slippage</h2></div><p className="mt-1 text-xs text-muted-foreground">Forecast days beyond baseline, highest slip first</p><div className="mt-4 h-80"><ResponsiveContainer><BarChart data={slipped} layout="vertical" margin={{left:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" unit="d"/><YAxis dataKey="name" type="category" width={145} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="days" fill="var(--health-warn)" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer></div></section><section className="rounded-md border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-lg font-semibold">Milestone Trend Analysis</h2><p className="mt-1 text-xs text-muted-foreground">Forecast date movement at each reporting point</p></div><select aria-label="Trend project" value={projectId} onChange={event=>setProjectId(event.target.value)} className="h-9 max-w-64 rounded-md border bg-background px-3 text-sm">{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div className="mt-4 h-80"><ResponsiveContainer><LineChart data={trend}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis domain={["dataMin-3","dataMax+3"]} tickFormatter={shortDate} width={58} tick={{fontSize:10}}/><Tooltip formatter={(value)=>shortDate(Number(value))}/>{selected?.milestones.map((item,index)=><Line key={item.id} type="monotone" dataKey={item.id} name={item.title} stroke={`var(--chart-${index%5+1})`} strokeWidth={2} dot={{r:3}}/>)}</LineChart></ResponsiveContainer></div></section></div><section><div className="mb-4"><h2 className="font-display text-lg font-semibold">Milestone register</h2><p className="text-xs text-muted-foreground">All project milestones with governed dates, ownership and committee reporting.</p></div><BoardWorkspace title="Milestones" rows={milestonesToRows(items)} columns={milestoneColumns} groupOptions={["programme","project","type","deliveryStatus","people"]} seededViews={views} renderTitle={row=><Link to="/portfolio/projects/$projectId" params={{projectId:String(row["projectId"])}} className="text-primary hover:underline">{row.title}</Link>}/></section></div>}