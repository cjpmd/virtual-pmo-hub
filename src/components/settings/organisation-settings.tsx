import { RotateCcw, Trash2, Upload } from "lucide-react";
import { sectors, toSector } from "@/data/sectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orgDisplayNames, orgInitials, resetSettings, useSettings } from "@/services/settings";
import { Field, SelectField, SettingsCard, TextField } from "@/components/settings/settings-shell";
import { setPendingLogo } from "@/components/auth/settings-sync";
import { OrganisationDeletionSettings } from "@/components/settings/organisation-deletion-settings";
import { patch } from "./settings-helpers";

export function OrganisationSettings() {
  const settings = useSettings();
  const organisation = settings.organisation;
  const display = orgDisplayNames(settings);
  return (
    <>
      <SettingsCard
        title="Organisation"
        description="The name, mark and colour used across the workspace and on every exported pack."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Organisation name"
            value={organisation.name}
            onChange={(value) => patch("organisation", { name: value })}
            placeholder={display.name}
          />
          <TextField
            label="Short name"
            value={organisation.shortName}
            onChange={(value) => patch("organisation", { shortName: value })}
            placeholder={display.name}
            hint="Used on the sidebar mark and in compact headers. Leave blank to use the organisation name."
          />
          <TextField
            label="Support contact"
            value={organisation.supportContact}
            onChange={(value) => patch("organisation", { supportContact: value })}
            hint="Optional."
            wide
          />
          <SelectField
            label="Sector"
            value={organisation.sector}
            onChange={(value) => patch("organisation", { sector: toSector(value) })}
            options={sectors.map((item) => ({ value: item.value, label: item.label }))}
            hint="Changes only what Restore and Reset bring back and the suggested financial year. Your existing lists, categories and forums stay as they are."
            wide
          />
          <Field
            label="Primary brand colour"
            hint="Updates the accent colour across the whole app immediately."
          >
            <div className="flex items-center gap-3">
              <input
                type="color"
                aria-label="Primary brand colour"
                value={organisation.brandColour}
                onChange={(event) => patch("organisation", { brandColour: event.target.value })}
                className="h-9 w-14 cursor-pointer rounded border border-input bg-background"
              />
              <Input
                value={organisation.brandColour}
                onChange={(event) => patch("organisation", { brandColour: event.target.value })}
                className="max-w-32"
              />
            </div>
          </Field>
          <Field label="Logo">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-md border bg-muted text-xs font-bold">
                {organisation.logoDataUrl ? (
                  <img
                    src={organisation.logoDataUrl}
                    alt="Organisation logo"
                    className="size-9 object-contain"
                  />
                ) : (
                  orgInitials(display.shortName)
                )}
              </span>
              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent/40">
                <Upload className="size-4" />
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    setPendingLogo(file);
                    reader.onload = () =>
                      patch("organisation", { logoDataUrl: String(reader.result ?? "") });
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              {organisation.logoDataUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => patch("organisation", { logoDataUrl: "" })}
                >
                  <Trash2 />
                  Remove
                </Button>
              )}
            </div>
          </Field>
        </div>
      </SettingsCard>
      <SettingsCard
        title="Reset"
        description="Restore every setting in this workspace to the shipped defaults."
      >
        <Button variant="outline" onClick={() => resetSettings()}>
          <RotateCcw />
          Reset all settings
        </Button>
      </SettingsCard>
      <OrganisationDeletionSettings />
    </>
  );
}
