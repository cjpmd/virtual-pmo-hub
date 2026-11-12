import { describe, expect, it } from "vitest";
import { snapshotDeepDives, snapshotFrom } from "./use-report-snapshots";

describe("snapshot deep-dives (GL-9 follow-up)", () => {
  it("reads the frozen is_sample flag as isSample", () => {
    expect(
      snapshotDeepDives([
        { id: "a", code: "S1", name: "Sample", mode: "pinned", is_sample: true },
        { id: "b", code: "R1", name: "Real", mode: "rule", is_sample: false },
      ]),
    ).toEqual([
      { id: "a", code: "S1", name: "Sample", mode: "pinned", isSample: true },
      { id: "b", code: "R1", name: "Real", mode: "rule", isSample: false },
    ]);
  });
  it("leaves isSample undefined for packs published before the flag was stored", () => {
    const [project] = snapshotDeepDives([{ id: "a", code: "P1", name: "Old" }]);
    expect(project).toEqual({ id: "a", code: "P1", name: "Old" });
    expect(project && "isSample" in project).toBe(false);
    expect(snapshotDeepDives(undefined)).toEqual([]);
  });
  it("is what snapshotFrom (viewer and public print route) returns", () => {
    const snapshot = snapshotFrom([
      {
        blockInstanceId: "__meta",
        blockKey: "__meta",
        entityId: null,
        data: { deep_dives: [{ id: "a", code: "S1", name: "Sample", is_sample: true }] },
      },
    ]);
    expect(snapshot.meta.deep_dives).toEqual([
      { id: "a", code: "S1", name: "Sample", isSample: true },
    ]);
  });
});
