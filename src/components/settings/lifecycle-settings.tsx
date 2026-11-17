import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { tierDefinitionsFor } from "@/data/sectors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AppSettings } from "@/data/settings-types";
import type { ProjectTier } from "@/data/types";
import { updateSettings, useSettings } from "@/services/settings";
import { Field, NumberField, SettingsCard, TextField } from "@/components/settings/settings-shell";
import { cn } from "@/lib/utils";
import { getDefaultPhases, patch } from "./settings-helpers";
import { movedItem, toggledTiers } from "./settings-logic";

export function LifecycleSettings() {
  const settings = useSettings();
  const health = settings.health;
  const set = (value: Partial<AppSettings["health"]>) => patch("health", value);
  const phases = settings.lifecycle.phases;
  const tiers = settings.lifecycle.tiers.length
    ? settings.lifecycle.tiers
    : tierDefinitionsFor(settings.organisation.sector);
  const [activeId, setActiveId] = useState(phases[0]?.id ?? "");
  const active = phases.find((phase) => phase.id === activeId) ?? phases[0];
  const allTiers: ProjectTier[] = ["Small", "Medium", "Large"];
  const save = (next: typeof phases) =>
    updateSettings({ lifecycle: { ...settings.lifecycle, phases: next } });
  const saveTiers = (next: typeof tiers) =>
    updateSettings({ lifecycle: { ...settings.lifecycle, tiers: next } });
  const updatePhase = (id: string, value: Partial<(typeof phases)[number]>) =>
    save(phases.map((phase) => (phase.id === id ? { ...phase, ...value } : phase)));
  const updateCriterion = (
    criterionId: string,
    value: Partial<(typeof phases)[number]["criteria"][number]>,
  ) =>
    active &&
    updatePhase(active.id, {
      criteria: active.criteria.map((item) =>
        item.id === criterionId ? { ...item, ...value } : item,
      ),
    });
  const addPhase = () => {
    const id = `phase-${Date.now()}`;
    const number = phases.length + 1;
    save([
      ...phases,
      {
        id,
        name: `Phase ${number} - New phase`,
        shortName: `Phase ${number}`,
        gateName: `GATE ${number} - New gate`,
        description: "Describe what happens in this phase.",
        criteria: [],
      },
    ]);
    setActiveId(id);
  };
  const movePhase = (index: number, direction: -1 | 1) => {
    const next = movedItem(phases, index, direction);
    if (next) save(next);
  };
  const removePhase = (id: string) => {
    if (phases.length <= 1) return;
    if (
      !window.confirm(
        "Remove this phase and its gate criteria? A phase that projects are still in can't be removed; move them first.",
      )
    )
      return;
    const next = phases.filter((phase) => phase.id !== id);
    save(next);
    setActiveId(next[0]?.id ?? "");
  };
  const addCriterion = () =>
    active &&
    updatePhase(active.id, {
      criteria: [
        ...active.criteria,
        { id: `c-${Date.now()}`, label: "New gate criterion", tiers: [...allTiers] },
      ],
    });
  const removeCriterion = (criterionId: string) =>
    active &&
    updatePhase(active.id, { criteria: active.criteria.filter((item) => item.id !== criterionId) });
  const toggleTier = (criterionId: string, tier: ProjectTier, current: ProjectTier[]) =>
    updateCriterion(criterionId, {
      tiers: toggledTiers(allTiers, current, tier),
    });
  return (
    <>
      <SettingsCard
        requires="pmo"
        title="Lifecycle phases and gates"
        description="Add, rename, reorder or remove phases, and edit each phase's exit gate criteria. Criteria marked as automatic are evaluated from live data on the project page."
        actions={
          <Button size="sm" variant="outline" onClick={() => save(getDefaultPhases())}>
            <RotateCcw className="size-4" />
            Restore to Default Lifecycle
          </Button>
        }
      >
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2">
            <ul className="space-y-2">
              {phases.map((phase, index) => (
                <li
                  key={phase.id}
                  className={cn(
                    "flex items-stretch rounded-md border",
                    phase.id === active?.id ? "border-primary bg-primary/5" : "hover:bg-accent/30",
                  )}
                >
                  <button
                    onClick={() => setActiveId(phase.id)}
                    className="min-w-0 flex-1 p-3 text-left"
                  >
                    <span className="block truncate text-sm font-medium">{phase.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {phase.criteria.length} gate criteria · step {index + 1}
                    </span>
                  </button>
                  <div className="flex flex-col justify-center pr-1">
                    <button
                      aria-label={`Move ${phase.name} up`}
                      disabled={index === 0}
                      onClick={() => movePhase(index, -1)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      aria-label={`Move ${phase.name} down`}
                      disabled={index === phases.length - 1}
                      onClick={() => movePhase(index, 1)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="outline" className="w-full" onClick={addPhase}>
              <Plus className="size-4" />
              Add phase
            </Button>
          </div>
          {active && (
            <div className="space-y-4 rounded-md border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Phase name"
                  value={active.name}
                  onChange={(value) => updatePhase(active.id, { name: value })}
                  hint="Projects keep their phase when it is renamed."
                />
                <TextField
                  label="Short name"
                  value={active.shortName}
                  onChange={(value) => updatePhase(active.id, { shortName: value })}
                />
                <TextField
                  label="Exit gate name"
                  value={active.gateName}
                  onChange={(value) => updatePhase(active.id, { gateName: value })}
                  wide
                />
                <Field label="Description" wide>
                  <Textarea
                    value={active.description}
                    onChange={(event) =>
                      updatePhase(active.id, { description: event.target.value })
                    }
                    rows={2}
                  />
                </Field>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Gate criteria</p>
                  <Button size="sm" variant="outline" onClick={addCriterion}>
                    <Plus className="size-4" />
                    Add criterion
                  </Button>
                </div>
                <ul className="mt-3 space-y-3">
                  {active.criteria.map((criterion) => (
                    <li key={criterion.id} className="rounded-md border border-border/70 p-3">
                      <div className="flex items-start gap-2">
                        <Input
                          aria-label="Criterion"
                          value={criterion.label}
                          onChange={(event) =>
                            updateCriterion(criterion.id, { label: event.target.value })
                          }
                          className="flex-1"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove criterion"
                          onClick={() => removeCriterion(criterion.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Input
                          aria-label="Required document"
                          placeholder="Required document (optional)"
                          value={criterion.document ?? ""}
                          onChange={(event) =>
                            updateCriterion(criterion.id, { document: event.target.value })
                          }
                          className="h-8 max-w-xs text-xs"
                        />
                        <span className="text-xs text-muted-foreground">Applies to:</span>
                        {allTiers.map((tier) => (
                          <label key={tier} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={criterion.tiers.includes(tier)}
                              onChange={() => toggleTier(criterion.id, tier, criterion.tiers)}
                            />
                            {tier}
                          </label>
                        ))}
                        {criterion.check && (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Evaluated automatically
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  {!active.criteria.length && (
                    <li className="text-sm text-muted-foreground">
                      No criteria yet — add the first one.
                    </li>
                  )}
                </ul>
              </div>
              <div className="flex justify-end border-t pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={phases.length <= 1}
                  onClick={() => removePhase(active.id)}
                >
                  <Trash2 className="size-4" />
                  Remove phase
                </Button>
              </div>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Project tiers"
        description="Tier decides which gate criteria and documents apply. Edit the guideline and description for each tier; tier names are fixed because existing projects reference them."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              updateSettings({
                lifecycle: {
                  ...settings.lifecycle,
                  tiers: tierDefinitionsFor(settings.organisation.sector),
                },
              })
            }
          >
            <RotateCcw className="size-4" />
            Restore default tiers
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier) => (
            <div key={tier.tier} className="space-y-3 rounded-md border p-4">
              <strong className="text-sm">{tier.tier}</strong>
              <Field label="Guideline">
                <Input
                  value={tier.guideline}
                  onChange={(event) =>
                    saveTiers(
                      tiers.map((item) =>
                        item.tier === tier.tier ? { ...item, guideline: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="Description">
                <Textarea
                  rows={4}
                  value={tier.description}
                  onChange={(event) =>
                    saveTiers(
                      tiers.map((item) =>
                        item.tier === tier.tier
                          ? { ...item, description: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard
        title="RAG health thresholds"
        description="The thresholds used by the calculated schedule, effort, financial, benefit, benefits pathway and dependency health rules."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <NumberField
            label="Schedule slip → Off Track (%)"
            value={health.scheduleSlipPercent}
            onChange={(value) => set({ scheduleSlipPercent: value })}
            hint="Slip against the baseline duration."
          />
          <NumberField
            label="Report better than evidence → alert (days)"
            value={health.divergenceAlertDays}
            onChange={(value) => set({ divergenceAlertDays: value })}
            hint="Days a status report can stay better than the evidence before an assurance alert."
          />
          <NumberField
            label="Overdue tasks → At Risk (%)"
            value={health.taskOverdueAtRiskPercent}
            onChange={(value) => set({ taskOverdueAtRiskPercent: value })}
          />
          <NumberField
            label="Overdue tasks → Off Track (%)"
            value={health.taskOverdueOffTrackPercent}
            onChange={(value) => set({ taskOverdueOffTrackPercent: value })}
          />
          <NumberField
            label="Forecast over budget → At Risk (%)"
            value={health.financialAtRiskPercent}
            onChange={(value) => set({ financialAtRiskPercent: value })}
          />
          <NumberField
            label="Forecast over budget → Off Track (%)"
            value={health.financialOffTrackPercent}
            onChange={(value) => set({ financialOffTrackPercent: value })}
          />
          <NumberField
            label="Risk score → At Risk"
            value={health.riskScoreAtRisk}
            onChange={(value) => set({ riskScoreAtRisk: value })}
          />
          <NumberField
            label="Risk score → Off Track"
            value={health.riskScoreOffTrack}
            onChange={(value) => set({ riskScoreOffTrack: value })}
          />
          <NumberField
            label="Benefit behind profile → Off Track (%)"
            value={health.benefitBehindProfilePercent}
            onChange={(value) => set({ benefitBehindProfilePercent: value })}
          />
          <NumberField
            label="Dependency At Risk window (working days)"
            value={health.dependencyAtRiskWorkingDays}
            onChange={(value) => set({ dependencyAtRiskWorkingDays: value })}
          />
          <NumberField
            label="Capability forecast slip → At Risk (days)"
            value={health.capabilitySlipAmberDays}
            onChange={(value) => set({ capabilitySlipAmberDays: value })}
            hint="Forecast acceptance date beyond the target date."
          />
          <NumberField
            label="Acceptance grace period (days)"
            value={health.acceptanceGraceDays}
            onChange={(value) => set({ acceptanceGraceDays: value })}
            hint="A delivered capability past its target shows Awaiting acceptance (At Risk) for this long before Off Track. 0 = strict."
          />
          <NumberField
            label="Outcome behind trajectory → At Risk (%)"
            value={health.outcomeBehindTrajectoryAmberPercent}
            onChange={(value) => set({ outcomeBehindTrajectoryAmberPercent: value })}
            hint="Shortfall against the straight line from baseline to target, as a share of the planned change."
          />
          <NumberField
            label="Outcome behind trajectory → Off Track (%)"
            value={health.outcomeBehindTrajectoryRedPercent}
            onChange={(value) => set({ outcomeBehindTrajectoryRedPercent: value })}
          />
        </div>
      </SettingsCard>
    </>
  );
}
