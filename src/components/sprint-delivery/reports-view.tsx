import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { RagPill } from "@/components/evidence-ui";
import { addDays, getProjectForecast } from "@/services/forecast";
import {
  activeSprint,
  closedPeriodCount,
  effectiveUnits,
  forecastInputFor,
  liveItems,
  periodEndDate,
  saveSettings,
  scopeAt,
  statusOf,
  toDate,
  unitLabel,
  workingDays,
  type ProjectDelivery,
} from "@/services/sprints";
import { today, fmt } from "./shared";
import { burnUpSeries, sprintDaily } from "./report-data";
import { BurnUpChart, burnLegend } from "./burn-up-chart";

export function Reports({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const f = getProjectForecast(forecastInputFor(d));
  const sprint = activeSprint(d);
  const closed = d.sprints
    .filter((s) => s.status === "closed")
    .sort((a, b) => a.start.localeCompare(b.start));
  const velocityRows = closed.map((s, i) => {
    const last3 = closed.slice(Math.max(0, i - 2), i + 1);
    return {
      label: s.name,
      committed: s.committedUnits ?? 0,
      completed: s.completedUnits ?? 0,
      average:
        Math.round((last3.reduce((a, x) => a + (x.completedUnits ?? 0), 0) / last3.length) * 10) /
        10,
    };
  });
  const n = closedPeriodCount(d);
  const input = forecastInputFor(d);
  const cfd = Array.from({ length: n + 1 }, (_, k) => {
    const at = k === n ? addDays(today, 1) : periodEndDate(d, k);
    const scope = scopeAt(d, at);
    const done = liveItems(d)
      .filter((i) => i.doneAt && toDate(i.doneAt) < at)
      .reduce((s, i) => s + effectiveUnits(d, i), 0);
    const wip =
      k === n
        ? liveItems(d)
            .filter((i) => statusOf(d, i).category === "wip")
            .reduce((s, i) => s + effectiveUnits(d, i), 0)
        : Math.round((input.completed[k] ?? 0) * 0.6);
    return { label: k === n ? "Today" : fmt(at), done, wip, todo: Math.max(0, scope - done - wip) };
  });
  const blocked = liveItems(d)
    .filter((i) => i.statusId === "blocked")
    .map((i) => {
      const ev = [...d.events].reverse().find((e) => e.workItemId === i.id && e.field === "status");
      const since = ev ? toDate(ev.changedAt) : toDate(i.createdAt);
      return { item: i, days: workingDays(since, today).length };
    })
    .filter((x) => x.days > 10);
  const burn = sprint ? sprintDaily(d, sprint) : null;
  const bu = burnUpSeries(d, f);
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard
        className="xl:col-span-2"
        title="Project burn-up"
        subtitle="Scope, baseline plan and delivered work, with the forecast from today"
        info="Grey dashed is total scope, blue dashed is the baseline plan, green is work done. The orange dotted line is the forecast at the 3-sprint average."
        legend={burnLegend}
        csv={{
          name: `${projectId}-burn-up`,
          columns: ["Period end", "Scope", "Planned", "Done", "Forecast"],
          rows: bu.map((r) => [r.label, r.scope, r.planned, r.done, r.forecast]),
        }}
        table={
          <SimpleTable
            columns={["Period end", "Scope", "Planned", "Done"]}
            rows={bu
              .filter((r) => r.done !== undefined)
              .map((r) => [String(r.label), String(r.scope), String(r.planned), String(r.done)])}
          />
        }
        empty={
          n < 1
            ? { title: "No history yet", detail: "Close the first sprint to start the burn-up." }
            : undefined
        }
      >
        <BurnUpChart d={d} f={f} />
      </ChartCard>
      <ChartCard
        title="Sprint burndown"
        subtitle={
          sprint ? `${sprint.name} · weekends and closure days skipped` : "No active sprint"
        }
        info="Remaining units each working day against an ideal straight line. Orange bars mark scope added mid-sprint."
        aside={
          burn && (
            <RagPill
              rag={burn.forecast.willLand ? "Green" : "Red"}
              label={burn.forecast.willLand ? "Will land" : "Won't land"}
            />
          )
        }
        csv={{
          name: `${projectId}-burndown`,
          columns: ["Day", "Remaining", "Ideal", "Added"],
          rows: (burn?.rows ?? []).map((r) => [r.label, r.remaining, r.ideal, r.added]),
        }}
        table={
          burn && (
            <SimpleTable
              columns={["Day", "Remaining", "Ideal"]}
              rows={burn.rows.map((r) => [r.label, String(r.remaining ?? "—"), String(r.ideal)])}
            />
          )
        }
        empty={
          !burn
            ? { title: "No active sprint", detail: "Start a sprint to see its burndown." }
            : undefined
        }
        footer={
          burn && (
            <p className="text-xs text-muted-foreground">
              {burn.remaining} {unitLabel(d)} left, completing about {burn.forecast.rate} a day over
              the last 3 days.{" "}
              {burn.forecast.willLand
                ? `On course to finish by ${fmt(burn.forecast.landDate)}.`
                : burn.forecast.landDate
                  ? `At this rate it finishes ${fmt(burn.forecast.landDate)}, after the sprint ends.`
                  : "Nothing completed recently, so it won't finish at this rate."}
            </p>
          )
        }
      >
        {burn && (
          <div className="h-64">
            <ResponsiveContainer>
              <ComposedChart data={burn.rows}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} />
                <YAxis width={34} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="added" name="Added" fill="var(--viz-cat-2)" barSize={6} />
                <Line
                  dataKey="ideal"
                  name="Ideal"
                  stroke="var(--viz-ink-muted)"
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="remaining"
                  name="Remaining"
                  stroke="var(--viz-cat-1)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
      <ChartCard
        title="Velocity"
        subtitle="Committed and completed per closed sprint"
        info="Bars compare what was committed with what was completed. The line is the rolling 3-sprint average."
        legend={
          <>
            <LegendItem colour="var(--viz-track)" label="Committed" />
            <LegendItem colour="var(--viz-cat-1)" label="Completed" />
            <LegendItem colour="var(--viz-cat-2)" label="3-sprint average" shape="line" />
          </>
        }
        csv={{
          name: `${projectId}-velocity`,
          columns: ["Sprint", "Committed", "Completed", "3-sprint average"],
          rows: velocityRows.map((r) => [r.label, r.committed, r.completed, r.average]),
        }}
        table={
          <SimpleTable
            columns={["Sprint", "Committed", "Completed", "Average"]}
            rows={velocityRows.map((r) => [
              r.label,
              String(r.committed),
              String(r.completed),
              String(r.average),
            ])}
          />
        }
        empty={
          !velocityRows.length
            ? { title: "No closed sprints", detail: "Close a sprint to record velocity." }
            : undefined
        }
      >
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={velocityRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis width={34} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="committed" name="Committed" fill="var(--viz-track)" />
              <Bar dataKey="completed" name="Completed" fill="var(--viz-cat-1)" />
              <Line
                dataKey="average"
                name="3-sprint average"
                stroke="var(--viz-cat-2)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard
        className="xl:col-span-2"
        title="Cumulative flow"
        subtitle="To do, in progress and done over time"
        info="Stacked units by status category at the end of each period. A widening middle band means work is piling up in progress."
        legend={
          <>
            <LegendItem colour="var(--viz-track)" label="To do" />
            <LegendItem colour="var(--viz-cat-4)" label="In progress" />
            <LegendItem colour="var(--viz-good)" label="Done" />
          </>
        }
        csv={{
          name: `${projectId}-cumulative-flow`,
          columns: ["Date", "To do", "In progress", "Done"],
          rows: cfd.map((r) => [r.label, r.todo, r.wip, r.done]),
        }}
        table={
          <SimpleTable
            columns={["Date", "To do", "In progress", "Done"]}
            rows={cfd.map((r) => [r.label, String(r.todo), String(r.wip), String(r.done)])}
          />
        }
        footer={
          blocked.length > 0 && (
            <p className="flex items-center gap-2 text-sm text-health-bad-foreground">
              <AlertTriangle className="size-4" />
              {blocked
                .map((b) => `"${b.item.title}" has been Blocked for ${b.days} working days`)
                .join("; ")}
              .
            </p>
          )
        }
      >
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={cfd}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={20} />
              <YAxis width={40} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area
                dataKey="done"
                stackId="a"
                name="Done"
                fill="var(--viz-good)"
                stroke="var(--viz-good)"
                fillOpacity={0.6}
                isAnimationActive={false}
              />
              <Area
                dataKey="wip"
                stackId="a"
                name="In progress"
                fill="var(--viz-cat-4)"
                stroke="var(--viz-cat-4)"
                fillOpacity={0.6}
                isAnimationActive={false}
              />
              <Area
                dataKey="todo"
                stackId="a"
                name="To do"
                fill="var(--viz-track)"
                stroke="var(--viz-axis)"
                fillOpacity={0.6}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <RecoveryPlan projectId={projectId} d={d} />
    </div>
  );
}

function SimpleTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c} className="py-1 text-left text-xs text-muted-foreground">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-border/50">
            {r.map((c, j) => (
              <td key={j} className="py-1">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RecoveryPlan({ projectId, d }: { projectId: string; d: ProjectDelivery }) {
  const [value, setValue] = useState(String(d.settings.planVelocity ?? ""));
  return (
    <div className="rounded-lg border border-border/70 bg-card p-5 shadow-sm xl:col-span-2">
      <h3 className="font-semibold">Recovery plan</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Set the velocity the team is committing to for recovery. The "Recovery plan" forecast basis
        uses it.
      </p>
      <div className="mt-3 flex items-end gap-2">
        <Label className="text-xs">
          Target {unitLabel(d)} per {d.settings.approach === "waterfall" ? "period" : "sprint"}
          <Input
            type="number"
            className="mt-1 w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Label>
        <Button
          variant="outline"
          onClick={() => saveSettings(projectId, value ? { planVelocity: Number(value) } : {})}
        >
          Save plan
        </Button>
      </div>
    </div>
  );
}
