import { describe, expect, it } from "vitest";
import { selectInclusions, type SelectionRuleSet } from "./evaluateRules";
import { ruleSetKey, ruleRowsKey, selectionIsStale } from "./selectionStale";

const rules = (value: number, extra: Partial<SelectionRuleSet> = {}): SelectionRuleSet => ({
  mode: "any",
  rules: [
    {
      id: "r1",
      label: "Overspend",
      metric: "budget_variance_pct",
      op: ">",
      value,
      severity: 2,
      enabled: true,
    },
  ],
  ...extra,
});
const projects = [
  { projectId: "a", name: "A", metrics: { budget_variance_pct: 20 } },
  { projectId: "b", name: "B", metrics: { budget_variance_pct: 3 } },
];

describe("selectionIsStale", () => {
  const savedWith = (value: number) => selectInclusions(rules(value), projects, {}, []);

  it("is not stale when the rules are those the selection was computed with", () => {
    expect(
      selectionIsStale({
        saved: savedWith(10),
        preview: savedWith(10),
        rulesKey: ruleSetKey(rules(10)),
        baselineRulesKey: ruleSetKey(rules(10)),
      }),
    ).toBe(false);
  });

  it("is stale when only a threshold changed and the same projects still match", () => {
    // 10 → 15: A still matches, B still doesn't.
    const preview = savedWith(15);
    expect(preview.map((r) => r.projectId)).toEqual(savedWith(10).map((r) => r.projectId));
    expect(
      selectionIsStale({
        saved: savedWith(10),
        preview,
        rulesKey: ruleSetKey(rules(15)),
        baselineRulesKey: ruleSetKey(rules(10)),
      }),
    ).toBe(true);
  });

  it("is stale after a reload (no baseline) when the saved reasons carry the old threshold", () => {
    expect(
      selectionIsStale({
        saved: savedWith(10),
        preview: savedWith(15),
        rulesKey: ruleSetKey(rules(15)),
        baselineRulesKey: null,
      }),
    ).toBe(true);
  });

  it("is stale when a rule that matched nothing is changed in this session", () => {
    const withExtra = (value: number): SelectionRuleSet => ({
      ...rules(10),
      rules: [
        ...rules(10).rules,
        {
          id: "r2",
          label: "Late",
          metric: "days_late",
          op: ">",
          value,
          severity: 1,
          enabled: true,
        },
      ],
    });
    const saved = selectInclusions(withExtra(30), projects, {}, []);
    const preview = selectInclusions(withExtra(60), projects, {}, []);
    expect(ruleRowsKey(saved)).toBe(ruleRowsKey(preview));
    expect(
      selectionIsStale({
        saved,
        preview,
        rulesKey: ruleSetKey(withExtra(60)),
        baselineRulesKey: ruleSetKey(withExtra(30)),
      }),
    ).toBe(true);
  });

  it("is stale when the matching projects change (as before)", () => {
    expect(
      selectionIsStale({
        saved: savedWith(10),
        preview: savedWith(1),
        rulesKey: ruleSetKey(rules(1)),
        baselineRulesKey: null,
      }),
    ).toBe(true);
  });

  it("is never stale in template mode", () => {
    expect(
      selectionIsStale({
        saved: null,
        preview: savedWith(1),
        rulesKey: "x",
        baselineRulesKey: "y",
      }),
    ).toBe(false);
  });
});

describe("ruleSetKey", () => {
  it("ignores labels and disabled rules, and reads forum tolerances", () => {
    const base = rules(10);
    const relabelled = { ...base, rules: [{ ...base.rules[0]!, label: "Renamed" }] };
    expect(ruleSetKey(relabelled)).toBe(ruleSetKey(base));
    const disabled = { ...base, rules: [{ ...base.rules[0]!, enabled: false }] };
    expect(ruleSetKey(disabled)).not.toBe(ruleSetKey(base));
    const forum = { ...base, rules: [{ ...base.rules[0]!, useForumTolerance: true }] };
    expect(ruleSetKey(forum, { budget_variance_pct: 10 })).toBe(ruleSetKey(base));
    expect(ruleSetKey(forum, { budget_variance_pct: 12 })).not.toBe(ruleSetKey(base));
    expect(ruleSetKey({ ...base, maxAutoIncluded: 3 })).not.toBe(ruleSetKey(base));
  });
});
