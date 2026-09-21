import type { Collection, Person, Portfolio, Programme, Project, Risk, Issue, Task, TeamMember, ChangeRequest, StatusReport, Milestone, MilestoneStatus, MilestoneType } from "./types";

export const portfolio: Portfolio = { id: "dts-2526", name: "DTS 2025/26", description: "The university’s strategic portfolio of digital, technology and service improvement work.", owner: "Chris McDonald", budget: 8_750_000 };

const personRows: Array<[string, string, string, string]> = [
  ["cm","Chris McDonald","Head of Programmes & Projects","CM"], ["ap","Amelia Price","Programme Manager","AP"], ["ob","Oliver Bennett","Programme Manager","OB"],
  ["sp","Sienna Patel","Programme Manager","SP"], ["th","Theo Hughes","Programme Manager","TH"], ["if","Imogen Foster","Programme Manager","IF"],
  ["fw","Freya Walsh","Senior Project Manager","FW"], ["gc","George Clarke","Project Manager","GC"], ["nb","Nadia Begum","Project Manager","NB"],
  ["er","Elliot Reed","Project Manager","ER"], ["mh","Maya Harrison","Business Analyst","MH"], ["jc","Jacob Cole","Technical Lead","JC"],
  ["lo","Layla Owen","Change Manager","LO"], ["hs","Harrison Shaw","Security Lead","HS"], ["ec","Eva Chen","Service Designer","EC"],
];
export const people: Person[] = personRows.map(([id,name,jobTitle,initials]) => ({ id, name, jobTitle, initials }));

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
    const baselineDate=source?.[0]??"30/09/2026";
    let forecastDate:string=source?.[1]??baselineDate;
    const actualDate=source?.[2];
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
  { id:"t1", title:"Confirm service requirements", bucket:"Discovery", assignees:["Maya Harrison"], start:"01/09/2026", finish:"09/09/2026", percentComplete:100, priority:"High", isMilestone:false, checklistCount:5, dependencies:[] },
  { id:"t2", title:"Complete solution design", bucket:"Design", assignees:["Jacob Cole"], start:"10/09/2026", finish:"23/09/2026", percentComplete:65, priority:"High", isMilestone:false, checklistCount:7, dependencies:["t1"] },
  { id:"t3", title:"Design approval", bucket:"Design", assignees:["Amelia Price"], start:"24/09/2026", finish:"24/09/2026", percentComplete:0, priority:"Critical", isMilestone:true, checklistCount:2, dependencies:["t2"] },
  { id:"t4", title:"Pilot with service desk", bucket:"Pilot", assignees:["Eva Chen","Layla Owen"], start:"28/09/2026", finish:"16/10/2026", percentComplete:0, priority:"Moderate", isMilestone:false, checklistCount:8, dependencies:["t3"] },
  { id:"t5", title:"Prepare adoption materials", bucket:"Change", assignees:["Layla Owen"], start:"05/10/2026", finish:"23/10/2026", percentComplete:0, priority:"Moderate", isMilestone:false, checklistCount:6, dependencies:["t2"] },
  { id:"t6", title:"Go-live readiness review", bucket:"Launch", assignees:["Freya Walsh"], start:"26/10/2026", finish:"26/10/2026", percentComplete:0, priority:"High", isMilestone:true, checklistCount:10, dependencies:["t4","t5"] },
  { id:"t7", title:"Early-life support", bucket:"Launch", assignees:["George Clarke"], start:"02/11/2026", finish:"13/11/2026", percentComplete:0, priority:"Moderate", isMilestone:false, checklistCount:4, dependencies:["t6"] },
  { id:"t8", title:"Benefits baseline", bucket:"Benefits", assignees:["Maya Harrison"], start:"16/11/2026", finish:"20/11/2026", percentComplete:0, priority:"Low", isMilestone:false, checklistCount:3, dependencies:["t6"] },
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

export const projects: Project[] = baseProjects.map(project => ["ebbot-chatbot","reduce-our-cyber-risk","account-creation-automation"].includes(project.id)
  ? { ...project, tasks:detailedTasks.map(task=>({...task,id:`${project.id}-${task.id}`})), team:detailedTeam, changes:detailedChanges, reports:detailedReports,
      risks: project.id === "reduce-our-cyber-risk" ? [redRisk(`${project.id}-r1`), greenRisk(`${project.id}-r2`), greenRisk(`${project.id}-r3`)] : [greenRisk(`${project.id}-r1`),greenRisk(`${project.id}-r2`)],
      issues: project.id === "reduce-our-cyber-risk" ? [issue(`${project.id}-i1`,true),issue(`${project.id}-i2`)] : project.id === "ebbot-chatbot" ? [issue(`${project.id}-i1`)] : [] }
  : {...project,team:[
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

for (const collection of collections) for (const projectId of collection.projectIds) {
  const project = projects.find(item=>item.id===projectId);
  if (project && !project.collectionIds.includes(collection.id)) project.collectionIds.push(collection.id);
}