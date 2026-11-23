// Impact assessments (NHS-3): template shape, the default templates and the pure rules the
// database applies. Mirrors private.impact_assessment_default_template,
// private.impact_assessment_scores and private.impact_assessment_missing in migration
// 20261123140000_nhs_3_impact_assessments: change both together. The database is the authority
// (it works out the scores and refuses incomplete submissions); these let screens show the same
// result before saving.
import type { SectorPack } from "./sector-packs";

export type Impact = "positive" | "neutral" | "negative";
export const IMPACTS: Impact[] = ["positive", "neutral", "negative"];
export const isImpact = (value: unknown): value is Impact =>
  value === "positive" || value === "neutral" || value === "negative";

export interface TemplateItem {
  key: string;
  label: string;
  question?: string | undefined;
}

export interface ImpactTemplate {
  version: number;
  /** A negative screening score (consequence × likelihood) at or above this needs a full assessment. */
  fullAssessmentMinScore: number;
  /** Any negative equality impact needs a full assessment. */
  equalityNegativeRequiresFull: boolean;
  /** Post-implementation review, in months after submission, when no date is set. */
  reviewMonths: number;
  domains: TemplateItem[];
  equality: TemplateItem[];
  /** Governance role keys that sign off every assessment, in order. */
  signoff: string[];
  /** Extra roles for a full assessment (e.g. a QIA panel). */
  fullSignoff: string[];
}

export interface ScreeningAnswer {
  impact?: Impact | undefined;
  consequence?: number | undefined;
  likelihood?: number | undefined;
  note?: string | undefined;
}
export interface QualityAnswer extends ScreeningAnswer {
  description?: string | undefined;
  mitigations?: string | undefined;
  indicators?: string[] | undefined;
}
export interface EqualityAnswer {
  impact?: Impact | undefined;
  evidence?: string | undefined;
  mitigation?: string | undefined;
}
export interface AssessmentAnswers {
  screening: Record<string, ScreeningAnswer>;
  quality: Record<string, QualityAnswer>;
  equality: Record<string, EqualityAnswer>;
}

const EQUALITY: TemplateItem[] = [
  { key: "age", label: "Age" },
  { key: "disability", label: "Disability" },
  { key: "gender_reassignment", label: "Gender reassignment" },
  { key: "marriage_civil_partnership", label: "Marriage and civil partnership" },
  { key: "pregnancy_maternity", label: "Pregnancy and maternity" },
  { key: "race", label: "Race" },
  { key: "religion_belief", label: "Religion or belief" },
  { key: "sex", label: "Sex" },
  { key: "sexual_orientation", label: "Sexual orientation" },
];

export function defaultImpactTemplate(pack: SectorPack): ImpactTemplate {
  const nhs = pack === "nhs";
  return {
    version: 1,
    fullAssessmentMinScore: 8,
    equalityNegativeRequiresFull: true,
    reviewMonths: 6,
    domains: nhs
      ? [
          {
            key: "patient_safety",
            label: "Patient safety",
            question:
              "Could this change affect the safety of patients, including avoidable harm or incidents?",
          },
          {
            key: "clinical_effectiveness",
            label: "Clinical effectiveness",
            question:
              "Could this change affect clinical outcomes, evidence-based care or adherence to guidance?",
          },
          {
            key: "patient_experience",
            label: "Patient experience",
            question: "Could this change affect patients' experience, access, dignity or choice?",
          },
          {
            key: "workforce",
            label: "Workforce and staff wellbeing",
            question:
              "Could this change affect staffing levels, skills, workload or staff wellbeing?",
          },
          {
            key: "operational_performance",
            label: "Operational performance",
            question:
              "Could this change affect waiting times, flow, capacity or performance standards?",
          },
        ]
      : [
          {
            key: "safety",
            label: "Safety and service quality",
            question:
              "Could this change affect the safety or quality of the service people receive?",
          },
          {
            key: "effectiveness",
            label: "Effectiveness and outcomes",
            question: "Could this change affect the outcomes the service achieves?",
          },
          {
            key: "user_experience",
            label: "Customer and user experience",
            question: "Could this change affect people's experience, access or choice?",
          },
          {
            key: "workforce",
            label: "Staff wellbeing",
            question: "Could this change affect staffing, workload or staff wellbeing?",
          },
          {
            key: "operational_performance",
            label: "Operational performance",
            question: "Could this change affect service levels, capacity or performance?",
          },
        ],
    equality: nhs
      ? [
          ...EQUALITY,
          { key: "health_inequalities", label: "Health inequalities" },
          { key: "deprivation", label: "Deprivation" },
        ]
      : [...EQUALITY, { key: "socio_economic", label: "Socio-economic disadvantage" }],
    signoff: nhs ? ["medical_director", "chief_nurse"] : ["quality_lead"],
    fullSignoff: [],
  };
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const asItems = (value: unknown): TemplateItem[] =>
  Array.isArray(value)
    ? value.flatMap((raw) => {
        const item = asObject(raw);
        return typeof item["key"] === "string" && typeof item["label"] === "string"
          ? [
              {
                key: item["key"],
                label: item["label"],
                ...(typeof item["question"] === "string" ? { question: item["question"] } : {}),
              },
            ]
          : [];
      })
    : [];
const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** A stored template (jsonb) as typed data; missing parts fall back to the pack default. */
export function toImpactTemplate(value: unknown, pack: SectorPack = "general"): ImpactTemplate {
  const raw = asObject(value);
  const fallback = defaultImpactTemplate(pack);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const domains = asItems(raw["domains"]);
  const equality = asItems(raw["equality"]);
  const signoff = asStrings(raw["signoff"]);
  return {
    version: num(raw["version"], fallback.version),
    fullAssessmentMinScore: num(raw["fullAssessmentMinScore"], fallback.fullAssessmentMinScore),
    equalityNegativeRequiresFull:
      typeof raw["equalityNegativeRequiresFull"] === "boolean"
        ? raw["equalityNegativeRequiresFull"]
        : fallback.equalityNegativeRequiresFull,
    reviewMonths: num(raw["reviewMonths"], fallback.reviewMonths),
    domains: domains.length ? domains : fallback.domains,
    equality: Array.isArray(raw["equality"]) ? equality : fallback.equality,
    signoff: signoff.length ? signoff : fallback.signoff,
    fullSignoff: asStrings(raw["fullSignoff"]),
  };
}

const level = (v: unknown) => (typeof v === "number" && v >= 1 && v <= 5 ? v : 0);

/** private.impact_assessment_scores: the highest negative screening score and whether a full assessment is needed. */
export function screeningResult(
  template: ImpactTemplate,
  answers: Pick<AssessmentAnswers, "screening" | "equality">,
): { maxScore: number; fullRequired: boolean } {
  const maxScore = Math.max(
    0,
    ...template.domains.map((d) => {
      const a = answers.screening[d.key];
      return a?.impact === "negative" ? level(a.consequence) * level(a.likelihood) : 0;
    }),
  );
  const equalityNegative = template.equality.some(
    (d) => answers.equality[d.key]?.impact === "negative",
  );
  return {
    maxScore,
    fullRequired:
      maxScore >= template.fullAssessmentMinScore ||
      (equalityNegative && template.equalityNegativeRequiresFull),
  };
}

const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";

/** private.impact_assessment_missing: what must be completed before submitting. */
export function missingItems(template: ImpactTemplate, answers: AssessmentAnswers): string[] {
  const { fullRequired } = screeningResult(template, answers);
  const out: string[] = [];
  for (const d of template.domains) {
    const a = answers.screening[d.key];
    if (
      !isImpact(a?.impact) ||
      (a.impact === "negative" && (!level(a.consequence) || !level(a.likelihood)))
    )
      out.push(`Screening: ${d.label}`);
  }
  for (const d of template.equality) {
    const a = answers.equality[d.key];
    if (
      !isImpact(a?.impact) ||
      (fullRequired && a.impact === "negative" && (blank(a.evidence) || blank(a.mitigation)))
    )
      out.push(`Equality: ${d.label}`);
  }
  if (fullRequired) {
    for (const d of template.domains) {
      const a = answers.quality[d.key];
      if (
        !isImpact(a?.impact) ||
        blank(a.description) ||
        (a.impact === "negative" &&
          (!level(a.consequence) || !level(a.likelihood) || blank(a.mitigations)))
      )
        out.push(`Full assessment: ${d.label}`);
    }
  }
  return out;
}

/** The sign-off route: signoff, then fullSignoff for a full assessment, without repeats. */
export function signoffRoute(template: ImpactTemplate, fullRequired: boolean): string[] {
  const roles = fullRequired ? [...template.signoff, ...template.fullSignoff] : template.signoff;
  return roles.filter((role, i) => roles.indexOf(role) === i);
}

export type AssessmentStatus =
  "draft" | "in_review" | "approved" | "rejected" | "reassessment_required";

export const isAssessmentStatus = (value: unknown): value is AssessmentStatus =>
  typeof value === "string" &&
  ["draft", "in_review", "approved", "rejected", "reassessment_required"].includes(value);

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: "Draft",
  in_review: "Awaiting sign-off",
  approved: "Approved",
  rejected: "Rejected",
  reassessment_required: "Re-assessment required",
};

/** Answers can be edited in these statuses (the database refuses edits otherwise). */
export const EDITABLE_STATUSES: AssessmentStatus[] = ["draft", "rejected", "reassessment_required"];

export type AssessmentDecision = "approved" | "approved_with_conditions" | "rejected" | "returned";

export const PATIENT_DATA_HINT = "Do not enter patient-identifiable information.";

/** Review periods the database accepts (months). */
export const REVIEW_MONTH_CHOICES = [1, 2, 3, 4, 5, 6, 9, 12, 18, 24];

/**
 * A key for a new domain or characteristic from its label: lower case, letters, digits and
 * underscores, starting with a letter, at most 40 characters, unique among `taken`
 * (private.impact_assessment_check_template's rule). Pure.
 */
export function templateKey(label: string, taken: readonly string[]): string {
  let base = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "")
    .slice(0, 36);
  if (base.length < 2) base = `item_${base}`.replace(/_+$/, "") || "item";
  if (base.length < 2) base = "item";
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}
