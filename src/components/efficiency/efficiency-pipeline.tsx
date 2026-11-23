// Efficiency / savings programme (NHS-4 part 3): Portfolio › Efficiency. The pipeline board (one
// column per stage with this year's planned and risk-adjusted totals), the same schemes as a list,
// and the year's targets. Stage moves use buttons and a menu, never drag and drop, so the board
// works by keyboard; the database's stage rules decide every move (a refused move says what the
// scheme still needs). Shown in navigation only while the 'efficiency' module is on.
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { PageHeader, DataTable, type Column } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { SampleChip } from "@/components/sample-badge";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssessmentStatusChip } from "@/components/impact-assessment/impact-assessment-panel";
import {
  CONFIDENCE_LABELS,
  STAGES,
  STAGE_LABELS,
  adjacentStages,
  filterSchemes,
  financialYearLabel,
  pipelineColumns,
  type EfficiencyStage,
  type SchemeFilter,
} from "@/data/efficiency";
import { isAssessmentStatus } from "@/data/impact-assessment";
import {
  useEfficiencyMutations,
  useEfficiencySchemes,
  useSchemeOptions,
} from "@/hooks/use-efficiency";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useCan, useWorkspaceRoles } from "@/hooks/use-permissions";
import { useWorkspaces } from "@/hooks/use-workspaces";
import { useFormat } from "@/lib/format";
import { useModule, useModuleTerm } from "@/lib/modules";
import { atLeast } from "@/services/auth";
import type { EfficiencyScheme } from "@/services/efficiency";
import { EfficiencyDashboard } from "./efficiency-dashboard";
import { EfficiencyImport } from "./efficiency-import";
import { EfficiencyTargetsEditor } from "./targets-editor";
import { SchemeFormSheet } from "./scheme-form";

const selectClass =
  "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type View = "board" | "list" | "dashboard" | "targets";
const VIEW_LABELS: Record<View, string> = {
  board: "Pipeline",
  list: "List",
  dashboard: "Dashboard",
  targets: "Targets",
};

export function EfficiencyPipelinePage() {
  const enabled = useModule("efficiency");
  const term = useModuleTerm();
  const schemes = useEfficiencySchemes();
  if (!enabled) {
    return (
      <div className="space-y-6">
        <AutoBreadcrumbs />
        <PageHeader
          eyebrow="Portfolio"
          title={term("efficiency.programme")}
          description="This module is switched off for your organisation. An admin can switch it on in Settings › Modules; anything recorded before is kept."
        />
      </div>
    );
  }
  return <QueryState query={schemes}>{(rows) => <Pipeline schemes={rows} />}</QueryState>;
}

function Pipeline({ schemes }: { schemes: EfficiencyScheme[] }) {
  const term = useModuleTerm();
  const fmt = useFormat();
  const writable = useOrgWritable();
  const canCreate = useCan("manager");
  const canSetTargets = useCan("pmo");
  const workspaces = (useWorkspaces().data ?? []).filter((w) => !w.archivedAt);
  const categories = useSchemeOptions().data?.categories ?? [];
  const startMonth = fmt.settings.regional.financialYearStartMonth || 4;
  const [view, setView] = useState<View>("board");
  const [filter, setFilter] = useState<SchemeFilter>({});
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [year, setYear] = useState(() => schemes[0]?.financialYear || currentYear(startMonth));
  const units = fmt.settings.lists.businessUnits ?? [];
  const categoryLabel = (value: string | null) =>
    value ? (categories.find((c) => c.value === value)?.label ?? value) : "—";

  // The board shows every stage (rejected and delivered included); the list hides closed schemes
  // unless asked.
  const boardRows = filterSchemes(schemes, { ...filter, showClosed: true });
  const listRows = filterSchemes(schemes, filter);
  const counted = boardRows.filter((s) => s.stage !== "rejected");
  const thisYear = schemes[0]?.financialYear ?? currentYear(startMonth);

  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Portfolio"
        title={term("efficiency.programme")}
        description={`${term("efficiency.schemePlural")} from idea to delivery, with this financial year's planned and risk-adjusted savings. Open a scheme to phase its monthly values, validate it and see its impact assessment.`}
        actions={
          canCreate && (
            <div className="flex flex-wrap gap-2">
              <ReadOnlyTip readOnly={!writable}>
                <Button variant="outline" disabled={!writable} onClick={() => setImporting(true)}>
                  <Upload className="mr-1 h-4 w-4" aria-hidden />
                  Import
                </Button>
              </ReadOnlyTip>
              <ReadOnlyTip readOnly={!writable}>
                <Button disabled={!writable} onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden />
                  New {term("efficiency.scheme").toLowerCase()}
                </Button>
              </ReadOnlyTip>
            </div>
          )
        }
      />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Schemes (not rejected)" value={String(counted.length)} />
        <Stat
          label={`Planned ${financialYearLabel(thisYear, startMonth)}`}
          value={fmt.compact(counted.reduce((s, r) => s + r.planInYear, 0))}
        />
        <Stat
          label="Risk-adjusted"
          value={fmt.compact(counted.reduce((s, r) => s + r.riskAdjustedInYear, 0))}
        />
        <Stat
          label="Actual to date"
          value={fmt.compact(counted.reduce((s, r) => s + r.actualInYear, 0))}
        />
      </dl>

      <div className="flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="View" className="flex gap-1 rounded-md border p-1">
          {(["board", "list", "dashboard", "targets"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 text-sm ${view === v ? "bg-primary/10 font-medium" : "text-muted-foreground"}`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        {(view === "board" || view === "list") && (
          <>
            {workspaces.length > 1 && (
              <label className="text-xs">
                <span className="block text-muted-foreground">Workspace</span>
                <select
                  className={selectClass}
                  value={filter.workspaceId ?? ""}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, workspaceId: e.target.value || undefined }))
                  }
                >
                  <option value="">All</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {units.length > 0 && (
              <label className="text-xs">
                <span className="block text-muted-foreground">{term("orgUnit")}</span>
                <select
                  className={selectClass}
                  value={filter.businessUnit ?? ""}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, businessUnit: e.target.value || undefined }))
                  }
                >
                  <option value="">All</option>
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {categories.length > 0 && (
              <label className="text-xs">
                <span className="block text-muted-foreground">Category</span>
                <select
                  className={selectClass}
                  value={filter.category ?? ""}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, category: e.target.value || undefined }))
                  }
                >
                  <option value="">All</option>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs">
              <span className="block text-muted-foreground">Search</span>
              <Input
                className="h-9 w-48"
                placeholder="Reference or title"
                value={filter.search ?? ""}
                onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              />
            </label>
            {view === "list" && (
              <label className="flex items-center gap-2 pb-2 text-xs">
                <input
                  type="checkbox"
                  checked={Boolean(filter.showClosed)}
                  onChange={(e) => setFilter((f) => ({ ...f, showClosed: e.target.checked }))}
                />
                Show delivered and rejected
              </label>
            )}
          </>
        )}
      </div>

      {view === "board" && <Board schemes={boardRows} categoryLabel={categoryLabel} />}
      {view === "list" && <SchemeList rows={listRows} categoryLabel={categoryLabel} />}
      {view === "dashboard" && (
        <EfficiencyDashboard
          year={year}
          onYearChange={setYear}
          workspaceId={null}
          categoryLabel={categoryLabel}
        />
      )}
      {view === "targets" && (
        <EfficiencyTargetsEditor year={year} onYearChange={setYear} canEdit={canSetTargets} />
      )}
      <SchemeFormSheet open={creating} scheme={null} onClose={() => setCreating(false)} />
      {importing && (
        <EfficiencyImport
          schemes={schemes}
          financialYear={thisYear}
          close={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function currentYear(startMonth: number) {
  const now = new Date();
  return now.getUTCMonth() + 1 >= startMonth ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-4 shadow-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Board({
  schemes,
  categoryLabel,
}: {
  schemes: EfficiencyScheme[];
  categoryLabel: (value: string | null) => string;
}) {
  const fmt = useFormat();
  const columns = pipelineColumns(schemes);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-max auto-cols-[16rem] grid-flow-col gap-3">
        {columns.map((col) => (
          <section
            key={col.stage}
            aria-labelledby={`stage-${col.stage}`}
            className="flex flex-col rounded-lg border border-border/70 bg-muted/30"
          >
            <header className="border-b p-3">
              <h2 id={`stage-${col.stage}`} className="text-sm font-semibold">
                {STAGE_LABELS[col.stage]}{" "}
                <span className="font-normal text-muted-foreground">({col.schemes.length})</span>
              </h2>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                Plan {fmt.compact(col.plan)} · risk-adjusted {fmt.compact(col.riskAdjusted)}
                {!col.counted && " · not counted"}
              </p>
            </header>
            <ol
              className="flex flex-col gap-2 p-2"
              aria-label={`${STAGE_LABELS[col.stage]} schemes`}
            >
              {col.schemes.map((s) => (
                <li key={s.id}>
                  <SchemeCard scheme={s} categoryLabel={categoryLabel} />
                </li>
              ))}
              {!col.schemes.length && <li className="p-2 text-xs text-muted-foreground">None</li>}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function SchemeCard({
  scheme,
  categoryLabel,
}: {
  scheme: EfficiencyScheme;
  categoryLabel: (value: string | null) => string;
}) {
  const fmt = useFormat();
  const roles = useWorkspaceRoles().data ?? [];
  const writable = useOrgWritable();
  const canMove =
    writable &&
    roles.some((r) => r.workspaceId === scheme.workspaceId && atLeast(r.role, "manager"));
  return (
    <article className="rounded-md border bg-card p-3 text-sm shadow-sm">
      <Link
        to="/portfolio/efficiency/$schemeId"
        params={{ schemeId: scheme.id }}
        className="font-medium hover:underline"
      >
        <span className="text-muted-foreground">{scheme.ref} · </span>
        {scheme.title}
      </Link>
      <p className="mt-1 text-xs text-muted-foreground">
        {[scheme.businessUnit, categoryLabel(scheme.category)]
          .filter((v) => v && v !== "—")
          .join(" · ") || "No unit or category"}
      </p>
      <p className="mt-1 text-xs tabular-nums">
        Plan {fmt.compact(scheme.planInYear)} · RA {fmt.compact(scheme.riskAdjustedInYear)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {scheme.isSample && <SampleChip />}
        {scheme.financeValidatedAt && (
          <span className="rounded border border-emerald-600/60 px-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
            Finance validated
          </span>
        )}
        {isAssessmentStatus(scheme.assessmentStatus) && (
          <AssessmentStatusChip status={scheme.assessmentStatus} />
        )}
      </div>
      {canMove && <StageMover scheme={scheme} />}
    </article>
  );
}

/** Back / forward buttons and a "Move to" menu: the keyboard path for the board. */
export function StageMover({
  scheme,
  compact = true,
}: {
  scheme: EfficiencyScheme;
  compact?: boolean;
}) {
  const { moveStage } = useEfficiencyMutations();
  const { back, forward } = adjacentStages(scheme.stage);
  const move = (stage: EfficiencyStage) =>
    moveStage.mutate({ id: scheme.id, stage, lastSeen: scheme.updatedAt });
  return (
    <div className={`flex items-center gap-1 ${compact ? "mt-2" : ""}`}>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!back || moveStage.isPending}
        aria-label={back ? `Move ${scheme.ref} back to ${STAGE_LABELS[back]}` : "No earlier stage"}
        onClick={() => back && move(back)}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <select
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-1 text-xs"
        aria-label={`Move ${scheme.ref} to stage`}
        value={scheme.stage}
        disabled={moveStage.isPending}
        onChange={(e) => move(e.target.value as EfficiencyStage)}
      >
        {STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        disabled={!forward || moveStage.isPending}
        aria-label={
          forward ? `Move ${scheme.ref} forward to ${STAGE_LABELS[forward]}` : "No later stage"
        }
        onClick={() => forward && move(forward)}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function SchemeList({
  rows,
  categoryLabel,
}: {
  rows: EfficiencyScheme[];
  categoryLabel: (value: string | null) => string;
}) {
  const fmt = useFormat();
  const term = useModuleTerm();
  const navigate = useNavigate();
  const money = (key: keyof EfficiencyScheme, label: string): Column<EfficiencyScheme> => ({
    key,
    label,
    sortable: true,
    sortValue: (row) => Number(row[key]),
    className: "text-right tabular-nums",
    render: (row) => fmt.compact(Number(row[key])),
  });
  const columns: Column<EfficiencyScheme>[] = [
    {
      key: "ref",
      label: term("efficiency.scheme"),
      sortable: true,
      sortValue: (row) => row.ref,
      className: "min-w-56",
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>
            <span className="text-muted-foreground">{row.ref} · </span>
            {row.title}
          </span>
          {row.isSample && <SampleChip />}
        </span>
      ),
    },
    {
      key: "unit",
      label: term("orgUnit"),
      sortable: true,
      sortValue: (row) => row.businessUnit ?? "",
      render: (row) => row.businessUnit ?? "—",
    },
    {
      key: "category",
      label: "Category",
      sortable: true,
      sortValue: (row) => categoryLabel(row.category),
      render: (row) => categoryLabel(row.category),
    },
    {
      key: "stage",
      label: "Stage",
      sortable: true,
      sortValue: (row) => STAGES.indexOf(row.stage),
      render: (row) => STAGE_LABELS[row.stage],
    },
    {
      key: "confidence",
      label: "Confidence",
      render: (row) => (row.confidence ? CONFIDENCE_LABELS[row.confidence] : "—"),
    },
    money("planInYear", "Plan"),
    money("riskAdjustedInYear", "Risk-adjusted"),
    money("forecastInYear", "Forecast"),
    money("actualInYear", "Actual"),
    {
      key: "assessment",
      label: "Impact assessment",
      render: (row) =>
        isAssessmentStatus(row.assessmentStatus) ? (
          <AssessmentStatusChip status={row.assessmentStatus} />
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        ),
    },
  ];
  return rows.length ? (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      onRowClick={(row) =>
        navigate({ to: "/portfolio/efficiency/$schemeId", params: { schemeId: row.id } })
      }
    />
  ) : (
    <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
      No schemes match this filter.
    </p>
  );
}
