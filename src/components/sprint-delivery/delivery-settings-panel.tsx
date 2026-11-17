import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getNonWorkingPeriods,
  periodEndDate,
  saveNonWorkingPeriods,
  saveSettings,
  toDate,
  type ProjectDelivery,
} from "@/services/sprints";
import { fmt, selectCls } from "./shared";

export function DeliverySettingsPanel({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [open, setOpen] = useState(false);
  const s = d.settings;
  const closures = getNonWorkingPeriods();
  const [closure, setClosure] = useState({ name: "", start: "", end: "" });
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-lg border border-border/70 bg-card p-4 shadow-sm"
    >
      <summary className="cursor-pointer text-sm font-semibold">
        Delivery settings and closure days
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Label className="text-xs">
          Delivery approach
          <select
            className={cn(selectCls, "mt-1 w-full")}
            value={s.approach}
            onChange={(e) =>
              saveSettings(projectId, { approach: e.target.value as typeof s.approach })
            }
          >
            <option value="agile">Agile</option>
            <option value="hybrid">Hybrid</option>
            <option value="waterfall">Waterfall</option>
          </select>
        </Label>
        <Label className="text-xs">
          Work unit
          <select
            className={cn(selectCls, "mt-1 w-full")}
            value={s.workUnit}
            onChange={(e) =>
              saveSettings(projectId, { workUnit: e.target.value as typeof s.workUnit })
            }
          >
            <option value="points">Story points</option>
            <option value="tasks">Task count</option>
            <option value="effort_hours">Effort hours</option>
          </select>
        </Label>
        <Label className="text-xs">
          Sprint length (days)
          <Input
            type="number"
            className="mt-1"
            value={s.sprintLengthDays}
            onChange={(e) =>
              saveSettings(projectId, { sprintLengthDays: Number(e.target.value) || 14 })
            }
          />
        </Label>
        <Label className="text-xs">
          RAG tolerance (days)
          <Input
            type="number"
            className="mt-1"
            value={s.ragToleranceDays}
            onChange={(e) => saveSettings(projectId, { ragToleranceDays: Number(e.target.value) })}
          />
        </Label>
        <Label className="text-xs">
          Baseline scope
          <Input
            type="number"
            className="mt-1"
            value={s.baselineScope}
            onChange={(e) => saveSettings(projectId, { baselineScope: Number(e.target.value) })}
          />
        </Label>
        <Label className="text-xs">
          Baseline start
          <Input
            type="date"
            className="mt-1"
            value={s.baselineStart}
            onChange={(e) =>
              e.target.value && saveSettings(projectId, { baselineStart: e.target.value })
            }
          />
        </Label>
        <Label className="text-xs">
          Baseline periods
          <Input
            type="number"
            className="mt-1"
            value={s.baselinePeriods}
            onChange={(e) =>
              saveSettings(projectId, { baselinePeriods: Math.max(1, Number(e.target.value)) })
            }
          />
        </Label>
        <div className="text-xs">
          <p className="font-medium">Baseline end</p>
          <p className="mt-2 text-sm">{fmt(periodEndDate(d, s.baselinePeriods))}</p>
        </div>
      </div>
      <div className="mt-5">
        <p className="text-sm font-medium">Organisation closure days</p>
        <p className="text-xs text-muted-foreground">
          Shared by every project. Burndown ideal lines skip these days.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {closures.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="flex-1">
                {c.name} · {fmt(toDate(c.start))}
                {c.end !== c.start ? ` – ${fmt(toDate(c.end))}` : ""}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label={`Remove ${c.name}`}
                onClick={() => saveNonWorkingPeriods(closures.filter((x) => x.id !== c.id))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            className="h-8 w-48"
            placeholder="Name"
            value={closure.name}
            onChange={(e) => setClosure({ ...closure, name: e.target.value })}
          />
          <Input
            className="h-8 w-40"
            type="date"
            value={closure.start}
            onChange={(e) => setClosure({ ...closure, start: e.target.value })}
          />
          <Input
            className="h-8 w-40"
            type="date"
            value={closure.end}
            onChange={(e) => setClosure({ ...closure, end: e.target.value })}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (closure.name && closure.start) {
                saveNonWorkingPeriods([
                  ...closures,
                  {
                    id: `nw-${Date.now()}`,
                    name: closure.name,
                    start: closure.start,
                    end: closure.end || closure.start,
                  },
                ]);
                setClosure({ name: "", start: "", end: "" });
              }
            }}
          >
            <Plus />
            Add closure
          </Button>
        </div>
      </div>
    </details>
  );
}
