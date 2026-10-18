import { api } from "@/server/http";
import { removeUnitConversion } from "@/server/services/catalog";

export const DELETE = api({ permission: "catalog.edit" }, async ({ actor, params }) => {
  await removeUnitConversion(actor, params.id);
  return { ok: true };
});
