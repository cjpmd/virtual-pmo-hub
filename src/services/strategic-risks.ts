// Board assurance (NHS-1): the strategic risk register (Board Assurance Framework).
// Migration 20261122170000_nhs_1_board_assurance. The database decides everything: scores, bands,
// appetite and trend come from v_strategic_risks; the matrix and assurance scheme are stamped on
// insert; writes need organisation PMO / admin and the 'assurance' module (RLS). Writes go
// through the shared write helper.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { NewRow, Update } from "./db";
import { unwrap } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

type ViewRow = Database["public"]["Views"]["v_strategic_risks"]["Row"];

export type Trend = "new" | "up" | "down" | "same";
export interface Band {
  key: string;
  label: string;
  colour: string | null;
}
export interface StrategicRiskView {
  id: string;
  ref: string;
  title: string;
  description: string;
  strategicObjectiveId: string | null;
  executiveLeadId: string | null;
  leadForumId: string | null;
  riskMatrixId: string | null;
  riskMatrixName: string;
  riskAppetite: string | null;
  appetiteScore: number | null;
  initial: { likelihood: number | null; consequence: number | null; score: number | null };
  current: { likelihood: number; consequence: number; score: number | null };
  target: { likelihood: number | null; consequence: number | null; score: number | null };
  currentBand: Band | null;
  aboveAppetite: boolean;
  previousScore: number | null;
  trend: Trend;
  keyControls: string;
  assuranceFirstLine: string;
  assuranceSecondLine: string;
  assuranceThirdLine: string;
  gapsInControl: string;
  gapsInAssurance: string;
  ratingSchemeId: string | null;
  assuranceRating: string | null;
  assuranceLabel: string | null;
  assuranceColour: string | null;
  reviewDate: string | null;
  reviewOverdue: boolean;
  status: "open" | "closed";
  isSample: boolean;
  linkedRiskCount: number;
  openActionCount: number;
  overdueActionCount: number;
  updatedAt: string;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const toTrend = (value: string | null): Trend =>
  value === "up" || value === "down" || value === "same" ? value : "new";

export function toBand(value: unknown): Band | null {
  const band = asObject(value);
  if (typeof band["key"] !== "string") return null;
  return {
    key: band["key"],
    label: typeof band["label"] === "string" ? band["label"] : band["key"],
    colour: typeof band["colour"] === "string" ? band["colour"] : null,
  };
}

/** One v_strategic_risks row as the screens use it (pure; unit-tested). */
export function toStrategicRiskView(row: ViewRow): StrategicRiskView {
  return {
    id: row.id ?? "",
    ref: row.ref ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    strategicObjectiveId: row.strategic_objective_id,
    executiveLeadId: row.executive_lead_id,
    leadForumId: row.lead_forum_id,
    riskMatrixId: row.risk_matrix_id,
    riskMatrixName: row.risk_matrix_name ?? "",
    riskAppetite: row.risk_appetite,
    appetiteScore: row.appetite_score,
    initial: {
      likelihood: row.initial_likelihood,
      consequence: row.initial_consequence,
      score: row.initial_score,
    },
    current: {
      likelihood: row.current_likelihood ?? 1,
      consequence: row.current_consequence ?? 1,
      score: row.current_score,
    },
    target: {
      likelihood: row.target_likelihood,
      consequence: row.target_consequence,
      score: row.target_score,
    },
    currentBand: toBand(row.current_band),
    aboveAppetite: row.above_appetite === true,
    previousScore: row.previous_score,
    trend: toTrend(row.trend),
    keyControls: row.key_controls ?? "",
    assuranceFirstLine: row.assurance_first_line ?? "",
    assuranceSecondLine: row.assurance_second_line ?? "",
    assuranceThirdLine: row.assurance_third_line ?? "",
    gapsInControl: row.gaps_in_control ?? "",
    gapsInAssurance: row.gaps_in_assurance ?? "",
    ratingSchemeId: row.rating_scheme_id,
    assuranceRating: row.assurance_rating,
    assuranceLabel: row.assurance_label,
    assuranceColour: row.assurance_colour,
    reviewDate: row.review_date,
    reviewOverdue: row.review_overdue === true,
    status: row.status === "closed" ? "closed" : "open",
    isSample: row.is_sample === true,
    linkedRiskCount: row.linked_risk_count ?? 0,
    openActionCount: row.open_action_count ?? 0,
    overdueActionCount: row.overdue_action_count ?? 0,
    updatedAt: row.updated_at ?? "",
  };
}

/** Words for the trend arrow, so it never relies on the symbol alone. */
export function trendText(trend: Trend, previous: number | null): string {
  if (trend === "new") return "New";
  if (trend === "same") return "No change";
  const word = trend === "up" ? "Up" : "Down";
  return previous === null ? word : `${word} from ${previous}`;
}

export async function listStrategicRisks(orgId: string): Promise<StrategicRiskView[]> {
  const rows = unwrap(
    await supabase.from("v_strategic_risks").select("*").eq("organisation_id", orgId).order("ref"),
    "Loading the strategic risk register",
  );
  return rows.map(toStrategicRiskView);
}

// ---- Edits ----

export interface StrategicRiskInput {
  title: string;
  description: string;
  strategicObjectiveId: string | null;
  executiveLeadId: string | null;
  leadForumId: string | null;
  riskAppetite: string | null;
  appetiteScore: number | null;
  initialLikelihood: number | null;
  initialConsequence: number | null;
  currentLikelihood: number;
  currentConsequence: number;
  targetLikelihood: number | null;
  targetConsequence: number | null;
  keyControls: string;
  assuranceFirstLine: string;
  assuranceSecondLine: string;
  assuranceThirdLine: string;
  gapsInControl: string;
  gapsInAssurance: string;
  assuranceRating: string | null;
  reviewDate: string | null;
  status: "open" | "closed";
}

/** The form's starting values: an existing entry, or a blank one (pure; unit-tested). */
export function inputFromRisk(risk: StrategicRiskView | null): StrategicRiskInput {
  return {
    title: risk?.title ?? "",
    description: risk?.description ?? "",
    strategicObjectiveId: risk?.strategicObjectiveId ?? null,
    executiveLeadId: risk?.executiveLeadId ?? null,
    leadForumId: risk?.leadForumId ?? null,
    riskAppetite: risk?.riskAppetite ?? null,
    appetiteScore: risk?.appetiteScore ?? null,
    initialLikelihood: risk?.initial.likelihood ?? null,
    initialConsequence: risk?.initial.consequence ?? null,
    currentLikelihood: risk?.current.likelihood ?? 3,
    currentConsequence: risk?.current.consequence ?? 3,
    targetLikelihood: risk?.target.likelihood ?? null,
    targetConsequence: risk?.target.consequence ?? null,
    keyControls: risk?.keyControls ?? "",
    assuranceFirstLine: risk?.assuranceFirstLine ?? "",
    assuranceSecondLine: risk?.assuranceSecondLine ?? "",
    assuranceThirdLine: risk?.assuranceThirdLine ?? "",
    gapsInControl: risk?.gapsInControl ?? "",
    gapsInAssurance: risk?.gapsInAssurance ?? "",
    assuranceRating: risk?.assuranceRating ?? null,
    reviewDate: risk?.reviewDate ?? null,
    status: risk?.status ?? "open",
  };
}

const blank = (value: string) => (value.trim() ? value.trim() : null);

/** The column patch for an input (pure; unit-tested). Initial and target go as pairs. */
export function strategicRiskColumns(input: StrategicRiskInput) {
  const pair = (l: number | null, c: number | null) =>
    l !== null && c !== null ? [l, c] : [null, null];
  const [initialL, initialC] = pair(input.initialLikelihood, input.initialConsequence);
  const [targetL, targetC] = pair(input.targetLikelihood, input.targetConsequence);
  return {
    title: input.title.trim(),
    description: blank(input.description),
    strategic_objective_id: input.strategicObjectiveId,
    executive_lead_id: input.executiveLeadId,
    lead_forum_id: input.leadForumId,
    risk_appetite: input.riskAppetite,
    appetite_score: input.appetiteScore,
    initial_likelihood: initialL,
    initial_consequence: initialC,
    current_likelihood: input.currentLikelihood,
    current_consequence: input.currentConsequence,
    target_likelihood: targetL,
    target_consequence: targetC,
    key_controls: blank(input.keyControls),
    assurance_first_line: blank(input.assuranceFirstLine),
    assurance_second_line: blank(input.assuranceSecondLine),
    assurance_third_line: blank(input.assuranceThirdLine),
    gaps_in_control: blank(input.gapsInControl),
    gaps_in_assurance: blank(input.gapsInAssurance),
    assurance_rating: input.assuranceRating,
    review_date: input.reviewDate,
    status: input.status,
  };
}

export function createStrategicRisk(orgId: string, input: StrategicRiskInput) {
  return insertRow(
    "strategic_risks",
    { organisation_id: orgId, ...strategicRiskColumns(input) } as NewRow<"strategic_risks">,
    "Adding the strategic risk",
  );
}

export function updateStrategicRisk(id: string, input: StrategicRiskInput, lastSeen: string) {
  return updateRow(
    "strategic_risks",
    id,
    strategicRiskColumns(input) as Update<"strategic_risks">,
    { context: "Saving the strategic risk", lastSeen },
  );
}

// ---- Reference data for the form ----

export interface MatrixLevel {
  value: number;
  label: string;
}
export interface AssuranceLevel {
  key: string;
  label: string;
  colour: string | null;
}
export interface AssuranceOptions {
  matrices: Array<{
    id: string;
    key: string;
    name: string;
    likelihood: MatrixLevel[];
    consequence: MatrixLevel[];
  }>;
  /** The matrix new entries get (settings.assurance.matrixKey, else the default). */
  defaultMatrixKey: string;
  schemes: Array<{ id: string; key: string; name: string; levels: AssuranceLevel[] }>;
  appetite: Array<{ value: string; label: string }>;
  resources: Array<{ id: string; name: string }>;
  forums: Array<{ id: string; name: string }>;
  objectives: Array<{ id: string; title: string }>;
}

export function toMatrixLevels(value: unknown): MatrixLevel[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => asObject(item))
    .filter((item) => typeof item["value"] === "number")
    .map((item) => ({
      value: item["value"] as number,
      label: typeof item["label"] === "string" ? item["label"] : String(item["value"]),
    }));
}

export function toAssuranceLevels(value: unknown): AssuranceLevel[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => asObject(item))
    .filter((item) => typeof item["key"] === "string" && item["key"] !== "not_reported")
    .map((item) => ({
      key: item["key"] as string,
      label: typeof item["label"] === "string" ? item["label"] : (item["key"] as string),
      colour: typeof item["colour"] === "string" ? item["colour"] : null,
    }));
}

export async function loadAssuranceOptions(orgId: string): Promise<AssuranceOptions> {
  const [matrices, schemes, appetite, resources, forums, objectives, org] = await Promise.all([
    supabase
      .from("risk_matrices")
      .select("id, key, name, likelihood_levels, consequence_levels, is_default, organisation_id"),
    supabase
      .from("rating_schemes")
      .select("id, key, name, levels, organisation_id")
      .eq("is_assurance", true),
    supabase
      .from("lookup_values")
      .select("value, label, sort_order")
      .eq("organisation_id", orgId)
      .eq("list_key", "risk_appetite")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("resources")
      .select("id, name")
      .eq("organisation_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("forums")
      .select("id, name")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("strategic_objectives")
      .select("id, title")
      .eq("organisation_id", orgId)
      .order("title"),
    supabase.from("organisations").select("settings").eq("id", orgId).maybeSingle(),
  ]);
  const matrixRows = unwrap(matrices, "Loading risk matrices");
  const settings = asObject(asObject(org.data?.settings)["assurance"]);
  const systemDefault = matrixRows.find((m) => m.is_default)?.key ?? "default";
  return {
    matrices: matrixRows.map((m) => ({
      id: m.id,
      key: m.key,
      name: m.name,
      likelihood: toMatrixLevels(m.likelihood_levels),
      consequence: toMatrixLevels(m.consequence_levels),
    })),
    defaultMatrixKey:
      typeof settings["matrixKey"] === "string" && settings["matrixKey"]
        ? settings["matrixKey"]
        : systemDefault,
    schemes: unwrap(schemes, "Loading assurance ratings").map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      levels: toAssuranceLevels(s.levels),
    })),
    appetite: unwrap(appetite, "Loading risk appetite levels"),
    resources: unwrap(resources, "Loading people"),
    forums: unwrap(forums, "Loading boards and committees"),
    objectives: unwrap(objectives, "Loading strategic objectives"),
  };
}

// ---- Actions ----

export type ActionStatus = "not_started" | "in_progress" | "complete" | "cancelled";
export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  cancelled: "Cancelled",
};
export interface StrategicRiskAction {
  id: string;
  title: string;
  ownerId: string | null;
  dueDate: string | null;
  status: ActionStatus;
  updatedAt: string;
}

export async function listStrategicRiskActions(riskId: string): Promise<StrategicRiskAction[]> {
  const rows = unwrap(
    await supabase
      .from("strategic_risk_actions")
      .select("id, title, owner_id, due_date, status, updated_at")
      .eq("strategic_risk_id", riskId)
      .order("created_at"),
    "Loading actions",
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    dueDate: row.due_date,
    status: row.status as ActionStatus,
    updatedAt: row.updated_at,
  }));
}

export function addStrategicRiskAction(
  orgId: string,
  riskId: string,
  input: { title: string; ownerId: string | null; dueDate: string | null },
) {
  return insertRow(
    "strategic_risk_actions",
    {
      organisation_id: orgId,
      strategic_risk_id: riskId,
      title: input.title.trim(),
      owner_id: input.ownerId,
      due_date: input.dueDate,
    } as NewRow<"strategic_risk_actions">,
    "Adding the action",
  );
}

export function setStrategicRiskActionStatus(action: StrategicRiskAction, status: ActionStatus) {
  return updateRow(
    "strategic_risk_actions",
    action.id,
    { status },
    { context: "Updating the action", lastSeen: action.updatedAt },
  );
}

export function removeStrategicRiskAction(id: string) {
  return deleteRows("strategic_risk_actions", [id], "Removing the action");
}

// ---- Score history ----

export interface ScorePoint {
  recordedAt: string;
  score: number | null;
  likelihood: number;
  consequence: number;
}

export async function listStrategicRiskScores(riskId: string): Promise<ScorePoint[]> {
  const rows = unwrap(
    await supabase
      .from("strategic_risk_scores")
      .select("recorded_at, score, likelihood, consequence")
      .eq("strategic_risk_id", riskId)
      .order("recorded_at", { ascending: false })
      .limit(24),
    "Loading the score history",
  );
  return rows.map((row) => ({
    recordedAt: row.recorded_at,
    score: row.score,
    likelihood: row.likelihood,
    consequence: row.consequence,
  }));
}

// ---- Linked programme and project risks (record_links, link_type contributes_to_baf) ----

export interface LinkedRisk {
  linkId: string;
  riskId: string;
  ref: string;
  title: string;
  score: number;
  status: string;
}

export async function listLinkedRisks(strategicRiskId: string): Promise<LinkedRisk[]> {
  const links = unwrap(
    await supabase
      .from("record_links")
      .select("id, from_id")
      .eq("to_type", "strategic_risk")
      .eq("to_id", strategicRiskId)
      .eq("link_type", "contributes_to_baf"),
    "Loading linked risks",
  );
  if (!links.length) return [];
  const risks = unwrap(
    await supabase
      .from("risks")
      .select("id, ref, title, score, status")
      .in(
        "id",
        links.map((link) => link.from_id),
      ),
    "Loading linked risks",
  );
  return links
    .map((link) => {
      const risk = risks.find((item) => item.id === link.from_id);
      return risk
        ? {
            linkId: link.id,
            riskId: risk.id,
            ref: risk.ref,
            title: risk.title,
            score: risk.score ?? 0,
            status: risk.status as string,
          }
        : null;
    })
    .filter((item): item is LinkedRisk => item !== null)
    .sort((a, b) => a.ref.localeCompare(b.ref, "en-GB", { numeric: true }));
}

/** Open programme and project risks the user can see, for the link picker. */
export async function listLinkableRisks(orgId: string) {
  return unwrap(
    await supabase
      .from("risks")
      .select("id, ref, title, workspace_id, organisation_id")
      .eq("organisation_id", orgId)
      .eq("status", "open")
      .order("ref"),
    "Loading risks",
  );
}

export function linkRiskToStrategicRisk(
  risk: { id: string; workspace_id: string; organisation_id: string },
  strategicRiskId: string,
) {
  return insertRow(
    "record_links",
    {
      organisation_id: risk.organisation_id,
      workspace_id: risk.workspace_id,
      from_type: "risk",
      from_id: risk.id,
      to_type: "strategic_risk",
      to_id: strategicRiskId,
      link_type: "contributes_to_baf",
    } as NewRow<"record_links">,
    "Linking the risk",
  );
}

export function unlinkRisk(linkId: string) {
  return deleteRows("record_links", [linkId], "Unlinking the risk");
}
