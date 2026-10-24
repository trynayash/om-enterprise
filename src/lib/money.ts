/**
 * Exact decimal arithmetic for money, quantities and rates.
 * Never use JS floats for monetary values: always go through `D()`.
 */
import Decimal from "decimal.js";

// Dedicated Decimal clone so global config changes elsewhere can't affect us.
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export type DecInput = Dec | string | number;

export function D(v: DecInput | null | undefined): Dec {
  if (v === null || v === undefined || v === "") return new Dec(0);
  if (typeof v === "number" && !Number.isFinite(v)) throw new Error(`Invalid number: ${v}`);
  return new Dec(v as Decimal.Value);
}

export const ZERO = new Dec(0);
export const HUNDRED = new Dec(100);

/** Round to paise (2dp), half-up — used for every stored money amount. */
export function r2(v: DecInput): Dec {
  return D(v).toDecimalPlaces(2, Dec.ROUND_HALF_UP);
}

/** Round to 4dp — used for unit costs. */
export function r4(v: DecInput): Dec {
  return D(v).toDecimalPlaces(4, Dec.ROUND_HALF_UP);
}

/** Round to whole rupees, half-up. */
export function r0(v: DecInput): Dec {
  return D(v).toDecimalPlaces(0, Dec.ROUND_HALF_UP);
}

/** Fixed 2dp string for storage / APIs. */
export function m(v: DecInput): string {
  return r2(v).toFixed(2);
}

export function sum(values: DecInput[]): Dec {
  return values.reduce<Dec>((acc, v) => acc.plus(D(v)), new Dec(0));
}

export function isValidDecimalString(s: string, maxDp = 2): boolean {
  const re = new RegExp(`^-?\\d{1,12}(\\.\\d{1,${maxDp}})?$`);
  return re.test(s.trim());
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ₹1,23,456.78 — Indian digit grouping. */
export function formatINR(v: DecInput | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  // Intl accepts a numeric string without float conversion for formatting purposes.
  return inrFormatter.format(r2(v).toFixed(2) as unknown as number);
}

const inrWholeFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** Catalogue prices: ₹1,290 for whole rupees, ₹170.50 otherwise. Bills keep formatINR. */
export function formatPrice(v: DecInput | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const d = r2(v);
  return d.isInteger() ? inrWholeFormatter.format(d.toFixed(0) as unknown as number) : formatINR(d);
}

const numFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 });
export function formatQty(v: DecInput): string {
  return numFormatter.format(D(v).toFixed(3) as unknown as number);
}

export function formatPercent(v: DecInput | null | undefined, dp = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  return `${D(v).toFixed(dp)}%`;
}

/* ------------------------------------------------------------------ */
/* Amount in words (Indian numbering: thousand, lakh, crore)            */
/* ------------------------------------------------------------------ */

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${TENS[t]} ${ONES[o]}` : TENS[t];
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

function integerToIndianWords(nStr: string): string {
  // Works on the integer part as a string to stay exact for big values.
  let n = BigInt(nStr);
  if (n === BigInt(0)) return "Zero";
  const parts: string[] = [];
  const crore = n / BigInt(10000000);
  n = n % BigInt(10000000);
  if (crore > BigInt(0)) parts.push(`${integerToIndianWords(crore.toString())} Crore`);
  const lakh = Number(n / BigInt(100000));
  n = n % BigInt(100000);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  const thousand = Number(n / BigInt(1000));
  n = n % BigInt(1000);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  const rest = Number(n);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

/** "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six and Seventy Eight Paise Only" */
export function amountInWords(v: DecInput): string {
  const amt = r2(v);
  if (amt.isNegative()) return `Minus ${amountInWords(amt.abs())}`;
  const [rupees, paise] = amt.toFixed(2).split(".");
  const rupeeWords = integerToIndianWords(rupees);
  const paiseNum = Number(paise);
  if (paiseNum === 0) return `Rupees ${rupeeWords} Only`;
  return `Rupees ${rupeeWords} and ${twoDigits(paiseNum)} Paise Only`;
}
