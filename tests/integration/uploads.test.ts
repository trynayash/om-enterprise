import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/server/db/client";
import { uploadObjects } from "@/server/db/schema";
import { readObject, uploadProductImage } from "@/server/services/uploads";
import { makeItem, makeUser } from "./helpers";

const png = () => sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 30, b: 80 } } }).png().toBuffer();

describe("product images on hosts without a persistent disk", () => {
  afterEach(() => {
    delete process.env.UPLOAD_STORAGE;
  });

  it("UPLOAD_STORAGE=database keeps the re-encoded image in PostgreSQL and serves it back", async () => {
    process.env.UPLOAD_STORAGE = "database";
    const kishan = await makeUser("super_admin");
    const item = await makeItem(kishan, { price: "100" });
    const img = await uploadProductImage(kishan, item.productId, { bytes: await png(), alt: "Test" });
    const key = img.url.replace(/^\/uploads\//, "");
    const [row] = await getDb().select().from(uploadObjects).where(eq(uploadObjects.storageKey, key));
    expect(row).toBeDefined();
    const served = await readObject(key);
    expect(served?.equals(row.data)).toBe(true);
    expect((await sharp(served!).metadata()).format).toBe("webp");
    // The same bytes again don't duplicate the stored object.
    await uploadProductImage(kishan, item.productId, { bytes: await png() });
    expect((await getDb().select().from(uploadObjects).where(eq(uploadObjects.storageKey, key))).length).toBe(1);
  });

  it("only well-formed keys are looked up", async () => {
    process.env.UPLOAD_STORAGE = "database";
    expect(await readObject("../../etc/passwd")).toBeNull();
    expect(await readObject("products/zz/not-there.webp")).toBeNull();
  });
});
