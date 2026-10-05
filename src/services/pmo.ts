import { benefits, collections, genericResources, issuedTasks, people, portfolio, programmes, projectRequests, projects, resourceAssignments, roadmaps, strategicObjectives } from "@/data/mock-data";
import { defaultLifecyclePhases, defaultTierDefinitions } from "@/data/lifecycle";
import { getSettings } from "@/services/settings";
import { getCurrentPortfolioId, portfolios } from "@/services/entity-store";
import type { ChangeRequest, Dependency, DependencyEnd, Issue, GateCriterion, LifecyclePhase, ProjectStage, ProjectTier, TierDefinition, Benefit, BenefitMeasure, BookingType, GenericResource, Health, IssuedTask, Milestone, MilestoneStatus, Person, Portfolio, Programme, Project, ProjectRequest, ResourceAssignment as Assignment, ResourceTeam, Risk, Roadmap, RoadmapHealth, RoadmapItem, Task, TeamMember } from "@/data/types";

const rank: Record<Health,number> = {"Not Set":0,"On Track":1,"At Risk":2,"Off Track":3};
const worst = (items: Health[]): Health => {
  let result: Health = "Not Set";
  for (const item of items) if ((rank[item] ?? 0) > (rank[result] ?? 0)) result = item;
  return result;
};
const parseDate = (value:string) => {
  const parts=value.split("/").map(Number);
  return new Date(parts[2] ?? 1970,(parts[1] ?? 1)-1,parts[0] ?? 1);
};
const today = parseDate("21/09/2026");

export function getScheduleHealth(project: Project): Health {
  const thresholds=getSettings().health;
  if (project.milestones.some(m=>m.status==="Overdue")) return "Off Track";
  const baseline=parseDate(project.baselineFinish).getTime()-parseDate(project.start).getTime();
  const slip=parseDate(project.finish).getTime()-parseDate(project.baselineFinish).getTime();
  if (baseline>0 && slip/baseline>thresholds.scheduleSlipPercent/100) return "Off Track";
  if (project.taskCount && project.overdueTaskCount/project.taskCount>thresholds.taskOverdueAtRiskPercent/100) return "At Risk";
  return "On Track";
}
export function getIssueHealth(project: Project): Health {
  const thresholds=getSettings().health;
  if (project.issues.some(i=>i.status==="Open"&&i.severity==="High") || project.risks.some(r=>r.status==="Open"&&r.score>=thresholds.riskScoreOffTrack)) return "Off Track";
  if (project.issues.some(i=>i.status==="Open") || project.risks.some(r=>r.status==="Open"&&r.score>=thresholds.riskScoreAtRisk)) return "At Risk";
  return "On Track";
}
export function getFinancialHealth(project: Project): Health {
  const thresholds=getSettings().health;
  if (project.forecast > project.budget * (1+thresholds.financialOffTrackPercent/100)) return "Off Track";
  if (project.forecast > project.budget * (1+thresholds.financialAtRiskPercent/100)) return "At Risk";
  return "On Track";
}
export function getEffortHealth(project: Project): Health {
  const thresholds=getSettings().health;
  if (project.taskCount && project.overdueTaskCount / project.taskCount > thresholds.taskOverdueOffTrackPercent/100) return "Off Track";
  if (project.taskCount && project.overdueTaskCount / project.taskCount > thresholds.taskOverdueAtRiskPercent/100) return "At Risk";
  return "On Track";
}
export function getProjectHealth(project: Project): Health { return project.healthOverride?.health ?? worst([getScheduleHealth(project),getFinancialHealth(project),getEffortHealth(project),getIssueHealth(project),getProjectBenefitHealth(project)]); }
export function getProjects(programmeId?:string) { const current=getCurrentPortfolioId(); return projects.filter(p=>(programmeId?p.programmeId===programmeId:p.portfolioId===current)); }
export function getAllProjects() { return projects; }
export function getProject(id:string) { return projects.find(p=>p.id===id); }
export function getProgrammes() { const current=getCurrentPortfolioId(); return programmes.filter(p=>p.portfolioId===current); }
export function getAllProgrammes() { return programmes; }
export function getPortfolios() { return portfolios; }
export function getProgramme(id:string) { return programmes.find(p=>p.id===id); }
export function getProgrammeHealth(programme:Programme):Health { return programme.healthOverride?.health ?? worst([...getProjects(programme.id).map(getProjectHealth),getProgrammeBenefitHealth(programme)]); }
export function getPortfolio():Portfolio { return portfolios.find(p=>p.id===getCurrentPortfolioId())??portfolio; }
export function getPortfolioHealth():Health { const current=getPortfolio(); return current.healthOverride?.health ?? worst(getProgrammes().map(getProgrammeHealth)); }
export function getCollections(){ return collections; }
export function getCollection(id:string){ return collections.find(collection=>collection.id===id); }
export function getCollectionProjects(id:string){
  const collection=getCollection(id);
  return collection ? projects.filter(project=>collection.projectIds.includes(project.id)) : [];
}
export function getCollectionMetrics(id:string){
  const items=getCollectionProjects(id);
  return {
    projectCount:items.length,
    budget:items.reduce((sum,project)=>sum+project.budget,0),
    forecast:items.reduce((sum,project)=>sum+project.forecast,0),
    rag:{
      green:items.filter(project=>getProjectHealth(project)==="On Track").length,
      amber:items.filter(project=>getProjectHealth(project)==="At Risk").length,
      red:items.filter(project=>getProjectHealth(project)==="Off Track").length,
    },
  };
}
export function getPeople(){ return people; }
export function getGenericResources(){return genericResources}
export function getResourceAssignments(){return resourceAssignments.map(item=>({...item}))}
export function getProjectRequests():ProjectRequest[]{return projectRequests}
export function getProjectPortfolioDetails(project:Project){
  const programme=programmes.find(item=>item.id===project.programmeId);
  const collectionNames=collections.filter(item=>project.collectionIds.includes(item.id)).map(item=>item.name);
  const nextMilestone=[...project.milestones].filter(item=>item.status!=="Completed").sort((a,b)=>parseDate(a.forecastDate).getTime()-parseDate(b.forecastDate).getTime())[0];
  const latestReport=[...(project.reports??[])].sort((a,b)=>parseDate(b.reportingDate).getTime()-parseDate(a.reportingDate).getTime())[0];
  const reportAgeDays=latestReport?Math.floor((today.getTime()-parseDate(latestReport.reportingDate).getTime())/86400000):Number.POSITIVE_INFINITY;
  return {programmeName:programme?.name??"Unassigned",collectionNames,nextMilestone,latestReport,statusReportOverdue:reportAgeDays>14};
}
export interface ProjectTeamMember extends TeamMember { person: Person; completedHours: number; remainingHours: number; weeklyHours: number }
export interface ResourceAssignment extends TeamMember { projectId: string; projectName: string; programmeId: string; weeklyHours: number }
export interface ResourceSummary { person: Person; assignments: ResourceAssignment[]; totalHours: number; currentWeeklyHours: number; peakWeeklyHours: number; overAllocated: boolean }
export interface PortfolioRisk extends Risk { projectId: string; projectName: string; programmeId: string; programmeName: string }
export interface PortfolioMilestone extends Milestone { projectId: string; projectName: string; programmeId: string; programmeName: string; slipDays: number }
const daysBetween=(start:string,finish:string)=>Math.max(1,Math.round((parseDate(finish).getTime()-parseDate(start).getTime())/86400000)+1);
const weeklyHours=(member:TeamMember)=>member.allocatedEffortHours/Math.max(1,daysBetween(member.start,member.finish)/7);
const activeOn=(member:TeamMember,date:Date)=>parseDate(member.start)<=date&&parseDate(member.finish)>=date;
export function getProjectTeam(project:Project):ProjectTeamMember[]{
  const progress=project.tasks?.length?project.tasks.reduce((sum,task)=>sum+task.percentComplete,0)/(project.tasks.length*100):Math.min(0.9,project.actual/Math.max(1,project.forecast));
  return (project.team??[]).flatMap(member=>{const person=people.find(item=>item.id===member.personId);if(!person)return[];const completedHours=Math.round(member.allocatedEffortHours*progress);return[{...member,person,completedHours,remainingHours:member.allocatedEffortHours-completedHours,weeklyHours:weeklyHours(member)}]});
}
export function getResourceSummaries():ResourceSummary[]{
  const assignments:ResourceAssignment[]=projects.flatMap(project=>(project.team??[]).map(member=>({...member,projectId:project.id,projectName:project.name,programmeId:project.programmeId,weeklyHours:weeklyHours(member)})));
  const weekStarts=Array.from({length:80},(_,index)=>new Date(2025,7,4+index*7));
  return people.map(person=>{const personAssignments=assignments.filter(item=>item.personId===person.id);const weeklyTotals=weekStarts.map(week=>personAssignments.filter(item=>activeOn(item,week)).reduce((sum,item)=>sum+item.weeklyHours,0));const currentWeeklyHours=personAssignments.filter(item=>activeOn(item,today)).reduce((sum,item)=>sum+item.weeklyHours,0);const peakWeeklyHours=Math.max(0,...weeklyTotals);return{person,assignments:personAssignments,totalHours:personAssignments.reduce((sum,item)=>sum+item.allocatedEffortHours,0),currentWeeklyHours,peakWeeklyHours,overAllocated:peakWeeklyHours>37.5}}).filter(item=>item.assignments.length).sort((a,b)=>b.currentWeeklyHours-a.currentWeeklyHours);
}
export function getPortfolioRisks():PortfolioRisk[]{return projects.flatMap(project=>{const programme=programmes.find(item=>item.id===project.programmeId);return project.risks.map(risk=>({...risk,projectId:project.id,projectName:project.name,programmeId:project.programmeId,programmeName:programme?.name??"Unassigned"}))}).sort((a,b)=>b.score-a.score)}
export function getPortfolioMilestones(programmeId?:string):PortfolioMilestone[]{return projects.filter(project=>!programmeId||project.programmeId===programmeId).flatMap(project=>{const programme=programmes.find(item=>item.id===project.programmeId);return project.milestones.map(milestone=>({...milestone,projectId:project.id,projectName:project.name,programmeId:project.programmeId,programmeName:programme?.name??"Unassigned",slipDays:Math.round((parseDate(milestone.forecastDate).getTime()-parseDate(milestone.baselineDate).getTime())/86400000)}))}).sort((a,b)=>parseDate(a.forecastDate).getTime()-parseDate(b.forecastDate).getTime())}
export function getMilestoneMetrics(items=getPortfolioMilestones()){
  const days=(value:string)=>Math.round((parseDate(value).getTime()-today.getTime())/86400000);
  const completed=items.filter(item=>item.actualDate&&days(item.actualDate)>=-30&&days(item.actualDate)<=0).length;
  const upcoming=items.filter(item=>item.status!=="Completed"&&days(item.forecastDate)>=0&&days(item.forecastDate)<=30).length;
  const overdue=items.filter(item=>item.status==="Overdue").length;
  const slipped=items.filter(item=>item.slipDays>0&&item.status!=="Completed").length;
  const recentCompleted=items.filter(item=>item.actualDate&&days(item.actualDate)>=-90&&days(item.actualDate)<=0);
  const hit=recentCompleted.filter(item=>parseDate(item.actualDate??item.forecastDate)<=parseDate(item.baselineDate)).length;
  return {completed,upcoming,overdue,slipped,percentOnTime:recentCompleted.length?Math.round(hit/recentCompleted.length*100):0};
}
export interface ResolvedRoadmapItem extends RoadmapItem { start: string; finish: string; progress: number; health: RoadmapHealth; programmeId?: string; programmeName: string; projectManager: string; collectionNames: string[] }
// Stage 4 decision: a red project is always "High risk" on the roadmap (was: only when also Critical).
const roadmapHealth=(project:Project):RoadmapHealth=>project.state==="Closed"?"Done":project.state==="Proposed"?"Not set":getProjectHealth(project)==="Off Track"?"High risk":project.priority==="High"||getProjectHealth(project)==="At Risk"?"At risk":"On track";
const projectProgress=(project:Project)=>project.tasks?.length?Math.round(project.tasks.reduce((sum,task)=>sum+task.percentComplete,0)/project.tasks.length):getStageProgress(project.stage);
export function getRoadmaps():Roadmap[]{return roadmaps}
export function getRoadmap(id:string):Roadmap|undefined{return roadmaps.find(roadmap=>roadmap.id===id)}
export function getResolvedRoadmapItems(roadmap:Roadmap):ResolvedRoadmapItem[]{return roadmap.items.flatMap(item=>{const project=item.projectId?projects.find(candidate=>candidate.id===item.projectId):undefined;const programme=programmes.find(candidate=>candidate.id===(project?.programmeId??roadmap.rows.find(row=>row.id===item.rowId)?.programmeId));if(item.kind==="Linked"&&!project)return[];const programmeId=project?.programmeId??programme?.id;return[{...item,start:project?.start??item.start??"21/09/2026",finish:project?.finish??item.finish??"21/09/2026",progress:project?projectProgress(project):(item.progress??0),health:project?roadmapHealth(project):(item.health??"Not set"),...(programmeId?{programmeId}:{}),programmeName:programme?.name??"Unassigned",projectManager:project?.manager??item.owner??"Unassigned",collectionNames:collections.filter(collection=>(project?.collectionIds??item.collectionIds??[]).includes(collection.id)).map(collection=>collection.name)}]})}
export function getProgrammeMetrics(programme: Programme){
  const items=getProjects(programme.id); return { projectCount:items.length, active:items.filter(p=>p.state==="Active").length, budget:items.reduce((s,p)=>s+p.budget,0), forecast:items.reduce((s,p)=>s+p.forecast,0), rag:{ green:items.filter(p=>getProjectHealth(p)==="On Track").length, amber:items.filter(p=>getProjectHealth(p)==="At Risk").length, red:items.filter(p=>getProjectHealth(p)==="Off Track").length } };
}
export function getPortfolioMetrics(){ const projects=getProjects(); const active=projects.filter(p=>p.state==="Active"); const rag={green:projects.filter(p=>getProjectHealth(p)==="On Track").length,amber:projects.filter(p=>getProjectHealth(p)==="At Risk").length,red:projects.filter(p=>getProjectHealth(p)==="Off Track").length}; return {activeProjects:active.length,totalBudget:projects.reduce((s,p)=>s+p.budget,0),forecast:projects.reduce((s,p)=>s+p.forecast,0),percentOnTrack:projects.length?Math.round((rag.green/projects.length)*100):0,rag}; }

export interface PortfolioTask extends Task { projectId:string; projectName:string; programmeId:string; programmeName:string; projectManager:string; taskSource:Project["taskSource"]; deliveryStatus:MilestoneStatus; effortHours:number; effortCompleted:number; effortRemaining:number; plannerUrl?:string }
export function getTaskStatus(task:Task):MilestoneStatus {if(task.percentComplete===100)return "Completed";if(parseDate(task.finish)<today)return "Overdue";if(task.baselineFinish&&parseDate(task.finish)>parseDate(task.baselineFinish))return "Late";if(parseDate(task.start)>today)return "Future";return "On Track"}
export function getPortfolioTasks():PortfolioTask[]{return projects.flatMap(project=>{const programme=programmes.find(item=>item.id===project.programmeId);return(project.tasks??[]).map(task=>{const effortHours=task.estimatedEffortHours??Math.max(4,task.checklistCount*4);const effortCompleted=Math.round(effortHours*task.percentComplete/100);return{...task,projectId:project.id,projectName:project.name,programmeId:project.programmeId,programmeName:programme?.name??"Unassigned",projectManager:project.manager,taskSource:project.taskSource,deliveryStatus:getTaskStatus(task),effortHours,effortCompleted,effortRemaining:effortHours-effortCompleted,...(project.taskSource!=="Native"?{plannerUrl:`https://tasks.office.com/virtual-pmo/Home/PlanViews/${project.id}`}:{})}})})}
export function getTaskMetrics(items:PortfolioTask[]){const statuses=(status:MilestoneStatus)=>items.filter(item=>item.deliveryStatus===status).length;const effort=items.reduce((sum,item)=>sum+item.effortHours,0),effortCompleted=items.reduce((sum,item)=>sum+item.effortCompleted,0);return{projects:new Set(items.map(item=>item.projectId)).size,tasks:items.length,completed:statuses("Completed"),future:statuses("Future"),onTrack:statuses("On Track"),late:statuses("Late"),overdue:statuses("Overdue"),effort,effortCompleted,effortRemaining:effort-effortCompleted}}
export function getPersonalTaskGroup(task:PortfolioTask){const difference=Math.floor((parseDate(task.finish).getTime()-today.getTime())/86400000);if(task.deliveryStatus==="Overdue")return"Overdue";if(difference===0)return"Today";if(difference<=6)return"This week";if(difference<=13)return"Next week";return"Later"}
export function getIssuedTasks():IssuedTask[]{return issuedTasks.map(item=>({...item,checklist:[...item.checklist],attachments:[...item.attachments]}))}

export interface ResolvedResourceAssignment extends Assignment {resourceName:string;team:ResourceTeam;projectName:string;programmeId:string;programmeName:string;taskName?:string;progress:number;effort:number;effortCompleted:number;effortRemaining:number}
export const getWeekStarts=(count=26,start="21/09/2026")=>Array.from({length:count},(_,index)=>{const date=new Date(parseDate(start).getTime()+index*7*86400000);return `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`});
export function getPersonCapacity(person:Person,weekStart:string){const base=person.contractedHoursPerWeek*(1-person.bauPercentage/100);const start=parseDate(weekStart).getTime(),end=start+6*86400000;const leaveDays=person.leave.reduce((sum,entry)=>{const from=Math.max(start,parseDate(entry.start).getTime()),to=Math.min(end,parseDate(entry.end).getTime());return sum+(to>=from?Math.floor((to-from)/86400000)+1:0)},0);return Math.max(0,base-base*Math.min(5,leaveDays)/5)}
export function getResolvedResourceAssignments(items=getResourceAssignments()):ResolvedResourceAssignment[]{return items.flatMap(item=>{const person=item.resourceType==="Person"?people.find(candidate=>candidate.id===item.resourceId):undefined;const generic=item.resourceType==="Generic"?genericResources.find(candidate=>candidate.id===item.resourceId):undefined;const project=projects.find(candidate=>candidate.id===item.projectId);if(!project||(!person&&!generic))return[];const programme=programmes.find(candidate=>candidate.id===project.programmeId);const task=item.taskId?project.tasks?.find(candidate=>candidate.id===item.taskId):undefined;const projectProgress=project.tasks?.length?Math.round(project.tasks.reduce((sum,current)=>sum+current.percentComplete,0)/project.tasks.length):0;const progress=task?.percentComplete??projectProgress;const effort=Math.round(item.hoursPerWeek*daysBetween(item.start,item.end)/7);return[{...item,resourceName:person?.name??generic?.name??"Unassigned",team:person?.team??generic?.team??"PMO",projectName:project.name,programmeId:project.programmeId,programmeName:programme?.name??"Unassigned",...(task?{taskName:task.title}:{}),progress,effort,effortCompleted:Math.round(effort*progress/100),effortRemaining:Math.round(effort*(1-progress/100))}]})}
export function getWeeklyAllocation(personId:string,weekStart:string,items=getResourceAssignments()){const week=parseDate(weekStart);return items.filter(item=>item.resourceType==="Person"&&item.resourceId===personId&&activeOn({personId:item.resourceId,role:"Team Member",start:item.start,finish:item.end,allocatedEffortHours:0},week)).reduce((sum,item)=>sum+item.hoursPerWeek,0)}
export function getResourceDashboard(){const weeks=getWeekStarts();const named=getResolvedResourceAssignments().filter(item=>item.resourceType==="Person");const summaries=people.map(person=>{const allocations=weeks.map(week=>getWeeklyAllocation(person.id,week));const capacities=weeks.map(week=>getPersonCapacity(person,week));const allocated=allocations.reduce((sum,value)=>sum+value,0);const capacity=capacities.reduce((sum,value)=>sum+value,0);return{person,allocated,capacity,utilisation:capacity?Math.round(allocated/capacity*100):0,peak:Math.max(0,...allocations.map((value,index)=>capacities[index]?value/(capacities[index]??1)*100:0)),effortCompleted:named.filter(item=>item.resourceId===person.id).reduce((sum,item)=>sum+item.effortCompleted,0),effortRemaining:named.filter(item=>item.resourceId===person.id).reduce((sum,item)=>sum+item.effortRemaining,0)}});const totalCapacity=summaries.reduce((sum,item)=>sum+item.capacity,0),allocated=summaries.reduce((sum,item)=>sum+item.allocated,0);return{people:summaries,totalCapacity,allocated,utilisation:totalCapacity?Math.round(allocated/totalCapacity*100):0,overAllocated:summaries.filter(item=>item.peak>100).length,unstaffed:genericResources.filter(item=>item.needsStaffing).length}}
export function getTeamUtilisation(){const dashboard=getResourceDashboard();return Array.from(new Set(people.map(person=>person.team))).map(team=>{const rows=dashboard.people.filter(item=>item.person.team===team);const capacity=rows.reduce((sum,item)=>sum+item.capacity,0),allocated=rows.reduce((sum,item)=>sum+item.allocated,0);return{team,capacity,allocated,utilisation:capacity?Math.round(allocated/capacity*100):0}})}
export function getProjectResourceCandidates(projectId:string,skill:string){const project=getProject(projectId);if(!project)return[];const weeks=getWeekStarts(Math.max(1,Math.ceil(daysBetween(project.start,project.finish)/7)),project.start);return people.filter(person=>!skill||person.skills.some(item=>item.name===skill)).map(person=>{const free=Math.max(0,Math.min(...weeks.map(week=>getPersonCapacity(person,week)-getWeeklyAllocation(person.id,week))));return{person,freeCapacity:Math.round(free*10)/10}}).sort((a,b)=>b.freeCapacity-a.freeCapacity)}
export function getRoleDemand(weeks=getWeekStarts()){const roles=Array.from(new Set([...genericResources.map(item=>item.role),...people.flatMap(person=>person.skills.map(skill=>skill.name))]));return roles.map(role=>({role,weeks:weeks.map(week=>{const demand=resourceAssignments.filter(item=>item.role===role&&parseDate(item.start)<=parseDate(week)&&parseDate(item.end)>=parseDate(week)).reduce((sum,item)=>sum+item.hoursPerWeek,0);const capacity=people.filter(person=>person.skills.some(skill=>skill.name===role)).reduce((sum,person)=>sum+getPersonCapacity(person,week),0);return{week,demand,capacity}})}))}
export function getBookingTypes():BookingType[]{return["Soft","Hard"]}
export function getStrategicObjectives(){return strategicObjectives}
export function getBenefits(){return benefits}
export function getBenefit(id:string){return benefits.find(item=>item.id===id)}
export function getProjectBenefits(projectId:string){return benefits.filter(item=>item.enablingProjects.some(link=>link.projectId===projectId))}
export function getProgrammeBenefits(programmeId:string){const ids=new Set(getProjects(programmeId).map(item=>item.id));return benefits.filter(item=>item.enablingProjects.some(link=>ids.has(link.projectId)))}
// ---- Benefit periods and realisation maths (Prompt H2/H3) ----
export interface BenefitPeriod { period:string; start:string; end:string }
export const benefitPeriods:BenefitPeriod[]=[
 {period:"Q1 Aug–Oct 2026",start:"01/08/2026",end:"31/10/2026"},
 {period:"Q2 Nov 2026–Jan 2027",start:"01/11/2026",end:"31/01/2027"},
 {period:"Q3 Feb–Apr 2027",start:"01/02/2027",end:"30/04/2027"},
 {period:"Q4 May–Jul 2027",start:"01/05/2027",end:"31/07/2027"},
];
export const getPeriodIndex=(period:string)=>benefitPeriods.findIndex(item=>item.period===period);
const confidenceFactor=(confidence:Benefit["confidence"])=>confidence==="Low"?0.6:confidence==="Medium"?0.85:1;
/** Fraction of the benefit's whole-life value expected by the end of each profile period. */
export function getPlannedFractions(benefit:Benefit):number[]{
 const measure=benefit.measures[0];
 if(!measure||!measure.targetProfile.length)return benefitPeriods.map((_,index)=>(index+1)/benefitPeriods.length);
 const baseline=measure.baselineValue,final=measure.targetProfile[measure.targetProfile.length-1]?.value??baseline;
 const span=final-baseline;
 return benefitPeriods.map(period=>{
  const target=measure.targetProfile.find(item=>item.period===period.period);
  if(!target)return 0;
  return span===0?0:Math.max(0,Math.min(1,(target.value-baseline)/span));
 });
}
/** Fraction actually evidenced in each period, from submitted or validated measurement records. */
export function getActualFractions(benefit:Benefit):Array<number|undefined>{
 const measure=benefit.measures[0];
 if(!measure)return benefitPeriods.map(()=>undefined);
 const baseline=measure.baselineValue,final=measure.targetProfile[measure.targetProfile.length-1]?.value??baseline;
 const span=final-baseline;
 return benefitPeriods.map(period=>{
  const record=measure.records.find(item=>item.period===period.period&&item.status!=="Queried");
  if(!record)return undefined;
  return span===0?0:Math.max(0,Math.min(1.35,(record.actualValue-baseline)/span));
 });
}
/** Cumulative planned, actual and forecast value for each profile period. */
export function getBenefitCurve(benefit:Benefit){
 const planned=getPlannedFractions(benefit),actual=getActualFractions(benefit),value=Math.abs(benefit.plannedTotalValue),factor=confidenceFactor(benefit.confidence);
 let lastActual=0,lastActualIndex=-1;
 actual.forEach((fraction,index)=>{if(fraction!==undefined){lastActual=fraction;lastActualIndex=index}});
 return benefitPeriods.map((period,index)=>{
  const plannedFraction=planned[index]??0,actualFraction=actual[index];
  const plannedAtLastActual=planned[lastActualIndex]??0;
  const forecastFraction=index<=lastActualIndex?lastActual:lastActual+Math.max(0,plannedFraction-plannedAtLastActual)*factor;
  return {period:period.period,planned:Math.round(value*plannedFraction),actual:actualFraction===undefined?undefined:Math.round(value*actualFraction),forecast:Math.round(value*forecastFraction)};
 });
}
export function getBenefitRealised(benefit:Benefit){
 const actual=getActualFractions(benefit);
 let latest:number|undefined;
 for(const fraction of actual)if(fraction!==undefined)latest=fraction;
 if(latest===undefined)return 0;
 return Math.round(benefit.plannedTotalValue*latest);
}
/** How far the evidenced position sits behind the profile expected by today, as a percentage of whole-life value. */
export function getBenefitVariance(benefit:Benefit){
 const planned=getPlannedFractions(benefit),actual=getActualFractions(benefit);
 const index=benefitPeriods.findIndex(period=>parseDate(period.start)<=today&&parseDate(period.end)>=today);
 const current=index<0?benefitPeriods.length-1:index;
 const period=benefitPeriods[current];
 const elapsed=period?Math.max(0,Math.min(1,(today.getTime()-parseDate(period.start).getTime())/Math.max(1,parseDate(period.end).getTime()-parseDate(period.start).getTime()))):1;
 const previousPlanned=planned[current-1]??0,currentPlanned=planned[current]??0;
 const expected=previousPlanned+(currentPlanned-previousPlanned)*elapsed;
 let achieved=0;
 for(let index2=0;index2<=current;index2+=1){const fraction=actual[index2];if(fraction!==undefined)achieved=fraction}
 return {expected,achieved,variancePercent:Math.round((achieved-expected)*100)};
}
export function isBenefitBehindProfile(benefit:Benefit){return getBenefitVariance(benefit).variancePercent< -getSettings().health.benefitBehindProfilePercent}
export function isMeasurementOverdue(benefit:Benefit){return benefit.measures.some(measure=>parseDate(measure.nextDue)<today)}
export function getBenefitPercent(benefit:Benefit){const planned=Math.abs(benefit.plannedTotalValue);return planned?Math.min(135,Math.round(Math.abs(getBenefitRealised(benefit))/planned*100)):0}
export function getBenefitHealth(benefit:Benefit):Health{
 if(benefit.confidence==="Low"||isBenefitBehindProfile(benefit))return "Off Track";
 if(isMeasurementOverdue(benefit)||!validateBenefitLifecycle(benefit).valid)return "At Risk";
 return "On Track";
}
export function validateBenefitLifecycle(benefit:Benefit){const messages:string[]=[];const progressed=["Validated","Planned","In realisation","Realised","Partially realised","Not realised","Closed"].includes(benefit.status);if(progressed&&(!benefit.owner||!benefit.eligibilityConfirmed))messages.push("Validated requires a benefit owner and confirmed eligibility.");if(["Planned","In realisation","Realised","Partially realised","Not realised","Closed"].includes(benefit.status)&&!benefit.measures.some(measure=>measure.baselineDate&&measure.targetProfile.length))messages.push("Planned requires a measure with a baseline and target profile.");if(["Realised","Partially realised"].includes(benefit.status)&&!benefit.reviews.some(review=>review.type==="Post-implementation review"))messages.push("Realised or Partially realised requires a post-implementation review.");return{valid:messages.length===0,messages}}
export function getBenefitWarnings(items=benefits){const warnings:string[]=[];const names=new Map<string,string[]>();for(const benefit of items){const attribution=benefit.enablingProjects.reduce((sum,item)=>sum+item.attribution,0);if(attribution>100)warnings.push(`${benefit.reference} attribution totals ${attribution}%.`);for(const measure of benefit.measures){const key=measure.name.toLowerCase();names.set(key,[...(names.get(key)??[]),benefit.reference])}}for(const [name,refs] of names)if(refs.length>1)warnings.push(`Measure “${name}” is claimed by ${refs.join(" and ")}.`);return warnings}
export function getNextMeasurementDue(benefit:Benefit){return [...benefit.measures].sort((a,b)=>parseDate(a.nextDue).getTime()-parseDate(b.nextDue).getTime())[0]?.nextDue??"—"}
export function getBenefitMetrics(items=benefits){const planned=items.reduce((sum,item)=>sum+Math.max(0,item.plannedTotalValue),0),realised=items.reduce((sum,item)=>sum+Math.max(0,getBenefitRealised(item)),0);return{count:items.length,planned,realised,percent:planned?Math.round(realised/planned*100):0,overdue:items.filter(item=>item.measures.some(measure=>parseDate(measure.nextDue)<today)).length,atRisk:items.filter(item=>getBenefitHealth(item)==="At Risk").length}}
export function getMeasureActualSeries(measure:BenefitMeasure){return measure.targetProfile.map(target=>({period:target.period,target:target.value,actual:measure.records.find(record=>record.period===target.period)?.actualValue}))}
// ---- Lifecycle & tiering ----
export function getLifecyclePhases():LifecyclePhase[]{const phases=getSettings().lifecycle?.phases;return phases?.length?phases:defaultLifecyclePhases}
export function getTierDefinitions():TierDefinition[]{const tiers=getSettings().lifecycle?.tiers;return tiers?.length?tiers:defaultTierDefinitions}
export function getStageNames():string[]{return getLifecyclePhases().map(phase=>phase.name)}
export function getPhaseIndex(stage:ProjectStage):number{const index=getLifecyclePhases().findIndex(phase=>phase.name===stage);return index<0?0:index}
export function getStageProgress(stage:ProjectStage):number{const total=getLifecyclePhases().length;return Math.round(((getPhaseIndex(stage)+0.5)/total)*100)}
export function getPhaseForStage(stage:ProjectStage):LifecyclePhase|undefined{return getLifecyclePhases().find(phase=>phase.name===stage)}
export function getGateCriteria(stage:ProjectStage,tier:ProjectTier):GateCriterion[]{return getPhaseForStage(stage)?.criteria.filter(criterion=>criterion.tiers.includes(tier))??[]}

// ---- Benefit health as a project and programme health dimension (Prompt H3) ----
/** Benefits are unvalidated "past the Plan stage" once a project reaches Phase 3 or later. */
const planStageIndex=2;
export function getBenefitDimensionHealth(items:Benefit[],stageIndex:number):Health{
  if(!items.length)return "Not Set";
  if(items.some(benefit=>benefit.confidence==="Low"||isBenefitBehindProfile(benefit)))return "Off Track";
  const unvalidated=stageIndex>=planStageIndex&&items.some(benefit=>benefit.status==="Identified"||!benefit.eligibilityConfirmed);
  if(items.some(isMeasurementOverdue)||unvalidated)return "At Risk";
  return "On Track";
}
export function getProjectBenefitHealth(project:Project):Health{return getBenefitDimensionHealth(getProjectBenefits(project.id),getPhaseIndex(project.stage))}
export function getProgrammeBenefitHealth(programme:Programme):Health{const items=getProgrammeBenefits(programme.id);const stage=Math.max(0,...getProjects(programme.id).map(project=>getPhaseIndex(project.stage)));return getBenefitDimensionHealth(items,stage)}

// ---- Configurable stage gate checklist (Prompt H3) ----
export type GateCheckStatus="Pass"|"Fail"|"Manual";
export interface GateChecklistItem { criterion:GateCriterion; status:GateCheckStatus; detail:string }
export function getGateChecklist(project:Project,options?:{lessonsReviewed?:boolean;phaseReviewHeld?:boolean}):GateChecklistItem[]{
  const items=getProjectBenefits(project.id);
  return getGateCriteria(project.stage,project.tier).map(criterion=>{
    if(!criterion.check)return {criterion,status:"Manual" as const,detail:"Confirmed manually by the project manager."};
    if(criterion.check==="benefit-profiles-owned"){
      if(!items.length)return {criterion,status:"Fail" as const,detail:"No benefit profiles are linked to this project."};
      const unowned=items.filter(benefit=>!benefit.owner);
      return unowned.length?{criterion,status:"Fail" as const,detail:`${unowned.length} of ${items.length} benefit profiles have no owner.`}:{criterion,status:"Pass" as const,detail:`${items.length} benefit profiles, each with a named owner.`};
    }
    if(criterion.check==="benefit-baselines"){
      const missing=items.filter(benefit=>!benefit.measures.some(measure=>measure.baselineDate&&measure.targetProfile.length));
      if(!items.length)return {criterion,status:"Fail" as const,detail:"No benefit profiles are linked to this project."};
      return missing.length?{criterion,status:"Fail" as const,detail:`${missing.length} benefit${missing.length===1?"":"s"} without a baseline and target profile.`}:{criterion,status:"Pass" as const,detail:"Every benefit has a baseline and a target profile."};
    }
    if(criterion.check==="benefits-handover"){
      const tracked=items.filter(benefit=>benefit.status!=="Closed"&&benefit.status!=="Not realised");
      const missing=tracked.filter(benefit=>!benefit.handover);
      if(!tracked.length)return {criterion,status:"Pass" as const,detail:"No benefits remain in realisation."};
      return missing.length?{criterion,status:"Fail" as const,detail:`${missing.length} of ${tracked.length} benefits have no BAU owner or review schedule.`}:{criterion,status:"Pass" as const,detail:`All ${tracked.length} benefits handed over to a BAU owner.`};
    }
    if(criterion.check==="lessons-reviewed")return options?.lessonsReviewed?{criterion,status:"Pass" as const,detail:"The project manager has confirmed relevant lessons were reviewed."}:{criterion,status:"Fail" as const,detail:"Relevant lessons from similar projects have not been ticked as reviewed."};
    return options?.phaseReviewHeld?{criterion,status:"Pass" as const,detail:"A phase lessons review has been recorded for this phase."}:{criterion,status:"Fail" as const,detail:"No phase lessons review has been recorded for this phase."};
  });
}

export interface PortfolioIssue extends Issue { projectId: string; projectName: string; programmeId: string; programmeName: string }
export function getPortfolioIssues():PortfolioIssue[]{return projects.flatMap(project=>{const programme=programmes.find(item=>item.id===project.programmeId);return project.issues.map(issue=>({...issue,projectId:project.id,projectName:project.name,programmeId:project.programmeId,programmeName:programme?.name??"Unassigned"}))})}
export interface PortfolioChange extends ChangeRequest { projectId: string; projectName: string; programmeId: string; programmeName: string }
export function getPortfolioChanges():PortfolioChange[]{return projects.flatMap(project=>{const programme=programmes.find(item=>item.id===project.programmeId);return (project.changes??[]).map(change=>({...change,projectId:project.id,projectName:project.name,programmeId:project.programmeId,programmeName:programme?.name??"Unassigned"}))})}

// ---- Dependency health (parity fixture only) ----
// The database computes dependency health in v_dependency_health. This port of the prototype
// rule exists only so scripts/health-parity.ts can check the SQL against it.
export function workingDaysBetween(from: Date, to: Date) {
  const direction = to >= from ? 1 : -1;
  let count = 0;
  const cursor = new Date(from);
  while (direction > 0 ? cursor < to : cursor > to) {
    cursor.setDate(cursor.getDate() + direction);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += direction;
  }
  return count;
}
const isDependencyConfirmed = (dependency: Dependency) => dependency.giverAccepted && dependency.receiverAccepted;
function getDependencyGiverMilestone(end: DependencyEnd): Milestone | undefined {
  if (!end.milestoneId || !end.projectId) return undefined;
  return getProject(end.projectId)?.milestones.find(item => item.id === end.milestoneId);
}
export function getDependencyHealth(dependency: Dependency): Health {
  if (dependency.healthOverride) return dependency.healthOverride;
  if (dependency.validation === "Closed") return "On Track";
  if (dependency.validation === "Broken") return "Off Track";
  const milestone = getDependencyGiverMilestone(dependency.giver);
  if (dependency.type === "Sequencing" && milestone) {
    if (milestone.actualDate) return "On Track";
    const forecast = parseDate(milestone.forecastDate), requiredBy = parseDate(dependency.requiredBy);
    if (forecast > requiredBy) return "Off Track";
    if (workingDaysBetween(forecast, requiredBy) <= getSettings().health.dependencyAtRiskWorkingDays) return "At Risk";
    return "On Track";
  }
  const requiredBy = parseDate(dependency.requiredBy);
  if (requiredBy < today) return "Off Track";
  if (!isDependencyConfirmed(dependency) && workingDaysBetween(today, requiredBy) <= 20) return "At Risk";
  return "On Track";
}
