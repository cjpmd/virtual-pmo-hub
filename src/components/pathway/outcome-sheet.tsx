// Outcome editor: details, enabling capabilities and benefits, status (achieved / not achieved
// are PMO-only, enforced by the database), and indicators with their measurements.
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useMyResourceId } from "@/hooks/use-hierarchy";
import { usePathwayMutations } from "@/hooks/use-pathway";
import { useCan } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/today";
import { cn } from "@/lib/utils";
import {
  outcomeStatusLabel,
  type IndicatorInput,
  type OutcomeInput,
  type OutcomeStatus,
  type PathwayData,
  type PathwayIndicator,
  type PathwayOutcome,
} from "@/services/pathway";
import { ErrorText, Field, RagChip, SectionCard, selectClass, SideSheet } from "./pathway-ui";

const statuses: OutcomeStatus[] = ["planned", "emerging", "achieved", "not_achieved"];
const pmoOnly = (status: OutcomeStatus) => status === "achieved" || status === "not_achieved";
const formatValue = (value: number | null | undefined, unit: string) =>
  value === null || value === undefined
    ? "—"
    : `${Number(value.toFixed(1)).toLocaleString()}${unit === "%" ? "%" : unit ? ` ${unit}` : ""}`;

export function OutcomeSheet({
  data,
  outcome,
  programmeId,
  onClose,
}: {
  data: PathwayData;
  outcome?: PathwayOutcome;
  programmeId?: string;
  onClose: () => void;
}) {
  const mutations = usePathwayMutations();
  const [form, setForm] = useState<OutcomeInput>(() => ({
    programmeId: outcome?.programmeId ?? programmeId ?? data.programmes[0]?.id ?? "",
    title: outcome?.title ?? "",
    description: outcome?.description ?? "",
    ownerId: outcome?.ownerId ?? null,
    status: outcome?.status ?? "planned",
    targetDate: outcome?.targetDate ?? null,
    achievedDate: outcome?.achievedDate ?? null,
    capabilityIds: outcome?.capabilityIds ?? [],
    benefitIds: outcome?.benefitIds ?? [],
  }));
  const set = (patch: Partial<OutcomeInput>) => setForm((current) => ({ ...current, ...patch }));
  const workspaceId =
    outcome?.workspaceId ??
    data.programmes.find((programme) => programme.id === form.programmeId)?.workspaceId;
  const canEdit = useCan("contributor", workspaceId);
  const isPmo = useCan("pmo", workspaceId);
  const capabilities = useMemo(
    () =>
      data.capabilities.filter(
        (item) => item.programmeId === form.programmeId || form.capabilityIds.includes(item.id),
      ),
    [data.capabilities, form.programmeId, form.capabilityIds],
  );
  const benefits = useMemo(
    () =>
      data.benefits.filter(
        (item) => item.programmeId === form.programmeId || form.benefitIds.includes(item.id),
      ),
    [data.benefits, form.programmeId, form.benefitIds],
  );
  // Non-PMO may keep an outcome's PMO-set status but can't move into or out of it.
  const statusLocked = !isPmo && Boolean(outcome && pmoOnly(outcome.status));

  return (
    <SideSheet
      eyebrow="Outcome"
      title={outcome ? outcome.title : "New outcome"}
      onClose={onClose}
      aside={
        outcome && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <RagChip
              rag={outcome.rag}
              reason={outcome.reason}
              complete={outcome.status === "achieved"}
            />
            <span>
              {outcome.reason}
              {outcome.indicatorDriven
                ? " (from indicators)"
                : outcome.rag === "Not Set"
                  ? ""
                  : " (from enabling capabilities)"}
            </span>
          </div>
        )
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutations.saveOutcome.mutate(
            { ...(outcome ? { outcome } : {}), input: form },
            { onSuccess: () => !outcome && onClose() },
          );
        }}
      >
        <fieldset disabled={!canEdit} className="space-y-4">
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(event) => set({ title: event.target.value })}
              required
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => set({ description: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Programme">
              <select
                className={selectClass}
                value={form.programmeId}
                disabled={Boolean(outcome)}
                onChange={(event) => set({ programmeId: event.target.value })}
              >
                {data.programmes.map((programme) => (
                  <option key={programme.id} value={programme.id}>
                    {programme.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Owner">
              <select
                className={selectClass}
                value={form.ownerId ?? ""}
                onChange={(event) => set({ ownerId: event.target.value || null })}
              >
                <option value="">Unassigned</option>
                {data.people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Status"
              hint={
                isPmo
                  ? "Achieved and Not achieved are PMO decisions."
                  : "Only PMO can set Achieved or Not achieved."
              }
            >
              <select
                className={selectClass}
                value={form.status}
                disabled={statusLocked}
                onChange={(event) => set({ status: event.target.value as OutcomeStatus })}
              >
                {statuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={!isPmo && pmoOnly(status) && status !== outcome?.status}
                  >
                    {outcomeStatusLabel[status]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Target date">
              <Input
                type="date"
                value={form.targetDate ?? ""}
                onChange={(event) => set({ targetDate: event.target.value || null })}
              />
            </Field>
            {form.status === "achieved" && (
              <Field label="Achieved date">
                <Input
                  type="date"
                  value={form.achievedDate ?? ""}
                  disabled={statusLocked}
                  onChange={(event) => set({ achievedDate: event.target.value || null })}
                />
              </Field>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Enabling capabilities"
              hint="Before any measurement, the outcome takes the worst of these."
            >
              <Checklist
                items={capabilities.map((item) => ({ id: item.id, label: item.title }))}
                selected={form.capabilityIds}
                onChange={(capabilityIds) => set({ capabilityIds })}
                empty="No capabilities in this programme."
              />
            </Field>
            <Field label="Benefits" hint="Benefits not yet in realisation take this outcome's RAG.">
              <Checklist
                items={benefits.map((item) => ({
                  id: item.id,
                  label: `${item.ref} · ${item.title}`,
                }))}
                selected={form.benefitIds}
                onChange={(benefitIds) => set({ benefitIds })}
                empty="No open benefits in this programme."
              />
            </Field>
          </div>
        </fieldset>
        <ErrorText error={mutations.saveOutcome.error} />
        {canEdit ? (
          <div className="flex gap-2">
            <Button type="submit" disabled={mutations.saveOutcome.isPending}>
              {outcome ? "Save changes" : "Add outcome"}
            </Button>
            {mutations.saveOutcome.isSuccess && outcome && (
              <span className="self-center text-xs text-muted-foreground">Saved</span>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Contributors and above can edit outcomes.</p>
        )}
      </form>

      {outcome && <Indicators data={data} outcome={outcome} canEdit={canEdit} />}
    </SideSheet>
  );
}

function Checklist({
  items,
  selected,
  onChange,
  empty,
}: {
  items: Array<{ id: string; label: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
  empty: string;
}) {
  return (
    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-start gap-2 text-sm font-normal">
          <input
            type="checkbox"
            className="mt-1"
            checked={selected.includes(item.id)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, item.id]
                  : selected.filter((id) => id !== item.id),
              )
            }
          />
          {item.label}
        </label>
      ))}
      {!items.length && <p className="text-xs text-muted-foreground">{empty}</p>}
    </div>
  );
}

const blankIndicator = (outcomeId: string): IndicatorInput => ({
  outcomeId,
  name: "",
  unit: "%",
  baselineValue: 0,
  baselineDate: todayIso(),
  targetValue: 100,
  targetDate: "",
  frequency: "quarterly",
  nextDueDate: null,
  dataSource: "",
});

function Indicators({
  data,
  outcome,
  canEdit,
}: {
  data: PathwayData;
  outcome: PathwayOutcome;
  canEdit: boolean;
}) {
  const mutations = usePathwayMutations();
  const [editing, setEditing] = useState<{
    input: IndicatorInput;
    existing?: PathwayIndicator;
  } | null>(null);
  return (
    <SectionCard
      title="Indicators"
      description="Once any indicator has a counted measurement, the outcome is judged against the straight line from baseline to target."
      actions={
        canEdit && !editing ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing({ input: blankIndicator(outcome.id) })}
          >
            <Plus />
            Add indicator
          </Button>
        ) : undefined
      }
    >
      {editing && (
        <IndicatorForm
          value={editing.input}
          existing={editing.existing}
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {outcome.indicators.map((indicator) => (
        <div key={indicator.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{indicator.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatValue(indicator.baselineValue, indicator.unit)} on{" "}
                {formatDate(indicator.baselineDate)} →{" "}
                {formatValue(indicator.targetValue, indicator.unit)} by{" "}
                {formatDate(indicator.targetDate)} · {indicator.frequency}
                {indicator.nextDueDate ? ` · next due ${formatDate(indicator.nextDueDate)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <RagChip rag={indicator.rag} reason={indicator.reason} />
              {canEdit && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${indicator.name}`}
                    onClick={() =>
                      setEditing({
                        existing: indicator,
                        input: {
                          outcomeId: outcome.id,
                          name: indicator.name,
                          unit: indicator.unit,
                          baselineValue: indicator.baselineValue,
                          baselineDate: indicator.baselineDate,
                          targetValue: indicator.targetValue,
                          targetDate: indicator.targetDate,
                          frequency: indicator.frequency,
                          nextDueDate: indicator.nextDueDate,
                          dataSource: indicator.dataSource,
                        },
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${indicator.name}`}
                    disabled={mutations.deleteIndicator.isPending}
                    onClick={() => {
                      if (window.confirm(`Remove ${indicator.name} and its measurements?`))
                        mutations.deleteIndicator.mutate(indicator.id);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          </div>
          {indicator.countedMeasurementId && (
            <p className="mt-2 text-xs">
              Counted measurement{" "}
              <strong>
                {formatValue(
                  indicator.measurements.find((m) => m.id === indicator.countedMeasurementId)
                    ?.actualValue,
                  indicator.unit,
                )}
              </strong>{" "}
              against an expected{" "}
              <strong>{formatValue(indicator.expectedValue, indicator.unit)}</strong>
              {indicator.shortfallPercent
                ? ` (${Math.round(indicator.shortfallPercent)}% behind)`
                : " (on trajectory)"}
            </p>
          )}
          <Measurements data={data} indicator={indicator} canEdit={canEdit} />
        </div>
      ))}
      {!outcome.indicators.length && !editing && (
        <p className="text-sm text-muted-foreground">
          No indicators yet. Until one is measured, the outcome takes the RAG of its enabling
          capabilities.
        </p>
      )}
      <ErrorText error={mutations.deleteIndicator.error} />
    </SectionCard>
  );
}

function IndicatorForm({
  value,
  existing,
  onCancel,
  onSaved,
}: {
  value: IndicatorInput;
  existing?: PathwayIndicator | undefined;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const mutations = usePathwayMutations();
  const [form, setForm] = useState(value);
  const set = (patch: Partial<IndicatorInput>) => setForm((current) => ({ ...current, ...patch }));
  return (
    <form
      className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutations.saveIndicator.mutate(
          { input: form, ...(existing ? { existing } : {}) },
          { onSuccess: onSaved },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" className="sm:col-span-2">
          <Input
            value={form.name}
            onChange={(event) => set({ name: event.target.value })}
            required
          />
        </Field>
        <Field label="Unit">
          <Input
            value={form.unit}
            onChange={(event) => set({ unit: event.target.value })}
            placeholder="%, hours, count…"
          />
        </Field>
        <Field label="Baseline">
          <Input
            type="number"
            step="any"
            value={form.baselineValue}
            onChange={(event) => set({ baselineValue: Number(event.target.value) })}
          />
        </Field>
        <Field label="Baseline date">
          <Input
            type="date"
            value={form.baselineDate}
            onChange={(event) => set({ baselineDate: event.target.value })}
          />
        </Field>
        <Field label="Frequency">
          <select
            className={selectClass}
            value={form.frequency}
            onChange={(event) =>
              set({ frequency: event.target.value as IndicatorInput["frequency"] })
            }
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </Field>
        <Field label="Target" hint="Lower than the baseline means lower is better.">
          <Input
            type="number"
            step="any"
            value={form.targetValue}
            onChange={(event) => set({ targetValue: Number(event.target.value) })}
          />
        </Field>
        <Field label="Target date">
          <Input
            type="date"
            value={form.targetDate}
            onChange={(event) => set({ targetDate: event.target.value })}
            required
          />
        </Field>
        <Field label="Next measurement due">
          <Input
            type="date"
            value={form.nextDueDate ?? ""}
            onChange={(event) => set({ nextDueDate: event.target.value || null })}
          />
        </Field>
        <Field label="Data source" className="sm:col-span-3">
          <Input
            value={form.dataSource}
            onChange={(event) => set({ dataSource: event.target.value })}
          />
        </Field>
      </div>
      <ErrorText error={mutations.saveIndicator.error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={mutations.saveIndicator.isPending}>
          {existing ? "Save indicator" : "Add indicator"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const measurementTone = {
  submitted: "bg-muted text-muted-foreground",
  validated: "bg-health-good/15 text-health-good-foreground",
  queried: "bg-health-warn/20 text-health-warn-foreground",
} as const;

function Measurements({
  data,
  indicator,
  canEdit,
}: {
  data: PathwayData;
  indicator: PathwayIndicator;
  canEdit: boolean;
}) {
  const mutations = usePathwayMutations();
  const me = useMyResourceId();
  const [open, setOpen] = useState(false);
  const [measuredOn, setMeasuredOn] = useState(todayIso());
  const [value, setValue] = useState("");
  const [evidence, setEvidence] = useState("");
  const [notes, setNotes] = useState("");
  const nameOf = (id: string | null) => data.people.find((person) => person.id === id)?.name ?? "—";
  return (
    <div className="mt-3 border-t pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Measurements</p>
        {canEdit && !open && (
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            <Plus />
            Submit measurement
          </Button>
        )}
      </div>
      {open && (
        <form
          className="mt-2 grid gap-2 rounded-md bg-muted/40 p-2 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutations.submitMeasurement.mutate(
              {
                indicatorId: indicator.id,
                measuredOn,
                actualValue: value === "" ? Number.NaN : Number(value),
                evidence,
                notes,
                submittedById: me,
                submittedDate: todayIso(),
              },
              {
                onSuccess: () => {
                  setOpen(false);
                  setValue("");
                  setEvidence("");
                  setNotes("");
                },
              },
            );
          }}
        >
          <Field label="Measured on">
            <Input
              type="date"
              value={measuredOn}
              onChange={(event) => setMeasuredOn(event.target.value)}
              required
            />
          </Field>
          <Field label={`Value${indicator.unit ? ` (${indicator.unit})` : ""}`}>
            <Input
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          </Field>
          <Field label="Evidence" className="sm:col-span-2">
            <Input
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
              placeholder="Report or source"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit" size="sm" disabled={mutations.submitMeasurement.isPending}>
              Submit
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <div className="sm:col-span-4">
            <ErrorText error={mutations.submitMeasurement.error} />
          </div>
        </form>
      )}
      <ul className="mt-1 space-y-1">
        {indicator.measurements.map((measurement) => (
          <li key={measurement.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-24 text-muted-foreground">{formatDate(measurement.measuredOn)}</span>
            <span className="w-24 font-mono tabular-nums">
              {formatValue(measurement.actualValue, indicator.unit)}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold capitalize",
                measurementTone[measurement.status],
              )}
            >
              {measurement.status}
            </span>
            {measurement.id === indicator.countedMeasurementId && (
              <span className="text-health-good-foreground">counted</span>
            )}
            <span className="text-muted-foreground">by {nameOf(measurement.submittedById)}</span>
            {measurement.queryNote && measurement.status === "queried" && (
              <span className="basis-full pl-26 text-health-warn-foreground">
                Query: {measurement.queryNote}
              </span>
            )}
          </li>
        ))}
        {!indicator.measurements.length && (
          <li className="text-xs text-muted-foreground">None yet.</li>
        )}
      </ul>
    </div>
  );
}
