import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// The board mappers live next to their components; the Supabase client must not load in tests.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { issueInputFromBoard, riskInputFromBoard } = await import("@/components/project-raid");
const { milestoneInputFromBoard } = await import("@/components/project-milestones");
const { fromPostgrest } = await import("./service-error");

const people = [
  { id: "r1", name: "Maya Harrison", email: null, jobTitle: null, isBookable: true },
  { id: "r2", name: "Chris McDonald", email: null, jobTitle: null, isBookable: true },
];

describe("riskInputFromBoard", () => {
  it("maps board columns to risk fields", () => {
    expect(
      riskInputFromBoard(
        {
          title: "Supplier delay",
          status: "Closed",
          people: ["maya harrison"],
          probability: 4,
          impact: 2,
          response: "Transfer",
          finish: "07/10/2026",
        },
        people,
      ),
    ).toEqual({
      title: "Supplier delay",
      status: "Closed",
      ownerId: "r1",
      probability: 4,
      impact: 2,
      response: "Transfer",
      reviewDate: "2026-10-07",
    });
  });

  it("holds back values that are not valid yet", () => {
    expect(riskInputFromBoard({ finish: "07/10/20" }, people)).toBeUndefined();
    expect(riskInputFromBoard({ probability: 9 }, people)).toBeUndefined();
    expect(riskInputFromBoard({ title: "   " }, people)).toBeUndefined();
    expect(riskInputFromBoard({ people: ["Nobody Known"] }, people)).toBeUndefined();
  });

  it("clears the owner and review date when the cell is emptied", () => {
    expect(riskInputFromBoard({ people: [], finish: "" }, people)).toEqual({
      ownerId: null,
      reviewDate: null,
    });
  });
});

describe("issueInputFromBoard", () => {
  it("maps the severity column (board key `priority`) and due date", () => {
    expect(
      issueInputFromBoard({ priority: "High", finish: "2026-11-01", status: "Open" }, people),
    ).toEqual({
      severity: "High",
      dueDate: "2026-11-01",
      status: "Open",
    });
  });
});

describe("milestoneInputFromBoard", () => {
  it("maps forecast, baseline and actual dates", () => {
    expect(
      milestoneInputFromBoard({ finish: "20/11/2026", baseline: "16/10/2026", actual: "" }, people),
    ).toEqual({
      forecastDate: "2026-11-20",
      baselineDate: "2026-10-16",
      actualDate: null,
    });
  });
});

describe("fromPostgrest", () => {
  const error = (code: string, message = "x", details = "") =>
    ({ code, message, details, hint: "", name: "PostgrestError" }) as never;
  it("turns RLS refusals into a forbidden error with a readable message", () => {
    const result = fromPostgrest(
      error("42501", "new row violates row-level security policy"),
      "Adding the risk",
    );
    expect(result.kind).toBe("forbidden");
    expect(result.message).toBe("Adding the risk: You don't have permission to make this change.");
  });
  it("passes trigger messages (P0001) through, they are written for people", () => {
    expect(
      fromPostgrest(error("P0001", "Project codes can only be changed by the PMO.")).message,
    ).toBe("Project codes can only be changed by the PMO.");
  });
  it("maps unique violations to conflict", () => {
    expect(fromPostgrest(error("23505")).kind).toBe("conflict");
  });
});

describe("fromAuth", () => {
  it("reports an unreachable server as a network error, not the raw fetch message", async () => {
    const { fromAuth } = await import("./service-error");
    const error = Object.assign(new Error("Failed to fetch"), {
      name: "AuthRetryableFetchError",
      status: 0,
      code: undefined,
      __isAuthError: true,
    });
    const result = fromAuth(error as never);
    expect(result.kind).toBe("network");
    expect(result.message).toBe(
      "We couldn't reach the server. Check your connection and try again.",
    );
  });
});
