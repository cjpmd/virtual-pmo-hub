import { afterEach, describe, expect, test } from "vitest";
import { defaultSettings } from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import {
  applyServerSettings,
  clearServerSettings,
  getSettings,
  orgDisplayNames,
  orgInitials,
} from "./settings";

const withOrg = (organisation: Partial<AppSettings["organisation"]>): AppSettings => ({
  ...defaultSettings,
  organisation: { ...defaultSettings.organisation, ...organisation },
});

afterEach(() => clearServerSettings());

describe("default organisation settings", () => {
  test("carry no client-specific name or contact", () => {
    expect(defaultSettings.organisation.name).toBe("");
    expect(defaultSettings.organisation.shortName).toBe("");
    expect(defaultSettings.organisation.supportContact).toBe("");
  });
});

describe("orgDisplayNames", () => {
  test("blank name and short name fall back to organisations.name", () => {
    expect(orgDisplayNames(withOrg({ name: "", shortName: "" }), "Acme Health")).toEqual({
      name: "Acme Health",
      shortName: "Acme Health",
    });
  });

  test("a blank short name uses the saved name", () => {
    expect(orgDisplayNames(withOrg({ name: "Acme Ltd", shortName: "  " }), "Acme")).toEqual({
      name: "Acme Ltd",
      shortName: "Acme Ltd",
    });
  });

  test("saved values win", () => {
    expect(orgDisplayNames(withOrg({ name: "Acme Ltd", shortName: "ACM" }), "Acme")).toEqual({
      name: "Acme Ltd",
      shortName: "ACM",
    });
  });

  test("the store's organisation name is the fallback once settings load", () => {
    applyServerSettings(
      { organisation: withOrg({ name: "", shortName: "" }).organisation },
      "Acme",
    );
    expect(orgDisplayNames()).toEqual({ name: "Acme", shortName: "Acme" });
    expect(getSettings().organisation.shortName).toBe("");
    clearServerSettings();
    expect(orgDisplayNames()).toEqual({ name: "", shortName: "" });
  });
});

describe("orgInitials", () => {
  test("first two letters, upper case", () => {
    expect(orgInitials("Acme Health")).toBe("AC");
    expect(orgInitials("")).toBe("");
  });
});
