import { defaultLifecyclePhases, defaultTierDefinitions } from "./lifecycle";
import type { AppSettings, CurrencyDefinition, RoleDefinition, TermKey } from "./settings-types";

export const currencies: CurrencyDefinition[] = [
  { code: "GBP", name: "Pound sterling", symbol: "£" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "USD", name: "US dollar", symbol: "$" },
  { code: "AUD", name: "Australian dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian dollar", symbol: "C$" },
  { code: "NZD", name: "New Zealand dollar", symbol: "NZ$" },
  { code: "CHF", name: "Swiss franc", symbol: "CHF" },
  { code: "SEK", name: "Swedish krona", symbol: "kr" },
  { code: "NOK", name: "Norwegian krone", symbol: "kr" },
  { code: "DKK", name: "Danish krone", symbol: "kr" },
  { code: "JPY", name: "Japanese yen", symbol: "¥" },
  { code: "INR", name: "Indian rupee", symbol: "₹" },
  { code: "ZAR", name: "South African rand", symbol: "R" },
  { code: "SGD", name: "Singapore dollar", symbol: "S$" },
  { code: "HKD", name: "Hong Kong dollar", symbol: "HK$" },
  { code: "AED", name: "UAE dirham", symbol: "د.إ" },
  { code: "PLN", name: "Polish złoty", symbol: "zł" },
  { code: "CZK", name: "Czech koruna", symbol: "Kč" },
];
export const currencyFor = (code: string) => currencies.find(item => item.code === code);

export const dateFormats = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "D MMM YYYY", "DD.MM.YYYY"];
export const locales = ["en-GB", "en-US", "en-AU", "en-NZ", "en-IE", "fr-FR", "de-DE", "es-ES", "nl-NL", "sv-SE"];
export const timeZones = ["Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Australia/Sydney", "Pacific/Auckland", "Asia/Singapore", "Asia/Kolkata"];
export const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const defaultTerms: Record<TermKey, string> = {
  portfolio: "Portfolio", programme: "Programme", programmePlural: "Programmes",
  project: "Project", projectPlural: "Projects",
  projectManager: "Project Manager", projectOfficer: "Project Officer", programmeManager: "Programme Manager", sponsor: "Sponsor",
  benefit: "Benefit", benefitPlural: "Benefits", milestone: "Milestone", milestonePlural: "Milestones",
  collection: "Collection", collectionPlural: "Collections",
  dependency: "Dependency", dependencyPlural: "Dependencies",
  risk: "Risk", issue: "Issue", decision: "Decision", assumption: "Assumption", lesson: "Lesson", task: "Task", stage: "Phase",
};

// Scotland public holidays for the 2026/27 academic year.
const scotland2627 = [
  { date: "04/01/2027", name: "New Year holiday" }, { date: "01/01/2027", name: "New Year's Day" },
  { date: "02/04/2027", name: "Good Friday" }, { date: "03/05/2027", name: "Early May bank holiday" },
  { date: "31/05/2027", name: "Spring bank holiday" }, { date: "02/08/2026", name: "Summer bank holiday (Scotland)" },
  { date: "30/11/2026", name: "St Andrew's Day" }, { date: "25/12/2026", name: "Christmas Day" },
  { date: "28/12/2026", name: "Boxing Day (substitute)" },
];

export const notificationEvents = [
  "Status report due", "Task overdue", "Task issued to me", "Gate criteria failing",
  "Decision needed by date approaching", "Decision recorded", "Measurement overdue", "Measurement awaiting validation",
  "Dependency off track", "Dependency awaiting my acceptance", "Risk escalated", "Assumption invalidated",
  "Benefit behind profile", "Lessons review outstanding",
];

const allPermissions = { viewPortfolio: true, editProjects: true, approveGates: true, manageBenefits: true, manageSettings: true, issueTasks: true, validateMeasurements: true, recordDecisions: true };
const noPermissions = { viewPortfolio: false, editProjects: false, approveGates: false, manageBenefits: false, manageSettings: false, issueTasks: false, validateMeasurements: false, recordDecisions: false };
/** The fixed role ladder enforced by RLS. Only the default home page is configurable. */
export const defaultRoles: RoleDefinition[] = [
  { role: "Admin", description: "Everything a PMO member can do, plus organisation settings and user management.", defaultHome: "/settings/organisation", permissions: allPermissions },
  { role: "PMO", description: "Portfolio assurance across every workspace: portfolios, collections, roadmaps, lists and lifecycle.", defaultHome: "/portfolio", permissions: { ...allPermissions, manageSettings: false } },
  { role: "Manager", description: "Runs programmes and projects in a workspace, including deleting records.", defaultHome: "/portfolio", permissions: { ...allPermissions, manageSettings: false } },
  { role: "Contributor", description: "Edits projects, RAID, milestones, benefits and tasks in a workspace. Cannot delete.", defaultHome: "/home/my-work", permissions: { ...noPermissions, viewPortfolio: true, editProjects: true, issueTasks: true, recordDecisions: true, manageBenefits: true } },
  { role: "Viewer", description: "Read-only access to a workspace.", defaultHome: "/insights/dashboards", permissions: { ...noPermissions, viewPortfolio: true } },
];

export const defaultSettings: AppSettings = {
  organisation: {
    name: "University Digital & Technology Services",
    shortName: "DTS",
    logoDataUrl: "",
    brandColour: "#2a4c96",
    supportContact: "dts-pmo@university.ac.uk",
  },
  regional: {
    baseCurrency: "GBP",
    symbolPosition: "before",
    decimalPlaces: 0,
    thousandsSeparator: ",",
    decimalSeparator: ".",
    compactFormatting: true,
    multiCurrency: false,
    exchangeRates: [
      { id: "fx-eur", currency: "EUR", rate: 0.85, effectiveDate: "01/08/2026" },
      { id: "fx-usd", currency: "USD", rate: 0.79, effectiveDate: "01/08/2026" },
      { id: "fx-aud", currency: "AUD", rate: 0.52, effectiveDate: "01/08/2026" },
      { id: "fx-eur-2", currency: "EUR", rate: 0.87, effectiveDate: "01/01/2027" },
    ],
    locale: "en-GB",
    dateFormat: "DD/MM/YYYY",
    timeZone: "Europe/London",
    firstDayOfWeek: 1,
    financialYearStartMonth: 8,
  },
  workingTime: {
    hoursPerWeek: 36.25,
    workingDays: [1, 2, 3, 4, 5],
    hoursPerDay: 7.25,
    holidayCalendars: [{ id: "scotland-2627", name: "Scotland 2026/27", dates: scotland2627 }],
    defaultBauPercentage: 25,
  },
  terminology: { terms: { ...defaultTerms } },
  health: {
    scheduleSlipPercent: 10,
    taskOverdueAtRiskPercent: 15,
    taskOverdueOffTrackPercent: 30,
    financialAtRiskPercent: 0,
    financialOffTrackPercent: 10,
    riskScoreAtRisk: 10,
    riskScoreOffTrack: 15,
    benefitBehindProfilePercent: 20,
    dependencyAtRiskWorkingDays: 10,
  },
  risk: {
    matrixSize: 5,
    probabilityLabels: ["Rare", "Unlikely", "Possible", "Likely", "Almost certain"],
    impactLabels: ["Negligible", "Minor", "Moderate", "Major", "Severe"],
    bands: [
      { id: "band-low", label: "Low", minScore: 1, colour: "#2e7d52" },
      { id: "band-elevated", label: "Elevated", minScore: 8, colour: "#b7791f" },
      { id: "band-critical", label: "Critical", minScore: 15, colour: "#b3261e" },
    ],
    appetiteThreshold: 12,
  },
  benefits: {
    categories: ["Efficiency", "Student experience", "Research", "Risk reduction", "Compliance", "Sustainability", "Income"],
    classifications: ["Cash-releasing", "Non-cash-releasing", "Qualitative", "Societal"],
    optimismBias: [
      { category: "Efficiency", percentage: 20 },
      { category: "Income", percentage: 30 },
      { category: "Student experience", percentage: 25 },
      { category: "Research", percentage: 25 },
      { category: "Risk reduction", percentage: 15 },
      { category: "Compliance", percentage: 10 },
      { category: "Sustainability", percentage: 15 },
    ],
    defaultMeasurementFrequency: "Quarterly",
    appraisalYears: 5,
  },
  lists: {
    lessonCategories: ["Project Management", "Governance", "Communication", "Stakeholder Management", "People & Roles", "Resource Management", "Training", "Testing", "Requirements", "Architecture", "Procurement", "Vendor Management", "Change Management & Adoption", "Ways of Working", "Support & Handover"],
    projectTypes: ["Business system", "Infrastructure", "Cyber", "Rollout", "Service improvement", "AI", "Mobile app", "Estate wide", "Supplier delivered"],
    businessUnits: ["Digital & Technology Services", "Student Services", "Research Services", "Estates & Campus Services", "Finance", "People Services", "Academic Faculties"],
    collectionTypes: ["Governance", "Priority set", "Funding stream"],
    tags: ["Student experience", "Research", "Efficiency", "Security", "Teaching", "AI", "Net zero"],
    issueSeverities: ["Low", "Medium", "High"],
    decisionForums: ["Project Board", "Programme Board", "Digital Committee", "Architecture Review Board", "Change Advisory Board"],
    dependencyTypes: ["Sequencing", "Alignment", "Information", "Resource", "External"],
    changeTypes: ["Scope", "Schedule", "Cost"],
  },
  // Filled from organisation_members when the organisation loads.
  users: [],
  roles: defaultRoles,
  notifications: {
    channels: { inApp: true, email: true, teams: false },
    digest: "Daily",
    events: Object.fromEntries(notificationEvents.map((event, index) => [event, index % 4 !== 3])),
  },
  templates: {
    projectTemplates: [
      { id: "tpl-small", name: "Small service improvement", tier: "Small", description: "Light governance, single team, closure note only.", taskBuckets: ["Discovery", "Delivery", "Handover"] },
      { id: "tpl-medium", name: "Standard business system", tier: "Medium", description: "Full business case, baselined plan and formal closure.", taskBuckets: ["Discovery", "Design", "Build", "Test", "Launch", "Benefits"] },
      { id: "tpl-large", name: "Institution-wide programme project", tier: "Large", description: "Adds assurance, rehearsed go-live and board oversight.", taskBuckets: ["Discovery", "Design", "Procure", "Build", "Test", "Deploy", "Early life", "Benefits"] },
    ],
    statusReportSections: ["Overall health", "Accomplished this period", "Planned next period", "Risks and issues", "Decisions required", "Benefits position"],
    committeePack: {
      sectionOrder: ["Cover", "Portfolio summary", "Milestones", "Exceptions", "Benefits realisation", "Decisions", "Project highlights"],
      coverText: "Portfolio performance, delivery exceptions and project highlight reports.",
      showLogo: true,
    },
  },
  data: {
    retentionMonths: 84,
    auditLog: [
      { id: "audit-1", timestamp: "21/09/2026 09:14", actor: "Chris McDonald", action: "Settings updated", detail: "Financial year start month set to August." },
      { id: "audit-2", timestamp: "18/09/2026 16:42", actor: "Elliot Reed", action: "Measurement validated", detail: "BEN-003 Q1 Aug–Oct 2026 actual accepted." },
      { id: "audit-3", timestamp: "18/09/2026 11:07", actor: "Amelia Price", action: "Decision recorded", detail: "DEC-001 approved with conditions at Project Board." },
      { id: "audit-4", timestamp: "16/09/2026 14:20", actor: "Aisha Khan", action: "Milestone rebaselined", detail: "Network stable moved from 16/10/2026 to 20/11/2026." },
      { id: "audit-5", timestamp: "14/09/2026 08:55", actor: "Virtual PMO", action: "Dependencies inferred", detail: "Seven dependencies inferred from plan analysis." },
    ],
  },
  subscription: {
    plan: "Virtual PMO — Institution",
    seatsUsed: 42,
    seatsTotal: 75,
    renewalDate: "31/07/2027",
    billingContact: "finance-systems@university.ac.uk",
  },
  lifecycle: { phases: defaultLifecyclePhases, tiers: defaultTierDefinitions },
  currentUserId: "",
};
