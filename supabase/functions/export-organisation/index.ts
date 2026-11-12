// GL-11b: full organisation export (docs/design/account-closure.md §2.5).
// Body { organisation_id } with the caller's JWT:
//   1. public.start_organisation_export as the caller: organisation admins only, one export every
//      two minutes, audited (action 'update' on organisations, detail.event
//      'organisation.exported'). Works while the organisation is read-only or pending deletion
//      (no requireWritable: exporting is how an admin keeps their data).
//   2. As the service role, only for that organisation: organisation_export_plan (every public
//      table with organisation_id, generated from the catalog, plus the organisation row and its
//      members' profiles), then organisation_export_rows page by page into tables/<table>.json.
//      Secrets (token_hash) are left out in SQL. Storage files are listed in manifest.json, not
//      zipped (v1).
//   3. Uploads exports/<org>/<timestamp>.zip (private bucket, no user policies) and returns a
//      24-hour signed URL. This organisation's zips older than 7 days are removed as it goes.
// Body { mode: "cleanup" } with a service-role token (daily vpmo-export-cleanup job through the
// Vault secret organisation_export_url): removes every zip older than 7 days.
// No secrets beyond the defaults (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
import { Zip, ZipDeflate, strToU8 } from "npm:fflate@0.8.2";
import { UUID, adminClient, dbErrorResponse, json, serve, signedIn } from "../_shared/http.ts";
import { isServiceRoleRequest } from "../_shared/service-role.ts";
import { batches, walkObjects } from "../_shared/organisation-deletion.ts";
import {
  EXPORT_BUCKET,
  PAGE_SIZE,
  SIGNED_URL_SECONDS,
  buildManifest,
  countMismatches,
  downloadName,
  expiredExports,
  exportPath,
  pageOffsets,
  tableFile,
  type ExportPlan,
  type ListedObject,
  type StorageObjectRef,
} from "../_shared/organisation-export.ts";

type Admin = ReturnType<typeof adminClient>;

/** Removes zips older than 7 days in one organisation's folder. Returns how many. */
async function removeExpired(admin: Admin, folder: string, now: Date): Promise<number> {
  const listed: ListedObject[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(EXPORT_BUCKET).list(folder, { limit: 1000, offset });
    if (error) throw new Error(`list ${EXPORT_BUCKET}/${folder}: ${error.message}`);
    listed.push(...((data ?? []) as ListedObject[]));
    if ((data ?? []).length < 1000) break;
  }
  const expired = expiredExports(folder, listed, now);
  for (const chunk of batches(expired)) {
    const { error } = await admin.storage.from(EXPORT_BUCKET).remove(chunk);
    if (error) throw new Error(`remove ${EXPORT_BUCKET}: ${error.message}`);
  }
  return expired.length;
}

async function cleanup(admin: Admin) {
  const now = new Date();
  let removed = 0;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(EXPORT_BUCKET).list("", { limit: 1000, offset });
    if (error) return json({ error: error.message }, 500);
    for (const folder of data ?? []) if (!folder.id) removed += await removeExpired(admin, folder.name, now);
    if ((data ?? []).length < 1000) break;
  }
  console.log("export-organisation cleanup", { removed });
  return json({ removed });
}

serve("export-organisation", async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body?.mode === "cleanup") {
    if (!isServiceRoleRequest(req.headers.get("Authorization"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")))
      return json({ error: "Service role only." }, 403);
    return cleanup(adminClient());
  }

  const auth = await signedIn(req);
  if (!auth) return json({ error: "Sign in first." }, 401);
  const organisationId = String(body?.organisation_id ?? "");
  if (!UUID.test(organisationId)) return json({ error: "Choose an organisation.", code: "bad_request" }, 400);

  // 1. Admin check, rate limit and audit, as the caller. Nothing below runs unless this passes.
  const { error: startError } = await auth.client.rpc("start_organisation_export", { p_organisation_id: organisationId });
  if (startError) return dbErrorResponse(startError, "Couldn't start the export.");

  // 2. Read as the service role, for this organisation only.
  const admin = adminClient();
  const exportedAt = new Date();
  const { data: planData, error: planError } = await admin.rpc("organisation_export_plan", { p_organisation_id: organisationId });
  if (planError) return dbErrorResponse(planError, "Couldn't read the organisation's tables.");
  const plan = planData as ExportPlan;
  const { data: org } = await admin.from("organisations").select("name").eq("id", organisationId).maybeSingle();
  const organisationName = String(org?.name ?? "");

  const chunks: Uint8Array[] = [];
  let zipError: Error | null = null;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  const zip = new Zip((err, data, final) => {
    if (err) zipError = err;
    else chunks.push(data);
    if (final || err) finish();
  });
  const addText = (name: string, text: string) => {
    const file = new ZipDeflate(name, { level: 6 });
    zip.add(file);
    file.push(strToU8(text), true);
  };

  const written: Record<string, number> = {};
  for (const table of plan.tables) {
    // One file per table, streamed a page at a time: "[" row, row, ... "]".
    const file = new ZipDeflate(tableFile(table.table), { level: 6 });
    zip.add(file);
    file.push(strToU8("["));
    let count = 0;
    // Read one page past the planned count, in case rows were added since the plan.
    for (const offset of [...pageOffsets(table.rows, PAGE_SIZE), Math.ceil(table.rows / PAGE_SIZE) * PAGE_SIZE]) {
      const { data, error } = await admin.rpc("organisation_export_rows", {
        p_organisation_id: organisationId,
        p_table: table.table,
        p_offset: offset,
        p_limit: PAGE_SIZE,
      });
      if (error) return dbErrorResponse(error, `Couldn't export ${table.table}.`);
      const rows = (data ?? []) as unknown[];
      if (rows.length) file.push(strToU8((count ? "," : "") + rows.map((row) => JSON.stringify(row)).join(",")));
      count += rows.length;
      if (rows.length < PAGE_SIZE) break;
    }
    file.push(strToU8("]"), true);
    written[table.table] = count;
  }

  const storage: StorageObjectRef[] = [];
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
  if (bucketError) return json({ error: "Couldn't list the organisation's files." }, 500);
  for (const bucket of buckets ?? []) {
    if (bucket.id === EXPORT_BUCKET) continue;
    const paths = await walkObjects(
      { list: (b, prefix, options) => admin.storage.from(b).list(prefix, options) },
      bucket.id,
      organisationId,
    );
    for (const path of paths) storage.push({ bucket: bucket.id, path });
  }

  const manifest = {
    ...buildManifest({ plan, organisationName, requestedBy: auth.user.id, exportedAt, written, storage }),
    changed_during_export: countMismatches(plan, written),
  };
  addText("manifest.json", JSON.stringify(manifest, null, 2));
  zip.end();
  await finished;
  if (zipError) throw zipError;

  // 3. Upload, sign, tidy.
  const path = exportPath(organisationId, exportedAt);
  const blob = new Blob(chunks, { type: "application/zip" });
  const { error: uploadError } = await admin.storage.from(EXPORT_BUCKET).upload(path, blob, { contentType: "application/zip" });
  if (uploadError) {
    console.error("export-organisation upload", organisationId, uploadError.message);
    return json({ error: "Couldn't save the export. Please try again." }, 500);
  }
  const { data: signed, error: signError } = await admin.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS, { download: downloadName(organisationName, exportedAt) });
  if (signError || !signed?.signedUrl) return json({ error: "Couldn't create the download link." }, 500);
  await removeExpired(admin, organisationId, exportedAt).catch((err) => console.error("export-organisation tidy", err));

  console.log("export-organisation", { organisation: organisationId, tables: plan.tables.length, rows: manifest.total_rows, bytes: blob.size });
  return json({
    url: signed.signedUrl,
    expires_at: new Date(exportedAt.getTime() + SIGNED_URL_SECONDS * 1000).toISOString(),
    tables: plan.tables.length,
    rows: manifest.total_rows,
    files_listed: storage.length,
    bytes: blob.size,
  });
});
