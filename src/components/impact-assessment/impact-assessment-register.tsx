// Impact assessments (NHS-3 part 2): the register (Governance › Impact assessments). Every
// assessment the person can see, with status, screening score, sign-off progress, negative impacts
// and review dates, plus the projects already past the delivery gate without an approved
// assessment (the "missing assessment" list, NHS-0 rule 3). Opening a row goes to the target, where
// the assessment is edited and decided.
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, type Column, DataTable } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { SampleChip } from "@/components/sample-badge";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { ASSESSMENT_STATUS_LABELS } from "@/data/impact-assessment";
import { useAssessmentGaps, useAssessmentRegister } from "@/hooks/use-impact-assessments";
import { formatDate } from "@/lib/format";
import { useModule, useModuleTerm } from "@/lib/modules";
import {
  filterRegister,
  needsAttention,
  type AssessmentRegisterRow,
  type RegisterFilter as Filter,
} from "@/services/impact-assessments";
import { useSettings } from "@/services/settings";
import { AssessmentStatusChip } from "./impact-assessment-panel";

export function ImpactAssessmentRegister() {
  const enabled = useModule("impact_assessment");
  const term = useModuleTerm();
  const register = useAssessmentRegister();
  if (!enabled) {
    return (
      <div className="space-y-6">
        <AutoBreadcrumbs />
        <PageHeader
          eyebrow="Governance"
          title={term("impactAssessment.name")}
          description="This module is switched off for your organisation. An admin can switch it on in Settings › Modules; anything recorded before is kept."
        />
      </div>
    );
  }
  return <QueryState query={register}>{(rows) => <Register rows={rows} />}</QueryState>;
}

function Register({ rows }: { rows: AssessmentRegisterRow[] }) {
  const term = useModuleTerm();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const visible = filterRegister(rows, filter);
  // Scheme assessments (NHS-4) open on the scheme page.
  const open = (row: AssessmentRegisterRow) =>
    row.entityType === "efficiency_scheme"
      ? navigate({ to: "/portfolio/efficiency/$schemeId", params: { schemeId: row.entityId } })
      : row.entityType === "project" && row.projectCode
        ? navigate({
            to: "/portfolio/projects/$projectCode",
            params: { projectCode: row.projectCode },
            search: { tab: "plan", sub: "gates" },
          })
        : navigate({
            to: "/portfolio/programmes/$programmeId",
            params: { programmeId: row.entityId },
          });

  const columns: Column<AssessmentRegisterRow>[] = [
    {
      key: "target",
      label: "Project or programme",
      sortable: true,
      sortValue: (row) => row.targetName,
      className: "min-w-56",
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>
            {row.projectCode && <span className="text-muted-foreground">{row.projectCode} · </span>}
            {row.targetName}
          </span>
          {row.entityType !== "project" && (
            <span className="rounded border px-1.5 text-[11px] text-muted-foreground">
              {row.entityType === "programme" ? "Programme" : term("efficiency.scheme")}
            </span>
          )}
          {row.isSample && <SampleChip />}
        </span>
      ),
    },
    {
      key: "title",
      label: "Assessment",
      sortable: true,
      sortValue: (row) => row.title,
      render: (row) => `${row.title} (v${row.version})`,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortValue: (row) => ASSESSMENT_STATUS_LABELS[row.status],
      render: (row) => <AssessmentStatusChip status={row.status} />,
    },
    {
      key: "score",
      label: "Screening",
      sortable: true,
      sortValue: (row) => row.screeningMaxScore,
      render: (row) => (
        <span className="text-xs">
          {row.screeningMaxScore || "—"} · {row.fullRequired ? "full" : "screening only"}
        </span>
      ),
    },
    {
      key: "signoff",
      label: "Sign-off",
      render: (row) =>
        row.stepsTotal ? (
          <span className="text-xs" title={row.steps.map((s) => s.roleLabel).join(", ")}>
            {row.stepsApproved} of {row.stepsTotal} approved
            {row.hasConditions && " · with conditions"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not submitted</span>
        ),
    },
    {
      key: "negative",
      label: "Negative impacts",
      sortable: true,
      sortValue: (row) => row.negativeDomains + row.negativeEquality,
      render: (row) =>
        row.negativeDomains + row.negativeEquality ? (
          <span className="text-xs">
            {row.negativeDomains} quality · {row.negativeEquality} equality
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
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

  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: "all", label: "All", count: rows.length },
    { value: "attention", label: "Needs attention", count: rows.filter(needsAttention).length },
    ...(["draft", "in_review", "approved", "rejected", "reassessment_required"] as const).map(
      (status) => ({
        value: status,
        label: ASSESSMENT_STATUS_LABELS[status],
        count: rows.filter((row) => row.status === status).length,
      }),
    ),
  ];

  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Governance"
        title={term("impactAssessment.name")}
        description="Quality and equality impact assessments of projects and programmes: where each one is, who has signed it off, and which reviews are due. Start or edit an assessment on the project's Plan › Gates tab or the programme's Status tab."
      />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Awaiting sign-off"
          value={rows.filter((r) => r.status === "in_review").length}
        />
        <Stat
          label="Re-assessment required"
          value={rows.filter((r) => r.status === "reassessment_required").length}
        />
        <Stat label="Reviews overdue" value={rows.filter((r) => r.reviewOverdue).length} />
        <Stat label="Approved" value={rows.filter((r) => r.status === "approved").length} />
      </dl>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === item.value
                ? "border-primary bg-primary/10 font-medium"
                : "text-muted-foreground"
            }`}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>
      {visible.length ? (
        <DataTable rows={visible} columns={columns} rowKey={(row) => row.id} onRowClick={open} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {rows.length ? "No assessments match this filter." : "No assessments yet."}
        </p>
      )}
      <GapsList />
    </div>
  );
}

/** Projects already past the delivery gate without an approved assessment. Never blocked. */
function GapsList() {
  const settings = useSettings();
  const gatePhase = settings.modules.impactGatePhaseId ?? null;
  const gaps = useAssessmentGaps();
  if (!gatePhase) return null;
  const phaseName =
    settings.lifecycle.phases.find((phase) => phase.id === gatePhase)?.name ?? "the gate phase";
  return (
    <section aria-labelledby="impact-gaps-heading" className="space-y-3">
      <h2 id="impact-gaps-heading" className="font-display text-lg font-semibold">
        Past the delivery gate without an approved assessment
      </h2>
      <p className="text-sm text-muted-foreground">
        Projects at or beyond {phaseName} that started before the gate was switched on, or whose
        assessment needs re-approval. They aren't blocked; the PMO follows them up.
      </p>
      <QueryState query={gaps}>
        {(rows) =>
          rows.length ? (
            <ul className="divide-y rounded-lg border">
              {rows.map((gap) => (
                <li key={gap.projectId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <Link
                    to="/portfolio/projects/$projectCode"
                    params={{ projectCode: gap.code }}
                    search={{ tab: "plan", sub: "gates" }}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {gap.code} · {gap.name}
                  </Link>
                  <span className="text-muted-foreground">{gap.phaseName}</span>
                  {gap.status === "missing" ? (
                    <span className="text-xs text-red-800 dark:text-red-300">No assessment</span>
                  ) : (
                    <AssessmentStatusChip status={gap.status} />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Every project past the gate has an approved assessment.
            </p>
          )
        }
      </QueryState>
    </section>
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
