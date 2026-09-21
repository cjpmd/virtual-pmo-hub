import { collections, people, portfolio, programmes, projects } from "@/data/mock-data";
import type { Health, Portfolio, Programme, Project } from "@/data/types";

const rank: Record<Health,number> = {"Not Set":0,"On Track":1,"At Risk":2,"Off Track":3};
const worst = (items: Health[]): Health => {
  let result: Health = "Not Set";
  for (const item of items) if ((rank[item] ?? 0) > (rank[result] ?? 0)) result = item;
  return result;
};
const parseDate = (value:string) => { const [d,m,y]=value.split("/").map(Number); return new Date(y,m-1,d); };
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
export function getProjectHealth(project: Project): Health { return project.healthOverride?.health ?? worst([getScheduleHealth(project),getIssueHealth(project)]); }
export function getProjects(programmeId?:string) { return projects.filter(p=>!programmeId||p.programmeId===programmeId); }
export function getProject(id:string) { return projects.find(p=>p.id===id); }
export function getProgrammes() { return programmes; }
export function getProgramme(id:string) { return programmes.find(p=>p.id===id); }
export function getProgrammeHealth(programme:Programme):Health { return programme.healthOverride?.health ?? worst(getProjects(programme.id).map(getProjectHealth)); }
export function getPortfolio():Portfolio { return portfolio; }
export function getPortfolioHealth():Health { return portfolio.healthOverride?.health ?? worst(programmes.map(getProgrammeHealth)); }
export function getCollections(){ return collections; }
export function getPeople(){ return people; }
export function getProgrammeMetrics(programme: Programme){
  const items=getProjects(programme.id); return { projectCount:items.length, active:items.filter(p=>p.state==="Active").length, budget:items.reduce((s,p)=>s+p.budget,0), forecast:items.reduce((s,p)=>s+p.forecast,0), rag:{ green:items.filter(p=>getProjectHealth(p)==="On Track").length, amber:items.filter(p=>getProjectHealth(p)==="At Risk").length, red:items.filter(p=>getProjectHealth(p)==="Off Track").length } };
}
export function getPortfolioMetrics(){ const active=projects.filter(p=>p.state==="Active"); const rag={green:projects.filter(p=>getProjectHealth(p)==="On Track").length,amber:projects.filter(p=>getProjectHealth(p)==="At Risk").length,red:projects.filter(p=>getProjectHealth(p)==="Off Track").length}; return {activeProjects:active.length,totalBudget:projects.reduce((s,p)=>s+p.budget,0),forecast:projects.reduce((s,p)=>s+p.forecast,0),percentOnTrack:Math.round((rag.green/projects.length)*100),rag}; }