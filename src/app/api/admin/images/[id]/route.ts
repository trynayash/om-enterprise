import { api } from "@/server/http";
import { removeProductImage } from "@/server/services/uploads";

export const DELETE = api({ permission: "catalog.edit" }, async ({ actor, params }) => {
  await removeProductImage(actor, params.id);
  return { ok: true };
});
