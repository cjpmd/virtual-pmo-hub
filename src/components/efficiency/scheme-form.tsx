// Efficiency / savings scheme form (NHS-4 part 3): create a scheme, or edit one's details. Stage
// moves happen on the board and the scheme page (they go through the database's stage check), and
// values through the phasing grid. Links to a project, programme or benefit are limited to the
// scheme's workspace, as the database's composite keys require.
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCES,
  CONFIDENCE_LABELS,
  RECURRENCE_LABELS,
  SAVINGS_TYPE_LABELS,
  parseAmount,
  type Confidence,
  type Recurrence,
  type SavingsType,
} from "@/data/efficiency";
import { useEfficiencyMutations, useSchemeOptions } from "@/hooks/use-efficiency";
import { useWorkspaceRoles } from "@/hooks/use-permissions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useFormat } from "@/lib/format";
import { useModuleTerm } from "@/lib/modules";
import { atLeast } from "@/services/auth";
import type { EfficiencyScheme, SchemeEdit, SchemeOptions } from "@/services/efficiency";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export const NO_PATIENT_DATA = "Do not enter patient-identifiable information.";

/** The form's state (strings for the inputs). */
export interface Draft {
  workspaceId: string;
  title: string;
  description: string;
  businessUnit: string;
  category: string;
  savingsType: SavingsType;
  recurrence: Recurrence;
  executiveLeadId: string;
  schemeLeadId: string;
  financeLeadId: string;
  startMonth: string;
  projectId: string;
  programmeId: string;
  benefitId: string;
  confidence: string;
  deliveryPlan: string;
  fullYearEffect: string;
}

export function draftOf(scheme: EfficiencyScheme | null, workspaceId: string): Draft {
  return {
    workspaceId: scheme?.workspaceId ?? workspaceId,
    title: scheme?.title ?? "",
    description: scheme?.description ?? "",
    businessUnit: scheme?.businessUnit ?? "",
    category: scheme?.category ?? "",
    savingsType: scheme?.savingsType ?? "non_pay",
    recurrence: scheme?.recurrence ?? "recurrent",
    executiveLeadId: scheme?.executiveLeadId ?? "",
    schemeLeadId: scheme?.schemeLeadId ?? "",
    financeLeadId: scheme?.financeLeadId ?? "",
    startMonth: scheme?.startMonth?.slice(0, 7) ?? "",
    projectId: scheme?.projectId ?? "",
    programmeId: scheme?.programmeId ?? "",
    benefitId: scheme?.benefitId ?? "",
    confidence: scheme?.confidence ?? "",
    deliveryPlan: scheme?.deliveryPlan ?? "",
    fullYearEffect: scheme?.fullYearEffect == null ? "" : String(scheme.fullYearEffect),
  };
}

/** The edit to send: every field for a new scheme, only the changed ones for an existing one. */
export function draftToEdit(draft: Draft, scheme: EfficiencyScheme | null): SchemeEdit | null {
  const fye = draft.fullYearEffect.trim() === "" ? null : parseAmount(draft.fullYearEffect);
  if (draft.fullYearEffect.trim() !== "" && (fye === null || fye < 0)) return null;
  const all: SchemeEdit = {
    title: draft.title,
    description: draft.description,
    businessUnit: draft.businessUnit || null,
    category: draft.category || null,
    savingsType: draft.savingsType,
    recurrence: draft.recurrence,
    executiveLeadId: draft.executiveLeadId || null,
    schemeLeadId: draft.schemeLeadId || null,
    financeLeadId: draft.financeLeadId || null,
    startMonth: draft.startMonth || null,
    projectId: draft.projectId || null,
    programmeId: draft.programmeId || null,
    benefitId: draft.benefitId || null,
    confidence: (draft.confidence || null) as Confidence | null,
    deliveryPlan: draft.deliveryPlan,
    fullYearEffect: fye,
  };
  if (!scheme) return all;
  const before = (draftToEdit(draftOf(scheme, scheme.workspaceId), null) ?? {}) as Record<
    string,
    unknown
  >;
  const norm = (v: unknown) => (typeof v === "string" ? v.trim() || null : (v ?? null));
  return Object.fromEntries(
    Object.entries(all).filter(([key, value]) => norm(value) !== norm(before[key])),
  ) as SchemeEdit;
}

export function SchemeFormSheet({
  open,
  scheme,
  onClose,
}: {
  open: boolean;
  /** Null = a new scheme. */
  scheme: EfficiencyScheme | null;
  onClose: () => void;
}) {
  const term = useModuleTerm();
  const options = useSchemeOptions(open);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {scheme ? `Edit ${scheme.ref}` : `New ${term("efficiency.scheme").toLowerCase()}`}
          </SheetTitle>
          <SheetDescription>
            {scheme
              ? "Change the scheme's details. Move its stage from the board or the scheme page."
              : "A new scheme starts as an idea. Add its monthly values from the scheme page."}
          </SheetDescription>
        </SheetHeader>
        {options.data ? (
          <SchemeForm
            key={scheme?.id ?? "new"}
            scheme={scheme}
            options={options.data}
            onDone={onClose}
          />
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            {options.isError ? "Couldn't load the form's lists." : "Loading…"}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SchemeForm({
  scheme,
  options,
  onDone,
}: {
  scheme: EfficiencyScheme | null;
  options: SchemeOptions;
  onDone: () => void;
}) {
  const term = useModuleTerm();
  const fmt = useFormat();
  const navigate = useNavigate();
  const roles = useWorkspaceRoles().data ?? [];
  const workspaces = (useWorkspaces().data ?? []).filter(
    (w) => !w.archivedAt && roles.some((r) => r.workspaceId === w.id && atLeast(r.role, "manager")),
  );
  const [draft, setDraft] = useState<Draft>(() => draftOf(scheme, workspaces[0]?.id ?? ""));
  const mutations = useEfficiencyMutations();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const ws = draft.workspaceId || workspaces[0]?.id || "";
  const inWs = <T extends { workspaceId: string }>(rows: T[]) =>
    rows.filter((r) => r.workspaceId === ws);
  const units = fmt.settings.lists.businessUnits ?? [];
  const edit = draftToEdit(draft, scheme);
  const pending = mutations.createScheme.isPending || mutations.updateScheme.isPending;
  const invalid = !draft.title.trim() || !edit || (!scheme && !ws);

  const submit = () => {
    if (!edit) return;
    if (!scheme) {
      mutations.createScheme.mutate(
        { workspaceId: ws, edit: { ...edit, title: draft.title.trim() } },
        {
          onSuccess: (written) => {
            onDone();
            void navigate({
              to: "/portfolio/efficiency/$schemeId",
              params: { schemeId: written.id },
            });
          },
        },
      );
      return;
    }
    if (!Object.keys(edit).length) return onDone();
    mutations.updateScheme.mutate(
      { id: scheme.id, edit, lastSeen: scheme.updatedAt },
      { onSuccess: onDone },
    );
  };

  const person = (key: "executiveLeadId" | "schemeLeadId" | "financeLeadId", label: string) => (
    <Field label={label}>
      <select className={selectClass} value={draft[key]} onChange={(e) => set(key, e.target.value)}>
        <option value="">Not set</option>
        {options.people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {!scheme && workspaces.length > 1 && (
        <Field label="Workspace">
          <select
            className={selectClass}
            value={ws}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                workspaceId: e.target.value,
                projectId: "",
                programmeId: "",
                benefitId: "",
              }))
            }
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!scheme && !workspaces.length && (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          You need to be a manager or above in an active workspace to add a scheme.
        </p>
      )}
      <Field label="Title">
        <Input
          value={draft.title}
          maxLength={300}
          required
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <Field label="Description" hint={NO_PATIENT_DATA}>
        <Textarea
          rows={3}
          maxLength={10000}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={term("orgUnit")}>
          <select
            className={selectClass}
            value={draft.businessUnit}
            onChange={(e) => set("businessUnit", e.target.value)}
          >
            <option value="">Not set</option>
            {[...new Set([...units, ...(draft.businessUnit ? [draft.businessUnit] : [])])].map(
              (u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Category">
          <select
            className={selectClass}
            value={draft.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">Not set</option>
            {options.categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
            {draft.category && !options.categories.some((c) => c.value === draft.category) && (
              <option value={draft.category}>{draft.category} (no longer listed)</option>
            )}
          </select>
        </Field>
        <Field label="Savings type">
          <select
            className={selectClass}
            value={draft.savingsType}
            onChange={(e) => set("savingsType", e.target.value as SavingsType)}
          >
            {Object.entries(SAVINGS_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Recurrence">
          <select
            className={selectClass}
            value={draft.recurrence}
            onChange={(e) => set("recurrence", e.target.value as Recurrence)}
          >
            {Object.entries(RECURRENCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {person("executiveLeadId", "Executive lead")}
        {person("schemeLeadId", "Scheme lead")}
        {person("financeLeadId", "Finance lead")}
        <Field label="Start month">
          <Input
            type="month"
            value={draft.startMonth}
            onChange={(e) => set("startMonth", e.target.value)}
          />
        </Field>
        <Field label="Planning confidence">
          <select
            className={selectClass}
            value={draft.confidence}
            onChange={(e) => set("confidence", e.target.value)}
          >
            <option value="">Not set (counts as zero risk-adjusted)</option>
            {CONFIDENCES.map((c) => (
              <option key={c} value={c}>
                {CONFIDENCE_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Full-year effect" hint="Annualised recurrent value once fully implemented.">
          <Input
            inputMode="decimal"
            value={draft.fullYearEffect}
            aria-invalid={draft.fullYearEffect.trim() !== "" && !edit}
            onChange={(e) => set("fullYearEffect", e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Delivery plan"
        hint={`Needed before the scheme is fully developed. ${NO_PATIENT_DATA}`}
      >
        <Textarea
          rows={4}
          maxLength={10000}
          value={draft.deliveryPlan}
          onChange={(e) => set("deliveryPlan", e.target.value)}
        />
      </Field>
      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          Links (same workspace)
        </legend>
        <Field label="Delivering project">
          <select
            className={selectClass}
            value={draft.projectId}
            onChange={(e) => set("projectId", e.target.value)}
          >
            <option value="">None</option>
            {inWs(options.projects).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Delivering programme">
          <select
            className={selectClass}
            value={draft.programmeId}
            onChange={(e) => set("programmeId", e.target.value)}
          >
            <option value="">None</option>
            {inWs(options.programmes).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Cash-releasing benefit"
          hint="The benefit shows the savings realised; portfolio totals count them once."
        >
          <select
            className={selectClass}
            value={draft.benefitId}
            onChange={(e) => set("benefitId", e.target.value)}
          >
            <option value="">None</option>
            {inWs(options.benefits).map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
                {b.cashReleasing ? "" : " (not cash-releasing)"}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={invalid || pending}>
          {scheme ? "Save" : "Create scheme"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
