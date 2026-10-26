import "server-only";
/**
 * A4 PDF for any issued document, rendered ONLY from its frozen snapshot. It draws the sheet laid
 * out in bill-sheet.ts, the same one the bill page shows, in Roboto (with Noto Sans for Hindi and
 * Gujarati text; all bundled in assets/fonts with their licences).
 */
import PDFDocument from "pdfkit";
import type { DocSnapshot } from "@/lib/document-types";
import { FONT_FILES, LOGO_FILE, PAGE_H, PAGE_W, RULE_COLOR, TEXT_COLOR, layoutDocument, type SheetOptions } from "./bill-sheet";

export type PdfOptions = SheetOptions;

export async function renderDocumentPdf(snap: DocSnapshot, opts: PdfOptions): Promise<Buffer> {
  const pages = layoutDocument(snap, opts);
  const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0, autoFirstPage: false, info: { Title: `${snap.title} ${snap.number}`, Author: snap.seller.name } });
  for (const [k, file] of Object.entries(FONT_FILES)) doc.registerFont(k, file);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  for (const draws of pages) {
    doc.addPage({ size: [PAGE_W, PAGE_H], margin: 0 });
    for (const d of draws) {
      if (d.k === "line") {
        doc.moveTo(d.x1, d.y1).lineTo(d.x2, d.y2).lineWidth(d.width).strokeColor(RULE_COLOR).stroke();
      } else if (d.k === "text") {
        doc.font(d.font).fontSize(d.size).fillColor(TEXT_COLOR).text(d.text, d.x, d.y, { lineBreak: false });
      } else if (d.k === "logo") {
        doc.image(LOGO_FILE, d.x, d.y, { width: d.size, height: d.size });
      } else {
        doc.save();
        doc.rotate(-30, { origin: [d.cx, d.cy] });
        doc.font("B").fontSize(d.size).fillColor("#C0392B").opacity(0.14);
        const h = d.size * 1.17;
        doc.text(d.text, d.cx - d.w / 2, d.cy - h / 2, { lineBreak: false });
        if (d.framed)
          doc
            .rect(d.cx - d.w / 2 - 10, d.cy - h / 2 - 6, d.w + 20, h + 10)
            .lineWidth(4)
            .strokeColor("#C0392B")
            .stroke();
        doc.restore();
        doc.opacity(1);
      }
    }
  }
  doc.end();
  return done;
}
