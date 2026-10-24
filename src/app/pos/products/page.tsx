import { Suspense } from "react";
import { requirePageActor } from "@/server/auth/session";
import { listCategories } from "@/server/services/catalog";
import { loadPosConfig, loadPosUnits } from "@/components/pos/config";
import { PriceLookup } from "@/components/pos/price-lookup";
import { PageHeader, PageSkeleton } from "@/components/ui/page";

export const metadata = { title: "Price list" };

export default function ProductsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Products />
    </Suspense>
  );
}

async function Products() {
  await requirePageActor("sales.create");
  const categories = (await listCategories()).filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }));
  const [config, units] = [await loadPosConfig(), await loadPosUnits()];
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Point of sale" title="Price list" description="Current selling prices for every active product and variant." />
      <PriceLookup categories={categories} units={units} taxCharged={config.registrationType !== "composition" && config.registrationType !== "unregistered"} />
    </div>
  );
}
