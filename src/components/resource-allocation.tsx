import { useMemo, useState } from "react";
import { CalendarOff, GripHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { QueryState } from "@/components/query-state";
import { useResourceData, useResourceMutations } from "@/hooks/use-resources";
import { useCan } from "@/hooks/use-permissions";
import {
  personCapacity as getPersonCapacity,
  roleDemand,
  weekStarts,
  weeklyAllocation as getWeeklyAllocation,
  type AssignmentView as ResourceAssignment,
  type ResourceData,
} from "@/services/resources";
import { cn } from "@/lib/utils";

const parse = (value: string) => {
  const [d = 1, m = 1, y = 1970] = value.split("/").map(Number);
  return new Date(y, m - 1, d);
};
const format = (date: Date) =>
  `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
const moveDate = (value: string, weeks: number) =>
  format(new Date(parse(value).getTime() + weeks * 7 * 86400000));
export function ResourceAllocation() {
  const query = useResourceData();
  return <QueryState query={query}>{(data) => <Allocation data={data} />}</QueryState>;
}
function Allocation({ data }: { data: ResourceData }) {
  const people = data.people,
    weeks = useMemo(() => weekStarts(), []),
    projects = data.projects,
    mutations = useResourceMutations(),
    canMove = useCan("manager"),
    [mode, setMode] = useState<"people" | "roles">("people"),
    assignments = data.assignments,
    [selected, setSelected] = useState<{ personId: string; week: string } | null>(null),
    [dragged, setDragged] = useState<ResourceAssignment | null>(null);
  const roles = useMemo(() => roleDemand(data, weeks), [data, weeks]);
  const allocation = (personId: string, week: string) =>
    getWeeklyAllocation(personId, week, assignments);
  const onDrop = (personId: string, week: string) => {
    if (!dragged) return;
    const duration = Math.round(
      (parse(dragged.end).getTime() - parse(dragged.start).getTime()) / (7 * 86400000),
    );
    mutations.move.mutate(
      { item: dragged, resourceId: personId, start: week, end: moveDate(week, duration) },
      { onError: (error) => toast.error(error.message) },
    );
    setDragged(null);
  };
  const details = selected
    ? assignments.filter(
        (item) =>
          item.resourceType === "Person" &&
          item.resourceId === selected.personId &&
          parse(item.start) <= parse(selected.week) &&
          parse(item.end) >= parse(selected.week),
      )
    : [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-lg border border-border/70 bg-card p-1">
          <Button
            size="sm"
            variant={mode === "people" ? "default" : "ghost"}
            onClick={() => setMode("people")}
          >
            People
          </Button>
          <Button
            size="sm"
            variant={mode === "roles" ? "default" : "ghost"}
            onClick={() => setMode("roles")}
          >
            Role / skill
          </Button>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <Legend colour="bg-health-good/25" label="Under 80%" />
          <Legend colour="bg-health-warn/30" label="80–100%" />
          <Legend colour="bg-health-bad/25" label="Over 100%" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/70 bg-card shadow-sm">
        <table className="min-w-[2600px] border-collapse text-left">
          <thead className="sticky top-0 z-20 bg-table-head">
            <tr>
              <th className="sticky left-0 z-30 min-w-56 border-b border-r bg-table-head px-4 py-3 text-xs">
                {mode === "people" ? "Person" : "Role / skill"}
              </th>
              {weeks.map((week) => (
                <th
                  key={week}
                  className="w-24 border-b border-r px-2 py-3 text-center text-[10px] text-muted-foreground"
                >
                  {week.slice(0, 5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mode === "people"
              ? people.map((person) => (
                  <tr key={person.id}>
                    <td className="sticky left-0 z-10 border-b border-r bg-card px-4 py-3">
                      <p className="text-sm font-semibold">{person.name}</p>
                      <p className="text-xs text-muted-foreground">{person.team}</p>
                    </td>
                    {weeks.map((week) => {
                      const hours = allocation(person.id, week),
                        capacity = getPersonCapacity(person, week),
                        percent = capacity ? Math.round((hours / capacity) * 100) : 0,
                        leave = person.leave.some(
                          (entry) =>
                            parse(entry.start) <= new Date(parse(week).getTime() + 6 * 86400000) &&
                            parse(entry.end) >= parse(week),
                        );
                      const active = assignments.filter(
                        (item) =>
                          item.resourceType === "Person" &&
                          item.resourceId === person.id &&
                          parse(item.start) <= parse(week) &&
                          parse(item.end) >= parse(week),
                      );
                      return (
                        <td
                          key={week}
                          onClick={() => setSelected({ personId: person.id, week })}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => onDrop(person.id, week)}
                          className={cn(
                            "relative h-16 cursor-pointer border-b border-r p-1 text-center",
                            percent > 100
                              ? "bg-health-bad/20"
                              : percent >= 80
                                ? "bg-health-warn/25"
                                : "bg-health-good/20",
                          )}
                          style={
                            leave
                              ? {
                                  backgroundImage:
                                    "repeating-linear-gradient(135deg,transparent,transparent 5px,var(--border) 5px,var(--border) 7px)",
                                }
                              : undefined
                          }
                        >
                          <span className="text-xs font-semibold">{percent}%</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {hours.toFixed(0)}/{capacity.toFixed(0)}h
                          </span>
                          {leave && (
                            <CalendarOff className="absolute right-1 top-1 size-3 text-muted-foreground" />
                          )}
                          {active.map((item) => (
                            <span
                              key={item.id}
                              draggable={canMove}
                              onDragStart={() => setDragged(item)}
                              title={`Drag ${projects.find((project) => project.id === item.projectId)?.name}`}
                              className="mx-auto mt-1 block h-1.5 w-10 cursor-grab rounded bg-primary"
                            >
                              <GripHorizontal className="sr-only" />
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))
              : roles.map((item) => (
                  <tr key={item.role}>
                    <td className="sticky left-0 z-10 border-b border-r bg-card px-4 py-3 text-sm font-semibold">
                      {item.role}
                    </td>
                    {item.weeks.map((point) => {
                      const percent = point.capacity
                        ? Math.round((point.demand / point.capacity) * 100)
                        : point.demand
                          ? 150
                          : 0;
                      return (
                        <td
                          key={point.week}
                          className={cn(
                            "h-16 border-b border-r p-1 text-center",
                            percent > 100
                              ? "bg-health-bad/20"
                              : percent >= 80
                                ? "bg-health-warn/25"
                                : "bg-health-good/20",
                          )}
                        >
                          <span className="text-xs font-semibold">{point.demand}h</span>
                          <span className="block text-[10px] text-muted-foreground">
                            of {Math.round(point.capacity)}h
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {canMove
          ? "Drag a booking marker to another person or week to move the booking."
          : "Managers can drag booking markers to move bookings."}
      </p>
      {selected && (
        <aside
          role="dialog"
          aria-label="Weekly allocation details"
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl font-semibold">
                {people.find((person) => person.id === selected.personId)?.name}
              </h2>
              <p className="text-sm text-muted-foreground">Week commencing {selected.week}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
              <X />
            </Button>
          </div>
          <div className="mt-6 space-y-3">
            {details.length ? (
              details.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/70 bg-card p-4">
                  <p className="font-semibold">
                    {projects.find((project) => project.id === item.projectId)?.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.role} · {item.hoursPerWeek}h · {item.bookingType}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No project allocation this week.</p>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("size-3 rounded", colour)} />
      {label}
    </span>
  );
}
