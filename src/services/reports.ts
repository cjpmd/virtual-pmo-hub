// Report builder data access (docs/report-builder-spec.md; RB-3). Reports, templates,
// inclusions, narratives, forum report settings and the block data RPC. Block data is shaped in
// SQL (report_block_data, RB-10); published reports read only from snapshots.
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { BlockInstance, RatingScheme, RiskMatrix } from "@/features/reports/blocks/types";
import type {
  InclusionReason,
  SelectionRuleSet,
  Tolerances,
} from "@/features/reports/engine/evaluateRules";
import type { ForumType } from "@/features/reports/engine/defaults";
import { ServiceError, unwrap, unwrapMaybe } from "./service-error";
import { deleteWhere, insertRow, insertRows, updateRow } from "./write";
import { createBatcher } from "@/lib/batch";
import { createLimiter } from "@/lib/limit";

// Live block data and scope metrics go in batches (RB-50); at most two batch requests at once.
const liveDataLimit = createLimiter(2);

export type ReportStatus = "draft" | "in_review" | "approved" | "published" | "withdrawn";
export type ScopeType = "project" | "programme" | "portfolio" | "custom";

export interface ScopeItem {
  entity_type: "project" | "programme";
  entity_id: string;
}

export interface ReportRecord {
  id: string;
  organisationId: string;
  workspaceId: string | null;
  title: string;
  templateId: string | null;
  templateVersion: number | null;
  forumId: string | null;
  meetingId: string | null;
  scopeType: ScopeType;
  scopeEntityId: string | null;
  scopeItems: ScopeItem[] | null;
  asAt: string;
  blocks: BlockInstance[];
  selectionRules: SelectionRuleSet;
  ratingSchemeId: string | null;
  overallRating: string | null;
  overallRatingRationale: string | null;
  status: ReportStatus;
  previousReportId: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

export interface ReportListItem extends ReportRecord {
  forumName: string | null;
  meetingDate: string | null;
  templateName: string | null;
}

export interface TemplateRecord {
  id: string;
  organisationId: string | null;
  workspaceId: string | null;
  name: string;
  description: string | null;
  forumType: ForumType | null;
  scopeType: ScopeType | "any";
  blocks: BlockInstance[];
  selectionRules: SelectionRuleSet;
  ratingSchemeKey: string | null;
  riskMatrixKey: string | null;
  version: number;
  isSystem: boolean;
  archivedAt: string | null;
  updatedAt: string;
}

export interface InclusionRow {
  entityId: string;
  mode: "rule" | "pinned" | "excluded";
  reasons: InclusionReason[];
  severity: number | null;
  sortOrder: number | null;
  pinnedBy: string | null;
}

export interface NarrativeRow {
  id: string;
  blockInstanceId: string;
  entityId: string | null;
  body: { format: "markdown"; text: string };
  source: "human" | "ai_draft" | "highlight_report";
  updatedAt: string;
}

export interface ScopeMetricsRow {
  project_id: string;
  code: string;
  name: string;
  programme: string | null;
  metrics: Record<string, unknown>;
}

const REPORT_COLUMNS =
  "id, organisation_id, workspace_id, title, template_id, template_version, forum_id, meeting_id, scope_type, scope_entity_id, scope_items, as_at, blocks, selection_rules, rating_scheme_id, overall_rating, overall_rating_rationale, status, previous_report_id, submitted_at, approved_at, published_at, created_at, created_by, updated_at";

type ReportRow = {
  id: string;
  organisation_id: string;
  workspace_id: string | null;
  title: string;
  template_id: string | null;
  template_version: number | null;
  forum_id: string | null;
  meeting_id: string | null;
  scope_type: string;
  scope_entity_id: string | null;
  scope_items: Json | null;
  as_at: string;
  blocks: Json;
  selection_rules: Json;
  rating_scheme_id: string | null;
  overall_rating: string | null;
  overall_rating_rationale: string | null;
  status: ReportStatus;
  previous_report_id: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
};

const asRuleSet = (value: Json | null | undefined): SelectionRuleSet => {
  const raw = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<
    string,
    unknown
  >;
  return {
    mode: raw["mode"] === "all" ? "all" : "any",
    rules: Array.isArray(raw["rules"]) ? (raw["rules"] as SelectionRuleSet["rules"]) : [],
    ...(typeof raw["maxAutoIncluded"] === "number" && { maxAutoIncluded: raw["maxAutoIncluded"] }),
    ...(typeof raw["orderBy"] === "string" && {
      orderBy: raw["orderBy"] as NonNullable<SelectionRuleSet["orderBy"]>,
    }),
  };
};

const asBlocks = (value: Json | null | undefined): BlockInstance[] =>
  Array.isArray(value) ? (value as unknown as BlockInstance[]) : [];

export const toReport = (row: ReportRow): ReportRecord => ({
  id: row.id,
  organisationId: row.organisation_id,
  workspaceId: row.workspace_id,
  title: row.title,
  templateId: row.template_id,
  templateVersion: row.template_version,
  forumId: row.forum_id,
  meetingId: row.meeting_id,
  scopeType: row.scope_type as ScopeType,
  scopeEntityId: row.scope_entity_id,
  scopeItems: Array.isArray(row.scope_items) ? (row.scope_items as unknown as ScopeItem[]) : null,
  asAt: row.as_at,
  blocks: asBlocks(row.blocks),
  selectionRules: asRuleSet(row.selection_rules),
  ratingSchemeId: row.rating_scheme_id,
  overallRating: row.overall_rating,
  overallRatingRationale: row.overall_rating_rationale,
  status: row.status,
  previousReportId: row.previous_report_id,
  submittedAt: row.submitted_at,
  approvedAt: row.approved_at,
  publishedAt: row.published_at,
  createdAt: row.created_at,
  createdBy: row.created_by,
  updatedAt: row.updated_at,
});

export async function listReports(orgId: string): Promise<ReportListItem[]> {
  const rows = unwrap(
    await supabase
      .from("reports")
      .select(`${REPORT_COLUMNS}, forums(name), meetings(meeting_date), report_templates(name)`)
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false }),
    "Loading reports",
  );
  return (
    rows as unknown as Array<
      ReportRow & {
        forums: { name: string } | null;
        meetings: { meeting_date: string } | null;
        report_templates: { name: string } | null;
      }
    >
  ).map((row) => ({
    ...toReport(row),
    forumName: row.forums?.name ?? null,
    meetingDate: row.meetings?.meeting_date ?? null,
    templateName: row.report_templates?.name ?? null,
  }));
}

export async function getReport(id: string): Promise<ReportRecord | null> {
  const row = unwrapMaybe(
    await supabase.from("reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle(),
    "Loading the report",
  );
  return row ? toReport(row as unknown as ReportRow) : null;
}

export interface CreateReportInput {
  title?: string;
  templateId?: string | null;
  forumId?: string | null;
  meetingId?: string | null;
  scopeType?: ScopeType;
  scopeEntityId?: string | null;
  scopeItems?: ScopeItem[];
  asAt?: string | null;
  blocks?: BlockInstance[];
  adHoc?: boolean;
  overrideCutoff?: boolean;
}

export async function createReport(input: CreateReportInput): Promise<string> {
  const payload: Record<string, unknown> = {
    title: input.title ?? null,
    template_id: input.templateId ?? null,
    forum_id: input.forumId ?? null,
    meeting_id: input.meetingId ?? null,
    scope_type: input.scopeType ?? null,
    scope_entity_id: input.scopeEntityId ?? null,
    scope_items: input.scopeItems ?? null,
    as_at: input.asAt ?? null,
    ad_hoc: input.adHoc ?? false,
    override_cutoff: input.overrideCutoff ?? false,
  };
  // Omit blocks when not provided — JSON null would bypass the DB default via COALESCE.
  if (input.blocks != null) payload["blocks"] = input.blocks;
  const id = unwrap(
    await supabase.rpc("create_report", { p: payload as Json }),
    "Creating the report",
  );
  return id as string;
}

export type ReportPatch = Partial<{
  title: string;
  as_at: string;
  blocks: BlockInstance[];
  selection_rules: SelectionRuleSet;
  overall_rating: string | null;
  overall_rating_rationale: string | null;
  rating_scheme_id: string | null;
  scope_type: ScopeType;
  scope_entity_id: string | null;
  scope_items: ScopeItem[] | null;
  meeting_id: string | null;
}>;

/** Draft edits (autosave): updated_at concurrency through the write helper. */
export async function updateReport(id: string, patch: ReportPatch, lastSeen: string | null) {
  return updateRow("reports", id, patch as never, { context: "Saving the report", lastSeen });
}

// ------------------------------------------------------------------ block data
/** What report_block_data / report_context take: a saved report, or a preview scope. */
export type ReportInput =
  | { report_id: string }
  | {
      organisation_id: string;
      scope_type: ScopeType;
      scope_entity_id?: string | null;
      scope_items?: ScopeItem[];
      as_at?: string | null;
      forum_id?: string | null;
      rating_scheme_key?: string | null;
      template_id?: string | null;
      title?: string;
    };

type LiveItem = { block: BlockInstance; entityId: string | null } | { scopeMetrics: true };

// Everything a page asks for within 250 ms goes to report_blocks_data together (RB-50): the
// blocks and the selection panel's scope metrics, so the page builds the context and works out
// project metrics once instead of once per block. The window covers the gap between the first
// requests and the deep-dives, which wait for the inclusions.
const loadLive = createBatcher<ReportInput, LiveItem, unknown>({
  groupKey: (input) => JSON.stringify(input),
  windowMs: 250,
  run: async (input, items) => {
    const result = await liveDataLimit(() =>
      supabase.rpc("report_blocks_data", {
        p_input: input as unknown as Json,
        p_items: items.map((item, i) =>
          "scopeMetrics" in item
            ? { key: String(i), kind: "scope_metrics" }
            : { key: String(i), block: item.block, entity: item.entityId },
        ) as unknown as Json,
      }),
    );
    const byKey = (unwrapMaybe(result, "Loading the report") ?? {}) as Record<
      string,
      { data?: unknown; error?: string; code?: string }
    >;
    return items.map((item, i) => {
      const out = byKey[String(i)];
      if (out && !out.error) return { ok: true, value: out.data ?? null };
      const what =
        "scopeMetrics" in item
          ? "Loading project metrics"
          : `Loading ${item.block.blockKey.replace(/_/g, " ")}`;
      return {
        ok: false,
        error: new ServiceError("unknown", out?.error ?? `${what}: no data returned.`, {
          code: out?.code,
          detail: what,
        }),
      };
    });
  },
});

export function fetchBlockData(
  input: ReportInput,
  block: BlockInstance,
  entityId: string | null,
): Promise<unknown> {
  return loadLive(input, { block, entityId });
}

export interface ReportContextData {
  report_id: string | null;
  organisation_id: string;
  title: string;
  status: ReportStatus;
  as_at: string;
  today: string;
  scope_type: ScopeType;
  scope_entity_id: string | null;
  project_ids: string[];
  forum_id: string | null;
  previous_report_id: string | null;
  scheme: {
    id: string;
    key: string;
    name: string;
    levels: RatingScheme["levels"];
    is_assurance: boolean;
  } | null;
  matrix: { name: string; bands: RiskMatrix["bands"] } | null;
  /** What the figures are as at (history, current, or mixed). */
  data_basis: DataBasis | null;
  currency: string;
  included: string[];
  forum: {
    id: string;
    name: string;
    forum_type: ForumType;
    tolerances: Tolerances;
    approval_required: boolean;
  } | null;
  meeting: { id: string; meeting_date: string; papers_deadline: string; status: string } | null;
}

export interface DataBasis {
  source: "history" | "current" | "mixed";
  text: string;
}

export async function fetchReportContext(input: ReportInput): Promise<ReportContextData> {
  return unwrap(
    await supabase.rpc("report_context", { p_input: input as unknown as Json }),
    "Loading the report",
  ) as unknown as ReportContextData;
}

export const toScheme = (raw: ReportContextData["scheme"]): RatingScheme =>
  raw
    ? {
        id: raw.id,
        key: raw.key,
        name: raw.name,
        levels: raw.levels,
        isAssurance: raw.is_assurance,
      }
    : FALLBACK_SCHEME;

/** Used only while the context loads; the database's RAG scheme replaces it. */
export const FALLBACK_SCHEME: RatingScheme = {
  id: null,
  key: "rag",
  name: "RAG",
  isAssurance: false,
  levels: [
    { key: "green", label: "Green", colour: "#2e7d52", rank: 1, rag: "green" },
    { key: "amber", label: "Amber", colour: "#b7791f", rank: 2, rag: "amber" },
    { key: "red", label: "Red", colour: "#b3261e", rank: 3, rag: "red" },
    { key: "grey", label: "Not reported", colour: "#6b7280", rank: 4, rag: "not_set" },
  ],
};

/** Scope metrics ride in the page's block batch (RB-50). */
export async function fetchScopeMetrics(input: ReportInput): Promise<ScopeMetricsRow[]> {
  return ((await loadLive(input, { scopeMetrics: true })) ?? []) as ScopeMetricsRow[];
}

// ------------------------------------------------------------------ selection
export async function listInclusions(reportId: string): Promise<InclusionRow[]> {
  const rows = unwrap(
    await supabase
      .from("report_inclusions")
      .select("entity_id, mode, reasons, severity, sort_order, pinned_by")
      .eq("report_id", reportId)
      .order("sort_order", { ascending: true, nullsFirst: false }),
    "Loading the selection",
  );
  return rows.map((row) => ({
    entityId: row.entity_id,
    mode: row.mode as InclusionRow["mode"],
    reasons: ((row.reasons as unknown as Array<Record<string, unknown>>) ?? []).map((r) => ({
      ruleId: String(r["rule_id"] ?? r["ruleId"] ?? ""),
      label: String(r["label"] ?? ""),
      metric: String(r["metric"] ?? ""),
      op: (r["op"] ?? "=") as InclusionReason["op"],
      value: r["value"],
      threshold: r["threshold"],
      severity: Number(r["severity"] ?? 1),
    })),
    severity: row.severity,
    sortOrder: row.sort_order,
    pinnedBy: row.pinned_by,
  }));
}

export async function refreshSelection(reportId: string) {
  unwrapMaybe(
    await supabase.rpc("refresh_report_selection", { p_report_id: reportId }),
    "Refreshing the selection",
  );
}

export async function setInclusion(
  reportId: string,
  entityId: string,
  mode: "pinned" | "excluded" | null,
) {
  unwrapMaybe(
    await supabase.rpc("set_report_inclusion", {
      p_report_id: reportId,
      p_entity_id: entityId,
      p_mode: mode as string,
    }),
    mode === "pinned"
      ? "Pinning the project"
      : mode === "excluded"
        ? "Excluding the project"
        : "Clearing the override",
  );
}

export async function reorderInclusions(reportId: string, entityIds: string[]) {
  unwrapMaybe(
    await supabase.rpc("reorder_report_inclusions", {
      p_report_id: reportId,
      p_entity_ids: entityIds,
    }),
    "Reordering the deep-dives",
  );
}

// ------------------------------------------------------------------ narratives
export async function listNarratives(reportId: string): Promise<NarrativeRow[]> {
  const rows = unwrap(
    await supabase
      .from("report_narratives")
      .select("id, block_instance_id, entity_id, body, source, updated_at")
      .eq("report_id", reportId),
    "Loading the narrative",
  );
  return rows.map((row) => ({
    id: row.id,
    blockInstanceId: row.block_instance_id,
    entityId: row.entity_id,
    body: row.body as unknown as NarrativeRow["body"],
    source: row.source as NarrativeRow["source"],
    updatedAt: row.updated_at,
  }));
}

export async function saveNarrative(input: {
  reportId: string;
  blockInstanceId: string;
  entityId: string | null;
  text: string;
  source?: NarrativeRow["source"];
  existing?: { id: string; updatedAt: string } | null;
}) {
  const body = { format: "markdown", text: input.text } as unknown as Json;
  if (input.existing)
    return updateRow(
      "report_narratives",
      input.existing.id,
      { body, source: input.source ?? "human" },
      { context: "Saving the narrative", lastSeen: input.existing.updatedAt },
    );
  return insertRow(
    "report_narratives",
    {
      report_id: input.reportId,
      block_instance_id: input.blockInstanceId,
      entity_id: input.entityId,
      body,
      source: input.source ?? "human",
    },
    "Saving the narrative",
  );
}

// ------------------------------------------------------------------ templates
type TemplateRow = {
  id: string;
  organisation_id: string | null;
  workspace_id: string | null;
  name: string;
  description: string | null;
  forum_type: string | null;
  scope_type: string;
  blocks: Json;
  selection_rules: Json;
  rating_scheme_key: string | null;
  risk_matrix_key: string | null;
  version: number;
  is_system: boolean;
  archived_at: string | null;
  updated_at: string;
};

const toTemplate = (row: TemplateRow): TemplateRecord => ({
  id: row.id,
  organisationId: row.organisation_id,
  workspaceId: row.workspace_id,
  name: row.name,
  description: row.description,
  forumType: row.forum_type as ForumType | null,
  scopeType: row.scope_type as TemplateRecord["scopeType"],
  blocks: asBlocks(row.blocks),
  selectionRules: asRuleSet(row.selection_rules),
  ratingSchemeKey: row.rating_scheme_key,
  riskMatrixKey: row.risk_matrix_key,
  version: row.version,
  isSystem: row.is_system,
  archivedAt: row.archived_at,
  updatedAt: row.updated_at,
});

const TEMPLATE_COLUMNS =
  "id, organisation_id, workspace_id, name, description, forum_type, scope_type, blocks, selection_rules, rating_scheme_key, risk_matrix_key, version, is_system, archived_at, updated_at";

/** System templates and the organisation's own (archived included; filter in the UI). */
export async function listTemplates(orgId: string): Promise<TemplateRecord[]> {
  const rows = unwrap(
    await supabase
      .from("report_templates")
      .select(TEMPLATE_COLUMNS)
      .or(`organisation_id.is.null,organisation_id.eq.${orgId}`)
      .order("is_system", { ascending: false })
      .order("name"),
    "Loading templates",
  );
  return (rows as unknown as TemplateRow[]).map(toTemplate);
}

export async function getTemplate(id: string): Promise<TemplateRecord | null> {
  const row = unwrapMaybe(
    await supabase.from("report_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle(),
    "Loading the template",
  );
  return row ? toTemplate(row as unknown as TemplateRow) : null;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  forumType?: ForumType | null;
  scopeType: TemplateRecord["scopeType"];
  blocks: BlockInstance[];
  selectionRules: SelectionRuleSet;
  ratingSchemeKey?: string | null;
  riskMatrixKey?: string | null;
}

const templateFields = (input: Partial<TemplateInput>) => ({
  ...(input.name !== undefined && { name: input.name }),
  ...(input.description !== undefined && { description: input.description }),
  ...(input.forumType !== undefined && { forum_type: input.forumType }),
  ...(input.scopeType !== undefined && { scope_type: input.scopeType }),
  ...(input.blocks !== undefined && { blocks: input.blocks as unknown as Json }),
  ...(input.selectionRules !== undefined && {
    selection_rules: input.selectionRules as unknown as Json,
  }),
  ...(input.ratingSchemeKey !== undefined && { rating_scheme_key: input.ratingSchemeKey }),
  ...(input.riskMatrixKey !== undefined && { risk_matrix_key: input.riskMatrixKey }),
});

export async function createTemplate(orgId: string, input: TemplateInput) {
  return insertRow(
    "report_templates",
    { organisation_id: orgId, ...templateFields(input) } as never,
    "Saving the template",
  );
}

/** Copy a system or org template into a new organisation template. */
export async function copyTemplate(orgId: string, template: TemplateRecord, name?: string) {
  return createTemplate(orgId, {
    name: name ?? `${template.name} (copy)`,
    description: template.description,
    forumType: template.forumType,
    scopeType: template.scopeType,
    blocks: template.blocks,
    selectionRules: template.selectionRules,
    ratingSchemeKey: template.ratingSchemeKey,
    riskMatrixKey: template.riskMatrixKey,
  });
}

export async function updateTemplate(
  id: string,
  input: Partial<TemplateInput>,
  lastSeen: string | null,
) {
  return updateRow("report_templates", id, templateFields(input) as never, {
    context: "Saving the template",
    lastSeen,
  });
}

export async function setTemplateArchived(id: string, archived: boolean, lastSeen: string | null) {
  return updateRow(
    "report_templates",
    id,
    { archived_at: archived ? new Date().toISOString() : null },
    { context: archived ? "Archiving the template" : "Restoring the template", lastSeen },
  );
}

export async function saveReportAsTemplate(reportId: string, name: string) {
  return unwrap(
    await supabase.rpc("save_report_as_template", { p_report_id: reportId, p_name: name }),
    "Saving as a template",
  ) as string;
}

// ------------------------------------------------------------------ config
export async function listRatingSchemes(orgId: string): Promise<RatingScheme[]> {
  const rows = unwrap(
    await supabase
      .from("rating_schemes")
      .select("id, key, name, levels, is_assurance, organisation_id")
      .or(`organisation_id.is.null,organisation_id.eq.${orgId}`)
      .order("name"),
    "Loading rating schemes",
  );
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    levels: row.levels as unknown as RatingScheme["levels"],
    isAssurance: row.is_assurance,
  }));
}

export interface RiskMatrixRow {
  id: string;
  organisationId: string | null;
  key: string;
  name: string;
  bands: RiskMatrix["bands"];
  isDefault: boolean;
  updatedAt: string;
}

export async function listRiskMatrices(orgId: string): Promise<RiskMatrixRow[]> {
  const rows = unwrap(
    await supabase
      .from("risk_matrices")
      .select("id, organisation_id, key, name, bands, is_default, updated_at")
      .or(`organisation_id.is.null,organisation_id.eq.${orgId}`)
      .order("name"),
    "Loading risk matrices",
  );
  return rows.map((row) => ({
    id: row.id,
    organisationId: row.organisation_id,
    key: row.key,
    name: row.name,
    bands: row.bands as unknown as RiskMatrix["bands"],
    isDefault: row.is_default,
    updatedAt: row.updated_at,
  }));
}

// ------------------------------------------------------------------ forum report settings
export interface ForumReporting {
  id: string;
  workspaceId: string | null;
  forumType: ForumType | null;
  description: string | null;
  scopeType: ScopeType | null;
  scopeEntityId: string | null;
  ratingSchemeId: string | null;
  tolerances: Tolerances;
  defaultTemplateId: string | null;
  parentForumId: string | null;
  approvalRequired: boolean;
  autoCreatePacks: boolean;
  /** Who reads published packs besides PMO / chair / secretary: members, or the organisation. */
  publishedPackVisibility: "members" | "organisation";
  riskMatrixId: string | null;
  updatedAt: string;
}

export async function listForumReporting(orgId: string): Promise<ForumReporting[]> {
  const rows = unwrap(
    await supabase
      .from("forums")
      .select(
        "id, workspace_id, forum_type, description, scope_type, scope_entity_id, rating_scheme_id, tolerances, default_template_id, parent_forum_id, approval_required, auto_create_packs, published_pack_visibility, risk_matrix_id, updated_at",
      )
      .eq("organisation_id", orgId),
    "Loading forum report settings",
  );
  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    forumType: row.forum_type as ForumType | null,
    description: row.description,
    scopeType: row.scope_type as ScopeType | null,
    scopeEntityId: row.scope_entity_id,
    ratingSchemeId: row.rating_scheme_id,
    tolerances: (row.tolerances ?? {}) as unknown as Tolerances,
    defaultTemplateId: row.default_template_id,
    parentForumId: row.parent_forum_id,
    approvalRequired: row.approval_required,
    autoCreatePacks: row.auto_create_packs,
    publishedPackVisibility:
      row.published_pack_visibility as ForumReporting["publishedPackVisibility"],
    riskMatrixId: row.risk_matrix_id,
    updatedAt: row.updated_at,
  }));
}

export type ForumReportingPatch = Partial<{
  forum_type: ForumType;
  description: string | null;
  scope_type: ScopeType | null;
  scope_entity_id: string | null;
  rating_scheme_id: string | null;
  tolerances: Tolerances;
  default_template_id: string | null;
  parent_forum_id: string | null;
  approval_required: boolean;
  auto_create_packs: boolean;
  published_pack_visibility: "members" | "organisation";
  risk_matrix_id: string | null;
}>;

export async function updateForumReporting(
  forumId: string,
  patch: ForumReportingPatch,
  lastSeen: string | null,
) {
  return updateRow("forums", forumId, patch as never, {
    context: "Saving the forum's report settings",
    lastSeen,
  });
}

export async function setForumMemberRole(forumId: string, resourceId: string, role: string) {
  return updateRow(
    "forum_members",
    { forum_id: forumId, resource_id: resourceId },
    { role: role as never },
    { context: "Changing the member's role" },
  );
}

export async function listForumScopeItems(orgId: string) {
  return unwrap(
    await supabase
      .from("forum_scope_items")
      .select("forum_id, entity_type, entity_id")
      .eq("organisation_id", orgId),
    "Loading forum scope",
  );
}

export async function setForumScopeItems(forumId: string, items: ScopeItem[]) {
  const context = "Saving the forum's scope";
  await deleteWhere("forum_scope_items", { forum_id: forumId }, context);
  await insertRows(
    "forum_scope_items",
    items.map((item) => ({ forum_id: forumId, ...item })) as never,
    context,
  );
}

// ------------------------------------------------------------------ events
export interface ReportEvent {
  id: number;
  event: string;
  actor: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export async function listReportEvents(reportId: string): Promise<ReportEvent[]> {
  const rows = unwrap(
    await supabase
      .from("report_events")
      .select("id, event, actor, payload, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false }),
    "Loading the report history",
  );
  return rows.map((row) => ({
    id: row.id,
    event: row.event,
    actor: row.actor,
    payload: row.payload as Record<string, unknown> | null,
    createdAt: row.created_at,
  }));
}

// ------------------------------------------------------------------ permissions
export interface ReportPermissions {
  can_view: boolean;
  can_edit: boolean;
  can_approve: boolean;
  can_publish: boolean;
  can_withdraw: boolean;
  can_save_template: boolean;
  is_partner: boolean;
  hidden_block_keys: string[];
}

export async function fetchReportPermissions(reportId: string): Promise<ReportPermissions> {
  return unwrap(
    await supabase.rpc("report_permissions", { p_report_id: reportId }),
    "Loading your permissions",
  ) as unknown as ReportPermissions;
}

/** The PM's latest submitted highlight report text on or before as-at ("Use PM's summary"). */
export async function latestHighlightSummary(
  projectId: string,
  asAt: string,
): Promise<string | null> {
  const row = unwrapMaybe(
    await supabase
      .from("status_reports")
      .select("comments, accomplished, planned")
      .eq("project_id", projectId)
      .eq("status", "submitted")
      .lte("reporting_date", asAt)
      .order("reporting_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "Loading the highlight report",
  );
  if (!row) return null;
  return [
    row.comments,
    row.accomplished && `**Achieved:** ${row.accomplished}`,
    row.planned && `**Next:** ${row.planned}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ------------------------------------------------------------------ lifecycle (§10)
const rpcVoid = async (
  result: PromiseLike<{
    data: unknown;
    error: import("@supabase/supabase-js").PostgrestError | null;
    status?: number;
  }>,
  context: string,
) => {
  unwrapMaybe(await result, context);
};

export const submitReport = (id: string) =>
  rpcVoid(supabase.rpc("submit_report", { p_report_id: id }), "Submitting for review");
export const returnReport = (id: string, comment: string) =>
  rpcVoid(
    supabase.rpc("return_report", { p_report_id: id, p_comment: comment }),
    "Returning the report",
  );
export const approveReport = (id: string) =>
  rpcVoid(supabase.rpc("approve_report", { p_report_id: id }), "Approving");
export const withdrawReport = (id: string, reason: string) =>
  rpcVoid(supabase.rpc("withdraw_report", { p_report_id: id, p_reason: reason }), "Withdrawing");

export interface PublishResult {
  published: boolean;
  /** Distribution outcome from the report-publish function, when it ran. */
  distribution: { sent: number; skipped?: string; failed?: number } | null;
  pdf: { path: string } | { skipped: string } | null;
}

/**
 * Publish: the report-publish edge function (publish, then email and server PDF). Where the
 * function isn't deployed (local development), publish through the RPC and say the email
 * wasn't sent.
 */
export async function publishReport(id: string): Promise<PublishResult> {
  const { data, error } = await supabase.functions.invoke("report-publish", {
    body: { report_id: id },
  });
  if (!error && data && typeof data === "object") return data as PublishResult;
  const status = (error as { context?: { status?: number } } | null)?.context?.status;
  if (error && status && status !== 404) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error ?? "Publishing failed.");
  }
  unwrapMaybe(await supabase.rpc("publish_report", { p_report_id: id }), "Publishing");
  return { published: true, distribution: null, pdf: null };
}

// ------------------------------------------------------------------ snapshots
export interface SnapshotRow {
  blockInstanceId: string;
  blockKey: string;
  entityId: string | null;
  data: unknown;
}

export async function listSnapshots(reportId: string): Promise<SnapshotRow[]> {
  const rows = unwrap(
    await supabase
      .from("report_snapshots")
      .select("block_instance_id, block_key, entity_id, data")
      .eq("report_id", reportId),
    "Loading the published pack",
  );
  return rows.map((row) => ({
    blockInstanceId: row.block_instance_id,
    blockKey: row.block_key,
    entityId: row.entity_id,
    data: row.data,
  }));
}

/** The print route's read with a server print token (no session). */
export async function snapshotByToken(reportId: string, token: string) {
  const data = unwrapMaybe(
    await supabase.rpc("report_snapshot_by_token", { p_report_id: reportId, p_token: token }),
    "Loading the pack",
  ) as {
    report: Record<string, unknown>;
    snapshots: Array<{ block_instance_id: string; entity_id: string | null; data: unknown }>;
  } | null;
  return data;
}

// ------------------------------------------------------------------ meeting capture (§9.3)
export async function recordMeetingDecision(input: {
  reportId: string;
  decisionId: string;
  optionId: string;
  outcome: string;
}) {
  unwrapMaybe(
    await supabase.rpc("record_meeting_decision", {
      p_report_id: input.reportId,
      p_decision_id: input.decisionId,
      p_option_id: input.optionId,
      p_outcome: input.outcome,
    }),
    "Recording the decision",
  );
}

export async function addMeetingAction(input: {
  reportId: string;
  title: string;
  ownerId: string | null;
  dueDate: string | null;
  projectId: string | null;
}) {
  unwrapMaybe(
    await supabase.rpc("add_meeting_action", {
      p_report_id: input.reportId,
      p_title: input.title,
      p_owner_id: input.ownerId as string,
      p_due_date: input.dueDate as string,
      ...(input.projectId ? { p_project_id: input.projectId } : {}),
    }),
    "Adding the action",
  );
}

export interface MeetingAction {
  id: string;
  title: string;
  dueDate: string | null;
  status: string;
  ownerId: string | null;
  projectId: string | null;
}

export async function listReportActions(reportId: string): Promise<MeetingAction[]> {
  const rows = unwrap(
    await supabase
      .from("forum_actions")
      .select("id, title, due_date, status, owner_id, project_id")
      .eq("report_id", reportId)
      .order("created_at"),
    "Loading actions",
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueDate: row.due_date,
    status: row.status,
    ownerId: row.owner_id,
    projectId: row.project_id,
  }));
}

// ------------------------------------------------------------------ Phase 4
/** Drafts the executive summary with Claude (report-ai-summary edge function). */
export async function draftSummaryWithAi(reportId: string, blockInstanceId: string) {
  const { data, error } = await supabase.functions.invoke("report-ai-summary", {
    body: { report_id: reportId, block_instance_id: blockInstanceId },
  });
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    const status = (error as { context?: { status?: number } }).context?.status;
    throw new Error(
      (body as { error?: string } | null)?.error ??
        (status === 404
          ? "AI drafting isn't deployed here (report-ai-summary)."
          : "The AI draft couldn't be written."),
    );
  }
  return data as { narrative_id: string; model: string };
}

export async function acknowledgeAiDraft(narrativeId: string) {
  unwrapMaybe(
    await supabase.rpc("acknowledge_ai_draft", { p_narrative_id: narrativeId }),
    "Marking the draft reviewed",
  );
}

export async function updateReportToTemplate(reportId: string) {
  unwrapMaybe(
    await supabase.rpc("update_report_to_template", { p_report_id: reportId }),
    "Updating to the latest template",
  );
}

/** Packs the system drafted that the signed-in user can edit (notification feed). */
export async function listSystemDraftedPacks() {
  const rows = unwrap(await supabase.rpc("my_system_drafted_packs"), "Loading drafted packs");
  return rows.map((row) => ({
    reportId: row.report_id,
    title: row.title,
    createdAt: row.created_at,
  }));
}
