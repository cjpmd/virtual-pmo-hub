// Project requests (portfolio intake) and their draft benefit profiles.
// Drafts embed under their request (single FK). People resolve through one resources query,
// because requests point at resources through two FKs (requester and sponsor).
import type { DraftBenefitProfile, Priority, ProjectRequest } from "@/data/types";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { classificationLabel } from "./benefits";
import { listPeople, type Person } from "./hierarchy";
import { priorityLabel, priorityValue } from "./labels";
import { ServiceError, unwrap } from "./service-error";
import { insertRow, updateRow } from "./write";

type RequestStatus = Database["public"]["Enums"]["request_status"];
export const requestStatusLabel: Record<RequestStatus, ProjectRequest["status"]> = {
  new: "New",
  in_review: "In Review",
  on_hold: "On Hold",
  approved: "Approved",
  rejected: "Rejected",
};
export const requestStatusValue = Object.fromEntries(
  Object.entries(requestStatusLabel).map(([key, value]) => [value, key]),
) as Record<ProjectRequest["status"], RequestStatus>;

export interface RequestView extends ProjectRequest {
  ref: string;
  portfolioId: string;
  requesterId: string | null;
  sponsorId: string | null;
  draftBenefits: DraftBenefitProfile[];
  updatedAt: string;
  /** Code of the project this was converted to, or null if not yet converted. */
  convertedProjectCode: string | null;
}

export async function listRequests(
  orgId: string,
): Promise<{ requests: RequestView[]; people: Person[] }> {
  const [requests, categories, people, converted] = await Promise.all([
    supabase
      .from("project_requests")
      .select(
        `id, ref, portfolio_id, title, status, estimated_cost, estimated_benefit, priority, alignment,
         themes, whole_life_cost, appraisal_years, requester_id, sponsor_id, updated_at,
         request_benefit_drafts(id, title, classification, measure, baseline, target, annual_value,
           years_counted, sort_order, owner_id, strategic_objective_id, category_id)`,
      )
      .eq("organisation_id", orgId)
      .order("ref"),
    supabase
      .from("lookup_values")
      .select("id, label")
      .eq("organisation_id", orgId)
      .eq("list_key", "benefit_category"),
    listPeople(orgId),
    supabase
      .from("projects")
      .select("code, converted_from_request_id")
      .eq("organisation_id", orgId)
      .not("converted_from_request_id", "is", null),
  ]);
  const names = new Map(people.map((person) => [person.id, person.name]));
  const nameOf = (id: string | null) => (id && names.get(id)) || "";
  const category = new Map(
    unwrap(categories, "Loading benefit categories").map((row) => [row.id, row.label]),
  );
  const convertedMap = new Map(
    unwrap(converted, "Loading converted requests").map((row) => [
      row.converted_from_request_id!,
      row.code,
    ]),
  );
  return {
    people,
    requests: unwrap(requests, "Loading requests").map((row) => ({
      id: row.id,
      ref: row.ref,
      portfolioId: row.portfolio_id,
      title: row.title,
      status: requestStatusLabel[row.status],
      requester: nameOf(row.requester_id),
      sponsor: nameOf(row.sponsor_id),
      requesterId: row.requester_id,
      sponsorId: row.sponsor_id,
      estimatedCost: Number(row.estimated_cost),
      estimatedBenefit: Number(row.estimated_benefit),
      priority: priorityLabel[row.priority],
      alignment: row.alignment ?? 0,
      themes: row.themes ?? [],
      ...(row.whole_life_cost !== null && { wholeLifeCost: Number(row.whole_life_cost) }),
      ...(row.appraisal_years !== null && { appraisalYears: row.appraisal_years }),
      draftBenefits: [...(row.request_benefit_drafts ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((draft) => ({
          id: draft.id,
          title: draft.title,
          classification: classificationLabel[draft.classification],
          category: (category.get(draft.category_id) ??
            "Efficiency") as DraftBenefitProfile["category"],
          owner: nameOf(draft.owner_id) || "Unassigned",
          measure: draft.measure ?? "",
          baseline: draft.baseline ?? "",
          target: draft.target ?? "",
          annualValue: Number(draft.annual_value),
          yearsCounted: draft.years_counted,
          strategicObjectiveId: draft.strategic_objective_id ?? "",
        })),
      updatedAt: row.updated_at,
      convertedProjectCode: convertedMap.get(row.id) ?? null,
    })),
  };
}

export interface RequestInput {
  title?: string;
  status?: ProjectRequest["status"];
  priority?: Priority;
  requesterId?: string | null;
  sponsorId?: string | null;
}

/** Managers only (RLS). */
export async function updateRequest(id: string, input: RequestInput, lastSeen?: string | null) {
  const fields = {
    ...(input.title !== undefined && { title: input.title.trim() }),
    ...(input.status !== undefined && { status: requestStatusValue[input.status] }),
    ...(input.priority !== undefined && { priority: priorityValue[input.priority] }),
    ...(input.requesterId !== undefined && { requester_id: input.requesterId }),
    ...(input.sponsorId !== undefined && { sponsor_id: input.sponsorId }),
  };
  if (!Object.keys(fields).length) return;
  return updateRow("project_requests", id, fields, { context: "Saving the request", lastSeen });
}

export async function createRequest(input: RequestInput & { title: string; portfolioId: string }) {
  if (!input.title.trim()) throw new ServiceError("invalid", "Give the request a title.");
  return insertRow(
    "project_requests",
    {
      title: input.title.trim(),
      portfolio_id: input.portfolioId,
      ...(input.status && { status: requestStatusValue[input.status] }),
      ...(input.priority && { priority: priorityValue[input.priority] }),
      requester_id: input.requesterId ?? null,
      sponsor_id: input.sponsorId ?? null,
    },
    "Adding the request",
  );
}

export interface ConvertRequestOverrides {
  name?: string;
  code?: string;
  tier?: "small" | "medium" | "large";
  programmeId?: string | null;
  managerId?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  phaseId?: string | null;
}

/** Managers only (RLS). Returns the new project id. */
export async function convertRequestToProject(
  requestId: string,
  overrides: ConvertRequestOverrides,
): Promise<string> {
  const p_overrides: Record<string, string> = {};
  if (overrides.name) p_overrides["name"] = overrides.name;
  if (overrides.code) p_overrides["code"] = overrides.code;
  if (overrides.tier) p_overrides["tier"] = overrides.tier;
  if (overrides.programmeId) p_overrides["programme_id"] = overrides.programmeId;
  if (overrides.managerId) p_overrides["manager_id"] = overrides.managerId;
  if (overrides.startDate) p_overrides["start_date"] = overrides.startDate;
  if (overrides.finishDate) p_overrides["finish_date"] = overrides.finishDate;
  if (overrides.phaseId) p_overrides["phase_id"] = overrides.phaseId;
  const { data, error } = await supabase.rpc("convert_request_to_project", {
    p_request_id: requestId,
    p_overrides,
  });
  if (error) throw new ServiceError("unknown", error.message);
  return data as string;
}
