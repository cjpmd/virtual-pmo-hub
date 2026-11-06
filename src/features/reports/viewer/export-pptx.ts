// Client-side PowerPoint export for report packs.
//
// Slide layout (16:9, 10 × 5.63 inches):
//   • Cover slide  – logo, forum name, title, as-at, meeting date, overall rating
//   • One slide per report-level section  – section title + block content captured as image
//   • One slide per deep-dive project     – project code/name + ProjectOverviewPanel as image
//
// Titles and standalone text are native pptx text so they are selectable.
// Block content and project panels are captured from the live DOM at 2× device-pixel-ratio
// using html-to-image, then inserted as images.
//
// Callers must pass the DOM node of the rendered report document so this module never
// touches the global document directly.

import PptxGenJS from "pptxgenjs";
import { toPng } from "html-to-image";
import type { ViewModel } from "./ReportViewer";
import { sectionsOf } from "./ReportDocument";

// Slide canvas: 10 × 5.625 in (standard 16:9)
const W = 10;
const H = 5.625;
// Content area inside slide padding (inches)
const PAD = 0.3;
const CONTENT_X = PAD;
const CONTENT_Y = PAD;
const CONTENT_W = W - PAD * 2;

// Header strip height (title bar above the content image)
const HEADER_H = 0.55;
// Content image starts below the header
const IMG_Y = CONTENT_Y + HEADER_H + 0.1;
const IMG_H = H - IMG_Y - PAD;

const FONT_TITLE = "Calibri";
const COLOUR_PRIMARY = "1D4ED8"; // blue-700 (matches --pmo-accent approx)
const COLOUR_MID = "374151"; // gray-700
const COLOUR_MUTED = "6B7280"; // gray-500

// ── RAG chip colours (hex, no #) ────────────────────────────────────────────
const RAG_FILL_MAP: Readonly<Record<"green" | "amber" | "red" | "not_set", string>> = {
  green: "16A34A",
  amber: "D97706",
  red: "DC2626",
  not_set: "9CA3AF",
};
const RAG_TEXT_MAP: Readonly<Record<"green" | "amber" | "red" | "not_set", string>> = {
  green: "FFFFFF",
  amber: "FFFFFF",
  red: "FFFFFF",
  not_set: "FFFFFF",
};
const ragFill = (rating: string): string =>
  RAG_FILL_MAP[rating as keyof typeof RAG_FILL_MAP] ?? RAG_FILL_MAP.not_set;
const ragText = (rating: string): string =>
  RAG_TEXT_MAP[rating as keyof typeof RAG_TEXT_MAP] ?? RAG_TEXT_MAP.not_set;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Decode a PNG/JPEG data-URL and return its intrinsic pixel dimensions.
 * Returns null if the data URL is empty or the image fails to load.
 */
function getImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (!dataUrl) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/**
 * Fit a source image (px) into a box (inches) with contain-fit, centred.
 * Returns the x/y/w/h in inches for pptxgenjs.
 */
function fitInBox(
  imgW: number,
  imgH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  const imgAspect = imgW / imgH;
  const boxAspect = boxW / boxH;
  let w: number, h: number;
  if (imgAspect > boxAspect) {
    w = boxW;
    h = boxW / imgAspect;
  } else {
    h = boxH;
    w = boxH * imgAspect;
  }
  const x = boxX + (boxW - w) / 2;
  const y = boxY + (boxH - h) / 2;
  return { x, y, w, h };
}

/** Set / unset the PPTX-export CSS class on <html> so controls are hidden during capture. */
function setExportMode(on: boolean) {
  if (on) {
    document.documentElement.dataset["pptxExport"] = "1";
  } else {
    delete document.documentElement.dataset["pptxExport"];
  }
}

/** Capture a DOM element as a PNG data-URL at 2× scale. Returns null on failure. */
async function capture(node: HTMLElement): Promise<string | null> {
  setExportMode(true);
  try {
    return await toPng(node, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      // Skip elements that break cross-origin image capture (e.g. avatars from storage)
      filter: (el) => {
        if (el instanceof HTMLImageElement && el.src.startsWith("blob:")) return false;
        return true;
      },
    });
  } catch {
    return null;
  } finally {
    setExportMode(false);
  }
}

/** Add a slide with a coloured title bar and an optional content image. */
async function addContentSlide(
  pptx: PptxGenJS,
  title: string,
  subtitle: string | null,
  imgDataUrl: string | null,
) {
  const slide = pptx.addSlide();

  // Title bar background
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: HEADER_H + CONTENT_Y,
    fill: { color: "F9FAFB" },
    line: { color: "E5E7EB", width: 0.5 },
  });

  slide.addText(title, {
    x: CONTENT_X,
    y: 0,
    w: subtitle ? CONTENT_W * 0.75 : CONTENT_W,
    h: HEADER_H + CONTENT_Y,
    fontSize: 14,
    bold: true,
    fontFace: FONT_TITLE,
    color: COLOUR_MID,
    valign: "middle",
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: CONTENT_X + CONTENT_W * 0.75,
      y: 0,
      w: CONTENT_W * 0.25,
      h: HEADER_H + CONTENT_Y,
      fontSize: 10,
      fontFace: FONT_TITLE,
      color: COLOUR_MUTED,
      align: "right",
      valign: "middle",
    });
  }

  // Divider
  slide.addShape(pptx.ShapeType.line, {
    x: CONTENT_X,
    y: CONTENT_Y + HEADER_H,
    w: CONTENT_W,
    h: 0,
    line: { color: "E5E7EB", width: 1 },
  });

  if (imgDataUrl) {
    const size = await getImageSize(imgDataUrl);
    const placement = size
      ? fitInBox(size.w, size.h, CONTENT_X, IMG_Y, CONTENT_W, IMG_H)
      : { x: CONTENT_X, y: IMG_Y, w: CONTENT_W, h: IMG_H };
    slide.addImage({ data: imgDataUrl, ...placement });
  } else {
    slide.addText("(Content not available)", {
      x: CONTENT_X,
      y: IMG_Y,
      w: CONTENT_W,
      h: IMG_H,
      fontSize: 10,
      fontFace: FONT_TITLE,
      color: COLOUR_MUTED,
      align: "center",
      valign: "middle",
    });
  }
}

// ── Overall status: native shapes ────────────────────────────────────────────

interface RagChip {
  rating: string; // "green" | "amber" | "red" | "not_set"
  label: string; // "Declared: Amber" etc.
}

/** Extract declared/evidenced chips from an overall_status block node. */
function extractRagChips(node: HTMLElement): RagChip[] {
  const chips: RagChip[] = [];
  node.querySelectorAll<HTMLElement>("[data-rating]").forEach((el) => {
    const rating = el.dataset["rating"] ?? "not_set";
    const label = el.textContent?.trim() ?? "";
    if (label) chips.push({ rating, label });
  });
  return chips;
}

/**
 * Render an overall_status block as native pptxgenjs shapes rather than a
 * stretched image. Falls back to the image path if no chips are found.
 */
async function addOverallStatusSlide(
  pptx: PptxGenJS,
  title: string,
  node: HTMLElement,
  imgDataUrl: string | null,
) {
  const chips = extractRagChips(node);
  if (!chips.length) {
    // No structured data – fall back to image
    await addContentSlide(pptx, title, null, imgDataUrl);
    return;
  }

  const slide = pptx.addSlide();

  // Title bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: HEADER_H + CONTENT_Y,
    fill: { color: "F9FAFB" },
    line: { color: "E5E7EB", width: 0.5 },
  });
  slide.addText(title, {
    x: CONTENT_X,
    y: 0,
    w: CONTENT_W,
    h: HEADER_H + CONTENT_Y,
    fontSize: 14,
    bold: true,
    fontFace: FONT_TITLE,
    color: COLOUR_MID,
    valign: "middle",
  });
  slide.addShape(pptx.ShapeType.line, {
    x: CONTENT_X,
    y: CONTENT_Y + HEADER_H,
    w: CONTENT_W,
    h: 0,
    line: { color: "E5E7EB", width: 1 },
  });

  // Render chips as coloured rectangles
  const chipW = 2.0;
  const chipH = 0.55;
  const chipGap = 0.3;
  const startX = CONTENT_X;
  const startY = IMG_Y + 0.2;

  chips.forEach((chip, i) => {
    const x = startX + i * (chipW + chipGap);
    const fillColour = ragFill(chip.rating);
    const textColour = ragText(chip.rating);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: startY,
      w: chipW,
      h: chipH,
      fill: { color: fillColour },
      line: { color: fillColour, width: 0 },
      rectRadius: 0.05,
    });
    slide.addText(chip.label, {
      x,
      y: startY,
      w: chipW,
      h: chipH,
      fontSize: 12,
      bold: true,
      fontFace: FONT_TITLE,
      color: textColour,
      align: "center",
      valign: "middle",
    });
  });

  // Counts line (e.g. "12 projects · 4 at risk · 2 off track")
  const countsEl = node.querySelector<HTMLElement>("[data-counts]");
  if (countsEl) {
    const countsText = countsEl.textContent?.trim() ?? "";
    if (countsText) {
      slide.addText(countsText, {
        x: CONTENT_X,
        y: startY + chipH + 0.2,
        w: CONTENT_W,
        h: 0.3,
        fontSize: 10,
        fontFace: FONT_TITLE,
        color: COLOUR_MUTED,
        align: "left",
        valign: "middle",
      });
    }
  }
}

// ── Main export function ─────────────────────────────────────────────────────

/** Build and trigger download of a PPTX file from the current report view. */
export async function exportReportPptx(
  view: ViewModel,
  /** The rendered report document root element (the .report-document div). */
  reportDocNode: HTMLElement,
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 × 7.5 in – but we override below
  pptx.defineLayout({ name: "16x9", width: W, height: H });
  pptx.layout = "16x9";
  pptx.author = "ORMO PMO";
  pptx.title = view.report.title;

  const f = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
      : "";

  // ── Cover slide ───────────────────────────────────────────────────────────
  const coverSlide = pptx.addSlide();

  // Background
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: H,
    fill: { color: "FFFFFF" },
  });
  // Top accent bar
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: 0.08,
    fill: { color: COLOUR_PRIMARY },
  });

  // Logo from the cover block DOM (if present and not a blob URL)
  const logoImg = reportDocNode.querySelector<HTMLImageElement>("[data-cover-logo] img");
  let textLeft = PAD;
  if (logoImg?.src && !logoImg.src.startsWith("blob:")) {
    try {
      coverSlide.addImage({
        path: logoImg.src,
        x: PAD,
        y: 0.4,
        w: 0.65,
        h: 0.65,
        sizing: { type: "contain", w: 0.65, h: 0.65 },
      });
      textLeft = PAD + 0.75;
    } catch {
      // logo capture failed – skip silently
    }
  }

  if (view.forumName) {
    coverSlide.addText(view.forumName.toUpperCase(), {
      x: textLeft,
      y: 0.4,
      w: W - textLeft - PAD,
      h: 0.3,
      fontSize: 9,
      fontFace: FONT_TITLE,
      color: COLOUR_PRIMARY,
      bold: true,
    });
  }
  coverSlide.addText(view.report.title, {
    x: textLeft,
    y: view.forumName ? 0.75 : 0.4,
    w: W - textLeft - PAD,
    h: 1.2,
    fontSize: 28,
    bold: true,
    fontFace: FONT_TITLE,
    color: "111827",
  });

  const metaY = 2.2;
  const metaParts: string[] = [];
  if (view.meetingDate) metaParts.push(`Meeting ${f(view.meetingDate)}`);
  metaParts.push(`As at ${f(view.report.asAt)}`);
  if (view.isSnapshot) metaParts.push("Published snapshot");

  coverSlide.addText(metaParts.join("  ·  "), {
    x: PAD,
    y: metaY,
    w: W - PAD * 2,
    h: 0.35,
    fontSize: 11,
    fontFace: FONT_TITLE,
    color: COLOUR_MUTED,
  });

  // Overall rating chips from [data-rating] attributes on the cover block
  const coverBlock = reportDocNode.querySelector<HTMLElement>("[data-block='report_cover']");
  if (coverBlock) {
    const chips = extractRagChips(coverBlock);
    chips.forEach((chip, i) => {
      const fillColour = ragFill(chip.rating);
      const textColour = ragText(chip.rating);
      const chipW = 1.8;
      const chipH = 0.42;
      const x = PAD + i * (chipW + 0.2);
      coverSlide.addShape(pptx.ShapeType.roundRect, {
        x,
        y: metaY + 0.5,
        w: chipW,
        h: chipH,
        fill: { color: fillColour },
        line: { color: fillColour, width: 0 },
        rectRadius: 0.05,
      });
      coverSlide.addText(chip.label, {
        x,
        y: metaY + 0.5,
        w: chipW,
        h: chipH,
        fontSize: 11,
        bold: true,
        fontFace: FONT_TITLE,
        color: textColour,
        align: "center",
        valign: "middle",
      });
    });

    // Overall rating rationale (plain text below chips)
    const rationaleEl = coverBlock.querySelector<HTMLElement>("[data-rationale]");
    if (rationaleEl) {
      const rationaleText = rationaleEl.textContent?.trim() ?? "";
      if (rationaleText) {
        coverSlide.addText(rationaleText, {
          x: PAD,
          y: metaY + 1.1,
          w: W - PAD * 2,
          h: 0.6,
          fontSize: 10,
          fontFace: FONT_TITLE,
          color: COLOUR_MID,
          wrap: true,
        });
      }
    }
  }

  // Bottom divider
  coverSlide.addShape(pptx.ShapeType.line, {
    x: PAD,
    y: H - 0.6,
    w: W - PAD * 2,
    h: 0,
    line: { color: "E5E7EB", width: 0.5 },
  });
  if (view.dataBasis) {
    coverSlide.addText(view.dataBasis, {
      x: PAD,
      y: H - 0.55,
      w: W - PAD * 2,
      h: 0.3,
      fontSize: 8,
      fontFace: FONT_TITLE,
      color: COLOUR_MUTED,
    });
  }

  // ── Report-level section slides ───────────────────────────────────────────
  const sections = sectionsOf(view.report.blocks, view.deepDives);
  for (const section of sections) {
    if (section.kind !== "block") continue;
    if (section.instance?.blockKey === "report_cover") continue; // already on cover slide

    const sectionId = `s-${section.instance?.id ?? section.id}`;
    const sectionNode = reportDocNode.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`);
    const imgDataUrl = sectionNode ? await capture(sectionNode) : null;

    if (section.instance?.blockKey === "overall_status" && sectionNode) {
      await addOverallStatusSlide(pptx, section.title, sectionNode, imgDataUrl);
    } else {
      await addContentSlide(pptx, section.title, null, imgDataUrl);
    }
  }

  // ── Deep-dive project slides ──────────────────────────────────────────────
  const hasDeepDives = view.report.blocks.some((b) => b.placement === "deep_dive");
  if (hasDeepDives) {
    for (const project of view.deepDives) {
      const ddNode = reportDocNode.querySelector<HTMLElement>(`#${CSS.escape(`dd-${project.id}`)}`);
      // Prefer the ProjectOverviewPanel specifically; fall back to the whole deep-dive article.
      const panelNode =
        ddNode?.querySelector<HTMLElement>('[data-testid="project-overview-panel"]') ?? ddNode;
      const imgDataUrl = panelNode ? await capture(panelNode) : null;

      await addContentSlide(pptx, project.name, project.code, imgDataUrl);
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const asAt = view.report.asAt ? view.report.asAt.slice(0, 10) : "";
  const filename = `${view.report.title} – ${asAt}.pptx`
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  await pptx.writeFile({ fileName: filename });
}
