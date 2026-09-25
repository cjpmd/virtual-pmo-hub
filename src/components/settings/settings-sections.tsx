import { useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Download, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { defaultLifecyclePhases, defaultTierDefinitions } from "@/data/lifecycle";
const getDefaultPhases = () => JSON.parse(JSON.stringify(defaultLifecyclePhases)) as typeof defaultLifecyclePhases;
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { currencies, dateFormats, dayNames, locales, monthNames, notificationEvents, timeZones } from "@/data/settings-data";
import type { AppSettings, PermissionKey, TermKey, UserRole } from "@/data/settings-types";
import type { BenefitCategory, ProjectTier } from "@/data/types";
import { formatCompactCurrency, formatCurrency, formatDate, formatFinancialYear } from "@/lib/format";
import { getLifecyclePhases, getTierDefinitions } from "@/services/pmo";
import { resetSettings, updateSettings, useSettings } from "@/services/settings";
import { Field, ListEditor, NumberField, SelectField, SettingsCard, TextField } from "@/components/settings/settings-shell";
import { cn } from "@/lib/utils";

const sample = 1_248_500;
const patch = <K extends keyof AppSettings>(key: K, value: Partial<AppSettings[K]>) => updateSettings({ [key]: value } as Partial<AppSettings>);

export function OrganisationSettings() {
  const settings = useSettings();
  const organisation = settings.organisation;
  return <>
    <SettingsCard title="Organisation" description="The name, mark and colour used across the workspace and on every exported pack.">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Organisation name" value={organisation.name} onChange={value => patch("organisation", { name: value })} />
        <TextField label="Short name" value={organisation.shortName} onChange={value => patch("organisation", { shortName: value })} hint="Used on the sidebar mark and in compact headers." />
        <TextField label="Support contact" value={organisation.supportContact} onChange={value => patch("organisation", { supportContact: value })} wide />
        <Field label="Primary brand colour" hint="Updates the accent colour across the whole app immediately.">
          <div className="flex items-center gap-3">
            <input type="color" aria-label="Primary brand colour" value={organisation.brandColour} onChange={event => patch("organisation", { brandColour: event.target.value })} className="h-9 w-14 cursor-pointer rounded border border-input bg-background" />
            <Input value={organisation.brandColour} onChange={event => patch("organisation", { brandColour: event.target.value })} className="max-w-32" />
          </div>
        </Field>
        <Field label="Logo">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md border bg-muted text-xs font-bold">
              {organisation.logoDataUrl ? <img src={organisation.logoDataUrl} alt="Organisation logo" className="size-9 object-contain" /> : organisation.shortName.slice(0, 2).toUpperCase()}
            </span>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm hover:bg-accent/40">
              <Upload className="size-4" />Upload
              <input type="file" accept="image/*" className="hidden" onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => patch("organisation", { logoDataUrl: String(reader.result ?? "") });
                reader.readAsDataURL(file);
              }} />
            </label>
            {organisation.logoDataUrl && <Button size="sm" variant="ghost" onClick={() => patch("organisation", { logoDataUrl: "" })}><Trash2 />Remove</Button>}
          </div>
        </Field>
      </div>
    </SettingsCard>
    <SettingsCard title="Reset" description="Restore every setting in this workspace to the shipped defaults.">
      <Button variant="outline" onClick={() => resetSettings()}><RotateCcw />Reset all settings</Button>
    </SettingsCard>
  </>;
}

export function RegionalSettings() {
  const settings = useSettings();
  const regional = settings.regional;
  const set = (value: Partial<AppSettings["regional"]>) => patch("regional", value);
  return <>
    <SettingsCard title="Currency" description="Every amount in the app, in charts and in exports uses this format.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SelectField label="Base currency" value={regional.baseCurrency} onChange={value => set({ baseCurrency: value })} options={currencies.map(item => ({ value: item.code, label: `${item.code} — ${item.name} (${item.symbol})` }))} />
        <SelectField label="Symbol position" value={regional.symbolPosition} onChange={value => set({ symbolPosition: value as "before" | "after" })} options={[{ value: "before", label: "Before the amount" }, { value: "after", label: "After the amount" }]} />
        <NumberField label="Decimal places" value={regional.decimalPlaces} onChange={value => set({ decimalPlaces: Math.max(0, Math.min(4, value)) })} min={0} max={4} />
        <SelectField label="Thousands separator" value={regional.thousandsSeparator} onChange={value => set({ thousandsSeparator: value })} options={[{ value: ",", label: "Comma (1,250,000)" }, { value: ".", label: "Full stop (1.250.000)" }, { value: " ", label: "Space (1 250 000)" }, { value: "", label: "None (1250000)" }]} />
        <SelectField label="Decimal separator" value={regional.decimalSeparator} onChange={value => set({ decimalSeparator: value })} options={[{ value: ".", label: "Full stop (1.50)" }, { value: ",", label: "Comma (1,50)" }]} />
        <Field label="Compact formatting" hint="Shows large amounts as 1.2m and 350k on cards and charts.">
          <div className="flex h-9 items-center"><Switch checked={regional.compactFormatting} onCheckedChange={value => set({ compactFormatting: value })} aria-label="Compact formatting" /></div>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-6 rounded-md border bg-muted/30 p-4 text-sm">
        <span><span className="text-xs text-muted-foreground">Full</span><br /><strong>{formatCurrency(sample, settings)}</strong></span>
        <span><span className="text-xs text-muted-foreground">Compact</span><br /><strong>{formatCompactCurrency(sample, settings)}</strong></span>
        <span><span className="text-xs text-muted-foreground">Negative</span><br /><strong>{formatCurrency(-42_500, settings)}</strong></span>
      </div>
    </SettingsCard>

    <SettingsCard title="Multi-currency" description="Let projects hold their own currency and convert every roll-up back to the base currency."
      actions={<Switch checked={regional.multiCurrency} onCheckedChange={value => set({ multiCurrency: value })} aria-label="Multi-currency" />}>
      {regional.multiCurrency ? <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-3 font-semibold">Currency</th><th className="px-3 font-semibold">Rate to {regional.baseCurrency}</th><th className="px-3 font-semibold">Effective from</th><th className="w-12" /></tr></thead>
          <tbody>
            {regional.exchangeRates.map(rate => <tr key={rate.id} className="border-t">
              <td className="px-3 py-2"><select value={rate.currency} onChange={event => set({ exchangeRates: regional.exchangeRates.map(item => item.id === rate.id ? { ...item, currency: event.target.value } : item) })} className="h-8 rounded-md border border-input bg-background px-2 text-sm">{currencies.map(item => <option key={item.code} value={item.code}>{item.code}</option>)}</select></td>
              <td className="px-3 py-2"><Input type="number" step="0.0001" value={rate.rate} onChange={event => set({ exchangeRates: regional.exchangeRates.map(item => item.id === rate.id ? { ...item, rate: Number(event.target.value) } : item) })} className="h-8 w-28" /></td>
              <td className="px-3 py-2"><Input value={rate.effectiveDate} onChange={event => set({ exchangeRates: regional.exchangeRates.map(item => item.id === rate.id ? { ...item, effectiveDate: event.target.value } : item) })} className="h-8 w-32" /></td>
              <td className="px-3 py-2"><Button size="icon" variant="ghost" aria-label="Remove rate" onClick={() => set({ exchangeRates: regional.exchangeRates.filter(item => item.id !== rate.id) })}><Trash2 className="size-4" /></Button></td>
            </tr>)}
          </tbody>
        </table>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => set({ exchangeRates: [...regional.exchangeRates, { id: `fx-${Date.now()}`, currency: "EUR", rate: 1, effectiveDate: "01/08/2026" }] })}><Plus />Add rate</Button>
      </div> : <p className="text-sm text-muted-foreground">Off. Every project is held in {regional.baseCurrency} and no conversion is applied.</p>}
    </SettingsCard>

    <SettingsCard title="Dates, locale and financial year" description="Date display, week start and the financial year used by every FY label and chart.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SelectField label="Date format" value={regional.dateFormat} onChange={value => set({ dateFormat: value })} options={dateFormats.map(item => ({ value: item, label: `${item} — ${formatDate("21/09/2026", { ...settings, regional: { ...regional, dateFormat: item } })}` }))} />
        <SelectField label="Locale" value={regional.locale} onChange={value => set({ locale: value })} options={locales.map(item => ({ value: item, label: item }))} />
        <SelectField label="Time zone" value={regional.timeZone} onChange={value => set({ timeZone: value })} options={timeZones.map(item => ({ value: item, label: item }))} />
        <SelectField label="First day of week" value={String(regional.firstDayOfWeek)} onChange={value => set({ firstDayOfWeek: Number(value) })} options={dayNames.map((name, index) => ({ value: String(index), label: name }))} />
        <SelectField label="Financial year starts" value={String(regional.financialYearStartMonth)} onChange={value => set({ financialYearStartMonth: Number(value) })} options={monthNames.map((name, index) => ({ value: String(index + 1), label: name }))}
          hint={`Today sits in ${formatFinancialYear("21/09/2026", settings)}.`} />
      </div>
    </SettingsCard>
  </>;
}

export function WorkingTimeSettings() {
  const settings = useSettings();
  const working = settings.workingTime;
  const set = (value: Partial<AppSettings["workingTime"]>) => patch("workingTime", value);
  return <>
    <SettingsCard title="Standard working time" description="Used for capacity, allocation and every effort calculation.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <NumberField label="Hours per week" value={working.hoursPerWeek} onChange={value => set({ hoursPerWeek: value })} step={0.25} />
        <NumberField label="Hours per day" value={working.hoursPerDay} onChange={value => set({ hoursPerDay: value })} step={0.25} />
        <NumberField label="Default BAU percentage" value={working.defaultBauPercentage} onChange={value => set({ defaultBauPercentage: value })} min={0} max={100} hint="Deducted before delivery capacity is offered." />
      </div>
      <div className="mt-4">
        <p className="text-xs font-semibold text-muted-foreground">Working days</p>
        <div className="mt-2 flex flex-wrap gap-2">{dayNames.map((name, index) => {
          const on = working.workingDays.includes(index);
          return <button key={name} onClick={() => set({ workingDays: on ? working.workingDays.filter(day => day !== index) : [...working.workingDays, index].sort() })}
            className={cn("rounded-full border px-3 py-1 text-xs font-medium", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent/40")}>{name.slice(0, 3)}</button>;
        })}</div>
      </div>
    </SettingsCard>
    <SettingsCard title="Public holiday calendars" description="Holidays are excluded from capacity and from working-day calculations."
      actions={<Button size="sm" variant="outline" onClick={() => set({ holidayCalendars: [...working.holidayCalendars, { id: `cal-${Date.now()}`, name: "New calendar", dates: [] }] })}><Plus />Add calendar</Button>}>
      <div className="space-y-4">
        {working.holidayCalendars.map(calendar => <div key={calendar.id} className="rounded-md border p-4">
          <div className="flex items-center gap-2">
            <Input value={calendar.name} onChange={event => set({ holidayCalendars: working.holidayCalendars.map(item => item.id === calendar.id ? { ...item, name: event.target.value } : item) })} className="h-9 max-w-64" />
            <span className="text-xs text-muted-foreground">{calendar.dates.length} dates</span>
            <Button size="icon" variant="ghost" className="ml-auto" aria-label="Remove calendar" onClick={() => set({ holidayCalendars: working.holidayCalendars.filter(item => item.id !== calendar.id) })}><Trash2 className="size-4" /></Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[...calendar.dates].sort((a, b) => a.date.localeCompare(b.date)).map(entry => <span key={`${entry.date}-${entry.name}`} className="rounded-full border bg-background px-2.5 py-1 text-xs">{formatDate(entry.date, settings)} · {entry.name}</span>)}
          </div>
        </div>)}
      </div>
    </SettingsCard>
  </>;
}

const termGroups: Array<{ title: string; keys: TermKey[] }> = [
  { title: "Structure", keys: ["portfolio", "programme", "programmePlural", "project", "projectPlural", "collection", "collectionPlural"] },
  { title: "Roles", keys: ["programmeManager", "projectManager", "projectOfficer", "sponsor"] },
  { title: "Delivery", keys: ["task", "milestone", "milestonePlural", "stage", "dependency", "dependencyPlural"] },
  { title: "Governance and value", keys: ["risk", "issue", "decision", "assumption", "lesson", "benefit", "benefitPlural"] },
];

export function TerminologySettings() {
  const settings = useSettings();
  const terms = settings.terminology.terms;
  return <SettingsCard title="Terminology" description="Rename the core entities and roles. Changes apply to navigation, tabs, breadcrumbs and labels throughout the app.">
    <div className="space-y-6">
      {termGroups.map(group => <div key={group.title}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {group.keys.map(key => <Field key={key} label={key.replace(/([A-Z])/g, " $1").replace(/^./, character => character.toUpperCase())}>
            <Input value={terms[key]} onChange={event => updateSettings({ terminology: { terms: { ...terms, [key]: event.target.value } } })} />
          </Field>)}
        </div>
      </div>)}
    </div>
  </SettingsCard>;
}

export function LifecycleSettings() {
  const settings = useSettings();
  const health = settings.health;
  const set = (value: Partial<AppSettings["health"]>) => patch("health", value);
  const phases = settings.lifecycle?.phases?.length ? settings.lifecycle.phases : getLifecyclePhases();
  const tiers = getTierDefinitions();
  const [activeId, setActiveId] = useState(phases[0]?.id ?? "");
  const active = phases.find(phase => phase.id === activeId) ?? phases[0];
  const allTiers: ProjectTier[] = ["Small", "Medium", "Large"];
  const save = (next: typeof phases) => updateSettings({ lifecycle: { ...settings.lifecycle, phases: next } });
  const saveTiers = (next: typeof tiers) => updateSettings({ lifecycle: { ...settings.lifecycle, tiers: next } });
  const updatePhase = (id: string, value: Partial<(typeof phases)[number]>) => save(phases.map(phase => phase.id === id ? { ...phase, ...value } : phase));
  const updateCriterion = (criterionId: string, value: Partial<(typeof phases)[number]["criteria"][number]>) => active && updatePhase(active.id, { criteria: active.criteria.map(item => item.id === criterionId ? { ...item, ...value } : item) });
  const addPhase = () => {
    const id = `phase-${Date.now()}`;
    const number = phases.length + 1;
    save([...phases, { id, name: `Phase ${number} - New phase`, shortName: `Phase ${number}`, gateName: `GATE ${number} - New gate`, description: "Describe what happens in this phase.", criteria: [] }]);
    setActiveId(id);
  };
  const movePhase = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= phases.length) return;
    const next = [...phases];
    const moved = next[index]!; next[index] = next[target]!; next[target] = moved;
    save(next);
  };
  const removePhase = (id: string) => {
    if (phases.length <= 1) return;
    if (!window.confirm("Remove this phase and its gate criteria? Projects currently in this phase will show as the first phase.")) return;
    const next = phases.filter(phase => phase.id !== id);
    save(next);
    setActiveId(next[0]?.id ?? "");
  };
  const addCriterion = () => active && updatePhase(active.id, { criteria: [...active.criteria, { id: `c-${Date.now()}`, label: "New gate criterion", tiers: [...allTiers] }] });
  const removeCriterion = (criterionId: string) => active && updatePhase(active.id, { criteria: active.criteria.filter(item => item.id !== criterionId) });
  const toggleTier = (criterionId: string, tier: ProjectTier, current: ProjectTier[]) => updateCriterion(criterionId, { tiers: current.includes(tier) ? current.filter(item => item !== tier) : allTiers.filter(item => item === tier || current.includes(item)) });
  return <>
    <SettingsCard title="Lifecycle phases and gates" description="Add, rename, reorder or remove phases, and edit each phase's exit gate criteria. Criteria marked as automatic are evaluated from live data on the project page." actions={<Button size="sm" variant="outline" onClick={() => save(getDefaultPhases())}><RotateCcw className="size-4" />Restore to Default Lifecycle</Button>}>
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <ul className="space-y-2">{phases.map((phase, index) => <li key={phase.id} className={cn("flex items-stretch rounded-md border", phase.id === active?.id ? "border-primary bg-primary/5" : "hover:bg-accent/30")}>
            <button onClick={() => setActiveId(phase.id)} className="min-w-0 flex-1 p-3 text-left">
              <span className="block truncate text-sm font-medium">{phase.name}</span>
              <span className="block text-[11px] text-muted-foreground">{phase.criteria.length} gate criteria · step {index + 1}</span>
            </button>
            <div className="flex flex-col justify-center pr-1">
              <button aria-label={`Move ${phase.name} up`} disabled={index === 0} onClick={() => movePhase(index, -1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
              <button aria-label={`Move ${phase.name} down`} disabled={index === phases.length - 1} onClick={() => movePhase(index, 1)} className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
            </div>
          </li>)}</ul>
          <Button size="sm" variant="outline" className="w-full" onClick={addPhase}><Plus className="size-4" />Add phase</Button>
        </div>
        {active && <div className="space-y-4 rounded-md border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Phase name" value={active.name} onChange={value => updatePhase(active.id, { name: value })} hint="Renaming a phase used by existing projects will move them to the first phase." />
            <TextField label="Short name" value={active.shortName} onChange={value => updatePhase(active.id, { shortName: value })} />
            <TextField label="Exit gate name" value={active.gateName} onChange={value => updatePhase(active.id, { gateName: value })} wide />
            <Field label="Description" wide><Textarea value={active.description} onChange={event => updatePhase(active.id, { description: event.target.value })} rows={2} /></Field>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Gate criteria</p>
              <Button size="sm" variant="outline" onClick={addCriterion}><Plus className="size-4" />Add criterion</Button>
            </div>
            <ul className="mt-3 space-y-3">{active.criteria.map(criterion => <li key={criterion.id} className="rounded-md border border-border/70 p-3">
              <div className="flex items-start gap-2">
                <Input aria-label="Criterion" value={criterion.label} onChange={event => updateCriterion(criterion.id, { label: event.target.value })} className="flex-1" />
                <Button size="icon" variant="ghost" aria-label="Remove criterion" onClick={() => removeCriterion(criterion.id)}><Trash2 className="size-4" /></Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Input aria-label="Required document" placeholder="Required document (optional)" value={criterion.document ?? ""} onChange={event => updateCriterion(criterion.id, { document: event.target.value })} className="h-8 max-w-xs text-xs" />
                <span className="text-xs text-muted-foreground">Applies to:</span>
                {allTiers.map(tier => <label key={tier} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={criterion.tiers.includes(tier)} onChange={() => toggleTier(criterion.id, tier, criterion.tiers)} />{tier}</label>)}
                {criterion.check && <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Evaluated automatically</span>}
              </div>
            </li>)}
            {!active.criteria.length && <li className="text-sm text-muted-foreground">No criteria yet — add the first one.</li>}</ul>
          </div>
          <div className="flex justify-end border-t pt-3">
            <Button size="sm" variant="ghost" className="text-destructive" disabled={phases.length <= 1} onClick={() => removePhase(active.id)}><Trash2 className="size-4" />Remove phase</Button>
          </div>
        </div>}
      </div>
    </SettingsCard>

    <SettingsCard title="Project tiers" description="Tier decides which gate criteria and documents apply. Edit the guideline and description for each tier; tier names are fixed because existing projects reference them." actions={<Button size="sm" variant="outline" onClick={() => updateSettings({ lifecycle: { ...settings.lifecycle, tiers: defaultTierDefinitions } })}><RotateCcw className="size-4" />Restore default tiers</Button>}>
      <div className="grid gap-4 md:grid-cols-3">{tiers.map((tier) => <div key={tier.tier} className="space-y-3 rounded-md border p-4">
        <strong className="text-sm">{tier.tier}</strong>
        <Field label="Guideline"><Input value={tier.guideline} onChange={event => saveTiers(tiers.map(item => item.tier === tier.tier ? { ...item, guideline: event.target.value } : item))} /></Field>
        <Field label="Description"><Textarea rows={4} value={tier.description} onChange={event => saveTiers(tiers.map(item => item.tier === tier.tier ? { ...item, description: event.target.value } : item))} /></Field>
      </div>)}</div>
    </SettingsCard>

    <SettingsCard title="RAG health thresholds" description="The percentages used by the calculated schedule, effort, financial, benefit and dependency health rules.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <NumberField label="Schedule slip → Off Track (%)" value={health.scheduleSlipPercent} onChange={value => set({ scheduleSlipPercent: value })} hint="Slip against the baseline duration." />
        <NumberField label="Overdue tasks → At Risk (%)" value={health.taskOverdueAtRiskPercent} onChange={value => set({ taskOverdueAtRiskPercent: value })} />
        <NumberField label="Overdue tasks → Off Track (%)" value={health.taskOverdueOffTrackPercent} onChange={value => set({ taskOverdueOffTrackPercent: value })} />
        <NumberField label="Forecast over budget → At Risk (%)" value={health.financialAtRiskPercent} onChange={value => set({ financialAtRiskPercent: value })} />
        <NumberField label="Forecast over budget → Off Track (%)" value={health.financialOffTrackPercent} onChange={value => set({ financialOffTrackPercent: value })} />
        <NumberField label="Risk score → At Risk" value={health.riskScoreAtRisk} onChange={value => set({ riskScoreAtRisk: value })} />
        <NumberField label="Risk score → Off Track" value={health.riskScoreOffTrack} onChange={value => set({ riskScoreOffTrack: value })} />
        <NumberField label="Benefit behind profile → Off Track (%)" value={health.benefitBehindProfilePercent} onChange={value => set({ benefitBehindProfilePercent: value })} />
        <NumberField label="Dependency At Risk window (working days)" value={health.dependencyAtRiskWorkingDays} onChange={value => set({ dependencyAtRiskWorkingDays: value })} />
      </div>
    </SettingsCard>
  </>;
}

export function RiskSettings() {
  const settings = useSettings();
  const risk = settings.risk;
  const set = (value: Partial<AppSettings["risk"]>) => patch("risk", value);
  const lists = settings.lists;
  const resize = (size: 3 | 4 | 5) => set({
    matrixSize: size,
    probabilityLabels: Array.from({ length: size }, (_, index) => risk.probabilityLabels[index] ?? `Level ${index + 1}`),
    impactLabels: Array.from({ length: size }, (_, index) => risk.impactLabels[index] ?? `Level ${index + 1}`),
  });
  const bandFor = (score: number) => [...risk.bands].sort((a, b) => b.minScore - a.minScore).find(band => score >= band.minScore);
  return <>
    <SettingsCard title="Risk matrix" description="Matrix size, axis labels and the score bands used on every heat map and register.">
      <div className="flex flex-wrap gap-2">{([3, 4, 5] as const).map(size => <Button key={size} size="sm" variant={risk.matrixSize === size ? "default" : "outline"} onClick={() => resize(size)}>{size} × {size}</Button>)}</div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs font-semibold text-muted-foreground">Probability labels</p>
            <div className="mt-2 space-y-2">{risk.probabilityLabels.map((label, index) => <Input key={index} value={label} aria-label={`Probability ${index + 1}`} onChange={event => set({ probabilityLabels: risk.probabilityLabels.map((item, position) => position === index ? event.target.value : item) })} className="h-9" />)}</div>
          </div>
          <div><p className="text-xs font-semibold text-muted-foreground">Impact labels</p>
            <div className="mt-2 space-y-2">{risk.impactLabels.map((label, index) => <Input key={index} value={label} aria-label={`Impact ${index + 1}`} onChange={event => set({ impactLabels: risk.impactLabels.map((item, position) => position === index ? event.target.value : item) })} className="h-9" />)}</div>
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Preview</p>
          <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `28px repeat(${risk.matrixSize}, minmax(0,1fr))` }}>
            {Array.from({ length: risk.matrixSize }, (_, row) => risk.matrixSize - row).map(probability => <div key={probability} className="contents">
              <span className="grid place-items-center text-[10px] text-muted-foreground">{probability}</span>
              {Array.from({ length: risk.matrixSize }, (_, column) => column + 1).map(impact => {
                const score = probability * impact;
                return <span key={impact} title={`${risk.probabilityLabels[probability - 1]} × ${risk.impactLabels[impact - 1]} = ${score}`}
                  className="grid aspect-square place-items-center rounded text-[10px] font-bold text-white" style={{ background: bandFor(score)?.colour ?? "var(--muted)" }}>{score}</span>;
              })}
            </div>)}
          </div>
        </div>
      </div>
    </SettingsCard>

    <SettingsCard title="Score bands and appetite" description="Bands colour the heat map; anything at or above the appetite threshold is reported as outside appetite."
      actions={<Button size="sm" variant="outline" onClick={() => set({ bands: [...risk.bands, { id: `band-${Date.now()}`, label: "New band", minScore: 1, colour: "#64748b" }] })}><Plus />Add band</Button>}>
      <div className="space-y-3">
        {risk.bands.map(band => <div key={band.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <input type="color" aria-label={`${band.label} colour`} value={band.colour} onChange={event => set({ bands: risk.bands.map(item => item.id === band.id ? { ...item, colour: event.target.value } : item) })} className="h-8 w-12 cursor-pointer rounded border border-input" />
          <Input value={band.label} onChange={event => set({ bands: risk.bands.map(item => item.id === band.id ? { ...item, label: event.target.value } : item) })} className="h-9 max-w-40" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">Score from<Input type="number" value={band.minScore} onChange={event => set({ bands: risk.bands.map(item => item.id === band.id ? { ...item, minScore: Number(event.target.value) } : item) })} className="h-9 w-20" /></label>
          <Button size="icon" variant="ghost" className="ml-auto" aria-label={`Remove ${band.label}`} onClick={() => set({ bands: risk.bands.filter(item => item.id !== band.id) })}><Trash2 className="size-4" /></Button>
        </div>)}
      </div>
      <div className="mt-4 max-w-xs"><NumberField label="Risk appetite threshold" value={risk.appetiteThreshold} onChange={value => set({ appetiteThreshold: value })} hint="Risks scoring at or above this are reported to the board." /></div>
    </SettingsCard>

    <SettingsCard title="RAIDD option lists" description="The controlled values offered on issues, decisions, dependencies and changes.">
      <div className="grid gap-6 sm:grid-cols-2">
        <ListEditor label="Issue severity" values={lists.issueSeverities} onChange={values => patch("lists", { issueSeverities: values })} />
        <ListEditor label="Decision forums" values={lists.decisionForums} onChange={values => patch("lists", { decisionForums: values })} />
        <ListEditor label="Dependency types" values={lists.dependencyTypes} onChange={values => patch("lists", { dependencyTypes: values })} />
        <ListEditor label="Change types" values={lists.changeTypes} onChange={values => patch("lists", { changeTypes: values })} />
      </div>
    </SettingsCard>
  </>;
}

export function BenefitSettingsSection() {
  const settings = useSettings();
  const benefits = settings.benefits;
  const set = (value: Partial<AppSettings["benefits"]>) => patch("benefits", value);
  return <>
    <SettingsCard title="Benefit categories and classifications" description="The controlled lists offered when a benefit profile is created.">
      <div className="grid gap-6 sm:grid-cols-2">
        <ListEditor label="Categories" values={benefits.categories} onChange={values => set({ categories: values as BenefitCategory[] })} />
        <ListEditor label="Classifications" values={benefits.classifications} onChange={values => set({ classifications: values as AppSettings["benefits"]["classifications"] })} />
      </div>
    </SettingsCard>
    <SettingsCard title="Optimism bias" description="Green Book style uplifts applied to raw benefit estimates in business cases and request appraisal. Both raw and adjusted figures are always shown.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-3 font-semibold">Category</th><th className="w-40 px-3 font-semibold">Bias</th><th className="px-3 font-semibold">{formatCompactCurrency(100_000, settings)} raw becomes</th></tr></thead>
          <tbody>{benefits.optimismBias.map(entry => <tr key={entry.category} className="border-t">
            <td className="px-3 py-2.5">{entry.category}</td>
            <td className="px-3 py-2"><div className="flex items-center gap-2"><Input type="number" min="0" max="80" value={entry.percentage} aria-label={`Optimism bias for ${entry.category}`} onChange={event => set({ optimismBias: benefits.optimismBias.map(item => item.category === entry.category ? { ...item, percentage: Math.max(0, Math.min(80, Number(event.target.value))) } : item) })} className="h-9 w-20" /><span className="text-xs text-muted-foreground">%</span></div></td>
            <td className="px-3 py-2.5 text-muted-foreground">{formatCurrency(100_000 * (1 - entry.percentage / 100), settings)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </SettingsCard>
    <SettingsCard title="Measurement defaults" description="Applied to a new measure unless the benefit owner chooses otherwise.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SelectField label="Default frequency" value={benefits.defaultMeasurementFrequency} onChange={value => set({ defaultMeasurementFrequency: value as AppSettings["benefits"]["defaultMeasurementFrequency"] })} options={["Monthly", "Quarterly", "Annually"].map(item => ({ value: item, label: item }))} />
        <NumberField label="Default appraisal period (years)" value={benefits.appraisalYears} onChange={value => set({ appraisalYears: Math.max(1, Math.min(15, value)) })} min={1} max={15} />
      </div>
    </SettingsCard>
  </>;
}

export function ListsSettings() {
  const settings = useSettings();
  const lists = settings.lists;
  return <SettingsCard title="Lists & categories" description="Shared controlled lists used across lessons, projects and collections.">
    <div className="grid gap-6 sm:grid-cols-2">
      <ListEditor label="Lessons categories" values={lists.lessonCategories} onChange={values => patch("lists", { lessonCategories: values })} />
      <ListEditor label="Project types" values={lists.projectTypes} onChange={values => patch("lists", { projectTypes: values })} />
      <ListEditor label="Business units" values={lists.businessUnits} onChange={values => patch("lists", { businessUnits: values })} />
      <ListEditor label="Collection types" values={lists.collectionTypes} onChange={values => patch("lists", { collectionTypes: values })} />
      <ListEditor label="Tags" values={lists.tags} onChange={values => patch("lists", { tags: values })} />
    </div>
  </SettingsCard>;
}

const permissionLabels: Record<PermissionKey, string> = {
  viewPortfolio: "View portfolio", editProjects: "Edit projects", approveGates: "Approve gates", manageBenefits: "Manage benefits",
  manageSettings: "Manage settings", issueTasks: "Issue tasks", validateMeasurements: "Validate measurements", recordDecisions: "Record decisions",
};
const homeOptions = [
  { value: "/home/my-work", label: "Home › My Work" },
  { value: "/home/approvals", label: "Home › Approvals" },
  { value: "/portfolio", label: "Portfolio › Overview" },
  { value: "/delivery/tasks", label: "Delivery › Tasks" },
  { value: "/benefits", label: "Benefits › Value dashboard" },
  { value: "/insights/dashboards", label: "Insights › Dashboards" },
  { value: "/settings/organisation", label: "Settings › Organisation" },
];

export function UserSettings() {
  const settings = useSettings();
  return <>
    <SettingsCard title="Signed in as" description="Switch the acting user to see the workspace through another role's default home page and permissions.">
      <div className="max-w-md"><SelectField label="Current user" value={settings.currentUserId} onChange={value => updateSettings({ currentUserId: value })}
        options={settings.users.map(user => ({ value: user.id, label: `${user.name} — ${user.role}` }))} /></div>
    </SettingsCard>

    <SettingsCard title="Users" description="People with access to the workspace."
      actions={<span className="text-xs text-muted-foreground">{settings.users.filter(user => user.active).length} active of {settings.subscription.seatsTotal} seats</span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-3 font-semibold">Name</th><th className="px-3 font-semibold">Email</th><th className="px-3 font-semibold">Role</th><th className="px-3 font-semibold">Team</th><th className="px-3 font-semibold">Active</th></tr></thead>
          <tbody>{settings.users.map(user => <tr key={user.id} className="border-t">
            <td className="px-3 py-2.5 font-medium">{user.name}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{user.email}</td>
            <td className="px-3 py-2"><select value={user.role} onChange={event => updateSettings({ users: settings.users.map(item => item.id === user.id ? { ...item, role: event.target.value as UserRole } : item) })} className="h-8 rounded-md border border-input bg-background px-2 text-sm">{settings.roles.map(role => <option key={role.role}>{role.role}</option>)}</select></td>
            <td className="px-3 py-2.5 text-muted-foreground">{user.team}</td>
            <td className="px-3 py-2"><Switch checked={user.active} onCheckedChange={value => updateSettings({ users: settings.users.map(item => item.id === user.id ? { ...item, active: value } : item) })} aria-label={`${user.name} active`} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </SettingsCard>

    <SettingsCard title="Roles and default home page" description="Each role lands on its own home page after signing in.">
      <div className="space-y-3">{settings.roles.map(role => <div key={role.role} className="grid gap-3 rounded-md border p-4 sm:grid-cols-[1fr_260px] sm:items-center">
        <div><p className="text-sm font-semibold">{role.role}</p><p className="mt-0.5 text-xs text-muted-foreground">{role.description}</p></div>
        <SelectField label="Default home page" value={role.defaultHome} onChange={value => updateSettings({ roles: settings.roles.map(item => item.role === role.role ? { ...item, defaultHome: value } : item) })} options={homeOptions} />
      </div>)}</div>
    </SettingsCard>

    <SettingsCard title="Permissions matrix" description="What each role can do.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-3 font-semibold">Role</th>{(Object.keys(permissionLabels) as PermissionKey[]).map(key => <th key={key} className="px-2 text-center font-semibold">{permissionLabels[key]}</th>)}</tr></thead>
          <tbody>{settings.roles.map(role => <tr key={role.role} className="border-t">
            <td className="px-3 py-2.5 font-medium">{role.role}</td>
            {(Object.keys(permissionLabels) as PermissionKey[]).map(key => <td key={key} className="px-2 text-center">
              <input type="checkbox" aria-label={`${role.role} can ${permissionLabels[key]}`} checked={role.permissions[key]}
                onChange={() => updateSettings({ roles: settings.roles.map(item => item.role === role.role ? { ...item, permissions: { ...item.permissions, [key]: !item.permissions[key] } } : item) })} />
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>
    </SettingsCard>
  </>;
}

export function NotificationSettings() {
  const settings = useSettings();
  const notifications = settings.notifications;
  const set = (value: Partial<AppSettings["notifications"]>) => patch("notifications", value);
  return <>
    <SettingsCard title="Channels" description="Where notifications are delivered.">
      <div className="grid gap-3 sm:grid-cols-3">
        {([["inApp", "In-app"], ["email", "Email"], ["teams", "Microsoft Teams"]] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between rounded-md border p-4">
          <span className="text-sm font-medium">{label}</span>
          <Switch checked={notifications.channels[key]} onCheckedChange={value => set({ channels: { ...notifications.channels, [key]: value } })} aria-label={label} />
        </label>)}
      </div>
      <div className="mt-4 max-w-xs"><SelectField label="Digest frequency" value={notifications.digest} onChange={value => set({ digest: value as AppSettings["notifications"]["digest"] })} options={["Real time", "Daily", "Weekly"].map(item => ({ value: item, label: item }))} /></div>
    </SettingsCard>
    <SettingsCard title="Events" description="Turn individual notifications on or off."
      actions={<div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => set({ events: Object.fromEntries(notificationEvents.map(event => [event, true])) })}>Enable all</Button>
        <Button size="sm" variant="outline" onClick={() => set({ events: Object.fromEntries(notificationEvents.map(event => [event, false])) })}>Disable all</Button>
      </div>}>
      <div className="grid gap-2 sm:grid-cols-2">
        {notificationEvents.map(event => <label key={event} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <span className="text-sm">{event}</span>
          <Switch checked={Boolean(notifications.events[event])} onCheckedChange={value => set({ events: { ...notifications.events, [event]: value } })} aria-label={event} />
        </label>)}
      </div>
    </SettingsCard>
  </>;
}

export function TemplateSettings() {
  const settings = useSettings();
  const templates = settings.templates;
  const set = (value: Partial<AppSettings["templates"]>) => patch("templates", value);
  const move = (index: number, direction: -1 | 1) => {
    const order = [...templates.committeePack.sectionOrder];
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const [item] = order.splice(index, 1);
    if (item) order.splice(target, 0, item);
    set({ committeePack: { ...templates.committeePack, sectionOrder: order } });
  };
  return <>
    <SettingsCard title="Project templates" description="Starting points offered when a new project is created.">
      <div className="grid gap-4 md:grid-cols-3">{templates.projectTemplates.map(template => <div key={template.id} className="rounded-md border p-4">
        <div className="flex items-center justify-between"><strong className="text-sm">{template.name}</strong><span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{template.tier}</span></div>
        <p className="mt-2 text-xs text-muted-foreground">{template.description}</p>
        <div className="mt-3 flex flex-wrap gap-1">{template.taskBuckets.map(bucket => <span key={bucket} className="rounded bg-accent px-1.5 py-0.5 text-[10px]">{bucket}</span>)}</div>
      </div>)}</div>
    </SettingsCard>
    <SettingsCard title="Status report template" description="Sections a project manager completes each reporting period.">
      <ListEditor label="Sections" values={templates.statusReportSections} onChange={values => set({ statusReportSections: values })} />
    </SettingsCard>
    <SettingsCard title="Committee pack template" description="Page order, cover text and whether the organisation logo appears.">
      <div className="space-y-2">{templates.committeePack.sectionOrder.map((section, index) => <div key={section} className="flex items-center gap-2 rounded-md border px-3 py-2">
        <span className="grid size-6 place-items-center rounded bg-muted text-xs font-semibold">{index + 1}</span>
        <span className="flex-1 text-sm">{section}</span>
        <Button size="sm" variant="ghost" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${section} up`}>↑</Button>
        <Button size="sm" variant="ghost" onClick={() => move(index, 1)} disabled={index === templates.committeePack.sectionOrder.length - 1} aria-label={`Move ${section} down`}>↓</Button>
      </div>)}</div>
      <div className="mt-4 grid gap-4">
        <Field label="Cover text"><Textarea rows={2} value={templates.committeePack.coverText} onChange={event => set({ committeePack: { ...templates.committeePack, coverText: event.target.value } })} /></Field>
        <label className="flex items-center justify-between rounded-md border p-4"><span className="text-sm font-medium">Show the organisation logo on the cover</span>
          <Switch checked={templates.committeePack.showLogo} onCheckedChange={value => set({ committeePack: { ...templates.committeePack, showLogo: value } })} aria-label="Show logo" /></label>
      </div>
    </SettingsCard>
  </>;
}

export function IntegrationSettings() {
  const [connected, setConnected] = useState({ planner: true, teams: false, entra: true, powerBi: false });
  const rows = [
    { key: "planner" as const, name: "Microsoft Planner", detail: "Two-way task sync for Planner Basic and Premium plans." },
    { key: "teams" as const, name: "Microsoft Teams", detail: "Deliver notifications and approvals into a Teams channel." },
    { key: "entra" as const, name: "Microsoft Entra ID", detail: "Single sign-on and the people directory behind resourcing." },
    { key: "powerBi" as const, name: "Power BI", detail: "Publish the portfolio dataset for organisation-wide reporting." },
  ];
  return <SettingsCard title="Microsoft 365" description="Connections to the tools the portfolio already runs on.">
    <div className="space-y-3">{rows.map(row => <div key={row.key} className="flex flex-wrap items-center gap-3 rounded-md border p-4">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{row.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{row.detail}</p></div>
      {connected[row.key] && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-health-good-foreground"><CheckCircle2 className="size-4" />Connected</span>}
      <Button size="sm" variant={connected[row.key] ? "outline" : "default"} onClick={() => setConnected(current => ({ ...current, [row.key]: !current[row.key] }))}>{connected[row.key] ? "Disconnect" : "Connect"}</Button>
    </div>)}</div>
  </SettingsCard>;
}

export function DataSettings() {
  const settings = useSettings();
  const data = settings.data;
  return <>
    <SettingsCard title="Import and export" description="Move data in and out of the workspace.">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline"><Upload />Import projects (CSV)</Button>
        <Button variant="outline"><Upload />Import lessons (CSV)</Button>
        <Button variant="outline"><Download />Export portfolio (CSV)</Button>
        <Button variant="outline"><Download />Export settings (JSON)</Button>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Exports use the workspace currency and date format, so a file opens with the same formatting people see on screen.</p>
    </SettingsCard>
    <SettingsCard title="Retention" description="How long closed records are kept before archiving.">
      <div className="max-w-xs"><NumberField label="Retention period (months)" value={data.retentionMonths} onChange={value => patch("data", { retentionMonths: Math.max(12, value) })} min={12} hint={`${Math.round(data.retentionMonths / 12)} years`} /></div>
    </SettingsCard>
    <SettingsCard title="Audit log" description="Recent configuration and governance activity.">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-table-head text-xs text-muted-foreground"><tr><th className="h-10 px-3 font-semibold">When</th><th className="px-3 font-semibold">Who</th><th className="px-3 font-semibold">Action</th><th className="px-3 font-semibold">Detail</th></tr></thead>
          <tbody>{data.auditLog.map(entry => <tr key={entry.id} className="border-t">
            <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{entry.timestamp}</td>
            <td className="px-3 py-2.5">{entry.actor}</td>
            <td className="px-3 py-2.5 font-medium">{entry.action}</td>
            <td className="px-3 py-2.5 text-muted-foreground">{entry.detail}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </SettingsCard>
  </>;
}

export function SubscriptionSettings() {
  const settings = useSettings();
  const subscription = settings.subscription;
  const usage = Math.round((subscription.seatsUsed / Math.max(1, subscription.seatsTotal)) * 100);
  return <SettingsCard title="Subscription" description="Plan, seat usage and renewal.">
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Plan</p><p className="mt-1.5 font-display text-lg font-semibold">{subscription.plan}</p></div>
      <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Seats used</p><p className="mt-1.5 font-display text-lg font-semibold">{subscription.seatsUsed} of {subscription.seatsTotal}</p>
        <div className="mt-2 h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full", usage > 90 ? "bg-health-bad" : usage > 75 ? "bg-health-warn" : "bg-primary")} style={{ width: `${usage}%` }} /></div></div>
      <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Renewal date</p><p className="mt-1.5 font-display text-lg font-semibold">{formatDate(subscription.renewalDate, settings)}</p></div>
      <div className="rounded-md border p-4"><p className="text-xs text-muted-foreground">Billing contact</p><p className="mt-1.5 text-sm font-medium">{subscription.billingContact}</p></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline">Add seats</Button><Button variant="outline">Download invoices</Button><Button variant="outline">Change plan</Button></div>
  </SettingsCard>;
}
