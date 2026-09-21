import type { BoardColumn, BoardRow } from "@/components/board-workspace";
import type { Issue, Project, Risk, Task } from "@/data/types";
import type { PortfolioMilestone } from "@/services/pmo";
import { getStageNames, getEffortHealth, getFinancialHealth, getIssueHealth, getProjectHealth, getProjectPortfolioDetails, getScheduleHealth } from "@/services/pmo";
export const projectColumns:BoardColumn[]=[
 {key:"title",label:"Project",type:"text",editable:true,summary:"count",width:260},
 {key:"programme",label:"Programme",type:"text",width:230},
 {key:"people",label:"Project manager",type:"people",editable:true},
 {key:"stage",label:"Phase",type:"status",editable:true,options:getStageNames(),width:200},
 {key:"tier",label:"Tier",type:"text"},
 {key:"projectOfficer",label:"Project officer",type:"text"},
 {key:"state",label:"State",type:"status",editable:true,options:["Proposed","Active","On Hold","Closed"]},
 {key:"priority",label:"Priority",type:"priority",editable:true,options:["Low","Moderate","High","Critical"]},
 {key:"status",label:"Overall",type:"status",options:["On Track","At Risk","Off Track","Not Set"],summary:"rag"},
 {key:"scheduleHealth",label:"Schedule",type:"status",summary:"rag"},
 {key:"financialHealth",label:"Financial",type:"status",summary:"rag"},
 {key:"effortHealth",label:"Effort",type:"status",summary:"rag"},
 {key:"issueHealth",label:"Issues",type:"status",summary:"rag"},
 {key:"finish",label:"Finish",type:"date",editable:true},
 {key:"budget",label:"Budget",type:"number",unit:"currency",summary:"sum"},
 {key:"actual",label:"Actual",type:"number",unit:"currency",summary:"sum"},
 {key:"forecast",label:"Forecast",type:"number",unit:"currency",summary:"sum"},
 {key:"variance",label:"Variance",type:"number",unit:"currency",summary:"sum"},
 {key:"activeRisks",label:"Active risks",type:"number",summary:"sum"},
 {key:"activeIssues",label:"Active issues",type:"number",summary:"sum"},
 {key:"taskSource",label:"Task source",type:"tags"},
 {key:"collections",label:"Collections",type:"tags"},
 {key:"nextMilestone",label:"Next milestone",type:"text",width:220},
 {key:"lastReport",label:"Last status report",type:"date"},
];
export const projectsToRows=(projects:Project[]):BoardRow[]=>projects.map(project=>{const details=getProjectPortfolioDetails(project);return{id:project.id,title:project.name,programme:details.programmeName,people:[project.manager],manager:project.manager,stage:project.stage,tier:project.tier,projectOfficer:project.projectOfficer??"Unassigned",state:project.state,priority:project.priority,status:getProjectHealth(project),scheduleHealth:getScheduleHealth(project),financialHealth:getFinancialHealth(project),effortHealth:getEffortHealth(project),issueHealth:getIssueHealth(project),start:project.start,finish:project.finish,baselineFinish:project.baselineFinish,budget:project.budget,actual:project.actual,forecast:project.forecast,variance:project.forecast-project.budget,activeRisks:project.risks.filter(item=>item.status==="Open").length,activeIssues:project.issues.filter(item=>item.status==="Open").length,taskSource:[project.taskSource],collections:details.collectionNames,nextMilestone:details.nextMilestone?`${details.nextMilestone.title} · ${details.nextMilestone.forecastDate}`:"—",lastReport:details.latestReport?.reportingDate??"No report",statusReportOverdue:details.statusReportOverdue,digitalCommittee:project.collectionIds.includes("digital-committee"),timeline:"",group:details.programmeName}});
export const taskColumns:BoardColumn[]=[{key:"title",label:"Task",type:"text",editable:true,summary:"count",width:280},{key:"deliveryStatus",label:"Status",type:"status",summary:"rag"},{key:"people",label:"Assignees",type:"people",editable:true},{key:"start",label:"Start",type:"date",editable:true},{key:"finish",label:"Finish",type:"date",editable:true},{key:"timeline",label:"Timeline",type:"timeline"},{key:"progress",label:"Progress",type:"progress",editable:true,summary:"average",unit:"%"},{key:"priority",label:"Priority",type:"priority",editable:true,options:["Low","Moderate","High","Critical"]},{key:"tags",label:"Bucket",type:"tags"},{key:"dependencies",label:"Dependencies",type:"dependency"},{key:"formula",label:"Checklist",type:"formula"}];
const dateValue=(value:string)=>{const [day=1,month=1,year=1970]=value.split("/").map(Number);return new Date(year,month-1,day).getTime()};
const today=dateValue("21/09/2026");
const delivery=(task:Task)=>task.percentComplete===100?"Completed":dateValue(task.finish)<today?"Overdue":dateValue(task.start)>today?"Future":"On Track";
export const tasksToRows=(tasks:Task[]):BoardRow[]=>tasks.map(task=>({id:task.id,title:task.title,deliveryStatus:delivery(task),status:task.bucket,people:task.assignees,start:task.start,finish:task.finish,baselineFinish:task.finish,timeline:"",progress:task.percentComplete,priority:task.priority,tags:[task.bucket],dependencies:task.dependencies,formula:`${task.checklistCount} items`,complete:task.percentComplete===100,isMilestone:task.isMilestone,group:task.bucket}));
export const riskColumns:BoardColumn[]=[{key:"title",label:"Risk",type:"text",editable:true,summary:"count",width:280},{key:"status",label:"Status",type:"status",editable:true,options:["Open","Closed"]},{key:"people",label:"Owner",type:"people",editable:true},{key:"probability",label:"Probability",type:"number",summary:"average"},{key:"impact",label:"Impact",type:"number",summary:"average"},{key:"number",label:"Score",type:"number",summary:"average"},{key:"response",label:"Response",type:"status",editable:true,options:["Avoid","Reduce","Transfer","Accept"]},{key:"finish",label:"Review",type:"date",editable:true},{key:"formula",label:"Band",type:"formula"}];
export const risksToRows=(risks:Risk[]):BoardRow[]=>risks.map(risk=>({id:risk.id,title:risk.title,status:risk.status,people:[risk.owner],probability:risk.probability,impact:risk.impact,number:risk.score,response:risk.response,finish:risk.reviewDate,formula:risk.score>=15?"Critical":risk.score>=8?"Elevated":"Low",group:risk.status}));
export const issueColumns:BoardColumn[]=[{key:"title",label:"Issue",type:"text",editable:true,summary:"count",width:280},{key:"status",label:"Status",type:"status",editable:true,options:["Open","Closed"]},{key:"people",label:"Owner",type:"people",editable:true},{key:"priority",label:"Severity",type:"priority",editable:true,options:["Low","Medium","High"]},{key:"finish",label:"Due",type:"date",editable:true}];
export const issuesToRows=(issues:Issue[]):BoardRow[]=>issues.map(issue=>({id:issue.id,title:issue.title,status:issue.status,people:[issue.owner],priority:issue.severity,finish:issue.dueDate,group:issue.status}));
export const milestoneColumns:BoardColumn[]=[{key:"title",label:"Milestone",type:"text",editable:true,summary:"count",width:280},{key:"project",label:"Project",type:"text",width:240},{key:"programme",label:"Programme",type:"text",width:240},{key:"type",label:"Type",type:"status",editable:true,options:["Delivery","Gate","Key date","External dependency"]},{key:"people",label:"Owner",type:"people",editable:true},{key:"deliveryStatus",label:"Status",type:"status",summary:"rag"},{key:"baseline",label:"Baseline",type:"date",editable:true},{key:"finish",label:"Forecast",type:"date",editable:true},{key:"actual",label:"Actual",type:"date"},{key:"number",label:"Slip",type:"number",unit:" days",summary:"average"},{key:"tags",label:"Reporting",type:"tags"},{key:"timeline",label:"Timeline",type:"timeline"}];
export const milestonesToRows=(items:PortfolioMilestone[]):BoardRow[]=>items.map(item=>({id:`${item.projectId}-${item.id}`,title:item.title,project:item.projectName,programme:item.programmeName,type:item.type,people:[item.owner],deliveryStatus:item.status,status:item.status,baseline:item.baselineDate,start:item.baselineDate,finish:item.forecastDate,actual:item.actualDate??"—",number:item.slipDays,tags:item.reportToCommittee?["Committee"]:[],timeline:"",complete:item.status==="Completed",isMilestone:true,reportToCommittee:item.reportToCommittee,isGate:item.type==="Gate",overdue:item.status==="Overdue",thisQuarter:dateValue(item.forecastDate)>=dateValue("01/07/2026")&&dateValue(item.forecastDate)<=dateValue("30/09/2026"),group:item.programmeName,projectId:item.projectId}));
