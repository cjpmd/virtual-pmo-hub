import { collections, people, portfolio, programmes, projects } from "@/data/mock-data";
import type { Health, Person, Portfolio, Programme, Project, Risk, TeamMember } from "@/data/types";

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
  if (project.milestones.some(m=>!m.complete && parseDate(m.dueDate)<today)) return "Off Track";
  const baseline=parseDate(project.baselineFinish).getTime()-parseDate(project.start).getTime();
  const slip=parseDate(project.finish).getTime()-parseDate(project.baselineFinish).getTime();
  if (baseline>0 && slip/baseline>0.1) return "Off Track";
  if (project.taskCount && project.overdueTaskCount/project.taskCount>0.15) return "At Risk";
  return "On Track";
}
export function getIssueHealth(project: Project): Health {
  if (project.issues.some(i=>i.status==="Open"&&i.severity==="High") || project.risks.some(r=>r.status==="Open"&&r.score>=15)) return "Off Track";
  if (project.issues.some(i=>i.status==="Open") || project.risks.some(r=>r.status==="Open"&&r.score>=10)) return "At Risk";
  return "On Track";
}
export function getFinancialHealth(project: Project): Health {
  if (project.forecast > project.budget * 1.1) return "Off Track";
  if (project.forecast > project.budget) return "At Risk";
  return "On Track";
}
export function getEffortHealth(project: Project): Health {
  if (project.taskCount && project.overdueTaskCount / project.taskCount > 0.3) return "Off Track";
  if (project.taskCount && project.overdueTaskCount / project.taskCount > 0.15) return "At Risk";
  return "On Track";
}
export function getProjectHealth(project: Project): Health { return project.healthOverride?.health ?? worst([getScheduleHealth(project),getIssueHealth(project)]); }
export function getProjects(programmeId?:string) { return projects.filter(p=>!programmeId||p.programmeId===programmeId); }
export function getProject(id:string) { return projects.find(p=>p.id===id); }
export function getProgrammes() { return programmes; }
export function getProgramme(id:string) { return programmes.find(p=>p.id===id); }
export function getProgrammeHealth(programme:Programme):Health { return programme.healthOverride?.health ?? worst(getProjects(programme.id).map(getProjectHealth)); }
export function getPortfolio():Portfolio { return portfolio; }
export function getPortfolioHealth():Health { return portfolio.healthOverride?.health ?? worst(programmes.map(getProgrammeHealth)); }
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
export interface ProjectTeamMember extends TeamMember { person: Person; completedHours: number; remainingHours: number; weeklyHours: number }
export interface ResourceAssignment extends TeamMember { projectId: string; projectName: string; programmeId: string; weeklyHours: number }
export interface ResourceSummary { person: Person; assignments: ResourceAssignment[]; totalHours: number; currentWeeklyHours: number; peakWeeklyHours: number; overAllocated: boolean }
export interface PortfolioRisk extends Risk { projectId: string; projectName: string; programmeId: string; programmeName: string }
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
export function getProgrammeMetrics(programme: Programme){
  const items=getProjects(programme.id); return { projectCount:items.length, active:items.filter(p=>p.state==="Active").length, budget:items.reduce((s,p)=>s+p.budget,0), forecast:items.reduce((s,p)=>s+p.forecast,0), rag:{ green:items.filter(p=>getProjectHealth(p)==="On Track").length, amber:items.filter(p=>getProjectHealth(p)==="At Risk").length, red:items.filter(p=>getProjectHealth(p)==="Off Track").length } };
}
export function getPortfolioMetrics(){ const active=projects.filter(p=>p.state==="Active"); const rag={green:projects.filter(p=>getProjectHealth(p)==="On Track").length,amber:projects.filter(p=>getProjectHealth(p)==="At Risk").length,red:projects.filter(p=>getProjectHealth(p)==="Off Track").length}; return {activeProjects:active.length,totalBudget:projects.reduce((s,p)=>s+p.budget,0),forecast:projects.reduce((s,p)=>s+p.forecast,0),percentOnTrack:Math.round((rag.green/projects.length)*100),rag}; }