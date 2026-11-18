import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "./hierarchy";
import { ServiceError } from "./service-error";
import {
  collectionsForProject,
  confirmsName,
  asType,
  isFundingType,
  newTypeValue,
  typeNameError,
  isInUse,
  parseAmount,
  pickerCandidates,
  removalMode,
  validateCollectionDraft,
  type CollectionView,
} from "./collections";

const project = (id: string, over: Partial<ProjectSummary> = {}) =>
  ({
    id,
    code: id.toUpperCase(),
    name: `Project ${id}`,
    workspaceId: "ws1",
    ...over,
  }) as ProjectSummary;

const collection = (id: string, over: Partial<CollectionView> = {}): CollectionView => ({
  id,
  workspaceId: "ws1",
  name: `Collection ${id}`,
  type: "Governance",
  typeId: "t1",
  typeLabel: "Governance",
  potAmount: null,
  projectIds: [],
  awards: {},
  archivedAt: null,
  updatedAt: "2026-11-17T10:00:00Z",
  ...over,
});

describe("parseAmount", () => {
  it("reads blank as no amount", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("   ")).toBeNull();
  });
  it("accepts plain, grouped and currency-marked amounts", () => {
    expect(parseAmount("250000")).toBe(250000);
    expect(parseAmount("£1,250,000")).toBe(1250000);
    expect(parseAmount(" 1 000.5 ")).toBe(1000.5);
    expect(parseAmount("0")).toBe(0);
  });
  it("refuses negatives, words, more than two decimals and absurd sizes", () => {
    expect(parseAmount("-5")).toBe("invalid");
    expect(parseAmount("ten")).toBe("invalid");
    expect(parseAmount("1.234")).toBe("invalid");
    expect(parseAmount("1e6")).toBe("invalid");
    expect(parseAmount("9999999999999")).toBe("invalid");
  });
});

describe("validateCollectionDraft", () => {
  const ok = { name: "Innovation Fund", typeId: "t1", workspaceId: "ws1", pot: "" };
  it("accepts a complete draft", () => {
    expect(validateCollectionDraft(ok, true)).toEqual({});
  });
  it("needs a name, a type and a workspace", () => {
    const errors = validateCollectionDraft(
      { name: "  ", typeId: "", workspaceId: "", pot: "" },
      false,
    );
    expect(Object.keys(errors).sort()).toEqual(["name", "typeId", "workspaceId"]);
  });
  it("checks the pot only for funding types", () => {
    expect(validateCollectionDraft({ ...ok, pot: "lots" }, true).pot).toBeDefined();
    expect(validateCollectionDraft({ ...ok, pot: "lots" }, false)).toEqual({});
  });
  it("limits the name length", () => {
    expect(validateCollectionDraft({ ...ok, name: "x".repeat(201) }, false).name).toBeDefined();
  });
});

describe("pickerCandidates", () => {
  const projects = [
    project("b", { name: "Beta upgrade" }),
    project("a", { name: "Alpha portal" }),
    project("c", { name: "Cloud move", workspaceId: "ws2" }),
    project("d", { name: "Data lake", code: "DL01" }),
  ];
  it("offers the collection's workspace only, without current members, by name", () => {
    const result = pickerCandidates(projects, collection("x", { projectIds: ["d"] }), "");
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });
  it("searches name and code, ignoring case", () => {
    const c = collection("x");
    expect(pickerCandidates(projects, c, "PORTAL").map((p) => p.id)).toEqual(["a"]);
    expect(pickerCandidates(projects, c, "dl0").map((p) => p.id)).toEqual(["d"]);
    expect(pickerCandidates(projects, c, "cloud")).toEqual([]);
  });
});

describe("collectionsForProject", () => {
  it("lists memberships everywhere and editable collections in the workspace, not archived", () => {
    const all = [
      collection("in", { projectIds: ["p"] }),
      collection("archived-in", { projectIds: ["p"], archivedAt: "2026-11-01T00:00:00Z" }),
      collection("other", {}),
      collection("elsewhere", { workspaceId: "ws2" }),
    ];
    const { member, editable } = collectionsForProject(all, { id: "p", workspaceId: "ws1" });
    expect(member.map((c) => c.id)).toEqual(["in", "archived-in"]);
    expect(editable.map((c) => c.id)).toEqual(["in", "other"]);
  });
});

describe("delete or archive", () => {
  it("archives when published reports exist", () => {
    expect(removalMode(0)).toBe("delete");
    expect(removalMode(2)).toBe("archive");
  });
  it("needs the exact name, ignoring outer spaces", () => {
    expect(confirmsName(" Innovation Fund ", "Innovation Fund")).toBe(true);
    expect(confirmsName("innovation fund", "Innovation Fund")).toBe(false);
    expect(confirmsName("", "Innovation Fund")).toBe(false);
  });
  it("recognises the database's in-use refusal", () => {
    const refused = new ServiceError("invalid", "Deleting the collection: …", {
      code: "P0001",
      detail: "This collection can't be deleted — collection_in_use",
    });
    expect(isInUse(refused)).toBe(true);
    expect(isInUse(new ServiceError("forbidden", "No"))).toBe(false);
    expect(isInUse(new Error("collection_in_use"))).toBe(false);
  });
});

describe("collection types", () => {
  const types = [
    { id: "g", label: "Governance", value: "Governance", isActive: true },
    { id: "f", label: "Grants", value: "Funding stream", isActive: true },
    { id: "old", label: "Old board", value: "old_board", isActive: false },
  ];
  it("decides behaviour by the stored value, so a renamed Funding stream keeps its pot", () => {
    expect(isFundingType(types[1])).toBe(true);
    expect(isFundingType({ value: "grants" })).toBe(false);
    expect(isFundingType(undefined)).toBe(false);
    expect(asType("Priority set")).toBe("Priority set");
    expect(asType("my_own_type")).toBe("Governance");
  });
  it("refuses blank, long and duplicate names, ignoring case and outer spaces", () => {
    expect(typeNameError("  ", types)).toMatch(/name/);
    expect(typeNameError("x".repeat(81), types)).toMatch(/80/);
    expect(typeNameError(" governance ", types)).toMatch(/already/);
    expect(typeNameError("old BOARD", types)).toMatch(/hidden/);
    expect(typeNameError("Steering groups", types)).toBe("");
  });
  it("allows a type to keep its own name when renamed", () => {
    expect(typeNameError("Grants", types, "f")).toBe("");
    expect(typeNameError("Governance", types, "f")).toMatch(/already/);
  });
  it("makes a new value like Settings › Lists, numbered when taken", () => {
    expect(newTypeValue("Steering groups", types)).toBe("steering_groups");
    expect(newTypeValue("Old board!", types)).toBe("old_board_2");
    expect(newTypeValue("Old board", [...types, { value: "old_board_2" }])).toBe("old_board_3");
  });
});
