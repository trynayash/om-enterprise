/**
 * India-specific validation and GST helpers.
 * Sources: GST state code master (GSTIN prefix), CGST Rule 46(b) (≤16-char serial numbers).
 */

export const STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

const STATE_BY_CODE = new Map(STATES.map((s) => [s.code, s.name]));

export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return STATE_BY_CODE.get(code) ?? null;
}

export function isValidStateCode(code: string): boolean {
  return STATE_BY_CODE.has(code);
}

/* ------------------------------------------------------------------ */
/* GSTIN                                                               */
/* ------------------------------------------------------------------ */

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (total % 36)) % 36];
}

export type GstinCheck = { ok: true; normalized: string; stateCode: string } | { ok: false; error: string };

/** Validates format, state code and the mod-36 check digit. Does NOT confirm the GSTIN is active. */
export function validateGstin(input: string): GstinCheck {
  const g = input.replace(/\s+/g, "").toUpperCase();
  if (!GSTIN_RE.test(g)) return { ok: false, error: "GSTIN must be 15 characters in the format 22AAAAA0000A1Z5" };
  const stateCode = g.slice(0, 2);
  if (!isValidStateCode(stateCode)) return { ok: false, error: `Unknown state code ${stateCode} in GSTIN` };
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) {
    return { ok: false, error: "GSTIN check digit is invalid — please re-check the number" };
  }
  return { ok: true, normalized: g, stateCode };
}

/* ------------------------------------------------------------------ */
/* Contact details                                                     */
/* ------------------------------------------------------------------ */

/** Normalise an Indian mobile number to 10 digits, or null if invalid. */
export function normalizeMobile(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function isValidPincode(pin: string): boolean {
  return /^[1-9][0-9]{5}$/.test(pin);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

export function isValidHsn(hsn: string): boolean {
  return /^[0-9]{4,8}$/.test(hsn);
}

/* ------------------------------------------------------------------ */
/* Financial year & document numbers (Asia/Kolkata)                    */
/* ------------------------------------------------------------------ */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar parts of a timestamp in India Standard Time (no DST in India). */
export function istParts(date: Date): { year: number; month: number; day: number } {
  const t = new Date(date.getTime() + IST_OFFSET_MS);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/** Indian financial year (1 April – 31 March) containing `date`, e.g. "2026-27". */
export function financialYear(date: Date): string {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** "2026-27" → "26-27" (keeps document numbers within 16 characters). */
export function fyShort(fy: string): string {
  const [a, b] = fy.split("-");
  return `${a.slice(2)}-${b}`;
}

/** Start of the IST day as a UTC Date. */
export function istStartOfDay(date: Date): Date {
  const { year, month, day } = istParts(date);
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function istStartOfMonth(date: Date): Date {
  const { year, month } = istParts(date);
  return new Date(Date.UTC(year, month - 1, 1) - IST_OFFSET_MS);
}

export function istStartOfFinancialYear(date: Date): Date {
  const { year, month } = istParts(date);
  const start = month >= 4 ? year : year - 1;
  return new Date(Date.UTC(start, 3, 1) - IST_OFFSET_MS);
}

export const DOC_PREFIX_RE = /^[A-Z0-9]{1,4}$/;

/**
 * Builds e.g. "OE/26-27/00042". Rule 46(b): ≤ 16 characters; letters, digits, '-' and '/' only;
 * unique within the financial year.
 */
export function formatDocNumber(prefix: string, fy: string, seq: number): string {
  if (!DOC_PREFIX_RE.test(prefix)) throw new Error(`Invalid document prefix "${prefix}"`);
  const n = `${prefix}/${fyShort(fy)}/${String(seq).padStart(5, "0")}`;
  if (n.length > 16) throw new Error(`Document number ${n} exceeds 16 characters`);
  return n;
}

/* ------------------------------------------------------------------ */
/* UPI                                                                 */
/* ------------------------------------------------------------------ */

export const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

export function isValidVpa(vpa: string): boolean {
  return VPA_RE.test(vpa.trim());
}

/** UPI transaction reference (UTR / RRN) as shown in UPI apps: 12 digits. */
export function isValidUpiUtr(ref: string): boolean {
  return /^\d{12}$/.test(ref.trim());
}

/**
 * NPCI UPI linking spec URI for a scan-to-pay QR with a fixed amount.
 * `am` without `mam` means the payer app must not let the customer edit the amount — but a
 * customer can still pay the VPA manually for any amount, so this is NOT proof of payment.
 */
export function buildUpiUri(args: {
  vpa: string;
  payeeName: string;
  amount: string; // rupees, 2dp
  note: string;
  merchantCode?: string | null;
  reference?: string | null;
}): string {
  if (!isValidVpa(args.vpa)) throw new Error("Invalid UPI ID");
  if (!/^\d{1,9}\.\d{2}$/.test(args.amount)) throw new Error("UPI amount must have exactly 2 decimals");
  const params: [string, string][] = [
    ["pa", args.vpa.trim()],
    ["pn", args.payeeName.trim().slice(0, 50)],
    ["am", args.amount],
    ["cu", "INR"],
    ["tn", args.note.trim().slice(0, 50)],
  ];
  if (args.merchantCode) params.push(["mc", args.merchantCode]);
  if (args.reference) params.push(["tr", args.reference.slice(0, 35)]);
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function whatsappLink(number: string, text?: string): string {
  const digits = number.replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
