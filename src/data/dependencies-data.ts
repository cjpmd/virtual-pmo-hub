import type { Dependency, DependencyEnd, DependencyType } from "./types";

const programmeEnd = (programmeId: string, owner: string): DependencyEnd => ({ kind: "Programme", programmeId, owner });
const projectEnd = (programmeId: string, projectId: string, owner: string, milestoneId?: string): DependencyEnd => ({ kind: milestoneId ? "Milestone" : "Project", programmeId, projectId, owner, ...(milestoneId ? { milestoneId } : {}) });
const externalEnd = (externalName: string, owner: string): DependencyEnd => ({ kind: "External", externalName, owner });

interface Seed { giver: DependencyEnd; receiver: DependencyEnd; type: DependencyType; description: string; requiredBy: string; criticality: Dependency["criticality"]; validation: Dependency["validation"]; giverAccepted: boolean; receiverAccepted: boolean; riskIds?: string[]; issueIds?: string[]; raisedDate: string; raisedBy: string }

// PM1 (Freya Walsh) manages workstreams 2 and 3; PM2 (George Clarke) manages 1, 4 and 5.
const seeds: Seed[] = [
  // --- Workstream level: WS1 → WS4 → WS5 and WS2 → WS3 ---
  { giver: programmeEnd("standards", "George Clarke"), receiver: programmeEnd("automation", "George Clarke"), type: "Sequencing", description: "Delivery standards, architecture principles and the benefits framework must be published before the automation workstream adopts them as its way of working.", requiredBy: "30/11/2026", criticality: "High", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "12/08/2026", raisedBy: "Chris McDonald" },
  { giver: programmeEnd("automation", "George Clarke"), receiver: programmeEnd("people", "George Clarke"), type: "Sequencing", description: "Automation tooling must be in place before the capability and training workstream can build the skills programme around it.", requiredBy: "29/01/2027", criticality: "Medium", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "12/08/2026", raisedBy: "Chris McDonald" },
  { giver: programmeEnd("resilience", "Freya Walsh"), receiver: programmeEnd("optimisation", "Freya Walsh"), type: "Sequencing", description: "Infrastructure and network resilience work must complete before the optimisation workstream migrates services onto the refreshed estate.", requiredBy: "18/12/2026", criticality: "High", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "12/08/2026", raisedBy: "Chris McDonald" },

  // --- Confirmed, cross-PM ---
  { giver: projectEnd("standards", "digital-landscape-mapping", "Maya Harrison", "m-landscape-baseline"), receiver: projectEnd("optimisation", "asset-management", "Freya Walsh"), type: "Sequencing", description: "Landscape mapping outputs must land before assets can be baselined.", requiredBy: "06/11/2026", criticality: "High", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "18/08/2026", raisedBy: "Maya Harrison" },
  { giver: projectEnd("standards", "cyber-and-information-governance", "George Clarke"), receiver: projectEnd("resilience", "cis-safeguards-cyber-security-improvements", "Harrison Shaw"), type: "Alignment", description: "Policies must align with the controls being implemented.", requiredBy: "11/12/2026", criticality: "Medium", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "20/08/2026", raisedBy: "Harrison Shaw" },
  { giver: projectEnd("optimisation", "sits-admissions-management", "Freya Walsh"), receiver: projectEnd("automation", "testing-automation-workflow-streamlining", "Nadia Begum"), type: "Sequencing", description: "Underlying systems must be stabilised before automation.", requiredBy: "22/01/2027", criticality: "High", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "26/08/2026", raisedBy: "Nadia Begum" },

  // --- Inferred, within PM1's workstreams ---
  { giver: projectEnd("resilience", "cis-safeguards-cyber-security-improvements", "Harrison Shaw"), receiver: projectEnd("standards", "cyber-and-information-governance", "George Clarke"), type: "Sequencing", description: "Controls first, policy wrapper second: the governance policy set should describe controls that are already in place.", requiredBy: "29/01/2027", criticality: "Medium", validation: "Inferred", giverAccepted: false, receiverAccepted: false, raisedDate: "14/09/2026", raisedBy: "Virtual PMO (inferred)" },
  { giver: projectEnd("resilience", "network-refresh-data-centre", "Aisha Khan", "m-network-stable"), receiver: projectEnd("optimisation", "vdi-review", "Freya Walsh"), type: "Sequencing", description: "The VDI pilot cannot begin until the data centre network is stable.", requiredBy: "30/10/2026", criticality: "High", validation: "Inferred", giverAccepted: false, receiverAccepted: true, riskIds: ["vdi-dep-risk"], raisedDate: "04/09/2026", raisedBy: "Virtual PMO (inferred)" },
  { giver: projectEnd("resilience", "storage-expansion", "Daniel Brooks", "m-storage-live"), receiver: projectEnd("resilience", "dfs-migrations-data-retention", "Jacob Cole"), type: "Sequencing", description: "The expanded storage tier must be live before file shares can be migrated and retention rules applied.", requiredBy: "18/12/2026", criticality: "Medium", validation: "Inferred", giverAccepted: false, receiverAccepted: false, raisedDate: "14/09/2026", raisedBy: "Virtual PMO (inferred)" },

  // --- Inferred, within PM2's workstreams ---
  { giver: projectEnd("standards", "smis-topdesk-best-practice", "Priya Ncube", "m-catalogue-clean"), receiver: projectEnd("automation", "ebbot-chatbot", "Freya Walsh"), type: "Sequencing", description: "A clean service catalogue is needed before the assistant can route requests reliably.", requiredBy: "13/11/2026", criticality: "High", validation: "Inferred", giverAccepted: true, receiverAccepted: false, raisedDate: "09/09/2026", raisedBy: "Virtual PMO (inferred)" },
  { giver: projectEnd("people", "working-practices-change-management-principles", "Layla Owen"), receiver: projectEnd("standards", "business-change-management-frameworks", "George Clarke"), type: "Alignment", description: "Agreed working practices must align with the change management framework before it is published.", requiredBy: "26/02/2027", criticality: "Low", validation: "Inferred", giverAccepted: false, receiverAccepted: false, raisedDate: "14/09/2026", raisedBy: "Virtual PMO (inferred)" },
  { giver: projectEnd("automation", "copilot-microsoft-integration", "Maya Harrison"), receiver: projectEnd("people", "digital-skills-academy", "Eva Chen"), type: "Information", description: "Copilot and account automation adoption data is needed to shape the digital literacy and skills framework.", requiredBy: "15/01/2027", criticality: "Low", validation: "Inferred", giverAccepted: false, receiverAccepted: false, raisedDate: "14/09/2026", raisedBy: "Virtual PMO (inferred)" },
  { giver: projectEnd("automation", "ebbot-chatbot", "Freya Walsh"), receiver: projectEnd("people", "identify-opportunities-for-training-collaboration", "Imogen Foster"), type: "Information", description: "Assistant, Copilot and automation usage patterns identify where training and collaboration will have most effect.", requiredBy: "26/03/2027", criticality: "Low", validation: "Inferred", giverAccepted: false, receiverAccepted: false, raisedDate: "14/09/2026", raisedBy: "Virtual PMO (inferred)" },

  // --- External parties ---
  { giver: externalEnd("Dataflow Systems Ltd (vendor)", "Ian Fletcher, Account Director"), receiver: projectEnd("resilience", "network-refresh-data-centre", "Aisha Khan"), type: "External", description: "Core switch hardware delivery and vendor commissioning resource for the data centre refresh.", requiredBy: "16/10/2026", criticality: "High", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "01/08/2026", raisedBy: "Aisha Khan" },
  { giver: externalEnd("Estates & Campus Services", "Helen Moss, Estates Operations Manager"), receiver: projectEnd("resilience", "improve-infrastructure-resilience-vxrail", "Jacob Cole"), type: "External", description: "Out-of-hours data hall access and power isolation windows for rack installation.", requiredBy: "02/11/2026", criticality: "Medium", validation: "Proposed", giverAccepted: false, receiverAccepted: true, raisedDate: "28/08/2026", raisedBy: "Jacob Cole" },

  // --- Further register content ---
  { giver: projectEnd("standards", "benefits-management-framework", "Elliot Reed"), receiver: projectEnd("automation", "account-creation-automation", "Nadia Begum"), type: "Information", description: "Benefit measure definitions and the measurement template are needed before provisioning baselines can be captured.", requiredBy: "16/10/2026", criticality: "Medium", validation: "Proposed", giverAccepted: true, receiverAccepted: false, raisedDate: "02/09/2026", raisedBy: "Elliot Reed" },
  { giver: projectEnd("optimisation", "windows-11-rollout", "Freya Walsh"), receiver: projectEnd("optimisation", "vdi-review", "Freya Walsh"), type: "Resource", description: "The desktop engineering pair building the Windows 11 image is the same team needed for the VDI golden image.", requiredBy: "27/11/2026", criticality: "Medium", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "26/08/2026", raisedBy: "Freya Walsh" },
  { giver: projectEnd("resilience", "identity-recovery-service", "Sofia Rahman"), receiver: projectEnd("resilience", "business-continuity-testing", "Oliver Bennett"), type: "Sequencing", description: "The identity recovery route must be in place before the continuity exercise can test a full-estate recovery scenario.", requiredBy: "12/02/2027", criticality: "High", validation: "Confirmed", giverAccepted: true, receiverAccepted: true, raisedDate: "20/08/2026", raisedBy: "Oliver Bennett" },
  { giver: projectEnd("automation", "workflow-automation-hub", "Nadia Begum"), receiver: projectEnd("people", "continuous-improvement-network", "Imogen Foster"), type: "Alignment", description: "Automation patterns and the improvement network's ways of working need to describe the same intake route.", requiredBy: "30/04/2027", criticality: "Low", validation: "Closed", giverAccepted: true, receiverAccepted: true, raisedDate: "05/08/2026", raisedBy: "Imogen Foster" },
  { giver: projectEnd("optimisation", "cloud-cost-management", "Elliot Reed"), receiver: projectEnd("standards", "architecture-review-board", "George Clarke"), type: "Information", description: "Cloud cost baselines are needed so the review board can set landing-zone standards. The giving team has confirmed it cannot supply tenant-level data.", requiredBy: "25/09/2026", criticality: "Medium", validation: "Broken", giverAccepted: false, receiverAccepted: true, raisedDate: "12/08/2026", raisedBy: "George Clarke" },
];

export const dependencies: Dependency[] = seeds.map((seed, index) => ({
  id: `dep-${String(index + 1).padStart(3, "0")}`,
  reference: `DEP-${String(index + 1).padStart(3, "0")}`,
  giver: seed.giver,
  receiver: seed.receiver,
  type: seed.type,
  description: seed.description,
  requiredBy: seed.requiredBy,
  criticality: seed.criticality,
  validation: seed.validation,
  giverAccepted: seed.giverAccepted,
  receiverAccepted: seed.receiverAccepted,
  riskIds: seed.riskIds ?? [],
  issueIds: seed.issueIds ?? [],
  raisedDate: seed.raisedDate,
  raisedBy: seed.raisedBy,
}));
