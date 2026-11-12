import { describe, expect, it } from "vitest";
import {
  buildManifest,
  countMismatches,
  downloadName,
  expiredExports,
  exportPath,
  pageOffsets,
  tableFile,
  type ExportPlan,
} from "./organisation-export";

const ORG = "d0000000-0000-4000-8000-000000000100";
const AT = new Date("2026-11-11T09:30:05.123Z");
const plan: ExportPlan = {
  organisation_id: ORG,
  schema_version: "20261111100000",
  generated_at: AT.toISOString(),
  tables: [
    { table: "projects", rows: 3, order_by: ["id"], omitted_columns: [] },
    { table: "organisation_invites", rows: 1, order_by: ["id"], omitted_columns: ["token_hash"] },
  ],
  not_exported: ["Sign-in data (auth schema)"],
};

describe("organisation export helpers", () => {
  it("names the zip by organisation and UTC time, without colons", () => {
    expect(exportPath(ORG, AT)).toBe(`${ORG}/2026-11-11T09-30-05Z.zip`);
  });

  it("makes a safe download name", () => {
    expect(downloadName("Ünïversity of X & Co.", AT)).toBe("ormo-export-university-of-x-co-2026-11-11.zip");
    expect(downloadName("!!!", AT)).toBe("ormo-export-organisation-2026-11-11.zip");
  });

  it("pages a table", () => {
    expect(pageOffsets(0)).toEqual([]);
    expect(pageOffsets(1000)).toEqual([0]);
    expect(pageOffsets(2001)).toEqual([0, 1000, 2000]);
  });

  it("builds the manifest from the plan, rows written and Storage listing", () => {
    const manifest = buildManifest({
      plan,
      organisationName: "Org",
      requestedBy: "admin-id",
      exportedAt: AT,
      written: { projects: 3, organisation_invites: 1 },
      storage: [{ bucket: "documents", path: `${ORG}/w/doc.pdf` }],
    });
    expect(manifest.tables).toEqual([
      { table: "projects", file: tableFile("projects"), rows: 3, omitted_columns: [] },
      { table: "organisation_invites", file: "tables/organisation_invites.json", rows: 1, omitted_columns: ["token_hash"] },
    ]);
    expect(manifest.total_rows).toBe(4);
    expect(manifest.storage_objects.count).toBe(1);
    expect(manifest.schema_version).toBe("20261111100000");
    expect(manifest.organisation).toEqual({ id: ORG, name: "Org" });
  });

  it("reports tables whose rows changed during the export", () => {
    expect(countMismatches(plan, { projects: 3, organisation_invites: 1 })).toEqual([]);
    expect(countMismatches(plan, { projects: 4 })).toEqual([
      "projects: planned 3, wrote 4",
      "organisation_invites: planned 1, wrote 0",
    ]);
  });

  it("finds zips older than 7 days only", () => {
    const now = new Date("2026-11-20T03:40:00Z");
    const objects = [
      { name: "old.zip", id: "1", created_at: "2026-11-12T03:39:00Z" },
      { name: "new.zip", id: "2", created_at: "2026-11-14T00:00:00Z" },
      { name: "folder", id: null, created_at: null },
      { name: "undated.zip", id: "3", created_at: null },
    ];
    expect(expiredExports(ORG, objects, now)).toEqual([`${ORG}/old.zip`]);
  });
});
