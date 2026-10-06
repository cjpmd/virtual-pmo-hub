// Delivery assurance: the declared RAG (latest submitted status report, else the computed
// health from v_project_health) against the RAG evidenced by the delivery forecast. Project
// facts come from Supabase; the forecast runs on the browser-local sprint data (sprints.ts),
// which is keyed by project code until the sprints phase.
import type { Health } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { listPeople, listProjects } from "./hierarchy";
import { toHealth, type ProjectStateLabel } from "./labels";
import { unwrap } from "./service-error";
import { daysBetween, getProjectForecast, type DeliveryStatus, type EvidencedRag, type ForecastResult } from "./forecast";
import { TODAY, forecastHistory, forecastInputFor, getDelivery, isStale, lastActivity, registerDeliveryProjects, toDate } from "./sprints";

export interface AssuranceProject { id: string; code: string; name: string; programme: string; state: ProjectStateLabel; declared: Health }

/** Projects with their declared RAG; also registers them with the sprint store. */
export async function loadAssuranceProjects(orgId: string): Promise<AssuranceProject[]> {
  const [projects, reports, sources, people] = await Promise.all([
    listProjects(orgId),
    supabase.from("status_reports").select("project_id, overall, reporting_date").eq("organisation_id", orgId).order("reporting_date", { ascending: false }),
    supabase.from("projects").select("id, task_source").eq("organisation_id", orgId),
    listPeople(orgId),
  ]);
  const latest = new Map<string, Health>();
  for (const row of unwrap(reports, "Loading status reports")) if (!latest.has(row.project_id)) latest.set(row.project_id, toHealth(row.overall));
  const source = new Map(unwrap(sources, "Loading projects").map(row => [row.id, row.task_source]));
  const names = people.map(person => person.name);
  registerDeliveryProjects(projects.map(project => ({ code: project.code, state: project.state, manager: project.managerName, taskSource: source.get(project.id) === "native" ? "Native" : "Planner", people: names })));
  return projects.map(project => ({ id: project.id, code: project.code, name: project.name, programme: project.programmeId ? project.programmeName : "Direct", state: project.state, declared: latest.get(project.id) ?? project.health.overall }));
}

const level = (r: EvidencedRag) => (r === "Green" ? 0 : r === "Amber" ? 1 : r === "Red" ? 2 : -1);
const healthRag = (h: Health): EvidencedRag => (h === "On Track" ? "Green" : h === "At Risk" ? "Amber" : h === "Off Track" ? "Red" : "Grey");

export interface AssuranceRow {
  projectId: string; code: string; name: string; programme: string; state: string; declared: Health; evidenced: EvidencedRag; stale: boolean; status: DeliveryStatus;
  forecast: ForecastResult; daysVsBaseline: number | null; gap: number; converging: boolean; lastUpdateDays: number;
  divergent: boolean; divergenceAlert: boolean; divergenceDays: number; justification?: string | undefined; riskScore: number;
}

export function getAssuranceRow(project: AssuranceProject): AssuranceRow {
  const d = getDelivery(project.code);
  const f = getProjectForecast(forecastInputFor(d));
  const declared = project.declared;
  const stale = project.state !== "Closed" && isStale(d);
  const evidenced: EvidencedRag = stale ? "Grey" : f.evidencedRag;
  const divergent = level(evidenced) > level(healthRag(declared)) && level(evidenced) >= 0 && level(healthRag(declared)) >= 0;
  // consecutive most-recent forecast points where evidence was worse than declared
  let cycles = 0, since: Date | null = null;
  for (const point of forecastHistory(project.code).reverse()) { if (level(point.rag) > level(healthRag(declared))) { cycles++; since = point.date; } else break; }
  const divergenceDays = since ? daysBetween(since, toDate(TODAY)) : 0;
  const divergenceAlert = divergent && (cycles >= 2 || divergenceDays >= 14);
  const lastUpdateDays = daysBetween(lastActivity(d), toDate(TODAY));
  const slip = Math.max(0, f.daysVsBaseline ?? 60);
  const riskScore = Math.round((divergenceAlert ? 40 : divergent ? 15 : 0) + Math.min(30, slip / 3) + (stale ? 20 : 0) + (!f.converging && f.deliveryStatus !== "insufficient_evidence" ? 15 : 0));
  return { projectId: project.id, code: project.code, name: project.name, programme: project.programme, state: project.state, declared, evidenced, stale, status: f.deliveryStatus,
    forecast: f, daysVsBaseline: f.daysVsBaseline, gap: f.gapUnits, converging: f.converging, lastUpdateDays, divergent, divergenceAlert, divergenceDays, justification: d.justifications[0]?.text, riskScore };
}

export function getAssuranceRows(projects: AssuranceProject[]) { return projects.filter(p => p.state !== "Proposed").map(getAssuranceRow).sort((a, b) => b.riskScore - a.riskScore); }

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
    for (const r of rows.filter(x => x.state !== "Closed")) { const hist = forecastHistory(r.code).filter(h => h.date <= at).at(-1); if (hist?.finish) slips.push(daysBetween(r.forecast.baselineEndDate, hist.finish)); }
    points.push({ label: `${String(at.getDate()).padStart(2, "0")}/${String(at.getMonth() + 1).padStart(2, "0")}`, avgSlip: slips.length ? Math.round(slips.reduce((s, v) => s + v, 0) / slips.length) : 0 });
  }
  return points;
}

export function forecastAccuracy(projects: AssuranceProject[]) {
  const closed = projects.filter(p => p.state === "Closed");
  const errors: Record<25 | 50 | 75, number[]> = { 25: [], 50: [], 75: [] };
  for (const p of closed) {
    const hist = forecastHistory(p.code); const d = getDelivery(p.code); if (hist.length < 4) continue;
    const actual = lastActivity(d);
    for (const pct of [25, 50, 75] as const) { const point = hist[Math.max(0, Math.round((hist.length * pct) / 100) - 1)]; if (point?.finish) errors[pct].push(Math.abs(daysBetween(actual, point.finish))); }
  }
  const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2); };
  return { projects: closed.length, rows: ([25, 50, 75] as const).map(pct => ({ pct, median: median(errors[pct]), samples: errors[pct].length })) };
}
