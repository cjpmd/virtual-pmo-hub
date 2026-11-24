// Module registry (NHS-0, docs/nhs-module-plan.md). Mirrors private.module_keys() in migration
// 20261122150000_nhs_0_modules: change both together.
//
// A module is an individually switchable capability, stored in organisations.settings.modules.
// Code checks the module, never the sector or pack: isModuleEnabled("efficiency"), not
// pack === "nhs". Navigation items, report blocks and fields a module controls are listed here
// so screens can hide them when it's off; later packages fill in their entries.
import { useSettings, getSettings } from "@/services/settings";
import type { AppSettings } from "@/data/settings-types";
import { resolveModuleTerm, type ModuleTermKey } from "@/data/sector-packs";

export const MODULE_KEYS = [
  "assurance",
  "benefit_categories_nhs",
  "impact_assessment",
  "efficiency",
  "five_case",
  "clinical_safety",
  "cross_org",
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDefinition {
  key: ModuleKey;
  /** Name for organisations without the NHS pack. */
  neutralName: string;
  /** Name the NHS pack uses. */
  nhsName: string;
  description: string;
  /** What switching it on adds, in plain English, for Settings › Modules. */
  adds: string[];
  /** Modules that work best alongside this one (suggested, never forced). */
  recommends: ModuleKey[];
  /** Health and care only: shown with a note for other organisations. */
  healthOnly?: boolean;
  /** Work package that builds it; until then the switch only records the choice. */
  builtIn: string;
  /** Its screens are built (Settings › Modules stops saying they arrive later). */
  ready?: boolean;
  /** Sidebar paths (lib/navigation.ts) this module controls. */
  navPaths: string[];
  /** Report block keys (features/reports/blocks) this module controls. */
  reportBlocks: string[];
}

export const MODULES: ModuleDefinition[] = [
  {
    key: "assurance",
    neutralName: "Board assurance",
    nhsName: "Board Assurance Framework (BAF)",
    description:
      "A strategic risk register with assurance ratings, linked programme risks and committee pack templates.",
    adds: [
      "Strategic risk register",
      "Assurance ratings",
      "Committee pack templates and report blocks",
    ],
    recommends: [],
    builtIn: "NHS-1",
    ready: true,
    navPaths: ["/governance/assurance"],
    reportBlocks: ["baf_summary", "baf_above_appetite", "baf_linkage", "assurance_by_programme"],
  },
  {
    key: "benefit_categories_nhs",
    neutralName: "NHS benefit categories",
    nhsName: "NHS benefit categories",
    description:
      "Benefit categories in NHS language, such as bed days saved, staff time released and waiting list.",
    adds: [
      "Twelve NHS benefit categories, each with a default cash-releasing or non-cash classification",
      "Measure unit presets such as bed days, WTE and staff hours",
    ],
    recommends: [],
    healthOnly: true,
    builtIn: "NHS-2",
    ready: true,
    navPaths: [],
    reportBlocks: [],
  },
  {
    key: "impact_assessment",
    neutralName: "Impact assessments",
    nhsName: "QIA / EqIA",
    description:
      "Quality and equality impact assessments with screening, a full assessment and sign-off before delivery.",
    adds: ["Impact assessment register", "Sign-off by named governance roles", "Delivery gate"],
    recommends: [],
    builtIn: "NHS-3",
    ready: true,
    navPaths: ["/governance/impact-assessments"],
    reportBlocks: [
      "impact_assessment_status",
      "impact_assessments_awaiting",
      "impact_negative_impacts",
    ],
  },
  {
    key: "efficiency",
    neutralName: "Efficiency programme",
    nhsName: "Cost Improvement Programme (CIP)",
    description:
      "Savings schemes with a pipeline, monthly phasing, targets and risk-adjusted values.",
    adds: ["Savings scheme pipeline", "Monthly phasing and targets", "Efficiency dashboard"],
    recommends: ["impact_assessment"],
    builtIn: "NHS-4",
    ready: true,
    navPaths: ["/portfolio/efficiency"],
    reportBlocks: [
      "efficiency_summary",
      "efficiency_breakdown",
      "efficiency_schemes_at_risk",
      "efficiency_recurrent",
    ],
  },
  {
    key: "five_case",
    neutralName: "Five Case Model business cases",
    nhsName: "Five Case Model business cases",
    description:
      "Business cases in the Strategic, Economic, Commercial, Financial and Management structure, by stage.",
    adds: ["Five Case Model template set", "SOC, OBC and FBC stages", "Options appraisal aid"],
    recommends: [],
    builtIn: "NHS-5",
    navPaths: [],
    reportBlocks: [],
  },
  {
    key: "clinical_safety",
    neutralName: "Clinical safety",
    nhsName: "Clinical safety (DCB0129 / DCB0160)",
    description:
      "A hazard log and safety case for digital projects, signed off by a Clinical Safety Officer.",
    adds: ["Hazard log", "Safety case sign-off", "Go-live gate"],
    recommends: [],
    healthOnly: true,
    builtIn: "NHS-6",
    navPaths: [],
    reportBlocks: [],
  },
  {
    key: "cross_org",
    neutralName: "Partner programmes",
    nhsName: "ICS programmes",
    description:
      "Run one programme across partner organisations, each keeping its own projects and data.",
    adds: ["Shared programmes", "Partner-contributed projects", "System-level programme pack"],
    recommends: [],
    builtIn: "NHS-7",
    navPaths: [],
    reportBlocks: [],
  },
];

export const isModuleKey = (value: unknown): value is ModuleKey =>
  typeof value === "string" && (MODULE_KEYS as readonly string[]).includes(value);

export const moduleDefinition = (key: ModuleKey) =>
  MODULES.find((item) => item.key === key) as ModuleDefinition;

/** The stored map read safely: unknown keys ignored, anything but true is off. */
export function toModuleMap(value: unknown): Partial<Record<ModuleKey, boolean>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Partial<Record<ModuleKey, boolean>> = {};
  for (const [key, enabled] of Object.entries(value))
    if (isModuleKey(key)) result[key] = enabled === true;
  return result;
}

export const isModuleEnabled = (key: ModuleKey, settings: AppSettings = getSettings()) =>
  settings.modules?.enabled?.[key] === true;

export const anyModuleEnabled = (settings: AppSettings = getSettings()) =>
  MODULE_KEYS.some((key) => isModuleEnabled(key, settings));

/** Re-renders when the organisation's settings change. */
export function useModule(key: ModuleKey): boolean {
  return isModuleEnabled(key, useSettings());
}

/** The module's display name for the organisation's pack. */
export const moduleName = (key: ModuleKey, settings: AppSettings = getSettings()) =>
  settings.modules?.pack === "nhs"
    ? moduleDefinition(key).nhsName
    : moduleDefinition(key).neutralName;

/** Hide a nav path, report block or field when the module that controls it is off. */
export function isPathEnabled(path: string, settings: AppSettings = getSettings()) {
  const owner = MODULES.find((item) => item.navPaths.some((p) => path.startsWith(p)));
  return !owner || isModuleEnabled(owner.key, settings);
}
export function isReportBlockEnabled(blockKey: string, settings: AppSettings = getSettings()) {
  const owner = MODULES.find((item) => item.reportBlocks.includes(blockKey));
  return !owner || isModuleEnabled(owner.key, settings);
}
/** A template is shown only while every block in it is enabled (its modules are on). */
export const templateModulesOn = (
  blocks: readonly { blockKey: string }[],
  settings: AppSettings = getSettings(),
) => blocks.every((block) => isReportBlockEnabled(block.blockKey, settings));
/** Report templates declare the modules they need; hidden if any is off. */
export const modulesSatisfied = (
  required: readonly string[] | undefined,
  settings: AppSettings = getSettings(),
) => (required ?? []).every((key) => isModuleKey(key) && isModuleEnabled(key, settings));

/** The organisation's wording for a module concept, e.g. moduleTerm("efficiency.scheme"). */
export const moduleTerm = (key: ModuleTermKey, settings: AppSettings = getSettings()) =>
  resolveModuleTerm(settings.terminology.terms as Record<string, string>, key);
export function useModuleTerm() {
  const settings = useSettings();
  return (key: ModuleTermKey) => moduleTerm(key, settings);
}
