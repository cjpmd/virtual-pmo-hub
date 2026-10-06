// Project → Financials tab (design §3): summary, warnings, the monthly grid (cost lines ×
// months, one kind at a time), the cumulative chart, baseline history and the import log.
// Every figure comes from Supabase; the summary cards read v_project_financials, so they
// match health and every roll-up. Cells save through a debounced queue that never drops an
// edit (flush on blur, navigation, unmount and tab close).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  Archive,
  FileUp,
  Lock,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Scale,
} from "lucide-react";
import { ActualsImportDialog } from "@/components/actuals-import-dialog";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { QueryState } from "@/components/query-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDebouncedWrites } from "@/hooks/use-debounced-writes";
import {
  useFinancialMutations,
  useLookupOptions,
  useProjectFinancials,
} from "@/hooks/use-financials";
import { useProjectPermissions } from "@/hooks/use-hierarchy";
import { useCan } from "@/hooks/use-permissions";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/services/actuals-import";
import {
  baselineSourceLabel,
  type CostLine,
  type FinancialValue,
  type ProjectFinancialData,
} from "@/services/financials";
import {
  gridMonths,
  monthlySeries,
  parseAmount,
  type FinancialKind,
} from "@/services/financials-calc";
import type { ProjectDetail } from "@/services/hierarchy";

const kindLabel: Record<FinancialKind, string> = {
  budget: "Budget",
  actual: "Actual",
  forecast: "Forecast",
};

export function ProjectFinancials({ project }: { project: ProjectDetail }) {
  const financials = useProjectFinancials(project.id);
  return (
    <QueryState query={financials}>
      {(data) => <FinancialsBody project={project} data={data} />}
    </QueryState>
  );
}

function FinancialsBody({ project, data }: { project: ProjectDetail; data: ProjectFinancialData }) {
  const format = useFormat();
  const permissions = useProjectPermissions(project.id);
  const isPmo = useCan("pmo", project.workspaceId);
  const isManager = useCan("manager", project.workspaceId);
  const categories = useLookupOptions("cost_category");
  const [kind, setKind] = useState<FinancialKind>("forecast");
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<"line" | "initial" | "adjust" | "import" | null>(null);
  const { summary } = data;
  const thresholds = format.settings.health;

  const canEditKind = (value: FinancialKind) =>
    value === "forecast" ? permissions.canEdit : isPmo;
  const months = useMemo(
    () => gridMonths(data.values, project.startDate, project.finishDate, summary.actualsThrough),
    [data.values, project.startDate, project.finishDate, summary.actualsThrough],
  );
  const series = useMemo(
    () => monthlySeries(data.values, summary.actualsThrough, months),
    [data.values, summary.actualsThrough, months],
  );
  const negatives = data.values.filter((value) => value.kind === "actual" && value.amount < 0);

  const varianceTone =
    summary.variancePercent === null
      ? "muted"
      : summary.variancePercent > thresholds.financialOffTrackPercent
        ? "bad"
        : summary.variancePercent > thresholds.financialAtRiskPercent
          ? "warn"
          : "good";
  const latest = data.baselines[0];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Budget"
          value={summary.hasBaseline ? format.currency(summary.budget) : "No baseline"}
          detail={
            latest
              ? `Baseline v${latest.version} · ${baselineSourceLabel[latest.source]}`
              : "Financial health is not set until there is a baseline"
          }
        />
        <Stat
          label="Actual to date"
          value={format.currency(summary.actualToDate)}
          detail={`Actuals through ${monthLabel(summary.actualsThrough)}`}
        />
        <Stat
          label="Estimate at completion"
          value={format.currency(summary.eac)}
          detail={`${format.currency(summary.forecastRemaining)} forecast after ${monthLabel(summary.actualsThrough)}`}
        />
        <Stat
          label="Variance"
          value={summary.hasBaseline ? format.currency(summary.variance) : "—"}
          detail={
            summary.variancePercent === null
              ? "Needs a baseline"
              : `${summary.variancePercent > 0 ? "+" : ""}${summary.variancePercent}% against the budget · ${
                  summary.variance >= 0 ? "under" : "over"
                }`
          }
          tone={varianceTone}
        />
      </div>

      {(summary.openMonthOverrun ||
        negatives.length > 0 ||
        (summary.hasBaseline && summary.budgetPhased !== 0 && summary.phasingGap !== 0) ||
        !summary.hasBaseline) && (
        <div className="space-y-2">
          {summary.openMonthOverrun && summary.overrunMonth && (
            <Warning title="EAC may be understated">
              Actuals for {monthLabel(summary.overrunMonth)} already exceed the forecast; EAC may be
              understated.
            </Warning>
          )}
          {summary.hasBaseline && summary.budgetPhased !== 0 && summary.phasingGap !== 0 && (
            <Warning title="Budget phasing doesn't match the baseline">
              The monthly budget adds up to {format.currency(summary.budgetPhased)}, against a
              baseline of {format.currency(summary.budget)} (
              {format.currency(Math.abs(summary.phasingGap))}{" "}
              {summary.phasingGap > 0 ? "not yet phased" : "over-phased"}).
            </Warning>
          )}
          {negatives.length > 0 && (
            <Warning title="Credits in the actuals">
              {negatives.length} negative actual{negatives.length === 1 ? "" : "s"} (credits),
              marked in the grid. Check they are refunds or corrections, not errors.
            </Warning>
          )}
          {!summary.hasBaseline && (
            <Warning title="No budget baseline yet">
              {isManager
                ? "Set the first baseline to start measuring financial health."
                : "A manager or the PMO sets the first baseline."}
            </Warning>
          )}
        </div>
      )}

      <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Monthly values</h2>
            <p className="text-xs text-muted-foreground">
              Months to {monthLabel(summary.actualsThrough)} count actuals; later months count
              forecast. Closed months are locked.
              {kind === "budget" &&
                summary.hasBaseline &&
                summary.budgetPhased === 0 &&
                " The budget isn't phased by month yet."}
              {!canEditKind(kind) &&
                (kind === "forecast"
                  ? " You can't edit this project."
                  : ` Only the PMO enters ${kind === "budget" ? "budget phasing" : "actuals"}.`)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(value) => value && setKind(value as FinancialKind)}
              variant="outline"
              size="sm"
              aria-label="Values to show"
            >
              {(["budget", "actual", "forecast"] as const).map((item) => (
                <ToggleGroupItem key={item} value={item}>
                  {kindLabel[item]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {permissions.canEdit && (
              <Button size="sm" variant="outline" onClick={() => setDialog("line")}>
                <Plus />
                Add cost line
              </Button>
            )}
            {isPmo && (
              <Button size="sm" variant="outline" onClick={() => setDialog("import")}>
                <FileUp />
                Import actuals
              </Button>
            )}
            {!summary.hasBaseline && isManager && (
              <Button size="sm" onClick={() => setDialog("initial")}>
                <Scale />
                Set baseline
              </Button>
            )}
            {summary.hasBaseline && isPmo && (
              <Button size="sm" variant="outline" onClick={() => setDialog("adjust")}>
                <Scale />
                Adjust baseline
              </Button>
            )}
          </div>
        </div>
        <label className="mt-3 flex w-fit items-center gap-2 text-xs text-muted-foreground">
          <Checkbox
            checked={showArchived}
            onCheckedChange={(value) => setShowArchived(value === true)}
          />
          Show archived lines
        </label>
        <ValueGrid
          project={project}
          data={data}
          kind={kind}
          months={months}
          editable={canEditKind(kind)}
          canManageLines={permissions.canEdit}
          showArchived={showArchived}
          categoryLabel={(id) => categories.data?.find((item) => item.id === id)?.label ?? ""}
        />
      </section>

      <ChartCard
        title="Cumulative spend"
        subtitle={`Budget phasing, actuals to ${monthLabel(summary.actualsThrough)} and the estimate at completion`}
        info="Running totals by month. The forecast line starts from actual spend at the cut-off and adds the forecast for each later month; where it ends is the estimate at completion."
        legend={
          <>
            <LegendItem colour="var(--viz-cat-2)" label="Budget" shape="line" />
            <LegendItem colour="var(--viz-cat-1)" label="Actual" shape="line" />
            <LegendItem colour="var(--viz-cat-5)" label="Forecast (EAC path)" shape="dashed" />
          </>
        }
        empty={
          data.values.length
            ? undefined
            : {
                title: "Nothing to chart yet",
                detail: "Add cost lines and enter budget, actuals or forecast.",
              }
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={series} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={(value: string) => shortMonth(value)}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(value) => format.compact(Number(value))}
                tick={{ fontSize: 11 }}
                width={64}
              />
              <Tooltip
                labelFormatter={(value) => monthLabel(String(value))}
                formatter={(value: number | string) => format.currency(Number(value))}
              />
              <ReferenceLine
                x={summary.actualsThrough}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
                label={{ value: "Cut-off", position: "insideTopRight", fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeBudget"
                name="Budget"
                stroke="var(--viz-cat-2)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="cumulativeActual"
                name="Actual"
                stroke="var(--viz-cat-1)"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="cumulativeForecast"
                name="Forecast"
                stroke="var(--viz-cat-5)"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold">Baseline history</h2>
          {data.baselines.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Version</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 font-medium">Approved</th>
                </tr>
              </thead>
              <tbody>
                {data.baselines.map((baseline) => (
                  <tr key={baseline.id} className="border-t border-border/60 align-top">
                    <td className="py-2 pr-3 font-medium">v{baseline.version}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {format.currency(baseline.total)}
                    </td>
                    <td className="py-2 pr-3">
                      {baselineSourceLabel[baseline.source]}
                      {baseline.changeRequestLabel && (
                        <span className="block text-xs text-muted-foreground">
                          {baseline.changeRequestLabel}
                        </span>
                      )}
                      {baseline.reason && (
                        <span className="block text-xs text-muted-foreground">
                          “{baseline.reason}”
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {format.date(baseline.approvedAt)}
                      {baseline.approvedBy ? ` · ${baseline.approvedBy}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No baseline yet.</p>
          )}
        </section>
        <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <h2 className="font-display text-lg font-semibold">Import log</h2>
          {data.imports.length ? (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Imported</th>
                  <th className="py-2 pr-3 text-right font-medium">Rows</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.imports.slice(0, 10).map((item) => (
                  <tr key={item.importId} className="border-t border-border/60">
                    <td className="py-2 pr-3">
                      {item.fileName}
                      <span className="block text-xs text-muted-foreground">
                        {item.mode === "replace" ? "Replaced the months" : "Added to the months"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {format.date(item.importedAt)}
                      {item.importedBy ? ` · ${item.importedBy}` : ""}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{item.rows}</td>
                    <td className="py-2 text-right tabular-nums">{format.currency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No actuals have been imported for this project.
            </p>
          )}
        </section>
      </div>

      <AddLineDialog
        open={dialog === "line"}
        onOpenChange={(open) => setDialog(open ? "line" : null)}
        projectId={project.id}
        nextSort={data.lines.reduce((max, line) => Math.max(max, line.sortOrder + 1), 0)}
      />
      <BaselineDialog
        mode={dialog === "adjust" ? "adjust" : "initial"}
        open={dialog === "initial" || dialog === "adjust"}
        onOpenChange={(open) => !open && setDialog(null)}
        projectId={project.id}
        current={summary.hasBaseline ? summary.budget : null}
        phased={summary.budgetPhased}
      />
      {dialog === "import" && (
        <ActualsImportDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          workspaceId={project.workspaceId}
          defaultProject={{ id: project.id, code: project.code }}
        />
      )}
    </div>
  );
}

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortMonth = (month: string) =>
  `${SHORT[Number(month.slice(5, 7)) - 1]} ${month.slice(2, 4)}`;

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "bad" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-2xl font-semibold tabular-nums",
          tone === "good" && "text-health-good-foreground",
          tone === "warn" && "text-health-warn-foreground",
          tone === "bad" && "text-health-bad-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Warning({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Alert className="border-health-warn/40 bg-health-warn/10">
      <AlertTriangle className="size-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

// ---- The grid ------------------------------------------------------------------------------

type Existing = { id: string; updatedAt: string };

function ValueGrid({
  project,
  data,
  kind,
  months,
  editable,
  canManageLines,
  showArchived,
  categoryLabel,
}: {
  project: ProjectDetail;
  data: ProjectFinancialData;
  kind: FinancialKind;
  months: string[];
  editable: boolean;
  canManageLines: boolean;
  showArchived: boolean;
  categoryLabel: (id: string) => string;
}) {
  const format = useFormat();
  const mutations = useFinancialMutations(project.id);
  const closed = useMemo(() => new Set(data.closedMonths), [data.closedMonths]);
  const cutoff = data.summary.actualsThrough;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<CostLine | null>(null);
  // Rows this screen wrote since the last load: id and updated_at, or null once deleted.
  const written = useRef(new Map<string, Existing | null>());
  // Open the grid at the cut-off month, not at the project's first month.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    const column = box?.querySelector<HTMLElement>(`[data-month="${cutoff}"]`);
    const sticky = box?.querySelector<HTMLElement>("thead th")?.offsetWidth ?? 0;
    if (box && column)
      box.scrollLeft = Math.max(0, column.offsetLeft - sticky - 3 * column.offsetWidth);
  }, [cutoff, kind]);

  const server = useMemo(() => {
    const map = new Map<string, FinancialValue>();
    for (const value of data.values)
      map.set(`${value.costLineId}|${value.periodMonth}|${value.kind}`, value);
    return map;
  }, [data.values]);
  // Once the server agrees with what this screen wrote, forget the local copy.
  useEffect(() => {
    for (const [key, local] of written.current) {
      const value = server.get(key);
      if ((local === null && !value) || (local && value?.id === local.id))
        written.current.delete(key);
    }
  }, [server]);

  const existingFor = (key: string): Existing | undefined => {
    if (written.current.has(key)) return written.current.get(key) ?? undefined;
    const value = server.get(key);
    return value ? { id: value.id, updatedAt: value.updatedAt } : undefined;
  };

  const { queue, cancel } = useDebouncedWrites<number | null>(async (key, amount) => {
    const [costLineId, periodMonth, valueKind] = key.split("|") as [string, string, FinancialKind];
    try {
      const result = await mutations.saveCell.mutateAsync({
        projectId: project.id,
        costLineId,
        periodMonth,
        kind: valueKind,
        amount,
        existing: existingFor(key),
      });
      if (amount === null) written.current.set(key, null);
      else if (result && "id" in result && result.updatedAt)
        written.current.set(key, { id: result.id, updatedAt: result.updatedAt });
    } finally {
      // Show the server's value from here on (the mutation refetches), unless typed over since.
      setDrafts((current) => {
        const draft = current[key];
        if (draft === undefined) return current;
        const typed = draft.trim() === "" ? null : parseAmount(draft);
        if (typed !== amount) return current;
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  });

  const lines = data.lines.filter((line) => showArchived || !line.archived);
  const amountOf = (key: string) => {
    if (key in drafts) {
      const parsed = drafts[key]!.trim() === "" ? 0 : parseAmount(drafts[key]!);
      return parsed ?? 0;
    }
    return server.get(key)?.amount ?? 0;
  };
  const rowTotal = (line: CostLine) =>
    months.reduce((sum, month) => sum + amountOf(`${line.id}|${month}|${kind}`), 0);
  const columnTotal = (month: string) =>
    lines.reduce((sum, line) => sum + amountOf(`${line.id}|${month}|${kind}`), 0);
  const display = (value: number) =>
    value === 0 ? "" : format.number(value, Number.isInteger(value) ? 0 : 2);

  if (!data.lines.length)
    return (
      <p className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No cost lines yet.{" "}
        {canManageLines ? "Add a line for each thing the project spends money on." : ""}
      </p>
    );

  return (
    <div ref={scroller} className="mt-3 overflow-x-auto rounded-md border border-border/70">
      <table
        className="w-max min-w-full border-collapse text-sm"
        aria-label={`${kindLabel[kind]} by cost line and month`}
      >
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 min-w-56 bg-muted px-3 py-2 text-left font-medium">
              Cost line
            </th>
            {months.map((month) => (
              <th
                key={month}
                data-month={month}
                className={cn(
                  "min-w-24 px-2 py-2 text-right font-medium",
                  month === cutoff && "border-r-2 border-r-primary/50",
                  month > cutoff && kind === "actual" && "bg-health-warn/5",
                )}
                title={
                  closed.has(month)
                    ? `${monthLabel(month)} is closed`
                    : month > cutoff
                      ? "After the cut-off: forecast counts here"
                      : "Up to the cut-off: actuals count here"
                }
              >
                <span className="inline-flex items-center gap-1">
                  {closed.has(month) && <Lock className="size-3" aria-label="Closed" />}
                  {shortMonth(month)}
                </span>
              </th>
            ))}
            <th className="min-w-28 px-3 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.id}
              className={cn("border-t border-border/60", line.archived && "opacity-60")}
            >
              <th
                scope="row"
                className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-normal"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{line.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {categoryLabel(line.categoryId)} ·{" "}
                      {line.spendType === "capital" ? "Capital" : "Operating"}
                      {line.archived ? " · archived" : ""}
                    </p>
                  </div>
                  {canManageLines && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`Actions for ${line.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setRenaming(line)}>
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            mutations.updateLine.mutate({
                              id: line.id,
                              input: { archived: !line.archived },
                              lastSeen: line.updatedAt,
                            })
                          }
                        >
                          {line.archived ? (
                            <>
                              <RotateCcw className="size-4" /> Restore
                            </>
                          ) : (
                            <>
                              <Archive className="size-4" /> Archive
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </th>
              {months.map((month) => {
                const key = `${line.id}|${month}|${kind}`;
                const locked = !editable || closed.has(month) || line.archived;
                const text = key in drafts ? drafts[key]! : display(server.get(key)?.amount ?? 0);
                const parsed = text.trim() === "" ? null : parseAmount(text);
                const invalid = text.trim() !== "" && parsed === null;
                const negative = kind === "actual" && (parsed ?? 0) < 0;
                return (
                  <td
                    key={month}
                    className={cn(
                      "px-1 py-1 text-right",
                      month === cutoff && "border-r-2 border-r-primary/50",
                      month > cutoff && kind === "actual" && "bg-health-warn/5",
                      closed.has(month) && "bg-muted/50",
                    )}
                  >
                    {locked ? (
                      <span
                        className={cn(
                          "block px-2 py-1 tabular-nums",
                          negative && "font-semibold text-health-bad-foreground",
                        )}
                        title={negative ? "Credit (negative actual)" : undefined}
                      >
                        {text}
                      </span>
                    ) : (
                      <input
                        aria-label={`${line.name}, ${monthLabel(month)}, ${kindLabel[kind]}`}
                        inputMode="decimal"
                        value={text}
                        onChange={(event) => {
                          const next = event.target.value;
                          setDrafts((current) => ({ ...current, [key]: next }));
                          const amount = next.trim() === "" ? null : parseAmount(next);
                          if (next.trim() !== "" && amount === null) cancel(key);
                          else queue(key, amount);
                        }}
                        title={
                          invalid
                            ? "Not a number"
                            : negative
                              ? "Credit (negative actual)"
                              : undefined
                        }
                        className={cn(
                          "h-8 w-24 rounded border border-transparent bg-transparent px-2 text-right tabular-nums outline-none hover:border-border focus:border-primary focus:bg-background",
                          invalid && "border-destructive text-destructive",
                          negative && "font-semibold text-health-bad-foreground",
                        )}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                {display(rowTotal(line))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border bg-muted/30 text-sm font-semibold">
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-muted px-3 py-2 text-left">
              Total
            </th>
            {months.map((month) => (
              <td
                key={month}
                className={cn(
                  "px-3 py-2 text-right tabular-nums",
                  month === cutoff && "border-r-2 border-r-primary/50",
                )}
              >
                {display(columnTotal(month))}
              </td>
            ))}
            <td className="px-3 py-2 text-right tabular-nums">
              {display(lines.reduce((sum, line) => sum + rowTotal(line), 0))}
            </td>
          </tr>
        </tfoot>
      </table>
      <RenameLineDialog line={renaming} onClose={() => setRenaming(null)} projectId={project.id} />
    </div>
  );
}

// ---- Dialogs ---------------------------------------------------------------------------------

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}

function AddLineDialog({
  open,
  onOpenChange,
  projectId,
  nextSort,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  nextSort: number;
}) {
  const categories = useLookupOptions("cost_category");
  const funding = useLookupOptions("funding_source");
  const { addLine } = useFinancialMutations(projectId);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [spendType, setSpendType] = useState<"operating" | "capital">("operating");
  const [fundingId, setFundingId] = useState("none");
  useEffect(() => {
    if (open) {
      setName("");
      setCategoryId("");
      setSpendType("operating");
      setFundingId("none");
    }
  }, [open]);
  const activeCategories = (categories.data ?? []).filter((item) => item.active);
  const activeFunding = (funding.data ?? []).filter((item) => item.active);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a cost line</DialogTitle>
          <DialogDescription>
            One line for each thing the project spends money on, e.g. “Developer contractors” or
            “Licences”.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Name" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Category" required>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger aria-label="Category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Spend type">
              <Select
                value={spendType}
                onValueChange={(value) => setSpendType(value as "operating" | "capital")}
              >
                <SelectTrigger aria-label="Spend type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operating">Operating</SelectItem>
                  <SelectItem value="capital">Capital</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Funding source">
              <Select value={fundingId} onValueChange={setFundingId}>
                <SelectTrigger aria-label="Funding source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {activeFunding.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !categoryId || addLine.isPending}
            onClick={() =>
              addLine.mutate(
                {
                  input: {
                    name,
                    categoryId,
                    spendType,
                    fundingSourceId: fundingId === "none" ? null : fundingId,
                  },
                  sortOrder: nextSort,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Add line
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameLineDialog({
  line,
  onClose,
  projectId,
}: {
  line: CostLine | null;
  onClose: () => void;
  projectId: string;
}) {
  const { updateLine } = useFinancialMutations(projectId);
  const [name, setName] = useState("");
  useEffect(() => setName(line?.name ?? ""), [line]);
  return (
    <Dialog open={Boolean(line)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename cost line</DialogTitle>
          <DialogDescription>The line keeps its values and history.</DialogDescription>
        </DialogHeader>
        <Field label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || !line || updateLine.isPending}
            onClick={() =>
              line &&
              updateLine.mutate(
                { id: line.id, input: { name }, lastSeen: line.updatedAt },
                { onSuccess: onClose },
              )
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BaselineDialog({
  mode,
  open,
  onOpenChange,
  projectId,
  current,
  phased,
}: {
  mode: "initial" | "adjust";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  current: number | null;
  phased: number;
}) {
  const format = useFormat();
  const { addBaseline } = useFinancialMutations(projectId);
  const [total, setTotal] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setTotal(
        mode === "initial" && phased > 0 ? String(phased) : current !== null ? String(current) : "",
      );
      setReason("");
    }
  }, [open, mode, current, phased]);
  const amount = parseAmount(total);
  const valid =
    amount !== null &&
    amount >= 0 &&
    (mode === "initial" || (reason.trim() !== "" && amount !== current));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "initial" ? "Set the first budget baseline" : "Adjust the budget baseline"}
          </DialogTitle>
          <DialogDescription>
            {mode === "initial"
              ? "Version 1 of the approved budget. After this, the baseline changes only through an approved change request or a PMO adjustment."
              : `A new baseline version with your reason, recorded against your name. The current baseline is ${format.currency(current ?? 0)}. Prefer an approved change request where there is one.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Total budget" required>
            <Input
              inputMode="decimal"
              value={total}
              onChange={(event) => setTotal(event.target.value)}
            />
          </Field>
          {mode === "adjust" && (
            <Field label="Reason" required>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Re-scoped after the discovery phase, agreed at Programme Board"
              />
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid || addBaseline.isPending}
            onClick={() =>
              amount !== null &&
              addBaseline.mutate(
                {
                  projectId,
                  total: amount,
                  source: mode === "initial" ? "initial" : "pmo_adjustment",
                  ...(mode === "adjust" ? { reason } : {}),
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {mode === "initial" ? "Set baseline" : "Save new version"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
