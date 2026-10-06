import type { LifecyclePhase, ProjectTier, TierDefinition } from "@/data/types";

const all: ProjectTier[] = ["Small", "Medium", "Large"];
const mediumLarge: ProjectTier[] = ["Medium", "Large"];
const largeOnly: ProjectTier[] = ["Large"];

export const defaultLifecyclePhases: LifecyclePhase[] = [
  {
    id: "phase-1",
    name: "Phase 1 - Pre-Project / Idea",
    shortName: "Phase 1",
    gateName: "GATE 1 - Idea approved to explore",
    description:
      "Capture the idea, confirm the problem statement and agree whether it is worth exploring.",
    criteria: [
      {
        id: "p1-c1",
        label: "Idea captured with problem statement and sponsor identified",
        tiers: all,
        document: "Project request",
      },
      {
        id: "p1-c2",
        label: "Initial tier assessment completed",
        tiers: all,
        document: "Tiering assessment",
      },
      {
        id: "p1-c3",
        label: "Strategic alignment confirmed against portfolio objectives",
        tiers: mediumLarge,
      },
      { id: "p1-c4", label: "Portfolio board noted the idea", tiers: largeOnly },
      {
        id: "p1-lessons",
        label: "Phase lessons review completed",
        tiers: all,
        document: "Phase lessons review",
        check: "phase-lessons-review",
      },
    ],
  },
  {
    id: "phase-2",
    name: "Phase 2 - Feasibility & Development",
    shortName: "Phase 2",
    gateName: "GATE 2 - Ready to design",
    description: "Test feasibility, develop the case for change and secure funding.",
    criteria: [
      {
        id: "p2-c1",
        label: "Options appraisal completed",
        tiers: mediumLarge,
        document: "Options appraisal",
      },
      {
        id: "p2-c2",
        label: "Full business case approved",
        tiers: mediumLarge,
        document: "Business case",
      },
      {
        id: "p2-c3",
        label: "Lightweight proposal approved by service owner (small projects only)",
        tiers: ["Small"],
        document: "One-page proposal",
      },
      { id: "p2-c4", label: "Funding source confirmed", tiers: all },
      {
        id: "p2-c5",
        label: "Benefit profiles drafted with a named owner for each benefit",
        tiers: mediumLarge,
        document: "Benefits profile",
        check: "benefit-profiles-owned",
      },
      { id: "p2-c6", label: "Independent assurance review completed", tiers: largeOnly },
      {
        id: "p2-c7",
        label: "Lessons from similar projects reviewed by the project manager",
        tiers: all,
        document: "Lessons review",
        check: "lessons-reviewed",
      },
      {
        id: "p2-lessons",
        label: "Phase lessons review completed",
        tiers: all,
        document: "Phase lessons review",
        check: "phase-lessons-review",
      },
    ],
  },
  {
    id: "phase-3",
    name: "Phase 3 - Design & Procure",
    shortName: "Phase 3",
    gateName: "GATE 3 - Ready to build",
    description: "Agree the solution design, complete assurance and put contracts in place.",
    criteria: [
      {
        id: "p3-c1",
        label: "Solution design signed off by architecture",
        tiers: all,
        document: "Solution design",
      },
      {
        id: "p3-c2",
        label: "Security and data protection assessments complete",
        tiers: all,
        document: "DPIA / security assessment",
      },
      {
        id: "p3-c3",
        label: "Procurement route agreed and supplier contracted",
        tiers: mediumLarge,
        document: "Contract",
      },
      {
        id: "p3-c4",
        label: "Delivery plan baselined with milestones and resources",
        tiers: mediumLarge,
        document: "Delivery plan",
      },
      { id: "p3-c5", label: "Accessibility requirements agreed", tiers: all },
      {
        id: "p3-c6",
        label: "Benefit baselines and target profiles agreed with measure owners",
        tiers: mediumLarge,
        document: "Benefit measure baselines",
        check: "benefit-baselines",
      },
      {
        id: "p3-lessons",
        label: "Phase lessons review completed",
        tiers: all,
        document: "Phase lessons review",
        check: "phase-lessons-review",
      },
    ],
  },
  {
    id: "phase-4",
    name: "Phase 4 - Build & Test",
    shortName: "Phase 4",
    gateName: "GATE 4 - Ready to deploy",
    description:
      "Build and configure the solution, then test it against agreed acceptance criteria.",
    criteria: [
      { id: "p4-c1", label: "Build complete against agreed design", tiers: all },
      {
        id: "p4-c2",
        label: "Test results accepted, no outstanding critical defects",
        tiers: all,
        document: "Test report",
      },
      {
        id: "p4-c3",
        label: "User acceptance testing signed off by the business",
        tiers: mediumLarge,
        document: "UAT sign-off",
      },
      {
        id: "p4-c4",
        label: "Operational readiness and support model agreed",
        tiers: mediumLarge,
        document: "Service acceptance",
      },
      { id: "p4-c5", label: "Go-live and rollback plans rehearsed", tiers: largeOnly },
      {
        id: "p4-lessons",
        label: "Phase lessons review completed",
        tiers: all,
        document: "Phase lessons review",
        check: "phase-lessons-review",
      },
    ],
  },
  {
    id: "phase-5",
    name: "Phase 5 - Deploy & Handover",
    shortName: "Phase 5",
    gateName: "GATE 5 - Live and handed over",
    description: "Deploy into live service, train users and hand over to the service owner.",
    criteria: [
      { id: "p5-c1", label: "Deployment completed and verified in live service", tiers: all },
      { id: "p5-c2", label: "Training and communications delivered", tiers: all },
      {
        id: "p5-c3",
        label: "Documentation handed to the service desk",
        tiers: all,
        document: "Support handover",
      },
      {
        id: "p5-c4",
        label: "Early life support period agreed with the service owner",
        tiers: mediumLarge,
      },
      { id: "p5-c5", label: "Benefits measurement baseline captured", tiers: mediumLarge },
      {
        id: "p5-lessons",
        label: "Phase lessons review completed",
        tiers: all,
        document: "Phase lessons review",
        check: "phase-lessons-review",
      },
    ],
  },
  {
    id: "phase-6",
    name: "Phase 6 - Close",
    shortName: "Phase 6",
    gateName: "GATE 6 - Closure approved",
    description: "Confirm outcomes, capture lessons and close the project formally.",
    criteria: [
      {
        id: "p6-c1",
        label: "Lightweight closure note approved by sponsor (small projects only)",
        tiers: ["Small"],
        document: "Closure note",
      },
      {
        id: "p6-c2",
        label: "Full closure report approved",
        tiers: mediumLarge,
        document: "Closure report",
      },
      {
        id: "p6-c3",
        label: "Lessons learned captured and shared",
        tiers: all,
        document: "Lessons learned log",
      },
      { id: "p6-c4", label: "Final financial position reconciled", tiers: all },
      {
        id: "p6-c5",
        label: "Post-implementation review scheduled with benefit owners",
        tiers: mediumLarge,
      },
      {
        id: "p6-c6",
        label: "Benefits handover completed for every benefit still in realisation",
        tiers: all,
        document: "Benefits handover",
        check: "benefits-handover",
      },
      {
        id: "p6-lessons",
        label: "Phase lessons review completed",
        tiers: all,
        document: "Phase lessons review",
        check: "phase-lessons-review",
      },
    ],
  },
];

export const defaultTierDefinitions: TierDefinition[] = [
  {
    tier: "Small",
    description:
      "Low complexity, single team, minimal change to live services. Light governance: no Phase 2 business case and a short closure note.",
    guideline: "Under £50k, under 3 months, one team affected",
  },
  {
    tier: "Medium",
    description:
      "Moderate complexity across more than one team, with supplier or data change. Full business case, baselined plan and formal closure report.",
    guideline: "£50k–£250k, 3–12 months, several teams affected",
  },
  {
    tier: "Large",
    description:
      "High complexity, institution-wide impact or significant spend. Adds independent assurance, rehearsed go-live and portfolio board oversight.",
    guideline: "Over £250k, over 12 months, university-wide impact",
  },
];

export const defaultStage = defaultLifecyclePhases[0]?.name ?? "Phase 1 - Pre-Project / Idea";
