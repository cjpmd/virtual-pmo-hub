import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, functions: { invoke } } }));
import { nextLocation } from "@/lib/safe-next";
import { FunctionCallError, kindForStatus } from "./functions";
import {
  acceptInvite,
  addSeats,
  inviteState,
  paidSeatsNeeded,
  parseSeatUsage,
  ROLE_CHOICES,
  roleLabel,
  seatsFit,
  seatsFree,
  seatSummary,
  signInMethods,
  splitEmails,
  tierOfRole,
  usesPaidSeat,
} from "./members";
import { ServiceError } from "./service-error";

const usage = parseSeatUsage({
  used: 8,
  limit: 10,
  paid_members: 6,
  pending_paid_invites: 2,
  viewers: 4,
  on_trial: true,
  trial_seat_allowance: 10,
  seats_total: 0,
  scheduled_seats: null,
  scheduled_interval: null,
  scheduled_change_at: null,
})!;

describe("roles and tiers", () => {
  it("maps the five roles to admin, member and viewer", () => {
    expect(tierOfRole("admin")).toBe("admin");
    expect(tierOfRole("pmo")).toBe("member");
    expect(tierOfRole("manager")).toBe("member");
    expect(tierOfRole("contributor")).toBe("member");
    expect(tierOfRole("viewer")).toBe("viewer");
  });

  it("charges a seat for every role except viewer", () => {
    expect(ROLE_CHOICES.filter((choice) => usesPaidSeat(choice.role)).map((c) => c.role)).toEqual([
      "admin",
      "contributor",
      "manager",
      "pmo",
    ]);
    expect(usesPaidSeat("viewer")).toBe(false);
  });

  it("shows contributor as Member and keeps manager and PMO under advanced", () => {
    expect(roleLabel("contributor")).toBe("Member");
    expect(ROLE_CHOICES.filter((choice) => choice.advanced).map((c) => c.role)).toEqual([
      "manager",
      "pmo",
    ]);
  });
});

describe("seat counting", () => {
  it("parses get_seat_usage", () => {
    expect(usage).toMatchObject({ used: 8, limit: 10, viewers: 4, onTrial: true });
    expect(parseSeatUsage(null)).toBeNull();
    expect(parseSeatUsage([1, 2])).toBeNull();
  });

  it("parses a scheduled change", () => {
    const parsed = parseSeatUsage({
      used: 3,
      limit: 4,
      scheduled_seats: 4,
      scheduled_interval: "year",
      scheduled_change_at: "2026-12-01T00:00:00Z",
    })!;
    expect(parsed.scheduledSeats).toBe(4);
    expect(parsed.scheduledInterval).toBe("year");
    expect(parsed.scheduledChangeAt).toBe("2026-12-01T00:00:00Z");
  });

  it("counts free seats, never below zero", () => {
    expect(seatsFree(usage)).toBe(2);
    expect(seatsFree({ ...usage, used: 12 })).toBe(0);
  });

  it("counts only paid roles in a batch of invitations", () => {
    expect(paidSeatsNeeded(["viewer", "contributor", "admin", "viewer"])).toBe(2);
    expect(seatsFit(usage, 2)).toBe(true);
    expect(seatsFit(usage, 3)).toBe(false);
    expect(seatsFit(usage, 0)).toBe(true);
  });

  it("summarises trial and paid seats", () => {
    expect(seatSummary(usage)).toBe("Using 8 of 10 trial seats");
    expect(seatSummary({ ...usage, onTrial: false })).toBe("Using 8 of 10 seats");
  });
});

describe("invitations", () => {
  const now = Date.parse("2026-10-29T12:00:00Z");
  const future = "2026-11-05T12:00:00Z";

  it("works out the state shown on the Members page", () => {
    expect(inviteState({ expiresAt: future, lastSentAt: null, emailStatus: null }, now)).toBe(
      "not_sent",
    );
    expect(inviteState({ expiresAt: future, lastSentAt: future, emailStatus: "sent" }, now)).toBe(
      "sent",
    );
    expect(
      inviteState({ expiresAt: future, lastSentAt: future, emailStatus: "delivered" }, now),
    ).toBe("delivered");
    expect(
      inviteState({ expiresAt: future, lastSentAt: future, emailStatus: "bounced" }, now),
    ).toBe("not_delivered");
    expect(
      inviteState({ expiresAt: future, lastSentAt: future, emailStatus: "suppressed" }, now),
    ).toBe("not_delivered");
    expect(
      inviteState(
        { expiresAt: "2026-10-29T11:59:59Z", lastSentAt: future, emailStatus: "delivered" },
        now,
      ),
    ).toBe("expired");
  });

  it("splits pasted addresses, lower-cased and without duplicates", () => {
    expect(splitEmails(" A@x.com, b@x.com;\nc@x.com  a@X.com ")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
    expect(splitEmails("  ")).toEqual([]);
  });

  it("names sign-in methods", () => {
    expect(signInMethods(["email", "azure"])).toBe("Email, Microsoft");
    expect(signInMethods([])).toBe("—");
  });
});

describe("RPC errors", () => {
  beforeEach(() => rpc.mockReset());

  it("keeps the database's message and turns the hint into the error code", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "This invitation has expired",
        hint: "invite_expired",
        details: "",
      },
    });
    const error = await acceptInvite("t".repeat(43)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceError);
    expect((error as ServiceError).code).toBe("invite_expired");
    expect((error as ServiceError).message).toContain("This invitation has expired");
  });

  it("returns the joined organisation", async () => {
    rpc.mockResolvedValue({ data: { organisation_id: "org-1", status: "joined" }, error: null });
    await expect(acceptInvite("t".repeat(43))).resolves.toEqual({
      organisationId: "org-1",
      status: "joined",
    });
  });
});

describe("edge function errors", () => {
  beforeEach(() => invoke.mockReset());

  it("maps HTTP statuses", () => {
    expect(kindForStatus(402)).toBe("invalid");
    expect(kindForStatus(403)).toBe("forbidden");
    expect(kindForStatus(500)).toBe("unknown");
  });

  it("keeps the body of a 3D Secure response so the page can link to the invoice", async () => {
    const body = {
      error: "Your bank needs you to confirm this payment.",
      code: "requires_action",
      hostedInvoiceUrl: "https://invoice.stripe.com/i/test",
    };
    invoke.mockResolvedValue({
      data: null,
      error: { context: new Response(JSON.stringify(body), { status: 402 }) },
    });
    const error = await addSeats("org-1", 5, 1).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(FunctionCallError);
    expect((error as FunctionCallError).code).toBe("requires_action");
    expect((error as FunctionCallError).body?.["hostedInvoiceUrl"]).toBe(body.hostedInvoiceUrl);
    expect((error as FunctionCallError).message).toBe(body.error);
  });
});

describe("nextLocation", () => {
  it("splits a return path with a query string", () => {
    expect(nextLocation("/invite?token=abc-_1")).toEqual({
      to: "/invite",
      search: { token: "abc-_1" },
    });
    expect(nextLocation("/portfolio")).toEqual({ to: "/portfolio", search: {} });
  });
});
