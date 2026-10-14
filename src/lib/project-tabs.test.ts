import { describe, expect, test } from "vitest";
import { phaseLabel, resolveProjectTab } from "./project-tabs";

describe("resolveProjectTab", () => {
  test("defaults to Overview", () => {
    expect(resolveProjectTab({})).toEqual({ tab: "overview", sub: undefined });
  });

  test("reads ?tab=&sub=", () => {
    expect(resolveProjectTab({ tab: "raid", sub: "lessons" })).toEqual({
      tab: "raid",
      sub: "lessons",
    });
    expect(resolveProjectTab({ tab: "financials" })).toEqual({ tab: "financials", sub: undefined });
  });

  test("grouped tab without a sub opens its first sub-tab", () => {
    expect(resolveProjectTab({ tab: "plan" })).toEqual({ tab: "plan", sub: "milestones" });
    expect(resolveProjectTab({ tab: "raid", sub: "nonsense" })).toEqual({
      tab: "raid",
      sub: "risks",
    });
  });

  test("maps the old tab names", () => {
    expect(resolveProjectTab({ tab: "milestones" })).toEqual({ tab: "plan", sub: "milestones" });
    expect(resolveProjectTab({ tab: "tasks" })).toEqual({ tab: "plan", sub: "tasks" });
    expect(resolveProjectTab({ tab: "plan", sub: "gates" })).toEqual({ tab: "plan", sub: "gates" });
    expect(resolveProjectTab({ tab: "dependencies" })).toEqual({
      tab: "plan",
      sub: "dependencies",
    });
    expect(resolveProjectTab({ tab: "decisions" })).toEqual({ tab: "raid", sub: "decisions" });
    expect(resolveProjectTab({ tab: "changes" })).toEqual({ tab: "raid", sub: "changes" });
    expect(resolveProjectTab({ tab: "business case" })).toEqual({
      tab: "business-case",
      sub: undefined,
    });
  });

  test("?task=<id> opens Plan › Tasks", () => {
    expect(resolveProjectTab({ task: "abc" })).toEqual({ tab: "plan", sub: "tasks" });
  });

  test("unknown tab falls back to Overview", () => {
    expect(resolveProjectTab({ tab: "nope" })).toEqual({ tab: "overview", sub: undefined });
  });
});

describe("phaseLabel", () => {
  test("strips the Phase N prefix", () => {
    expect(phaseLabel("Phase 3 - Design & Procure")).toBe("Design & Procure");
    expect(phaseLabel("Close")).toBe("Close");
  });
});
