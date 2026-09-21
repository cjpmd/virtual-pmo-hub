export type Health = "On Track" | "At Risk" | "Off Track" | "Not Set";
export type ProjectStage = string;
export type ProjectTier = "Small" | "Medium" | "Large";
export interface GateCriterion { id: string; label: string; tiers: ProjectTier[]; document?: string }
export interface LifecyclePhase { id: string; name: string; shortName: string; description: string; gateName: string; criteria: GateCriterion[] }
export interface TierDefinition { tier: ProjectTier; description: string; guideline: string }
export type ProjectState = "Proposed" | "Active" | "On Hold" | "Closed";
export type Priority = "Low" | "Moderate" | "High" | "Critical";
export type TaskSource = "Native" | "Planner (Basic)" | "Planner (Premium)";
export type HealthDimension = "overall" | "schedule" | "financial" | "effort" | "issue";

export interface HealthOverride { health: Health; reason: string }
export type ResourceTeam = "Infrastructure" | "Applications" | "Cyber Security" | "Service Desk" | "PMO";
export interface ResourceSkill { name: string; level: 1|2|3 }
export interface LeaveEntry { id: string; start: string; end: string; type: "Annual leave"|"Training"|"Other" }
export interface Person { id: string; name: string; jobTitle: string; initials: string; team: ResourceTeam; lineManager: string; contractedHoursPerWeek: number; fte: number; bauPercentage: number; skills: ResourceSkill[]; leave: LeaveEntry[] }
export interface GenericResource { id: string; name: string; role: string; team: ResourceTeam; skills: ResourceSkill[]; needsStaffing: boolean }
export type BookingType = "Soft" | "Hard";
export interface ResourceAssignment { id: string; resourceType: "Person"|"Generic"; resourceId: string; projectId: string; taskId?: string; role: string; start: string; end: string; hoursPerWeek: number; bookingType: BookingType }
export interface ProjectRequest { id: string; title: string; status: "New"|"In Review"|"On Hold"|"Approved"|"Rejected"; requester: string; sponsor: string; estimatedCost: number; estimatedBenefit: number; priority: Priority; alignment: number; themes: string[] }
export type MilestoneType = "Delivery" | "Gate" | "Key date" | "External dependency";
export type MilestoneStatus = "Overdue" | "Late" | "On Track" | "Future" | "Completed";
export interface MilestoneForecastPoint { reportingDate: string; forecastDate: string }
export interface Milestone { id: string; title: string; type: MilestoneType; owner: string; baselineDate: string; forecastDate: string; actualDate?: string; status: MilestoneStatus; reportToCommittee: boolean; forecastHistory: MilestoneForecastPoint[] }
export interface Risk { id: string; title: string; description: string; owner: string; probability: 1|2|3|4|5; impact: 1|2|3|4|5; score: number; response: "Avoid"|"Reduce"|"Transfer"|"Accept"; status: "Open"|"Closed"; reviewDate: string }
export interface Issue { id: string; title: string; owner: string; severity: "Low"|"Medium"|"High"; status: "Open"|"Closed"; dueDate: string }
export interface Task { id: string; title: string; bucket: string; assignees: string[]; start: string; finish: string; baselineFinish?: string; percentComplete: number; estimatedEffortHours?: number; priority: Priority; isMilestone: boolean; checklistCount: number; checklist?: string[]; dependencies: string[] }
export type IssuedTaskStatus = "Issued" | "Accepted" | "Declined" | "Proposed new date" | "In progress" | "Done";
export type PlannerSyncState = "Not applicable" | "Pending acceptance" | "Syncing" | "Created in Planner";
export interface IssuedTask { id: string; projectId: string; title: string; description: string; issuer: string; assignee: string; issuedDate: string; acknowledgementDue: string; dueDate: string; estimatedEffortHours: number; priority: Priority; checklist: string[]; attachments: string[]; status: IssuedTaskStatus; responseReason?: string; proposedDate?: string; reminderSent?: string; plannerSync: PlannerSyncState }
export interface TeamMember { personId: string; role: "Project Manager"|"Project Officer"|"Programme Manager"|"Team Member"|"Sponsor"; start: string; finish: string; allocatedEffortHours: number }
export interface ChangeRequest { id: string; title: string; type: "Scope"|"Schedule"|"Cost"; costImpact: number; scheduleImpactDays: number; status: "Proposed"|"Approved"|"Rejected"; requestedBy: string }
export interface StatusReport { id: string; reportingDate: string; submitter: string; overall: Health; schedule: Health; financial: Health; effort: Health; issue: Health; accomplished: string; planned: string; comments: string; overrideReasons?: Partial<Record<HealthDimension,string>> }
export interface Portfolio { id: string; name: string; description: string; owner: string; budget: number; healthOverride?: HealthOverride }
export interface Programme { id: string; portfolioId: string; name: string; description: string; manager: string; sponsor: string; start: string; end: string; budget: number; valueStatement: string; healthOverride?: HealthOverride }
export interface Project {
  id: string; programmeId: string; portfolioId: string; name: string; manager: string; sponsor: string;
  stage: ProjectStage; state: ProjectState; priority: Priority; start: string; finish: string; baselineFinish: string;
  budget: number; actual: number; forecast: number; businessCase: string; benefits: string; taskSource: TaskSource;
  collectionIds: string[]; milestones: Milestone[]; taskCount: number; overdueTaskCount: number; risks: Risk[]; issues: Issue[];
  tasks?: Task[]; team?: TeamMember[]; changes?: ChangeRequest[]; reports?: StatusReport[]; healthOverride?: HealthOverride;
}
export interface Collection { id: string; name: string; type: "Governance"|"Priority set"|"Funding stream"; projectIds: string[]; potAmount?: number; awards?: Record<string, number> }
export type RoadmapHealth = "High risk" | "At risk" | "On track" | "Not set" | "Done";
export type RoadmapGroupBy = "Programme" | "Collection" | "Priority" | "Project manager";
export interface RoadmapRow { id: string; name: string; programmeId?: string; collectionId?: string }
export interface RoadmapItem { id: string; rowId: string; title: string; kind: "Linked" | "Standalone"; projectId?: string; start?: string; finish?: string; progress?: number; health?: RoadmapHealth; owner?: string; priority?: Priority; collectionIds?: string[] }
export interface RoadmapKeyDate { id: string; title: string; date: string; status: MilestoneStatus; owner: string }
export interface Roadmap { id: string; name: string; owner: string; description: string; rows: RoadmapRow[]; items: RoadmapItem[]; keyDates: RoadmapKeyDate[] }
export interface StrategicObjective { id:string; portfolioId:string; title:string; description:string; owner:string }
export type BenefitType="Benefit"|"Disbenefit";
export type BenefitClassification="Cash-releasing"|"Non-cash-releasing"|"Qualitative"|"Societal";
export type BenefitCategory="Efficiency"|"Student experience"|"Research"|"Risk reduction"|"Compliance"|"Sustainability"|"Income";
export type BenefitStatus="Identified"|"Validated"|"Planned"|"In realisation"|"Realised"|"Partially realised"|"Not realised"|"Closed";
export type BenefitConfidence="High"|"Medium"|"Low";
export interface BenefitProjectLink { projectId:string; attribution:number }
export interface BenefitTarget { period:string; value:number }
export interface MeasurementRecord { id:string; period:string; actualValue:number; evidence:string; notes:string; submittedBy:string; validatedBy?:string; status:"Submitted"|"Validated"|"Queried" }
export interface BenefitMeasure { id:string; name:string; unit:string; measurementMethod:string; dataSource:string; frequency:"Monthly"|"Quarterly"|"Annually"; dataProvider:string; baselineValue:number; baselineDate:string; targetProfile:BenefitTarget[]; nextDue:string; records:MeasurementRecord[] }
export interface BenefitReview { id:string; date:string; type:"Scheduled review"|"Post-implementation review"; findings:string; lessonsLearned:string; reviewer:string }
export interface Benefit { id:string; reference:string; title:string; description:string; type:BenefitType; classification:BenefitClassification; category:BenefitCategory; beneficiaries:string[]; owner:string; sro:string; strategicObjectiveIds:string[]; enablingProjects:BenefitProjectLink[]; status:BenefitStatus; confidence:BenefitConfidence; eligibilityConfirmed:boolean; eligibilityConfirmedBy?:string; eligibilityConfirmedDate?:string; plannedTotalValue:number; dependencies:string[]; measures:BenefitMeasure[]; reviews:BenefitReview[] }