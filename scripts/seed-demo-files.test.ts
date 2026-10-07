import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { capabilityEvidence } from "./seed-data/benefits-pathway";
import {
  capabilityUuid,
  DEMO_ORG,
  DEMO_WS,
  seedEvidence,
  type EvidenceStore,
} from "./seed-demo-files";

/** An in-memory store that records the order of calls and can be told to fail. */
function fakeStore(fail: { upload?: string; insert?: string } = {}) {
  const objects = new Set<string>();
  const rows: Array<{
    id: string;
    capability_id: string;
    file_name: string;
    storage_path: string;
  }> = [];
  const calls: string[] = [];
  const store: EvidenceStore = {
    async findDocument(capabilityId, fileName) {
      return rows.find((r) => r.capability_id === capabilityId && r.file_name === fileName) ?? null;
    },
    async objectExists(path) {
      return objects.has(path);
    },
    async upload(path) {
      calls.push(`upload ${path}`);
      if (fail.upload && path.endsWith(fail.upload)) throw new Error("upload failed: boom");
      objects.add(path);
    },
    async removeObject(path) {
      calls.push(`remove ${path}`);
      objects.delete(path);
    },
    async insertDocument(row) {
      calls.push(`insert ${row.file_name}`);
      if (fail.insert === row.file_name) throw new Error("documents insert failed: boom");
      // What the documents trigger sets.
      const storage_path = `${DEMO_ORG}/${DEMO_WS}/capability/${row.capability_id}/${row.id}/${row.file_name}`;
      rows.push({
        id: row.id,
        capability_id: row.capability_id,
        file_name: row.file_name,
        storage_path,
      });
      return storage_path;
    },
  };
  return { store, objects, rows, calls };
}

let n = 0;
const ids = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("seedEvidence", () => {
  it("matches the seed's ids", () => {
    // supabase/seed.sql: "Optimised service desk triage" is u('243a473e70eb'), i.e.
    // md5('virtual-pmo-demo:243a473e70eb')::uuid; the organisation and workspace are literals.
    const x = createHash("md5").update("virtual-pmo-demo:243a473e70eb").digest("hex");
    expect(capabilityUuid("cap-opt-triage")).toBe(
      `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`,
    );
    expect(DEMO_ORG).toBe("98e086a1-6b01-521a-92e9-21dac759c8f4");
    expect(DEMO_WS).toBe("82604b87-8dc3-5520-bbb1-0735382462c0");
  });

  it("uploads every file before inserting its row, then skips them on a second run", async () => {
    const { store, objects, rows, calls } = fakeStore();
    const first = await seedEvidence(store, ids);
    expect(first.map((r) => r.outcome)).toEqual(capabilityEvidence.map(() => "uploaded"));
    expect(rows).toHaveLength(capabilityEvidence.length);
    for (const row of rows) {
      expect(objects.has(row.storage_path)).toBe(true);
      expect(calls.indexOf(`upload ${row.storage_path}`)).toBeLessThan(
        calls.indexOf(`insert ${row.file_name}`),
      );
    }
    const second = await seedEvidence(store, ids);
    expect(second.map((r) => r.outcome)).toEqual(capabilityEvidence.map(() => "already stored"));
    expect(rows).toHaveLength(capabilityEvidence.length);
  });

  it("never creates a row when the upload fails", async () => {
    const target = capabilityEvidence[0]!.fileName;
    const { store, rows, calls } = fakeStore({ upload: target });
    const results = await seedEvidence(store, ids);
    expect(results[0]).toMatchObject({ outcome: "failed" });
    expect(rows.some((r) => r.file_name === target)).toBe(false);
    expect(calls).not.toContain(`insert ${target}`);
  });

  it("removes the stored object when the row insert fails", async () => {
    const target = capabilityEvidence[1]!.fileName;
    const { store, objects, rows } = fakeStore({ insert: target });
    const results = await seedEvidence(store, ids);
    expect(results[1]).toMatchObject({ outcome: "failed" });
    expect(rows.some((r) => r.file_name === target)).toBe(false);
    expect([...objects].some((p) => p.endsWith(`/${target}`))).toBe(false);
  });
});
