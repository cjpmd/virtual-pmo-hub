import { Plus, Trash2 } from "lucide-react";
import { financialYearStartFor, sectorLabel } from "@/data/sectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  currencies,
  dateFormats,
  dayNames,
  locales,
  monthNames,
  timeZones,
} from "@/data/settings-data";
import type { AppSettings } from "@/data/settings-types";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatFinancialYear,
  fromIsoDate,
} from "@/lib/format";
import { todayIso } from "@/lib/today";
import { useSettings } from "@/services/settings";
import {
  Field,
  NumberField,
  SelectField,
  SettingsCard,
} from "@/components/settings/settings-shell";
import { sample, patch } from "./settings-helpers";

export function RegionalSettings() {
  const settings = useSettings();
  const regional = settings.regional;
  const set = (value: Partial<AppSettings["regional"]>) => patch("regional", value);
  return (
    <>
      <SettingsCard
        title="Currency"
        description="Every amount in the app, in charts and in exports uses this format."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Base currency"
            value={regional.baseCurrency}
            onChange={(value) => set({ baseCurrency: value })}
            options={currencies.map((item) => ({
              value: item.code,
              label: `${item.code} — ${item.name} (${item.symbol})`,
            }))}
          />
          <SelectField
            label="Symbol position"
            value={regional.symbolPosition}
            onChange={(value) => set({ symbolPosition: value as "before" | "after" })}
            options={[
              { value: "before", label: "Before the amount" },
              { value: "after", label: "After the amount" },
            ]}
          />
          <NumberField
            label="Decimal places"
            value={regional.decimalPlaces}
            onChange={(value) => set({ decimalPlaces: Math.max(0, Math.min(4, value)) })}
            min={0}
            max={4}
          />
          <SelectField
            label="Thousands separator"
            value={regional.thousandsSeparator}
            onChange={(value) => set({ thousandsSeparator: value })}
            options={[
              { value: ",", label: "Comma (1,250,000)" },
              { value: ".", label: "Full stop (1.250.000)" },
              { value: " ", label: "Space (1 250 000)" },
              { value: "", label: "None (1250000)" },
            ]}
          />
          <SelectField
            label="Decimal separator"
            value={regional.decimalSeparator}
            onChange={(value) => set({ decimalSeparator: value })}
            options={[
              { value: ".", label: "Full stop (1.50)" },
              { value: ",", label: "Comma (1,50)" },
            ]}
          />
          <Field
            label="Compact formatting"
            hint="Shows large amounts as 1.2m and 350k on cards and charts."
          >
            <div className="flex h-9 items-center">
              <Switch
                checked={regional.compactFormatting}
                onCheckedChange={(value) => set({ compactFormatting: value })}
                aria-label="Compact formatting"
              />
            </div>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-6 rounded-md border bg-muted/30 p-4 text-sm">
          <span>
            <span className="text-xs text-muted-foreground">Full</span>
            <br />
            <strong>{formatCurrency(sample, settings)}</strong>
          </span>
          <span>
            <span className="text-xs text-muted-foreground">Compact</span>
            <br />
            <strong>{formatCompactCurrency(sample, settings)}</strong>
          </span>
          <span>
            <span className="text-xs text-muted-foreground">Negative</span>
            <br />
            <strong>{formatCurrency(-42_500, settings)}</strong>
          </span>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Multi-currency"
        description="Let projects hold their own currency and convert every roll-up back to the base currency."
        actions={
          <Switch
            checked={regional.multiCurrency}
            onCheckedChange={(value) => set({ multiCurrency: value })}
            aria-label="Multi-currency"
          />
        }
      >
        {regional.multiCurrency ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-table-head text-xs text-muted-foreground">
                <tr>
                  <th className="h-10 px-3 font-semibold">Currency</th>
                  <th className="px-3 font-semibold">Rate to {regional.baseCurrency}</th>
                  <th className="px-3 font-semibold">Effective from</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {regional.exchangeRates.map((rate) => (
                  <tr key={rate.id} className="border-t">
                    <td className="px-3 py-2">
                      <select
                        value={rate.currency}
                        onChange={(event) =>
                          set({
                            exchangeRates: regional.exchangeRates.map((item) =>
                              item.id === rate.id
                                ? { ...item, currency: event.target.value }
                                : item,
                            ),
                          })
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {currencies.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.code}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.0001"
                        value={rate.rate}
                        onChange={(event) =>
                          set({
                            exchangeRates: regional.exchangeRates.map((item) =>
                              item.id === rate.id
                                ? { ...item, rate: Number(event.target.value) }
                                : item,
                            ),
                          })
                        }
                        className="h-8 w-28"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={rate.effectiveDate}
                        onChange={(event) =>
                          set({
                            exchangeRates: regional.exchangeRates.map((item) =>
                              item.id === rate.id
                                ? { ...item, effectiveDate: event.target.value }
                                : item,
                            ),
                          })
                        }
                        className="h-8 w-32"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove rate"
                        onClick={() =>
                          set({
                            exchangeRates: regional.exchangeRates.filter(
                              (item) => item.id !== rate.id,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() =>
                set({
                  exchangeRates: [
                    ...regional.exchangeRates,
                    {
                      id: `fx-${Date.now()}`,
                      currency: "EUR",
                      rate: 1,
                      effectiveDate: fromIsoDate(todayIso()),
                    },
                  ],
                })
              }
            >
              <Plus />
              Add rate
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Off. Every project is held in {regional.baseCurrency} and no conversion is applied.
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title="Dates, locale and financial year"
        description="Date display, week start and the financial year used by every FY label and chart."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Date format"
            value={regional.dateFormat}
            onChange={(value) => set({ dateFormat: value })}
            options={dateFormats.map((item) => ({
              value: item,
              label: `${item} — ${formatDate(todayIso(), { ...settings, regional: { ...regional, dateFormat: item } })}`,
            }))}
          />
          <SelectField
            label="Locale"
            value={regional.locale}
            onChange={(value) => set({ locale: value })}
            options={locales.map((item) => ({ value: item, label: item }))}
          />
          <SelectField
            label="Time zone"
            value={regional.timeZone}
            onChange={(value) => set({ timeZone: value })}
            options={timeZones.map((item) => ({ value: item, label: item }))}
          />
          <SelectField
            label="First day of week"
            value={String(regional.firstDayOfWeek)}
            onChange={(value) => set({ firstDayOfWeek: Number(value) })}
            options={dayNames.map((name, index) => ({ value: String(index), label: name }))}
          />
          <SelectField
            label="Financial year starts"
            value={String(regional.financialYearStartMonth)}
            onChange={(value) => set({ financialYearStartMonth: Number(value) })}
            options={monthNames.map((name, index) => ({ value: String(index + 1), label: name }))}
            hint={`Today sits in ${formatFinancialYear(todayIso(), settings)}.${
              regional.financialYearStartMonth ===
              financialYearStartFor(settings.organisation.sector)
                ? ""
                : ` Suggested for ${sectorLabel(settings.organisation.sector)}: ${
                    monthNames[financialYearStartFor(settings.organisation.sector) - 1]
                  }.`
            }`}
          />
        </div>
      </SettingsCard>
    </>
  );
}
