import { describe, expect, it } from "vitest";
import { clusterMarks } from "./cluster-marks";

describe("clusterMarks", () => {
  it("keeps marks 8px or more apart separate, in position order", () => {
    const out = clusterMarks([
      { x: 40, item: "c" },
      { x: 10, item: "a" },
      { x: 18, item: "b" },
    ]);
    expect(out).toEqual([
      { x: 10, items: ["a"] },
      { x: 18, items: ["b"] },
      { x: 40, items: ["c"] },
    ]);
  });

  it("merges marks less than 8px apart at their mean position", () => {
    const out = clusterMarks([
      { x: 100, item: "a" },
      { x: 103, item: "b" },
      { x: 108, item: "c" },
      { x: 130, item: "d" },
    ]);
    expect(out).toEqual([
      { x: 311 / 3, items: ["a", "b", "c"] },
      { x: 130, items: ["d"] },
    ]);
  });

  it("merges marks at the same position and handles no marks", () => {
    expect(
      clusterMarks([
        { x: 5, item: 1 },
        { x: 5, item: 2 },
      ]),
    ).toEqual([{ x: 5, items: [1, 2] }]);
    expect(clusterMarks([])).toEqual([]);
  });

  it("honours a custom gap", () => {
    expect(
      clusterMarks(
        [
          { x: 0, item: "a" },
          { x: 12, item: "b" },
        ],
        16,
      ),
    ).toHaveLength(1);
  });
});
