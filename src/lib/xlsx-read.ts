// A small XLSX reader for imports (NHS-4 part 5): the first worksheet's cells as text rows, the
// same shape parseCsv returns, so an import screen takes either file. Reads shared strings,
// inline strings, numbers and booleans; formulas give their cached value. Dates come back as
// Excel serial numbers (no styles are read); the import's month parser accepts those.
// JSZip is loaded on demand, so the reader adds nothing to a page until a file is opened.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** XML text with its entities decoded. */
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[name.toLowerCase()] ?? match;
  });
}

/** Every <t> text inside an element (rich text runs joined), phonetic runs left out. */
function textOf(xml: string): string {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g))
    out += m[1] ?? "";
  return decodeXml(out);
}

/** The shared strings table, in order. */
export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => textOf(m[1] ?? ""));
}

/** Zero-based column index of a cell reference ("A1" → 0, "AB7" → 27). */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** A worksheet's cells as rows of text. Fully blank rows are skipped, as parseCsv does. */
export function parseWorksheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    let next = 0;
    for (const cell of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = "";
      if (type === "s") value = raw != null ? (shared[Number(raw)] ?? "") : "";
      else if (type === "inlineStr") value = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (type === "b") value = raw === "1" ? "TRUE" : raw === "0" ? "FALSE" : "";
      else value = raw != null ? decodeXml(raw) : "";
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    if (cells.some((c) => c.trim() !== "")) rows.push(cells);
  }
  // Ragged rows padded to the widest, as a CSV export would be.
  const width = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill("")] : r));
}

/** The path of the workbook's first sheet, from workbook.xml and its relationships. */
export function firstSheetPath(workbookXml: string, relsXml: string): string | null {
  const sheet =
    /<sheet\b[^>]*?\br:id="([^"]+)"/.exec(workbookXml) ??
    /<sheet\b[^>]*?\bid="([^"]+)"/.exec(workbookXml);
  if (!sheet) return null;
  for (const rel of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = rel[1] ?? "";
    if (/\bId="([^"]+)"/.exec(attrs)?.[1] !== sheet[1]) continue;
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (!target) return null;
    return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  return null;
}

/** The first worksheet of an .xlsx file as rows of text. Throws a plain message when the file
 *  isn't a readable workbook. */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<string[][]> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new Error("This file isn't an Excel workbook (.xlsx). Save it as .xlsx or CSV.");
  }
  const read = (path: string) => zip.file(path)?.async("string") ?? Promise.resolve(null);
  const [workbook, rels, sharedXml] = await Promise.all([
    read("xl/workbook.xml"),
    read("xl/_rels/workbook.xml.rels"),
    read("xl/sharedStrings.xml"),
  ]);
  const path = (workbook && rels && firstSheetPath(workbook, rels)) || "xl/worksheets/sheet1.xml";
  const sheet = await read(path);
  if (!sheet) throw new Error("This workbook has no worksheet to read.");
  return parseWorksheet(sheet, sharedXml ? parseSharedStrings(sharedXml) : []);
}

/** Rows from an uploaded file: .xlsx through readXlsx, anything else as CSV text. */
export async function readTableFile(
  file: File,
  parseCsv: (text: string) => string[][],
): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name))
    throw new Error("Old .xls workbooks can't be read. Save it as .xlsx or CSV.");
  return parseCsv(await file.text());
}
