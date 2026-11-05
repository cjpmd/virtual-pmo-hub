// Default exception rule set (spec §7.3) and default tolerances per forum type. Seeded into the
// system templates and new forums; nothing renders from these directly once saved.
import type { SelectionRuleSet, Tolerances } from "./evaluateRules";

export const DEFAULT_EXCEPTION_RULES: SelectionRuleSet = {
  mode: "any",
  orderBy: "severity",
  rules: [
    {
      id: "evidenced_red",
      label: "Evidenced red",
      metric: "evidenced_rating",
      op: "=",
      value: "red",
      severity: 3,
      enabled: true,
    },
    {
      id: "worsened",
      label: "Worsened since last report",
      metric: "rating_worsened",
      op: "=",
      value: true,
      severity: 2,
      enabled: true,
    },
    {
      id: "divergence",
      label: "Report better than evidence",
      metric: "divergence_days",
      op: ">",
      value: 14,
      useForumTolerance: true,
      severity: 2,
      enabled: true,
    },
    {
      id: "slip",
      label: "Schedule slip beyond tolerance",
      metric: "max_milestone_slip_days",
      op: ">",
      value: 14,
      useForumTolerance: true,
      severity: 2,
      enabled: true,
    },
    {
      id: "budget",
      label: "Budget variance beyond tolerance",
      metric: "budget_variance_pct",
      op: ">",
      value: 5,
      useForumTolerance: true,
      severity: 2,
      enabled: true,
    },
    {
      id: "decision",
      label: "Decision required from this forum",
      metric: "open_decisions_for_forum",
      op: ">",
      value: 0,
      severity: 1,
      enabled: true,
    },
    {
      id: "escalated",
      label: "Escalated to this forum",
      metric: "escalations_for_forum",
      op: ">",
      value: 0,
      severity: 3,
      enabled: true,
    },
    {
      id: "gate",
      label: "Stage gate due",
      metric: "days_to_next_gate",
      op: "<=",
      value: 30,
      useForumTolerance: true,
      severity: 1,
      enabled: true,
    },
  ],
};

export type ForumType =
  "project_board" | "programme_board" | "portfolio_board" | "committee" | "custom";

export const FORUM_TYPE_LABEL: Record<ForumType, string> = {
  project_board: "Project board",
  programme_board: "Programme board",
  portfolio_board: "Portfolio board",
  committee: "Committee",
  custom: "Custom",
};

/** Portfolio-level forums are looser on minor slips so fewer projects reach them (§7.3). */
export const DEFAULT_TOLERANCES: Record<ForumType, Tolerances> = {
  project_board: {
    divergence_days: { op: ">", value: 14 },
    max_milestone_slip_days: { op: ">", value: 7 },
    budget_variance_pct: { op: ">", value: 5 },
    days_to_next_gate: { op: "<=", value: 30 },
  },
  programme_board: {
    divergence_days: { op: ">", value: 14 },
    max_milestone_slip_days: { op: ">", value: 14 },
    budget_variance_pct: { op: ">", value: 5 },
    days_to_next_gate: { op: "<=", value: 30 },
  },
  portfolio_board: {
    divergence_days: { op: ">", value: 14 },
    max_milestone_slip_days: { op: ">", value: 30 },
    budget_variance_pct: { op: ">", value: 10 },
    days_to_next_gate: { op: "<=", value: 30 },
  },
  committee: {
    divergence_days: { op: ">", value: 14 },
    max_milestone_slip_days: { op: ">", value: 30 },
    budget_variance_pct: { op: ">", value: 10 },
    days_to_next_gate: { op: "<=", value: 30 },
  },
  custom: {
    divergence_days: { op: ">", value: 14 },
    max_milestone_slip_days: { op: ">", value: 14 },
    budget_variance_pct: { op: ">", value: 5 },
    days_to_next_gate: { op: "<=", value: 30 },
  },
};
