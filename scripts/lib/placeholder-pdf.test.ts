import { describe, expect, it } from "vitest";
import { placeholderPdf } from "./placeholder-pdf";

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("placeholderPdf", () => {
  const pdf = text(placeholderPdf("Acceptance certificate (test)", ["Line one", "Café – dash"]));

  it("is a PDF with the watermark and the title", () => {
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("(Demo placeholder) Tj");
    expect(pdf).toContain("(Acceptance certificate \\(test\\)) Tj");
  });

  it("keeps the bytes ASCII (non-ASCII characters replaced)", () => {
    expect([...pdf].every((c) => c.charCodeAt(0) < 128)).toBe(true);
    expect(pdf).toContain("(Caf- - dash) Tj");
  });

  it("has a cross-reference table that points at each object", () => {
    const xrefAt = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");
    const entries = [...pdf.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
      Number(m[1]),
    );
    expect(entries).toHaveLength(6);
    entries.forEach((offset, i) =>
      expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true),
    );
  });

  it("declares the content stream length correctly", () => {
    const match = /<< \/Length (\d+) >>\nstream\n/.exec(pdf)!;
    const start = match.index + match[0].length;
    expect(pdf.slice(start + Number(match[1]), start + Number(match[1]) + 10)).toBe("\nendstream");
  });
});
