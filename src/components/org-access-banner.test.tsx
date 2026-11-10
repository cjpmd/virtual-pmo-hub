// @vitest-environment jsdom
// GL-5: the banner's wording and actions for each state accessBanner can return.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { defaultSettings } from "@/data/settings-data";
import type { AccessBanner } from "@/services/billing";

const state = vi.hoisted(() => ({ banner: null as AccessBanner | null }));
vi.mock("@/hooks/use-org-access", () => ({
  useOrgAccess: () => ({ banner: state.banner, isAdmin: true }),
}));
vi.mock("@/components/auth/organisation-provider", () => ({ useOrgId: () => "org-1" }));
vi.mock("@/services/settings", () => ({ useSettings: () => defaultSettings }));
vi.mock("@/services/billing", () => ({ openBillingPortal: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/settings/subscription">{children}</a>,
}));
import { OrgAccessBanner } from "./org-access-banner";

const show = (banner: AccessBanner | null) => {
  state.banner = banner;
  return render(<OrgAccessBanner />);
};

afterEach(cleanup);

describe("OrgAccessBanner", () => {
  it("renders nothing without a banner", () => {
    const { container } = show(null);
    expect(container.innerHTML).toBe("");
  });

  it("tells admins to subscribe when read-only", () => {
    show({ kind: "read_only", isAdmin: true });
    expect(screen.getByRole("status").textContent).toContain("This organisation is read-only.");
    expect(screen.getByRole("link", { name: "Subscribe" })).toBeTruthy();
  });

  it("tells members to ask their admin when read-only, with no button", () => {
    show({ kind: "read_only", isAdmin: false });
    expect(screen.getByRole("status").textContent).toContain("Ask your admin to subscribe.");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("gives the pay-by date for a failed payment", () => {
    show({ kind: "past_due", payBy: "2026-11-08T12:00:00.000Z" });
    expect(screen.getByRole("status").textContent).toContain(
      "Payment failed — update your card by 08/11/2026",
    );
    expect(screen.getByRole("button", { name: "Update card" })).toBeTruthy();
  });

  it("gives the end date for a cancelling subscription", () => {
    show({ kind: "cancelling", endsOn: "2026-11-29T00:00:00Z" });
    expect(screen.getByRole("status").textContent).toContain(
      "Your subscription ends on 29/11/2026 — the organisation becomes read-only after that.",
    );
    expect(screen.getByRole("button", { name: "Keep subscription" })).toBeTruthy();
  });

  it("counts trial days, singular on the last day", () => {
    show({ kind: "trial", daysLeft: 1, urgent: true });
    expect(screen.getByRole("status").textContent).toContain("1 day left in your trial.");
    expect(screen.getByRole("status").getAttribute("data-banner")).toBe("trial");
  });
});
