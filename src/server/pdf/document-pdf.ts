import "server-only";
/**
 * A4 PDF for any issued document, rendered ONLY from its frozen snapshot.
 * Uses bundled DejaVu Sans (has the ₹ glyph; redistributable licence in assets/fonts). DejaVu has no
 * Hindi or Gujarati letters, so text that contains any (customer and product names) is set in the
 * Noto Sans font of that script, which also has the Latin letters, digits and ₹.
 */
import path from "node:path";
import PDFDocument from "pdfkit";
import type { DocSnapshot } from "@/lib/document-types";
import { formatINR, formatQty } from "@/lib/money";
import { formatPhone } from "@/lib/india";
import { discountPercent, optionalColumns, PAYMENT_METHOD_LABEL, showsPaymentTotals, stateLabel } from "@/lib/bill-layout";

const NAVY = "#0D1B30";
const GOLD = "#9E7518";
const GREY = "#5B6474";
const LINE = "#D7DCE3";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const REGULAR = path.join(FONT_DIR, "DejaVuSans.ttf");
const BOLD = path.join(FONT_DIR, "DejaVuSans-Bold.ttf");
const INDIC_FONTS = {
  DV: path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf"),
  DVB: path.join(FONT_DIR, "NotoSansDevanagari-Bold.ttf"),
  GJ: path.join(FONT_DIR, "NotoSansGujarati-Regular.ttf"),
  GJB: path.join(FONT_DIR, "NotoSansGujarati-Bold.ttf"),
};
const DEVANAGARI = /[\u0900-\u097F]/g;
const GUJARATI = /[\u0A80-\u0AFF]/g;

/**
 * Makes text drawing and measuring pick the Hindi or Gujarati font for any string that holds that
 * script (whichever has more letters in it), then go back to the current font. A whole string uses
 * one font, so wrapping, alignment and row heights work as for any other text.
 */
export function registerIndicFonts(doc: PDFKit.PDFDocument) {
  for (const [name, file] of Object.entries(INDIC_FONTS)) doc.registerFont(name, file);
  const select = doc.font.bind(doc) as (name: string) => PDFKit.PDFDocument;
  // The font the caller chose (to know regular from bold) and the one in use right now: pdfkit
  // measures words while it draws, so these calls nest.
  let chosen = "R";
  let active = "R";
  const switchTo = (name: string) => {
    active = name;
    return select(name);
  };
  const target = doc as unknown as Record<string, unknown>;
  target.font = (name: string) => {
    chosen = name;
    return switchTo(name);
  };
  const fontFor = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const devanagari = value.match(DEVANAGARI)?.length ?? 0;
    const gujarati = value.match(GUJARATI)?.length ?? 0;
    if (!devanagari && !gujarati) return null;
    return `${gujarati > devanagari ? "GJ" : "DV"}${chosen === "B" ? "B" : ""}`;
  };
  for (const method of ["text", "heightOfString", "widthOfString"]) {
    const original = (target[method] as (...args: unknown[]) => unknown).bind(doc);
    target[method] = (...args: unknown[]) => {
      const font = fontFor(args[0]);
      if (!font) return original(...args);
      const before = active;
      switchTo(font);
      try {
        return original(...args);
      } finally {
        switchTo(before);
      }
    };
  }
}

export interface PdfOptions {
  status: "issued" | "cancelled";
  cancelReason?: string | null;
  copyLabel?: string | null;
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const s = size / 64;
  doc.save();
  doc.translate(x, y).scale(s);
  doc.roundedRect(0, 0, 64, 64, 10).fill(NAVY);
  doc.lineWidth(5).lineCap("round").lineJoin("round").strokeColor("#C39222").path("M12 29 L32 13 L52 29").stroke();
  doc.lineWidth(4.5).strokeColor("#FFFFFF").circle(23, 42, 8).stroke();
  doc.path("M35.5 50 V35 L42.5 44 L49.5 35 V50").stroke();
  doc.restore();
}

function dateIN(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function renderDocumentPdf(snap: DocSnapshot, opts: PdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36, bufferPages: true, info: { Title: `${snap.title} ${snap.number}`, Author: snap.seller.name } });
  doc.registerFont("R", REGULAR);
  doc.registerFont("B", BOLD);
  registerIndicFonts(doc);
  doc.font("R");
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const W = R - L;

  /* ---------- Header ---------- */
  let y = 36;
  if (snap.declarationTop) {
    doc.font("B").fontSize(8.5).fillColor(NAVY).text(snap.declarationTop, L, y, { width: W, align: "center" });
    y += 14;
  }
  drawLogo(doc, L, y, 46);
  doc
    .font("B")
    .fontSize(16)
    .fillColor(NAVY)
    .text(snap.seller.name, L + 56, y + 2, { width: 270 });
  doc
    .font("B")
    .fontSize(7.5)
    .fillColor(GOLD)
    .text(snap.seller.tagline.toUpperCase(), L + 56, y + 22, { width: 270, characterSpacing: 1 });
  doc.font("R").fontSize(8).fillColor(GREY);
  // The seller's lines stop short of the document number block on the right.
  const sellerW = R - 200 - 10 - (L + 56);
  let hy = y + 34;
  for (const line of [...snap.seller.addressLines, `Phone/WhatsApp: ${formatPhone(snap.seller.phone)}`, ...(snap.seller.email ? [`Email: ${snap.seller.email}`] : [])]) {
    doc.text(line, L + 56, hy, { width: sellerW });
    hy = doc.y + 0.5;
  }
  if (snap.seller.gstin) {
    doc
      .font("B")
      .fillColor(NAVY)
      .text(`GSTIN: ${snap.seller.gstin}`, L + 56, hy);
    hy += 10;
  }
  doc
    .font("R")
    .fillColor(GREY)
    .text(`State: ${stateLabel(snap.seller.stateCode, snap.seller.stateName)}`, L + 56, hy);
  hy += 10;

  // Title block (right)
  const tx = R - 200;
  doc.font("B").fontSize(15).fillColor(NAVY).text(snap.title, tx, y, { width: 200, align: "right" });
  let ty = y + 20;
  if (snap.subtitle) {
    doc.font("R").fontSize(7.5).fillColor(GREY).text(snap.subtitle, tx, ty, { width: 200, align: "right" });
    ty = doc.y + 3; // the subtitle may wrap
  }
  const meta: [string, string][] = [
    ["No.", snap.number],
    ["Date", dateIN(snap.issuedAt)],
    ["Sale ref.", snap.saleNumber],
  ];
  if (snap.validUntil) meta.push(["Valid until", dateIN(snap.validUntil)]);
  if (snap.original) meta.push(["Against", `${snap.original.number} (${dateIN(snap.original.issuedAt)})`]);
  if (snap.placeOfSupply.stateCode) meta.push(["Place of supply", stateLabel(snap.placeOfSupply.stateCode, snap.placeOfSupply.stateName)]);
  if (snap.showTax) meta.push(["Reverse charge", snap.reverseCharge ? "Yes" : "No"]);
  for (const [k, v] of meta) {
    doc.font("R").fontSize(8).fillColor(GREY).text(k, tx, ty, { width: 70, lineBreak: false });
    doc
      .font("B")
      .fontSize(8)
      .fillColor(NAVY)
      .text(v, tx + 70, ty, { width: 130, align: "right" });
    ty = Math.max(ty + 11, doc.y + 1);
  }
  if (opts.copyLabel) {
    doc.font("B").fontSize(7).fillColor(GOLD).text(opts.copyLabel.toUpperCase(), tx, ty, { width: 200, align: "right" });
    ty += 10;
  }
  y = Math.max(hy, ty) + 8;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.5).strokeColor(GOLD).stroke();
  y += 8;

  /* ---------- Buyer ---------- */
  const b = snap.buyer;
  doc
    .font("B")
    .fontSize(8)
    .fillColor(GOLD)
    .text(snap.docType === "quotation" ? "QUOTATION FOR" : "BILL TO", L, y);
  y += 11;
  doc
    .font("B")
    .fontSize(10)
    .fillColor(NAVY)
    .text(b ? (b.businessName ? `${b.businessName} (${b.name})` : b.name) : "Cash sale", L, y, { width: W / 2 });
  y += 13;
  doc.font("R").fontSize(8).fillColor(GREY);
  if (b) {
    const addr = [b.address, [b.city, b.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    if (addr) {
      doc.text(addr, L, y, { width: W * 0.6 });
      y = doc.y + 2;
    }
    if (b.stateCode) {
      doc.text(`State: ${stateLabel(b.stateCode, b.stateName)}`, L, y);
      y += 10;
    }
    const contact = [b.mobile ? `Mobile: ${b.mobile}` : null, b.email].filter(Boolean).join("  ·  ");
    if (contact) {
      doc.text(contact, L, y);
      y += 10;
    }
    if (b.gstin) {
      doc.font("B").fillColor(NAVY).text(`GSTIN: ${b.gstin}`, L, y);
      y += 10;
    }
  }
  if (snap.reason) {
    doc.font("R").fillColor(GREY).text(`Reason: ${snap.reason}`, L, y, { width: W });
    y = doc.y + 2;
  }
  y += 6;

  /* ---------- Lines table ---------- */
  // Fixed widths for the figures; the item name takes what is left. Colour, Material and MRP appear
  // only when some line on this bill has them. With GST columns the HSN, colour and material go
  // under the item name instead, to leave the name room.
  type Col = { key: string; label: string; w: number; align: "left" | "right" | "center" };
  const opt = optionalColumns(snap.lines);
  const cols: Col[] = snap.showTax
    ? [
        { key: "sl", label: "#", w: 16, align: "center" },
        { key: "desc", label: "Item (HSN)", w: 0, align: "left" },
        ...(opt.mrp ? [{ key: "mrp", label: "MRP", w: 46, align: "right" } as Col] : []),
        { key: "qty", label: "Qty", w: 44, align: "right" },
        { key: "rate", label: "Rate", w: 52, align: "right" },
        { key: "disc", label: "Discount", w: 48, align: "right" },
        { key: "taxable", label: "Taxable", w: 54, align: "right" },
        { key: "gst", label: snap.supplyType === "inter" ? "IGST" : "CGST / SGST", w: 76, align: "right" },
        { key: "total", label: "Amount", w: 58, align: "right" },
      ]
    : [
        { key: "sl", label: "#", w: 16, align: "center" },
        { key: "desc", label: "Item name", w: 0, align: "left" },
        { key: "hsn", label: "HSN/SAC", w: 46, align: "left" },
        ...(opt.colour ? [{ key: "colour", label: "Colour", w: 44, align: "left" } as Col] : []),
        ...(opt.material ? [{ key: "material", label: "Material", w: 44, align: "left" } as Col] : []),
        ...(opt.mrp ? [{ key: "mrp", label: "MRP", w: 48, align: "right" } as Col] : []),
        { key: "qty", label: "Qty", w: 34, align: "right" },
        { key: "unit", label: "Unit", w: 30, align: "left" },
        { key: "rate", label: "Price/Unit", w: 54, align: "right" },
        { key: "disc", label: "Discount", w: 52, align: "right" },
        { key: "total", label: "Amount", w: 58, align: "right" },
      ];
  const descCol = cols.find((c) => c.key === "desc")!;
  descCol.w = W - cols.reduce((a, c) => a + c.w, 0);

  const header = () => {
    doc.rect(L, y, W, 16).fill(NAVY);
    let x = L;
    doc.font("B").fontSize(7.5).fillColor("#FFFFFF");
    for (const c of cols) {
      doc.text(c.label, x + 3, y + 4.5, { width: c.w - 6, align: c.align });
      x += c.w;
    }
    y += 18;
  };
  header();

  const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;
  snap.lines.forEach((l, idx) => {
    const under = snap.showTax ? [l.hsn ? `HSN ${l.hsn}` : null, l.colour ? `Colour ${l.colour}` : null, l.material ? `Material ${l.material}` : null, l.sku] : [l.sku];
    const subline = under.filter(Boolean).join(" · ");
    const desc = `${l.description}${l.isSample ? " [SAMPLE]" : ""}${subline ? `\n${subline}` : ""}`;
    const pct = discountPercent(l);
    const gstText = snap.showTax
      ? Number(l.gstRate) === 0
        ? "Exempt"
        : snap.supplyType === "inter"
          ? `${l.igstRate}%  ${formatINR(l.igstAmount).replace("₹", "")}`
          : `${l.cgstRate}%  ${formatINR(l.cgstAmount).replace("₹", "")}\n${l.sgstRate}%  ${formatINR(l.sgstAmount).replace("₹", "")}`
      : "";
    const cells: Record<string, string> = {
      sl: String(l.sl),
      desc,
      hsn: l.hsn ?? "",
      colour: l.colour ?? "",
      material: l.material ?? "",
      mrp: l.mrp ? formatINR(l.mrp).replace("₹", "") : "",
      qty: snap.showTax ? `${formatQty(l.quantity)} ${l.unit}` : formatQty(l.quantity),
      unit: l.unit,
      rate: `${formatINR(l.unitPrice).replace("₹", "")}${snap.showTax ? (l.priceIncludesTax ? "\n(incl.)" : "\n(excl.)") : ""}`,
      disc: Number(l.discount) ? `${formatINR(l.discount).replace("₹", "")}${pct ? `\n(${pct})` : ""}` : "—",
      taxable: formatINR(l.taxableValue).replace("₹", ""),
      gst: gstText,
      total: formatINR(l.total).replace("₹", ""),
    };
    doc.font("R").fontSize(7.5);
    const h = Math.max(...cols.map((c) => doc.heightOfString(cells[c.key], { width: c.w - 6 }))) + 6;
    if (y + h > bottomLimit) {
      doc.addPage();
      y = 36;
      header();
    }
    if (idx % 2 === 1) doc.rect(L, y - 2, W, h).fill("#F5F7FA");
    let x = L;
    for (const c of cols) {
      doc
        .font(c.key === "desc" ? "R" : "R")
        .fillColor(c.key === "total" ? NAVY : "#1F2937")
        .text(cells[c.key], x + 3, y + 1, { width: c.w - 6, align: c.align });
      x += c.w;
    }
    y += h;
  });
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.7).strokeColor(LINE).stroke();
  y += 8;

  /* ---------- Totals + tax summary ---------- */
  const ensure = (need: number) => {
    if (y + need > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = 36;
    }
  };
  ensure(140);
  const t = snap.totals;
  const rows: [string, string, boolean?][] = [["Gross amount", formatINR(t.gross)]];
  if (Number(t.lineDiscount)) rows.push(["Item discounts", `− ${formatINR(t.lineDiscount)}`]);
  if (Number(t.cartDiscount)) rows.push(["Bill discount", `− ${formatINR(t.cartDiscount)}`]);
  if (snap.showTax) {
    rows.push(["Taxable value", formatINR(t.taxable)]);
    if (Number(t.cgst)) rows.push(["CGST", formatINR(t.cgst)]);
    if (Number(t.sgst)) rows.push(["SGST", formatINR(t.sgst)]);
    if (Number(t.igst)) rows.push(["IGST", formatINR(t.igst)]);
    if (Number(t.cess)) rows.push(["Cess", formatINR(t.cess)]);
  }
  if (Number(t.roundOff)) rows.push(["Round off", formatINR(t.roundOff)]);
  rows.push([snap.docType === "credit_note" ? "CREDIT TOTAL" : "GRAND TOTAL", formatINR(t.grandTotal), true]);
  if (showsPaymentTotals(snap)) {
    rows.push(["Received", formatINR(snap.amountPaid)]);
    rows.push(["Balance", formatINR(snap.balanceDue)]);
  }
  if (snap.docType !== "credit_note" && Number(t.youSaved)) rows.push([snap.docType === "quotation" ? "You save" : "You saved", formatINR(t.youSaved)]);

  const totalsX = R - 210;
  let ry = y;
  for (const [k, v, strong] of rows) {
    if (strong) {
      doc.rect(totalsX - 4, ry - 3, 214, 18).fill(NAVY);
      doc
        .font("B")
        .fontSize(10)
        .fillColor("#FFFFFF")
        .text(k, totalsX, ry + 1, { width: 100 });
      doc.text(v, totalsX + 100, ry + 1, { width: 106, align: "right" });
      ry += 20;
    } else {
      doc.font("R").fontSize(8.5).fillColor(GREY).text(k, totalsX, ry, { width: 100 });
      doc.fillColor(NAVY).text(v, totalsX + 100, ry, { width: 106, align: "right" });
      ry += 13;
    }
  }

  // Left column: amount in words, tax summary, payments
  let ly = y;
  doc.font("B").fontSize(7.5).fillColor(GOLD).text("AMOUNT IN WORDS", L, ly);
  ly += 11;
  doc
    .font("B")
    .fontSize(8)
    .fillColor(NAVY)
    .text(t.amountInWords, L, ly, { width: W - 230 });
  ly = doc.y + 8;
  if (snap.showTax && snap.taxSummary.length) {
    doc.font("B").fontSize(7.5).fillColor(GOLD).text("TAX SUMMARY (HSN-WISE)", L, ly);
    ly += 11;
    const head = snap.supplyType === "inter" ? ["HSN", "Rate", "Taxable", "IGST"] : ["HSN", "Rate", "Taxable", "CGST", "SGST"];
    const cw = [60, 40, 70, 60, 60].slice(0, head.length);
    let x = L;
    doc.font("B").fontSize(7).fillColor(NAVY);
    head.forEach((h, i) => {
      doc.text(h, x, ly, { width: cw[i], align: i < 1 ? "left" : "right" });
      x += cw[i];
    });
    ly += 10;
    doc.font("R").fillColor("#1F2937");
    for (const r of snap.taxSummary) {
      const vals = snap.supplyType === "inter" ? [r.hsn ?? "—", `${r.gstRate}%`, r.taxableValue, r.igst] : [r.hsn ?? "—", `${r.gstRate}%`, r.taxableValue, r.cgst, r.sgst];
      x = L;
      vals.forEach((v, i) => {
        doc.text(i >= 2 ? formatINR(v).replace("₹", "") : v, x, ly, { width: cw[i], align: i < 1 ? "left" : "right" });
        x += cw[i];
      });
      ly += 10;
    }
    ly += 6;
  }
  if (snap.docType !== "quotation") {
    doc
      .font("B")
      .fontSize(7.5)
      .fillColor(GOLD)
      .text(snap.docType === "credit_note" ? "REFUND" : "PAYMENT MODE", L, ly);
    ly += 11;
    doc.font("R").fontSize(8).fillColor("#1F2937");
    for (const p of snap.payments) {
      const method = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
      doc.text(`${p.direction === "refund" ? "Refund · " : ""}${method}${p.reference ? ` · Ref ${p.reference}` : ""} · ${formatINR(p.amount)}`, L, ly, { width: W - 230 });
      ly = doc.y + 1;
    }
    doc
      .font("B")
      .fillColor(NAVY)
      .text(`Status: ${snap.paymentStatus}${Number(snap.balanceDue) ? ` · Balance due ${formatINR(snap.balanceDue)}` : ""}`, L, ly, { width: W - 230 });
    ly = doc.y + 6;
  }
  y = Math.max(ly, ry) + 10;

  /* ---------- Terms, bank, signature ---------- */
  ensure(90);
  doc.moveTo(L, y).lineTo(R, y).lineWidth(0.7).strokeColor(LINE).stroke();
  y += 8;
  const leftW = W - 200;
  let fy = y;
  if (snap.terms.length) {
    doc.font("B").fontSize(7.5).fillColor(GOLD).text("TERMS", L, fy);
    fy += 10;
    doc.font("R").fontSize(7.5).fillColor(GREY);
    snap.terms.forEach((term, i) => {
      doc.text(`${i + 1}. ${term}`, L, fy, { width: leftW });
      fy = doc.y + 1;
    });
    fy += 4;
  }
  if (snap.bankDetails) {
    doc.font("B").fontSize(7.5).fillColor(GOLD).text("BANK DETAILS", L, fy);
    fy += 10;
    doc.font("R").fontSize(7.5).fillColor(GREY).text(snap.bankDetails, L, fy, { width: leftW });
    fy = doc.y + 4;
  }
  doc.font("R").fontSize(7.5).fillColor(GREY).text(`Prepared by ${snap.issuedBy}. Computer-generated document.`, L, fy, { width: leftW });
  doc
    .font("B")
    .fontSize(8)
    .fillColor(NAVY)
    .text(snap.signatoryLabel, R - 190, y + 40, { width: 190, align: "right" });
  doc
    .moveTo(R - 150, y + 36)
    .lineTo(R, y + 36)
    .lineWidth(0.5)
    .strokeColor(GREY)
    .stroke();
  y = Math.max(doc.y, y + 60) + 6;
  if (snap.footerNote) doc.font("R").fontSize(8).fillColor(GOLD).text(snap.footerNote, L, y, { width: W, align: "center" });

  /* ---------- Watermarks & page numbers ---------- */
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The page number sits inside the bottom margin; without this pdfkit starts a blank page for it.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const marks: [string, string][] = [];
    if (snap.watermark) marks.push([snap.watermark, "#C0392B"]);
    if (opts.status === "cancelled") marks.push(["CANCELLED", "#C0392B"]);
    marks.forEach(([text, color], k) => {
      doc.save();
      doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc
        .font("B")
        .fontSize(text.length > 20 ? 26 : 70)
        .fillColor(color)
        .opacity(0.13)
        .text(text, 0, doc.page.height / 2 - 30 + k * 80, { width: doc.page.width, align: "center" });
      doc.restore();
      doc.opacity(1);
    });
    doc
      .font("R")
      .fontSize(7)
      .fillColor(GREY)
      .text(`${snap.number} · Page ${i - range.start + 1} of ${range.count}`, L, doc.page.height - 26, { width: W, align: "right", lineBreak: false });
    if (opts.status === "cancelled" && opts.cancelReason) {
      doc
        .font("B")
        .fontSize(7)
        .fillColor("#C0392B")
        .text(`Cancelled: ${opts.cancelReason}`, L, doc.page.height - 26, { width: W / 2, lineBreak: false });
    }
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return done;
}
