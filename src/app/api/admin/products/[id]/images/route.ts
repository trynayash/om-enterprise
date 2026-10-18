import { z } from "zod";
import { api } from "@/server/http";
import { invalid } from "@/server/errors";
import { reorderProductImages, uploadProductImage } from "@/server/services/uploads";

/** multipart/form-data: file, alt?, variantId? */
export const POST = api({ permission: "catalog.edit" }, async ({ actor, params, req }) => {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.startsWith("multipart/form-data")) throw invalid("Upload as multipart/form-data");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 7 * 1024 * 1024) throw invalid("Image is too large (max 6 MB)");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw invalid("Choose an image file");
  const bytes = Buffer.from(await file.arrayBuffer());
  return uploadProductImage(actor, params.id, {
    bytes,
    alt: typeof form.get("alt") === "string" ? String(form.get("alt")).slice(0, 160) : null,
    variantId: typeof form.get("variantId") === "string" && form.get("variantId") ? String(form.get("variantId")) : null,
  });
});

const order = z.object({ order: z.array(z.string().uuid()).max(50) });
export const PUT = api({ permission: "catalog.edit" }, async (ctx) => {
  await reorderProductImages(ctx.actor, ctx.params.id, (await ctx.body(order)).order);
  return { ok: true };
});
