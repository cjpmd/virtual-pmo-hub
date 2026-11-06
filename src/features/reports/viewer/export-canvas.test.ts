// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fitOrSplit } from "./export-canvas";

describe("fitOrSplit", () => {
  const BOX_X = 0.5;
  const BOX_Y = 1.0;
  const BOX_W = 9.4;
  const BOX_H = 5.0;

  function capture(naturalW: number, naturalH: number) {
    return { dataUrl: "data:image/png;base64,test", naturalW, naturalH };
  }

  it("returns one slice centred vertically when image fits at full width", async () => {
    // 1600 × 760 → imageHeightIn = 9.4 * (760/1600) ≈ 4.465 < 5.0 → fits
    const slices = await fitOrSplit(capture(1600, 760), BOX_X, BOX_Y, BOX_W, BOX_H);

    expect(slices).toHaveLength(1);
    expect(slices[0]!.w).toBe(BOX_W);
    expect(slices[0]!.x).toBe(BOX_X);
    // y is centred: should be > BOX_Y because the image is shorter than the box
    expect(slices[0]!.y).toBeGreaterThan(BOX_Y);
    // The image must fill ≥ 95% of box width
    expect(slices[0]!.w / BOX_W).toBeGreaterThanOrEqual(0.95);
  });

  it("returns one slice scaled down when scale ≥ 0.8", async () => {
    // 1600 × 870 → imageHeightIn = 9.4 * (870/1600) ≈ 5.11in, scale = 5.0/5.11 ≈ 0.978 ≥ 0.8
    const slices = await fitOrSplit(capture(1600, 870), BOX_X, BOX_Y, BOX_W, BOX_H);

    expect(slices).toHaveLength(1);
    // scaled width is BOX_W * scale; since scale ≥ 0.8 → w ≥ 0.8 * BOX_W
    expect(slices[0]!.w).toBeGreaterThanOrEqual(BOX_W * 0.8);
    // centred horizontally inside box → x ≥ BOX_X
    expect(slices[0]!.x).toBeGreaterThanOrEqual(BOX_X);
    // height should equal BOX_H (filling the box vertically when scaled)
    expect(slices[0]!.h).toBeCloseTo(BOX_H, 5);
  });

  it("scale branch boundary: naturalH=1000 gives scale≈0.851, still one slice", async () => {
    // imageHeightIn = 9.4*(1000/1600) = 5.875in, scale = 5/5.875 ≈ 0.851 ≥ 0.8 → scale branch
    // Note: naturalH ≥ 1064 gives scale < 0.8 → split branch (which calls canvas cropImage and
    // is not testable in jsdom). The scale branch is a single slice with no canvas call.
    const slices = await fitOrSplit(capture(1600, 1000), BOX_X, BOX_Y, BOX_W, BOX_H);

    expect(slices).toHaveLength(1);
    expect(slices[0]!.w / BOX_W).toBeGreaterThanOrEqual(0.8);
    expect(slices[0]!.h).toBeCloseTo(BOX_H, 5);
  });

  it("preserves the original dataUrl when image fits in one slice", async () => {
    const cap = capture(1600, 760);
    const slices = await fitOrSplit(cap, BOX_X, BOX_Y, BOX_W, BOX_H);
    expect(slices[0]!.dataUrl).toBe(cap.dataUrl);
  });
});
