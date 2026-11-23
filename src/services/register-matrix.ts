// The risk register's matrix and the risk re-scoring tool (NHS-1 part 4, migration
// 20261123090000_nhs_1d_register_matrix). The database decides everything: an organisation's own
// default matrix becomes the register matrix (settings.risk is copied from it by trigger),
// set_register_risk_matrix (admins) changes it and stamps existing risks with the old matrix,
// risk_rescore_candidates lists open risks still on another matrix with a proposal, and
// rescore_risks (workspace PMO and admins) accepts proposals, refusing stale ones.
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";

export interface MatrixLevel {
  value: number;
  label: string;
}
export interface MatrixBand {
  min: number;
  max?: number;
  key?: string;
  label: string;
  colour?: string;
}
export interface RegisterMatrixOption {
  id: string;
  key: string;
  name: string;
  organisationId: string | null;
  isDefault: boolean;
  likelihoodLevels: MatrixLevel[];
  consequenceLevels: MatrixLevel[];
  scoreMethod: string;
  bands: MatrixBand[];
}

const asArray = (value: unknown): Array<Record<string, unknown>> =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
      )
    : [];

const toLevels = (value: unknown): MatrixLevel[] =>
  asArray(value).map((item) => ({
    value: Number(item["value"]),
    label: typeof item["label"] === "string" ? item["label"] : String(item["value"] ?? ""),
  }));

const toBands = (value: unknown): MatrixBand[] =>
  asArray(value).map((item) => ({
    min: Number(item["min"]),
    ...(typeof item["max"] === "number" ? { max: item["max"] } : {}),
    ...(typeof item["key"] === "string" ? { key: item["key"] } : {}),
    label: typeof item["label"] === "string" ? item["label"] : "",
    ...(typeof item["colour"] === "string" ? { colour: item["colour"] } : {}),
  }));

/** Mirrors private.matrix_register_compatible: 5 likelihood × 5 consequence levels, scored by product. */
export function isRegisterCompatible(
  matrix: Pick<RegisterMatrixOption, "likelihoodLevels" | "consequenceLevels" | "scoreMethod">,
) {
  return (
    matrix.likelihoodLevels.length === 5 &&
    matrix.consequenceLevels.length === 5 &&
    (matrix.scoreMethod || "product") === "product"
  );
}

/**
 * The register matrix: the organisation's own default, else the system default (mirrors
 * private.org_risk_matrix). `own` is true when the organisation has chosen its own.
 */
export function registerMatrixOf(rows: RegisterMatrixOption[], orgId: string) {
  const own = rows.find((row) => row.organisationId === orgId && row.isDefault);
  const matrix = own ?? rows.find((row) => row.organisationId === null && row.isDefault) ?? null;
  return { matrix, own: Boolean(own) };
}

/**
 * The matrices an admin can choose for the register, one per key (the organisation's own copy
 * wins over the system row of the same key), compatible ones only.
 */
export function registerChoices(rows: RegisterMatrixOption[], orgId: string) {
  const byKey = new Map<string, RegisterMatrixOption>();
  for (const row of rows) {
    if (!isRegisterCompatible(row)) continue;
    if (row.organisationId !== null && row.organisationId !== orgId) continue;
    const existing = byKey.get(row.key);
    if (!existing || (existing.organisationId === null && row.organisationId === orgId))
      byKey.set(row.key, row);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function listRegisterMatrices(orgId: string): Promise<RegisterMatrixOption[]> {
  const rows = unwrap(
    await supabase
      .from("risk_matrices")
      .select(
        "id, key, name, organisation_id, is_default, likelihood_levels, consequence_levels, score_method, bands",
      )
      .or(`organisation_id.is.null,organisation_id.eq.${orgId}`)
      .order("name"),
    "Loading risk matrices",
  );
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    organisationId: row.organisation_id,
    isDefault: row.is_default,
    likelihoodLevels: toLevels(row.likelihood_levels),
    consequenceLevels: toLevels(row.consequence_levels),
    scoreMethod: row.score_method,
    bands: toBands(row.bands),
  }));
}

export interface RegisterMatrixChange {
  matrixKey: string;
  changed: boolean;
  stamped: number;
}

export async function setRegisterRiskMatrix(
  orgId: string,
  matrixKey: string,
): Promise<RegisterMatrixChange> {
  const data = unwrap(
    await supabase.rpc("set_register_risk_matrix", { p_org: orgId, p_matrix_key: matrixKey }),
    "Changing the risk register's matrix",
  ) as Record<string, unknown>;
  return {
    matrixKey: typeof data["matrix_key"] === "string" ? data["matrix_key"] : matrixKey,
    changed: data["changed"] === true,
    stamped: Number(data["stamped"] ?? 0),
  };
}

export interface RescoreCandidate {
  riskId: string;
  ref: string;
  title: string;
  workspaceId: string;
  projectId: string | null;
  programmeId: string | null;
  portfolioId: string | null;
  updatedAt: string;
  fromMatrixName: string;
  probability: number;
  impact: number;
  score: number | null;
  bandLabel: string | null;
  bandColour: string | null;
  toMatrixName: string;
  proposedProbability: number;
  proposedImpact: number;
  proposedScore: number | null;
  proposedBandLabel: string | null;
  proposedBandColour: string | null;
  bandChanges: boolean;
}

export async function listRescoreCandidates(orgId: string): Promise<RescoreCandidate[]> {
  const rows = unwrap(
    await supabase.rpc("risk_rescore_candidates", { p_org: orgId }),
    "Loading risks to re-score",
  );
  return rows.map((row) => ({
    riskId: row.risk_id,
    ref: row.ref,
    title: row.title,
    workspaceId: row.workspace_id,
    projectId: row.project_id ?? null,
    programmeId: row.programme_id ?? null,
    portfolioId: row.portfolio_id ?? null,
    updatedAt: row.updated_at,
    fromMatrixName: row.from_matrix_name,
    probability: row.probability,
    impact: row.impact,
    score: row.score ?? null,
    bandLabel: row.band_label ?? null,
    bandColour: row.band_colour ?? null,
    toMatrixName: row.to_matrix_name,
    proposedProbability: row.proposed_probability,
    proposedImpact: row.proposed_impact,
    proposedScore: row.proposed_score ?? null,
    proposedBandLabel: row.proposed_band_label ?? null,
    proposedBandColour: row.proposed_band_colour ?? null,
    bandChanges: row.band_changes,
  }));
}

/** The rescore_risks payload for accepted candidates (each carries its updated_at, so stale ones are refused). */
export function rescoreItems(candidates: RescoreCandidate[]) {
  return candidates.map((c) => ({
    id: c.riskId,
    probability: c.proposedProbability,
    impact: c.proposedImpact,
    updated_at: c.updatedAt,
  }));
}

export async function rescoreRisks(orgId: string, candidates: RescoreCandidate[]) {
  return unwrap(
    await supabase.rpc("rescore_risks", { p_org: orgId, p_items: rescoreItems(candidates) }),
    "Re-scoring risks",
  );
}
