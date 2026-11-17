import { addDays, daysBetween, getSprintForecast, type ForecastResult } from "@/services/forecast";
import {
  closedPeriodCount,
  effectiveUnits,
  forecastInputFor,
  liveItems,
  periodEndDate,
  toDate,
  toIso,
  workingDays,
  type ProjectDelivery,
  type Sprint,
} from "@/services/sprints";
import { today, fmt } from "./shared";

export interface BurnRow {
  label: string;
  period: number;
  scope?: number | undefined;
  done?: number | undefined;
  planned: number;
  forecast?: number | undefined;
  forecastScope?: number | undefined;
  cone?: number[] | undefined;
}
export function burnUpSeries(d: ProjectDelivery, f: ForecastResult) {
  const n = closedPeriodCount(d);
  const input = forecastInputFor(d);
  const rows: BurnRow[] = [];
  let done = 0;
  for (let k = 0; k <= n; k++) {
    if (k > 0) done += input.completed[k - 1]!;
    rows.push({
      label: fmt(periodEndDate(d, k)),
      period: k,
      scope: k === 0 ? d.settings.baselineScope : input.scopeHistory[k - 1]!,
      done,
      planned: Math.round(
        Math.min(
          d.settings.baselineScope,
          (k * d.settings.baselineScope) / d.settings.baselinePeriods,
        ),
      ),
    });
  }
  const last = Math.min(
    Math.max(
      f.finishPeriod ?? n + 8,
      d.settings.baselinePeriods,
      f.range.worst
        ? daysBetween(toDate(d.settings.baselineStart), f.range.worst) / d.settings.sprintLengthDays
        : 0,
    ) + 1,
    n + 40,
  );
  const worstPeriods = f.velocities.worst,
    bestPeriods = f.velocities.best;
  for (let k = n; k <= last; k++) {
    const step = k - n;
    const row: BurnRow = rows[k] ?? {
      label: fmt(periodEndDate(d, k)),
      period: k,
      planned: Math.round(
        Math.min(
          d.settings.baselineScope,
          (k * d.settings.baselineScope) / d.settings.baselinePeriods,
        ),
      ),
    };
    const scopeF = f.scopeNow + f.scopeGrowth * step;
    row.forecastScope = Math.round(scopeF);
    row.forecast = Math.min(Math.round(f.doneNow + f.velocity * step), Math.round(scopeF));
    row.cone = [
      Math.round(Math.min(f.doneNow + worstPeriods * step, scopeF)),
      Math.round(Math.min(f.doneNow + bestPeriods * step, scopeF)),
    ];
    rows[k] = row;
  }
  return rows;
}
export function sprintDaily(d: ProjectDelivery, sprint: Sprint) {
  const start = toDate(sprint.start),
    end = toDate(sprint.end);
  const commits = d.commitments.filter((c) => c.sprintId === sprint.id);
  const items = liveItems(d).filter(
    (i) => i.sprintId === sprint.id || commits.some((c) => c.workItemId === i.id),
  );
  const committed =
    commits.filter((c) => !c.addedAfterStart).reduce((s, c) => s + c.unitsAtStart, 0) ||
    items.reduce((s, i) => s + effectiveUnits(d, i), 0);
  const work = workingDays(start, end);
  const rows: {
    label: string;
    remaining?: number | undefined;
    ideal: number;
    added?: number | undefined;
  }[] = [];
  const dailyDone: number[] = [];
  work.forEach((day, idx) => {
    const ideal = Math.round(committed * (1 - idx / Math.max(1, work.length - 1)) * 10) / 10;
    if (day > today) {
      rows.push({ label: fmt(day), ideal });
      return;
    }
    const next = addDays(day, 1);
    const scope = items
      .filter((i) => {
        const c = commits.find((x) => x.workItemId === i.id);
        return !c?.addedAfterStart || toDate(i.createdAt) < next;
      })
      .reduce((s, i) => s + effectiveUnits(d, i), 0);
    const doneBy = items
      .filter((i) => i.doneAt && toDate(i.doneAt) < next)
      .reduce((s, i) => s + effectiveUnits(d, i), 0);
    const doneToday = items
      .filter((i) => i.doneAt && toIso(toDate(i.doneAt)) === toIso(day))
      .reduce((s, i) => s + effectiveUnits(d, i), 0);
    dailyDone.push(doneToday);
    const added = commits
      .filter(
        (c) =>
          c.addedAfterStart &&
          items.find((i) => i.id === c.workItemId && toIso(toDate(i.createdAt)) === toIso(day)),
      )
      .reduce((s, c) => s + c.unitsAtStart, 0);
    rows.push({ label: fmt(day), remaining: scope - doneBy, ideal, added: added || undefined });
  });
  const remaining = rows.filter((r) => r.remaining !== undefined).at(-1)?.remaining ?? committed;
  return {
    rows,
    committed,
    remaining,
    forecast: getSprintForecast({ committed, remaining, start, end, today, dailyDone }),
  };
}
