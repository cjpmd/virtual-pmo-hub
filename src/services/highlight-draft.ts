import { getProject, getProjectBenefits } from "./pmo";
import { getAssuranceRow } from "./assurance";
import { deliveryStatusLabels } from "./forecast";
import { TODAY, activeSprint, getDelivery, isDone, liveItems, toDate, toIso, unitLabel } from "./sprints";

/** Templated, evidence-grounded highlight report draft. Every claim cites its data point.
 *  Stand-in for the AI drafting service; uses only project data. */
const d8 = (date: Date | null) => (date ? toIso(date).split("-").reverse().join("/") : "none");

export function evidenceDraft(projectId: string) {
  const project = getProject(projectId)!; const d = getDelivery(projectId); const a = getAssuranceRow(projectId); const f = a.forecast; const u = unitLabel(d);
  const since = new Date(toDate(TODAY).getTime() - 14 * 86400000);
  const recent = liveItems(d).filter(i => isDone(d, i) && i.doneAt && toDate(i.doneAt) >= since);
  const sprint = activeSprint(d);
  const openRisks = project.risks.filter(r => r.status === "Open").sort((x, y) => y.score - x.score).slice(0, 3);
  const upcoming = project.milestones.filter(m => !m.actualDate).slice(0, 2);
  const benefits = getProjectBenefits(projectId);
  const exception = a.evidenced === "Red";
  const forecastLine = f.deliveryStatus === "insufficient_evidence" ? "There is not yet enough delivery history to forecast (forecast: fewer than 3 closed periods)." :
    `Delivery status is ${deliveryStatusLabels[f.deliveryStatus].toLowerCase()} (forecast: ${f.converging ? `finish ${d8(f.forecastFinishDate)}, ${f.daysVsBaseline! > 0 ? `${f.daysVsBaseline} days late` : `${Math.abs(f.daysVsBaseline ?? 0)} days early`}` : "not converging"}; gap ${Math.max(0, f.gapUnits)} ${u}; 3-sprint average ${f.velocities.rolling3} ${u}).`;
  const accomplished = [
    `Summary: evidenced RAG is ${a.stale ? "grey (stale evidence)" : a.evidenced} (assurance: declared ${a.declared}).`,
    `Progress this period: ${recent.length} work items completed, ${recent.reduce((s, i) => s + (i.estimateUnits ?? 1), 0)} ${u} (work items: done since ${d8(since)})${recent.length ? `, including ${recent.slice(0, 3).map(i => i.title.toLowerCase()).join(", ")}` : ""}.`,
    `Forecast and delivery status: ${forecastLine}`,
  ].join("\n");
  const planned = [
    sprint ? `Next period: ${sprint.name} goal “${sprint.goal || "not set"}” ends ${d8(toDate(sprint.end))} (sprint: ${sprint.name}).` : "Next period: no active sprint is planned (sprints: none active).",
    upcoming.length ? `Milestones due: ${upcoming.map(m => `${m.title} forecast ${m.forecastDate} (milestone: ${m.status})`).join("; ")}.` : "",
  ].filter(Boolean).join("\n");
  const comments = [
    openRisks.length ? `Key risks and issues: ${openRisks.map(r => `${r.title} (risk: score ${r.score})`).join("; ")}.` : "Key risks and issues: none open (RAID: 0 open risks).",
    f.plausibility === "unrealistic" && f.requiredVelocity ? `Decisions needed: the required velocity of ${f.requiredVelocity} ${u} is above anything achieved (forecast: best ${f.velocities.best}); the board should consider re-baselining or reducing scope.` : "Decisions needed: none identified from the data.",
    `Benefits: ${benefits.length} linked benefits (benefits register: ${benefits.filter(b => b.status === "In realisation" || b.status === "Realised").length} in realisation or realised).`,
    exception ? "EXCEPTION REPORT — options analysis for the PM to complete:\n1. Do nothing: impact on finish date and benefits?\n2. Reduce scope: which items could be removed to converge?\n3. Add capacity: what velocity is needed and at what cost?\n4. Re-baseline: new finish date and approval route?" : "",
  ].filter(Boolean).join("\n");
  return { accomplished, planned, comments, exception };
}
