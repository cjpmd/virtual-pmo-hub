import { Switch } from "@/components/ui/switch";
import type { AppSettings } from "@/data/settings-types";
import { useSettings } from "@/services/settings";
import { ListEditor, SettingsCard } from "@/components/settings/settings-shell";
import { reportShowLogo } from "@/lib/report-branding";
import { patch } from "./settings-helpers";

export function TemplateSettings() {
  const settings = useSettings();
  const templates = settings.templates;
  const set = (value: Partial<AppSettings["templates"]>) => patch("templates", value);
  return (
    <>
      <SettingsCard
        requires="pmo"
        title="Project templates"
        description="Starting points offered when a new project is created."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {templates.projectTemplates.map((template) => (
            <div key={template.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <strong className="text-sm">{template.name}</strong>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {template.tier}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {template.taskBuckets.map((bucket) => (
                  <span key={bucket} className="rounded bg-accent px-1.5 py-0.5 text-[10px]">
                    {bucket}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SettingsCard>
      <SettingsCard
        title="Status report template"
        description="Sections a project manager completes each reporting period."
      >
        <ListEditor
          label="Sections"
          values={templates.statusReportSections}
          onChange={(values) => set({ statusReportSections: values })}
        />
      </SettingsCard>
      <SettingsCard
        title="Board and committee packs"
        description="Branding on the cover of reports built in Governance › Reports."
      >
        <label className="flex items-center justify-between rounded-md border p-4">
          <span className="text-sm font-medium">Show the organisation logo on the cover</span>
          <Switch
            checked={reportShowLogo(settings)}
            onCheckedChange={(value) => set({ reports: { ...templates.reports, showLogo: value } })}
            aria-label="Show logo"
          />
        </label>
      </SettingsCard>
    </>
  );
}
