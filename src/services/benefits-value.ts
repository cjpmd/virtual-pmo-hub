import type { Benefit, BenefitClassification, BenefitMeasure, DraftBenefitProfile, MeasurementRecord, OptimismBiasSetting, Project, ProjectRequest } from "@/data/types";
import { defaultOptimismBias, optimismBiasFor } from "@/data/settings";
import {
  benefitPeriods, getBenefitCurve, getBenefitPercent, getBenefitRealised, getBenefitVariance, getBenefits, getNextMeasurementDue,
  getProgramme, getProgrammes, getProject, getProjects, getStrategicObjectives, isBenefitBehindProfile, isMeasurementOverdue,
} from "@/services/pmo";

const parseDate = (value: string) => { const [d = 1, m = 1, y = 1970] = value.split("/").map(Number); return new Date(y, m - 1, d); };
const today = parseDate("21/09/2026");
const daysFromToday = (value: string) => Math.round((parseDate(value).getTime() - today.getTime()) / 86400000);

export interface BenefitFilter { programmeId?: string; objectiveId?: string; classification?: BenefitClassification; benefitId?: string }

export function filterBenefits(filter: BenefitFilter = {}, items = getBenefits()): Benefit[] {
  return items.filter(benefit => {
    if (filter.benefitId && benefit.id !== filter.benefitId) return false;
    if (filter.classification && benefit.classification !== filter.classification) return false;
    if (filter.objectiveId && !benefit.strategicObjectiveIds.includes(filter.objectiveId)) return false;
    if (filter.programmeId) {
      const programmeIds = benefit.enablingProjects.map(link => getProject(link.projectId)?.programmeId);
      if (!programmeIds.includes(filter.programmeId)) return false;
    }
    return true;
  });
}

/** Cumulative planned, actual and forecast value across the portfolio profile periods (the S-curve). */
export function getPortfolioCurve(items: Benefit[]) {
  const curves = items.map(getBenefitCurve);
  return benefitPeriods.map((period, index) => {
    const points = curves.map(curve => curve[index]);
    const actuals = points.filter(point => point?.actual !== undefined);
    return {
      period: period.period,
      planned: points.reduce((sum, point) => sum + (point?.planned ?? 0), 0),
      forecast: points.reduce((sum, point) => sum + (point?.forecast ?? 0), 0),
      ...(actuals.length ? { actual: points.reduce((sum, point) => sum + (point?.actual ?? 0), 0) } : {}),
    };
  });
}

export interface MeasurementDue { benefit: Benefit; measure: BenefitMeasure; dueDate: string; daysOverdue: number; state: "Overdue" | "Due this month" | "Upcoming" }
export function getMeasurementSchedule(items = getBenefits()): MeasurementDue[] {
  return items.flatMap(benefit => benefit.measures.map(measure => {
    const difference = daysFromToday(measure.nextDue);
    const due = parseDate(measure.nextDue);
    const sameMonth = due.getMonth() === today.getMonth() && due.getFullYear() === today.getFullYear();
    const state: MeasurementDue["state"] = difference < 0 ? "Overdue" : sameMonth ? "Due this month" : "Upcoming";
    return { benefit, measure, dueDate: measure.nextDue, daysOverdue: Math.max(0, -difference), state };
  })).sort((a, b) => parseDate(a.dueDate).getTime() - parseDate(b.dueDate).getTime());
}

export interface ValidationQueueItem { benefit: Benefit; measure: BenefitMeasure; record: MeasurementRecord }
export function getValidationQueue(items = getBenefits()): ValidationQueueItem[] {
  return items.flatMap(benefit => benefit.measures.flatMap(measure => measure.records.filter(record => record.status !== "Validated").map(record => ({ benefit, measure, record }))))
    .sort((a, b) => parseDate(a.record.submittedDate ?? "01/01/2026").getTime() - parseDate(b.record.submittedDate ?? "01/01/2026").getTime());
}

/** Benefits whose enabling projects have all closed but which are still being tracked. */
export function getBenefitsInRealisation(items = getBenefits()) {
  return items.filter(benefit => {
    if (!benefit.enablingProjects.length) return false;
    if (["Closed", "Not realised"].includes(benefit.status)) return false;
    return benefit.enablingProjects.every(link => getProject(link.projectId)?.state === "Closed");
  }).map(benefit => ({
    benefit,
    projectNames: benefit.enablingProjects.map(link => getProject(link.projectId)?.name ?? "Unknown").join(", "),
    bauOwner: benefit.handover?.bauOwner ?? "Not agreed",
    bauService: benefit.handover?.bauService ?? "—",
    nextReviewDate: benefit.handover?.nextReviewDate ?? "Not scheduled",
    postImplementationReviewDate: benefit.handover?.postImplementationReviewDate ?? "Not scheduled",
  }));
}

// ---- Value dashboard (Prompt H3) ----
export function getValueMetrics(items = getBenefits()) {
  const positive = items.filter(item => item.type === "Benefit");
  const planned = positive.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0);
  const realised = positive.reduce((sum, item) => sum + Math.max(0, getBenefitRealised(item)), 0);
  const cashReleasing = positive.filter(item => item.classification === "Cash-releasing");
  return {
    planned,
    realised,
    percent: planned ? Math.round((realised / planned) * 100) : 0,
    cashReleasingRealised: cashReleasing.reduce((sum, item) => sum + Math.max(0, getBenefitRealised(item)), 0),
    cashReleasingPlanned: cashReleasing.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0),
    atRisk: items.filter(item => item.confidence === "Low" || isBenefitBehindProfile(item)).length,
    measurementsOverdue: getMeasurementSchedule(items).filter(item => item.state === "Overdue").length,
    withoutOwner: items.filter(item => !item.owner).length,
    disbenefitValue: items.filter(item => item.type === "Disbenefit").reduce((sum, item) => sum + Math.abs(item.plannedTotalValue), 0),
  };
}

export function getBenefitsByObjective(items = getBenefits()) {
  return getStrategicObjectives().map(objective => {
    const linked = items.filter(item => item.type === "Benefit" && item.strategicObjectiveIds.includes(objective.id));
    return {
      id: objective.id,
      name: objective.title,
      planned: linked.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0),
      realised: linked.reduce((sum, item) => sum + Math.max(0, getBenefitRealised(item)), 0),
      count: linked.length,
    };
  }).sort((a, b) => b.planned - a.planned);
}

export function getClassificationSplit(items = getBenefits()) {
  const classifications: BenefitClassification[] = ["Cash-releasing", "Non-cash-releasing", "Qualitative", "Societal"];
  return classifications.map(classification => {
    const linked = items.filter(item => item.type === "Benefit" && item.classification === classification);
    return { name: classification, value: linked.reduce((sum, item) => sum + Math.max(0, item.plannedTotalValue), 0), count: linked.length };
  });
}

/** Whole-life cost against whole-life benefit per programme, with the benefit-cost ratio. */
export function getPortfolioReturn(items = getBenefits()) {
  return getProgrammes().map(programme => {
    const programmeProjects = getProjects(programme.id);
    const projectIds = new Set(programmeProjects.map(project => project.id));
    const linked = items.filter(item => item.enablingProjects.some(link => projectIds.has(link.projectId)));
    const cost = programmeProjects.reduce((sum, project) => sum + Math.max(project.budget, project.forecast), 0);
    const benefit = linked.reduce((sum, item) => sum + item.plannedTotalValue, 0);
    const realised = linked.reduce((sum, item) => sum + getBenefitRealised(item), 0);
    return { id: programme.id, name: programme.name, cost, benefit, realised, ratio: cost ? Math.round((benefit / cost) * 100) / 100 : 0 };
  });
}

export interface AccuracyRow { name: string; planned: number; realised: number; accuracy: number; projects: number }
/** Planned against realised benefit for closed projects, to calibrate future business cases. */
export function getForecastingAccuracy(groupBy: "category" | "manager", items = getBenefits()): AccuracyRow[] {
  const closed = getProjects().filter(project => project.state === "Closed");
  const rows = new Map<string, { planned: number; realised: number; projects: Set<string> }>();
  for (const project of closed) {
    const linked = items.filter(item => item.enablingProjects.some(link => link.projectId === project.id));
    for (const benefit of linked) {
      const key = groupBy === "category" ? benefit.category : project.manager;
      const current = rows.get(key) ?? { planned: 0, realised: 0, projects: new Set<string>() };
      current.planned += Math.max(0, benefit.plannedTotalValue);
      current.realised += Math.max(0, getBenefitRealised(benefit));
      current.projects.add(project.id);
      rows.set(key, current);
    }
  }
  return Array.from(rows.entries()).map(([name, row]) => ({ name, planned: row.planned, realised: row.realised, accuracy: row.planned ? Math.round((row.realised / row.planned) * 100) : 0, projects: row.projects.size })).sort((a, b) => b.planned - a.planned);
}

export function getBenefitPerformance(items = getBenefits()) {
  const scored = items.filter(item => item.type === "Benefit").map(item => ({ benefit: item, variance: getBenefitVariance(item).variancePercent, percent: getBenefitPercent(item) }));
  return {
    behind: [...scored].sort((a, b) => a.variance - b.variance).slice(0, 5),
    ahead: [...scored].sort((a, b) => b.variance - a.variance).slice(0, 5),
  };
}

// ---- Business case appraisal (Prompt H3) ----
export interface AppraisalInput { drafts: DraftBenefitProfile[]; wholeLifeCost: number; years: number; settings?: OptimismBiasSetting[] }
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
export function appraise({ drafts, wholeLifeCost, years, settings = defaultOptimismBias }: AppraisalInput): AppraisalResult {
  const lines = drafts.map(draft => {
    const raw = draft.annualValue * Math.min(draft.yearsCounted, years);
    const bias = optimismBiasFor(draft.category, settings);
    return { draft, raw, bias, adjusted: Math.round(raw * (1 - bias / 100)) };
  });
  const rawBenefit = lines.reduce((sum, line) => sum + line.raw, 0);
  const adjustedBenefit = lines.reduce((sum, line) => sum + line.adjusted, 0);
  const rawAnnual = drafts.reduce((sum, draft) => sum + draft.annualValue, 0);
  const adjustedAnnual = lines.reduce((sum, line) => sum + line.draft.annualValue * (1 - line.bias / 100), 0);
  const payback = (annual: number) => (annual > 0 ? Math.round((wholeLifeCost / annual) * 10) / 10 : undefined);
  const rawPayback = payback(rawAnnual);
  const adjustedPayback = payback(adjustedAnnual);
  return {
    wholeLifeCost, rawBenefit, adjustedBenefit,
    rawRatio: wholeLifeCost ? Math.round((rawBenefit / wholeLifeCost) * 100) / 100 : 0,
    adjustedRatio: wholeLifeCost ? Math.round((adjustedBenefit / wholeLifeCost) * 100) / 100 : 0,
    ...(rawPayback === undefined ? { rawPaybackYears: undefined } : { rawPaybackYears: rawPayback }),
    ...(adjustedPayback === undefined ? { adjustedPaybackYears: undefined } : { adjustedPaybackYears: adjustedPayback }),
    lines,
  };
}
export function appraiseRequest(request: ProjectRequest, settings: OptimismBiasSetting[] = defaultOptimismBias) {
  return appraise({ drafts: request.draftBenefits ?? [], wholeLifeCost: request.wholeLifeCost ?? request.estimatedCost, years: request.appraisalYears ?? 5, settings });
}
/** Prioritisation score: 60% adjusted value for money, 40% strategic alignment. */
export function scoreRequest(request: ProjectRequest, settings: OptimismBiasSetting[] = defaultOptimismBias) {
  const appraisal = appraiseRequest(request, settings);
  const valueScore = Math.max(0, Math.min(100, Math.round((appraisal.adjustedRatio / 3) * 100)));
  return { ...appraisal, valueScore, alignmentScore: request.alignment, priorityScore: Math.round(valueScore * 0.6 + request.alignment * 0.4) };
}

// ---- Benefits handover (Prompt H3) ----
export function getHandoverCandidates(project: Project, items = getBenefits()) {
  return items.filter(item => item.enablingProjects.some(link => link.projectId === project.id) && item.status !== "Closed" && item.status !== "Not realised");
}
export { getNextMeasurementDue, isMeasurementOverdue };
export const benefitProfilePeriods = benefitPeriods;
export function describeProgramme(benefit: Benefit) {
  const names = Array.from(new Set(benefit.enablingProjects.map(link => getProgramme(getProject(link.projectId)?.programmeId ?? "")?.name ?? "Unassigned")));
  return names.join(", ");
}

/** Turn confirmed benefit profiles into the draft shape the appraisal panel works with. */
export function draftsFromBenefits(items: Benefit[]): DraftBenefitProfile[] {
  return items.filter(item => item.type === "Benefit").map(item => {
    const measure = item.measures[0];
    const finalTarget = measure?.targetProfile[measure.targetProfile.length - 1]?.value;
    return {
      id: item.id,
      title: item.title,
      classification: item.classification,
      category: item.category,
      owner: item.owner || "Unassigned",
      measure: measure?.name ?? "No measure defined",
      baseline: measure ? `${measure.baselineValue.toLocaleString("en-GB")} ${measure.unit}` : "—",
      target: finalTarget === undefined ? "—" : `${finalTarget.toLocaleString("en-GB")} ${measure?.unit ?? ""}`.trim(),
      annualValue: Math.round(Math.max(0, item.plannedTotalValue) / 5),
      yearsCounted: 5,
      strategicObjectiveId: item.strategicObjectiveIds[0] ?? "",
    };
  });
}
