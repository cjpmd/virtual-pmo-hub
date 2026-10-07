// Business cases and their documents (design: docs/financials-and-business-cases.md §2, §3).
//
//   reads  – the case for a project or request, its versions (with sections, options and
//            benefits), the organisation's templates and the case's documents
//   writes – section, option and benefit edits through the shared write helper (optimistic
//            concurrency); starting a version and submitting are RPCs, so the freeze and the
//            submit checks run in the database
//   files  – documents row first, then the upload to its storage path; downloads by a
//            five-minute signed URL; archive instead of delete. A row whose upload never
//            landed shows as "Upload incomplete" (Retry or Remove).
//
// RLS decides who may edit; the screens only avoid offering what would be refused.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ServiceError, fromPostgrest, unwrap, unwrapMaybe } from "./service-error";
import { deleteRows, insertRow, updateRow } from "./write";

export type BusinessCaseStatus = Database["public"]["Enums"]["business_case_status"];
export type BenefitClassification = Database["public"]["Enums"]["benefit_classification"];

export const businessCaseStatusLabel: Record<BusinessCaseStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  superseded: "Superseded",
};

export const classificationLabel: Record<BenefitClassification, string> = {
  cash_releasing: "Cash releasing",
  non_cash_releasing: "Non-cash releasing",
  qualitative: "Qualitative",
  societal: "Societal",
};

export type CaseOwner = { projectId: string } | { requestId: string };

export interface CaseSection {
  id: string;
  key: string;
  title: string;
  guidance: string | null;
  isRequired: boolean;
  content: string;
  updatedAt: string;
}

export interface CaseOption {
  id: string;
  name: string;
  description: string | null;
  wholeLifeCost: number | null;
  deliveryCost: number | null;
  benefitsSummary: string | null;
  riskSummary: string | null;
  isPreferred: boolean;
  updatedAt: string;
}

export interface CaseBenefit {
  id: string;
  title: string;
  classification: BenefitClassification;
  categoryId: string;
  measure: string | null;
  annualValue: number;
  yearsCounted: number;
  updatedAt: string;
}

export interface CaseVersion {
  id: string;
  version: number;
  status: BusinessCaseStatus;
  wholeLifeCost: number | null;
  fundingRequested: number | null;
  createdAt: string;
  submittedAt: string | null;
  submittedBy: string | null;
  decidedAt: string | null;
  updatedAt: string;
  sections: CaseSection[];
  options: CaseOption[];
  benefits: CaseBenefit[];
}

export interface CaseDocument {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  storagePath: string;
  uploadedBy: string | null;
  uploadedById: string | null;
  createdAt: string;
  archivedAt: string | null;
  /** False when the row exists but its file never finished uploading. */
  uploaded: boolean;
}

export interface BusinessCase {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
  versions: CaseVersion[];
}

type OptionRow = {
  id: string;
  name: string;
  description: string | null;
  whole_life_cost: number | null;
  delivery_cost: number | null;
  benefits_summary: string | null;
  risk_summary: string | null;
  is_preferred: boolean;
  sort_order: number;
  updated_at: string;
};

const num = (value: number | string | null) => (value === null ? null : Number(value));

export async function getBusinessCase(owner: CaseOwner): Promise<BusinessCase | null> {
  let query = supabase
    .from("business_cases")
    .select(
      `id, workspace_id, title, updated_at,
       business_case_versions(id, version, status, whole_life_cost, funding_requested, created_at,
         submitted_at, decided_at, updated_at, submitter:profiles!business_case_versions_submitted_by_fkey(display_name),
         business_case_sections(id, key, title, is_required, content, sort_order, updated_at,
           template:business_case_templates(guidance)),
         business_case_options(id, name, description, whole_life_cost, delivery_cost, benefits_summary,
           risk_summary, is_preferred, sort_order, updated_at),
         business_case_benefits(id, title, classification, category_id, measure, annual_value,
           years_counted, sort_order, updated_at))`,
    );
  query =
    "projectId" in owner
      ? query.eq("project_id", owner.projectId)
      : query.eq("request_id", owner.requestId);
  const row = unwrapMaybe(await query.maybeSingle(), "Loading the business case");
  if (!row) return null;
  const bySort = <T extends { sort_order: number }>(items: T[]) =>
    [...items].sort((a, b) => a.sort_order - b.sort_order);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    updatedAt: row.updated_at,
    versions: [...row.business_case_versions]
      .sort((a, b) => b.version - a.version)
      .map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        wholeLifeCost: num(v.whole_life_cost),
        fundingRequested: num(v.funding_requested),
        createdAt: v.created_at,
        submittedAt: v.submitted_at,
        submittedBy: v.submitter?.display_name ?? null,
        decidedAt: v.decided_at,
        updatedAt: v.updated_at,
        sections: bySort(v.business_case_sections).map((s) => ({
          id: s.id,
          key: s.key,
          title: s.title,
          guidance: s.template?.guidance ?? null,
          isRequired: s.is_required,
          content: s.content,
          updatedAt: s.updated_at,
        })),
        options: bySort(v.business_case_options as unknown as OptionRow[]).map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description,
          wholeLifeCost: num(o.whole_life_cost),
          deliveryCost: num(o.delivery_cost),
          benefitsSummary: o.benefits_summary,
          riskSummary: o.risk_summary,
          isPreferred: o.is_preferred,
          updatedAt: o.updated_at,
        })),
        benefits: bySort(v.business_case_benefits).map((b) => ({
          id: b.id,
          title: b.title,
          classification: b.classification,
          categoryId: b.category_id,
          measure: b.measure,
          annualValue: Number(b.annual_value),
          yearsCounted: b.years_counted,
          updatedAt: b.updated_at,
        })),
      })),
  };
}

/** Create the case, then its first draft (sections from the templates). */
export async function createBusinessCase(owner: CaseOwner, title: string) {
  if (!title.trim()) throw new ServiceError("invalid", "Give the business case a title.");
  const written = await insertRow(
    "business_cases",
    {
      title: title.trim(),
      ...("projectId" in owner ? { project_id: owner.projectId } : { request_id: owner.requestId }),
    },
    "Creating the business case",
  );
  await startVersion(written.id);
  return written.id;
}

/** Version 1 from the templates, or a copy of the latest version as the next draft. */
export async function startVersion(businessCaseId: string) {
  return unwrap(
    await supabase.rpc("start_business_case_version", { p_business_case_id: businessCaseId }),
    "Starting a new version",
  );
}

export async function submitVersion(versionId: string) {
  unwrap(
    await supabase.rpc("submit_business_case", { p_version_id: versionId }),
    "Submitting the business case",
  );
}

export async function saveSection(id: string, content: string, lastSeen: string) {
  return updateRow(
    "business_case_sections",
    id,
    { content },
    { context: "Saving the section", lastSeen },
  );
}

export interface OptionInput {
  name: string;
  description: string;
  wholeLifeCost: number | null;
  deliveryCost: number | null;
  benefitsSummary: string;
  riskSummary: string;
}

const optionFields = (input: OptionInput) => {
  if (!input.name.trim()) throw new ServiceError("invalid", "Give the option a name.");
  return {
    name: input.name.trim(),
    description: input.description.trim() || null,
    whole_life_cost: input.wholeLifeCost,
    delivery_cost: input.deliveryCost,
    benefits_summary: input.benefitsSummary.trim() || null,
    risk_summary: input.riskSummary.trim() || null,
  };
};

export async function addOption(versionId: string, input: OptionInput, sortOrder: number) {
  return insertRow(
    "business_case_options",
    { version_id: versionId, sort_order: sortOrder, ...optionFields(input) },
    "Adding the option",
  );
}

export async function updateOption(id: string, input: OptionInput, lastSeen: string) {
  return updateRow("business_case_options", id, optionFields(input), {
    context: "Saving the option",
    lastSeen,
  });
}

/** One write: the database clears the version's other preferred option first. */
export async function setPreferredOption(id: string, lastSeen: string) {
  return updateRow(
    "business_case_options",
    id,
    { is_preferred: true },
    { context: "Choosing the preferred option", lastSeen },
  );
}

export async function deleteOption(id: string) {
  await deleteRows("business_case_options", [id], "Removing the option");
}

export interface BenefitInput {
  title: string;
  classification: BenefitClassification;
  categoryId: string;
  measure: string;
  annualValue: number;
  yearsCounted: number;
}

const benefitFields = (input: BenefitInput) => {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the benefit a title.");
  if (!input.categoryId) throw new ServiceError("invalid", "Choose a benefit category.");
  return {
    title: input.title.trim(),
    classification: input.classification,
    category_id: input.categoryId,
    measure: input.measure.trim() || null,
    annual_value: input.annualValue,
    years_counted: input.yearsCounted,
  };
};

export async function addBenefit(versionId: string, input: BenefitInput, sortOrder: number) {
  return insertRow(
    "business_case_benefits",
    { version_id: versionId, sort_order: sortOrder, ...benefitFields(input) },
    "Adding the benefit",
  );
}

export async function updateBenefit(id: string, input: BenefitInput, lastSeen: string) {
  return updateRow("business_case_benefits", id, benefitFields(input), {
    context: "Saving the benefit",
    lastSeen,
  });
}

export async function deleteBenefit(id: string) {
  await deleteRows("business_case_benefits", [id], "Removing the benefit");
}

export async function listBenefitCategories(orgId: string) {
  return unwrap(
    await supabase
      .from("lookup_values")
      .select("id, label")
      .eq("organisation_id", orgId)
      .eq("list_key", "benefit_category")
      .eq("is_active", true)
      .order("sort_order"),
    "Loading benefit categories",
  );
}

// ---- Documents ----------------------------------------------------------------------------

export const DOCUMENT_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
};
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

export function checkDocumentFile(file: File) {
  if (!DOCUMENT_TYPES[file.type])
    throw new ServiceError("invalid", "Upload a PDF, Word, Excel or PowerPoint file.");
  if (file.size > DOCUMENT_MAX_BYTES) throw new ServiceError("invalid", "Files can be up to 25 MB.");
  if (file.size === 0) throw new ServiceError("invalid", "That file is empty.");
}

export async function listCaseDocuments(businessCaseId: string): Promise<CaseDocument[]> {
  const rows = unwrap(
    await supabase
      .from("documents")
      .select(
        "id, file_name, mime_type, size_bytes, version, storage_path, created_at, archived_at, uploaded_by, uploader:profiles!documents_uploaded_by_fkey(display_name)",
      )
      .eq("business_case_id", businessCaseId)
      .order("file_name")
      .order("version", { ascending: false }),
    "Loading documents",
  );
  // Which files actually landed: list the objects in the case's folder.
  const prefix = rows[0]?.storage_path.split("/").slice(0, 4).join("/");
  const present = new Set<string>();
  if (prefix) {
    const folders = await supabase.storage.from("documents").list(prefix, { limit: 1000 });
    await Promise.all(
      (folders.data ?? []).map(async (folder) => {
        const files = await supabase.storage.from("documents").list(`${prefix}/${folder.name}`);
        for (const file of files.data ?? []) present.add(`${prefix}/${folder.name}/${file.name}`);
      }),
    );
  }
  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    version: row.version,
    storagePath: row.storage_path,
    uploadedBy: row.uploader?.display_name ?? null,
    uploadedById: row.uploaded_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    uploaded: present.has(row.storage_path),
  }));
}

/** Documents row first (the storage policy only accepts its exact path), then the file. */
export async function uploadCaseDocument(businessCaseId: string, file: File) {
  checkDocumentFile(file);
  const inserted = await supabase
    .from("documents")
    .insert({
      scope: "business_case",
      business_case_id: businessCaseId,
      file_name: file.name.replace(/[/\\]/g, "-").slice(0, 200),
      mime_type: file.type,
      size_bytes: file.size,
    } as never)
    .select("id, storage_path")
    .single();
  if (inserted.error) throw fromPostgrest(inserted.error, "Adding the document", inserted.status);
  const row = inserted.data as { id: string; storage_path: string };
  await uploadFile(row.storage_path, file);
  return row.id;
}

/** Upload (or retry) the file for an existing documents row. */
export async function uploadFile(storagePath: string, file: File) {
  checkDocumentFile(file);
  const upload = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false, contentType: file.type });
  if (upload.error)
    throw new ServiceError(
      "network",
      `Uploading the file: ${upload.error.message}. It's listed as "Upload incomplete"; retry or remove it.`,
    );
}

/** The one delete allowed: an incomplete upload, by its uploader (RLS checks both). */
export async function removeIncompleteDocument(id: string) {
  await deleteRows("documents", [id], "Removing the incomplete upload");
}

export async function archiveCaseDocument(id: string) {
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
export async function documentUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(storagePath, 5 * 60);
  if (error || !data) throw new ServiceError("not_found", "That file couldn't be found.");
  return data.signedUrl;
}
