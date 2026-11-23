import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { columnIndex, decodeXml, firstSheetPath, parseSharedStrings, readXlsx } from "./xlsx-read";

async function workbook(
  sheetXml: string,
  shared: string[] = [],
  sheetPath = "worksheets/data.xml",
) {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="CIP" sheetId="1" r:id="rId3"/></sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="styles.xml"/><Relationship Id="rId3" Type="worksheet" Target="${sheetPath}"/></Relationships>`,
  );
  if (shared.length)
    zip.file(
      "xl/sharedStrings.xml",
      `<sst>${shared.map((s) => `<si><t>${s}</t></si>`).join("")}</sst>`,
    );
  zip.file(`xl/${sheetPath}`, `<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("xlsx-read helpers", () => {
  it("decodes XML text", () => {
    expect(decodeXml("A &amp; B &lt;&#163;&#x20AC;&gt;")).toBe("A & B <£€>");
  });
  it("numbers columns", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AB7")).toBe(27);
  });
  it("joins rich text runs and skips phonetic runs", () => {
    expect(
      parseSharedStrings(
        `<sst><si><r><t>Agency</t></r><r><t xml:space="preserve"> reduction</t></r><rPh><t>x</t></rPh></si><si/></sst>`,
      ),
    ).toEqual(["Agency reduction", ""]);
  });
  it("finds the first sheet through the relationships", () => {
    expect(
      firstSheetPath(
        `<sheets><sheet name="A" r:id="rId2"/></sheets>`,
        `<Relationship Id="rId2" Target="worksheets/sheet9.xml"/>`,
      ),
    ).toBe("xl/worksheets/sheet9.xml");
  });
});

describe("readXlsx", () => {
  it("reads shared, inline, number and boolean cells into padded rows", async () => {
    const data = await workbook(
      `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>` +
        `<row r="2"/>` +
        `<row r="3"><c r="A3" t="inlineStr"><is><t>EFF-1</t></is></c><c r="B3"><v>46113</v></c><c r="C3"><f>1+1</f><v>1250.5</v></c><c r="D3" t="b"><v>1</v></c></row>`,
      ["Ref", "Amount &amp; more"],
    );
    expect(await readXlsx(data)).toEqual([
      ["Ref", "", "Amount & more", ""],
      ["EFF-1", "46113", "1250.5", "TRUE"],
    ]);
  });
  it("says when the file isn't a workbook", async () => {
    await expect(readXlsx(new TextEncoder().encode("a,b,c"))).rejects.toThrow(/isn't an Excel/);
  });
});
