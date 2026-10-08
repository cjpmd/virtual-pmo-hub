import { todayIso } from "@/lib/today";
import { divergenceText, type AssuranceRow } from "./assurance";

/** Templated, evidence-grounded highlight report draft. Every claim cites its data point.
 *  Stand-in for the AI drafting service; uses only project data from the database (no sprint
 *  figures: sprints are not stored yet). */
const d8 = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "none");

export interface DraftEvidence {
  /** Assurance row for the project (declared vs evidenced RAG and the milestone forecast). */
  assurance: AssuranceRow;
  openRisks: { title: string; score: number }[];
  /** Milestones not yet achieved, soonest first. */
  milestones: { title: string; forecastDate: string; status: string }[];
  benefits: { total: number; realising: number };
}

export function evidenceDraft(evidence: DraftEvidence) {
  const a = evidence.assurance;
  const openRisks = [...evidence.openRisks].sort((x, y) => y.score - x.score).slice(0, 3);
  const upcoming = evidence.milestones.slice(0, 2);
  const exception = a.evidenced === "Off Track";
  const slip = a.finishVsBaselineDays;
  const forecastLine = a.forecastFinishDate
    ? `Forecast finish ${d8(a.forecastFinishDate)}${
        slip === null
          ? ""
          : slip > 0
            ? `, ${slip} days after the baseline finish`
            : slip < 0
              ? `, ${-slip} days before the baseline finish`
              : ", on the baseline finish"
      } (forecast: latest milestone forecast).`
    : "No forecast finish yet (forecast: no milestones).";
  const accomplished = [
    `Summary: evidenced health is ${a.evidenced} (assurance: ${a.declared ? `last report declared ${a.declared}` : "no report submitted yet"}).`,
    a.divergent ? `Assurance: ${divergenceText(a)} (assurance: as at ${d8(todayIso())}).` : "",
    `Forecast: ${forecastLine}`,
  ]
    .filter(Boolean)
    .join("\n");
  const planned = [
    upcoming.length
      ? `Next period: ${upcoming.map((m) => `${m.title} forecast ${m.forecastDate.split("-").reverse().join("/")} (milestone: ${m.status})`).join("; ")}.`
      : "Next period: no milestones are due (milestones: none open).",
  ].join("\n");
  const comments = [
    openRisks.length
      ? `Key risks and issues: ${openRisks.map((r) => `${r.title} (risk: score ${r.score})`).join("; ")}.`
      : "Key risks and issues: none open (RAID: 0 open risks).",
    slip !== null && slip > 0 && exception
      ? `Decisions needed: the forecast finish is ${slip} days after the baseline (forecast: latest milestone forecast); the board should consider re-baselining or reducing scope.`
      : "Decisions needed: none identified from the data.",
    `Benefits: ${evidence.benefits.total} linked benefits (benefits register: ${evidence.benefits.realising} in realisation or realised).`,
    exception
      ? "EXCEPTION REPORT — options analysis for the PM to complete:\n1. Do nothing: impact on finish date and benefits?\n2. Reduce scope: which items could be removed to recover the finish?\n3. Add capacity: what extra resource is needed and at what cost?\n4. Re-baseline: new finish date and approval route?"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { accomplished, planned, comments, exception };
}
