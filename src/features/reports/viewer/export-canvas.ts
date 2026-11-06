// Off-screen rendering infrastructure for PPTX and print exports.
//
// Each captured section is cloned into a hidden container at the target export
// width so the content lays out at export dimensions instead of whatever the
// viewer's current screen width happens to be.
//
// Uses cloneNode(true) so the live React tree is never moved or unmounted.
// Canvas elements (none used in report blocks) would lose pixel content in a
// clone; SVG charts and HTML are unaffected.

/** CSS pixel width for PPTX content area (~9.4 in at 170 DPI → ~1600 px). */
export const PPTX_EXPORT_W = 1600;

/** CSS pixel width for A4 landscape print content area (~277 mm at 110 DPI). */
export const PRINT_EXPORT_W = 1200;

export interface ExportCapture {
  /** PNG data URL at 2× pixel ratio. */
  dataUrl: string;
  /** Natural pixel width of the PNG (= CSS width × 2). */
  naturalW: number;
  /** Natural pixel height of the PNG (= rendered CSS height × 2). */
  naturalH: number;
}

/**
 * Clone `node` into an invisible fixed container set to exactly `widthPx` CSS
 * pixels, activate the pptx-export CSS mode (hides buttons, unwraps truncated
 * text), force a synchronous layout, capture at 2× pixel-ratio, then clean up.
 *
 * Returns `null` if html-to-image fails (e.g. CSP block on a cross-origin image).
 */
export async function captureAtWidth(
  node: HTMLElement,
  widthPx: number,
): Promise<ExportCapture | null> {
  const { toPng } = await import("html-to-image");

  // Off-screen wrapper constrains layout to the target width.
  const wrapper = document.createElement("div");
  wrapper.style.cssText = [
    "position:fixed",
    "top:0",
    `left:${-(widthPx + 300)}px`,
    `width:${widthPx}px`,
    "overflow:visible",
    "background:#ffffff",
    "pointer-events:none",
    "z-index:-9999",
  ].join(";");

  const clone = node.cloneNode(true) as HTMLElement;
  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  // Activate CSS export rules (hide controls, disable truncation).
  document.documentElement.dataset["pptxExport"] = "1";

  try {
    // Trigger synchronous layout before the async capture so measurements are stable.
    void clone.offsetHeight;

    const dataUrl = await toPng(clone, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      filter: (el) => {
        // Skip blob-URL images (e.g. avatars from Supabase storage) that break
        // cross-origin capture.
        if (el instanceof HTMLImageElement && el.src.startsWith("blob:")) return false;
        return true;
      },
    });
    if (!dataUrl) return null;

    return await new Promise<ExportCapture | null>((resolve) => {
      const img = new Image();
      img.onload = () =>
        resolve({ dataUrl, naturalW: img.naturalWidth, naturalH: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch {
    return null;
  } finally {
    delete document.documentElement.dataset["pptxExport"];
    document.body.removeChild(wrapper);
  }
}

/**
 * Crop a rectangular slice from a PNG data-URL using an off-screen canvas.
 * All co-ordinates are in the PNG's natural pixel space.
 */
export async function cropImage(
  dataUrl: string,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no 2d context"));
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("image load failed"));
    img.src = dataUrl;
  });
}

/**
 * Decide how to place a captured image (naturalW × naturalH px) into a PPTX
 * content box (boxW × boxH inches), filling the width.
 *
 * Rules (in order):
 *  1. If the image fits at full width → centre vertically, fill width.
 *  2. If a uniform scale ≥ 0.8 makes it fit → scale down from width.
 *  3. Otherwise → split at the box height boundary; caller gets back slices.
 *
 * Returns an array of `SlicePlacement`. Each entry describes one slide's worth
 * of image (a cropped data-URL + its pptxgenjs placement rectangle). Callers
 * add one slide per entry.
 */
export interface SlicePlacement {
  /** PNG data-URL for this slice (may be the original or a canvas crop). */
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function fitOrSplit(
  cap: ExportCapture,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): Promise<SlicePlacement[]> {
  const { dataUrl, naturalW, naturalH } = cap;

  // Height the image would occupy when displayed at full box width (inches).
  const imageHeightIn = boxW * (naturalH / naturalW);

  if (imageHeightIn <= boxH) {
    // Fits: fill width, centre vertically.
    const y = boxY + (boxH - imageHeightIn) / 2;
    return [{ dataUrl, x: boxX, y, w: boxW, h: imageHeightIn }];
  }

  const scale = boxH / imageHeightIn;

  if (scale >= 0.8) {
    // Scale uniformly: width < full, centre horizontally.
    const w = boxW * scale;
    const h = boxH;
    const x = boxX + (boxW - w) / 2;
    return [{ dataUrl, x, y: boxY, w, h }];
  }

  // Split: crop into slices that each fit in boxH.
  // pixelsPerInch at full display width:
  const ppi = naturalW / boxW;
  const sliceHeightPx = Math.round(boxH * ppi);

  const slices: SlicePlacement[] = [];
  let offsetY = 0;

  while (offsetY < naturalH) {
    const sliceH = Math.min(sliceHeightPx, naturalH - offsetY);
    const sliceDataUrl =
      sliceH < naturalH ? await cropImage(dataUrl, 0, offsetY, naturalW, sliceH) : dataUrl;

    const heightIn = boxW * (sliceH / naturalW);
    // Centre the final (possibly shorter) slice vertically.
    const y = boxY + (boxH - heightIn) / 2;
    slices.push({ dataUrl: sliceDataUrl, x: boxX, y, w: boxW, h: heightIn });
    offsetY += sliceH;
  }

  return slices;
}
