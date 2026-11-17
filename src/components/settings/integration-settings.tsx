import { SettingsCard } from "@/components/settings/settings-shell";
import { IntegrationsWorkspace } from "@/components/integrations/integrations-workspace";
import { plannerSync } from "@/lib/features";

export function IntegrationSettings() {
  if (plannerSync) return <IntegrationsWorkspace />;
  return (
    <SettingsCard title="Microsoft Planner" description="Two-way task sync with Microsoft Planner.">
      <p className="text-sm text-muted-foreground">
        Planner sync is coming later. For now, projects, tasks and people are managed in ORMO PMO.
      </p>
    </SettingsCard>
  );
}
