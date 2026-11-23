import { Input } from "@/components/ui/input";
import type { AppSettings } from "@/data/settings-types";
import type { BenefitCategory } from "@/data/types";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { useSettings } from "@/services/settings";
import {
  ListEditor,
  NumberField,
  SelectField,
  SettingsCard,
} from "@/components/settings/settings-shell";
import { patch } from "./settings-helpers";
import { CLASSIFICATION_LABEL, CLASSIFICATION_VALUE } from "@/lib/benefit-classification";
import type { BenefitClassification } from "@/data/types";
import { FixedList } from "./fixed-list";

export function BenefitSettingsSection() {
  const settings = useSettings();
  const benefits = settings.benefits;
  const set = (value: Partial<AppSettings["benefits"]>) => patch("benefits", value);
  return (
    <>
      <SettingsCard
        requires="pmo"
        title="Benefit categories and classifications"
        description="The controlled lists offered when a benefit profile is created."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <ListEditor
            label="Categories"
            values={benefits.categories}
            onChange={(values) => set({ categories: values as BenefitCategory[] })}
          />
          <FixedList label="Classifications" values={benefits.classifications} />
        </div>
      </SettingsCard>
      <CategoryDefaultsCard />
      <SettingsCard
        title="Optimism bias"
        requires="pmo"
        description="Green Book style uplifts applied to raw benefit estimates in business cases and request appraisal. Both raw and adjusted figures are always shown."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead className="bg-table-head text-xs text-muted-foreground">
              <tr>
                <th className="h-10 px-3 font-semibold">Category</th>
                <th className="w-40 px-3 font-semibold">Bias</th>
                <th className="px-3 font-semibold">
                  {formatCompactCurrency(100_000, settings)} raw becomes
                </th>
              </tr>
            </thead>
            <tbody>
              {benefits.optimismBias.map((entry) => (
                <tr key={entry.category} className="border-t">
                  <td className="px-3 py-2.5">{entry.category}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="80"
                        value={entry.percentage}
                        aria-label={`Optimism bias for ${entry.category}`}
                        onChange={(event) =>
                          set({
                            optimismBias: benefits.optimismBias.map((item) =>
                              item.category === entry.category
                                ? {
                                    ...item,
                                    percentage: Math.max(
                                      0,
                                      Math.min(80, Number(event.target.value)),
                                    ),
                                  }
                                : item,
                            ),
                          })
                        }
                        className="h-9 w-20"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {formatCurrency(100_000 * (1 - entry.percentage / 100), settings)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>
      <SettingsCard
        title="Measurement defaults"
        description="Applied to a new measure unless the benefit owner chooses otherwise."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Default frequency"
            value={benefits.defaultMeasurementFrequency}
            onChange={(value) =>
              set({
                defaultMeasurementFrequency:
                  value as AppSettings["benefits"]["defaultMeasurementFrequency"],
              })
            }
            options={["Monthly", "Quarterly", "Annually"].map((item) => ({
              value: item,
              label: item,
            }))}
          />
          <NumberField
            label="Default appraisal period (years)"
            value={benefits.appraisalYears}
            onChange={(value) => set({ appraisalYears: Math.max(1, Math.min(15, value)) })}
            min={1}
            max={15}
          />
        </div>
      </SettingsCard>
    </>
  );
}

/**
 * NHS-2: the classification each category suggests when a benefit is given it (people can still
 * change it). Cash-releasing and non-cash value are always reported apart.
 */
function CategoryDefaultsCard() {
  const settings = useSettings();
  const benefits = settings.benefits;
  const keys = benefits.categoryKeys ?? {};
  const map = benefits.categoryClassification ?? {};
  const options = [
    { value: "", label: "No default" },
    ...Object.values(CLASSIFICATION_LABEL).map((label) => ({ value: label, label })),
  ];
  const choose = (categoryValue: string, label: string) => {
    const next = { ...map };
    if (label) next[categoryValue] = CLASSIFICATION_VALUE[label as BenefitClassification];
    else delete next[categoryValue];
    patch("benefits", { categoryClassification: next });
  };
  return (
    <SettingsCard
      title="Default classification by category"
      description="Pre-selected when a benefit is given a category; people can change it. Cash-releasing and non-cash value are always reported separately."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {benefits.categories.map((category) => {
          const value = keys[category];
          if (!value) return null;
          const stored = map[value];
          return (
            <SelectField
              key={value}
              label={category}
              value={stored ? (CLASSIFICATION_LABEL[stored] ?? "") : ""}
              onChange={(label) => choose(value, label)}
              options={options}
            />
          );
        })}
      </div>
    </SettingsCard>
  );
}
