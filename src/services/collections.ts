// Collections (governance groups, priority sets, funding streams). Collections embed their
// project links (one FK); the collection type is an organisation list read alongside. Their
// packs come from the report builder (collection scope, GL-14).
//
// GL-22: PMO and admins in the collection's workspace create, edit, archive and delete
// collections and their project links (RLS). Archived collections are read-only until restored,
// and a collection that any report or forum is scoped to can't be deleted (database triggers,
// hints 'collection_archived' / 'collection_in_use'; docs/sql/gl-22-collections.sql).
import type { Health } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { listProjects, type ProjectSummary } from "./hierarchy";
import { listValueKey } from "./org-settings";
import { ServiceError, unwrap } from "./service-error";
import type { NewRow } from "./db";
import { deleteRow, insertRow, insertRows, updateRow, type Written } from "./write";

export type CollectionType = "Governance" | "Priority set" | "Funding stream";

/** The collection type that carries a pot and per-project awards. */
export const FUNDING_TYPE: CollectionType = "Funding stream";

export interface CollectionView {
  id: string;
  workspaceId: string;
  name: string;
  /**
   * Icon and behaviour, from the type's stored value (not its label), so renaming a type keeps
   * it; an organisation's own types read as Governance.
   */
  type: CollectionType;
  typeId: string;
  /** The organisation's label for the type, as shown in Settings › Lists. */
  typeLabel: string;
  potAmount: number | null;
  projectIds: string[];
  /** Award per project id (funding streams). */
  awards: Record<string, number>;
  archivedAt: string | null;
  updatedAt: string;
}

export interface CollectionTypeOption {
  id: string;
  label: string;
  /** Stable key (lookup_values.value); the built-in types keep theirs when renamed. */
  value: string;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
}

/** A type's behaviour from its stored value: only the built-in values have one. */
export const asType = (value: string | undefined): CollectionType =>
  value === "Priority set" || value === "Funding stream" ? value : "Governance";

/** Every collection type, hidden ones included, in the organisation's order (Settings › Lists). */
export async function listCollectionTypes(orgId: string): Promise<CollectionTypeOption[]> {
  const result = await supabase
    .from("lookup_values")
    .select("id, label, value, is_active, sort_order, updated_at")
    .eq("organisation_id", orgId)
    .eq("list_key", "collection_type")
    .order("sort_order");
  return unwrap(result, "Loading collection types").map((row) => ({
    id: row.id,
    label: row.label,
    value: row.value,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }));
}

export async function listCollections(orgId: string): Promise<CollectionView[]> {
  const [collections, types] = await Promise.all([
    supabase
      .from("collections")
      .select(
        "id, workspace_id, name, type_id, pot_amount, archived_at, updated_at, collection_projects(project_id, award_amount)",
      )
      .eq("organisation_id", orgId)
      .order("name"),
    supabase
      .from("lookup_values")
      .select("id, label, value")
      .eq("organisation_id", orgId)
      .eq("list_key", "collection_type"),
  ]);
  const typeRows = unwrap(types, "Loading collection types");
  const label = new Map(typeRows.map((row) => [row.id, row.label]));
  const value = new Map(typeRows.map((row) => [row.id, row.value]));
  return unwrap(collections, "Loading collections").map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: asType(value.get(row.type_id)),
    typeId: row.type_id,
    typeLabel: label.get(row.type_id) ?? "Collection",
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
    potAmount: row.pot_amount == null ? null : Number(row.pot_amount),
    projectIds: (row.collection_projects ?? []).map((link) => link.project_id),
    awards: Object.fromEntries(
      (row.collection_projects ?? [])
        .filter((link) => link.award_amount != null)
        .map((link) => [link.project_id, Number(link.award_amount)]),
    ),
  }));
}

export function collectionMetrics(projects: ProjectSummary[]) {
  const count = (health: Health) =>
    projects.filter((project) => project.health.overall === health).length;
  return {
    projectCount: projects.length,
    budget: projects.reduce((sum, project) => sum + project.budget, 0),
    forecast: projects.reduce((sum, project) => sum + project.forecast, 0),
    rag: { green: count("On Track"), amber: count("At Risk"), red: count("Off Track") },
  };
}

// ---------------------------------------------------------------------------------------------
// GL-22 helpers (pure, unit-tested in collections.test.ts)
// ---------------------------------------------------------------------------------------------

/** Does this type carry a pot and awards? Decided by the stored value, so a rename keeps it. */
export const isFundingType = (type: Pick<CollectionTypeOption, "value"> | null | undefined) =>
  asType(type?.value) === FUNDING_TYPE;

/** Why a type name can't be used ("" when it can): blank, too long, or already a type's name. */
export function typeNameError(
  label: string,
  types: readonly Pick<CollectionTypeOption, "id" | "label" | "isActive">[],
  exceptId?: string,
): string {
  const name = label.trim();
  if (!name) return "Give the type a name.";
  if (name.length > 80) return "Keep the name under 80 characters.";
  const taken = types.find(
    (type) => type.id !== exceptId && type.label.trim().toLowerCase() === name.toLowerCase(),
  );
  if (!taken) return "";
  return taken.isActive
    ? "There's already a type with that name."
    : "A hidden type has that name: show it again in Settings › Lists.";
}

/**
 * The stored value for a new type: the same key Settings › Lists makes from a label, with a
 * number added when a type (hidden ones included) already has it.
 */
export function newTypeValue(label: string, types: readonly Pick<CollectionTypeOption, "value">[]) {
  const base = listValueKey(label);
  const taken = new Set(types.map((type) => type.value));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/**
 * An amount typed by a person: blank → null; "£1,250,000", "1250000.50" → the number;
 * anything else, or a negative amount → "invalid".
 */
export function parseAmount(text: string): number | null | "invalid" {
  const cleaned = text.replace(/[\s,£$€]/g, "");
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return "invalid";
  const value = Number(cleaned);
  return Number.isFinite(value) && value <= 999_999_999_999.99 ? value : "invalid";
}

export interface CollectionDraft {
  name: string;
  typeId: string;
  workspaceId: string;
  /** The pot as typed; only used for funding types. */
  pot: string;
}

export type CollectionDraftErrors = Partial<Record<keyof CollectionDraft, string>>;

/** Field errors for the New / Edit collection form; an empty object when it can be saved. */
export function validateCollectionDraft(
  draft: CollectionDraft,
  funding: boolean,
): CollectionDraftErrors {
  const errors: CollectionDraftErrors = {};
  if (!draft.name.trim()) errors.name = "Give the collection a name.";
  else if (draft.name.trim().length > 200) errors.name = "Keep the name under 200 characters.";
  if (!draft.typeId) errors.typeId = "Choose a type.";
  if (!draft.workspaceId) errors.workspaceId = "Choose the workspace.";
  if (funding && parseAmount(draft.pot) === "invalid")
    errors.pot = "Enter the pot as an amount, e.g. 250000, or leave it blank.";
  return errors;
}

/**
 * Projects that can be added to a collection: the collection's workspace only (links are
 * workspace-scoped), not already in it, matching the search on name or code. Sorted by name.
 */
export function pickerCandidates(
  projects: readonly ProjectSummary[],
  collection: Pick<CollectionView, "workspaceId" | "projectIds">,
  search: string,
): ProjectSummary[] {
  const term = search.trim().toLowerCase();
  const inside = new Set(collection.projectIds);
  return projects
    .filter((project) => project.workspaceId === collection.workspaceId && !inside.has(project.id))
    .filter(
      (project) =>
        !term ||
        project.name.toLowerCase().includes(term) ||
        project.code.toLowerCase().includes(term),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Collections a project can be added to or removed from: same workspace, not archived. */
export function collectionsForProject(
  collections: readonly CollectionView[],
  project: Pick<ProjectSummary, "id" | "workspaceId">,
) {
  const inWorkspace = collections.filter((c) => c.workspaceId === project.workspaceId);
  return {
    member: collections.filter((c) => c.projectIds.includes(project.id)),
    editable: inWorkspace.filter((c) => !c.archivedAt),
  };
}

/** A collection with published packs is archived, not deleted. */
export const removalMode = (publishedReports: number): "archive" | "delete" =>
  publishedReports > 0 ? "archive" : "delete";

/** The typed confirmation for Delete must repeat the name (spaces at the ends ignored). */
export const confirmsName = (typed: string, name: string) => typed.trim() === name.trim();

/** The database refused a delete because a report or forum still uses the collection. */
export const isInUse = (error: unknown) =>
  error instanceof ServiceError && !!error.detail?.includes("collection_in_use");

// ---------------------------------------------------------------------------------------------
// GL-22 writes (shared write helper; RLS decides who may)
// ---------------------------------------------------------------------------------------------

export function createCollection(input: {
  workspaceId: string;
  name: string;
  typeId: string;
  potAmount: number | null;
}): Promise<Written> {
  // The workspace is the parent; the tenant guard fills organisation_id from it.
  const row = {
    workspace_id: input.workspaceId,
    name: input.name.trim(),
    type_id: input.typeId,
    pot_amount: input.potAmount,
  } as unknown as NewRow<"collections">;
  return insertRow("collections", row, "Creating the collection");
}

export function updateCollection(
  collection: Pick<CollectionView, "id" | "updatedAt">,
  fields: { name: string; typeId: string; potAmount: number | null },
): Promise<Written> {
  return updateRow(
    "collections",
    collection.id,
    { name: fields.name.trim(), type_id: fields.typeId, pot_amount: fields.potAmount },
    { context: "Saving the collection", lastSeen: collection.updatedAt },
  );
}

export function setCollectionArchived(
  collection: Pick<CollectionView, "id" | "updatedAt">,
  archived: boolean,
): Promise<Written> {
  return updateRow(
    "collections",
    collection.id,
    { archived_at: archived ? new Date().toISOString() : null },
    {
      context: archived ? "Archiving the collection" : "Restoring the collection",
      lastSeen: collection.updatedAt,
    },
  );
}

export function deleteCollection(id: string) {
  return deleteRow("collections", id, "Deleting the collection");
}

export function addCollectionProjects(
  collectionId: string,
  projectIds: readonly string[],
): Promise<Written[]> {
  // The tenant guard fills organisation_id and workspace_id from the collection.
  return insertRows(
    "collection_projects",
    projectIds.map(
      (projectId) =>
        ({ collection_id: collectionId, project_id: projectId }) as NewRow<"collection_projects">,
    ),
    projectIds.length === 1 ? "Adding the project" : "Adding the projects",
  );
}

export function removeCollectionProject(collectionId: string, projectId: string) {
  return deleteRow(
    "collection_projects",
    { collection_id: collectionId, project_id: projectId },
    "Removing the project",
  );
}

export function setCollectionAward(
  collectionId: string,
  projectId: string,
  amount: number | null,
): Promise<Written> {
  return updateRow(
    "collection_projects",
    { collection_id: collectionId, project_id: projectId },
    { award_amount: amount },
    { context: "Saving the award" },
  );
}

/** Add a collection type at the end of the organisation's list (organisation PMO / admin, RLS). */
export function addCollectionType(
  orgId: string,
  label: string,
  types: readonly Pick<CollectionTypeOption, "value" | "sortOrder">[],
): Promise<Written> {
  const row = {
    organisation_id: orgId,
    list_key: "collection_type",
    value: newTypeValue(label, types),
    label: label.trim(),
    sort_order: types.reduce((max, type) => Math.max(max, type.sortOrder), 0) + 1,
  } as unknown as NewRow<"lookup_values">;
  return insertRow("lookup_values", row, "Adding the collection type");
}

/** Rename a type: only the label changes, so its collections and behaviour stay the same. */
export function renameCollectionType(
  type: Pick<CollectionTypeOption, "id" | "updatedAt">,
  label: string,
): Promise<Written> {
  return updateRow(
    "lookup_values",
    type.id,
    { label: label.trim() },
    { context: "Renaming the collection type", lastSeen: type.updatedAt },
  );
}
