/**
 * Uploads the demo organisation's acceptance evidence: one small placeholder PDF (watermarked
 * "Demo placeholder") per entry in capabilityEvidence, through the Storage API, then creates the
 * matching documents row. Never the other way round: a documents row is only inserted once its
 * object is stored, and if the insert fails the object is removed again.
 *
 * Run after supabase/seed.sql (or scripts/demo-benefits-pathway.sql), with the service role:
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-demo-files.ts
 *
 * Safe to run again: evidence already stored is skipped.
 */
import { createHash, randomUUID } from "node:crypto";
import { capabilityEvidence } from "./seed-data/benefits-pathway";
import { placeholderPdf } from "./lib/placeholder-pdf";

/** The same ids as scripts/generate-seed.ts (uuidLiteral and u(uid(...))). */
const nameUuid = (kind: string, id: string) => {
  const h = createHash("sha1").update(`virtual-pmo-demo:${kind}:${id}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
const md5Uuid = (text: string) => {
  const x = createHash("md5").update(text).digest("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
export const DEMO_ORG = nameUuid("organisation", "demo");
export const DEMO_WS = nameUuid("workspace", "dts");
export const capabilityUuid = (id: string) =>
  md5Uuid(
    `virtual-pmo-demo:${createHash("sha1").update(`capability:${id}`).digest("hex").slice(0, 12)}`,
  );

/** The few calls the script makes, so the ordering rule can be tested without a server. */
export interface EvidenceStore {
  /** Non-archived evidence rows for a capability and file name. */
  findDocument(
    capabilityId: string,
    fileName: string,
  ): Promise<{ id: string; storage_path: string } | null>;
  objectExists(path: string): Promise<boolean>;
  upload(path: string, bytes: Uint8Array): Promise<void>;
  removeObject(path: string): Promise<void>;
  /** Inserts the row and returns the storage_path the database set. */
  insertDocument(row: {
    id: string;
    scope: "capability";
    capability_id: string;
    file_name: string;
    mime_type: string;
    size_bytes: number;
  }): Promise<string>;
}

export interface EvidenceResult {
  fileName: string;
  outcome: "uploaded" | "already stored" | "failed";
  detail?: string;
}

export async function seedEvidence(
  store: EvidenceStore,
  newId: () => string = randomUUID,
): Promise<EvidenceResult[]> {
  const results: EvidenceResult[] = [];
  for (const item of capabilityEvidence) {
    const capabilityId = capabilityUuid(item.capabilityId);
    try {
      const existing = await store.findDocument(capabilityId, item.fileName);
      if (existing) {
        if (await store.objectExists(existing.storage_path)) {
          results.push({ fileName: item.fileName, outcome: "already stored" });
        } else {
          results.push({
            fileName: item.fileName,
            outcome: "failed",
            detail: `documents row ${existing.id} has no stored object; archive it and run again`,
          });
        }
        continue;
      }
      const id = newId();
      const path = `${DEMO_ORG}/${DEMO_WS}/capability/${capabilityId}/${id}/${item.fileName}`;
      const bytes = placeholderPdf(item.title, [
        `Capability evidence for the Virtual PMO demo organisation.`,
        `File: ${item.fileName}`,
        `This placeholder stands in for the signed document a real organisation would attach.`,
      ]);
      await store.upload(path, bytes);
      try {
        const stored = await store.insertDocument({
          id,
          scope: "capability",
          capability_id: capabilityId,
          file_name: item.fileName,
          mime_type: "application/pdf",
          size_bytes: bytes.byteLength,
        });
        if (stored !== path) throw new Error(`storage_path mismatch: database set ${stored}`);
      } catch (error) {
        await store.removeObject(path);
        throw error;
      }
      results.push({ fileName: item.fileName, outcome: "uploaded" });
    } catch (error) {
      results.push({
        fileName: item.fileName,
        outcome: "failed",
        detail: (error as Error).message,
      });
    }
  }
  return results;
}

async function main() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    console.error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the service role: the script bypasses RLS).",
    );
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const bucket = db.storage.from("documents");
  const store: EvidenceStore = {
    async findDocument(capabilityId, fileName) {
      const { data, error } = await db
        .from("documents")
        .select("id, storage_path")
        .eq("capability_id", capabilityId)
        .eq("file_name", fileName)
        .is("archived_at", null)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    async objectExists(path) {
      const folder = path.slice(0, path.lastIndexOf("/"));
      const { data, error } = await bucket.list(folder);
      if (error) throw new Error(error.message);
      return data.some((o) => `${folder}/${o.name}` === path);
    },
    async upload(path, bytes) {
      const { error } = await bucket.upload(path, bytes, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (error) throw new Error(`upload failed: ${error.message}`);
    },
    async removeObject(path) {
      await bucket.remove([path]);
    },
    async insertDocument(row) {
      const { data, error } = await db
        .from("documents")
        .insert(row)
        .select("storage_path")
        .single();
      if (error) throw new Error(`documents insert failed: ${error.message}`);
      return data.storage_path as string;
    },
  };
  const results = await seedEvidence(store);
  for (const r of results)
    console.log(`${r.outcome.padEnd(14)} ${r.fileName}${r.detail ? ` (${r.detail})` : ""}`);
  if (results.some((r) => r.outcome === "failed")) process.exit(1);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
