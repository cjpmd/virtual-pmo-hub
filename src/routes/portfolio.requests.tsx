import { AutoBreadcrumbs } from "@/components/section-nav";
import { formatCompactCurrency } from "@/lib/format";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BoardWorkspace, type BoardColumn, type BoardRow } from "@/components/board-workspace";
import { AppraisalPanel } from "@/components/appraisal-panel";
import { RelevantLessons } from "@/components/relevant-lessons";
import { KpiCard, PageHeader } from "@/components/pmo-ui";
import { Button } from "@/components/ui/button";
import { scoreRequest } from "@/services/benefits-value";
import { toast } from "sonner";
import { QueryState } from "@/components/query-state";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useCurrentPortfolio } from "@/hooks/use-current-portfolio";
import { useCan } from "@/hooks/use-permissions";
import { useRequestMutations, useRequests } from "@/hooks/use-requests";
import type { Priority, ProjectRequest } from "@/data/types";
import type { Person } from "@/services/hierarchy";
import type { RequestInput, RequestView } from "@/services/requests";
import { cn } from "@/lib/utils";

const title = "Requests — Virtual PMO",
  description =
    "Review, appraise and prioritise project requests using adjusted benefit value and strategic alignment.";
export const Route = createFileRoute("/portfolio/requests")({
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
  component: RequestsPage,
});

const money = formatCompactCurrency;
const columns: BoardColumn[] = [
  { key: "title", label: "Request", type: "text", editable: true, summary: "count", width: 260 },
  {
    key: "status",
    label: "State",
    type: "status",
    editable: true,
    options: ["New", "In Review", "On Hold", "Approved", "Rejected"],
  },
  { key: "people", label: "Requester", type: "people", editable: true },
  { key: "sponsor", label: "Sponsor", type: "people", editable: true },
  { key: "number", label: "Whole-life cost", type: "number", unit: "currency", summary: "sum" },
  { key: "rawBenefit", label: "Raw benefit", type: "number", unit: "currency", summary: "sum" },
  {
    key: "adjustedBenefit",
    label: "Adjusted benefit",
    type: "number",
    unit: "currency",
    summary: "sum",
  },
  { key: "ratio", label: "Adjusted BCR", type: "text" },
  { key: "payback", label: "Payback", type: "text" },
  { key: "alignment", label: "Strategic alignment", type: "progress", summary: "average" },
  {
    key: "priority",
    label: "Priority",
    type: "priority",
    editable: true,
    options: ["Low", "Moderate", "High", "Critical"],
  },
  { key: "tags", label: "Themes", type: "tags" },
  { key: "formula", label: "Priority score", type: "formula" },
];

const statuses: ProjectRequest["status"][] = [
  "New",
  "In Review",
  "On Hold",
  "Approved",
  "Rejected",
];
const priorities: Priority[] = ["Low", "Moderate", "High", "Critical"];

/** Board column key → request field. Undefined while a value isn't valid yet. */
function requestInputFromBoard(
  patch: Partial<BoardRow>,
  people: Person[],
): RequestInput | undefined {
  const input: RequestInput = {};
  const personId = (value: unknown) => {
    const name = Array.isArray(value) ? value[0] : value;
    if (!name) return null;
    return people.find((person) => person.name === name)?.id;
  };
  if (typeof patch.title === "string") {
    if (!patch.title.trim()) return undefined;
    input.title = patch.title;
  }
  if (
    typeof patch.status === "string" &&
    statuses.includes(patch.status as ProjectRequest["status"])
  )
    input.status = patch.status as ProjectRequest["status"];
  if (typeof patch["priority"] === "string" && priorities.includes(patch["priority"] as Priority))
    input.priority = patch["priority"] as Priority;
  if (patch.people !== undefined) {
    const id = personId(patch.people);
    if (id === undefined) return undefined;
    input.requesterId = id;
  }
  if (patch["sponsor"] !== undefined) {
    const id = personId(patch["sponsor"]);
    if (id === undefined) return undefined;
    input.sponsorId = id;
  }
  return input;
}

function RequestsPage() {
  const query = useRequests();
  return (
    <div className="space-y-6">
      <AutoBreadcrumbs />
      <PageHeader
        eyebrow="Portfolio intake"
        title="Requests"
        description="Benefits are captured as draft benefit profiles, not a single number. Prioritisation uses the optimism-bias adjusted benefit value alongside strategic alignment."
      />
      <QueryState query={query}>
        {(data) => <Requests requests={data.requests} people={data.people} />}
      </QueryState>
    </div>
  );
}

function Requests({ requests, people }: { requests: RequestView[]; people: Person[] }) {
  const canManage = useCan("manager");
  const { portfolio } = useCurrentPortfolio();
  const mutations = useRequestMutations();
  const onRecordChange = useBoardRecordSync<RequestInput>({
    toInput: (patch) => requestInputFromBoard(patch, people),
    create: (input) => {
      if (!input.title) return void toast.error("Give the request a title.");
      if (!portfolio) return void toast.error("Create a portfolio first.");
      mutations.create.mutate({ ...input, title: input.title, portfolioId: portfolio.id });
    },
    update: (id, input, lastSeen) => mutations.update.mutateAsync({ id, input, lastSeen }),
    remove: () => toast.error("Requests can't be deleted. Set the state to Rejected instead."),
    lastSeen: (id) => requests.find((item) => item.id === id)?.updatedAt,
  });
  const scored = requests.map((request) => ({ request, score: scoreRequest(request) }));
  const ranked = [...scored].sort((a, b) => b.score.priorityScore - a.score.priorityScore);
  const [selectedId, setSelectedId] = useState(requests[0]?.id ?? "");
  const selected = scored.find((entry) => entry.request.id === selectedId) ?? scored[0];

  const rows: BoardRow[] = scored.map(({ request, score }) => ({
    id: request.id,
    title: request.title,
    status: request.status,
    people: [request.requester],
    sponsor: request.sponsor ? [request.sponsor] : [],
    number: request.wholeLifeCost ?? request.estimatedCost,
    rawBenefit: score.rawBenefit,
    adjustedBenefit: score.adjustedBenefit,
    ratio: `${score.adjustedRatio.toFixed(2)} : 1`,
    payback:
      score.adjustedPaybackYears === undefined
        ? "—"
        : `${score.adjustedPaybackYears.toFixed(1)} yrs`,
    alignment: request.alignment,
    priority: request.priority,
    tags: request.themes,
    formula: String(score.priorityScore),
    group: request.status,
  }));

  const totalAdjusted = scored.reduce((sum, entry) => sum + entry.score.adjustedBenefit, 0);
  const totalRaw = scored.reduce((sum, entry) => sum + entry.score.rawBenefit, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Requests in the pipeline"
          value={String(requests.length)}
          detail={`${requests.filter((item) => item.status === "In Review" || item.status === "New").length} awaiting a decision`}
          icon="projects"
        />
        <KpiCard
          label="Raw benefit claimed"
          value={money(totalRaw)}
          detail="Before optimism bias"
          icon="budget"
        />
        <KpiCard
          label="Adjusted benefit"
          value={money(totalAdjusted)}
          detail={`${Math.round((1 - totalAdjusted / Math.max(1, totalRaw)) * 100)}% reduction after bias`}
          icon="forecast"
        />
        <KpiCard
          label="Highest priority score"
          value={String(ranked[0]?.score.priorityScore ?? 0)}
          detail={ranked[0]?.request.title ?? "—"}
          icon="health"
        />
      </div>

      <BoardWorkspace
        key={String(canManage)}
        title="Requests"
        itemLabel="request"
        rows={rows}
        columns={canManage ? columns : columns.map((column) => ({ ...column, editable: false }))}
        manage={canManage}
        canDelete={false}
        onRecordChange={onRecordChange}
        groupOptions={["group", "priority", "sponsor"]}
        initialView="kanban"
        renderTitle={(row) => (
          <button
            onClick={(event) => {
              event.stopPropagation();
              setSelectedId(row.id);
            }}
            className="text-left text-primary hover:underline"
          >
            {row.title}
          </button>
        )}
      />

      <section className="rounded-lg border border-border/70 bg-card p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold">Prioritisation ranking</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ranked by adjusted value for money (60%) and strategic alignment (40%).
        </p>
        <div className="mt-4 divide-y">
          {ranked.map(({ request, score }, index) => (
            <button
              key={request.id}
              onClick={() => setSelectedId(request.id)}
              className={cn(
                "grid w-full gap-2 py-3 text-left hover:bg-accent/30 sm:grid-cols-[2rem_1fr_auto_auto_auto] sm:items-center",
                request.id === selectedId && "bg-accent/40",
              )}
            >
              <span className="text-sm font-semibold text-muted-foreground">{index + 1}</span>
              <div>
                <p className="text-sm font-medium">{request.title}</p>
                <p className="text-xs text-muted-foreground">
                  {request.sponsor} · {request.status} · {request.draftBenefits?.length ?? 0} draft
                  benefit profile{(request.draftBenefits?.length ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {money(score.adjustedBenefit)} adjusted
              </span>
              <span className="text-xs text-muted-foreground">
                {score.adjustedRatio.toFixed(2)} : 1
              </span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {score.priorityScore}
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <div className="space-y-5">
          <h2 className="font-display text-lg font-semibold">
            Appraisal · {selected.request.title}
          </h2>
          <AppraisalPanel
            drafts={selected.request.draftBenefits ?? []}
            wholeLifeCost={selected.request.wholeLifeCost ?? selected.request.estimatedCost}
            years={selected.request.appraisalYears ?? 5}
            alignment={selected.request.alignment}
          />
          <RelevantLessons
            categories={["Requirements", "Procurement", "Testing", "Change Management & Adoption"]}
            projectTypeTags={selected.request.themes}
            compact
          />
          {canManage && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={mutations.update.isPending || selected.request.status === "On Hold"}
                onClick={() =>
                  mutations.update.mutate(
                    {
                      id: selected.request.id,
                      input: { status: "On Hold" },
                      lastSeen: selected.request.updatedAt,
                    },
                    {
                      onSuccess: () =>
                        toast.success(`${selected.request.title} is on hold for more detail.`),
                    },
                  )
                }
              >
                Send back for more detail
              </Button>
              <Button
                disabled={mutations.update.isPending || selected.request.status === "Approved"}
                onClick={() =>
                  mutations.update.mutate(
                    {
                      id: selected.request.id,
                      input: { status: "Approved" },
                      lastSeen: selected.request.updatedAt,
                    },
                    {
                      onSuccess: () =>
                        toast.success(
                          `${selected.request.title} is approved to progress to Phase 2.`,
                        ),
                    },
                  )
                }
              >
                Progress to Phase 2
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
