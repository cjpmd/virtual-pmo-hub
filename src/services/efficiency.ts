// Efficiency / savings programme (NHS-4; "CIP" in the NHS pack): schemes, monthly values, targets
// and finance validation. Migration 20261123190000_nhs_4_efficiency. The database enforces the
// stage rules (plan and values before fully developed; finance validation and an approved impact
// assessment before delivery), works out each value's financial year and refuses writes while the
// module is off. Record writes go through the shared write helper; validation through the RPCs.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  isConfidence,
  isStage,
  toEfficiencySettings,
  toSummary,
  type EfficiencySummary,
  type GridChange,
  type Confidence,
  type EfficiencySettings,
  type EfficiencyStage,
  type Recurrence,
  type SavingsType,
  type ValueKind,
} from "@/data/efficiency";
import type { NewRow } from "./db";
import { unwrap } from "./service-error";
import { deleteRow, insertRow, updateRow, type Written } from "./write";

type SchemeViewRow = Database["public"]["Views"]["v_efficiency_schemes"]["Row"];
type ValueViewRow = Database["public"]["Views"]["v_efficiency_values"]["Row"];
type TargetRow = Database["public"]["Tables"]["efficiency_targets"]["Row"];

export interface EfficiencyScheme {
  id: string;
  organisationId: string;
  workspaceId: string;
  ref: string;
  title: string;
  description: string;
  businessUnit: string | null;
  category: string | null;
  savingsType: SavingsType;
  recurrence: Recurrence;
  executiveLeadId: string | null;
  executiveLeadName: string | null;
  schemeLeadId: string | null;
  schemeLeadName: string | null;
  financeLeadId: string | null;
  financeLeadName: string | null;
  startMonth: string | null;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  programmeId: string | null;
  programmeName: string | null;
  benefitId: string | null;
  stage: EfficiencyStage;
  confidence: Confidence | null;
  deliveryPlan: string;
  fullYearEffect: number | null;
  stageChangedAt: string | null;
  financeValidatedAt: string | null;
  financeComment: string | null;
  /** This financial year (its starting calendar year) and the scheme's totals in it. */
  financialYear: number;
  planInYear: number;
  planRecurrentInYear: number;
  forecastInYear: number;
  actualInYear: number;
  riskAdjustedInYear: number;
  assessmentId: string | null;
  assessmentStatus: string | null;
  isSample: boolean;
  updatedAt: string;
}

export interface EfficiencyValue {
  id: string;
  schemeId: string;
  month: string;
  kind: ValueKind;
  recurrent: number;
  nonRecurrent: number;
  financialYear: number;
  validatedAt: string | null;
  updatedAt: string;
}

export interface EfficiencyTarget {
  id: string;
  workspaceId: string;
  financialYear: number;
  businessUnit: string | null;
  amount: number;
  note: string | null;
  updatedAt: string;
}

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v));
const SAVINGS: SavingsType[] = ["pay", "non_pay", "income"];
const RECURRENCES: Recurrence[] = ["recurrent", "non_recurrent", "mixed"];
const KINDS: ValueKind[] = ["plan", "forecast", "actual"];

/** A v_efficiency_schemes row as the screens use it. Pure. */
export function toScheme(r: SchemeViewRow): EfficiencyScheme {
  return {
    id: r.id ?? "",
    organisationId: r.organisation_id ?? "",
    workspaceId: r.workspace_id ?? "",
    ref: r.ref ?? "",
    title: r.title ?? "",
    description: r.description ?? "",
    businessUnit: r.business_unit,
    category: r.category,
    savingsType: SAVINGS.includes(r.savings_type as SavingsType)
      ? (r.savings_type as SavingsType)
      : "non_pay",
    recurrence: RECURRENCES.includes(r.recurrence as Recurrence)
      ? (r.recurrence as Recurrence)
      : "recurrent",
    executiveLeadId: r.executive_lead_id,
    executiveLeadName: r.executive_lead_name,
    schemeLeadId: r.scheme_lead_id,
    schemeLeadName: r.scheme_lead_name,
    financeLeadId: r.finance_lead_id,
    financeLeadName: r.finance_lead_name,
    startMonth: r.start_month,
    projectId: r.project_id,
    projectCode: r.project_code,
    projectName: r.project_name,
    programmeId: r.programme_id,
    programmeName: r.programme_name,
    benefitId: r.benefit_id,
    stage: isStage(r.stage) ? r.stage : "idea",
    confidence: isConfidence(r.confidence) ? r.confidence : null,
    deliveryPlan: r.delivery_plan ?? "",
    fullYearEffect: r.full_year_effect == null ? null : Number(r.full_year_effect),
    stageChangedAt: r.stage_changed_at,
    financeValidatedAt: r.finance_validated_at,
    financeComment: r.finance_comment,
    financialYear: r.financial_year ?? 0,
    planInYear: num(r.plan_in_year),
    planRecurrentInYear: num(r.plan_recurrent_in_year),
    forecastInYear: num(r.forecast_in_year),
    actualInYear: num(r.actual_in_year),
    riskAdjustedInYear: num(r.risk_adjusted_in_year),
    assessmentId: r.assessment_id,
    assessmentStatus: r.assessment_status,
    isSample: r.is_sample ?? false,
    updatedAt: r.updated_at ?? "",
  };
}

/** A v_efficiency_values row. Pure. */
export function toValue(r: ValueViewRow): EfficiencyValue {
  return {
    id: r.id ?? "",
    schemeId: r.scheme_id ?? "",
    month: r.month ?? "",
    kind: KINDS.includes(r.kind as ValueKind) ? (r.kind as ValueKind) : "plan",
    recurrent: num(r.recurrent),
    nonRecurrent: num(r.non_recurrent),
    financialYear: r.financial_year ?? 0,
    validatedAt: r.validated_at,
    updatedAt: r.updated_at ?? "",
  };
}

export function toTarget(r: TargetRow): EfficiencyTarget {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    financialYear: r.financial_year,
    businessUnit: r.business_unit,
    amount: num(r.amount),
    note: r.note,
    updatedAt: r.updated_at,
  };
}

export async function listSchemes(orgId: string): Promise<EfficiencyScheme[]> {
  const rows = unwrap(
    await supabase
      .from("v_efficiency_schemes")
      .select("*")
      .eq("organisation_id", orgId)
      .order("ref", { ascending: true }),
    "Couldn't load the schemes",
  );
  return rows.map(toScheme);
}

export async function getScheme(id: string): Promise<EfficiencyScheme | null> {
  const rows = unwrap(
    await supabase.from("v_efficiency_schemes").select("*").eq("id", id).limit(1),
    "Couldn't load the scheme",
  );
  return rows[0] ? toScheme(rows[0]) : null;
}

export async function listSchemeValues(schemeId: string): Promise<EfficiencyValue[]> {
  const rows = unwrap(
    await supabase
      .from("v_efficiency_values")
      .select("*")
      .eq("scheme_id", schemeId)
      .order("month", { ascending: true }),
    "Couldn't load the scheme's values",
  );
  return rows.map(toValue);
}

export async function listTargets(orgId: string): Promise<EfficiencyTarget[]> {
  const rows = unwrap(
    await supabase
      .from("efficiency_targets")
      .select("*")
      .eq("organisation_id", orgId)
      .order("financial_year", { ascending: false }),
    "Couldn't load the targets",
  );
  return rows.map(toTarget);
}

export interface SchemeEdit {
  title?: string;
  description?: string;
  businessUnit?: string | null;
  category?: string | null;
  savingsType?: SavingsType;
  recurrence?: Recurrence;
  executiveLeadId?: string | null;
  schemeLeadId?: string | null;
  financeLeadId?: string | null;
  startMonth?: string | null;
  projectId?: string | null;
  programmeId?: string | null;
  benefitId?: string | null;
  stage?: EfficiencyStage;
  confidence?: Confidence | null;
  deliveryPlan?: string;
  fullYearEffect?: number | null;
}

/** Column values for an edit (only the fields given). Pure. */
export function schemeFields(edit: SchemeEdit) {
  const pick = <K extends keyof SchemeEdit, V>(
    key: K,
    column: string,
    map: (v: SchemeEdit[K]) => V,
  ) => (edit[key] !== undefined ? { [column]: map(edit[key]) } : {});
  return {
    ...pick("title", "title", (v) => v?.trim()),
    ...pick("description", "description", (v) => v?.trim() || null),
    ...pick("businessUnit", "business_unit", (v) => v || null),
    ...pick("category", "category", (v) => v || null),
    ...pick("savingsType", "savings_type", (v) => v),
    ...pick("recurrence", "recurrence", (v) => v),
    ...pick("executiveLeadId", "executive_lead_id", (v) => v || null),
    ...pick("schemeLeadId", "scheme_lead_id", (v) => v || null),
    ...pick("financeLeadId", "finance_lead_id", (v) => v || null),
    ...pick("startMonth", "start_month", (v) => (v ? `${v.slice(0, 7)}-01` : null)),
    ...pick("projectId", "project_id", (v) => v || null),
    ...pick("programmeId", "programme_id", (v) => v || null),
    ...pick("benefitId", "benefit_id", (v) => v || null),
    ...pick("stage", "stage", (v) => v),
    ...pick("confidence", "confidence", (v) => v || null),
    ...pick("deliveryPlan", "delivery_plan", (v) => v?.trim() || null),
    ...pick("fullYearEffect", "full_year_effect", (v) => (v == null ? null : v)),
  };
}

export async function createScheme(
  workspaceId: string,
  edit: SchemeEdit & { title: string },
): Promise<Written> {
  return insertRow(
    "efficiency_schemes",
    // The workspace is the scheme's parent; the tenant guard fills organisation_id from it.
    { workspace_id: workspaceId, ...schemeFields(edit) } as unknown as NewRow<"efficiency_schemes">,
    "Couldn't create the scheme",
  );
}

export async function updateScheme(
  id: string,
  edit: SchemeEdit,
  lastSeen: string,
): Promise<Written> {
  return updateRow("efficiency_schemes", id, schemeFields(edit), {
    context: "Couldn't save the scheme",
    lastSeen,
  });
}

/** What a scheme still needs before it can enter a stage (empty when it can). */
export async function stageCheck(id: string, stage: EfficiencyStage): Promise<string[]> {
  const data = unwrap(
    await supabase.rpc("efficiency_stage_check", { p_id: id, p_stage: stage }),
    "Couldn't check the stage",
  );
  return data ?? [];
}

export async function saveValue(
  schemeId: string,
  month: string,
  kind: ValueKind,
  amounts: { recurrent: number; nonRecurrent: number },
  existing?: { id: string; updatedAt: string },
): Promise<Written> {
  if (existing)
    return updateRow(
      "efficiency_values",
      existing.id,
      { recurrent: amounts.recurrent, non_recurrent: amounts.nonRecurrent },
      { context: "Couldn't save the value", lastSeen: existing.updatedAt },
    );
  return insertRow(
    "efficiency_values",
    {
      scheme_id: schemeId,
      month: `${month.slice(0, 7)}-01`,
      kind,
      recurrent: amounts.recurrent,
      non_recurrent: amounts.nonRecurrent,
    },
    "Couldn't save the value",
  );
}

export async function removeValue(id: string) {
  return deleteRow("efficiency_values", id, "Couldn't remove the value");
}

export async function validateScheme(
  id: string,
  validate: boolean,
  comment?: string,
  lastSeen?: string,
) {
  unwrap(
    await supabase.rpc("validate_efficiency_scheme", {
      p_id: id,
      p_validate: validate,
      ...(comment ? { p_comment: comment } : {}),
      ...(lastSeen ? { p_updated_at: lastSeen } : {}),
    }),
    validate ? "Couldn't validate the scheme" : "Couldn't withdraw the validation",
  );
}

export async function validateActuals(schemeId: string, months?: string[]): Promise<number> {
  return unwrap(
    await supabase.rpc("validate_efficiency_actuals", {
      p_scheme: schemeId,
      ...(months ? { p_months: months } : {}),
    }),
    "Couldn't validate the actuals",
  );
}

export async function saveTarget(
  workspaceId: string,
  input: {
    financialYear: number;
    businessUnit: string | null;
    amount: number;
    note?: string | null;
  },
  existing?: { id: string; updatedAt: string },
): Promise<Written> {
  const fields = {
    financial_year: input.financialYear,
    business_unit: input.businessUnit || null,
    amount: input.amount,
    note: input.note?.trim() || null,
  };
  if (existing)
    return updateRow("efficiency_targets", existing.id, fields, {
      context: "Couldn't save the target",
      lastSeen: existing.updatedAt,
    });
  return insertRow(
    "efficiency_targets",
    { workspace_id: workspaceId, ...fields } as unknown as NewRow<"efficiency_targets">,
    "Couldn't save the target",
  );
}

export async function removeTarget(id: string) {
  return deleteRow("efficiency_targets", id, "Couldn't remove the target");
}

export async function getEfficiencySettings(orgId: string): Promise<EfficiencySettings> {
  const data = unwrap(
    await supabase.rpc("efficiency_settings", { p_org: orgId }),
    "Couldn't load the efficiency settings",
  );
  return toEfficiencySettings(data);
}

/** Admins: the stage rules and confidence weights. */
export async function setEfficiencySettings(
  orgId: string,
  settings: Partial<EfficiencySettings>,
): Promise<EfficiencySettings> {
  const data = unwrap(
    await supabase.rpc("set_efficiency_settings", { p_org: orgId, p_settings: settings }),
    "Couldn't save the efficiency settings",
  );
  return toEfficiencySettings(data);
}

/** The year summary (part 2): totals, months, units with targets, categories and stages. Null for
 *  a caller who isn't a member. `year` is the calendar year the financial year starts in. */
export async function getEfficiencySummary(
  orgId: string,
  year?: number,
  workspaceId?: string,
): Promise<EfficiencySummary | null> {
  const data = unwrap(
    await supabase.rpc("efficiency_summary", {
      p_org: orgId,
      ...(year ? { p_year: year } : {}),
      ...(workspaceId ? { p_workspace: workspaceId } : {}),
    }),
    "Couldn't load the efficiency summary",
  );
  return toSummary(data);
}

/** Saves the phasing grid's changed cells one by one, in order, through the shared write helper
 *  (each keeps its own optimistic-concurrency check). Stops at the first failure and reports how
 *  many were saved before it, so the screen can reload and show what stuck. */
export async function saveGridChanges(
  schemeId: string,
  changes: GridChange[],
): Promise<{ saved: number; error: unknown | null }> {
  let saved = 0;
  for (const change of changes) {
    try {
      await saveValue(
        schemeId,
        change.month,
        change.kind,
        { recurrent: change.recurrent, nonRecurrent: change.nonRecurrent },
        change.existing,
      );
      saved += 1;
    } catch (error) {
      return { saved, error };
    }
  }
  return { saved, error: null };
}

// ---- NHS-4 part 3: options for the scheme form -------------------------------------------------

export interface SchemeOptions {
  people: { id: string; name: string }[];
  /** The 'efficiency_category' list (value stored on the scheme, label shown). */
  categories: { value: string; label: string }[];
  projects: { id: string; workspaceId: string; label: string }[];
  programmes: { id: string; workspaceId: string; label: string }[];
  benefits: { id: string; workspaceId: string; label: string; cashReleasing: boolean }[];
}

/** People, categories and the records a scheme can link to (non-archived projects and
 *  programmes; open benefits). The form filters the links by the scheme's workspace, because the
 *  database's composite keys only accept records in the same workspace. */
export async function loadSchemeOptions(orgId: string): Promise<SchemeOptions> {
  const [people, categories, projects, programmes, benefits] = await Promise.all([
    supabase
      .from("resources")
      .select("id, name")
      .eq("organisation_id", orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("lookup_values")
      .select("value, label, sort_order")
      .eq("organisation_id", orgId)
      .eq("list_key", "efficiency_category")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("projects")
      .select("id, workspace_id, code, name")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("code"),
    supabase
      .from("programmes")
      .select("id, workspace_id, name")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("benefits")
      .select("id, workspace_id, ref, title, classification")
      .eq("organisation_id", orgId)
      .order("ref"),
  ]);
  return {
    people: unwrap(people, "Couldn't load people").map((r) => ({ id: r.id, name: r.name })),
    categories: unwrap(categories, "Couldn't load the categories").map((r) => ({
      value: r.value,
      label: r.label,
    })),
    projects: unwrap(projects, "Couldn't load projects").map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      label: `${r.code} · ${r.name}`,
    })),
    programmes: unwrap(programmes, "Couldn't load programmes").map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      label: r.name,
    })),
    benefits: unwrap(benefits, "Couldn't load benefits").map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      label: r.ref ? `${r.ref} · ${r.title}` : r.title,
      cashReleasing: r.classification === "cash_releasing",
    })),
  };
}
