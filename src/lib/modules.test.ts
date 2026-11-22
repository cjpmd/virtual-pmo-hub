import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import {
  MODULES,
  MODULE_KEYS,
  anyModuleEnabled,
  isModuleEnabled,
  isReportBlockEnabled,
  moduleName,
  moduleTerm,
  modulesSatisfied,
  templateModulesOn,
  toModuleMap,
} from "./modules";

const withModules = (
  enabled: AppSettings["modules"]["enabled"],
  pack: AppSettings["modules"]["pack"] = "general",
  terms: Record<string, string> = {},
): AppSettings => ({
  ...defaultSettings,
  modules: { enabled, pack },
  terminology: { terms: { ...defaultSettings.terminology.terms, ...terms } },
});

describe("module registry", () => {
  it("has one definition per key, in the same order as the SQL registry", () => {
    expect(MODULES.map((item) => item.key)).toEqual([...MODULE_KEYS]);
    const sql = readFileSync("supabase/migrations/20261122150000_nhs_0_modules.sql", "utf8");
    const keys = /select array\[([^\]]+)\]/.exec(sql)?.[1] ?? "";
    expect(keys.replace(/[\s']/g, "").split(",")).toEqual([...MODULE_KEYS]);
  });

  it("only recommends modules that exist", () => {
    for (const item of MODULES)
      for (const key of item.recommends) expect(MODULE_KEYS).toContain(key);
  });
});

describe("toModuleMap", () => {
  it("ignores unknown keys and treats anything but true as off", () => {
    expect(
      toModuleMap({ efficiency: true, teleport: true, assurance: "yes", five_case: false }),
    ).toEqual({
      efficiency: true,
      assurance: false,
      five_case: false,
    });
    expect(toModuleMap(null)).toEqual({});
    expect(toModuleMap([true])).toEqual({});
  });
});

describe("isModuleEnabled", () => {
  it("is off when missing and on only when true", () => {
    const settings = withModules({ efficiency: true, assurance: false });
    expect(isModuleEnabled("efficiency", settings)).toBe(true);
    expect(isModuleEnabled("assurance", settings)).toBe(false);
    expect(isModuleEnabled("cross_org", settings)).toBe(false);
    expect(anyModuleEnabled(settings)).toBe(true);
    expect(anyModuleEnabled(defaultSettings)).toBe(false);
  });

  it("requires every module a template declares", () => {
    const settings = withModules({ efficiency: true });
    expect(modulesSatisfied(undefined, settings)).toBe(true);
    expect(modulesSatisfied(["efficiency"], settings)).toBe(true);
    expect(modulesSatisfied(["efficiency", "impact_assessment"], settings)).toBe(false);
    expect(modulesSatisfied(["not_a_module"], settings)).toBe(false);
  });

  it("leaves report blocks no module owns visible", () => {
    expect(isReportBlockEnabled("health_summary", defaultSettings)).toBe(true);
  });

  it("hides board assurance blocks, and templates using them, while the module is off", () => {
    const on = withModules({ assurance: true });
    for (const key of ["baf_summary", "baf_above_appetite", "baf_linkage"]) {
      expect(isReportBlockEnabled(key, defaultSettings)).toBe(false);
      expect(isReportBlockEnabled(key, on)).toBe(true);
    }
    const board = [{ blockKey: "report_cover" }, { blockKey: "baf_summary" }];
    expect(templateModulesOn(board, defaultSettings)).toBe(false);
    expect(templateModulesOn(board, on)).toBe(true);
    expect(templateModulesOn([{ blockKey: "report_cover" }], defaultSettings)).toBe(true);
    expect(templateModulesOn([], defaultSettings)).toBe(true);
  });
});

describe("names and terms", () => {
  it("uses NHS names only with the NHS pack", () => {
    expect(moduleName("efficiency", withModules({}))).toBe("Efficiency programme");
    expect(moduleName("efficiency", withModules({}, "nhs"))).toBe(
      "Cost Improvement Programme (CIP)",
    );
  });

  it("uses the organisation's term, else the neutral one", () => {
    expect(moduleTerm("efficiency.scheme", withModules({}))).toBe("Savings scheme");
    expect(
      moduleTerm(
        "efficiency.scheme",
        withModules({}, "nhs", { "efficiency.scheme": "CIP scheme" }),
      ),
    ).toBe("CIP scheme");
    expect(
      moduleTerm("efficiency.scheme", withModules({}, "nhs", { "efficiency.scheme": "  " })),
    ).toBe("Savings scheme");
  });
});
