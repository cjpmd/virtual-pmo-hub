import { describe, expect, it } from "vitest";
import type { AppSettings } from "@/data/settings-types";
import { reportShowLogo } from "./report-branding";

const withTemplates = (templates: Partial<AppSettings["templates"]>) =>
  ({ templates }) as Pick<AppSettings, "templates">;
const pack = (showLogo: boolean) => ({ sectionOrder: [], coverText: "", showLogo });

describe("reportShowLogo", () => {
  it("uses the report setting when it is set", () => {
    expect(
      reportShowLogo(withTemplates({ reports: { showLogo: false }, committeePack: pack(true) })),
    ).toBe(false);
    expect(
      reportShowLogo(withTemplates({ reports: { showLogo: true }, committeePack: pack(false) })),
    ).toBe(true);
  });
  it("falls back to the old Funding pack setting", () => {
    expect(reportShowLogo(withTemplates({ committeePack: pack(false) }))).toBe(false);
    expect(reportShowLogo(withTemplates({ reports: {}, committeePack: pack(true) }))).toBe(true);
  });
  it("defaults to showing the logo", () => {
    expect(reportShowLogo(withTemplates({}))).toBe(true);
  });
});
