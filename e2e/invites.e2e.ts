// Members, invitations and join requests (work package 2.1). The full manual checklist, including
// the Stripe test-clock and 3D Secure cases, is in docs/invites-and-seats.md.
//   * Runs for everyone: Settings › Members lists members read-only for the PMO test user, and an
//     invalid invitation link explains itself.
//   * Outlined (fixme): the admin flows. They need an admin login in a non-demo organisation (the
//     demo organisation can't send invitations or take join requests) and send real email, to
//     delivered@resend.dev only. Fill them in when the e2e suite moves to a Supabase branch.
import { expect, expectNoErrorBoundary, settle, test } from "./fixtures";

test("Settings › Members lists members, without admin controls for PMO", async ({ page }) => {
  await page.goto("/settings/members");
  await settle(page);
  await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seats" })).toBeVisible();
  await expect(page.getByText("(you)")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite people" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Invitations" })).toHaveCount(0);
  await expectNoErrorBoundary(page);
});

test("an invalid invitation link says so", async ({ page }) => {
  await page.goto(`/invite?token=${"x".repeat(43)}`);
  await expect(
    page.getByRole("heading", { name: "This invitation link isn't valid" }),
  ).toBeVisible();
  await expectNoErrorBoundary(page);
});

test("an invitation link without a token says so", async ({ page }) => {
  await page.goto("/invite");
  await expect(
    page.getByRole("heading", { name: "This invitation link isn't complete" }),
  ).toBeVisible();
});

test.describe("Admin flows (outline)", () => {
  test.fixme(true, "Needs an admin login in a non-demo organisation; see the file header");

  test("invite a viewer to delivered@resend.dev, see it pending, resend, revoke", async () => {
    // Settings › Members › Invite people: address, Viewer, one workspace → "Invitation sent".
    // Pending list shows Sent, then Delivered once the Resend webhook lands. Resend invite →
    // toast. Revoke → gone from the list; the old link shows "This invitation was withdrawn".
  });

  test("seat limit: paid invitations beyond the limit are refused, viewers are not", async () => {
    // With used = limit, inviting a member shows "Not enough paid seats" and Send is disabled;
    // switching the role to Viewer enables it.
  });

  test("accept an invitation as the invited user", async () => {
    // Signed out: /invite?token=… shows the organisation and inviter, Create an account and
    // Sign in keep the token through sign-in (next=/invite?token=…). Signed in with another
    // address: "This invitation is for a different address". With the right address: Accept
    // and join → the portfolio, in the new organisation.
  });

  test("change a role, protect the last admin, remove a member", async () => {
    // Role select → toast; demoting or removing the only admin is refused with the database's
    // message; Remove → confirm dialog → gone from the list.
  });

  test("join requests: domain, request, approve and decline", async () => {
    // Admin: Add my email domain, switch on Accept requests to join. Colleague on the same domain
    // without an organisation: /signup/setup shows "Ask to join" → request sent. Admin: Settings
    // badge, Requests to join → Approve as viewer → colleague opens the organisation.
  });
});
