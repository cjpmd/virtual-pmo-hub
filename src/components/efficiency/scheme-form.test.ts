import { describe, expect, it } from "vitest";
import type { EfficiencyScheme } from "@/services/efficiency";
import { draftOf, draftToEdit } from "./scheme-form";

const scheme = {
  id: "s1",
  workspaceId: "w1",
  title: "Agency reduction",
  description: "",
  businessUnit: "Surgery",
  category: "agency_bank",
  savingsType: "pay",
  recurrence: "recurrent",
  executiveLeadId: null,
  schemeLeadId: "r1",
  financeLeadId: null,
  startMonth: "2026-04-01",
  projectId: null,
  programmeId: null,
  benefitId: null,
  confidence: "plans_in_progress",
  deliveryPlan: "Plan",
  fullYearEffect: 12000,
} as unknown as EfficiencyScheme;

describe("draftToEdit", () => {
  it("sends every field for a new scheme", () => {
    const edit = draftToEdit({ ...draftOf(null, "w1"), title: "New" }, null);
    expect(edit).toMatchObject({ title: "New", savingsType: "non_pay", recurrence: "recurrent" });
    expect(edit?.fullYearEffect).toBeNull();
  });
  it("sends only changed fields for an existing scheme", () => {
    const draft = draftOf(scheme, "w1");
    expect(draftToEdit(draft, scheme)).toEqual({});
    expect(draftToEdit({ ...draft, title: "Agency and bank", description: "  " }, scheme)).toEqual({
      title: "Agency and bank",
    });
    expect(draftToEdit({ ...draft, fullYearEffect: "£15,000" }, scheme)).toEqual({
      fullYearEffect: 15000,
    });
    expect(draftToEdit({ ...draft, schemeLeadId: "" }, scheme)).toEqual({ schemeLeadId: null });
  });
  it("refuses a full-year effect that isn't a positive amount", () => {
    const draft = draftOf(scheme, "w1");
    expect(draftToEdit({ ...draft, fullYearEffect: "abc" }, scheme)).toBeNull();
    expect(draftToEdit({ ...draft, fullYearEffect: "-5" }, scheme)).toBeNull();
  });
});
