/**
 * Benefits pathway demo data (docs/benefits-pathway.md §6). Dates are day offsets from the seed
 * anchor (the Monday of the week the seed runs), i.e. d(n) in the generated SQL.
 *
 * Used by scripts/generate-seed.ts (rows) and scripts/seed-demo-files.ts (evidence files).
 */

export type CapabilityStatus = "planned" | "in_progress" | "delivered" | "accepted";
export type OutcomeStatus = "planned" | "emerging" | "achieved" | "not_achieved";

export interface CapabilityPathway {
  status: CapabilityStatus;
  target: number;
  forecast: number;
  delivered?: number;
  accepted?: number;
  acceptedBy?: string;
  acceptanceNote?: string;
  /** Earlier forecasts: [reporting day, forecast day]. */
  history?: Array<[number, number]>;
}

/** Dates and status for the capabilities already in src/data/benefits-map-data.ts. */
export const capabilityPathway: Record<string, CapabilityPathway> = {
  "cap-auto-identity": {
    status: "accepted",
    target: -60,
    forecast: -66,
    delivered: -66,
    accepted: -58,
    acceptedBy: "Rachel King",
    acceptanceNote:
      "Staff joiner, mover and leaver feeds live; student feed accepted for enrolment.",
  },
  "cap-auto-assistant": {
    status: "accepted",
    target: -80,
    forecast: -80,
    delivered: -84,
    accepted: -78,
    acceptedBy: "Priya Nair",
    acceptanceNote: "Pilot accepted by the Student Services lead after four weeks' live running.",
  },
  "cap-auto-knowledge": {
    status: "in_progress",
    target: 40,
    forecast: 48,
    history: [[-30, 40]],
  },
  "cap-auto-copilot": {
    status: "in_progress",
    target: 20,
    forecast: 95,
    history: [
      [-60, 20],
      [-30, 60],
    ],
  },
  "cap-auto-workflow": { status: "in_progress", target: 150, forecast: 150 },
  "cap-auto-triage": { status: "planned", target: 130, forecast: 130 },
  "cap-res-controls": {
    status: "in_progress",
    target: 160,
    forecast: 320,
    history: [
      [-90, 160],
      [-30, 250],
    ],
  },
  "cap-res-platform": { status: "in_progress", target: 60, forecast: 66 },
  "cap-res-network": {
    status: "in_progress",
    target: -10,
    forecast: 75,
    history: [
      [-90, -10],
      [-40, 30],
    ],
  },
  "cap-res-recovery": {
    status: "accepted",
    target: -35,
    forecast: -30,
    delivered: -33,
    accepted: -30,
    acceptedBy: "Aisha Wallace",
    acceptanceNote: "Recovery rehearsal met the agreed recovery time; report signed off.",
  },
  "cap-res-continuity": { status: "delivered", target: -14, forecast: -9, delivered: -9 },
};

export interface NewCapability extends CapabilityPathway {
  id: string;
  programmeId: string;
  title: string;
  description: string;
  owner: string;
  projectIds: string[];
}

export const newCapabilities: NewCapability[] = [
  {
    id: "cap-opt-devices",
    programmeId: "optimisation",
    title: "Windows 11 managed device estate",
    description: "University devices on a supported, centrally managed Windows 11 build.",
    owner: "Daniel Brooks",
    projectIds: ["windows-11-rollout"],
    status: "in_progress",
    target: 100,
    forecast: 112,
    history: [[-60, 100]],
  },
  {
    id: "cap-opt-cloudcost",
    programmeId: "optimisation",
    title: "Cloud cost visibility and tagging",
    description: "Every cloud subscription tagged to an owning budget, with monthly cost reports.",
    owner: "Maya Harrison",
    projectIds: ["cloud-cost-management"],
    status: "in_progress",
    target: 45,
    forecast: 45,
  },
  {
    id: "cap-people-learning",
    programmeId: "people",
    title: "Digital skills learning platform",
    description: "A self-service learning platform with the core digital skills curriculum.",
    owner: "Nadia Begum",
    projectIds: ["digital-skills-academy"],
    status: "delivered",
    target: 10,
    forecast: -5,
    delivered: -5,
  },
  {
    id: "cap-opt-triage",
    programmeId: "optimisation",
    title: "Optimised service desk triage",
    description: "Revised categories, routing rules and first-line scripts in TOPdesk.",
    owner: "Sofia Rahman",
    projectIds: ["service-desk-optimisation"],
    status: "accepted",
    target: -75,
    forecast: -70,
    delivered: -72,
    accepted: -70,
    acceptedBy: "Priya Ncube",
    acceptanceNote: "Service desk manager accepted the new triage model after a two-week trial.",
  },
];

export interface IndicatorSeed {
  key: string;
  name: string;
  unit: string;
  baseline: number;
  baselineDate: number;
  target: number;
  targetDate: number;
  frequency: "monthly" | "quarterly";
  nextDue?: number;
  dataSource: string;
  measurements: Array<{
    key: string;
    measuredOn: number;
    value: number;
    status: "submitted" | "validated" | "queried";
    submittedBy: string;
    validatedBy?: string;
    queryNote?: string;
    evidence?: string;
  }>;
}

export interface OutcomePathway {
  status: OutcomeStatus;
  target: number;
  achieved?: number;
  indicators: IndicatorSeed[];
}

const PMO = "Rachel King";

/** Status, target and indicators for the outcomes already in benefits-map-data.ts. */
export const outcomePathway: Record<string, OutcomePathway> = {
  "out-auto-starters": {
    status: "emerging",
    target: 150,
    indicators: [
      {
        key: "auto-provisioned",
        name: "Staff accounts created automatically",
        unit: "%",
        baseline: 12,
        baselineDate: -120,
        target: 95,
        targetDate: 150,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "Identity management audit log",
        measurements: [
          {
            key: "aug",
            measuredOn: -56,
            value: 48,
            status: "validated",
            submittedBy: "Sofia Rahman",
            validatedBy: PMO,
          },
          {
            key: "sep",
            measuredOn: -26,
            value: 61,
            status: "validated",
            submittedBy: "Sofia Rahman",
            validatedBy: PMO,
          },
        ],
      },
    ],
  },
  "out-auto-enrolment": {
    status: "emerging",
    target: -14,
    indicators: [
      {
        key: "day-one",
        name: "Enrolling students with active accounts on day one",
        unit: "%",
        baseline: 71,
        baselineDate: -380,
        target: 98,
        targetDate: -14,
        frequency: "quarterly",
        dataSource: "Enrolment and account activation reports",
        measurements: [
          {
            key: "sep",
            measuredOn: -14,
            value: 93,
            status: "validated",
            submittedBy: "Sofia Rahman",
            validatedBy: PMO,
          },
        ],
      },
    ],
  },
  "out-auto-selfserve": {
    status: "emerging",
    target: 180,
    indicators: [
      {
        key: "assistant-resolved",
        name: "Queries fully resolved by the assistant",
        unit: "%",
        baseline: 0,
        baselineDate: -90,
        target: 35,
        targetDate: 180,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "Ebbot conversation analytics",
        measurements: [
          {
            key: "sep",
            measuredOn: -26,
            value: 14,
            status: "validated",
            submittedBy: "Eva Chen",
            validatedBy: PMO,
          },
        ],
      },
      {
        key: "contacts-per-1000",
        name: "Service desk contacts per 1,000 users a month",
        unit: "contacts",
        baseline: 182,
        baselineDate: -90,
        target: 140,
        targetDate: 180,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "TOPdesk contact volumes",
        measurements: [
          { key: "sep", measuredOn: -26, value: 176, status: "submitted", submittedBy: "Eva Chen" },
        ],
      },
    ],
  },
  "out-auto-outofhours": {
    status: "emerging",
    target: 90,
    indicators: [
      {
        key: "ooh-answered",
        name: "Out-of-hours queries answered within 5 minutes",
        unit: "%",
        baseline: 0,
        baselineDate: -90,
        target: 80,
        targetDate: 90,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "Ebbot conversation analytics",
        measurements: [
          {
            key: "sep",
            measuredOn: -26,
            value: 22,
            status: "queried",
            submittedBy: "Eva Chen",
            queryNote: "Includes staffed-hours conversations; resubmit with out-of-hours only.",
          },
        ],
      },
    ],
  },
  "out-auto-timeback": {
    status: "planned",
    target: 270,
    indicators: [
      {
        key: "rekeying-hours",
        name: "Hours of manual rekeying removed a month",
        unit: "hours",
        baseline: 0,
        baselineDate: -30,
        target: 600,
        targetDate: 270,
        frequency: "quarterly",
        nextDue: 90,
        dataSource: "Automation run logs and team time surveys",
        measurements: [],
      },
    ],
  },
  "out-auto-research": {
    status: "planned",
    target: 300,
    indicators: [
      {
        key: "datasets-triaged",
        name: "Datasets triaged automatically",
        unit: "%",
        baseline: 0,
        baselineDate: -30,
        target: 70,
        targetDate: 300,
        frequency: "quarterly",
        nextDue: 150,
        dataSource: "Research data service intake log",
        measurements: [],
      },
    ],
  },
  "out-res-exposure": {
    status: "emerging",
    target: 160,
    indicators: [
      {
        key: "cis-ig1",
        name: "CIS IG1 safeguards evidenced",
        unit: "%",
        baseline: 38,
        baselineDate: -200,
        target: 90,
        targetDate: 160,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "Security controls register",
        measurements: [
          {
            key: "sep",
            measuredOn: -26,
            value: 51,
            status: "validated",
            submittedBy: "Harrison Shaw",
            validatedBy: PMO,
          },
        ],
      },
      {
        key: "critical-vulns",
        name: "Critical vulnerabilities open more than 14 days",
        unit: "count",
        baseline: 46,
        baselineDate: -200,
        target: 5,
        targetDate: 160,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "Vulnerability scanner",
        measurements: [
          {
            key: "sep",
            measuredOn: -26,
            value: 31,
            status: "validated",
            submittedBy: "Harrison Shaw",
            validatedBy: PMO,
          },
        ],
      },
    ],
  },
  "out-res-uptime": {
    status: "planned",
    target: 240,
    indicators: [
      {
        key: "availability",
        name: "Critical-service availability",
        unit: "%",
        baseline: 99.2,
        baselineDate: -30,
        target: 99.9,
        targetDate: 240,
        frequency: "quarterly",
        nextDue: 60,
        dataSource: "Service monitoring",
        measurements: [],
      },
    ],
  },
  "out-res-energy": {
    status: "planned",
    target: 240,
    indicators: [
      {
        key: "power-draw",
        name: "Data centre IT power draw",
        unit: "kW",
        baseline: 182,
        baselineDate: -30,
        target: 140,
        targetDate: 240,
        frequency: "quarterly",
        nextDue: 90,
        dataSource: "Data centre power monitoring",
        measurements: [],
      },
    ],
  },
  "out-res-recover": {
    status: "achieved",
    target: 60,
    achieved: -21,
    indicators: [
      {
        key: "recovery-time",
        name: "Identity service recovery time in rehearsal",
        unit: "hours",
        baseline: 72,
        baselineDate: -150,
        target: 8,
        targetDate: 60,
        frequency: "quarterly",
        nextDue: 70,
        dataSource: "Recovery rehearsal report",
        measurements: [
          {
            key: "sep",
            measuredOn: -21,
            value: 7.5,
            status: "validated",
            submittedBy: "Aisha Khan",
            validatedBy: PMO,
          },
        ],
      },
    ],
  },
};

export interface NewOutcome extends OutcomePathway {
  id: string;
  programmeId: string;
  title: string;
  description: string;
  owner: string;
  capabilityIds: string[];
  benefitIds: string[];
}

export const newOutcomes: NewOutcome[] = [
  {
    id: "out-opt-devices",
    programmeId: "optimisation",
    title: "Colleagues work on supported, secure devices",
    description: "No university device runs an out-of-support operating system.",
    owner: "Daniel Brooks",
    capabilityIds: ["cap-opt-devices"],
    benefitIds: ["ben-010", "ben-011", "ben-021"],
    status: "emerging",
    target: 120,
    indicators: [
      {
        key: "supported-windows",
        name: "Devices on a supported Windows version",
        unit: "%",
        baseline: 41,
        baselineDate: -200,
        target: 100,
        targetDate: 120,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "Intune device compliance report",
        measurements: [
          {
            key: "sep",
            measuredOn: -26,
            value: 68,
            status: "validated",
            submittedBy: "Daniel Brooks",
            validatedBy: PMO,
          },
        ],
      },
    ],
  },
  {
    id: "out-opt-cloudcost",
    programmeId: "optimisation",
    title: "Cloud spend is owned and actively managed",
    description: "Budget holders see and act on their own cloud costs each month.",
    owner: "Maya Harrison",
    capabilityIds: ["cap-opt-cloudcost"],
    benefitIds: ["ben-014", "ben-015"],
    status: "planned",
    target: 100,
    indicators: [
      {
        key: "spend-tagged",
        name: "Cloud spend tagged to an owning budget",
        unit: "%",
        baseline: 35,
        baselineDate: -30,
        target: 95,
        targetDate: 100,
        frequency: "monthly",
        nextDue: 30,
        dataSource: "Cloud billing export",
        measurements: [],
      },
    ],
  },
  {
    id: "out-people-confidence",
    programmeId: "people",
    title: "Colleagues are confident using core digital tools",
    description: "Staff report confidence with the core collaboration and productivity tools.",
    owner: "Nadia Begum",
    capabilityIds: ["cap-people-learning"],
    benefitIds: ["ben-016", "ben-017"],
    status: "planned",
    target: 280,
    indicators: [
      {
        key: "pulse-confidence",
        name: "Staff confident with core tools (pulse survey)",
        unit: "%",
        baseline: 54,
        baselineDate: -60,
        target: 75,
        targetDate: 280,
        frequency: "quarterly",
        nextDue: 60,
        dataSource: "Staff pulse survey",
        measurements: [],
      },
    ],
  },
  {
    id: "out-opt-firstcontact",
    programmeId: "optimisation",
    title: "Service desk resolves more contacts first time",
    description: "More contacts are resolved at first line without escalation.",
    owner: "Priya Ncube",
    capabilityIds: ["cap-opt-triage", "cap-auto-knowledge"],
    benefitIds: ["ben-012", "ben-013"],
    status: "emerging",
    target: 120,
    indicators: [
      {
        key: "fcr",
        name: "First-contact resolution",
        unit: "%",
        baseline: 61,
        baselineDate: -150,
        target: 75,
        targetDate: 120,
        frequency: "monthly",
        nextDue: 5,
        dataSource: "TOPdesk resolution report",
        measurements: [
          {
            key: "sep",
            measuredOn: -26,
            value: 63,
            status: "validated",
            submittedBy: "Priya Ncube",
            validatedBy: PMO,
          },
        ],
      },
    ],
  },
];

/**
 * Benefit realisation start (day offsets). Benefits with a realisation status not listed here
 * start at the first profiled quarter (QUARTER_ONE_START). Benefits not listed and not in a
 * realisation status stay null (readiness phase).
 */
export const QUARTER_ONE_START = -51;
export const realisationStart: Record<string, number> = {
  "ben-007": 170,
  "ben-008": 70,
  "ben-009": 70,
  "ben-010": 120,
  "ben-011": 120,
  "ben-021": 120,
  "ben-014": 100,
  "ben-015": 100,
  "ben-016": 140,
  "ben-017": 140,
  "ben-018": 300,
  "ben-019": 300,
  "ben-020": 300,
  // Service Desk Optimisation closed; its benefits are being realised.
  "ben-012": -30,
  "ben-013": -30,
};

/** Benefits whose targets are re-phased to start at realisation, and whose earlier measurements are dropped. */
export const rephasedBenefits = ["ben-007", "ben-008", "ben-009", "ben-010"];

/** Acceptance evidence uploaded by scripts/seed-demo-files.ts (placeholder PDFs). */
export const capabilityEvidence: Array<{ capabilityId: string; fileName: string; title: string }> =
  [
    {
      capabilityId: "cap-auto-identity",
      fileName: "ACA acceptance certificate.pdf",
      title: "Acceptance certificate: automated identity provisioning",
    },
    {
      capabilityId: "cap-auto-assistant",
      fileName: "Ebbot pilot acceptance.pdf",
      title: "Pilot acceptance: conversational service assistant",
    },
    {
      capabilityId: "cap-res-recovery",
      fileName: "Identity recovery rehearsal report.pdf",
      title: "Rehearsal report: identity recovery service",
    },
    {
      capabilityId: "cap-opt-triage",
      fileName: "Service desk triage sign-off.pdf",
      title: "Sign-off: optimised service desk triage",
    },
    {
      capabilityId: "cap-res-continuity",
      fileName: "BC exercise summary - awaiting sign-off.pdf",
      title: "Business continuity exercise summary (awaiting sign-off)",
    },
  ];
