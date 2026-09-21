import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Circle, ExternalLink, Gavel, ListChecks, ListPlus, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthPill } from "@/components/health-pill";
import { Fact, KpiCard } from "@/components/pmo-ui";
import { getEffortHealth, getFinancialHealth, getIssueHealth, getProgramme, getProject, getProjectBenefits, getProjectBenefitHealth, getProjectHealth, getProjectTeam, getScheduleHealth, getLifecyclePhases, getPhaseForStage, getPhaseIndex, getTierDefinitions } from "@/services/pmo";
import { TaskWorkspace } from "@/components/task-workspace";
import { StatusWorkspace } from "@/components/status-workspace";
import { ProjectResources } from "@/components/project-resources";
import { RaidWorkspace } from "@/components/raid-workspace";
import { FavouriteButton } from "@/components/favourite-button";
import { DeliveryStatusIcon } from "@/components/board-workspace";
import { openIssueTask } from "@/components/issue-task-sheet";
import { BenefitSummary } from "@/components/benefit-summary";
import { AppraisalPanel } from "@/components/appraisal-panel";
import { BenefitsHandoverWizard } from "@/components/benefits-handover";
import { DependencyTab } from "@/components/dependency-tab";
import { GateChecklist } from "@/components/gate-checklist";
import { LessonsTab } from "@/components/lessons-tab";
import { RelevantLessons } from "@/components/relevant-lessons";
import { AssumptionsWorkspace } from "@/components/assumptions-workspace";
import { DecisionPanel } from "@/components/decision-panel";
import { draftsFromBenefits } from "@/services/benefits-value";
import { getDecisionsFor, type ResolvedDecision } from "@/services/decisions";
import { hasPhaseLessonsReview, getProjectLessons } from "@/services/lessons";
import { cn } from "@/lib/utils";

export const Route=createFileRoute("/projects/$projectId")({head:({params})=>{const p=getProject(params.projectId);const title=p?`${p.name} — Virtual PMO`:"Project — Virtual PMO";const description=p?.businessCase??"Project detail.";return{meta:[{title},{name:"description",content:description},{property:"og:title",content:title},{property:"og:description",content:description},{property:"og:type",content:"website"},{name:"twitter:card",content:"summary_large_image"}]}},component:ProjectPage});
const phases=getLifecyclePhases();
const money=(value:number)=>value>=1_000_000?`£${(value/1_000_000).toFixed(1)}M`:`£${Math.round(value/1_000)}k`;
function Section({title,children,actions}:{title:string;children:React.ReactNode;actions?:React.ReactNode}){return <section className="rounded-lg border border-border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-semibold">{title}</h2>{actions}</div>{children}</section>}

function ProjectPage(){
 const {projectId}=Route.useParams();
 const project=getProject(projectId);
 const [tab,setTab]=useState("overview");
 const [lessonsReviewed,setLessonsReviewed]=useState(false);
 const [manualTicks,setManualTicks]=useState<string[]>([]);
 const [handover,setHandover]=useState(false);
 const [handedOver,setHandedOver]=useState<number|null>(null);
 const [openDecision,setOpenDecision]=useState<ResolvedDecision|null>(null);
 const decisions=useMemo(()=>projectId?getDecisionsFor({projectId}):[],[projectId]);
 const lessons=useMemo(()=>projectId?getProjectLessons(projectId):[],[projectId]);
 if(!project)return <p>Project not found.</p>;
 const programme=getProgramme(project.programmeId),current=getPhaseIndex(project.stage),currentPhase=getPhaseForStage(project.stage),tierInfo=getTierDefinitions().find(item=>item.tier===project.tier);
 const reports=project.reports??[],tasks=project.tasks??[],team=getProjectTeam(project),changes=project.changes??[],benefits=getProjectBenefits(project.id);
 const phaseReviewHeld=hasPhaseLessonsReview(project.id,currentPhase?.id??"phase-1");
 const projectTypeTags=Array.from(new Set(lessons.flatMap(lesson=>lesson.projectTypeTags)));
 const activity=[
  ...decisions.map(item=>({id:item.id,date:item.decisionDate??item.neededBy,kind:item.status==="Made"?"Decision made":"Decision required",label:`${item.reference} · ${item.title}`,detail:item.status==="Made"?`${item.forum} chose “${item.chosenOption}”`:`${item.forum} · needed by ${item.neededBy}`,decision:item as ResolvedDecision})),
  ...reports.map(item=>({id:item.id,date:item.reportingDate,kind:"Status report",label:`${item.overall} · ${item.submitter}`,detail:item.accomplished,decision:undefined})),
  ...project.milestones.filter(item=>item.actualDate).map(item=>({id:item.id,date:item.actualDate??"",kind:"Milestone completed",label:item.title,detail:`${item.type} · ${item.owner}`,decision:undefined})),
 ].sort((a,b)=>b.date.split("/").reverse().join("").localeCompare(a.date.split("/").reverse().join(""))).slice(0,8);
 const tabs=["overview","status","tasks","resources","benefits","raid","dependencies","decisions","assumptions","lessons","changes","financials","business case"];

 return <div className="space-y-7"><header className="border-b border-border pb-6"><div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">{programme?.name}</p><div className="flex items-center gap-2"><h1 className="font-display text-3xl font-semibold">{project.name}</h1><FavouriteButton item={{id:project.id,type:"Project",label:project.name}}/><span title={tierInfo?.description} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{project.tier} project</span></div><p className="mt-2 text-sm text-muted-foreground">{project.businessCase}</p></div><div className="flex flex-wrap items-center gap-2"><Button size="sm" onClick={()=>openIssueTask(project.id)}><ListPlus/>Issue task</Button><Button size="sm" variant="outline" onClick={()=>setHandover(true)}><PackageCheck/>{project.state==="Closed"?"Benefits handover":"Close project"}</Button><span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-accent-foreground"><ListChecks className="size-4"/>{project.taskSource}</span><Button variant="outline" size="sm"><ExternalLink/>Open in Planner</Button></div></div>
  <div className="mt-6 grid gap-4 lg:grid-cols-[1.35fr_1fr]"><div><p className="mb-3 text-xs font-semibold text-muted-foreground">Lifecycle — {project.stage}</p><div className="flex items-center">{phases.map((phase,index)=><div key={phase.id} className="flex min-w-0 flex-1 items-center last:flex-none"><div className="flex flex-col items-center gap-1.5"><span className={`grid size-7 place-items-center rounded-full border ${index<current?"border-primary bg-primary text-primary-foreground":index===current?"border-primary bg-accent text-primary":"border-border bg-card text-muted-foreground"}`}>{index<current?<CheckCircle2 className="size-4"/>:<Circle className="size-3"/>}</span><span title={`${phase.name} · ${phase.gateName}`} className={`text-center text-[10px] ${index===current?"font-semibold text-primary":"text-muted-foreground"}`}>{phase.shortName}</span></div>{index<phases.length-1&&<div className={`mb-5 h-px flex-1 ${index<current?"bg-primary":"bg-border"}`}/>}</div>)}</div></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3"><Fact label="Project manager" value={project.manager}/><Fact label="Project officer" value={project.projectOfficer??"Unassigned"}/><Fact label="Sponsor" value={project.sponsor}/><Fact label="Tier" value={project.tier}/><Fact label="Priority" value={project.priority}/><Fact label="Finish" value={project.finish}/></div></div>
  <div className="mt-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"><span className="text-xs text-muted-foreground">Overall</span><HealthPill health={getProjectHealth(project)}/></div><div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"><span className="text-xs text-muted-foreground">Schedule</span><HealthPill health={getScheduleHealth(project)}/></div><div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"><span className="text-xs text-muted-foreground">Issues & risks</span><HealthPill health={getIssueHealth(project)}/></div><div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-2"><span className="text-xs text-muted-foreground">Benefit health</span><HealthPill health={getProjectBenefitHealth(project)}/></div></div></header>
  <div className="flex overflow-x-auto border-b border-border">{tabs.map(item=><Button key={item} variant="ghost" onClick={()=>setTab(item)} className={tab===item?"rounded-none border-b-2 border-primary text-primary":"rounded-none text-muted-foreground"}>{item[0]?.toUpperCase()}{item.slice(1)}</Button>)}</div>

  {handedOver!==null&&<div className="flex items-center gap-2 rounded-md border border-health-good/40 bg-health-good/10 p-3 text-sm"><CheckCircle2 className="size-4 text-health-good-foreground"/>Benefits handover complete. {handedOver} benefit{handedOver===1?"":"s"} now sit with a BAU owner and keep appearing on Realisation and the Value Dashboard.</div>}

  {tab==="overview"&&<div className="grid gap-5 xl:grid-cols-12"><div className="space-y-5 xl:col-span-8"><div className="grid gap-4 sm:grid-cols-3"><KpiCard label="Budget" value={money(project.budget)} detail={`${money(project.actual)} actual`} icon="budget"/><KpiCard label="Forecast" value={money(project.forecast)} detail={`${money(project.forecast-project.budget)} variance`} icon="forecast"/><KpiCard label="Task progress" value={`${Math.round(tasks.reduce((s,t)=>s+t.percentComplete,0)/(tasks.length||1))}%`} detail={`${tasks.filter(t=>t.percentComplete===100).length} of ${tasks.length} complete`} icon="projects"/></div>
   <Section title="Delivery timeline"><div className="mt-5 flex items-center gap-3"><CalendarDays className="size-5 text-primary"/><div className="flex-1"><div className="h-2 rounded-full bg-muted"><div className="h-full w-[44%] rounded-full bg-primary"/></div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{project.start}</span><span>21/09/2026</span><span>{project.finish}</span></div></div></div></Section>
   <Section title="Latest status report">{reports[0]?<div className="mt-4"><div className="flex flex-wrap items-center gap-3"><HealthPill health={reports[0].overall}/><span className="text-xs text-muted-foreground">{reports[0].reportingDate} · {reports[0].submitter}</span></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><div><p className="text-xs font-semibold">Accomplished</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{reports[0].accomplished}</p></div><div><p className="text-xs font-semibold">Planned next</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{reports[0].planned}</p></div></div></div>:<p className="mt-3 text-sm text-muted-foreground">No report submitted.</p>}</Section>
   <Section title="Activity timeline"><div className="mt-4 divide-y">{activity.map(entry=><div key={`${entry.kind}-${entry.id}`} className="flex items-start gap-3 py-3">
     <span className={cn("mt-1 grid size-6 shrink-0 place-items-center rounded-full",entry.kind.startsWith("Decision")?"bg-primary/15 text-primary":"bg-accent text-accent-foreground")}>{entry.kind.startsWith("Decision")?<Gavel className="size-3.5"/>:<Circle className="size-3"/>}</span>
     <div className="min-w-0 flex-1">{entry.decision
       ?<button onClick={()=>setOpenDecision(entry.decision as ResolvedDecision)} className="text-left text-sm font-medium text-primary hover:underline">{entry.label}</button>
       :<p className="text-sm font-medium">{entry.label}</p>}
      <p className="mt-0.5 text-xs text-muted-foreground">{entry.kind} · {entry.date} · {entry.detail}</p></div>
    </div>)}{!activity.length&&<p className="py-4 text-sm text-muted-foreground">Nothing recorded yet.</p>}</div></Section></div>
   <div className="space-y-5 xl:col-span-4">
    <Section title="Top risks"><div className="mt-4 space-y-3">{project.risks.slice(0,3).map(r=><div key={r.id} className="rounded-md border border-border p-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{r.title}</p><span className="rounded bg-health-warn/20 px-2 py-0.5 text-xs font-semibold text-health-warn-foreground">{r.score}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{r.description}</p></div>)}{!project.risks.length&&<p className="text-sm text-muted-foreground">No open risks.</p>}</div></Section>
    <GateChecklist project={project} lessonsReviewed={lessonsReviewed} phaseReviewHeld={phaseReviewHeld} manualTicks={manualTicks} onToggleManual={id=>setManualTicks(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id])}/>
    <Section title="Upcoming milestones"><div className="mt-4 divide-y">{project.milestones.filter(item=>item.status!=="Completed").slice(0,5).map(item=><div key={item.id} className="flex items-start gap-3 py-3"><DeliveryStatusIcon status={item.status}/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.type} · {item.owner}</p></div><div className="text-right"><p className="text-xs">{item.forecastDate}</p>{item.baselineDate!==item.forecastDate&&<p className="text-[10px] text-health-warn-foreground">Baseline {item.baselineDate}</p>}</div></div>)}</div></Section>
   </div></div>}

  {tab==="status"&&<StatusWorkspace project={project} initialReports={reports} calculated={{overall:getProjectHealth(project),schedule:getScheduleHealth(project),financial:getFinancialHealth(project),effort:getEffortHealth(project),issue:getIssueHealth(project)}}/>}
  {tab==="tasks"&&<TaskWorkspace initialTasks={tasks} taskSource={project.taskSource}/>}
  {tab==="resources"&&<ProjectResources members={team} projectId={project.id}/>}
  {tab==="benefits"&&<BenefitSummary items={benefits}/>}
  {tab==="raid"&&<RaidWorkspace risks={project.risks} issues={project.issues}/>}
  {tab==="dependencies"&&<DependencyTab projectId={project.id}/>}
  {tab==="decisions"&&<div className="space-y-4">{decisions.map(item=><button key={item.id} onClick={()=>setOpenDecision(item)} className="block w-full rounded-lg border bg-card p-4 text-left shadow-sm hover:bg-accent/30">
    <div className="flex flex-wrap items-start justify-between gap-2"><p className="text-sm font-semibold">{item.reference} · {item.title}</p><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",item.status==="Made"?"bg-health-good/20 text-health-good-foreground":item.overdue?"bg-health-bad/20 text-health-bad-foreground":item.status==="Pending"?"bg-health-warn/25 text-health-warn-foreground":"bg-muted text-muted-foreground")}>{item.status}{item.overdue?" · overdue":""}</span></div>
    <p className="mt-1.5 text-xs text-muted-foreground">{item.forum} · {item.decisionMaker} · needed by {item.neededBy}{item.decisionDate?` · decided ${item.decisionDate}`:""}</p>
    <p className="mt-2 text-sm text-muted-foreground">{item.context}</p>
    <p className="mt-2 text-xs text-muted-foreground">Impact on: {item.impactSummary} · {item.openActions} open action{item.openActions===1?"":"s"}</p>
   </button>)}{!decisions.length&&<p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No decisions recorded for this project.</p>}</div>}
  {tab==="assumptions"&&<AssumptionsWorkspace scope={{projectId:project.id}} compact/>}
  {tab==="lessons"&&<LessonsTab project={project}/>}
  {tab==="changes"&&<Section title="Change requests"><div className="mt-4 space-y-3">{changes.map(c=><div key={c.id} className="flex items-center justify-between border-b border-border py-3"><div><p className="text-sm font-medium">{c.title}</p><p className="text-xs text-muted-foreground">{c.type} · {c.scheduleImpactDays} days</p></div><span className="text-sm">{c.status}</span></div>)}{!changes.length&&<p className="mt-3 text-sm text-muted-foreground">No change requests raised.</p>}</div></Section>}
  {tab==="financials"&&<div className="grid gap-4 md:grid-cols-3"><KpiCard label="Budget" value={money(project.budget)} detail="Approved baseline" icon="budget"/><KpiCard label="Actual" value={money(project.actual)} detail="Spend to date" icon="budget"/><KpiCard label="Forecast" value={money(project.forecast)} detail={`${money(project.forecast-project.budget)} variance`} icon="forecast"/></div>}
  {tab==="business case"&&<div className="space-y-5">
   <div className="grid gap-5 lg:grid-cols-2">
    <Section title="Summary"><p className="mt-3 text-sm leading-7 text-muted-foreground">{project.businessCase}</p></Section>
    <Section title="Case for change"><p className="mt-3 text-sm leading-7 text-muted-foreground">{project.benefits}</p></Section>
   </div>
   <AppraisalPanel drafts={draftsFromBenefits(benefits)} wholeLifeCost={Math.max(project.budget,project.forecast)} years={5}/>
   <RelevantLessons projectTypeTags={projectTypeTags} phaseId="phase-2" excludeProjectId={project.id} requireTick ticked={lessonsReviewed} onTick={setLessonsReviewed}/>
  </div>}

  {handover&&<BenefitsHandoverWizard project={project} close={()=>setHandover(false)} onComplete={count=>{setHandedOver(count);setHandover(false)}}/>}
  {openDecision&&<DecisionPanel decision={openDecision} all={decisions} close={()=>setOpenDecision(null)}/>}
 </div>;
}
