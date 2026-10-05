// TEMPORARY (Stage 4b → removed in 4c). Screens not yet moved to Supabase still link with the
// prototype's string ids. These maps translate those ids into the demo organisation's real
// project codes and programme uuids (matched by name when the seed was loaded), and back,
// so the rewired pages and the remaining mock pages can link to each other meanwhile.
// Outside the demo organisation the maps simply find nothing and the id passes through.

const projectCodeByMockId: Record<string, string> = {
  "project-management-standards": "PMS",
  "digital-landscape-mapping": "DLM",
  "architecture-review-board": "ARB",
  "cyber-and-information-governance": "CAIG",
  "benefits-management-framework": "BMF",
  "business-change-management-frameworks": "BCMF",
  "smis-topdesk-best-practice": "STBP",
  "improve-infrastructure-resilience-vxrail": "IIRV",
  "reduce-our-cyber-risk": "CYB",
  "network-refresh-data-centre": "NRDC",
  "business-continuity-testing": "BCT",
  "identity-recovery-service": "IRS",
  "cis-safeguards-cyber-security-improvements": "CSCSI",
  "storage-expansion": "STO",
  "dfs-migrations-data-retention": "DMDR",
  "windows-11-rollout": "W11",
  "vdi-review": "VDI",
  "asset-management": "ASS",
  "service-desk-optimisation": "SDO",
  "cloud-cost-management": "CCM",
  "sits-admissions-management": "SAM",
  "account-creation-automation": "ACA",
  "copilot-microsoft-integration": "CMI",
  "ebbot-chatbot": "EBB",
  "workflow-automation-hub": "WAH",
  "research-data-triage-ai": "RDTA",
  "testing-automation-workflow-streamlining": "TAWS",
  "document-management": "DOC",
  "digital-skills-academy": "DSA",
  "knowledge-base-renewal": "KBR",
  "dts-operating-model": "DOM",
  "continuous-improvement-network": "CIN",
  "working-practices-change-management-principles": "WPCMP",
  "identify-opportunities-for-training-collaboration": "IOFTC",
  "future-students-crm": "FSC",
  "unified-comms-phase-2": "UC2",
  safezone: "SFZ",
};

const programmeIdByMockId: Record<string, string> = {
  standards: "de25cdf7-1aa7-5626-a6b2-20d90a8ac6d3",
  resilience: "d56ba336-661a-2842-da8f-a9b85464be10",
  optimisation: "5ea49c82-fd35-a4c8-24c9-3d9195a41e2a",
  automation: "8e900001-1bc0-b2f2-492a-863461753ebd",
  people: "d3e1838e-dd7b-1916-e31f-daebde9e6616",
};

const invert = (map: Record<string, string>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<
    string,
    string
  >;
const mockIdByProjectCode = invert(projectCodeByMockId);
const mockIdByProgrammeId = invert(programmeIdByMockId);

/** Project code for a prototype project id; anything else (already a code) passes through. */
export const toProjectCode = (idOrCode: string) => projectCodeByMockId[idOrCode] ?? idOrCode;
/** Prototype project id for a project code, for tabs that still read mock data. */
export const toMockProjectId = (code: string) => mockIdByProjectCode[code] ?? code;
/** Programme uuid for a prototype programme id; a uuid passes through. */
export const toProgrammeId = (idOrUuid: string) => programmeIdByMockId[idOrUuid] ?? idOrUuid;
/** Prototype programme id for a programme uuid, for panels that still read mock data. */
export const toMockProgrammeId = (uuid: string) => mockIdByProgrammeId[uuid] ?? uuid;
