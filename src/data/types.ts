export type Health = "On Track" | "At Risk" | "Off Track" | "Not Set";
export type ProjectStage = "Discover" | "Define" | "Plan" | "Deliver" | "Close";
export type ProjectState = "Proposed" | "Active" | "On Hold" | "Closed";
export type Priority = "Low" | "Moderate" | "High" | "Critical";
export type TaskSource = "Native" | "Planner (Basic)" | "Planner (Premium)";
export type HealthDimension = "overall" | "schedule" | "financial" | "effort" | "issue";

export interface HealthOverride { health: Health; reason: string }
export interface Person { id: string; name: string; jobTitle: string; initials: string }
export type MilestoneType = "Delivery" | "Gate" | "Key date" | "External dependency";
export type MilestoneStatus = "Overdue" | "Late" | "On Track" | "Future" | "Completed";
export interface MilestoneForecastPoint { reportingDate: string; forecastDate: string }
export interface Milestone { id: string; title: string; type: MilestoneType; owner: string; baselineDate: string; forecastDate: string; actualDate?: string; status: MilestoneStatus; reportToCommittee: boolean; forecastHistory: MilestoneForecastPoint[] }
export interface Risk { id: string; title: string; description: string; owner: string; probability: 1|2|3|4|5; impact: 1|2|3|4|5; score: number; response: "Avoid"|"Reduce"|"Transfer"|"Accept"; status: "Open"|"Closed"; reviewDate: string }
export interface Issue { id: string; title: string; owner: string; severity: "Low"|"Medium"|"High"; status: "Open"|"Closed"; dueDate: string }
export interface Task { id: string; title: string; bucket: string; assignees: string[]; start: string; finish: string; percentComplete: number; priority: Priority; isMilestone: boolean; checklistCount: number; dependencies: string[] }
export interface TeamMember { personId: string; role: "Project Manager"|"Team Member"|"Sponsor"; start: string; finish: string; allocatedEffortHours: number }
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