// GL-9 sample data (docs/sql/gl-9-sample-data.sql). seed_sample_data creates a small, sector-
// worded portfolio for a new organisation; remove_sample_data archives it (nothing is deleted).
// Sample rows carry is_sample; the screens show a "Sample" chip from the ids read here.
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";

export type SampleKind =
  "portfolio" | "programme" | "project" | "risk" | "issue" | "decision" | "benefit";

export type SampleIds = Record<SampleKind, ReadonlySet<string>> & {
  /** Project codes too: project boards key their rows by code. */
  projectCode: ReadonlySet<string>;
  /** Sample data that hasn't been removed: a portfolio still active. */
  active: boolean;
};

export const emptySampleIds: SampleIds = {
  portfolio: new Set(),
  programme: new Set(),
  project: new Set(),
  risk: new Set(),
  issue: new Set(),
  decision: new Set(),
  benefit: new Set(),
  projectCode: new Set(),
  active: false,
};

/** Is this record sample data? Unknown ids and a not-yet-loaded set read as not sample. */
export const isSample = (
  ids: SampleIds | undefined,
  kind: SampleKind | "projectCode",
  id: string | null | undefined,
) => !!ids && !!id && ids[kind].has(id);

/** Every sample row's id (archived too: removed sample records still show the chip). */
export async function listSampleIds(orgId: string): Promise<SampleIds> {
  const ids = (table: "programmes" | "risks" | "issues" | "decisions" | "benefits") =>
    supabase.from(table).select("id").eq("organisation_id", orgId).eq("is_sample", true);
  const [portfolios, programmes, projects, risks, issues, decisions, benefits] = await Promise.all([
    supabase
      .from("portfolios")
      .select("id, archived_at")
      .eq("organisation_id", orgId)
      .eq("is_sample", true),
    ids("programmes"),
    supabase.from("projects").select("id, code").eq("organisation_id", orgId).eq("is_sample", true),
    ids("risks"),
    ids("issues"),
    ids("decisions"),
    ids("benefits"),
  ]);
  const portfolioRows = unwrap(portfolios, "Loading sample data");
  const projectRows = unwrap(projects, "Loading sample data");
  const set = (rows: { id: string }[]) => new Set(rows.map((row) => row.id));
  return {
    portfolio: set(portfolioRows),
    programme: set(unwrap(programmes, "Loading sample data")),
    project: set(projectRows),
    projectCode: new Set(projectRows.map((row) => row.code)),
    risk: set(unwrap(risks, "Loading sample data")),
    issue: set(unwrap(issues, "Loading sample data")),
    decision: set(unwrap(decisions, "Loading sample data")),
    benefit: set(unwrap(benefits, "Loading sample data")),
    active: portfolioRows.some((row) => row.archived_at === null),
  };
}

/** Admins only (checked in the database). Refused while sample data is still active. */
export async function seedSampleData(orgId: string): Promise<void> {
  unwrap(await supabase.rpc("seed_sample_data", { p_org: orgId }), "Adding sample data");
}

/** Admins only. Archives the sample hierarchy and closes its open records. */
export async function removeSampleData(orgId: string): Promise<number> {
  const result = unwrap(
    await supabase.rpc("remove_sample_data", { p_org: orgId }),
    "Removing sample data",
  ) as { projects_archived?: number };
  return result.projects_archived ?? 0;
}
