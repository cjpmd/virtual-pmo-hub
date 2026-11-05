// Diff engine (spec §10.2): what changed since the previous published pack. Input is the
// changes_since_last block data (previous and current metrics per project, as stored by
// publish_report); output is the change list and the per-project movement markers.
import type { ProjectMovement } from "../blocks/types";
import { plural } from "@/lib/plural";

export interface ProjectDelta {
  id: string;
  code: string;
  name: string;
  prev: Record<string, unknown> | null;
  curr: Record<string, unknown> | null;
  prev_included: boolean;
  curr_included: boolean;
}

export interface ChangesData {
  previous: { id: string; title: string; as_at: string; published_at: string } | null;
  projects?: ProjectDelta[];
  decisions_made?: number;
  actions_closed?: number;
  actions_overdue?: number;
}

export type ChangeKind =
  | "rating_worse"
  | "rating_better"
  | "declared_changed"
  | "entered_exceptions"
  | "left_exceptions"
  | "slip_increased"
  | "slip_reduced"
  | "budget_moved"
  | "top_band_risks_up"
  | "top_band_risks_down"
  | "new_project";

export interface Change {
  projectId: string;
  code: string;
  name: string;
  kind: ChangeKind;
  from: unknown;
  to: unknown;
  text: string;
}

export interface DiffOptions {
  /** Slip changes smaller than this are noise (spec: over 7 days). */
  slipDays?: number;
  /** Forecast movements smaller than this are not listed (money). */
  budgetAmount?: number;
}

const RANK: Record<string, number> = { green: 1, amber: 2, red: 3 };
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : null);

export function diffProjects(
  data: ChangesData,
  options: DiffOptions = {},
  label: (rating: string | null) => string = (r) => r ?? "not set",
  money: (n: number) => string = (n) => String(n),
): Change[] {
  const slip = options.slipDays ?? 7;
  const budget = options.budgetAmount ?? 0;
  const changes: Change[] = [];
  for (const p of data.projects ?? []) {
    const base = { projectId: p.id, code: p.code, name: p.name };
    if (!p.prev) {
      changes.push({
        ...base,
        kind: "new_project",
        from: null,
        to: null,
        text: "New in scope since the last pack",
      });
      continue;
    }
    if (!p.curr) continue;
    const ePrev = str(p.prev["evidenced_rating"]);
    const eCurr = str(p.curr["evidenced_rating"]);
    const a = ePrev ? RANK[ePrev] : undefined;
    const b = eCurr ? RANK[eCurr] : undefined;
    if (a !== undefined && b !== undefined && a !== b)
      changes.push({
        ...base,
        kind: b > a ? "rating_worse" : "rating_better",
        from: ePrev,
        to: eCurr,
        text: `Evidenced ${label(ePrev)} → ${label(eCurr)}`,
      });
    const dPrev = str(p.prev["declared_rating"]);
    const dCurr = str(p.curr["declared_rating"]);
    if (dPrev !== dCurr && dPrev && dCurr)
      changes.push({
        ...base,
        kind: "declared_changed",
        from: dPrev,
        to: dCurr,
        text: `Declared ${label(dPrev)} → ${label(dCurr)}`,
      });
    if (p.prev_included !== p.curr_included)
      changes.push({
        ...base,
        kind: p.curr_included ? "entered_exceptions" : "left_exceptions",
        from: p.prev_included,
        to: p.curr_included,
        text: p.curr_included ? "Now reported by exception" : "No longer an exception",
      });
    const sPrev = num(p.prev["max_milestone_slip_days"]) ?? 0;
    const sCurr = num(p.curr["max_milestone_slip_days"]) ?? 0;
    if (Math.abs(sCurr - sPrev) > slip)
      changes.push({
        ...base,
        kind: sCurr > sPrev ? "slip_increased" : "slip_reduced",
        from: sPrev,
        to: sCurr,
        text: `Largest slip ${sPrev} → ${plural(sCurr, "day")}`,
      });
    const bPrev = num(p.prev["eac"]);
    const bCurr = num(p.curr["eac"]);
    if (bPrev !== null && bCurr !== null && bPrev !== bCurr && Math.abs(bCurr - bPrev) > budget)
      changes.push({
        ...base,
        kind: "budget_moved",
        from: bPrev,
        to: bCurr,
        text: `Forecast at completion ${bCurr > bPrev ? "up" : "down"} ${money(Math.abs(bCurr - bPrev))}`,
      });
    const rPrev = num(p.prev["risks_in_top_band"]) ?? 0;
    const rCurr = num(p.curr["risks_in_top_band"]) ?? 0;
    if (rPrev !== rCurr)
      changes.push({
        ...base,
        kind: rCurr > rPrev ? "top_band_risks_up" : "top_band_risks_down",
        from: rPrev,
        to: rCurr,
        text: `Risks in the top band ${rPrev} → ${rCurr}`,
      });
  }
  return changes;
}

/** Per-project markers for ratings and figures that moved (▲▼ in grids and deep-dives). */
export function toMovement(data: ChangesData | null | undefined): Record<string, ProjectMovement> {
  const out: Record<string, ProjectMovement> = {};
  for (const p of data?.projects ?? []) {
    if (!p.prev || !p.curr) continue;
    const m: ProjectMovement = {};
    const ePrev = str(p.prev["evidenced_rating"]);
    const eCurr = str(p.curr["evidenced_rating"]);
    if (ePrev !== eCurr) m.evidenced = { from: ePrev, to: eCurr };
    const dPrev = str(p.prev["declared_rating"]);
    const dCurr = str(p.curr["declared_rating"]);
    if (dPrev !== dCurr) m.declared = { from: dPrev, to: dCurr };
    const bPrev = num(p.prev["eac"]);
    const bCurr = num(p.curr["eac"]);
    if (bPrev !== null && bCurr !== null && bPrev !== bCurr) m.eacChange = bCurr - bPrev;
    const sPrev = num(p.prev["max_milestone_slip_days"]);
    const sCurr = num(p.curr["max_milestone_slip_days"]);
    if (sPrev !== null && sCurr !== null && sPrev !== sCurr) m.slipChange = sCurr - sPrev;
    if (Object.keys(m).length) out[p.id] = m;
  }
  return out;
}

/** " 1 decision made, 2 actions closed, 1 action overdue." (whichever counts the data has). */
export function sinceCounts(
  data: Pick<ChangesData, "decisions_made" | "actions_closed" | "actions_overdue">,
) {
  const parts = [
    data.decisions_made !== undefined &&
      plural(data.decisions_made, "decision made", "decisions made"),
    data.actions_closed !== undefined &&
      plural(data.actions_closed, "action closed", "actions closed"),
    data.actions_overdue !== undefined &&
      plural(data.actions_overdue, "action overdue", "actions overdue"),
  ].filter(Boolean);
  return parts.length ? ` ${parts.join(", ")}.` : "";
}
