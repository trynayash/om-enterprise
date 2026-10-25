import { IMPORT_COLUMNS, REQUIRED_COLUMNS } from "@/lib/import-columns";
import { cleanCell, toAsciiDigits } from "./text";

/**
 * Turns a supplier's table (any layout) into rows of the bulk-import sheet: finds the header row,
 * guesses which column holds what, cleans prices and codes, and fills in the values that are the
 * same for the whole file (category, brand, unit, GST). Pure functions, shared by the import page
 * and the tests.
 */
export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportRow = Record<ImportColumn, string>;

export const SOURCE_FIELDS = [
  "product_name",
  "variant",
  "variant2",
  "sku",
  "mrp",
  "selling_price",
  "purchase_cost",
  "description",
  "hsn_code",
  "gst_rate",
  "unit",
  "brand",
  "model",
  "barcode",
  "image_url",
] as const;
export type SourceField = (typeof SOURCE_FIELDS)[number];

export interface MappingSettings {
  /** Column index in the file for each field; absent = not in the file. */
  columns: Partial<Record<SourceField, number>>;
  category: string;
  brand: string;
  unit: string;
  gstRate: string;
  hsnCode: string;
  priceIncludesTax: boolean;
  sellingFrom: "column" | "mrp" | "mrp_less" | "none";
  sellingLessPercent: string;
  costFrom: "column" | "mrp_less" | "none";
  costLessPercent: string;
  /** The purchase price column includes GST; the import wants it before GST. */
  costIncludesTax: boolean;
  skuFrom: "column" | "auto";
  skuPrefix: string;
  /** Group headings: a name on a row without prices is the product name for the rows below. */
  fillDown: boolean;
  skipWithoutPrice: boolean;
  sourceInfo: string;
}

/** Letters of any script, the marks that go with them (Hindi and Gujarati vowel signs), digits, and a few symbols. */
const NOT_WORD = new RegExp("[^\\p{L}\\p{M}\\p{N}%#/ ]+", "gu");
/** Two or more letters of any script (a name or a word, not a number). */
const WORD = new RegExp("[\\p{L}\\p{M}]{2}", "u");
const WORD3 = new RegExp("[\\p{L}\\p{M}]{3}", "u");

/** A heading or cell made comparable: lower case, native digits to 0–9, nukta dropped (साइज़ = साइज), symbols to spaces. */
export const norm = (s: string) =>
  toAsciiDigits(s.normalize("NFC"))
    .toLowerCase()
    .replace(/[\u093C\u0ABC]/g, "")
    .replace(NOT_WORD, " ")
    .replace(/\s+/g, " ")
    .trim();

/** True when the file already uses the import template's own column names. */
export function isTemplateHeader(row: string[]): boolean {
  const names = new Set(row.map((c) => c.trim().toLowerCase().replace(/\s+/g, "_")));
  return REQUIRED_COLUMNS.every((c) => names.has(c));
}

/** Heading patterns per field, strongest first. Each column is used for at most one field. */
const HEADER_HINTS: [SourceField, RegExp[]][] = [
  // English first; then Hindi and Gujarati (headings are compared after `norm`: nukta dropped, no capitals).
  ["sku", [/^(code|sku|item code|cat no|part no|art no|code no|sr code|design no)$/, /\b(item|product|part|article|art|cat|catalogue|catalog|material|mat|design|style)\s*(code|no|number|#)\b/, /^(कोड|आइटम कोड|आइटम नं|कोड नं|मॉडल नं|કોડ|આઇટમ કોડ|પ્રોડક્ટ કોડ|કોડ નં)( |$)/]],
  ["barcode", [/bar ?code|\bean\b|\bupc\b|gtin/, /बार ?कोड|બાર ?કોડ/]],
  ["hsn_code", [/\bhsn\b|\bsac\b/, /एचएसएन|एच एस एन|એચએસએન|એચ એસ એન/]],
  ["gst_rate", [/\bgst\b|\bigst\b|tax ?(rate|%)|\bvat\b/, /जीएसटी|जी एस टी|कर दर|टैक्स|જીએસટી|જી એસ ટી|ટેક્સ|કર દર/]],
  ["mrp", [/\bmrp\b|\bm r p\b|max(imum)? retail/, /list ?price|\blp\b|retail price|price list/, /एमआरपी|एम आर पी|अधिकतम खुदरा|मुद्रित मूल्य|એમઆરપી|એમ આર પી|મહત્તમ છૂટક|છાપેલ કિંમત/]],
  ["purchase_cost", [/dealer|\bdp\b|\bd p\b|distributor|net ?(rate|price)|landing|purchase|\bcost\b|trade price|\bnlc\b|\bnett\b|billing price/, /डीलर|डिस्ट्रीब्यूटर|नेट रेट|नेट दर|खरीद|लागत|ડીલર|ડિસ્ટ્રિબ્યુટર|નેટ રેટ|ખરીદ|પડતર/]],
  ["selling_price", [/selling|sale ?price|offer|our price|special price/, /^price$|^rate$|^rates$|unit price|^amount$|price per/, /विक्रय|बिक्री मूल्य|हमारा मूल्य|વેચાણ|અમારી કિંમત/, /^(दर|भाव|रेट|मूल्य|कीमत|दाम|रेट प्रति नग|રેટ|ભાવ|દર|કિંમત|કીમત)$/]],
  ["product_name", [/\bproduct\b|item ?name|particulars|^item$|^items$|^name$|name of|item description|product description|material description/, /^description$/, /उत्पाद|वस्तु|आइटम|सामान|माल का नाम|नाम|ઉત્પાદન|વસ્તુ|આઇટમ|માલ|નામ/, /^(विवरण|વર્ણન|વિગત)$/]],
  ["variant", [/\bsize\b|\bdia\b|diameter|\bvariant\b|capacity|dimension|\bod\b|\bnb\b|^mm$|\binch\b|thickness|\bclass\b|pressure|\bsdr\b|pack ?size|volume|\blitre\b|\bltr\b/, /\blength\b/, /साइज|आकार|माप|व्यास|मोटाई|સાઇઝ|સાઈઝ|માપ|કદ|ડાયા/]],
  ["variant2", [/colou?r|shade|finish|^type$/, /रंग|कलर|प्रकार|રંગ|કલર|પ્રકાર|ફિનિશ/]],
  ["model", [/\bmodel\b/, /मॉडल|મોડેલ/]],
  ["brand", [/\bbrand\b|\bmake\b|manufacturer/, /ब्रांड|ब्रैंड|कंपनी|निर्माता|બ્રાન્ડ|બ્રાંડ|કંપની/]],
  ["unit", [/^unit$|\buom\b|\bu o m\b|^units$/, /^(इकाई|यूनिट|यूओएम|એકમ|યુનિટ)$/]],
  ["image_url", [/image|photo|picture|\bimg\b/, /फोटो|चित्र|तस्वीर|ફોટો|ચિત્ર|તસવીર/]],
  ["description", [/description|details|specification|remarks|features/, /विशेषता|विवरण|टिप्पणी|रिमार्क्स|विशिष्टता|વિશેષતા|વિગત|ટિપ્પણી|રિમાર્ક્સ/]],
];

/** The row most likely to be the header: the one whose cells look most like column names. */
export function detectHeaderRow(rows: string[][]): number {
  let best = -1;
  let bestScore = 1;
  rows.slice(0, 40).forEach((row, i) => {
    const cells = row.map((c) => norm(c)).filter(Boolean);
    if (cells.length < 2) return;
    const hits = cells.filter((c) => c.length <= 40 && HEADER_HINTS.some(([, res]) => res.some((re) => re.test(c)))).length;
    const numeric = cells.filter((c) => /^[\d ,./%-]+$/.test(c)).length;
    const score = hits * 2 - numeric;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** The text of a row with a single cell of words and nothing else: a group heading such as "CPVC Elbow 90°". */
export function headingOf(row: string[]): string {
  const filled = row.map((c) => cleanCell(c ?? "")).filter(Boolean);
  return filled.length === 1 && filled[0].length <= 120 && WORD.test(filled[0]) ? filled[0] : "";
}

const PAGE_NUMBER = /^(page|pg\.?|p\.)\s*\d+|\bpage\s*\d+\s*(of|\/)\s*\d+\b/i;

/** Column guesses from the header row; each column is used for at most one field. */
export function guessColumns(header: string[], sample: string[][], above: string[] = []): Partial<Record<SourceField, number>> {
  const out: Partial<Record<SourceField, number>> = {};
  const used = new Set<number>();
  const cells = header.map((c) => norm(c));
  let weakName = false;
  for (const [field, res] of HEADER_HINTS) {
    for (const [k, re] of res.entries()) {
      const i = cells.findIndex((c, idx) => c && !used.has(idx) && re.test(c));
      if (i >= 0) {
        out[field] = i;
        used.add(i);
        if (field === "product_name") weakName = k > 0;
        break;
      }
    }
  }
  // A catalogue that names each product in a heading above its rows, with a long "Description"
  // of every size: the headings are the names and the column is the description.
  if (weakName && out.product_name !== undefined && out.description === undefined) {
    const values = sample.map((r) => cleanCell(r[out.product_name!] ?? "")).filter(Boolean);
    const avg = values.reduce((n, v) => n + v.length, 0) / Math.max(1, values.length);
    // The heading of the first block sits above the column headings, outside the sample.
    if (sample.filter((r) => headingOf(r)).length + (headingOf(above) ? 1 : 0) >= 2 && avg > 45) {
      out.description = out.product_name;
      delete out.product_name;
    }
  }
  // No named product column: take the column with the most text in it.
  if (out.product_name === undefined) {
    const widest = textiestColumn(sample, used);
    if (widest >= 0) {
      out.product_name = widest;
      used.add(widest);
    }
  }
  return out;
}

function textiestColumn(rows: string[][], used: Set<number>): number {
  const width = Math.max(0, ...rows.map((r) => r.length));
  let best = -1;
  let bestLen = 0;
  for (let c = 0; c < width; c++) {
    if (used.has(c)) continue;
    const values = rows.map((r) => r[c] ?? "").filter(Boolean);
    const text = values.filter((v) => WORD3.test(v));
    const avg = text.reduce((n, v) => n + v.length, 0) / Math.max(1, values.length);
    if (text.length >= values.length * 0.6 && avg > bestLen) {
      bestLen = avg;
      best = c;
    }
  }
  return best;
}

/** "₹ 1,29,000.00/-" → "129000"; "Rs.450.50" → "450.5"; anything without a number → "". */
export function parseAmount(raw: string): string {
  const s = toAsciiDigits(raw)
    .replace(/[\u00a0\s]/g, "")
    .replace(/(rs\.?|inr|₹|रु\.?|रू\.?|રૂ\.?|\/-)/gi, "");
  const m = s.match(/-?\d[\d,]*(\.\d+)?/);
  if (!m) return "";
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return "";
  return String(Math.round(n * 100) / 100);
}

export function parsePercent(raw: string): string {
  raw = toAsciiDigits(raw);
  const m = raw.match(/\d+(\.\d+)?/);
  if (!m) return "";
  const n = Number(m[0]);
  // 0.18 written as a fraction means 18 %.
  const pct = n > 0 && n < 1 && !raw.includes("%") ? n * 100 : n;
  return pct >= 0 && pct <= 100 ? String(Math.round(pct * 100) / 100) : "";
}

const UNIT_ALIASES: Record<string, string> = {
  pc: "pcs",
  pcs: "pcs",
  piece: "pcs",
  pieces: "pcs",
  each: "pcs",
  ea: "pcs",
  unit: "pcs",
  units: "pcs",
  no: "nos",
  nos: "nos",
  number: "nos",
  numbers: "nos",
  set: "set",
  sets: "set",
  l: "ltr",
  lt: "ltr",
  ltr: "ltr",
  ltrs: "ltr",
  litre: "ltr",
  litres: "ltr",
  liter: "ltr",
  liters: "ltr",
  kg: "kg",
  kgs: "kg",
  kilo: "kg",
  m: "m",
  mt: "m",
  mtr: "m",
  mtrs: "m",
  meter: "m",
  meters: "m",
  metre: "m",
  metres: "m",
  rmt: "m",
  rm: "m",
  ft: "ft",
  feet: "ft",
  rft: "ft",
  foot: "ft",
  box: "box",
  boxes: "box",
  carton: "box",
  ctn: "box",
  roll: "roll",
  rolls: "roll",
  coil: "roll",
  pack: "pack",
  packs: "pack",
  pkt: "pack",
  packet: "pack",
  packets: "pack",
  bag: "bag",
  bags: "bag",
  bucket: "bucket",
  buckets: "bucket",
  drum: "bucket",
  tin: "bucket",
  can: "bucket",
  length: "length",
  lengths: "length",
  len: "length",
};

/** Hindi and Gujarati unit names, by the text without spaces and dots. */
const INDIC_UNITS: Record<string, string> = {
  नग: "nos", नंग: "nos", नगं: "nos", पीस: "pcs", पिस: "pcs", नं: "nos", નંગ: "nos", પીસ: "pcs",
  મીટર: "m", मीटर: "m", मी: "m", મી: "m", रनिंगमीटर: "m",
  किलो: "kg", किग्रा: "kg", कि: "kg", કિલો: "kg", કિગ્રા: "kg",
  लीटर: "ltr", ली: "ltr", लिटर: "ltr", લિટર: "ltr", લીટર: "ltr",
  सेट: "set", સેટ: "set",
  डिब्बा: "box", बॉक्स: "box", कार्टन: "box", ડબ્બો: "box", બોક્સ: "box", કાર્ટન: "box",
  रोल: "roll", કોઇલ: "roll", રોલ: "roll", कॉइल: "roll",
  पैकेट: "pack", पैक: "pack", પેકેટ: "pack", પેક: "pack",
  बैग: "bag", थैला: "bag", બેગ: "bag", થેલી: "bag",
  बाल्टी: "bucket", ड्रम: "bucket", ડોલ: "bucket", બકેટ: "bucket", ડ્રમ: "bucket",
  फुट: "ft", ફૂટ: "ft", फीट: "ft",
  लंबाई: "length", લંબાઈ: "length",
};

export function normalizeUnit(raw: string, known: string[]): string {
  const key = raw.toLowerCase().replace(/[^a-z]/g, "");
  const indic = INDIC_UNITS[raw.normalize("NFC").replace(/[\s.]/g, "")];
  const code = UNIT_ALIASES[key] ?? indic ?? key;
  return known.includes(code) ? code : "";
}

const slug = (s: string, max: number) => {
  const latin = s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  if (latin || !s.trim()) return latin;
  // A name with no Latin letters (Hindi, Gujarati): a short code worked out from the name, so the
  // same product gets the same code on the next price list.
  let hash = 5381;
  for (const ch of s.normalize("NFC").trim()) hash = ((hash * 33) ^ ch.codePointAt(0)!) >>> 0;
  return hash.toString(36).toUpperCase().slice(0, Math.min(max, 6));
};

/** A code the import accepts: letters, digits and . _ / - only, up to 40 characters. */
export function cleanSku(raw: string): string {
  return toAsciiDigits(raw)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._/-]/g, "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 40);
}

export interface BuildResult {
  rows: ImportRow[];
  /** Row number in the source table (1-based) for each output row. */
  sourceRows: number[];
  skipped: { row: number; reason: string }[];
}

export function buildImportRows(table: string[][], headerRow: number, s: MappingSettings, knownUnits: string[]): BuildResult {
  const header = headerRow >= 0 ? table[headerRow] : [];
  const headerKey = header.map((c) => norm(c)).join("|");
  const col = (field: SourceField) => s.columns[field];
  const get = (row: string[], field: SourceField) => {
    const i = col(field);
    return i === undefined ? "" : cleanCell(row[i] ?? "");
  };
  const v2Label = col("variant2") !== undefined ? cleanCell(header[col("variant2")!] ?? "") || "Option" : "Option";
  const out: BuildResult = { rows: [], sourceRows: [], skipped: [] };
  const usedSkus = new Set<string>();
  // A heading right above the column headings names the first group (catalogues with a small
  // table under each product's name).
  let carried = s.fillDown && headerRow > 0 ? headingOf(table[headerRow - 1] ?? []) : "";
  // Text repeated on its own row again and again is a page header or footer (the company name,
  // "Price list 2026"), not a group heading.
  const singles = new Map<string, number>();
  for (const row of table) {
    const t = headingOf(row ?? []);
    if (t) singles.set(t, (singles.get(t) ?? 0) + 1);
  }

  for (let i = headerRow + 1; i < table.length; i++) {
    const row = table[i] ?? [];
    const rowNo = i + 1;
    if (!row.some((c) => c && c.trim())) continue;
    if (headerRow >= 0 && row.map((c) => norm(c)).join("|") === headerKey) {
      out.skipped.push({ row: rowNo, reason: "Repeated header" });
      continue;
    }
    const nameCell = get(row, "product_name");
    const mrp = parseAmount(get(row, "mrp"));
    const sellingCell = s.sellingFrom === "column" ? parseAmount(get(row, "selling_price")) : "";
    const costCell = s.costFrom === "column" ? parseAmount(get(row, "purchase_cost")) : "";
    const hasPrice = !!(mrp || sellingCell || costCell);
    const code = get(row, "sku");
    const size = get(row, "variant");

    const single = headingOf(row);
    if (single && !hasPrice && ((singles.get(single) ?? 0) >= 3 || PAGE_NUMBER.test(single))) {
      out.skipped.push({ row: rowNo, reason: "Page header or footer" });
      continue;
    }
    // Without a product name column, any row with only a name is a heading.
    const heading = !hasPrice && (nameCell && !code && !size ? nameCell : col("product_name") === undefined ? single : "");
    if (s.fillDown && heading) {
      carried = heading;
      out.skipped.push({ row: rowNo, reason: "Heading — name used for the rows below" });
      continue;
    }
    if (nameCell) carried = nameCell;
    const name = nameCell || (s.fillDown ? carried : "");
    if (!name) {
      out.skipped.push({ row: rowNo, reason: "No product name" });
      continue;
    }
    if (s.skipWithoutPrice && !hasPrice) {
      out.skipped.push({ row: rowNo, reason: "No price" });
      continue;
    }

    const v2 = get(row, "variant2");
    const variantName = [size, v2].filter(Boolean).join(" · ") || "Standard";
    const attributes = [size && `Size=${size.replace(/[;=]/g, " ")}`, v2 && `${v2Label.replace(/[;=]/g, " ")}=${v2.replace(/[;=]/g, " ")}`].filter(Boolean).join("; ");

    const less = (pct: string) => (mrp && pct ? Number(mrp) * (1 - Math.min(100, Math.max(0, Number(pct) || 0)) / 100) : NaN);
    const selling =
      s.sellingFrom === "column"
        ? sellingCell
        : s.sellingFrom === "mrp"
          ? mrp
          : s.sellingFrom === "mrp_less" && Number.isFinite(less(s.sellingLessPercent))
            ? String(Math.round(less(s.sellingLessPercent)))
            : "";
    const gst = parsePercent(get(row, "gst_rate")) || s.gstRate;
    let cost = s.costFrom === "column" ? costCell : s.costFrom === "mrp_less" && Number.isFinite(less(s.costLessPercent)) ? String(Math.round(less(s.costLessPercent) * 100) / 100) : "";
    if (cost && s.costIncludesTax && Number(gst) > 0) cost = String(Math.round((Number(cost) / (1 + Number(gst) / 100)) * 100) / 100);

    let sku = s.skuFrom === "column" ? cleanSku(code) : "";
    if (!sku) sku = autoSku(s.skuPrefix || s.brand, name, variantName);
    let unique = sku;
    for (let n = 2; usedSkus.has(unique.toUpperCase()); n++) unique = `${sku.slice(0, 36)}-${n}`;
    usedSkus.add(unique.toUpperCase());

    const unitCell = col("unit") !== undefined ? normalizeUnit(get(row, "unit"), knownUnits) : "";
    const hsn = toAsciiDigits(get(row, "hsn_code")).replace(/\D/g, "") || s.hsnCode.replace(/\D/g, "");

    const r = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c, ""])) as ImportRow;
    Object.assign(r, {
      product_name: name.slice(0, 200),
      category: s.category,
      brand: get(row, "brand") || s.brand,
      model: get(row, "model"),
      description: get(row, "description"),
      hsn_code: hsn,
      gst_rate: gst,
      unit: unitCell || s.unit,
      source_info: s.sourceInfo ? `${s.sourceInfo} (row ${rowNo})`.slice(0, 500) : "",
      image_url: get(row, "image_url"),
      sku: unique,
      barcode: get(row, "barcode").replace(/\s/g, ""),
      variant_name: variantName.slice(0, 120),
      variant_attributes: attributes,
      mrp,
      selling_price: selling,
      price_includes_tax: s.priceIncludesTax ? "yes" : "no",
      purchase_cost: cost,
    } satisfies Partial<ImportRow>);
    out.rows.push(r);
    out.sourceRows.push(rowNo);
  }
  return out;
}

/** A readable, repeatable code: same product and size give the same code on the next price list. */
export function autoSku(prefix: string, name: string, variant: string): string {
  const p = slug(prefix, 6) || "ITEM";
  const n = slug(name, 18);
  const v = variant === "Standard" ? "" : slug(variant, 10);
  return [p, n, v].filter(Boolean).join("-").slice(0, 40).replace(/-+$/, "");
}

/** Rows of the import sheet as a table with the template's header. */
export function importSheet(rows: ImportRow[]): string[][] {
  return [[...IMPORT_COLUMNS], ...rows.map((r) => IMPORT_COLUMNS.map((c) => r[c]))];
}

export interface PriceCheck {
  /** Index in `rows`. */
  index: number;
  reason: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/**
 * Rows whose prices don't fit the rest of the list, for files read from a scan or photo where a
 * missing decimal point turns 11.5 into 115: a dealer price above the MRP or far from the usual
 * share of it, and a price that jumps up or down against both neighbouring sizes of its product.
 */
export function suspectPrices(rows: ImportRow[]): PriceCheck[] {
  const found = new Map<number, string>();
  const num = (s: string) => (s ? Number(s) : NaN);

  const ratios = rows.map((r) => num(r.purchase_cost) / num(r.mrp));
  const usual = median(ratios.filter((x) => Number.isFinite(x) && x > 0));
  rows.forEach((r, i) => {
    const x = ratios[i];
    if (!Number.isFinite(x)) return;
    if (x > 1) found.set(i, `Dealer price ${r.purchase_cost} is above the MRP ${r.mrp}`);
    else if (Number.isFinite(usual) && ratios.filter(Number.isFinite).length >= 6 && (x > usual * 1.6 || x < usual / 1.6)) {
      found.set(i, `Dealer price ${r.purchase_cost} is ${Math.round(x * 100)}% of the MRP ${r.mrp}; most rows are about ${Math.round(usual * 100)}%`);
    }
  });

  for (const field of ["mrp", "selling_price", "purchase_cost"] as const) {
    const label = { mrp: "MRP", selling_price: "Selling price", purchase_cost: "Dealer price" }[field];
    for (let i = 1; i + 1 < rows.length; i++) {
      const [a, b, c] = [num(rows[i - 1][field]), num(rows[i][field]), num(rows[i + 1][field])];
      if (rows[i - 1].product_name !== rows[i].product_name || rows[i + 1].product_name !== rows[i].product_name) continue;
      if (![a, b, c].every((x) => x > 0)) continue;
      const [lo, hi] = [Math.min(a, c), Math.max(a, c)];
      // The neighbours agree with each other; this one is far from both.
      if (hi <= lo * 3 && (b > hi * 3 || b < lo / 3) && !found.has(i)) found.set(i, `${label} ${rows[i][field]} is far from the sizes either side (${a} and ${c})`);
    }
  }
  return [...found].map(([index, reason]) => ({ index, reason })).sort((x, y) => x.index - y.index);
}
