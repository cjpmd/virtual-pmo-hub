import type {
  BenefitCategory,
  BenefitClassification,
  LifecyclePhase,
  ProjectTier,
  TierDefinition,
} from "./types";

// ---- 1. Organisation ----
export interface OrganisationSettings {
  name: string;
  shortName: string;
  logoDataUrl: string;
  brandColour: string;
  supportContact: string;
}

// ---- 2. Regional & currency ----
export interface CurrencyDefinition {
  code: string;
  name: string;
  symbol: string;
}
export interface ExchangeRate {
  id: string;
  currency: string;
  rate: number;
  effectiveDate: string;
}
export type SymbolPosition = "before" | "after";
export interface RegionalSettings {
  baseCurrency: string;
  symbolPosition: SymbolPosition;
  decimalPlaces: number;
  thousandsSeparator: string;
  decimalSeparator: string;
  compactFormatting: boolean;
  multiCurrency: boolean;
  exchangeRates: ExchangeRate[];
  locale: string;
  dateFormat: string;
  timeZone: string;
  firstDayOfWeek: number;
  financialYearStartMonth: number;
}

// ---- 3. Working time ----
export interface HolidayCalendar {
  id: string;
  name: string;
  dates: Array<{ date: string; name: string }>;
}
export interface WorkingTimeSettings {
  hoursPerWeek: number;
  workingDays: number[];
  hoursPerDay: number;
  holidayCalendars: HolidayCalendar[];
  defaultBauPercentage: number;
}

// ---- 4. Terminology ----
export type TermKey =
  | "portfolio"
  | "programme"
  | "programmePlural"
  | "project"
  | "projectPlural"
  | "projectManager"
  | "projectOfficer"
  | "programmeManager"
  | "sponsor"
  | "benefit"
  | "benefitPlural"
  | "milestone"
  | "milestonePlural"
  | "collection"
  | "collectionPlural"
  | "dependency"
  | "dependencyPlural"
  | "risk"
  | "issue"
  | "decision"
  | "assumption"
  | "lesson"
  | "task"
  | "stage";
export interface TerminologySettings {
  terms: Record<TermKey, string>;
}

// ---- 5. Lifecycle & governance ----
export interface HealthThresholds {
  scheduleSlipPercent: number;
  taskOverdueAtRiskPercent: number;
  taskOverdueOffTrackPercent: number;
  financialAtRiskPercent: number;
  financialOffTrackPercent: number;
  riskScoreAtRisk: number;
  riskScoreOffTrack: number;
  benefitBehindProfilePercent: number;
  dependencyAtRiskWorkingDays: number;
}
export interface TierSetting {
  tier: ProjectTier;
  description: string;
  guideline: string;
}

// ---- 6. Risk & RAIDD ----
export interface ScoreBand {
  id: string;
  label: string;
  minScore: number;
  colour: string;
}
export interface RiskSettings {
  matrixSize: 3 | 4 | 5;
  probabilityLabels: string[];
  impactLabels: string[];
  bands: ScoreBand[];
  appetiteThreshold: number;
}

// ---- 7. Benefits ----
export interface BenefitSettings {
  categories: BenefitCategory[];
  classifications: BenefitClassification[];
  optimismBias: Array<{ category: BenefitCategory; percentage: number }>;
  defaultMeasurementFrequency: "Monthly" | "Quarterly" | "Annually";
  appraisalYears: number;
}

// ---- 8. Lists & categories ----
export interface ListSettings {
  lessonCategories: string[];
  projectTypes: string[];
  businessUnits: string[];
  collectionTypes: string[];
  tags: string[];
  issueSeverities: string[];
  decisionForums: string[];
  dependencyTypes: string[];
  changeTypes: string[];
}

// ---- 9. Users, roles & permissions ----
/** The role ladder RLS enforces (app_role): viewer < contributor < manager < pmo < admin. */
export type UserRole = "Admin" | "PMO" | "Manager" | "Contributor" | "Viewer";
export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  team: string;
  active: boolean;
}
export type PermissionKey =
  | "viewPortfolio"
  | "editProjects"
  | "approveGates"
  | "manageBenefits"
  | "manageSettings"
  | "issueTasks"
  | "validateMeasurements"
  | "recordDecisions";
export interface RoleDefinition {
  role: UserRole;
  description: string;
  defaultHome: string;
  permissions: Record<PermissionKey, boolean>;
}

// ---- 10. Notifications ----
export interface NotificationSettings {
  channels: { inApp: boolean; email: boolean; teams: boolean };
  digest: "Real time" | "Daily" | "Weekly";
  events: Record<string, boolean>;
}

// ---- 11. Templates ----
export interface ProjectTemplate {
  id: string;
  name: string;
  tier: ProjectTier;
  description: string;
  taskBuckets: string[];
}
export interface TemplateSettings {
  projectTemplates: ProjectTemplate[];
  statusReportSections: string[];
  committeePack: { sectionOrder: string[]; coverText: string; showLogo: boolean };
}

// ---- 13. Data & audit ----
export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}
export interface DataSettings {
  retentionMonths: number;
  auditLog: AuditEntry[];
}

// ---- 14. Subscription ----
export interface SubscriptionSettings {
  plan: string;
  seatsUsed: number;
  seatsTotal: number;
  renewalDate: string;
  billingContact: string;
}

export interface AppSettings {
  organisation: OrganisationSettings;
  regional: RegionalSettings;
  workingTime: WorkingTimeSettings;
  terminology: TerminologySettings;
  health: HealthThresholds;
  risk: RiskSettings;
  benefits: BenefitSettings;
  lists: ListSettings;
  users: UserAccount[];
  roles: RoleDefinition[];
  notifications: NotificationSettings;
  templates: TemplateSettings;
  data: DataSettings;
  subscription: SubscriptionSettings;
  lifecycle: { phases: LifecyclePhase[]; tiers: TierDefinition[] };
  currentUserId: string;
}
