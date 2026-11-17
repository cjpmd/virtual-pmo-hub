import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getProjectForecast } from "@/services/forecast";
import {
  addItem,
  deleteItem,
  effectiveUnits,
  forecastInputFor,
  isDone,
  liveItems,
  reorderItem,
  unitLabel,
  updateItem,
  type ProjectDelivery,
} from "@/services/sprints";
import { itemTypes, selectCls } from "./shared";

export function Backlog({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [type, setType] = useState("");
  const [stream, setStream] = useState("");
  const [title, setTitle] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const agile = d.settings.approach !== "waterfall";
  const items = liveItems(d)
    .filter((i) => !isDone(d, i) && (!agile || !i.sprintId))
    .filter((i) => (!type || i.itemType === type) && (!stream || i.workstream === stream))
    .sort((a, b) => a.backlogRank - b.backlogRank);
  const streams = Array.from(new Set(liveItems(d).map((i) => i.workstream)));
  const total = items.reduce((s, i) => s + effectiveUnits(d, i), 0);
  const unestimated = items.filter(
    (i) => i.estimateUnits === null && d.settings.workUnit !== "tasks",
  ).length;
  const v = getProjectForecast(forecastInputFor(d)).velocities.rolling3;
  const groups = agile
    ? [["", items] as const]
    : streams
        .map((s) => [s, items.filter((i) => i.workstream === s)] as const)
        .filter(([, list]) => list.length);
  const u = unitLabel(d);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/70 bg-card p-4 text-sm shadow-sm">
        <span>
          <strong>{total}</strong> {u} in backlog
        </span>
        <span>
          <strong>{unestimated}</strong> unestimated
        </span>
        <span>
          {v > 0 ? (
            <>
              About <strong>{Math.ceil(total / v)}</strong> {agile ? "sprints" : "periods"} at {v}{" "}
              {u} per {agile ? "sprint" : "period"}
            </>
          ) : (
            "Close 3 sprints to see how long the backlog will take."
          )}
        </span>
        <div className="ml-auto flex gap-2">
          <select
            aria-label="Filter by type"
            className={selectCls}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {itemTypes.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by workstream"
            className={selectCls}
            value={stream}
            onChange={(e) => setStream(e.target.value)}
          >
            <option value="">All workstreams</option>
            {streams.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) {
            addItem(projectId, title.trim());
            setTitle("");
          }
        }}
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a work item to the backlog"
        />
        <Button type="submit">
          <Plus />
          Add
        </Button>
      </form>
      {groups.map(([group, list]) => (
        <div
          key={group}
          className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm"
        >
          {group && (
            <div className="border-b border-border/70 bg-muted/40 px-4 py-2 text-sm font-semibold">
              {group}{" "}
              <span className="font-normal text-muted-foreground">· {list.length} items</span>
            </div>
          )}
          {list.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => {
                setDragId(item.id);
                e.dataTransfer.setData("text/plain", item.id);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId && dragId !== item.id) reorderItem(projectId, dragId, item.id);
                setDragId(null);
              }}
              className={cn(
                "flex items-center gap-3 border-b border-border/50 px-3 py-2 text-sm last:border-0",
                dragId === item.id && "opacity-50",
              )}
            >
              <GripVertical
                className="size-4 shrink-0 cursor-grab text-muted-foreground"
                aria-hidden
              />
              <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[11px] capitalize sm:inline">
                {item.itemType.replace("_", " ")}
              </span>
              <span className="hidden w-24 text-xs text-muted-foreground md:inline">
                {item.workstream}
              </span>
              <select
                aria-label="Status"
                className={selectCls}
                value={item.statusId}
                onChange={(e) => updateItem(projectId, item.id, { statusId: e.target.value })}
              >
                {d.statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {d.settings.workUnit !== "tasks" && (
                <Input
                  aria-label="Estimate"
                  type="number"
                  min={0}
                  className="h-8 w-16 text-xs"
                  value={item.estimateUnits ?? ""}
                  placeholder={String(d.estimateDefaults[item.itemType] ?? 1)}
                  onChange={(e) =>
                    updateItem(projectId, item.id, {
                      estimateUnits: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label="Delete item"
                onClick={() => deleteItem(projectId, item.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {!list.length && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              The backlog is empty. Add a work item above.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
