import type { Collection, Person, Portfolio, Programme, Project, Risk, Issue, Task, TeamMember, ChangeRequest, StatusReport, Milestone, MilestoneStatus, MilestoneType, Roadmap, IssuedTask, GenericResource, ResourceAssignment, ProjectRequest, ResourceTeam } from "./types";

export const portfolio: Portfolio = { id: "dts-2526", name: "DTS 2025/26", description: "The university’s strategic portfolio of digital, technology and service improvement work.", owner: "Chris McDonald", budget: 8_750_000 };

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
  { id:"standards", portfolioId:portfolio.id, name:"1. Standards, Governance & Best Practice", description:"Strengthening governance, assurance and consistent delivery standards across DTS.", manager:"Amelia Price", sponsor:"Daniel Mercer", start:"01/08/2025", end:"31/07/2027", budget:1450000, valueStatement:"Create trusted, repeatable ways of working that improve delivery confidence and decision quality." },
  { id:"resilience", portfolioId:portfolio.id, name:"2. Resilience & Business Continuity", description:"Improving cyber security, infrastructure resilience and continuity of critical services.", manager:"Oliver Bennett", sponsor:"Aisha Wallace", start:"01/09/2025", end:"31/12/2027", budget:2380000, valueStatement:"Protect teaching, research and operations from disruption while reducing institutional risk." },
  { id:"optimisation", portfolioId:portfolio.id, name:"3. Optimisation & Cost Management", description:"Modernising core services and improving the value delivered by technology investments.", manager:"Sienna Patel", sponsor:"Martin Lowe", start:"01/10/2025", end:"31/07/2027", budget:1720000, valueStatement:"Release capacity and reduce avoidable cost through a simpler, better-managed technology estate." },
  { id:"automation", portfolioId:portfolio.id, name:"4. Efficiency, Automation & AI", description:"Using automation and responsible AI to create better staff and student experiences.", manager:"Theo Hughes", sponsor:"Priya Nair", start:"01/08/2025", end:"31/12/2027", budget:1910000, valueStatement:"Give colleagues time back and improve service quality through practical, responsible automation." },
  { id:"people", portfolioId:portfolio.id, name:"5. People, Knowledge & Continuous Improvement", description:"Building digital capability, knowledge and a culture of continuous improvement.", manager:"Imogen Foster", sponsor:"Rachel King", start:"01/01/2026", end:"31/07/2027", budget:1290000, valueStatement:"Equip teams with the skills, insight and confidence to sustain digital improvement." },
];

const managers = ["Freya Walsh","George Clarke","Nadia Begum","Elliot Reed","Amelia Price"];
const namesByProgramme: Record<string,string[]> = {
  standards:["Project Management Standards", "Digital Landscape Mapping", "Architecture Review Board", "Cyber and Information Governance", "Benefits Management Framework"],
  resilience:["Improve Infrastructure Resilience (VXRail)", "Reduce Our Cyber Risk", "Network Refresh: Data Centre", "Business Continuity Testing", "Identity Recovery Service"],
  optimisation:["Windows 11 Rollout", "VDI Review", "Asset Management", "Service Desk Optimisation", "Cloud Cost Management"],
  automation:["Account creation automation", "Copilot / Microsoft integration", "Ebbot (chatbot)", "Workflow Automation Hub", "Research Data Triage AI"],
  people:["Document Management", "Digital Skills Academy", "Knowledge Base Renewal", "DTS Operating Model", "Continuous Improvement Network"],
};

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
  ["12/09/2026","18/09/2026",undefined],
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
const buildMilestones=(projectNumber:number,isRed:boolean):Milestone[]=>{
  const count=3+(projectNumber%6);
  return milestoneTitles.slice(0,count).map(([title,type],index)=>{
    const source=milestoneDates[index]??milestoneDates[0];
    const baselineDate=index===0?shiftMockDate("28/08/2026",projectNumber%18):source?.[0]??"30/09/2026";
    let forecastDate:string=source?.[1]??baselineDate;
    const actualDate=index===0?shiftMockDate(baselineDate,projectNumber%4===0?2:projectNumber%3===0?-1:0):source?.[2];
    if(isRed&&index===1)forecastDate="28/09/2026";
    const forecastMs=parseMockDate(forecastDate),baselineMs=parseMockDate(baselineDate),todayMs=parseMockDate("21/09/2026");
    const status:MilestoneStatus=actualDate?"Completed":forecastMs<todayMs?"Overdue":forecastMs>baselineMs?"Late":forecastMs-todayMs>30*86400000?"Future":"On Track";
    const historyDates=["24/07/2026","07/08/2026","21/08/2026","04/09/2026","18/09/2026"];
    const slipDays=Math.round((forecastMs-baselineMs)/86400000);
    return {id:`m-${projectNumber}-${index}`,title,type,owner:managers[(projectNumber+index)%managers.length]??"Freya Walsh",baselineDate,forecastDate,...(actualDate?{actualDate}:{}),status,reportToCommittee:type==="Gate"||isRed,forecastHistory:historyDates.map((reportingDate,point)=>({reportingDate,forecastDate:shiftMockDate(baselineDate,Math.max(0,Math.round(slipDays*(point/4))))}))};
  });
};
const parseMockDate=(value:string)=>{const [d=1,m=1,y=1970]=value.split("/").map(Number);return new Date(y,m-1,d).getTime()};
const shiftMockDate=(value:string,days:number)=>{const date=new Date(parseMockDate(value)+days*86400000);return `${String(date.getDate()).padStart(2,"0")}/${String(date.getMonth()+1).padStart(2,"0")}/${date.getFullYear()}`};

const baseProjects: Project[] = Object.entries(namesByProgramme).flatMap(([programmeId,names], programmeIndex) => names.map((name,index) => {
  const number = programmeIndex*5+index;
  const isRed = name === "Reduce Our Cyber Risk" || name === "Network Refresh: Data Centre";
  const isAmber = name === "Ebbot (chatbot)" || [2,8,12,18,23].includes(number);
  const state = number % 9 === 0 ? "Proposed" : number % 11 === 0 ? "On Hold" : "Active";
  const stage = (["Discover","Define","Plan","Deliver","Deliver","Close"] as const)[number%6];
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""), programmeId, portfolioId:portfolio.id, name,
    manager:managers[number%managers.length] ?? "Freya Walsh", sponsor:["Daniel Mercer","Aisha Wallace","Martin Lowe","Priya Nair","Rachel King"][programmeIndex] ?? "Daniel Mercer",
    stage:name === "Ebbot (chatbot)" ? "Plan" : (stage ?? "Discover"), state, priority:isRed?"Critical":isAmber?"High":number%3===0?"Moderate":"Low",
    start:`${String((number%20)+1).padStart(2,"0")}/0${(number%7)+1}/2026`, finish:`${String((number%20)+1).padStart(2,"0")}/0${(number%3)+1}/2027`, baselineFinish:`${String((number%20)+1).padStart(2,"0")}/0${(number%3)+1}/2027`,
    budget:120000+(number%5)*85000, actual:70000+(number%5)*55000, forecast:125000+(number%5)*90000,
    businessCase:`Improve university services through ${name.toLowerCase()}.`, benefits:"Reduced operational effort, improved resilience and a better colleague experience.",
    taskSource:number%3===0?"Planner (Premium)":number%3===1?"Planner (Basic)":"Native", collectionIds:[],
    milestones:buildMilestones(number,isRed), taskCount:10+(number%9), overdueTaskCount:isRed?4:isAmber?3:Math.min(1,number%2),
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

export const projects: Project[] = baseProjects.map((project,projectNumber) => ["ebbot-chatbot","reduce-our-cyber-risk","account-creation-automation"].includes(project.id)
  ? { ...project, tasks:detailedTasks.map(task=>({...task,id:`${project.id}-${task.id}`})), team:detailedTeam, changes:detailedChanges, reports:detailedReports,
      risks: project.id === "reduce-our-cyber-risk" ? [redRisk(`${project.id}-r1`), greenRisk(`${project.id}-r2`), greenRisk(`${project.id}-r3`)] : [greenRisk(`${project.id}-r1`),greenRisk(`${project.id}-r2`)],
      issues: project.id === "reduce-our-cyber-risk" ? [issue(`${project.id}-i1`,true),issue(`${project.id}-i2`)] : project.id === "ebbot-chatbot" ? [issue(`${project.id}-i1`)] : [] }
   : {...project,tasks:buildTasks(project,projectNumber),team:[
      {personId:["fw","gc","nb","er"][baseProjects.indexOf(project)%4]??"fw",role:"Project Manager",start:project.start,finish:project.finish,allocatedEffortHours:520+(baseProjects.indexOf(project)%4)*80},
      {personId:["mh","jc","lo","hs","ec"][baseProjects.indexOf(project)%5]??"mh",role:"Team Member",start:project.start,finish:project.finish,allocatedEffortHours:280+(baseProjects.indexOf(project)%3)*90},
      {personId:["ap","ob","sp","th","if"][baseProjects.indexOf(project)%5]??"ap",role:"Sponsor",start:project.start,finish:project.finish,allocatedEffortHours:55+(baseProjects.indexOf(project)%3)*15},
    ]});

const ebbot=projects.find(project=>project.id==="ebbot-chatbot");
if(ebbot){
  ebbot.taskSource="Planner (Premium)";
  ebbot.risks=[{...greenRisk("ebbot-amber-risk"),title:"Knowledge quality varies",description:"Several source articles need owners and review dates before the pilot expands.",probability:3,impact:4,score:12,owner:"Maya Harrison"}];
  ebbot.issues=[];
  ebbot.overdueTaskCount=3;
}

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

export const projectRequests: ProjectRequest[] = [
  {id:"req1",title:"Student mobile app refresh",status:"In Review",requester:"Maya Harrison",sponsor:"Priya Nair",estimatedCost:180000,estimatedBenefit:420000,priority:"High",alignment:88,themes:["Student experience"]},
  {id:"req2",title:"Research storage expansion",status:"New",requester:"Jacob Cole",sponsor:"Daniel Mercer",estimatedCost:240000,estimatedBenefit:310000,priority:"Critical",alignment:91,themes:["Research"]},
  {id:"req3",title:"Digital assessment pilot",status:"Approved",requester:"Eva Chen",sponsor:"Rachel King",estimatedCost:95000,estimatedBenefit:260000,priority:"High",alignment:84,themes:["Teaching"]},
  {id:"req4",title:"Legacy telephony retirement",status:"On Hold",requester:"George Clarke",sponsor:"Martin Lowe",estimatedCost:130000,estimatedBenefit:190000,priority:"Moderate",alignment:67,themes:["Efficiency"]},
  {id:"req5",title:"AI meeting assistant",status:"Rejected",requester:"Layla Owen",sponsor:"Priya Nair",estimatedCost:60000,estimatedBenefit:85000,priority:"Low",alignment:51,themes:["AI"]},
  {id:"req6",title:"Identity proofing service",status:"In Review",requester:"Harrison Shaw",sponsor:"Aisha Wallace",estimatedCost:210000,estimatedBenefit:380000,priority:"Critical",alignment:93,themes:["Security"]},
];

for (const collection of collections) for (const projectId of collection.projectIds) {
  const project = projects.find(item=>item.id===projectId);
  if (project && !project.collectionIds.includes(collection.id)) project.collectionIds.push(collection.id);
}

const linkedRoadmapItems=(projectIds:string[])=>projectIds.map((projectId,index)=>({id:`linked-${projectId}`,rowId:projects.find(project=>project.id===projectId)?.programmeId??"standards",title:projects.find(project=>project.id===projectId)?.name??"Linked project",kind:"Linked" as const,projectId}));
export const roadmaps: Roadmap[] = [
  {id:"dts-2526-roadmap",name:"DTS 2025/26 Roadmap",owner:"Chris McDonald",description:"Strategic delivery view across the full DTS portfolio.",rows:programmes.map(programme=>({id:programme.id,name:programme.name,programmeId:programme.id})),items:[...linkedRoadmapItems(projects.map(project=>project.id)),{id:"student-digital-identity",rowId:"standards",title:"Student digital identity discovery",kind:"Standalone",start:"12/10/2026",finish:"18/12/2026",progress:10,health:"Not set",owner:"Amelia Price",priority:"Moderate",collectionIds:[]},{id:"research-cloud-service",rowId:"optimisation",title:"Research cloud service options",kind:"Standalone",start:"05/01/2027",finish:"30/04/2027",progress:0,health:"Not set",owner:"Sienna Patel",priority:"High",collectionIds:["innovation-pot"]}],keyDates:[{id:"kd-fy",title:"Portfolio mid-year review",date:"19/01/2027",status:"Future",owner:"Chris McDonald"},{id:"kd-committee",title:"Digital Committee",date:"20/10/2026",status:"On Track",owner:"Amelia Price"},{id:"kd-freeze",title:"Winter change freeze",date:"12/12/2026",status:"Future",owner:"Oliver Bennett"}]},
  {id:"summer-priorities-2026",name:"Summer Priorities 2026",owner:"Theo Hughes",description:"Focused view of high-priority work through the summer delivery window.",rows:[{id:"summer-delivery",name:"Summer delivery",collectionId:"summer-priorities"},{id:"next-wave",name:"Next wave"}],items:[...linkedRoadmapItems(collections.find(collection=>collection.id==="summer-priorities")?.projectIds??[]).map(item=>({...item,rowId:"summer-delivery"})),{id:"clearing-readiness",rowId:"summer-delivery",title:"Clearing service readiness",kind:"Standalone",start:"01/08/2026",finish:"30/09/2026",progress:70,health:"At risk",owner:"Theo Hughes",priority:"Critical",collectionIds:["summer-priorities"]},{id:"autumn-intake",rowId:"next-wave",title:"Autumn automation intake",kind:"Standalone",start:"01/10/2026",finish:"15/12/2026",progress:15,health:"On track",owner:"Nadia Begum",priority:"High",collectionIds:["summer-priorities"]}],keyDates:[{id:"kd-clearing",title:"Clearing opens",date:"13/08/2026",status:"Completed",owner:"Theo Hughes"},{id:"kd-welcome",title:"Welcome Week",date:"21/09/2026",status:"On Track",owner:"Imogen Foster"},{id:"kd-close",title:"Summer priorities close",date:"31/10/2026",status:"Future",owner:"Theo Hughes"}]},
];