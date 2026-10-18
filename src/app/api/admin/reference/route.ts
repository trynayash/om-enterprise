import { api } from "@/server/http";
import { listBrands, listCategories, listPriceLists, listTaxClasses, listUnits } from "@/server/services/catalog";

/** Lookup lists for admin & POS forms. */
export const GET = api({ permission: ["catalog.view", "catalog.edit", "sales.create"] }, async () => ({
  categories: await listCategories(),
  brands: await listBrands(),
  units: await listUnits(),
  taxClasses: await listTaxClasses(),
  priceLists: await listPriceLists(),
}));
