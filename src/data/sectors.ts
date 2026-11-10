// Sector defaults (GL-8). Mirrors private.sector_org_settings and private.seed_org_defaults
// (migration 20261110113630_gl_8_sector): change both together.
//
// The sector is chosen in the setup wizard and shown in Settings › Organisation. After setup it
// only steers "Restore default tiers", "Reset all settings" and the financial-year suggestion;
// it never rewrites an organisation's lists.
import { defaultTierDefinitions } from "./lifecycle";
import type { OptimismBiasSetting, TierDefinition } from "./types";

export type Sector = "university" | "public_sector" | "general";

export const sectors: Array<{ value: Sector; label: string; description: string }> = [
  {
    value: "university",
    label: "University",
    description: "Student experience and research benefits, academic business units.",
  },
  {
    value: "public_sector",
    label: "Public sector",
    description: "Service quality and public outcomes, financial year from April.",
  },
  {
    value: "general",
    label: "General",
    description: "Customer and employee benefits, financial year from January.",
  },
];

export const isSector = (value: unknown): value is Sector =>
  value === "university" || value === "public_sector" || value === "general";

/** A stored sector, or University for organisations created before GL-8 without one. */
export const toSector = (value: unknown): Sector => (isSector(value) ? value : "university");

export const sectorLabel = (sector: Sector) =>
  sectors.find((item) => item.value === sector)?.label ?? "University";

/** Suggested first month of the financial year (1 = January). */
export const financialYearStartFor = (sector: Sector) =>
  sector === "public_sector" ? 4 : sector === "general" ? 1 : 8;

const sectorCategories: Record<Sector, [string, string]> = {
  university: ["Student experience", "Research"],
  public_sector: ["Service quality", "Public outcomes"],
  general: ["Customer experience", "Employee experience"],
};

/** The sector's benefit categories, in the order they are seeded. */
export const benefitCategoriesFor = (sector: Sector): string[] => [
  "Efficiency",
  ...sectorCategories[sector],
  "Risk reduction",
  "Compliance",
  "Sustainability",
  "Income",
];

export const sectorOptimismBias = (sector: Sector): OptimismBiasSetting[] => [
  { category: "Efficiency", percentage: 20 },
  { category: "Income", percentage: 30 },
  { category: sectorCategories[sector][0], percentage: 25 },
  { category: sectorCategories[sector][1], percentage: 25 },
  { category: "Risk reduction", percentage: 15 },
  { category: "Compliance", percentage: 10 },
  { category: "Sustainability", percentage: 15 },
];

/** Tier wording: University keeps "institution-wide" / "university-wide"; others are neutral. */
export const tierDefinitionsFor = (sector: Sector): TierDefinition[] =>
  defaultTierDefinitions.map((tier) =>
    sector === "university" && tier.tier === "Large"
      ? {
          ...tier,
          description: tier.description.replace("organisation-wide", "institution-wide"),
          guideline: tier.guideline.replace("organisation-wide", "university-wide"),
        }
      : { ...tier },
  );
