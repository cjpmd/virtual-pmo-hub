import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MODULE_TERM_KEYS,
  nhsModuleTerms,
  packGovernanceRoles,
  packTermsToAdd,
  toSectorPack,
} from "./sector-packs";

const sql = readFileSync("supabase/migrations/20261122150000_nhs_0_modules.sql", "utf8");

describe("sector packs (mirror migration 20261122150000_nhs_0_modules)", () => {
  it("reads a missing or unknown pack as general", () => {
    expect(toSectorPack(undefined)).toBe("general");
    expect(toSectorPack("nasa")).toBe("general");
    expect(toSectorPack("nhs")).toBe("nhs");
  });

  it("has the same NHS terms as private.pack_terminology", () => {
    for (const key of MODULE_TERM_KEYS) expect(sql).toContain(`'${key}', '${nhsModuleTerms[key]}'`);
  });

  it("has the same governance roles as private.pack_governance_roles", () => {
    for (const pack of ["nhs", "general"] as const)
      for (const role of packGovernanceRoles[pack])
        expect(sql).toContain(`('${pack}', '${role.value}', '${role.label}'`);
  });

  it("fills only terms the organisation hasn't set or left blank", () => {
    const added = packTermsToAdd("nhs", { orgUnit: "Department", "efficiency.scheme": " " });
    expect(added).not.toHaveProperty("orgUnit");
    expect(added["efficiency.scheme"]).toBe("CIP scheme");
    expect(Object.keys(added)).toHaveLength(MODULE_TERM_KEYS.length - 1);
    expect(packTermsToAdd("general", {})).toEqual({});
  });
});
