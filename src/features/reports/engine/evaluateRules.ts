// Selection rules (spec §7.2). The database is authoritative (private.evaluate_selection and
// private.compute_inclusions, used by "Refresh selection" and at publish); this pure mirror
// gives the selection panel an instant preview while thresholds are edited. Both run the
// cases in selection-cases.json (vitest and supabase/tests/reports_phase2.sql).
import type { RuleOp } from "./metrics";

export interface SelectionRule {
  id: string;
  label: string;
  metric: string;
  op: RuleOp;
  value?: number | string | boolean | string[];
  useForumTolerance?: boolean;
  /** 3 = most severe; used for ordering and capping. */
  severity: 1 | 2 | 3;
  enabled: boolean;
}

export interface SelectionRuleSet {
  mode: "any" | "all";
  rules: SelectionRule[];
  maxAutoIncluded?: number;
  orderBy?: "severity" | "programme" | "name" | "manual";
}

export type Tolerances = Record<string, { op?: RuleOp; value: number | string } | number | string>;

export interface ProjectMetrics {
  projectId: string;
  name: string;
  programme?: string | null;
  metrics: Record<string, unknown>;
  /** GL-9: sample projects are never included automatically, only by pinning. */
  isSample?: boolean;
}

export interface InclusionReason {
  ruleId: string;
  label: string;
  metric: string;
  op: RuleOp;
  value: unknown;
  threshold: unknown;
  severity: number;
}

export interface RuleMatch {
  projectId: string;
  name: string;
  reasons: InclusionReason[];
  severity: number;
}

export type InclusionMode = "rule" | "pinned" | "excluded";

export interface Override {
  projectId: string;
  mode: "pinned" | "excluded";
  by?: string | null;
}

export interface Inclusion {
  projectId: string;
  name: string;
  mode: InclusionMode;
  reasons: InclusionReason[];
  severity: number;
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const RAG_RANK: Record<string, number> = { green: 1, amber: 2, red: 3 };

const text = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/** Does a metric value satisfy op/threshold? Same rules as private.rule_matches. */
export function ruleMatches(value: unknown, op: RuleOp, threshold: unknown): boolean {
  if (value === null || value === undefined || threshold === null || threshold === undefined)
    return false;
  if (op === "in")
    return Array.isArray(threshold) && threshold.some((t) => text(t) === text(value));
  if (op === "worse_than") {
    const a = RAG_RANK[String(value)];
    const b = RAG_RANK[String(threshold)];
    return a !== undefined && b !== undefined && a > b;
  }
  if (typeof value === "number" && NUMBER.test(String(threshold))) {
    const t = Number(threshold);
    switch (op) {
      case ">":
        return value > t;
      case ">=":
        return value >= t;
      case "<":
        return value < t;
      case "<=":
        return value <= t;
      case "=":
        return value === t;
      case "!=":
        return value !== t;
    }
  }
  const a = text(value).toLowerCase();
  const b = text(threshold).toLowerCase();
  if (op === "=") return a === b;
  if (op === "!=") return a !== b;
  return false;
}

/** The threshold a rule uses: the forum tolerance when asked and present, else its own value. */
export function thresholdFor(rule: SelectionRule, tolerances: Tolerances = {}): unknown {
  if (rule.useForumTolerance && Object.prototype.hasOwnProperty.call(tolerances, rule.metric)) {
    const tolerance = tolerances[rule.metric];
    return tolerance !== null && typeof tolerance === "object" && "value" in tolerance
      ? tolerance.value
      : tolerance;
  }
  return rule.value;
}

/** Projects matching the rule set, with every matched rule as a reason (steps 1–3). */
export function evaluateRules(
  ruleSet: Partial<SelectionRuleSet> | null | undefined,
  projects: ProjectMetrics[],
  tolerances: Tolerances = {},
): RuleMatch[] {
  const rules = (ruleSet?.rules ?? []).filter((rule) => rule.enabled !== false);
  const mode = ruleSet?.mode ?? "any";
  const matches: Array<RuleMatch & { matched: number }> = [];
  for (const project of projects) {
    const reasons: InclusionReason[] = [];
    for (const rule of rules) {
      const threshold = thresholdFor(rule, tolerances);
      const value = project.metrics[rule.metric];
      if (ruleMatches(value, rule.op, threshold))
        reasons.push({
          ruleId: rule.id,
          label: rule.label,
          metric: rule.metric,
          op: rule.op,
          value,
          threshold,
          severity: rule.severity ?? 1,
        });
    }
    if (!reasons.length) continue;
    if (mode === "all" && reasons.length !== rules.length) continue;
    reasons.sort((a, b) => b.severity - a.severity || a.ruleId.localeCompare(b.ruleId));
    matches.push({
      projectId: project.projectId,
      name: project.name,
      reasons,
      severity: Math.max(...reasons.map((reason) => reason.severity)),
      matched: reasons.length,
    });
  }
  return matches.map(({ matched: _matched, ...match }) => match);
}

/**
 * Steps 4–5: cap rule matches by severity then number of reasons, then merge overrides.
 * Pinned are always included; excluded are dropped but keep their would-be reasons.
 * Sample projects (GL-9) never fill an automatic place, as in private.compute_inclusions.
 */
export function selectInclusions(
  ruleSet: Partial<SelectionRuleSet> | null | undefined,
  projects: ProjectMetrics[],
  tolerances: Tolerances = {},
  overrides: Override[] = [],
): Inclusion[] {
  const matches = evaluateRules(ruleSet, projects, tolerances);
  const byId = new Map(matches.map((match) => [match.projectId, match]));
  const overridden = new Map(overrides.map((override) => [override.projectId, override]));
  const sample = new Set(projects.filter((p) => p.isSample).map((p) => p.projectId));
  const ranked = matches
    .filter((match) => !overridden.has(match.projectId) && !sample.has(match.projectId))
    .sort(
      (a, b) =>
        b.severity - a.severity ||
        b.reasons.length - a.reasons.length ||
        a.name.localeCompare(b.name),
    );
  const cap = ruleSet?.maxAutoIncluded;
  const auto = cap === undefined || cap === null ? ranked : ranked.slice(0, cap);
  const names = new Map(projects.map((project) => [project.projectId, project.name]));
  const result: Inclusion[] = auto.map((match) => ({ ...match, mode: "rule" }));
  for (const override of overrides) {
    const match = byId.get(override.projectId);
    result.push({
      projectId: override.projectId,
      name: names.get(override.projectId) ?? match?.name ?? "",
      mode: override.mode,
      reasons: match?.reasons ?? [],
      severity: match?.severity ?? 0,
    });
  }
  return orderInclusions(result, ruleSet?.orderBy ?? "severity", projects);
}

function orderInclusions(
  inclusions: Inclusion[],
  orderBy: NonNullable<SelectionRuleSet["orderBy"]>,
  projects: ProjectMetrics[],
) {
  if (orderBy === "manual") return inclusions;
  const programme = new Map(projects.map((p) => [p.projectId, p.programme ?? ""]));
  return [...inclusions].sort((a, b) => {
    if (orderBy === "programme") {
      const byProgramme = (programme.get(a.projectId) ?? "").localeCompare(
        programme.get(b.projectId) ?? "",
      );
      if (byProgramme) return byProgramme;
    }
    if (orderBy === "severity")
      return (
        b.severity - a.severity ||
        b.reasons.length - a.reasons.length ||
        a.name.localeCompare(b.name)
      );
    return a.name.localeCompare(b.name);
  });
}
