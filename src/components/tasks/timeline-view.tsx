import { useState } from "react";
import { today } from "@/lib/today";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Task } from "@/data/types";
import { toDate, fromDate, DAY, type Row } from "./task-helpers";
import { type Actions } from "./task-actions";
import { TitleCell, Avatars, RowMenu, Tick } from "./task-row-parts";

export function TimelineView({ rows, a, all }: { rows: Row[]; a: Actions; all: Task[] }) {
  const tasks = rows.map((r) => r.task);
  const [zoom, setZoom] = useState<"week" | "month">("week");
  const [hover, setHover] = useState<string | null>(null);
  const ROW = 44,
    px = zoom === "week" ? 9 : 4;
  const starts = tasks.map((t) => toDate(t.start).getTime()),
    ends = tasks.map((t) => toDate(t.finish).getTime());
  const min = (starts.length ? Math.min(...starts) : Date.now()) - 7 * DAY,
    max = (ends.length ? Math.max(...ends) : Date.now()) + 14 * DAY;
  const x = (ms: number) => ((ms - min) / DAY) * px,
    width = ((max - min) / DAY) * px,
    idx = new Map(tasks.map((t, i) => [t.id, i]));
  const ticks: number[] = [];
  for (
    let d = new Date(min);
    d.getTime() < max;
    d.setDate(d.getDate() + (zoom === "week" ? 7 : 0)),
      zoom === "month" && d.setMonth(d.getMonth() + 1, 1)
  )
    ticks.push(d.getTime());
  const bar = (t: Task) => ({
    l: x(toDate(t.start).getTime()),
    r: x(toDate(t.finish).getTime() + DAY),
  });
  const lines = tasks.flatMap((t, i) =>
    t.dependencies
      .filter((d) => idx.has(d))
      .map((d) => {
        const p = tasks[idx.get(d)!]!,
          pi = idx.get(d)!,
          pb = bar(p),
          tb = bar(t);
        const x1 = p.isMilestone ? pb.l + 8 : pb.r,
          y1 = pi * ROW + ROW / 2,
          x2 = t.isMilestone ? tb.l : tb.l,
          y2 = i * ROW + ROW / 2,
          mid = x1 + 10;
        const path =
          x2 >= mid + 4
            ? `M${x1},${y1} H${mid} V${y2} H${x2}`
            : `M${x1},${y1} H${mid} V${y1 + (y2 > y1 ? ROW / 2 : -ROW / 2)} H${x2 - 10} V${y2} H${x2}`;
        return {
          key: `${d}-${t.id}`,
          path,
          warn: toDate(t.start) <= toDate(p.finish) && !(p.isMilestone && t.start === p.finish),
          active: hover === t.id || hover === d,
        };
      }),
  );
  return (
    <div className="rounded-lg border border-border/70 bg-card shadow-sm">
      <div className="flex items-center justify-between border-b p-2">
        <p className="px-2 text-xs text-muted-foreground">
          Lines show task dependencies. Amber means a task starts before its predecessor finishes.
        </p>
        <div className="flex gap-1">
          {(["week", "month"] as const).map((z) => (
            <Button
              key={z}
              size="sm"
              variant={zoom === z ? "secondary" : "ghost"}
              onClick={() => setZoom(z)}
              className="capitalize"
            >
              {z}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex overflow-hidden">
        <div className="w-[340px] shrink-0 border-r">
          <div className="h-8 border-b" />
          {tasks.map((t, i) => (
            <RowMenu key={t.id} task={t} tasks={all} a={a}>
              <div
                onMouseEnter={() => setHover(t.id)}
                onMouseLeave={() => setHover(null)}
                style={{ height: ROW }}
                className="flex items-center gap-2 border-b px-3 text-sm"
              >
                <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                <Tick task={t} a={a} />
                <TitleCell row={rows[i]!} a={a} className="flex-1" />
                <Avatars names={t.assignees} />
              </div>
            </RowMenu>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width }}>
            <div className="flex h-8 border-b text-[10px] text-muted-foreground">
              {ticks.map((tk, i) => (
                <span
                  key={tk}
                  className="absolute top-2 whitespace-nowrap pl-1"
                  style={{ left: x(tk) }}
                >
                  {zoom === "week"
                    ? fromDate(new Date(tk)).slice(0, 5)
                    : new Date(tk).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
                  {i < 0 && ""}
                </span>
              ))}
            </div>
            <div className="relative" style={{ height: tasks.length * ROW }}>
              {ticks.map((tk, i) => (
                <div
                  key={tk}
                  className={cn("absolute inset-y-0", i % 2 ? "bg-muted/40" : "")}
                  style={{ left: x(tk), width: (ticks[i + 1] ? x(ticks[i + 1]!) : width) - x(tk) }}
                />
              ))}
              {tasks.map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0 border-b"
                  style={{ top: (i + 1) * ROW - 1 }}
                />
              ))}
              <div
                className="absolute inset-y-0 w-px bg-destructive/60"
                style={{ left: x(today().getTime()) }}
              />
              <svg
                className="pointer-events-none absolute inset-0"
                width={width}
                height={tasks.length * ROW}
              >
                {lines.map((l) => (
                  <path
                    key={l.key}
                    d={l.path}
                    fill="none"
                    strokeLinejoin="round"
                    className={cn(
                      l.warn ? "stroke-health-warn" : "stroke-muted-foreground",
                      l.active && "stroke-primary",
                    )}
                    strokeWidth={l.active ? 2 : 1.25}
                  />
                ))}
              </svg>
              {tasks.map((t, i) => {
                const b = bar(t);
                return t.isMilestone ? (
                  <button
                    key={t.id}
                    title={t.title}
                    onClick={() => a.open(t.id)}
                    onMouseEnter={() => setHover(t.id)}
                    onMouseLeave={() => setHover(null)}
                    className="absolute size-4 rotate-45 bg-primary"
                    style={{ left: b.l, top: i * ROW + ROW / 2 - 8 }}
                  />
                ) : (
                  <button
                    key={t.id}
                    title={`${t.title} · ${t.start} – ${t.finish}`}
                    onClick={() => a.open(t.id)}
                    onMouseEnter={() => setHover(t.id)}
                    onMouseLeave={() => setHover(null)}
                    className={cn(
                      "absolute overflow-hidden rounded-sm",
                      rows[i]!.kids ? "h-2.5" : "h-5",
                      t.percentComplete === 100 ? "bg-primary/60" : "bg-primary/25",
                    )}
                    style={{
                      left: b.l,
                      width: Math.max(b.r - b.l, 8),
                      top: i * ROW + ROW / 2 - (rows[i]!.kids ? 5 : 10),
                    }}
                  >
                    <span
                      className="block h-full bg-primary"
                      style={{ width: `${t.percentComplete}%` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
