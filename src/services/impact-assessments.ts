// Impact assessments (NHS-3): quality and equality impact assessments of a project or programme,
// their sign-off and the delivery gate. Migration 20261123140000_nhs_3_impact_assessments.
// The database copies the organisation's template onto each new assessment, works out the
// screening score, decides who may edit and refuses edits while an assessment is awaiting sign-off
// or approved. Status changes go through the RPCs; answers through the shared write helper.
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  isImpact,
  toImpactTemplate,
  type AssessmentAnswers,
  type AssessmentDecision,
  type AssessmentStatus,
  type ImpactTemplate,
} from "@/data/impact-assessment";
import type { SectorPack } from "@/data/sector-packs";
import { forInsert, type Row } from "./db";
import { unwrap, unwrapMaybe } from "./service-error";
import { insertRow, updateRow, type Written } from "./write";

export type ImpactTarget = "project" | "programme";

export interface AssessmentStep {
  stepId: string;
  order: number;
  role: string | null;
  roleLabel: string;
  decision: "approved" | "rejected" | null;
  decidedAt: string | null;
}

export interface ImpactAssessment extends AssessmentAnswers {
  id: string;
  organisationId: string;
  workspaceId: string;
  entityType: ImpactTarget;
  entityId: string;
  title: string;
  summary: string;
  status: AssessmentStatus;
  version: number;
  template: ImpactTemplate;
  templateVersion: number;
  screeningMaxScore: number;
  fullRequired: boolean;
  reviewDate: string | null;
  gateId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  materialChangeAt: string | null;
  materialChangeReason: string | null;
  isSample: boolean;
  updatedAt: string;
}

export interface AssessmentDecisionRecord {
  id: string;
  version: number;
  governanceRole: string | null;
  decision: AssessmentDecision;
  conditions: string | null;
  comment: string | null;
  decidedBy: string | null;
  decidedAt: string;
}

export interface AssessmentRegisterRow {
  id: string;
  entityType: ImpactTarget;
  entityId: string;
  targetName: string;
  projectCode: string | null;
  title: string;
  status: AssessmentStatus;
  version: number;
  fullRequired: boolean;
  screeningMaxScore: number;
  reviewDate: string | null;
  reviewOverdue: boolean;
  negativeDomains: number;
  negativeEquality: number;
  stepsTotal: number;
  stepsApproved: number;
  steps: AssessmentStep[];
  hasConditions: boolean;
  isSample: boolean;
}

export interface AssessmentGap {
  projectId: string;
  code: string;
  name: string;
  phaseName: string;
  assessmentId: string | null;
  status: AssessmentStatus | "missing";
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const STATUSES: AssessmentStatus[] = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "reassessment_required",
];
const toStatus = (value: unknown): AssessmentStatus =>
  STATUSES.includes(value as AssessmentStatus) ? (value as AssessmentStatus) : "draft";
const toTarget = (value: unknown): ImpactTarget =>
  value === "programme" ? "programme" : "project";

/** Stored answers (jsonb keyed by template keys), keeping only well-formed fields. Pure. */
export function toAnswers(row: {
  screening: unknown;
  quality: unknown;
  equality: unknown;
}): AssessmentAnswers {
  const map = <T>(value: unknown, pick: (a: Record<string, unknown>) => T) =>
    Object.fromEntries(
      Object.entries(asObject(value)).map(([key, raw]) => [key, pick(asObject(raw))]),
    ) as Record<string, T>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const impact = (v: unknown) => (isImpact(v) ? v : undefined);
  return {
    screening: map(row.screening, (a) => ({
      impact: impact(a["impact"]),
      consequence: num(a["consequence"]),
      likelihood: num(a["likelihood"]),
      note: str(a["note"]),
    })),
    quality: map(row.quality, (a) => ({
      impact: impact(a["impact"]),
      description: str(a["description"]),
      consequence: num(a["consequence"]),
      likelihood: num(a["likelihood"]),
      mitigations: str(a["mitigations"]),
      indicators: Array.isArray(a["indicators"])
        ? a["indicators"].filter((i): i is string => typeof i === "string")
        : undefined,
    })),
    equality: map(row.equality, (a) => ({
      impact: impact(a["impact"]),
      evidence: str(a["evidence"]),
      mitigation: str(a["mitigation"]),
    })),
  };
}

/**
 * Answers as the form holds them, tidied for saving: text trimmed, blank indicator lines dropped,
 * and only the template's keys kept. Pure.
 */
export function cleanAnswers(
  template: ImpactTemplate,
  answers: AssessmentAnswers,
): AssessmentAnswers {
  const trim = (v: string | undefined) => (v === undefined ? undefined : v.trim() || undefined);
  const keep = <T>(keys: string[], map: Record<string, T>, tidy: (a: T) => T) =>
    Object.fromEntries(keys.filter((k) => map[k]).map((k) => [k, tidy(map[k] as T)]));
  const domainKeys = template.domains.map((d) => d.key);
  return {
    screening: keep(domainKeys, answers.screening, (a) => ({ ...a, note: trim(a.note) })),
    quality: keep(domainKeys, answers.quality, (a) => {
      const indicators = a.indicators?.map((i) => i.trim()).filter(Boolean);
      return {
        ...a,
        description: trim(a.description),
        mitigations: trim(a.mitigations),
        indicators: indicators?.length ? indicators : undefined,
      };
    }),
    equality: keep(
      template.equality.map((d) => d.key),
      answers.equality,
      (a) => ({ ...a, evidence: trim(a.evidence), mitigation: trim(a.mitigation) }),
    ),
  };
}

/** Drops undefined fields so the stored jsonb stays tidy. Pure. */
export function answersToJson(answers: Record<string, object>): Json {
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => [
      key,
      Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== "")),
    ]),
  ) as Json;
}

export function toAssessment(row: Row<"impact_assessments">): ImpactAssessment {
  return {
    id: row.id,
    organisationId: row.organisation_id,
    workspaceId: row.workspace_id,
    entityType: toTarget(row.entity_type),
    entityId: row.entity_id,
    title: row.title,
    summary: row.summary ?? "",
    status: toStatus(row.status),
    version: row.version,
    template: toImpactTemplate(row.template),
    templateVersion: row.template_version,
    screeningMaxScore: row.screening_max_score,
    fullRequired: row.full_required,
    reviewDate: row.review_date,
    gateId: row.gate_id,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    materialChangeAt: row.material_change_at,
    materialChangeReason: row.material_change_reason,
    isSample: row.is_sample,
    updatedAt: row.updated_at,
    ...toAnswers(row),
  };
}

export function toSteps(value: unknown): AssessmentStep[] {
  return (Array.isArray(value) ? value : []).map((raw) => {
    const s = asObject(raw);
    return {
      stepId: String(s["step_id"] ?? ""),
      order: typeof s["order"] === "number" ? s["order"] : 0,
      role: typeof s["role"] === "string" ? s["role"] : null,
      roleLabel: typeof s["role_label"] === "string" ? s["role_label"] : "",
      decision: s["decision"] === "approved" || s["decision"] === "rejected" ? s["decision"] : null,
      decidedAt: typeof s["decided_at"] === "string" ? s["decided_at"] : null,
    };
  });
}

/** The organisation's current template (its own, else the pack default). */
export async function getImpactTemplate(orgId: string, pack: SectorPack): Promise<ImpactTemplate> {
  const data = unwrapMaybe(
    await supabase.rpc("impact_assessment_template", { p_org: orgId }),
    "Couldn't load the impact assessment template",
  );
  return toImpactTemplate(data, pack);
}

export async function getAssessmentFor(
  entityType: ImpactTarget,
  entityId: string,
): Promise<ImpactAssessment | null> {
  const row = unwrapMaybe(
    await supabase
      .from("impact_assessments")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .maybeSingle(),
    "Couldn't load the impact assessment",
  );
  return row ? toAssessment(row) : null;
}

export async function listAssessmentDecisions(
  assessmentId: string,
): Promise<AssessmentDecisionRecord[]> {
  const rows = unwrap(
    await supabase
      .from("impact_assessment_decisions")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("decided_at", { ascending: true }),
    "Couldn't load the sign-off history",
  );
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    governanceRole: r.governance_role,
    decision: r.decision as AssessmentDecision,
    conditions: r.conditions,
    comment: r.comment,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
  }));
}

type RegisterViewRow = Database["public"]["Views"]["v_impact_assessments"]["Row"];

export function toRegisterRow(r: RegisterViewRow): AssessmentRegisterRow {
  return {
    id: r.id ?? "",
    entityType: toTarget(r.entity_type),
    entityId: r.entity_id ?? "",
    targetName: r.target_name ?? "",
    projectCode: r.project_code,
    title: r.title ?? "",
    status: toStatus(r.status),
    version: r.version ?? 0,
    fullRequired: r.full_required ?? false,
    screeningMaxScore: r.screening_max_score ?? 0,
    reviewDate: r.review_date,
    reviewOverdue: r.review_overdue ?? false,
    negativeDomains: r.negative_domains ?? 0,
    negativeEquality: r.negative_equality ?? 0,
    stepsTotal: r.steps_total ?? 0,
    stepsApproved: r.steps_approved ?? 0,
    steps: toSteps(r.steps),
    hasConditions: r.has_conditions ?? false,
    isSample: r.is_sample ?? false,
  };
}

export async function listAssessmentRegister(): Promise<AssessmentRegisterRow[]> {
  const rows = unwrap(
    await supabase.from("v_impact_assessments").select("*").order("updated_at", {
      ascending: false,
    }),
    "Couldn't load the impact assessments",
  );
  return rows.map(toRegisterRow);
}

/** One assessment's register row: its sign-off steps and counts. */
export async function getAssessmentSummary(id: string): Promise<AssessmentRegisterRow | null> {
  const row = unwrapMaybe(
    await supabase.from("v_impact_assessments").select("*").eq("id", id).maybeSingle(),
    "Couldn't load the sign-off steps",
  );
  return row ? toRegisterRow(row) : null;
}

/** Register rows that need attention: awaiting sign-off, re-assessment due or review overdue. Pure. */
export function needsAttention(row: AssessmentRegisterRow): boolean {
  return row.status === "in_review" || row.status === "reassessment_required" || row.reviewOverdue;
}

export type RegisterFilter = "attention" | "all" | AssessmentStatus;

/** Register rows matching a filter chip. Pure. */
export function filterRegister(rows: AssessmentRegisterRow[], filter: RegisterFilter) {
  if (filter === "all") return rows;
  if (filter === "attention") return rows.filter(needsAttention);
  return rows.filter((row) => row.status === filter);
}

/** Steps the person can decide now: awaiting sign-off, undecided, and a role they hold. Pure. */
export function decidableSteps(
  status: AssessmentStatus,
  steps: AssessmentStep[],
  heldRoles: ReadonlySet<string>,
): AssessmentStep[] {
  if (status !== "in_review") return [];
  return steps.filter((s) => s.decision === null && s.role !== null && heldRoles.has(s.role));
}

export async function listAssessmentGaps(orgId: string): Promise<AssessmentGap[]> {
  const rows = unwrap(
    await supabase.rpc("impact_assessment_gaps", { p_org: orgId }),
    "Couldn't load projects missing an assessment",
  );
  return rows.map((r) => ({
    projectId: r.project_id,
    code: r.code,
    name: r.name,
    phaseName: r.phase_name,
    assessmentId: r.assessment_id,
    status: r.status === "missing" ? "missing" : toStatus(r.status),
  }));
}

/** Starts a draft. The database copies the organisation's template onto it. */
export async function startAssessment(
  entityType: ImpactTarget,
  entityId: string,
  title = "",
): Promise<Written> {
  return insertRow(
    "impact_assessments",
    // template is replaced by the database's copy of the organisation's template.
    forInsert<"impact_assessments">({
      entity_type: entityType,
      entity_id: entityId,
      title,
      template: {},
    }),
    "Couldn't start the impact assessment",
  );
}

export interface AssessmentEdit {
  title?: string;
  summary?: string;
  reviewDate?: string | null;
  screening?: AssessmentAnswers["screening"];
  quality?: AssessmentAnswers["quality"];
  equality?: AssessmentAnswers["equality"];
}

export async function saveAssessment(
  id: string,
  edit: AssessmentEdit,
  lastSeen: string,
): Promise<Written> {
  return updateRow(
    "impact_assessments",
    id,
    {
      ...(edit.title !== undefined ? { title: edit.title } : {}),
      ...(edit.summary !== undefined ? { summary: edit.summary || null } : {}),
      ...(edit.reviewDate !== undefined ? { review_date: edit.reviewDate } : {}),
      ...(edit.screening ? { screening: answersToJson(edit.screening) } : {}),
      ...(edit.quality ? { quality: answersToJson(edit.quality) } : {}),
      ...(edit.equality ? { equality: answersToJson(edit.equality) } : {}),
    },
    { context: "Couldn't save the impact assessment", lastSeen },
  );
}

export async function submitAssessment(id: string, lastSeen?: string): Promise<ImpactAssessment> {
  const row = unwrap(
    await supabase.rpc("submit_impact_assessment", {
      p_id: id,
      ...(lastSeen ? { p_updated_at: lastSeen } : {}),
    }),
    "Couldn't submit the impact assessment",
  );
  return toAssessment(row);
}

export async function decideAssessment(
  stepId: string,
  decision: AssessmentDecision,
  comment?: string,
  conditions?: string,
): Promise<ImpactAssessment> {
  const row = unwrap(
    await supabase.rpc("decide_impact_assessment", {
      p_step: stepId,
      p_decision: decision,
      ...(comment ? { p_comment: comment } : {}),
      ...(conditions ? { p_conditions: conditions } : {}),
    }),
    "Couldn't record the decision",
  );
  return toAssessment(row);
}

export async function flagMaterialChange(id: string, reason: string): Promise<ImpactAssessment> {
  const row = unwrap(
    await supabase.rpc("flag_impact_assessment_change", { p_id: id, p_reason: reason }),
    "Couldn't flag the change",
  );
  return toAssessment(row);
}

/** Admins: save the organisation's template (null restores the pack default). */
export async function setImpactTemplate(
  orgId: string,
  template: Omit<ImpactTemplate, "version"> | null,
): Promise<void> {
  unwrapMaybe(
    await supabase.rpc("set_impact_assessment_template", {
      p_org: orgId,
      p_template: template as unknown as Json,
    }),
    "Couldn't save the template",
  );
}

/** Admins: the lifecycle phase projects can't enter without an approved assessment (null = off). */
export async function setImpactGate(orgId: string, phaseId: string | null): Promise<void> {
  unwrapMaybe(
    await supabase.rpc("set_impact_assessment_gate", {
      p_org: orgId,
      // null switches the gate off; the generated type can't express a nullable uuid argument.
      p_phase_id: phaseId as string,
    }),
    "Couldn't save the delivery gate",
  );
}
