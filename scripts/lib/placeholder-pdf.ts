/**
 * A one-page A4 PDF with a title, a few lines of text and a large diagonal
 * "Demo placeholder" watermark. Hand-built (Helvetica, no dependencies) for the demo
 * organisation's evidence files.
 */
const escape = (text: string) =>
  text
    .replace(/[^\x20-\x7e]/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

export function placeholderPdf(title: string, lines: string[]): Uint8Array {
  const angle = Math.PI / 5;
  const [cos, sin] = [Math.cos(angle).toFixed(4), Math.sin(angle).toFixed(4)];
  const content = [
    // Watermark first, so the text sits on top of it.
    "q 0.85 g BT /F1 64 Tf",
    `${cos} ${sin} -${sin} ${cos} 110 260 Tm`,
    "(Demo placeholder) Tj ET Q",
    "BT /F1 18 Tf 56 780 Td",
    `(${escape(title)}) Tj ET`,
    ...lines.map((line, i) => `BT /F1 11 Tf 56 ${744 - i * 18} Td (${escape(line)}) Tj ET`),
    "BT /F1 9 Tf 56 48 Td (Demo placeholder: not a real document. Generated for the Virtual PMO demo organisation.) Tj ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title (${escape(title)}) /Producer (Virtual PMO demo seed) >>`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Everything above is ASCII, so string length = byte length.
  return new TextEncoder().encode(pdf);
}
