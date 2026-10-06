import type { BenefitMapSeed, Capability, Outcome } from "./types";

// Capabilities are the things a project delivers (outputs); outcomes are the business changes they enable.
export const capabilities: Capability[] = [
  // 4. Efficiency, Automation & AI
  {
    id: "cap-auto-identity",
    programmeId: "automation",
    title: "Automated identity provisioning",
    description:
      "Joiner, mover and leaver accounts created from the HR and student records feeds without a manual ticket.",
    owner: "Sofia Rahman",
    projectIds: ["account-creation-automation"],
  },
  {
    id: "cap-auto-assistant",
    programmeId: "automation",
    title: "Conversational service assistant",
    description: "A supported chatbot channel answering common student and colleague queries.",
    owner: "Eva Chen",
    projectIds: ["ebbot-chatbot"],
  },
  {
    id: "cap-auto-knowledge",
    programmeId: "automation",
    title: "Curated service knowledge base",
    description:
      "Owned, reviewed knowledge articles that the assistant and service desk both draw on.",
    owner: "Priya Ncube",
    projectIds: ["ebbot-chatbot"],
  },
  {
    id: "cap-auto-copilot",
    programmeId: "automation",
    title: "Copilot-enabled productivity toolset",
    description:
      "Licensed and governed Microsoft Copilot capability with agreed acceptable-use guidance.",
    owner: "Maya Harrison",
    projectIds: ["copilot-microsoft-integration"],
  },
  {
    id: "cap-auto-workflow",
    programmeId: "automation",
    title: "Reusable workflow automation patterns",
    description:
      "A pattern library and shared connectors that teams reuse instead of building one-off flows.",
    owner: "Nadia Begum",
    projectIds: ["workflow-automation-hub", "testing-automation-workflow-streamlining"],
  },
  {
    id: "cap-auto-triage",
    programmeId: "automation",
    title: "Automated research data triage models",
    description: "Assured models that classify and route incoming research datasets.",
    owner: "Daniel Brooks",
    projectIds: ["research-data-triage-ai"],
  },
  // 2. Resilience & Business Continuity
  {
    id: "cap-res-controls",
    programmeId: "resilience",
    title: "CIS safeguards implemented across the estate",
    description: "Prioritised CIS controls deployed, evidenced and monitored.",
    owner: "Harrison Shaw",
    projectIds: ["reduce-our-cyber-risk", "cis-safeguards-cyber-security-improvements"],
  },
  {
    id: "cap-res-platform",
    programmeId: "resilience",
    title: "Resilient virtualisation platform",
    description:
      "A supported hyper-converged platform with automated failover for critical workloads.",
    owner: "Jacob Cole",
    projectIds: ["improve-infrastructure-resilience-vxrail"],
  },
  {
    id: "cap-res-network",
    programmeId: "resilience",
    title: "Refreshed data centre network",
    description: "Replaced core switching with resilient paths between data centres.",
    owner: "Aisha Khan",
    projectIds: ["network-refresh-data-centre"],
  },
  {
    id: "cap-res-recovery",
    programmeId: "resilience",
    title: "Tested identity recovery service",
    description:
      "A rehearsed route to restore identity services independently of the production estate.",
    owner: "Sofia Rahman",
    projectIds: ["identity-recovery-service"],
  },
  {
    id: "cap-res-continuity",
    programmeId: "resilience",
    title: "Rehearsed business continuity plans",
    description: "Service continuity plans exercised with the owning services at least annually.",
    owner: "Oliver Bennett",
    projectIds: ["business-continuity-testing"],
  },
];

export const outcomes: Outcome[] = [
  // 4. Efficiency, Automation & AI
  {
    id: "out-auto-starters",
    programmeId: "automation",
    title: "New starters provisioned without manual tickets",
    description:
      "Managers no longer raise account requests; provisioning happens from the authoritative feed.",
    owner: "Rachel King",
    capabilityIds: ["cap-auto-identity"],
    benefitIds: ["ben-001"],
  },
  {
    id: "out-auto-enrolment",
    programmeId: "automation",
    title: "Students have working accounts on day one",
    description: "Enrolment completes with access to email, Wi-Fi and the VLE already in place.",
    owner: "Priya Nair",
    capabilityIds: ["cap-auto-identity"],
    benefitIds: ["ben-002"],
  },
  {
    id: "out-auto-selfserve",
    programmeId: "automation",
    title: "Routine queries are resolved without contacting the service desk",
    description:
      "Students and colleagues self-serve the most common requests through the assistant.",
    owner: "Priya Ncube",
    capabilityIds: ["cap-auto-assistant", "cap-auto-knowledge"],
    benefitIds: ["ben-003", "ben-005"],
  },
  {
    id: "out-auto-outofhours",
    programmeId: "automation",
    title: "Students get help outside staffed hours",
    description: "Support is available overnight and at weekends without extending shift cover.",
    owner: "Priya Nair",
    capabilityIds: ["cap-auto-assistant"],
    benefitIds: ["ben-004"],
  },
  {
    id: "out-auto-timeback",
    programmeId: "automation",
    title: "Colleagues spend less time on repetitive admin",
    description: "Teams adopt the shared automation patterns in place of manual rekeying.",
    owner: "Rachel King",
    capabilityIds: ["cap-auto-copilot", "cap-auto-workflow"],
    benefitIds: [],
  },
  {
    id: "out-auto-research",
    programmeId: "automation",
    title: "Research data is triaged and quality-checked automatically",
    description:
      "Incoming datasets are classified, routed and checked before researchers receive them.",
    owner: "Daniel Mercer",
    capabilityIds: ["cap-auto-triage"],
    benefitIds: ["ben-018", "ben-019", "ben-020"],
  },
  // 2. Resilience & Business Continuity
  {
    id: "out-res-exposure",
    programmeId: "resilience",
    title: "Attack surface reduced and controls evidenced",
    description:
      "Control coverage is demonstrable to insurers, auditors and the Digital Committee.",
    owner: "Aisha Wallace",
    capabilityIds: ["cap-res-controls"],
    benefitIds: ["ben-006", "ben-007"],
  },
  {
    id: "out-res-uptime",
    programmeId: "resilience",
    title: "Critical services stay available during component failure",
    description: "Single component failures no longer interrupt teaching, research or operations.",
    owner: "Oliver Bennett",
    capabilityIds: ["cap-res-platform", "cap-res-network"],
    benefitIds: ["ben-008"],
  },
  {
    id: "out-res-energy",
    programmeId: "resilience",
    title: "The estate runs on fewer, more efficient hosts",
    description: "Consolidation reduces the power and cooling draw of the data centre.",
    owner: "Sophie Green",
    capabilityIds: ["cap-res-platform"],
    benefitIds: ["ben-009"],
  },
  {
    id: "out-res-recover",
    programmeId: "resilience",
    title: "The university can recover identity services within agreed times",
    description: "A tested recovery route exists for the services everything else depends on.",
    owner: "Aisha Wallace",
    capabilityIds: ["cap-res-recovery", "cap-res-continuity"],
    benefitIds: [],
  },
];

export const benefitMaps: BenefitMapSeed[] = [
  {
    id: "map-automation",
    name: "Efficiency, Automation & AI",
    programmeId: "automation",
    description:
      "How automation and AI delivery turns into capability, business change and measurable benefit.",
    layout: [],
  },
  {
    id: "map-resilience",
    name: "Resilience & Business Continuity",
    programmeId: "resilience",
    description:
      "How resilience investment reduces exposure and protects continuity of critical services.",
    layout: [],
  },
];
