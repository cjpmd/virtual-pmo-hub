// Five Case Model panels for the business case page (NHS-5, module five_case): the stage pill,
// spending objectives and critical success factors, the appraisal aid (per-year figures for each
// short-listed option, present values, NPV, NPSV and benefit-cost ratio) and the approval route's
// steps with Approve / Reject for the governance role holder.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { useUser } from "@/components/auth/session-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCaseAction } from "@/hooks/use-business-case";
import { useFormat } from "@/lib/format";
import { decideApprovalStep } from "@/services/approvals";
import type { CaseOwner, CaseVersion } from "@/services/business-cases";
import {
  addObjective,
  appraiseOption,
  deleteObjective,
  objectiveKindLabel,
  saveAppraisalSettings,
  saveOptionYear,
  stageLabel,
  stageShort,
  updateObjective,
  type CaseObjective,
  type CaseStage,
  type ObjectiveInput,
  type ObjectiveKind,
  type OptionYear,
} from "@/services/five-case";
import { listGovernanceRoleHolders, listGovernanceRoles } from "@/services/modules";
import { qk } from "@/services/query-keys";

const NO_PATIENT_DATA = "Do not enter patient-identifiable information.";

function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-pmo-line bg-pmo-panel font-geist">
      <header className="flex items-center justify-between gap-2 border-b border-pmo-line px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-pmo-text">{title}</h2>
          {subtitle && <p className="text-[11px] text-pmo-muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function StagePill({ stage }: { stage: CaseStage }) {
  return (
    <span
      title={stageLabel[stage]}
      className="inline-flex items-center rounded-full border border-pmo-line px-2 py-0.5 text-[11px] font-medium text-pmo-text"
    >
      {stageShort[stage]}
    </span>
  );
}

// ---- Strategic case: spending objectives and critical success factors ----

const emptyObjective = (kind: ObjectiveKind): ObjectiveInput => ({
  kind,
  title: "",
  description: "",
  measure: "",
});

export function ObjectivesPanel({
  owner,
  version,
  editable,
}: {
  owner: CaseOwner;
  version: CaseVersion;
  editable: boolean;
}) {
  const [editing, setEditing] = useState<CaseObjective | ObjectiveKind | null>(null);
  const remove = useCaseAction(owner, (id: string) => deleteObjective(id), "Removed");
  const save = useCaseAction(owner, (input: ObjectiveInput) =>
    typeof editing === "string" || !editing
      ? addObjective(version.id, input, version.objectives.length)
      : updateObjective(editing.id, input, editing.updatedAt),
  );
  const groups: ObjectiveKind[] = ["spending_objective", "critical_success_factor"];
  return (
    <Panel
      title="Spending objectives and critical success factors"
      subtitle="Strategic case: what the investment must achieve, and how options are judged"
    >
      <div className="grid gap-4 px-4 py-3 md:grid-cols-2">
        {groups.map((kind) => {
          const items = version.objectives.filter((o) => o.kind === kind);
          return (
            <div key={kind}>
              <div className="mb-1.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-pmo-text">{objectiveKindLabel[kind]}s</h3>
                {editable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditing(kind)}
                  >
                    <Plus />
                    Add
                  </Button>
                )}
              </div>
              <ol className="space-y-1.5">
                {items.map((item, index) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 rounded-md border border-pmo-line px-2.5 py-1.5"
                  >
                    <span className="pmo-num pt-0.5 text-[11px] text-pmo-muted">
                      {kind === "spending_objective" ? "SO" : "CSF"}
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-pmo-text">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-pmo-muted">{item.description}</p>
                      )}
                      {item.measure && (
                        <p className="text-[11px] text-pmo-muted">Measure: {item.measure}</p>
                      )}
                    </div>
                    {editable && (
                      <span className="flex shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Edit ${item.title}`}
                          onClick={() => setEditing(item)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Remove ${item.title}`}
                          onClick={() => remove.mutate(item.id)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
                {!items.length && <li className="text-xs text-pmo-muted">None yet.</li>}
              </ol>
            </div>
          );
        })}
      </div>
      {editing && (
        <ObjectiveDialog
          initial={
            typeof editing === "string"
              ? emptyObjective(editing)
              : {
                  kind: editing.kind,
                  title: editing.title,
                  description: editing.description ?? "",
                  measure: editing.measure ?? "",
                }
          }
          onClose={() => setEditing(null)}
          onSave={(input) => save.mutate(input, { onSuccess: () => setEditing(null) })}
          saving={save.isPending}
        />
      )}
    </Panel>
  );
}

function ObjectiveDialog({
  initial,
  onClose,
  onSave,
  saving,
}: {
  initial: ObjectiveInput;
  onClose: () => void;
  onSave: (input: ObjectiveInput) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState(initial);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{objectiveKindLabel[form.kind]}</DialogTitle>
          <DialogDescription>{NO_PATIENT_DATA}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field label="Type">
            <Select
              value={form.kind}
              onValueChange={(kind) => setForm({ ...form, kind: kind as ObjectiveKind })}
            >
              <SelectTrigger aria-label="Type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(objectiveKindLabel) as ObjectiveKind[]).map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {objectiveKindLabel[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Title">
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Description">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <Field label="Measure">
            <Input
              value={form.measure}
              onChange={(e) => setForm({ ...form, measure: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => onSave(form)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ---- Economic and financial case: the appraisal aid ----

const parseAmount = (value: string) => {
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export function AppraisalAidPanel({
  owner,
  version,
  editable,
}: {
  owner: CaseOwner;
  version: CaseVersion;
  editable: boolean;
}) {
  const format = useFormat();
  const [rate, setRate] = useState(String(version.discountRate));
  const [years, setYears] = useState(String(version.appraisalYears));
  const [base, setBase] = useState(version.priceBaseYear ? String(version.priceBaseYear) : "");
  useEffect(() => {
    setRate(String(version.discountRate));
    setYears(String(version.appraisalYears));
    setBase(version.priceBaseYear ? String(version.priceBaseYear) : "");
  }, [version.discountRate, version.appraisalYears, version.priceBaseYear]);
  const saveSettings = useCaseAction(owner, () =>
    saveAppraisalSettings(
      version.id,
      {
        discountRate: Number(rate),
        appraisalYears: Number(years),
        priceBaseYear: base.trim() ? Number(base) : null,
      },
      version.updatedAt,
    ),
  );
  const flushSettings = () => {
    if (
      Number(rate) !== version.discountRate ||
      Number(years) !== version.appraisalYears ||
      (base.trim() ? Number(base) : null) !== version.priceBaseYear
    )
      saveSettings.mutate(undefined);
  };
  const shortlist = version.options.filter((o) => o.listStage === "short");
  return (
    <Panel
      title="Appraisal"
      subtitle="An aid to the economic and financial cases, not a substitute for finance review"
    >
      <div className="flex flex-wrap items-end gap-3 border-b border-pmo-line px-4 py-3">
        <SmallField label="Discount rate (%)">
          <Input
            inputMode="decimal"
            className="pmo-num h-8 w-24 text-right"
            disabled={!editable}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onBlur={flushSettings}
          />
        </SmallField>
        <SmallField label="Years appraised">
          <Input
            inputMode="numeric"
            className="pmo-num h-8 w-20 text-right"
            disabled={!editable}
            value={years}
            onChange={(e) => setYears(e.target.value)}
            onBlur={flushSettings}
          />
        </SmallField>
        <SmallField label="Price base year">
          <Input
            inputMode="numeric"
            className="pmo-num h-8 w-24 text-right"
            disabled={!editable}
            value={base}
            placeholder="—"
            onChange={(e) => setBase(e.target.value)}
            onBlur={flushSettings}
          />
        </SmallField>
        <p className="max-w-md text-[11px] text-pmo-muted">
          Year 0 is not discounted; year <i>t</i> is divided by (1 + rate)<sup>t</sup>. Optimism
          bias, set on each option, raises its costs. NPV counts cash benefits; net present social
          value (NPSV) adds non-cash benefits.
        </p>
      </div>
      {!shortlist.length && (
        <p className="px-4 py-6 text-center text-xs text-pmo-muted">
          Short-list an option to appraise it.
        </p>
      )}
      <div className="divide-y divide-pmo-line">
        {shortlist.map((option) => {
          const rows = version.optionYears.filter((y) => y.optionId === option.id);
          const result = appraiseOption(rows, {
            discountRatePct: version.discountRate,
            appraisalYears: version.appraisalYears,
            optimismBiasPct: option.optimismBiasPct,
          });
          return (
            <details key={option.id} className="group px-4 py-3" open={option.isPreferred}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="font-medium text-pmo-text">
                  {option.name}
                  {option.isPreferred && (
                    <span className="ml-1.5 text-[11px] text-pmo-accent">Preferred</span>
                  )}
                </span>
                <Figure label="NPV" value={format.currency(result.npv)} />
                <Figure label="NPSV" value={format.currency(result.npsv)} />
                <Figure
                  label="Benefit-cost ratio"
                  value={result.bcr === null ? "—" : `${result.bcr.toFixed(2)} : 1`}
                />
                <Figure
                  label="PV costs (with bias)"
                  value={format.currency(result.pvCostAdjusted)}
                />
              </summary>
              <YearsGrid
                owner={owner}
                versionId={version.id}
                optionId={option.id}
                optionName={option.name}
                years={version.appraisalYears}
                rows={rows}
                editable={editable}
              />
            </details>
          );
        })}
      </div>
    </Panel>
  );
}

function SmallField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-[11px] text-pmo-muted">
      {label}
      {children}
    </label>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11px] text-pmo-muted">
      {label} <span className="pmo-num text-sm text-pmo-text">{value}</span>
    </span>
  );
}

const YEAR_FIELDS = [
  ["capitalCost", "Capital"],
  ["revenueCost", "Revenue"],
  ["cashBenefit", "Cash benefit"],
  ["nonCashBenefit", "Non-cash benefit"],
] as const;
type YearField = (typeof YEAR_FIELDS)[number][0];

function YearsGrid({
  owner,
  versionId,
  optionId,
  optionName,
  years,
  rows,
  editable,
}: {
  owner: CaseOwner;
  versionId: string;
  optionId: string;
  optionName: string;
  years: number;
  rows: OptionYear[];
  editable: boolean;
}) {
  const format = useFormat();
  const save = useCaseAction(
    owner,
    (args: { yearIndex: number; values: Record<YearField, number> }) =>
      saveOptionYear(
        versionId,
        optionId,
        args.yearIndex,
        args.values,
        rows.find((r) => r.yearIndex === args.yearIndex),
      ),
  );
  const indexes = Array.from({ length: Math.min(years, 60) }, (_, i) => i);
  const totals = YEAR_FIELDS.map(([field]) => rows.reduce((sum, r) => sum + r[field], 0));
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Figures by year for {optionName}</caption>
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-[0.05em] text-pmo-muted">
            <th className="px-2 py-1.5 font-medium">Year</th>
            {YEAR_FIELDS.map(([field, label]) => (
              <th key={field} className="px-2 py-1.5 text-right font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {indexes.map((yearIndex) => {
            const row = rows.find((r) => r.yearIndex === yearIndex);
            return (
              <tr key={yearIndex} className="border-t border-pmo-line">
                <td className="pmo-num px-2 py-1 text-pmo-muted">{yearIndex}</td>
                {YEAR_FIELDS.map(([field, label]) => (
                  <td key={field} className="px-1 py-1 text-right">
                    {editable ? (
                      <Input
                        inputMode="decimal"
                        aria-label={`${label}, year ${yearIndex}`}
                        className="pmo-num h-7 min-w-[90px] text-right"
                        defaultValue={row && row[field] ? String(row[field]) : ""}
                        key={`${row?.updatedAt ?? "new"}-${field}`}
                        onBlur={(e) => {
                          const value = parseAmount(e.target.value);
                          if (value === (row?.[field] ?? 0)) return;
                          const values = Object.fromEntries(
                            YEAR_FIELDS.map(([f]) => [f, row?.[f] ?? 0]),
                          ) as Record<YearField, number>;
                          values[field] = value;
                          save.mutate({ yearIndex, values });
                        }}
                      />
                    ) : (
                      <span className="pmo-num">
                        {row && row[field] ? format.currency(row[field]) : "—"}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-pmo-line font-medium">
            <td className="px-2 py-1.5 text-[11px] uppercase text-pmo-muted">Total</td>
            {totals.map((total, i) => (
              <td key={YEAR_FIELDS[i]![0]} className="pmo-num px-2 py-1.5 text-right">
                {format.currency(total)}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---- Approval route ----

export function ApprovalRoutePanel({ owner, version }: { owner: CaseOwner; version: CaseVersion }) {
  const format = useFormat();
  const user = useUser();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const roles = useQuery({
    queryKey: qk.governanceRoles(orgId),
    queryFn: async () => ({
      roles: await listGovernanceRoles(orgId),
      holders: await listGovernanceRoleHolders(orgId),
    }),
  });
  const [comment, setComment] = useState("");
  const decide = useCaseAction(
    owner,
    (args: { stepId: string; decision: "approved" | "rejected" }) =>
      decideApprovalStep(args.stepId, args.decision, comment),
    "Decision recorded",
  );
  const approval = version.approval;
  if (!approval) {
    if (version.status !== "submitted") return null;
    return (
      <Panel title="Approval">
        <p className="px-4 py-3 text-xs text-pmo-muted">
          No approval route applies to this stage, so no approval steps were opened. An admin can
          set the routes in Settings › Modules.
        </p>
      </Panel>
    );
  }
  const roleLabel = (key: string | null) =>
    key ? (roles.data?.roles.find((r) => r.value === key)?.label ?? key) : null;
  const holds = (key: string | null) =>
    Boolean(key && roles.data?.holders.some((h) => h.roleKey === key && h.profileId === user.id));
  const open = approval.status === "pending";
  return (
    <Panel
      title="Approval"
      subtitle={
        approval.status === "pending"
          ? "Each step is decided by the governance role named"
          : approval.status === "approved"
            ? "Approved"
            : "Rejected: start a new version to revise and resubmit"
      }
    >
      <ol className="divide-y divide-pmo-line">
        {approval.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2 px-4 py-2.5">
            <span className="pt-0.5">
              {step.decision === "approved" ? (
                <CheckCircle2 className="size-4 text-pmo-good" aria-label="Approved" />
              ) : step.decision === "rejected" ? (
                <XCircle className="size-4 text-pmo-bad-text" aria-label="Rejected" />
              ) : (
                <Circle className="size-4 text-pmo-muted" aria-label="Waiting" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-pmo-text">{step.name}</p>
              <p className="text-[11px] text-pmo-muted">
                {step.decision
                  ? `${step.decision === "approved" ? "Approved" : "Rejected"}${
                      step.approverName ? ` by ${step.approverName}` : ""
                    }${step.decidedAt ? ` · ${format.date(step.decidedAt)}` : ""}`
                  : `Decided by the ${roleLabel(step.governanceRole) ?? "approver"}`}
              </p>
              {step.comment && <p className="text-xs text-pmo-muted">“{step.comment}”</p>}
              {open && !step.decision && holds(step.governanceRole) && (
                <div className="mt-2 grid gap-2">
                  <Textarea
                    rows={2}
                    aria-label="Comment or conditions"
                    placeholder="Comment or conditions (optional)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ stepId: step.id, decision: "approved" })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => decide.mutate({ stepId: step.id, decision: "rejected" })}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
