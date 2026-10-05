// Benefits, read from and written to Supabase.
//
// One load returns everything the benefits screens use, in the shapes the components already
// know (Benefit, BenefitMeasure, MeasurementRecord, …) with ISO dates and database ids:
//   - benefits embed their measures (with targets and measurements), project links, objective
//     links, reviews and handover. These are one-to-many with a single FK each, so PostgREST
//     embedding is unambiguous. People (owner, SRO, submitter, …) all point at resources through
//     several FKs, so names come from one parallel resources query instead.
//   - realisation, variance, overdue measurement and health come from v_benefit_realisation;
//     per-period fractions from v_benefit_period_values. Nothing here recomputes them.
import type {
  Benefit,
  BenefitHandover,
  BenefitMeasure,
  BenefitReview,
  Capability,
  Health,
  MeasurementRecord,
  Outcome,
  StrategicObjective,
} from "@/data/types";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { listPeople, type Person } from "./hierarchy";
import { projectStateLabel, toHealth, type ProjectStateLabel } from "./labels";
import { ServiceError, unwrap } from "./service-error";
import { deleteRows, insertRow, insertRows, updateRow } from "./write";

type Enums = Database["public"]["Enums"];

const invert = <K extends string, V extends string>(map: Record<K, V>) =>
  Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key])) as Record<V, K>;

export const benefitStatusLabel: Record<Enums["benefit_status"], Benefit["status"]> = {
  identified: "Identified",
  validated: "Validated",
  planned: "Planned",
  in_realisation: "In realisation",
  realised: "Realised",
  partially_realised: "Partially realised",
  not_realised: "Not realised",
  closed: "Closed",
};
export const benefitStatusValue = invert(benefitStatusLabel);
export const classificationLabel: Record<
  Enums["benefit_classification"],
  Benefit["classification"]
> = {
  cash_releasing: "Cash-releasing",
  non_cash_releasing: "Non-cash-releasing",
  qualitative: "Qualitative",
  societal: "Societal",
};
export const classificationValue = invert(classificationLabel);
export const confidenceLabel: Record<Enums["confidence"], Benefit["confidence"]> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
export const confidenceValue = invert(confidenceLabel);
export const frequencyLabel: Record<Enums["measure_frequency"], BenefitMeasure["frequency"]> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};
export const frequencyValue = invert(frequencyLabel);
export const measurementStatusLabel: Record<
  Enums["measurement_status"],
  MeasurementRecord["status"]
> = { submitted: "Submitted", validated: "Validated", queried: "Queried" };
const reviewTypeLabel: Record<Enums["benefit_review_type"], BenefitReview["type"]> = {
  scheduled: "Scheduled review",
  post_implementation: "Post-implementation review",
};

export interface BenefitPeriod {
  id: string;
  /** Label, e.g. "Q1 Aug–Oct 2026" (the key measures and records use). */
  period: string;
  start: string;
  end: string;
}

export interface BenefitRealisation {
  realised: number;
  percent: number;
  expectedFraction: number;
  achievedFraction: number;
  variancePercent: number;
  behindProfile: boolean;
  measurementOverdue: boolean;
  nextMeasurementDue: string | null;
  lifecycleValid: boolean;
  attributionTotal: number;
  attributionWarning: boolean;
  health: Health;
}

export interface PeriodValue {
  periodId: string;
  period: string;
  index: number;
  plannedFraction: number;
  actualFraction: number | undefined;
}

export interface MeasurementView extends MeasurementRecord {
  periodId: string;
  updatedAt: string;
}
export interface MeasureView extends BenefitMeasure {
  records: MeasurementView[];
}

/** A benefit as the screens use it: the prototype shape plus database facts and view results. */
export interface BenefitView extends Benefit {
  measures: MeasureView[];
  workspaceId: string;
  portfolioId: string;
  programmeId: string | null;
  ownerId: string | null;
  sroId: string | null;
  categoryId: string | null;
  realisation: BenefitRealisation;
  periodValues: PeriodValue[];
  updatedAt: string;
  handoverUpdatedAt: string | null;
}

export interface BenefitProjectRef {
  id: string;
  code: string;
  name: string;
  programmeId: string | null;
  portfolioId: string | null;
  state: ProjectStateLabel;
  managerName: string;
  budget: number;
  forecast: number;
  phaseIndex: number;
}

export interface BenefitsData {
  benefits: BenefitView[];
  periods: BenefitPeriod[];
  objectives: StrategicObjective[];
  projects: BenefitProjectRef[];
  programmes: Array<{ id: string; name: string; portfolioId: string }>;
  capabilities: Capability[];
  outcomes: Outcome[];
  maps: Array<{ id: string; programmeId: string; name: string; description: string }>;
  people: Person[];
  categories: Array<{ id: string; label: string }>;
}

const BENEFIT_SELECT = `
  id, ref, workspace_id, portfolio_id, programme_id, title, description, type, classification,
  beneficiaries, status, confidence, eligibility_confirmed, eligibility_confirmed_date,
  planned_total_value, dependency_notes, owner_id, sro_id, eligibility_confirmed_by_id,
  category_id, updated_at,
  benefit_measures(
    id, name, unit, measurement_method, data_source, frequency, data_provider, baseline_value,
    baseline_date, next_due_date, sort_order,
    benefit_measure_targets(period_id, value),
    benefit_measurements(
      id, period_id, actual_value, evidence, notes, submitted_by_id, submitted_date,
      validated_by_id, validated_date, query_note, status, created_at, updated_at
    )
  ),
  benefit_projects(project_id, attribution_percent),
  benefit_objectives(strategic_objective_id),
  benefit_reviews(id, review_date, type, findings, lessons_learned, reviewer_id),
  benefit_handovers(bau_owner_id, bau_service, frequency, next_review_date,
    post_implementation_review_date, confirmed_by_id, confirmed_date, updated_at)
`;

export async function loadBenefits(orgId: string): Promise<BenefitsData> {
  const [
    benefits,
    realisation,
    periodValues,
    periods,
    objectives,
    projects,
    programmes,
    capabilities,
    outcomes,
    maps,
    categories,
    people,
  ] = await Promise.all([
    supabase.from("benefits").select(BENEFIT_SELECT).eq("organisation_id", orgId).order("ref"),
    supabase
      .from("v_benefit_realisation")
      .select(
        "benefit_id, realised_value, realised_percent, expected_fraction, achieved_fraction, variance_percent, behind_profile, measurement_overdue, next_measurement_due, lifecycle_valid, attribution_total, attribution_warning, health",
      )
      .eq("organisation_id", orgId),
    supabase
      .from("v_benefit_period_values")
      .select("benefit_id, period_id, period_label, idx, planned_fraction, actual_fraction")
      .eq("organisation_id", orgId)
      .order("idx"),
    supabase
      .from("benefit_periods")
      .select("id, label, start_date, finish_date")
      .eq("organisation_id", orgId)
      .order("start_date"),
    supabase
      .from("strategic_objectives")
      .select("id, portfolio_id, title, description, owner_id")
      .eq("organisation_id", orgId)
      .order("title"),
    supabase
      .from("v_projects")
      .select(
        "id, code, name, programme_id, effective_portfolio_id, state, manager_id, budget, forecast, phase_index",
      )
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("programmes")
      .select("id, name, portfolio_id")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    // Capabilities and outcomes embed their link tables (single FK each).
    supabase
      .from("capabilities")
      .select("id, programme_id, title, description, owner_id, capability_projects(project_id)")
      .eq("organisation_id", orgId)
      .order("title"),
    supabase
      .from("outcomes")
      .select(
        "id, programme_id, title, description, owner_id, outcome_capabilities(capability_id), outcome_benefits(benefit_id)",
      )
      .eq("organisation_id", orgId)
      .order("title"),
    supabase
      .from("benefit_maps")
      .select("id, programme_id, name, description")
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("lookup_values")
      .select("id, label")
      .eq("organisation_id", orgId)
      .eq("list_key", "benefit_category")
      .order("sort_order"),
    listPeople(orgId),
  ]);

  const names = new Map(people.map((person) => [person.id, person.name]));
  const nameOf = (id: string | null | undefined) => (id && names.get(id)) || "";
  const periodRows = unwrap(periods, "Loading benefit periods").map((row): BenefitPeriod => ({
    id: row.id,
    period: row.label,
    start: row.start_date,
    end: row.finish_date,
  }));
  const periodLabel = new Map(periodRows.map((row) => [row.id, row.period]));
  const categoryRows = unwrap(categories, "Loading benefit categories");
  const categoryLabel = new Map(categoryRows.map((row) => [row.id, row.label]));
  const realisationById = new Map(
    unwrap(realisation, "Loading benefit realisation").map((row) => [row.benefit_id, row]),
  );
  const valuesById = new Map<string, PeriodValue[]>();
  for (const row of unwrap(periodValues, "Loading benefit profiles")) {
    const list = valuesById.get(row.benefit_id ?? "") ?? [];
    list.push({
      periodId: row.period_id ?? "",
      period: row.period_label ?? "",
      index: row.idx ?? list.length,
      plannedFraction: Number(row.planned_fraction ?? 0),
      actualFraction:
        row.actual_fraction === null || row.actual_fraction === undefined
          ? undefined
          : Number(row.actual_fraction),
    });
    valuesById.set(row.benefit_id ?? "", list);
  }
  const projectRows = unwrap(projects, "Loading projects").map((row): BenefitProjectRef => ({
    id: row.id ?? "",
    code: row.code ?? "",
    name: row.name ?? "",
    programmeId: row.programme_id,
    portfolioId: row.effective_portfolio_id,
    state: projectStateLabel[row.state ?? "proposed"],
    managerName: nameOf(row.manager_id) || "Unassigned",
    budget: Number(row.budget ?? 0),
    forecast: Number(row.forecast ?? 0),
    phaseIndex: row.phase_index ?? 0,
  }));

  const views = unwrap(benefits, "Loading benefits").map((row): BenefitView => {
    const r = realisationById.get(row.id);
    // benefit_handovers is keyed by benefit_id but its FK is composite, so it embeds as a list.
    const handoverRow = row.benefit_handovers?.[0];
    return {
      id: row.id,
      reference: row.ref,
      title: row.title,
      description: row.description ?? "",
      type: row.type === "disbenefit" ? "Disbenefit" : "Benefit",
      classification: classificationLabel[row.classification],
      category: (categoryLabel.get(row.category_id ?? "") ?? "Efficiency") as Benefit["category"],
      beneficiaries: row.beneficiaries ?? [],
      owner: nameOf(row.owner_id),
      sro: nameOf(row.sro_id),
      strategicObjectiveIds: (row.benefit_objectives ?? []).map(
        (link) => link.strategic_objective_id,
      ),
      enablingProjects: (row.benefit_projects ?? []).map((link) => ({
        projectId: link.project_id,
        attribution: Number(link.attribution_percent),
      })),
      status: benefitStatusLabel[row.status],
      confidence: confidenceLabel[row.confidence],
      eligibilityConfirmed: row.eligibility_confirmed,
      ...(row.eligibility_confirmed_by_id && {
        eligibilityConfirmedBy: nameOf(row.eligibility_confirmed_by_id),
      }),
      ...(row.eligibility_confirmed_date && {
        eligibilityConfirmedDate: row.eligibility_confirmed_date,
      }),
      plannedTotalValue: Number(row.planned_total_value),
      dependencies: row.dependency_notes ?? [],
      measures: [...(row.benefit_measures ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((measure): MeasureView => ({
          id: measure.id,
          name: measure.name,
          unit: measure.unit ?? "",
          measurementMethod: measure.measurement_method ?? "",
          dataSource: measure.data_source ?? "",
          frequency: frequencyLabel[measure.frequency],
          dataProvider: measure.data_provider ?? "",
          baselineValue: Number(measure.baseline_value ?? 0),
          baselineDate: measure.baseline_date ?? "",
          nextDue: measure.next_due_date ?? "",
          targetProfile: (measure.benefit_measure_targets ?? [])
            .map((target) => ({
              period: periodLabel.get(target.period_id) ?? "",
              value: Number(target.value),
            }))
            .sort(
              (a, b) =>
                periodRows.findIndex((item) => item.period === a.period) -
                periodRows.findIndex((item) => item.period === b.period),
            ),
          records: (measure.benefit_measurements ?? [])
            .map((record): MeasurementView => ({
              id: record.id,
              periodId: record.period_id,
              period: periodLabel.get(record.period_id) ?? "",
              actualValue: Number(record.actual_value),
              evidence: record.evidence ?? "",
              notes: record.notes ?? "",
              submittedBy: nameOf(record.submitted_by_id) || "Unknown",
              ...(record.submitted_date && { submittedDate: record.submitted_date }),
              ...(record.validated_by_id && { validatedBy: nameOf(record.validated_by_id) }),
              ...(record.validated_date && { validatedDate: record.validated_date }),
              ...(record.query_note && { queryNote: record.query_note }),
              status: measurementStatusLabel[record.status],
              updatedAt: record.updated_at,
            }))
            .sort((a, b) => (a.submittedDate ?? "").localeCompare(b.submittedDate ?? "")),
        })),
      reviews: (row.benefit_reviews ?? [])
        .map((review): BenefitReview => ({
          id: review.id,
          date: review.review_date,
          type: reviewTypeLabel[review.type],
          findings: review.findings ?? "",
          lessonsLearned: review.lessons_learned ?? "",
          reviewer: nameOf(review.reviewer_id),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      ...(handoverRow && {
        handover: {
          bauOwner: nameOf(handoverRow.bau_owner_id),
          bauService: handoverRow.bau_service ?? "",
          frequency: frequencyLabel[handoverRow.frequency],
          nextReviewDate: handoverRow.next_review_date ?? "",
          postImplementationReviewDate: handoverRow.post_implementation_review_date ?? "",
          confirmedBy: nameOf(handoverRow.confirmed_by_id),
          confirmedDate: handoverRow.confirmed_date ?? "",
        } satisfies BenefitHandover,
      }),
      workspaceId: row.workspace_id,
      portfolioId: row.portfolio_id,
      programmeId: row.programme_id,
      ownerId: row.owner_id,
      sroId: row.sro_id,
      categoryId: row.category_id,
      realisation: {
        realised: Number(r?.realised_value ?? 0),
        percent: Number(r?.realised_percent ?? 0),
        expectedFraction: Number(r?.expected_fraction ?? 0),
        achievedFraction: Number(r?.achieved_fraction ?? 0),
        variancePercent: Number(r?.variance_percent ?? 0),
        behindProfile: r?.behind_profile ?? false,
        measurementOverdue: r?.measurement_overdue ?? false,
        nextMeasurementDue: r?.next_measurement_due ?? null,
        lifecycleValid: r?.lifecycle_valid ?? true,
        attributionTotal: Number(r?.attribution_total ?? 0),
        attributionWarning: r?.attribution_warning ?? false,
        health: toHealth(r?.health),
      },
      periodValues: valuesById.get(row.id) ?? [],
      updatedAt: row.updated_at,
      handoverUpdatedAt: handoverRow?.updated_at ?? null,
    };
  });

  return {
    benefits: views,
    periods: periodRows,
    objectives: unwrap(objectives, "Loading strategic objectives").map((row) => ({
      id: row.id,
      portfolioId: row.portfolio_id,
      title: row.title,
      description: row.description ?? "",
      owner: nameOf(row.owner_id),
    })),
    projects: projectRows,
    programmes: unwrap(programmes, "Loading programmes").map((row) => ({
      id: row.id,
      name: row.name,
      portfolioId: row.portfolio_id,
    })),
    capabilities: unwrap(capabilities, "Loading capabilities").map((row) => ({
      id: row.id,
      programmeId: row.programme_id,
      title: row.title,
      description: row.description ?? "",
      owner: nameOf(row.owner_id),
      projectIds: (row.capability_projects ?? []).map((link) => link.project_id),
    })),
    outcomes: unwrap(outcomes, "Loading outcomes").map((row) => ({
      id: row.id,
      programmeId: row.programme_id,
      title: row.title,
      description: row.description ?? "",
      owner: nameOf(row.owner_id),
      capabilityIds: (row.outcome_capabilities ?? []).map((link) => link.capability_id),
      benefitIds: (row.outcome_benefits ?? []).map((link) => link.benefit_id),
    })),
    maps: unwrap(maps, "Loading benefit maps").map((row) => ({
      id: row.id,
      programmeId: row.programme_id,
      name: row.name,
      description: row.description ?? "",
    })),
    people,
    categories: categoryRows,
  };
}

// ---- Writes -------------------------------------------------------------------------------

/** The period a date falls in, or the last period that has started. */
export function periodFor(periods: BenefitPeriod[], isoDate: string): BenefitPeriod | undefined {
  return (
    periods.find((period) => period.start <= isoDate && period.end >= isoDate) ??
    [...periods].reverse().find((period) => period.start <= isoDate)
  );
}

export interface MeasurementInput {
  measureId: string;
  periodId: string;
  actualValue: number;
  notes: string;
  evidence: string;
  submittedById: string | null;
  submittedDate: string;
}

/** Contributors submit; the record joins the PMO validation queue. */
export async function submitMeasurement(input: MeasurementInput) {
  if (!Number.isFinite(input.actualValue))
    throw new ServiceError("invalid", "Enter the actual value as a number.");
  return insertRow(
    "benefit_measurements",
    {
      measure_id: input.measureId,
      period_id: input.periodId,
      actual_value: input.actualValue,
      notes: input.notes.trim() || null,
      evidence: input.evidence.trim() || null,
      submitted_by_id: input.submittedById,
      submitted_date: input.submittedDate,
      status: "submitted",
    },
    "Submitting the measurement",
  );
}

/** PMO only (trigger): validate or query a submitted record. */
export async function reviewMeasurement(input: {
  id: string;
  decision: "Validated" | "Queried";
  queryNote?: string;
  reviewerId: string | null;
  today: string;
  lastSeen: string;
}) {
  if (input.decision === "Queried" && !input.queryNote?.trim())
    throw new ServiceError("invalid", "Say what needs checking before querying the record.");
  return updateRow(
    "benefit_measurements",
    input.id,
    input.decision === "Validated"
      ? {
          status: "validated",
          validated_by_id: input.reviewerId,
          validated_date: input.today,
          query_note: null,
        }
      : { status: "queried", query_note: input.queryNote?.trim() ?? null },
    {
      context: input.decision === "Validated" ? "Validating the record" : "Querying the record",
      lastSeen: input.lastSeen,
    },
  );
}

export interface HandoverInput {
  benefitId: string;
  bauOwnerId: string | null;
  bauService: string;
  frequency: BenefitMeasure["frequency"];
  nextReviewDate: string | null;
  postImplementationReviewDate: string | null;
  confirmedById: string | null;
  confirmedDate: string;
  lastSeen: string | null;
}

/** One handover row per benefit: insert the first time, update after that. */
export async function saveHandover(input: HandoverInput) {
  const fields = {
    bau_owner_id: input.bauOwnerId,
    bau_service: input.bauService.trim() || null,
    frequency: frequencyValue[input.frequency],
    next_review_date: input.nextReviewDate,
    post_implementation_review_date: input.postImplementationReviewDate,
    confirmed_by_id: input.confirmedById,
    confirmed_date: input.confirmedDate,
  };
  if (input.lastSeen)
    return updateRow("benefit_handovers", input.benefitId, fields, {
      context: "Saving the handover",
      lastSeen: input.lastSeen,
    });
  return insertRow(
    "benefit_handovers",
    { ...fields, benefit_id: input.benefitId },
    "Saving the handover",
  );
}

export interface BenefitInput {
  title?: string;
  type?: Benefit["type"];
  status?: Benefit["status"];
  confidence?: Benefit["confidence"];
  classification?: Benefit["classification"];
  ownerId?: string | null;
  plannedTotalValue?: number;
}

/** Register edits by id (the board's column → field mapping lives in lib/benefit-board-data.ts). */
export async function updateBenefit(id: string, input: BenefitInput, lastSeen?: string | null) {
  const fields = {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.type !== undefined && {
      type: input.type === "Disbenefit" ? ("disbenefit" as const) : ("benefit" as const),
    }),
    ...(input.status !== undefined && { status: benefitStatusValue[input.status] }),
    ...(input.confidence !== undefined && { confidence: confidenceValue[input.confidence] }),
    ...(input.classification !== undefined && {
      classification: classificationValue[input.classification],
    }),
    ...(input.ownerId !== undefined && { owner_id: input.ownerId }),
    ...(input.plannedTotalValue !== undefined && { planned_total_value: input.plannedTotalValue }),
  };
  if (!Object.keys(fields).length) return;
  return updateRow("benefits", id, fields, { context: "Saving the benefit", lastSeen });
}

export async function createBenefit(input: {
  title: string;
  portfolioId: string;
  programmeId?: string | null;
  ownerId?: string | null;
  projectIds?: string[];
  categoryId: string;
  classification: Benefit["classification"];
}) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the benefit a title.");
  const written = await insertRow(
    "benefits",
    {
      title: input.title.trim(),
      portfolio_id: input.portfolioId,
      programme_id: input.programmeId ?? null,
      owner_id: input.ownerId ?? null,
      category_id: input.categoryId,
      classification: classificationValue[input.classification],
    },
    "Adding the benefit",
  );
  if (input.projectIds?.length)
    await insertRows(
      "benefit_projects",
      input.projectIds.map((projectId) => ({
        benefit_id: written.id,
        project_id: projectId,
        attribution_percent: 100,
      })),
      "Linking the benefit to its projects",
    );
  return written;
}

/** Managers only (RLS). Measures, links and records cascade; the audit log keeps the row. */
export async function deleteBenefits(ids: string[]) {
  await deleteRows("benefits", ids, "Deleting benefits");
}
