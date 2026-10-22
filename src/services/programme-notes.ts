// Programme office notes on Supabase (programme_office_notes, work package 1.5): one note per
// programme, edited by the programme's manager or the workspace's PMO / admin. The database
// stamps updated_by and updated_at; the update sends the note only (the only column the
// update grant allows) with the updated_at it loaded, through the shared write helper.
import { supabase } from "@/integrations/supabase/client";
import type { NewRow } from "./db";
import { unwrap, unwrapMaybe } from "./service-error";
import { insertRow, updateRow } from "./write";

export const NOTE_MAX_LENGTH = 10_000;

export interface ProgrammeNote {
  note: string;
  /** null until the first save: the next save creates the row. */
  updatedAt: string | null;
  updatedByName: string | null;
}

export async function getProgrammeNote(programmeId: string): Promise<ProgrammeNote> {
  const row = unwrapMaybe(
    await supabase
      .from("programme_office_notes")
      .select("note, updated_at, updated_by")
      .eq("programme_id", programmeId)
      .maybeSingle(),
    "Loading the office note",
  );
  if (!row) return { note: "", updatedAt: null, updatedByName: null };
  const profile = row.updated_by
    ? unwrap(
        await supabase.from("profiles").select("display_name").eq("id", row.updated_by),
        "Loading who updated the note",
      )[0]
    : undefined;
  return {
    note: row.note,
    updatedAt: row.updated_at,
    updatedByName: profile?.display_name ?? null,
  };
}

/** Create the note on its first save; afterwards update it, refusing if someone saved since. */
export function saveProgrammeNote(programmeId: string, note: string, lastSeen: string | null) {
  return lastSeen
    ? updateRow(
        "programme_office_notes",
        programmeId,
        { note },
        {
          context: "Saving the office note",
          lastSeen,
        },
      )
    : insertRow(
        "programme_office_notes",
        { programme_id: programmeId, note } as NewRow<"programme_office_notes">,
        "Saving the office note",
      );
}
