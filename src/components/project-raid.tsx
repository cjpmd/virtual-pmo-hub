// Project RAID tab backed by Supabase: risks and issues are read with useRaid() and every
// board edit is written to the record by id (column key → service field mapping below).
import { useMemo } from "react";
import { toast } from "sonner";
import type { BoardRow } from "@/components/board-workspace";
import { QueryState } from "@/components/query-state";
import { RaidWorkspace } from "@/components/raid-workspace";
import type { Issue, Risk } from "@/data/types";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { usePeople, useProjectPermissions, useRaid } from "@/hooks/use-hierarchy";
import { useRaidMutations } from "@/hooks/use-project-records";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import type { Person } from "@/services/hierarchy";
import type { OpenClosedLabel, ResponseLabel, SeverityLabel } from "@/services/labels";
import type { IssueInput, IssueItem, RiskInput, RiskItem } from "@/services/project-records";

const RESPONSES: ResponseLabel[] = ["Avoid", "Reduce", "Transfer", "Accept"];
const SEVERITIES: SeverityLabel[] = ["Low", "Medium", "High"];
const STATUSES: OpenClosedLabel[] = ["Open", "Closed"];
const pick = <T extends string>(options: readonly T[], value: unknown): T | undefined =>
  options.find((option) => option === value);

/** The board's "people" cell holds names; the database holds a resource id. */
function ownerField(people: Person[], value: unknown): { ownerId: string | null } | undefined {
  const name = Array.isArray(value) ? String(value[0] ?? "").trim() : String(value ?? "").trim();
  if (!name || name === "Unassigned") return { ownerId: null };
  const person = people.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!person) {
    toast.error(
      `No one called “${name}” is in this organisation. Use their name as it appears in Resources.`,
    );
    return undefined;
  }
  return { ownerId: person.id };
}

/** Date cells hold DD/MM/YYYY text; an empty cell clears the date, a half-typed one waits. */
function dateField(value: unknown): string | null | undefined {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return toIsoDate(text);
}

const scaleField = (value: unknown) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : undefined;
};

export function riskInputFromBoard(
  patch: Partial<BoardRow>,
  people: Person[],
): RiskInput | undefined {
  const input: RiskInput = {};
  if ("title" in patch && String(patch.title ?? "").trim()) input.title = String(patch.title);
  const status = pick(STATUSES, patch.status);
  if (status) input.status = status;
  if ("people" in patch) Object.assign(input, ownerField(people, patch.people) ?? {});
  if ("probability" in patch) {
    const value = scaleField(patch["probability"]);
    if (value !== undefined) input.probability = value;
  }
  if ("impact" in patch) {
    const value = scaleField(patch["impact"]);
    if (value !== undefined) input.impact = value;
  }
  const response = pick(RESPONSES, patch["response"]);
  if (response) input.response = response;
  if ("finish" in patch) {
    const value = dateField(patch.finish);
    if (value !== undefined) input.reviewDate = value;
  }
  return Object.keys(input).length ? input : undefined;
}

export function issueInputFromBoard(
  patch: Partial<BoardRow>,
  people: Person[],
): IssueInput | undefined {
  const input: IssueInput = {};
  if ("title" in patch && String(patch.title ?? "").trim()) input.title = String(patch.title);
  const status = pick(STATUSES, patch.status);
  if (status) input.status = status;
  if ("people" in patch) Object.assign(input, ownerField(people, patch.people) ?? {});
  const severity = pick(SEVERITIES, patch.priority);
  if (severity) input.severity = severity;
  if ("finish" in patch) {
    const value = dateField(patch.finish);
    if (value !== undefined) input.dueDate = value;
  }
  return Object.keys(input).length ? input : undefined;
}

const nameFor = (people: Map<string, string>, id: string | null) =>
  (id && people.get(id)) || "Unassigned";

// RaidWorkspace renders the prototype Risk/Issue shapes; these adapt the database records.
const toRisk = (item: RiskItem, people: Map<string, string>): Risk => ({
  id: item.id,
  title: item.title,
  description: item.description ?? "",
  owner: nameFor(people, item.ownerId),
  probability: item.probability as Risk["probability"],
  impact: item.impact as Risk["impact"],
  score: item.score,
  response: item.response,
  status: item.status,
  reviewDate: fromIsoDate(item.reviewDate),
});
const toIssue = (item: IssueItem, people: Map<string, string>): Issue => ({
  id: item.id,
  title: item.title,
  owner: nameFor(people, item.ownerId),
  severity: item.severity,
  status: item.status,
  dueDate: fromIsoDate(item.dueDate),
});

export function ProjectRaid({ projectId }: { projectId: string }) {
  const raid = useRaid(projectId);
  const people = usePeople();
  const permissions = useProjectPermissions(projectId);
  const mutations = useRaidMutations(projectId);
  const peopleList = useMemo(() => people.data ?? [], [people.data]);
  const names = useMemo(
    () => new Map(peopleList.map((person) => [person.id, person.name])),
    [peopleList],
  );

  const onRiskChange = useBoardRecordSync<RiskInput>({
    toInput: (patch) => riskInputFromBoard(patch, peopleList),
    create: (input) => {
      if (!input.title) return void toast.error("Give the risk a title.");
      mutations.createRisk.mutate({ ...input, title: input.title });
    },
    update: (id, input, lastSeen) => mutations.updateRisk.mutateAsync({ id, input, lastSeen }),
    remove: (ids) => mutations.deleteRisks.mutate(ids),
    lastSeen: (id) => raid.data?.risks.find((item) => item.id === id)?.updatedAt,
  });
  const onIssueChange = useBoardRecordSync<IssueInput>({
    toInput: (patch) => issueInputFromBoard(patch, peopleList),
    create: (input) => {
      if (!input.title) return void toast.error("Give the issue a title.");
      mutations.createIssue.mutate({ ...input, title: input.title });
    },
    update: (id, input, lastSeen) => mutations.updateIssue.mutateAsync({ id, input, lastSeen }),
    remove: (ids) => mutations.deleteIssues.mutate(ids),
    lastSeen: (id) => raid.data?.issues.find((item) => item.id === id)?.updatedAt,
  });

  return (
    <QueryState query={raid}>
      {(data) => (
        <div className="space-y-3">
          {!permissions.canEdit && (
            <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              You can view this project's RAID log. Contributors on this workspace can edit it.
            </p>
          )}
          <RaidWorkspace
            // The registers copy their columns on mount; remount once permissions are known.
            key={String(permissions.canEdit)}
            risks={data.risks.map((item) => toRisk(item, names))}
            issues={data.issues.map((item) => toIssue(item, names))}
            editable={permissions.canEdit}
            canDelete={permissions.canDelete}
            onRiskChange={onRiskChange}
            onIssueChange={onIssueChange}
          />
        </div>
      )}
    </QueryState>
  );
}
