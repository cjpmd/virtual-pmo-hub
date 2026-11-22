import { useSettings } from "@/services/settings";
import { anyModuleEnabled, isModuleEnabled } from "@/lib/modules";
import { ListEditor, SettingsCard } from "@/components/settings/settings-shell";
import { patch } from "./settings-helpers";

export function ListsSettings() {
  const settings = useSettings();
  const lists = settings.lists;
  return (
    <SettingsCard
      requires="pmo"
      title="Lists & categories"
      description="Shared controlled lists used across lessons, projects, collections and financials. Removing a cost category hides it from new lines; existing lines keep it."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <ListEditor
          label="Lessons categories"
          values={lists.lessonCategories}
          onChange={(values) => patch("lists", { lessonCategories: values })}
        />
        <ListEditor
          label="Project types"
          values={lists.projectTypes}
          onChange={(values) => patch("lists", { projectTypes: values })}
        />
        <ListEditor
          label="Business units"
          values={lists.businessUnits}
          onChange={(values) => patch("lists", { businessUnits: values })}
        />
        <ListEditor
          label="Collection types"
          values={lists.collectionTypes}
          onChange={(values) => patch("lists", { collectionTypes: values })}
        />
        <ListEditor
          label="Tags"
          values={lists.tags}
          onChange={(values) => patch("lists", { tags: values })}
        />
        <ListEditor
          label="Cost categories"
          values={lists.costCategories}
          onChange={(values) => patch("lists", { costCategories: values })}
        />
        <ListEditor
          label="Funding sources"
          values={lists.fundingSources}
          onChange={(values) => patch("lists", { fundingSources: values })}
        />
        {/* NHS-0: shown once a module is on (or the organisation already has roles). */}
        {(anyModuleEnabled(settings) || lists.governanceRoles.length > 0) && (
          <ListEditor
            label="Governance roles"
            values={lists.governanceRoles}
            onChange={(values) => patch("lists", { governanceRoles: values })}
          />
        )}
        {/* NHS-1: strategic risk appetite levels (Board assurance). */}
        {(isModuleEnabled("assurance", settings) || lists.riskAppetite.length > 0) && (
          <ListEditor
            label="Risk appetite levels"
            values={lists.riskAppetite}
            onChange={(values) => patch("lists", { riskAppetite: values })}
          />
        )}
      </div>
    </SettingsCard>
  );
}
