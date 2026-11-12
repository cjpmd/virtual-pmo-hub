import { describe, expect, it } from "vitest";
import type { ReportListItem, TemplateRecord } from "@/services/reports";
import {
  collectionReports,
  defaultCollectionTemplate,
  filterByCollection,
} from "./collection-reports";

const report = (over: Partial<ReportListItem>): ReportListItem =>
  ({
    id: "r",
    scopeType: "collection",
    scopeEntityId: "c1",
    status: "published",
    asAt: "2026-10-01",
    meetingDate: null,
    ...over,
  }) as ReportListItem;

const template = (over: Partial<TemplateRecord>): TemplateRecord =>
  ({
    id: "t",
    name: "Funding committee",
    scopeType: "collection",
    isSystem: true,
    archivedAt: null,
    ...over,
  }) as TemplateRecord;

describe("collectionReports", () => {
  it("keeps only this collection's published reports, newest first", () => {
    const rows = [
      report({ id: "old", asAt: "2026-09-01" }),
      report({ id: "draft", status: "draft" }),
      report({ id: "other", scopeEntityId: "c2" }),
      report({ id: "custom", scopeType: "custom", scopeEntityId: null }),
      report({ id: "meeting", asAt: "2026-08-01", meetingDate: "2026-11-05" }),
      report({ id: "new", asAt: "2026-10-15" }),
    ];
    expect(collectionReports(rows, "c1").map((r) => r.id)).toEqual(["meeting", "new", "old"]);
  });
});

describe("filterByCollection", () => {
  it("returns everything without a collection, else that collection's reports in any status", () => {
    const rows = [
      report({ id: "a" }),
      report({ id: "b", status: "draft" }),
      report({ id: "c", scopeEntityId: "c2" }),
    ];
    expect(filterByCollection(rows, null)).toHaveLength(3);
    expect(filterByCollection(rows, "c1").map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("defaultCollectionTemplate", () => {
  it("prefers the system Funding committee template", () => {
    const rows = [
      template({ id: "own", isSystem: false }),
      template({ id: "sys" }),
      template({ id: "other", name: "Other" }),
    ];
    expect(defaultCollectionTemplate(rows)?.id).toBe("sys");
  });
  it("skips archived and non-collection templates", () => {
    const rows = [
      template({ id: "archived", archivedAt: "2026-11-01" }),
      template({ id: "programme", name: "Programme Board", scopeType: "programme" }),
      template({ id: "mine", name: "My collection pack", isSystem: false }),
    ];
    expect(defaultCollectionTemplate(rows)?.id).toBe("mine");
    expect(defaultCollectionTemplate([])).toBeNull();
  });
});
