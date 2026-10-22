// A small CSV reader for the actuals import (design D8): quoted fields with embedded commas,
// quotes ("") and line breaks; CRLF, LF or CR line endings; UTF-8 with or without a BOM.
// Blank lines are skipped. No dependency: finance exports are simple, and this keeps the
// whole file in the browser until the PMO commits it.
export function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = "";
    if (row.length > 1 || row[0]!.trim() !== "") rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else field += char;
  }
  if (field !== "" || row.length) endRow();
  return rows;
}

// Leading = + - @ (and tab or CR) make spreadsheets treat a cell as a formula; a leading quote
// keeps it text. Plain numbers pass through, so amounts stay numeric.
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER = /^-?\d+(\.\d+)?$/;
function escapeCell(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (FORMULA_START.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV text with a header row, CRLF line endings, every cell escaped. */
export function toCsv(
  columns: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return [columns, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

/** Save text as a file in the browser. */
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
