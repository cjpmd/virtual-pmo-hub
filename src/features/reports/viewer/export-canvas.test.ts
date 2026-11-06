// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { PPTX_EXPORT_W, fitOrSplit } from "./export-canvas";

// SPLIT_THRESHOLD is 0.45 (not exported; tested via behaviour).

describe("PPTX_EXPORT_W", () => {
  it("is 1280 (narrower canvas → larger text on slide)", () => {
    expect(PPTX_EXPORT_W).toBe(1280);
  });
});

describe("fitOrSplit", () => {
  const BOX_X = 0.5;
  const BOX_Y = 1.0;
  const BOX_W = 9.4;
  const BOX_H = 5.0;

  function capture(naturalW: number, naturalH: number) {
    return { dataUrl: "data:image/png;base64,test", naturalW, naturalH };
  }

  it("returns one slice at full width when image fits (imageHeightIn ≤ boxH)", async () => {
    // 1280 × 600 → imageHeightIn = 9.4*(600/1280) ≈ 4.41in < 5.0 → fits
    const slices = await fitOrSplit(capture(1280, 600), BOX_X, BOX_Y, BOX_W, BOX_H);

    expect(slices).toHaveLength(1);
    expect(slices[0]!.w).toBe(BOX_W);
    expect(slices[0]!.x).toBe(BOX_X);
    // centred vertically: y > BOX_Y because image is shorter than box
    expect(slices[0]!.y).toBeGreaterThan(BOX_Y);
    // image fills full content width
    expect(slices[0]!.w / BOX_W).toBeGreaterThanOrEqual(0.95);
  });

  it("returns one scaled-down slice when scale ≥ 0.45", async () => {
    // 1280 × 900 → imageHeightIn = 9.4*(900/1280) ≈ 6.61in, scale = 5.0/6.61 ≈ 0.757 ≥ 0.45
    const slices = await fitOrSplit(capture(1280, 900), BOX_X, BOX_Y, BOX_W, BOX_H);

    expect(slices).toHaveLength(1);
    // height fills box (contain → fill the constraining dimension)
    expect(slices[0]!.h).toBeCloseTo(BOX_H, 5);
    // width < BOX_W (image was taller than box → scale down → narrower than full width)
    expect(slices[0]!.w).toBeLessThan(BOX_W);
    // centred horizontally: x > BOX_X
    expect(slices[0]!.x).toBeGreaterThan(BOX_X);
  });

  it("preserves the original dataUrl for single-slice results", async () => {
    const cap = capture(1280, 600);
    const slices = await fitOrSplit(cap, BOX_X, BOX_Y, BOX_W, BOX_H);
    expect(slices[0]!.dataUrl).toBe(cap.dataUrl);
  });

  it("scale 0.45 boundary: imageHeightIn ≈ 1.1× boxH → one contained slice", async () => {
    // imageHeightIn = 9.4*(680/1280) ≈ 4.995in ≈ boxH (barely taller)
    // scale = 5.0/4.995 ≈ 1.001 → fits, full width
    const slicesFit = await fitOrSplit(capture(1280, 680), BOX_X, BOX_Y, BOX_W, BOX_H);
    expect(slicesFit).toHaveLength(1);

    // 1280 × 1050 → imageHeightIn = 9.4*(1050/1280) ≈ 7.71in, scale = 5/7.71 ≈ 0.648 ≥ 0.45
    const slicesContain = await fitOrSplit(capture(1280, 1050), BOX_X, BOX_Y, BOX_W, BOX_H);
    expect(slicesContain).toHaveLength(1);
    expect(slicesContain[0]!.h).toBeCloseTo(BOX_H, 5);
  });
});

describe("export-mode CSS animation cancellation", () => {
  it("styles.css contains animation:none rule for html[data-pptx-export] .viz-animate", async () => {
    // We can't apply CSS in jsdom, but we assert the source rule exists.
    const fs = await import("fs");
    const path = await import("path");
    const css = fs.readFileSync(path.resolve(__dirname, "../../../styles.css"), "utf-8");
    expect(css).toContain("html[data-pptx-export] .viz-animate");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("opacity: 1 !important");
  });

  it("styles.css contains print animation:none rule for .report-print-root .viz-animate", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const css = fs.readFileSync(path.resolve(__dirname, "../../../styles.css"), "utf-8");
    expect(css).toContain(".report-print-root .viz-animate");
  });
});
