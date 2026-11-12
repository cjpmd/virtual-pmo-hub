// GL-11b: "Export all data (zip)" in Settings › Data. The edge function export-organisation
// checks the caller is an organisation admin (start_organisation_export), writes every
// organisation table as JSON plus a manifest into a zip, and returns a 24-hour download link.
// Works while the organisation is read-only or pending deletion.
import { invokeFunction } from "./functions";

export interface OrganisationExport {
  url: string;
  expires_at: string;
  tables: number;
  rows: number;
  files_listed: number;
  bytes: number;
}

export function exportAllData(organisationId: string): Promise<OrganisationExport> {
  return invokeFunction<OrganisationExport>(
    "export-organisation",
    { organisation_id: organisationId },
    "Couldn't export the organisation's data.",
  );
}
