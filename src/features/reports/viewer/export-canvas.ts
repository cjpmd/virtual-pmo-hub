// Off-screen rendering infrastructure for PPTX and print exports.
//
// Each captured section is cloned into a hidden container at the target export
// width so the content lays out at export dimensions instead of whatever the
// viewer's current screen width happens to be.
//
// Uses cloneNode(true) so the live React tree is never moved or unmounted.
// Canvas elements (none used in report blocks) would lose pixel content in a
// clone; SVG charts and HTML are unaffected.
//
// Export-ready protocol
// ─────────────────────
// Components that contain charts set data-export-ready="true" on their root
// element via useLayoutEffect after their data has loaded and their first paint
// is done. captureAtWidth polls the LIVE element for this attribute before
// cloning, so the clone always captures a fully-rendered state.

/** CSS pixel width for PPTX content area (~9.4 in at ~136 DPI → ~1280 px). */
export const PPTX_EXPORT_W = 1280;

/** CSS pixel width for A4 landscape print content area (~277 mm at 110 DPI). */
export const PRINT_EXPORT_W = 1200;

/** Scale threshold below which content is split across continuation slides. */
const SPLIT_THRESHOLD = 0.45;

export interface ExportCapture {
  /** PNG data URL at 2× pixel ratio. */
  dataUrl: string;
  /** Natural pixel width of the PNG (= CSS width × 2). */
  naturalW: number;
  /** Natural pixel height of the PNG (= rendered CSS height × 2). */
  naturalH: number;
}

/** Wait one animation frame. */
const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Wait until every [data-block] and [data-testid="project-overview-panel"]
 * descendant of `node` (and `node` itself if applicable) has
 * data-export-ready="true". Times out after `timeoutMs` ms and logs an error.
 */
async function waitForExportReady(node: HTMLElement, timeoutMs: number): Promise<void> {
  const candidates: HTMLElement[] = [
    ...(node.matches("[data-block], [data-testid='project-overview-panel']") ? [node] : []),
    ...Array.from(
      node.querySelectorAll<HTMLElement>("[data-block], [data-testid='project-overview-panel']"),
    ),
  ];
  if (!candidates.length) return;

  const deadline = Date.now() + timeoutMs;
  while (true) {
    const notReady = candidates.filter((el) => el.dataset["exportReady"] !== "true");
    if (!notReady.length) return;
    if (Date.now() >= deadline) {
      console.error(
        `[export] Timed out waiting for data-export-ready on ${notReady.length} element(s). ` +
          `Capturing anyway — charts may be blank.`,
        notReady,
      );
      return;
    }
    await raf();
  }
}

/**
 * Directly cancel all CSS animations on .viz-animate elements inside a clone.
 * Belt-and-suspenders alongside html[data-pptx-export] .viz-animate { animation:none }.
 * Animation fill-mode:backwards starts the element at opacity:0; cancelling inline
 * reverts it to opacity:1 immediately without waiting for a reflow cycle.
 */
function cancelVizAnimate(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>(".viz-animate").forEach((el) => {
    el.style.animation = "none";
    el.style.opacity = "1";
    el.style.transform = "none";
  });
}

/**
 * Clone `node` into an invisible fixed container set to exactly `widthPx` CSS
 * pixels, activate the pptx-export CSS mode (hides buttons, unwraps truncated
 * text, cancels chart animations), force a synchronous layout, capture at 2×
 * pixel-ratio, then clean up.
 *
 * Returns `null` if html-to-image fails (e.g. CSP block on a cross-origin image).
 */
export async function captureAtWidth(
  node: HTMLElement,
  widthPx: number,
): Promise<ExportCapture | null> {
  const { toPng } = await import("html-to-image");

  // 1. Wait for fonts (correct text rendering in clone).
  await document.fonts.ready;

  // 2. Wait for all blocks inside node to signal they're ready (data loaded,
  //    charts painted). Timeout after 8 s — log and proceed rather than hang.
  await waitForExportReady(node, 8000);

  // 3. Set export mode on <html> BEFORE creating the clone so that the CSS rule
  //    "html[data-pptx-export] .viz-animate { animation:none }" takes effect
  //    immediately when the clone is inserted, preventing opacity:0 flash.
  document.documentElement.dataset["pptxExport"] = "1";

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

  // 4. Cancel viz-animate directly on the clone (belt + suspenders with the CSS rule).
  cancelVizAnimate(clone);

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // 5. Trigger synchronous layout so measurements are stable.
    void clone.offsetHeight;

    // 6. Two animation frames: let the browser apply the cancelled-animation
    //    styles and lay out the clone at its new container width before capture.
    await raf();
    await raf();

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
 * content box (boxW × boxH inches), using object-fit:contain semantics.
 *
 * Rules (in order):
 *  1. Image fits at full width → fill width, centre vertically.
 *  2. scale ≥ SPLIT_THRESHOLD → scale uniformly to fit height, centre horizontally.
 *  3. Otherwise → split at the box height boundary; caller gets back slices,
 *     one per continuation slide.
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
    // Fits at full width: contain → fill width, centre vertically.
    const y = boxY + (boxH - imageHeightIn) / 2;
    return [{ dataUrl, x: boxX, y, w: boxW, h: imageHeightIn }];
  }

  // Image is taller than the box. scale = contain ratio (< 1).
  const scale = boxH / imageHeightIn;

  if (scale >= SPLIT_THRESHOLD) {
    // Contain: scale uniformly so height fills box, centre horizontally.
    const w = boxW * scale;
    const h = boxH;
    const x = boxX + (boxW - w) / 2;
    return [{ dataUrl, x, y: boxY, w, h }];
  }

  // Very tall content: split into slices that each fill boxH.
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
