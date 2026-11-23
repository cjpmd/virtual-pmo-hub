// Efficiency / savings targets (NHS-4 part 2): a financial year's targets per workspace and
// organisational unit, with the gap to target for the plan, risk-adjusted plan, forecast outturn
// and actuals from public.efficiency_summary. Workspace PMO and admins edit (the database refuses
// anyone else); everyone else sees the table read-only.
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { financialYearLabel, gapToTarget, parseAmount } from "@/data/efficiency";
import {
  useEfficiencyMutations,
  useEfficiencySummary,
  useEfficiencyTargets,
} from "@/hooks/use-efficiency";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useFormat } from "@/lib/format";
import { useModuleTerm } from "@/lib/modules";

const WHOLE = "";

export function EfficiencyTargetsEditor({
  year,
  onYearChange,
  canEdit,
}: {
  year: number;
  onYearChange: (year: number) => void;
  /** Workspace PMO / admin somewhere (the database checks each workspace). */
  canEdit: boolean;
}) {
  const fmt = useFormat();
  const term = useModuleTerm();
  const startMonth = fmt.settings.regional.financialYearStartMonth || 4;
  const writable = useOrgWritable();
  const targets = useEfficiencyTargets();
  const summary = useEfficiencySummary(year);
  const workspaces = (useWorkspaces().data ?? []).filter((w) => !w.archivedAt);
  const units = fmt.settings.lists.businessUnits ?? [];
  const mutations = useEfficiencyMutations();

  const [workspaceId, setWorkspaceId] = useState("");
  const [unit, setUnit] = useState(WHOLE);
  const [amountText, setAmountText] = useState("");
  const amount = parseAmount(amountText);
  const chosenWorkspace = workspaceId || workspaces[0]?.id || "";

  const rows = (targets.data ?? []).filter((t) => t.financialYear === year);
  const byUnit = new Map((summary.data?.byUnit ?? []).map((u) => [u.key ?? "", u]));
  const showWorkspace = workspaces.length > 1;
  const workspaceName = (id: string) =>
    workspaces.find((w) => w.id === id)?.name ?? "Archived workspace";
  const editing = canEdit && writable;

  const measuresFor = (businessUnit: string | null) =>
    businessUnit ? byUnit.get(businessUnit) : summary.data ? { ...summary.data.totals } : undefined;

  return (
    <section className="space-y-3" aria-label="Targets">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous financial year"
          onClick={() => onYearChange(year - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="min-w-24 text-center text-sm font-semibold">
          {financialYearLabel(year, startMonth)} targets
        </h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next financial year"
          onClick={() => onYearChange(year + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">
            Targets and gap to target for {financialYearLabel(year, startMonth)}. A positive gap is
            short of target.
          </caption>
          <thead className="bg-muted/50 text-xs">
            <tr>
              {showWorkspace && (
                <th scope="col" className="px-2 py-1.5 text-left font-medium">
                  Workspace
                </th>
              )}
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                {term("orgUnit")}
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Target
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Gap: plan
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Gap: risk-adjusted
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Gap: forecast outturn
              </th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Gap: actual
              </th>
              {editing && (
                <th scope="col" className="sr-only">
                  Remove
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-3 text-muted-foreground">
                  No targets for this year yet.
                </td>
              </tr>
            )}
            {rows.map((t) => {
              const m = measuresFor(t.businessUnit);
              const gap = (value: number | undefined) => {
                const g = gapToTarget(t.amount, value ?? 0);
                return g == null ? "–" : fmt.currency(g);
              };
              return (
                <tr key={t.id} className="border-t">
                  {showWorkspace && <td className="px-2 py-1.5">{workspaceName(t.workspaceId)}</td>}
                  <td className="px-2 py-1.5">{t.businessUnit ?? "Whole workspace"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt.currency(t.amount)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{gap(m?.plan)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{gap(m?.riskAdjusted)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{gap(m?.forecastOutturn)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{gap(m?.actual)}</td>
                  {editing && (
                    <td className="px-1 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove the ${t.businessUnit ?? "whole workspace"} target`}
                        onClick={() => mutations.removeTarget.mutate(t.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showWorkspace && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Gaps for whole-workspace rows compare with the organisation's totals across all
          workspaces.
        </p>
      )}

      {canEdit && (
        <ReadOnlyTip readOnly={!writable}>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (amount === null || amount < 0 || !chosenWorkspace) return;
              const businessUnit = unit === WHOLE ? null : unit;
              const existing = rows.find(
                (t) => t.workspaceId === chosenWorkspace && t.businessUnit === businessUnit,
              );
              mutations.saveTarget.mutate(
                {
                  workspaceId: chosenWorkspace,
                  financialYear: year,
                  businessUnit,
                  amount,
                  ...(existing
                    ? { existing: { id: existing.id, updatedAt: existing.updatedAt } }
                    : {}),
                },
                { onSuccess: () => setAmountText("") },
              );
            }}
          >
            {showWorkspace && (
              <label className="space-y-1 text-xs">
                <span className="block text-muted-foreground">Workspace</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={chosenWorkspace}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  disabled={!writable}
                >
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="space-y-1 text-xs">
              <span className="block text-muted-foreground">{term("orgUnit")}</span>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={!writable}
              >
                <option value={WHOLE}>Whole workspace</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="block text-muted-foreground">Target ({fmt.symbol})</span>
              <Input
                className="h-9 w-36 text-right"
                inputMode="decimal"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                aria-invalid={
                  amountText !== "" && (amount === null || amount < 0) ? true : undefined
                }
                disabled={!writable}
              />
            </label>
            <Button
              type="submit"
              size="sm"
              disabled={
                !writable ||
                amountText === "" ||
                amount === null ||
                amount < 0 ||
                mutations.saveTarget.isPending
              }
            >
              Set target
            </Button>
          </form>
        </ReadOnlyTip>
      )}
      <p className="text-xs text-muted-foreground">
        A workspace's target is its whole-workspace target, else the sum of its{" "}
        {term("orgUnitPlural").toLowerCase()}' targets. Setting a target that already exists
        replaces it.
      </p>
    </section>
  );
}
