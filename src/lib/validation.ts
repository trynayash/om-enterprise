/**
 * Shared input schemas (API routes + forms). Money/quantities are strings to stay exact.
 */
import { z } from "zod";
import { isValidHsn } from "@/lib/india";

export const moneyStr = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter an amount like 1250 or 1250.50");
export const costStr = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, "Enter an amount with up to 4 decimals");
export const qtyStr = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, "Enter a quantity like 2 or 2.5")
  .refine((v) => Number(v) > 0, "Quantity must be greater than zero");
export const percentStr = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 5 or 7.5")
  .refine((v) => Number(v) <= 100, "Cannot exceed 100%");
export const rateStr = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,3})?$/, "Enter a rate like 18 or 0.25");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const uuid = z.string().uuid();

export const discountSchema = z
  .object({ type: z.enum(["percent", "amount"]), value: z.string().trim().regex(/^\d{1,10}(\.\d{1,2})?$/) })
  .nullable()
  .optional();

/* ---------------- Catalogue ---------------- */

export const categoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,80}$/, "lowercase letters, digits and dashes")
    .optional(),
  parentId: uuid.nullable().optional(),
  description: optionalText(500),
  icon: optionalText(30),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  targetMarginPercent: percentStr.nullable().optional(),
  minMarginPercent: percentStr.nullable().optional(),
});

export const brandInput = z.object({
  name: z.string().trim().min(1).max(80),
  manufacturer: optionalText(120),
  description: optionalText(500),
  website: optionalText(200),
  isActive: z.boolean().optional(),
});

export const specRow = z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(300) });

export const productInput = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,80}$/)
    .optional(),
  brandId: uuid.nullable().optional(),
  categoryId: uuid,
  manufacturer: optionalText(120),
  model: optionalText(80),
  description: optionalText(4000),
  specifications: z.array(specRow).max(60).optional(),
  variantAttributes: z.array(z.string().trim().min(1).max(40)).max(6).optional(),
  warrantyInfo: optionalText(500),
  hsnCode: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidHsn(v), "HSN must be 4–8 digits")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  taxClassId: uuid.nullable().optional(),
  unitCode: z.string().trim().min(1).max(20),
  discountEligible: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isSample: z.boolean().optional(),
  sourceInfo: optionalText(500),
});

export const variantInput = z.object({
  sku: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{1,39}$/, "SKU: 2–40 letters/digits, may include . _ / -"),
  barcode: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{6,32}$/, "Barcode: 6–32 characters")
    .optional()
    .nullable()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  name: z.string().trim().min(1).max(120),
  attributes: z.record(z.string().trim().max(40), z.string().trim().max(80)).optional(),
  unitCode: z.string().trim().min(1).max(20),
  taxClassId: uuid.nullable().optional(),
  discountEligible: z.boolean().nullable().optional(),
  targetMarginPercent: percentStr.nullable().optional(),
  minMarginPercent: percentStr.nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  reorderLevel: qtyStr.nullable().optional(),
});

export const priceTierInput = z.object({ minQty: qtyStr, price: moneyStr });

export const priceInput = z.object({
  variantId: uuid,
  priceListId: uuid.optional(),
  price: moneyStr,
  priceIncludesTax: z.boolean(),
  mrp: moneyStr.nullable().optional(),
  tiers: z.array(priceTierInput).max(10).optional(),
  effectiveFrom: z.string().datetime({ offset: true }).optional().nullable(),
  reason: z.string().trim().min(3, "Please give a reason for the price change").max(300),
});

export const costInput = z.object({
  variantId: uuid,
  purchaseCost: costStr,
  purchaseTaxRate: rateStr.default("0"),
  freight: costStr.default("0"),
  handling: costStr.default("0"),
  otherCosts: costStr.default("0"),
  effectiveFrom: z.string().datetime({ offset: true }).optional().nullable(),
  supplierId: uuid.nullable().optional(),
  sourceRef: optionalText(120),
  reason: z.string().trim().min(3, "Please describe the source of this cost").max(300),
});

/* ---------------- Customers ---------------- */

export const customerInput = z.object({
  name: z.string().trim().min(1).max(120),
  mobile: z.string().trim().max(20).optional().nullable(),
  whatsapp: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
  businessName: optionalText(160),
  gstin: z.string().trim().max(20).optional().nullable(),
  billingAddress: optionalText(400),
  city: optionalText(80),
  stateCode: z.string().trim().max(2).optional().nullable(),
  pincode: z.string().trim().max(10).optional().nullable(),
  customerType: z.enum(["retail", "contractor", "business"]).optional(),
  notes: optionalText(500),
});

/* ---------------- Website ---------------- */

export const websiteOrderInput = z.object({
  kind: z.enum(["enquiry", "order_request"]),
  customerName: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(10).max(16),
  email: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(400).optional().nullable(),
  message: z.string().trim().max(1000).optional().nullable(),
  preferredContact: z.enum(["call", "whatsapp", "email"]).optional().nullable(),
  items: z
    .array(z.object({ variantId: uuid, quantity: qtyStr }))
    .max(50)
    .default([]),
  /** Honeypot — must stay empty. */
  website: z.string().max(0).optional().default(""),
});
