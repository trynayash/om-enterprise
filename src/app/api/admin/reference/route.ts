import { api } from "@/server/http";
import { can } from "@/server/auth/actor";
import { listBrands, listCategories, listPriceLists, listTaxClasses, listUnits } from "@/server/services/catalog";

/** Lookup lists for admin & POS forms. Category margin targets are only for users with cost access. */
export const GET = api({ permission: ["catalog.view", "catalog.edit", "sales.create"] }, async ({ actor }) => ({
  categories: (await listCategories()).map((c) => (can(actor, "costs.view") ? c : { ...c, minMarginPercent: null, targetMarginPercent: null })),
  brands: await listBrands(),
  units: await listUnits(),
  taxClasses: await listTaxClasses(),
  priceLists: await listPriceLists(),
}));
