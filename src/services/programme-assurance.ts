// Board assurance (NHS-1 part 3): assurance ratings given to a programme. Migration
// 20261122210000_nhs_1c_programme_assurance. Every rating is kept (history; the newest by date
// wins). The database stamps the scheme, checks the level and decides who may rate (workspace PMO
// and admins while the 'assurance' module is on). A new judgement is a new row; a mistaken one is
// deleted. Writes go through the shared write helper.
import { supabase } from "@/integrations/supabase/client";
import type { NewRow } from "./db";
import { unwrap } from "./service-error";
import { toAssuranceLevels, type AssuranceLevel } from "./strategic-risks";
import { deleteRows, insertRow } from "./write";

export type Direction = "new" | "better" | "worse" | "same";

export interface AssuranceScheme {
  id: string;
  key: string;
  name: string;
  organisationId: string | null;
  levels: AssuranceLevel[];
}

export interface ProgrammeRating {
  id: string;
  rating: string;
  label: string;
  colour: string | null;
  rationale: string;
  forumId: string | null;
  ratedOn: string;
  createdBy: string | null;
}

export interface ProgrammeAssurance {
  /** The scheme a new rating is given on (the organisation's assurance scheme). */
  scheme: AssuranceScheme | null;
  /** Newest first. */
  ratings: ProgrammeRating[];
  forums: Array<{ id: string; name: string }>;
}

const asObject = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * The scheme new ratings use, as private.assurance_rating_scheme picks it: the scheme named by
 * settings.assurance.ratingSchemeKey (the organisation's own first), else the organisation's own
 * assurance scheme, else the system 'nhs_assurance'. Pure; unit-tested.
 */
export function pickAssuranceScheme(
  schemes: AssuranceScheme[],
  orgId: string,
  settingsKey: string | null,
): AssuranceScheme | null {
  const mineFirst = (list: AssuranceScheme[]) =>
    [...list].sort(
      (a, b) => (a.organisationId === orgId ? 0 : 1) - (b.organisationId === orgId ? 0 : 1),
    );
  if (settingsKey) {
    const named = mineFirst(
      schemes.filter(
        (s) => s.key === settingsKey && (s.organisationId === orgId || s.organisationId === null),
      ),
    )[0];
    if (named) return named;
  }
  return (
    schemes.find((s) => s.organisationId === orgId) ??
    schemes.find((s) => s.organisationId === null && s.key === "nhs_assurance") ??
    null
  );
}

/** Direction of travel between the two newest ratings (lower position in the scheme is better). */
export function directionOf(ratings: ProgrammeRating[], scheme: AssuranceScheme | null): Direction {
  const [latest, previous] = ratings;
  if (!latest) return "new";
  if (!previous) return "new";
  const rank = (key: string) => scheme?.levels.findIndex((level) => level.key === key) ?? -1;
  const a = rank(latest.rating);
  const b = rank(previous.rating);
  if (a < 0 || b < 0 || a === b) return "same";
  return a < b ? "better" : "worse";
}

export const DIRECTION_TEXT: Record<Direction, string> = {
  new: "First rating",
  better: "Improved",
  worse: "Worse",
  same: "No change",
};

export async function loadProgrammeAssurance(
  orgId: string,
  programmeId: string,
): Promise<ProgrammeAssurance> {
  const [schemes, ratings, forums, org] = await Promise.all([
    supabase
      .from("rating_schemes")
      .select("id, key, name, levels, organisation_id, created_at")
      .eq("is_assurance", true)
      .order("created_at"),
    supabase
      .from("programme_assurance_ratings")
      .select("id, rating, rating_scheme_id, rationale, forum_id, rated_on, created_at, created_by")
      .eq("programme_id", programmeId)
      .order("rated_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("forums")
      .select("id, name")
      .eq("organisation_id", orgId)
      .is("archived_at", null)
      .order("name"),
    supabase.from("organisations").select("settings").eq("id", orgId).maybeSingle(),
  ]);
  const schemeList: AssuranceScheme[] = unwrap(schemes, "Loading assurance ratings").map((s) => ({
    id: s.id,
    key: s.key,
    name: s.name,
    organisationId: s.organisation_id,
    // Keep every level here (history may hold any of them); the form leaves out "not reported".
    levels: (Array.isArray(s.levels) ? s.levels : [])
      .map((item) => asObject(item))
      .filter((item) => typeof item["key"] === "string")
      .map((item) => ({
        key: item["key"] as string,
        label: typeof item["label"] === "string" ? item["label"] : (item["key"] as string),
        colour: typeof item["colour"] === "string" ? item["colour"] : null,
      })),
  }));
  const settingsKey = asObject(asObject(org.data?.settings)["assurance"])["ratingSchemeKey"];
  const scheme = pickAssuranceScheme(
    schemeList,
    orgId,
    typeof settingsKey === "string" && settingsKey ? settingsKey : null,
  );
  return {
    scheme,
    ratings: unwrap(ratings, "Loading the programme's assurance ratings").map((row) => {
      const level = schemeList
        .find((s) => s.id === row.rating_scheme_id)
        ?.levels.find((item) => item.key === row.rating);
      return {
        id: row.id,
        rating: row.rating,
        label: level?.label ?? row.rating,
        colour: level?.colour ?? null,
        rationale: row.rationale ?? "",
        forumId: row.forum_id,
        ratedOn: row.rated_on,
        createdBy: row.created_by,
      };
    }),
    forums: unwrap(forums, "Loading boards and committees"),
  };
}

/** The levels a person can choose when rating (not the "not reported" placeholder). */
export const ratingChoices = (scheme: AssuranceScheme | null): AssuranceLevel[] =>
  toAssuranceLevels(scheme?.levels ?? []);

export interface ProgrammeRatingInput {
  rating: string;
  rationale: string;
  forumId: string | null;
  ratedOn: string;
}

export function addProgrammeRating(programmeId: string, input: ProgrammeRatingInput) {
  // organisation_id and workspace_id are filled from the programme by the database.
  return insertRow(
    "programme_assurance_ratings",
    {
      programme_id: programmeId,
      rating: input.rating,
      rationale: input.rationale.trim() || null,
      forum_id: input.forumId,
      rated_on: input.ratedOn,
    } as NewRow<"programme_assurance_ratings">,
    "Recording the assurance rating",
  );
}

export function removeProgrammeRating(id: string) {
  return deleteRows("programme_assurance_ratings", [id], "Removing the assurance rating");
}
