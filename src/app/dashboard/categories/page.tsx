import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { requirePageActor } from "@/server/auth/session";
import { can } from "@/server/auth/actor";
import { getDb } from "@/server/db/client";
import { products } from "@/server/db/schema";
import { listBrands, listCategories } from "@/server/services/catalog";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { CategoriesManager } from "@/components/dashboard/catalog/categories-manager";
import { BrandsManager } from "@/components/dashboard/catalog/brands-manager";

export const metadata = { title: "Categories & brands" };

export default function CategoriesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CategoriesContent />
    </Suspense>
  );
}

async function CategoriesContent() {
  const actor = await requirePageActor(["catalog.edit", "catalog.create"]);
  const [categories, brands] = [await listCategories(), await listBrands()];
  const db = getDb();
  const byCategory = await db.select({ id: products.categoryId, n: sql<number>`count(*)::int` }).from(products).groupBy(products.categoryId);
  const byBrand = await db.select({ id: products.brandId, n: sql<number>`count(*)::int` }).from(products).groupBy(products.brandId);
  const count = (rows: { id: string | null; n: number }[], id: string) => rows.find((r) => r.id === id)?.n ?? 0;

  return (
    <div>
      <PageHeader eyebrow="Catalogue" title="Categories & brands" description="Organise the catalogue. Categories and brands are never deleted — make them inactive or hide them from the website instead." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CategoriesManager
          canCreate={can(actor, "catalog.create")}
          canEdit={can(actor, "catalog.edit")}
          canConfigureMargins={can(actor, "discounts.configure")}
          categories={categories.map((c) => ({
            id: c.id,
            parentId: c.parentId,
            name: c.name,
            slug: c.slug,
            description: c.description,
            icon: c.icon,
            sortOrder: c.sortOrder,
            isActive: c.isActive,
            isPublished: c.isPublished,
            targetMarginPercent: c.targetMarginPercent,
            minMarginPercent: c.minMarginPercent,
            productCount: count(byCategory, c.id),
          }))}
        />
        <BrandsManager
          canCreate={can(actor, "catalog.create")}
          canEdit={can(actor, "catalog.edit")}
          brands={brands.map((b) => ({
            id: b.id,
            name: b.name,
            manufacturer: b.manufacturer,
            description: b.description,
            website: b.website,
            isActive: b.isActive,
            productCount: count(byBrand, b.id),
          }))}
        />
      </div>
    </div>
  );
}
