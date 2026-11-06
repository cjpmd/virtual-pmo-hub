// Client-side PowerPoint export for report packs.
//
// Slide layout (16:9, 10 × 5.63 inches):
//   • Cover slide  – native text: logo, forum name, title, as-at, meeting date,
//                    overall rating chip(s) + rationale
//   • One slide per report-level section  – section title + block captured as image
//   • One slide per deep-dive project     – project code/name + ProjectOverviewPanel
//
// Titles and standalone metadata are native pptx text (selectable).
// Block content is captured from a 1600 px off-screen clone at 2× DPR and
// placed at full content-box width. Tall content is split across continuation slides.
//
// See export-canvas.ts for the off-screen rendering primitives.

import PptxGenJS from "pptxgenjs";
import type { ViewModel } from "./ReportViewer";
import { sectionsOf } from "./ReportDocument";
import { PPTX_EXPORT_W, captureAtWidth, fitOrSplit, type SlicePlacement } from "./export-canvas";

// ── Slide dimensions (inches, standard 16:9) ────────────────────────────────
const W = 10;
const H = 5.625;
const PAD = 0.3;
const CONTENT_X = PAD;
const CONTENT_Y = PAD;
const CONTENT_W = W - PAD * 2;

// Header strip (title bar above the content image)
const HEADER_H = 0.55;
// Content image area
const IMG_Y = CONTENT_Y + HEADER_H + 0.08;
const IMG_H = H - IMG_Y - PAD;

const FONT = "Calibri";
const C_PRIMARY = "1D4ED8";
const C_MID = "374151";
const C_MUTED = "6B7280";
const C_BORDER = "E5E7EB";

// ── RAG palette ──────────────────────────────────────────────────────────────
const RAG_FILL: Readonly<Record<"green" | "amber" | "red" | "not_set", string>> = {
  green: "16A34A",
  amber: "D97706",
  red: "DC2626",
  not_set: "9CA3AF",
};
const RAG_TEXT: Readonly<Record<"green" | "amber" | "red" | "not_set", string>> = {
  green: "FFFFFF",
  amber: "FFFFFF",
  red: "FFFFFF",
  not_set: "FFFFFF",
};
const ragFill = (r: string) => RAG_FILL[r as keyof typeof RAG_FILL] ?? RAG_FILL.not_set;
const ragText = (r: string) => RAG_TEXT[r as keyof typeof RAG_TEXT] ?? RAG_TEXT.not_set;

// ── Chip extraction ───────────────────────────────────────────────────────────

interface RagChip {
  rating: string;
  label: string;
}

function extractRagChips(node: HTMLElement): RagChip[] {
  const chips: RagChip[] = [];
  node.querySelectorAll<HTMLElement>("[data-rating]").forEach((el) => {
    const rating = el.dataset["rating"] ?? "not_set";
    const label = el.textContent?.trim() ?? "";
    if (label) chips.push({ rating, label });
  });
  return chips;
}

// ── Title bar helper (shared by all content slides) ──────────────────────────

function addTitleBar(
  pptx: PptxGenJS,
  slide: ReturnType<PptxGenJS["addSlide"]>,
  title: string,
  subtitle: string | null,
) {
  const bandH = HEADER_H + CONTENT_Y;
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: bandH,
    fill: { color: "F9FAFB" },
    line: { color: C_BORDER, width: 0.5 },
  });
  slide.addText(title, {
    x: CONTENT_X,
    y: 0,
    w: subtitle ? CONTENT_W * 0.75 : CONTENT_W,
    h: bandH,
    fontSize: 14,
    bold: true,
    fontFace: FONT,
    color: C_MID,
    valign: "middle",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: CONTENT_X + CONTENT_W * 0.75,
      y: 0,
      w: CONTENT_W * 0.25,
      h: bandH,
      fontSize: 10,
      fontFace: FONT,
      color: C_MUTED,
      align: "right",
      valign: "middle",
    });
  }
  slide.addShape(pptx.ShapeType.line, {
    x: CONTENT_X,
    y: CONTENT_Y + HEADER_H,
    w: CONTENT_W,
    h: 0,
    line: { color: C_BORDER, width: 1 },
  });
}

// ── Content slide (image + title bar) ───────────────────────────────────────

/**
 * Add one or more slides for a section: one per slice when the content is tall
 * enough to require splitting. The first slide has the full title; continuation
 * slides append " (continued)".
 */
async function addContentSlides(
  pptx: PptxGenJS,
  title: string,
  subtitle: string | null,
  node: HTMLElement | null,
) {
  if (!node) {
    const slide = pptx.addSlide();
    addTitleBar(pptx, slide, title, subtitle);
    slide.addText("(Content not available)", {
      x: CONTENT_X,
      y: IMG_Y,
      w: CONTENT_W,
      h: IMG_H,
      fontSize: 10,
      fontFace: FONT,
      color: C_MUTED,
      align: "center",
      valign: "middle",
    });
    return;
  }

  const cap = await captureAtWidth(node, PPTX_EXPORT_W);
  if (!cap) {
    const slide = pptx.addSlide();
    addTitleBar(pptx, slide, title, subtitle);
    return;
  }

  const slices = await fitOrSplit(cap, CONTENT_X, IMG_Y, CONTENT_W, IMG_H);

  slices.forEach((slice: SlicePlacement, i: number) => {
    const slide = pptx.addSlide();
    addTitleBar(pptx, slide, i === 0 ? title : `${title} (continued)`, i === 0 ? subtitle : null);
    slide.addImage({ data: slice.dataUrl, x: slice.x, y: slice.y, w: slice.w, h: slice.h });
  });
}

// ── Overall-status slide (native PPT shapes) ─────────────────────────────────

async function addOverallStatusSlide(pptx: PptxGenJS, title: string, node: HTMLElement) {
  const chips = extractRagChips(node);

  if (!chips.length) {
    await addContentSlides(pptx, title, null, node);
    return;
  }

  const slide = pptx.addSlide();
  addTitleBar(pptx, slide, title, null);

  // ── Chips ─────────────────────────────────────────────────────────────────
  const chipW = Math.min(2.8, (CONTENT_W - (chips.length - 1) * 0.3) / chips.length);
  const chipH = 0.65;
  const chipGap = 0.3;
  const chipRowW = chips.length * chipW + (chips.length - 1) * chipGap;
  const startX = CONTENT_X + (CONTENT_W - chipRowW) / 2;
  const chipY = IMG_Y + 0.15;

  chips.forEach((chip, i) => {
    const x = startX + i * (chipW + chipGap);
    const fill = ragFill(chip.rating);
    const text = ragText(chip.rating);
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: chipY,
      w: chipW,
      h: chipH,
      fill: { color: fill },
      line: { color: fill, width: 0 },
      rectRadius: 0.06,
    });
    slide.addText(chip.label, {
      x,
      y: chipY,
      w: chipW,
      h: chipH,
      fontSize: 14,
      bold: true,
      fontFace: FONT,
      color: text,
      align: "center",
      valign: "middle",
    });
  });

  let nextY = chipY + chipH + 0.25;

  // ── Stacked rating bar ─────────────────────────────────────────────────────
  const countsEl = node.querySelector<HTMLElement>("[data-counts]");
  if (countsEl) {
    const countsText = countsEl.textContent?.trim() ?? "";

    // Parse "Green 5 · Amber 3 · Red 2 · Not set 1" (or localised equivalents)
    const countParts = countsText.split("·").map((s) => s.trim());
    let total = 0;
    const parsed: Array<{ key: string; count: number }> = [];
    for (const part of countParts) {
      const m = part.match(/(\d+)\s*$/);
      if (m?.[1]) {
        const count = parseInt(m[1], 10);
        const key = part
          .replace(/\d+\s*$/, "")
          .trim()
          .toLowerCase();
        parsed.push({ key, count });
        total += count;
      }
    }

    if (total > 0) {
      const colourMap: Record<string, string> = {
        green: RAG_FILL.green,
        "on track": RAG_FILL.green,
        amber: RAG_FILL.amber,
        "at risk": RAG_FILL.amber,
        red: RAG_FILL.red,
        "off track": RAG_FILL.red,
        "not set": RAG_FILL.not_set,
        "not reported": RAG_FILL.not_set,
      };

      const barH = 0.22;
      let barX = CONTENT_X;
      for (const { key, count } of parsed) {
        if (count === 0) continue;
        const segW = (count / total) * CONTENT_W;
        const colour = colourMap[key] ?? RAG_FILL.not_set;
        slide.addShape(pptx.ShapeType.rect, {
          x: barX,
          y: nextY,
          w: segW,
          h: barH,
          fill: { color: colour },
          line: { color: colour, width: 0 },
        });
        barX += segW;
      }
      nextY += barH + 0.12;
    }

    if (countsText) {
      slide.addText(countsText, {
        x: CONTENT_X,
        y: nextY,
        w: CONTENT_W,
        h: 0.3,
        fontSize: 10,
        fontFace: FONT,
        color: C_MUTED,
        align: "center",
        valign: "middle",
      });
      nextY += 0.38;
    }
  }

  // ── Rationale text ────────────────────────────────────────────────────────
  const rationaleEl = node.querySelector<HTMLElement>("p.text-sm:not([data-counts])");
  if (rationaleEl) {
    const rText = rationaleEl.textContent?.trim() ?? "";
    if (rText) {
      slide.addText(rText, {
        x: CONTENT_X,
        y: nextY,
        w: CONTENT_W,
        h: H - nextY - PAD,
        fontSize: 11,
        fontFace: FONT,
        color: C_MID,
        wrap: true,
        valign: "top",
      });
    }
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Build and trigger download of a PPTX file from the current report view. */
export async function exportReportPptx(
  view: ViewModel,
  /** The rendered report document root (the .report-document div from the viewer). */
  reportDocNode: HTMLElement,
): Promise<void> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "16x9", width: W, height: H });
  pptx.layout = "16x9";
  pptx.author = "ORMO PMO";
  pptx.title = view.report.title;

  const fDate = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";

  // ── Cover slide ───────────────────────────────────────────────────────────
  const coverSlide = pptx.addSlide();

  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: H,
    fill: { color: "FFFFFF" },
  });
  coverSlide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: W,
    h: 0.08,
    fill: { color: C_PRIMARY },
  });

  // Logo (optional — always show text even without it)
  let textLeft = PAD;
  const logoImg = reportDocNode.querySelector<HTMLImageElement>("[data-cover-logo] img");
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
      /* logo failed – text starts at PAD */
    }
  }

  // Forum name (always, not gated on logo)
  if (view.forumName) {
    coverSlide.addText(view.forumName.toUpperCase(), {
      x: textLeft,
      y: 0.35,
      w: W - textLeft - PAD,
      h: 0.3,
      fontSize: 9,
      fontFace: FONT,
      color: C_PRIMARY,
      bold: true,
    });
  }

  coverSlide.addText(view.report.title, {
    x: textLeft,
    y: view.forumName ? 0.68 : 0.35,
    w: W - textLeft - PAD,
    h: 1.3,
    fontSize: 26,
    bold: true,
    fontFace: FONT,
    color: "111827",
    wrap: true,
  });

  // Meeting · As-at · Snapshot flag
  const metaY = 2.15;
  const metaParts: string[] = [];
  if (view.meetingDate) metaParts.push(`Meeting ${fDate(view.meetingDate)}`);
  metaParts.push(`As at ${fDate(view.report.asAt)}`);
  if (view.isSnapshot) metaParts.push("Published snapshot");

  coverSlide.addText(metaParts.join("  ·  "), {
    x: PAD,
    y: metaY,
    w: W - PAD * 2,
    h: 0.3,
    fontSize: 11,
    fontFace: FONT,
    color: C_MUTED,
  });

  // Overall rating chips (always shown even without logo)
  const coverBlock = reportDocNode.querySelector<HTMLElement>("[data-block='report_cover']");
  let chipBottomY = metaY + 0.35;
  if (coverBlock) {
    const chips = extractRagChips(coverBlock);
    if (chips.length) {
      const chipW = 1.8;
      const chipH = 0.42;
      const gap = 0.2;
      const chipY = metaY + 0.42;
      chips.forEach((chip, i) => {
        const x = PAD + i * (chipW + gap);
        const fill = ragFill(chip.rating);
        const text = ragText(chip.rating);
        coverSlide.addShape(pptx.ShapeType.roundRect, {
          x,
          y: chipY,
          w: chipW,
          h: chipH,
          fill: { color: fill },
          line: { color: fill, width: 0 },
          rectRadius: 0.05,
        });
        coverSlide.addText(chip.label, {
          x,
          y: chipY,
          w: chipW,
          h: chipH,
          fontSize: 11,
          bold: true,
          fontFace: FONT,
          color: text,
          align: "center",
          valign: "middle",
        });
      });
      chipBottomY = chipY + chipH + 0.1;
    }

    const rationaleEl = coverBlock.querySelector<HTMLElement>("[data-rationale]");
    if (rationaleEl) {
      const rText = rationaleEl.textContent?.trim() ?? "";
      if (rText) {
        coverSlide.addText(rText, {
          x: PAD,
          y: chipBottomY,
          w: W - PAD * 2,
          h: 0.65,
          fontSize: 10,
          fontFace: FONT,
          color: C_MID,
          wrap: true,
          valign: "top",
        });
      }
    }
  }

  // Data-basis footer
  coverSlide.addShape(pptx.ShapeType.line, {
    x: PAD,
    y: H - 0.6,
    w: W - PAD * 2,
    h: 0,
    line: { color: C_BORDER, width: 0.5 },
  });
  if (view.dataBasis) {
    coverSlide.addText(view.dataBasis, {
      x: PAD,
      y: H - 0.55,
      w: W - PAD * 2,
      h: 0.3,
      fontSize: 8,
      fontFace: FONT,
      color: C_MUTED,
    });
  }

  // ── Report-level section slides ───────────────────────────────────────────
  const sections = sectionsOf(view.report.blocks, view.deepDives);
  for (const section of sections) {
    if (section.kind !== "block") continue;
    if (section.instance?.blockKey === "report_cover") continue;

    const sectionId = `s-${section.instance?.id ?? section.id}`;
    const sectionNode = reportDocNode.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`);

    if (section.instance?.blockKey === "overall_status" && sectionNode) {
      await addOverallStatusSlide(pptx, section.title, sectionNode);
    } else {
      await addContentSlides(pptx, section.title, null, sectionNode ?? null);
    }
  }

  // ── Deep-dive project slides ──────────────────────────────────────────────
  const hasDeepDives = view.report.blocks.some((b) => b.placement === "deep_dive");
  if (hasDeepDives) {
    for (const project of view.deepDives) {
      const ddNode = reportDocNode.querySelector<HTMLElement>(`#${CSS.escape(`dd-${project.id}`)}`);
      const panelNode =
        ddNode?.querySelector<HTMLElement>('[data-testid="project-overview-panel"]') ?? ddNode;

      await addContentSlides(pptx, project.name, project.code, panelNode ?? null);
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const asAt = view.report.asAt?.slice(0, 10) ?? "";
  const filename = `${view.report.title} – ${asAt}.pptx`
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  await pptx.writeFile({ fileName: filename });
}
