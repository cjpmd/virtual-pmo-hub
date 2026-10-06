import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { AutoBreadcrumbs } from "@/components/section-nav";
import { BoardWorkspace, type BoardColumn, type BoardRow } from "@/components/board-workspace";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { QueryState } from "@/components/query-state";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useGovernance, useGovernanceMutations } from "@/hooks/use-governance";
import { useCan } from "@/hooks/use-permissions";
import { formatCompactCurrency } from "@/lib/format";
import type { ChangeRequest } from "@/data/types";
import type { ChangeInput, GovernanceData } from "@/services/decisions";

const title = "Change Control — Virtual PMO",
  description = "Change requests across the portfolio with cost and schedule impact.";
export const Route = createFileRoute("/governance/changes")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

const statuses: ChangeRequest["status"][] = ["Proposed", "Approved", "Rejected"];

function Page() {
  const governance = useGovernance();
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Governance"
        title="Changes"
        description="Every change request raised against a project, with its approved cost and schedule impact. Change types are configured in Settings → Risk & RAIDD."
      />
      <QueryState query={governance}>{(data) => <Changes data={data} />}</QueryState>
    </div>
  );
}

/** Board column key → change request field. */
function changeInputFromBoard(
  patch: Partial<BoardRow>,
  types: GovernanceData["changeTypes"],
): ChangeInput | undefined {
  const input: ChangeInput = {};
  if (
    typeof patch.status === "string" &&
    statuses.includes(patch.status as ChangeRequest["status"])
  )
    input.status = patch.status as ChangeRequest["status"];
  if (typeof patch["changeType"] === "string") {
    const type = types.find((item) => item.label === patch["changeType"]);
    if (!type) return undefined;
    input.typeId = type.id;
  }
  return input;
}

function Changes({ data }: { data: GovernanceData }) {
  const changes = data.changes;
  const canEdit = useCan("contributor");
  const { updateChange } = useGovernanceMutations();
  const columns: BoardColumn[] = [
    { key: "title", label: "Change request", type: "text", summary: "count", width: 300 },
    { key: "project", label: "Project", type: "text", width: 240 },
    {
      key: "changeType",
      label: "Type",
      type: "status",
      editable: canEdit,
      options: data.changeTypes.map((type) => type.label),
    },
    { key: "people", label: "Requested by", type: "people" },
    { key: "number", label: "Cost impact", type: "number", unit: "currency", summary: "sum" },
    { key: "days", label: "Schedule impact", type: "number", unit: " days", summary: "sum" },
    { key: "status", label: "Status", type: "status", editable: canEdit, options: statuses },
  ];
  const rows = useMemo(
    () =>
      changes.map((change) => ({
        id: change.id,
        ref: change.ref,
        code: change.projectCode ?? "",
        title: change.title,
        project: change.projectName,
        changeType: change.type,
        people: change.requestedBy ? [change.requestedBy] : [],
        number: change.costImpact,
        days: change.scheduleImpactDays,
        status: change.status,
        group: change.programmeName,
      })),
    [changes],
  );
  const onRecordChange = useBoardRecordSync<ChangeInput>({
    toInput: (patch) => changeInputFromBoard(patch, data.changeTypes),
    create: () => toast.error("Raise change requests from the project they change."),
    update: (id, input, lastSeen) => updateChange.mutateAsync({ id, input, lastSeen }),
    remove: () =>
      toast.error(
        "Change requests are kept for the record. Reject a change instead of deleting it.",
      ),
    lastSeen: (id) => changes.find((item) => item.id === id)?.updatedAt,
  });
  const approved = changes.filter((item) => item.status === "Approved");
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Change requests"
          value={String(changes.length)}
          detail={`Across ${new Set(changes.map((item) => item.projectCode ?? item.projectName)).size} projects`}
          icon="projects"
        />
        <KpiCard
          label="Awaiting decision"
          value={String(changes.filter((item) => item.status === "Proposed").length)}
          detail="Proposed and not yet decided"
          icon="health"
        />
        <KpiCard
          label="Approved cost impact"
          value={formatCompactCurrency(approved.reduce((sum, item) => sum + item.costImpact, 0))}
          detail={`${approved.length} approved changes`}
          icon="budget"
        />
        <KpiCard
          label="Approved schedule impact"
          value={`${approved.reduce((sum, item) => sum + item.scheduleImpactDays, 0)} days`}
          detail="Added across the portfolio"
          icon="forecast"
        />
      </div>
      <BoardWorkspace
        key={String(canEdit)}
        title="Change register"
        itemLabel="change request"
        rows={rows}
        columns={columns}
        manage={canEdit}
        canDelete={false}
        canCreate={false}
        onRecordChange={onRecordChange}
        groupOptions={["group", "status", "changeType"]}
        renderTitle={(row) =>
          row["code"] ? (
            <Link
              to="/portfolio/projects/$projectCode"
              params={{ projectCode: String(row["code"]) }}
              className="text-primary hover:underline"
            >
              {row.title}
            </Link>
          ) : (
            <span>{row.title}</span>
          )
        }
      />
      {!changes.length && (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No change requests have been raised.
        </p>
      )}
    </>
  );
}
