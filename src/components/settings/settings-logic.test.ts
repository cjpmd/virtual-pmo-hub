import { describe, expect, it } from "vitest";
import { bandForScore, movedItem, resizedLabels, toggledTiers } from "./settings-logic";

describe("movedItem", () => {
  it("swaps an item with its neighbour", () => {
    expect(movedItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(movedItem(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
  });
  it("returns null at either end and leaves the input alone", () => {
    const list = ["a", "b"];
    expect(movedItem(list, 0, -1)).toBeNull();
    expect(movedItem(list, 1, 1)).toBeNull();
    expect(list).toEqual(["a", "b"]);
  });
});

describe("toggledTiers", () => {
  const all = ["Small", "Medium", "Large"];
  it("removes a tier that is on", () => {
    expect(toggledTiers(all, ["Small", "Large"], "Small")).toEqual(["Large"]);
  });
  it("adds a tier in the canonical order", () => {
    expect(toggledTiers(all, ["Large"], "Small")).toEqual(["Small", "Large"]);
    expect(toggledTiers(all, ["Large", "Small"], "Medium")).toEqual(["Small", "Medium", "Large"]);
  });
});

describe("resizedLabels", () => {
  it("keeps existing labels and names new levels", () => {
    expect(resizedLabels(["Low", "Mid", "High"], 5)).toEqual([
      "Low",
      "Mid",
      "High",
      "Level 4",
      "Level 5",
    ]);
    expect(resizedLabels(["a", "b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });
});

describe("bandForScore", () => {
  const bands = [
    { name: "Low", minScore: 1 },
    { name: "High", minScore: 15 },
    { name: "Medium", minScore: 6 },
  ];
  it("picks the highest band reached", () => {
    expect(bandForScore(bands, 6)?.name).toBe("Medium");
    expect(bandForScore(bands, 20)?.name).toBe("High");
    expect(bandForScore(bands, 5)?.name).toBe("Low");
    expect(bandForScore(bands, 0)).toBeUndefined();
  });
});
