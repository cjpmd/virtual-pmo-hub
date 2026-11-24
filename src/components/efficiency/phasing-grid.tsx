// Efficiency / savings scheme phasing grid (NHS-4 part 2): one financial year's twelve months ×
// plan / forecast / actual, each split recurrent and non-recurrent, with the year totals, forecast
// outturn, risk-adjusted value, carry-forward and full-year effect underneath. Typed cells are kept
// locally until Save, which writes only the changed cells through the shared write helper. Every
// cell is a text input, so the grid works by keyboard (Tab / Shift+Tab) with no drag and drop.
// The database refuses writes the person isn't allowed (module off, not a lead, read-only org).
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { Button } from "@/components/ui/button";
import {
  CONFIDENCE_LABELS,
  VALUE_KINDS,
  VALUE_KIND_LABELS,
  buildGrid,
  copyKind,
  financialYearLabel,
  financialYearMonths,
  gridChanges,
  gridKey,
  parseAmount,
  riskAdjusted,
  runRateFullYearEffect,
  yearTotals,
  type PhasingGrid as Grid,
  type ValueKind,
} from "@/data/efficiency";
import {
  useEfficiencyMutations,
  useEfficiencySettings,
  useSchemeValues,
} from "@/hooks/use-efficiency";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useFormat } from "@/lib/format";
import type { EfficiencyScheme } from "@/services/efficiency";

const monthLabel = (month: string) =>
  new Date(`${month}T00:00:00Z`).toLocaleString("en-GB", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });

type Part = "recurrent" | "nonRecurrent";
const PART_LABELS: Record<Part, string> = { recurrent: "Recurrent", nonRecurrent: "Non-recurrent" };

export function PhasingGrid({
  scheme,
  canEditPlan,
  canEditActuals,
  canValidate,
  initialYear,
}: {
  scheme: EfficiencyScheme;
  /** Plan and forecast: workspace managers and the scheme's leads. */
  canEditPlan: boolean;
  /** Actuals: the same people (finance validates them). */
  canEditActuals: boolean;
  /** The finance lead, or workspace PMO / admin. */
  canValidate: boolean;
  initialYear?: number;
}) {
  const fmt = useFormat();
  const startMonth = fmt.settings.regional.financialYearStartMonth || 4;
  const writable = useOrgWritable();
  const [year, setYear] = useState(initialYear ?? scheme.financialYear);
  const months = useMemo(() => financialYearMonths(year, startMonth), [year, startMonth]);
  const values = useSchemeValues(scheme.id);
  const settings = useEfficiencySettings();
  const mutations = useEfficiencyMutations();

  const stored = useMemo(() => buildGrid(values.data ?? [], months), [values.data, months]);
  const [edited, setEdited] = useState<Grid>(stored);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  useEffect(() => {
    setEdited(stored);
    setDrafts({});
  }, [stored]);

  const changes = useMemo(() => gridChanges(stored, edited), [stored, edited]);
  const invalid = Object.values(drafts).some((text) => parseAmount(text) === null);
  const totals = useMemo(() => yearTotals(edited, months), [edited, months]);
  const weights = settings.data?.confidenceWeights;
  const adjusted = riskAdjusted(totals.plan, scheme.confidence, weights);
  const runRate = runRateFullYearEffect(
    (values.data ?? []).map((v) => ({
      month: v.month,
      kind: v.kind,
      recurrent: v.recurrent,
      nonRecurrent: v.nonRecurrent,
    })),
  );

  const editable = (kind: ValueKind) =>
    writable && (kind === "actual" ? canEditActuals : canEditPlan);
  const cellId = (kind: ValueKind, part: Part, month: string) => `${gridKey(kind, month)}:${part}`;

  const onType = (kind: ValueKind, part: Part, month: string, text: string) => {
    const id = cellId(kind, part, month);
    setDrafts((d) => ({ ...d, [id]: text }));
    const amount = parseAmount(text);
    if (amount === null) return;
    setEdited((g) => {
      const key = gridKey(kind, month);
      const cell = g[key] ?? { recurrent: 0, nonRecurrent: 0 };
      return { ...g, [key]: { ...cell, [part]: amount } };
    });
  };
  const onBlur = (kind: ValueKind, part: Part, month: string) => {
    const id = cellId(kind, part, month);
    if (parseAmount(drafts[id] ?? "") === null) return; // keep the bad text visible
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
  };

  const unvalidatedActuals = months.filter((m) => {
    const cell = stored[gridKey("actual", m)];
    return cell?.id && !cell.validated;
  });

  return (
    <section className="space-y-3" aria-label="Phasing">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous financial year"
            onClick={() => setYear((y) => y - 1)}
            disabled={changes.length > 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="min-w-24 text-center text-sm font-semibold">
            {financialYearLabel(year, startMonth)}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next financial year"
            onClick={() => setYear((y) => y + 1)}
            disabled={changes.length > 0}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable("forecast") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEdited((g) => copyKind(g, "plan", "forecast", months))}
            >
              Copy plan to forecast
            </Button>
          )}
          {canValidate && unvalidatedActuals.length > 0 && (
            <ReadOnlyTip readOnly={!writable}>
              <Button
                variant="outline"
                size="sm"
                disabled={!writable || changes.length > 0 || mutations.validateActuals.isPending}
                onClick={() =>
                  mutations.validateActuals.mutate({
                    schemeId: scheme.id,
                    months: unvalidatedActuals,
                  })
                }
              >
                Validate {unvalidatedActuals.length} actual
                {unvalidatedActuals.length === 1 ? "" : "s"}
              </Button>
            </ReadOnlyTip>
          )}
          {changes.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEdited(stored);
                  setDrafts({});
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                disabled={invalid || mutations.saveGrid.isPending}
                onClick={() => mutations.saveGrid.mutate({ schemeId: scheme.id, changes })}
              >
                Save {changes.length} change{changes.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      </div>

      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          Enter amounts as numbers with up to two decimals, e.g. 1250 or 1,250.50.
        </p>
      )}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[960px] border-collapse text-xs">
          <caption className="sr-only">
            {scheme.ref} phasing for {financialYearLabel(year, startMonth)}, in{" "}
            {fmt.settings.regional.baseCurrency}
          </caption>
          <thead>
            <tr className="bg-muted/50">
              <th scope="col" className="px-2 py-1.5 text-left font-medium">
                {fmt.symbol}
              </th>
              {months.map((m) => (
                <th key={m} scope="col" className="px-1 py-1.5 text-right font-medium">
                  {monthLabel(m)}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 text-right font-medium">
                Year
              </th>
            </tr>
          </thead>
          <tbody>
            {VALUE_KINDS.map((kind) =>
              (["recurrent", "nonRecurrent"] as Part[]).map((part, i) => {
                const rowTotal = months.reduce(
                  (sum, m) => sum + (edited[gridKey(kind, m)]?.[part] ?? 0),
                  0,
                );
                return (
                  <tr key={`${kind}-${part}`} className={i === 0 ? "border-t" : undefined}>
                    <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                      {i === 0 && (
                        <span className="mr-1 font-medium">{VALUE_KIND_LABELS[kind]}</span>
                      )}
                      <span className="text-muted-foreground">{PART_LABELS[part]}</span>
                    </th>
                    {months.map((m) => {
                      const cell = edited[gridKey(kind, m)];
                      const id = cellId(kind, part, m);
                      const text = drafts[id] ?? String(cell?.[part] ?? 0);
                      const bad = drafts[id] !== undefined && parseAmount(drafts[id]) === null;
                      const label = `${VALUE_KIND_LABELS[kind]} ${PART_LABELS[part].toLowerCase()}, ${monthLabel(m)}`;
                      return (
                        <td key={m} className="px-0.5 py-0.5 text-right">
                          {editable(kind) ? (
                            <input
                              aria-label={label}
                              aria-invalid={bad || undefined}
                              inputMode="decimal"
                              className={`w-[4.5rem] rounded border bg-background px-1 py-0.5 text-right tabular-nums ${bad ? "border-destructive" : "border-input"}`}
                              value={text}
                              onChange={(e) => onType(kind, part, m, e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onBlur={() => onBlur(kind, part, m)}
                            />
                          ) : (
                            <span className="tabular-nums">{fmt.number(cell?.[part] ?? 0)}</span>
                          )}
                          {kind === "actual" && part === "recurrent" && cell?.validated && (
                            <span className="sr-only">validated</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right font-medium tabular-nums">
                      {fmt.number(rowTotal)}
                    </td>
                  </tr>
                );
              }),
            )}
            <tr className="border-t bg-muted/30">
              <th scope="row" className="px-2 py-1 text-left font-normal text-muted-foreground">
                Actual validated
              </th>
              {months.map((m) => {
                const cell = stored[gridKey("actual", m)];
                return (
                  <td key={m} className="px-1 py-1 text-right text-muted-foreground">
                    {cell?.id ? (cell.validated ? "Yes" : "No") : "–"}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Figure label="In-year plan" value={fmt.currency(totals.plan)}>
          {fmt.currency(totals.planRecurrent)} recurrent
        </Figure>
        <Figure label="Risk-adjusted plan" value={fmt.currency(adjusted)}>
          {scheme.confidence ? CONFIDENCE_LABELS[scheme.confidence] : "No planning confidence set"}
        </Figure>
        <Figure label="Forecast outturn" value={fmt.currency(totals.forecastOutturn)}>
          Actual where recorded, else forecast, else plan
        </Figure>
        <Figure label="Actual to date" value={fmt.currency(totals.actual)} />
        <Figure
          label="Full-year effect"
          value={
            scheme.fullYearEffect != null
              ? fmt.currency(scheme.fullYearEffect)
              : runRate != null
                ? fmt.currency(runRate)
                : "–"
          }
        >
          {scheme.fullYearEffect != null
            ? "Recorded on the scheme"
            : runRate != null
              ? "Run rate (last three planned months × 12)"
              : "No plan yet"}
        </Figure>
        <Figure label="Recurrent carry-forward" value={fmt.currency(totals.carryForward)}>
          Last month's recurrent plan × 12
        </Figure>
      </dl>
    </section>
  );
}

function Figure({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
      {children && <dd className="text-xs text-muted-foreground">{children}</dd>}
    </div>
  );
}
