import { beforeAll, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { createProduct, createVariant, setProductPublished, setProductReview } from "@/server/services/catalog";
import { proposePrice } from "@/server/services/pricing";
import { searchPublicProducts } from "@/server/services/public-catalog";
import { firstCategoryId, makeUser, setRegistration, taxClassId, uid } from "./helpers";

/** A published product with one priced variant, named with a token unique to this run. */
async function publish(admin: Actor, name: string, variantName: string, price: string) {
  const product = await createProduct(admin, {
    name,
    categoryId: await firstCategoryId(),
    unitCode: "pcs",
    taxClassId: await taxClassId("18"),
    hsnCode: "3917",
  });
  const variant = await createVariant(admin, product.id, { sku: uid("SKU-").toUpperCase(), name: variantName, unitCode: "pcs" });
  await proposePrice(admin, { variantId: variant.id, price, priceIncludesTax: true, reason: "test price" });
  await setProductReview(admin, product.id, "approved");
  await setProductPublished(admin, product.id, true);
}

describe("public catalogue search", () => {
  let admin: Actor;
  const token = `Qz${Date.now().toString(36)}`;

  beforeAll(async () => {
    await setRegistration("regular");
    admin = await makeUser("super_admin");
    // Alphabetical order is the reverse of price order, so a page-only sort would get it wrong.
    await publish(admin, `${token} Alpha`, "Std", "900");
    await publish(admin, `${token} Bravo`, "Std", "500");
    await publish(admin, `${token} Charlie`, "Std", "100");
    // Same words, one in the size and one in the name.
    await publish(admin, `${token} Delta Coupler`, "20 mm", "50");
    await publish(admin, `${token} Echo Pipe 20`, "Std", "60");
  });

  it("sorts by price across pages, not just within one", async () => {
    const page1 = await searchPublicProducts({ q: token, sort: "price_asc", pageSize: 2 });
    expect(page1.total).toBe(5);
    expect(page1.items.map((i) => i.priceFrom?.amount)).toEqual(["50.00", "60.00"]);
    const last = await searchPublicProducts({ q: token, sort: "price_desc", pageSize: 1 });
    expect(last.items[0].name).toBe(`${token} Alpha`);
  });

  it("ranks products whose name holds the search words above ones matching only a size", async () => {
    const res = await searchPublicProducts({ q: `${token} 20`, sort: "name" });
    expect(res.items.map((i) => i.name)).toEqual([`${token} Echo Pipe 20`, `${token} Delta Coupler`]);
  });
});
