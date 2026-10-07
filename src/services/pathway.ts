// Benefits pathway (docs/benefits-pathway.md): capabilities, outcomes and their indicators,
// read from and written to Supabase.
//
// One load returns what the Pathway screens use. RAG and reasons come from the views
// (v_capability_health, v_outcome_health, v_outcome_indicator_health, v_benefit_readiness);
// nothing here recomputes them. Rules the database enforces (who may accept, stored evidence,
// PMO-only achieved / validation, realisation start) are only mirrored here to disable buttons
// and explain why; the triggers have the last word.
import type { Health } from "@/data/types";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { listPeople, type Person } from "./hierarchy";
import { toHealth } from "./labels";
import { fromPostgrest, ServiceError, unwrap } from "./service-error";
import { deleteRows, deleteWhere, insertRow, insertRows, updateRow } from "./write";

type Enums = Database["public"]["Enums"];
export type CapabilityStatus = Enums["capability_status"];
export type OutcomeStatus = Enums["outcome_status"];
export type MeasurementStatus = Enums["measurement_status"];
export type Frequency = Enums["measure_frequency"];

export const capabilityStatusLabel: Record<CapabilityStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  delivered: "Delivered",
  accepted: "Accepted",
};
export const outcomeStatusLabel: Record<OutcomeStatus, string> = {
  planned: "Planned",
  emerging: "Emerging",
  achieved: "Achieved",
  not_achieved: "Not achieved",
};

/** The documents bucket's limits (migration 20261007083935). */
export const EVIDENCE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
};
export const EVIDENCE_MAX_BYTES = 25 * 1024 * 1024;

export interface PathwayDocument {
  id: string;
  fileName: string;
  version: number;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
  archivedAt: string | null;
}

export interface PathwayCapability {
  id: string;
  workspaceId: string;
  programmeId: string;
  title: string;
  description: string;
  ownerId: string | null;
  status: CapabilityStatus;
  targetDate: string | null;
  forecastDate: string | null;
  deliveredDate: string | null;
  acceptedAt: string | null;
  acceptedById: string | null;
  acceptanceNote: string;
  updatedAt: string;
  projectIds: string[];
  rag: Health;
  reason: string;
  slipDays: number | null;
  awaitingAcceptancePastTarget: boolean;
  history: Array<{ reportingDate: string; forecastDate: string }>;
  documents: PathwayDocument[];
}

export interface IndicatorMeasurement {
  id: string;
  indicatorId: string;
  measuredOn: string;
  actualValue: number;
  evidence: string;
  notes: string;
  status: MeasurementStatus;
  submittedById: string | null;
  submittedDate: string | null;
  validatedById: string | null;
  validatedDate: string | null;
  queryNote: string | null;
  updatedAt: string;
}

export interface PathwayIndicator {
  id: string;
  outcomeId: string;
  name: string;
  unit: string;
  baselineValue: number;
  baselineDate: string;
  targetValue: number;
  targetDate: string;
  frequency: Frequency;
  nextDueDate: string | null;
  dataSource: string;
  updatedAt: string;
  rag: Health;
  reason: string;
  /** Where the straight line from baseline to target says the counted measurement should be. */
  expectedValue: number | null;
  shortfallPercent: number | null;
  countedMeasurementId: string | null;
  measurements: IndicatorMeasurement[];
}

export interface PathwayOutcome {
  id: string;
  workspaceId: string;
  programmeId: string;
  title: string;
  description: string;
  ownerId: string | null;
  status: OutcomeStatus;
  targetDate: string | null;
  achievedDate: string | null;
  updatedAt: string;
  capabilityIds: string[];
  benefitIds: string[];
  rag: Health;
  reason: string;
  indicatorDriven: boolean;
  indicators: PathwayIndicator[];
}

export interface PathwayBenefit {
  id: string;
  ref: string;
  title: string;
  programmeId: string | null;
  workspaceId: string;
  status: Enums["benefit_status"];
  realisationStartDate: string | null;
  updatedAt: string;
  phase: "readiness" | "realisation";
  rag: Health;
  reason: string;
  hasPathway: boolean;
  needsRealisationStart: boolean;
}

export interface PathwayData {
  capabilities: PathwayCapability[];
  outcomes: PathwayOutcome[];
  /** Benefits that aren't closed (v_benefit_readiness leaves closed ones out). */
  benefits: PathwayBenefit[];
  projects: Array<{
    id: string;
    code: string;
    name: string;
    programmeId: string | null;
    state: Enums["project_state"];
  }>;
  programmes: Array<{ id: string; name: string; workspaceId: string }>;
  people: Person[];
}

const num = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : Number(value);

export async function loadPathway(orgId: string): Promise<PathwayData> {
  const [
    capabilities,
    capabilityHealth,
    history,
    documents,
    outcomes,
    outcomeHealth,
    indicators,
    indicatorHealth,
    measurements,
    readiness,
    benefits,
    projects,
    programmes,
    people,
  ] = await Promise.all([
    supabase
      .from("capabilities")
      .select(
        "id, workspace_id, programme_id, title, description, owner_id, status, target_date, forecast_date, delivered_date, accepted_at, accepted_by_id, acceptance_note, updated_at, capability_projects(project_id)",
      )
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("title"),
    supabase
      .from("v_capability_health")
      .select("capability_id, rag, reason, slip_days, awaiting_acceptance_past_target")
      .eq("organisation_id", orgId),
    supabase
      .from("capability_forecast_history")
      .select("capability_id, reporting_date, forecast_date")
      .eq("organisation_id", orgId)
      .order("reporting_date"),
    supabase
      .from("documents")
      .select(
        "id, capability_id, file_name, version, size_bytes, storage_path, created_at, archived_at",
      )
      .eq("organisation_id", orgId)
      .eq("scope", "capability")
      .order("created_at"),
    supabase
      .from("outcomes")
      .select(
        "id, workspace_id, programme_id, title, description, owner_id, status, target_date, achieved_date, updated_at, outcome_capabilities(capability_id), outcome_benefits(benefit_id)",
      )
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("title"),
    supabase
      .from("v_outcome_health")
      .select("outcome_id, rag, reason, indicator_driven")
      .eq("organisation_id", orgId),
    supabase
      .from("outcome_indicators")
      .select(
        "id, outcome_id, name, unit, baseline_value, baseline_date, target_value, target_date, frequency, next_due_date, data_source, sort_order, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("sort_order"),
    supabase
      .from("v_outcome_indicator_health")
      .select("indicator_id, rag, reason, expected_value, shortfall_percent, measurement_id")
      .eq("organisation_id", orgId),
    supabase
      .from("outcome_indicator_measurements")
      .select(
        "id, indicator_id, measured_on, actual_value, evidence, notes, status, submitted_by_id, submitted_date, validated_by_id, validated_date, query_note, updated_at",
      )
      .eq("organisation_id", orgId)
      .order("measured_on", { ascending: false }),
    supabase
      .from("v_benefit_readiness")
      .select("benefit_id, phase, rag, reason, has_pathway, needs_realisation_start")
      .eq("organisation_id", orgId),
    supabase
      .from("benefits")
      .select(
        "id, ref, title, programme_id, workspace_id, status, realisation_start_date, updated_at",
      )
      .eq("organisation_id", orgId)
      .neq("status", "closed")
      .order("ref"),
    supabase
      .from("v_projects")
      .select("id, code, name, programme_id, state")
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("programmes")
      .select("id, name, workspace_id")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    listPeople(orgId),
  ]);

  const capHealth = new Map(
    unwrap(capabilityHealth, "Loading capability health").map((row) => [row.capability_id, row]),
  );
  const historyBy = new Map<string, PathwayCapability["history"]>();
  for (const row of unwrap(history, "Loading forecast history")) {
    const list = historyBy.get(row.capability_id) ?? [];
    list.push({ reportingDate: row.reporting_date, forecastDate: row.forecast_date });
    historyBy.set(row.capability_id, list);
  }
  const documentsBy = new Map<string, PathwayDocument[]>();
  for (const row of unwrap(documents, "Loading evidence")) {
    if (!row.capability_id) continue;
    const list = documentsBy.get(row.capability_id) ?? [];
    list.push({
      id: row.id,
      fileName: row.file_name,
      version: row.version,
      sizeBytes: Number(row.size_bytes),
      storagePath: row.storage_path,
      createdAt: row.created_at,
      archivedAt: row.archived_at,
    });
    documentsBy.set(row.capability_id, list);
  }
  const outHealth = new Map(
    unwrap(outcomeHealth, "Loading outcome health").map((row) => [row.outcome_id, row]),
  );
  const indHealth = new Map(
    unwrap(indicatorHealth, "Loading indicator health").map((row) => [row.indicator_id, row]),
  );
  const measurementsBy = new Map<string, IndicatorMeasurement[]>();
  for (const row of unwrap(measurements, "Loading indicator measurements")) {
    const list = measurementsBy.get(row.indicator_id) ?? [];
    list.push({
      id: row.id,
      indicatorId: row.indicator_id,
      measuredOn: row.measured_on,
      actualValue: Number(row.actual_value),
      evidence: row.evidence ?? "",
      notes: row.notes ?? "",
      status: row.status,
      submittedById: row.submitted_by_id,
      submittedDate: row.submitted_date,
      validatedById: row.validated_by_id,
      validatedDate: row.validated_date,
      queryNote: row.query_note,
      updatedAt: row.updated_at,
    });
    measurementsBy.set(row.indicator_id, list);
  }
  const indicatorsBy = new Map<string, PathwayIndicator[]>();
  for (const row of unwrap(indicators, "Loading indicators")) {
    const h = indHealth.get(row.id);
    const list = indicatorsBy.get(row.outcome_id) ?? [];
    list.push({
      id: row.id,
      outcomeId: row.outcome_id,
      name: row.name,
      unit: row.unit ?? "",
      baselineValue: Number(row.baseline_value),
      baselineDate: row.baseline_date,
      targetValue: Number(row.target_value),
      targetDate: row.target_date,
      frequency: row.frequency,
      nextDueDate: row.next_due_date,
      dataSource: row.data_source ?? "",
      updatedAt: row.updated_at,
      rag: toHealth(h?.rag),
      reason: h?.reason ?? "",
      expectedValue: num(h?.expected_value),
      shortfallPercent: num(h?.shortfall_percent),
      countedMeasurementId: h?.measurement_id ?? null,
      measurements: measurementsBy.get(row.id) ?? [],
    });
    indicatorsBy.set(row.outcome_id, list);
  }
  const ready = new Map(
    unwrap(readiness, "Loading benefit readiness").map((row) => [row.benefit_id, row]),
  );

  return {
    capabilities: unwrap(capabilities, "Loading capabilities").map((row) => {
      const h = capHealth.get(row.id);
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        programmeId: row.programme_id,
        title: row.title,
        description: row.description ?? "",
        ownerId: row.owner_id,
        status: row.status,
        targetDate: row.target_date,
        forecastDate: row.forecast_date,
        deliveredDate: row.delivered_date,
        acceptedAt: row.accepted_at,
        acceptedById: row.accepted_by_id,
        acceptanceNote: row.acceptance_note ?? "",
        updatedAt: row.updated_at,
        projectIds: (row.capability_projects ?? []).map((link) => link.project_id),
        rag: toHealth(h?.rag),
        reason: h?.reason ?? "",
        slipDays: num(h?.slip_days),
        awaitingAcceptancePastTarget: Boolean(h?.awaiting_acceptance_past_target),
        history: historyBy.get(row.id) ?? [],
        documents: documentsBy.get(row.id) ?? [],
      };
    }),
    outcomes: unwrap(outcomes, "Loading outcomes").map((row) => {
      const h = outHealth.get(row.id);
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        programmeId: row.programme_id,
        title: row.title,
        description: row.description ?? "",
        ownerId: row.owner_id,
        status: row.status,
        targetDate: row.target_date,
        achievedDate: row.achieved_date,
        updatedAt: row.updated_at,
        capabilityIds: (row.outcome_capabilities ?? []).map((link) => link.capability_id),
        benefitIds: (row.outcome_benefits ?? []).map((link) => link.benefit_id),
        rag: toHealth(h?.rag),
        reason: h?.reason ?? "",
        indicatorDriven: Boolean(h?.indicator_driven),
        indicators: indicatorsBy.get(row.id) ?? [],
      };
    }),
    benefits: unwrap(benefits, "Loading benefits").map((row) => {
      const h = ready.get(row.id);
      return {
        id: row.id,
        ref: row.ref,
        title: row.title,
        programmeId: row.programme_id,
        workspaceId: row.workspace_id,
        status: row.status,
        realisationStartDate: row.realisation_start_date,
        updatedAt: row.updated_at,
        phase: h?.phase === "realisation" ? "realisation" : "readiness",
        rag: toHealth(h?.rag),
        reason: h?.reason ?? "",
        hasPathway: Boolean(h?.has_pathway),
        needsRealisationStart: Boolean(h?.needs_realisation_start),
      };
    }),
    projects: unwrap(projects, "Loading projects").map((row) => ({
      id: row.id ?? "",
      code: row.code ?? "",
      name: row.name ?? "",
      programmeId: row.programme_id,
      state: row.state ?? "proposed",
    })),
    programmes: unwrap(programmes, "Loading programmes").map((row) => ({
      id: row.id,
      name: row.name,
      workspaceId: row.workspace_id,
    })),
    people,
  };
}

// ---- Capabilities ---------------------------------------------------------------------

export interface CapabilityInput {
  programmeId: string;
  title: string;
  description: string;
  ownerId: string | null;
  /** Not 'accepted': acceptance has its own action. */
  status: Exclude<CapabilityStatus, "accepted">;
  targetDate: string | null;
  forecastDate: string | null;
  deliveredDate: string | null;
  projectIds: string[];
}

/** Checks the table's own rules first, so the message says which field to fix. */
function checkCapability(input: CapabilityInput) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the capability a title.");
  if (input.status !== "planned" && !input.targetDate)
    throw new ServiceError("invalid", "Set a target date before moving past Planned.");
  if (input.status === "delivered" && !input.deliveredDate)
    throw new ServiceError("invalid", "Enter the date it was delivered.");
}

const capabilityFields = (input: CapabilityInput) => ({
  programme_id: input.programmeId,
  title: input.title.trim(),
  description: input.description.trim() || null,
  owner_id: input.ownerId,
  status: input.status,
  target_date: input.targetDate,
  forecast_date: input.forecastDate || input.targetDate,
  delivered_date: input.status === "delivered" ? input.deliveredDate : null,
});

async function syncLinks(
  table: "capability_projects" | "outcome_capabilities" | "outcome_benefits",
  ownerColumn: string,
  ownerId: string,
  linkColumn: string,
  before: string[],
  after: string[],
  context: string,
) {
  const removed = before.filter((id) => !after.includes(id));
  const added = after.filter((id) => !before.includes(id));
  for (const id of removed)
    await deleteWhere(table, { [ownerColumn]: ownerId, [linkColumn]: id }, context);
  if (added.length)
    await insertRows(
      table,
      added.map((id) => ({ [ownerColumn]: ownerId, [linkColumn]: id })) as never,
      context,
    );
}

export async function createCapability(input: CapabilityInput) {
  checkCapability(input);
  const written = await insertRow("capabilities", capabilityFields(input), "Adding the capability");
  await syncLinks(
    "capability_projects",
    "capability_id",
    written.id,
    "project_id",
    [],
    input.projectIds,
    "Linking delivering projects",
  );
  return written;
}

export async function updateCapability(capability: PathwayCapability, input: CapabilityInput) {
  checkCapability(input);
  // An accepted capability keeps its status here; reversing it is a separate (PMO) action.
  const fields =
    capability.status === "accepted"
      ? {
          ...capabilityFields(input),
          status: "accepted" as const,
          delivered_date: capability.deliveredDate,
        }
      : capabilityFields(input);
  const written = await updateRow("capabilities", capability.id, fields, {
    context: "Saving the capability",
    lastSeen: capability.updatedAt,
  });
  await syncLinks(
    "capability_projects",
    "capability_id",
    capability.id,
    "project_id",
    capability.projectIds,
    input.projectIds,
    "Linking delivering projects",
  );
  return written;
}

/** Manager or PMO, with stored evidence (trigger). Records who accepted it for the business. */
export async function recordAcceptance(
  capability: PathwayCapability,
  input: { acceptedAt: string; acceptedById: string | null; note: string },
) {
  if (!input.acceptedById)
    throw new ServiceError("invalid", "Choose who accepted it on behalf of the business.");
  const deliveredDate = capability.deliveredDate ?? input.acceptedAt;
  if (input.acceptedAt < deliveredDate)
    throw new ServiceError("invalid", "The acceptance date can't be before the delivery date.");
  return updateRow(
    "capabilities",
    capability.id,
    {
      status: "accepted",
      delivered_date: deliveredDate,
      accepted_at: input.acceptedAt,
      accepted_by_id: input.acceptedById,
      acceptance_note: input.note.trim() || null,
    },
    { context: "Recording acceptance", lastSeen: capability.updatedAt },
  );
}

/** PMO only (trigger): back to Delivered; the audit log keeps who accepted it. */
export async function reverseAcceptance(capability: PathwayCapability) {
  return updateRow(
    "capabilities",
    capability.id,
    { status: "delivered", accepted_at: null, accepted_by_id: null },
    { context: "Reversing the acceptance", lastSeen: capability.updatedAt },
  );
}

/**
 * Acceptance evidence: the documents row first (the storage policy only accepts an upload to
 * the path of an existing row), then the file. If the upload fails the row is archived, so it
 * never counts as evidence (the acceptance trigger also requires the stored object).
 */
export async function uploadEvidence(capabilityId: string, file: File) {
  if (!EVIDENCE_TYPES[file.type])
    throw new ServiceError("invalid", "Upload a PDF, Word, Excel or PowerPoint file.");
  if (file.size > EVIDENCE_MAX_BYTES)
    throw new ServiceError("invalid", "Files can be up to 25 MB.");
  if (file.size === 0) throw new ServiceError("invalid", "That file is empty.");
  const inserted = await supabase
    .from("documents")
    .insert({
      scope: "capability",
      capability_id: capabilityId,
      file_name: file.name.replace(/[/\\]/g, "-").slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
    } as never)
    .select("id, storage_path")
    .single();
  if (inserted.error) throw fromPostgrest(inserted.error, "Adding the evidence", inserted.status);
  const row = inserted.data as { id: string; storage_path: string };
  const upload = await supabase.storage
    .from("documents")
    .upload(row.storage_path, file, { upsert: false, contentType: file.type });
  if (upload.error) {
    await supabase
      .from("documents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", row.id);
    throw new ServiceError("network", `Uploading the evidence: ${upload.error.message}`);
  }
  return row.id;
}

export async function archiveDocument(id: string) {
  const result = await supabase
    .from("documents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (result.error) throw fromPostgrest(result.error, "Archiving the document", result.status);
  if (!result.data?.length)
    throw new ServiceError(
      "forbidden",
      "Archiving the document: You don't have permission to make this change.",
    );
}

/** A five-minute download link. */
export async function evidenceUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 5 * 60);
  if (error || !data) throw new ServiceError("not_found", "That file couldn't be found.");
  return data.signedUrl;
}

// ---- Outcomes -------------------------------------------------------------------------

export interface OutcomeInput {
  programmeId: string;
  title: string;
  description: string;
  ownerId: string | null;
  status: OutcomeStatus;
  targetDate: string | null;
  achievedDate: string | null;
  capabilityIds: string[];
  benefitIds: string[];
}

function checkOutcome(input: OutcomeInput) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the outcome a title.");
  if (input.status === "achieved" && !input.achievedDate)
    throw new ServiceError("invalid", "Enter the date it was achieved.");
}

const outcomeFields = (input: OutcomeInput) => ({
  programme_id: input.programmeId,
  title: input.title.trim(),
  description: input.description.trim() || null,
  owner_id: input.ownerId,
  status: input.status,
  target_date: input.targetDate,
  achieved_date: input.status === "achieved" ? input.achievedDate : null,
});

export async function createOutcome(input: OutcomeInput) {
  checkOutcome(input);
  const written = await insertRow("outcomes", outcomeFields(input), "Adding the outcome");
  await syncLinks(
    "outcome_capabilities",
    "outcome_id",
    written.id,
    "capability_id",
    [],
    input.capabilityIds,
    "Linking capabilities",
  );
  await syncLinks(
    "outcome_benefits",
    "outcome_id",
    written.id,
    "benefit_id",
    [],
    input.benefitIds,
    "Linking benefits",
  );
  return written;
}

export async function updateOutcome(outcome: PathwayOutcome, input: OutcomeInput) {
  checkOutcome(input);
  const written = await updateRow("outcomes", outcome.id, outcomeFields(input), {
    context: "Saving the outcome",
    lastSeen: outcome.updatedAt,
  });
  await syncLinks(
    "outcome_capabilities",
    "outcome_id",
    outcome.id,
    "capability_id",
    outcome.capabilityIds,
    input.capabilityIds,
    "Linking capabilities",
  );
  await syncLinks(
    "outcome_benefits",
    "outcome_id",
    outcome.id,
    "benefit_id",
    outcome.benefitIds,
    input.benefitIds,
    "Linking benefits",
  );
  return written;
}

// ---- Indicators and measurements ------------------------------------------------------

export interface IndicatorInput {
  outcomeId: string;
  name: string;
  unit: string;
  baselineValue: number;
  baselineDate: string;
  targetValue: number;
  targetDate: string;
  frequency: Frequency;
  nextDueDate: string | null;
  dataSource: string;
}

function checkIndicator(input: IndicatorInput) {
  if (!input.name.trim()) throw new ServiceError("invalid", "Name the indicator.");
  if (!Number.isFinite(input.baselineValue) || !Number.isFinite(input.targetValue))
    throw new ServiceError("invalid", "Enter the baseline and target as numbers.");
  if (input.baselineValue === input.targetValue)
    throw new ServiceError("invalid", "The target must differ from the baseline.");
  if (!input.baselineDate || !input.targetDate || input.targetDate <= input.baselineDate)
    throw new ServiceError("invalid", "The target date must be after the baseline date.");
}

const indicatorFields = (input: IndicatorInput) => ({
  outcome_id: input.outcomeId,
  name: input.name.trim(),
  unit: input.unit.trim() || null,
  baseline_value: input.baselineValue,
  baseline_date: input.baselineDate,
  target_value: input.targetValue,
  target_date: input.targetDate,
  frequency: input.frequency,
  next_due_date: input.nextDueDate,
  data_source: input.dataSource.trim() || null,
});

export async function saveIndicator(input: IndicatorInput, existing?: PathwayIndicator) {
  checkIndicator(input);
  return existing
    ? updateRow("outcome_indicators", existing.id, indicatorFields(input), {
        context: "Saving the indicator",
        lastSeen: existing.updatedAt,
      })
    : insertRow("outcome_indicators", indicatorFields(input), "Adding the indicator");
}

export async function deleteIndicator(id: string) {
  return deleteRows("outcome_indicators", [id], "Removing the indicator");
}

export interface IndicatorMeasurementInput {
  indicatorId: string;
  measuredOn: string;
  actualValue: number;
  evidence: string;
  notes: string;
  submittedById: string | null;
  submittedDate: string;
}

/** Contributors submit; the measurement joins the PMO validation queue. */
export async function submitIndicatorMeasurement(input: IndicatorMeasurementInput) {
  if (!Number.isFinite(input.actualValue))
    throw new ServiceError("invalid", "Enter the measured value as a number.");
  if (!input.measuredOn) throw new ServiceError("invalid", "Enter the date it was measured.");
  return insertRow(
    "outcome_indicator_measurements",
    {
      indicator_id: input.indicatorId,
      measured_on: input.measuredOn,
      actual_value: input.actualValue,
      evidence: input.evidence.trim() || null,
      notes: input.notes.trim() || null,
      submitted_by_id: input.submittedById,
      submitted_date: input.submittedDate,
      status: "submitted",
    },
    "Submitting the measurement",
  );
}

/** PMO only (trigger), as for benefit measurements. */
export async function reviewIndicatorMeasurement(input: {
  id: string;
  decision: "validated" | "queried";
  queryNote?: string;
  reviewerId: string | null;
  today: string;
  lastSeen: string;
}) {
  if (input.decision === "queried" && !input.queryNote?.trim())
    throw new ServiceError("invalid", "Say what needs checking before querying the measurement.");
  return updateRow(
    "outcome_indicator_measurements",
    input.id,
    input.decision === "validated"
      ? {
          status: "validated",
          validated_by_id: input.reviewerId,
          validated_date: input.today,
          query_note: null,
        }
      : { status: "queried", query_note: input.queryNote?.trim() ?? null },
    {
      context:
        input.decision === "validated" ? "Validating the measurement" : "Querying the measurement",
      lastSeen: input.lastSeen,
    },
  );
}

// ---- Benefits -------------------------------------------------------------------------

/** The register's "Set realisation start" gap. Required before a benefit moves into realisation. */
export async function setRealisationStart(benefit: PathwayBenefit, date: string | null) {
  return updateRow(
    "benefits",
    benefit.id,
    { realisation_start_date: date },
    { context: "Setting the realisation start", lastSeen: benefit.updatedAt },
  );
}

// ---- Pure helpers (used by the screens) ------------------------------------------------

/** Items linked to the selected card, in both directions along the pathway. */
export function linkedIds(
  data: PathwayData,
  selected: { kind: "capability" | "outcome" | "benefit"; id: string } | null,
) {
  const ids = new Set<string>();
  if (!selected) return ids;
  ids.add(selected.id);
  const outcomesOf = (capabilityId: string) =>
    data.outcomes.filter((outcome) => outcome.capabilityIds.includes(capabilityId));
  const outcomesFor = (benefitId: string) =>
    data.outcomes.filter((outcome) => outcome.benefitIds.includes(benefitId));
  const add = (outcome: PathwayOutcome) => {
    ids.add(outcome.id);
    outcome.capabilityIds.forEach((id) => ids.add(id));
    outcome.benefitIds.forEach((id) => ids.add(id));
  };
  if (selected.kind === "capability") outcomesOf(selected.id).forEach(add);
  if (selected.kind === "benefit") outcomesFor(selected.id).forEach(add);
  if (selected.kind === "outcome") {
    const outcome = data.outcomes.find((item) => item.id === selected.id);
    if (outcome) add(outcome);
  }
  return ids;
}

/** Evidence that counts: not archived. (Whether the file is stored is checked by the database.) */
export const liveDocuments = (capability: PathwayCapability) =>
  capability.documents.filter((document) => !document.archivedAt);
