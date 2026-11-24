import { describe, expect, it } from "vitest";
import {
  invitePreviewMessage,
  parseInvitePreview,
  parseOverview,
  parsePartners,
  parseRollup,
  parseSharedProgrammes,
  partnerInviteLink,
} from "./partner-programmes";

describe("partner programmes parsing", () => {
  it("reads a project roll-up with stored health as labels", () => {
    const row = parseRollup({
      id: "p1",
      code: "PRJ-1",
      name: "Virtual wards",
      state: "on_hold",
      is_sample: true,
      organisation_id: "o1",
      organisation: "Partner Trust",
      overall: "amber",
      schedule: "red",
      financial: null,
      next_milestone: { title: "Go live", date: "2027-01-10" },
      milestones_overdue: 2,
      open_risks: "3",
    });
    expect(row).toMatchObject({
      state: "On Hold",
      isSample: true,
      overall: "At Risk",
      schedule: "Off Track",
      financial: "Not Set",
      nextMilestone: { title: "Go live", date: "2027-01-10" },
      milestonesOverdue: 2,
      openRisks: 3,
    });
  });

  it("treats unknown health values as not set and a missing milestone as null", () => {
    const row = parseRollup({ overall: "purple", next_milestone: null });
    expect(row.overall).toBe("Not Set");
    expect(row.nextMilestone).toBeNull();
  });

  it("returns null for an overview the caller can't see", () => {
    expect(parseOverview(null)).toBeNull();
  });

  it("keeps cash-releasing and non-cash benefits apart", () => {
    const overview = parseOverview({
      programme: { id: "g1", name: "Urgent care", organisation: "ICB", overall: "green" },
      viewer: {
        is_host: false,
        share_id: "s1",
        access: "contribute",
        partner_organisation_id: "o2",
      },
      projects: [{ id: "p1" }],
      contributed_projects: [{ id: "p2", organisation: "Trust" }],
      organisations: [
        { id: "o1", name: "ICB", role: "host" },
        { id: "o2", name: "Trust", role: "partner" },
      ],
      benefits: { count: 4, cash_releasing: 120000, non_cash: 30000, realised: 1 },
    });
    expect(overview?.viewer).toEqual({
      isHost: false,
      shareId: "s1",
      access: "contribute",
      partnerOrganisationId: "o2",
    });
    expect(overview?.programme.overall).toBe("On Track");
    expect(overview?.contributedProjects).toHaveLength(1);
    expect(overview?.organisations.map((o) => o.role)).toEqual(["host", "partner"]);
    expect(overview?.benefits).toEqual({
      count: 4,
      cashReleasing: 120000,
      nonCash: 30000,
      realised: 1,
    });
  });

  it("reads the partner's list and defaults unknown access to read", () => {
    const list = parseSharedProgrammes([
      {
        share_id: "s1",
        programme_id: "g1",
        access: "admin",
        host_module_on: true,
        my_contributions: 2,
      },
    ]);
    expect(list[0]).toMatchObject({ access: "read", hostModuleOn: true, myContributions: 2 });
    expect(parseSharedProgrammes(null)).toEqual([]);
  });

  it("reads the host's partner list", () => {
    const partners = parsePartners({
      programme_id: "g1",
      module_on: true,
      sharing_enabled: false,
      can_manage: true,
      shares: [{ id: "s1", partner_organisation: "Trust", access: "contribute" }],
      invites: [{ id: "i1", email: "a@trust.nhs.uk", access: "read" }],
      contributions: [{ id: "c1", project_code: "T-1", active: false }],
    });
    expect(partners?.sharingEnabled).toBe(false);
    expect(partners?.shares[0]?.access).toBe("contribute");
    expect(partners?.invites[0]?.email).toBe("a@trust.nhs.uk");
    expect(partners?.contributions[0]).toMatchObject({ projectCode: "T-1", active: false });
    expect(parsePartners(null)).toBeNull();
  });

  it("reads invitation previews and falls back to not_found", () => {
    expect(parseInvitePreview({ status: "wrong_email" })).toEqual({
      status: "wrong_email",
      hostOrganisation: undefined,
      programme: undefined,
      access: undefined,
      expiresAt: undefined,
      organisations: [],
    });
    expect(parseInvitePreview({ status: "weird" }).status).toBe("not_found");
    const pending = parseInvitePreview({
      status: "pending",
      host_organisation: "ICB",
      programme: "Urgent care",
      access: "contribute",
      organisations: [{ id: "o2", name: "Trust", module_on: false }],
    });
    expect(pending.organisations).toEqual([{ id: "o2", name: "Trust", moduleOn: false }]);
    expect(invitePreviewMessage("pending")).toBeNull();
    expect(invitePreviewMessage("paused")).toMatch(/paused/);
  });

  it("builds the invitation link", () => {
    expect(partnerInviteLink("abc", "https://pmo.example.com/")).toBe(
      "https://pmo.example.com/partner-invite?token=abc",
    );
  });
});
