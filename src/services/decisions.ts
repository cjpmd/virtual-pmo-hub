import { assumptions, decisionForums, decisions } from "@/data/decisions-data";
import type { Assumption, Decision, DecisionForum } from "@/data/types";
import { getProgramme, getProject } from "@/services/pmo";

const parseDate = (value: string) => { const [d = 1, m = 1, y = 1970] = value.split("/").map(Number); return new Date(y, m - 1, d); };
const today = parseDate("21/09/2026");
const days = (value: string) => Math.round((parseDate(value).getTime() - today.getTime()) / 86400000);

export const getDecisionForums = () => decisionForums;

export interface ResolvedDecision extends Decision {
  ownerLabel: string; scopeName: string; programmeName: string; overdue: boolean; daysToNeededBy: number;
  latencyDays: number | undefined; chosenOption: string; impactSummary: string; openActions: number;
}
export function getDecisions(): ResolvedDecision[] {
  return decisions.map(decision => {
    const project = decision.projectId ? getProject(decision.projectId) : undefined;
    const programme = getProgramme(decision.programmeId ?? project?.programmeId ?? "");
    const latency = decision.decisionDate ? Math.round((parseDate(decision.decisionDate).getTime() - parseDate(decision.neededBy).getTime()) / 86400000) : undefined;
    const impacted = (["scope", "cost", "time", "benefits"] as const).filter(key => decision.impact[key].impacted);
    return {
      ...decision,
      ownerLabel: decision.decisionMaker,
      scopeName: project?.name ?? programme?.name ?? "Portfolio",
      programmeName: programme?.name ?? "Portfolio",
      overdue: decision.status === "Pending" && days(decision.neededBy) < 0,
      daysToNeededBy: days(decision.neededBy),
      ...(latency === undefined ? { latencyDays: undefined } : { latencyDays: latency }),
      chosenOption: decision.options.find(option => option.id === decision.chosenOptionId)?.title ?? "—",
      impactSummary: impacted.length ? impacted.map(key => key[0]?.toUpperCase() + key.slice(1)).join(", ") : "None",
      openActions: decision.actions.filter(action => action.status !== "Done").length,
    };
  });
}
export const getDecision = (id: string) => getDecisions().find(item => item.id === id);

export function getDecisionMetrics(items = getDecisions()) {
  const made = items.filter(item => item.status === "Made" && item.decisionDate);
  const latencies = made.map(item => item.latencyDays).filter((value): value is number => value !== undefined);
  const madeLast30 = made.filter(item => item.decisionDate && days(item.decisionDate) >= -30);
  return {
    pending: items.filter(item => item.status === "Pending").length,
    overdue: items.filter(item => item.overdue).length,
    averageLatencyDays: latencies.length ? Math.round((latencies.reduce((sum, value) => sum + value, 0) / latencies.length) * 10) / 10 : 0,
    madeLast30: madeLast30.length,
    superseded: items.filter(item => item.status === "Superseded").length,
  };
}

export const madeThisMonth = (decision: ResolvedDecision) => {
  if (!decision.decisionDate) return false;
  const date = parseDate(decision.decisionDate);
  return date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
};
export const madeSince = (decision: ResolvedDecision, since: string) => Boolean(decision.decisionDate && parseDate(decision.decisionDate) >= parseDate(since));

/** Pending decisions for a forum, used to build the meeting agenda. */
export function getForumAgenda(forum: DecisionForum, items = getDecisions()) {
  const pending = items.filter(item => item.forum === forum && item.status === "Pending").sort((a, b) => a.daysToNeededBy - b.daysToNeededBy);
  const recent = items.filter(item => item.forum === forum && item.status !== "Pending" && item.decisionDate).sort((a, b) => parseDate(b.decisionDate ?? "").getTime() - parseDate(a.decisionDate ?? "").getTime()).slice(0, 5);
  return { pending, recent, overdue: pending.filter(item => item.overdue) };
}

export function getDecisionsFor(scope: { projectId?: string; programmeId?: string }, items = getDecisions()) {
  return items.filter(item => {
    if (scope.projectId && item.projectId === scope.projectId) return true;
    if (!scope.programmeId) return false;
    if (item.programmeId === scope.programmeId) return true;
    return Boolean(item.projectId && getProject(item.projectId)?.programmeId === scope.programmeId);
  });
}

// ---- Assumptions ----
export interface ResolvedAssumption extends Assumption { scopeName: string; overdue: boolean; daysToValidation: number }
export function getAssumptions(): ResolvedAssumption[] {
  return assumptions.map(assumption => {
    const project = assumption.projectId ? getProject(assumption.projectId) : undefined;
    const programme = getProgramme(assumption.programmeId ?? project?.programmeId ?? "");
    return {
      ...assumption,
      scopeName: project?.name ?? programme?.name ?? "Portfolio",
      overdue: assumption.status === "Open" && days(assumption.validationDate) < 0,
      daysToValidation: days(assumption.validationDate),
    };
  });
}
export function getAssumptionsFor(scope: { projectId?: string; programmeId?: string }, items = getAssumptions()) {
  return items.filter(item => {
    if (scope.projectId && item.projectId === scope.projectId) return true;
    if (!scope.programmeId) return false;
    if (item.programmeId === scope.programmeId) return true;
    return Boolean(item.projectId && getProject(item.projectId)?.programmeId === scope.programmeId);
  });
}
export function getAssumptionMetrics(items = getAssumptions()) {
  return {
    open: items.filter(item => item.status === "Open").length,
    validated: items.filter(item => item.status === "Validated").length,
    invalidated: items.filter(item => item.status === "Invalidated").length,
    overdue: items.filter(item => item.overdue).length,
  };
}

/** A decision that has been made is read-only; changing it creates a superseding decision. */
export const isDecisionReadOnly = (decision: Decision) => decision.status !== "Pending";
export const nextDecisionReference = () => `DEC-${String(decisions.length + 1).padStart(3, "0")}`;
