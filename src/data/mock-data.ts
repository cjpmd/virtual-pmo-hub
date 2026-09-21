import type { Benefit, BenefitCategory, BenefitClassification, BenefitStatus, Collection, Person, Portfolio, Programme, Project, ProjectTier, Risk, Issue, Task, TeamMember, ChangeRequest, StatusReport, Milestone, MilestoneStatus, MilestoneType, Roadmap, IssuedTask, GenericResource, ResourceAssignment, ProjectRequest, ResourceTeam, StrategicObjective } from "./types";
import { defaultLifecyclePhases, defaultStage } from "./lifecycle";

export const portfolio: Portfolio = { id: "dts-2526", name: "DTS 2025/26", description: "The university’s strategic portfolio of digital, technology and service improvement work.", owner: "Chris McDonald", budget: 8_750_000 };

export const strategicObjectives:StrategicObjective[]=[
 {id:"obj-student",portfolioId:portfolio.id,title:"Outstanding student experience",description:"Create inclusive, reliable and responsive digital services for every student.",owner:"Priya Nair"},
 {id:"obj-research",portfolioId:portfolio.id,title:"Research excellence and capability",description:"Provide secure, scalable digital capability for world-class research.",owner:"Daniel Mercer"},
 {id:"obj-finance",portfolioId:portfolio.id,title:"Financial sustainability",description:"Deliver demonstrable value and reduce avoidable technology costs.",owner:"Martin Lowe"},
 {id:"obj-efficiency",portfolioId:portfolio.id,title:"Operational efficiency",description:"Simplify processes and release colleague capacity for higher-value work.",owner:"Rachel King"},
 {id:"obj-cyber",portfolioId:portfolio.id,title:"Cyber resilience",description:"Reduce institutional exposure and improve recovery from disruption.",owner:"Aisha Wallace"},
 {id:"obj-netzero",portfolioId:portfolio.id,title:"Net zero and sustainability",description:"Reduce the environmental impact of digital services and infrastructure.",owner:"Sophie Green"},
];

const personRows: Array<[string,string,string,string,ResourceTeam,string,number,number,number,string[]]> = [
  ["cm","Chris McDonald","Head of Programmes & Projects","CM","PMO","Rachel King",36,1,35,["Portfolio management","Governance"]],
  ["ap","Amelia Price","Programme Manager","AP","PMO","Chris McDonald",36,1,30,["Programme management","Governance"]],
  ["ob","Oliver Bennett","Programme Manager","OB","Infrastructure","Chris McDonald",36,1,35,["Infrastructure","Business continuity"]],
  ["sp","Sienna Patel","Programme Manager","SP","Applications","Chris McDonald",36,1,30,["Programme management","FinOps"]],
  ["th","Theo Hughes","Programme Manager","TH","Applications","Chris McDonald",36,1,30,["Automation","Programme management"]],
  ["if","Imogen Foster","Programme Manager","IF","PMO","Chris McDonald",28.8,.8,30,["Change management","Continuous improvement"]],
  ["fw","Freya Walsh","Senior Project Manager","FW","PMO","Chris McDonald",36,1,25,["Project management","Governance"]],
  ["gc","George Clarke","Project Manager","GC","PMO","Chris McDonald",36,1,25,["Project management","Agile delivery"]],
  ["nb","Nadia Begum","Project Manager","NB","PMO","Chris McDonald",36,1,25,["Project management","Automation"]],
  ["er","Elliot Reed","Project Manager","ER","PMO","Chris McDonald",28.8,.8,25,["Project management","Benefits management"]],
  ["mh","Maya Harrison","Business Analyst","MH","Applications","Sienna Patel",36,1,20,["Business analysis","Data analysis"]],
  ["jc","Jacob Cole","Technical Lead","JC","Infrastructure","Oliver Bennett",36,1,20,["Solution architecture","Networks"]],
  ["lo","Layla Owen","Change Manager","LO","PMO","Chris McDonald",36,1,30,["Change management","Training"]],
  ["hs","Harrison Shaw","Security Lead","HS","Cyber Security","Aisha Wallace",36,1,25,["Cyber security","Risk management"]],
  ["ec","Eva Chen","Service Designer","EC","Applications","Sienna Patel",36,1,25,["Service design","User research"]],
  ["ak","Aisha Khan","Network Engineer","AK","Infrastructure","Jacob Cole",36,1,30,["Networks","Azure"]],
  ["db","Daniel Brooks","Cloud Engineer","DB","Infrastructure","Jacob Cole",36,1,30,["Azure","Infrastructure"]],
  ["sr","Sofia Rahman","Security Analyst","SR","Cyber Security","Harrison Shaw",36,1,25,["Cyber security","Identity"]],
  ["tw","Thomas Webb","Service Desk Analyst","TW","Service Desk","Nadia Begum",36,1,60,["Service operations","Microsoft 365"]],
  ["pn","Priya Ncube","Service Desk Team Lead","PN","Service Desk","Nadia Begum",36,1,55,["Service operations","Change management"]],
];
export const people: Person[] = personRows.map(([id,name,jobTitle,initials,team,lineManager,contractedHoursPerWeek,fte,bauPercentage,skills],index) => ({id,name,jobTitle,initials,team,lineManager,contractedHoursPerWeek,fte,bauPercentage,skills:skills.map((skill,skillIndex)=>({name:skill,level:Math.min(3,2+((index+skillIndex)%2)) as 2|3})),leave:index%5===0?[{id:`leave-${id}`,start:"19/10/2026",end:"23/10/2026",type:"Annual leave"}]:index%7===0?[{id:`leave-${id}`,start:"09/11/2026",end:"11/11/2026",type:"Training"}]:[] }));

export const programmes: Programme[] = [
  { id:"standards", portfolioId:portfolio.id, name:"1. Standards, Governance & Best Practice", description:"Strengthening governance, assurance and consistent delivery standards across DTS.", manager:"Amelia Price", projectManager:"George Clarke", projectOfficer:"Nadia Rahman", sponsor:"Daniel Mercer", start:"01/08/2025", end:"31/07/2027", budget:1450000, valueStatement:"Create trusted, repeatable ways of working that improve delivery confidence and decision quality." },
  { id:"resilience", portfolioId:portfolio.id, name:"2. Resilience & Business Continuity", description:"Improving cyber security, infrastructure resilience and continuity of critical services.", manager:"Oliver Bennett", projectManager:"Freya Walsh", projectOfficer:"Owen Blake", sponsor:"Aisha Wallace", start:"01/09/2025", end:"31/12/2027", budget:2380000, valueStatement:"Protect teaching, research and operations from disruption while reducing institutional risk." },
  { id:"optimisation", portfolioId:portfolio.id, name:"3. Optimisation & Cost Management", description:"Modernising core services and improving the value delivered by technology investments.", manager:"Sienna Patel", projectManager:"Freya Walsh", projectOfficer:"Sofia Marsh", sponsor:"Martin Lowe", start:"01/10/2025", end:"31/07/2027", budget:1720000, valueStatement:"Release capacity and reduce avoidable cost through a simpler, better-managed technology estate." },
  { id:"automation", portfolioId:portfolio.id, name:"4. Efficiency, Automation & AI", description:"Using automation and responsible AI to create better staff and student experiences.", manager:"Theo Hughes", projectManager:"George Clarke", projectOfficer:"Nadia Rahman", sponsor:"Priya Nair", start:"01/08/2025", end:"31/12/2027", budget:1910000, valueStatement:"Give colleagues time back and improve service quality through practical, responsible automation." },
  { id:"people", portfolioId:portfolio.id, name:"5. People, Knowledge & Continuous Improvement", description:"Building digital capability, knowledge and a culture of continuous improvement.", manager:"Imogen Foster", projectManager:"George Clarke", projectOfficer:"Owen Blake", sponsor:"Rachel King", start:"01/01/2026", end:"31/07/2027", budget:1290000, valueStatement:"Equip teams with the skills, insight and confidence to sustain digital improvement." },
];

const managers = ["Freya Walsh","George Clarke","Nadia Begum","Elliot Reed","Amelia Price"];
const namesByProgramme: Record<string,string[]> = {
  standards:["Project Management Standards", "Digital Landscape Mapping", "Architecture Review Board", "Cyber and Information Governance", "Benefits Management Framework"],
  resilience:["Improve Infrastructure Resilience (VXRail)", "Reduce Our Cyber Risk", "Network Refresh: Data Centre", "Business Continuity Testing", "Identity Recovery Service"],
  optimisation:["Windows 11 Rollout", "VDI Review", "Asset Management", "Service Desk Optimisation", "Cloud Cost Management"],
  automation:["Account creation automation", "Copilot / Microsoft integration", "Ebbot (chatbot)", "Workflow Automation Hub", "Research Data Triage AI"],
  people:["Document Management", "Digital Skills Academy", "Knowledge Base Renewal", "DTS Operating Model", "Continuous Improvement Network"],
};
// Additional workstream projects referenced by the dependency register (Prompt I1).
const extraNamesByProgramme: Record<string,string[]> = {
  standards:["Business Change Management Frameworks", "SMIS & TOPdesk Best Practice"],
  resilience:["CIS Safeguards & Cyber Security Improvements", "Storage Expansion", "DFS Migrations & Data Retention"],
  optimisation:["SITS / Admissions Management"],
  automation:["Testing Automation & Workflow Streamlining"],
  people:["Working Practices & Change Management Principles", "Identify Opportunities for Training & Collaboration"],
};
const allNamesByProgramme: Record<string,string[]> = Object.fromEntries(Object.entries(namesByProgramme).map(([programmeId,names])=>[programmeId,[...names,...(extraNamesByProgramme[programmeId]??[])]]));

const greenRisk = (id:string): Risk => ({ id, title:"Supplier capacity", description:"Delivery capacity is being monitored.", owner:"Amelia Price", probability:2, impact:3, score:6, response:"Reduce", status:"Open", reviewDate:"30/09/2026" });
const redRisk = (id:string): Risk => ({ id, title:"Critical control gap", description:"Control remediation is behind the agreed plan.", owner:"Harrison Shaw", probability:4, impact:5, score:20, response:"Reduce", status:"Open", reviewDate:"23/09/2026" });
const riskThemes = [
  ["Key specialist availability", "A specialist role is shared with other priority work.", "Maya Harrison"],
  ["Supplier lead time", "Lead times may affect the next planned delivery window.", "Amelia Price"],
  ["Stakeholder decision delay", "A cross-service decision is needed before delivery can progress.", "George Clarke"],
  ["Technical integration complexity", "The target service has more integration points than first estimated.", "Jacob Cole"],
] as const;
const issue = (id:string, high=false): Issue => ({ id, title:high?"Production readiness blocked":"Decision required", owner:"George Clarke", severity:high?"High":"Medium", status:"Open", dueDate:"30/09/2026" });
const milestoneDates=[
  ["15/08/2026","15/08/2026","15/08/2026"],
  ["12/09/2026","12/09/2026","12/09/2026"],
  ["30/09/2026","30/09/2026",undefined],
  ["18/10/2026","27/10/2026",undefined],
  ["20/11/2026","20/11/2026",undefined],
  ["15/12/2026","22/12/2026",undefined],
  ["29/01/2027","29/01/2027",undefined],
] as const;
const milestoneTitles:[string,MilestoneType][]=[
  ["Discovery outcomes agreed","Delivery"],
  ["GATE 0 - Ready to Design","Gate"],
  ["Design authority approval","Gate"],
  ["Pilot service launch","Delivery"],
  ["Supplier mobilisation","External dependency"],
  ["GATE 1 - Ready to Deliver","Gate"],
  ["Benefits review","Key date"],
];
const buildMilestones=(projectNumber:number,isRed:boolean,isAmber:boolean):Milestone[]=>{
  const count=3+(projectNumber%6);
  // Each project runs to its own rhythm: delivered work sits further back and future work
  // further out, so the portfolio delivery curve is a curve rather than one vertical step.
  const doneShift=-(projectNumber%10)*6, aheadShift=(projectNumber%12)*13;
  return milestoneTitles.slice(0,count).map(([title,type],index)=>{
    const source=milestoneDates[index]??milestoneDates[0];
    const shift=source?.[2]?doneShift:aheadShift;
    let baselineDate=index===0?shiftMockDate("28/08/2026",(projectNumber%18)+doneShift):shiftMockDate(source?.[0]??"30/09/2026",shift);
    let forecastDate:string=shiftMockDate(source?.[1]??source?.[0]??"30/09/2026",shift);
    let actualDate:string|undefined=index===0
      ?shiftMockDate(baselineDate,projectNumber%4===0?2:projectNumber%3===0?-1:0)
      :(source?.[2]?shiftMockDate(source[2],shift):undefined);
    // Only the exception projects carry a slipped gate: red has already missed it, amber is late but still ahead of today.
    if(index===1&&(isRed||isAmber)){
      baselineDate=shiftMockDate("12/09/2026",-(projectNumber%4)*5);
      forecastDate=isRed?shiftMockDate("21/09/2026",-(3+(projectNumber%5)*4)):shiftMockDate("21/09/2026",5+(projectNumber%6)*8);
      actualDate=undefined;
    }
    const forecastMs=parseMockDate(forecastDate),baselineMs=parseMockDate(baselineDate),todayMs=parseMockDate("21/09/2026");
    const status:MilestoneStatus=actualDate?"Completed":forecastMs<todayMs?"Overdue":forecastMs>baselineMs?"Late":forecastMs-todayMs>30*86400000?"Future":"On Track";
    const historyDates=["24/07/2026","07/08/2026","21/08/2026","04/09/2026","18/09/2026"];
    const slipDays=Math.round((forecastMs-baselineMs)/86400000);
    return {id:`m-${projectNumber}-${index}`,title,type,owner:managers[(projectNumber+index)%managers.length]??"Freya Walsh",baselineDate,forecastDate,...(actualDate?{actualDate}:{}),status,reportToCommittee:type==="Gate"||isRed,forecastHistory:historyDates.map((reportingDate,point)=>({reportingDate,forecastDate:shiftMockDate(baselineDate,Math.max(0,Math.round(slipDays*(point/4))))}))};
  });
};
/** Approved budget with a forecast that reflects the project's health, and spend to date part way through it. */
const spend=(number:number,isRed:boolean,isAmber:boolean)=>{
  const budget=120000+(number%5)*85000;
  const factor=isRed?1.14:isAmber?1.06:[1,0.97,1,0.94][number%4]??1;
  const forecast=Math.round(budget*factor/500)*500;
  return {budget,actual:Math.round(forecast*(0.34+(number%5)*0.09)/500)*500,forecast};
};
const parseMockDate=(value:string)=>{const [d=1,m=1,y=1970]=value.split("/").map(Number);return new Date(y,m-1,d).getTime()};
const shiftMockDate=(value:string,days:number)=>{const date=new Date(parseMockDate(value)+days*86400000);return `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`};

let projectCounter=0;
const baseProjects: Project[] = Object.entries(allNamesByProgramme).flatMap(([programmeId,names], programmeIndex) => names.map((name) => {
  const number = projectCounter++;
  const isRed = name === "Reduce Our Cyber Risk" || name === "Network Refresh: Data Centre";
  const isAmber = name === "Ebbot (chatbot)" || [2,8,12,18,23].includes(number);
  const state = number % 9 === 0 ? "Proposed" : number % 11 === 0 ? "On Hold" : "Active";
  const stage = defaultLifecyclePhases[number%6]?.name ?? defaultStage;
  const tier: ProjectTier = number%5===0 ? "Large" : number%3===0 ? "Small" : "Medium";
  const projectOfficer = ["Nadia Rahman","Owen Blake","Sofia Marsh"][number%3] ?? "Nadia Rahman";
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""), programmeId, portfolioId:portfolio.id, name,
    manager:managers[number%managers.length] ?? "Freya Walsh", projectOfficer, sponsor:["Daniel Mercer","Aisha Wallace","Martin Lowe","Priya Nair","Rachel King"][programmeIndex] ?? "Daniel Mercer",
    tier: name === "Ebbot (chatbot)" ? "Medium" : isRed ? "Large" : tier,
    stage:name === "Ebbot (chatbot)" ? "Phase 3 - Design & Procure" : stage, state, priority:isRed?"Critical":isAmber?"High":number%3===0?"Moderate":"Low",
    start:`${String((number%20)+1).padStart(2,"0")}/0${(number%7)+1}/2026`, finish:`${String((number%20)+1).padStart(2,"0")}/0${(number%3)+1}/2027`, baselineFinish:`${String((number%20)+1).padStart(2,"0")}/0${(number%3)+1}/2027`,
    ...spend(number,isRed,isAmber),
    businessCase:`Improve university services through ${name.toLowerCase()}.`, benefits:"Reduced operational effort, improved resilience and a better colleague experience.",
    taskSource:number%3===0?"Planner (Premium)":number%3===1?"Planner (Basic)":"Native", collectionIds:[],
    milestones:buildMilestones(number,isRed,isAmber), taskCount:10+(number%9), overdueTaskCount:isRed?4:isAmber?3:Math.min(1,number%2),
    risks:isRed?[redRisk(`r-${number}`),{...greenRisk(`r-${number}-2`),title:"Recovery plan dependency",probability:3,impact:4,score:12}]:[
      {...greenRisk(`r-${number}`),title:riskThemes[number%riskThemes.length]?.[0]??"Supplier capacity",description:riskThemes[number%riskThemes.length]?.[1]??"Delivery capacity is being monitored.",owner:riskThemes[number%riskThemes.length]?.[2]??"Amelia Price",probability:(isAmber?3:2),impact:(isAmber?4:(number%3+2)) as 2|3|4,score:isAmber?12:2*(number%3+2)},
      ...(number%3===0?[{...greenRisk(`r-${number}-2`),title:"Benefits adoption",description:"Operational adoption may take longer than planned.",owner:"Layla Owen",probability:2 as const,impact:2 as const,score:4,response:"Reduce" as const,status:"Open" as const}]:[]),
    ], issues:isRed?[issue(`i-${number}`,true)]:isAmber?[issue(`i-${number}`)]:[],
  } satisfies Project;
}));

const detailedTasks: Task[] = [
  { id:"t1", title:"Confirm service requirements", bucket:"Discovery", assignees:["Maya Harrison"], start:"01/09/2026", finish:"09/09/2026", baselineFinish:"09/09/2026", percentComplete:100, estimatedEffortHours:28, priority:"High", isMilestone:false, checklistCount:5, dependencies:[] },
  { id:"t2", title:"Complete solution design", bucket:"Design", assignees:["Jacob Cole"], start:"10/09/2026", finish:"23/09/2026", baselineFinish:"20/09/2026", percentComplete:65, estimatedEffortHours:64, priority:"High", isMilestone:false, checklistCount:7, dependencies:["t1"] },
  { id:"t3", title:"Design approval", bucket:"Design", assignees:["Amelia Price"], start:"24/09/2026", finish:"24/09/2026", baselineFinish:"24/09/2026", percentComplete:0, estimatedEffortHours:6, priority:"Critical", isMilestone:true, checklistCount:2, dependencies:["t2"] },
  { id:"t4", title:"Pilot with service desk", bucket:"Pilot", assignees:["Eva Chen","Layla Owen"], start:"28/09/2026", finish:"16/10/2026", baselineFinish:"16/10/2026", percentComplete:0, estimatedEffortHours:96, priority:"Moderate", isMilestone:false, checklistCount:8, dependencies:["t3"] },
  { id:"t5", title:"Prepare adoption materials", bucket:"Change", assignees:["Layla Owen"], start:"05/10/2026", finish:"23/10/2026", baselineFinish:"23/10/2026", percentComplete:0, estimatedEffortHours:42, priority:"Moderate", isMilestone:false, checklistCount:6, dependencies:["t2"] },
  { id:"t6", title:"Go-live readiness review", bucket:"Launch", assignees:["Freya Walsh"], start:"26/10/2026", finish:"26/10/2026", baselineFinish:"26/10/2026", percentComplete:0, estimatedEffortHours:8, priority:"High", isMilestone:true, checklistCount:10, dependencies:["t4","t5"] },
  { id:"t7", title:"Early-life support", bucket:"Launch", assignees:["George Clarke"], start:"02/11/2026", finish:"13/11/2026", baselineFinish:"13/11/2026", percentComplete:0, estimatedEffortHours:72, priority:"Moderate", isMilestone:false, checklistCount:4, dependencies:["t6"] },
  { id:"t8", title:"Benefits baseline", bucket:"Benefits", assignees:["Maya Harrison"], start:"16/11/2026", finish:"20/11/2026", baselineFinish:"20/11/2026", percentComplete:0, estimatedEffortHours:24, priority:"Low", isMilestone:false, checklistCount:3, dependencies:["t6"] },
];
const detailedTeam: TeamMember[] = [
  {personId:"fw",role:"Project Manager",start:"01/08/2026",finish:"31/12/2026",allocatedEffortHours:480},
  {personId:"mh",role:"Team Member",start:"01/08/2026",finish:"30/11/2026",allocatedEffortHours:240},
  {personId:"jc",role:"Team Member",start:"15/08/2026",finish:"31/12/2026",allocatedEffortHours:360},
];
const detailedChanges: ChangeRequest[] = [
  {id:"cr1",title:"Extend pilot cohort",type:"Scope",costImpact:12000,scheduleImpactDays:5,status:"Approved",requestedBy:"Eva Chen"},
  {id:"cr2",title:"Additional security testing",type:"Cost",costImpact:8500,scheduleImpactDays:0,status:"Proposed",requestedBy:"Harrison Shaw"},
];
const detailedReports: StatusReport[] = [
  {id:"sr1",reportingDate:"18/09/2026",submitter:"Freya Walsh",overall:"At Risk",schedule:"At Risk",financial:"On Track",effort:"On Track",issue:"At Risk",accomplished:"Requirements agreed and technical options assessed.",planned:"Complete design and prepare the pilot cohort.",comments:"A design decision is due this week."},
  {id:"sr2",reportingDate:"04/09/2026",submitter:"Freya Walsh",overall:"On Track",schedule:"On Track",financial:"On Track",effort:"On Track",issue:"On Track",accomplished:"Discovery workshops completed.",planned:"Validate requirements with service owners.",comments:"Strong engagement across the pilot group."},
  {id:"sr3",reportingDate:"21/08/2026",submitter:"Freya Walsh",overall:"On Track",schedule:"On Track",financial:"On Track",effort:"On Track",issue:"On Track",accomplished:"Project mobilisation complete.",planned:"Begin discovery interviews.",comments:"No exceptions to report."},
];

const taskTitles=["Confirm scope and outcomes","Complete technical design","Review data and controls","Prepare delivery plan","Run user validation","Complete readiness review","Publish handover guidance","Confirm benefits measures"];
const taskBuckets=["Discovery","Design","Governance","Delivery","Testing","Launch","Change","Benefits"];
const taskAssignees=["Chris McDonald","Freya Walsh","Maya Harrison","Jacob Cole","Eva Chen","Layla Owen","George Clarke","Nadia Begum"];
const buildTasks=(project:Project,projectNumber:number):Task[]=>taskTitles.slice(0,6+(projectNumber%3)).map((title,index)=>{const start=shiftMockDate("25/08/2026",projectNumber%12+index*9);const baselineFinish=shiftMockDate(start,index%3===0?6:12);const finish=shiftMockDate(baselineFinish,(projectNumber+index)%7===0?5:0);const complete=index===0?100:index===1?(projectNumber%2?55:80):0;return{id:`${project.id}-task-${index+1}`,title,bucket:taskBuckets[index]??"Delivery",assignees:[taskAssignees[(projectNumber+index)%taskAssignees.length]??"Chris McDonald"],start,finish,baselineFinish,percentComplete:complete,estimatedEffortHours:12+index*8+(projectNumber%4)*4,priority:index===2&&project.priority==="Critical"?"Critical":index%3===0?"High":"Moderate",isMilestone:index===5,checklistCount:3+(index%5),checklist:["Confirm owner","Complete review","Record outcome"],dependencies:index?[`${project.id}-task-${index}`]:[]}});

const activeProjects: Project[] = baseProjects.map((project,projectNumber) => ["ebbot-chatbot","reduce-our-cyber-risk","account-creation-automation"].includes(project.id)
  ? { ...project, tasks:detailedTasks.map(task=>({...task,id:`${project.id}-${task.id}`})), team:detailedTeam, changes:detailedChanges, reports:detailedReports,
      risks: project.id === "reduce-our-cyber-risk" ? [redRisk(`${project.id}-r1`), greenRisk(`${project.id}-r2`), greenRisk(`${project.id}-r3`)] : [greenRisk(`${project.id}-r1`),greenRisk(`${project.id}-r2`)],
      issues: project.id === "reduce-our-cyber-risk" ? [issue(`${project.id}-i1`,true),issue(`${project.id}-i2`)] : project.id === "ebbot-chatbot" ? [issue(`${project.id}-i1`)] : [] }
   : {...project,tasks:buildTasks(project,projectNumber),team:[
      {personId:["fw","gc","nb","er"][baseProjects.indexOf(project)%4]??"fw",role:"Project Manager",start:project.start,finish:project.finish,allocatedEffortHours:520+(baseProjects.indexOf(project)%4)*80},
      {personId:["mh","jc","lo","hs","ec"][baseProjects.indexOf(project)%5]??"mh",role:"Team Member",start:project.start,finish:project.finish,allocatedEffortHours:280+(baseProjects.indexOf(project)%3)*90},
      {personId:["ap","ob","sp","th","if"][baseProjects.indexOf(project)%5]??"ap",role:"Sponsor",start:project.start,finish:project.finish,allocatedEffortHours:55+(baseProjects.indexOf(project)%3)*15},
    ]});

// Closed historic projects retained for lessons learned and forecasting accuracy (Prompt I3).
const historicRows:Array<[string,string,string,string,ProjectTier,string,string,number,number,number,string]>=[
  ["future-students-crm","Future Students CRM","optimisation","Freya Walsh","Large","Martin Lowe","01/09/2024",640000,712000,705000,"Replace the applicant relationship platform used by recruitment and admissions."],
  ["unified-comms-phase-2","Unified Comms (Phase 2)","resilience","George Clarke","Medium","Aisha Wallace","06/01/2025",235000,251000,248000,"Complete the migration of remaining sites to the unified communications platform."],
  ["safezone","SafeZone","people","Nadia Begum","Small","Rachel King","07/04/2025",48000,44500,44500,"Roll out the SafeZone personal safety app to students and lone workers."],
];
const historicProjects:Project[]=historicRows.map(([id,name,programmeId,manager,tier,sponsor,start,budget,actual,forecast,businessCase],index)=>({
  id,programmeId,portfolioId:portfolio.id,name,manager,projectOfficer:"Sofia Marsh",sponsor,tier,
  stage:"Phase 6 - Close",state:"Closed",priority:"Moderate",
  start,finish:["28/02/2026","31/03/2026","30/06/2026"][index]??"31/03/2026",baselineFinish:["31/12/2025","31/03/2026","31/05/2026"][index]??"31/03/2026",
  budget,actual,forecast,businessCase,benefits:"Benefits handed to the service owner at closure and tracked through realisation.",
  taskSource:"Native",collectionIds:[],
  milestones:[{id:`m-${id}-close`,title:"Closure report approved",type:"Gate",owner:manager,baselineDate:["31/12/2025","31/03/2026","31/05/2026"][index]??"31/03/2026",forecastDate:["28/02/2026","31/03/2026","30/06/2026"][index]??"31/03/2026",actualDate:["28/02/2026","31/03/2026","30/06/2026"][index]??"31/03/2026",status:"Completed",reportToCommittee:true,forecastHistory:[]}],
  taskCount:0,overdueTaskCount:0,risks:[],issues:[],tasks:[],team:[],
}));
export const projects: Project[] = [...activeProjects,...historicProjects];

const ebbot=projects.find(project=>project.id==="ebbot-chatbot");
if(ebbot){
  ebbot.taskSource="Planner (Premium)";
  ebbot.risks=[{...greenRisk("ebbot-amber-risk"),title:"Knowledge quality varies",description:"Several source articles need owners and review dates before the pilot expands.",probability:3,impact:4,score:12,owner:"Maya Harrison"}];
  ebbot.issues=[];
  ebbot.overdueTaskCount=3;
}

// Milestones and risks referenced by the dependency register (Prompt I1).
const networkRefresh=projects.find(project=>project.id==="network-refresh-data-centre");
if(networkRefresh)networkRefresh.milestones.push({id:"m-network-stable",title:"Network stable",type:"Delivery",owner:"Aisha Khan",baselineDate:"16/10/2026",forecastDate:"20/11/2026",status:"Late",reportToCommittee:true,forecastHistory:[{reportingDate:"21/08/2026",forecastDate:"16/10/2026"},{reportingDate:"04/09/2026",forecastDate:"30/10/2026"},{reportingDate:"18/09/2026",forecastDate:"20/11/2026"}]});
const vdiReview=projects.find(project=>project.id==="vdi-review");
if(vdiReview)vdiReview.risks.push({id:"vdi-dep-risk",title:"Network refresh slippage blocks VDI testing",description:"The VDI pilot cannot start until the data centre network is stable; the giving milestone has slipped past the required-by date.",owner:"Freya Walsh",probability:4,impact:4,score:16,response:"Reduce",status:"Open",reviewDate:"28/09/2026"});
const smisTopdesk=projects.find(project=>project.id==="smis-topdesk-best-practice");
if(smisTopdesk)smisTopdesk.milestones.push({id:"m-catalogue-clean",title:"Service catalogue clean-up complete",type:"Delivery",owner:"Priya Ncube",baselineDate:"30/10/2026",forecastDate:"06/11/2026",status:"Late",reportToCommittee:false,forecastHistory:[{reportingDate:"04/09/2026",forecastDate:"30/10/2026"},{reportingDate:"18/09/2026",forecastDate:"06/11/2026"}]});
const landscapeMapping=projects.find(project=>project.id==="digital-landscape-mapping");
if(landscapeMapping)landscapeMapping.milestones.push({id:"m-landscape-baseline",title:"Application landscape baseline published",type:"Delivery",owner:"Maya Harrison",baselineDate:"23/10/2026",forecastDate:"23/10/2026",status:"On Track",reportToCommittee:true,forecastHistory:[{reportingDate:"04/09/2026",forecastDate:"23/10/2026"},{reportingDate:"18/09/2026",forecastDate:"23/10/2026"}]});
const storageExpansion=projects.find(project=>project.id==="storage-expansion");
if(storageExpansion)storageExpansion.milestones.push({id:"m-storage-live",title:"Expanded storage tier live",type:"Delivery",owner:"Daniel Brooks",baselineDate:"27/11/2026",forecastDate:"04/12/2026",status:"Late",reportToCommittee:false,forecastHistory:[{reportingDate:"18/09/2026",forecastDate:"04/12/2026"}]});

export const collections: Collection[] = [
  {id:"digital-committee",name:"Digital Committee",type:"Governance",projectIds:projects.slice(0,8).map(p=>p.id)},
  {id:"summer-priorities",name:"Summer Priorities 2026",type:"Priority set",projectIds:projects.slice(8,14).map(p=>p.id)},
  {id:"innovation-pot",name:"Innovation Pot",type:"Funding stream",potAmount:50000,projectIds:projects.slice(15,20).map(p=>p.id),awards:Object.fromEntries(projects.slice(15,20).map((p,i)=>[p.id,7000+i*1500]))},
];

export const issuedTasks: IssuedTask[] = [
  {id:"issued-1",projectId:"ebbot-chatbot",title:"Confirm pilot data owners",description:"Confirm a named owner and review date for each pilot knowledge source.",issuer:"Amelia Price",assignee:"Chris McDonald",issuedDate:"17/09/2026",acknowledgementDue:"19/09/2026",dueDate:"25/09/2026",estimatedEffortHours:4,priority:"High",checklist:["Review source list","Confirm owners","Update project team"],attachments:["Pilot sources.xlsx"],status:"Issued",plannerSync:"Pending acceptance"},
  {id:"issued-2",projectId:"reduce-our-cyber-risk",title:"Review control remediation evidence",description:"Review the latest evidence and identify any gaps before assurance.",issuer:"Harrison Shaw",assignee:"Chris McDonald",issuedDate:"18/09/2026",acknowledgementDue:"22/09/2026",dueDate:"29/09/2026",estimatedEffortHours:6,priority:"Critical",checklist:["Review evidence","Record gaps"],attachments:["Controls evidence.zip"],status:"Accepted",plannerSync:"Created in Planner"},
  {id:"issued-3",projectId:"digital-landscape-mapping",title:"Provide service inventory return",description:"Submit the completed inventory for your service area.",issuer:"Chris McDonald",assignee:"Maya Harrison",issuedDate:"15/09/2026",acknowledgementDue:"18/09/2026",dueDate:"30/09/2026",estimatedEffortHours:3,priority:"Moderate",checklist:["Complete template","Validate owner","Return to PMO"],attachments:["Service inventory template.xlsx"],status:"Issued",plannerSync:"Not applicable"},
  {id:"issued-4",projectId:"digital-landscape-mapping",title:"Provide service inventory return",description:"Submit the completed inventory for your service area.",issuer:"Chris McDonald",assignee:"Jacob Cole",issuedDate:"15/09/2026",acknowledgementDue:"18/09/2026",dueDate:"30/09/2026",estimatedEffortHours:3,priority:"Moderate",checklist:["Complete template","Validate owner","Return to PMO"],attachments:["Service inventory template.xlsx"],status:"Proposed new date",proposedDate:"05/10/2026",responseReason:"Technical release work takes priority this week.",plannerSync:"Not applicable"},
  {id:"issued-5",projectId:"windows-11-rollout",title:"Confirm faculty deployment contacts",description:"Validate the named contacts for the next deployment wave.",issuer:"Chris McDonald",assignee:"Eva Chen",issuedDate:"16/09/2026",acknowledgementDue:"20/09/2026",dueDate:"24/09/2026",estimatedEffortHours:2,priority:"High",checklist:["Check contact list","Confirm availability"],attachments:[],status:"Declined",responseReason:"This belongs with the faculty engagement lead.",plannerSync:"Not applicable"},
  {id:"issued-6",projectId:"account-creation-automation",title:"Validate exception scenarios",description:"Test and document the agreed exception scenarios.",issuer:"Chris McDonald",assignee:"Freya Walsh",issuedDate:"10/09/2026",acknowledgementDue:"13/09/2026",dueDate:"20/09/2026",estimatedEffortHours:8,priority:"High",checklist:["Run scenarios","Capture outcomes","Raise defects"],attachments:["Test scenarios.docx"],status:"In progress",plannerSync:"Created in Planner"},
];

export const genericResources: GenericResource[] = [
  {id:"generic-network",name:"Network Engineer (TBC)",role:"Network Engineer",team:"Infrastructure",skills:[{name:"Networks",level:3},{name:"Infrastructure",level:2}],needsStaffing:true},
  {id:"generic-ba",name:"Business Analyst (TBC)",role:"Business Analyst",team:"Applications",skills:[{name:"Business analysis",level:3},{name:"Data analysis",level:2}],needsStaffing:true},
];

const assignmentProjects=["ebbot-chatbot","network-refresh-data-centre","reduce-our-cyber-risk","windows-11-rollout","account-creation-automation","service-desk-optimisation","digital-landscape-mapping","asset-management"];
export const resourceAssignments: ResourceAssignment[] = people.flatMap((person,index)=>{
  const primary=assignmentProjects[index%assignmentProjects.length]??"ebbot-chatbot";
  const secondary=assignmentProjects[(index+3)%assignmentProjects.length]??"windows-11-rollout";
  const overloaded=["fw","mh","jc"].includes(person.id);
  return [
    {id:`ra-${person.id}-1`,resourceType:"Person" as const,resourceId:person.id,projectId:primary,role:person.jobTitle,start:"05/10/2026",end:"27/11/2026",hoursPerWeek:overloaded?20:3,bookingType:index%3===0?"Soft" as const:"Hard" as const},
    {id:`ra-${person.id}-2`,resourceType:"Person" as const,resourceId:person.id,projectId:secondary,role:person.skills[0]?.name??person.jobTitle,start:"12/10/2026",end:"20/11/2026",hoursPerWeek:overloaded?18:2,bookingType:index%4===0?"Soft" as const:"Hard" as const},
  ];
});
resourceAssignments.push(
  {id:"ra-generic-network",resourceType:"Generic",resourceId:"generic-network",projectId:"network-refresh-data-centre",role:"Network Engineer",start:"05/10/2026",end:"18/12/2026",hoursPerWeek:24,bookingType:"Soft"},
  {id:"ra-generic-ba",resourceType:"Generic",resourceId:"generic-ba",projectId:"ebbot-chatbot",role:"Business Analyst",start:"02/11/2026",end:"18/12/2026",hoursPerWeek:18,bookingType:"Soft"},
);

const draftBenefitRows:Record<string,Array<[string,BenefitClassification,BenefitCategory,string,string,string,string,number,number,string]>>={
 req1:[
  ["Increased applicant conversion from mobile journeys","Non-cash-releasing","Student experience","Priya Nair","Applications completed on mobile","31% of applications","45% of applications",96000,5,"obj-student"],
  ["Reduced enquiry handling in Student Services","Cash-releasing","Efficiency","Rachel King","Enquiry handling hours per month","410 hours","290 hours",38000,5,"obj-efficiency"],
 ],
 req2:[
  ["Research storage capacity available on demand","Non-cash-releasing","Research","Daniel Mercer","Days to provision a research volume","18 days","2 days",64000,5,"obj-research"],
  ["Avoided emergency capacity purchases","Cash-releasing","Efficiency","Martin Lowe","Unplanned storage spend per year","72000","0",45000,5,"obj-finance"],
 ],
 req3:[
  ["Faster assessment turnaround for students","Qualitative","Student experience","Priya Nair","Days from submission to feedback","21 days","12 days",52000,5,"obj-student"],
  ["Reduced print and invigilation cost","Cash-releasing","Efficiency","Martin Lowe","Annual print and invigilation spend","48000","19000",29000,5,"obj-finance"],
 ],
 req4:[
  ["Retired legacy telephony maintenance","Cash-releasing","Efficiency","Martin Lowe","Annual maintenance charge","41000","0",41000,5,"obj-finance"],
 ],
 req5:[
  ["Meeting notes produced automatically","Qualitative","Efficiency","Rachel King","Minute-taking hours per month","120 hours","40 hours",17000,3,"obj-efficiency"],
 ],
 req6:[
  ["Reduced account takeover incidents","Qualitative","Risk reduction","Aisha Wallace","Confirmed takeover incidents per year","14","3",76000,5,"obj-cyber"],
  ["Reduced identity verification effort at the service desk","Non-cash-releasing","Efficiency","Priya Ncube","Verification contacts per month","620","180",34000,5,"obj-efficiency"],
 ],
};
const requestRows:Array<[string,string,ProjectRequest["status"],string,string,number,number,ProjectRequest["priority"],number,string[]]>=[
 ["req1","Student mobile app refresh","In Review","Maya Harrison","Priya Nair",180000,420000,"High",88,["Student experience"]],
 ["req2","Research storage expansion","New","Jacob Cole","Daniel Mercer",240000,310000,"Critical",91,["Research"]],
 ["req3","Digital assessment pilot","Approved","Eva Chen","Rachel King",95000,260000,"High",84,["Teaching"]],
 ["req4","Legacy telephony retirement","On Hold","George Clarke","Martin Lowe",130000,190000,"Moderate",67,["Efficiency"]],
 ["req5","AI meeting assistant","Rejected","Layla Owen","Priya Nair",60000,85000,"Low",51,["AI"]],
 ["req6","Identity proofing service","In Review","Harrison Shaw","Aisha Wallace",210000,380000,"Critical",93,["Security"]],
];
export const projectRequests: ProjectRequest[] = requestRows.map(([id,title,status,requester,sponsor,estimatedCost,estimatedBenefit,priority,alignment,themes])=>({
 id,title,status,requester,sponsor,estimatedCost,estimatedBenefit,priority,alignment,themes,
 wholeLifeCost:Math.round(estimatedCost*1.35),
 appraisalYears:5,
 draftBenefits:(draftBenefitRows[id]??[]).map(([draftTitle,classification,category,owner,measure,baseline,target,annualValue,yearsCounted,strategicObjectiveId],index)=>({
  id:`${id}-db-${index+1}`,title:draftTitle,classification,category,owner,measure,baseline,target,annualValue,yearsCounted,strategicObjectiveId,
 })),
}));

const benefitProjectIds=["account-creation-automation","ebbot-chatbot","reduce-our-cyber-risk","improve-infrastructure-resilience-vxrail","windows-11-rollout","service-desk-optimisation","cloud-cost-management","digital-skills-academy","research-data-triage-ai"];
const benefitTitles=[
 ["Reduced staff time on account provisioning","Non-cash-releasing","Efficiency"],["Faster access for new students at enrolment","Qualitative","Student experience"],
 ["Reduced service desk contacts","Non-cash-releasing","Efficiency"],["24/7 support availability for students","Qualitative","Student experience"],["Increased escalation handling for complex queries","Qualitative","Efficiency"],
 ["Reduced likelihood of major cyber incident","Qualitative","Risk reduction"],["Compliance with cyber insurance requirements","Qualitative","Compliance"],
 ["Reduced unplanned downtime","Non-cash-releasing","Risk reduction"],["Lower infrastructure energy consumption","Societal","Sustainability"],
 ["Avoided extended support costs","Cash-releasing","Efficiency"],["Improved colleague device experience","Qualitative","Efficiency"],
 ["Faster first-contact resolution","Non-cash-releasing","Student experience"],["Reduced repeat service desk contacts","Non-cash-releasing","Efficiency"],
 ["Reduced avoidable cloud spend","Cash-releasing","Efficiency"],["Improved cloud cost ownership","Qualitative","Efficiency"],
 ["Improved digital confidence","Qualitative","Efficiency"],["Wider access to digital learning","Societal","Student experience"],
 ["Faster research data triage","Non-cash-releasing","Research"],["Increased research data quality","Qualitative","Research"],["Additional model assurance workload","Qualitative","Compliance"],["Temporary disruption during device migration","Qualitative","Student experience"],
] as const satisfies ReadonlyArray<readonly[string,BenefitClassification,BenefitCategory]>;
const projectForBenefit=(index:number)=>benefitProjectIds[[0,0,1,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,8,4][index]??0]??"ebbot-chatbot";
const objectiveForCategory:Record<BenefitCategory,string>={Efficiency:"obj-efficiency","Student experience":"obj-student",Research:"obj-research","Risk reduction":"obj-cyber",Compliance:"obj-cyber",Sustainability:"obj-netzero",Income:"obj-finance"};
const profiles=[{period:"Q1 Aug–Oct 2026",value:20},{period:"Q2 Nov 2026–Jan 2027",value:45},{period:"Q3 Feb–Apr 2027",value:70},{period:"Q4 May–Jul 2027",value:100}];
export const benefits:Benefit[]=benefitTitles.map(([title,classification,category],index)=>{
 const id=`ben-${String(index+1).padStart(3,"0")}`,projectId=projectForBenefit(index),isDisbenefit=[4,19,20].includes(index),status:BenefitStatus=index<2?"Realised":index<6?"In realisation":index<10?"Planned":index<15?"Validated":"Identified";
 const overdue=[7,13].includes(index),unit=classification==="Cash-releasing"?"currency":title.includes("contacts")?"contacts/month":title.includes("downtime")?"hours/quarter":title.includes("likelihood")?"risk score":"%";
 const baseline=title.includes("account provisioning")?72:title.includes("service desk contacts")?4200:title.includes("downtime")?18:title.includes("likelihood")?20:classification==="Cash-releasing"?0:10;
 const target=title.includes("account provisioning")?2:title.includes("service desk contacts")?3360:title.includes("downtime")?6:title.includes("likelihood")?8:classification==="Cash-releasing"?90000:100;
 const improvement=Math.abs(target-baseline),unitValue=unit==="contacts/month"?180:unit==="hours/quarter"?4000:unit==="risk score"?8000:1200;
 const records=status==="Identified"||status==="Validated"?[]:[{id:`mr-${id}-1`,period:"Q1 Aug–Oct 2026",actualValue:index%4===0?Math.round(target*.55):Math.round(target*.78),evidence:`${id.toUpperCase()} evidence.xlsx`,notes:index%4===0?"Progress is below the agreed profile.":"Evidence reviewed with the service owner.",submittedBy:"Maya Harrison",...(index%3?{validatedBy:"Elliot Reed"}:{}),status:index%3?"Validated" as const:"Submitted" as const}];
 return {id,reference:id.toUpperCase(),title,description:`Outcome expected from ${projects.find(project=>project.id===projectId)?.name??"portfolio delivery"}, with ownership retained by the receiving service.`,type:isDisbenefit?"Disbenefit":"Benefit",classification,category,beneficiaries:category==="Student experience"?["Students","Service Desk"]:category==="Research"?["Researchers","Research Services"]:["DTS colleagues","University services"],owner:index===17?"":(["Priya Ncube","Maya Harrison","Aisha Wallace","Martin Lowe","Rachel King","Sophie Green"][index%6]??"Rachel King"),sro:["Priya Nair","Daniel Mercer","Aisha Wallace","Martin Lowe"][index%4]??"Priya Nair",strategicObjectiveIds:[objectiveForCategory[category],...(classification==="Cash-releasing"?["obj-finance"]:[])],enablingProjects:index===12?[{projectId,attribution:70},{projectId:"ebbot-chatbot",attribution:40}]:[{projectId,attribution:100}],status,confidence:index%5===0?"Low":index%3===0?"Medium":"High",eligibilityConfirmed:index<16,...(index<16?{eligibilityConfirmedBy:"Elliot Reed",eligibilityConfirmedDate:"14/08/2026"}:{}),plannedTotalValue:isDisbenefit?-Math.max(12000,Math.round(improvement*unitValue*.25)):classification==="Cash-releasing"?target:Math.max(12000,Math.round(improvement*unitValue)),dependencies:index%4===0?["Operational adoption","Reliable source data"]:["Service owner capacity"],measures:[{id:`measure-${id}`,name:index===2||index===12?"Service desk contacts":title.includes("provisioning")?"Provisioning elapsed time":title,unit,measurementMethod:"Compare validated operational data against the agreed baseline and quarterly profile.",dataSource:index%2?"Service management reporting":"DTS performance warehouse",frequency:index%3===0?"Monthly":"Quarterly",dataProvider:index%2?"Service Performance Team":"Finance Business Partner",baselineValue:baseline,baselineDate:"31/07/2026",targetProfile:profiles.map((point,pointIndex)=>({...point,value:Math.round(baseline+(target-baseline)*(pointIndex+1)/4)})),nextDue:overdue?"15/09/2026":`15/${index%2?"10":"11"}/2026`,records}],reviews:status==="Realised"?[{id:`review-${id}`,date:"12/09/2026",type:"Post-implementation review",findings:"The outcome is evidenced and sustained, with further adoption monitoring recommended.",lessonsLearned:"Agree data ownership before transition into realisation.",reviewer:"Elliot Reed"}]:[{id:`review-${id}`,date:"05/09/2026",type:"Scheduled review",findings:"Delivery remains aligned to the benefit profile.",lessonsLearned:"Maintain regular engagement with operational owners.",reviewer:"Chris McDonald"}]};
});
const closedBenefitProject=projects.find(project=>project.id==="service-desk-optimisation");
if(closedBenefitProject)closedBenefitProject.state="Closed";

// ---- Benefits realisation enrichment (Prompt H2/H3) ----
const measurementDueDates=["02/09/2026","10/09/2026","15/09/2026","25/09/2026","28/09/2026","30/09/2026","15/10/2026","22/10/2026","15/11/2026","30/11/2026"];
benefits.forEach((benefit,index)=>{
  benefit.measures.forEach((measure,measureIndex)=>{
    measure.nextDue=measurementDueDates[(index*2+measureIndex)%measurementDueDates.length]??"15/10/2026";
    measure.records.forEach((record,recordIndex)=>{
      record.submittedDate=["04/08/2026","18/08/2026","01/09/2026","09/09/2026"][(index+recordIndex)%4]??"01/09/2026";
      if(record.status==="Validated")record.validatedDate=["12/08/2026","26/08/2026","08/09/2026","16/09/2026"][(index+recordIndex)%4]??"08/09/2026";
    });
  });
});
// A PMO validation queue needs submitted and queried records with evidence.
const pendingValidation:Array<[number,"Submitted"|"Queried",string,string]>=[
  [2,"Submitted","Service desk contact volumes Aug-Oct 2026.xlsx","Volumes taken from the service management platform, deflection reported separately."],
  [3,"Submitted","Out-of-hours coverage report.pdf","Chatbot availability evidenced from the platform uptime report."],
  [5,"Queried","Cyber control maturity assessment.pdf","PMO query: the maturity score does not reconcile with the assurance report."],
  [8,"Submitted","Data centre energy consumption Q1.csv","Metered consumption supplied by Estates."],
  [9,"Submitted","Extended support invoice avoidance.xlsx","Avoided vendor support costs confirmed by Finance."],
];
for(const [index,status,evidence,notes] of pendingValidation){
  const measure=benefits[index]?.measures[0];
  if(!measure)continue;
  measure.records=[...measure.records.filter(record=>record.period!=="Q2 Nov 2026–Jan 2027"),{id:`mr-pending-${index}`,period:"Q1 Aug–Oct 2026",actualValue:Math.round((measure.targetProfile[0]?.value??0)*(status==="Queried"?0.55:0.86)),evidence,notes,submittedBy:["Maya Harrison","Priya Ncube","Thomas Webb","Sofia Rahman"][index%4]??"Maya Harrison",submittedDate:["07/09/2026","11/09/2026","14/09/2026","17/09/2026"][index%4]??"14/09/2026",status,...(status==="Queried"?{queryNote:"Please reconcile against the assurance report and resubmit."}:{})}];
}
// Benefits that continue after their enabling project closes need a BAU handover.
const handoverOwners:Array<[number,string,string,string,string]>=[
  [11,"Priya Ncube","Service Desk","31/10/2026","15/01/2027"],
  [12,"Priya Ncube","Service Desk","31/10/2026","15/01/2027"],
  [0,"Rachel King","People Services","30/11/2026","28/02/2027"],
  [1,"Priya Nair","Student Services","30/11/2026","28/02/2027"],
];
for(const [index,bauOwner,bauService,nextReviewDate,postImplementationReviewDate] of handoverOwners){
  const benefit=benefits[index];
  if(benefit)benefit.handover={bauOwner,bauService,frequency:benefit.measures[0]?.frequency??"Quarterly",nextReviewDate,postImplementationReviewDate,confirmedBy:"Elliot Reed",confirmedDate:"05/09/2026"};
}
// Benefits carried by the three closed historic projects (Prompt H3 forecasting accuracy).
const historicBenefitRows:Array<[string,string,string,BenefitClassification,BenefitCategory,number,number,string,string]>=[
  ["ben-101","Increased applicant conversion","future-students-crm","Non-cash-releasing","Student experience",420000,357000,"obj-student","Priya Nair"],
  ["ben-102","Reduced admissions administration","future-students-crm","Cash-releasing","Efficiency",180000,126000,"obj-efficiency","Rachel King"],
  ["ben-103","Retired legacy telephony line rental","unified-comms-phase-2","Cash-releasing","Efficiency",96000,101000,"obj-finance","Martin Lowe"],
  ["ben-104","Improved cross-campus collaboration","unified-comms-phase-2","Qualitative","Efficiency",60000,42000,"obj-efficiency","Rachel King"],
  ["ben-105","Improved lone worker safety","safezone","Societal","Risk reduction",75000,71000,"obj-cyber","Aisha Wallace"],
  ["ben-106","Faster incident response for students","safezone","Qualitative","Student experience",40000,22000,"obj-student","Priya Nair"],
];
benefits.push(...historicBenefitRows.map(([id,title,projectId,classification,category,plannedTotalValue,realised,objectiveId,owner],index):Benefit=>{
  const percent=plannedTotalValue?realised/plannedTotalValue:0;
  return {id,reference:id.toUpperCase(),title,description:`Outcome carried into business as usual after ${projects.find(project=>project.id===projectId)?.name??"closure"} closed.`,type:"Benefit",classification,category,
    beneficiaries:category==="Student experience"?["Students","Student Services"]:["University services"],owner,sro:["Priya Nair","Martin Lowe","Aisha Wallace"][index%3]??"Priya Nair",
    strategicObjectiveIds:[objectiveId],enablingProjects:[{projectId,attribution:100}],status:percent>=0.9?"Realised":"In realisation",confidence:percent>=0.9?"High":percent>=0.6?"Medium":"Low",
    eligibilityConfirmed:true,eligibilityConfirmedBy:"Elliot Reed",eligibilityConfirmedDate:"14/03/2026",plannedTotalValue,dependencies:["Service owner capacity"],
    measures:[{id:`measure-${id}`,name:title,unit:classification==="Cash-releasing"?"currency":"%",measurementMethod:"Compare validated operational data against the closure baseline.",dataSource:"DTS performance warehouse",frequency:"Quarterly",dataProvider:"Finance Business Partner",baselineValue:0,baselineDate:"31/03/2026",
      targetProfile:profiles.map((point,pointIndex)=>({period:point.period,value:Math.round(plannedTotalValue*(pointIndex+1)/4)})),
      nextDue:["28/09/2026","15/10/2026","30/09/2026","15/11/2026","25/09/2026","22/10/2026"][index]??"15/10/2026",
      records:[{id:`mr-${id}-1`,period:"Q1 Aug–Oct 2026",actualValue:Math.round(realised),evidence:`${id.toUpperCase()} realisation evidence.xlsx`,notes:"Post-closure measurement supplied by the BAU owner.",submittedBy:owner,submittedDate:"09/09/2026",validatedBy:"Elliot Reed",validatedDate:"16/09/2026",status:"Validated"}]}],
    reviews:[{id:`review-${id}`,date:"20/07/2026",type:"Post-implementation review",findings:percent>=0.9?"The benefit is evidenced and sustained in business as usual.":"Realisation is behind the closure forecast and remains under review.",lessonsLearned:"Agree the BAU measurement owner before the project closes.",reviewer:"Elliot Reed"}],
    handover:{bauOwner:owner,bauService:category==="Student experience"?"Student Services":"DTS Service Management",frequency:"Quarterly",nextReviewDate:["31/10/2026","30/11/2026","31/10/2026","31/01/2027","30/11/2026","31/12/2026"][index]??"31/10/2026",postImplementationReviewDate:["20/07/2026","20/07/2026","12/06/2026","12/06/2026","14/09/2026","14/09/2026"][index]??"20/07/2026",confirmedBy:"Elliot Reed",confirmedDate:["02/03/2026","02/03/2026","07/04/2026","07/04/2026","06/07/2026","06/07/2026"][index]??"02/03/2026"}};
}));


for (const collection of collections) for (const projectId of collection.projectIds) {
  const project = projects.find(item=>item.id===projectId);
  if (project && !project.collectionIds.includes(collection.id)) project.collectionIds.push(collection.id);
}

const linkedRoadmapItems=(projectIds:string[])=>projectIds.map((projectId,index)=>({id:`linked-${projectId}`,rowId:projects.find(project=>project.id===projectId)?.programmeId??"standards",title:projects.find(project=>project.id===projectId)?.name??"Linked project",kind:"Linked" as const,projectId}));
export const roadmaps: Roadmap[] = [
  {id:"dts-2526-roadmap",name:"DTS 2025/26 Roadmap",owner:"Chris McDonald",description:"Strategic delivery view across the full DTS portfolio.",rows:programmes.map(programme=>({id:programme.id,name:programme.name,programmeId:programme.id})),items:[...linkedRoadmapItems(projects.map(project=>project.id)),{id:"student-digital-identity",rowId:"standards",title:"Student digital identity discovery",kind:"Standalone",start:"12/10/2026",finish:"18/12/2026",progress:10,health:"Not set",owner:"Amelia Price",priority:"Moderate",collectionIds:[]},{id:"research-cloud-service",rowId:"optimisation",title:"Research cloud service options",kind:"Standalone",start:"05/01/2027",finish:"30/04/2027",progress:0,health:"Not set",owner:"Sienna Patel",priority:"High",collectionIds:["innovation-pot"]}],keyDates:[{id:"kd-fy",title:"Portfolio mid-year review",date:"19/01/2027",status:"Future",owner:"Chris McDonald"},{id:"kd-committee",title:"Digital Committee",date:"20/10/2026",status:"On Track",owner:"Amelia Price"},{id:"kd-freeze",title:"Winter change freeze",date:"12/12/2026",status:"Future",owner:"Oliver Bennett"}]},
  {id:"summer-priorities-2026",name:"Summer Priorities 2026",owner:"Theo Hughes",description:"Focused view of high-priority work through the summer delivery window.",rows:[{id:"summer-delivery",name:"Summer delivery",collectionId:"summer-priorities"},{id:"next-wave",name:"Next wave"}],items:[...linkedRoadmapItems(collections.find(collection=>collection.id==="summer-priorities")?.projectIds??[]).map(item=>({...item,rowId:"summer-delivery"})),{id:"clearing-readiness",rowId:"summer-delivery",title:"Clearing service readiness",kind:"Standalone",start:"01/08/2026",finish:"30/09/2026",progress:70,health:"At risk",owner:"Theo Hughes",priority:"Critical",collectionIds:["summer-priorities"]},{id:"autumn-intake",rowId:"next-wave",title:"Autumn automation intake",kind:"Standalone",start:"01/10/2026",finish:"15/12/2026",progress:15,health:"On track",owner:"Nadia Begum",priority:"High",collectionIds:["summer-priorities"]}],keyDates:[{id:"kd-clearing",title:"Clearing opens",date:"13/08/2026",status:"Completed",owner:"Theo Hughes"},{id:"kd-welcome",title:"Welcome Week",date:"21/09/2026",status:"On Track",owner:"Imogen Foster"},{id:"kd-close",title:"Summer priorities close",date:"31/10/2026",status:"Future",owner:"Theo Hughes"}]},
];