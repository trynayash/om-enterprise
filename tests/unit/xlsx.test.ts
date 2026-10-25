import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readXlsxRows, toCsv } from "@/lib/xlsx";

/** A minimal workbook laid out the way Excel saves one. */
function workbook(sheetXml: string, shared: string[] = [], target = "worksheets/sheet1.xml", file = `xl/${target}`) {
  const sst = `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared.map((s) => `<si>${s}</si>`).join("")}</sst>`;
  return zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(
      `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<Relationships><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId1" Type="worksheet" Target="${target}"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": strToU8(sst),
    [file]: strToU8(`<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
    "xl/worksheets/sheet2.xml": strToU8(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>`),
  });
}

describe("readXlsxRows", () => {
  it("reads the first sheet: shared and inline text, numbers, booleans, formulas and gaps", () => {
    const xlsx = workbook(
      `<row r="1" spans="1:4"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>` +
        `<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve">Silk Glamor &amp; Co</t></is></c><c r="B2" s="3"><v>1290.0000000000002</v></c>` +
        `<c r="C2" t="b"><v>1</v></c><c r="D2" t="str"><f>A2&amp;"!"</f><v>A&lt;B&gt;</v></c></row>` +
        `<row r="3"/>` +
        `<row r="4"><c r="AA4"><v>7</v></c></row>`,
      ["<t>product_name</t>", "<r><t>selling</t></r><r><rPr><b/></rPr><t>_price</t></r>", '<t>note</t><rPh sb="0" eb="1"><t>ignored</t></rPh>'],
    );
    const rows = readXlsxRows(xlsx);
    expect(rows[0]).toEqual(["product_name", "selling_price", "", "note"]);
    expect(rows[1]).toEqual(["Silk Glamor & Co", "1290", "TRUE", "A<B>"]);
    expect(rows[2]).toEqual([]);
    expect(rows[3]).toHaveLength(27);
    expect(rows[3][26]).toBe("7");
  });

  it("follows the workbook's relationship to an absolute sheet path", () => {
    const rows = readXlsxRows(workbook(`<row r="1"><c r="A1"><v>42</v></c></row>`, [], "/xl/worksheets/data.xml", "xl/worksheets/data.xml"));
    expect(rows).toEqual([["42"]]);
  });

  it("refuses files that are not workbooks", () => {
    expect(() => readXlsxRows(strToU8("product_name,sku\nA,B"))).toThrow(/not an Excel workbook/);
    expect(() => readXlsxRows(zipSync({ "hello.txt": strToU8("hi") }))).toThrow(/not an Excel workbook/);
  });
});

describe("toCsv", () => {
  it("quotes only the fields that need it, so the import reads them back unchanged", () => {
    expect(toCsv([["a", "b,c", 'say "hi"', "two\nlines"], ["1"]])).toBe('a,"b,c","say ""hi""","two\nlines"\r\n1\r\n');
  });
});
