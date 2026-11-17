import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  activeSprint,
  effectiveUnits,
  liveItems,
  unitLabel,
  updateItem,
  type ProjectDelivery,
} from "@/services/sprints";

export function SprintBoard({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const sprint = activeSprint(d);
  const [who, setWho] = useState("");
  if (!sprint)
    return (
      <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No active sprint. Start one from the Sprints view.
      </p>
    );
  const items = liveItems(d).filter((i) => i.sprintId === sprint.id);
  const names = Array.from(new Set(items.map((i) => i.assignee).filter(Boolean))) as string[];
  const shown = items.filter((i) => !who || i.assignee === who);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{sprint.name}</h3>
        <span className="text-sm text-muted-foreground">{sprint.goal}</span>
        <div className="ml-auto flex flex-wrap gap-1">
          {["", ...names].map((n) => (
            <button
              key={n || "all"}
              onClick={() => setWho(n)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                who === n
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {n || "Everyone"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 overflow-x-auto md:grid-cols-3 xl:grid-cols-6">
        {d.statuses.map((status) => {
          const list = shown.filter((i) => i.statusId === status.id);
          return (
            <div
              key={status.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("text/plain");
                if (id) updateItem(projectId, id, { statusId: status.id });
              }}
              className="min-h-40 rounded-lg border border-border/70 bg-muted/30 p-2"
            >
              <p className="mb-2 flex justify-between px-1 text-xs font-semibold">
                <span>{status.name}</span>
                <span className="text-muted-foreground">
                  {list.reduce((s, i) => s + effectiveUnits(d, i), 0)}
                </span>
              </p>
              <div className="space-y-2">
                {list.map((i) => (
                  <div
                    key={i.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
                    className={cn(
                      "cursor-grab rounded-md border bg-card p-2 text-sm shadow-sm",
                      status.id === "blocked" ? "border-health-bad/40" : "border-border/70",
                    )}
                  >
                    <p className="leading-5">{i.title}</p>
                    <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                      <span>{i.assignee ?? "Unassigned"}</span>
                      <span>
                        {effectiveUnits(d, i)} {unitLabel(d)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
