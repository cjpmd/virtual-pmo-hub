// The signed-in user's starred projects and programmes (user_favourites). Rows are private to
// the user (RLS on profile_id); the tenant guard fills organisation_id from the target.
import { supabase } from "@/integrations/supabase/client";
import { unwrap } from "./service-error";
import { deleteRows, insertRow } from "./write";

export interface FavouriteRow {
  id: string;
  projectId: string | null;
  programmeId: string | null;
}

export async function listFavourites(orgId: string): Promise<FavouriteRow[]> {
  const rows = unwrap(
    await supabase
      .from("user_favourites")
      .select("id, project_id, programme_id, created_at")
      .eq("organisation_id", orgId)
      .order("created_at"),
    "Loading favourites",
  );
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    programmeId: row.programme_id,
  }));
}

export async function addFavourite(target: { projectId: string } | { programmeId: string }) {
  return insertRow(
    "user_favourites",
    "projectId" in target ? { project_id: target.projectId } : { programme_id: target.programmeId },
    "Adding the favourite",
  );
}

export async function removeFavourite(id: string) {
  return deleteRows("user_favourites", [id], "Removing the favourite");
}
