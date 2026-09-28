import type { JSX } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { Breadcrumbs } from "@/components/section-nav";
import { PageHeader } from "@/components/pmo-ui";
import { SettingsShell, isSettingsSection, settingsSections } from "@/components/settings/settings-shell";
import { AccountSettings } from "@/components/settings/account-settings";
import { BenefitSettingsSection, DataSettings, IntegrationSettings, LifecycleSettings, ListsSettings, NotificationSettings, OrganisationSettings, RegionalSettings, RiskSettings, SubscriptionSettings, TemplateSettings, TerminologySettings, UserSettings, WorkingTimeSettings } from "@/components/settings/settings-sections";

export const Route = createFileRoute("/settings/$section")({
  beforeLoad: ({ params }) => { if (!isSettingsSection(params.section)) throw notFound() },
  head: ({ params }) => {
    const section = settingsSections.find(item => item.id === params.section);
    const title = `${section?.label ?? "Settings"} — Virtual PMO`;
    const description = section?.blurb ?? "Configure the workspace.";
    return { meta: [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] };
  },
  component: Page,
});

const panels: Record<string, () => JSX.Element> = {
  account: AccountSettings,
  organisation: OrganisationSettings,
  regional: RegionalSettings,
  "working-time": WorkingTimeSettings,
  terminology: TerminologySettings,
  lifecycle: LifecycleSettings,
  risk: RiskSettings,
  benefits: BenefitSettingsSection,
  lists: ListsSettings,
  users: UserSettings,
  notifications: NotificationSettings,
  templates: TemplateSettings,
  integrations: IntegrationSettings,
  data: DataSettings,
  subscription: SubscriptionSettings,
};

function Page() {
  const { section: sectionId } = Route.useParams();
  const section = settingsSections.find(item => item.id === sectionId);
  const Panel = panels[sectionId];
  if (!section || !Panel) return <p>Settings section not found.</p>;
  return <div className="space-y-6">
    <Breadcrumbs trail={[{ label: "Settings", to: "/settings" }, { label: section.label }]} />
    <PageHeader eyebrow="Settings" title={section.label} description={section.blurb} />
    <SettingsShell active={sectionId}><Panel /></SettingsShell>
  </div>;
}
