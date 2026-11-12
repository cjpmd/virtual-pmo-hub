// "Rules changed: refresh" in the Selection panel (GL-12). The hint used to compare only the set
// of matching projects, so a threshold edit that kept the same projects (or changed only why they
// match) never showed it. The selection is now stale whenever the rules differ from those it was
// computed with, by either of two checks:
// 1. the rules differ from the ones in force when the panel last received the saved selection
//    (the baseline is taken whenever the inclusions are loaded or refreshed); and
// 2. the saved rule-based inclusions differ from the preview: other projects, or other reasons
//    (rule, operator or threshold). This one also works after a reload, when the rules were
//    saved but the selection was never refreshed.
import {
  thresholdFor,
  type InclusionReason,
  type SelectionRuleSet,
  type Tolerances,
} from "./evaluateRules";

/** The parts of a rule set that change the selection, as a comparable string. */
export function ruleSetKey(ruleSet: SelectionRuleSet, tolerances: Tolerances = {}): string {
  return JSON.stringify({
    mode: ruleSet.mode,
    max: ruleSet.maxAutoIncluded ?? null,
    orderBy: ruleSet.orderBy ?? null,
    rules: (ruleSet.rules ?? [])
      .filter((rule) => rule.enabled !== false)
      .map((rule) => ({
        id: rule.id,
        metric: rule.metric,
        op: rule.op,
        threshold: thresholdFor(rule, tolerances) ?? null,
        severity: rule.severity,
      })),
  });
}

interface SelectedRow {
  projectId: string;
  mode: string;
  reasons: InclusionReason[];
}

const reasonsKey = (reasons: InclusionReason[]) =>
  reasons
    .map((r) => JSON.stringify([r.ruleId, r.metric, r.op, r.threshold ?? null]))
    .sort()
    .join("|");

/** The rule-based rows (not pinned or excluded), keyed by project with their reasons. */
export function ruleRowsKey(rows: SelectedRow[]): string {
  return rows
    .filter((row) => row.mode === "rule")
    .map((row) => `${row.projectId}:${reasonsKey(row.reasons ?? [])}`)
    .sort()
    .join("\n");
}

export function selectionIsStale({
  saved,
  preview,
  rulesKey,
  baselineRulesKey,
}: {
  /** The saved selection; null in template mode (never stale). */
  saved: SelectedRow[] | null;
  /** The TS rule engine's result for the current rules. */
  preview: SelectedRow[];
  /** ruleSetKey of the current rules. */
  rulesKey: string;
  /** ruleSetKey of the rules when the saved selection was loaded; null if not known. */
  baselineRulesKey: string | null;
}): boolean {
  if (saved === null) return false;
  if (baselineRulesKey !== null && baselineRulesKey !== rulesKey) return true;
  return ruleRowsKey(saved) !== ruleRowsKey(preview);
}
