// Word (.docx) rendering of a business case export (services/five-case-export.ts). Loaded on
// demand (dynamic import from components/business-case/case-export.tsx) so the docx library stays
// out of the business case page's first load. A4 portrait, Arial, headings as Word heading styles
// (so the navigation pane and a table of contents work), tables with a shaded header row.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  markdownBlocks,
  type CaseExport,
  type ExportBlock,
  type TextRun as Run,
} from "./five-case-export";

const headingLevels = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
] as const;

const runs = (items: Run[]) =>
  items.map(
    (run) =>
      new TextRun({
        text: run.text,
        bold: run.bold ?? false,
        italics: run.italic ?? false,
        ...(run.code ? { font: "Consolas" } : {}),
      }),
  );

const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };

function table(block: Extract<ExportBlock, { kind: "table" }>) {
  const cell = (text: string, index: number, header: boolean) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: block.numeric?.[index] ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text, bold: header, size: 18 })],
        }),
      ],
      ...(header ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: "E7ECF2" } } : {}),
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: block.columns.map((column, index) => cell(column, index, true)),
      }),
      ...block.rows.map(
        (row) => new TableRow({ children: row.map((value, index) => cell(value, index, false)) }),
      ),
    ],
  });
}

function render(block: ExportBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case "heading":
      return [
        new Paragraph({
          heading: headingLevels[block.level - 1] ?? HeadingLevel.HEADING_1,
          text: block.text,
        }),
      ];
    case "note":
      return [
        new Paragraph({
          children: [new TextRun({ text: block.text, italics: true, color: "595959" })],
        }),
      ];
    case "table":
      return [table(block), new Paragraph({ text: "" })];
    case "markdown": {
      // Numbered items get their number as text: Word numbering would need a definition per list.
      let n = 0;
      return markdownBlocks(block.text).map((md) => {
        n = md.kind === "number" ? n + 1 : 0;
        if (md.kind === "heading")
          return new Paragraph({
            children: runs(md.runs.map((r) => ({ ...r, bold: true }))),
            spacing: { before: 120, after: 60 },
          });
        if (md.kind === "bullet")
          return new Paragraph({ bullet: { level: 0 }, children: runs(md.runs) });
        if (md.kind === "number")
          return new Paragraph({
            indent: { left: 360, hanging: 360 },
            children: runs([{ text: `${n}.\t` }, ...md.runs]),
          });
        return new Paragraph({ children: runs(md.runs), spacing: { after: 120 } });
      });
    }
  }
}

export async function caseExportToDocx(model: CaseExport): Promise<Blob> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, text: model.title }),
    new Paragraph({ children: [new TextRun({ text: model.subtitle, size: 28, color: "404040" })] }),
    new Paragraph({ text: "" }),
    ...model.meta.map(
      ([label, value]) =>
        new Paragraph({
          children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun({ text: value })],
        }),
    ),
    new Paragraph({ text: "" }),
    ...model.blocks.flatMap(render),
  ];
  const doc = new Document({
    creator: "ORMO PMO",
    title: model.title,
    description: model.subtitle,
    styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
