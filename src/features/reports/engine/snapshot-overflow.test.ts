import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_ERROR,
  isSnapshotError,
  normaliseSha256,
  resolveOverflow,
  sha256Hex,
  type OverflowRow,
} from "./snapshot-overflow";

const payload = '{"rows": [1, 2, 3], "title": "Café"}';

async function rows(): Promise<OverflowRow[]> {
  const hex = await sha256Hex(payload);
  return [
    { id: "inline", overflowed: false, sha256: null, data: { small: true } },
    { id: "object", overflowed: true, sha256: `\\x${hex}`, data: null },
    { id: "staged", overflowed: true, sha256: hex, data: null },
  ];
}

describe("resolveOverflow", () => {
  it("leaves inline rows alone and parses verified payloads (object or staged)", async () => {
    const loaded: string[] = [];
    const out = await resolveOverflow(await rows(), async (row) => {
      loaded.push(row.id);
      return payload;
    });
    expect(loaded.sort()).toEqual(["object", "staged"]);
    expect(out[0]!.data).toEqual({ small: true });
    expect(out[1]!.data).toEqual({ rows: [1, 2, 3], title: "Café" });
    expect(out[2]!.data).toEqual({ rows: [1, 2, 3], title: "Café" });
  });

  it("marks a payload whose hash doesn't match as unverified", async () => {
    const out = await resolveOverflow(await rows(), async () => payload.replace("Café", "Cafe"));
    expect(isSnapshotError(out[1]!.data)).toBe(true);
    expect((out[1]!.data as Record<string, string>)[SNAPSHOT_ERROR]).toBe(
      "This block couldn't be verified.",
    );
  });

  it("marks a payload that can't be loaded", async () => {
    const out = await resolveOverflow(await rows(), async (row) => {
      if (row.id === "object") throw new Error("403");
      return null;
    });
    expect(out.slice(1).map((r) => (r.data as Record<string, string>)[SNAPSHOT_ERROR])).toEqual([
      "This block couldn't be loaded.",
      "This block couldn't be loaded.",
    ]);
  });

  it("normalises PostgREST bytea hex", () => {
    expect(normaliseSha256("\\xABCD")).toBe("abcd");
    expect(normaliseSha256(null)).toBeNull();
    expect(isSnapshotError({ ok: 1 })).toBe(false);
  });
});
