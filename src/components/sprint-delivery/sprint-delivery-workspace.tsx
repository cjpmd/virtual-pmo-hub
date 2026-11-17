import { useState } from "react";
import { cn } from "@/lib/utils";
import { getDelivery, useDeliveryVersion } from "@/services/sprints";
import { views, type View } from "./shared";
import { Backlog } from "./backlog";
import { Sprints } from "./sprints-view";
import { SprintBoard } from "./sprint-board";
import { Reports } from "./reports-view";
import { ForecastView } from "./forecast-view";
import { DeliverySettingsPanel } from "./delivery-settings-panel";

/** Kept for the sprints phase; not rendered (see NoSprintData). */
export function SprintDeliveryWorkspace({ projectId }: { projectId: string }) {
  useDeliveryVersion();
  const d = getDelivery(projectId);
  const agile = d.settings.approach !== "waterfall";
  const [view, setView] = useState<View>("Backlog");
  const available = views.filter((v) => agile || (v !== "Sprints" && v !== "Board"));
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold">Delivery</h2>
          <p className="mt-1 text-sm text-muted-foreground capitalize">
            {d.settings.approach} delivery · work measured in{" "}
            {d.settings.workUnit.replace("_", " ")} · {d.settings.sprintLengthDays}-day{" "}
            {agile ? "sprints" : "periods"}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border/70 bg-card p-1 shadow-sm">
          {available.map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === "Backlog" && <Backlog projectId={projectId} d={d} />}
      {view === "Sprints" && <Sprints projectId={projectId} d={d} />}
      {view === "Board" && <SprintBoard projectId={projectId} d={d} />}
      {view === "Reports" && <Reports projectId={projectId} d={d} />}
      {view === "Forecast" && <ForecastView projectId={projectId} d={d} />}
      <DeliverySettingsPanel projectId={projectId} d={d} />
    </div>
  );
}
