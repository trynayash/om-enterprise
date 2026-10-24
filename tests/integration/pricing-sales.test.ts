import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { saleLines, sales, variantPrices } from "@/server/db/schema";
import { can } from "@/server/auth/actor";
import { decidePriceChange, getActivePrices, getDefaultPriceList, proposePrice, recordCost } from "@/server/services/pricing";
import { searchSellable } from "@/server/services/catalog";
import {
  addLine,
  approveInPerson,
  cancelSale,
  createSale,
  decideApproval,
  finalizeSale,
  getSale,
  reopenSale,
  requestApproval,
  setCartDiscount,
  updateLine,
} from "@/server/services/sales";
import { setPermissionOverrides, updateStaff } from "@/server/services/users";
import { client, dbErrorMessage, firstCategoryId, makeItem, makeUser, rejects, reload, setRegistration, TEST_PASSWORD } from "./helpers";

beforeAll(async () => {
  await setRegistration("regular");
});

describe("centralised prices & protection", () => {
  it("unauthorised users cannot change master prices", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "1180" });
    const err = await rejects(proposePrice(sachin, { variantId: item.variantId, price: "900", priceIncludesTax: true, reason: "x" }));
    expect(err.message).toMatch(/permission/);
    expect(can(sachin, "costs.edit")).toBe(false);
    await expect(
      recordCost(sachin, { variantId: item.variantId, purchaseCost: "1", purchaseTaxRate: "0", freight: "0", handling: "0", otherCosts: "0", reason: "x" }),
    ).rejects.toThrow(/permission/);
  });

  it("admin price changes stay pending until the Super Admin approves; history is kept", async () => {
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin");
    const item = await makeItem(kishan, { price: "1180", cost: "800" });
    const list = await getDefaultPriceList();
    const pending = await proposePrice(yash, { variantId: item.variantId, price: "1250", priceIncludesTax: true, reason: "Supplier increase" });
    expect(pending.status).toBe("pending");
    expect(pending.previousPrice).toBe("1180.00");
    expect((await getActivePrices([item.variantId], list.id)).get(item.variantId)?.price).toBe("1180.00");
    await decidePriceChange(kishan, pending.id, "approve", "ok");
    expect((await getActivePrices([item.variantId], list.id)).get(item.variantId)?.price).toBe("1250.00");
    // Margin impact recorded (regular GST: cost 800 excl., price 1250 incl. 18% → 1059.32 excl → 24.48%)
    expect(pending.landedCostSnapshot).toBe("800.0000");
    expect(pending.marginPercentSnapshot).toBe("24.48");
  });

  it("imported list prices stay pending for review even when entered by the Super Admin", async () => {
    const kishan = await makeUser("super_admin");
    const item = await makeItem(kishan, { price: "1180" });
    const list = await getDefaultPriceList();
    const proposal = await proposePrice(kishan, { variantId: item.variantId, price: "1300", priceIncludesTax: true, reason: "Manufacturer list price", requireApproval: true });
    expect(proposal.status).toBe("pending");
    expect((await getActivePrices([item.variantId], list.id)).get(item.variantId)?.price).toBe("1180.00");
    await decidePriceChange(kishan, proposal.id, "approve", "checked");
    expect((await getActivePrices([item.variantId], list.id)).get(item.variantId)?.price).toBe("1300.00");
  });

  it("cost and margin snapshots are hidden from approvers without cost access", async () => {
    const kishan = await makeUser("super_admin");
    const yash = await makeUser("admin");
    const vikram = await makeUser("admin");
    await setPermissionOverrides(kishan, vikram.id, [
      { permission: "prices.approve", effect: "grant" },
      { permission: "costs.view", effect: "deny" },
    ]);
    const v = await reload(vikram);
    const item = await makeItem(kishan, { price: "1180", cost: "800" });
    await proposePrice(yash, { variantId: item.variantId, price: "1300", priceIncludesTax: true, reason: "increase" });
    const { listPendingPriceChanges } = await import("@/server/services/pricing");
    const { getProductAdmin } = await import("@/server/services/catalog");
    const seenByVikram = (await listPendingPriceChanges(v)).find((r) => r.version.variantId === item.variantId)!;
    expect(seenByVikram.version.landedCostSnapshot).toBeNull();
    expect(seenByVikram.version.marginPercentSnapshot).toBeNull();
    const seenByKishan = (await listPendingPriceChanges(kishan)).find((r) => r.version.variantId === item.variantId)!;
    expect(seenByKishan.version.landedCostSnapshot).toBe("800.0000");
    const editor = await getProductAdmin(v, item.productId);
    expect(editor.costs).toBeNull();
    expect(editor.pending[0].landedCostSnapshot).toBeNull();
  });

  it("price versions are immutable in the database", async () => {
    const kishan = await makeUser("super_admin");
    const item = await makeItem(kishan, { price: "500" });
    const db = getDb();
    const [v] = await db.select().from(variantPrices).where(eq(variantPrices.variantId, item.variantId));
    await expect(db.update(variantPrices).set({ price: "1.00" }).where(eq(variantPrices.id, v.id))).rejects.toThrow();
    await expect(db.delete(variantPrices).where(eq(variantPrices.id, v.id))).rejects.toThrow();
  });

  it("rejects selling price above MRP and back-dated prices", async () => {
    const kishan = await makeUser("super_admin");
    const item = await makeItem(kishan, { price: "100" });
    expect((await rejects(proposePrice(kishan, { variantId: item.variantId, price: "120", priceIncludesTax: true, mrp: "110", reason: "x" }))).message).toMatch(/MRP/);
    expect(
      (await rejects(proposePrice(kishan, { variantId: item.variantId, price: "90", priceIncludesTax: true, reason: "x", effectiveFrom: "2020-01-01T00:00:00Z" }))).message,
    ).toMatch(/back-dated/);
  });

  it("POS search finds the exact variant by SKU and returns its configured price, without cost", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "2450", cost: "2000" });
    const res = await searchSellable(sachin, { q: item.sku });
    expect(res[0].variantId).toBe(item.variantId);
    expect(res[0].price).toBe("2450.00");
    expect(Object.keys(res[0])).not.toContain("unitCost");
  });

  it("POS can browse a category with no search text", async () => {
    const kishan = await makeUser("super_admin");
    const item = await makeItem(kishan, { price: "100" });
    const res = await searchSellable(kishan, { categoryId: await firstCategoryId(), limit: 200 });
    expect(res.length).toBeGreaterThan(0);
    expect(res.map((r) => r.variantId)).toContain(item.variantId);
  });
});

describe("POS sale flow — Sachin works independently", () => {
  it("calculates the cart on the server and finalises within his limits", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const paint = await makeItem(kishan, { price: "1180", cost: "700" });
    const pipe = await makeItem(kishan, { price: "236", cost: "120" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: paint.variantId, quantity: "2" });
    await addLine(sachin, sale.id, { variantId: pipe.variantId, quantity: "5" });
    await addLine(sachin, sale.id, { variantId: pipe.variantId, quantity: "5" }); // merges → 10
    const { sale: s, lines } = await getSale(sachin, sale.id);
    expect(lines).toHaveLength(2);
    expect(lines[1].quantity).toBe("10.000");
    // 2×1180 + 10×236 = 4720; tax incl. 18% → taxable 4000, CGST 360, SGST 360
    expect(s.grandTotal).toBe("4720.00");
    expect(s.taxableTotal).toBe("4000.00");
    expect(s.cgstTotal).toBe("360.00");
    expect(s.sgstTotal).toBe("360.00");
    // Sachin can't see cost/profit
    expect(s.grossProfit).toBeNull();
    expect(lines[0].unitCost).toBeNull();

    await setCartDiscount(sachin, sale.id, { type: "percent", value: "5" }); // within 5% limit
    const { auditLogs } = await import("@/server/db/schema");
    const trail = await getDb().select().from(auditLogs).where(eq(auditLogs.entityId, sale.id));
    const applied = trail.find((a) => a.action === "discount.cart_applied");
    expect(applied?.actorUserId).toBe(sachin.id);
    const finalized = await finalizeSale(sachin, sale.id);
    expect(finalized.status).toBe("finalized");
    expect(finalized.grandTotal).toBe("4484.00");
    expect(finalized.approvalStatus).toBe("not_required");
  });

  it("blocks discounts above the limit until an authorised approval (remote)", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const yash = await makeUser("admin"); // approval limit 15%
    const item = await makeItem(kishan, { price: "1000", cost: "500" });
    const sale = await createSale(sachin);
    const [line] = (await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" })) && (await getSale(sachin, sale.id)).lines;
    await updateLine(sachin, sale.id, line.id, { discount: { type: "percent", value: "12" } });
    const e = await rejects(finalizeSale(sachin, sale.id));
    expect((e as { code?: string }).code).toBe("APPROVAL_REQUIRED");
    const req = await requestApproval(sachin, sale.id, "Regular contractor");
    // Sachin can't approve; he has no discounts.approve
    expect((await rejects(decideApproval(sachin, req.id, "approve"))).message).toMatch(/permission/);
    await decideApproval(yash, req.id, "approve", "ok for regular");
    const done = await finalizeSale(sachin, sale.id);
    expect(done.status).toBe("finalized");
    expect(done.approvalRequestId).toBe(req.id);
  });

  it("an approval is bound to the exact cart — changing it requires a new approval", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const yash = await makeUser("admin");
    const item = await makeItem(kishan, { price: "1000", cost: "500" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    const line = (await getSale(sachin, sale.id)).lines[0];
    await updateLine(sachin, sale.id, line.id, { discount: { type: "percent", value: "10" } });
    const req = await requestApproval(sachin, sale.id, "bulk");
    await decideApproval(yash, req.id, "approve");
    // Sachin raises the discount after approval
    await updateLine(sachin, sale.id, line.id, { discount: { type: "percent", value: "14" } });
    const e = await rejects(finalizeSale(sachin, sale.id));
    expect((e as { code?: string }).code).toBe("APPROVAL_REQUIRED");
  });

  it("approvers are limited by their approval limit; only allowed users approve below-cost", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const yash = await makeUser("admin"); // 15%
    const item = await makeItem(kishan, { price: "1180", cost: "950" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    const line = (await getSale(sachin, sale.id)).lines[0];
    await updateLine(sachin, sale.id, line.id, { discount: { type: "percent", value: "20" } }); // also below cost: 944 incl → 800 excl < 950
    const req = await requestApproval(sachin, sale.id, "clearance");
    expect((await rejects(decideApproval(yash, req.id, "approve"))).message).toMatch(/approval limit|below cost/);
    await decideApproval(kishan, req.id, "approve", "clearance stock");
    const s = await finalizeSale(sachin, sale.id);
    expect(s.status).toBe("finalized");
  });

  it("supports in-person approval with the approver's own credentials", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "1000", cost: "500" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "3" });
    await setCartDiscount(sachin, sale.id, { type: "percent", value: "8" });
    expect((await rejects(approveInPerson(sachin, sale.id, kishan.username, "wrong-pass-123", null, client))).message).toMatch(/incorrect/);
    expect((await rejects(approveInPerson(sachin, sale.id, sachin.username, TEST_PASSWORD, null, client))).message).toMatch(/different|permission/);
    const ok = await approveInPerson(sachin, sale.id, kishan.username, TEST_PASSWORD, "known customer", client);
    expect(ok.approvedBy).toBe(kishan.displayName);
    const s = await finalizeSale(sachin, sale.id);
    expect(s.status).toBe("finalized");
    const detail = await getSale(kishan, sale.id);
    expect(detail.approvals[0].decidedBy).toBe(kishan.id);
    expect(detail.approvals[0].decisionChannel).toBe("in_person");
  });

  it("price overrides need permission and count as discounts", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "1000", cost: "500" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    const line = (await getSale(sachin, sale.id)).lines[0];
    expect((await rejects(updateLine(sachin, sale.id, line.id, { overridePrice: "800", overrideReason: "x" }))).message).toMatch(/permission/);
    await setPermissionOverrides(kishan, sachin.id, [{ permission: "pricing.override_price", effect: "grant" }]);
    const s2 = await reload(sachin);
    await updateLine(s2, sale.id, line.id, { overridePrice: "940", overrideReason: "match competitor" }); // 6% > 5% limit
    expect((await getSale(kishan, sale.id)).sale.approvalStatus).toBe("required");
  });

  it("finalised sales are frozen: lines and totals cannot be altered, even directly in SQL", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "500" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    await finalizeSale(sachin, sale.id);
    const db = getDb();
    expect(await dbErrorMessage(db.update(sales).set({ grandTotal: "1.00" }).where(eq(sales.id, sale.id)))).toMatch(/frozen/);
    expect(await dbErrorMessage(db.update(saleLines).set({ unitPrice: "1.00" }).where(eq(saleLines.saleId, sale.id)))).toMatch(/cannot be changed/);
    expect(await dbErrorMessage(db.delete(sales).where(eq(sales.id, sale.id)))).toMatch(/not permitted/);
    expect(await dbErrorMessage(db.delete(saleLines).where(eq(saleLines.saleId, sale.id)))).toMatch(/cannot be changed/);
    expect((await rejects(addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" }))).message).toMatch(/finalised/);
  });

  it("a later price change never alters a finalised sale; unpaid sales can be reopened and re-priced", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "500" });
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "2" });
    await finalizeSale(sachin, sale.id);
    await proposePrice(kishan, { variantId: item.variantId, price: "600", priceIncludesTax: true, reason: "increase" });
    expect((await getSale(sachin, sale.id)).sale.grandTotal).toBe("1000.00");
    await reopenSale(sachin, sale.id, "customer added items");
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    expect((await getSale(sachin, sale.id)).sale.grandTotal).toBe("1800.00");
  });

  it("validates quantities against the unit", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const pcs = await makeItem(kishan, { price: "100", unit: "pcs" });
    const metre = await makeItem(kishan, { price: "45.50", unit: "m", gst: "18" });
    const sale = await createSale(sachin);
    expect((await rejects(addLine(sachin, sale.id, { variantId: pcs.variantId, quantity: "1.5" }))).message).toMatch(/whole number/);
    await addLine(sachin, sale.id, { variantId: metre.variantId, quantity: "2.5" });
    expect((await getSale(sachin, sale.id)).sale.grandTotal).toBe("114.00"); // 113.75 → rounded
    expect((await rejects(addLine(sachin, sale.id, { variantId: pcs.variantId, quantity: "1", unitCode: "box" }))).message).toMatch(/no conversion/);
  });

  it("Sachin sees only his own sales; admins with view_all see everyone's", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const other = await makeUser("sales");
    const yash = await makeUser("admin");
    const item = await makeItem(kishan, { price: "100" });
    const sale = await createSale(other);
    await addLine(other, sale.id, { variantId: item.variantId, quantity: "1" });
    expect((await rejects(getSale(sachin, sale.id))).message).toMatch(/own sales/);
    expect((await getSale(yash, sale.id)).sale.id).toBe(sale.id);
    expect((await rejects(cancelSale(sachin, sale.id, "x"))).message).toMatch(/own sales|permission/);
  });

  it("deactivated staff limits: a lowered discount limit takes effect immediately", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    await updateStaff(kishan, sachin.id, { discountLimitPercent: "2" });
    const s = await reload(sachin);
    const item = await makeItem(kishan, { price: "1000" });
    const sale = await createSale(s);
    await addLine(s, sale.id, { variantId: item.variantId, quantity: "1" });
    await setCartDiscount(s, sale.id, { type: "percent", value: "3" });
    expect(((await rejects(finalizeSale(s, sale.id))) as { code?: string }).code).toBe("APPROVAL_REQUIRED");
  });

  it("composition dealers cannot make inter-state supplies; unconfirmed registration blocks real sales", async () => {
    const kishan = await makeUser("super_admin");
    const sachin = await makeUser("sales");
    const item = await makeItem(kishan, { price: "100" });
    await setRegistration(null);
    const sale = await createSale(sachin);
    await addLine(sachin, sale.id, { variantId: item.variantId, quantity: "1" });
    expect((await rejects(finalizeSale(sachin, sale.id))).message).toMatch(/GST registration/);
    // Training sales (sample items) are still possible for practice
    const sample = await makeItem(kishan, { price: "100", isSample: true });
    const t = await createSale(sachin);
    await addLine(sachin, t.id, { variantId: sample.variantId, quantity: "1" });
    const tf = await finalizeSale(sachin, t.id);
    expect(tf.isTraining).toBe(true);
    await setRegistration("composition");
    const { setSaleOptions } = await import("@/server/services/sales");
    expect((await rejects(setSaleOptions(sachin, sale.id, { placeOfSupplyStateCode: "27" }))).message).toMatch(/inter-state/);
    const c = await finalizeSale(sachin, sale.id);
    expect(c.taxMode).toBe("none");
    expect(c.grandTotal).toBe("100.00");
    await setRegistration("regular");
  });
});
