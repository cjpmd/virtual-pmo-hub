// Benefit value: pure shaping over data from services/benefits.ts. Realised value, variance,
// overdue measurements and health are read from the database views (BenefitView.realisation and
// .periodValues); these helpers only filter, sum, sort and project them for charts.
import type {
  BenefitClassification,
  DraftBenefitProfile,
  OptimismBiasSetting,
  ProjectRequest,
} from "@/data/types";
import { getOptimismBias, optimismBiasFor } from "@/data/settings";
import { formatCurrency, formatNumber, parseDate } from "@/lib/format";
import { today } from "@/lib/today";
import type {
  BenefitPeriod,
  BenefitProjectRef,
  BenefitsData,
  BenefitView,
  MeasureView,
  MeasurementView,
} from "./benefits";

const DAY = 86_400_000;
const daysFromToday = (value: string) =>
  Math.round(((parseDate(value)?.getTime() ?? today().getTime()) - today().getTime()) / DAY);

export const projectsById = (data: Pick<BenefitsData, "projects">) =>
  new Map(data.projects.map((project) => [project.id, project]));

export interface BenefitFilter {
  programmeId?: string;
  objectiveId?: string;
  classification?: BenefitClassification;
  benefitId?: string;
}

export function filterBenefits(data: BenefitsData, filter: BenefitFilter = {}): BenefitView[] {
  const projects = projectsById(data);
  return data.benefits.filter((benefit) => {
    if (filter.benefitId && benefit.id !== filter.benefitId) return false;
    if (filter.classification && benefit.classification !== filter.classification) return false;
    if (filter.objectiveId && !benefit.strategicObjectiveIds.includes(filter.objectiveId))
      return false;
    if (filter.programmeId) {
      const programmeIds = benefit.enablingProjects.map(
        (link) => projects.get(link.projectId)?.programmeId,
      );
      if (benefit.programmeId !== filter.programmeId && !programmeIds.includes(filter.programmeId))
        return false;
    }
    return true;
  });
}

export const benefitsForProject = (data: BenefitsData, projectId: string) =>
  data.benefits.filter((benefit) =>
    benefit.enablingProjects.some((link) => link.projectId === projectId),
  );
export const benefitsForProgramme = (data: BenefitsData, programmeId: string) =>
  filterBenefits(data, { programmeId });

const confidenceFactor = (confidence: BenefitView["confidence"]) =>
  confidence === "Low" ? 0.6 : confidence === "Medium" ? 0.85 : 1;

/**
 * Cumulative planned, actual and forecast value per profile period for one benefit. Planned and
 * actual fractions come from v_benefit_period_values; the forecast projects the remaining
 * profile from the latest evidence, scaled by confidence.
 */
export function getBenefitCurve(benefit: BenefitView, periods: BenefitPeriod[]) {
  const value = Math.abs(benefit.plannedTotalValue),
    factor = confidenceFactor(benefit.confidence);
  const byPeriod = new Map(benefit.periodValues.map((point) => [point.periodId, point]));
  const fractions = periods.map((period) => byPeriod.get(period.id));
  let lastActual = 0,
    lastActualIndex = -1;
  fractions.forEach((point, index) => {
    if (point?.actualFraction !== undefined) {
      lastActual = point.actualFraction;
      lastActualIndex = index;
    }
  });
  const plannedAtLastActual = fractions[lastActualIndex]?.plannedFraction ?? 0;
  return periods.map((period, index) => {
    const planned = fractions[index]?.plannedFraction ?? 0;
    const actual = fractions[index]?.actualFraction;
    const forecast =
      index <= lastActualIndex
        ? lastActual
        : lastActual + Math.max(0, planned - plannedAtLastActual) * factor;
    return {
      period: period.period,
      planned: Math.round(value * planned),
      actual: actual === undefined ? undefined : Math.round(value * actual),
      forecast: Math.round(value * forecast),
    };
  });
}

/** Cumulative planned, actual and forecast value across the profile periods (the S-curve). */
export function getPortfolioCurve(items: BenefitView[], periods: BenefitPeriod[]) {
  const curves = items.map((item) => getBenefitCurve(item, periods));
  return periods.map((period, index) => {
    const points = curves.map((curve) => curve[index]);
    const actuals = points.filter((point) => point?.actual !== undefined);
    return {
      period: period.period,
      planned: points.reduce((sum, point) => sum + (point?.planned ?? 0), 0),
      forecast: points.reduce((sum, point) => sum + (point?.forecast ?? 0), 0),
      ...(actuals.length
        ? { actual: points.reduce((sum, point) => sum + (point?.actual ?? 0), 0) }
        : {}),
    };
  });
}

/** Target against evidenced actual per period for one measure. */
export const getMeasureActualSeries = (measure: MeasureView) =>
  measure.targetProfile.map((target) => ({
    period: target.period,
    target: target.value,
    actual: [...measure.records]
      .reverse()
      .find((record) => record.period === target.period && record.status !== "Queried")
      ?.actualValue,
  }));

export interface MeasurementDue {
  benefit: BenefitView;
  measure: MeasureView;
  dueDate: string;
  daysOverdue: number;
  state: "Overdue" | "Due this month" | "Upcoming";
}
export function getMeasurementSchedule(items: BenefitView[]): MeasurementDue[] {
  const now = today();
  return items
    .flatMap((benefit) =>
      benefit.measures
        .filter((measure) => measure.nextDue)
        .map((measure) => {
          const difference = daysFromToday(measure.nextDue);
          const due = parseDate(measure.nextDue) ?? now;
          const sameMonth =
            due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
          const state: MeasurementDue["state"] =
            difference < 0 ? "Overdue" : sameMonth ? "Due this month" : "Upcoming";
          return {
            benefit,
            measure,
            dueDate: measure.nextDue,
            daysOverdue: Math.max(0, -difference),
            state,
          };
        }),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface ValidationQueueItem {
  benefit: BenefitView;
  measure: MeasureView;
  record: MeasurementView;
}
export function getValidationQueue(items: BenefitView[]): ValidationQueueItem[] {
  return items
    .flatMap((benefit) =>
      benefit.measures.flatMap((measure) =>
        measure.records
          .filter((record) => record.status !== "Validated")
          .map((record) => ({ benefit, measure, record })),
      ),
    )
    .sort((a, b) => (a.record.submittedDate ?? "").localeCompare(b.record.submittedDate ?? ""));
}

/** Benefits whose enabling projects have all closed but which are still being tracked. */
export function getBenefitsInRealisation(data: BenefitsData, items: BenefitView[]) {
  const projects = projectsById(data);
  return items
    .filter((benefit) => {
      if (!benefit.enablingProjects.length) return false;
      if (["Closed", "Not realised"].includes(benefit.status)) return false;
      return benefit.enablingProjects.every(
        (link) => projects.get(link.projectId)?.state === "Closed",
      );
    })
    .map((benefit) => ({
      benefit,
      projectNames: benefit.enablingProjects
        .map((link) => projects.get(link.projectId)?.name ?? "Unknown")
        .join(", "),
      bauOwner: benefit.handover?.bauOwner || "Not agreed",
      bauService: benefit.handover?.bauService || "—",
      nextReviewDate: benefit.handover?.nextReviewDate || "Not scheduled",
      postImplementationReviewDate:
        benefit.handover?.postImplementationReviewDate || "Not scheduled",
    }));
}

/** Register headline figures. Overdue and at-risk come from v_benefit_realisation. */
export function getBenefitMetrics(items: BenefitView[]) {
  const planned = items.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0);
  const realised = items.reduce((sum, item) => sum + Math.max(0, item.realisation.realised), 0);
  return {
    count: items.length,
    planned,
    realised,
    percent: planned ? Math.round((realised / planned) * 100) : 0,
    overdue: items.filter((item) => item.realisation.measurementOverdue).length,
    atRisk: items.filter((item) => item.realisation.health === "At Risk").length,
  };
}

/** Assurance warnings: over-attributed benefits (from the view) and measures claimed twice. */
export function getBenefitWarnings(items: BenefitView[]) {
  const warnings: string[] = [];
  const names = new Map<string, string[]>();
  for (const benefit of items) {
    if (benefit.realisation.attributionWarning)
      warnings.push(
        `${benefit.reference} attribution totals ${benefit.realisation.attributionTotal}%.`,
      );
    for (const measure of benefit.measures) {
      const key = measure.name.toLowerCase();
      names.set(key, [...(names.get(key) ?? []), benefit.reference]);
    }
  }
  for (const [name, refs] of names)
    if (refs.length > 1) warnings.push(`Measure “${name}” is claimed by ${refs.join(" and ")}.`);
  return warnings;
}

/**
 * Why a benefit's lifecycle is invalid, in words. The database decides whether it is valid
 * (v_benefit_realisation.lifecycle_valid feeds health); this only explains the rule.
 */
export function lifecycleMessages(benefit: BenefitView) {
  const messages: string[] = [];
  const progressed = [
    "Validated",
    "Planned",
    "In realisation",
    "Realised",
    "Partially realised",
    "Not realised",
    "Closed",
  ].includes(benefit.status);
  if (progressed && (!benefit.owner || !benefit.eligibilityConfirmed))
    messages.push("Validated requires a benefit owner and confirmed eligibility.");
  if (
    [
      "Planned",
      "In realisation",
      "Realised",
      "Partially realised",
      "Not realised",
      "Closed",
    ].includes(benefit.status) &&
    !benefit.measures.some((measure) => measure.baselineDate && measure.targetProfile.length)
  )
    messages.push("Planned requires a measure with a baseline and target profile.");
  if (
    ["Realised", "Partially realised"].includes(benefit.status) &&
    !benefit.reviews.some((review) => review.type === "Post-implementation review")
  )
    messages.push("Realised or Partially realised requires a post-implementation review.");
  return { valid: benefit.realisation.lifecycleValid, messages };
}

// ---- Value dashboard ------------------------------------------------------------------------

export function getValueMetrics(items: BenefitView[]) {
  const positive = items.filter((item) => item.type === "Benefit");
  const planned = positive.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0);
  const realised = positive.reduce((sum, item) => sum + Math.max(0, item.realisation.realised), 0);
  const cashReleasing = positive.filter((item) => item.classification === "Cash-releasing");
  return {
    planned,
    realised,
    percent: planned ? Math.round((realised / planned) * 100) : 0,
    cashReleasingRealised: cashReleasing.reduce(
      (sum, item) => sum + Math.max(0, item.realisation.realised),
      0,
    ),
    cashReleasingPlanned: cashReleasing.reduce(
      (sum, item) => sum + Math.max(0, item.plannedTotalValue),
      0,
    ),
    atRisk: items.filter((item) => item.confidence === "Low" || item.realisation.behindProfile)
      .length,
    measurementsOverdue: getMeasurementSchedule(items).filter((item) => item.state === "Overdue")
      .length,
    withoutOwner: items.filter((item) => !item.owner).length,
    disbenefitValue: items
      .filter((item) => item.type === "Disbenefit")
      .reduce((sum, item) => sum + Math.abs(item.plannedTotalValue), 0),
  };
}

export function getBenefitsByObjective(data: BenefitsData, items: BenefitView[]) {
  return data.objectives
    .map((objective) => {
      const linked = items.filter(
        (item) => item.type === "Benefit" && item.strategicObjectiveIds.includes(objective.id),
      );
      return {
        id: objective.id,
        name: objective.title,
        planned: linked.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0),
        realised: linked.reduce((sum, item) => sum + Math.max(0, item.realisation.realised), 0),
        count: linked.length,
      };
    })
    .sort((a, b) => b.planned - a.planned);
}

export function getClassificationSplit(items: BenefitView[]) {
  const classifications: BenefitClassification[] = [
    "Cash-releasing",
    "Non-cash-releasing",
    "Qualitative",
    "Societal",
  ];
  return classifications.map((classification) => {
    const linked = items.filter(
      (item) => item.type === "Benefit" && item.classification === classification,
    );
    return {
      name: classification,
      value: linked.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0),
      count: linked.length,
    };
  });
}

/** Whole-life cost against whole-life benefit per programme, with the benefit-cost ratio. */
export function getPortfolioReturn(data: BenefitsData, items: BenefitView[], portfolioId?: string) {
  return data.programmes
    .filter((programme) => !portfolioId || programme.portfolioId === portfolioId)
    .map((programme) => {
      const programmeProjects = data.projects.filter(
        (project) => project.programmeId === programme.id,
      );
      const projectIds = new Set(programmeProjects.map((project) => project.id));
      const linked = items.filter((item) =>
        item.enablingProjects.some((link) => projectIds.has(link.projectId)),
      );
      const cost = programmeProjects.reduce(
        (sum, project) => sum + Math.max(project.budget, project.forecast),
        0,
      );
      const benefit = linked.reduce((sum, item) => sum + item.plannedTotalValue, 0);
      const realised = linked.reduce((sum, item) => sum + item.realisation.realised, 0);
      return {
        id: programme.id,
        name: programme.name,
        cost,
        benefit,
        realised,
        ratio: cost ? Math.round((benefit / cost) * 100) / 100 : 0,
      };
    });
}

export interface AccuracyRow {
  name: string;
  planned: number;
  realised: number;
  accuracy: number;
  projects: number;
}
/** Planned against realised benefit for closed projects, to calibrate future business cases. */
export function getForecastingAccuracy(
  data: BenefitsData,
  groupBy: "category" | "manager",
  items: BenefitView[],
): AccuracyRow[] {
  const closed = data.projects.filter((project) => project.state === "Closed");
  const rows = new Map<string, { planned: number; realised: number; projects: Set<string> }>();
  for (const project of closed) {
    const linked = items.filter((item) =>
      item.enablingProjects.some((link) => link.projectId === project.id),
    );
    for (const benefit of linked) {
      const key = groupBy === "category" ? benefit.category : project.managerName;
      const current = rows.get(key) ?? { planned: 0, realised: 0, projects: new Set<string>() };
      current.planned += Math.max(0, benefit.plannedTotalValue);
      current.realised += Math.max(0, benefit.realisation.realised);
      current.projects.add(project.id);
      rows.set(key, current);
    }
  }
  return Array.from(rows.entries())
    .map(([name, row]) => ({
      name,
      planned: row.planned,
      realised: row.realised,
      accuracy: row.planned ? Math.round((row.realised / row.planned) * 100) : 0,
      projects: row.projects.size,
    }))
    .sort((a, b) => b.planned - a.planned);
}

export function getBenefitPerformance(items: BenefitView[]) {
  const scored = items
    .filter((item) => item.type === "Benefit")
    .map((item) => ({
      benefit: item,
      variance: item.realisation.variancePercent,
      percent: item.realisation.percent,
    }));
  return {
    behind: [...scored].sort((a, b) => a.variance - b.variance).slice(0, 5),
    ahead: [...scored].sort((a, b) => b.variance - a.variance).slice(0, 5),
  };
}

// ---- Business case appraisal ----------------------------------------------------------------

export interface AppraisalInput {
  drafts: DraftBenefitProfile[];
  wholeLifeCost: number;
  years: number;
  settings?: OptimismBiasSetting[];
}
export interface AppraisalResult {
  wholeLifeCost: number;
  rawBenefit: number;
  adjustedBenefit: number;
  rawRatio: number;
  adjustedRatio: number;
  rawPaybackYears: number | undefined;
  adjustedPaybackYears: number | undefined;
  lines: Array<{ draft: DraftBenefitProfile; raw: number; bias: number; adjusted: number }>;
}
export function appraise({
  drafts,
  wholeLifeCost,
  years,
  settings = getOptimismBias(),
}: AppraisalInput): AppraisalResult {
  const lines = drafts.map((draft) => {
    const raw = draft.annualValue * Math.min(draft.yearsCounted, years);
    const bias = optimismBiasFor(draft.category, settings);
    return { draft, raw, bias, adjusted: Math.round(raw * (1 - bias / 100)) };
  });
  const rawBenefit = lines.reduce((sum, line) => sum + line.raw, 0);
  const adjustedBenefit = lines.reduce((sum, line) => sum + line.adjusted, 0);
  const rawAnnual = drafts.reduce((sum, draft) => sum + draft.annualValue, 0);
  const adjustedAnnual = lines.reduce(
    (sum, line) => sum + line.draft.annualValue * (1 - line.bias / 100),
    0,
  );
  const payback = (annual: number) =>
    annual > 0 ? Math.round((wholeLifeCost / annual) * 10) / 10 : undefined;
  return {
    wholeLifeCost,
    rawBenefit,
    adjustedBenefit,
    rawRatio: wholeLifeCost ? Math.round((rawBenefit / wholeLifeCost) * 100) / 100 : 0,
    adjustedRatio: wholeLifeCost ? Math.round((adjustedBenefit / wholeLifeCost) * 100) / 100 : 0,
    rawPaybackYears: payback(rawAnnual),
    adjustedPaybackYears: payback(adjustedAnnual),
    lines,
  };
}
export function appraiseRequest(
  request: ProjectRequest,
  settings: OptimismBiasSetting[] = getOptimismBias(),
) {
  return appraise({
    drafts: request.draftBenefits ?? [],
    wholeLifeCost: request.wholeLifeCost ?? request.estimatedCost,
    years: request.appraisalYears ?? 5,
    settings,
  });
}
/** Prioritisation score: 60% adjusted value for money, 40% strategic alignment. */
export function scoreRequest(
  request: ProjectRequest,
  settings: OptimismBiasSetting[] = getOptimismBias(),
) {
  const appraisal = appraiseRequest(request, settings);
  const valueScore = Math.max(0, Math.min(100, Math.round((appraisal.adjustedRatio / 3) * 100)));
  return {
    ...appraisal,
    valueScore,
    alignmentScore: request.alignment,
    priorityScore: Math.round(valueScore * 0.6 + request.alignment * 0.4),
  };
}

// ---- Benefits handover ----------------------------------------------------------------------

export const getHandoverCandidates = (data: BenefitsData, projectId: string) =>
  benefitsForProject(data, projectId).filter(
    (item) => item.status !== "Closed" && item.status !== "Not realised",
  );

export function describeProgramme(data: BenefitsData, benefit: BenefitView) {
  const projects = projectsById(data);
  const programmes = new Map(data.programmes.map((programme) => [programme.id, programme.name]));
  const names = Array.from(
    new Set(
      benefit.enablingProjects.map(
        (link) => programmes.get(projects.get(link.projectId)?.programmeId ?? "") ?? "Unassigned",
      ),
    ),
  );
  return names.join(", ");
}

/** Turn confirmed benefit profiles into the draft shape the appraisal panel works with. */
export function draftsFromBenefits(items: BenefitView[]): DraftBenefitProfile[] {
  return items
    .filter((item) => item.type === "Benefit")
    .map((item) => {
      const measure = item.measures[0];
      const finalTarget = measure?.targetProfile[measure.targetProfile.length - 1]?.value;
      return {
        id: item.id,
        title: item.title,
        classification: item.classification,
        category: item.category,
        owner: item.owner || "Unassigned",
        measure: measure?.name ?? "No measure defined",
        baseline: measure
          ? measure.unit === "currency"
            ? formatCurrency(measure.baselineValue)
            : `${formatNumber(measure.baselineValue)} ${measure.unit}`
          : "—",
        target:
          finalTarget === undefined
            ? "—"
            : measure?.unit === "currency"
              ? formatCurrency(finalTarget)
              : `${formatNumber(finalTarget)} ${measure?.unit ?? ""}`.trim(),
        annualValue: Math.round(Math.max(0, item.plannedTotalValue) / 5),
        yearsCounted: 5,
        strategicObjectiveId: item.strategicObjectiveIds[0] ?? "",
      };
    });
}

export type { BenefitProjectRef };
