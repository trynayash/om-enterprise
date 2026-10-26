import "server-only";
/**
 * The printed bill, laid out once and drawn twice: as the PDF (document-pdf.ts) and as the page on
 * screen (components/documents/document-view.tsx), so both are the same A4 sheet line for line.
 *
 * The layout copies the shop's own Bill of Supply from its previous billing software (No. 729,
 * 18 Oct 2026): every rule, column and text position below was measured from that PDF, in points.
 * The frame never moves: a bill with one item and a bill with ten look the same, and items that do
 * not fit continue on another page with the same frame. Text is wrapped here, with the font's own
 * widths, so the PDF and the screen break lines in the same places.
 */
import path from "node:path";
import PDFDocument from "pdfkit";
import { DOC_TYPE_LABEL, type DocLine, type DocSnapshot } from "@/lib/document-types";
import { D, formatINR, formatQty, m } from "@/lib/money";
import { PAYMENT_METHOD_LABEL, stateLabel, youSavedOf } from "@/lib/bill-layout";

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

export type FontKey = "R" | "B" | "DV" | "DVB" | "GJ" | "GJB";
const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
export const FONT_FILES: Record<FontKey, string> = {
  R: path.join(FONT_DIR, "Roboto-Regular.ttf"),
  B: path.join(FONT_DIR, "Roboto-Bold.ttf"),
  // Roboto has no Hindi or Gujarati letters: text with any is set in the Noto font of its script.
  DV: path.join(FONT_DIR, "NotoSansDevanagari-Regular.ttf"),
  DVB: path.join(FONT_DIR, "NotoSansDevanagari-Bold.ttf"),
  GJ: path.join(FONT_DIR, "NotoSansGujarati-Regular.ttf"),
  GJB: path.join(FONT_DIR, "NotoSansGujarati-Bold.ttf"),
};
export const LOGO_FILE = path.join(process.cwd(), "assets", "brand", "om-enterprise-logo.jpg");

/** One thing drawn on a page. Text `x`/`y` are its left edge and the top of its line box. */
export type Draw =
  | { k: "text"; x: number; y: number; w: number; text: string; size: number; font: FontKey; ascent: number }
  | { k: "line"; x1: number; y1: number; x2: number; y2: number; width: number }
  | { k: "logo"; x: number; y: number; size: number }
  | { k: "stamp"; text: string; size: number; w: number; cx: number; cy: number; framed: boolean };

export interface SheetOptions {
  status: "issued" | "cancelled";
  cancelReason?: string | null;
  copyLabel?: string | null;
}

/* ----------------------------- Geometry (pt) ------------------------------ */

const BOX = { l: 33, r: 562.5, t: 53.25, b: 527.25 };
const MID = 297.75; // the header and the bottom sections split here
const HEAD = { split: 430.5, row1: 72.75, row2: 93, b: 116.25 };
const BILL_TO_B = 167.25;
const TABLE = { headB: 180, itemsB: 372.75, totalB: 385.5 };
const WORDS_B = 409.5;
const AMOUNTS_B = 459;
const PAD_L = 2.85;
const PAD_R = 2.1;

const BODY = 6.75;
const SELLER = 6.28;
const ROW_LINE = 7.5;
const ROW_MIN = 12.75;

type Align = "left" | "right";
interface Col {
  key: string;
  label: string;
  w: number;
  align: Align;
}

/** The shop's columns, as on its bill. */
const SUPPLY_COLS: Col[] = [
  { key: "sl", label: "#", w: 17.25, align: "left" },
  { key: "name", label: "Item name", w: 108, align: "left" },
  { key: "hsn", label: "HSN/ SAC", w: 45, align: "left" },
  { key: "colour", label: "Colour", w: 39, align: "left" },
  { key: "material", label: "Material", w: 39.75, align: "left" },
  { key: "mrp", label: "MRP", w: 39, align: "right" },
  { key: "qty", label: "Quantity", w: 49.5, align: "right" },
  { key: "unit", label: "Unit", w: 44.25, align: "right" },
  { key: "price", label: "Price/ Unit", w: 49.5, align: "right" },
  { key: "disc", label: "Discount", w: 48.75, align: "right" },
  { key: "amount", label: "Amount", w: 49.5, align: "right" },
];

/** A tax invoice swaps Colour, Material and MRP for its taxable value and GST, in the same width. */
const TAX_COLS: Col[] = [
  { key: "sl", label: "#", w: 17.25, align: "left" },
  { key: "name", label: "Item name", w: 108, align: "left" },
  { key: "hsn", label: "HSN/ SAC", w: 45, align: "left" },
  { key: "qty", label: "Quantity", w: 39, align: "right" },
  { key: "unit", label: "Unit", w: 30, align: "right" },
  { key: "price", label: "Price/ Unit", w: 49.5, align: "right" },
  { key: "disc", label: "Discount", w: 48.75, align: "right" },
  { key: "taxable", label: "Taxable", w: 52.5, align: "right" },
  { key: "gst", label: "GST", w: 70.5, align: "right" },
  { key: "amount", label: "Amount", w: 69, align: "right" },
];

/* ------------------------------ Measuring --------------------------------- */

let measurer: PDFKit.PDFDocument | null = null;
function fonts() {
  if (!measurer) {
    measurer = new PDFDocument({ autoFirstPage: false });
    for (const [k, file] of Object.entries(FONT_FILES)) measurer.registerFont(k, file);
  }
  return measurer;
}

const DEVANAGARI = /[ऀ-ॿ]/g;
const GUJARATI = /[઀-૿]/g;
function fontFor(text: string, bold: boolean): FontKey {
  const dv = text.match(DEVANAGARI)?.length ?? 0;
  const gj = text.match(GUJARATI)?.length ?? 0;
  if (!dv && !gj) return bold ? "B" : "R";
  return `${gj > dv ? "GJ" : "DV"}${bold ? "B" : ""}` as FontKey;
}

function metrics(font: FontKey) {
  const f = (fonts().font(font) as unknown as { _font: { ascender: number; descender: number } })._font;
  return { ascent: f.ascender / 1000, height: (f.ascender - f.descender) / 1000 };
}

function widthOf(text: string, font: FontKey, size: number) {
  return fonts().font(font).fontSize(size).widthOfString(text);
}

/** Greedy word wrap with the font's own widths; a word longer than the line is split. */
function wrap(text: string, bold: boolean, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, fontFor(next, bold), size) <= width) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      line = word;
      while (widthOf(line, fontFor(line, bold), size) > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && widthOf(line.slice(0, cut), fontFor(line, bold), size) > width) cut--;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

/* ------------------------------- Formatting ------------------------------- */

/** "₹ 9,700.00", as the shop's bill writes money. */
const inr = (v: string | number) => formatINR(v).replace("₹", "₹ ");

/** "(7.216%)", "(12.0%)": the discount against the price before it, as on the shop's bill. */
function discountShare(l: DocLine): string | null {
  const gross = D(l.unitPrice).times(D(l.quantity));
  if (!Number(l.discount) || gross.isZero()) return null;
  const pct = String(Number(D(l.discount).div(gross).times(100).toFixed(3)));
  return `(${pct.includes(".") ? pct : `${pct}.0`}%)`;
}

const dateIN = (iso: string) => {
  const p = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(iso));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
};

/** "Bill of Supply" from "BILL OF SUPPLY", "Invoice-cum-Bill of Supply" from "INVOICE-CUM-BILL OF SUPPLY". */
const titleOf = (s: DocSnapshot) =>
  s.title.toLowerCase().replace(/[a-z]+/g, (w, at: number) => (at > 0 && (w === "of" || w === "cum") ? w : w.charAt(0).toUpperCase() + w.slice(1))) || DOC_TYPE_LABEL[s.docType];

/** Units as short codes in capitals ("PCS"); bills from before the code was kept show the name. */
const unitText = (l: DocLine) => (l.unitCode ?? l.unit).toUpperCase();

/* --------------------------------- Layout --------------------------------- */

interface Row {
  line: DocLine;
  cells: Record<string, { lines: string[]; bold: boolean }>;
  h: number;
}

export function layoutDocument(s: DocSnapshot, opts: SheetOptions): Draw[][] {
  const showTax = s.showTax;
  const cols = showTax ? TAX_COLS : SUPPLY_COLS;
  const edges = [BOX.l];
  for (const c of cols) edges.push(edges[edges.length - 1] + c.w);
  const colX = Object.fromEntries(cols.map((c, i) => [c.key, { l: edges[i], r: edges[i + 1] }]));

  const rows: Row[] = s.lines.map((l) => rowFor(l, cols, showTax));
  const pages: Row[][] = [];
  let current: Row[] = [];
  let used = 0;
  for (const r of rows) {
    if (current.length && used + r.h > TABLE.itemsB - TABLE.headB) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(r);
    used += r.h;
  }
  pages.push(current);

  return pages.map((pageRows, i) => {
    const out: Draw[] = [];
    const page = new Page(out);
    const last = i === pages.length - 1;
    frame(page, edges);
    header(page, s, opts);
    billTo(page, s);
    table(page, s, cols, colX, pageRows, last);
    bottom(page, s, last, i + 2);
    if (pages.length > 1) page.text(`Page ${i + 1} of ${pages.length}`, BOX.r, BOX.b + 4, { size: 6, align: "right" });
    const stamp = (text: string, size: number, cy: number, framed: boolean) => out.push({ k: "stamp", text, size, w: widthOf(text, "B", size), cx: PAGE_W / 2, cy, framed });
    if (s.watermark) stamp(s.watermark, s.watermark.length > 20 ? 20 : 54, 300, false);
    if (opts.status === "cancelled") {
      stamp("CANCELLED", 46, s.watermark ? 360 : 300, true);
      if (opts.cancelReason) page.text(`Cancelled: ${opts.cancelReason}`, BOX.l, BOX.b + 4, { size: 6, bold: true, width: 380 });
    }
    return out;
  });
}

/** Pen for one page. */
class Page {
  constructor(private out: Draw[]) {}
  line(x1: number, y1: number, x2: number, y2: number, width = 0.75) {
    this.out.push({ k: "line", x1, y1, x2, y2, width });
  }
  logo(x: number, y: number, size: number) {
    this.out.push({ k: "logo", x, y, size });
  }
  /** One line of text: x is its left edge, its right edge (align right) or its centre (align center). */
  text(text: string, x: number, y: number, o: { size?: number; bold?: boolean; align?: "left" | "right" | "center"; width?: number } = {}) {
    if (!text) return;
    const size = o.size ?? BODY;
    const font = fontFor(text, !!o.bold);
    let t = text;
    // Never past the space given: shorten with an ellipsis rather than run into the next cell.
    if (o.width && widthOf(t, font, size) > o.width) {
      while (t.length > 1 && widthOf(`${t}…`, font, size) > o.width) t = t.slice(0, -1);
      t = `${t}…`;
    }
    const w = widthOf(t, font, size);
    const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
    this.out.push({ k: "text", x: left, y, w, text: t, size, font, ascent: metrics(font).ascent });
  }
}

/** Top of a line of text centred in [top, bottom]. */
const centred = (top: number, bottom: number, lines = 1, size = BODY, gap = ROW_LINE) => (top + bottom) / 2 - ((lines - 1) * gap + metrics("R").height * size) / 2;

function frame(p: Page, edges: number[]) {
  const { l, r, t, b } = BOX;
  p.line(l, t, r, t);
  p.line(l, b, r, b);
  p.line(l, t, l, b);
  p.line(r, t, r, b);
  // Header: seller | document number, date and place of supply
  p.line(MID, t, MID, HEAD.b);
  p.line(MID, HEAD.row1, r, HEAD.row1);
  p.line(MID, HEAD.row2, r, HEAD.row2);
  p.line(HEAD.split, t, HEAD.split, HEAD.row2);
  p.line(l, HEAD.b, r, HEAD.b);
  // Bill to | items table
  p.line(l, BILL_TO_B, r, BILL_TO_B);
  p.line(l, TABLE.headB, r, TABLE.headB);
  p.line(l, TABLE.itemsB, r, TABLE.itemsB);
  p.line(l, TABLE.totalB, r, TABLE.totalB);
  for (const x of edges.slice(1, -1)) p.line(x, BILL_TO_B, x, TABLE.totalB);
  // Amount in words, payment | amounts; terms | signature
  p.line(MID, TABLE.totalB, MID, b);
  p.line(l, WORDS_B, MID, WORDS_B);
  p.line(l, AMOUNTS_B, r, AMOUNTS_B, 1.5);
}

function header(p: Page, s: DocSnapshot, opts: SheetOptions) {
  p.text(titleOf(s), MID, 41.3, { size: 8.85, bold: true, align: "center" });
  if (opts.copyLabel) p.text(opts.copyLabel, BOX.r, 42.5, { align: "right" });

  // Seller, beside the logo
  p.logo(35.6, 72.6, 24.6);
  p.text(s.seller.name, 65.6, 56.8, { size: 10.1, bold: true, width: MID - 65.6 - 3 });
  const textW = MID - 65.6 - 3;
  // The address on one line, as on the shop's bill: a little smaller if it must be, else two lines.
  const addressText = s.seller.addressLines.filter(Boolean).join(", ");
  let addressSize = SELLER;
  while (addressSize > 5.4 && widthOf(addressText, fontFor(addressText, false), addressSize) > textW) addressSize -= 0.05;
  const oneLine = widthOf(addressText, fontFor(addressText, false), addressSize) <= textW;
  const address = oneLine ? [addressText] : wrap(addressText, false, SELLER, textW).slice(0, 2);
  const lines = [
    ...address,
    `Phone no.: ${s.seller.phone}`,
    ...(s.seller.email ? [`Email: ${s.seller.email}`] : []),
    ...(s.seller.gstin ? [`GSTIN: ${s.seller.gstin}`] : []),
    `State: ${stateLabel(s.seller.stateCode, s.seller.stateName)}`,
  ];
  // Five lines 9 pt apart, as on the shop's bill; a longer address closes them up to fit.
  const gap = lines.length <= 5 ? 9 : (HEAD.b - 3.5 - metrics("R").height * SELLER - 69.2) / (lines.length - 1);
  lines.forEach((t, i) => p.text(t, 65.6, 69.2 + i * gap, { size: i === 0 && oneLine ? addressSize : SELLER, width: textW }));

  // Number and date | place of supply and one more fact the document needs | declarations
  const kind = s.docType === "quotation" ? "Quotation No." : s.docType === "credit_note" ? "Credit Note No." : "Invoice No.";
  const cellW = HEAD.split - MID - PAD_L - PAD_R;
  const cellW2 = BOX.r - HEAD.split - 2.47 - PAD_R;
  p.text(kind, MID + PAD_L, 54.5);
  p.text(s.number, MID + PAD_L, 62.6, { bold: true, width: cellW });
  p.text("Date", HEAD.split + 2.47, 54.5);
  p.text(dateIN(s.issuedAt), HEAD.split + 2.47, 62.6, { bold: true });
  p.text("Place of Supply", MID + PAD_L, 74.8);
  p.text(stateLabel(s.placeOfSupply.stateCode, s.placeOfSupply.stateName), MID + PAD_L, 82.8, { bold: true, width: cellW });
  const extra: [string, string] | null = s.validUntil
    ? ["Valid Until", dateIN(s.validUntil)]
    : s.original
      ? [`Against ${DOC_TYPE_LABEL[s.original.docType]}`, `${s.original.number} (${dateIN(s.original.issuedAt)})`]
      : s.showTax
        ? ["Reverse Charge", s.reverseCharge ? "Yes" : "No"]
        : null;
  if (extra) {
    p.text(extra[0], HEAD.split + 2.47, 74.8, { width: cellW2 });
    p.text(extra[1], HEAD.split + 2.47, 82.8, { bold: true, width: cellW2 });
  }
  const notes = [s.declarationTop, s.validUntil ? null : s.subtitle].filter((x): x is string => !!x).join(". ");
  if (notes) {
    const nl = wrap(notes, false, BODY, BOX.r - MID - PAD_L - PAD_R).slice(0, 2);
    nl.forEach((t, i) => p.text(t, MID + PAD_L, centred(HEAD.row2, HEAD.b, nl.length) + i * ROW_LINE));
  }
}

function billTo(p: Page, s: DocSnapshot) {
  const b = s.buyer;
  const x = 37.9;
  const w = BOX.r - x - 4;
  p.text(s.docType === "quotation" ? "Quotation For" : "Bill To", x, 119.8);
  p.text(b ? (b.businessName ? `${b.businessName} (${b.name})` : b.name) : "Cash Sale", x, 132.3, { bold: true, width: w });
  if (!b) return;
  const lines = [
    [b.address, [b.city, b.pincode].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    [b.mobile ? `Contact No.: ${b.mobile}` : null, b.email ? `Email: ${b.email}` : null, b.gstin ? `GSTIN: ${b.gstin}` : null].filter(Boolean).join("     "),
    b.stateCode ? `State: ${stateLabel(b.stateCode, b.stateName)}` : "",
  ].filter(Boolean);
  // Two lines 12 pt apart, as on the shop's bill; three close up to fit.
  const tops = lines.length <= 2 ? [143, 155] : [141.2, 149.4, 157.6];
  lines.forEach((t, i) => p.text(t, x, tops[i], { width: w }));
}

function rowFor(l: DocLine, cols: Col[], showTax: boolean): Row {
  // Wrapped text may run to 1 pt from the rule, as on the shop's bill.
  const width = (key: string) => cols.find((c) => c.key === key)!.w - PAD_L - 1;
  const cell = (text: string, key: string, bold = false) => ({ lines: text ? wrap(text, bold, BODY, width(key)) : [], bold });
  const share = discountShare(l);
  const gst =
    Number(l.gstRate) === 0
      ? "Exempt"
      : Number(l.igstAmount)
        ? `IGST ${D(l.igstRate).toString()}% ${inr(l.igstAmount)}`
        : `CGST ${D(l.cgstRate).toString()}% ${inr(l.cgstAmount)}\nSGST ${D(l.sgstRate).toString()}% ${inr(l.sgstAmount)}`;
  const cells: Row["cells"] = {
    sl: cell(String(l.sl), "sl"),
    name: cell(`${l.description}${l.isSample ? " [SAMPLE]" : ""}`, "name", true),
    hsn: cell(l.hsn ?? "", "hsn"),
    colour: cols.some((c) => c.key === "colour") ? cell(l.colour ?? "", "colour") : { lines: [], bold: false },
    material: cols.some((c) => c.key === "material") ? cell(l.material ?? "", "material") : { lines: [], bold: false },
    mrp: l.mrp && cols.some((c) => c.key === "mrp") ? cell(D(l.mrp).toFixed(2), "mrp") : { lines: [], bold: false },
    qty: cell(formatQty(l.quantity), "qty"),
    unit: cell(unitText(l), "unit"),
    price: cell(`${inr(l.unitPrice)}${showTax ? `\n${l.priceIncludesTax ? "(incl. tax)" : "(excl. tax)"}` : ""}`, "price"),
    disc: { lines: share ? [inr(l.discount), share] : [inr(0)], bold: false },
    taxable: showTax ? cell(inr(l.taxableValue), "taxable") : { lines: [], bold: false },
    gst: showTax ? { lines: gst.split("\n"), bold: false } : { lines: [], bold: false },
    amount: cell(inr(l.total), "amount"),
  };
  const most = Math.max(1, ...Object.values(cells).map((c) => c.lines.length));
  // Two lines make a 19.2 pt row (the shop's bill: 19.5 to 20.25), so ten such items fill one page.
  return { line: l, cells, h: Math.max(ROW_MIN, most * ROW_LINE + 4.2) };
}

function table(p: Page, s: DocSnapshot, cols: Col[], colX: Record<string, { l: number; r: number }>, rows: Row[], last: boolean) {
  const at = (key: string, align: Align) => (align === "right" ? colX[key].r - PAD_R : colX[key].l + PAD_L);
  for (const c of cols) {
    const w = c.w - PAD_L - PAD_R;
    p.text(c.label, at(c.key, c.align), centred(BILL_TO_B, TABLE.headB), { bold: true, align: c.align, width: w });
  }
  let y = TABLE.headB;
  for (const r of rows) {
    for (const c of cols) {
      const cell = r.cells[c.key];
      if (!cell?.lines.length) continue;
      const top = centred(y, y + r.h, cell.lines.length);
      cell.lines.forEach((t, i) => p.text(t, at(c.key, c.align), top + i * ROW_LINE, { bold: cell.bold, align: c.align, width: c.w - PAD_L - 1 }));
    }
    y += r.h;
    p.line(BOX.l, y, BOX.r, y);
  }

  const ty = centred(TABLE.itemsB, TABLE.totalB);
  if (!last) {
    p.text("Continued on the next page", at("name", "left"), ty, { bold: true });
    return;
  }
  const items = s.lines.filter((l) => l.kind === "item");
  p.text("Total", at("name", "left"), ty, { bold: true });
  // Quantities add up only when every item is in the same unit.
  if (items.length && items.every((l) => unitText(l) === unitText(items[0])))
    p.text(formatQty(items.reduce((a, l) => a.plus(D(l.quantity)), D(0)).toString()), at("qty", "right"), ty, { bold: true, align: "right" });
  const sum = (k: "discount" | "total" | "taxableValue") => m(s.lines.reduce((a, l) => a.plus(D(l[k])), D(0)));
  p.text(inr(sum("discount")), at("disc", "right"), ty, { bold: true, align: "right" });
  if (s.showTax) p.text(inr(sum("taxableValue")), at("taxable", "right"), ty, { bold: true, align: "right" });
  p.text(inr(sum("total")), at("amount", "right"), ty, { bold: true, align: "right" });
}

function bottom(p: Page, s: DocSnapshot, last: boolean, nextPage: number) {
  const left = 35.85;
  const leftW = MID - left - PAD_R;
  const quotation = s.docType === "quotation";
  const credit = s.docType === "credit_note";

  // Amount in words
  p.text(quotation ? "Quotation Amount In Words" : credit ? "Credit Note Amount In Words" : "Invoice Amount In Words", left, 387.5);
  if (!last) {
    p.text(`Continued on page ${nextPage}`, left, 399.3, { bold: true });
  } else {
    const words = s.totals.amountInWords;
    let size = BODY;
    while (size > 5.6 && widthOf(words, fontFor(words, true), size) > leftW) size -= 0.1;
    if (widthOf(words, fontFor(words, true), size) <= leftW) p.text(words, left, 399.3 + (BODY - size) / 2, { bold: true, size });
    else
      wrap(words, true, 5.8, leftW)
        .slice(0, 2)
        .forEach((t, i) => p.text(t, left, 395.9 + i * 6.7, { bold: true, size: 5.8 }));
  }

  // Payment mode (a quotation states how long it holds; a credit note how it was settled)
  p.text(quotation ? "Validity" : credit ? "Refund Mode" : "Payment Mode", left, 411.5);
  if (last) {
    const mode = quotation
      ? s.validUntil
        ? `Prices held until ${dateIN(s.validUntil)}`
        : ""
      : s.payments.length
        ? s.payments.map((pay) => `${PAYMENT_METHOD_LABEL[pay.method] ?? pay.method}${pay.reference ? ` (Ref ${pay.reference})` : ""}`).join(", ")
        : s.paymentStatus;
    wrap(mode, true, BODY, leftW)
      .slice(0, 3)
      .forEach((t, i) => p.text(t, left, 424.1 + i * ROW_LINE, { bold: true }));
  }

  // Amounts
  const t = s.totals;
  const rows: [string, string, boolean][] = [["Amounts", "", true]];
  if (last) {
    const subTotal = s.showTax ? t.taxable : m(s.lines.reduce((a, l) => a.plus(D(l.total)), D(0)));
    rows.push(["Sub Total", inr(subTotal), false]);
    if (s.showTax) {
      if (Number(t.cgst)) rows.push(["CGST", inr(t.cgst), false]);
      if (Number(t.sgst)) rows.push(["SGST", inr(t.sgst), false]);
      if (Number(t.igst)) rows.push(["IGST", inr(t.igst), false]);
      if (Number(t.cess)) rows.push(["Cess", inr(t.cess), false]);
    }
    if (Number(t.roundOff)) rows.push(["Round Off", inr(t.roundOff), false]);
    rows.push(["Total", inr(t.grandTotal), true]);
    if (credit) rows.push(["Refunded", inr(s.amountPaid), false]);
    else if (!quotation) {
      rows.push(["Received", inr(s.amountPaid), false]);
      rows.push(["Balance", inr(s.balanceDue), false]);
    }
    const saved = t.youSaved ?? youSavedOf(s.lines);
    if (!credit) rows.push([quotation ? "You Save" : "You Saved", inr(saved), false]);
  }
  const x = MID + PAD_L;
  const xr = BOX.r - PAD_R;
  const standard = rows.length === 6 && rows[2][0] === "Total" && rows[5][0] === "You Saved";
  if (!last) {
    // A page that continues: the same ruled box, the amounts come on the last page.
    p.text("Amounts", x, 388.1, { bold: true });
    p.line(MID, WORDS_B, BOX.r, WORDS_B);
    p.line(MID, 433.5, BOX.r, 433.5);
    p.line(MID, 446.25, BOX.r, 446.25);
  } else if (standard) {
    // Exactly the shop's bill: Amounts | Sub Total, Total | Received, Balance, You Saved
    [388.1, 398.8, 412.1, 423.5, 435.5, 448.3].forEach((y, i) => {
      p.text(rows[i][0], x, y, { bold: rows[i][2] });
      p.text(rows[i][1], xr, y, { bold: rows[i][2], align: "right" });
    });
    p.line(MID, WORDS_B, BOX.r, WORDS_B);
    p.line(MID, 433.5, BOX.r, 433.5);
    p.line(MID, 446.25, BOX.r, 446.25);
  } else {
    const pitch = (AMOUNTS_B - TABLE.totalB) / Math.max(rows.length, 6);
    rows.forEach(([k, v, bold], i) => {
      const top = TABLE.totalB + i * pitch;
      if (["Total", "Balance", "You Saved", "You Save", "Refunded"].includes(k) && i > 0) p.line(MID, top, BOX.r, top);
      const ty = centred(top, top + pitch);
      p.text(k, x, ty, { bold });
      p.text(v, xr, ty, { bold, align: "right" });
    });
  }

  // Terms | signature
  const tx = 40.04;
  const termsW = MID - tx - 4;
  p.text("Terms and conditions", tx, 466.1, { bold: true });
  const terms = [
    ...s.terms.map((term, i) => (s.terms.length > 1 ? `${i + 1}. ${term}` : term)),
    ...(s.footerNote ? [s.footerNote] : []),
    ...(s.bankDetails ? [`Bank details: ${s.bankDetails.replace(/\s*\n\s*/g, ", ")}`] : []),
  ];
  terms
    .flatMap((term) => wrap(term, false, BODY, termsW))
    .slice(0, 6)
    .forEach((line, i) => p.text(line, tx, 477.5 + i * ROW_LINE));
  const cx = (MID + BOX.r) / 2;
  p.text(`For: ${s.seller.name}`, cx, 465.5, { align: "center", width: BOX.r - MID - 8 });
  p.text("Authorized Signatory", cx, 513.3, { bold: true, align: "center" });
}
