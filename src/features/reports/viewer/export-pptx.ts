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

/** Capture a DOM element as a PNG data-URL at 2× scale. Returns null on failure. */
async function capture(node: HTMLElement): Promise<string | null> {
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
  }
}

/** Add a slide with a coloured title bar and an optional content image. */
function addContentSlide(
  pptx: PptxGenJS,
  title: string,
  subtitle: string | null,
  imgDataUrl: string | null,
) {
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
    y: CONTENT_Y,
    w: subtitle ? CONTENT_W * 0.75 : CONTENT_W,
    h: HEADER_H,
    fontSize: 14,
    bold: true,
    fontFace: FONT_TITLE,
    color: COLOUR_MID,
    valign: "middle",
  });

  if (subtitle) {
    slide.addText(subtitle, {
      x: CONTENT_X + CONTENT_W * 0.75,
      y: CONTENT_Y,
      w: CONTENT_W * 0.25,
      h: HEADER_H,
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
    slide.addImage({
      data: imgDataUrl,
      x: CONTENT_X,
      y: IMG_Y,
      w: CONTENT_W,
      h: IMG_H,
      sizing: { type: "contain", w: CONTENT_W, h: IMG_H },
    });
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

  // Logo from the cover block DOM (if present)
  const logoImg = reportDocNode.querySelector<HTMLImageElement>("[data-cover-logo] img");
  if (logoImg?.src && !logoImg.src.startsWith("blob:")) {
    try {
      coverSlide.addImage({
        path: logoImg.src,
        x: PAD,
        y: 0.5,
        w: 0.6,
        h: 0.6,
        sizing: { type: "contain", w: 0.6, h: 0.6 },
      });
    } catch {
      // logo capture failed – skip silently
    }
  }

  const textLeft = logoImg?.src && !logoImg.src.startsWith("blob:") ? PAD + 0.75 : PAD;

  if (view.forumName) {
    coverSlide.addText(view.forumName.toUpperCase(), {
      x: textLeft,
      y: 0.5,
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
    y: view.forumName ? 0.85 : 0.5,
    w: W - textLeft - PAD,
    h: 1.2,
    fontSize: 28,
    bold: true,
    fontFace: FONT_TITLE,
    color: "111827",
  });

  const metaY = 2.3;
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

  // Overall rating from the cover block data (read the DOM)
  const ratingEl = reportDocNode.querySelector<HTMLElement>(
    "[data-block='report_cover'] [class*='rating'], [data-block='report_cover'] [class*='chip']",
  );
  if (ratingEl) {
    const ratingText = ratingEl.textContent?.trim() ?? "";
    if (ratingText) {
      coverSlide.addText(`Overall: ${ratingText}`, {
        x: PAD,
        y: metaY + 0.4,
        w: W - PAD * 2,
        h: 0.3,
        fontSize: 11,
        bold: true,
        fontFace: FONT_TITLE,
        color: COLOUR_MID,
      });
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

    addContentSlide(pptx, section.title, null, imgDataUrl);
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

      addContentSlide(pptx, project.name, project.code, imgDataUrl);
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
