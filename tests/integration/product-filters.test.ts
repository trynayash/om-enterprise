import { beforeAll, describe, expect, it } from "vitest";
import { createBrand, createCategory, createProduct, createVariant, listProductsAdmin } from "@/server/services/catalog";
import { proposePrice } from "@/server/services/pricing";
import type { Actor } from "@/server/auth/actor";
import { makeUser, setRegistration, taxClassId, uid } from "./helpers";

let owner: Actor;
let brandId: string;
let parentId: string;
let childId: string;

beforeAll(async () => {
  await setRegistration("regular");
  owner = await makeUser("super_admin");
  brandId = (await createBrand(owner, { name: `Filter brand ${uid()}` })).id;
  parentId = (await createCategory(owner, { name: `Pipes ${uid()}` })).id;
  childId = (await createCategory(owner, { name: `CPVC ${uid()}`, parentId })).id;
});

/** A product in the child category with one size per price; null = a size with no price. */
async function product(name: string, prices: ({ price: string; incl?: boolean } | null)[], pending?: string) {
  const p = await createProduct(owner, { name: `${name} ${uid()}`, categoryId: childId, brandId, unitCode: "pcs", taxClassId: await taxClassId("18"), hsnCode: "3917" });
  for (const [i, pr] of prices.entries()) {
    const v = await createVariant(owner, p.id, { sku: uid(`PF${i}-`).toUpperCase(), name: `Size ${i + 1}`, unitCode: "pcs" });
    if (pr) await proposePrice(owner, { variantId: v.id, price: pr.price, priceIncludesTax: pr.incl ?? true, reason: "test price" });
    if (pending && i === 0) await proposePrice(owner, { variantId: v.id, price: pending, priceIncludesTax: true, reason: "Manufacturer list price: test", requireApproval: true });
  }
  return p.id;
}

const names = async (f: Parameters<typeof listProductsAdmin>[1]) => (await listProductsAdmin(owner, { brandId, pageSize: 200, ...f })).items.map((i) => i.name.split(" ")[0]);

describe("price filters on the products list", () => {
  let ids: Record<string, string>;
  beforeAll(async () => {
    ids = {
      Tap: await product("Tap", [{ price: "500" }]),
      Elbow: await product("Elbow", [{ price: "100", incl: false }]), // ₹118 incl. GST
      Valve: await product("Valve", [null], "250"), // no price yet, one waiting for approval
      Pipe: await product("Pipe", [{ price: "10" }, { price: "1000" }]),
      Tee: await product("Tee", [{ price: "50" }, null]), // one size priced, one not
    };
  });

  it("finds products in a category's sub-categories", async () => {
    const all = await listProductsAdmin(owner, { categoryId: parentId, pageSize: 200 });
    expect(all.items.map((i) => i.id).sort()).toEqual(Object.values(ids).sort());
  });

  it("filters by price status", async () => {
    expect((await names({ price: "live" })).sort()).toEqual(["Elbow", "Pipe", "Tap", "Tee"]);
    expect(await names({ price: "none" })).toEqual(["Valve"]);
    expect((await names({ price: "missing" })).sort()).toEqual(["Tee", "Valve"]);
    expect(await names({ price: "pending" })).toEqual(["Valve"]);
  });

  it("keeps products with any size inside the price range, compared incl. GST", async () => {
    expect(await names({ min: "100", max: "200" })).toEqual(["Elbow"]);
    expect((await names({ min: "900", max: "1100" })).sort()).toEqual(["Pipe"]);
    expect((await names({ max: "60" })).sort()).toEqual(["Pipe", "Tee"]);
  });

  it("shows the price range and pending count, and sorts by lowest price with unpriced last", async () => {
    const list = await listProductsAdmin(owner, { brandId, sort: "price_asc", pageSize: 200 });
    expect(list.items.map((i) => i.name.split(" ")[0])).toEqual(["Pipe", "Tee", "Elbow", "Tap", "Valve"]);
    const pipe = list.items.find((i) => i.id === ids.Pipe)!;
    expect([pipe.minPrice, pipe.maxPrice]).toEqual(["10.00", "1000.00"]);
    expect(list.items.find((i) => i.id === ids.Elbow)!.minPrice).toBe("118.00");
    expect(list.items.find((i) => i.id === ids.Valve)!).toMatchObject({ minPrice: null, pendingPrices: 1 });
    const desc = await names({ sort: "price_desc" });
    expect(desc).toEqual(["Tap", "Elbow", "Tee", "Pipe", "Valve"]);
  });
});
