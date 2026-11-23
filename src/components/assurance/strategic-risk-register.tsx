// Board assurance (NHS-1): the strategic risk register (BAF). Organisation-wide: every member
// reads it; organisation PMO and admins add and edit while the 'assurance' module is on (RLS
// enforces both). Scores, bands, appetite and trend come from v_strategic_risks.
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useOrganisation } from "@/components/auth/organisation-provider";
import { ReadOnlyTip } from "@/components/org-access-banner";
import { PageHeader, type Column, DataTable } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { SampleChip } from "@/components/sample-badge";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { Button } from "@/components/ui/button";
import { useOrgWritable } from "@/hooks/use-org-access";
import { useOrgRole } from "@/hooks/use-permissions";
import { formatDate } from "@/lib/format";
import { useModule, useModuleTerm } from "@/lib/modules";
import { atLeast } from "@/services/auth";
import { qk } from "@/services/query-keys";
import {
  listStrategicRisks,
  loadAssuranceOptions,
  type AssuranceOptions,
  type StrategicRiskView,
} from "@/services/strategic-risks";
import { ScoreChip, TrendMark } from "./assurance-ui";
import { StrategicRiskSheet } from "./strategic-risk-sheet";

export function StrategicRiskRegister() {
  const enabled = useModule("assurance");
  const term = useModuleTerm();
  const { organisation } = useOrganisation();
  const orgId = organisation.organisationId;
  const list = useQuery({
    queryKey: qk.strategicRisks.list(orgId),
    queryFn: () => listStrategicRisks(orgId),
  });
  const options = useQuery({
    queryKey: qk.strategicRisks.options(orgId),
    queryFn: () => loadAssuranceOptions(orgId),
    staleTime: 5 * 60_000,
  });

  if (!enabled) {
    return (
      <div className="space-y-6">
        <AutoBreadcrumbs />
        <PageHeader
          eyebrow="Governance"
          title={term("assurance.name")}
          description="This module is switched off for your organisation. An admin can switch it on in Settings › Modules; anything recorded before is kept."
        />
      </div>
    );
  }
  return (
    <QueryState query={list}>
      {(rows) => (
        <QueryState query={options}>{(opts) => <Register rows={rows} options={opts} />}</QueryState>
      )}
    </QueryState>
  );
}

function Register({ rows, options }: { rows: StrategicRiskView[]; options: AssuranceOptions }) {
  const term = useModuleTerm();
  const writable = useOrgWritable();
  const canEdit = atLeast(useOrgRole(), "pmo");
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<StrategicRiskView | "new" | null>(null);
  const visible = rows.filter((row) => showClosed || row.status === "open");
  const live = rows.filter((row) => row.status === "open");
  const name = (list: Array<{ id: string; name: string }>, id: string | null) =>
    list.find((item) => item.id === id)?.name ?? "—";
  const appetite = (value: string | null) =>
    options.appetite.find((item) => item.value === value)?.label ?? null;

  const columns: Column<StrategicRiskView>[] = [
    {
      key: "ref",
      label: "Ref",
      sortable: true,
      sortValue: (row) => row.ref,
      render: (row) => row.ref,
    },
    {
      key: "title",
      label: term("assurance.strategicRisk"),
      sortable: true,
      sortValue: (row) => row.title,
      className: "min-w-64",
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{row.title}</span>
          {row.isSample && <SampleChip />}
          {row.status === "closed" && (
            <span className="rounded border px-1.5 text-[11px] text-muted-foreground">Closed</span>
          )}
        </span>
      ),
    },
    {
      key: "lead",
      label: "Executive lead",
      render: (row) => name(options.resources, row.executiveLeadId),
    },
    {
      key: "committee",
      label: "Lead committee",
      render: (row) => name(options.forums, row.leadForumId),
    },
    {
      key: "current",
      label: "Current",
      sortable: true,
      sortValue: (row) => row.current.score ?? 0,
      render: (row) => <ScoreChip score={row.current.score} band={row.currentBand} />,
    },
    {
      key: "trend",
      label: "Trend",
      render: (row) => <TrendMark trend={row.trend} previous={row.previousScore} />,
    },
    {
      key: "target",
      label: "Target",
      render: (row) => row.target.score ?? "—",
    },
    {
      key: "appetite",
      label: "Appetite",
      render: (row) =>
        row.appetiteScore === null && !row.riskAppetite ? (
          "—"
        ) : (
          <span className="text-xs">
            {appetite(row.riskAppetite) ?? ""}
            {row.appetiteScore !== null && ` (≤ ${row.appetiteScore})`}
            {row.aboveAppetite && (
              <span className="ml-1 font-semibold text-red-700 dark:text-red-400">
                Above appetite
              </span>
            )}
          </span>
        ),
    },
    {
      key: "assurance",
      label: "Assurance",
      sortable: true,
      sortValue: (row) => row.assuranceLabel ?? "",
      render: (row) =>
        row.assuranceLabel ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span
              aria-hidden
              className="size-2.5 rounded-full"
              style={{ background: row.assuranceColour ?? "currentColor" }}
            />
            {row.assuranceLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not rated</span>
        ),
    },
    {
      key: "review",
      label: "Review",
      sortable: true,
      sortValue: (row) => row.reviewDate ?? "9999",
      render: (row) =>
        row.reviewDate ? (
          <span className={row.reviewOverdue ? "font-semibold text-red-700 dark:text-red-400" : ""}>
            {formatDate(row.reviewDate)}
            {row.reviewOverdue && " (overdue)"}
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Governance"
        title={term("assurance.name")}
        description="The organisation's strategic risks: who leads each one, the controls and sources of assurance, the gaps, and how the score is moving against appetite."
        actions={
          canEdit && (
            <ReadOnlyTip readOnly={!writable}>
              <Button disabled={!writable} onClick={() => setOpen("new")}>
                <Plus className="size-4" /> New {term("assurance.strategicRisk").toLowerCase()}
              </Button>
            </ReadOnlyTip>
          )
        }
      />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={live.length} />
        <Stat label="Above appetite" value={live.filter((row) => row.aboveAppetite).length} />
        <Stat label="Reviews overdue" value={live.filter((row) => row.reviewOverdue).length} />
        <Stat
          label="Limited or no assurance"
          value={
            live.filter((row) => ["limited", "no_assurance"].includes(row.assuranceRating ?? ""))
              .length
          }
        />
      </dl>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showClosed}
          onChange={(event) => setShowClosed(event.target.checked)}
        />
        Show closed
      </label>
      {visible.length ? (
        <DataTable rows={visible} columns={columns} rowKey={(row) => row.id} onRowClick={setOpen} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          No {term("assurance.strategicRisk").toLowerCase()}s yet.
          {canEdit && " Add the first one with the button above."}
        </p>
      )}
      {open && (
        <StrategicRiskSheet
          risk={open === "new" ? null : open}
          options={options}
          canEdit={canEdit && writable}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}
