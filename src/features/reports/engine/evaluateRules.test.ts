import { describe, expect, it } from "vitest";
import cases from "./selection-cases.json";
import { DEFAULT_EXCEPTION_RULES } from "./defaults";
import {
  evaluateRules,
  ruleMatches,
  selectInclusions,
  thresholdFor,
  type ProjectMetrics,
  type SelectionRuleSet,
  type Tolerances,
} from "./evaluateRules";

type Case = {
  name: string;
  ruleSet: SelectionRuleSet;
  tolerances: Tolerances;
  projects: ProjectMetrics[];
  expected: Record<string, string[]>;
};

describe("evaluateRules — shared cases (same file as the SQL parity test)", () => {
  for (const c of cases as unknown as Case[]) {
    it(c.name, () => {
      const result = evaluateRules(c.ruleSet, c.projects, c.tolerances);
      const actual = Object.fromEntries(
        result.map((match) => [match.projectId, match.reasons.map((reason) => reason.ruleId)]),
      );
      expect(actual).toEqual(c.expected);
    });
  }
});

describe("ruleMatches", () => {
  it("never matches a missing value", () => {
    expect(ruleMatches(null, ">", 1)).toBe(false);
    expect(ruleMatches(undefined, "=", "red")).toBe(false);
    expect(ruleMatches(5, ">", null)).toBe(false);
  });
  it("compares numbers against numeric strings", () => {
    expect(ruleMatches(15, ">", "14")).toBe(true);
    expect(ruleMatches(14, ">", "14")).toBe(false);
  });
  it("compares text case-insensitively", () => {
    expect(ruleMatches("Red", "=", "red")).toBe(true);
    expect(ruleMatches("red", "!=", "amber")).toBe(true);
    expect(ruleMatches("red", ">", "amber")).toBe(false);
  });
  it("worse_than uses RAG rank and ignores not_set", () => {
    expect(ruleMatches("red", "worse_than", "amber")).toBe(true);
    expect(ruleMatches("amber", "worse_than", "amber")).toBe(false);
    expect(ruleMatches("not_set", "worse_than", "green")).toBe(false);
  });
});

describe("thresholdFor", () => {
  const rule = DEFAULT_EXCEPTION_RULES.rules.find((r) => r.id === "slip")!;
  it("uses the forum tolerance when asked", () => {
    expect(thresholdFor(rule, { max_milestone_slip_days: { op: ">", value: 30 } })).toBe(30);
    expect(thresholdFor(rule, { max_milestone_slip_days: 21 })).toBe(21);
  });
  it("falls back to the rule value", () => {
    expect(thresholdFor(rule, {})).toBe(14);
    expect(
      thresholdFor({ ...rule, useForumTolerance: false }, { max_milestone_slip_days: 30 }),
    ).toBe(14);
  });
});

const project = (id: string, name: string, metrics: Record<string, unknown>, programme = "P") => ({
  projectId: id,
  name,
  programme,
  metrics,
});

describe("selectInclusions — capping and overrides", () => {
  const projects = [
    project("a", "Alpha", { evidenced_rating: "red", budget_variance_pct: 20 }),
    project("b", "Bravo", { evidenced_rating: "amber", budget_variance_pct: 9 }),
    project("c", "Charlie", { evidenced_rating: "red" }),
    project("d", "Delta", { evidenced_rating: "green" }),
  ];
  const rules: SelectionRuleSet = {
    mode: "any",
    rules: [
      {
        id: "red",
        label: "Red",
        metric: "evidenced_rating",
        op: "=",
        value: "red",
        severity: 3,
        enabled: true,
      },
      {
        id: "budget",
        label: "Budget",
        metric: "budget_variance_pct",
        op: ">",
        value: 5,
        severity: 2,
        enabled: true,
      },
    ],
  };

  it("orders by severity, then number of reasons, then name", () => {
    expect(selectInclusions(rules, projects).map((i) => i.projectId)).toEqual(["a", "c", "b"]);
  });

  it("caps automatic inclusions by severity", () => {
    const capped = selectInclusions({ ...rules, maxAutoIncluded: 2 }, projects);
    expect(capped.map((i) => i.projectId)).toEqual(["a", "c"]);
  });

  it("pins and excludes", () => {
    const result = selectInclusions(rules, projects, {}, [
      { projectId: "d", mode: "pinned" },
      { projectId: "a", mode: "excluded" },
    ]);
    const byId = Object.fromEntries(result.map((i) => [i.projectId, i]));
    expect(byId["d"]?.mode).toBe("pinned");
    expect(byId["a"]?.mode).toBe("excluded");
    // Excluded keeps its would-be reasons so the panel can say what it would have matched.
    expect(byId["a"]?.reasons.map((r) => r.ruleId)).toEqual(["red", "budget"]);
    expect(result.filter((i) => i.mode === "rule").map((i) => i.projectId)).toEqual(["c", "b"]);
  });

  it("a pinned project doesn't count toward the cap", () => {
    const result = selectInclusions({ ...rules, maxAutoIncluded: 1 }, projects, {}, [
      { projectId: "c", mode: "pinned" },
    ]);
    expect(result.map((i) => `${i.projectId}:${i.mode}`).sort()).toEqual(["a:rule", "c:pinned"]);
  });

  it("orders by programme then name", () => {
    const mixed = [
      project("x", "Zulu", { evidenced_rating: "red" }, "A"),
      project("y", "Yankee", { evidenced_rating: "red" }, "B"),
      project("z", "Xray", { evidenced_rating: "red" }, "B"),
    ];
    expect(
      selectInclusions({ ...rules, orderBy: "programme" }, mixed).map((i) => i.projectId),
    ).toEqual(["x", "z", "y"]);
  });

  it("the default exception set covers every §7.3 rule", () => {
    expect(DEFAULT_EXCEPTION_RULES.rules.map((r) => r.metric)).toEqual([
      "evidenced_rating",
      "rating_worsened",
      "divergence_days",
      "max_milestone_slip_days",
      "budget_variance_pct",
      "open_decisions_for_forum",
      "escalations_for_forum",
      "days_to_next_gate",
    ]);
  });
});
