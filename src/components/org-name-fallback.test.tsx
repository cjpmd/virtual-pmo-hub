// @vitest-environment jsdom
// GL-3: an organisation that never saved its details (organisations.short_name and
// support_contact null) shows its own name, never the shipped defaults, on the committee pack
// cover and in Settings › Organisation.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { defaultSettings } from "@/data/settings-data";
import { applyServerSettings, clearServerSettings } from "@/services/settings";

vi.mock("@/hooks/use-permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-permissions")>()),
  useWorkspaceRole: () => "viewer",
}));
vi.mock("@/components/auth/organisation-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/auth/organisation-provider")>()),
  useOrganisation: () => ({
    organisation: { organisationId: "org-1", name: "Acme Health Trust", role: "admin" },
  }),
  useOrgId: () => "org-1",
}));
vi.mock("@/hooks/use-committee-packs", () => ({
  useCommitteePack: () => ({ data: undefined }),
  useIssueCommitteePack: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { CommitteePack } = await import("./committee-pack");
const { OrganisationSettings } = await import("./settings/settings-sections");

const wrap = (node: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);

/** What loadOrgSettings returns for an organisation with no saved details. */
const neverSaved = (name: string) =>
  applyServerSettings(
    { organisation: { ...defaultSettings.organisation, name, shortName: "", supportContact: "" } },
    name,
  );

afterEach(() => {
  cleanup();
  clearServerSettings();
});

describe("organisation name fallback", () => {
  it("the committee pack cover uses the organisation's name", () => {
    neverSaved("Acme Health Trust");
    wrap(
      <CommitteePack
        collection={{ id: "c1", name: "Capital Board" }}
        projects={[]}
        benefits="Loading"
        decisions="Loading"
        onClose={() => {}}
      />,
    );
    const text = document.body.textContent ?? "";
    expect(screen.getAllByText("Acme Health Trust").length).toBeGreaterThan(0);
    expect(text).toContain("Acme Health Trust portfolio office");
    expect(text).toContain("Acme Health Trust · Capital Board");
    expect(text).toContain("AC");
    expect(text).not.toMatch(/\bDTS\b|University Digital/);
  });

  it("Settings › Organisation shows blank fields with the name as placeholder", () => {
    neverSaved("Acme Health Trust");
    wrap(<OrganisationSettings />);
    const name = screen.getByLabelText(/^Organisation name/) as HTMLInputElement;
    const short = screen.getByLabelText(/^Short name/) as HTMLInputElement;
    const support = screen.getByLabelText(/^Support contact/) as HTMLInputElement;
    expect(name.value).toBe("Acme Health Trust");
    expect(short.value).toBe("");
    expect(short.placeholder).toBe("Acme Health Trust");
    expect(support.value).toBe("");
    expect(document.body.textContent ?? "").not.toMatch(/\bDTS\b|university\.ac\.uk/);
  });
});
