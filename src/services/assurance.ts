import type { Health } from "@/data/types";
import { getProgramme, getProjectHealth, getProjects } from "./pmo";
import { daysBetween, getProjectForecast, type DeliveryStatus, type EvidencedRag, type ForecastResult } from "./forecast";
import { TODAY, forecastHistory, forecastInputFor, getDelivery, isStale, lastActivity, toDate } from "./sprints";

const level = (r: EvidencedRag) => (r === "Green" ? 0 : r === "Amber" ? 1 : r === "Red" ? 2 : -1);
const healthRag = (h: Health): EvidencedRag => (h === "On Track" ? "Green" : h === "At Risk" ? "Amber" : h === "Off Track" ? "Red" : "Grey");

export interface AssuranceRow {
  projectId: string; name: string; programme: string; state: string; declared: Health; evidenced: EvidencedRag; stale: boolean; status: DeliveryStatus;
  forecast: ForecastResult; daysVsBaseline: number | null; gap: number; converging: boolean; lastUpdateDays: number;
  divergent: boolean; divergenceAlert: boolean; divergenceDays: number; justification?: string; riskScore: number;
}

export function getAssuranceRow(projectId: string): AssuranceRow {
  const project = getProjects().find(p => p.id === projectId) ?? getProjects()[0]!;
  const d = getDelivery(project.id);
  const f = getProjectForecast(forecastInputFor(d));
  const latest = [...(project.reports ?? [])].sort((a, b) => b.reportingDate.split("/").reverse().join("").localeCompare(a.reportingDate.split("/").reverse().join("")))[0];
  const declared = latest?.overall ?? getProjectHealth(project);
  const stale = project.state !== "Closed" && isStale(d);
  const evidenced: EvidencedRag = stale ? "Grey" : f.evidencedRag;
  const divergent = level(evidenced) > level(healthRag(declared)) && level(evidenced) >= 0 && level(healthRag(declared)) >= 0;
  // consecutive most-recent forecast points where evidence was worse than declared
  let cycles = 0, since: Date | null = null;
  for (const point of forecastHistory(project.id).reverse()) { if (level(point.rag) > level(healthRag(declared))) { cycles++; since = point.date; } else break; }
  const divergenceDays = since ? daysBetween(since, toDate(TODAY)) : 0;
  const divergenceAlert = divergent && (cycles >= 2 || divergenceDays >= 14);
  const lastUpdateDays = daysBetween(lastActivity(d), toDate(TODAY));
  const slip = Math.max(0, f.daysVsBaseline ?? 60);
  const riskScore = Math.round((divergenceAlert ? 40 : divergent ? 15 : 0) + Math.min(30, slip / 3) + (stale ? 20 : 0) + (!f.converging && f.deliveryStatus !== "insufficient_evidence" ? 15 : 0));
  return { projectId: project.id, name: project.name, programme: getProgramme(project.programmeId)?.name ?? "Direct", state: project.state, declared, evidenced, stale, status: f.deliveryStatus,
    forecast: f, daysVsBaseline: f.daysVsBaseline, gap: f.gapUnits, converging: f.converging, lastUpdateDays, divergent, divergenceAlert, divergenceDays, justification: d.justifications[0]?.text, riskScore };
}

export function getAssuranceRows() { return getProjects().filter(p => p.state !== "Proposed").map(p => getAssuranceRow(p.id)).sort((a, b) => b.riskScore - a.riskScore); }

/** Roll-up: aggregate forecasts, never velocities. Insufficient evidence is excluded and counted. */
export function rollUp(rows: AssuranceRow[]) {
  const counted = rows.filter(r => r.status !== "insufficient_evidence" && !r.stale && r.state !== "Closed");
  const counts = rows.reduce<Record<string, number>>((acc, r) => { const key = r.stale ? "stale" : r.status; acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  const worst = counted.reduce<EvidencedRag>((w, r) => (level(r.evidenced) > level(w) ? r.evidenced : w), counted.length ? "Green" : "Grey");
  const latestFinish = counted.map(r => r.forecast.forecastFinishDate).reduce<Date | null>((m, x) => (x && (!m || x > m) ? x : m), null);
  return { worst, latestFinish, counts, excluded: rows.length - counted.length, notConverging: counted.filter(r => !r.converging).length };
}

export function slipTrend(rows: AssuranceRow[]) {
  const today = toDate(TODAY); const points: { label: string; avgSlip: number }[] = [];
  for (let back = 90; back >= 0; back -= 14) {
    const at = new Date(today.getTime() - back * 86400000); const slips: number[] = [];
    for (const r of rows.filter(x => x.state !== "Closed")) { const hist = forecastHistory(r.projectId).filter(h => h.date <= at).at(-1); if (hist?.finish) slips.push(daysBetween(r.forecast.baselineEndDate, hist.finish)); }
    points.push({ label: `${String(at.getDate()).padStart(2, "0")}/${String(at.getMonth() + 1).padStart(2, "0")}`, avgSlip: slips.length ? Math.round(slips.reduce((s, v) => s + v, 0) / slips.length) : 0 });
  }
  return points;
}

export function forecastAccuracy() {
  const closed = getProjects().filter(p => p.state === "Closed");
  const errors: Record<25 | 50 | 75, number[]> = { 25: [], 50: [], 75: [] };
  for (const p of closed) {
    const hist = forecastHistory(p.id); const d = getDelivery(p.id); if (hist.length < 4) continue;
    const actual = lastActivity(d);
    for (const pct of [25, 50, 75] as const) { const point = hist[Math.max(0, Math.round((hist.length * pct) / 100) - 1)]; if (point?.finish) errors[pct].push(Math.abs(daysBetween(actual, point.finish))); }
  }
  const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
  return { projects: closed.length, rows: ([25, 50, 75] as const).map(pct => ({ pct, median: median(errors[pct]), samples: errors[pct].length })) };
}
