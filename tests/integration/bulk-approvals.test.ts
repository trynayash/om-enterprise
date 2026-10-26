import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { approvalRequests, auditLogs, sales, variantPrices } from "@/server/db/schema";
import { createBrand, createCategory, createProduct, createVariant } from "@/server/services/catalog";
import {
  decidePriceChange,
  decidePriceChanges,
  getActivePrices,
  getDefaultPriceList,
  proposePrice,
  recordCost,
  searchPendingPriceChanges,
} from "@/server/services/pricing";
import { addLine, createSale, decideApproval, decideApprovals, finalizeSale, getSale, requestApproval, updateLine } from "@/server/services/sales";
import { setPermissionOverrides, updateStaff } from "@/server/services/users";
import { parsePendingPriceFilter } from "@/lib/price-filters";
import type { Actor } from "@/server/auth/actor";
import { makeItem, makeUser, rejects, reload, setRegistration, taxClassId, uid } from "./helpers";

beforeAll(async () => {
  await setRegistration("regular");
});

const LIST_REASON = "Manufacturer list price: Test price list w.e.f. 1 July 2021, excl. GST";
const MARKET_REASON = "Market price (researched): two dealers in Rajkot";

/** A product and variant in a given brand and category, with an optional live price and a pending proposal. */
async function variantWith(
  owner: Actor,
  opts: { tag: string; name: string; brandId: string | null; categoryId: string; live?: string; cost?: string; proposed: string; includesTax: boolean; reason: string },
) {
  const product = await createProduct(owner, {
    name: `${opts.name} ${opts.tag}`,
    brandId: opts.brandId,
    categoryId: opts.categoryId,
    unitCode: "pcs",
    taxClassId: await taxClassId("18"),
    hsnCode: "3917",
  });
  const variant = await createVariant(owner, product.id, { sku: uid(`${opts.tag}-`).toUpperCase(), name: "Std", unitCode: "pcs" });
  if (opts.live) await proposePrice(owner, { variantId: variant.id, price: opts.live, priceIncludesTax: true, reason: "test price" });
  if (opts.cost) {
    await recordCost(owner, { variantId: variant.id, purchaseCost: opts.cost, purchaseTaxRate: "18", freight: "0", handling: "0", otherCosts: "0", reason: "test cost" });
  }
  const pending = await proposePrice(owner, { variantId: variant.id, price: opts.proposed, priceIncludesTax: opts.includesTax, reason: opts.reason, requireApproval: true });
  return { productId: product.id, variantId: variant.id, sku: variant.sku, pendingId: pending.id };
}

/**
 * Four waiting prices under one parent category (two in a subcategory), in two brands and one without:
 * a list price increase (1,180 → 1,300 incl.), a new list price (1,000 + 18% = 1,180 incl.),
 * a researched market decrease (500 → 450) and a manual increase (200 → 225).
 */
async function scene() {
  const owner = await makeUser("super_admin");
  const tag = uid("BLK").toUpperCase();
  const brandA = await createBrand(owner, { name: `Pipes ${tag}` });
  const brandB = await createBrand(owner, { name: `Seals ${tag}` });
  const parent = await createCategory(owner, { name: `Plumbing ${tag}` });
  const child = await createCategory(owner, { name: `Fittings ${tag}`, parentId: parent.id });
  const listUp = await variantWith(owner, { tag, name: "Pipe", brandId: brandA.id, categoryId: parent.id, live: "1180", cost: "800", proposed: "1300", includesTax: true, reason: LIST_REASON });
  const listNew = await variantWith(owner, { tag, name: "Elbow", brandId: brandA.id, categoryId: child.id, proposed: "1000", includesTax: false, reason: LIST_REASON });
  const marketDown = await variantWith(owner, { tag, name: "Seal", brandId: brandB.id, categoryId: child.id, live: "500", proposed: "450", includesTax: true, reason: MARKET_REASON });
  const manualUp = await variantWith(owner, { tag, name: "Clamp", brandId: null, categoryId: parent.id, live: "200", proposed: "225", includesTax: true, reason: "Supplier increase" });
  return { owner, tag, brandA, brandB, parent, child, listUp, listNew, marketDown, manualUp };
}

const statusOf = async (id: string) => (await getDb().select({ s: variantPrices.status }).from(variantPrices).where(eq(variantPrices.id, id)))[0].s;

describe("searching the prices waiting for approval", () => {
  it("filters by category (with its subcategories), brand, source, change and price incl. GST, and sums up the set", async () => {
    const s = await scene();
    const search = (f: Parameters<typeof searchPendingPriceChanges>[1]) => searchPendingPriceChanges(s.owner, f);
    const skus = async (f: Parameters<typeof searchPendingPriceChanges>[1]) => (await search(f)).items.map((i) => i.sku).sort();

    const all = await search({ categoryId: s.parent.id });
    expect(all.total).toBe(4);
    expect(all.summary).toMatchObject({ total: 4, newPrices: 1, increases: 2, decreases: 1 });
    expect(all.summary.brands).toEqual(
      expect.arrayContaining([
        { brandId: s.brandA.id, name: s.brandA.name, count: 2 },
        { brandId: s.brandB.id, name: s.brandB.name, count: 1 },
        { brandId: null, name: "No brand", count: 1 },
      ]),
    );
    expect(all.summary.sources).toEqual(expect.arrayContaining([{ source: "list", count: 2 }, { source: "market", count: 1 }, { source: "manual", count: 1 }]));
    expect(all.summary.notes[0]).toEqual({ reason: LIST_REASON, count: 2 });

    expect(await skus({ categoryId: s.child.id })).toEqual([s.listNew.sku, s.marketDown.sku].sort());
    expect(await skus({ categoryId: s.parent.id, brandId: s.brandA.id })).toEqual([s.listUp.sku, s.listNew.sku].sort());
    expect(await skus({ categoryId: s.parent.id, brandId: "none" })).toEqual([s.manualUp.sku]);
    expect(await skus({ categoryId: s.parent.id, source: "list" })).toEqual([s.listUp.sku, s.listNew.sku].sort());
    expect(await skus({ categoryId: s.parent.id, source: "market" })).toEqual([s.marketDown.sku]);
    expect(await skus({ categoryId: s.parent.id, source: "manual" })).toEqual([s.manualUp.sku]);
    expect(await skus({ categoryId: s.parent.id, source: "import" })).toEqual([]);
    expect(await skus({ categoryId: s.parent.id, change: "new" })).toEqual([s.listNew.sku]);
    expect(await skus({ categoryId: s.parent.id, change: "up" })).toEqual([s.listUp.sku, s.manualUp.sku].sort());
    expect(await skus({ categoryId: s.parent.id, change: "down" })).toEqual([s.marketDown.sku]);
    // 1,000 + 18% GST = 1,180 incl. GST
    expect(await skus({ categoryId: s.parent.id, min: "1180", max: "1180" })).toEqual([s.listNew.sku]);
    expect(await skus({ categoryId: s.parent.id, min: "1200" })).toEqual([s.listUp.sku]);
    expect(await skus({ categoryId: s.parent.id, max: "450" })).toEqual([s.manualUp.sku, s.marketDown.sku].sort());
    expect(await skus({ q: s.listUp.sku.toLowerCase() })).toEqual([s.listUp.sku]);
    expect(await skus({ q: `Seal ${s.tag}` })).toEqual([s.marketDown.sku]);

    // Totals follow the filter; a brand chosen still lists the other brands to switch to.
    const brandOnly = await search({ categoryId: s.parent.id, brandId: s.brandB.id });
    expect(brandOnly.total).toBe(1);
    expect(brandOnly.brandOptions.map((b) => b.count).reduce((a, b) => a + b, 0)).toBe(4);
  });

  it("sorts and pages in the database, with the price incl. GST and the change", async () => {
    const s = await scene();
    const asc = await searchPendingPriceChanges(s.owner, { categoryId: s.parent.id, sort: "price_asc" });
    expect(asc.items.map((i) => i.priceInclGst)).toEqual(["225.00", "450.00", "1180.00", "1300.00"]);
    const up = asc.items.find((i) => i.sku === s.listUp.sku)!;
    expect(up).toMatchObject({ changePct: "10.2", source: "list", brandName: s.brandA.name, categoryName: s.parent.name, productId: s.listUp.productId });
    expect(asc.items.find((i) => i.sku === s.listNew.sku)).toMatchObject({ changePct: null, categoryName: s.child.name });
    const biggest = await searchPendingPriceChanges(s.owner, { categoryId: s.parent.id, sort: "change" });
    expect(biggest.items.map((i) => i.sku)).toEqual([s.manualUp.sku, s.listUp.sku, s.marketDown.sku, s.listNew.sku]);
    const page2 = await searchPendingPriceChanges(s.owner, { categoryId: s.parent.id, sort: "price_desc" }, { page: 2, pageSize: 3 });
    expect(page2).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(page2.items.map((i) => i.priceInclGst)).toEqual(["225.00"]);
    // A page past the end shows the last page.
    expect((await searchPendingPriceChanges(s.owner, { categoryId: s.parent.id }, { page: 9, pageSize: 3 })).page).toBe(2);
  });

  it("keeps cost and margin hidden from an approver without cost access", async () => {
    const s = await scene();
    const vikram = await makeUser("admin");
    await setPermissionOverrides(s.owner, vikram.id, [
      { permission: "prices.approve", effect: "grant" },
      { permission: "costs.view", effect: "deny" },
    ]);
    const v = await reload(vikram);
    const seen = (await searchPendingPriceChanges(v, { q: s.listUp.sku })).items[0];
    expect(seen.version.landedCostSnapshot).toBeNull();
    expect(seen.version.marginPercentSnapshot).toBeNull();
    const owners = (await searchPendingPriceChanges(s.owner, { q: s.listUp.sku })).items[0];
    expect(owners.version.landedCostSnapshot).toBe("800.0000");
    expect((await rejects(searchPendingPriceChanges(await makeUser("sales"), {}))).message).toMatch(/permission/);
  });

  it("reads the filter from the page address, leaving out what is not valid", () => {
    const q = new URLSearchParams("q=%20elbow%20&brandId=none&categoryId=nope&source=list&change=sideways&min=10.5&max=1.234&sort=price_desc&importBatchId=1b4e28ba-2fa1-11d2-883f-0016d3cca427");
    expect(parsePendingPriceFilter(q)).toEqual({ q: "elbow", brandId: "none", source: "list", min: "10.5", sort: "price_desc", importBatchId: "1b4e28ba-2fa1-11d2-883f-0016d3cca427" });
    expect(parsePendingPriceFilter({ brandId: ["1B4E28BA-2FA1-11D2-883F-0016D3CCA427"], max: "99" })).toEqual({ brandId: "1b4e28ba-2fa1-11d2-883f-0016d3cca427", max: "99" });
  });
});

describe("approve all / reject all prices", () => {
  it("decides only the waiting prices that match, with one audit record each and one summary", async () => {
    const s = await scene();
    const list = await getDefaultPriceList();
    const shown = await searchPendingPriceChanges(s.owner, { categoryId: s.parent.id, source: "list" });
    const r = await decidePriceChanges(s.owner, { decision: "approve", note: "Checked against the printed list", filter: { categoryId: s.parent.id, source: "list" }, asOf: shown.asOf });
    expect(r).toMatchObject({ decision: "approve", decided: 2, skipped: 0, warnings: [] });
    expect(await statusOf(s.listUp.pendingId)).toBe("approved");
    expect(await statusOf(s.listNew.pendingId)).toBe("approved");
    expect(await statusOf(s.marketDown.pendingId)).toBe("pending");
    expect(await statusOf(s.manualUp.pendingId)).toBe("pending");
    const live = await getActivePrices([s.listUp.variantId, s.listNew.variantId], list.id);
    expect(live.get(s.listUp.variantId)?.price).toBe("1300.00");
    expect(live.get(s.listNew.variantId)?.price).toBe("1000.00");

    const db = getDb();
    const perItem = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "price.change_approved"), sql`${auditLogs.data}->>'batchId' = ${r.batchId}`));
    expect(perItem).toHaveLength(2);
    const upRow = perItem.find((a) => a.entityId === s.listUp.variantId)!;
    expect(upRow).toMatchObject({ entityType: "variant", actorUserId: s.owner.id, summary: `Approved price change for ${s.listUp.sku}: ₹1180.00 → ₹1300.00` });
    expect(upRow.data).toEqual({ priceVersionId: s.listUp.pendingId, note: "Checked against the printed list", requestedBy: s.owner.id, batchId: r.batchId, bulk: true });
    const summary = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "price.bulk_approved"), sql`${auditLogs.data}->>'batchId' = ${r.batchId}`));
    expect(summary).toHaveLength(1);
    expect(summary[0].data).toMatchObject({ decided: 2, skipped: 0, note: "Checked against the printed list", filter: { categoryId: s.parent.id, source: "list" } });

    // The same records as a single decision, apart from the batch.
    await decidePriceChange(s.owner, s.manualUp.pendingId, "approve", "one by one");
    const [single] = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "price.change_approved"), eq(auditLogs.entityId, s.manualUp.variantId)));
    expect(Object.keys(single.data as object).sort()).toEqual(["note", "priceVersionId", "requestedBy"]);
    expect(single.summary).toBe(`Approved price change for ${s.manualUp.sku}: ₹200.00 → ₹225.00`);

    const again = await decidePriceChanges(s.owner, { decision: "approve", filter: { categoryId: s.parent.id, source: "list" }, asOf: new Date() });
    expect(again).toMatchObject({ decided: 0, skipped: 0 });
  });

  it("never decides a proposal made after the list was shown", async () => {
    const s = await scene();
    const shown = await searchPendingPriceChanges(s.owner, { categoryId: s.child.id });
    await new Promise((r) => setTimeout(r, 10));
    // A newer proposal for the market item replaces the one on screen.
    const newer = await proposePrice(s.owner, { variantId: s.marketDown.variantId, price: "440", priceIncludesTax: true, reason: MARKET_REASON, requireApproval: true });
    const r = await decidePriceChanges(s.owner, { decision: "approve", filter: { categoryId: s.child.id }, asOf: shown.asOf });
    expect(r.decided).toBe(1);
    expect(await statusOf(s.listNew.pendingId)).toBe("approved");
    expect(await statusOf(s.marketDown.pendingId)).toBe("cancelled");
    expect(await statusOf(newer.id)).toBe("pending");
  });

  it("refuses users who may not approve prices, and a rejection without a reason", async () => {
    const s = await scene();
    const yash = await makeUser("admin");
    const filter = { categoryId: s.parent.id };
    expect((await rejects(decidePriceChanges(yash, { decision: "approve", filter, asOf: new Date() }))).message).toMatch(/permission/);
    expect((await rejects(decidePriceChanges(s.owner, { decision: "reject", filter, asOf: new Date() }))).message).toMatch(/reason/);
    expect((await rejects(decidePriceChanges(s.owner, { decision: "reject", note: "no", filter, asOf: new Date() }))).message).toMatch(/reason/);
    expect(await statusOf(s.listUp.pendingId)).toBe("pending");
    const r = await decidePriceChanges(s.owner, { decision: "reject", note: "Old list, prices excl. GST", filter: { ...filter, brandId: s.brandB.id }, asOf: new Date() });
    expect(r.decided).toBe(1);
    const [v] = await getDb().select().from(variantPrices).where(eq(variantPrices.id, s.marketDown.pendingId));
    expect(v).toMatchObject({ status: "rejected", decidedBy: s.owner.id, decisionNote: "Old list, prices excl. GST" });
    const [row] = await getDb().select().from(auditLogs).where(and(eq(auditLogs.action, "price.change_rejected"), eq(auditLogs.entityId, s.marketDown.variantId)));
    expect(row.summary).toBe(`Rejected price change for ${s.marketDown.sku}: ₹500.00 → ₹450.00`);
  });

  it("warns when an approved price is not the one in force", async () => {
    const s = await scene();
    const list = await getDefaultPriceList();
    // A later approved price for the manual item, entered directly.
    await getDb().insert(variantPrices).values({
      variantId: s.manualUp.variantId,
      priceListId: list.id,
      price: "230.00",
      priceIncludesTax: true,
      effectiveFrom: new Date(),
      status: "approved",
      reason: "test later price",
      createdBy: s.owner.id,
      decidedBy: s.owner.id,
      decidedAt: new Date(),
    });
    const r = await decidePriceChanges(s.owner, { decision: "approve", filter: { categoryId: s.parent.id, brandId: "none" }, asOf: new Date() });
    expect(r.decided).toBe(1);
    expect(r.warnings).toEqual([{ sku: s.manualUp.sku, reason: "a later price is already in force" }]);
    expect((await getActivePrices([s.manualUp.variantId], list.id)).get(s.manualUp.variantId)?.price).toBe("230.00");
  });
});

describe("approve all / reject all discounts", () => {
  async function discountRequest(cashier: Actor, owner: Actor, percent: string, cost = "500") {
    const item = await makeItem(owner, { price: "1000", cost });
    const sale = await createSale(cashier);
    await addLine(cashier, sale.id, { variantId: item.variantId, quantity: "1" });
    const line = (await getSale(cashier, sale.id)).lines[0];
    await updateLine(cashier, sale.id, line.id, { discount: { type: "percent", value: percent } });
    const req = await requestApproval(cashier, sale.id, "Regular customer");
    return { saleId: sale.id, requestId: req.id };
  }

  it("decides what the approver may, and skips the rest with the reason", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const yash = await makeUser("admin"); // approves up to 15%
    const ok = await discountRequest(sachin, kishan, "12");
    const tooMuch = await discountRequest(sachin, kishan, "20");
    const own = await discountRequest(yash, kishan, "12");
    const r = await decideApprovals(yash, { decision: "approve", note: "Monthly customers", ids: [ok.requestId, tooMuch.requestId, own.requestId] });
    expect(r.decided).toBe(1);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped.find((x) => x.id === tooMuch.requestId)?.reason).toMatch(/approval limit/);
    expect(r.skipped.find((x) => x.id === own.requestId)?.reason).toMatch(/own request/);
    expect(r.skipped.every((x) => x.saleNumber)).toBe(true);
    const status = async (id: string) => (await getDb().select({ s: approvalRequests.status }).from(approvalRequests).where(eq(approvalRequests.id, id)))[0].s;
    expect(await status(ok.requestId)).toBe("approved");
    expect(await status(tooMuch.requestId)).toBe("pending");
    expect(await status(own.requestId)).toBe("pending");
    const db = getDb();
    const summary = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "discount.bulk_decided"), eq(auditLogs.actorUserId, yash.id)));
    expect(summary).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(and(eq(auditLogs.action, "discount.approved"), eq(auditLogs.entityId, ok.saleId)))).toHaveLength(1);
    expect((await finalizeSale(sachin, ok.saleId)).status).toBe("finalized");
    // A rejection needs a reason; the user needs the permission.
    expect((await rejects(decideApprovals(yash, { decision: "reject", ids: [tooMuch.requestId] }))).message).toMatch(/reason/);
    expect((await rejects(decideApprovals(sachin, { decision: "approve", ids: [tooMuch.requestId] }))).message).toMatch(/permission/);
  });

  it("clears a request whose sale is no longer open when it is rejected, but will not approve it", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const stale = await discountRequest(sachin, kishan, "8");
    // The owner raises Sachin's limit, so the sale is finalised without the approval.
    await updateStaff(kishan, sachin.id, { discountLimitPercent: "10" });
    expect((await finalizeSale(await reload(sachin), stale.saleId)).status).toBe("finalized");
    expect((await rejects(decideApproval(kishan, stale.requestId, "approve"))).message).toMatch(/no longer a draft/);
    const r = await decideApprovals(kishan, { decision: "reject", note: "Old request", ids: [stale.requestId] });
    expect(r).toMatchObject({ decided: 1, cancelled: 1, skipped: [] });
    const [req] = await getDb().select().from(approvalRequests).where(eq(approvalRequests.id, stale.requestId));
    expect(req).toMatchObject({ status: "cancelled", decidedBy: kishan.id, decisionNote: "Sale no longer open — Old request" });
  });

  it("keeps the 'superseded' mark when the cart changed after the request", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const r = await discountRequest(sachin, kishan, "12");
    await getDb().update(sales).set({ cartFingerprint: "changed-elsewhere" }).where(eq(sales.id, r.saleId));
    expect((await rejects(decideApproval(kishan, r.requestId, "approve"))).message).toMatch(/cart changed/);
    const [req] = await getDb().select().from(approvalRequests).where(eq(approvalRequests.id, r.requestId));
    expect(req.status).toBe("superseded");
    const other = await discountRequest(sachin, kishan, "12");
    await getDb().update(sales).set({ cartFingerprint: "changed-elsewhere" }).where(inArray(sales.id, [other.saleId]));
    const bulk = await decideApprovals(kishan, { decision: "approve", ids: [other.requestId] });
    expect(bulk.skipped[0].reason).toMatch(/cart changed/);
  });
});
