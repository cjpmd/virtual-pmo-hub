import { describe, expect, it } from "vitest";
import { resolveSubscriptionOrganisation } from "./stripe-org";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("resolveSubscriptionOrganisation", () => {
  it("uses the stored mapping when the metadata agrees", () => {
    expect(resolveSubscriptionOrganisation([A], A)).toEqual({ organisationId: A, source: "mapping" });
  });

  it("uses the stored mapping when there is no metadata", () => {
    expect(resolveSubscriptionOrganisation([A], null)).toEqual({ organisationId: A, source: "mapping" });
    expect(resolveSubscriptionOrganisation([A], "  ")).toEqual({ organisationId: A, source: "mapping" });
  });

  it("refuses to write when the metadata names a different organisation from the mapping", () => {
    expect(resolveSubscriptionOrganisation([A], B)).toEqual({
      organisationId: null,
      reason: "metadata_conflict",
      mapped: A,
      metadata: B,
    });
  });

  it("uses the metadata only when no mapping exists (first checkout before the row is linked)", () => {
    expect(resolveSubscriptionOrganisation([], B)).toEqual({ organisationId: B, source: "metadata" });
  });

  it("refuses when the customer is mapped to more than one organisation", () => {
    expect(resolveSubscriptionOrganisation([A, B], A)).toEqual({
      organisationId: null,
      reason: "ambiguous_mapping",
      mapped: [A, B],
    });
  });

  it("treats duplicate rows for one organisation as one mapping", () => {
    expect(resolveSubscriptionOrganisation([A, A], undefined)).toEqual({ organisationId: A, source: "mapping" });
  });

  it("finds nothing with neither a mapping nor metadata", () => {
    expect(resolveSubscriptionOrganisation([], undefined)).toEqual({
      organisationId: null,
      reason: "no_organisation",
    });
  });
});
