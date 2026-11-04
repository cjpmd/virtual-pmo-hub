import { describe, expect, it } from "vitest";
import { diffProjects, sinceCounts, toMovement, type ChangesData } from "./diff";

const project = (
  id: string,
  prev: Record<string, unknown> | null,
  curr: Record<string, unknown> | null,
  inc: [boolean, boolean] = [false, false],
) => ({
  id,
  code: id.toUpperCase(),
  name: `Project ${id}`,
  prev,
  curr,
  prev_included: inc[0],
  curr_included: inc[1],
});

const data: ChangesData = {
  previous: {
    id: "r1",
    title: "Last pack",
    as_at: "2026-10-01",
    published_at: "2026-10-02T10:00:00Z",
  },
  projects: [
    project(
      "a",
      {
        evidenced_rating: "green",
        declared_rating: "green",
        max_milestone_slip_days: 5,
        eac: 100,
        risks_in_top_band: 0,
      },
      {
        evidenced_rating: "amber",
        declared_rating: "green",
        max_milestone_slip_days: 40,
        eac: 130,
        risks_in_top_band: 1,
      },
      [false, true],
    ),
    project(
      "b",
      { evidenced_rating: "red", declared_rating: "amber", max_milestone_slip_days: 20, eac: 100 },
      {
        evidenced_rating: "green",
        declared_rating: "green",
        max_milestone_slip_days: 15,
        eac: 100,
      },
      [true, false],
    ),
    project("c", null, { evidenced_rating: "green" }),
    project(
      "d",
      { evidenced_rating: "green", max_milestone_slip_days: 0, eac: 50 },
      { evidenced_rating: "not_set", max_milestone_slip_days: 3, eac: 50 },
    ),
  ],
};

describe("diffProjects", () => {
  const changes = diffProjects(data);
  const kinds = (id: string) =>
    changes
      .filter((c) => c.projectId === id)
      .map((c) => c.kind)
      .sort();
  it("rating moves both ways", () => {
    expect(kinds("a")).toContain("rating_worse");
    expect(kinds("b")).toContain("rating_better");
  });
  it("declared changes", () => {
    expect(kinds("b")).toContain("declared_changed");
    expect(kinds("a")).not.toContain("declared_changed");
  });
  it("projects entering and leaving the exception list", () => {
    expect(kinds("a")).toContain("entered_exceptions");
    expect(kinds("b")).toContain("left_exceptions");
  });
  it("slip changes only over 7 days", () => {
    expect(kinds("a")).toContain("slip_increased");
    expect(kinds("b")).not.toContain("slip_reduced");
    expect(kinds("d")).not.toContain("slip_increased");
    expect(
      diffProjects(data, { slipDays: 2 }).some(
        (c) => c.projectId === "b" && c.kind === "slip_reduced",
      ),
    ).toBe(true);
  });
  it("budget movement over a threshold", () => {
    expect(kinds("a")).toContain("budget_moved");
    expect(diffProjects(data, { budgetAmount: 50 }).some((c) => c.kind === "budget_moved")).toBe(
      false,
    );
  });
  it("new top-band risks", () => {
    expect(kinds("a")).toContain("top_band_risks_up");
  });
  it("new projects and not-set ratings", () => {
    expect(kinds("c")).toEqual(["new_project"]);
    expect(kinds("d")).toEqual([]);
  });
  it("no previous pack, no changes", () => {
    expect(diffProjects({ previous: null })).toEqual([]);
  });
  it("uses the scheme's labels and money format", () => {
    const text = diffProjects(
      data,
      {},
      (r) => `[${r}]`,
      (n) => `£${n}`,
    ).map((c) => c.text);
    expect(text).toContain("Evidenced [green] → [amber]");
    expect(text).toContain("Forecast at completion up £30");
  });
});

describe("toMovement", () => {
  it("marks moved ratings and figures", () => {
    const m = toMovement(data);
    expect(m["a"]).toEqual({
      evidenced: { from: "green", to: "amber" },
      eacChange: 30,
      slipChange: 35,
    });
    expect(m["b"]?.declared).toEqual({ from: "amber", to: "green" });
    expect(m["c"]).toBeUndefined();
  });
  it("handles missing data", () => {
    expect(toMovement(null)).toEqual({});
  });
});

describe("changes since last: counts and slip wording", () => {
  it("uses the singular for one", () => {
    expect(sinceCounts({ decisions_made: 1, actions_closed: 1, actions_overdue: 1 })).toBe(
      " 1 decision made, 1 action closed, 1 action overdue.",
    );
    expect(sinceCounts({ decisions_made: 0, actions_closed: 2, actions_overdue: 3 })).toBe(
      " 0 decisions made, 2 actions closed, 3 actions overdue.",
    );
    expect(sinceCounts({ decisions_made: 2 })).toBe(" 2 decisions made.");
    expect(sinceCounts({})).toBe("");
  });

  it("says day for a one-day slip", () => {
    const data = {
      previous: { id: "r0", title: "Previous", as_at: "2026-10-01", published_at: null },
      projects: [
        {
          id: "a",
          code: "A",
          name: "A",
          prev: { max_milestone_slip_days: 0 },
          curr: { max_milestone_slip_days: 1 },
          prev_included: false,
          curr_included: false,
        },
      ],
    } as unknown as ChangesData;
    const [change] = diffProjects(data, { slipDays: 0, budgetAmount: 0 }, String, String);
    expect(change?.text).toBe("Largest slip 0 → 1 day");
  });
});
