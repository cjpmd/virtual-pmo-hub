import { Input } from "@/components/ui/input";
import type { TermKey } from "@/data/settings-types";
import { MODULE_TERM_KEYS, moduleTermLabels, neutralModuleTerms } from "@/data/sector-packs";
import { anyModuleEnabled } from "@/lib/modules";
import { updateSettings, useSettings } from "@/services/settings";
import { Field, SettingsCard } from "@/components/settings/settings-shell";

const termGroups: Array<{ title: string; keys: TermKey[] }> = [
  {
    title: "Structure",
    keys: [
      "portfolio",
      "programme",
      "programmePlural",
      "project",
      "projectPlural",
      "collection",
      "collectionPlural",
    ],
  },
  { title: "Roles", keys: ["programmeManager", "projectManager", "projectOfficer", "sponsor"] },
  {
    title: "Delivery",
    keys: ["task", "milestone", "milestonePlural", "stage", "dependency", "dependencyPlural"],
  },
  {
    title: "Governance and value",
    keys: ["risk", "issue", "decision", "assumption", "lesson", "benefit", "benefitPlural"],
  },
];

export function TerminologySettings() {
  const settings = useSettings();
  const terms = settings.terminology.terms;
  return (
    <SettingsCard
      title="Terminology"
      description="Rename the core entities and roles. Changes apply to navigation, tabs, breadcrumbs and labels throughout the app."
    >
      <div className="space-y-6">
        {termGroups.map((group) => (
          <div key={group.title}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.keys.map((key) => (
                <Field
                  key={key}
                  label={key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (character) => character.toUpperCase())}
                >
                  <Input
                    value={terms[key]}
                    onChange={(event) =>
                      updateSettings({
                        terminology: { terms: { ...terms, [key]: event.target.value } },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}
        {/* NHS-0: wording for module concepts, once a module is on. Blank uses the neutral word. */}
        {anyModuleEnabled(settings) && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Modules
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {MODULE_TERM_KEYS.map((key) => (
                <Field key={key} label={moduleTermLabels[key]}>
                  <Input
                    value={(terms as Record<string, string>)[key] ?? ""}
                    placeholder={neutralModuleTerms[key]}
                    onChange={(event) =>
                      updateSettings({
                        terminology: { terms: { ...terms, [key]: event.target.value } },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}
