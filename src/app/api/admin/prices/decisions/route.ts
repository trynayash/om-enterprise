import { z } from "zod";
import { api } from "@/server/http";
import { decidePriceChanges } from "@/server/services/pricing";
import { MAX_FILTER_SEARCH, PENDING_PRICE_SORTS, PRICE_AMOUNT_RE, PRICE_CHANGES, PRICE_SOURCES } from "@/lib/price-filters";

// A whole imported price list (up to 5,000 prices) is decided in chunks.
export const maxDuration = 60;

const values = <T extends string>(list: { value: T }[]) => list.map((o) => o.value) as [T, ...T[]];
const amount = z.string().regex(PRICE_AMOUNT_RE, "Enter an amount like 1250 or 1250.50");
const filter = z
  .object({
    q: z.string().trim().min(1).max(MAX_FILTER_SEARCH).optional(),
    brandId: z.union([z.literal("none"), z.uuid()]).optional(),
    categoryId: z.uuid().optional(),
    source: z.enum(values(PRICE_SOURCES)).optional(),
    change: z.enum(values(PRICE_CHANGES)).optional(),
    min: amount.optional(),
    max: amount.optional(),
    importBatchId: z.uuid().optional(),
    sort: z.enum(values(PENDING_PRICE_SORTS)).optional(),
  })
  .strict();
const body = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(300).nullable().optional(),
  filter,
  asOf: z.iso.datetime({ offset: true }),
});

/** Approve or reject every waiting price that matches a filter (as shown on Approvals or Price review). */
export const POST = api({ permission: "prices.approve" }, async (ctx) => {
  const b = await ctx.body(body);
  return decidePriceChanges(ctx.actor, { decision: b.decision, note: b.note ?? null, filter: b.filter, asOf: new Date(b.asOf) });
});
