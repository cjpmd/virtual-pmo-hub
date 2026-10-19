import { describe, expect, it } from "vitest";
import type { WorkspaceRole } from "./auth";
import { optionChangesOf } from "./decisions";
import { canManageForum, canManageMeetings, forumWorkspaces } from "./forums";

const role = (workspaceId: string, value: WorkspaceRole["role"]): WorkspaceRole => ({
  workspaceId,
  organisationId: "org",
  role: value,
});
const orgForum = { workspaceId: null, chairResourceId: "chair", active: true };
const wsForum = { workspaceId: "ws1", chairResourceId: null, active: true };

describe("forum permissions", () => {
  it("organisation-level forums are managed by organisation admins only", () => {
    const pmo = {
      orgRole: "pmo" as const,
      workspaceRoles: [role("ws1", "pmo")],
      myResourceId: null,
    };
    const admin = { orgRole: "admin" as const, workspaceRoles: [], myResourceId: null };
    expect(canManageForum(orgForum, pmo)).toBe(false);
    expect(canManageForum(orgForum, admin)).toBe(true);
  });

  it("workspace forums are managed by that workspace's PMO or admin", () => {
    const context = (value: WorkspaceRole["role"]) => ({
      orgRole: "viewer" as const,
      workspaceRoles: [role("ws1", value)],
      myResourceId: null,
    });
    expect(canManageForum(wsForum, context("manager"))).toBe(false);
    expect(canManageForum(wsForum, context("pmo"))).toBe(true);
    expect(canManageForum({ workspaceId: "ws2" }, context("admin"))).toBe(false);
    expect(forumWorkspaces(context("pmo"))).toEqual(["ws1"]);
  });

  it("the chair manages meetings of an active forum without managing the forum", () => {
    const chair = { orgRole: "contributor" as const, workspaceRoles: [], myResourceId: "chair" };
    expect(canManageForum(orgForum, chair)).toBe(false);
    expect(canManageMeetings(orgForum, chair)).toBe(true);
    expect(canManageMeetings({ ...orgForum, active: false }, chair)).toBe(false);
    expect(canManageMeetings(orgForum, { ...chair, myResourceId: "someone" })).toBe(false);
  });
});

describe("option history", () => {
  it("reads the by-title shape and ignores the old [before, after] counts", () => {
    expect(
      optionChangesOf({
        renamed: [["January", "January (after exams)"]],
        added: ["March"],
        pros_cons_changed: ["April"],
      }),
    ).toEqual({
      renamed: [["January", "January (after exams)"]],
      added: ["March"],
      prosConsChanged: ["April"],
    });
    expect(optionChangesOf([2, 3])).toBeNull();
    expect(optionChangesOf(undefined)).toBeNull();
  });
});
