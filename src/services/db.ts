import type { Database } from "@/integrations/supabase/types";

type PublicTables = Database["public"]["Tables"];
export type TableName = keyof PublicTables;
export type Row<T extends TableName> = PublicTables[T]["Row"];
export type Update<T extends TableName> = PublicTables[T]["Update"];

/**
 * Columns the database fills on insert: the tenant guard copies organisation_id/workspace_id
 * from the parent row (and overwrites anything sent), and assign_ref() numbers `ref`.
 * The generated types can't see triggers, so they mark these as required.
 */
type TriggerFilled = "organisation_id" | "workspace_id" | "ref";

export type NewRow<T extends TableName> = Omit<PublicTables[T]["Insert"], TriggerFilled>;

/** Widens a trigger-filled insert to the generated Insert type. The only cast services need. */
export const forInsert = <T extends TableName>(values: NewRow<T>) =>
  values as unknown as PublicTables[T]["Insert"];
