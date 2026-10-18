import "server-only";
/**
 * Product image uploads. Every image is decoded and re-encoded with sharp (WebP, max 1600px):
 * this validates it really is an image, strips EXIF/GPS metadata and neutralises polyglot files.
 * Storage driver: local filesystem (UPLOAD_DIR). Swap `writeObject`/`readObject` for S3-compatible
 * storage (Supabase Storage, Cloudflare R2…) in production if the host has ephemeral disks.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { productImages, products, uploads } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { auditActorOf, requirePermission, type Actor } from "@/server/auth/actor";
import { invalid, notFound } from "@/server/errors";

const MAX_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp", "avif"]);

function uploadRoot() {
  return path.resolve(process.env.UPLOAD_DIR ?? "./storage/uploads");
}

async function writeObject(key: string, data: Buffer) {
  const full = path.join(uploadRoot(), key);
  if (!full.startsWith(uploadRoot())) throw invalid("Bad storage key");
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export async function readObject(key: string): Promise<Buffer | null> {
  if (!/^[a-z0-9/_-]+\.webp$/.test(key)) return null;
  const full = path.join(uploadRoot(), key);
  if (!full.startsWith(uploadRoot())) return null;
  try {
    return await readFile(full);
  } catch {
    return null;
  }
}

export async function uploadProductImage(actor: Actor, productId: string, file: { bytes: Buffer; alt?: string | null; variantId?: string | null }) {
  requirePermission(actor, "catalog.edit");
  if (file.bytes.length === 0 || file.bytes.length > MAX_BYTES) throw invalid("Images must be between 1 byte and 6 MB");
  let meta: Metadata;
  try {
    meta = await sharp(file.bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw invalid("That file is not a valid image");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw invalid("Upload a JPEG, PNG, WebP or AVIF image");
  const out = await sharp(file.bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const sha = createHash("sha256").update(out).digest("hex");
  const key = `products/${sha.slice(0, 2)}/${sha}.webp`;
  const db = getDb();
  const [p] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, productId));
  if (!p) throw notFound("Product");
  await writeObject(key, out);
  return db.transaction(async (tx) => {
    const [up] = await tx
      .insert(uploads)
      .values({ storageKey: key, contentType: "image/webp", sizeBytes: out.length, sha256: sha, purpose: "product_image", isPublic: true, uploadedBy: actor.id })
      .onConflictDoUpdate({ target: uploads.storageKey, set: { purpose: "product_image" } })
      .returning();
    const [{ next }] = (await tx.execute<{ next: number }>(sql`select coalesce(max(sort_order), -1) + 1 as next from product_images where product_id = ${productId}`)).rows;
    const [img] = await tx
      .insert(productImages)
      .values({ productId, variantId: file.variantId ?? null, uploadId: up.id, url: `/uploads/${key}`, alt: file.alt ?? p.name, sortOrder: Number(next) })
      .returning();
    await audit(tx, auditActorOf(actor), { action: "product.image_add", entityType: "product", entityId: productId, summary: `Added image to "${p.name}"` });
    return img;
  });
}

export async function removeProductImage(actor: Actor, imageId: string) {
  requirePermission(actor, "catalog.edit");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [img] = await tx.delete(productImages).where(eq(productImages.id, imageId)).returning();
    if (!img) throw notFound("Image");
    await audit(tx, auditActorOf(actor), { action: "product.image_remove", entityType: "product", entityId: img.productId, summary: "Removed a product image" });
  });
}

export async function reorderProductImages(actor: Actor, productId: string, orderedIds: string[]) {
  requirePermission(actor, "catalog.edit");
  const db = getDb();
  await db.transaction(async (tx) => {
    const imgs = await tx.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder));
    for (const [i, id] of orderedIds.entries()) {
      if (imgs.some((x) => x.id === id)) await tx.update(productImages).set({ sortOrder: i }).where(and(eq(productImages.id, id), eq(productImages.productId, productId)));
    }
  });
}
