import { describe, expect, it } from "vitest";
import type { IssueItem, RiskItem } from "@/services/project-records";
import { issuesToRows, ownerNameFrom, risksToRows } from "./board-data";

const names = new Map([["r-ada", "Ada Lovelace"]]);
const ownerName = ownerNameFrom(names);

const risk = (extra: Partial<RiskItem> = {}): RiskItem => ({
  id: "risk-1",
  ref: "R-001",
  title: "Supplier late",
  description: null,
  ownerId: "r-ada",
  probability: 3,
  impact: 5,
  score: 15,
  response: "Reduce",
  status: "Open",
  reviewDate: "2026-12-01",
  updatedAt: "2026-11-01T00:00:00Z",
  ...extra,
});
const issue = (extra: Partial<IssueItem> = {}): IssueItem => ({
  id: "issue-1",
  ref: "I-001",
  title: "Server down",
  description: null,
  ownerId: "r-ada",
  severity: "High",
  status: "Open",
  dueDate: "2026-12-24",
  updatedAt: "2026-11-01T00:00:00Z",
  ...extra,
});

describe("ownerNameFrom", () => {
  it("names the owner, else Unassigned", () => {
    expect(ownerName("r-ada")).toBe("Ada Lovelace");
    expect(ownerName("r-unknown")).toBe("Unassigned");
    expect(ownerName(null)).toBe("Unassigned");
  });
});

describe("risksToRows", () => {
  it("builds the register row from the database record", () => {
    expect(risksToRows([risk()], ownerName)).toEqual([
      {
        id: "risk-1",
        title: "Supplier late",
        status: "Open",
        people: ["Ada Lovelace"],
        probability: 3,
        impact: 5,
        number: 15,
        response: "Reduce",
        finish: "01/12/2026",
        formula: "Critical",
        group: "Open",
      },
    ]);
  });
  it("bands the score and shows a missing review date as blank", () => {
    const [elevated, low] = risksToRows(
      [risk({ score: 8, reviewDate: null, ownerId: null }), risk({ score: 7 })],
      ownerName,
    );
    expect(elevated?.formula).toBe("Elevated");
    expect(elevated?.finish).toBe("");
    expect(elevated?.people).toEqual(["Unassigned"]);
    expect(low?.formula).toBe("Low");
  });
});

describe("issuesToRows", () => {
  it("builds the register row from the database record", () => {
    expect(issuesToRows([issue()], ownerName)).toEqual([
      {
        id: "issue-1",
        title: "Server down",
        status: "Open",
        people: ["Ada Lovelace"],
        priority: "High",
        finish: "24/12/2026",
        group: "Open",
      },
    ]);
  });
});
