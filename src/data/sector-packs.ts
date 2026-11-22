// Sector packs (NHS-0). Mirrors private.pack_terminology, private.pack_governance_roles and
// private.pack_modules in migration 20261122150000_nhs_0_modules: change both together.
//
// A pack is a recommended bundle of modules plus terminology and seeded defaults. It sits beside
// the GL-8 sector: an NHS organisation is sector "public_sector" with pack "nhs". Applying a pack
// switches modules on, fills only the terms the organisation hasn't set, and adds missing list
// values; it never changes existing records or the financial year.

export type SectorPack = "general" | "nhs";

export const isSectorPack = (value: unknown): value is SectorPack =>
  value === "general" || value === "nhs";
export const toSectorPack = (value: unknown): SectorPack =>
  isSectorPack(value) ? value : "general";

export const sectorPacks: Array<{ value: SectorPack; label: string; description: string }> = [
  {
    value: "general",
    label: "General",
    description: "Neutral wording. Switch on individual modules as you need them.",
  },
  {
    value: "nhs",
    label: "NHS",
    description:
      "For NHS trusts, ICBs and ICSs: switches on every module with NHS language (CIP, QIA / EqIA, BAF) and NHS governance roles.",
  },
];

/** Terminology keys for module concepts, stored in settings.terminology.terms. */
export const MODULE_TERM_KEYS = [
  "orgUnit",
  "orgUnitPlural",
  "assurance.name",
  "assurance.strategicRisk",
  "impactAssessment.name",
  "impactAssessment.short",
  "efficiency.programme",
  "efficiency.scheme",
  "efficiency.schemePlural",
  "fiveCase.name",
  "clinicalSafety.name",
  "crossOrg.programme",
  "crossOrg.partner",
] as const;
export type ModuleTermKey = (typeof MODULE_TERM_KEYS)[number];

/** The fallback wording when an organisation hasn't set a term. */
export const neutralModuleTerms: Record<ModuleTermKey, string> = {
  orgUnit: "Department",
  orgUnitPlural: "Departments",
  "assurance.name": "Board assurance",
  "assurance.strategicRisk": "Strategic risk",
  "impactAssessment.name": "Impact assessment",
  "impactAssessment.short": "Impact assessment",
  "efficiency.programme": "Efficiency programme",
  "efficiency.scheme": "Savings scheme",
  "efficiency.schemePlural": "Savings schemes",
  "fiveCase.name": "Five Case Model business case",
  "clinicalSafety.name": "Clinical safety",
  "crossOrg.programme": "Partner programme",
  "crossOrg.partner": "Partner organisation",
};

/** Plain labels for the Terminology settings screen. */
export const moduleTermLabels: Record<ModuleTermKey, string> = {
  orgUnit: "Organisational unit",
  orgUnitPlural: "Organisational units",
  "assurance.name": "Board assurance",
  "assurance.strategicRisk": "Strategic risk",
  "impactAssessment.name": "Impact assessment",
  "impactAssessment.short": "Impact assessment (short)",
  "efficiency.programme": "Efficiency programme",
  "efficiency.scheme": "Savings scheme",
  "efficiency.schemePlural": "Savings schemes",
  "fiveCase.name": "Five Case business case",
  "clinicalSafety.name": "Clinical safety",
  "crossOrg.programme": "Partner programme",
  "crossOrg.partner": "Partner organisation",
};

/** NHS pack wording (private.pack_terminology('nhs')). Defaults to validate with an NHS PMO. */
export const nhsModuleTerms: Record<ModuleTermKey, string> = {
  orgUnit: "Directorate",
  orgUnitPlural: "Directorates",
  "assurance.name": "Board Assurance Framework",
  "assurance.strategicRisk": "BAF risk",
  "impactAssessment.name": "QIA / EqIA",
  "impactAssessment.short": "QIA",
  "efficiency.programme": "CIP",
  "efficiency.scheme": "CIP scheme",
  "efficiency.schemePlural": "CIP schemes",
  "fiveCase.name": "Five Case Model business case",
  "clinicalSafety.name": "Clinical safety",
  "crossOrg.programme": "ICS programme",
  "crossOrg.partner": "Partner organisation",
};

/** Governance roles each pack seeds (private.pack_governance_roles). */
export const packGovernanceRoles: Record<SectorPack, Array<{ value: string; label: string }>> = {
  nhs: [
    { value: "medical_director", label: "Medical Director" },
    { value: "chief_nurse", label: "Chief Nurse / Director of Nursing" },
    { value: "director_of_finance", label: "Director of Finance" },
    { value: "chief_operating_officer", label: "Chief Operating Officer" },
    { value: "clinical_safety_officer", label: "Clinical Safety Officer" },
    { value: "caldicott_guardian", label: "Caldicott Guardian" },
    { value: "siro", label: "Senior Information Risk Owner (SIRO)" },
    { value: "head_of_pmo", label: "Head of PMO" },
  ],
  general: [
    { value: "executive_sponsor", label: "Executive sponsor" },
    { value: "finance_lead", label: "Finance lead" },
    { value: "head_of_pmo", label: "Head of PMO" },
    { value: "quality_lead", label: "Quality lead" },
  ],
};

/** The organisation's wording for a module term: its own, else the neutral fallback. */
export function resolveModuleTerm(terms: Record<string, string> | undefined, key: ModuleTermKey) {
  const own = terms?.[key]?.trim();
  return own ? own : neutralModuleTerms[key];
}

/** Terms a pack would add: only those the organisation hasn't set, or left blank (mirrors the SQL). */
export function packTermsToAdd(pack: SectorPack, terms: Record<string, string> | undefined) {
  if (pack !== "nhs") return {};
  return Object.fromEntries(
    MODULE_TERM_KEYS.filter((key) => !terms?.[key]?.trim()).map((key) => [
      key,
      nhsModuleTerms[key],
    ]),
  ) as Partial<Record<ModuleTermKey, string>>;
}
