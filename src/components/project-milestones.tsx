// Project milestones backed by Supabase. Status and slip come from v_milestones (the database's
// date rule); edits write to the milestone by id, and forecast changes are recorded in
// milestone_forecast_history by a trigger.
import { useMemo } from "react";
import { toast } from "sonner";
import { BoardWorkspace, type BoardColumn, type BoardRow } from "@/components/board-workspace";
import { QueryState } from "@/components/query-state";
import type { MilestoneType } from "@/data/types";
import { useBoardRecordSync } from "@/hooks/use-board-record-sync";
import { useMilestones, usePeople, useProjectPermissions } from "@/hooks/use-hierarchy";
import { useMilestoneMutations } from "@/hooks/use-project-records";
import { fromIsoDate, toIsoDate } from "@/lib/format";
import type { Person } from "@/services/hierarchy";
import type { MilestoneInput, MilestoneItem } from "@/services/project-records";

const TYPES: MilestoneType[] = ["Delivery", "Gate", "Key date", "External dependency"];

export const projectMilestoneColumns: BoardColumn[] = [
  { key: "title", label: "Milestone", type: "text", editable: true, summary: "count", width: 280 },
  { key: "type", label: "Type", type: "status", editable: true, options: TYPES },
  { key: "people", label: "Owner", type: "people", editable: true },
  { key: "deliveryStatus", label: "Status", type: "status", summary: "rag" },
  { key: "baseline", label: "Baseline", type: "date", editable: true },
  { key: "finish", label: "Forecast", type: "date", editable: true },
  { key: "actual", label: "Actual", type: "date", editable: true },
  { key: "number", label: "Slip", type: "number", unit: " days", summary: "average" },
  { key: "timeline", label: "Timeline", type: "timeline" },
];

export function milestonesToBoardRows(
  items: MilestoneItem[],
  people: Map<string, string>,
): BoardRow[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    people: [(item.ownerId && people.get(item.ownerId)) || "Unassigned"],
    deliveryStatus: item.status,
    status: item.status,
    baseline: fromIsoDate(item.baselineDate),
    start: fromIsoDate(item.baselineDate),
    finish: fromIsoDate(item.forecastDate),
    actual: fromIsoDate(item.actualDate),
    number: item.slipDays,
    timeline: "",
    complete: item.status === "Completed",
    isMilestone: true,
    group: item.type,
  }));
}

/** Board column key → milestone field. Undefined means "nothing valid to write yet". */
export function milestoneInputFromBoard(
  patch: Partial<BoardRow>,
  people: Person[],
): MilestoneInput | undefined {
  const input: MilestoneInput = {};
  if ("title" in patch && String(patch.title ?? "").trim()) input.title = String(patch.title);
  const type = TYPES.find((option) => option === patch["type"]);
  if (type) input.type = type;
  if ("people" in patch) {
    const name = Array.isArray(patch.people) ? String(patch.people[0] ?? "").trim() : "";
    const person = people.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (!name || name === "Unassigned") input.ownerId = null;
    else if (person) input.ownerId = person.id;
    else
      toast.error(
        `No one called “${name}” is in this organisation. Use their name as it appears in Resources.`,
      );
  }
  const date = (key: string) => (key in patch ? toIsoDate(String(patch[key] ?? "")) : undefined);
  const baseline = date("baseline"),
    forecast = date("finish");
  if (baseline) input.baselineDate = baseline;
  if (forecast) input.forecastDate = forecast;
  if ("actual" in patch) {
    const text = String(patch["actual"] ?? "").trim();
    const actual = text ? toIsoDate(text) : null;
    if (actual !== undefined) input.actualDate = actual;
  }
  return Object.keys(input).length ? input : undefined;
}

export function ProjectMilestones({ projectId }: { projectId: string }) {
  const milestones = useMilestones([projectId], projectId);
  const people = usePeople();
  const permissions = useProjectPermissions(projectId);
  const mutations = useMilestoneMutations(projectId);
  const peopleList = useMemo(() => people.data ?? [], [people.data]);
  const names = useMemo(
    () => new Map(peopleList.map((person) => [person.id, person.name])),
    [peopleList],
  );

  const onRecordChange = useBoardRecordSync<MilestoneInput>({
    toInput: (patch) => milestoneInputFromBoard(patch, peopleList),
    create: (input) => {
      if (!input.title || !input.forecastDate)
        return void toast.error("A milestone needs a title and a forecast date (DD/MM/YYYY).");
      mutations.create.mutate({
        projectId,
        input: { ...input, title: input.title, forecastDate: input.forecastDate },
      });
    },
    update: (id, input) => mutations.update.mutate({ id, input }),
    remove: (ids) => ids.forEach((id) => mutations.remove.mutate(id)),
  });

  return (
    <QueryState query={milestones}>
      {(items) => (
        <BoardWorkspace
          // The board copies its columns on mount; remount once permissions are known.
          key={String(permissions.canEdit)}
          title="Milestones"
          itemLabel="milestone"
          rows={milestonesToBoardRows(items, names)}
          columns={
            permissions.canEdit
              ? projectMilestoneColumns
              : projectMilestoneColumns.map((column) => ({ ...column, editable: false }))
          }
          groupOptions={["group", "deliveryStatus"]}
          manage={permissions.canEdit}
          onRecordChange={onRecordChange}
        />
      )}
    </QueryState>
  );
}
